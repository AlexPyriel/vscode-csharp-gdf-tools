import * as path from "path";
import * as vscode from "vscode";

interface AsmdefInfo {
  directoryPath: string;
  namespaceBase: string;
}

export async function resolveExpectedNamespace(fileUri: vscode.Uri): Promise<string | undefined> {
  const configuration = vscode.workspace.getConfiguration("csharpGdf");
  const sourceMode = configuration.get<"hybrid" | "asmdef" | "folder">("namespaceSource", "hybrid");
  const rootNamespace = sanitizeNamespace(configuration.get<string>("rootNamespace", ""));

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
  if (!workspaceFolder) {
    return rootNamespace || undefined;
  }

  const folderPath = path.dirname(fileUri.fsPath);

  if (sourceMode !== "folder") {
    const asmdef = await findNearestAsmdef(folderPath, workspaceFolder.uri.fsPath);
    if (asmdef) {
      const suffix = buildNamespaceSuffix(folderPath, asmdef.directoryPath);
      return joinNamespaceParts([rootNamespace, asmdef.namespaceBase, suffix]);
    }

    if (sourceMode === "asmdef") {
      return rootNamespace || undefined;
    }
  }

  const folderNamespace = buildFolderBasedNamespace(folderPath, workspaceFolder.uri.fsPath);
  return joinNamespaceParts([rootNamespace, folderNamespace]);
}

async function findNearestAsmdef(folderPath: string, workspaceRoot: string): Promise<AsmdefInfo | undefined> {
  let currentPath = folderPath;
  while (currentPath.startsWith(workspaceRoot)) {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
    const asmdefEntry = entries.find(([name, type]) => name.endsWith(".asmdef") && type === vscode.FileType.File);
    if (asmdefEntry) {
      const asmdefUri = vscode.Uri.file(path.join(currentPath, asmdefEntry[0]));
      const contentBytes = await vscode.workspace.fs.readFile(asmdefUri);
      try {
        const parsed = JSON.parse(Buffer.from(contentBytes).toString("utf8")) as { name?: string };
        if (parsed.name) {
          return {
            directoryPath: currentPath,
            namespaceBase: sanitizeNamespace(parsed.name)
          };
        }
      } catch {
        return undefined;
      }
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }

    currentPath = parentPath;
  }

  return undefined;
}

function buildFolderBasedNamespace(folderPath: string, workspaceRoot: string): string | undefined {
  const relativeFolderPath = path.relative(workspaceRoot, folderPath);
  return sanitizePathToNamespace(relativeFolderPath);
}

function buildNamespaceSuffix(folderPath: string, baseDirectoryPath: string): string | undefined {
  const relativeFolderPath = path.relative(baseDirectoryPath, folderPath);
  return sanitizePathToNamespace(relativeFolderPath);
}

function sanitizePathToNamespace(relativePath: string): string | undefined {
  const parts = relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map(toNamespaceIdentifier)
    .filter(Boolean);

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join(".");
}

function toNamespaceIdentifier(value: string): string {
  const segments = value
    .split(/[^A-Za-z0-9_]+/)
    .filter(Boolean)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1));

  const merged = segments.join("").replace(/[^A-Za-z0-9_]/g, "");
  if (!merged) {
    return "";
  }

  if (/^[0-9]/.test(merged)) {
    return `_${merged}`;
  }

  return merged;
}

function sanitizeNamespace(value: string): string {
  return value
    .split(".")
    .map(part => toNamespaceIdentifier(part))
    .filter(Boolean)
    .join(".");
}

function joinNamespaceParts(parts: Array<string | undefined>): string | undefined {
  const filtered = parts.filter((value): value is string => Boolean(value));
  if (filtered.length === 0) {
    return undefined;
  }

  return filtered.join(".");
}
