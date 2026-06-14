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
exports.registerDocRenderCommands = registerDocRenderCommands;
const vscode = __importStar(require("vscode"));
// Toggles XML documentation comments between raw (editable) and a rendered,
// in-editor view. Rendering is implemented with editor decorations:
// the raw "///" markup is hidden (display:none), each doc line is repainted with
// the editor background to mask whitespace guides / indent guides, a left rule is
// drawn via injected CSS, and the formatted text is injected as styled segments.
// The editor stays editable so code can be written while the docs are rendered.
const DOC_LINE_PATTERN = /^(\s*)\/\/\/(?!\/)(.*)$/;
function registerDocRenderCommands(context) {
    const manager = createRenderManager();
    context.subscriptions.push({ dispose: () => manager.dispose() });
    context.subscriptions.push(vscode.commands.registerCommand("csharpGdf.toggleDocRender", () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== "csharp") {
            return;
        }
        manager.toggle(editor);
    }));
    // Auto-render a C# document the first time it is seen, when enabled. Tracking
    // handled documents means a manual toggle-off is not undone on tab switches.
    const autoHandled = new Set();
    function maybeAutoRender(editor) {
        if (editor.document.languageId !== "csharp") {
            return;
        }
        const key = editor.document.uri.toString();
        if (autoHandled.has(key)) {
            return;
        }
        autoHandled.add(key);
        const renderByDefault = vscode.workspace
            .getConfiguration("csharpGdf")
            .get("docRender.renderByDefault", false);
        if (renderByDefault) {
            manager.ensureRendered(editor);
        }
    }
    for (const editor of vscode.window.visibleTextEditors) {
        maybeAutoRender(editor);
    }
    // Decorations live per-editor, so re-apply when a rendered document becomes
    // visible again (split, tab switch, etc.); also auto-render newly opened files.
    context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(editors => {
        for (const editor of editors) {
            maybeAutoRender(editor);
            manager.refresh(editor);
        }
    }));
    // While rendered: editing a doc comment drops back to raw so it can be edited;
    // any other edit just keeps the overlay aligned with the code.
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document !== event.document) {
                continue;
            }
            if (manager.isRendered(editor) && changeTouchesDocComment(event)) {
                manager.disableRender(editor);
            }
            else {
                manager.refresh(editor);
            }
        }
    }));
}
function createRenderManager() {
    const renderedDocuments = new Set();
    // Resolved <inheritdoc/> summaries, keyed by member name. `null` means resolved
    // but no documentation was found; `pendingInherit` guards against duplicate hovers.
    const inheritCache = new Map();
    const pendingInherit = new Set();
    const hideDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration: "none; display: none;"
    });
    // Masks whitespace dots and indentation guides on rendered doc lines.
    const maskDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: new vscode.ThemeColor("editor.background")
    });
    const injectDecoration = vscode.window.createTextEditorDecorationType({});
    function isEnabled() {
        return vscode.workspace.getConfiguration("csharpGdf").get("docRender.enabled", true);
    }
    function getRenderColor() {
        return vscode.workspace.getConfiguration("csharpGdf").get("docRender.color", "#6A9955");
    }
    function clearEditor(editor) {
        editor.setDecorations(hideDecoration, []);
        editor.setDecorations(maskDecoration, []);
        editor.setDecorations(injectDecoration, []);
    }
    // A cursor sitting inside a hidden ("display:none") doc line collapses to a
    // zero-width position and stops delivering keystrokes, so move it onto the
    // nearest visible code line.
    function moveCursorOffDocLines(editor) {
        const document = editor.document;
        const activeLine = editor.selection.active.line;
        if (!DOC_LINE_PATTERN.test(document.lineAt(activeLine).text)) {
            return;
        }
        let target = -1;
        for (let lineIndex = activeLine; lineIndex < document.lineCount; lineIndex++) {
            if (!DOC_LINE_PATTERN.test(document.lineAt(lineIndex).text)) {
                target = lineIndex;
                break;
            }
        }
        if (target === -1) {
            for (let lineIndex = activeLine; lineIndex >= 0; lineIndex--) {
                if (!DOC_LINE_PATTERN.test(document.lineAt(lineIndex).text)) {
                    target = lineIndex;
                    break;
                }
            }
        }
        if (target === -1) {
            return;
        }
        const position = document.lineAt(target).range.start;
        editor.selection = new vscode.Selection(position, position);
    }
    function applyEditor(editor) {
        const hideRanges = [];
        const maskRanges = [];
        const injectOptions = [];
        const document = editor.document;
        const color = getRenderColor();
        // Vertical padding on the inline ::before stretches the left border across the
        // inter-line gap (it does not affect line layout), keeping the rule continuous.
        const barCss = `none; border-left: 2px solid ${color}; padding-left: 12px; padding-top: 4px; padding-bottom: 4px;`;
        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const lineText = document.lineAt(lineIndex).text;
            const match = DOC_LINE_PATTERN.exec(lineText);
            if (!match) {
                continue;
            }
            const indentLength = match[1].length;
            const wholeLine = new vscode.Range(new vscode.Position(lineIndex, 0), new vscode.Position(lineIndex, lineText.length));
            // Hide the whole physical line; the formatted text is injected instead.
            hideRanges.push(wholeLine);
            maskRanges.push(wholeLine);
            const zeroRange = new vscode.Range(new vscode.Position(lineIndex, 0), new vscode.Position(lineIndex, 0));
            // A single before-injection per line. Multiple injections on one line cannot
            // be positioned reliably in VS Code, so the entire rendered line is one
            // attachment. The left rule is drawn via injected CSS.
            let rendered;
            if (isInheritDocLine(match[2])) {
                // Resolve the inherited summary via the C# language server (hover), cached.
                const member = findMemberName(document, lineIndex);
                const cached = member ? inheritCache.get(member.name) : undefined;
                if (member && cached === undefined && !pendingInherit.has(member.name)) {
                    pendingInherit.add(member.name);
                    void resolveInherited(editor, member, lineIndex);
                }
                rendered = cached ? cached : "(inherited documentation)";
            }
            else {
                rendered = renderDocSegments(match[2]).map(segment => segment.text).join("");
            }
            injectOptions.push({
                range: zeroRange,
                renderOptions: {
                    before: {
                        contentText: rendered.length > 0 ? rendered : " ",
                        color,
                        margin: `0 0 0 ${indentLength}ch`,
                        textDecoration: barCss
                    }
                }
            });
        }
        editor.setDecorations(maskDecoration, maskRanges);
        editor.setDecorations(hideDecoration, hideRanges);
        editor.setDecorations(injectDecoration, injectOptions);
    }
    async function resolveInherited(editor, member, docLine) {
        const key = editor.document.uri.toString();
        const maxAttempts = 10;
        let resolved = null;
        try {
            // Resolution depends on the C# language server, which may still be warming up
            // right after opening a solution. Retry with backoff (~30s total) before
            // giving up, so auto-render on a cold start still fills inheritdoc in.
            for (let attempt = 0; attempt < maxAttempts && !resolved; attempt++) {
                if (attempt > 0) {
                    await new Promise(done => setTimeout(done, Math.min(attempt * 1000, 4000)));
                }
                try {
                    // First ask the language server (hover); if it does not resolve the
                    // inherited docs, fall back to reading the base type's source.
                    const hovers = await vscode.commands.executeCommand("vscode.executeHoverProvider", editor.document.uri, member.position);
                    resolved = parseHoverDoc(hovers);
                    if (!resolved) {
                        resolved = await resolveInheritedFromSource(editor.document, member.name, docLine);
                    }
                }
                catch {
                    // Provider not ready yet; the loop will retry.
                }
            }
        }
        finally {
            inheritCache.set(member.name, resolved);
            pendingInherit.delete(member.name);
            if (renderedDocuments.has(key)) {
                applyEditor(editor);
            }
        }
    }
    return {
        toggle(editor) {
            if (!isEnabled()) {
                return;
            }
            const key = editor.document.uri.toString();
            if (renderedDocuments.has(key)) {
                renderedDocuments.delete(key);
                clearEditor(editor);
                return;
            }
            renderedDocuments.add(key);
            // Drop resolved-inheritdoc cache so a fresh toggle retries (e.g. if the C#
            // server was still warming up on a previous attempt).
            inheritCache.clear();
            moveCursorOffDocLines(editor);
            applyEditor(editor);
        },
        ensureRendered(editor) {
            if (!isEnabled()) {
                return;
            }
            const key = editor.document.uri.toString();
            if (renderedDocuments.has(key)) {
                return;
            }
            renderedDocuments.add(key);
            applyEditor(editor);
        },
        disableRender(editor) {
            const key = editor.document.uri.toString();
            if (!renderedDocuments.has(key)) {
                return;
            }
            renderedDocuments.delete(key);
            clearEditor(editor);
        },
        isRendered(editor) {
            return renderedDocuments.has(editor.document.uri.toString());
        },
        refresh(editor) {
            const key = editor.document.uri.toString();
            if (renderedDocuments.has(key)) {
                applyEditor(editor);
            }
        },
        dispose() {
            renderedDocuments.clear();
            inheritCache.clear();
            pendingInherit.clear();
            hideDecoration.dispose();
            maskDecoration.dispose();
            injectDecoration.dispose();
        }
    };
}
// True when an edit lands on a documentation line (typing "///", an inserted doc
// block, or editing an existing comment) — used to drop out of render mode.
function changeTouchesDocComment(event) {
    for (const change of event.contentChanges) {
        const line = change.range.start.line;
        if (line < event.document.lineCount && DOC_LINE_PATTERN.test(event.document.lineAt(line).text)) {
            return true;
        }
        if (change.text.includes("///")) {
            return true;
        }
    }
    return false;
}
function isInheritDocLine(rawInner) {
    return /^\s*<inheritdoc\b[^>]*\/?>\s*$/i.test(rawInner);
}
// Locate the member documented by an <inheritdoc/> line: the first code line below
// it (skipping further doc lines, attributes and blanks), and the column of its name.
function findMemberName(document, docLine) {
    for (let lineIndex = docLine + 1; lineIndex < document.lineCount; lineIndex++) {
        const text = document.lineAt(lineIndex).text;
        const trimmed = text.trim();
        if (trimmed.length === 0 || trimmed.startsWith("///") || trimmed.startsWith("[")) {
            continue;
        }
        // The member name is the identifier that precedes "(", "=>", "=", ";" or "{",
        // allowing an optional generic parameter list.
        const match = /([A-Za-z_]\w*)\s*(?:<[^>(]*>)?\s*(?=\(|=>|=[^=]|;|\{)/.exec(text);
        return match ? { name: match[1], position: new vscode.Position(lineIndex, match.index) } : undefined;
    }
    return undefined;
}
// Resolve <inheritdoc/> by reading the base type's source: find the enclosing type's
// base list, jump to each base type's definition (definition provider), open that file
// and pull the same-named member's <summary>.
async function resolveInheritedFromSource(document, memberName, docLine) {
    const baseTypes = findBaseTypes(document, docLine);
    for (const base of baseTypes) {
        let definitions;
        try {
            definitions = await vscode.commands.executeCommand("vscode.executeDefinitionProvider", document.uri, base.position);
        }
        catch {
            definitions = undefined;
        }
        for (const definition of definitions ?? []) {
            const uri = "targetUri" in definition ? definition.targetUri : definition.uri;
            try {
                const baseDocument = await vscode.workspace.openTextDocument(uri);
                const summary = findMemberSummaryInDoc(baseDocument, memberName);
                if (summary) {
                    return summary;
                }
            }
            catch {
                // Unreadable file; try the next candidate.
            }
        }
    }
    return null;
}
// Collect the base types declared by the nearest type declaration above `fromLine`,
// each with the document position of its name (for the definition provider).
function findBaseTypes(document, fromLine) {
    for (let lineIndex = fromLine; lineIndex >= 0; lineIndex--) {
        const text = document.lineAt(lineIndex).text;
        const match = /\b(?:class|interface|struct|record)\s+[A-Za-z_]\w*(?:\s*<[^>]*>)?\s*:\s*([^{]+?)(?:\bwhere\b|\{|$)/.exec(text);
        if (!match) {
            continue;
        }
        const baseListColumn = match.index + match[0].indexOf(match[1]);
        const result = [];
        const namePattern = /[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/g;
        let nameMatch;
        while ((nameMatch = namePattern.exec(match[1])) !== null) {
            const full = nameMatch[0];
            const shortName = full.split(".").pop() ?? full;
            const column = baseListColumn + nameMatch.index + (full.length - shortName.length);
            result.push({ name: shortName, position: new vscode.Position(lineIndex, column) });
        }
        return result;
    }
    return [];
}
// Find the member declared with `memberName` in a document and return its summary.
function findMemberSummaryInDoc(document, memberName) {
    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
        const match = /([A-Za-z_]\w*)\s*(?:<[^>(]*>)?\s*(?=\(|=>|=[^=]|;|\{)/.exec(document.lineAt(lineIndex).text);
        if (match && match[1] === memberName) {
            const summary = extractSummaryAbove(document, lineIndex);
            if (summary) {
                return summary;
            }
        }
    }
    return null;
}
// Read the contiguous /// doc block immediately above a declaration and return its summary.
function extractSummaryAbove(document, declarationLine) {
    const inner = [];
    for (let lineIndex = declarationLine - 1; lineIndex >= 0; lineIndex--) {
        const trimmed = document.lineAt(lineIndex).text.trim();
        const docMatch = /^\/\/\/(?!\/)(.*)$/.exec(trimmed);
        if (docMatch) {
            inner.unshift(docMatch[1]);
            continue;
        }
        if (trimmed.startsWith("[")) {
            continue;
        }
        break;
    }
    if (inner.length === 0) {
        return null;
    }
    const text = inner.join("\n");
    const summaryMatch = /<summary>([\s\S]*?)<\/summary>/i.exec(text);
    const raw = summaryMatch ? summaryMatch[1] : text.replace(/<\/?summary>/gi, "");
    const cleaned = decodeXmlEntities(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    return cleaned.length > 0 ? cleaned : null;
}
// Reduce a hover result to its prose documentation, dropping the code signature.
function parseHoverDoc(hovers) {
    if (!hovers || hovers.length === 0) {
        return null;
    }
    const values = [];
    for (const hover of hovers) {
        for (const content of hover.contents) {
            values.push(typeof content === "string" ? content : content.value);
        }
    }
    const text = values
        .join("\n")
        .replace(/```[\s\S]*?```/g, " ") // signature code fence
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // markdown links
        .replace(/\\([\\`*_{}\[\]()#+\-.!])/g, "$1") // markdown backslash escapes
        .replace(/[*_`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return text.length > 0 ? text : null;
}
// Tags that only structure the comment and carry no inline value of their own.
const BLOCK_ONLY_LINE = /^<\/?(summary|remarks|example|para|value|list|listheader|code|overloads)\b[^>]*>$/i;
function renderDocSegments(rawInner) {
    const trimmed = rawInner.trim();
    if (trimmed.length === 0 || BLOCK_ONLY_LINE.test(trimmed)) {
        return [];
    }
    const segments = [];
    let bold = false;
    let italic = false;
    const pushText = (value) => {
        const decoded = decodeXmlEntities(value);
        if (decoded.length === 0) {
            return;
        }
        segments.push({ text: decoded, bold, italic });
    };
    const tagPattern = /<[^>]+>/g;
    let lastIndex = 0;
    let tagMatch;
    while ((tagMatch = tagPattern.exec(rawInner)) !== null) {
        pushText(rawInner.slice(lastIndex, tagMatch.index));
        handleTag(tagMatch[0], segments, value => (bold = value), value => (italic = value), bold, italic);
        lastIndex = tagPattern.lastIndex;
    }
    pushText(rawInner.slice(lastIndex));
    return normalizeSegments(segments);
}
function handleTag(tag, segments, setBold, setItalic, bold, _italic) {
    const name = tagName(tag);
    switch (name) {
        // Section tags with their own content become a bold label or name.
        case "param":
        case "typeparam": {
            const paramName = attr(tag, "name");
            if (paramName) {
                segments.push({ text: paramName, bold: true });
                segments.push({ text: " — " });
            }
            return;
        }
        case "exception":
        case "permission": {
            const cref = attr(tag, "cref");
            if (cref) {
                segments.push({ text: stripCrefPrefix(cref), bold: true });
                segments.push({ text: " — " });
            }
            return;
        }
        case "returns":
            if (!isClosing(tag)) {
                segments.push({ text: "Returns: ", bold: true });
            }
            return;
        case "seealso": {
            const target = attr(tag, "cref") || attr(tag, "href");
            if (target) {
                segments.push({ text: "See also: " });
                segments.push({ text: stripCrefPrefix(target), italic: true });
            }
            return;
        }
        // Inline references.
        case "see": {
            const langword = attr(tag, "langword");
            const cref = attr(tag, "cref");
            const href = attr(tag, "href");
            const value = langword || (cref ? stripCrefPrefix(cref) : href);
            if (value) {
                segments.push({ text: value, italic: true, bold });
            }
            return;
        }
        case "paramref":
        case "typeparamref": {
            const refName = attr(tag, "name");
            if (refName) {
                segments.push({ text: refName, italic: true, bold });
            }
            return;
        }
        case "item":
            if (!isClosing(tag)) {
                segments.push({ text: "• " });
            }
            return;
        case "term":
            setBold(!isClosing(tag));
            if (isClosing(tag)) {
                segments.push({ text: " — " });
            }
            return;
        case "note":
            if (!isClosing(tag)) {
                segments.push({ text: "Note: ", bold: true });
            }
            return;
        case "inheritdoc":
            segments.push({ text: "(inherited documentation)", italic: true });
            return;
        // Inline emphasis.
        case "b":
        case "strong":
            setBold(!isClosing(tag));
            return;
        case "i":
        case "em":
            setItalic(!isClosing(tag));
            return;
        // Everything else (summary, remarks, c, code, description, br, list, ...)
        // contributes no markup of its own; their inner text is kept as-is.
        default:
            return;
    }
}
function tagName(tag) {
    const match = /^<\/?\s*([a-z][a-z0-9]*)/i.exec(tag);
    return match ? match[1].toLowerCase() : "";
}
function isClosing(tag) {
    return /^<\s*\//.test(tag);
}
function attr(tag, attribute) {
    const match = new RegExp(`${attribute}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
    return match ? match[1] : undefined;
}
function stripCrefPrefix(value) {
    // crefs are often "T:Namespace.Type" or "M:Type.Method(...)"; drop the prefix.
    return value.replace(/^[A-Za-z]:/, "");
}
function normalizeSegments(segments) {
    const collapsed = segments
        .map(segment => ({ ...segment, text: segment.text.replace(/[ \t]+/g, " ") }))
        .filter(segment => segment.text.length > 0);
    if (collapsed.length === 0) {
        return [];
    }
    collapsed[0].text = collapsed[0].text.replace(/^\s+/, "");
    const last = collapsed[collapsed.length - 1];
    last.text = last.text.replace(/\s+$/, "");
    return collapsed.filter(segment => segment.text.length > 0);
}
function decodeXmlEntities(value) {
    return value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}
//# sourceMappingURL=docRender.js.map