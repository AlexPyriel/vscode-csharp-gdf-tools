"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTemplate = buildTemplate;
exports.normalizeTypeNameForKind = normalizeTypeNameForKind;
const vscode = __importStar(require("vscode"));
function buildTemplate(options) {
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
function indentLines(text, spaces) {
    const pad = " ".repeat(spaces);
    return text
        .split("\n")
        .map(line => (line.length > 0 ? pad + line : line))
        .join("\n");
}
function normalizeTypeNameForKind(rawValue, kind) {
    const baseName = toPascalCase(rawValue);
    if (kind === "interface") {
        return baseName.startsWith("I") ? baseName : `I${baseName}`;
    }
    return baseName;
}
function buildNamespacePrefix(namespaceValue, useFileScopedNamespace) {
    if (!namespaceValue) {
        return "";
    }
    if (useFileScopedNamespace) {
        return `namespace ${namespaceValue};\n\n`;
    }
    return `namespace ${namespaceValue}\n{\n`;
}
function buildNamespaceSuffix(namespaceValue, useFileScopedNamespace) {
    if (!namespaceValue || useFileScopedNamespace) {
        return "";
    }
    return "}\n";
}
function buildTypeBody(kind, typeName) {
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
function toPascalCase(value) {
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
function buildScriptableObjectHeader(typeName) {
    const includeCreateAssetMenu = vscode.workspace
        .getConfiguration("csharpGdf")
        .get("scriptableObjectCreateAssetMenu", true);
    if (!includeCreateAssetMenu) {
        return "";
    }
    return `[CreateAssetMenu(fileName = "${typeName}", menuName = "Data/${typeName}")]\n`;
}
function buildUsingBlock(kind) {
    if (kind === "monobehaviour" || kind === "scriptableobject") {
        return "using UnityEngine;\n\n";
    }
    return "";
}
//# sourceMappingURL=templateBuilder.js.map