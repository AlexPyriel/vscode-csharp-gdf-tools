import * as vscode from "vscode";

export type CSharpTypeKind =
  | "class"
  | "interface"
  | "record"
  | "struct"
  | "enum"
  | "monobehaviour"
  | "scriptableobject";

interface TemplateOptions {
  kind: CSharpTypeKind;
  namespaceValue?: string;
  typeName: string;
  useFileScopedNamespace: boolean;
}

export function buildTemplate(options: TemplateOptions): string {
  const usingBlock = buildUsingBlock(options.kind);
  const namespaceBlock = buildNamespacePrefix(options.namespaceValue, options.useFileScopedNamespace);
  const namespaceSuffix = buildNamespaceSuffix(options.namespaceValue, options.useFileScopedNamespace);

  // Inside a block-scoped namespace the type is one level deeper, so indent it.
  const insideBlockNamespace = Boolean(options.namespaceValue) && !options.useFileScopedNamespace;
  const typeBody = insideBlockNamespace
    ? indentLines(buildTypeBody(options.kind, options.typeName), 4)
    : buildTypeBody(options.kind, options.typeName);

  return `${usingBlock}${namespaceBlock}${typeBody}${namespaceSuffix}`;
}

function indentLines(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map(line => (line.length > 0 ? pad + line : line))
    .join("\n");
}

export function normalizeTypeNameForKind(rawValue: string, kind: CSharpTypeKind): string {
  const baseName = toPascalCase(rawValue);
  if (kind === "interface") {
    return baseName.startsWith("I") ? baseName : `I${baseName}`;
  }

  return baseName;
}

function buildNamespacePrefix(namespaceValue: string | undefined, useFileScopedNamespace: boolean): string {
  if (!namespaceValue) {
    return "";
  }

  if (useFileScopedNamespace) {
    return `namespace ${namespaceValue};\n\n`;
  }

  return `namespace ${namespaceValue}\n{\n`;
}

function buildNamespaceSuffix(namespaceValue: string | undefined, useFileScopedNamespace: boolean): string {
  if (!namespaceValue || useFileScopedNamespace) {
    return "";
  }

  return "}\n";
}

function buildTypeBody(kind: CSharpTypeKind, typeName: string): string {
  switch (kind) {
    case "record":
      return `public record ${typeName};\n`;
    case "enum":
      return `public enum ${typeName}\n{\n}\n`;
    case "monobehaviour":
      return `public class ${typeName} : MonoBehaviour\n{\n}\n`;
    case "scriptableobject":
      return `${buildScriptableObjectHeader(typeName)}public class ${typeName} : ScriptableObject\n{\n}\n`;
    default:
      return `public ${kind} ${typeName}\n{\n}\n`;
  }
}

function toPascalCase(value: string): string {
  const segments = value
    .trim()
    .replace(/\.cs$/i, "")
    .split(/[^A-Za-z0-9_]+/)
    .filter(Boolean);

  if (segments.length === 0) {
    return "";
  }

  return segments
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("")
    .replace(/[^A-Za-z0-9_]/g, "");
}

function buildScriptableObjectHeader(typeName: string): string {
  const includeCreateAssetMenu = vscode.workspace
    .getConfiguration("csharpGdf")
    .get<boolean>("scriptableObjectCreateAssetMenu", true);
  if (!includeCreateAssetMenu) {
    return "";
  }

  return `[CreateAssetMenu(fileName = "${typeName}", menuName = "Data/${typeName}")]\n`;
}

function buildUsingBlock(kind: CSharpTypeKind): string {
  if (kind === "monobehaviour" || kind === "scriptableobject") {
    return "using UnityEngine;\n\n";
  }

  return "";
}
