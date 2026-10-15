// 共通UI・複数文書へ移行した検証を共通スイートで実行する。
process.env.LOGIC_WORKSPACE_TEST_SCOPE = 'layout';
await import('./test-logic-workspace-browser.mjs');
