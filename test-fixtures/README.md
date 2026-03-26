# Test Fixtures

Open `test-fixtures/vscode-extension-test.code-workspace` in VS Code when you want to manually test the extension.

If you open the extension project root in VS Code, you can press `F5` and use the `Run C# Riderish Tools Extension` launch configuration. It will build the extension and open the test workspace in an Extension Development Host window.

## What to verify

- Create a new C# file inside `Assets/Scripts/Gameplay/Enemies` and confirm that the generated namespace uses the real folder path:
  `namespace Demo.Game.Assets.Scripts.Gameplay.Enemies { ... }`
- Create a new C# file inside `Assets/UI/Widgets` and confirm that the generated namespace is:
  `namespace Demo.Game.Assets.UI.Widgets { ... }`
