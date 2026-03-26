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
exports.resolveExpectedNamespace = resolveExpectedNamespace;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
async function resolveExpectedNamespace(fileUri) {
    const configuration = vscode.workspace.getConfiguration("csharpGdf");
    const sourceMode = configuration.get("namespaceSource", "hybrid");
    const rootNamespace = sanitizeNamespace(configuration.get("rootNamespace", ""));
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
async function findNearestAsmdef(folderPath, workspaceRoot) {
    let currentPath = folderPath;
    while (currentPath.startsWith(workspaceRoot)) {
        const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
        const asmdefEntry = entries.find(([name, type]) => name.endsWith(".asmdef") && type === vscode.FileType.File);
        if (asmdefEntry) {
            const asmdefUri = vscode.Uri.file(path.join(currentPath, asmdefEntry[0]));
            const contentBytes = await vscode.workspace.fs.readFile(asmdefUri);
            try {
                const parsed = JSON.parse(Buffer.from(contentBytes).toString("utf8"));
                if (parsed.name) {
                    return {
                        directoryPath: currentPath,
                        namespaceBase: sanitizeNamespace(parsed.name)
                    };
                }
            }
            catch {
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
function buildFolderBasedNamespace(folderPath, workspaceRoot) {
    const relativeFolderPath = path.relative(workspaceRoot, folderPath);
    return sanitizePathToNamespace(relativeFolderPath);
}
function buildNamespaceSuffix(folderPath, baseDirectoryPath) {
    const relativeFolderPath = path.relative(baseDirectoryPath, folderPath);
    return sanitizePathToNamespace(relativeFolderPath);
}
function sanitizePathToNamespace(relativePath) {
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
function toNamespaceIdentifier(value) {
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
function sanitizeNamespace(value) {
    return value
        .split(".")
        .map(part => toNamespaceIdentifier(part))
        .filter(Boolean)
        .join(".");
}
function joinNamespaceParts(parts) {
    const filtered = parts.filter((value) => Boolean(value));
    if (filtered.length === 0) {
        return undefined;
    }
    return filtered.join(".");
}
//# sourceMappingURL=namespaceResolver.js.map