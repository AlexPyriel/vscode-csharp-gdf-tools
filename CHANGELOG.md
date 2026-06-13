# Changelog

All notable changes to **C# GDF Tools** are documented in this file.

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

[2.2.0]: https://marketplace.visualstudio.com/items?itemName=gdf.vscode-csharp-gdf-tools
[2.1.0]: https://marketplace.visualstudio.com/items?itemName=gdf.vscode-csharp-gdf-tools
