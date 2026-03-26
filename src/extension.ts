import * as vscode from "vscode";
import { registerCreateTypeCommands } from "./features/createType";

export function activate(context: vscode.ExtensionContext): void {
  registerCreateTypeCommands(context);
}

export function deactivate(): void {}
