import * as vscode from "vscode";

// Toggles XML documentation comments between raw (editable) and a rendered,
// in-editor view. Rendering is implemented with editor decorations:
// the raw "///" markup is hidden (display:none), each doc line is repainted with
// the editor background to mask whitespace guides / indent guides, a left rule is
// drawn via injected CSS, and the formatted text is injected as styled segments.
// The editor stays editable so code can be written while the docs are rendered.

const DOC_LINE_PATTERN = /^(\s*)\/\/\/(?!\/)(.*)$/;

interface Segment {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

interface RenderManager {
  toggle(editor: vscode.TextEditor): void;
  refresh(editor: vscode.TextEditor): void;
  dispose(): void;
}

export function registerDocRenderCommands(context: vscode.ExtensionContext): void {
  const manager = createRenderManager();
  context.subscriptions.push({ dispose: () => manager.dispose() });

  context.subscriptions.push(
    vscode.commands.registerCommand("csharpGdf.toggleDocRender", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "csharp") {
        return;
      }

      manager.toggle(editor);
    })
  );

  // Decorations live per-editor, so re-apply when a rendered document becomes
  // visible again (split, tab switch, etc.).
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(editors => {
      for (const editor of editors) {
        manager.refresh(editor);
      }
    })
  );

  // Keep the rendered overlay aligned with the code as the user edits.
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document === event.document) {
          manager.refresh(editor);
        }
      }
    })
  );
}

function createRenderManager(): RenderManager {
  const renderedDocuments = new Set<string>();
  // Resolved <inheritdoc/> summaries, keyed by member name. `null` means resolved
  // but no documentation was found; `pendingInherit` guards against duplicate hovers.
  const inheritCache = new Map<string, string | null>();
  const pendingInherit = new Set<string>();

  const hideDecoration = vscode.window.createTextEditorDecorationType({
    textDecoration: "none; display: none;"
  });

  // Masks whitespace dots and indentation guides on rendered doc lines.
  const maskDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor("editor.background")
  });

  const injectDecoration = vscode.window.createTextEditorDecorationType({});

  function isEnabled(): boolean {
    return vscode.workspace.getConfiguration("csharpGdf").get<boolean>("docRender.enabled", true);
  }

  function getRenderColor(): string {
    return vscode.workspace.getConfiguration("csharpGdf").get<string>("docRender.color", "#6A9955");
  }

  function clearEditor(editor: vscode.TextEditor): void {
    editor.setDecorations(hideDecoration, []);
    editor.setDecorations(maskDecoration, []);
    editor.setDecorations(injectDecoration, []);
  }

  // A cursor sitting inside a hidden ("display:none") doc line collapses to a
  // zero-width position and stops delivering keystrokes, so move it onto the
  // nearest visible code line.
  function moveCursorOffDocLines(editor: vscode.TextEditor): void {
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

  function applyEditor(editor: vscode.TextEditor): void {
    const hideRanges: vscode.Range[] = [];
    const maskRanges: vscode.Range[] = [];
    const injectOptions: vscode.DecorationOptions[] = [];
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
      const wholeLine = new vscode.Range(
        new vscode.Position(lineIndex, 0),
        new vscode.Position(lineIndex, lineText.length)
      );
      // Hide the whole physical line; the formatted text is injected instead.
      hideRanges.push(wholeLine);
      maskRanges.push(wholeLine);

      const zeroRange = new vscode.Range(new vscode.Position(lineIndex, 0), new vscode.Position(lineIndex, 0));

      // A single before-injection per line. Multiple injections on one line cannot
      // be positioned reliably in VS Code, so the entire rendered line is one
      // attachment. The left rule is drawn via injected CSS.
      let rendered: string;
      if (isInheritDocLine(match[2])) {
        // Resolve the inherited summary via the C# language server (hover), cached.
        const member = findMemberName(document, lineIndex);
        const cached = member ? inheritCache.get(member.name) : undefined;
        if (member && cached === undefined && !pendingInherit.has(member.name)) {
          pendingInherit.add(member.name);
          void resolveInherited(editor, member, lineIndex);
        }
        rendered = cached ? cached : "(inherited documentation)";
      } else {
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

  async function resolveInherited(editor: vscode.TextEditor, member: MemberRef, docLine: number): Promise<void> {
    const key = editor.document.uri.toString();
    const maxAttempts = 5;
    let resolved: string | null = null;
    try {
      // Resolution depends on the C# language server, which may still be warming up
      // right after a reload. Retry a few times before giving up.
      for (let attempt = 0; attempt < maxAttempts && !resolved; attempt++) {
        if (attempt > 0) {
          await new Promise(done => setTimeout(done, 1500));
        }
        try {
          // First ask the language server (hover); if it does not resolve the
          // inherited docs, fall back to reading the base type's source.
          const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            "vscode.executeHoverProvider",
            editor.document.uri,
            member.position
          );
          resolved = parseHoverDoc(hovers);
          if (!resolved) {
            resolved = await resolveInheritedFromSource(editor.document, member.name, docLine);
          }
        } catch {
          // Provider not ready yet; the loop will retry.
        }
      }
    } finally {
      inheritCache.set(member.name, resolved);
      pendingInherit.delete(member.name);
      if (renderedDocuments.has(key)) {
        applyEditor(editor);
      }
    }
  }

  return {
    toggle(editor: vscode.TextEditor): void {
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

    refresh(editor: vscode.TextEditor): void {
      const key = editor.document.uri.toString();
      if (renderedDocuments.has(key)) {
        applyEditor(editor);
      }
    },

    dispose(): void {
      renderedDocuments.clear();
      inheritCache.clear();
      pendingInherit.clear();
      hideDecoration.dispose();
      maskDecoration.dispose();
      injectDecoration.dispose();
    }
  };
}

interface MemberRef {
  name: string;
  position: vscode.Position;
}

function isInheritDocLine(rawInner: string): boolean {
  return /^\s*<inheritdoc\b[^>]*\/?>\s*$/i.test(rawInner);
}

// Locate the member documented by an <inheritdoc/> line: the first code line below
// it (skipping further doc lines, attributes and blanks), and the column of its name.
function findMemberName(document: vscode.TextDocument, docLine: number): MemberRef | undefined {
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

interface BaseTypeRef {
  name: string;
  position: vscode.Position;
}

// Resolve <inheritdoc/> by reading the base type's source: find the enclosing type's
// base list, jump to each base type's definition (definition provider), open that file
// and pull the same-named member's <summary>.
async function resolveInheritedFromSource(
  document: vscode.TextDocument,
  memberName: string,
  docLine: number
): Promise<string | null> {
  const baseTypes = findBaseTypes(document, docLine);

  for (const base of baseTypes) {
    let definitions: Array<vscode.Location | vscode.LocationLink> | undefined;
    try {
      definitions = await vscode.commands.executeCommand(
        "vscode.executeDefinitionProvider",
        document.uri,
        base.position
      );
    } catch {
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
      } catch {
        // Unreadable file; try the next candidate.
      }
    }
  }

  return null;
}

// Collect the base types declared by the nearest type declaration above `fromLine`,
// each with the document position of its name (for the definition provider).
function findBaseTypes(document: vscode.TextDocument, fromLine: number): BaseTypeRef[] {
  for (let lineIndex = fromLine; lineIndex >= 0; lineIndex--) {
    const text = document.lineAt(lineIndex).text;
    const match = /\b(?:class|interface|struct|record)\s+[A-Za-z_]\w*(?:\s*<[^>]*>)?\s*:\s*([^{]+?)(?:\bwhere\b|\{|$)/.exec(text);
    if (!match) {
      continue;
    }

    const baseListColumn = match.index + match[0].indexOf(match[1]);
    const result: BaseTypeRef[] = [];
    const namePattern = /[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/g;
    let nameMatch: RegExpExecArray | null;
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
function findMemberSummaryInDoc(document: vscode.TextDocument, memberName: string): string | null {
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
function extractSummaryAbove(document: vscode.TextDocument, declarationLine: number): string | null {
  const inner: string[] = [];
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
function parseHoverDoc(hovers: vscode.Hover[] | undefined): string | null {
  if (!hovers || hovers.length === 0) {
    return null;
  }

  const values: string[] = [];
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

function renderDocSegments(rawInner: string): Segment[] {
  const trimmed = rawInner.trim();
  if (trimmed.length === 0 || BLOCK_ONLY_LINE.test(trimmed)) {
    return [];
  }

  const segments: Segment[] = [];
  let bold = false;
  let italic = false;

  const pushText = (value: string): void => {
    const decoded = decodeXmlEntities(value);
    if (decoded.length === 0) {
      return;
    }
    segments.push({ text: decoded, bold, italic });
  };

  const tagPattern = /<[^>]+>/g;
  let lastIndex = 0;
  let tagMatch: RegExpExecArray | null;

  while ((tagMatch = tagPattern.exec(rawInner)) !== null) {
    pushText(rawInner.slice(lastIndex, tagMatch.index));
    handleTag(tagMatch[0], segments, value => (bold = value), value => (italic = value), bold, italic);
    lastIndex = tagPattern.lastIndex;
  }
  pushText(rawInner.slice(lastIndex));

  return normalizeSegments(segments);
}

function handleTag(
  tag: string,
  segments: Segment[],
  setBold: (value: boolean) => void,
  setItalic: (value: boolean) => void,
  bold: boolean,
  _italic: boolean
): void {
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

function tagName(tag: string): string {
  const match = /^<\/?\s*([a-z][a-z0-9]*)/i.exec(tag);
  return match ? match[1].toLowerCase() : "";
}

function isClosing(tag: string): boolean {
  return /^<\s*\//.test(tag);
}

function attr(tag: string, attribute: string): string | undefined {
  const match = new RegExp(`${attribute}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  return match ? match[1] : undefined;
}

function stripCrefPrefix(value: string): string {
  // crefs are often "T:Namespace.Type" or "M:Type.Method(...)"; drop the prefix.
  return value.replace(/^[A-Za-z]:/, "");
}

function normalizeSegments(segments: Segment[]): Segment[] {
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

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
