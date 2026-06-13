"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const createType_1 = require("./features/createType");
const docRender_1 = require("./features/docRender");
function activate(context) {
    (0, createType_1.registerCreateTypeCommands)(context);
    (0, docRender_1.registerDocRenderCommands)(context);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map