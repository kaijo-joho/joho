/* Included by build-gas.mjs; no Node APIs or external requests at runtime. */
function addWorksheetScanHeader_(bodyHtml, definition, year) {
  var title = definition.title.replace(/\s*ワークシート\s*$/, '');
  var source = bodyHtml.replace(/<header\b[^>]*class="ws-title-area"[^>]*>[\s\S]*?<\/header>/g, '');
  var count = 0;
  source = source.replace(/<article\b([^>]*\bclass="[^"]*\bws-page\b[^"]*"[^>]*)>/g, function (match, attrs) {
    var side = count++ % 2 === 0 ? 'F' : 'B';
    var models = ['a4', 'b5'].map(function (pageSize) {
      return WorksheetScanHeader.create({ pageSize: pageSize, title: title, worksheetId: definition.id, year: year, side: side }, WS_SCAN_CONFIG_, qrcodegen);
    });
    return '<article' + attrs + ' data-scan-side="' + side + '"><div class="ws-scan-layer">' + models.map(function (model) { return WorksheetScanHeader.svg(model); }).join('') + '</div>'
      + '<div class="ws-scan-mobile">' + models.map(function (model) { return WorksheetScanHeader.svg(model, true); }).join('') + '</div>';
  });
  if (count !== 2) throw new Error('Scan worksheets require exactly two explicit pages');
  return source;
}
