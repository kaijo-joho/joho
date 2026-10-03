import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// This checks source structure and release integration, not copyright, secrets,
// teaching accuracy, rendered layout, or the behavior of a browser/print engine.
const usage = `Usage: node scripts/test-information-media-pages.mjs [options]
  --allow-unregistered  Allow missing is1x entries while official generation is pending.
                       Existing entries must still have release:false and show:false.
  --allow-pending-sri   Allow absent SRI on the two new information-media assets.
                       Any supplied SRI must still match the asset bytes.
  --help               Show this help.
The default run requires both pages, all assets, SRI, and draft registration.`;
const options = new Set(process.argv.slice(2));
const supported = new Set(['--allow-unregistered', '--allow-pending-sri', '--help']);
for (const option of options) {
  if (!supported.has(option)) throw new Error(`Unknown option: ${option}\n${usage}`);
}
if (options.has('--help')) {
  console.log(usage);
  process.exit(0);
}

const root = new URL('../', import.meta.url);
const expectedSlides = { is11: 6, is12: 6 };
const failures = [];
const pending = [];
const report = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const has = (node, name) => Object.hasOwn(node.attrs, name);
const classes = node => (node.attrs.class || '').split(/\s+/);
const isClass = (node, name) => classes(node).includes(name);
const words = value => (value || '').trim().split(/\s+/).filter(Boolean);
const decode = value => value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
  const names = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
  if (names[entity]) return names[entity];
  if (!entity.startsWith('&#')) return entity;
  const number = entity.toLowerCase().startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
  return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
});
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest(algorithm === 'sha384' ? 'base64' : 'hex');
const read = async path => {
  try { return await readFile(new URL(path, root)); }
  catch (error) { failures.push(`${path}: cannot read (${error.code || error.message})`); return null; }
};

// A small source-tree reader is sufficient for these explicit-closing-tag HTML
// documents. It lets model checks respect their nearest owning model and keeps
// SVG title/desc and term details attached to the correct container.
function parseHTML(html, label) {
  const document = { tag: '#document', attrs: {}, children: [], parent: null, start: 0, end: html.length };
  const nodes = [];
  const stack = [document];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const tokenPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z](?:"[^"]*"|'[^']*'|[^'">])*>/g;
  for (const token of html.matchAll(tokenPattern)) {
    const raw = token[0];
    if (raw.startsWith('<!')) continue;
    const closing = /^<\/\s*([\w:-]+)\s*>$/.exec(raw);
    if (closing) {
      const tag = closing[1].toLowerCase();
      const current = stack.at(-1);
      if (current.tag !== tag) {
        check(false, `${label}: closing </${tag}> does not match <${current.tag}>`);
        continue;
      }
      current.end = token.index;
      stack.pop();
      continue;
    }
    const opening = /^<([\w:-]+)([\s\S]*?)\/?\s*>$/.exec(raw);
    if (!opening) continue;
    const attrs = {};
    const attrPattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (const attribute of opening[2].matchAll(attrPattern)) {
      const name = attribute[1].toLowerCase();
      check(!Object.hasOwn(attrs, name), `${label}: duplicate attribute ${name}`);
      attrs[name] = decode(attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
    }
    const node = { tag: opening[1].toLowerCase(), attrs, children: [], parent: stack.at(-1), start: token.index + raw.length, end: token.index + raw.length };
    node.parent.children.push(node);
    nodes.push(node);
    if (!voidTags.has(node.tag) && !/\/\s*>$/.test(raw)) stack.push(node);
  }
  check(stack.length === 1, `${label}: unclosed source tags: ${stack.slice(1).map(node => node.tag).join(', ')}`);
  const within = (node, container) => {
    for (let parent = node.parent; parent; parent = parent.parent) if (parent === container) return true;
    return false;
  };
  const descendants = (container, predicate = () => true) => nodes.filter(node => within(node, container) && predicate(node));
  const closest = (node, predicate) => {
    for (let parent = node.parent; parent; parent = parent.parent) if (predicate(parent)) return parent;
    return null;
  };
  const text = node => decode(html.slice(node.start, node.end).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  return { nodes, descendants, closest, text };
}

const requiredAssets = [
  'css/css.css', 'css/lesson-slide-deck.css', 'css/information-society.css', 'css/information-media.css',
  'js/main.js', 'js/information-society.js', 'js/information-media.js', 'js/lesson-slide-deck.js',
];
const sriAssets = new Set(['css/information-society.css', 'js/information-society.js', 'css/information-media.css', 'js/information-media.js']);
const newAssets = new Set(['css/information-media.css', 'js/information-media.js']);
const assetBytes = new Map();
for (const asset of requiredAssets) assetBytes.set(asset, await read(asset));

let checkedAssets = 0;
async function checkReference(value, label, file, ids) {
  if (!value) { check(false, `${label}: empty asset/link reference`); return null; }
  if (value.startsWith('#')) {
    const fragment = decodeURIComponent(value.slice(1));
    if (fragment) check(ids.has(fragment), `${label}: missing fragment #${fragment}`);
    return null;
  }
  if (/^javascript:/i.test(value)) { check(false, `${label}: executable link is not permitted`); return null; }
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(value)) return null;
  const url = value.startsWith('/') ? new URL(`.${value}`, root) : new URL(value, new URL(file, root));
  check(url.href.startsWith(root.href), `${label}: local reference escapes the site root`);
  if (!url.href.startsWith(root.href)) return null;
  const path = fileURLToPath(url).slice(fileURLToPath(root).length);
  try {
    check((await stat(fileURLToPath(url))).isFile(), `${label}: local reference is not a file: ${path}`);
    checkedAssets++;
  } catch (error) {
    check(false, `${label}: missing local asset/link ${path} (${error.code || error.message})`);
  }
  return path;
}

for (const [id, count] of Object.entries(expectedSlides)) {
  const bytes = await read(`${id}.html`);
  if (!bytes) continue;
  const html = bytes.toString('utf8');
  const { nodes, descendants, closest, text } = parseHTML(html, id);
  const slides = nodes.filter(node => node.tag === 'section' && has(node, 'data-lesson-slide'));
  check(slides.length === count, `${id}: expected ${count} slides, found ${slides.length}`);
  const body = nodes.find(node => node.tag === 'body');
  check(body && isClass(body, 'is-lesson') && isClass(body, 'is-media') && has(body, 'data-lesson-slide-deck'), `${id}: shared lesson deck and media scope required`);
  const pageTitle = nodes.find(node => node.tag === 'title' && node.parent?.tag === 'head');
  check(pageTitle && text(pageTitle), `${id}: document title required`);
  const ids = new Set();
  for (const node of nodes) {
    if (has(node, 'id')) {
      check(node.attrs.id && !ids.has(node.attrs.id), `${id}: empty or duplicate ID ${node.attrs.id}`);
      ids.add(node.attrs.id);
    }
    check(!has(node, 'hidden'), `${id}: source-hidden content <${node.tag}> prevents the full no-JS fallback`);
    check(!Object.keys(node.attrs).some(name => /^on[a-z]/.test(name)), `${id}: inline event handler on <${node.tag}>`);
    check(!['form', 'input', 'textarea', 'iframe'].includes(node.tag), `${id}: unexpected input or embedded service <${node.tag}>`);
    if (node.tag === 'button') check(node.attrs.type === 'button', `${id}: button type must be explicit`);
    if (node.tag === 'script') check(has(node, 'src') && !text(node), `${id}: use external shared scripts`);
    if (node.tag === 'details' && isClass(node, 'is-supplement')) check(has(node, 'open'), `${id}: supplement must be source-open`);
  }
  check(!ids.has('page_header'), `${id}: must use the generated common cover`);
  for (const [index, slide] of slides.entries()) {
    check((slide.attrs['data-lesson-slide-title'] || '').trim(), `${id}: slide ${index + 1} needs a navigation title`);
    const headings = descendants(slide, node => node.tag === 'h2');
    check(headings.length === 1 && headings[0].attrs.id === `headline_${index + 1}`, `${id}: slide ${index + 1} needs its unique sequential h2 ID`);
    check(descendants(slide, node => node.tag === 'article').length === 1, `${id}: slide ${index + 1} needs one article`);
  }
  for (const node of nodes) {
    for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
      for (const target of words(node.attrs[attribute])) check(ids.has(target), `${id}: ${attribute} target ${target} is absent`);
    }
  }

  const svgs = nodes.filter(node => node.tag === 'svg');
  check(svgs.length >= 4, `${id}: at least four original inline SVG diagrams required`);
  for (const [index, svg] of svgs.entries()) {
    const label = `${id}: SVG ${index + 1}`;
    const viewBox = words(svg.attrs.viewbox).map(Number);
    check(viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0, `${label}: valid viewBox required`);
    check(svg.attrs.role === 'img', `${label}: role=img required`);
    const labels = words(svg.attrs['aria-labelledby']);
    for (const tag of ['title', 'desc']) {
      const descriptions = descendants(svg, node => node.tag === tag);
      check(descriptions.length === 1 && text(descriptions[0]) && descriptions[0].attrs.id && labels.includes(descriptions[0].attrs.id), `${label}: own nonempty ${tag} must be referenced by aria-labelledby`);
    }
  }

  const finalSlide = slides.at(-1);
  const terms = finalSlide ? descendants(finalSlide, node => node.tag === 'details' && closest(node, parent => isClass(parent, 'is-terms'))) : [];
  check(finalSlide && (finalSlide.attrs['data-lesson-slide-title'] || '').includes('重要語句・ポイント'), `${id}: final slide must be 重要語句・ポイント`);
  const finalHeading = finalSlide && descendants(finalSlide, node => node.tag === 'h2')[0];
  check(finalHeading && text(finalHeading).includes('重要語句・ポイント'), `${id}: final visible heading must be 重要語句・ポイント`);
  check(terms.length >= 6, `${id}: at least six term disclosures required on the final slide`);
  for (const term of terms) {
    check(has(term, 'open'), `${id}: term must be source-open`);
    const summary = term.children.find(node => node.tag === 'summary');
    check(summary && text(summary) && text(term) !== text(summary), `${id}: each term needs a label and explanation`);
  }
  const pointBlocks = finalSlide ? descendants(finalSlide, node => isClass(node, 'im-summary')) : [];
  check(pointBlocks.length === 1, `${id}: final slide needs one always-visible point summary`);
  if (pointBlocks.length === 1) {
    const points = descendants(pointBlocks[0], node => node.tag === 'li');
    check(points.length === 3, `${id}: final slide must have three summary points`);
    for (const point of points) check(!closest(point, node => node.tag === 'details' || has(node, 'data-is-panel')), `${id}: summary points must remain visible without opening or selecting a state`);
  }

  const models = nodes.filter(node => has(node, 'data-is-model'));
  const modelNames = new Set();
  check(models.length > 0, `${id}: state models required`);
  for (const model of models) {
    const name = model.attrs['data-is-model'];
    const label = `${id}/${name}`;
    check(name && !modelNames.has(name), `${id}: model names must be nonempty and unique`);
    modelNames.add(name);
    const own = nodes.filter(node => closest(node, parent => has(parent, 'data-is-model')) === model);
    const choices = own.filter(node => has(node, 'data-is-select'));
    const states = choices.map(node => node.attrs['data-is-select']);
    check(states.length >= 2 && new Set(states).size === states.length && states.every(state => state && !/\s/.test(state)), `${label}: two or more unique single-token states required`);
    check(states.includes(model.attrs['data-is-default']), `${label}: default must reference a choice`);
    const referenced = new Set();
    for (const node of own) {
      if (has(node, 'data-is-select')) check(node.tag === 'button' && ['false', 'true'].includes(node.attrs['aria-pressed']), `${label}: native toggle button and aria-pressed required`);
      for (const attribute of ['data-is-panel', 'data-is-highlight']) {
        if (!has(node, attribute)) continue;
        const values = words(node.attrs[attribute]);
        check(values.length > 0, `${label}: empty ${attribute}`);
        for (const state of values) {
          check(states.includes(state), `${label}: ${attribute} refers to unknown state ${state}`);
          referenced.add(state);
        }
      }
    }
    for (const state of states) check(referenced.has(state), `${label}: state ${state} has no panel or highlight target`);
    const resets = own.filter(node => has(node, 'data-is-reset'));
    check(resets.length > 0 && resets.every(node => node.tag === 'button'), `${label}: native reset button required`);
    for (const reset of resets) {
      const group = closest(reset, node => isClass(node, 'is-tabs') || node.attrs.role === 'group');
      check(group && !choices.some(choice => closest(choice, node => isClass(node, 'is-tabs') || node.attrs.role === 'group') === group), `${label}: reset must use a separate control group`);
    }
  }
  for (const node of nodes.filter(node => ['data-is-select', 'data-is-panel', 'data-is-highlight', 'data-is-reset'].some(attribute => has(node, attribute)))) {
    check(closest(node, parent => has(parent, 'data-is-model')), `${id}: orphan state control or target <${node.tag}>`);
  }

  const included = new Set();
  for (const node of nodes) {
    for (const attribute of ['src', 'href', 'poster']) {
      if (!has(node, attribute)) continue;
      const path = await checkReference(node.attrs[attribute], `${id} <${node.tag}> ${attribute}`, `${id}.html`, ids);
      if (!path || !['script', 'link'].includes(node.tag)) continue;
      included.add(path);
      if (!sriAssets.has(path)) continue;
      const actual = node.attrs.integrity;
      if (!actual && newAssets.has(path) && options.has('--allow-pending-sri')) {
        pending.push(`${id}: ${path} SRI not yet attached`);
      } else {
        const bytes = assetBytes.get(path);
        if (bytes) check(actual === `sha384-${hash('sha384', bytes)}`, `${id}: ${path} SRI missing or mismatched`);
      }
    }
    if (has(node, 'srcset')) {
      for (const candidate of node.attrs.srcset.split(',')) await checkReference(candidate.trim().split(/\s+/)[0], `${id} srcset`, `${id}.html`, ids);
    }
    if (node.tag === 'img') {
      check((node.attrs.alt || '').trim(), `${id}: scene image requires descriptive alt text`);
      check(Number(node.attrs.width) > 0 && Number(node.attrs.height) > 0, `${id}: scene image dimensions required`);
    }
  }
  for (const asset of requiredAssets) check(included.has(asset), `${id}: required shared asset ${asset} is not included`);
  report.push(`${id}: ${slides.length} slides, ${svgs.length} SVGs, ${terms.length} terms, ${models.length} state models`);
}

const pageBytes = await read('js/pages.js');
if (pageBytes) {
  const context = { window: {} };
  try {
    vm.runInNewContext(pageBytes.toString('utf8'), context, { timeout: 1000 });
    const pages = context.window.pages;
    check(pages && typeof pages === 'object', 'pages.js: window.pages is required');
    if (pages) {
      for (const id of Object.keys(expectedSlides)) {
        const entry = pages[id];
        if (!entry && options.has('--allow-unregistered')) {
          pending.push(`${id}: official page registration not yet generated`);
          continue;
        }
        check(entry, `${id}: official page registration is missing`);
        if (!entry) continue;
        check(entry.id === id && entry.fileName === `${id}.html`, `${id}: registration must identify its HTML file`);
        check(entry.release === false && entry.show === false, `${id}: registration must remain release:false, show:false`);
      }
    }
  } catch (error) { check(false, `pages.js: cannot inspect generated registration (${error.message})`); }
}
const searchBytes = await read('data/search-index.json');
if (searchBytes) {
  try {
    const search = JSON.parse(searchBytes);
    check(Array.isArray(search.documents), 'search-index.json: documents array required');
    if (Array.isArray(search.documents)) {
      for (const id of Object.keys(expectedSlides)) check(!search.documents.some(document => document.id === id), `${id}: draft page must not appear in the public search index`);
    }
  } catch (error) { check(false, `search-index.json: cannot inspect index (${error.message})`); }
}
const securityJS = assetBytes.get('js/information-media.js');
if (securityJS) check(!/\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|WebSocket)\b/.test(securityJS.toString('utf8')), 'information-media.js: unexpected transmission or persistence API');

for (const line of report) console.log(line);
for (const line of pending) console.log(`PENDING (explicit flag): ${line}`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.error(`information-media: ${failures.length} static check(s) failed; ${checkedAssets} local references inspected`);
  process.exitCode = 1;
} else {
  console.log(`information-media: ${report.length} pages passed completed static checks; ${checkedAssets} local references verified${pending.length ? `; ${pending.length} integration checks explicitly pending` : '; SRI and draft registration complete'}`);
}
