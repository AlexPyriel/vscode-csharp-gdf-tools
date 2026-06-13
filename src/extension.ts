import * as vscode from "vscode";
import { registerCreateTypeCommands } from "./features/createType";
import { registerDocRenderCommands } from "./features/docRender";

export function activate(context: vscode.ExtensionContext): void {
  registerCreateTypeCommands(context);
  registerDocRenderCommands(context);
}

export function deactivate(): void {}
