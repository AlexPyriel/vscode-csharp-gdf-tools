# Changelog

All notable changes to **C# GDF Tools** are documented in this file.

## [2.5.0]

### XML doc rendering
- Typing `///` to start a documentation comment while rendering is active now automatically switches the document back to edit mode, so the comment (and any auto-generated block) can be written and seen as raw XML.

## [2.4.0]

### Namespace generation
- Default `csharpGdf.namespaceSource` is now `folder` — generated namespaces mirror the folder path relative to the workspace root and match the C# **IDE0130** analyzer (in Unity, files under `Assets/` get an `Assets.` prefix as the analyzer expects). `hybrid` and `asmdef` remain available.

### Fixes
- Generated files are now correctly indented: inside a block-scoped namespace the type and its body are indented by one level (all type kinds).

## [2.3.0]

### XML doc rendering improvements
- Added a 📖 toggle button in the editor title bar for C# files — render documentation with a click, no shortcut required.
- New `csharpGdf.docRender.renderByDefault` setting renders documentation automatically when a C# file is opened (applied once per document, so a manual toggle-off is preserved).
- `<inheritdoc/>` resolution now retries with backoff (~30s) to survive a cold-starting C# language server, so auto-render fills in inherited documentation once the server is ready.

## [2.2.0]

### Render XML documentation comments
- New command **Toggle XML Doc Rendering** (`Shift+Cmd+R` / `Shift+Ctrl+R`, editor context menu, Command Palette) renders `///` documentation in place while keeping the editor editable.
- Hides raw `///` markup behind a continuous left rule and formats `<summary>`, `<param>`, `<typeparam>`, `<returns>`, `<value>`, `<exception>`, `<remarks>`, `<example>`, `<seealso>`, and inline tags (`<see>`, `<paramref>`, `<c>`, `<b>`/`<i>`, lists).
- `<inheritdoc/>` is resolved to the inherited documentation from the base type or interface (via the C# language server, with a source-based fallback).
- Configurable via `csharpGdf.docRender.enabled` and `csharpGdf.docRender.color`.

## [2.1.0]

### Create C# files from the Explorer
- Right-click any folder and use the **Add** submenu to scaffold a `.cs` file:
  Class, Interface, Record, Struct, Enum, MonoBehaviour, and ScriptableObject.
- Each command asks for a name, creates the file in the selected folder, and opens it immediately.
- Type names are normalized to a valid C# identifier (PascalCase); interfaces get an `I` prefix automatically.

### Automatic namespace resolution
- `hybrid` strategy (default): uses the nearest applicable `.asmdef` name as the namespace base, appends the relative sub-folder path, and falls back to the workspace-relative folder path when no `.asmdef` applies.
- `asmdef` and `folder` strategies available via `csharpGdf.namespaceSource`.
- Optional `csharpGdf.rootNamespace` prefix.
- All path segments are sanitized into valid C# identifiers.

### Unity-aware templates
- MonoBehaviour and ScriptableObject templates include `using UnityEngine;`.
- ScriptableObject files include a `[CreateAssetMenu]` attribute by default (toggle with `csharpGdf.scriptableObjectCreateAssetMenu`).
- Optional file-scoped namespaces via `csharpGdf.useFileScopedNamespace`.

[2.5.0]: https://marketplace.visualstudio.com/items?itemName=gdf.vscode-csharp-gdf-tools
[2.4.0]: https://marketplace.visualstudio.com/items?itemName=gdf.vscode-csharp-gdf-tools
[2.3.0]: https://marketplace.visualstudio.com/items?itemName=gdf.vscode-csharp-gdf-tools
[2.2.0]: https://marketplace.visualstudio.com/items?itemName=gdf.vscode-csharp-gdf-tools
[2.1.0]: https://marketplace.visualstudio.com/items?itemName=gdf.vscode-csharp-gdf-tools
