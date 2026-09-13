(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DigitalTextCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONTROL_LABELS = [
    'NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI',
    'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US'
  ];
  const CONTROL_NAMES = [
    'ヌル（値0）', 'ヘディング開始', '本文開始', '本文終了', '転送終了', '問い合わせ', '受信確認', '警報', '後退', '水平タブ', '改行', '垂直タブ', '改ページ', '行頭復帰', 'シフトアウト', 'シフトイン',
    'データリンク拡張', '装置制御1', '装置制御2', '装置制御3', '装置制御4', '受信不可', '同期', '転送ブロック終了', '取り消し', '媒体終了', '置換', 'エスケープ', 'ファイル区切り', 'グループ区切り', 'レコード区切り', '単位区切り'
  ];

  function assertLimit(value, label) {
    if (!Number.isInteger(value)) throw new TypeError(label);
    if (value < 1 || value > 32) throw new RangeError(label);
    return value;
  }

  function byteHex(bytes) { return bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' '); }
  function byteBits(bytes) { return bytes.map((byte) => byte.toString(2).padStart(8, '0')).join(' '); }
  function codePointLabel(codePoint) { return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`; }

  function asciiEntry(code) {
    if (!Number.isInteger(code)) throw new TypeError('ASCIIコード');
    if (code < 0 || code > 127) throw new RangeError('ASCIIコード');
    const character = String.fromCharCode(code);
    let label;
    let name;
    let kind;
    if (code < 32) {
      label = CONTROL_LABELS[code];
      name = CONTROL_NAMES[code];
      kind = 'control';
    } else if (code === 32) {
      label = 'SP'; name = '空白'; kind = 'space';
    } else if (code === 127) {
      label = 'DEL'; name = '削除'; kind = 'control';
    } else {
      label = character; name = '印字可能文字'; kind = 'printable';
    }
    return { code, character, label, name, kind, hex: code.toString(16).toUpperCase().padStart(2, '0'), bits: code.toString(2).padStart(8, '0') };
  }

  function encodeAscii(text, maxBytes = 32) {
    assertLimit(maxBytes, '最大バイト数');
    if (typeof text !== 'string') throw new TypeError('文字列');
    const bytes = Array.from(text, (character) => character.charCodeAt(0));
    if (bytes.some((byte) => byte > 127)) throw new RangeError('ASCII以外の文字');
    if (bytes.length > maxBytes) throw new RangeError('最大バイト数');
    const entries = bytes.map(asciiEntry);
    return { text, bytes, entries, hex: byteHex(bytes), bits: byteBits(bytes), byteLength: bytes.length };
  }

  function parseBytes(raw, base, maxBytes = 32) {
    assertLimit(maxBytes, '最大バイト数');
    if (typeof raw !== 'string') throw new TypeError('バイト列');
    if (base !== 2 && base !== 16) throw new RangeError('進数');
    const compact = raw.normalize('NFKC').replace(/\s+/g, '');
    if (!compact) return null;
    const width = base === 2 ? 8 : 2;
    const pattern = base === 2 ? /^[01]+$/ : /^[0-9A-Fa-f]+$/;
    if (!pattern.test(compact) || compact.length % width !== 0) return null;
    const bytes = [];
    for (let index = 0; index < compact.length; index += width) bytes.push(Number.parseInt(compact.slice(index, index + width), base));
    return bytes.length <= maxBytes ? bytes : null;
  }

  function decodeAscii(raw, base = 2, maxBytes = 32) {
    const bytes = parseBytes(raw, base, maxBytes);
    if (bytes === null || bytes.some((byte) => byte > 127)) return null;
    return encodeAscii(String.fromCharCode(...bytes), maxBytes);
  }

  function hasUnpairedSurrogate(text) {
    for (let index = 0; index < text.length; index += 1) {
      const unit = text.charCodeAt(index);
      if (unit >= 0xD800 && unit <= 0xDBFF) {
        const next = text.charCodeAt(index + 1);
        if (!(next >= 0xDC00 && next <= 0xDFFF)) return true;
        index += 1;
      } else if (unit >= 0xDC00 && unit <= 0xDFFF) return true;
    }
    return false;
  }

  function visibleLabel(character, codePoint) {
    if (codePoint <= 127) return asciiEntry(codePoint).label;
    if (/^\s$/u.test(character)) return '空白';
    if (/^[\p{Cc}\p{Cf}]$/u.test(character)) return `制御文字 (${codePointLabel(codePoint)})`;
    return character;
  }

  function utf8(text, maxCodePoints = 32) {
    assertLimit(maxCodePoints, '最大コードポイント数');
    if (typeof text !== 'string') throw new TypeError('文字列');
    if (hasUnpairedSurrogate(text)) throw new RangeError('未対サロゲート');
    const characters = Array.from(text);
    if (characters.length > maxCodePoints) throw new RangeError('最大コードポイント数');
    const encoder = new TextEncoder();
    const entries = characters.map((character) => {
      const codePoint = character.codePointAt(0);
      const bytes = Array.from(encoder.encode(character));
      return { character, label: visibleLabel(character, codePoint), codePoint, codePointLabel: codePointLabel(codePoint), bytes, hex: byteHex(bytes), bits: byteBits(bytes), byteLength: bytes.length };
    });
    const bytes = Array.from(encoder.encode(text));
    return { text, entries, bytes, hex: byteHex(bytes), bits: byteBits(bytes), byteLength: bytes.length, codePointCount: characters.length };
  }

  function decodeBytes(bytes, encoding) {
    if (!Array.isArray(bytes)) throw new TypeError('バイト列');
    if (!['utf-8', 'shift_jis', 'iso-2022-jp'].includes(encoding)) throw new RangeError('文字コード');
    if (bytes.some((byte) => !Number.isInteger(byte))) throw new TypeError('バイト');
    if (bytes.some((byte) => byte < 0 || byte > 255)) throw new RangeError('バイト');
    try {
      return { ok: true, text: new TextDecoder(encoding, { fatal: true }).decode(new Uint8Array(bytes)) };
    } catch (error) {
      return { ok: false, text: '', error: error instanceof Error ? error.message : '復号できません' };
    }
  }

  return Object.freeze({ asciiEntry, encodeAscii, parseBytes, decodeAscii, utf8, decodeBytes });
});
