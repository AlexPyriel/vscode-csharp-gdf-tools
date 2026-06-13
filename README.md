# C# GDF Tools

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/gdf.vscode-csharp-gdf-tools?label=Marketplace&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=gdf.vscode-csharp-gdf-tools)

C# GDF Tools helps you create C# files faster in VS Code and gives each new file the namespace you actually expect.

> Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=gdf.vscode-csharp-gdf-tools).

It is built for Unity-style project structures, regular C# folders, and mixed setups that use `.asmdef` files.

## Features

### Create C# files from Explorer

Right-click a folder in the Explorer and use the `Add` submenu to create:

- `New C# Class`
- `New C# Interface`
- `New C# Record`
- `New C# Struct`
- `New C# Enum`
- `New C# MonoBehaviour`
- `New C# ScriptableObject`

Every command:

- asks for a type name
- creates the `.cs` file in the selected folder
- generates the matching namespace automatically
- opens the new file immediately in the editor

This is especially useful in Unity projects where you want to create scripts directly from folder structure without fixing namespaces by hand afterward.

### Render XML documentation comments

Toggle a clean, in-editor rendering of `///` XML documentation comments with **`Shift+Cmd+R`** (macOS) / **`Shift+Ctrl+R`** (Windows/Linux), the 📖 button in the editor title bar, the editor context menu, or the Command Palette (*C# GDF Tools: Toggle XML Doc Rendering*). Enable `csharpGdf.docRender.renderByDefault` to render automatically when a C# file is opened.

When rendered:

- the raw `///` markup and tags are hidden behind a clean left rule;
- `<summary>`, `<param>`, `<typeparam>`, `<returns>`, `<value>`, `<exception>`, `<remarks>`, `<example>`, `<seealso>` and inline tags (`<see>`, `<paramref>`, `<c>`, `<b>`/`<i>`, lists) are formatted into readable text;
- `<inheritdoc/>` is resolved to the actual inherited documentation from the base type or interface;
- the editor stays fully editable — toggle again to return to the raw comment.

## Namespace Resolution

The default mode is `folder`: the namespace mirrors the file's folder path relative to the workspace root. This matches the C# **IDE0130** analyzer (*"namespace does not match folder structure"*), so generated files stay warning-free and the analyzer keeps reporting genuinely misplaced namespaces.

> In Unity projects the workspace root is the folder above `Assets`, so a file in `Assets/Project/Core` gets `Assets.Project.Core` — exactly what IDE0130 expects.

Other strategies are available via `csharpGdf.namespaceSource`:

- `folder` (default) — folder path relative to the workspace root.
- `hybrid` — nearest `.asmdef` name as the base, falling back to the folder path.
- `asmdef` — nearest `.asmdef` name as the base only.

The result is prefixed with `csharpGdf.rootNamespace` when configured.

## Settings

Available settings:

- `csharpGdf.rootNamespace`: optional namespace prefix
- `csharpGdf.namespaceSource`: resolution strategy, one of `folder` (default, IDE0130-compatible), `hybrid`, `asmdef`
- `csharpGdf.useFileScopedNamespace`: generate file-scoped namespaces
- `csharpGdf.scriptableObjectCreateAssetMenu`: include `CreateAssetMenu` in generated `ScriptableObject` files
- `csharpGdf.docRender.enabled`: enable the Toggle XML Doc Rendering command
- `csharpGdf.docRender.color`: color used for rendered documentation and the left rule
- `csharpGdf.docRender.renderByDefault`: render documentation automatically when a C# file is opened

## Why Use It

- Faster script creation directly from the folder you are working in
- Predictable namespaces for Unity and non-Unity C# projects
- Better support for real project structure instead of hand-maintained namespace rules
- Cleaner workflow for teams that organize code by folders or `.asmdef` boundaries
