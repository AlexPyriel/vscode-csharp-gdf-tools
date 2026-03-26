"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const createType_1 = require("./features/createType");
function activate(context) {
    (0, createType_1.registerCreateTypeCommands)(context);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map