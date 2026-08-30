import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const sourcePattern = /^[A-Za-z0-9_-]+$/;
const hostPattern = /<[a-z][^>]*(?:\bid\s*=\s*["']content["']|\bdata-slide-content(?:\s*=\s*(?:["'][^"']*["']|[^\s>]+))?)[^>]*>/gi;
const attributePattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const errors = [];
const warnings = [];
const dataCache = new Map();
const imagePaths = new Set();
let checkedEntryCount = 0;

function parseAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(attributePattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

function pageIdFromPath(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

function addError(filePath, message) {
  errors.push(`${path.relative(projectRoot, filePath)}: ${message}`);
}

function addWarning(filePath, message) {
  warnings.push(`${path.relative(projectRoot, filePath)}: ${message}`);
}

async function loadSlideData(source, htmlPath) {
  if (dataCache.has(source)) return dataCache.get(source);

  const dataPath = path.join(projectRoot, 'js', `${source}.js`);
  let sourceText;
  try {
    sourceText = await readFile(dataPath, 'utf8');
  } catch {
    addError(htmlPath, `js/${source}.js が見つかりません。`);
    dataCache.set(source, null);
    return null;
  }

  const sandbox = { window: {} };
  try {
    vm.runInNewContext(sourceText, sandbox, {
      filename: dataPath,
      timeout: 1000
    });
  } catch (error) {
    addError(dataPath, `JavaScriptとして読み込めません: ${error.message}`);
    dataCache.set(source, null);
    return null;
  }

  const entries = sandbox.window.slidesData;
  if (!Array.isArray(entries) || entries.length === 0) {
    addError(dataPath, 'window.slidesData が空、または配列ではありません。');
    dataCache.set(source, null);
    return null;
  }

  const sections = new Set();
  entries.forEach((entry, index) => {
    const label = `${index + 1}件目`;
    checkedEntryCount++;

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      addError(dataPath, `${label}がオブジェクトではありません。`);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(entry, 'section')) {
      if (typeof entry.section !== 'string' || entry.section.trim() === '') {
        addError(dataPath, `${label}のsectionが空です。`);
      } else {
        sections.add(entry.section.trim());
      }
      return;
    }

    if (Object.prototype.hasOwnProperty.call(entry, 'slideTitle')) return;

    if (typeof entry.title !== 'string' || entry.title.trim() === '') {
      addError(dataPath, `${label}のtitleが空です。`);
    }
    if (typeof entry.note !== 'string') {
      addError(dataPath, `${label}のnoteが文字列ではありません。`);
    }
    if (/\[\[(?:TITLE|SECTION_HEADER|DETAILS|PRIVATE)\b/i.test(`${entry.title || ''}\n${entry.note || ''}`)) {
      addError(dataPath, `${label}に公開前の制御記号が残っています。`);
    }
    if (entry.imageAlt !== undefined && typeof entry.imageAlt !== 'string') {
      addError(dataPath, `${label}のimageAltが文字列ではありません。`);
    }

    if (entry.image !== undefined) {
      if (typeof entry.image !== 'string' || entry.image.trim() === '') {
        addError(dataPath, `${label}のimageが不正です。`);
      } else if (/^https?:\/\//i.test(entry.image)) {
        addWarning(dataPath, `${label}は外部画像を参照しています: ${entry.image}`);
      } else {
        const imagePath = path.resolve(projectRoot, entry.image.replace(/[?#].*$/, ''));
        if (!imagePath.startsWith(`${projectRoot}${path.sep}`)) {
          addError(dataPath, `${label}のimageがプロジェクト外を参照しています。`);
        } else {
          imagePaths.add(imagePath);
        }
      }
    }
  });

  const result = { entries, sections, dataPath };
  dataCache.set(source, result);
  return result;
}

async function validateHtmlFile(htmlPath) {
  const html = await readFile(htmlPath, 'utf8');
  const hostTags = Array.from(html.matchAll(hostPattern), match => match[0]);
  if (hostTags.length === 0) return false;

  const fallbackSource = pageIdFromPath(htmlPath);
  const hosts = hostTags.map(tag => parseAttributes(tag));
  const sources = new Set(
    hosts.map(attributes => (attributes['data-slide-source'] || fallbackSource).trim())
  );

  if (sources.size !== 1) {
    addError(htmlPath, '1ページで複数のdata-slide-sourceを使用しています。');
    return true;
  }

  const source = Array.from(sources)[0];
  if (!sourcePattern.test(source)) {
    addError(htmlPath, `data-slide-source「${source}」は使用できません。`);
    return true;
  }

  const slideData = await loadSlideData(source, htmlPath);
  if (!slideData) return true;

  hosts.forEach(attributes => {
    const explicitHost = Object.prototype.hasOwnProperty.call(attributes, 'data-slide-content');
    const layout = (attributes['data-slide-layout'] || (explicitHost ? 'inline' : 'sections')).trim();
    if (!['inline', 'sections'].includes(layout)) {
      addError(htmlPath, `data-slide-layout「${layout}」は使用できません。`);
    }

    const section = (attributes['data-slide-section'] || '').trim();
    if (section && !slideData.sections.has(section)) {
      addError(htmlPath, `data-slide-section「${section}」がjs/${source}.jsにありません。`);
    }

    const sectionHeading = attributes['data-slide-section-heading'];
    if (sectionHeading !== undefined && !['true', 'false'].includes(sectionHeading)) {
      addError(htmlPath, 'data-slide-section-headingはtrueまたはfalseで指定してください。');
    }

    const headingLevel = attributes['data-slide-heading-level'];
    if (headingLevel !== undefined && !['3', '4', '5', '6'].includes(headingLevel)) {
      addError(htmlPath, 'data-slide-heading-levelは3〜6で指定してください。');
    }
  });

  const contentIndex = html.search(/\bid\s*=\s*["']content["']/i);
  const supplementIndex = html.search(/\bid\s*=\s*["']examples_and_questions["']/i);
  if (contentIndex >= 0 && supplementIndex >= 0 && contentIndex > supplementIndex) {
    addError(htmlPath, '#contentは#examples_and_questionsより前に配置してください。');
  }

  return true;
}

async function main() {
  const rootFiles = (await readdir(projectRoot, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.html'))
    .map(entry => path.join(projectRoot, entry.name));
  const testFiles = [path.join(projectRoot, 'test', 'slide-hybrid.html')];
  const htmlFiles = [...rootFiles, ...testFiles];
  let checkedPageCount = 0;

  for (const htmlPath of htmlFiles) {
    try {
      if (await validateHtmlFile(htmlPath)) checkedPageCount++;
    } catch (error) {
      if (error.code !== 'ENOENT') addError(htmlPath, error.message);
    }
  }

  for (const imagePath of imagePaths) {
    try {
      await access(imagePath);
    } catch {
      addError(imagePath, '参照されている画像が見つかりません。');
    }
  }

  warnings.forEach(message => console.warn(`WARN ${message}`));
  errors.forEach(message => console.error(`ERROR ${message}`));

  if (errors.length > 0) {
    console.error(`\nスライド教材検証: ${errors.length}件のエラー`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `スライド教材検証: OK（HTML ${checkedPageCount}件、データ ${dataCache.size}件、` +
    `エントリ ${checkedEntryCount}件、画像 ${imagePaths.size}件）`
  );
}

await main();
