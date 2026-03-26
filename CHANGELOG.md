# Changelog

All notable changes to **C# GDF Tools** are documented in this file.

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

[2.1.0]: https://marketplace.visualstudio.com/items?itemName=gdf.vscode-csharp-gdf-tools
