import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('img/technology-society/scenes/manifest.json',root),'utf8'));
assert.equal(manifest.generator,'image_gen__imagegen');
assert.equal(manifest.generationMode,'built-in');
assert.equal(manifest.generationCalls,12);
assert.equal(manifest.scenes.length,12);
assert.equal(new Set(manifest.scenes.map(scene=>scene.id)).size,12);
const files=await readdir(new URL('img/technology-society/scenes/',root));
assert.equal(files.filter(name=>name.endsWith('.webp')).length,12);
let totalBytes=0;
for(const page of ['is61','is62','is63','is64']) {
 const html=await readFile(new URL(`${page}.html`,root),'utf8');
 const figures=[...html.matchAll(/<figure class="ts-scene" data-generated-scene="([^"]+)">([\s\S]*?)<\/figure>/g)];
 assert.equal(figures.length,3,`${page}: three individual scene images`);
 for(const [tag,id,body] of figures) {
  const scene=manifest.scenes.find(item=>item.id===id);
  assert.equal(scene.page,page);
  const image=body.match(/<img\b[^>]+>/)?.[0];
  assert.ok(image,`${id}: image element`);
  for(const attr of [`src="./${scene.assetFile}"`,`alt="${scene.alt}"`,`width="${scene.width}"`,`height="${scene.height}"`,'loading="lazy"','decoding="async"']) assert.ok(image.includes(attr),`${id}: ${attr}`);
  assert.match(body,/<figcaption>[\s\S]*生成イメージ/);
  assert.ok(body.includes(scene.caption));
  const prefix=html.slice(0,html.indexOf(tag));
  assert.ok(prefix.lastIndexOf('data-lesson-stage="0"')>prefix.lastIndexOf('data-lesson-stage-from="1"'),`${id}: prediction context`);
  assert.equal(scene.toolArguments.prompt,scene.prompt,'exact submitted prompt retained');
  assert.equal(scene.toolArguments.transparent_background,false);
  assert.ok(!('referenced_image_paths' in scene.toolArguments)&&!('num_last_images_to_include' in scene.toolArguments));
  const asset=await readFile(new URL(scene.assetFile,root));
  assert.equal(asset.toString('ascii',0,4),'RIFF');assert.equal(asset.toString('ascii',8,12),'WEBP');
  assert.equal(asset.length,scene.assetBytes);
  assert.equal(createHash('sha256').update(asset).digest('hex'),scene.assetSha256);
  assert.ok(scene.assetBytes<350_000,`${id}: lightweight image`);
  assert.equal(scene.width,1536);assert.equal(scene.height,1024);
  assert.match(scene.masterSha256,/^[a-f0-9]{64}$/);
  totalBytes+=asset.length;
 }
}
assert.ok(totalBytes<3_000_000,'twelve scenes remain under 3 MB');
console.log(`technology-society scenes: 12 individual built-in images, provenance, attributes, captions, hashes and ${totalBytes} bytes passed`);
