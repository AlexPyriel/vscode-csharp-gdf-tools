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
exports.registerCreateTypeCommands = registerCreateTypeCommands;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const templateBuilder_1 = require("../shared/templateBuilder");
const namespaceResolver_1 = require("../shared/namespaceResolver");
const CREATE_COMMANDS = [
    { command: "csharpGdf.newClass", kind: "class" },
    { command: "csharpGdf.newInterface", kind: "interface" },
    { command: "csharpGdf.newRecord", kind: "record" },
    { command: "csharpGdf.newStruct", kind: "struct" },
    { command: "csharpGdf.newEnum", kind: "enum" },
    { command: "csharpGdf.newMonoBehaviour", kind: "monobehaviour" },
    { command: "csharpGdf.newScriptableObject", kind: "scriptableobject" }
];
function registerCreateTypeCommands(context) {
    for (const item of CREATE_COMMANDS) {
        const disposable = vscode.commands.registerCommand(item.command, async (resource) => {
            await createTypeFile(item.kind, resource);
        });
        context.subscriptions.push(disposable);
    }
}
async function createTypeFile(kind, resource) {
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
            const normalized = (0, templateBuilder_1.normalizeTypeNameForKind)(value, kind);
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
                return "Use a valid C# identifier.";
            }
            return undefined;
        }
    });
    if (!rawName) {
        return;
    }
    const typeName = (0, templateBuilder_1.normalizeTypeNameForKind)(rawName, kind);
    const fileUri = vscode.Uri.joinPath(targetFolder, `${typeName}.cs`);
    try {
        await vscode.workspace.fs.stat(fileUri);
        void vscode.window.showErrorMessage(`File already exists: ${path.basename(fileUri.fsPath)}`);
        return;
    }
    catch {
        // File does not exist, continue.
    }
    const namespaceValue = await (0, namespaceResolver_1.resolveExpectedNamespace)(fileUri);
    const content = (0, templateBuilder_1.buildTemplate)({
        kind,
        typeName,
        namespaceValue,
        useFileScopedNamespace: getUseFileScopedNamespace()
    });
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf8"));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);
}
async function resolveTargetFolder(resource) {
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
function getUseFileScopedNamespace() {
    return vscode.workspace.getConfiguration("csharpGdf").get("useFileScopedNamespace", false);
}
function defaultTypeName(kind) {
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
//# sourceMappingURL=createType.js.map