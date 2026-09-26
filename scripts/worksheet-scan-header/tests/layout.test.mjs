import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, load } from '../generate.mjs';
const options = { title: '音のデジタル表現', year: 2026, worksheetId: 'dr31', side: 'F' };
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.00001, `${a} != ${b}`);

test('All 30 centres form the declared grid and stay inside the central column', () => {
  for (const pageSize of ['a4', 'b5']) {
    const { coordinates: c } = generate({ ...options, pageSize });
    const m = c.columns.middle.mm;
    for (const [row, marks] of Object.entries(c.omr)) {
      assert.equal(marks.length, 10);
      for (let i = 0; i < 10; i++) {
        const p = marks[i].center.mm;
        near(p.x, c.omr.class[i].center.mm.x);
        near(p.y, marks[0].center.mm.y);
        near(p.y, c.handwriting[row + '_box'].mm.y + c.handwriting[row + '_box'].mm.height / 2);
        if (i) near(p.x - marks[i - 1].center.mm.x, 4.5 * c.scale);
        assert.ok(p.x - marks[i].radiusMm > m.x && p.x + marks[i].radiusMm < m.x + m.width);
        near(p.x / c.page.widthMm, marks[i].center.normalized.x);
      }
    }
  }
});
test('B5/A4 preserve header-local coordinates at a configurable scale', () => {
  const b5 = generate({ ...options, pageSize: 'b5' }).coordinates;
  const a4 = generate({ ...options, pageSize: 'a4', scale: 1.15 }).coordinates;
  for (const row of ['class', 'tens', 'ones']) for (let i = 0; i < 10; i++) {
    near(a4.omr[row][i].headerNormalized.x, b5.omr[row][i].headerNormalized.x);
    near(a4.omr[row][i].headerNormalized.y, b5.omr[row][i].headerNormalized.y);
    near(a4.omr[row][i].radiusMm, b5.omr[row][i].radiusMm * 1.15);
  }
  assert.equal(b5.page.widthMm, 182);
  assert.equal(b5.page.heightMm, 257);
});
test('QR quiet zone and physical module limits are enforced', () => {
  const c = generate(options).coordinates;
  assert.equal(c.qr.quietZoneModules, 4);
  near(c.qr.region.mm.width, 22);
  assert.ok(c.qr.moduleMm >= .45);
  assert.equal(c.identity.payload, 'INFO1|2026|dr31|F');
  assert.throws(() => generate({ ...options, qrPayload: 'INFO1|2026|WRONG|F' }), /disagree/);
  assert.throws(() => generate({ ...options, worksheetId: 'x'.repeat(21) }), /QR must/);
  assert.throws(() => generate({ title: 'test' }), /QR must/);
  assert.throws(() => generate({ ...options, pageSize: 'a4', scale: .5 }), /limits/);
  assert.throws(() => generate({ ...options, pageSize: 'a4', scale: 2 }), /fit/);
  assert.throws(() => generate({ ...options, pageSize: 'b5', scale: 1.1 }), /fixed/);
  assert.throws(() => generate({ ...options, pageSize: 'a5' }), /B5/);
});
test('Markers have printable insets and do not overlap the header', () => {
  for (const pageSize of ['a4', 'b5']) {
    const c = generate({ ...options, pageSize }).coordinates, h = c.header.mm;
    for (const marker of Object.values(c.markers)) {
      const r = marker.mm;
      assert.ok(r.x >= 5 && r.y >= 5);
      assert.ok(r.x + r.width <= c.page.widthMm - 5 && r.y + r.height <= c.page.heightMm - 5);
      assert.ok(r.x + r.width <= h.x || r.x >= h.x + h.width || r.y + r.height <= h.y || r.y >= h.y + h.height);
    }
  }
});
test('Long titles are bounded and XML characters cannot become markup', () => {
  const model = generate({ ...options, title: 'とても長いワークシートタイトル'.repeat(5) });
  assert.equal(model.coordinates.displayedTitle.length, 2);
  assert.ok(model.coordinates.displayedTitle[1].endsWith('…'));
  const escaped = generate({ ...options, title: '<script> & "title"' }).svg;
  assert.ok(!escaped.includes('<script>'));
  assert.ok(escaped.includes('&lt;script&gt;'));
});
test('Academic year is determined at the JST April boundary', () => {
  const { api } = load();
  assert.equal(api.fiscalYear(new Date('2026-03-31T14:59:59Z')), 2025);
  assert.equal(api.fiscalYear(new Date('2026-03-31T15:00:00Z')), 2026);
});
