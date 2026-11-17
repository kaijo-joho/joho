// 旧候補の試験入口。3モード共通の利用者導線を検証する。
if (process.env.HTML_FINAL_ENGINE && !process.env.HTML_MODES_ENGINE) process.env.HTML_MODES_ENGINE = process.env.HTML_FINAL_ENGINE;
await import('./three-modes.browser.mjs');
