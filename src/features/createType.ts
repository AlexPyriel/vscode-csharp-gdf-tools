import * as path from "path";
import * as vscode from "vscode";
import { buildTemplate, CSharpTypeKind, normalizeTypeNameForKind } from "../shared/templateBuilder";
import { resolveExpectedNamespace } from "../shared/namespaceResolver";

const CREATE_COMMANDS: Array<{ command: string; kind: CSharpTypeKind }> = [
  { command: "csharpGdf.newClass", kind: "class" },
  { command: "csharpGdf.newInterface", kind: "interface" },
  { command: "csharpGdf.newRecord", kind: "record" },
  { command: "csharpGdf.newStruct", kind: "struct" },
  { command: "csharpGdf.newEnum", kind: "enum" },
  { command: "csharpGdf.newMonoBehaviour", kind: "monobehaviour" },
  { command: "csharpGdf.newScriptableObject", kind: "scriptableobject" }
];

export function registerCreateTypeCommands(context: vscode.ExtensionContext): void {
  for (const item of CREATE_COMMANDS) {
    const disposable = vscode.commands.registerCommand(item.command, async (resource?: vscode.Uri) => {
      await createTypeFile(item.kind, resource);
    });

    context.subscriptions.push(disposable);
  }
}

async function createTypeFile(kind: CSharpTypeKind, resource?: vscode.Uri): Promise<void> {
  const targetFolder = await resolveTargetFolder(resource);
  if (!targetFolder) {
    return;
  }

  const rawName = await vscode.window.showInputBox({
    prompt: `Enter ${kind} name`,
    placeHolder: defaultTypeName(kind),
    validateInput: value => {
      if (!value.trim()) {
        return "Name is required.";
      }

      const normalized = normalizeTypeNameForKind(value, kind);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
        return "Use a valid C# identifier.";
      }

      return undefined;
    }
  });

  if (!rawName) {
    return;
  }

  const typeName = normalizeTypeNameForKind(rawName, kind);
  const fileUri = vscode.Uri.joinPath(targetFolder, `${typeName}.cs`);

  try {
    await vscode.workspace.fs.stat(fileUri);
    void vscode.window.showErrorMessage(`File already exists: ${path.basename(fileUri.fsPath)}`);
    return;
  } catch {
    // File does not exist, continue.
  }

  const namespaceValue = await resolveExpectedNamespace(fileUri);
  const content = buildTemplate({
    kind,
    typeName,
    namespaceValue,
    useFileScopedNamespace: getUseFileScopedNamespace()
  });

  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf8"));

  const document = await vscode.workspace.openTextDocument(fileUri);
  await vscode.window.showTextDocument(document);
}

async function resolveTargetFolder(resource?: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (resource) {
    const stat = await vscode.workspace.fs.stat(resource);
    if (stat.type & vscode.FileType.Directory) {
      return resource;
    }

    return vscode.Uri.file(path.dirname(resource.fsPath));
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    void vscode.window.showErrorMessage("Open a workspace folder first.");
    return undefined;
  }

  return workspaceFolder.uri;
}

function getUseFileScopedNamespace(): boolean {
  return vscode.workspace.getConfiguration("csharpGdf").get<boolean>("useFileScopedNamespace", false);
}

function defaultTypeName(kind: CSharpTypeKind): string {
  switch (kind) {
    case "interface":
      return "IMyInterface";
    case "record":
      return "MyRecord";
    case "struct":
      return "MyStruct";
    case "enum":
      return "MyEnum";
    case "monobehaviour":
      return "MyBehaviour";
    case "scriptableobject":
      return "MyData";
    default:
      return "MyClass";
  }
}
