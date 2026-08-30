import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const manifestPath = path.join(projectRoot, 'config', 'slide-pages.json');
const idPattern = /^[A-Za-z0-9_-]+$/;
const checkOnly = process.argv.includes('--check');

function assertInsideProject(filePath, label) {
  const relative = path.relative(projectRoot, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label}がプロジェクト外を参照しています。`);
  }
}

function normalizePages(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('config/slide-pages.jsonの形式が不正です。');
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error('config/slide-pages.jsonのschemaVersionに対応していません。');
  }
  if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
    throw new Error('config/slide-pages.jsonのpagesが空です。');
  }

  const seen = new Set();
  return manifest.pages.map((page, index) => {
    if (!page || typeof page !== 'object' || Array.isArray(page)) {
      throw new Error(`pagesの${index + 1}件目がオブジェクトではありません。`);
    }
    const id = String(page.id || '').trim();
    const source = String(page.source || id).trim();
    if (!idPattern.test(id)) throw new Error(`ページID「${id}」は使用できません。`);
    if (!idPattern.test(source)) throw new Error(`スライド原本ID「${source}」は使用できません。`);
    if (seen.has(id)) throw new Error(`ページID「${id}」が重複しています。`);
    seen.add(id);
    return { id, source };
  });
}

function renderTemplate(template, page) {
  const rendered = template
    .replaceAll('{{pageId}}', page.id)
    .replaceAll('{{slideSource}}', page.source);
  const unresolved = rendered.match(/\{\{[^{}]+\}\}/g);
  if (unresolved) {
    throw new Error(`テンプレートに未解決の変数があります: ${unresolved.join(', ')}`);
  }
  return rendered.endsWith('\n') ? rendered : `${rendered}\n`;
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const pages = normalizePages(manifest);
  const templatePath = path.resolve(projectRoot, String(manifest.template || ''));
  assertInsideProject(templatePath, 'template');
  const template = await readFile(templatePath, 'utf8');
  const drift = [];
  let changedCount = 0;

  for (const page of pages) {
    const outputPath = path.join(projectRoot, `${page.id}.html`);
    const expected = renderTemplate(template, page);
    let actual = null;
    try {
      actual = await readFile(outputPath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    if (actual === expected) continue;
    if (checkOnly) {
      drift.push(path.basename(outputPath));
      continue;
    }
    await writeFile(outputPath, expected, 'utf8');
    changedCount++;
  }

  if (drift.length) {
    console.error(`生成HTMLがテンプレートと一致しません: ${drift.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  if (checkOnly) {
    console.log(`スライドページ生成確認: OK（${pages.length}ページ）`);
  } else {
    console.log(`スライドページ生成: ${changedCount}件更新（対象 ${pages.length}ページ）`);
  }
}

await main();
