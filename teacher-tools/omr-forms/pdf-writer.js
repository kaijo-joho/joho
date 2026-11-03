(function (root) {
  'use strict';

  var PAPER_SIZES = {
    A4: [210, 297],
    B5: [182, 257],
    B4: [257, 364]
  };
  var SOF_MARKERS = {
    0xc0: true, 0xc1: true, 0xc2: true, 0xc3: true,
    0xc5: true, 0xc6: true, 0xc7: true,
    0xc9: true, 0xca: true, 0xcb: true,
    0xcd: true, 0xce: true, 0xcf: true
  };
  var encoder = new TextEncoder();

  function fail(message) {
    throw new TypeError('OMRPDF: ' + message);
  }

  function isBytes(value) {
    return value instanceof Uint8Array;
  }

  function jpegInfo(bytes) {
    if (!isBytes(bytes) || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      fail('JPEG must be a Uint8Array starting with SOI');
    }
    var pos = 2;
    var frame = null;
    var sawScan = false;
    while (pos < bytes.length) {
      if (bytes[pos] !== 0xff) fail('invalid JPEG marker boundary');
      while (pos < bytes.length && bytes[pos] === 0xff) pos++;
      if (pos >= bytes.length) fail('truncated JPEG marker');
      var marker = bytes[pos++];
      if (marker === 0xd9) {
        if (!sawScan || !frame || pos !== bytes.length) fail('invalid JPEG EOI');
        return frame;
      }
      if (marker === 0xd8 || marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        fail('unexpected standalone JPEG marker');
      }
      if (pos + 2 > bytes.length) fail('truncated JPEG segment length');
      var length = bytes[pos] * 256 + bytes[pos + 1];
      if (length < 2 || pos + length > bytes.length) fail('invalid JPEG segment length');
      var data = pos + 2;
      if (SOF_MARKERS[marker]) {
        if (frame || length < 11) fail('invalid JPEG frame header');
        var components = bytes[data + 5];
        if (components !== 3 || length !== 8 + components * 3) fail('JPEG must have three color components');
        var height = bytes[data + 1] * 256 + bytes[data + 2];
        var width = bytes[data + 3] * 256 + bytes[data + 4];
        if (!width || !height) fail('invalid JPEG dimensions');
        var ids = [bytes[data + 6], bytes[data + 9], bytes[data + 12]];
        if (ids[0] === ids[1] || ids[0] === ids[2] || ids[1] === ids[2]) fail('duplicate JPEG component id');
        frame = { width: width, height: height, components: components };
      }
      pos += length;
      if (marker === 0xda) {
        if (!frame || length < 8) fail('invalid JPEG scan header');
        sawScan = true;
        var foundMarker = false;
        while (pos < bytes.length) {
          if (bytes[pos++] !== 0xff) continue;
          if (pos >= bytes.length) fail('truncated JPEG scan');
          var next = bytes[pos++];
          while (next === 0xff) {
            if (pos >= bytes.length) fail('truncated JPEG scan marker');
            next = bytes[pos++];
          }
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) continue;
          pos -= 2;
          foundMarker = true;
          break;
        }
        if (!foundMarker) fail('JPEG has no EOI');
      }
    }
    fail('JPEG has no EOI');
  }

  function validatePage(page) {
    if (!page || typeof page !== 'object') fail('each page must be an object');
    var w = page.widthMm;
    var h = page.heightMm;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) fail('invalid page size');
    var known = Object.keys(PAPER_SIZES).some(function (name) {
      var size = PAPER_SIZES[name];
      return (w === size[0] && h === size[1]) || (w === size[1] && h === size[0]);
    });
    if (!known) fail('unknown paper size');
    if (!Number.isSafeInteger(page.widthPx) || !Number.isSafeInteger(page.heightPx) || page.widthPx <= 0 || page.heightPx <= 0) {
      fail('invalid pixel dimensions');
    }
    var info = jpegInfo(page.jpeg);
    if (info.width !== page.widthPx || info.height !== page.heightPx) fail('JPEG and page pixel dimensions differ');
    return {
      widthMm: w,
      heightMm: h,
      widthPx: page.widthPx,
      heightPx: page.heightPx,
      jpeg: page.jpeg
    };
  }

  function pt(mm) {
    return String(Number((mm * 360 / 127).toFixed(10)));
  }

  function ascii(value) {
    return encoder.encode(value);
  }

  function concat(chunks) {
    var length = chunks.reduce(function (sum, chunk) { return sum + chunk.length; }, 0);
    var result = new Uint8Array(length);
    var offset = 0;
    chunks.forEach(function (chunk) { result.set(chunk, offset); offset += chunk.length; });
    return result;
  }

  function build(pages) {
    if (!Array.isArray(pages) || pages.length < 1 || pages.length > 8) fail('pages must contain 1 to 8 pages');
    pages = pages.map(validatePage);

    var objects = [];
    var pageRefs = [];
    objects[1] = ascii('<< /Type /Catalog /Pages 2 0 R >>');
    for (var i = 0; i < pages.length; i++) pageRefs.push((3 + i * 3) + ' 0 R');
    objects[2] = ascii('<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pageRefs.join(' ') + '] >>');

    pages.forEach(function (page, i) {
      var pageId = 3 + i * 3;
      var contentId = pageId + 1;
      var imageId = pageId + 2;
      var width = pt(page.widthMm);
      var height = pt(page.heightMm);
      var content = ascii('q\n' + width + ' 0 0 ' + height + ' 0 0 cm\n/Im0 Do\nQ\n');
      objects[pageId] = ascii('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + width + ' ' + height + '] /Resources << /XObject << /Im0 ' + imageId + ' 0 R >> >> /Contents ' + contentId + ' 0 R >>');
      objects[contentId] = concat([
        ascii('<< /Length ' + content.length + ' >>\nstream\n'), content, ascii('endstream')
      ]);
      objects[imageId] = concat([
        ascii('<< /Type /XObject /Subtype /Image /Width ' + page.widthPx + ' /Height ' + page.heightPx + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + page.jpeg.length + ' >>\nstream\n'),
        page.jpeg,
        ascii('\nendstream')
      ]);
    });
    var maxId = 2 + pages.length * 3;
    var infoId = maxId + 1;
    objects[infoId] = ascii('<< /Producer (OMR Forms) >>');

    var chunks = [ascii('%PDF-1.4\n')];
    var offsets = [0];
    var offset = chunks[0].length;
    for (var id = 1; id <= infoId; id++) {
      offsets[id] = offset;
      var head = ascii(id + ' 0 obj\n');
      var tail = ascii('\nendobj\n');
      chunks.push(head, objects[id], tail);
      offset += head.length + objects[id].length + tail.length;
    }
    var xrefOffset = offset;
    var xref = 'xref\n0 ' + (infoId + 1) + '\n0000000000 65535 f \n';
    for (var x = 1; x <= infoId; x++) {
      if (offsets[x] > 9999999999) fail('PDF is too large');
      xref += String(offsets[x]).padStart(10, '0') + ' 00000 n \n';
    }
    var trailer = 'trailer\n<< /Size ' + (infoId + 1) + ' /Root 1 0 R /Info ' + infoId + ' 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';
    chunks.push(ascii(xref + trailer));
    return concat(chunks);
  }

  root.OMRPDF = Object.freeze({ build: build });
})(window);
