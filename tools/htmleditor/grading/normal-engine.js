var HtmlNormalConfiguredGrader = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name50 in all)
      __defProp(target, name50, { get: all[name50], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // ../../engine-v2/node_modules/source-map-js/lib/base64.js
  var require_base64 = __commonJS({
    "../../engine-v2/node_modules/source-map-js/lib/base64.js"(exports) {
      var intToCharMap = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
      exports.encode = function(number2) {
        if (0 <= number2 && number2 < intToCharMap.length) {
          return intToCharMap[number2];
        }
        throw new TypeError("Must be between 0 and 63: " + number2);
      };
      exports.decode = function(charCode) {
        var bigA = 65;
        var bigZ = 90;
        var littleA = 97;
        var littleZ = 122;
        var zero2 = 48;
        var nine = 57;
        var plus = 43;
        var slash = 47;
        var littleOffset = 26;
        var numberOffset = 52;
        if (bigA <= charCode && charCode <= bigZ) {
          return charCode - bigA;
        }
        if (littleA <= charCode && charCode <= littleZ) {
          return charCode - littleA + littleOffset;
        }
        if (zero2 <= charCode && charCode <= nine) {
          return charCode - zero2 + numberOffset;
        }
        if (charCode == plus) {
          return 62;
        }
        if (charCode == slash) {
          return 63;
        }
        return -1;
      };
    }
  });

  // ../../engine-v2/node_modules/source-map-js/lib/base64-vlq.js
  var require_base64_vlq = __commonJS({
    "../../engine-v2/node_modules/source-map-js/lib/base64-vlq.js"(exports) {
      var base64 = require_base64();
      var VLQ_BASE_SHIFT = 5;
      var VLQ_BASE = 1 << VLQ_BASE_SHIFT;
      var VLQ_BASE_MASK = VLQ_BASE - 1;
      var VLQ_CONTINUATION_BIT = VLQ_BASE;
      function toVLQSigned(aValue) {
        return aValue < 0 ? (-aValue << 1) + 1 : (aValue << 1) + 0;
      }
      function fromVLQSigned(aValue) {
        var isNegative = (aValue & 1) === 1;
        var shifted = aValue >> 1;
        return isNegative ? -shifted : shifted;
      }
      exports.encode = function base64VLQ_encode(aValue) {
        var encoded = "";
        var digit;
        var vlq = toVLQSigned(aValue);
        do {
          digit = vlq & VLQ_BASE_MASK;
          vlq >>>= VLQ_BASE_SHIFT;
          if (vlq > 0) {
            digit |= VLQ_CONTINUATION_BIT;
          }
          encoded += base64.encode(digit);
        } while (vlq > 0);
        return encoded;
      };
      exports.decode = function base64VLQ_decode(aStr, aIndex, aOutParam) {
        var strLen = aStr.length;
        var result = 0;
        var shift = 0;
        var continuation, digit;
        do {
          if (aIndex >= strLen) {
            throw new Error("Expected more digits in base 64 VLQ value.");
          }
          digit = base64.decode(aStr.charCodeAt(aIndex++));
          if (digit === -1) {
            throw new Error("Invalid base64 digit: " + aStr.charAt(aIndex - 1));
          }
          continuation = !!(digit & VLQ_CONTINUATION_BIT);
          digit &= VLQ_BASE_MASK;
          result = result + (digit << shift);
          shift += VLQ_BASE_SHIFT;
        } while (continuation);
        aOutParam.value = fromVLQSigned(result);
        aOutParam.rest = aIndex;
      };
    }
  });

  // ../../engine-v2/node_modules/source-map-js/lib/util.js
  var require_util = __commonJS({
    "../../engine-v2/node_modules/source-map-js/lib/util.js"(exports) {
      function getArg(aArgs, aName, aDefaultValue) {
        if (aName in aArgs) {
          return aArgs[aName];
        } else if (arguments.length === 3) {
          return aDefaultValue;
        } else {
          throw new Error('"' + aName + '" is a required argument.');
        }
      }
      exports.getArg = getArg;
      var urlRegexp = /^(?:([\w+\-.]+):)?\/\/(?:(\w+:\w+)@)?([\w.-]*)(?::(\d+))?(.*)$/;
      var dataUrlRegexp = /^data:.+\,.+$/;
      function urlParse(aUrl) {
        var match = aUrl.match(urlRegexp);
        if (!match) {
          return null;
        }
        return {
          scheme: match[1],
          auth: match[2],
          host: match[3],
          port: match[4],
          path: match[5]
        };
      }
      exports.urlParse = urlParse;
      function urlGenerate(aParsedUrl) {
        var url = "";
        if (aParsedUrl.scheme) {
          url += aParsedUrl.scheme + ":";
        }
        url += "//";
        if (aParsedUrl.auth) {
          url += aParsedUrl.auth + "@";
        }
        if (aParsedUrl.host) {
          url += aParsedUrl.host;
        }
        if (aParsedUrl.port) {
          url += ":" + aParsedUrl.port;
        }
        if (aParsedUrl.path) {
          url += aParsedUrl.path;
        }
        return url;
      }
      exports.urlGenerate = urlGenerate;
      var MAX_CACHED_INPUTS = 32;
      function lruMemoize(f) {
        var cache = [];
        return function(input) {
          for (var i = 0; i < cache.length; i++) {
            if (cache[i].input === input) {
              var temp = cache[0];
              cache[0] = cache[i];
              cache[i] = temp;
              return cache[0].result;
            }
          }
          var result = f(input);
          cache.unshift({
            input,
            result
          });
          if (cache.length > MAX_CACHED_INPUTS) {
            cache.pop();
          }
          return result;
        };
      }
      var normalize = lruMemoize(function normalize2(aPath) {
        var path = aPath;
        var url = urlParse(aPath);
        if (url) {
          if (!url.path) {
            return aPath;
          }
          path = url.path;
        }
        var isAbsolute = exports.isAbsolute(path);
        var parts = [];
        var start = 0;
        var i = 0;
        while (true) {
          start = i;
          i = path.indexOf("/", start);
          if (i === -1) {
            parts.push(path.slice(start));
            break;
          } else {
            parts.push(path.slice(start, i));
            while (i < path.length && path[i] === "/") {
              i++;
            }
          }
        }
        for (var part2, up = 0, i = parts.length - 1; i >= 0; i--) {
          part2 = parts[i];
          if (part2 === ".") {
            parts.splice(i, 1);
          } else if (part2 === "..") {
            up++;
          } else if (up > 0) {
            if (part2 === "") {
              parts.splice(i + 1, up);
              up = 0;
            } else {
              parts.splice(i, 2);
              up--;
            }
          }
        }
        path = parts.join("/");
        if (path === "") {
          path = isAbsolute ? "/" : ".";
        }
        if (url) {
          url.path = path;
          return urlGenerate(url);
        }
        return path;
      });
      exports.normalize = normalize;
      function join(aRoot, aPath) {
        if (aRoot === "") {
          aRoot = ".";
        }
        if (aPath === "") {
          aPath = ".";
        }
        var aPathUrl = urlParse(aPath);
        var aRootUrl = urlParse(aRoot);
        if (aRootUrl) {
          aRoot = aRootUrl.path || "/";
        }
        if (aPathUrl && !aPathUrl.scheme) {
          if (aRootUrl) {
            aPathUrl.scheme = aRootUrl.scheme;
          }
          return urlGenerate(aPathUrl);
        }
        if (aPathUrl || aPath.match(dataUrlRegexp)) {
          return aPath;
        }
        if (aRootUrl && !aRootUrl.host && !aRootUrl.path) {
          aRootUrl.host = aPath;
          return urlGenerate(aRootUrl);
        }
        var joined = aPath.charAt(0) === "/" ? aPath : normalize(aRoot.replace(/\/+$/, "") + "/" + aPath);
        if (aRootUrl) {
          aRootUrl.path = joined;
          return urlGenerate(aRootUrl);
        }
        return joined;
      }
      exports.join = join;
      exports.isAbsolute = function(aPath) {
        return aPath.charAt(0) === "/" || urlRegexp.test(aPath);
      };
      function relative(aRoot, aPath) {
        if (aRoot === "") {
          aRoot = ".";
        }
        aRoot = aRoot.replace(/\/$/, "");
        var level = 0;
        while (aPath.indexOf(aRoot + "/") !== 0) {
          var index = aRoot.lastIndexOf("/");
          if (index < 0) {
            return aPath;
          }
          aRoot = aRoot.slice(0, index);
          if (aRoot.match(/^([^\/]+:\/)?\/*$/)) {
            return aPath;
          }
          ++level;
        }
        return Array(level + 1).join("../") + aPath.substr(aRoot.length + 1);
      }
      exports.relative = relative;
      var supportsNullProto = (function() {
        var obj = /* @__PURE__ */ Object.create(null);
        return !("__proto__" in obj);
      })();
      function identity(s) {
        return s;
      }
      function toSetString(aStr) {
        if (isProtoString(aStr)) {
          return "$" + aStr;
        }
        return aStr;
      }
      exports.toSetString = supportsNullProto ? identity : toSetString;
      function fromSetString(aStr) {
        if (isProtoString(aStr)) {
          return aStr.slice(1);
        }
        return aStr;
      }
      exports.fromSetString = supportsNullProto ? identity : fromSetString;
      function isProtoString(s) {
        if (!s) {
          return false;
        }
        var length2 = s.length;
        if (length2 < 9) {
          return false;
        }
        if (s.charCodeAt(length2 - 1) !== 95 || s.charCodeAt(length2 - 2) !== 95 || s.charCodeAt(length2 - 3) !== 111 || s.charCodeAt(length2 - 4) !== 116 || s.charCodeAt(length2 - 5) !== 111 || s.charCodeAt(length2 - 6) !== 114 || s.charCodeAt(length2 - 7) !== 112 || s.charCodeAt(length2 - 8) !== 95 || s.charCodeAt(length2 - 9) !== 95) {
          return false;
        }
        for (var i = length2 - 10; i >= 0; i--) {
          if (s.charCodeAt(i) !== 36) {
            return false;
          }
        }
        return true;
      }
      function compareByOriginalPositions(mappingA, mappingB, onlyCompareOriginal) {
        var cmp2 = strcmp(mappingA.source, mappingB.source);
        if (cmp2 !== 0) {
          return cmp2;
        }
        cmp2 = mappingA.originalLine - mappingB.originalLine;
        if (cmp2 !== 0) {
          return cmp2;
        }
        cmp2 = mappingA.originalColumn - mappingB.originalColumn;
        if (cmp2 !== 0 || onlyCompareOriginal) {
          return cmp2;
        }
        cmp2 = mappingA.generatedColumn - mappingB.generatedColumn;
        if (cmp2 !== 0) {
          return cmp2;
        }
        cmp2 = mappingA.generatedLine - mappingB.generatedLine;
        if (cmp2 !== 0) {
          return cmp2;
        }
        return strcmp(mappingA.name, mappingB.name);
      }
      exports.compareByOriginalPositions = compareByOriginalPositions;
      function compareByOriginalPositionsNoSource(mappingA, mappingB, onlyCompareOriginal) {
        var cmp2;
        cmp2 = mappingA.originalLine - mappingB.originalLine;
        if (cmp2 !== 0) {
          return cmp2;
        }
        cmp2 = mappingA.originalColumn - mappingB.originalColumn;
        if (cmp2 !== 0 || onlyCompareOriginal) {
          return cmp2;
        }
        cmp2 = mappingA.generatedColumn - mappingB.generatedColumn;
        if (cmp2 !== 0) {
          return cmp2;
        }
        cmp2 = mappingA.generatedLine - mappingB.generatedLine;
        if (cmp2 !== 0) {
          return cmp2;
        }
        return strcmp(mappingA.name, mappingB.name);
      }
      exports.compareByOriginalPositionsNoSource = compareByOriginalPositionsNoSource;
      function compareByGeneratedPositionsDeflated(mappingA, mappingB, onlyCompareGenerated) {
        var cmp2 = mappingA.generatedLine - mappingB.generatedLine;
        if (cmp2 !== 0) {
          return cmp2;
        }
        cmp2 = mappingA.generatedColumn - mappingB.generatedColumn;
        if (cmp2 !== 0 || onlyCompareGenerated) {
          return cmp2;
        }
        cmp2 = strcmp(mappingA.source, mappingB.source);
        if (cmp2 !== 0) {
          return cmp2;
        }
        cmp2 = mappingA.originalLine - mappingB.originalLine;
        if (cmp2 !== 0) {
          return cmp2;
        }
        cmp2 = mappingA.originalColumn - mappingB.originalColumn;
        if (cmp2 !== 0) {
          return cmp2;
        }
        return strcmp(mappingA.name, mappingB.name);
      }
      exports.compareByGeneratedPositionsDeflated = compareByGeneratedPositionsDeflated;
      function compareByGeneratedPositionsDeflatedNoLine(mappingA, mappingB, onlyCompareGenerated) {
        var cmp2 = mappingA.generatedColumn - mappingB.generatedColumn;
        if (cmp2 !== 0 || onlyCompareGenerated) {
          return cmp2;
        }
        cmp2 = strcmp(mappingA.source, mappingB.source);
        if (cmp2 !== 0) {
          return cmp2;
        }
        cmp2 = mappingA.originalLine - mappingB.originalLine;
        if (cmp2 !== 0) {
          return cmp2;
        }
        cmp2 = mappingA.originalColumn - mappingB.originalColumn;
        if (cmp2 !== 0) {
          return cmp2;
        }
        return strcmp(mappingA.name, mappingB.name);
      }
      exports.compareByGeneratedPositionsDeflatedNoLine = compareByGeneratedPositionsDeflatedNoLine;
      function strcmp(aStr1, aStr2) {
        if (aStr1 === aStr2) {
          return 0;
        }
        if (aStr1 === null) {
          return 1;
        }
        if (aStr2 === null) {
          return -1;
        }
        if (aStr1 > aStr2) {
          return 1;
        }
        return -1;
      }
      function compareByGeneratedPositionsInflated(mappingA, mappingB) {
        var cmp2 = mappingA.generatedLine - mappingB.generatedLine;
        if (cmp2 !== 0) {
          return cmp2;
        }
        cmp2 = mappingA.generatedColumn - mappingB.generatedColumn;
        if (cmp2 !== 0) {
          return cmp2;
        }
        cmp2 = strcmp(mappingA.source, mappingB.source);
        if (cmp2 !== 0) {
          return cmp2;
        }
        cmp2 = mappingA.originalLine - mappingB.originalLine;
        if (cmp2 !== 0) {
          return cmp2;
        }
        cmp2 = mappingA.originalColumn - mappingB.originalColumn;
        if (cmp2 !== 0) {
          return cmp2;
        }
        return strcmp(mappingA.name, mappingB.name);
      }
      exports.compareByGeneratedPositionsInflated = compareByGeneratedPositionsInflated;
      function parseSourceMapInput(str) {
        return JSON.parse(str.replace(/^\)]}'[^\n]*\n/, ""));
      }
      exports.parseSourceMapInput = parseSourceMapInput;
      function computeSourceURL(sourceRoot, sourceURL, sourceMapURL) {
        sourceURL = sourceURL || "";
        if (sourceRoot) {
          if (sourceRoot[sourceRoot.length - 1] !== "/" && sourceURL[0] !== "/") {
            sourceRoot += "/";
          }
          sourceURL = sourceRoot + sourceURL;
        }
        if (sourceMapURL) {
          var parsed = urlParse(sourceMapURL);
          if (!parsed) {
            throw new Error("sourceMapURL could not be parsed");
          }
          if (parsed.path) {
            var index = parsed.path.lastIndexOf("/");
            if (index >= 0) {
              parsed.path = parsed.path.substring(0, index + 1);
            }
          }
          sourceURL = join(urlGenerate(parsed), sourceURL);
        }
        return normalize(sourceURL);
      }
      exports.computeSourceURL = computeSourceURL;
    }
  });

  // ../../engine-v2/node_modules/source-map-js/lib/array-set.js
  var require_array_set = __commonJS({
    "../../engine-v2/node_modules/source-map-js/lib/array-set.js"(exports) {
      var util = require_util();
      var has = Object.prototype.hasOwnProperty;
      var hasNativeMap = typeof Map !== "undefined";
      function ArraySet() {
        this._array = [];
        this._set = hasNativeMap ? /* @__PURE__ */ new Map() : /* @__PURE__ */ Object.create(null);
      }
      ArraySet.fromArray = function ArraySet_fromArray(aArray, aAllowDuplicates) {
        var set = new ArraySet();
        for (var i = 0, len = aArray.length; i < len; i++) {
          set.add(aArray[i], aAllowDuplicates);
        }
        return set;
      };
      ArraySet.prototype.size = function ArraySet_size() {
        return hasNativeMap ? this._set.size : Object.getOwnPropertyNames(this._set).length;
      };
      ArraySet.prototype.add = function ArraySet_add(aStr, aAllowDuplicates) {
        var sStr = hasNativeMap ? aStr : util.toSetString(aStr);
        var isDuplicate = hasNativeMap ? this.has(aStr) : has.call(this._set, sStr);
        var idx = this._array.length;
        if (!isDuplicate || aAllowDuplicates) {
          this._array.push(aStr);
        }
        if (!isDuplicate) {
          if (hasNativeMap) {
            this._set.set(aStr, idx);
          } else {
            this._set[sStr] = idx;
          }
        }
      };
      ArraySet.prototype.has = function ArraySet_has(aStr) {
        if (hasNativeMap) {
          return this._set.has(aStr);
        } else {
          var sStr = util.toSetString(aStr);
          return has.call(this._set, sStr);
        }
      };
      ArraySet.prototype.indexOf = function ArraySet_indexOf(aStr) {
        if (hasNativeMap) {
          var idx = this._set.get(aStr);
          if (idx >= 0) {
            return idx;
          }
        } else {
          var sStr = util.toSetString(aStr);
          if (has.call(this._set, sStr)) {
            return this._set[sStr];
          }
        }
        throw new Error('"' + aStr + '" is not in the set.');
      };
      ArraySet.prototype.at = function ArraySet_at(aIdx) {
        if (aIdx >= 0 && aIdx < this._array.length) {
          return this._array[aIdx];
        }
        throw new Error("No element indexed by " + aIdx);
      };
      ArraySet.prototype.toArray = function ArraySet_toArray() {
        return this._array.slice();
      };
      exports.ArraySet = ArraySet;
    }
  });

  // ../../engine-v2/node_modules/source-map-js/lib/mapping-list.js
  var require_mapping_list = __commonJS({
    "../../engine-v2/node_modules/source-map-js/lib/mapping-list.js"(exports) {
      var util = require_util();
      function generatedPositionAfter(mappingA, mappingB) {
        var lineA = mappingA.generatedLine;
        var lineB = mappingB.generatedLine;
        var columnA = mappingA.generatedColumn;
        var columnB = mappingB.generatedColumn;
        return lineB > lineA || lineB == lineA && columnB >= columnA || util.compareByGeneratedPositionsInflated(mappingA, mappingB) <= 0;
      }
      function MappingList() {
        this._array = [];
        this._sorted = true;
        this._last = { generatedLine: -1, generatedColumn: 0 };
      }
      MappingList.prototype.unsortedForEach = function MappingList_forEach(aCallback, aThisArg) {
        this._array.forEach(aCallback, aThisArg);
      };
      MappingList.prototype.add = function MappingList_add(aMapping) {
        if (generatedPositionAfter(this._last, aMapping)) {
          this._last = aMapping;
          this._array.push(aMapping);
        } else {
          this._sorted = false;
          this._array.push(aMapping);
        }
      };
      MappingList.prototype.toArray = function MappingList_toArray() {
        if (!this._sorted) {
          this._array.sort(util.compareByGeneratedPositionsInflated);
          this._sorted = true;
        }
        return this._array;
      };
      exports.MappingList = MappingList;
    }
  });

  // ../../engine-v2/node_modules/source-map-js/lib/source-map-generator.js
  var require_source_map_generator = __commonJS({
    "../../engine-v2/node_modules/source-map-js/lib/source-map-generator.js"(exports) {
      var base64VLQ = require_base64_vlq();
      var util = require_util();
      var ArraySet = require_array_set().ArraySet;
      var MappingList = require_mapping_list().MappingList;
      function SourceMapGenerator2(aArgs) {
        if (!aArgs) {
          aArgs = {};
        }
        this._file = util.getArg(aArgs, "file", null);
        this._sourceRoot = util.getArg(aArgs, "sourceRoot", null);
        this._skipValidation = util.getArg(aArgs, "skipValidation", false);
        this._ignoreInvalidMapping = util.getArg(aArgs, "ignoreInvalidMapping", false);
        this._sources = new ArraySet();
        this._names = new ArraySet();
        this._mappings = new MappingList();
        this._sourcesContents = null;
      }
      SourceMapGenerator2.prototype._version = 3;
      SourceMapGenerator2.fromSourceMap = function SourceMapGenerator_fromSourceMap(aSourceMapConsumer, generatorOps) {
        var sourceRoot = aSourceMapConsumer.sourceRoot;
        var generator = new SourceMapGenerator2(Object.assign(generatorOps || {}, {
          file: aSourceMapConsumer.file,
          sourceRoot
        }));
        aSourceMapConsumer.eachMapping(function(mapping) {
          var newMapping = {
            generated: {
              line: mapping.generatedLine,
              column: mapping.generatedColumn
            }
          };
          if (mapping.source != null) {
            newMapping.source = mapping.source;
            if (sourceRoot != null) {
              newMapping.source = util.relative(sourceRoot, newMapping.source);
            }
            newMapping.original = {
              line: mapping.originalLine,
              column: mapping.originalColumn
            };
            if (mapping.name != null) {
              newMapping.name = mapping.name;
            }
          }
          generator.addMapping(newMapping);
        });
        aSourceMapConsumer.sources.forEach(function(sourceFile) {
          var sourceRelative = sourceFile;
          if (sourceRoot !== null) {
            sourceRelative = util.relative(sourceRoot, sourceFile);
          }
          if (!generator._sources.has(sourceRelative)) {
            generator._sources.add(sourceRelative);
          }
          var content = aSourceMapConsumer.sourceContentFor(sourceFile);
          if (content != null) {
            generator.setSourceContent(sourceFile, content);
          }
        });
        return generator;
      };
      SourceMapGenerator2.prototype.addMapping = function SourceMapGenerator_addMapping(aArgs) {
        var generated = util.getArg(aArgs, "generated");
        var original = util.getArg(aArgs, "original", null);
        var source = util.getArg(aArgs, "source", null);
        var name50 = util.getArg(aArgs, "name", null);
        if (!this._skipValidation) {
          if (this._validateMapping(generated, original, source, name50) === false) {
            return;
          }
        }
        if (source != null) {
          source = String(source);
          if (!this._sources.has(source)) {
            this._sources.add(source);
          }
        }
        if (name50 != null) {
          name50 = String(name50);
          if (!this._names.has(name50)) {
            this._names.add(name50);
          }
        }
        this._mappings.add({
          generatedLine: generated.line,
          generatedColumn: generated.column,
          originalLine: original != null && original.line,
          originalColumn: original != null && original.column,
          source,
          name: name50
        });
      };
      SourceMapGenerator2.prototype.setSourceContent = function SourceMapGenerator_setSourceContent(aSourceFile, aSourceContent) {
        var source = aSourceFile;
        if (this._sourceRoot != null) {
          source = util.relative(this._sourceRoot, source);
        }
        if (aSourceContent != null) {
          if (!this._sourcesContents) {
            this._sourcesContents = /* @__PURE__ */ Object.create(null);
          }
          this._sourcesContents[util.toSetString(source)] = aSourceContent;
        } else if (this._sourcesContents) {
          delete this._sourcesContents[util.toSetString(source)];
          if (Object.keys(this._sourcesContents).length === 0) {
            this._sourcesContents = null;
          }
        }
      };
      SourceMapGenerator2.prototype.applySourceMap = function SourceMapGenerator_applySourceMap(aSourceMapConsumer, aSourceFile, aSourceMapPath) {
        var sourceFile = aSourceFile;
        if (aSourceFile == null) {
          if (aSourceMapConsumer.file == null) {
            throw new Error(
              `SourceMapGenerator.prototype.applySourceMap requires either an explicit source file, or the source map's "file" property. Both were omitted.`
            );
          }
          sourceFile = aSourceMapConsumer.file;
        }
        var sourceRoot = this._sourceRoot;
        if (sourceRoot != null) {
          sourceFile = util.relative(sourceRoot, sourceFile);
        }
        var newSources = new ArraySet();
        var newNames = new ArraySet();
        this._mappings.unsortedForEach(function(mapping) {
          if (mapping.source === sourceFile && mapping.originalLine != null) {
            var original = aSourceMapConsumer.originalPositionFor({
              line: mapping.originalLine,
              column: mapping.originalColumn
            });
            if (original.source != null) {
              mapping.source = original.source;
              if (aSourceMapPath != null) {
                mapping.source = util.join(aSourceMapPath, mapping.source);
              }
              if (sourceRoot != null) {
                mapping.source = util.relative(sourceRoot, mapping.source);
              }
              mapping.originalLine = original.line;
              mapping.originalColumn = original.column;
              if (original.name != null) {
                mapping.name = original.name;
              }
            }
          }
          var source = mapping.source;
          if (source != null && !newSources.has(source)) {
            newSources.add(source);
          }
          var name50 = mapping.name;
          if (name50 != null && !newNames.has(name50)) {
            newNames.add(name50);
          }
        }, this);
        this._sources = newSources;
        this._names = newNames;
        aSourceMapConsumer.sources.forEach(function(sourceFile2) {
          var content = aSourceMapConsumer.sourceContentFor(sourceFile2);
          if (content != null) {
            if (aSourceMapPath != null) {
              sourceFile2 = util.join(aSourceMapPath, sourceFile2);
            }
            if (sourceRoot != null) {
              sourceFile2 = util.relative(sourceRoot, sourceFile2);
            }
            this.setSourceContent(sourceFile2, content);
          }
        }, this);
      };
      SourceMapGenerator2.prototype._validateMapping = function SourceMapGenerator_validateMapping(aGenerated, aOriginal, aSource, aName) {
        if (aOriginal && typeof aOriginal.line !== "number" && typeof aOriginal.column !== "number") {
          var message = "original.line and original.column are not numbers -- you probably meant to omit the original mapping entirely and only map the generated position. If so, pass null for the original mapping instead of an object with empty or null values.";
          if (this._ignoreInvalidMapping) {
            if (typeof console !== "undefined" && console.warn) {
              console.warn(message);
            }
            return false;
          } else {
            throw new Error(message);
          }
        }
        if (aGenerated && "line" in aGenerated && "column" in aGenerated && aGenerated.line > 0 && aGenerated.column >= 0 && !aOriginal && !aSource && !aName) {
          return;
        } else if (aGenerated && "line" in aGenerated && "column" in aGenerated && aOriginal && "line" in aOriginal && "column" in aOriginal && aGenerated.line > 0 && aGenerated.column >= 0 && aOriginal.line > 0 && aOriginal.column >= 0 && aSource) {
          return;
        } else {
          var message = "Invalid mapping: " + JSON.stringify({
            generated: aGenerated,
            source: aSource,
            original: aOriginal,
            name: aName
          });
          if (this._ignoreInvalidMapping) {
            if (typeof console !== "undefined" && console.warn) {
              console.warn(message);
            }
            return false;
          } else {
            throw new Error(message);
          }
        }
      };
      SourceMapGenerator2.prototype._serializeMappings = function SourceMapGenerator_serializeMappings() {
        var previousGeneratedColumn = 0;
        var previousGeneratedLine = 1;
        var previousOriginalColumn = 0;
        var previousOriginalLine = 0;
        var previousName = 0;
        var previousSource = 0;
        var result = "";
        var next;
        var mapping;
        var nameIdx;
        var sourceIdx;
        var mappings = this._mappings.toArray();
        for (var i = 0, len = mappings.length; i < len; i++) {
          mapping = mappings[i];
          next = "";
          if (mapping.generatedLine !== previousGeneratedLine) {
            previousGeneratedColumn = 0;
            while (mapping.generatedLine !== previousGeneratedLine) {
              next += ";";
              previousGeneratedLine++;
            }
          } else {
            if (i > 0) {
              if (!util.compareByGeneratedPositionsInflated(mapping, mappings[i - 1])) {
                continue;
              }
              next += ",";
            }
          }
          next += base64VLQ.encode(mapping.generatedColumn - previousGeneratedColumn);
          previousGeneratedColumn = mapping.generatedColumn;
          if (mapping.source != null) {
            sourceIdx = this._sources.indexOf(mapping.source);
            next += base64VLQ.encode(sourceIdx - previousSource);
            previousSource = sourceIdx;
            next += base64VLQ.encode(mapping.originalLine - 1 - previousOriginalLine);
            previousOriginalLine = mapping.originalLine - 1;
            next += base64VLQ.encode(mapping.originalColumn - previousOriginalColumn);
            previousOriginalColumn = mapping.originalColumn;
            if (mapping.name != null) {
              nameIdx = this._names.indexOf(mapping.name);
              next += base64VLQ.encode(nameIdx - previousName);
              previousName = nameIdx;
            }
          }
          result += next;
        }
        return result;
      };
      SourceMapGenerator2.prototype._generateSourcesContent = function SourceMapGenerator_generateSourcesContent(aSources, aSourceRoot) {
        return aSources.map(function(source) {
          if (!this._sourcesContents) {
            return null;
          }
          if (aSourceRoot != null) {
            source = util.relative(aSourceRoot, source);
          }
          var key = util.toSetString(source);
          return Object.prototype.hasOwnProperty.call(this._sourcesContents, key) ? this._sourcesContents[key] : null;
        }, this);
      };
      SourceMapGenerator2.prototype.toJSON = function SourceMapGenerator_toJSON() {
        var map = {
          version: this._version,
          sources: this._sources.toArray(),
          names: this._names.toArray(),
          mappings: this._serializeMappings()
        };
        if (this._file != null) {
          map.file = this._file;
        }
        if (this._sourceRoot != null) {
          map.sourceRoot = this._sourceRoot;
        }
        if (this._sourcesContents) {
          map.sourcesContent = this._generateSourcesContent(map.sources, map.sourceRoot);
        }
        return map;
      };
      SourceMapGenerator2.prototype.toString = function SourceMapGenerator_toString() {
        return JSON.stringify(this.toJSON());
      };
      exports.SourceMapGenerator = SourceMapGenerator2;
    }
  });

  // parser-entry.mjs
  var parser_entry_exports = {};
  __export(parser_entry_exports, {
    DRAFT_VERSION: () => DRAFT_VERSION2,
    POLICY_HEADERS: () => POLICY_HEADERS2,
    RULE_HEADERS: () => RULE_HEADERS2,
    assertArchiveCompatible: () => assertArchiveCompatible2,
    canonicalJson: () => canonicalJson2,
    compileRubricRows: () => compileRubricRows2,
    defaultPolicyGrid: () => defaultPolicyGrid2,
    defaultRuleGrid: () => defaultRuleGrid2,
    descriptor: () => descriptor2,
    engineSourceHash: () => engineSourceHash2,
    engineVersion: () => engineVersion2,
    freezeRubric: () => freezeRubric2,
    grade: () => grade,
    gradeConfigured: () => gradeConfigured2,
    gridToRecords: () => gridToRecords2,
    ruleCatalog: () => ruleCatalog2,
    validateDraftPolicies: () => validateDraftPolicies2,
    verifyFrozenRubric: () => verifyFrozenRubric2
  });

  // ../../engine-v2/node_modules/parse5/dist/common/unicode.js
  var UNDEFINED_CODE_POINTS = /* @__PURE__ */ new Set([
    65534,
    65535,
    131070,
    131071,
    196606,
    196607,
    262142,
    262143,
    327678,
    327679,
    393214,
    393215,
    458750,
    458751,
    524286,
    524287,
    589822,
    589823,
    655358,
    655359,
    720894,
    720895,
    786430,
    786431,
    851966,
    851967,
    917502,
    917503,
    983038,
    983039,
    1048574,
    1048575,
    1114110,
    1114111
  ]);
  var REPLACEMENT_CHARACTER = "�";
  var CODE_POINTS;
  (function(CODE_POINTS2) {
    CODE_POINTS2[CODE_POINTS2["EOF"] = -1] = "EOF";
    CODE_POINTS2[CODE_POINTS2["NULL"] = 0] = "NULL";
    CODE_POINTS2[CODE_POINTS2["TABULATION"] = 9] = "TABULATION";
    CODE_POINTS2[CODE_POINTS2["CARRIAGE_RETURN"] = 13] = "CARRIAGE_RETURN";
    CODE_POINTS2[CODE_POINTS2["LINE_FEED"] = 10] = "LINE_FEED";
    CODE_POINTS2[CODE_POINTS2["FORM_FEED"] = 12] = "FORM_FEED";
    CODE_POINTS2[CODE_POINTS2["SPACE"] = 32] = "SPACE";
    CODE_POINTS2[CODE_POINTS2["EXCLAMATION_MARK"] = 33] = "EXCLAMATION_MARK";
    CODE_POINTS2[CODE_POINTS2["QUOTATION_MARK"] = 34] = "QUOTATION_MARK";
    CODE_POINTS2[CODE_POINTS2["AMPERSAND"] = 38] = "AMPERSAND";
    CODE_POINTS2[CODE_POINTS2["APOSTROPHE"] = 39] = "APOSTROPHE";
    CODE_POINTS2[CODE_POINTS2["HYPHEN_MINUS"] = 45] = "HYPHEN_MINUS";
    CODE_POINTS2[CODE_POINTS2["SOLIDUS"] = 47] = "SOLIDUS";
    CODE_POINTS2[CODE_POINTS2["DIGIT_0"] = 48] = "DIGIT_0";
    CODE_POINTS2[CODE_POINTS2["DIGIT_9"] = 57] = "DIGIT_9";
    CODE_POINTS2[CODE_POINTS2["SEMICOLON"] = 59] = "SEMICOLON";
    CODE_POINTS2[CODE_POINTS2["LESS_THAN_SIGN"] = 60] = "LESS_THAN_SIGN";
    CODE_POINTS2[CODE_POINTS2["EQUALS_SIGN"] = 61] = "EQUALS_SIGN";
    CODE_POINTS2[CODE_POINTS2["GREATER_THAN_SIGN"] = 62] = "GREATER_THAN_SIGN";
    CODE_POINTS2[CODE_POINTS2["QUESTION_MARK"] = 63] = "QUESTION_MARK";
    CODE_POINTS2[CODE_POINTS2["LATIN_CAPITAL_A"] = 65] = "LATIN_CAPITAL_A";
    CODE_POINTS2[CODE_POINTS2["LATIN_CAPITAL_Z"] = 90] = "LATIN_CAPITAL_Z";
    CODE_POINTS2[CODE_POINTS2["RIGHT_SQUARE_BRACKET"] = 93] = "RIGHT_SQUARE_BRACKET";
    CODE_POINTS2[CODE_POINTS2["GRAVE_ACCENT"] = 96] = "GRAVE_ACCENT";
    CODE_POINTS2[CODE_POINTS2["LATIN_SMALL_A"] = 97] = "LATIN_SMALL_A";
    CODE_POINTS2[CODE_POINTS2["LATIN_SMALL_Z"] = 122] = "LATIN_SMALL_Z";
  })(CODE_POINTS || (CODE_POINTS = {}));
  var SEQUENCES = {
    DASH_DASH: "--",
    CDATA_START: "[CDATA[",
    DOCTYPE: "doctype",
    SCRIPT: "script",
    PUBLIC: "public",
    SYSTEM: "system"
  };
  function isSurrogate(cp) {
    return cp >= 55296 && cp <= 57343;
  }
  function isSurrogatePair(cp) {
    return cp >= 56320 && cp <= 57343;
  }
  function getSurrogatePairCodePoint(cp1, cp2) {
    return (cp1 - 55296) * 1024 + 9216 + cp2;
  }
  function isControlCodePoint(cp) {
    return cp !== 32 && cp !== 10 && cp !== 13 && cp !== 9 && cp !== 12 && cp >= 1 && cp <= 31 || cp >= 127 && cp <= 159;
  }
  function isUndefinedCodePoint(cp) {
    return cp >= 64976 && cp <= 65007 || UNDEFINED_CODE_POINTS.has(cp);
  }

  // ../../engine-v2/node_modules/parse5/dist/common/error-codes.js
  var ERR;
  (function(ERR2) {
    ERR2["controlCharacterInInputStream"] = "control-character-in-input-stream";
    ERR2["noncharacterInInputStream"] = "noncharacter-in-input-stream";
    ERR2["surrogateInInputStream"] = "surrogate-in-input-stream";
    ERR2["nonVoidHtmlElementStartTagWithTrailingSolidus"] = "non-void-html-element-start-tag-with-trailing-solidus";
    ERR2["endTagWithAttributes"] = "end-tag-with-attributes";
    ERR2["endTagWithTrailingSolidus"] = "end-tag-with-trailing-solidus";
    ERR2["unexpectedSolidusInTag"] = "unexpected-solidus-in-tag";
    ERR2["unexpectedNullCharacter"] = "unexpected-null-character";
    ERR2["unexpectedQuestionMarkInsteadOfTagName"] = "unexpected-question-mark-instead-of-tag-name";
    ERR2["invalidFirstCharacterOfTagName"] = "invalid-first-character-of-tag-name";
    ERR2["unexpectedEqualsSignBeforeAttributeName"] = "unexpected-equals-sign-before-attribute-name";
    ERR2["missingEndTagName"] = "missing-end-tag-name";
    ERR2["unexpectedCharacterInAttributeName"] = "unexpected-character-in-attribute-name";
    ERR2["unknownNamedCharacterReference"] = "unknown-named-character-reference";
    ERR2["missingSemicolonAfterCharacterReference"] = "missing-semicolon-after-character-reference";
    ERR2["unexpectedCharacterAfterDoctypeSystemIdentifier"] = "unexpected-character-after-doctype-system-identifier";
    ERR2["unexpectedCharacterInUnquotedAttributeValue"] = "unexpected-character-in-unquoted-attribute-value";
    ERR2["eofBeforeTagName"] = "eof-before-tag-name";
    ERR2["eofInTag"] = "eof-in-tag";
    ERR2["missingAttributeValue"] = "missing-attribute-value";
    ERR2["missingWhitespaceBetweenAttributes"] = "missing-whitespace-between-attributes";
    ERR2["missingWhitespaceAfterDoctypePublicKeyword"] = "missing-whitespace-after-doctype-public-keyword";
    ERR2["missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers"] = "missing-whitespace-between-doctype-public-and-system-identifiers";
    ERR2["missingWhitespaceAfterDoctypeSystemKeyword"] = "missing-whitespace-after-doctype-system-keyword";
    ERR2["missingQuoteBeforeDoctypePublicIdentifier"] = "missing-quote-before-doctype-public-identifier";
    ERR2["missingQuoteBeforeDoctypeSystemIdentifier"] = "missing-quote-before-doctype-system-identifier";
    ERR2["missingDoctypePublicIdentifier"] = "missing-doctype-public-identifier";
    ERR2["missingDoctypeSystemIdentifier"] = "missing-doctype-system-identifier";
    ERR2["abruptDoctypePublicIdentifier"] = "abrupt-doctype-public-identifier";
    ERR2["abruptDoctypeSystemIdentifier"] = "abrupt-doctype-system-identifier";
    ERR2["cdataInHtmlContent"] = "cdata-in-html-content";
    ERR2["incorrectlyOpenedComment"] = "incorrectly-opened-comment";
    ERR2["eofInScriptHtmlCommentLikeText"] = "eof-in-script-html-comment-like-text";
    ERR2["eofInDoctype"] = "eof-in-doctype";
    ERR2["nestedComment"] = "nested-comment";
    ERR2["abruptClosingOfEmptyComment"] = "abrupt-closing-of-empty-comment";
    ERR2["eofInComment"] = "eof-in-comment";
    ERR2["incorrectlyClosedComment"] = "incorrectly-closed-comment";
    ERR2["eofInCdata"] = "eof-in-cdata";
    ERR2["absenceOfDigitsInNumericCharacterReference"] = "absence-of-digits-in-numeric-character-reference";
    ERR2["nullCharacterReference"] = "null-character-reference";
    ERR2["surrogateCharacterReference"] = "surrogate-character-reference";
    ERR2["characterReferenceOutsideUnicodeRange"] = "character-reference-outside-unicode-range";
    ERR2["controlCharacterReference"] = "control-character-reference";
    ERR2["noncharacterCharacterReference"] = "noncharacter-character-reference";
    ERR2["missingWhitespaceBeforeDoctypeName"] = "missing-whitespace-before-doctype-name";
    ERR2["missingDoctypeName"] = "missing-doctype-name";
    ERR2["invalidCharacterSequenceAfterDoctypeName"] = "invalid-character-sequence-after-doctype-name";
    ERR2["duplicateAttribute"] = "duplicate-attribute";
    ERR2["nonConformingDoctype"] = "non-conforming-doctype";
    ERR2["missingDoctype"] = "missing-doctype";
    ERR2["misplacedDoctype"] = "misplaced-doctype";
    ERR2["endTagWithoutMatchingOpenElement"] = "end-tag-without-matching-open-element";
    ERR2["closingOfElementWithOpenChildElements"] = "closing-of-element-with-open-child-elements";
    ERR2["disallowedContentInNoscriptInHead"] = "disallowed-content-in-noscript-in-head";
    ERR2["openElementsLeftAfterEof"] = "open-elements-left-after-eof";
    ERR2["abandonedHeadElementChild"] = "abandoned-head-element-child";
    ERR2["misplacedStartTagForHeadElement"] = "misplaced-start-tag-for-head-element";
    ERR2["nestedNoscriptInHead"] = "nested-noscript-in-head";
    ERR2["eofInElementThatCanContainOnlyText"] = "eof-in-element-that-can-contain-only-text";
  })(ERR || (ERR = {}));

  // ../../engine-v2/node_modules/parse5/dist/tokenizer/preprocessor.js
  var DEFAULT_BUFFER_WATERLINE = 1 << 16;
  var Preprocessor = class {
    constructor(handler) {
      this.handler = handler;
      this.html = "";
      this.pos = -1;
      this.lastGapPos = -2;
      this.gapStack = [];
      this.skipNextNewLine = false;
      this.lastChunkWritten = false;
      this.endOfChunkHit = false;
      this.bufferWaterline = DEFAULT_BUFFER_WATERLINE;
      this.isEol = false;
      this.lineStartPos = 0;
      this.droppedBufferSize = 0;
      this.line = 1;
      this.lastErrOffset = -1;
    }
    /** The column on the current line. If we just saw a gap (eg. a surrogate pair), return the index before. */
    get col() {
      return this.pos - this.lineStartPos + Number(this.lastGapPos !== this.pos);
    }
    get offset() {
      return this.droppedBufferSize + this.pos;
    }
    getError(code2, cpOffset) {
      const { line, col, offset } = this;
      const startCol = col + cpOffset;
      const startOffset = offset + cpOffset;
      return {
        code: code2,
        startLine: line,
        endLine: line,
        startCol,
        endCol: startCol,
        startOffset,
        endOffset: startOffset
      };
    }
    _err(code2) {
      if (this.handler.onParseError && this.lastErrOffset !== this.offset) {
        this.lastErrOffset = this.offset;
        this.handler.onParseError(this.getError(code2, 0));
      }
    }
    _addGap() {
      this.gapStack.push(this.lastGapPos);
      this.lastGapPos = this.pos;
    }
    _processSurrogate(cp) {
      if (this.pos !== this.html.length - 1) {
        const nextCp = this.html.charCodeAt(this.pos + 1);
        if (isSurrogatePair(nextCp)) {
          this.pos++;
          this._addGap();
          return getSurrogatePairCodePoint(cp, nextCp);
        }
      } else if (!this.lastChunkWritten) {
        this.endOfChunkHit = true;
        return CODE_POINTS.EOF;
      }
      this._err(ERR.surrogateInInputStream);
      return cp;
    }
    willDropParsedChunk() {
      return this.pos > this.bufferWaterline;
    }
    dropParsedChunk() {
      if (this.willDropParsedChunk()) {
        this.html = this.html.substring(this.pos);
        this.lineStartPos -= this.pos;
        this.droppedBufferSize += this.pos;
        this.pos = 0;
        this.lastGapPos = -2;
        this.gapStack.length = 0;
      }
    }
    write(chunk, isLastChunk) {
      if (this.html.length > 0) {
        this.html += chunk;
      } else {
        this.html = chunk;
      }
      this.endOfChunkHit = false;
      this.lastChunkWritten = isLastChunk;
    }
    insertHtmlAtCurrentPos(chunk) {
      this.html = this.html.substring(0, this.pos + 1) + chunk + this.html.substring(this.pos + 1);
      this.endOfChunkHit = false;
    }
    startsWith(pattern, caseSensitive) {
      if (this.pos + pattern.length > this.html.length) {
        this.endOfChunkHit = !this.lastChunkWritten;
        return false;
      }
      if (caseSensitive) {
        return this.html.startsWith(pattern, this.pos);
      }
      for (let i = 0; i < pattern.length; i++) {
        const cp = this.html.charCodeAt(this.pos + i) | 32;
        if (cp !== pattern.charCodeAt(i)) {
          return false;
        }
      }
      return true;
    }
    peek(offset) {
      const pos = this.pos + offset;
      if (pos >= this.html.length) {
        this.endOfChunkHit = !this.lastChunkWritten;
        return CODE_POINTS.EOF;
      }
      const code2 = this.html.charCodeAt(pos);
      return code2 === CODE_POINTS.CARRIAGE_RETURN ? CODE_POINTS.LINE_FEED : code2;
    }
    advance() {
      this.pos++;
      if (this.isEol) {
        this.isEol = false;
        this.line++;
        this.lineStartPos = this.pos;
      }
      if (this.pos >= this.html.length) {
        this.endOfChunkHit = !this.lastChunkWritten;
        return CODE_POINTS.EOF;
      }
      let cp = this.html.charCodeAt(this.pos);
      if (cp === CODE_POINTS.CARRIAGE_RETURN) {
        this.isEol = true;
        this.skipNextNewLine = true;
        return CODE_POINTS.LINE_FEED;
      }
      if (cp === CODE_POINTS.LINE_FEED) {
        this.isEol = true;
        if (this.skipNextNewLine) {
          this.line--;
          this.skipNextNewLine = false;
          this._addGap();
          return this.advance();
        }
      }
      this.skipNextNewLine = false;
      if (isSurrogate(cp)) {
        cp = this._processSurrogate(cp);
      }
      const isCommonValidRange = this.handler.onParseError === null || cp > 31 && cp < 127 || cp === CODE_POINTS.LINE_FEED || cp === CODE_POINTS.CARRIAGE_RETURN || cp > 159 && cp < 64976;
      if (!isCommonValidRange) {
        this._checkForProblematicCharacters(cp);
      }
      return cp;
    }
    _checkForProblematicCharacters(cp) {
      if (isControlCodePoint(cp)) {
        this._err(ERR.controlCharacterInInputStream);
      } else if (isUndefinedCodePoint(cp)) {
        this._err(ERR.noncharacterInInputStream);
      }
    }
    retreat(count) {
      this.pos -= count;
      while (this.pos < this.lastGapPos) {
        this.lastGapPos = this.gapStack.pop();
        this.pos--;
      }
      this.isEol = false;
    }
  };

  // ../../engine-v2/node_modules/parse5/dist/common/token.js
  var token_exports = {};
  __export(token_exports, {
    TokenType: () => TokenType,
    getTokenAttr: () => getTokenAttr
  });
  var TokenType;
  (function(TokenType2) {
    TokenType2[TokenType2["CHARACTER"] = 0] = "CHARACTER";
    TokenType2[TokenType2["NULL_CHARACTER"] = 1] = "NULL_CHARACTER";
    TokenType2[TokenType2["WHITESPACE_CHARACTER"] = 2] = "WHITESPACE_CHARACTER";
    TokenType2[TokenType2["START_TAG"] = 3] = "START_TAG";
    TokenType2[TokenType2["END_TAG"] = 4] = "END_TAG";
    TokenType2[TokenType2["COMMENT"] = 5] = "COMMENT";
    TokenType2[TokenType2["DOCTYPE"] = 6] = "DOCTYPE";
    TokenType2[TokenType2["EOF"] = 7] = "EOF";
    TokenType2[TokenType2["HIBERNATION"] = 8] = "HIBERNATION";
  })(TokenType || (TokenType = {}));
  function getTokenAttr(token, attrName) {
    for (let i = token.attrs.length - 1; i >= 0; i--) {
      if (token.attrs[i].name === attrName) {
        return token.attrs[i].value;
      }
    }
    return null;
  }

  // ../../engine-v2/node_modules/entities/dist/decode-codepoint.js
  var c1 = [
    8364,
    0,
    8218,
    402,
    8222,
    8230,
    8224,
    8225,
    710,
    8240,
    352,
    8249,
    338,
    0,
    381,
    0,
    0,
    8216,
    8217,
    8220,
    8221,
    8226,
    8211,
    8212,
    732,
    8482,
    353,
    8250,
    339,
    0,
    382,
    376
  ];
  function isInvalidCodePoint(codePoint) {
    return codePoint === 0 || codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111;
  }
  function replaceCodePoint(codePoint) {
    if (isInvalidCodePoint(codePoint)) {
      return 65533;
    }
    if (codePoint >= 128 && codePoint <= 159) {
      return c1[codePoint - 128] || codePoint;
    }
    return codePoint;
  }
  function replaceCodePointXML(codePoint) {
    return isInvalidCodePoint(codePoint) ? 65533 : codePoint;
  }

  // ../../engine-v2/node_modules/entities/dist/internal/decode-shared.js
  var BASE91_INVERSE = /* @__PURE__ */ (() => {
    const table = new Uint8Array(127);
    let code2 = 0;
    for (let char = 33; char <= 126; char++) {
      if (char !== 34 && char !== 36 && char !== 92) {
        table[char] = code2++;
      }
    }
    return table;
  })();
  function decodeTrieDict(input, resultLength, atomCount, dict1AtomCount, ngramCount, dictSize) {
    const base = 91;
    const inputLength = input.length;
    const twoCharBias = dictSize * (base - 1);
    let pos = 0;
    const readSlotCode = () => {
      const c12 = BASE91_INVERSE[input.charCodeAt(pos++)];
      return c12 < dictSize ? c12 : c12 * base - twoCharBias + BASE91_INVERSE[input.charCodeAt(pos++)];
    };
    const dict2AtomCount = atomCount - dict1AtomCount;
    const slotCount = atomCount + ngramCount;
    const single = new Int32Array(slotCount);
    single.fill(-1, dict1AtomCount, dictSize);
    single.fill(-1, dictSize + dict2AtomCount, slotCount);
    const start = new Int32Array(slotCount);
    const length2 = new Int32Array(slotCount);
    function decodeDelta(count, off) {
      let previous = 0;
      let slot = off;
      const end = off + count;
      while (slot < end) {
        const code2 = BASE91_INVERSE[input.charCodeAt(pos++)];
        if (code2 < 89) {
          previous += code2;
          single[slot++] = previous;
        } else if (code2 === 89) {
          let runLength = BASE91_INVERSE[input.charCodeAt(pos++)] + 2;
          while (runLength--)
            single[slot++] = ++previous;
        } else {
          const next = BASE91_INVERSE[input.charCodeAt(pos++)];
          previous += 89 + // eslint-disable-next-line unicorn/prefer-minimal-ternary -- branches read a different number of side-effecting input bytes
          (next < 90 ? next * base + BASE91_INVERSE[input.charCodeAt(pos++)] : BASE91_INVERSE[input.charCodeAt(pos++)] * 8281 + BASE91_INVERSE[input.charCodeAt(pos++)] * base + BASE91_INVERSE[input.charCodeAt(pos++)]);
          single[slot++] = previous;
        }
      }
    }
    decodeDelta(dict1AtomCount, 0);
    decodeDelta(dict2AtomCount, dictSize);
    const references = new Int32Array(ngramCount * 2);
    let poolSize = 0;
    let ngramIndex = 0;
    function readNgramReferences(count, startSlot) {
      for (let index = 0; index < count; index++) {
        const slot = startSlot + index;
        const a = readSlotCode();
        const b = readSlotCode();
        references[ngramIndex * 2] = a;
        references[ngramIndex * 2 + 1] = b;
        ngramIndex += 1;
        start[slot] = poolSize;
        const entryLength = (single[a] < 0 ? length2[a] : 1) + (single[b] < 0 ? length2[b] : 1);
        length2[slot] = entryLength;
        poolSize += entryLength;
      }
    }
    readNgramReferences(ngramCount - dictSize + dict1AtomCount, dictSize + dict2AtomCount);
    readNgramReferences(dictSize - dict1AtomCount, dict1AtomCount);
    const pool = new Uint16Array(poolSize);
    let write = 0;
    for (let index = 0; index < ngramIndex; index++) {
      for (let half = 0; half < 2; half++) {
        const source = references[index * 2 + half];
        const value = single[source];
        if (value < 0) {
          let read = start[source];
          const readEnd = read + length2[source];
          while (read < readEnd)
            pool[write++] = pool[read++];
        } else {
          pool[write++] = value;
        }
      }
    }
    const out = new Uint16Array(resultLength);
    let outIndex = 0;
    while (pos < inputLength) {
      let slot = BASE91_INVERSE[input.charCodeAt(pos++)];
      if (slot >= dictSize) {
        slot = slot * base - twoCharBias + BASE91_INVERSE[input.charCodeAt(pos++)];
      }
      const value = single[slot];
      if (value < 0) {
        let read = start[slot];
        const readEnd = read + length2[slot];
        while (read < readEnd)
          out[outIndex++] = pool[read++];
      } else {
        out[outIndex++] = value;
      }
    }
    return out;
  }

  // ../../engine-v2/node_modules/entities/dist/generated/decode-data-html.js
  var htmlDecodeTree = /* @__PURE__ */ decodeTrieDict("!}.&u%}'&}*'~!6*)%&,~!J~!J~%L~y<~!R,~~%Lu~~#GD~~#|)1#%}^%}2%+#.##%##%}&%##%'#%##&%#%#'%#&#%#&#'#%%#&#%##%#)%''%&%#%#'%#%%#%%}%%%#%#&(23#%%#&-%0%('1#(##%#'##+%'*.:1}#%#6-+(%'%%#%%%}#L'2351&('%}&/N'(0(/*-%(%%}#'+&T%7.2}#&%&#%#36/5##%&%%#&#%%#))2%%##%&&'0~!#*+&'%1~!%).'3q?&%'1~!.##%6(~!+%%%(Gw'rT~!E#<nA%#jZ~!H%(~!42##~!*31&~!G%U~#)5~#`3~!J~!Z~%]~%Y~%C~!q~!u~#kz~%#~!6'~!D~!U~!?~#T~!c%~!G#'~%7|~!G~!J~!G&~#pb~(Df}#%}*&}#%##%##%##&#-}&'#'&%#.++}%mI,#,@&(}*%}*'%&##&#%##%}&0}#.},U},%}+%}&%}#%##&}B%(}(%}+%)})%##%#&}&%##%&}<%}>%#%&}*%}(%}9%}/%})%}*%}*%}?&}&%}3%}&*#%})%#%#)}#&#-#+*%E%%'%'#%}#*V##&##I}#&&##%&%#&&Qf%%))w/0+&%#(#.%-''''++++7}>%4'',##1,#%#&%##&#'##&#*#9)%&%}#*}%,#+P(%A&%#'&##wSD',9E00#y#@}(+}&%&>~!#~!X}#*}(&&}(&}(,%}%&#+&}#&}I%#%}%)#(},'%#*}4%%#%}(''}#/##(##),%-##%%)#&}(.}&%#&}%%}*&#%},&&}&%}#%*'#%})%}D&}&%}-&}6&#&}-,%}#%})-(~+`~,=?~I9'9%~!,#%})%})%}@%}?%}(~!?~#<~#pP~#BG~#=1#%K+~#?#~%;)~#A~#mF1~#A'~'X%'~#lR~#N~'N~#r~#m#-~#i'?%#'%~#B%##%,%#~#_%#0%~#]732~,w~2+#:&#%&'0%&>%}#>##F+)#%&&#(+_}4&}-%}(&}@&}O7Fdf0@+/v4}&WU##&/0#&'('B#%}.%}'+#%}#%%&#&%#%##+#&#)#6#'#.},%}c%},%#%##%&#&%#&~#>'*-.%##%##%}#%%}%'~#)D1}#%*&~#_%%'(~#S2%'.}#~#=##*'*-%}&'%'##&&~'E%.#&~#M4}%%##&'%#~#O1##%&#'+~#<B%##%%'%+~#;#@%}#&%#&&%#(~#H1}'%'##&&~#?A}&'~#D#%32}'&&&&~#[}'(#%}'~#;C})&}%%#%~#=&%,3}%'(#%%~#^'#&&)#%'~#Y%-~#d-%'~#^%%&#&&&}#~#b~2t*&'~&(~&@~0%~e~3}%*''0})&}+~!9##-}#%-hD*)1fC#%/&/fB#40~!+#)*4~!+~!K'&:~!/*7~!.#~!H~!L':~%x&~!H#~!*~%1~!I#~!+A~#p'~!F~~#-#~,,(~.Z~!V~%;'B'mq-W~!N~%I%#&&#&}#%},%%}'%}+X#%}#&}(%}'%}<%}#%}%%'}'%}:~![)9@~%>~#UA%-%##&~!C%~!-.9:~!1~!-^2/:a~!y,D*J#-5)/4~%23,~#G~!L1~!0X3`~!2+~!!0-~&E~!W~!o,>Y&]~%cZx_&~#O*9#A#'#+I'%#)~!0B*-5A+-((F&*M#)(-7-5+'-3a5Vi~!Y~!?+[)%3),ERHm~!+:D,VG.+)?fB%%*(%)'(#&80%1'8`K8?`+'Z#&O&'H5#*9)A%%5&3))0%39+.*7#()&&*=4@**L)<'_&*+..;(#*+)./&0#3)%')-8(4ixD(&.}%,('aI:,)%,k2231T)I'#/-W7,/'Q#.'Y24+h')37</31&83##&0#),H(?'&?/1##%#&&#%''-%&&&#(&''&#.-'%#%%(,')*'&#&#'##%(%(#%('#&##%%%%('%#%#%%#%#&%##h>w+v<ayvyvcg.uuhKr}g/v|g>u9i[~>g5uI~=RvdwEg;v/g;uk!!TTSx]@RT!U!#!@VBRUU!'UTe-d0c`e&gSdicedFcrdTaqb.kYcAohdYd@a3e+d}dMdtd.aJ#bqcK`dle/e.e'dwdPdodddjbEb}ogd^ofdpduc6j?l%d{drdqc)d7bacOdQ%T#Y)X.sR[yH>6Vyv3[xwLu>vo'!*.[yBacahoj>6Rew3[xqdZa#!a&#^(X-[yG>6Vyu3[xvg3sEr|g.u/Ri9db0T#^(Xa)!-[y;>6Vylg4wKs{JwNZt3@3r=c4Z([xlg;wKt!cpq's@v7A'*a(a+!-a#[y<3Dt?3Dt'>6Vym3[xmg9rxsNJwLZt4~?r?db1T#`-!(Xa,!0[yS>6Vz%NuQs.g4wKtnJwNZtS@3r>c4Z([y%g;wKtrdga8!a(!#&T*Y-Xa#!a0<or[yc3Dtq>6Vz43[y3JwNZtf@3s!Ju}!%Dti:pm3c_%X#tjB5pkd6q!r]u?voC'*-a.a2!0a&a+[yI3DtI3Ds~3DtH>6Vyw3[xx;:s#~<5pKJwNZtE@3r~d`a)!a2T#a.(!+U.X1[yT3Dt`3Dtv>6Vz&3[y&g9rxwzcxstPu.<rAJwLZtT~?r@dZa%!a.&^*Za(/Reu[ya>6Vz23[y1g3sEr}wkg{NuQRg{ci(U#5@b`~,cg#U(2WnH5wugcRh7dX#T(Y,a'Ta!!a,[yZ<]mj>6Vz,3[y+Pv#5ReZKu+=,%!H}7ABwkaS?Rh:BcW(X#<]mrj:ubv/ARekdg%!(!a.*Ta(Y.X1!#sP>Rl*Dt6[y>>6Vyo3Wf*jOvuumvuRgRJuq*!:9<B@bX~3jVv&v@s@5Re[d/rQt{uAvo&a&a*)a2!,0Wf!3Dt0=Bs'>6Re}3[xy~<5s%JwJZt1~Gs)c;&!#2sJkNuXvzq7rxu,Re8dka4!a8(aEZ+a@Y.X1Xa)[yd=Bs(3DtP>6Vz53[y4cX#X&Re:avRe9~<5s&JwJZtQ~Gs*i^rzvdRg+Jv{%!2sbB@bX}kdga,!Za?&^*T1/!a'Dt+[y6>6Vyf3Wf%g/u;s4hGu6?Rh-JvZ,!c%#&RoX54Rivj7uyvf8RgTKvZB%*!2sGh<vu5Rgq<=C::9bb~#dZ#T&Ta6Y.X*Dt>[y93Wf)coZ(T,6VyifluvRgC@95@B@bX~/hFu34cC#T,k/unq8w8Q5RkUklwQuzunq8w8Q5Rk8d/rJu?v8w9)-&!a0a;a&aIWejg3sEr/h1s<DtDJvyZqY5aws3Jvy!&Wei~Hr1:au5@Bag>23E~5c:Z&bX};kKv?w&unuVu5Rjc;>bs)#~@:Rh.=ay<a]C;b`}Vd6s/t{uAvoaxa()!a,a7%-a#a2Dt,[yF2Wo[>6Vyt3[xuNuPRi&NuPwpi#RoWh?vf8Ri%Jv]!%Ri:KvxD!.'2WeAjZu`q9rxu,Re7woeAg-unLq(qA_/*2Wg_g3u5q^9:4E}/jTrxrzv=Wkkd~0UX#^^Xa-a1a5T&a=U1a'*aEa]!a*aPaA-adok[y54Rn>;:p3~Dp5g9rpsFNvZqjg3uJp4~<5p0Pw;5qlJwNZt*@3p1Pw:5p/Ou!5p2JvG'!6Vye=<qnJvh_[xhg3v,Rh3kOwOw-sDuev/Re^dha[a%!%!a+#Ta7)-5TaCaO!aka!a)sf[yb2>Rl!9ARiq5E}Qg=ucRkBE|oJrJ_@Wk~@Wk{JrJ_@Wk|@WkyJrJ_@Wk}@WkzJvO_[y2g-vMRmiKuYC!)&>Ri;>Ri<@3RkNc](X#@9Rk=g5vuRmhKvDB!+'=]meg3u4Rmgd)#Y'Vz3CARmfd`a+!%T'!+#Ta1Ta6TaM-sTDt9[yA9sYd'%Y#s[[xpj:ueunaXRgEjRq,v-vuqdd2'`#6Rev<32@5>:2<E}5xIo9a*X#Y(;5RePJvD_g>vyRgNj8w)v8<wggs:RgXiZt|vjx,hSq3ah!-(~@:Ro/Ou!5RhWj^v(pyw8unRhUdx-UY#^Ua.a3a70!)%UX1TaDa)'omRiRRhE[y:3Dsz=Br,>6Vyj3[xkg6ruwjcqsrPw;5r*Ku]D'Zt-@3r(~?r.i[vwv]dU1a--U#`a4(g/vsRhPOu!5RhLj:rmu9Wo!~@:wdh@g/vsRiTjXuvvNr}:RhBj^v(pyw8unRn]dz1UYa'a+^Y(!aETZalaRY.Ta?a4[yDJw1!#qLsW>6Vyrfzq-pLflpwRe|Js>%!Dt@3Dt&Jvy_[xs~HrnjMuwpsw'RecKu+D#'!t<~Grl~?rjg5u-x,gwp{ah!-(~@:Rg~Ou!5Rh'jXuvvNr}:Rh#cW#X/c;&!#2sLi[v7u7RgpJv)(!iLrxu,Re6j7v@s@5Se[e7d`aW!Za(a`T.a#!a3!&aDa-!9)Dt_=6s+3[x~~DR|h~DS6avhGun5RkZj3w)v-]mkKunB!&*]kb97R|i<ARk<c:Z(6Vy}Juh'!wziMRoS:F|vkLuauJv5vtvQRh1d='T+Y#VyO~DR|jcF#T'7R|g97R|kJv3'!ay<Rj,Jvh&!:ReXcsa6*a+#a#_aIRf9aLRf?c,Z&Rf5Rf7c.Z&Rf;Rf>cQ#%T'p-Rf8Rf=ct#%'(*!,p,Rf4p+Rf6Rf:Rf<d~'Ua%U*^UYa(!a,-!#a4YaTalaEX0a8a<Weo3Dt/3Dsx=Br93Wen~Dr;~<5p<JwNZt2@3p=Pw:5p;Ou!5r3c7&!#:p>3Ds}KvGB)_6Vyk2sM=<r7x'eovA(!hFu1ARf}cV#X&@r5j6rvwQa^Rf3c=Za'wkghJv__g;unRggA53B9=b^}%j6uduo5Jq;!(hIv%2Re`Ou4ARe_e%a#^^^Xa&!a*a2!&a6YaP!*ad!#a:aE/5Rn?[y@>6Vyp;:pE~DrY~<5pBJwNZt8@3pCh=rt3rWPw:5pAJup_[xoNuPpF9c!#'45pD5ARn)d8#X'X*3@rU72s]h>v<<sSjJpqvewOJq/(!hNw'5ReBk0s2u3w/w'5ReE5@Jq.!a+JQ!&WeU23d(#Y&RjG5]jBk!u7w&u0udARjEe#+^^^Ub#!a2/a`Z(agT1!a-a;|@TaG!aS[yV=Re~fow'RguNuPRe?bz#'>RoUWeL>:Cbb|?JwPZtVg6ruRmzJvD'!6Vz(g/vmRh~Jvy_[y(g9voRgyx*cy(#2>Ri2B9b]~9kIw9u7rluJu3Rg]dI#a%UY'@=p%CAx.gQZ&RhwwygtRm{x5g_Z'+ABqR9Woa=Bp&dV#^*Xa'!&@o{g4v]Rk;Jv{!%Rk[wkkiA5RkiwwfUB=x,fUuqC&*!>RfTg8v0RfV~ARfSd;rJsAuAv9wR'ae+/aO!a@aza/a#[yQ@Wg!2Wemg3sEr0JvB_g>uvReWg2v+Re=KupB_+[y!2AbY~-~Hr2AJwD!(h<~El>h<~El?Kun@+_:9b`}Kg-v/Ri3g;vtwyk_9]k_d=&T#*U.6qh@Ab`|K9:H|CJv[!&3Dtex'fDwC%!Rf[9WlMd[(^X,!a%Z06Vz!@WgBg=v~Rgvg,QRe@awd,#Y+jTv|Q~EfWj]uNr|~FRfXdy#Y&^Ua%!aO.!(a)Ua;=!a@aKap!a-,a!Ta]a[rSa]p?[y82sK=Bq~;:p:~<5p8Pw:5p7d'#Y'Wf(;RnRi[u4w&RgJJvG'!6Vyh=<r#ijuuv/sIKuYD'ZtG@3p9~Gr&d2#`(g<vtRgFj`u5w&rqpxRf2CJuY!+:wfnTOu!5Rg}jNs1ucv&RfwJvA!&3@q|BDcC#T,k/unq8w8Q5RkTklwQuzunq8w8Q5Rk9dga#!a'!a=#a0!:+Tb*b@aO.a4!aba8aFJv^}?!VyR~Dr<g;u%Rn.~<5p[x'e`wNZtR@3p]Pw:5pZhNvjBp.woe_g5u-r4JwF!%DtO3:ooc7&!#:p^3DtpLuGw(!+%)Dtk6Vz#2sd=<r8d'#Y([y#<x3gJt`w@!)%}MRiowzikRij=]ilxAf3,U(#B2Rf#g0v-Rm[ck{`U#]giKv3>)!&6Ri154s,KuGB_%@r68r:dJ|t`#X(9<E|u2@H|rx3gJu?w'!+'1Nu7Reg4=H~+9<wxgY95Rm]xLggZ-`(X}U2:Ri4h<uOawRmsJv__5@bb{jbV~3dka#a'a]!,#a+U=a>b6a3b%!/aKa/)!arwve^VyJ;:pR~DpTg3uJpS~<5pOPw;5qmPw:5pNOu!5pQJvG'!6Vyx=<qoJvA!{~Jup!%@qk7Rn/KvyD!}''[xz;>wkh'?Rh,x8gyt`w5D!&),(SgyccRgztJ@3pPB5p#d'(Y#<]mmifubw&RgoJvE&!82s^JvF&!8Rf,ADb]~;x=h'rNu]vK!,%'*0RnORh)4Rh*AqQg-vaRnNg;wHwkh'ba~4cE#Ta*x3gctyw@'!+%RnFRnD<4Rn@hFvK5RnCxWg[#`&a0Ua()`1Rm75Rg[c]%X#qi8Rg^NvdRj>BwzgZauwji7Rm6A4wgg]d1#&(*,.0a#Rm;Rm<Rm=Rm>Rm?Rm@RmARmBe%#^^^Xaea?aC/b+(,!a+a#!a/!>a&Ta<aKbD!2wphBRnk[yPw}hE|.=Br-3Dtm>6Vy~g6urRf.x,hPrNav!%'RnqRo%Ro#Nu;q[Pw;5r+JwNZtM@3r)d'#Y'Weh;xChL#`&RnmRnoKu}>%(!Rne~Bs-;2wjcussJv+'!aYSO}6@B<5?ba~8LrNvj!.%*ROwungw~ng~:9;Ri^>wtnig;wHRnixDh@|(UZ.x1h@|)!#:2<H|*xHn]#-UX'3Ro)z=iT}6ARns=Bwsn_wpnaRncw]aR(#UXa&Ua*a/=]iPd'#Y&Ro'WnXf{QRm2hNvj]nZd`'T~&1`{|`#9b]{}c:'!#Wl{>@=be}]?cl{{U#:5Abb}Jds#^YaF!a*b4a#a3aPa>&Tb!bH!*a_!Eau?/a&RjY<]gj>6Vz*;:pe~DrZg,QRj1JwNZtX@wihspcJvZ&!VyX9WmOJu|!|N2WmHJvh&!]ht~Bpbcn&T(!#RmQ<s7Nu;padH#X'`+WmJ@>RmKCARhnKup=!)&Wf+:RhqNuPpf9c!#'45pd5AwghpARn(Ls@w!%,)!RmP@Wfe<E|IJva!&WmNg8vsRmLd`*.`#Y'Xa!axRn*]hrA8Rhug5s@rXg8u!RmMd8#X'X*3@rV72smdI*#UY&RmICARho~GsgxVgd)Ta'U-Y&Xa!T#RnEWnA@Wffg1uDRi0hFvK5RnBxGnG&#`%owp)@wsf+bX}Ze-*1!a*^^^Ua|!#a.aq&Ya2!a>.a6!a:aO`aJDtL[y`@Wg#>6Vz12@wzoYRoZNuPRi!NuPRhzg=ucRi,@=b`{Yg=ucRi-ACJvB!&Sh[ebSh]ebi`wUuFRm4Jw2_[y0JvB!.<Ju(!&SoG}6Shd}6<Ju(!&SoH}6She}6Kur@._g5vHRieJvx!{L2G{Kx6gd'T#?Rh82Wi5cZ#X(g1w)Rm5dW-Y(Ta#!a)!#aYa=wnfE=su2>>bU{0j9udv:<svj8uQv-7RgHdE%#^'sq9sp=>Bb_{TJv`!&g/r|snj6v(us5d,#Y(56H}[978H}]Jw5!&g1rushJvB!+j;v{u5?zDhd}6}bj;v{u5?zDhe}6}ce*#`(^^^a[aea!=!a6a*aoXb1a.!aAbL!b>,b'aL!aV@Wf|2Wlg3[y/JwNZt^@3piPw:5pgJunZou3@rsJva&!Vy_g<v~Rm#JvG'!6Vz0=<r{Ju{%!:pj@WfsiXuJu3Rm:JvZ&!WfA~Bph@c4Z&Dtwax5rubx(#:awRk1@d,#Y&RfjRfid1#,Y(@Wfp2Wlrg5s@ryKu[@!,'=]ig9wlk?Rk>g5u-rqJvy'!@9RkQcH(T#=>Ri~@<wkj(Wj(KuZB*!&<7rw@9RkRcH(T#=>Ri}@<wkj)Wj)dg(Ta2Xa9X#`-!a*CARhg@@=I}d9x;c~#X%so=<sj>2@@=aybb}XjWv0Q~EfEj3vLv;<d,#Y(56H}`978H}_dgaPaFa'a/!#a3Y0a_a;a|!1(a7-[yE3[xt;:pJNvZrrg3uJrvJwNZt=@3pIh=rt3rxPw:5pGOu!5rpJvG'!6Vys=<rz@c4Z&Dt(ax5rtJvZ!&~BpH@wsfNg-vaRlNci*U#=<wei<F}a5@Jq.!a*JQ!%@qZ23d(#Y&RjH5]jCk!u7w&u0udARjFd/prq=tyvpaEa(a:.!a1aZ(@@=I}:9wpd%=<sX55w_h}@@=I{t=ay<aU@@=I}T=ay<2@@=I})?C9:9au@9Cb]}DP~=x-fAZ(2Wl1=ay<aU@@=I}>5@d##Y+jTv|vV~EfFj]uNpn~FRfGdgaK!Z2&!a8a-Tb({E!acTbM*!a(DtY[yYd'%Y#sl[y*hHvh>Re5x2c{Z}.j4uCvcawRiMd+#X+_x&d!},<5RkX;2Hzw@x,gavfB-!{CcF&T#Roe;RodwWbBg5urRgaKvHC*_6Vz+<4opieuew&Rmq@d]&Y)X,T#X0Rh}<BqP=4qS9:ReMg/ujReNJw0!/<Jui%!bd{kawwnemRelAxUa?a3#*.&UX(Ya+a/RhvRnQ<o}9Wmtd-#Y&RgSRmw9;Rmxay=Rmyg-vaRmuxEhSrNu,v-voC!%(aR.a(a7+1Ro1>Ro5CE{A9b]{@;5x#eO{:g;urRi+KrNA!%(Ro3>Ro79;Ri_Ku@>{;&!x%gX|{KunA_+g5QRj/g3u5Rj#g>uERj%wio/xRhS&!,!#^1U}wba{8>>@=be}qC@:D5ba{7Ku+A&!}x?ba}t>>@=be}se(aA^^^Uat!b0#{pa+awUazbGa#aLb9bgaWac'a5TbS=Br!d1#`%scp_Jvl!#rT>Re0JvX&!VyN=H{Fcm#U&:pY=ReaJv2&!]h0=]nUJvG'!6Vy|=<r%JrM_=]h2@Wlud'#)U'Wf'b]{i=]h/Jvh!&~BpWg=v]RnMx+ny#'Nu;pVwjnu=]nwxJnx,T#`&Reqwjnt=]nvieu9vrRjLLuYwP(#+!th@wih5pX~Gr'g5v/Rh4KunA'!-CARnP@wwiN:Rm_9x'cvw>!|l=<saKvAA!0&3@q}>w^e1bp#&Re2Re3BDx7gH#T|f5H|eKuZ>!%(:qNAH{]Jv6!+3B2B9=b^{X<5<B92:E{ZLvhwA(a;a%!igQuyRmad+#Y}m@3Rh5d8#X'X*:AqUAHzmaxwbh<aXRnVcF}RT#Nw&cj#U(BWnug/vsRntdka)(a3+.Zb7aYYan1!bVa@Xa}[y^@b[{G=H{+hFu73Rj&Pv#5ReQcK%T#sig1v{Rj'Ku+D#'!t]~Grm~?rkKuMB!01d5#`'Vy.ta3Dtu~Hroc8#'{^45s85AwZbP&!#Rn!wghxWn#KvEA!)&2RlA2RlBx:h|#(T,=]j09Wobz>x]z/@awRoTd+#Y(az]hFhCrm4d,#Y+jTv|Q~EfMj]uNr|~FRfOdCa!Xa9_X#@<plJvf!%b`{(9;Rgwc;.!#2x7cw#T|UDb]|T5Ju={(!=@E{&Jv)&!Ab`{'awJvf!~*>>@=be{#KuY>!+&4Ezyi[ugv&RjIdea+T)#UXa&T-T&a!Rh9auRmW=]kLg5vuRn+g3u4Rn-Ow6ARn,hHus5xNk?#UX(U~)/g8v0RkD~AwkkF?Ri.OuNBwkkA?Ri/d|a2`a*^UYa.!aBTZaTa'Xa;!(!2!-a#b2[yC>6Vyq3[xr2Wi?g1rusVh%s?DtF~<5rbJs;%!DtBfswKtCj[uvuSsEu3RgVx3o:u+wN'*Zt;@3rd~Grh~?rfg8w)Lq)qE&-a%!>bI|`jWv0vV~EfCjTv|vV~Ef@j]uNpn~FRfBcK#T']gWNu7x,k7q4ai(0!hHv8<RhmkMu9vrsBuev/RhlCJvB!,g<v{wchh~@:Rhji[vrv{wchi~@:RhkdS&a5UY#Ta!RgPwwiI5BwciI~@:Rh`x'iJvj'!5]iJPu8Bwch]~@:Rhach)U#h3rp]gLh@t|Ax,hTq3ah!-(~@:Ro0Ou!5RhXj^v(pyw8unRhVd|)`,^UYas!a?/a2Z'a^Ta{Tb7Ta(a#!a,Wf&9sZ3DtAadamov=Bqt3[xig8vsRm~>waiL2b`{QJv*_Ouv2qgj<v]v2BqfdR'X*X#Y-@3qr~Gqv~?p6hHv-]glPup5Lq+q?_%*b_{qF{n9b^{rOu4ARhpKvCD!+&~Bqp:5Dbb}nwoiKl&unuTuBv]v+ueunaXRf0=Jvh!0nKufu8v1w&w7q%w&uHrz:Rgnj5w,uxDJq/(!hNw'5ReCk0s2u3w/w'5ReFd>Za&!*UaA=<wkgsRnSJv^!%Refifw3vyRgOKu_B'!,<]gkiiu:w&Rh<=C@a^<B57@2F{[<B5@aW:=3away9A5aW=<B=C@a^<B57@2F{Ie-#`(^^^bCara.b8aza6!/bZ,!adTbnTbOb+aFaS!aAT9@Wf~2Wli3Dtl2@d,#Y&RfnRfmJwJZtN~GqyJva&!VyMg<v~Rm%iXuJu3Rm9Jv[_=]ih9wlkDRkCd1#`(@Wg>2Wls3cH#T(@<Rj*=>Ri|b~'#23s9h<~El.d'#Y&Dtxi^rzvdRl#d*#U%(o|B2s`hJwSaxRmDKv4B&!1:Rmdd5#`'Vx}to~Hq{x'f1v3(!BA5ba|bJv_&!Wfug1v]ReIdO+U/Y#&G}-8wze=Rh{g1v]ReHg/uQRf/by#)ibQwERl/cH#T(@<Rj+=>Ri{cNu+vlax-!(#a0qa9<Rii2;;bU{H;x<i=&X#Rk`<4wwi=C9H~8xAI(Y#<azRi@45wXI<B9;5bb~7dL(X#Xa(+!aL6Vy{g5QqOau:5au2@ay547EzbxOcU(UX-T#Ta#:Cbb|A?wjh/b_|SOw6ARgtihr}u7Rhy<d1#T)X1@@=I|~=ay<2@@=aybb}Sj3vLv;<d,#Y(56H}A978H}@dGpvs@uAu`vcw9*!aFa+ai%(b!aXa8.a?a[ozWey=sU2@G}Nch&U#Rf_WexKu+D#'!t:~Gr`~?r^j]uNr|~FRg*j^psurwJt|RmcKv)@&!)7Rkv~Br[@wxfO:Rl3co#U'6Rezj_q#vIuavjRltwzeyh@vr5JqD0!>aY?C9:9au@9Cb]}9cl#U*5;5<H||jbuus1ucv&Rfvg1v~d/pppzqFr^a--a~!aMat1(hFv;Wiz@@=Izoj5uuv-7Rix~Cw`fk2WlVcZ#X,k)u3vWs@u2]ktg;wEx'fBq(_2Wg/jTv|vV~EfoJv]!15x'hzqG!(P~EfU~CRl_j6v(us5x4i-#T(2WmZ?C2F|d>Kq<aj1!*jTqIsBv=Wl`~Cw`fi2WlWj`v0u*~>RlR=c>Z,k#u3vWs@u2]kr<c1Z+jTqIsBv=Wla~Cw`fm2WlXdmb3!a{(arZa`bkTa%TbQTa-a9+c'!aM!/[yL=Bqug.w'RifhFvyDRj.g>vgwyk^9]k^Jv3_@WfbAARkhJw2_[x|JvB_wkoIRoKwkoJRoLd'(Y#<]gm=<9<H|yd'%_X#skDtb3awwqkgNulRkgdB#^',9:p'hJwSaxRmEBwVb8@4=H|qLu+w50&!)@3qs~?pU>Awwn;;Rn=c:Z'ARn<=<qwKvC@!/&~BqqJv6!&]eVb^z^xRge'/a%+^`#Sge}6<4Rn3=]n0Pw2>Rn8Jw0!&>Rn:>Rn6cY#a7+!a&=<wkaNw~h3z_c5Z{=wjh#=]nLKv^D!&)Vyz=bW|swYb<WetcG#T(2wxa@qVx@gD#Y&b^|V5JwG&!5bb|pg/w&RgD@x=kHs=uAvn!a%%/'+RmSRh694Ro`g-vaRmRhHv-]mlxCcS#`&ba~.5cD#Ta)P~=d,#Y(56H{>978H{Dd_#{2^Y%_+qbbb{6g3sERhsbU{?dfa.,`a(Xa<!aiX#(55RiG54RiHcI#T'WiU3RiVNvdwtfcRlKNvdd,#Y&RlHRlExQgf.1*^T'X#Sgf}6Wn4=]hfPrk>Rn7Jw0!&>Rn5>Rn9Lunw?&a2!,5<oq@@wqfdRlJj5Q~=d,#Y(~ARfcOuN]fdDKw;ay(}i!547E}j?cI#T(@5bV}iCbV}hdv(^^Tb?a40,b##Tbo!a*bR!a<b|a/!aKai!aU[yK=]o^g:v>ReGJwPZtK<7Rh+h<~El,Pv#5ReR@awwxjCg,ulRjDJv6&!]j!z?aQeeg>w=Sh<eeJw;!&axEzOg,Qosc!#*:wkeJ]eJ>x'h-u(!%Ro.w~h.zPdNZ(X,Ya![x{;9ReY;wkgxRiF:x?ap#Y&RmUg<s2Rkod]+UY0TZ'!a&A9sw<=bczLNvuw{gqzNhJwSaxRmCKuLay!#&s_Rf-55b^{uJvZa!!c%#(55Ri654wmiu5RiuawLu,vp!+}^%b_}Y9;wkgxba}o>A9:=b^}zKuh=a''!3awRk3c*'!#aHRk6c+Z&Rk5Rk4Jv)&!awRjSawd9*`#0?C2@EzMj8u<uJ5RmbjQrquJu3x,k>uq@_+=ayb^|W~ARkEOuN]k@7dhzV^X/X&a-#zRzSb`zXcJzTT#2WkVKvDBzW!%FzY9;5bbzWjQrquJu3Jw3%!b`zU=ayb^zQd:#X(T-a!6Vyywxh}=b]{Jg=u1RiAdGp~qHtzv!w(wA+a+a;<!aJaYai'anasb(=azRmV:Cbb{MLq2vb!%')RjuRjrRjtRjqx3jnqCw3!%')Rk(Rk+Rk&Rk)Lq2vb!%')Rj{RjxRjzRjwLq2vb!%')RjsRjpRjfRjex3jcqCw3!%')Rk'Rk*RjkRjl9<CbbzfOu4ARhxLq2vb!%')RjyRjvRjhRjgx=joq*uKvb!%')+-Rk.Rk%Rj~Rk-Rk#Rj}x=jdq*uKvb!%')+-Rk,Rk!Rj|RjmRjjRjidAq&qKs@uAv8Aa.'*-a@a&0!aM@a5[y73Dsy3Ds|3Dt):wxgI2sHJwJZt.~Gqxwsf0ikrzt}Rl0Jvy_[xj~HqzKv_A|D!&WfP8axRoVcf,U#k(v]v+ueunaXRf1Ju}'!g8u#Ri=jQw!sCunLprq>!,')~<5qeGzq9F{W=c##%s5au:5aU3CBE|;d4#X(D!a&6Vygx(b;#(=]ed?C2F{N<capoq2r[a&!aPa9,'Pw;5s:@@=I|,55w_h|@@=IzcP~=x'fCqB_2Wl2>aU@@=I|1OuNBc1Z+jTqIsBv=Wlc~Cw`fl2WlZ~AcTa%!Z+jTqIsBv=Wlb~Cw`fh2WlYk+uNqJsBv=WlSg,u3dca3#UXaMYa)TaB-=cM|7T#<bI}l5@B932:aV2G{BOuNBJq:|M!5Ezt=<B=C@a^<B57@2F{v>cB{/T#=ay<bI{3Jv6!a.6BKq0ah&+!5E}HP~Ef{978BaU@@=Iza<7d#.Y#978BaU@@=IzH~AJq0!(@@=IzG978BaU@@=IzFe,aU*Y&^^^bvJb,b:bFad!a,c2Ta>aL.bo6!a#CbTa'T#Re{2Wlh2@G{yg6t~Ro_NvdRfticuRQRllJv3&!x&c|zs@Jw3!%RflwpfkRlpKuL;%(!Re<@G|C2GzdhIvuBwgjAg-u0RjAKQB%!(GzZ@G|5NuuRl7d='T+Y#Vy[g<v~Rm!==G|>JvA!)@wma=]m1ifuaw&RmnLs@vT'!|/+[y,g:v>ReTJw1!#qX=x!eC{bLu+wT&)ZtZauq_~Graci&U#F|89:r_Lupvq!.)&2RlG8RfaC=x!eF{_h?rpWlmd&'!#X|&]k::xJey#`'T|+<E|&2@H|%dE#(^,g;u.RiEg6vjRiC9xCkA{O|zY#g=ucRmXKs0@!&*@G|m@awRknJuh!,3d(}gY}eJvj!%Rm):Jw3!%Rm+Rm-Ls0w(&!a(a#@b[|6cZ#X'7RkxWgAOu4ARn'dH'U#Y*Vz-Wm'CARm}d]*#a%^a*T'aK!a<9bV{PC=p*Jw4!&SgxcbB5r]idw(wBRmF7xFkt#&`(Rm/Rm8E|!JuY_9:Rl5=wrgr2:bbxd@xXfB(a*#T+!.X0X1Ta/a'T&RlDRfL>RlyARl9b[z[>RfZ:RlL:RfRwlg/ARl;9;RlxKv,A/!%7s69<74=BA5ba{-8Bde#`a<XaKYa1,a'P~=wxfB2bZ}}?C972@@=I}r8@55B9;5bb}G978B2@@=aybb}3j3vLv;<Jw3&!>Rfk=ayb^}4~Ad1#`*@@=aybb{w2@>==<bbz]dx+UY#^UaF!a9!bB'Ya1.!ajXa#%olRhD[y=3Dt#Ov5BrHKuMB%!(Rf^Wep~HrJwkiQjKr|~FRg)Ku+D#'!t5~GrF~?rDdV)UY,Z/_7RkuG{<~BrBg,rlsO:235B@bX}|d?a1!#`(6Vyn5@d##Y+jTv|vV~EfIj]uNpn~FRfH7Lq2vb1!a9-978BaU@@=Iz9978BbU}#~AJq0!(@@=Iz8978BaU@@=Iz7~AJQ|}!978BbU}!JvkaK!AdUa21-U#`a+(g/vsRn~Ou!5RPj:rmu9WhOjXuvvNr}:RhAj^v(pyw8unRn[kPr}p|u7vwv]RiSBd;pppzq@qHQa?(b.!a.a`@.|xa(hFv;Wiyj5uuv-7Riw~Cw`fg2WlU978BbU|wOuNBJqG!(P~EfD~CRlQcZ#X,k)u3vWs@u2]ksg;wEx'f@q1_2Wg.j]uNpn~FRfqJv]!15x'h{qG!(@@=IzK~CRl^j6v(us5x4i,#T(2WmY?C2F{1>Kq<aj1!*jTqIsBv=Wld~Cw`fj2Wl[j`v0u*~>RlT=c>Z,k#u3vWs@u2]kq<c1Z+jTqIsBv=Wle~Cw`fn2Wl]dn1#c(a(b^a2!b/bAT(bj!aDa7bu,a_a{c0!2T0g:v>ReD2@G{42@G{5~DpM~<5rc=Bx6i>{RT#RnI@zCx]y]z:2Jv[!zr5Awyk]9]k]dD(Y+X#6Vz.g=wKtgwhaCwgmTWj2Lu,w%_+/[y-B;b^xeg3u3Rj-2@bX{*KrJ<!+'@Wg(g?QRlC@Jv`!%b[zIwsfII}8JQ_@w|kW|=Jv(%!AqcOuNBJvEzh!bYzjLs@wP#(0!oy@>RkdJwMZtc3Dtd@BcG#T'9bWxg2@2Fznd*#Y+;2x'c}w<zizixNgwa#Z'U+!/!a'!a+w~g~z6wcn{Rn}wcnzRn|5Rh%=]nJg5vuRmvNvdRlvcprJu}w*az*a#!%.a.'Bot9qT]kj@Wg'ay2Gzv@Jv`!%b[zEwsfHI}1;ck#Ux`<Cbbx_Lu+w!a&0*!wko*wwo,So,}6Juqxf!E}PigQuyRm`d3(`#8>Rn%:A5B;bZ~%KvhCa!a2!x>k7#Uxb@b{#xaRk7Jw0!)>wwhlShl}6>wwhmShm}6CJvB!.x'hhvj{!!5Bwkhhbaz}x'hivjz~!5Bwkhibaz|xEhTrNu,v-vpD!a%&/)a3a.,%Ro2t[CE{)@3re9b]{%wjo09:rgc:Z&Ro6=<riifuaw&RmoKrNA!%(Ro4>Ro89;Ri`dSaL'UYzxZb)7Rka3xRhT&!,!#^1U}vbaz{>>@=be}yC@:D5bazzKu+A&!}{?ba}y>>@=be}wxBh[t`u~vJvr!%a!a()a,a0a4RoC=]o;Ju(!%RoGRhdwjh`=]oAg>w#Ro?g5vuRo=NvdRl|Ku]C.!&;RoEJvB!%RoORoMBx'h[v+_?w~h`}~5?w~hd~!xKh]oiptu-utv.vp!#%&a30a@a'a+(a/aOp(o~p!RoDJu(!%RoHRhewjha=]oBNvdRl}g>w#Ro@g5vuRo>c[#X']o<CauRoRAd-#Y':RkpauRoQKu]C.!&;RoFJvB!%RoNRoPBx'h]v+_?w~ha}t5?w~he}ue!/UbhYacXaW^Tc&a;b:a-c/#b&aja1(!cL+!bKbt!bmcRc9aIc?8[yW3Dtt94Rg`Jv}!&SiRMzBhEebShEMNuPRe>x7gL#TzuwjirRipc<Z&>on;>z=h-MSh.Mwqczx'a7vj&!>Re4@=ResJt__NuPRi*NuPRi)j]uNr|~FRfzKrJ>_+@Wfy@Wf]2WocKrJ<!+'@Wg%g/QRl@@Jv`!&awRl<wsfFIzgLu(w*!.*&ShBMwvhIRhI9;RhNx1hK'!#Sn]Mx1hK~0!#:2<H~7cNu+w7D*'1ZtW>Rn1~?rOc:Z&Rn2=<rQ<7wjh&=BSnLMc]#X(6Vz)w[b=a!U#9wzgMc3#&(RgMRitRis<x,gKt`ax!&+SioM=BSilMc3#&(RgKRinRimKurB,!&SiQMzBhDebShDM6BJQ!(P~Efx978B2@@=I}WLrJw!!,a*&@G}O@9wkibRid@@x'fKwC!&SlDMSfLMjUv~Q~EfKKv3@a+!(hFv-]mpx/hYZ(C5RiWz<o/MwkhY?So/M@x,gbvfB*&!SgEM:SoeeehFu3:Rgbda(,^TZa)X/7Sg[eb:2RgI~BrMC@wgkc:wwkcRerx3h(uUvK!&*,SnOM4Sh*MArRg;wHRh(x=h;rJvPwI!a4',a'0@Wg&=BSh/Mg>w=Rh=g3w*wwgGRgGcW(X#;Sg}M2Gzk@Jv`!&awRl=wsfGIz`dKZ*T'Y-:RhR7RhQg5u-p`j6v(us5d,#Y+~Awkia?RicOuNBwkibba}Ld6p~tyu_vbAa'a+!a/'a3aEa8a!>Sh,ebJv{!&Sh@ebSaReb9;SgwebNuPRi(NvdRl)NuPRi'hHu^<Rm^Jvv_@Wl(g;u1Si/ebKu'B&!*Sh?eb@Wl'z@aPeb95Si.ebcpputyvjB)!,&a+0a%ShAMWeK@G}C@WfJ9;RhMwvhH9w{ia}ix,hJvRA1(!zAn[MRhHx1hJ~*!#hFv(BSn[MBJQ!(@@=I~'978B2@@=I}2db.Ua<'X}+T#a0XaG2G}E;wkg|wuh!Rh!x,hZu,@)!&So0MVy)C5RiXACJvB!&5RiY5RiZg8w)cG}*T#2@bU}=KsA>(!a.3wkhZba~(x,h^u(A!&(SoCMRhb5Bz=h[eb?w~hb~6x,h_u(A!&(SoDMRhc5Bz=h]eb?w~hc~6e)aA1T#T,^^^c-bMb&blcPaP(a/!0!bA=b5c@a(!bfbrc#2afwmhARnjwchORnp2Wlf3DtsNvdRl-2@wpa<]m0bx(#:awRk2@Jw3!%RfhwpfgRlnKQB%!(G{V@G|'NuuRl6d='T+Y#VyUg<v~Rl~==G|<Jv+'!aYShC}6@B<5?ba~8@Jw3'!g2QRljhLrpWlOd+#Y'g.w'rIg>w*wgj@g-u0Rj@Lu+wT&)ZtUauq]~GrGci&U#F|39:rELrNvj!.%*RhCwunfw~nf~:9;Ri]>wtnhg;wHRnhx3hDs@v~!/+'@Wfr@9RkSNu&Rlo=@<5GzoKs0@_+@Wl+@awRkmJuh!-3d(}pY#qWJvj!%Rm(:Jw3!%Rm,Rm*de&!1U-U#`)Re;@G|.@9Ri82@wjfvRlq=@<5GzpLvOvr!).&2RlF8Rf`C=x!eE{.Jw3_g2QRlkhLrpWlPde(!#U{s,UXa*Ta'[y'g:v>ReS;x0PZ&RnlRnn~HrKJw1}f!=x!eB|2w]aP(#Xa&a*Ta.Ua2a7=]iOd'#Y&Ro&WnWg;u.RiDg6vjRiBNvdRlzhNvj]nYJuW_2Wm3x)kFze{9d])!a.!,Y01!#&aC!a3RndC=ox~BrC@2b^{pg,rlse7x'ksuq!%Rm.E{xidw(wBRmGx9o+)X#wwo-So-}69:Rl4@xSf@a#XZ'X)X,Ta(/ARl8b[xc>RfY:RlI:RfQwlg.ARl:9;Rlwdn'#^XafaQa1X1TaHTa)@b[{zcZ#X'7RkwWg@Ou4ARn&x)kG#{,g7u/RkGdH'U#Y*Vz'Wm&CARm|bx#(A]gUbUzJj9Q~=d,#Y(56H}l978H{U7d,0#U*2>ABb_xZ978BbU{e~AJQ{g!978BbU{hxMh?ad{oUYZ.x1h?{l!#:2<H{mx3n[t{vl!,&a%3Ro(z=iS}6ARnr=Bwsn^wvn`Rnbd`*T}B0!#^X'BG{c9b]{a>>@=be}F?JvS!&BG{d7BG}(Bde#`a1X,Ya@!a'P~=wxf@2bZ}I56B2@@=aybb}08@55B9;5bb}<j3vLv;<Jw3&!>Rfg=ayb^}&OuNBKuLA!)a!P~=x#fD{f2@>==<bbzl?C972@@=Ix^d6rSu,v7w*C(0a)a6#B+a%!sQ[y?3Dt%3[xn~<5rLOu!5p@Ku+D#'!t7~GrP~?rNKvlaya7'!h+v-5qMg=t|cd,U#5AAaa5Abb{S@52B5@a[@52B5Gx[iXueu;d<#`a(!/549C;ag>23ExY5@Dah89b^~689Jv)!~2b[~1Lv'w(%*!a#bX|aPrmawRe]keu7uhv-q6rxu,q`xTo]/a5aU!bNaDXbi!b-!ao!b<bwA!#5@B932:aV2G|:d-)Y#hJrL>RhG<7@C5<H|_=Cau:5aj5@B932:bJ|ng>vIbs)#?C2F|9jPv0w.vISh-MKvUaz(.!9ABbb|[5;5<H|Eg>unwfh;9:4E|YjQsBt|vjx'hYq3!(?C2F|J:2<BaY?C2F|GOu!5x,g|p{ah!-(?C2F|c9:4E|OjXuvvNr}:Rh&i[w*t|cd+U#jJvsu)vsSn~Mkfrmu9p}u7vwv]So!McW#Xa!ax5@A5aY:5;5<H|>kJv~vYrquJu3x4ib#T)2@SmZM?C2F|Bj:rmu9@xPhI(a*a#U#`a3-5Abb|L~@:RhK9:4E|0@52B5G|#C::aY?C2F|-:2<BaY?C2F|.5Jvk!a)javYrquJu3x4ia#T)2@SmYM?C2F|HAxPhH(!a#U#`a*-5Abb|4~@:RhJ9:4E|R@52B5G|F:2<BaY?C2F|Sc^#Xa2j=Qq5CJvB!-g<v{z;hhM?C2F|Zi[vrv{z;hiM?C2F|XKsA>!a)-g<v{z;h[eb?C2F|]i[vrv{z;h]eb?C2F|^iZu.vix,hZq3ah!.(?C2F|QOu!5ShXM:2<BaY?C2F|P", 13494, 2713, 49, 25, 61);

  // ../../engine-v2/node_modules/entities/dist/generated/decode-data-xml.js
  var xmlDecodeTree = /* @__PURE__ */ new Uint16Array([
    512,
    26465,
    29036,
    7,
    0,
    2,
    4,
    116,
    24638,
    116,
    24636,
    8693,
    29807,
    24610,
    621,
    1,
    0,
    0,
    3,
    112,
    24614,
    111,
    115,
    24615
  ]);

  // ../../engine-v2/node_modules/entities/dist/internal/bin-trie-flags.js
  var BinTrieFlags;
  (function(BinTrieFlags2) {
    BinTrieFlags2[BinTrieFlags2["VALUE_LENGTH"] = 49152] = "VALUE_LENGTH";
    BinTrieFlags2[BinTrieFlags2["FLAG13"] = 8192] = "FLAG13";
    BinTrieFlags2[BinTrieFlags2["BRANCH_LENGTH"] = 8064] = "BRANCH_LENGTH";
    BinTrieFlags2[BinTrieFlags2["JUMP_TABLE"] = 127] = "JUMP_TABLE";
    BinTrieFlags2[BinTrieFlags2["VALUE_MASK"] = 8191] = "VALUE_MASK";
  })(BinTrieFlags || (BinTrieFlags = {}));

  // ../../engine-v2/node_modules/entities/dist/decode.js
  var CharCodes;
  (function(CharCodes2) {
    CharCodes2[CharCodes2["AMP"] = 38] = "AMP";
    CharCodes2[CharCodes2["NUM"] = 35] = "NUM";
    CharCodes2[CharCodes2["SEMI"] = 59] = "SEMI";
    CharCodes2[CharCodes2["EQUALS"] = 61] = "EQUALS";
    CharCodes2[CharCodes2["ZERO"] = 48] = "ZERO";
    CharCodes2[CharCodes2["NINE"] = 57] = "NINE";
    CharCodes2[CharCodes2["LOWER_A"] = 97] = "LOWER_A";
    CharCodes2[CharCodes2["LOWER_X"] = 120] = "LOWER_X";
  })(CharCodes || (CharCodes = {}));
  var TO_LOWER_BIT = 32;
  function isNumber(code2) {
    return code2 - CharCodes.ZERO >>> 0 <= 9;
  }
  function isHexadecimalCharacter(code2) {
    return (code2 | TO_LOWER_BIT) - CharCodes.LOWER_A >>> 0 <= 5;
  }
  function isAlpha(code2) {
    return (code2 | TO_LOWER_BIT) - CharCodes.LOWER_A >>> 0 <= 25;
  }
  function isEntityInAttributeInvalidEnd(code2) {
    return code2 === CharCodes.EQUALS || isAlpha(code2) || isNumber(code2);
  }
  var EntityDecoderState;
  (function(EntityDecoderState2) {
    EntityDecoderState2[EntityDecoderState2["EntityStart"] = 0] = "EntityStart";
    EntityDecoderState2[EntityDecoderState2["NumericStart"] = 1] = "NumericStart";
    EntityDecoderState2[EntityDecoderState2["NumericDecimal"] = 2] = "NumericDecimal";
    EntityDecoderState2[EntityDecoderState2["NumericHex"] = 3] = "NumericHex";
    EntityDecoderState2[EntityDecoderState2["NamedEntity"] = 4] = "NamedEntity";
  })(EntityDecoderState || (EntityDecoderState = {}));
  var DecodingMode;
  (function(DecodingMode2) {
    DecodingMode2[DecodingMode2["Legacy"] = 0] = "Legacy";
    DecodingMode2[DecodingMode2["Strict"] = 1] = "Strict";
    DecodingMode2[DecodingMode2["Attribute"] = 2] = "Attribute";
  })(DecodingMode || (DecodingMode = {}));
  var EntityDecoder = class {
    constructor(decodeTree, emitCodePoint, errors) {
      __publicField(this, "decodeTree");
      __publicField(this, "emitCodePoint");
      __publicField(this, "errors");
      /** The current state of the decoder. */
      __publicField(this, "state", EntityDecoderState.EntityStart);
      /** Characters that were consumed while parsing an entity. */
      __publicField(this, "consumed", 1);
      /**
       * The result of the entity.
       *
       * For named entities: the trie index of the best legacy match so far
       * (0 = none). For numeric entities: the accumulated code point.
       */
      __publicField(this, "result", 0);
      /** The current index in the decode tree. */
      __publicField(this, "treeIndex", 0);
      /**
       * Characters consumed since the last recorded legacy match, plus one.
       * Invariant at the top of the `stateNamedEntity` loop: `excess` equals
       * the number of unrecorded consumed characters + 1.
       */
      // biome-ignore lint/correctness/noUnusedPrivateClassMembers: False positive (read via destructuring)
      __publicField(this, "excess", 1);
      /** The mode in which the decoder is operating. */
      __publicField(this, "decodeMode", DecodingMode.Strict);
      /** The number of characters that have been consumed in the current run. */
      // biome-ignore lint/correctness/noUnusedPrivateClassMembers: False positive
      __publicField(this, "runConsumed", 0);
      this.decodeTree = decodeTree;
      this.emitCodePoint = emitCodePoint;
      this.errors = errors;
    }
    /**
     * Resets the instance to make it reusable.
     * @param decodeMode Entity decoding mode to use.
     */
    startEntity(decodeMode) {
      this.decodeMode = decodeMode;
      this.state = EntityDecoderState.EntityStart;
      this.result = 0;
      this.treeIndex = 0;
      this.excess = 1;
      this.consumed = 1;
      this.runConsumed = 0;
    }
    /**
     * Write an entity to the decoder. This can be called multiple times with partial entities.
     * If the entity is incomplete, the decoder will return -1.
     *
     * Mirrors the non-streaming `decodeWithTrie`, but with the ability to stop decoding if the
     * entity is incomplete, and resume when the next string is written.
     * @param input The string containing the entity (or a continuation of the entity).
     * @param offset The offset at which the entity begins. Should be 0 if this is not the first call.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    write(input, offset) {
      switch (this.state) {
        case EntityDecoderState.EntityStart: {
          if (input.charCodeAt(offset) === CharCodes.NUM) {
            this.state = EntityDecoderState.NumericStart;
            this.consumed += 1;
            return this.stateNumericStart(input, offset + 1);
          }
          this.state = EntityDecoderState.NamedEntity;
          return this.stateNamedEntity(input, offset);
        }
        case EntityDecoderState.NumericStart: {
          return this.stateNumericStart(input, offset);
        }
        case EntityDecoderState.NumericDecimal: {
          return this.stateNumericDecimal(input, offset);
        }
        case EntityDecoderState.NumericHex: {
          return this.stateNumericHex(input, offset);
        }
        default: {
          return this.stateNamedEntity(input, offset);
        }
      }
    }
    /**
     * Switches between the numeric decimal and hexadecimal states.
     *
     * Equivalent to the `Numeric character reference state` in the HTML spec.
     * @param input The string containing the entity (or a continuation of the entity).
     * @param offset The current offset.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    // eslint-disable-next-line unicorn/consistent-class-member-order
    stateNumericStart(input, offset) {
      if (offset >= input.length) {
        return -1;
      }
      if ((input.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X) {
        this.state = EntityDecoderState.NumericHex;
        this.consumed += 1;
        return this.stateNumericHex(input, offset + 1);
      }
      this.state = EntityDecoderState.NumericDecimal;
      return this.stateNumericDecimal(input, offset);
    }
    /**
     * Parses a hexadecimal numeric entity.
     *
     * Equivalent to the `Hexademical character reference state` in the HTML
     * spec. Digit parsing matches the hex loop in `parseNumericEntity`.
     * The accumulated value is preserved for numeric validation callbacks.
     * @param input The string containing the entity (or a continuation of the entity).
     * @param offset The current offset.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    stateNumericHex(input, offset) {
      const inputLength = input.length;
      let { result } = this;
      let { consumed } = this;
      while (offset < inputLength) {
        const char = input.charCodeAt(offset);
        if (isNumber(char) || isHexadecimalCharacter(char)) {
          const digit = char <= CharCodes.NINE ? char - CharCodes.ZERO : (char | TO_LOWER_BIT) - CharCodes.LOWER_A + 10;
          result = result * 16 + digit;
          consumed += 1;
          offset += 1;
        } else {
          this.result = result;
          this.consumed = consumed;
          return this.emitNumericEntity(char, 3);
        }
      }
      this.result = result;
      this.consumed = consumed;
      return -1;
    }
    /**
     * Parses a decimal numeric entity.
     *
     * Equivalent to the `Decimal character reference state` in the HTML
     * spec. Digit parsing matches the decimal loop in `parseNumericEntity`.
     * The accumulated value is preserved for numeric validation callbacks.
     * @param input The string containing the entity (or a continuation of the entity).
     * @param offset The current offset.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    stateNumericDecimal(input, offset) {
      const inputLength = input.length;
      let { result } = this;
      let { consumed } = this;
      while (offset < inputLength) {
        const digit = input.charCodeAt(offset) - CharCodes.ZERO;
        if (digit >>> 0 > 9) {
          this.result = result;
          this.consumed = consumed;
          return this.emitNumericEntity(digit + CharCodes.ZERO, 2);
        }
        result = result * 10 + digit;
        consumed += 1;
        offset += 1;
      }
      this.result = result;
      this.consumed = consumed;
      return -1;
    }
    /**
     * Validate and emit a numeric entity.
     *
     * Implements the logic from the `Hexademical character reference start
     * state` and `Numeric character reference end state` in the HTML spec.
     * @param lastCp The last code point of the entity. Used to see if the
     *               entity was terminated with a semicolon.
     * @param expectedLength The minimum number of characters that should be
     *                       consumed. Used to validate that at least one digit
     *                       was consumed.
     * @returns The number of characters that were consumed.
     */
    emitNumericEntity(lastCp, expectedLength) {
      var _a;
      if (this.consumed <= expectedLength) {
        (_a = this.errors) == null ? void 0 : _a.absenceOfDigitsInNumericCharacterReference(this.consumed);
        return 0;
      }
      if (lastCp === CharCodes.SEMI) {
        this.consumed += 1;
      } else if (this.decodeMode === DecodingMode.Strict) {
        return 0;
      }
      this.emitCodePoint((this.decodeTree === xmlDecodeTree ? replaceCodePointXML : replaceCodePoint)(this.result), this.consumed);
      if (this.errors) {
        if (lastCp !== CharCodes.SEMI) {
          this.errors.missingSemicolonAfterCharacterReference();
        }
        this.errors.validateNumericCharacterReference(this.result);
      }
      return this.consumed;
    }
    /**
     * Flush locally-tracked walk state back to the fields, then emit the
     * recorded legacy match or reject (cold path — at most once per
     * entity). Called after failed navigation (leaf node, branch miss, or
     * compact-run mismatch). In attribute mode, reject if no legacy was
     * recorded at the current node, if we descended past it, or if the
     * pending input character is an invalid attribute terminator.
     * @param consumed Locally-tracked consumed count.
     * @param excess Locally-tracked excess count.
     * @param char Pending input character (may be the mismatching char).
     * @param valueLength Value length at the current trie node.
     */
    flushAndEmitLegacyOrReject(consumed, excess, char, valueLength) {
      this.consumed = consumed;
      this.excess = excess;
      return this.result === 0 || this.decodeMode === DecodingMode.Attribute && (valueLength === 0 || excess > 1 || isEntityInAttributeInvalidEnd(char)) ? 0 : this.emitNotTerminatedNamedEntity();
    }
    /**
     * Parses a named entity.
     *
     * Equivalent to the `Named character reference state` in the HTML spec.
     * @param input The string containing the entity (or a continuation of the entity).
     * @param offset The current offset.
     * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
     */
    stateNamedEntity(input, offset) {
      const { decodeTree } = this;
      const inputLength = input.length;
      const isStrict = this.decodeMode === DecodingMode.Strict;
      let { treeIndex } = this;
      let { excess } = this;
      let { consumed } = this;
      let current = decodeTree[treeIndex];
      while (offset < inputLength) {
        while ((current & (BinTrieFlags.VALUE_LENGTH | BinTrieFlags.FLAG13)) === 0 && (current & BinTrieFlags.JUMP_TABLE) !== 0) {
          const char2 = input.charCodeAt(offset);
          const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
          const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
          if (branchCount === 0) {
            if (char2 !== jumpOffset) {
              return this.flushAndEmitLegacyOrReject(consumed, excess, char2, 0);
            }
            treeIndex += 1;
          } else {
            const slot = char2 - jumpOffset;
            if (slot >>> 0 >= branchCount) {
              return this.flushAndEmitLegacyOrReject(consumed, excess, char2, 0);
            }
            const stored = decodeTree[treeIndex + 1 + slot];
            if (stored === 0) {
              return this.flushAndEmitLegacyOrReject(consumed, excess, char2, 0);
            }
            treeIndex = treeIndex + branchCount + stored & 65535;
          }
          current = decodeTree[treeIndex];
          offset += 1;
          excess += 1;
          if (offset >= inputLength)
            break;
        }
        if (offset >= inputLength)
          break;
        if ((current & (BinTrieFlags.VALUE_LENGTH | BinTrieFlags.FLAG13)) === BinTrieFlags.FLAG13) {
          const runLength = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
          let { runConsumed } = this;
          if (runConsumed === 0) {
            const char2 = input.charCodeAt(offset);
            if (char2 !== (current & BinTrieFlags.JUMP_TABLE)) {
              return this.flushAndEmitLegacyOrReject(consumed, excess, char2, 0);
            }
            offset += 1;
            excess += 1;
            runConsumed = 1;
          }
          while (runConsumed < runLength) {
            if (offset >= inputLength) {
              this.treeIndex = treeIndex;
              this.excess = excess;
              this.consumed = consumed;
              this.runConsumed = runConsumed;
              return -1;
            }
            const charIndexInPacked = runConsumed - 1;
            const packedWord = decodeTree[treeIndex + 1 + (charIndexInPacked >> 1)];
            const expectedChar = packedWord >> ((charIndexInPacked & 1) << 3) & 255;
            const char2 = input.charCodeAt(offset);
            if (char2 !== expectedChar) {
              this.runConsumed = 0;
              return this.flushAndEmitLegacyOrReject(consumed, excess, char2, 0);
            }
            offset += 1;
            excess += 1;
            runConsumed += 1;
          }
          this.runConsumed = 0;
          treeIndex += 1 + (runLength >> 1);
          current = decodeTree[treeIndex];
          continue;
        }
        const valueLength = current >>> 14;
        const char = input.charCodeAt(offset);
        if (valueLength !== 0) {
          if (!isStrict && (current & BinTrieFlags.FLAG13) === 0) {
            this.result = treeIndex;
            consumed += excess - 1;
            excess = 1;
          }
          if (char === CharCodes.SEMI) {
            return this.emitNamedEntityData(treeIndex, valueLength, consumed + excess);
          }
          if (valueLength === 1) {
            return this.flushAndEmitLegacyOrReject(consumed, excess, char, valueLength);
          }
        }
        const next = determineBranch(decodeTree, current, treeIndex + (valueLength || 1), char);
        if (next < 0) {
          return this.flushAndEmitLegacyOrReject(consumed, excess, char, valueLength);
        }
        treeIndex = next;
        current = decodeTree[treeIndex];
        offset += 1;
        excess += 1;
      }
      if (!isStrict && current >>> 14 !== 0 && (current & BinTrieFlags.FLAG13) === 0) {
        this.result = treeIndex;
        consumed += excess - 1;
        excess = 1;
      }
      this.treeIndex = treeIndex;
      this.excess = excess;
      this.consumed = consumed;
      return -1;
    }
    /**
     * Emit a named entity that was not terminated with a semicolon.
     * @returns The number of characters consumed.
     */
    emitNotTerminatedNamedEntity() {
      var _a;
      const { result, decodeTree } = this;
      const valueLength = decodeTree[result] >>> 14;
      this.emitNamedEntityData(result, valueLength, this.consumed);
      (_a = this.errors) == null ? void 0 : _a.missingSemicolonAfterCharacterReference();
      return this.consumed;
    }
    /**
     * Emit a named entity.
     * @param result The index of the entity in the decode tree.
     * @param valueLength Encoded value length (header plus any value words).
     * @param consumed The number of characters consumed.
     * @returns The number of characters consumed.
     */
    emitNamedEntityData(result, valueLength, consumed) {
      const { decodeTree } = this;
      this.emitCodePoint(valueLength === 1 ? decodeTree[result] & BinTrieFlags.VALUE_MASK : decodeTree[result + 1], consumed);
      if (valueLength === 3) {
        this.emitCodePoint(decodeTree[result + 2], consumed);
      }
      return consumed;
    }
    /**
     * Signal to the parser that the end of the input was reached.
     *
     * Remaining data will be emitted and relevant errors will be produced.
     * @returns The number of characters consumed.
     */
    end() {
      var _a;
      switch (this.state) {
        case EntityDecoderState.NamedEntity: {
          return this.result !== 0 && (this.decodeMode !== DecodingMode.Attribute || this.result === this.treeIndex) ? this.emitNotTerminatedNamedEntity() : 0;
        }
        // Otherwise, emit a numeric entity if we have one.
        case EntityDecoderState.NumericDecimal: {
          return this.emitNumericEntity(0, 2);
        }
        case EntityDecoderState.NumericHex: {
          return this.emitNumericEntity(0, 3);
        }
        case EntityDecoderState.NumericStart: {
          (_a = this.errors) == null ? void 0 : _a.absenceOfDigitsInNumericCharacterReference(this.consumed);
          return 0;
        }
        default: {
          return 0;
        }
      }
    }
  };
  function determineBranch(decodeTree, current, nodeIndex, char) {
    const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
    const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
    if (jumpOffset) {
      if (branchCount === 0) {
        return char === jumpOffset ? nodeIndex : -1;
      }
      const slot = char - jumpOffset;
      if (slot >>> 0 >= branchCount)
        return -1;
      const stored = decodeTree[nodeIndex + slot];
      return stored === 0 ? -1 : nodeIndex + branchCount + stored - 1 & 65535;
    }
    if (branchCount === 0)
      return -1;
    const packedKeySlots = branchCount + 1 >> 1;
    const branchEnd = nodeIndex + packedKeySlots + branchCount;
    for (let index = 0; index < branchCount; index++) {
      const packed = decodeTree[nodeIndex + (index >> 1)];
      const key = packed >> ((index & 1) << 3) & 255;
      if (key === char) {
        const pointerIndex = nodeIndex + packedKeySlots + index;
        return branchEnd + decodeTree[pointerIndex] & 65535;
      }
      if (key > char)
        return -1;
    }
    return -1;
  }

  // ../../engine-v2/node_modules/parse5/dist/common/html.js
  var html_exports = {};
  __export(html_exports, {
    ATTRS: () => ATTRS,
    DOCUMENT_MODE: () => DOCUMENT_MODE,
    NS: () => NS,
    NUMBERED_HEADERS: () => NUMBERED_HEADERS,
    SPECIAL_ELEMENTS: () => SPECIAL_ELEMENTS,
    TAG_ID: () => TAG_ID,
    TAG_NAMES: () => TAG_NAMES,
    getTagID: () => getTagID,
    hasUnescapedText: () => hasUnescapedText
  });
  var NS;
  (function(NS2) {
    NS2["HTML"] = "http://www.w3.org/1999/xhtml";
    NS2["MATHML"] = "http://www.w3.org/1998/Math/MathML";
    NS2["SVG"] = "http://www.w3.org/2000/svg";
    NS2["XLINK"] = "http://www.w3.org/1999/xlink";
    NS2["XML"] = "http://www.w3.org/XML/1998/namespace";
    NS2["XMLNS"] = "http://www.w3.org/2000/xmlns/";
  })(NS || (NS = {}));
  var ATTRS;
  (function(ATTRS2) {
    ATTRS2["TYPE"] = "type";
    ATTRS2["ACTION"] = "action";
    ATTRS2["ENCODING"] = "encoding";
    ATTRS2["PROMPT"] = "prompt";
    ATTRS2["NAME"] = "name";
    ATTRS2["COLOR"] = "color";
    ATTRS2["FACE"] = "face";
    ATTRS2["SIZE"] = "size";
  })(ATTRS || (ATTRS = {}));
  var DOCUMENT_MODE;
  (function(DOCUMENT_MODE2) {
    DOCUMENT_MODE2["NO_QUIRKS"] = "no-quirks";
    DOCUMENT_MODE2["QUIRKS"] = "quirks";
    DOCUMENT_MODE2["LIMITED_QUIRKS"] = "limited-quirks";
  })(DOCUMENT_MODE || (DOCUMENT_MODE = {}));
  var TAG_NAMES;
  (function(TAG_NAMES2) {
    TAG_NAMES2["A"] = "a";
    TAG_NAMES2["ADDRESS"] = "address";
    TAG_NAMES2["ANNOTATION_XML"] = "annotation-xml";
    TAG_NAMES2["APPLET"] = "applet";
    TAG_NAMES2["AREA"] = "area";
    TAG_NAMES2["ARTICLE"] = "article";
    TAG_NAMES2["ASIDE"] = "aside";
    TAG_NAMES2["B"] = "b";
    TAG_NAMES2["BASE"] = "base";
    TAG_NAMES2["BASEFONT"] = "basefont";
    TAG_NAMES2["BGSOUND"] = "bgsound";
    TAG_NAMES2["BIG"] = "big";
    TAG_NAMES2["BLOCKQUOTE"] = "blockquote";
    TAG_NAMES2["BODY"] = "body";
    TAG_NAMES2["BR"] = "br";
    TAG_NAMES2["BUTTON"] = "button";
    TAG_NAMES2["CAPTION"] = "caption";
    TAG_NAMES2["CENTER"] = "center";
    TAG_NAMES2["CODE"] = "code";
    TAG_NAMES2["COL"] = "col";
    TAG_NAMES2["COLGROUP"] = "colgroup";
    TAG_NAMES2["DD"] = "dd";
    TAG_NAMES2["DESC"] = "desc";
    TAG_NAMES2["DETAILS"] = "details";
    TAG_NAMES2["DIALOG"] = "dialog";
    TAG_NAMES2["DIR"] = "dir";
    TAG_NAMES2["DIV"] = "div";
    TAG_NAMES2["DL"] = "dl";
    TAG_NAMES2["DT"] = "dt";
    TAG_NAMES2["EM"] = "em";
    TAG_NAMES2["EMBED"] = "embed";
    TAG_NAMES2["FIELDSET"] = "fieldset";
    TAG_NAMES2["FIGCAPTION"] = "figcaption";
    TAG_NAMES2["FIGURE"] = "figure";
    TAG_NAMES2["FONT"] = "font";
    TAG_NAMES2["FOOTER"] = "footer";
    TAG_NAMES2["FOREIGN_OBJECT"] = "foreignObject";
    TAG_NAMES2["FORM"] = "form";
    TAG_NAMES2["FRAME"] = "frame";
    TAG_NAMES2["FRAMESET"] = "frameset";
    TAG_NAMES2["H1"] = "h1";
    TAG_NAMES2["H2"] = "h2";
    TAG_NAMES2["H3"] = "h3";
    TAG_NAMES2["H4"] = "h4";
    TAG_NAMES2["H5"] = "h5";
    TAG_NAMES2["H6"] = "h6";
    TAG_NAMES2["HEAD"] = "head";
    TAG_NAMES2["HEADER"] = "header";
    TAG_NAMES2["HGROUP"] = "hgroup";
    TAG_NAMES2["HR"] = "hr";
    TAG_NAMES2["HTML"] = "html";
    TAG_NAMES2["I"] = "i";
    TAG_NAMES2["IMG"] = "img";
    TAG_NAMES2["IMAGE"] = "image";
    TAG_NAMES2["INPUT"] = "input";
    TAG_NAMES2["IFRAME"] = "iframe";
    TAG_NAMES2["KEYGEN"] = "keygen";
    TAG_NAMES2["LABEL"] = "label";
    TAG_NAMES2["LI"] = "li";
    TAG_NAMES2["LINK"] = "link";
    TAG_NAMES2["LISTING"] = "listing";
    TAG_NAMES2["MAIN"] = "main";
    TAG_NAMES2["MALIGNMARK"] = "malignmark";
    TAG_NAMES2["MARQUEE"] = "marquee";
    TAG_NAMES2["MATH"] = "math";
    TAG_NAMES2["MENU"] = "menu";
    TAG_NAMES2["META"] = "meta";
    TAG_NAMES2["MGLYPH"] = "mglyph";
    TAG_NAMES2["MI"] = "mi";
    TAG_NAMES2["MO"] = "mo";
    TAG_NAMES2["MN"] = "mn";
    TAG_NAMES2["MS"] = "ms";
    TAG_NAMES2["MTEXT"] = "mtext";
    TAG_NAMES2["NAV"] = "nav";
    TAG_NAMES2["NOBR"] = "nobr";
    TAG_NAMES2["NOFRAMES"] = "noframes";
    TAG_NAMES2["NOEMBED"] = "noembed";
    TAG_NAMES2["NOSCRIPT"] = "noscript";
    TAG_NAMES2["OBJECT"] = "object";
    TAG_NAMES2["OL"] = "ol";
    TAG_NAMES2["OPTGROUP"] = "optgroup";
    TAG_NAMES2["OPTION"] = "option";
    TAG_NAMES2["P"] = "p";
    TAG_NAMES2["PARAM"] = "param";
    TAG_NAMES2["PLAINTEXT"] = "plaintext";
    TAG_NAMES2["PRE"] = "pre";
    TAG_NAMES2["RB"] = "rb";
    TAG_NAMES2["RP"] = "rp";
    TAG_NAMES2["RT"] = "rt";
    TAG_NAMES2["RTC"] = "rtc";
    TAG_NAMES2["RUBY"] = "ruby";
    TAG_NAMES2["S"] = "s";
    TAG_NAMES2["SCRIPT"] = "script";
    TAG_NAMES2["SEARCH"] = "search";
    TAG_NAMES2["SECTION"] = "section";
    TAG_NAMES2["SELECT"] = "select";
    TAG_NAMES2["SOURCE"] = "source";
    TAG_NAMES2["SMALL"] = "small";
    TAG_NAMES2["SPAN"] = "span";
    TAG_NAMES2["STRIKE"] = "strike";
    TAG_NAMES2["STRONG"] = "strong";
    TAG_NAMES2["STYLE"] = "style";
    TAG_NAMES2["SUB"] = "sub";
    TAG_NAMES2["SUMMARY"] = "summary";
    TAG_NAMES2["SUP"] = "sup";
    TAG_NAMES2["TABLE"] = "table";
    TAG_NAMES2["TBODY"] = "tbody";
    TAG_NAMES2["TEMPLATE"] = "template";
    TAG_NAMES2["TEXTAREA"] = "textarea";
    TAG_NAMES2["TFOOT"] = "tfoot";
    TAG_NAMES2["TD"] = "td";
    TAG_NAMES2["TH"] = "th";
    TAG_NAMES2["THEAD"] = "thead";
    TAG_NAMES2["TITLE"] = "title";
    TAG_NAMES2["TR"] = "tr";
    TAG_NAMES2["TRACK"] = "track";
    TAG_NAMES2["TT"] = "tt";
    TAG_NAMES2["U"] = "u";
    TAG_NAMES2["UL"] = "ul";
    TAG_NAMES2["SVG"] = "svg";
    TAG_NAMES2["VAR"] = "var";
    TAG_NAMES2["WBR"] = "wbr";
    TAG_NAMES2["XMP"] = "xmp";
  })(TAG_NAMES || (TAG_NAMES = {}));
  var TAG_ID;
  (function(TAG_ID2) {
    TAG_ID2[TAG_ID2["UNKNOWN"] = 0] = "UNKNOWN";
    TAG_ID2[TAG_ID2["A"] = 1] = "A";
    TAG_ID2[TAG_ID2["ADDRESS"] = 2] = "ADDRESS";
    TAG_ID2[TAG_ID2["ANNOTATION_XML"] = 3] = "ANNOTATION_XML";
    TAG_ID2[TAG_ID2["APPLET"] = 4] = "APPLET";
    TAG_ID2[TAG_ID2["AREA"] = 5] = "AREA";
    TAG_ID2[TAG_ID2["ARTICLE"] = 6] = "ARTICLE";
    TAG_ID2[TAG_ID2["ASIDE"] = 7] = "ASIDE";
    TAG_ID2[TAG_ID2["B"] = 8] = "B";
    TAG_ID2[TAG_ID2["BASE"] = 9] = "BASE";
    TAG_ID2[TAG_ID2["BASEFONT"] = 10] = "BASEFONT";
    TAG_ID2[TAG_ID2["BGSOUND"] = 11] = "BGSOUND";
    TAG_ID2[TAG_ID2["BIG"] = 12] = "BIG";
    TAG_ID2[TAG_ID2["BLOCKQUOTE"] = 13] = "BLOCKQUOTE";
    TAG_ID2[TAG_ID2["BODY"] = 14] = "BODY";
    TAG_ID2[TAG_ID2["BR"] = 15] = "BR";
    TAG_ID2[TAG_ID2["BUTTON"] = 16] = "BUTTON";
    TAG_ID2[TAG_ID2["CAPTION"] = 17] = "CAPTION";
    TAG_ID2[TAG_ID2["CENTER"] = 18] = "CENTER";
    TAG_ID2[TAG_ID2["CODE"] = 19] = "CODE";
    TAG_ID2[TAG_ID2["COL"] = 20] = "COL";
    TAG_ID2[TAG_ID2["COLGROUP"] = 21] = "COLGROUP";
    TAG_ID2[TAG_ID2["DD"] = 22] = "DD";
    TAG_ID2[TAG_ID2["DESC"] = 23] = "DESC";
    TAG_ID2[TAG_ID2["DETAILS"] = 24] = "DETAILS";
    TAG_ID2[TAG_ID2["DIALOG"] = 25] = "DIALOG";
    TAG_ID2[TAG_ID2["DIR"] = 26] = "DIR";
    TAG_ID2[TAG_ID2["DIV"] = 27] = "DIV";
    TAG_ID2[TAG_ID2["DL"] = 28] = "DL";
    TAG_ID2[TAG_ID2["DT"] = 29] = "DT";
    TAG_ID2[TAG_ID2["EM"] = 30] = "EM";
    TAG_ID2[TAG_ID2["EMBED"] = 31] = "EMBED";
    TAG_ID2[TAG_ID2["FIELDSET"] = 32] = "FIELDSET";
    TAG_ID2[TAG_ID2["FIGCAPTION"] = 33] = "FIGCAPTION";
    TAG_ID2[TAG_ID2["FIGURE"] = 34] = "FIGURE";
    TAG_ID2[TAG_ID2["FONT"] = 35] = "FONT";
    TAG_ID2[TAG_ID2["FOOTER"] = 36] = "FOOTER";
    TAG_ID2[TAG_ID2["FOREIGN_OBJECT"] = 37] = "FOREIGN_OBJECT";
    TAG_ID2[TAG_ID2["FORM"] = 38] = "FORM";
    TAG_ID2[TAG_ID2["FRAME"] = 39] = "FRAME";
    TAG_ID2[TAG_ID2["FRAMESET"] = 40] = "FRAMESET";
    TAG_ID2[TAG_ID2["H1"] = 41] = "H1";
    TAG_ID2[TAG_ID2["H2"] = 42] = "H2";
    TAG_ID2[TAG_ID2["H3"] = 43] = "H3";
    TAG_ID2[TAG_ID2["H4"] = 44] = "H4";
    TAG_ID2[TAG_ID2["H5"] = 45] = "H5";
    TAG_ID2[TAG_ID2["H6"] = 46] = "H6";
    TAG_ID2[TAG_ID2["HEAD"] = 47] = "HEAD";
    TAG_ID2[TAG_ID2["HEADER"] = 48] = "HEADER";
    TAG_ID2[TAG_ID2["HGROUP"] = 49] = "HGROUP";
    TAG_ID2[TAG_ID2["HR"] = 50] = "HR";
    TAG_ID2[TAG_ID2["HTML"] = 51] = "HTML";
    TAG_ID2[TAG_ID2["I"] = 52] = "I";
    TAG_ID2[TAG_ID2["IMG"] = 53] = "IMG";
    TAG_ID2[TAG_ID2["IMAGE"] = 54] = "IMAGE";
    TAG_ID2[TAG_ID2["INPUT"] = 55] = "INPUT";
    TAG_ID2[TAG_ID2["IFRAME"] = 56] = "IFRAME";
    TAG_ID2[TAG_ID2["KEYGEN"] = 57] = "KEYGEN";
    TAG_ID2[TAG_ID2["LABEL"] = 58] = "LABEL";
    TAG_ID2[TAG_ID2["LI"] = 59] = "LI";
    TAG_ID2[TAG_ID2["LINK"] = 60] = "LINK";
    TAG_ID2[TAG_ID2["LISTING"] = 61] = "LISTING";
    TAG_ID2[TAG_ID2["MAIN"] = 62] = "MAIN";
    TAG_ID2[TAG_ID2["MALIGNMARK"] = 63] = "MALIGNMARK";
    TAG_ID2[TAG_ID2["MARQUEE"] = 64] = "MARQUEE";
    TAG_ID2[TAG_ID2["MATH"] = 65] = "MATH";
    TAG_ID2[TAG_ID2["MENU"] = 66] = "MENU";
    TAG_ID2[TAG_ID2["META"] = 67] = "META";
    TAG_ID2[TAG_ID2["MGLYPH"] = 68] = "MGLYPH";
    TAG_ID2[TAG_ID2["MI"] = 69] = "MI";
    TAG_ID2[TAG_ID2["MO"] = 70] = "MO";
    TAG_ID2[TAG_ID2["MN"] = 71] = "MN";
    TAG_ID2[TAG_ID2["MS"] = 72] = "MS";
    TAG_ID2[TAG_ID2["MTEXT"] = 73] = "MTEXT";
    TAG_ID2[TAG_ID2["NAV"] = 74] = "NAV";
    TAG_ID2[TAG_ID2["NOBR"] = 75] = "NOBR";
    TAG_ID2[TAG_ID2["NOFRAMES"] = 76] = "NOFRAMES";
    TAG_ID2[TAG_ID2["NOEMBED"] = 77] = "NOEMBED";
    TAG_ID2[TAG_ID2["NOSCRIPT"] = 78] = "NOSCRIPT";
    TAG_ID2[TAG_ID2["OBJECT"] = 79] = "OBJECT";
    TAG_ID2[TAG_ID2["OL"] = 80] = "OL";
    TAG_ID2[TAG_ID2["OPTGROUP"] = 81] = "OPTGROUP";
    TAG_ID2[TAG_ID2["OPTION"] = 82] = "OPTION";
    TAG_ID2[TAG_ID2["P"] = 83] = "P";
    TAG_ID2[TAG_ID2["PARAM"] = 84] = "PARAM";
    TAG_ID2[TAG_ID2["PLAINTEXT"] = 85] = "PLAINTEXT";
    TAG_ID2[TAG_ID2["PRE"] = 86] = "PRE";
    TAG_ID2[TAG_ID2["RB"] = 87] = "RB";
    TAG_ID2[TAG_ID2["RP"] = 88] = "RP";
    TAG_ID2[TAG_ID2["RT"] = 89] = "RT";
    TAG_ID2[TAG_ID2["RTC"] = 90] = "RTC";
    TAG_ID2[TAG_ID2["RUBY"] = 91] = "RUBY";
    TAG_ID2[TAG_ID2["S"] = 92] = "S";
    TAG_ID2[TAG_ID2["SCRIPT"] = 93] = "SCRIPT";
    TAG_ID2[TAG_ID2["SEARCH"] = 94] = "SEARCH";
    TAG_ID2[TAG_ID2["SECTION"] = 95] = "SECTION";
    TAG_ID2[TAG_ID2["SELECT"] = 96] = "SELECT";
    TAG_ID2[TAG_ID2["SOURCE"] = 97] = "SOURCE";
    TAG_ID2[TAG_ID2["SMALL"] = 98] = "SMALL";
    TAG_ID2[TAG_ID2["SPAN"] = 99] = "SPAN";
    TAG_ID2[TAG_ID2["STRIKE"] = 100] = "STRIKE";
    TAG_ID2[TAG_ID2["STRONG"] = 101] = "STRONG";
    TAG_ID2[TAG_ID2["STYLE"] = 102] = "STYLE";
    TAG_ID2[TAG_ID2["SUB"] = 103] = "SUB";
    TAG_ID2[TAG_ID2["SUMMARY"] = 104] = "SUMMARY";
    TAG_ID2[TAG_ID2["SUP"] = 105] = "SUP";
    TAG_ID2[TAG_ID2["TABLE"] = 106] = "TABLE";
    TAG_ID2[TAG_ID2["TBODY"] = 107] = "TBODY";
    TAG_ID2[TAG_ID2["TEMPLATE"] = 108] = "TEMPLATE";
    TAG_ID2[TAG_ID2["TEXTAREA"] = 109] = "TEXTAREA";
    TAG_ID2[TAG_ID2["TFOOT"] = 110] = "TFOOT";
    TAG_ID2[TAG_ID2["TD"] = 111] = "TD";
    TAG_ID2[TAG_ID2["TH"] = 112] = "TH";
    TAG_ID2[TAG_ID2["THEAD"] = 113] = "THEAD";
    TAG_ID2[TAG_ID2["TITLE"] = 114] = "TITLE";
    TAG_ID2[TAG_ID2["TR"] = 115] = "TR";
    TAG_ID2[TAG_ID2["TRACK"] = 116] = "TRACK";
    TAG_ID2[TAG_ID2["TT"] = 117] = "TT";
    TAG_ID2[TAG_ID2["U"] = 118] = "U";
    TAG_ID2[TAG_ID2["UL"] = 119] = "UL";
    TAG_ID2[TAG_ID2["SVG"] = 120] = "SVG";
    TAG_ID2[TAG_ID2["VAR"] = 121] = "VAR";
    TAG_ID2[TAG_ID2["WBR"] = 122] = "WBR";
    TAG_ID2[TAG_ID2["XMP"] = 123] = "XMP";
  })(TAG_ID || (TAG_ID = {}));
  var TAG_NAME_TO_ID = /* @__PURE__ */ new Map([
    [TAG_NAMES.A, TAG_ID.A],
    [TAG_NAMES.ADDRESS, TAG_ID.ADDRESS],
    [TAG_NAMES.ANNOTATION_XML, TAG_ID.ANNOTATION_XML],
    [TAG_NAMES.APPLET, TAG_ID.APPLET],
    [TAG_NAMES.AREA, TAG_ID.AREA],
    [TAG_NAMES.ARTICLE, TAG_ID.ARTICLE],
    [TAG_NAMES.ASIDE, TAG_ID.ASIDE],
    [TAG_NAMES.B, TAG_ID.B],
    [TAG_NAMES.BASE, TAG_ID.BASE],
    [TAG_NAMES.BASEFONT, TAG_ID.BASEFONT],
    [TAG_NAMES.BGSOUND, TAG_ID.BGSOUND],
    [TAG_NAMES.BIG, TAG_ID.BIG],
    [TAG_NAMES.BLOCKQUOTE, TAG_ID.BLOCKQUOTE],
    [TAG_NAMES.BODY, TAG_ID.BODY],
    [TAG_NAMES.BR, TAG_ID.BR],
    [TAG_NAMES.BUTTON, TAG_ID.BUTTON],
    [TAG_NAMES.CAPTION, TAG_ID.CAPTION],
    [TAG_NAMES.CENTER, TAG_ID.CENTER],
    [TAG_NAMES.CODE, TAG_ID.CODE],
    [TAG_NAMES.COL, TAG_ID.COL],
    [TAG_NAMES.COLGROUP, TAG_ID.COLGROUP],
    [TAG_NAMES.DD, TAG_ID.DD],
    [TAG_NAMES.DESC, TAG_ID.DESC],
    [TAG_NAMES.DETAILS, TAG_ID.DETAILS],
    [TAG_NAMES.DIALOG, TAG_ID.DIALOG],
    [TAG_NAMES.DIR, TAG_ID.DIR],
    [TAG_NAMES.DIV, TAG_ID.DIV],
    [TAG_NAMES.DL, TAG_ID.DL],
    [TAG_NAMES.DT, TAG_ID.DT],
    [TAG_NAMES.EM, TAG_ID.EM],
    [TAG_NAMES.EMBED, TAG_ID.EMBED],
    [TAG_NAMES.FIELDSET, TAG_ID.FIELDSET],
    [TAG_NAMES.FIGCAPTION, TAG_ID.FIGCAPTION],
    [TAG_NAMES.FIGURE, TAG_ID.FIGURE],
    [TAG_NAMES.FONT, TAG_ID.FONT],
    [TAG_NAMES.FOOTER, TAG_ID.FOOTER],
    [TAG_NAMES.FOREIGN_OBJECT, TAG_ID.FOREIGN_OBJECT],
    [TAG_NAMES.FORM, TAG_ID.FORM],
    [TAG_NAMES.FRAME, TAG_ID.FRAME],
    [TAG_NAMES.FRAMESET, TAG_ID.FRAMESET],
    [TAG_NAMES.H1, TAG_ID.H1],
    [TAG_NAMES.H2, TAG_ID.H2],
    [TAG_NAMES.H3, TAG_ID.H3],
    [TAG_NAMES.H4, TAG_ID.H4],
    [TAG_NAMES.H5, TAG_ID.H5],
    [TAG_NAMES.H6, TAG_ID.H6],
    [TAG_NAMES.HEAD, TAG_ID.HEAD],
    [TAG_NAMES.HEADER, TAG_ID.HEADER],
    [TAG_NAMES.HGROUP, TAG_ID.HGROUP],
    [TAG_NAMES.HR, TAG_ID.HR],
    [TAG_NAMES.HTML, TAG_ID.HTML],
    [TAG_NAMES.I, TAG_ID.I],
    [TAG_NAMES.IMG, TAG_ID.IMG],
    [TAG_NAMES.IMAGE, TAG_ID.IMAGE],
    [TAG_NAMES.INPUT, TAG_ID.INPUT],
    [TAG_NAMES.IFRAME, TAG_ID.IFRAME],
    [TAG_NAMES.KEYGEN, TAG_ID.KEYGEN],
    [TAG_NAMES.LABEL, TAG_ID.LABEL],
    [TAG_NAMES.LI, TAG_ID.LI],
    [TAG_NAMES.LINK, TAG_ID.LINK],
    [TAG_NAMES.LISTING, TAG_ID.LISTING],
    [TAG_NAMES.MAIN, TAG_ID.MAIN],
    [TAG_NAMES.MALIGNMARK, TAG_ID.MALIGNMARK],
    [TAG_NAMES.MARQUEE, TAG_ID.MARQUEE],
    [TAG_NAMES.MATH, TAG_ID.MATH],
    [TAG_NAMES.MENU, TAG_ID.MENU],
    [TAG_NAMES.META, TAG_ID.META],
    [TAG_NAMES.MGLYPH, TAG_ID.MGLYPH],
    [TAG_NAMES.MI, TAG_ID.MI],
    [TAG_NAMES.MO, TAG_ID.MO],
    [TAG_NAMES.MN, TAG_ID.MN],
    [TAG_NAMES.MS, TAG_ID.MS],
    [TAG_NAMES.MTEXT, TAG_ID.MTEXT],
    [TAG_NAMES.NAV, TAG_ID.NAV],
    [TAG_NAMES.NOBR, TAG_ID.NOBR],
    [TAG_NAMES.NOFRAMES, TAG_ID.NOFRAMES],
    [TAG_NAMES.NOEMBED, TAG_ID.NOEMBED],
    [TAG_NAMES.NOSCRIPT, TAG_ID.NOSCRIPT],
    [TAG_NAMES.OBJECT, TAG_ID.OBJECT],
    [TAG_NAMES.OL, TAG_ID.OL],
    [TAG_NAMES.OPTGROUP, TAG_ID.OPTGROUP],
    [TAG_NAMES.OPTION, TAG_ID.OPTION],
    [TAG_NAMES.P, TAG_ID.P],
    [TAG_NAMES.PARAM, TAG_ID.PARAM],
    [TAG_NAMES.PLAINTEXT, TAG_ID.PLAINTEXT],
    [TAG_NAMES.PRE, TAG_ID.PRE],
    [TAG_NAMES.RB, TAG_ID.RB],
    [TAG_NAMES.RP, TAG_ID.RP],
    [TAG_NAMES.RT, TAG_ID.RT],
    [TAG_NAMES.RTC, TAG_ID.RTC],
    [TAG_NAMES.RUBY, TAG_ID.RUBY],
    [TAG_NAMES.S, TAG_ID.S],
    [TAG_NAMES.SCRIPT, TAG_ID.SCRIPT],
    [TAG_NAMES.SEARCH, TAG_ID.SEARCH],
    [TAG_NAMES.SECTION, TAG_ID.SECTION],
    [TAG_NAMES.SELECT, TAG_ID.SELECT],
    [TAG_NAMES.SOURCE, TAG_ID.SOURCE],
    [TAG_NAMES.SMALL, TAG_ID.SMALL],
    [TAG_NAMES.SPAN, TAG_ID.SPAN],
    [TAG_NAMES.STRIKE, TAG_ID.STRIKE],
    [TAG_NAMES.STRONG, TAG_ID.STRONG],
    [TAG_NAMES.STYLE, TAG_ID.STYLE],
    [TAG_NAMES.SUB, TAG_ID.SUB],
    [TAG_NAMES.SUMMARY, TAG_ID.SUMMARY],
    [TAG_NAMES.SUP, TAG_ID.SUP],
    [TAG_NAMES.TABLE, TAG_ID.TABLE],
    [TAG_NAMES.TBODY, TAG_ID.TBODY],
    [TAG_NAMES.TEMPLATE, TAG_ID.TEMPLATE],
    [TAG_NAMES.TEXTAREA, TAG_ID.TEXTAREA],
    [TAG_NAMES.TFOOT, TAG_ID.TFOOT],
    [TAG_NAMES.TD, TAG_ID.TD],
    [TAG_NAMES.TH, TAG_ID.TH],
    [TAG_NAMES.THEAD, TAG_ID.THEAD],
    [TAG_NAMES.TITLE, TAG_ID.TITLE],
    [TAG_NAMES.TR, TAG_ID.TR],
    [TAG_NAMES.TRACK, TAG_ID.TRACK],
    [TAG_NAMES.TT, TAG_ID.TT],
    [TAG_NAMES.U, TAG_ID.U],
    [TAG_NAMES.UL, TAG_ID.UL],
    [TAG_NAMES.SVG, TAG_ID.SVG],
    [TAG_NAMES.VAR, TAG_ID.VAR],
    [TAG_NAMES.WBR, TAG_ID.WBR],
    [TAG_NAMES.XMP, TAG_ID.XMP]
  ]);
  function getTagID(tagName) {
    var _a;
    return (_a = TAG_NAME_TO_ID.get(tagName)) !== null && _a !== void 0 ? _a : TAG_ID.UNKNOWN;
  }
  var $ = TAG_ID;
  var SPECIAL_ELEMENTS = {
    [NS.HTML]: /* @__PURE__ */ new Set([
      $.ADDRESS,
      $.APPLET,
      $.AREA,
      $.ARTICLE,
      $.ASIDE,
      $.BASE,
      $.BASEFONT,
      $.BGSOUND,
      $.BLOCKQUOTE,
      $.BODY,
      $.BR,
      $.BUTTON,
      $.CAPTION,
      $.CENTER,
      $.COL,
      $.COLGROUP,
      $.DD,
      $.DETAILS,
      $.DIR,
      $.DIV,
      $.DL,
      $.DT,
      $.EMBED,
      $.FIELDSET,
      $.FIGCAPTION,
      $.FIGURE,
      $.FOOTER,
      $.FORM,
      $.FRAME,
      $.FRAMESET,
      $.H1,
      $.H2,
      $.H3,
      $.H4,
      $.H5,
      $.H6,
      $.HEAD,
      $.HEADER,
      $.HGROUP,
      $.HR,
      $.HTML,
      $.IFRAME,
      $.IMG,
      $.INPUT,
      $.LI,
      $.LINK,
      $.LISTING,
      $.MAIN,
      $.MARQUEE,
      $.MENU,
      $.META,
      $.NAV,
      $.NOEMBED,
      $.NOFRAMES,
      $.NOSCRIPT,
      $.OBJECT,
      $.OL,
      $.P,
      $.PARAM,
      $.PLAINTEXT,
      $.PRE,
      $.SCRIPT,
      $.SECTION,
      $.SELECT,
      $.SOURCE,
      $.STYLE,
      $.SUMMARY,
      $.TABLE,
      $.TBODY,
      $.TD,
      $.TEMPLATE,
      $.TEXTAREA,
      $.TFOOT,
      $.TH,
      $.THEAD,
      $.TITLE,
      $.TR,
      $.TRACK,
      $.UL,
      $.WBR,
      $.XMP
    ]),
    [NS.MATHML]: /* @__PURE__ */ new Set([$.MI, $.MO, $.MN, $.MS, $.MTEXT, $.ANNOTATION_XML]),
    [NS.SVG]: /* @__PURE__ */ new Set([$.TITLE, $.FOREIGN_OBJECT, $.DESC]),
    [NS.XLINK]: /* @__PURE__ */ new Set(),
    [NS.XML]: /* @__PURE__ */ new Set(),
    [NS.XMLNS]: /* @__PURE__ */ new Set()
  };
  var NUMBERED_HEADERS = /* @__PURE__ */ new Set([$.H1, $.H2, $.H3, $.H4, $.H5, $.H6]);
  var UNESCAPED_TEXT = /* @__PURE__ */ new Set([
    TAG_NAMES.STYLE,
    TAG_NAMES.SCRIPT,
    TAG_NAMES.XMP,
    TAG_NAMES.IFRAME,
    TAG_NAMES.NOEMBED,
    TAG_NAMES.NOFRAMES,
    TAG_NAMES.PLAINTEXT
  ]);
  function hasUnescapedText(tn, scriptingEnabled) {
    return UNESCAPED_TEXT.has(tn) || scriptingEnabled && tn === TAG_NAMES.NOSCRIPT;
  }

  // ../../engine-v2/node_modules/parse5/dist/tokenizer/index.js
  var State;
  (function(State2) {
    State2[State2["DATA"] = 0] = "DATA";
    State2[State2["RCDATA"] = 1] = "RCDATA";
    State2[State2["RAWTEXT"] = 2] = "RAWTEXT";
    State2[State2["SCRIPT_DATA"] = 3] = "SCRIPT_DATA";
    State2[State2["PLAINTEXT"] = 4] = "PLAINTEXT";
    State2[State2["TAG_OPEN"] = 5] = "TAG_OPEN";
    State2[State2["END_TAG_OPEN"] = 6] = "END_TAG_OPEN";
    State2[State2["TAG_NAME"] = 7] = "TAG_NAME";
    State2[State2["RCDATA_LESS_THAN_SIGN"] = 8] = "RCDATA_LESS_THAN_SIGN";
    State2[State2["RCDATA_END_TAG_OPEN"] = 9] = "RCDATA_END_TAG_OPEN";
    State2[State2["RCDATA_END_TAG_NAME"] = 10] = "RCDATA_END_TAG_NAME";
    State2[State2["RAWTEXT_LESS_THAN_SIGN"] = 11] = "RAWTEXT_LESS_THAN_SIGN";
    State2[State2["RAWTEXT_END_TAG_OPEN"] = 12] = "RAWTEXT_END_TAG_OPEN";
    State2[State2["RAWTEXT_END_TAG_NAME"] = 13] = "RAWTEXT_END_TAG_NAME";
    State2[State2["SCRIPT_DATA_LESS_THAN_SIGN"] = 14] = "SCRIPT_DATA_LESS_THAN_SIGN";
    State2[State2["SCRIPT_DATA_END_TAG_OPEN"] = 15] = "SCRIPT_DATA_END_TAG_OPEN";
    State2[State2["SCRIPT_DATA_END_TAG_NAME"] = 16] = "SCRIPT_DATA_END_TAG_NAME";
    State2[State2["SCRIPT_DATA_ESCAPE_START"] = 17] = "SCRIPT_DATA_ESCAPE_START";
    State2[State2["SCRIPT_DATA_ESCAPE_START_DASH"] = 18] = "SCRIPT_DATA_ESCAPE_START_DASH";
    State2[State2["SCRIPT_DATA_ESCAPED"] = 19] = "SCRIPT_DATA_ESCAPED";
    State2[State2["SCRIPT_DATA_ESCAPED_DASH"] = 20] = "SCRIPT_DATA_ESCAPED_DASH";
    State2[State2["SCRIPT_DATA_ESCAPED_DASH_DASH"] = 21] = "SCRIPT_DATA_ESCAPED_DASH_DASH";
    State2[State2["SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN"] = 22] = "SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN";
    State2[State2["SCRIPT_DATA_ESCAPED_END_TAG_OPEN"] = 23] = "SCRIPT_DATA_ESCAPED_END_TAG_OPEN";
    State2[State2["SCRIPT_DATA_ESCAPED_END_TAG_NAME"] = 24] = "SCRIPT_DATA_ESCAPED_END_TAG_NAME";
    State2[State2["SCRIPT_DATA_DOUBLE_ESCAPE_START"] = 25] = "SCRIPT_DATA_DOUBLE_ESCAPE_START";
    State2[State2["SCRIPT_DATA_DOUBLE_ESCAPED"] = 26] = "SCRIPT_DATA_DOUBLE_ESCAPED";
    State2[State2["SCRIPT_DATA_DOUBLE_ESCAPED_DASH"] = 27] = "SCRIPT_DATA_DOUBLE_ESCAPED_DASH";
    State2[State2["SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH"] = 28] = "SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH";
    State2[State2["SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN"] = 29] = "SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN";
    State2[State2["SCRIPT_DATA_DOUBLE_ESCAPE_END"] = 30] = "SCRIPT_DATA_DOUBLE_ESCAPE_END";
    State2[State2["BEFORE_ATTRIBUTE_NAME"] = 31] = "BEFORE_ATTRIBUTE_NAME";
    State2[State2["ATTRIBUTE_NAME"] = 32] = "ATTRIBUTE_NAME";
    State2[State2["AFTER_ATTRIBUTE_NAME"] = 33] = "AFTER_ATTRIBUTE_NAME";
    State2[State2["BEFORE_ATTRIBUTE_VALUE"] = 34] = "BEFORE_ATTRIBUTE_VALUE";
    State2[State2["ATTRIBUTE_VALUE_DOUBLE_QUOTED"] = 35] = "ATTRIBUTE_VALUE_DOUBLE_QUOTED";
    State2[State2["ATTRIBUTE_VALUE_SINGLE_QUOTED"] = 36] = "ATTRIBUTE_VALUE_SINGLE_QUOTED";
    State2[State2["ATTRIBUTE_VALUE_UNQUOTED"] = 37] = "ATTRIBUTE_VALUE_UNQUOTED";
    State2[State2["AFTER_ATTRIBUTE_VALUE_QUOTED"] = 38] = "AFTER_ATTRIBUTE_VALUE_QUOTED";
    State2[State2["SELF_CLOSING_START_TAG"] = 39] = "SELF_CLOSING_START_TAG";
    State2[State2["BOGUS_COMMENT"] = 40] = "BOGUS_COMMENT";
    State2[State2["MARKUP_DECLARATION_OPEN"] = 41] = "MARKUP_DECLARATION_OPEN";
    State2[State2["COMMENT_START"] = 42] = "COMMENT_START";
    State2[State2["COMMENT_START_DASH"] = 43] = "COMMENT_START_DASH";
    State2[State2["COMMENT"] = 44] = "COMMENT";
    State2[State2["COMMENT_LESS_THAN_SIGN"] = 45] = "COMMENT_LESS_THAN_SIGN";
    State2[State2["COMMENT_LESS_THAN_SIGN_BANG"] = 46] = "COMMENT_LESS_THAN_SIGN_BANG";
    State2[State2["COMMENT_LESS_THAN_SIGN_BANG_DASH"] = 47] = "COMMENT_LESS_THAN_SIGN_BANG_DASH";
    State2[State2["COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH"] = 48] = "COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH";
    State2[State2["COMMENT_END_DASH"] = 49] = "COMMENT_END_DASH";
    State2[State2["COMMENT_END"] = 50] = "COMMENT_END";
    State2[State2["COMMENT_END_BANG"] = 51] = "COMMENT_END_BANG";
    State2[State2["DOCTYPE"] = 52] = "DOCTYPE";
    State2[State2["BEFORE_DOCTYPE_NAME"] = 53] = "BEFORE_DOCTYPE_NAME";
    State2[State2["DOCTYPE_NAME"] = 54] = "DOCTYPE_NAME";
    State2[State2["AFTER_DOCTYPE_NAME"] = 55] = "AFTER_DOCTYPE_NAME";
    State2[State2["AFTER_DOCTYPE_PUBLIC_KEYWORD"] = 56] = "AFTER_DOCTYPE_PUBLIC_KEYWORD";
    State2[State2["BEFORE_DOCTYPE_PUBLIC_IDENTIFIER"] = 57] = "BEFORE_DOCTYPE_PUBLIC_IDENTIFIER";
    State2[State2["DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED"] = 58] = "DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED";
    State2[State2["DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED"] = 59] = "DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED";
    State2[State2["AFTER_DOCTYPE_PUBLIC_IDENTIFIER"] = 60] = "AFTER_DOCTYPE_PUBLIC_IDENTIFIER";
    State2[State2["BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS"] = 61] = "BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS";
    State2[State2["AFTER_DOCTYPE_SYSTEM_KEYWORD"] = 62] = "AFTER_DOCTYPE_SYSTEM_KEYWORD";
    State2[State2["BEFORE_DOCTYPE_SYSTEM_IDENTIFIER"] = 63] = "BEFORE_DOCTYPE_SYSTEM_IDENTIFIER";
    State2[State2["DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED"] = 64] = "DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED";
    State2[State2["DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED"] = 65] = "DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED";
    State2[State2["AFTER_DOCTYPE_SYSTEM_IDENTIFIER"] = 66] = "AFTER_DOCTYPE_SYSTEM_IDENTIFIER";
    State2[State2["BOGUS_DOCTYPE"] = 67] = "BOGUS_DOCTYPE";
    State2[State2["CDATA_SECTION"] = 68] = "CDATA_SECTION";
    State2[State2["CDATA_SECTION_BRACKET"] = 69] = "CDATA_SECTION_BRACKET";
    State2[State2["CDATA_SECTION_END"] = 70] = "CDATA_SECTION_END";
    State2[State2["CHARACTER_REFERENCE"] = 71] = "CHARACTER_REFERENCE";
    State2[State2["AMBIGUOUS_AMPERSAND"] = 72] = "AMBIGUOUS_AMPERSAND";
  })(State || (State = {}));
  var TokenizerMode = {
    DATA: State.DATA,
    RCDATA: State.RCDATA,
    RAWTEXT: State.RAWTEXT,
    SCRIPT_DATA: State.SCRIPT_DATA,
    PLAINTEXT: State.PLAINTEXT,
    CDATA_SECTION: State.CDATA_SECTION
  };
  function isAsciiDigit(cp) {
    return cp >= CODE_POINTS.DIGIT_0 && cp <= CODE_POINTS.DIGIT_9;
  }
  function isAsciiUpper(cp) {
    return cp >= CODE_POINTS.LATIN_CAPITAL_A && cp <= CODE_POINTS.LATIN_CAPITAL_Z;
  }
  function isAsciiLower(cp) {
    return cp >= CODE_POINTS.LATIN_SMALL_A && cp <= CODE_POINTS.LATIN_SMALL_Z;
  }
  function isAsciiLetter(cp) {
    return isAsciiLower(cp) || isAsciiUpper(cp);
  }
  function isAsciiAlphaNumeric(cp) {
    return isAsciiLetter(cp) || isAsciiDigit(cp);
  }
  function toAsciiLower(cp) {
    return cp + 32;
  }
  function isWhitespace(cp) {
    return cp === CODE_POINTS.SPACE || cp === CODE_POINTS.LINE_FEED || cp === CODE_POINTS.TABULATION || cp === CODE_POINTS.FORM_FEED;
  }
  function isScriptDataDoubleEscapeSequenceEnd(cp) {
    return isWhitespace(cp) || cp === CODE_POINTS.SOLIDUS || cp === CODE_POINTS.GREATER_THAN_SIGN;
  }
  function getErrorForNumericCharacterReference(code2) {
    if (code2 === CODE_POINTS.NULL) {
      return ERR.nullCharacterReference;
    } else if (code2 > 1114111) {
      return ERR.characterReferenceOutsideUnicodeRange;
    } else if (isSurrogate(code2)) {
      return ERR.surrogateCharacterReference;
    } else if (isUndefinedCodePoint(code2)) {
      return ERR.noncharacterCharacterReference;
    } else if (isControlCodePoint(code2) || code2 === CODE_POINTS.CARRIAGE_RETURN) {
      return ERR.controlCharacterReference;
    }
    return null;
  }
  var Tokenizer = class {
    constructor(options, handler) {
      this.options = options;
      this.handler = handler;
      this.paused = false;
      this.inLoop = false;
      this.inForeignNode = false;
      this.lastStartTagName = "";
      this.active = false;
      this.state = State.DATA;
      this.returnState = State.DATA;
      this.entityStartPos = 0;
      this.consumedAfterSnapshot = -1;
      this.currentCharacterToken = null;
      this.currentToken = null;
      this.currentAttr = { name: "", value: "" };
      this.preprocessor = new Preprocessor(handler);
      this.currentLocation = this.getCurrentLocation(-1);
      this.entityDecoder = new EntityDecoder(htmlDecodeTree, (cp, consumed) => {
        this.preprocessor.pos = this.entityStartPos + consumed - 1;
        this._flushCodePointConsumedAsCharacterReference(cp);
      }, handler.onParseError ? {
        missingSemicolonAfterCharacterReference: () => {
          this._err(ERR.missingSemicolonAfterCharacterReference, 1);
        },
        absenceOfDigitsInNumericCharacterReference: (consumed) => {
          this._err(ERR.absenceOfDigitsInNumericCharacterReference, this.entityStartPos - this.preprocessor.pos + consumed);
        },
        validateNumericCharacterReference: (code2) => {
          const error = getErrorForNumericCharacterReference(code2);
          if (error)
            this._err(error, 1);
        }
      } : void 0);
    }
    //Errors
    _err(code2, cpOffset = 0) {
      var _a, _b;
      (_b = (_a = this.handler).onParseError) === null || _b === void 0 ? void 0 : _b.call(_a, this.preprocessor.getError(code2, cpOffset));
    }
    // NOTE: `offset` may never run across line boundaries.
    getCurrentLocation(offset) {
      if (!this.options.sourceCodeLocationInfo) {
        return null;
      }
      return {
        startLine: this.preprocessor.line,
        startCol: this.preprocessor.col - offset,
        startOffset: this.preprocessor.offset - offset,
        endLine: -1,
        endCol: -1,
        endOffset: -1
      };
    }
    _runParsingLoop() {
      if (this.inLoop)
        return;
      this.inLoop = true;
      while (this.active && !this.paused) {
        this.consumedAfterSnapshot = 0;
        const cp = this._consume();
        if (!this._ensureHibernation()) {
          this._callState(cp);
        }
      }
      this.inLoop = false;
    }
    //API
    pause() {
      this.paused = true;
    }
    resume(writeCallback) {
      if (!this.paused) {
        throw new Error("Parser was already resumed");
      }
      this.paused = false;
      if (this.inLoop)
        return;
      this._runParsingLoop();
      if (!this.paused) {
        writeCallback === null || writeCallback === void 0 ? void 0 : writeCallback();
      }
    }
    write(chunk, isLastChunk, writeCallback) {
      this.active = true;
      this.preprocessor.write(chunk, isLastChunk);
      this._runParsingLoop();
      if (!this.paused) {
        writeCallback === null || writeCallback === void 0 ? void 0 : writeCallback();
      }
    }
    insertHtmlAtCurrentPos(chunk) {
      this.active = true;
      this.preprocessor.insertHtmlAtCurrentPos(chunk);
      this._runParsingLoop();
    }
    //Hibernation
    _ensureHibernation() {
      if (this.preprocessor.endOfChunkHit) {
        this.preprocessor.retreat(this.consumedAfterSnapshot);
        this.consumedAfterSnapshot = 0;
        this.active = false;
        return true;
      }
      return false;
    }
    //Consumption
    _consume() {
      this.consumedAfterSnapshot++;
      return this.preprocessor.advance();
    }
    _advanceBy(count) {
      this.consumedAfterSnapshot += count;
      for (let i = 0; i < count; i++) {
        this.preprocessor.advance();
      }
    }
    _consumeSequenceIfMatch(pattern, caseSensitive) {
      if (this.preprocessor.startsWith(pattern, caseSensitive)) {
        this._advanceBy(pattern.length - 1);
        return true;
      }
      return false;
    }
    //Token creation
    _createStartTagToken() {
      this.currentToken = {
        type: TokenType.START_TAG,
        tagName: "",
        tagID: TAG_ID.UNKNOWN,
        selfClosing: false,
        ackSelfClosing: false,
        attrs: [],
        location: this.getCurrentLocation(1)
      };
    }
    _createEndTagToken() {
      this.currentToken = {
        type: TokenType.END_TAG,
        tagName: "",
        tagID: TAG_ID.UNKNOWN,
        selfClosing: false,
        ackSelfClosing: false,
        attrs: [],
        location: this.getCurrentLocation(2)
      };
    }
    _createCommentToken(offset) {
      this.currentToken = {
        type: TokenType.COMMENT,
        data: "",
        location: this.getCurrentLocation(offset)
      };
    }
    _createDoctypeToken(initialName) {
      this.currentToken = {
        type: TokenType.DOCTYPE,
        name: initialName,
        forceQuirks: false,
        publicId: null,
        systemId: null,
        location: this.currentLocation
      };
    }
    _createCharacterToken(type, chars) {
      this.currentCharacterToken = {
        type,
        chars,
        location: this.currentLocation
      };
    }
    //Tag attributes
    _createAttr(attrNameFirstCh) {
      this.currentAttr = {
        name: attrNameFirstCh,
        value: ""
      };
      this.currentLocation = this.getCurrentLocation(0);
    }
    _leaveAttrName() {
      var _a;
      var _b;
      const token = this.currentToken;
      if (getTokenAttr(token, this.currentAttr.name) === null) {
        token.attrs.push(this.currentAttr);
        if (token.location && this.currentLocation) {
          const attrLocations = (_a = (_b = token.location).attrs) !== null && _a !== void 0 ? _a : _b.attrs = /* @__PURE__ */ Object.create(null);
          attrLocations[this.currentAttr.name] = this.currentLocation;
          this._leaveAttrValue();
        }
      } else {
        this._err(ERR.duplicateAttribute);
      }
    }
    _leaveAttrValue() {
      if (this.currentLocation) {
        this.currentLocation.endLine = this.preprocessor.line;
        this.currentLocation.endCol = this.preprocessor.col;
        this.currentLocation.endOffset = this.preprocessor.offset;
      }
    }
    //Token emission
    prepareToken(ct) {
      this._emitCurrentCharacterToken(ct.location);
      this.currentToken = null;
      if (ct.location) {
        ct.location.endLine = this.preprocessor.line;
        ct.location.endCol = this.preprocessor.col + 1;
        ct.location.endOffset = this.preprocessor.offset + 1;
      }
      this.currentLocation = this.getCurrentLocation(-1);
    }
    emitCurrentTagToken() {
      const ct = this.currentToken;
      this.prepareToken(ct);
      ct.tagID = getTagID(ct.tagName);
      if (ct.type === TokenType.START_TAG) {
        this.lastStartTagName = ct.tagName;
        this.handler.onStartTag(ct);
      } else {
        if (ct.attrs.length > 0) {
          this._err(ERR.endTagWithAttributes);
        }
        if (ct.selfClosing) {
          this._err(ERR.endTagWithTrailingSolidus);
        }
        this.handler.onEndTag(ct);
      }
      this.preprocessor.dropParsedChunk();
    }
    emitCurrentComment(ct) {
      this.prepareToken(ct);
      this.handler.onComment(ct);
      this.preprocessor.dropParsedChunk();
    }
    emitCurrentDoctype(ct) {
      this.prepareToken(ct);
      this.handler.onDoctype(ct);
      this.preprocessor.dropParsedChunk();
    }
    _emitCurrentCharacterToken(nextLocation) {
      if (this.currentCharacterToken) {
        if (nextLocation && this.currentCharacterToken.location) {
          this.currentCharacterToken.location.endLine = nextLocation.startLine;
          this.currentCharacterToken.location.endCol = nextLocation.startCol;
          this.currentCharacterToken.location.endOffset = nextLocation.startOffset;
        }
        switch (this.currentCharacterToken.type) {
          case TokenType.CHARACTER: {
            this.handler.onCharacter(this.currentCharacterToken);
            break;
          }
          case TokenType.NULL_CHARACTER: {
            this.handler.onNullCharacter(this.currentCharacterToken);
            break;
          }
          case TokenType.WHITESPACE_CHARACTER: {
            this.handler.onWhitespaceCharacter(this.currentCharacterToken);
            break;
          }
        }
        this.currentCharacterToken = null;
      }
    }
    _emitEOFToken() {
      const location = this.getCurrentLocation(0);
      if (location) {
        location.endLine = location.startLine;
        location.endCol = location.startCol;
        location.endOffset = location.startOffset;
      }
      this._emitCurrentCharacterToken(location);
      this.handler.onEof({ type: TokenType.EOF, location });
      this.active = false;
    }
    //Characters emission
    //OPTIMIZATION: The specification uses only one type of character token (one token per character).
    //This causes a huge memory overhead and a lot of unnecessary parser loops. parse5 uses 3 groups of characters.
    //If we have a sequence of characters that belong to the same group, the parser can process it
    //as a single solid character token.
    //So, there are 3 types of character tokens in parse5:
    //1)TokenType.NULL_CHARACTER - \u0000-character sequences (e.g. '\u0000\u0000\u0000')
    //2)TokenType.WHITESPACE_CHARACTER - any whitespace/new-line character sequences (e.g. '\n  \r\t   \f')
    //3)TokenType.CHARACTER - any character sequence which don't belong to groups 1 and 2 (e.g. 'abcdef1234@@#$%^')
    _appendCharToCurrentCharacterToken(type, ch) {
      if (this.currentCharacterToken) {
        if (this.currentCharacterToken.type === type) {
          this.currentCharacterToken.chars += ch;
          return;
        } else {
          this.currentLocation = this.getCurrentLocation(0);
          this._emitCurrentCharacterToken(this.currentLocation);
          this.preprocessor.dropParsedChunk();
        }
      }
      this._createCharacterToken(type, ch);
    }
    _emitCodePoint(cp) {
      const type = isWhitespace(cp) ? TokenType.WHITESPACE_CHARACTER : cp === CODE_POINTS.NULL ? TokenType.NULL_CHARACTER : TokenType.CHARACTER;
      this._appendCharToCurrentCharacterToken(type, cp < 65536 ? String.fromCharCode(cp) : String.fromCodePoint(cp));
    }
    //NOTE: used when we emit characters explicitly.
    //This is always for non-whitespace and non-null characters, which allows us to avoid additional checks.
    _emitChars(ch) {
      this._appendCharToCurrentCharacterToken(TokenType.CHARACTER, ch);
    }
    // Character reference helpers
    _startCharacterReference() {
      this.returnState = this.state;
      this.state = State.CHARACTER_REFERENCE;
      this.entityStartPos = this.preprocessor.pos;
      this.entityDecoder.startEntity(this._isCharacterReferenceInAttribute() ? DecodingMode.Attribute : DecodingMode.Legacy);
    }
    _isCharacterReferenceInAttribute() {
      return this.returnState === State.ATTRIBUTE_VALUE_DOUBLE_QUOTED || this.returnState === State.ATTRIBUTE_VALUE_SINGLE_QUOTED || this.returnState === State.ATTRIBUTE_VALUE_UNQUOTED;
    }
    _flushCodePointConsumedAsCharacterReference(cp) {
      if (this._isCharacterReferenceInAttribute()) {
        this.currentAttr.value += String.fromCodePoint(cp);
      } else {
        this._emitCodePoint(cp);
      }
    }
    // Calling states this way turns out to be much faster than any other approach.
    _callState(cp) {
      switch (this.state) {
        case State.DATA: {
          this._stateData(cp);
          break;
        }
        case State.RCDATA: {
          this._stateRcdata(cp);
          break;
        }
        case State.RAWTEXT: {
          this._stateRawtext(cp);
          break;
        }
        case State.SCRIPT_DATA: {
          this._stateScriptData(cp);
          break;
        }
        case State.PLAINTEXT: {
          this._statePlaintext(cp);
          break;
        }
        case State.TAG_OPEN: {
          this._stateTagOpen(cp);
          break;
        }
        case State.END_TAG_OPEN: {
          this._stateEndTagOpen(cp);
          break;
        }
        case State.TAG_NAME: {
          this._stateTagName(cp);
          break;
        }
        case State.RCDATA_LESS_THAN_SIGN: {
          this._stateRcdataLessThanSign(cp);
          break;
        }
        case State.RCDATA_END_TAG_OPEN: {
          this._stateRcdataEndTagOpen(cp);
          break;
        }
        case State.RCDATA_END_TAG_NAME: {
          this._stateRcdataEndTagName(cp);
          break;
        }
        case State.RAWTEXT_LESS_THAN_SIGN: {
          this._stateRawtextLessThanSign(cp);
          break;
        }
        case State.RAWTEXT_END_TAG_OPEN: {
          this._stateRawtextEndTagOpen(cp);
          break;
        }
        case State.RAWTEXT_END_TAG_NAME: {
          this._stateRawtextEndTagName(cp);
          break;
        }
        case State.SCRIPT_DATA_LESS_THAN_SIGN: {
          this._stateScriptDataLessThanSign(cp);
          break;
        }
        case State.SCRIPT_DATA_END_TAG_OPEN: {
          this._stateScriptDataEndTagOpen(cp);
          break;
        }
        case State.SCRIPT_DATA_END_TAG_NAME: {
          this._stateScriptDataEndTagName(cp);
          break;
        }
        case State.SCRIPT_DATA_ESCAPE_START: {
          this._stateScriptDataEscapeStart(cp);
          break;
        }
        case State.SCRIPT_DATA_ESCAPE_START_DASH: {
          this._stateScriptDataEscapeStartDash(cp);
          break;
        }
        case State.SCRIPT_DATA_ESCAPED: {
          this._stateScriptDataEscaped(cp);
          break;
        }
        case State.SCRIPT_DATA_ESCAPED_DASH: {
          this._stateScriptDataEscapedDash(cp);
          break;
        }
        case State.SCRIPT_DATA_ESCAPED_DASH_DASH: {
          this._stateScriptDataEscapedDashDash(cp);
          break;
        }
        case State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN: {
          this._stateScriptDataEscapedLessThanSign(cp);
          break;
        }
        case State.SCRIPT_DATA_ESCAPED_END_TAG_OPEN: {
          this._stateScriptDataEscapedEndTagOpen(cp);
          break;
        }
        case State.SCRIPT_DATA_ESCAPED_END_TAG_NAME: {
          this._stateScriptDataEscapedEndTagName(cp);
          break;
        }
        case State.SCRIPT_DATA_DOUBLE_ESCAPE_START: {
          this._stateScriptDataDoubleEscapeStart(cp);
          break;
        }
        case State.SCRIPT_DATA_DOUBLE_ESCAPED: {
          this._stateScriptDataDoubleEscaped(cp);
          break;
        }
        case State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH: {
          this._stateScriptDataDoubleEscapedDash(cp);
          break;
        }
        case State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH: {
          this._stateScriptDataDoubleEscapedDashDash(cp);
          break;
        }
        case State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN: {
          this._stateScriptDataDoubleEscapedLessThanSign(cp);
          break;
        }
        case State.SCRIPT_DATA_DOUBLE_ESCAPE_END: {
          this._stateScriptDataDoubleEscapeEnd(cp);
          break;
        }
        case State.BEFORE_ATTRIBUTE_NAME: {
          this._stateBeforeAttributeName(cp);
          break;
        }
        case State.ATTRIBUTE_NAME: {
          this._stateAttributeName(cp);
          break;
        }
        case State.AFTER_ATTRIBUTE_NAME: {
          this._stateAfterAttributeName(cp);
          break;
        }
        case State.BEFORE_ATTRIBUTE_VALUE: {
          this._stateBeforeAttributeValue(cp);
          break;
        }
        case State.ATTRIBUTE_VALUE_DOUBLE_QUOTED: {
          this._stateAttributeValueDoubleQuoted(cp);
          break;
        }
        case State.ATTRIBUTE_VALUE_SINGLE_QUOTED: {
          this._stateAttributeValueSingleQuoted(cp);
          break;
        }
        case State.ATTRIBUTE_VALUE_UNQUOTED: {
          this._stateAttributeValueUnquoted(cp);
          break;
        }
        case State.AFTER_ATTRIBUTE_VALUE_QUOTED: {
          this._stateAfterAttributeValueQuoted(cp);
          break;
        }
        case State.SELF_CLOSING_START_TAG: {
          this._stateSelfClosingStartTag(cp);
          break;
        }
        case State.BOGUS_COMMENT: {
          this._stateBogusComment(cp);
          break;
        }
        case State.MARKUP_DECLARATION_OPEN: {
          this._stateMarkupDeclarationOpen(cp);
          break;
        }
        case State.COMMENT_START: {
          this._stateCommentStart(cp);
          break;
        }
        case State.COMMENT_START_DASH: {
          this._stateCommentStartDash(cp);
          break;
        }
        case State.COMMENT: {
          this._stateComment(cp);
          break;
        }
        case State.COMMENT_LESS_THAN_SIGN: {
          this._stateCommentLessThanSign(cp);
          break;
        }
        case State.COMMENT_LESS_THAN_SIGN_BANG: {
          this._stateCommentLessThanSignBang(cp);
          break;
        }
        case State.COMMENT_LESS_THAN_SIGN_BANG_DASH: {
          this._stateCommentLessThanSignBangDash(cp);
          break;
        }
        case State.COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH: {
          this._stateCommentLessThanSignBangDashDash(cp);
          break;
        }
        case State.COMMENT_END_DASH: {
          this._stateCommentEndDash(cp);
          break;
        }
        case State.COMMENT_END: {
          this._stateCommentEnd(cp);
          break;
        }
        case State.COMMENT_END_BANG: {
          this._stateCommentEndBang(cp);
          break;
        }
        case State.DOCTYPE: {
          this._stateDoctype(cp);
          break;
        }
        case State.BEFORE_DOCTYPE_NAME: {
          this._stateBeforeDoctypeName(cp);
          break;
        }
        case State.DOCTYPE_NAME: {
          this._stateDoctypeName(cp);
          break;
        }
        case State.AFTER_DOCTYPE_NAME: {
          this._stateAfterDoctypeName(cp);
          break;
        }
        case State.AFTER_DOCTYPE_PUBLIC_KEYWORD: {
          this._stateAfterDoctypePublicKeyword(cp);
          break;
        }
        case State.BEFORE_DOCTYPE_PUBLIC_IDENTIFIER: {
          this._stateBeforeDoctypePublicIdentifier(cp);
          break;
        }
        case State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED: {
          this._stateDoctypePublicIdentifierDoubleQuoted(cp);
          break;
        }
        case State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED: {
          this._stateDoctypePublicIdentifierSingleQuoted(cp);
          break;
        }
        case State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER: {
          this._stateAfterDoctypePublicIdentifier(cp);
          break;
        }
        case State.BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS: {
          this._stateBetweenDoctypePublicAndSystemIdentifiers(cp);
          break;
        }
        case State.AFTER_DOCTYPE_SYSTEM_KEYWORD: {
          this._stateAfterDoctypeSystemKeyword(cp);
          break;
        }
        case State.BEFORE_DOCTYPE_SYSTEM_IDENTIFIER: {
          this._stateBeforeDoctypeSystemIdentifier(cp);
          break;
        }
        case State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED: {
          this._stateDoctypeSystemIdentifierDoubleQuoted(cp);
          break;
        }
        case State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED: {
          this._stateDoctypeSystemIdentifierSingleQuoted(cp);
          break;
        }
        case State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER: {
          this._stateAfterDoctypeSystemIdentifier(cp);
          break;
        }
        case State.BOGUS_DOCTYPE: {
          this._stateBogusDoctype(cp);
          break;
        }
        case State.CDATA_SECTION: {
          this._stateCdataSection(cp);
          break;
        }
        case State.CDATA_SECTION_BRACKET: {
          this._stateCdataSectionBracket(cp);
          break;
        }
        case State.CDATA_SECTION_END: {
          this._stateCdataSectionEnd(cp);
          break;
        }
        case State.CHARACTER_REFERENCE: {
          this._stateCharacterReference();
          break;
        }
        case State.AMBIGUOUS_AMPERSAND: {
          this._stateAmbiguousAmpersand(cp);
          break;
        }
        default: {
          throw new Error("Unknown state");
        }
      }
    }
    // State machine
    // Data state
    //------------------------------------------------------------------
    _stateData(cp) {
      switch (cp) {
        case CODE_POINTS.LESS_THAN_SIGN: {
          this.state = State.TAG_OPEN;
          break;
        }
        case CODE_POINTS.AMPERSAND: {
          this._startCharacterReference();
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this._emitCodePoint(cp);
          break;
        }
        case CODE_POINTS.EOF: {
          this._emitEOFToken();
          break;
        }
        default: {
          this._emitCodePoint(cp);
        }
      }
    }
    //  RCDATA state
    //------------------------------------------------------------------
    _stateRcdata(cp) {
      switch (cp) {
        case CODE_POINTS.AMPERSAND: {
          this._startCharacterReference();
          break;
        }
        case CODE_POINTS.LESS_THAN_SIGN: {
          this.state = State.RCDATA_LESS_THAN_SIGN;
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this._emitChars(REPLACEMENT_CHARACTER);
          break;
        }
        case CODE_POINTS.EOF: {
          this._emitEOFToken();
          break;
        }
        default: {
          this._emitCodePoint(cp);
        }
      }
    }
    // RAWTEXT state
    //------------------------------------------------------------------
    _stateRawtext(cp) {
      switch (cp) {
        case CODE_POINTS.LESS_THAN_SIGN: {
          this.state = State.RAWTEXT_LESS_THAN_SIGN;
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this._emitChars(REPLACEMENT_CHARACTER);
          break;
        }
        case CODE_POINTS.EOF: {
          this._emitEOFToken();
          break;
        }
        default: {
          this._emitCodePoint(cp);
        }
      }
    }
    // Script data state
    //------------------------------------------------------------------
    _stateScriptData(cp) {
      switch (cp) {
        case CODE_POINTS.LESS_THAN_SIGN: {
          this.state = State.SCRIPT_DATA_LESS_THAN_SIGN;
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this._emitChars(REPLACEMENT_CHARACTER);
          break;
        }
        case CODE_POINTS.EOF: {
          this._emitEOFToken();
          break;
        }
        default: {
          this._emitCodePoint(cp);
        }
      }
    }
    // PLAINTEXT state
    //------------------------------------------------------------------
    _statePlaintext(cp) {
      switch (cp) {
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this._emitChars(REPLACEMENT_CHARACTER);
          break;
        }
        case CODE_POINTS.EOF: {
          this._emitEOFToken();
          break;
        }
        default: {
          this._emitCodePoint(cp);
        }
      }
    }
    // Tag open state
    //------------------------------------------------------------------
    _stateTagOpen(cp) {
      if (isAsciiLetter(cp)) {
        this._createStartTagToken();
        this.state = State.TAG_NAME;
        this._stateTagName(cp);
      } else
        switch (cp) {
          case CODE_POINTS.EXCLAMATION_MARK: {
            this.state = State.MARKUP_DECLARATION_OPEN;
            break;
          }
          case CODE_POINTS.SOLIDUS: {
            this.state = State.END_TAG_OPEN;
            break;
          }
          case CODE_POINTS.QUESTION_MARK: {
            this._err(ERR.unexpectedQuestionMarkInsteadOfTagName);
            this._createCommentToken(1);
            this.state = State.BOGUS_COMMENT;
            this._stateBogusComment(cp);
            break;
          }
          case CODE_POINTS.EOF: {
            this._err(ERR.eofBeforeTagName);
            this._emitChars("<");
            this._emitEOFToken();
            break;
          }
          default: {
            this._err(ERR.invalidFirstCharacterOfTagName);
            this._emitChars("<");
            this.state = State.DATA;
            this._stateData(cp);
          }
        }
    }
    // End tag open state
    //------------------------------------------------------------------
    _stateEndTagOpen(cp) {
      if (isAsciiLetter(cp)) {
        this._createEndTagToken();
        this.state = State.TAG_NAME;
        this._stateTagName(cp);
      } else
        switch (cp) {
          case CODE_POINTS.GREATER_THAN_SIGN: {
            this._err(ERR.missingEndTagName);
            this.state = State.DATA;
            break;
          }
          case CODE_POINTS.EOF: {
            this._err(ERR.eofBeforeTagName);
            this._emitChars("</");
            this._emitEOFToken();
            break;
          }
          default: {
            this._err(ERR.invalidFirstCharacterOfTagName);
            this._createCommentToken(2);
            this.state = State.BOGUS_COMMENT;
            this._stateBogusComment(cp);
          }
        }
    }
    // Tag name state
    //------------------------------------------------------------------
    _stateTagName(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          this.state = State.BEFORE_ATTRIBUTE_NAME;
          break;
        }
        case CODE_POINTS.SOLIDUS: {
          this.state = State.SELF_CLOSING_START_TAG;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this.state = State.DATA;
          this.emitCurrentTagToken();
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          token.tagName += REPLACEMENT_CHARACTER;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInTag);
          this._emitEOFToken();
          break;
        }
        default: {
          token.tagName += String.fromCodePoint(isAsciiUpper(cp) ? toAsciiLower(cp) : cp);
        }
      }
    }
    // RCDATA less-than sign state
    //------------------------------------------------------------------
    _stateRcdataLessThanSign(cp) {
      if (cp === CODE_POINTS.SOLIDUS) {
        this.state = State.RCDATA_END_TAG_OPEN;
      } else {
        this._emitChars("<");
        this.state = State.RCDATA;
        this._stateRcdata(cp);
      }
    }
    // RCDATA end tag open state
    //------------------------------------------------------------------
    _stateRcdataEndTagOpen(cp) {
      if (isAsciiLetter(cp)) {
        this.state = State.RCDATA_END_TAG_NAME;
        this._stateRcdataEndTagName(cp);
      } else {
        this._emitChars("</");
        this.state = State.RCDATA;
        this._stateRcdata(cp);
      }
    }
    handleSpecialEndTag(_cp) {
      if (!this.preprocessor.startsWith(this.lastStartTagName, false)) {
        return !this._ensureHibernation();
      }
      this._createEndTagToken();
      const token = this.currentToken;
      token.tagName = this.lastStartTagName;
      const cp = this.preprocessor.peek(this.lastStartTagName.length);
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          this._advanceBy(this.lastStartTagName.length);
          this.state = State.BEFORE_ATTRIBUTE_NAME;
          return false;
        }
        case CODE_POINTS.SOLIDUS: {
          this._advanceBy(this.lastStartTagName.length);
          this.state = State.SELF_CLOSING_START_TAG;
          return false;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._advanceBy(this.lastStartTagName.length);
          this.emitCurrentTagToken();
          this.state = State.DATA;
          return false;
        }
        default: {
          return !this._ensureHibernation();
        }
      }
    }
    // RCDATA end tag name state
    //------------------------------------------------------------------
    _stateRcdataEndTagName(cp) {
      if (this.handleSpecialEndTag(cp)) {
        this._emitChars("</");
        this.state = State.RCDATA;
        this._stateRcdata(cp);
      }
    }
    // RAWTEXT less-than sign state
    //------------------------------------------------------------------
    _stateRawtextLessThanSign(cp) {
      if (cp === CODE_POINTS.SOLIDUS) {
        this.state = State.RAWTEXT_END_TAG_OPEN;
      } else {
        this._emitChars("<");
        this.state = State.RAWTEXT;
        this._stateRawtext(cp);
      }
    }
    // RAWTEXT end tag open state
    //------------------------------------------------------------------
    _stateRawtextEndTagOpen(cp) {
      if (isAsciiLetter(cp)) {
        this.state = State.RAWTEXT_END_TAG_NAME;
        this._stateRawtextEndTagName(cp);
      } else {
        this._emitChars("</");
        this.state = State.RAWTEXT;
        this._stateRawtext(cp);
      }
    }
    // RAWTEXT end tag name state
    //------------------------------------------------------------------
    _stateRawtextEndTagName(cp) {
      if (this.handleSpecialEndTag(cp)) {
        this._emitChars("</");
        this.state = State.RAWTEXT;
        this._stateRawtext(cp);
      }
    }
    // Script data less-than sign state
    //------------------------------------------------------------------
    _stateScriptDataLessThanSign(cp) {
      switch (cp) {
        case CODE_POINTS.SOLIDUS: {
          this.state = State.SCRIPT_DATA_END_TAG_OPEN;
          break;
        }
        case CODE_POINTS.EXCLAMATION_MARK: {
          this.state = State.SCRIPT_DATA_ESCAPE_START;
          this._emitChars("<!");
          break;
        }
        default: {
          this._emitChars("<");
          this.state = State.SCRIPT_DATA;
          this._stateScriptData(cp);
        }
      }
    }
    // Script data end tag open state
    //------------------------------------------------------------------
    _stateScriptDataEndTagOpen(cp) {
      if (isAsciiLetter(cp)) {
        this.state = State.SCRIPT_DATA_END_TAG_NAME;
        this._stateScriptDataEndTagName(cp);
      } else {
        this._emitChars("</");
        this.state = State.SCRIPT_DATA;
        this._stateScriptData(cp);
      }
    }
    // Script data end tag name state
    //------------------------------------------------------------------
    _stateScriptDataEndTagName(cp) {
      if (this.handleSpecialEndTag(cp)) {
        this._emitChars("</");
        this.state = State.SCRIPT_DATA;
        this._stateScriptData(cp);
      }
    }
    // Script data escape start state
    //------------------------------------------------------------------
    _stateScriptDataEscapeStart(cp) {
      if (cp === CODE_POINTS.HYPHEN_MINUS) {
        this.state = State.SCRIPT_DATA_ESCAPE_START_DASH;
        this._emitChars("-");
      } else {
        this.state = State.SCRIPT_DATA;
        this._stateScriptData(cp);
      }
    }
    // Script data escape start dash state
    //------------------------------------------------------------------
    _stateScriptDataEscapeStartDash(cp) {
      if (cp === CODE_POINTS.HYPHEN_MINUS) {
        this.state = State.SCRIPT_DATA_ESCAPED_DASH_DASH;
        this._emitChars("-");
      } else {
        this.state = State.SCRIPT_DATA;
        this._stateScriptData(cp);
      }
    }
    // Script data escaped state
    //------------------------------------------------------------------
    _stateScriptDataEscaped(cp) {
      switch (cp) {
        case CODE_POINTS.HYPHEN_MINUS: {
          this.state = State.SCRIPT_DATA_ESCAPED_DASH;
          this._emitChars("-");
          break;
        }
        case CODE_POINTS.LESS_THAN_SIGN: {
          this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this._emitChars(REPLACEMENT_CHARACTER);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInScriptHtmlCommentLikeText);
          this._emitEOFToken();
          break;
        }
        default: {
          this._emitCodePoint(cp);
        }
      }
    }
    // Script data escaped dash state
    //------------------------------------------------------------------
    _stateScriptDataEscapedDash(cp) {
      switch (cp) {
        case CODE_POINTS.HYPHEN_MINUS: {
          this.state = State.SCRIPT_DATA_ESCAPED_DASH_DASH;
          this._emitChars("-");
          break;
        }
        case CODE_POINTS.LESS_THAN_SIGN: {
          this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this.state = State.SCRIPT_DATA_ESCAPED;
          this._emitChars(REPLACEMENT_CHARACTER);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInScriptHtmlCommentLikeText);
          this._emitEOFToken();
          break;
        }
        default: {
          this.state = State.SCRIPT_DATA_ESCAPED;
          this._emitCodePoint(cp);
        }
      }
    }
    // Script data escaped dash dash state
    //------------------------------------------------------------------
    _stateScriptDataEscapedDashDash(cp) {
      switch (cp) {
        case CODE_POINTS.HYPHEN_MINUS: {
          this._emitChars("-");
          break;
        }
        case CODE_POINTS.LESS_THAN_SIGN: {
          this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this.state = State.SCRIPT_DATA;
          this._emitChars(">");
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this.state = State.SCRIPT_DATA_ESCAPED;
          this._emitChars(REPLACEMENT_CHARACTER);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInScriptHtmlCommentLikeText);
          this._emitEOFToken();
          break;
        }
        default: {
          this.state = State.SCRIPT_DATA_ESCAPED;
          this._emitCodePoint(cp);
        }
      }
    }
    // Script data escaped less-than sign state
    //------------------------------------------------------------------
    _stateScriptDataEscapedLessThanSign(cp) {
      if (cp === CODE_POINTS.SOLIDUS) {
        this.state = State.SCRIPT_DATA_ESCAPED_END_TAG_OPEN;
      } else if (isAsciiLetter(cp)) {
        this._emitChars("<");
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPE_START;
        this._stateScriptDataDoubleEscapeStart(cp);
      } else {
        this._emitChars("<");
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._stateScriptDataEscaped(cp);
      }
    }
    // Script data escaped end tag open state
    //------------------------------------------------------------------
    _stateScriptDataEscapedEndTagOpen(cp) {
      if (isAsciiLetter(cp)) {
        this.state = State.SCRIPT_DATA_ESCAPED_END_TAG_NAME;
        this._stateScriptDataEscapedEndTagName(cp);
      } else {
        this._emitChars("</");
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._stateScriptDataEscaped(cp);
      }
    }
    // Script data escaped end tag name state
    //------------------------------------------------------------------
    _stateScriptDataEscapedEndTagName(cp) {
      if (this.handleSpecialEndTag(cp)) {
        this._emitChars("</");
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._stateScriptDataEscaped(cp);
      }
    }
    // Script data double escape start state
    //------------------------------------------------------------------
    _stateScriptDataDoubleEscapeStart(cp) {
      if (this.preprocessor.startsWith(SEQUENCES.SCRIPT, false) && isScriptDataDoubleEscapeSequenceEnd(this.preprocessor.peek(SEQUENCES.SCRIPT.length))) {
        this._emitCodePoint(cp);
        for (let i = 0; i < SEQUENCES.SCRIPT.length; i++) {
          this._emitCodePoint(this._consume());
        }
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
      } else if (!this._ensureHibernation()) {
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._stateScriptDataEscaped(cp);
      }
    }
    // Script data double escaped state
    //------------------------------------------------------------------
    _stateScriptDataDoubleEscaped(cp) {
      switch (cp) {
        case CODE_POINTS.HYPHEN_MINUS: {
          this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH;
          this._emitChars("-");
          break;
        }
        case CODE_POINTS.LESS_THAN_SIGN: {
          this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN;
          this._emitChars("<");
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this._emitChars(REPLACEMENT_CHARACTER);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInScriptHtmlCommentLikeText);
          this._emitEOFToken();
          break;
        }
        default: {
          this._emitCodePoint(cp);
        }
      }
    }
    // Script data double escaped dash state
    //------------------------------------------------------------------
    _stateScriptDataDoubleEscapedDash(cp) {
      switch (cp) {
        case CODE_POINTS.HYPHEN_MINUS: {
          this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH;
          this._emitChars("-");
          break;
        }
        case CODE_POINTS.LESS_THAN_SIGN: {
          this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN;
          this._emitChars("<");
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
          this._emitChars(REPLACEMENT_CHARACTER);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInScriptHtmlCommentLikeText);
          this._emitEOFToken();
          break;
        }
        default: {
          this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
          this._emitCodePoint(cp);
        }
      }
    }
    // Script data double escaped dash dash state
    //------------------------------------------------------------------
    _stateScriptDataDoubleEscapedDashDash(cp) {
      switch (cp) {
        case CODE_POINTS.HYPHEN_MINUS: {
          this._emitChars("-");
          break;
        }
        case CODE_POINTS.LESS_THAN_SIGN: {
          this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN;
          this._emitChars("<");
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this.state = State.SCRIPT_DATA;
          this._emitChars(">");
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
          this._emitChars(REPLACEMENT_CHARACTER);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInScriptHtmlCommentLikeText);
          this._emitEOFToken();
          break;
        }
        default: {
          this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
          this._emitCodePoint(cp);
        }
      }
    }
    // Script data double escaped less-than sign state
    //------------------------------------------------------------------
    _stateScriptDataDoubleEscapedLessThanSign(cp) {
      if (cp === CODE_POINTS.SOLIDUS) {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPE_END;
        this._emitChars("/");
      } else {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
        this._stateScriptDataDoubleEscaped(cp);
      }
    }
    // Script data double escape end state
    //------------------------------------------------------------------
    _stateScriptDataDoubleEscapeEnd(cp) {
      if (this.preprocessor.startsWith(SEQUENCES.SCRIPT, false) && isScriptDataDoubleEscapeSequenceEnd(this.preprocessor.peek(SEQUENCES.SCRIPT.length))) {
        this._emitCodePoint(cp);
        for (let i = 0; i < SEQUENCES.SCRIPT.length; i++) {
          this._emitCodePoint(this._consume());
        }
        this.state = State.SCRIPT_DATA_ESCAPED;
      } else if (!this._ensureHibernation()) {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
        this._stateScriptDataDoubleEscaped(cp);
      }
    }
    // Before attribute name state
    //------------------------------------------------------------------
    _stateBeforeAttributeName(cp) {
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          break;
        }
        case CODE_POINTS.SOLIDUS:
        case CODE_POINTS.GREATER_THAN_SIGN:
        case CODE_POINTS.EOF: {
          this.state = State.AFTER_ATTRIBUTE_NAME;
          this._stateAfterAttributeName(cp);
          break;
        }
        case CODE_POINTS.EQUALS_SIGN: {
          this._err(ERR.unexpectedEqualsSignBeforeAttributeName);
          this._createAttr("=");
          this.state = State.ATTRIBUTE_NAME;
          break;
        }
        default: {
          this._createAttr("");
          this.state = State.ATTRIBUTE_NAME;
          this._stateAttributeName(cp);
        }
      }
    }
    // Attribute name state
    //------------------------------------------------------------------
    _stateAttributeName(cp) {
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED:
        case CODE_POINTS.SOLIDUS:
        case CODE_POINTS.GREATER_THAN_SIGN:
        case CODE_POINTS.EOF: {
          this._leaveAttrName();
          this.state = State.AFTER_ATTRIBUTE_NAME;
          this._stateAfterAttributeName(cp);
          break;
        }
        case CODE_POINTS.EQUALS_SIGN: {
          this._leaveAttrName();
          this.state = State.BEFORE_ATTRIBUTE_VALUE;
          break;
        }
        case CODE_POINTS.QUOTATION_MARK:
        case CODE_POINTS.APOSTROPHE:
        case CODE_POINTS.LESS_THAN_SIGN: {
          this._err(ERR.unexpectedCharacterInAttributeName);
          this.currentAttr.name += String.fromCodePoint(cp);
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this.currentAttr.name += REPLACEMENT_CHARACTER;
          break;
        }
        default: {
          this.currentAttr.name += String.fromCodePoint(isAsciiUpper(cp) ? toAsciiLower(cp) : cp);
        }
      }
    }
    // After attribute name state
    //------------------------------------------------------------------
    _stateAfterAttributeName(cp) {
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          break;
        }
        case CODE_POINTS.SOLIDUS: {
          this.state = State.SELF_CLOSING_START_TAG;
          break;
        }
        case CODE_POINTS.EQUALS_SIGN: {
          this.state = State.BEFORE_ATTRIBUTE_VALUE;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this.state = State.DATA;
          this.emitCurrentTagToken();
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInTag);
          this._emitEOFToken();
          break;
        }
        default: {
          this._createAttr("");
          this.state = State.ATTRIBUTE_NAME;
          this._stateAttributeName(cp);
        }
      }
    }
    // Before attribute value state
    //------------------------------------------------------------------
    _stateBeforeAttributeValue(cp) {
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          break;
        }
        case CODE_POINTS.QUOTATION_MARK: {
          this.state = State.ATTRIBUTE_VALUE_DOUBLE_QUOTED;
          break;
        }
        case CODE_POINTS.APOSTROPHE: {
          this.state = State.ATTRIBUTE_VALUE_SINGLE_QUOTED;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.missingAttributeValue);
          this.state = State.DATA;
          this.emitCurrentTagToken();
          break;
        }
        default: {
          this.state = State.ATTRIBUTE_VALUE_UNQUOTED;
          this._stateAttributeValueUnquoted(cp);
        }
      }
    }
    // Attribute value (double-quoted) state
    //------------------------------------------------------------------
    _stateAttributeValueDoubleQuoted(cp) {
      switch (cp) {
        case CODE_POINTS.QUOTATION_MARK: {
          this.state = State.AFTER_ATTRIBUTE_VALUE_QUOTED;
          break;
        }
        case CODE_POINTS.AMPERSAND: {
          this._startCharacterReference();
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this.currentAttr.value += REPLACEMENT_CHARACTER;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInTag);
          this._emitEOFToken();
          break;
        }
        default: {
          this.currentAttr.value += String.fromCodePoint(cp);
        }
      }
    }
    // Attribute value (single-quoted) state
    //------------------------------------------------------------------
    _stateAttributeValueSingleQuoted(cp) {
      switch (cp) {
        case CODE_POINTS.APOSTROPHE: {
          this.state = State.AFTER_ATTRIBUTE_VALUE_QUOTED;
          break;
        }
        case CODE_POINTS.AMPERSAND: {
          this._startCharacterReference();
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this.currentAttr.value += REPLACEMENT_CHARACTER;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInTag);
          this._emitEOFToken();
          break;
        }
        default: {
          this.currentAttr.value += String.fromCodePoint(cp);
        }
      }
    }
    // Attribute value (unquoted) state
    //------------------------------------------------------------------
    _stateAttributeValueUnquoted(cp) {
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          this._leaveAttrValue();
          this.state = State.BEFORE_ATTRIBUTE_NAME;
          break;
        }
        case CODE_POINTS.AMPERSAND: {
          this._startCharacterReference();
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._leaveAttrValue();
          this.state = State.DATA;
          this.emitCurrentTagToken();
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this.currentAttr.value += REPLACEMENT_CHARACTER;
          break;
        }
        case CODE_POINTS.QUOTATION_MARK:
        case CODE_POINTS.APOSTROPHE:
        case CODE_POINTS.LESS_THAN_SIGN:
        case CODE_POINTS.EQUALS_SIGN:
        case CODE_POINTS.GRAVE_ACCENT: {
          this._err(ERR.unexpectedCharacterInUnquotedAttributeValue);
          this.currentAttr.value += String.fromCodePoint(cp);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInTag);
          this._emitEOFToken();
          break;
        }
        default: {
          this.currentAttr.value += String.fromCodePoint(cp);
        }
      }
    }
    // After attribute value (quoted) state
    //------------------------------------------------------------------
    _stateAfterAttributeValueQuoted(cp) {
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          this._leaveAttrValue();
          this.state = State.BEFORE_ATTRIBUTE_NAME;
          break;
        }
        case CODE_POINTS.SOLIDUS: {
          this._leaveAttrValue();
          this.state = State.SELF_CLOSING_START_TAG;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._leaveAttrValue();
          this.state = State.DATA;
          this.emitCurrentTagToken();
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInTag);
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(ERR.missingWhitespaceBetweenAttributes);
          this.state = State.BEFORE_ATTRIBUTE_NAME;
          this._stateBeforeAttributeName(cp);
        }
      }
    }
    // Self-closing start tag state
    //------------------------------------------------------------------
    _stateSelfClosingStartTag(cp) {
      switch (cp) {
        case CODE_POINTS.GREATER_THAN_SIGN: {
          const token = this.currentToken;
          token.selfClosing = true;
          this.state = State.DATA;
          this.emitCurrentTagToken();
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInTag);
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(ERR.unexpectedSolidusInTag);
          this.state = State.BEFORE_ATTRIBUTE_NAME;
          this._stateBeforeAttributeName(cp);
        }
      }
    }
    // Bogus comment state
    //------------------------------------------------------------------
    _stateBogusComment(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this.state = State.DATA;
          this.emitCurrentComment(token);
          break;
        }
        case CODE_POINTS.EOF: {
          this.emitCurrentComment(token);
          this._emitEOFToken();
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          token.data += REPLACEMENT_CHARACTER;
          break;
        }
        default: {
          token.data += String.fromCodePoint(cp);
        }
      }
    }
    // Markup declaration open state
    //------------------------------------------------------------------
    _stateMarkupDeclarationOpen(cp) {
      if (this._consumeSequenceIfMatch(SEQUENCES.DASH_DASH, true)) {
        this._createCommentToken(SEQUENCES.DASH_DASH.length + 1);
        this.state = State.COMMENT_START;
      } else if (this._consumeSequenceIfMatch(SEQUENCES.DOCTYPE, false)) {
        this.currentLocation = this.getCurrentLocation(SEQUENCES.DOCTYPE.length + 1);
        this.state = State.DOCTYPE;
      } else if (this._consumeSequenceIfMatch(SEQUENCES.CDATA_START, true)) {
        if (this.inForeignNode) {
          this.state = State.CDATA_SECTION;
        } else {
          this._err(ERR.cdataInHtmlContent);
          this._createCommentToken(SEQUENCES.CDATA_START.length + 1);
          this.currentToken.data = "[CDATA[";
          this.state = State.BOGUS_COMMENT;
        }
      } else if (!this._ensureHibernation()) {
        this._err(ERR.incorrectlyOpenedComment);
        this._createCommentToken(2);
        this.state = State.BOGUS_COMMENT;
        this._stateBogusComment(cp);
      }
    }
    // Comment start state
    //------------------------------------------------------------------
    _stateCommentStart(cp) {
      switch (cp) {
        case CODE_POINTS.HYPHEN_MINUS: {
          this.state = State.COMMENT_START_DASH;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.abruptClosingOfEmptyComment);
          this.state = State.DATA;
          const token = this.currentToken;
          this.emitCurrentComment(token);
          break;
        }
        default: {
          this.state = State.COMMENT;
          this._stateComment(cp);
        }
      }
    }
    // Comment start dash state
    //------------------------------------------------------------------
    _stateCommentStartDash(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.HYPHEN_MINUS: {
          this.state = State.COMMENT_END;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.abruptClosingOfEmptyComment);
          this.state = State.DATA;
          this.emitCurrentComment(token);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInComment);
          this.emitCurrentComment(token);
          this._emitEOFToken();
          break;
        }
        default: {
          token.data += "-";
          this.state = State.COMMENT;
          this._stateComment(cp);
        }
      }
    }
    // Comment state
    //------------------------------------------------------------------
    _stateComment(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.HYPHEN_MINUS: {
          this.state = State.COMMENT_END_DASH;
          break;
        }
        case CODE_POINTS.LESS_THAN_SIGN: {
          token.data += "<";
          this.state = State.COMMENT_LESS_THAN_SIGN;
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          token.data += REPLACEMENT_CHARACTER;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInComment);
          this.emitCurrentComment(token);
          this._emitEOFToken();
          break;
        }
        default: {
          token.data += String.fromCodePoint(cp);
        }
      }
    }
    // Comment less-than sign state
    //------------------------------------------------------------------
    _stateCommentLessThanSign(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.EXCLAMATION_MARK: {
          token.data += "!";
          this.state = State.COMMENT_LESS_THAN_SIGN_BANG;
          break;
        }
        case CODE_POINTS.LESS_THAN_SIGN: {
          token.data += "<";
          break;
        }
        default: {
          this.state = State.COMMENT;
          this._stateComment(cp);
        }
      }
    }
    // Comment less-than sign bang state
    //------------------------------------------------------------------
    _stateCommentLessThanSignBang(cp) {
      if (cp === CODE_POINTS.HYPHEN_MINUS) {
        this.state = State.COMMENT_LESS_THAN_SIGN_BANG_DASH;
      } else {
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
    // Comment less-than sign bang dash state
    //------------------------------------------------------------------
    _stateCommentLessThanSignBangDash(cp) {
      if (cp === CODE_POINTS.HYPHEN_MINUS) {
        this.state = State.COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH;
      } else {
        this.state = State.COMMENT_END_DASH;
        this._stateCommentEndDash(cp);
      }
    }
    // Comment less-than sign bang dash dash state
    //------------------------------------------------------------------
    _stateCommentLessThanSignBangDashDash(cp) {
      if (cp !== CODE_POINTS.GREATER_THAN_SIGN && cp !== CODE_POINTS.EOF) {
        this._err(ERR.nestedComment);
      }
      this.state = State.COMMENT_END;
      this._stateCommentEnd(cp);
    }
    // Comment end dash state
    //------------------------------------------------------------------
    _stateCommentEndDash(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.HYPHEN_MINUS: {
          this.state = State.COMMENT_END;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInComment);
          this.emitCurrentComment(token);
          this._emitEOFToken();
          break;
        }
        default: {
          token.data += "-";
          this.state = State.COMMENT;
          this._stateComment(cp);
        }
      }
    }
    // Comment end state
    //------------------------------------------------------------------
    _stateCommentEnd(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this.state = State.DATA;
          this.emitCurrentComment(token);
          break;
        }
        case CODE_POINTS.EXCLAMATION_MARK: {
          this.state = State.COMMENT_END_BANG;
          break;
        }
        case CODE_POINTS.HYPHEN_MINUS: {
          token.data += "-";
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInComment);
          this.emitCurrentComment(token);
          this._emitEOFToken();
          break;
        }
        default: {
          token.data += "--";
          this.state = State.COMMENT;
          this._stateComment(cp);
        }
      }
    }
    // Comment end bang state
    //------------------------------------------------------------------
    _stateCommentEndBang(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.HYPHEN_MINUS: {
          token.data += "--!";
          this.state = State.COMMENT_END_DASH;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.incorrectlyClosedComment);
          this.state = State.DATA;
          this.emitCurrentComment(token);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInComment);
          this.emitCurrentComment(token);
          this._emitEOFToken();
          break;
        }
        default: {
          token.data += "--!";
          this.state = State.COMMENT;
          this._stateComment(cp);
        }
      }
    }
    // DOCTYPE state
    //------------------------------------------------------------------
    _stateDoctype(cp) {
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          this.state = State.BEFORE_DOCTYPE_NAME;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this.state = State.BEFORE_DOCTYPE_NAME;
          this._stateBeforeDoctypeName(cp);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          this._createDoctypeToken(null);
          const token = this.currentToken;
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(ERR.missingWhitespaceBeforeDoctypeName);
          this.state = State.BEFORE_DOCTYPE_NAME;
          this._stateBeforeDoctypeName(cp);
        }
      }
    }
    // Before DOCTYPE name state
    //------------------------------------------------------------------
    _stateBeforeDoctypeName(cp) {
      if (isAsciiUpper(cp)) {
        this._createDoctypeToken(String.fromCharCode(toAsciiLower(cp)));
        this.state = State.DOCTYPE_NAME;
      } else
        switch (cp) {
          case CODE_POINTS.SPACE:
          case CODE_POINTS.LINE_FEED:
          case CODE_POINTS.TABULATION:
          case CODE_POINTS.FORM_FEED: {
            break;
          }
          case CODE_POINTS.NULL: {
            this._err(ERR.unexpectedNullCharacter);
            this._createDoctypeToken(REPLACEMENT_CHARACTER);
            this.state = State.DOCTYPE_NAME;
            break;
          }
          case CODE_POINTS.GREATER_THAN_SIGN: {
            this._err(ERR.missingDoctypeName);
            this._createDoctypeToken(null);
            const token = this.currentToken;
            token.forceQuirks = true;
            this.emitCurrentDoctype(token);
            this.state = State.DATA;
            break;
          }
          case CODE_POINTS.EOF: {
            this._err(ERR.eofInDoctype);
            this._createDoctypeToken(null);
            const token = this.currentToken;
            token.forceQuirks = true;
            this.emitCurrentDoctype(token);
            this._emitEOFToken();
            break;
          }
          default: {
            this._createDoctypeToken(String.fromCodePoint(cp));
            this.state = State.DOCTYPE_NAME;
          }
        }
    }
    // DOCTYPE name state
    //------------------------------------------------------------------
    _stateDoctypeName(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          this.state = State.AFTER_DOCTYPE_NAME;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this.state = State.DATA;
          this.emitCurrentDoctype(token);
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          token.name += REPLACEMENT_CHARACTER;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          token.name += String.fromCodePoint(isAsciiUpper(cp) ? toAsciiLower(cp) : cp);
        }
      }
    }
    // After DOCTYPE name state
    //------------------------------------------------------------------
    _stateAfterDoctypeName(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this.state = State.DATA;
          this.emitCurrentDoctype(token);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          if (this._consumeSequenceIfMatch(SEQUENCES.PUBLIC, false)) {
            this.state = State.AFTER_DOCTYPE_PUBLIC_KEYWORD;
          } else if (this._consumeSequenceIfMatch(SEQUENCES.SYSTEM, false)) {
            this.state = State.AFTER_DOCTYPE_SYSTEM_KEYWORD;
          } else if (!this._ensureHibernation()) {
            this._err(ERR.invalidCharacterSequenceAfterDoctypeName);
            token.forceQuirks = true;
            this.state = State.BOGUS_DOCTYPE;
            this._stateBogusDoctype(cp);
          }
        }
      }
    }
    // After DOCTYPE public keyword state
    //------------------------------------------------------------------
    _stateAfterDoctypePublicKeyword(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          this.state = State.BEFORE_DOCTYPE_PUBLIC_IDENTIFIER;
          break;
        }
        case CODE_POINTS.QUOTATION_MARK: {
          this._err(ERR.missingWhitespaceAfterDoctypePublicKeyword);
          token.publicId = "";
          this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED;
          break;
        }
        case CODE_POINTS.APOSTROPHE: {
          this._err(ERR.missingWhitespaceAfterDoctypePublicKeyword);
          token.publicId = "";
          this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.missingDoctypePublicIdentifier);
          token.forceQuirks = true;
          this.state = State.DATA;
          this.emitCurrentDoctype(token);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(ERR.missingQuoteBeforeDoctypePublicIdentifier);
          token.forceQuirks = true;
          this.state = State.BOGUS_DOCTYPE;
          this._stateBogusDoctype(cp);
        }
      }
    }
    // Before DOCTYPE public identifier state
    //------------------------------------------------------------------
    _stateBeforeDoctypePublicIdentifier(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          break;
        }
        case CODE_POINTS.QUOTATION_MARK: {
          token.publicId = "";
          this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED;
          break;
        }
        case CODE_POINTS.APOSTROPHE: {
          token.publicId = "";
          this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.missingDoctypePublicIdentifier);
          token.forceQuirks = true;
          this.state = State.DATA;
          this.emitCurrentDoctype(token);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(ERR.missingQuoteBeforeDoctypePublicIdentifier);
          token.forceQuirks = true;
          this.state = State.BOGUS_DOCTYPE;
          this._stateBogusDoctype(cp);
        }
      }
    }
    // DOCTYPE public identifier (double-quoted) state
    //------------------------------------------------------------------
    _stateDoctypePublicIdentifierDoubleQuoted(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.QUOTATION_MARK: {
          this.state = State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER;
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          token.publicId += REPLACEMENT_CHARACTER;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.abruptDoctypePublicIdentifier);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this.state = State.DATA;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          token.publicId += String.fromCodePoint(cp);
        }
      }
    }
    // DOCTYPE public identifier (single-quoted) state
    //------------------------------------------------------------------
    _stateDoctypePublicIdentifierSingleQuoted(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.APOSTROPHE: {
          this.state = State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER;
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          token.publicId += REPLACEMENT_CHARACTER;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.abruptDoctypePublicIdentifier);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this.state = State.DATA;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          token.publicId += String.fromCodePoint(cp);
        }
      }
    }
    // After DOCTYPE public identifier state
    //------------------------------------------------------------------
    _stateAfterDoctypePublicIdentifier(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          this.state = State.BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this.state = State.DATA;
          this.emitCurrentDoctype(token);
          break;
        }
        case CODE_POINTS.QUOTATION_MARK: {
          this._err(ERR.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers);
          token.systemId = "";
          this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
          break;
        }
        case CODE_POINTS.APOSTROPHE: {
          this._err(ERR.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers);
          token.systemId = "";
          this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier);
          token.forceQuirks = true;
          this.state = State.BOGUS_DOCTYPE;
          this._stateBogusDoctype(cp);
        }
      }
    }
    // Between DOCTYPE public and system identifiers state
    //------------------------------------------------------------------
    _stateBetweenDoctypePublicAndSystemIdentifiers(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this.emitCurrentDoctype(token);
          this.state = State.DATA;
          break;
        }
        case CODE_POINTS.QUOTATION_MARK: {
          token.systemId = "";
          this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
          break;
        }
        case CODE_POINTS.APOSTROPHE: {
          token.systemId = "";
          this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier);
          token.forceQuirks = true;
          this.state = State.BOGUS_DOCTYPE;
          this._stateBogusDoctype(cp);
        }
      }
    }
    // After DOCTYPE system keyword state
    //------------------------------------------------------------------
    _stateAfterDoctypeSystemKeyword(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          this.state = State.BEFORE_DOCTYPE_SYSTEM_IDENTIFIER;
          break;
        }
        case CODE_POINTS.QUOTATION_MARK: {
          this._err(ERR.missingWhitespaceAfterDoctypeSystemKeyword);
          token.systemId = "";
          this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
          break;
        }
        case CODE_POINTS.APOSTROPHE: {
          this._err(ERR.missingWhitespaceAfterDoctypeSystemKeyword);
          token.systemId = "";
          this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.missingDoctypeSystemIdentifier);
          token.forceQuirks = true;
          this.state = State.DATA;
          this.emitCurrentDoctype(token);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier);
          token.forceQuirks = true;
          this.state = State.BOGUS_DOCTYPE;
          this._stateBogusDoctype(cp);
        }
      }
    }
    // Before DOCTYPE system identifier state
    //------------------------------------------------------------------
    _stateBeforeDoctypeSystemIdentifier(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          break;
        }
        case CODE_POINTS.QUOTATION_MARK: {
          token.systemId = "";
          this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
          break;
        }
        case CODE_POINTS.APOSTROPHE: {
          token.systemId = "";
          this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.missingDoctypeSystemIdentifier);
          token.forceQuirks = true;
          this.state = State.DATA;
          this.emitCurrentDoctype(token);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier);
          token.forceQuirks = true;
          this.state = State.BOGUS_DOCTYPE;
          this._stateBogusDoctype(cp);
        }
      }
    }
    // DOCTYPE system identifier (double-quoted) state
    //------------------------------------------------------------------
    _stateDoctypeSystemIdentifierDoubleQuoted(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.QUOTATION_MARK: {
          this.state = State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER;
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          token.systemId += REPLACEMENT_CHARACTER;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.abruptDoctypeSystemIdentifier);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this.state = State.DATA;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          token.systemId += String.fromCodePoint(cp);
        }
      }
    }
    // DOCTYPE system identifier (single-quoted) state
    //------------------------------------------------------------------
    _stateDoctypeSystemIdentifierSingleQuoted(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.APOSTROPHE: {
          this.state = State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER;
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          token.systemId += REPLACEMENT_CHARACTER;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.abruptDoctypeSystemIdentifier);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this.state = State.DATA;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          token.systemId += String.fromCodePoint(cp);
        }
      }
    }
    // After DOCTYPE system identifier state
    //------------------------------------------------------------------
    _stateAfterDoctypeSystemIdentifier(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this.emitCurrentDoctype(token);
          this.state = State.DATA;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(ERR.unexpectedCharacterAfterDoctypeSystemIdentifier);
          this.state = State.BOGUS_DOCTYPE;
          this._stateBogusDoctype(cp);
        }
      }
    }
    // Bogus DOCTYPE state
    //------------------------------------------------------------------
    _stateBogusDoctype(cp) {
      const token = this.currentToken;
      switch (cp) {
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this.emitCurrentDoctype(token);
          this.state = State.DATA;
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          break;
        }
        case CODE_POINTS.EOF: {
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default:
      }
    }
    // CDATA section state
    //------------------------------------------------------------------
    _stateCdataSection(cp) {
      switch (cp) {
        case CODE_POINTS.RIGHT_SQUARE_BRACKET: {
          this.state = State.CDATA_SECTION_BRACKET;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInCdata);
          this._emitEOFToken();
          break;
        }
        default: {
          this._emitCodePoint(cp);
        }
      }
    }
    // CDATA section bracket state
    //------------------------------------------------------------------
    _stateCdataSectionBracket(cp) {
      if (cp === CODE_POINTS.RIGHT_SQUARE_BRACKET) {
        this.state = State.CDATA_SECTION_END;
      } else {
        this._emitChars("]");
        this.state = State.CDATA_SECTION;
        this._stateCdataSection(cp);
      }
    }
    // CDATA section end state
    //------------------------------------------------------------------
    _stateCdataSectionEnd(cp) {
      switch (cp) {
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this.state = State.DATA;
          break;
        }
        case CODE_POINTS.RIGHT_SQUARE_BRACKET: {
          this._emitChars("]");
          break;
        }
        default: {
          this._emitChars("]]");
          this.state = State.CDATA_SECTION;
          this._stateCdataSection(cp);
        }
      }
    }
    // Character reference state
    //------------------------------------------------------------------
    _stateCharacterReference() {
      let length2 = this.entityDecoder.write(this.preprocessor.html, this.preprocessor.pos);
      if (length2 < 0) {
        if (this.preprocessor.lastChunkWritten) {
          length2 = this.entityDecoder.end();
        } else {
          this.active = false;
          this.preprocessor.pos = this.preprocessor.html.length - 1;
          this.consumedAfterSnapshot = 0;
          this.preprocessor.endOfChunkHit = true;
          return;
        }
      }
      if (length2 === 0) {
        this.preprocessor.pos = this.entityStartPos;
        this._flushCodePointConsumedAsCharacterReference(CODE_POINTS.AMPERSAND);
        this.state = !this._isCharacterReferenceInAttribute() && isAsciiAlphaNumeric(this.preprocessor.peek(1)) ? State.AMBIGUOUS_AMPERSAND : this.returnState;
      } else {
        this.state = this.returnState;
      }
    }
    // Ambiguos ampersand state
    //------------------------------------------------------------------
    _stateAmbiguousAmpersand(cp) {
      if (isAsciiAlphaNumeric(cp)) {
        this._flushCodePointConsumedAsCharacterReference(cp);
      } else {
        if (cp === CODE_POINTS.SEMICOLON) {
          this._err(ERR.unknownNamedCharacterReference);
        }
        this.state = this.returnState;
        this._callState(cp);
      }
    }
  };

  // ../../engine-v2/node_modules/parse5/dist/parser/open-element-stack.js
  var IMPLICIT_END_TAG_REQUIRED = /* @__PURE__ */ new Set([TAG_ID.DD, TAG_ID.DT, TAG_ID.LI, TAG_ID.OPTGROUP, TAG_ID.OPTION, TAG_ID.P, TAG_ID.RB, TAG_ID.RP, TAG_ID.RT, TAG_ID.RTC]);
  var IMPLICIT_END_TAG_REQUIRED_THOROUGHLY = /* @__PURE__ */ new Set([
    ...IMPLICIT_END_TAG_REQUIRED,
    TAG_ID.CAPTION,
    TAG_ID.COLGROUP,
    TAG_ID.TBODY,
    TAG_ID.TD,
    TAG_ID.TFOOT,
    TAG_ID.TH,
    TAG_ID.THEAD,
    TAG_ID.TR
  ]);
  var SCOPING_ELEMENTS_HTML = /* @__PURE__ */ new Set([
    TAG_ID.APPLET,
    TAG_ID.CAPTION,
    TAG_ID.HTML,
    TAG_ID.MARQUEE,
    TAG_ID.OBJECT,
    TAG_ID.TABLE,
    TAG_ID.TD,
    TAG_ID.TEMPLATE,
    TAG_ID.TH
  ]);
  var SCOPING_ELEMENTS_HTML_LIST = /* @__PURE__ */ new Set([...SCOPING_ELEMENTS_HTML, TAG_ID.OL, TAG_ID.UL]);
  var SCOPING_ELEMENTS_HTML_BUTTON = /* @__PURE__ */ new Set([...SCOPING_ELEMENTS_HTML, TAG_ID.BUTTON]);
  var SCOPING_ELEMENTS_MATHML = /* @__PURE__ */ new Set([TAG_ID.ANNOTATION_XML, TAG_ID.MI, TAG_ID.MN, TAG_ID.MO, TAG_ID.MS, TAG_ID.MTEXT]);
  var SCOPING_ELEMENTS_SVG = /* @__PURE__ */ new Set([TAG_ID.DESC, TAG_ID.FOREIGN_OBJECT, TAG_ID.TITLE]);
  var TABLE_ROW_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TR, TAG_ID.TEMPLATE, TAG_ID.HTML]);
  var TABLE_BODY_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TBODY, TAG_ID.TFOOT, TAG_ID.THEAD, TAG_ID.TEMPLATE, TAG_ID.HTML]);
  var TABLE_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TABLE, TAG_ID.TEMPLATE, TAG_ID.HTML]);
  var TABLE_CELLS = /* @__PURE__ */ new Set([TAG_ID.TD, TAG_ID.TH]);
  var OpenElementStack = class {
    get currentTmplContentOrNode() {
      return this._isInTemplate() ? this.treeAdapter.getTemplateContent(this.current) : this.current;
    }
    constructor(document, treeAdapter, handler) {
      this.treeAdapter = treeAdapter;
      this.handler = handler;
      this.items = [];
      this.tagIDs = [];
      this.stackTop = -1;
      this.tmplCount = 0;
      this.currentTagId = TAG_ID.UNKNOWN;
      this.current = document;
    }
    //Index of element
    _indexOf(element) {
      return this.items.lastIndexOf(element, this.stackTop);
    }
    //Update current element
    _isInTemplate() {
      return this.currentTagId === TAG_ID.TEMPLATE && this.treeAdapter.getNamespaceURI(this.current) === NS.HTML;
    }
    _updateCurrentElement() {
      this.current = this.items[this.stackTop];
      this.currentTagId = this.tagIDs[this.stackTop];
    }
    //Mutations
    push(element, tagID) {
      this.stackTop++;
      this.items[this.stackTop] = element;
      this.current = element;
      this.tagIDs[this.stackTop] = tagID;
      this.currentTagId = tagID;
      if (this._isInTemplate()) {
        this.tmplCount++;
      }
      this.handler.onItemPush(element, tagID, true);
    }
    pop() {
      const popped = this.current;
      if (this.tmplCount > 0 && this._isInTemplate()) {
        this.tmplCount--;
      }
      this.stackTop--;
      this._updateCurrentElement();
      this.handler.onItemPop(popped, true);
    }
    replace(oldElement, newElement) {
      const idx = this._indexOf(oldElement);
      this.items[idx] = newElement;
      if (idx === this.stackTop) {
        this.current = newElement;
      }
    }
    insertAfter(referenceElement, newElement, newElementID) {
      const insertionIdx = this._indexOf(referenceElement) + 1;
      this.items.splice(insertionIdx, 0, newElement);
      this.tagIDs.splice(insertionIdx, 0, newElementID);
      this.stackTop++;
      if (insertionIdx === this.stackTop) {
        this._updateCurrentElement();
      }
      if (this.current && this.currentTagId !== void 0) {
        this.handler.onItemPush(this.current, this.currentTagId, insertionIdx === this.stackTop);
      }
    }
    popUntilTagNamePopped(tagName) {
      let targetIdx = this.stackTop + 1;
      do {
        targetIdx = this.tagIDs.lastIndexOf(tagName, targetIdx - 1);
      } while (targetIdx > 0 && this.treeAdapter.getNamespaceURI(this.items[targetIdx]) !== NS.HTML);
      this.shortenToLength(Math.max(targetIdx, 0));
    }
    shortenToLength(idx) {
      while (this.stackTop >= idx) {
        const popped = this.current;
        if (this.tmplCount > 0 && this._isInTemplate()) {
          this.tmplCount -= 1;
        }
        this.stackTop--;
        this._updateCurrentElement();
        this.handler.onItemPop(popped, this.stackTop < idx);
      }
    }
    popUntilElementPopped(element) {
      const idx = this._indexOf(element);
      this.shortenToLength(Math.max(idx, 0));
    }
    popUntilPopped(tagNames, targetNS) {
      const idx = this._indexOfTagNames(tagNames, targetNS);
      this.shortenToLength(Math.max(idx, 0));
    }
    popUntilNumberedHeaderPopped() {
      this.popUntilPopped(NUMBERED_HEADERS, NS.HTML);
    }
    popUntilTableCellPopped() {
      this.popUntilPopped(TABLE_CELLS, NS.HTML);
    }
    popAllUpToHtmlElement() {
      this.tmplCount = 0;
      this.shortenToLength(1);
    }
    _indexOfTagNames(tagNames, namespace) {
      for (let i = this.stackTop; i >= 0; i--) {
        if (tagNames.has(this.tagIDs[i]) && this.treeAdapter.getNamespaceURI(this.items[i]) === namespace) {
          return i;
        }
      }
      return -1;
    }
    clearBackTo(tagNames, targetNS) {
      const idx = this._indexOfTagNames(tagNames, targetNS);
      this.shortenToLength(idx + 1);
    }
    clearBackToTableContext() {
      this.clearBackTo(TABLE_CONTEXT, NS.HTML);
    }
    clearBackToTableBodyContext() {
      this.clearBackTo(TABLE_BODY_CONTEXT, NS.HTML);
    }
    clearBackToTableRowContext() {
      this.clearBackTo(TABLE_ROW_CONTEXT, NS.HTML);
    }
    remove(element) {
      const idx = this._indexOf(element);
      if (idx >= 0) {
        if (idx === this.stackTop) {
          this.pop();
        } else {
          this.items.splice(idx, 1);
          this.tagIDs.splice(idx, 1);
          this.stackTop--;
          this._updateCurrentElement();
          this.handler.onItemPop(element, false);
        }
      }
    }
    //Search
    tryPeekProperlyNestedBodyElement() {
      return this.stackTop >= 1 && this.tagIDs[1] === TAG_ID.BODY ? this.items[1] : null;
    }
    contains(element) {
      return this._indexOf(element) > -1;
    }
    getCommonAncestor(element) {
      const elementIdx = this._indexOf(element) - 1;
      return elementIdx >= 0 ? this.items[elementIdx] : null;
    }
    isRootHtmlElementCurrent() {
      return this.stackTop === 0 && this.tagIDs[0] === TAG_ID.HTML;
    }
    //Element in scope
    hasInDynamicScope(tagName, htmlScope) {
      for (let i = this.stackTop; i >= 0; i--) {
        const tn = this.tagIDs[i];
        switch (this.treeAdapter.getNamespaceURI(this.items[i])) {
          case NS.HTML: {
            if (tn === tagName)
              return true;
            if (htmlScope.has(tn))
              return false;
            break;
          }
          case NS.SVG: {
            if (SCOPING_ELEMENTS_SVG.has(tn))
              return false;
            break;
          }
          case NS.MATHML: {
            if (SCOPING_ELEMENTS_MATHML.has(tn))
              return false;
            break;
          }
        }
      }
      return true;
    }
    hasInScope(tagName) {
      return this.hasInDynamicScope(tagName, SCOPING_ELEMENTS_HTML);
    }
    hasInListItemScope(tagName) {
      return this.hasInDynamicScope(tagName, SCOPING_ELEMENTS_HTML_LIST);
    }
    hasInButtonScope(tagName) {
      return this.hasInDynamicScope(tagName, SCOPING_ELEMENTS_HTML_BUTTON);
    }
    hasNumberedHeaderInScope() {
      for (let i = this.stackTop; i >= 0; i--) {
        const tn = this.tagIDs[i];
        switch (this.treeAdapter.getNamespaceURI(this.items[i])) {
          case NS.HTML: {
            if (NUMBERED_HEADERS.has(tn))
              return true;
            if (SCOPING_ELEMENTS_HTML.has(tn))
              return false;
            break;
          }
          case NS.SVG: {
            if (SCOPING_ELEMENTS_SVG.has(tn))
              return false;
            break;
          }
          case NS.MATHML: {
            if (SCOPING_ELEMENTS_MATHML.has(tn))
              return false;
            break;
          }
        }
      }
      return true;
    }
    hasInTableScope(tagName) {
      for (let i = this.stackTop; i >= 0; i--) {
        if (this.treeAdapter.getNamespaceURI(this.items[i]) !== NS.HTML) {
          continue;
        }
        switch (this.tagIDs[i]) {
          case tagName: {
            return true;
          }
          case TAG_ID.TABLE:
          case TAG_ID.HTML: {
            return false;
          }
        }
      }
      return true;
    }
    hasTableBodyContextInTableScope() {
      for (let i = this.stackTop; i >= 0; i--) {
        if (this.treeAdapter.getNamespaceURI(this.items[i]) !== NS.HTML) {
          continue;
        }
        switch (this.tagIDs[i]) {
          case TAG_ID.TBODY:
          case TAG_ID.THEAD:
          case TAG_ID.TFOOT: {
            return true;
          }
          case TAG_ID.TABLE:
          case TAG_ID.HTML: {
            return false;
          }
        }
      }
      return true;
    }
    hasInSelectScope(tagName) {
      for (let i = this.stackTop; i >= 0; i--) {
        if (this.treeAdapter.getNamespaceURI(this.items[i]) !== NS.HTML) {
          continue;
        }
        switch (this.tagIDs[i]) {
          case tagName: {
            return true;
          }
          case TAG_ID.OPTION:
          case TAG_ID.OPTGROUP: {
            break;
          }
          default: {
            return false;
          }
        }
      }
      return true;
    }
    //Implied end tags
    generateImpliedEndTags() {
      while (this.currentTagId !== void 0 && IMPLICIT_END_TAG_REQUIRED.has(this.currentTagId)) {
        this.pop();
      }
    }
    generateImpliedEndTagsThoroughly() {
      while (this.currentTagId !== void 0 && IMPLICIT_END_TAG_REQUIRED_THOROUGHLY.has(this.currentTagId)) {
        this.pop();
      }
    }
    generateImpliedEndTagsWithExclusion(exclusionId) {
      while (this.currentTagId !== void 0 && this.currentTagId !== exclusionId && IMPLICIT_END_TAG_REQUIRED_THOROUGHLY.has(this.currentTagId)) {
        this.pop();
      }
    }
  };

  // ../../engine-v2/node_modules/parse5/dist/parser/formatting-element-list.js
  var NOAH_ARK_CAPACITY = 3;
  var EntryType;
  (function(EntryType2) {
    EntryType2[EntryType2["Marker"] = 0] = "Marker";
    EntryType2[EntryType2["Element"] = 1] = "Element";
  })(EntryType || (EntryType = {}));
  var MARKER = { type: EntryType.Marker };
  var FormattingElementList = class {
    constructor(treeAdapter) {
      this.treeAdapter = treeAdapter;
      this.entries = [];
      this.bookmark = null;
    }
    //Noah Ark's condition
    //OPTIMIZATION: at first we try to find possible candidates for exclusion using
    //lightweight heuristics without thorough attributes check.
    _getNoahArkConditionCandidates(newElement, neAttrs) {
      const candidates = [];
      const neAttrsLength = neAttrs.length;
      const neTagName = this.treeAdapter.getTagName(newElement);
      const neNamespaceURI = this.treeAdapter.getNamespaceURI(newElement);
      for (let i = 0; i < this.entries.length; i++) {
        const entry = this.entries[i];
        if (entry.type === EntryType.Marker) {
          break;
        }
        const { element } = entry;
        if (this.treeAdapter.getTagName(element) === neTagName && this.treeAdapter.getNamespaceURI(element) === neNamespaceURI) {
          const elementAttrs = this.treeAdapter.getAttrList(element);
          if (elementAttrs.length === neAttrsLength) {
            candidates.push({ idx: i, attrs: elementAttrs });
          }
        }
      }
      return candidates;
    }
    _ensureNoahArkCondition(newElement) {
      if (this.entries.length < NOAH_ARK_CAPACITY)
        return;
      const neAttrs = this.treeAdapter.getAttrList(newElement);
      const candidates = this._getNoahArkConditionCandidates(newElement, neAttrs);
      if (candidates.length < NOAH_ARK_CAPACITY)
        return;
      const neAttrsMap = new Map(neAttrs.map((neAttr) => [neAttr.name, neAttr.value]));
      let validCandidates = 0;
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        if (candidate.attrs.every((cAttr) => neAttrsMap.get(cAttr.name) === cAttr.value)) {
          validCandidates += 1;
          if (validCandidates >= NOAH_ARK_CAPACITY) {
            this.entries.splice(candidate.idx, 1);
          }
        }
      }
    }
    //Mutations
    insertMarker() {
      this.entries.unshift(MARKER);
    }
    pushElement(element, token) {
      this._ensureNoahArkCondition(element);
      this.entries.unshift({
        type: EntryType.Element,
        element,
        token
      });
    }
    insertElementAfterBookmark(element, token) {
      const bookmarkIdx = this.entries.indexOf(this.bookmark);
      this.entries.splice(bookmarkIdx, 0, {
        type: EntryType.Element,
        element,
        token
      });
    }
    removeEntry(entry) {
      const entryIndex = this.entries.indexOf(entry);
      if (entryIndex !== -1) {
        this.entries.splice(entryIndex, 1);
      }
    }
    /**
     * Clears the list of formatting elements up to the last marker.
     *
     * @see https://html.spec.whatwg.org/multipage/parsing.html#clear-the-list-of-active-formatting-elements-up-to-the-last-marker
     */
    clearToLastMarker() {
      const markerIdx = this.entries.indexOf(MARKER);
      if (markerIdx === -1) {
        this.entries.length = 0;
      } else {
        this.entries.splice(0, markerIdx + 1);
      }
    }
    //Search
    getElementEntryInScopeWithTagName(tagName) {
      const entry = this.entries.find((entry2) => entry2.type === EntryType.Marker || this.treeAdapter.getTagName(entry2.element) === tagName);
      return entry && entry.type === EntryType.Element ? entry : null;
    }
    getElementEntry(element) {
      return this.entries.find((entry) => entry.type === EntryType.Element && entry.element === element);
    }
  };

  // ../../engine-v2/node_modules/parse5/dist/tree-adapters/default.js
  var defaultTreeAdapter = {
    //Node construction
    createDocument() {
      return {
        nodeName: "#document",
        mode: DOCUMENT_MODE.NO_QUIRKS,
        childNodes: []
      };
    },
    createDocumentFragment() {
      return {
        nodeName: "#document-fragment",
        childNodes: []
      };
    },
    createElement(tagName, namespaceURI, attrs) {
      return {
        nodeName: tagName,
        tagName,
        attrs,
        namespaceURI,
        childNodes: [],
        parentNode: null
      };
    },
    createCommentNode(data) {
      return {
        nodeName: "#comment",
        data,
        parentNode: null
      };
    },
    createTextNode(value) {
      return {
        nodeName: "#text",
        value,
        parentNode: null
      };
    },
    //Tree mutation
    appendChild(parentNode, newNode) {
      parentNode.childNodes.push(newNode);
      newNode.parentNode = parentNode;
    },
    insertBefore(parentNode, newNode, referenceNode) {
      const insertionIdx = parentNode.childNodes.indexOf(referenceNode);
      parentNode.childNodes.splice(insertionIdx, 0, newNode);
      newNode.parentNode = parentNode;
    },
    setTemplateContent(templateElement, contentElement) {
      templateElement.content = contentElement;
    },
    getTemplateContent(templateElement) {
      return templateElement.content;
    },
    setDocumentType(document, name50, publicId, systemId) {
      const doctypeNode = document.childNodes.find((node) => node.nodeName === "#documentType");
      if (doctypeNode) {
        doctypeNode.name = name50;
        doctypeNode.publicId = publicId;
        doctypeNode.systemId = systemId;
      } else {
        const node = {
          nodeName: "#documentType",
          name: name50,
          publicId,
          systemId,
          parentNode: null
        };
        defaultTreeAdapter.appendChild(document, node);
      }
    },
    setDocumentMode(document, mode) {
      document.mode = mode;
    },
    getDocumentMode(document) {
      return document.mode;
    },
    detachNode(node) {
      if (node.parentNode) {
        const idx = node.parentNode.childNodes.indexOf(node);
        node.parentNode.childNodes.splice(idx, 1);
        node.parentNode = null;
      }
    },
    insertText(parentNode, text) {
      if (parentNode.childNodes.length > 0) {
        const prevNode = parentNode.childNodes[parentNode.childNodes.length - 1];
        if (defaultTreeAdapter.isTextNode(prevNode)) {
          prevNode.value += text;
          return;
        }
      }
      defaultTreeAdapter.appendChild(parentNode, defaultTreeAdapter.createTextNode(text));
    },
    insertTextBefore(parentNode, text, referenceNode) {
      const prevNode = parentNode.childNodes[parentNode.childNodes.indexOf(referenceNode) - 1];
      if (prevNode && defaultTreeAdapter.isTextNode(prevNode)) {
        prevNode.value += text;
      } else {
        defaultTreeAdapter.insertBefore(parentNode, defaultTreeAdapter.createTextNode(text), referenceNode);
      }
    },
    adoptAttributes(recipient, attrs) {
      const recipientAttrsMap = new Set(recipient.attrs.map((attr3) => attr3.name));
      for (let j = 0; j < attrs.length; j++) {
        if (!recipientAttrsMap.has(attrs[j].name)) {
          recipient.attrs.push(attrs[j]);
        }
      }
    },
    //Tree traversing
    getFirstChild(node) {
      return node.childNodes[0];
    },
    getChildNodes(node) {
      return node.childNodes;
    },
    getParentNode(node) {
      return node.parentNode;
    },
    getAttrList(element) {
      return element.attrs;
    },
    //Node data
    getTagName(element) {
      return element.tagName;
    },
    getNamespaceURI(element) {
      return element.namespaceURI;
    },
    getTextNodeContent(textNode) {
      return textNode.value;
    },
    getCommentNodeContent(commentNode) {
      return commentNode.data;
    },
    getDocumentTypeNodeName(doctypeNode) {
      return doctypeNode.name;
    },
    getDocumentTypeNodePublicId(doctypeNode) {
      return doctypeNode.publicId;
    },
    getDocumentTypeNodeSystemId(doctypeNode) {
      return doctypeNode.systemId;
    },
    //Node types
    isTextNode(node) {
      return node.nodeName === "#text";
    },
    isCommentNode(node) {
      return node.nodeName === "#comment";
    },
    isDocumentTypeNode(node) {
      return node.nodeName === "#documentType";
    },
    isElementNode(node) {
      return Object.prototype.hasOwnProperty.call(node, "tagName");
    },
    // Source code location
    setNodeSourceCodeLocation(node, location) {
      node.sourceCodeLocation = location;
    },
    getNodeSourceCodeLocation(node) {
      return node.sourceCodeLocation;
    },
    updateNodeSourceCodeLocation(node, endLocation) {
      node.sourceCodeLocation = { ...node.sourceCodeLocation, ...endLocation };
    }
  };

  // ../../engine-v2/node_modules/parse5/dist/common/doctype.js
  var VALID_DOCTYPE_NAME = "html";
  var VALID_SYSTEM_ID = "about:legacy-compat";
  var QUIRKS_MODE_SYSTEM_ID = "http://www.ibm.com/data/dtd/v11/ibmxhtml1-transitional.dtd";
  var QUIRKS_MODE_PUBLIC_ID_PREFIXES = [
    "+//silmaril//dtd html pro v0r11 19970101//",
    "-//as//dtd html 3.0 aswedit + extensions//",
    "-//advasoft ltd//dtd html 3.0 aswedit + extensions//",
    "-//ietf//dtd html 2.0 level 1//",
    "-//ietf//dtd html 2.0 level 2//",
    "-//ietf//dtd html 2.0 strict level 1//",
    "-//ietf//dtd html 2.0 strict level 2//",
    "-//ietf//dtd html 2.0 strict//",
    "-//ietf//dtd html 2.0//",
    "-//ietf//dtd html 2.1e//",
    "-//ietf//dtd html 3.0//",
    "-//ietf//dtd html 3.2 final//",
    "-//ietf//dtd html 3.2//",
    "-//ietf//dtd html 3//",
    "-//ietf//dtd html level 0//",
    "-//ietf//dtd html level 1//",
    "-//ietf//dtd html level 2//",
    "-//ietf//dtd html level 3//",
    "-//ietf//dtd html strict level 0//",
    "-//ietf//dtd html strict level 1//",
    "-//ietf//dtd html strict level 2//",
    "-//ietf//dtd html strict level 3//",
    "-//ietf//dtd html strict//",
    "-//ietf//dtd html//",
    "-//metrius//dtd metrius presentational//",
    "-//microsoft//dtd internet explorer 2.0 html strict//",
    "-//microsoft//dtd internet explorer 2.0 html//",
    "-//microsoft//dtd internet explorer 2.0 tables//",
    "-//microsoft//dtd internet explorer 3.0 html strict//",
    "-//microsoft//dtd internet explorer 3.0 html//",
    "-//microsoft//dtd internet explorer 3.0 tables//",
    "-//netscape comm. corp.//dtd html//",
    "-//netscape comm. corp.//dtd strict html//",
    "-//o'reilly and associates//dtd html 2.0//",
    "-//o'reilly and associates//dtd html extended 1.0//",
    "-//o'reilly and associates//dtd html extended relaxed 1.0//",
    "-//sq//dtd html 2.0 hotmetal + extensions//",
    "-//softquad software//dtd hotmetal pro 6.0::19990601::extensions to html 4.0//",
    "-//softquad//dtd hotmetal pro 4.0::19971010::extensions to html 4.0//",
    "-//spyglass//dtd html 2.0 extended//",
    "-//sun microsystems corp.//dtd hotjava html//",
    "-//sun microsystems corp.//dtd hotjava strict html//",
    "-//w3c//dtd html 3 1995-03-24//",
    "-//w3c//dtd html 3.2 draft//",
    "-//w3c//dtd html 3.2 final//",
    "-//w3c//dtd html 3.2//",
    "-//w3c//dtd html 3.2s draft//",
    "-//w3c//dtd html 4.0 frameset//",
    "-//w3c//dtd html 4.0 transitional//",
    "-//w3c//dtd html experimental 19960712//",
    "-//w3c//dtd html experimental 970421//",
    "-//w3c//dtd w3 html//",
    "-//w3o//dtd w3 html 3.0//",
    "-//webtechs//dtd mozilla html 2.0//",
    "-//webtechs//dtd mozilla html//"
  ];
  var QUIRKS_MODE_NO_SYSTEM_ID_PUBLIC_ID_PREFIXES = [
    ...QUIRKS_MODE_PUBLIC_ID_PREFIXES,
    "-//w3c//dtd html 4.01 frameset//",
    "-//w3c//dtd html 4.01 transitional//"
  ];
  var QUIRKS_MODE_PUBLIC_IDS = /* @__PURE__ */ new Set([
    "-//w3o//dtd w3 html strict 3.0//en//",
    "-/w3c/dtd html 4.0 transitional/en",
    "html"
  ]);
  var LIMITED_QUIRKS_PUBLIC_ID_PREFIXES = ["-//w3c//dtd xhtml 1.0 frameset//", "-//w3c//dtd xhtml 1.0 transitional//"];
  var LIMITED_QUIRKS_WITH_SYSTEM_ID_PUBLIC_ID_PREFIXES = [
    ...LIMITED_QUIRKS_PUBLIC_ID_PREFIXES,
    "-//w3c//dtd html 4.01 frameset//",
    "-//w3c//dtd html 4.01 transitional//"
  ];
  function hasPrefix(publicId, prefixes) {
    return prefixes.some((prefix) => publicId.startsWith(prefix));
  }
  function isConforming(token) {
    return token.name === VALID_DOCTYPE_NAME && token.publicId === null && (token.systemId === null || token.systemId === VALID_SYSTEM_ID);
  }
  function getDocumentMode(token) {
    if (token.name !== VALID_DOCTYPE_NAME) {
      return DOCUMENT_MODE.QUIRKS;
    }
    const { systemId } = token;
    if (systemId && systemId.toLowerCase() === QUIRKS_MODE_SYSTEM_ID) {
      return DOCUMENT_MODE.QUIRKS;
    }
    let { publicId } = token;
    if (publicId !== null) {
      publicId = publicId.toLowerCase();
      if (QUIRKS_MODE_PUBLIC_IDS.has(publicId)) {
        return DOCUMENT_MODE.QUIRKS;
      }
      let prefixes = systemId === null ? QUIRKS_MODE_NO_SYSTEM_ID_PUBLIC_ID_PREFIXES : QUIRKS_MODE_PUBLIC_ID_PREFIXES;
      if (hasPrefix(publicId, prefixes)) {
        return DOCUMENT_MODE.QUIRKS;
      }
      prefixes = systemId === null ? LIMITED_QUIRKS_PUBLIC_ID_PREFIXES : LIMITED_QUIRKS_WITH_SYSTEM_ID_PUBLIC_ID_PREFIXES;
      if (hasPrefix(publicId, prefixes)) {
        return DOCUMENT_MODE.LIMITED_QUIRKS;
      }
    }
    return DOCUMENT_MODE.NO_QUIRKS;
  }

  // ../../engine-v2/node_modules/parse5/dist/common/foreign-content.js
  var foreign_content_exports = {};
  __export(foreign_content_exports, {
    SVG_TAG_NAMES_ADJUSTMENT_MAP: () => SVG_TAG_NAMES_ADJUSTMENT_MAP,
    adjustTokenMathMLAttrs: () => adjustTokenMathMLAttrs,
    adjustTokenSVGAttrs: () => adjustTokenSVGAttrs,
    adjustTokenSVGTagName: () => adjustTokenSVGTagName,
    adjustTokenXMLAttrs: () => adjustTokenXMLAttrs,
    causesExit: () => causesExit,
    isIntegrationPoint: () => isIntegrationPoint
  });
  var MIME_TYPES = {
    TEXT_HTML: "text/html",
    APPLICATION_XML: "application/xhtml+xml"
  };
  var DEFINITION_URL_ATTR = "definitionurl";
  var ADJUSTED_DEFINITION_URL_ATTR = "definitionURL";
  var SVG_ATTRS_ADJUSTMENT_MAP = new Map([
    "attributeName",
    "attributeType",
    "baseFrequency",
    "baseProfile",
    "calcMode",
    "clipPathUnits",
    "diffuseConstant",
    "edgeMode",
    "filterUnits",
    "glyphRef",
    "gradientTransform",
    "gradientUnits",
    "kernelMatrix",
    "kernelUnitLength",
    "keyPoints",
    "keySplines",
    "keyTimes",
    "lengthAdjust",
    "limitingConeAngle",
    "markerHeight",
    "markerUnits",
    "markerWidth",
    "maskContentUnits",
    "maskUnits",
    "numOctaves",
    "pathLength",
    "patternContentUnits",
    "patternTransform",
    "patternUnits",
    "pointsAtX",
    "pointsAtY",
    "pointsAtZ",
    "preserveAlpha",
    "preserveAspectRatio",
    "primitiveUnits",
    "refX",
    "refY",
    "repeatCount",
    "repeatDur",
    "requiredExtensions",
    "requiredFeatures",
    "specularConstant",
    "specularExponent",
    "spreadMethod",
    "startOffset",
    "stdDeviation",
    "stitchTiles",
    "surfaceScale",
    "systemLanguage",
    "tableValues",
    "targetX",
    "targetY",
    "textLength",
    "viewBox",
    "viewTarget",
    "xChannelSelector",
    "yChannelSelector",
    "zoomAndPan"
  ].map((attr3) => [attr3.toLowerCase(), attr3]));
  var XML_ATTRS_ADJUSTMENT_MAP = /* @__PURE__ */ new Map([
    ["xlink:actuate", { prefix: "xlink", name: "actuate", namespace: NS.XLINK }],
    ["xlink:arcrole", { prefix: "xlink", name: "arcrole", namespace: NS.XLINK }],
    ["xlink:href", { prefix: "xlink", name: "href", namespace: NS.XLINK }],
    ["xlink:role", { prefix: "xlink", name: "role", namespace: NS.XLINK }],
    ["xlink:show", { prefix: "xlink", name: "show", namespace: NS.XLINK }],
    ["xlink:title", { prefix: "xlink", name: "title", namespace: NS.XLINK }],
    ["xlink:type", { prefix: "xlink", name: "type", namespace: NS.XLINK }],
    ["xml:lang", { prefix: "xml", name: "lang", namespace: NS.XML }],
    ["xml:space", { prefix: "xml", name: "space", namespace: NS.XML }],
    ["xmlns", { prefix: "", name: "xmlns", namespace: NS.XMLNS }],
    ["xmlns:xlink", { prefix: "xmlns", name: "xlink", namespace: NS.XMLNS }]
  ]);
  var SVG_TAG_NAMES_ADJUSTMENT_MAP = new Map([
    "altGlyph",
    "altGlyphDef",
    "altGlyphItem",
    "animateColor",
    "animateMotion",
    "animateTransform",
    "clipPath",
    "feBlend",
    "feColorMatrix",
    "feComponentTransfer",
    "feComposite",
    "feConvolveMatrix",
    "feDiffuseLighting",
    "feDisplacementMap",
    "feDistantLight",
    "feFlood",
    "feFuncA",
    "feFuncB",
    "feFuncG",
    "feFuncR",
    "feGaussianBlur",
    "feImage",
    "feMerge",
    "feMergeNode",
    "feMorphology",
    "feOffset",
    "fePointLight",
    "feSpecularLighting",
    "feSpotLight",
    "feTile",
    "feTurbulence",
    "foreignObject",
    "glyphRef",
    "linearGradient",
    "radialGradient",
    "textPath"
  ].map((tn) => [tn.toLowerCase(), tn]));
  var EXITS_FOREIGN_CONTENT = /* @__PURE__ */ new Set([
    TAG_ID.B,
    TAG_ID.BIG,
    TAG_ID.BLOCKQUOTE,
    TAG_ID.BODY,
    TAG_ID.BR,
    TAG_ID.CENTER,
    TAG_ID.CODE,
    TAG_ID.DD,
    TAG_ID.DIV,
    TAG_ID.DL,
    TAG_ID.DT,
    TAG_ID.EM,
    TAG_ID.EMBED,
    TAG_ID.H1,
    TAG_ID.H2,
    TAG_ID.H3,
    TAG_ID.H4,
    TAG_ID.H5,
    TAG_ID.H6,
    TAG_ID.HEAD,
    TAG_ID.HR,
    TAG_ID.I,
    TAG_ID.IMG,
    TAG_ID.LI,
    TAG_ID.LISTING,
    TAG_ID.MENU,
    TAG_ID.META,
    TAG_ID.NOBR,
    TAG_ID.OL,
    TAG_ID.P,
    TAG_ID.PRE,
    TAG_ID.RUBY,
    TAG_ID.S,
    TAG_ID.SMALL,
    TAG_ID.SPAN,
    TAG_ID.STRONG,
    TAG_ID.STRIKE,
    TAG_ID.SUB,
    TAG_ID.SUP,
    TAG_ID.TABLE,
    TAG_ID.TT,
    TAG_ID.U,
    TAG_ID.UL,
    TAG_ID.VAR
  ]);
  function causesExit(startTagToken) {
    const tn = startTagToken.tagID;
    const isFontWithAttrs = tn === TAG_ID.FONT && startTagToken.attrs.some(({ name: name50 }) => name50 === ATTRS.COLOR || name50 === ATTRS.SIZE || name50 === ATTRS.FACE);
    return isFontWithAttrs || EXITS_FOREIGN_CONTENT.has(tn);
  }
  function adjustTokenMathMLAttrs(token) {
    for (let i = 0; i < token.attrs.length; i++) {
      if (token.attrs[i].name === DEFINITION_URL_ATTR) {
        token.attrs[i].name = ADJUSTED_DEFINITION_URL_ATTR;
        break;
      }
    }
  }
  function adjustTokenSVGAttrs(token) {
    for (let i = 0; i < token.attrs.length; i++) {
      const adjustedAttrName = SVG_ATTRS_ADJUSTMENT_MAP.get(token.attrs[i].name);
      if (adjustedAttrName != null) {
        token.attrs[i].name = adjustedAttrName;
      }
    }
  }
  function adjustTokenXMLAttrs(token) {
    for (let i = 0; i < token.attrs.length; i++) {
      const adjustedAttrEntry = XML_ATTRS_ADJUSTMENT_MAP.get(token.attrs[i].name);
      if (adjustedAttrEntry) {
        token.attrs[i].prefix = adjustedAttrEntry.prefix;
        token.attrs[i].name = adjustedAttrEntry.name;
        token.attrs[i].namespace = adjustedAttrEntry.namespace;
      }
    }
  }
  function adjustTokenSVGTagName(token) {
    const adjustedTagName = SVG_TAG_NAMES_ADJUSTMENT_MAP.get(token.tagName);
    if (adjustedTagName != null) {
      token.tagName = adjustedTagName;
      token.tagID = getTagID(token.tagName);
    }
  }
  function isMathMLTextIntegrationPoint(tn, ns) {
    return ns === NS.MATHML && (tn === TAG_ID.MI || tn === TAG_ID.MO || tn === TAG_ID.MN || tn === TAG_ID.MS || tn === TAG_ID.MTEXT);
  }
  function isHtmlIntegrationPoint(tn, ns, attrs) {
    if (ns === NS.MATHML && tn === TAG_ID.ANNOTATION_XML) {
      for (let i = 0; i < attrs.length; i++) {
        if (attrs[i].name === ATTRS.ENCODING) {
          const value = attrs[i].value.toLowerCase();
          return value === MIME_TYPES.TEXT_HTML || value === MIME_TYPES.APPLICATION_XML;
        }
      }
    }
    return ns === NS.SVG && (tn === TAG_ID.FOREIGN_OBJECT || tn === TAG_ID.DESC || tn === TAG_ID.TITLE);
  }
  function isIntegrationPoint(tn, ns, attrs, foreignNS) {
    return (!foreignNS || foreignNS === NS.HTML) && isHtmlIntegrationPoint(tn, ns, attrs) || (!foreignNS || foreignNS === NS.MATHML) && isMathMLTextIntegrationPoint(tn, ns);
  }

  // ../../engine-v2/node_modules/parse5/dist/parser/index.js
  var HIDDEN_INPUT_TYPE = "hidden";
  var AA_OUTER_LOOP_ITER = 8;
  var AA_INNER_LOOP_ITER = 3;
  var InsertionMode;
  (function(InsertionMode2) {
    InsertionMode2[InsertionMode2["INITIAL"] = 0] = "INITIAL";
    InsertionMode2[InsertionMode2["BEFORE_HTML"] = 1] = "BEFORE_HTML";
    InsertionMode2[InsertionMode2["BEFORE_HEAD"] = 2] = "BEFORE_HEAD";
    InsertionMode2[InsertionMode2["IN_HEAD"] = 3] = "IN_HEAD";
    InsertionMode2[InsertionMode2["IN_HEAD_NO_SCRIPT"] = 4] = "IN_HEAD_NO_SCRIPT";
    InsertionMode2[InsertionMode2["AFTER_HEAD"] = 5] = "AFTER_HEAD";
    InsertionMode2[InsertionMode2["IN_BODY"] = 6] = "IN_BODY";
    InsertionMode2[InsertionMode2["TEXT"] = 7] = "TEXT";
    InsertionMode2[InsertionMode2["IN_TABLE"] = 8] = "IN_TABLE";
    InsertionMode2[InsertionMode2["IN_TABLE_TEXT"] = 9] = "IN_TABLE_TEXT";
    InsertionMode2[InsertionMode2["IN_CAPTION"] = 10] = "IN_CAPTION";
    InsertionMode2[InsertionMode2["IN_COLUMN_GROUP"] = 11] = "IN_COLUMN_GROUP";
    InsertionMode2[InsertionMode2["IN_TABLE_BODY"] = 12] = "IN_TABLE_BODY";
    InsertionMode2[InsertionMode2["IN_ROW"] = 13] = "IN_ROW";
    InsertionMode2[InsertionMode2["IN_CELL"] = 14] = "IN_CELL";
    InsertionMode2[InsertionMode2["IN_SELECT"] = 15] = "IN_SELECT";
    InsertionMode2[InsertionMode2["IN_SELECT_IN_TABLE"] = 16] = "IN_SELECT_IN_TABLE";
    InsertionMode2[InsertionMode2["IN_TEMPLATE"] = 17] = "IN_TEMPLATE";
    InsertionMode2[InsertionMode2["AFTER_BODY"] = 18] = "AFTER_BODY";
    InsertionMode2[InsertionMode2["IN_FRAMESET"] = 19] = "IN_FRAMESET";
    InsertionMode2[InsertionMode2["AFTER_FRAMESET"] = 20] = "AFTER_FRAMESET";
    InsertionMode2[InsertionMode2["AFTER_AFTER_BODY"] = 21] = "AFTER_AFTER_BODY";
    InsertionMode2[InsertionMode2["AFTER_AFTER_FRAMESET"] = 22] = "AFTER_AFTER_FRAMESET";
  })(InsertionMode || (InsertionMode = {}));
  var BASE_LOC = {
    startLine: -1,
    startCol: -1,
    startOffset: -1,
    endLine: -1,
    endCol: -1,
    endOffset: -1
  };
  var TABLE_STRUCTURE_TAGS = /* @__PURE__ */ new Set([TAG_ID.TABLE, TAG_ID.TBODY, TAG_ID.TFOOT, TAG_ID.THEAD, TAG_ID.TR]);
  var defaultParserOptions = {
    scriptingEnabled: true,
    sourceCodeLocationInfo: false,
    treeAdapter: defaultTreeAdapter,
    onParseError: null
  };
  var Parser = class {
    constructor(options, document, fragmentContext = null, scriptHandler = null) {
      this.fragmentContext = fragmentContext;
      this.scriptHandler = scriptHandler;
      this.currentToken = null;
      this.stopped = false;
      this.insertionMode = InsertionMode.INITIAL;
      this.originalInsertionMode = InsertionMode.INITIAL;
      this.headElement = null;
      this.formElement = null;
      this.currentNotInHTML = false;
      this.tmplInsertionModeStack = [];
      this.pendingCharacterTokens = [];
      this.hasNonWhitespacePendingCharacterToken = false;
      this.framesetOk = true;
      this.skipNextNewLine = false;
      this.fosterParentingEnabled = false;
      this.options = {
        ...defaultParserOptions,
        ...options
      };
      this.treeAdapter = this.options.treeAdapter;
      this.onParseError = this.options.onParseError;
      if (this.onParseError) {
        this.options.sourceCodeLocationInfo = true;
      }
      this.document = document !== null && document !== void 0 ? document : this.treeAdapter.createDocument();
      this.tokenizer = new Tokenizer(this.options, this);
      this.activeFormattingElements = new FormattingElementList(this.treeAdapter);
      this.fragmentContextID = fragmentContext ? getTagID(this.treeAdapter.getTagName(fragmentContext)) : TAG_ID.UNKNOWN;
      this._setContextModes(fragmentContext !== null && fragmentContext !== void 0 ? fragmentContext : this.document, this.fragmentContextID);
      this.openElements = new OpenElementStack(this.document, this.treeAdapter, this);
    }
    // API
    static parse(html, options) {
      const parser = new this(options);
      parser.tokenizer.write(html, true);
      return parser.document;
    }
    static getFragmentParser(fragmentContext, options) {
      const opts = {
        ...defaultParserOptions,
        ...options
      };
      fragmentContext !== null && fragmentContext !== void 0 ? fragmentContext : fragmentContext = opts.treeAdapter.createElement(TAG_NAMES.TEMPLATE, NS.HTML, []);
      const documentMock = opts.treeAdapter.createElement("documentmock", NS.HTML, []);
      const parser = new this(opts, documentMock, fragmentContext);
      if (parser.fragmentContextID === TAG_ID.TEMPLATE) {
        parser.tmplInsertionModeStack.unshift(InsertionMode.IN_TEMPLATE);
      }
      parser._initTokenizerForFragmentParsing();
      parser._insertFakeRootElement();
      parser._resetInsertionMode();
      parser._findFormInFragmentContext();
      return parser;
    }
    getFragment() {
      const rootElement = this.treeAdapter.getFirstChild(this.document);
      const fragment = this.treeAdapter.createDocumentFragment();
      this._adoptNodes(rootElement, fragment);
      return fragment;
    }
    //Errors
    /** @internal */
    _err(token, code2, beforeToken) {
      var _a;
      if (!this.onParseError)
        return;
      const loc = (_a = token.location) !== null && _a !== void 0 ? _a : BASE_LOC;
      const err = {
        code: code2,
        startLine: loc.startLine,
        startCol: loc.startCol,
        startOffset: loc.startOffset,
        endLine: beforeToken ? loc.startLine : loc.endLine,
        endCol: beforeToken ? loc.startCol : loc.endCol,
        endOffset: beforeToken ? loc.startOffset : loc.endOffset
      };
      this.onParseError(err);
    }
    //Stack events
    /** @internal */
    onItemPush(node, tid, isTop) {
      var _a, _b;
      (_b = (_a = this.treeAdapter).onItemPush) === null || _b === void 0 ? void 0 : _b.call(_a, node);
      if (isTop && this.openElements.stackTop > 0)
        this._setContextModes(node, tid);
    }
    /** @internal */
    onItemPop(node, isTop) {
      var _a, _b;
      if (this.options.sourceCodeLocationInfo) {
        this._setEndLocation(node, this.currentToken);
      }
      (_b = (_a = this.treeAdapter).onItemPop) === null || _b === void 0 ? void 0 : _b.call(_a, node, this.openElements.current);
      if (isTop) {
        let current;
        let currentTagId;
        if (this.openElements.stackTop === 0 && this.fragmentContext) {
          current = this.fragmentContext;
          currentTagId = this.fragmentContextID;
        } else {
          ({ current, currentTagId } = this.openElements);
        }
        this._setContextModes(current, currentTagId);
      }
    }
    _setContextModes(current, tid) {
      const isHTML = current === this.document || current && this.treeAdapter.getNamespaceURI(current) === NS.HTML;
      this.currentNotInHTML = !isHTML;
      this.tokenizer.inForeignNode = !isHTML && current !== void 0 && tid !== void 0 && !this._isIntegrationPoint(tid, current);
    }
    /** @protected */
    _switchToTextParsing(currentToken, nextTokenizerState) {
      this._insertElement(currentToken, NS.HTML);
      this.tokenizer.state = nextTokenizerState;
      this.originalInsertionMode = this.insertionMode;
      this.insertionMode = InsertionMode.TEXT;
    }
    switchToPlaintextParsing() {
      this.insertionMode = InsertionMode.TEXT;
      this.originalInsertionMode = InsertionMode.IN_BODY;
      this.tokenizer.state = TokenizerMode.PLAINTEXT;
    }
    //Fragment parsing
    /** @protected */
    _getAdjustedCurrentElement() {
      return this.openElements.stackTop === 0 && this.fragmentContext ? this.fragmentContext : this.openElements.current;
    }
    /** @protected */
    _findFormInFragmentContext() {
      let node = this.fragmentContext;
      while (node) {
        if (this.treeAdapter.getTagName(node) === TAG_NAMES.FORM) {
          this.formElement = node;
          break;
        }
        node = this.treeAdapter.getParentNode(node);
      }
    }
    _initTokenizerForFragmentParsing() {
      if (!this.fragmentContext || this.treeAdapter.getNamespaceURI(this.fragmentContext) !== NS.HTML) {
        return;
      }
      switch (this.fragmentContextID) {
        case TAG_ID.TITLE:
        case TAG_ID.TEXTAREA: {
          this.tokenizer.state = TokenizerMode.RCDATA;
          break;
        }
        case TAG_ID.STYLE:
        case TAG_ID.XMP:
        case TAG_ID.IFRAME:
        case TAG_ID.NOEMBED:
        case TAG_ID.NOFRAMES:
        case TAG_ID.NOSCRIPT: {
          this.tokenizer.state = TokenizerMode.RAWTEXT;
          break;
        }
        case TAG_ID.SCRIPT: {
          this.tokenizer.state = TokenizerMode.SCRIPT_DATA;
          break;
        }
        case TAG_ID.PLAINTEXT: {
          this.tokenizer.state = TokenizerMode.PLAINTEXT;
          break;
        }
        default:
      }
    }
    //Tree mutation
    /** @protected */
    _setDocumentType(token) {
      const name50 = token.name || "";
      const publicId = token.publicId || "";
      const systemId = token.systemId || "";
      this.treeAdapter.setDocumentType(this.document, name50, publicId, systemId);
      if (token.location) {
        const documentChildren = this.treeAdapter.getChildNodes(this.document);
        const docTypeNode = documentChildren.find((node) => this.treeAdapter.isDocumentTypeNode(node));
        if (docTypeNode) {
          this.treeAdapter.setNodeSourceCodeLocation(docTypeNode, token.location);
        }
      }
    }
    /** @protected */
    _attachElementToTree(element, location) {
      if (this.options.sourceCodeLocationInfo) {
        const loc = location && {
          ...location,
          startTag: location
        };
        this.treeAdapter.setNodeSourceCodeLocation(element, loc);
      }
      if (this._shouldFosterParentOnInsertion()) {
        this._fosterParentElement(element);
      } else {
        const parent2 = this.openElements.currentTmplContentOrNode;
        this.treeAdapter.appendChild(parent2 !== null && parent2 !== void 0 ? parent2 : this.document, element);
      }
    }
    /**
     * For self-closing tags. Add an element to the tree, but skip adding it
     * to the stack.
     */
    /** @protected */
    _appendElement(token, namespaceURI) {
      const element = this.treeAdapter.createElement(token.tagName, namespaceURI, token.attrs);
      this._attachElementToTree(element, token.location);
    }
    /** @protected */
    _insertElement(token, namespaceURI) {
      const element = this.treeAdapter.createElement(token.tagName, namespaceURI, token.attrs);
      this._attachElementToTree(element, token.location);
      this.openElements.push(element, token.tagID);
    }
    /** @protected */
    _insertFakeElement(tagName, tagID) {
      const element = this.treeAdapter.createElement(tagName, NS.HTML, []);
      this._attachElementToTree(element, null);
      this.openElements.push(element, tagID);
    }
    /** @protected */
    _insertTemplate(token) {
      const tmpl = this.treeAdapter.createElement(token.tagName, NS.HTML, token.attrs);
      const content = this.treeAdapter.createDocumentFragment();
      this.treeAdapter.setTemplateContent(tmpl, content);
      this._attachElementToTree(tmpl, token.location);
      this.openElements.push(tmpl, token.tagID);
      if (this.options.sourceCodeLocationInfo)
        this.treeAdapter.setNodeSourceCodeLocation(content, null);
    }
    /** @protected */
    _insertFakeRootElement() {
      const element = this.treeAdapter.createElement(TAG_NAMES.HTML, NS.HTML, []);
      if (this.options.sourceCodeLocationInfo)
        this.treeAdapter.setNodeSourceCodeLocation(element, null);
      this.treeAdapter.appendChild(this.openElements.current, element);
      this.openElements.push(element, TAG_ID.HTML);
    }
    /** @protected */
    _appendCommentNode(token, parent2) {
      const commentNode = this.treeAdapter.createCommentNode(token.data);
      this.treeAdapter.appendChild(parent2, commentNode);
      if (this.options.sourceCodeLocationInfo) {
        this.treeAdapter.setNodeSourceCodeLocation(commentNode, token.location);
      }
    }
    /** @protected */
    _insertCharacters(token) {
      let parent2;
      let beforeElement;
      if (this._shouldFosterParentOnInsertion()) {
        ({ parent: parent2, beforeElement } = this._findFosterParentingLocation());
        if (beforeElement) {
          this.treeAdapter.insertTextBefore(parent2, token.chars, beforeElement);
        } else {
          this.treeAdapter.insertText(parent2, token.chars);
        }
      } else {
        parent2 = this.openElements.currentTmplContentOrNode;
        this.treeAdapter.insertText(parent2, token.chars);
      }
      if (!token.location)
        return;
      const siblings = this.treeAdapter.getChildNodes(parent2);
      const textNodeIdx = beforeElement ? siblings.lastIndexOf(beforeElement) : siblings.length;
      const textNode = siblings[textNodeIdx - 1];
      const tnLoc = this.treeAdapter.getNodeSourceCodeLocation(textNode);
      if (tnLoc) {
        const { endLine, endCol, endOffset } = token.location;
        this.treeAdapter.updateNodeSourceCodeLocation(textNode, { endLine, endCol, endOffset });
      } else if (this.options.sourceCodeLocationInfo) {
        this.treeAdapter.setNodeSourceCodeLocation(textNode, token.location);
      }
    }
    /** @protected */
    _adoptNodes(donor, recipient) {
      for (let child = this.treeAdapter.getFirstChild(donor); child; child = this.treeAdapter.getFirstChild(donor)) {
        this.treeAdapter.detachNode(child);
        this.treeAdapter.appendChild(recipient, child);
      }
    }
    /** @protected */
    _setEndLocation(element, closingToken) {
      if (this.treeAdapter.getNodeSourceCodeLocation(element) && closingToken.location) {
        const ctLoc = closingToken.location;
        const tn = this.treeAdapter.getTagName(element);
        const endLoc = (
          // NOTE: For cases like <p> <p> </p> - First 'p' closes without a closing
          // tag and for cases like <td> <p> </td> - 'p' closes without a closing tag.
          closingToken.type === TokenType.END_TAG && tn === closingToken.tagName ? {
            endTag: { ...ctLoc },
            endLine: ctLoc.endLine,
            endCol: ctLoc.endCol,
            endOffset: ctLoc.endOffset
          } : {
            endLine: ctLoc.startLine,
            endCol: ctLoc.startCol,
            endOffset: ctLoc.startOffset
          }
        );
        this.treeAdapter.updateNodeSourceCodeLocation(element, endLoc);
      }
    }
    //Token processing
    shouldProcessStartTagTokenInForeignContent(token) {
      if (!this.currentNotInHTML)
        return false;
      let current;
      let currentTagId;
      if (this.openElements.stackTop === 0 && this.fragmentContext) {
        current = this.fragmentContext;
        currentTagId = this.fragmentContextID;
      } else {
        ({ current, currentTagId } = this.openElements);
      }
      if (token.tagID === TAG_ID.SVG && this.treeAdapter.getTagName(current) === TAG_NAMES.ANNOTATION_XML && this.treeAdapter.getNamespaceURI(current) === NS.MATHML) {
        return false;
      }
      return (
        // Check that `current` is not an integration point for HTML or MathML elements.
        this.tokenizer.inForeignNode || // If it _is_ an integration point, then we might have to check that it is not an HTML
        // integration point.
        (token.tagID === TAG_ID.MGLYPH || token.tagID === TAG_ID.MALIGNMARK) && currentTagId !== void 0 && !this._isIntegrationPoint(currentTagId, current, NS.HTML)
      );
    }
    /** @protected */
    _processToken(token) {
      switch (token.type) {
        case TokenType.CHARACTER: {
          this.onCharacter(token);
          break;
        }
        case TokenType.NULL_CHARACTER: {
          this.onNullCharacter(token);
          break;
        }
        case TokenType.COMMENT: {
          this.onComment(token);
          break;
        }
        case TokenType.DOCTYPE: {
          this.onDoctype(token);
          break;
        }
        case TokenType.START_TAG: {
          this._processStartTag(token);
          break;
        }
        case TokenType.END_TAG: {
          this.onEndTag(token);
          break;
        }
        case TokenType.EOF: {
          this.onEof(token);
          break;
        }
        case TokenType.WHITESPACE_CHARACTER: {
          this.onWhitespaceCharacter(token);
          break;
        }
      }
    }
    //Integration points
    /** @protected */
    _isIntegrationPoint(tid, element, foreignNS) {
      const ns = this.treeAdapter.getNamespaceURI(element);
      const attrs = this.treeAdapter.getAttrList(element);
      return isIntegrationPoint(tid, ns, attrs, foreignNS);
    }
    //Active formatting elements reconstruction
    /** @protected */
    _reconstructActiveFormattingElements() {
      const listLength = this.activeFormattingElements.entries.length;
      if (listLength) {
        const endIndex = this.activeFormattingElements.entries.findIndex((entry) => entry.type === EntryType.Marker || this.openElements.contains(entry.element));
        const unopenIdx = endIndex === -1 ? listLength - 1 : endIndex - 1;
        for (let i = unopenIdx; i >= 0; i--) {
          const entry = this.activeFormattingElements.entries[i];
          this._insertElement(entry.token, this.treeAdapter.getNamespaceURI(entry.element));
          entry.element = this.openElements.current;
        }
      }
    }
    //Close elements
    /** @protected */
    _closeTableCell() {
      this.openElements.generateImpliedEndTags();
      this.openElements.popUntilTableCellPopped();
      this.activeFormattingElements.clearToLastMarker();
      this.insertionMode = InsertionMode.IN_ROW;
    }
    /** @protected */
    _closePElement() {
      this.openElements.generateImpliedEndTagsWithExclusion(TAG_ID.P);
      this.openElements.popUntilTagNamePopped(TAG_ID.P);
    }
    //Insertion modes
    /** @protected */
    _resetInsertionMode() {
      for (let i = this.openElements.stackTop; i >= 0; i--) {
        switch (i === 0 && this.fragmentContext ? this.fragmentContextID : this.openElements.tagIDs[i]) {
          case TAG_ID.TR: {
            this.insertionMode = InsertionMode.IN_ROW;
            return;
          }
          case TAG_ID.TBODY:
          case TAG_ID.THEAD:
          case TAG_ID.TFOOT: {
            this.insertionMode = InsertionMode.IN_TABLE_BODY;
            return;
          }
          case TAG_ID.CAPTION: {
            this.insertionMode = InsertionMode.IN_CAPTION;
            return;
          }
          case TAG_ID.COLGROUP: {
            this.insertionMode = InsertionMode.IN_COLUMN_GROUP;
            return;
          }
          case TAG_ID.TABLE: {
            this.insertionMode = InsertionMode.IN_TABLE;
            return;
          }
          case TAG_ID.BODY: {
            this.insertionMode = InsertionMode.IN_BODY;
            return;
          }
          case TAG_ID.FRAMESET: {
            this.insertionMode = InsertionMode.IN_FRAMESET;
            return;
          }
          case TAG_ID.SELECT: {
            this._resetInsertionModeForSelect(i);
            return;
          }
          case TAG_ID.TEMPLATE: {
            this.insertionMode = this.tmplInsertionModeStack[0];
            return;
          }
          case TAG_ID.HTML: {
            this.insertionMode = this.headElement ? InsertionMode.AFTER_HEAD : InsertionMode.BEFORE_HEAD;
            return;
          }
          case TAG_ID.TD:
          case TAG_ID.TH: {
            if (i > 0) {
              this.insertionMode = InsertionMode.IN_CELL;
              return;
            }
            break;
          }
          case TAG_ID.HEAD: {
            if (i > 0) {
              this.insertionMode = InsertionMode.IN_HEAD;
              return;
            }
            break;
          }
        }
      }
      this.insertionMode = InsertionMode.IN_BODY;
    }
    /** @protected */
    _resetInsertionModeForSelect(selectIdx) {
      if (selectIdx > 0) {
        for (let i = selectIdx - 1; i > 0; i--) {
          const tn = this.openElements.tagIDs[i];
          if (tn === TAG_ID.TEMPLATE) {
            break;
          } else if (tn === TAG_ID.TABLE) {
            this.insertionMode = InsertionMode.IN_SELECT_IN_TABLE;
            return;
          }
        }
      }
      this.insertionMode = InsertionMode.IN_SELECT;
    }
    //Foster parenting
    /** @protected */
    _isElementCausesFosterParenting(tn) {
      return TABLE_STRUCTURE_TAGS.has(tn);
    }
    /** @protected */
    _shouldFosterParentOnInsertion() {
      return this.fosterParentingEnabled && this.openElements.currentTagId !== void 0 && this._isElementCausesFosterParenting(this.openElements.currentTagId);
    }
    /** @protected */
    _findFosterParentingLocation() {
      for (let i = this.openElements.stackTop; i >= 0; i--) {
        const openElement = this.openElements.items[i];
        switch (this.openElements.tagIDs[i]) {
          case TAG_ID.TEMPLATE: {
            if (this.treeAdapter.getNamespaceURI(openElement) === NS.HTML) {
              return { parent: this.treeAdapter.getTemplateContent(openElement), beforeElement: null };
            }
            break;
          }
          case TAG_ID.TABLE: {
            const parent2 = this.treeAdapter.getParentNode(openElement);
            if (parent2) {
              return { parent: parent2, beforeElement: openElement };
            }
            return { parent: this.openElements.items[i - 1], beforeElement: null };
          }
          default:
        }
      }
      return { parent: this.openElements.items[0], beforeElement: null };
    }
    /** @protected */
    _fosterParentElement(element) {
      const location = this._findFosterParentingLocation();
      if (location.beforeElement) {
        this.treeAdapter.insertBefore(location.parent, element, location.beforeElement);
      } else {
        this.treeAdapter.appendChild(location.parent, element);
      }
    }
    //Special elements
    /** @protected */
    _isSpecialElement(element, id) {
      const ns = this.treeAdapter.getNamespaceURI(element);
      return SPECIAL_ELEMENTS[ns].has(id);
    }
    /** @internal */
    onCharacter(token) {
      this.skipNextNewLine = false;
      if (this.tokenizer.inForeignNode) {
        characterInForeignContent(this, token);
        return;
      }
      switch (this.insertionMode) {
        case InsertionMode.INITIAL: {
          tokenInInitialMode(this, token);
          break;
        }
        case InsertionMode.BEFORE_HTML: {
          tokenBeforeHtml(this, token);
          break;
        }
        case InsertionMode.BEFORE_HEAD: {
          tokenBeforeHead(this, token);
          break;
        }
        case InsertionMode.IN_HEAD: {
          tokenInHead(this, token);
          break;
        }
        case InsertionMode.IN_HEAD_NO_SCRIPT: {
          tokenInHeadNoScript(this, token);
          break;
        }
        case InsertionMode.AFTER_HEAD: {
          tokenAfterHead(this, token);
          break;
        }
        case InsertionMode.IN_BODY:
        case InsertionMode.IN_CAPTION:
        case InsertionMode.IN_CELL:
        case InsertionMode.IN_TEMPLATE: {
          characterInBody(this, token);
          break;
        }
        case InsertionMode.TEXT:
        case InsertionMode.IN_SELECT:
        case InsertionMode.IN_SELECT_IN_TABLE: {
          this._insertCharacters(token);
          break;
        }
        case InsertionMode.IN_TABLE:
        case InsertionMode.IN_TABLE_BODY:
        case InsertionMode.IN_ROW: {
          characterInTable(this, token);
          break;
        }
        case InsertionMode.IN_TABLE_TEXT: {
          characterInTableText(this, token);
          break;
        }
        case InsertionMode.IN_COLUMN_GROUP: {
          tokenInColumnGroup(this, token);
          break;
        }
        case InsertionMode.AFTER_BODY: {
          tokenAfterBody(this, token);
          break;
        }
        case InsertionMode.AFTER_AFTER_BODY: {
          tokenAfterAfterBody(this, token);
          break;
        }
        default:
      }
    }
    /** @internal */
    onNullCharacter(token) {
      this.skipNextNewLine = false;
      if (this.tokenizer.inForeignNode) {
        nullCharacterInForeignContent(this, token);
        return;
      }
      switch (this.insertionMode) {
        case InsertionMode.INITIAL: {
          tokenInInitialMode(this, token);
          break;
        }
        case InsertionMode.BEFORE_HTML: {
          tokenBeforeHtml(this, token);
          break;
        }
        case InsertionMode.BEFORE_HEAD: {
          tokenBeforeHead(this, token);
          break;
        }
        case InsertionMode.IN_HEAD: {
          tokenInHead(this, token);
          break;
        }
        case InsertionMode.IN_HEAD_NO_SCRIPT: {
          tokenInHeadNoScript(this, token);
          break;
        }
        case InsertionMode.AFTER_HEAD: {
          tokenAfterHead(this, token);
          break;
        }
        case InsertionMode.TEXT: {
          this._insertCharacters(token);
          break;
        }
        case InsertionMode.IN_TABLE:
        case InsertionMode.IN_TABLE_BODY:
        case InsertionMode.IN_ROW: {
          characterInTable(this, token);
          break;
        }
        case InsertionMode.IN_COLUMN_GROUP: {
          tokenInColumnGroup(this, token);
          break;
        }
        case InsertionMode.AFTER_BODY: {
          tokenAfterBody(this, token);
          break;
        }
        case InsertionMode.AFTER_AFTER_BODY: {
          tokenAfterAfterBody(this, token);
          break;
        }
        default:
      }
    }
    /** @internal */
    onComment(token) {
      this.skipNextNewLine = false;
      if (this.currentNotInHTML) {
        appendComment(this, token);
        return;
      }
      switch (this.insertionMode) {
        case InsertionMode.INITIAL:
        case InsertionMode.BEFORE_HTML:
        case InsertionMode.BEFORE_HEAD:
        case InsertionMode.IN_HEAD:
        case InsertionMode.IN_HEAD_NO_SCRIPT:
        case InsertionMode.AFTER_HEAD:
        case InsertionMode.IN_BODY:
        case InsertionMode.IN_TABLE:
        case InsertionMode.IN_CAPTION:
        case InsertionMode.IN_COLUMN_GROUP:
        case InsertionMode.IN_TABLE_BODY:
        case InsertionMode.IN_ROW:
        case InsertionMode.IN_CELL:
        case InsertionMode.IN_SELECT:
        case InsertionMode.IN_SELECT_IN_TABLE:
        case InsertionMode.IN_TEMPLATE:
        case InsertionMode.IN_FRAMESET:
        case InsertionMode.AFTER_FRAMESET: {
          appendComment(this, token);
          break;
        }
        case InsertionMode.IN_TABLE_TEXT: {
          tokenInTableText(this, token);
          break;
        }
        case InsertionMode.AFTER_BODY: {
          appendCommentToRootHtmlElement(this, token);
          break;
        }
        case InsertionMode.AFTER_AFTER_BODY:
        case InsertionMode.AFTER_AFTER_FRAMESET: {
          appendCommentToDocument(this, token);
          break;
        }
        default:
      }
    }
    /** @internal */
    onDoctype(token) {
      this.skipNextNewLine = false;
      switch (this.insertionMode) {
        case InsertionMode.INITIAL: {
          doctypeInInitialMode(this, token);
          break;
        }
        case InsertionMode.BEFORE_HEAD:
        case InsertionMode.IN_HEAD:
        case InsertionMode.IN_HEAD_NO_SCRIPT:
        case InsertionMode.AFTER_HEAD: {
          this._err(token, ERR.misplacedDoctype);
          break;
        }
        case InsertionMode.IN_TABLE_TEXT: {
          tokenInTableText(this, token);
          break;
        }
        default:
      }
    }
    /** @internal */
    onStartTag(token) {
      this.skipNextNewLine = false;
      this.currentToken = token;
      this._processStartTag(token);
      if (token.selfClosing && !token.ackSelfClosing) {
        this._err(token, ERR.nonVoidHtmlElementStartTagWithTrailingSolidus);
      }
    }
    /**
     * Processes a given start tag.
     *
     * `onStartTag` checks if a self-closing tag was recognized. When a token
     * is moved inbetween multiple insertion modes, this check for self-closing
     * could lead to false positives. To avoid this, `_processStartTag` is used
     * for nested calls.
     *
     * @param token The token to process.
     * @protected
     */
    _processStartTag(token) {
      if (this.shouldProcessStartTagTokenInForeignContent(token)) {
        startTagInForeignContent(this, token);
      } else {
        this._startTagOutsideForeignContent(token);
      }
    }
    /** @protected */
    _startTagOutsideForeignContent(token) {
      switch (this.insertionMode) {
        case InsertionMode.INITIAL: {
          tokenInInitialMode(this, token);
          break;
        }
        case InsertionMode.BEFORE_HTML: {
          startTagBeforeHtml(this, token);
          break;
        }
        case InsertionMode.BEFORE_HEAD: {
          startTagBeforeHead(this, token);
          break;
        }
        case InsertionMode.IN_HEAD: {
          startTagInHead(this, token);
          break;
        }
        case InsertionMode.IN_HEAD_NO_SCRIPT: {
          startTagInHeadNoScript(this, token);
          break;
        }
        case InsertionMode.AFTER_HEAD: {
          startTagAfterHead(this, token);
          break;
        }
        case InsertionMode.IN_BODY: {
          startTagInBody(this, token);
          break;
        }
        case InsertionMode.IN_TABLE: {
          startTagInTable(this, token);
          break;
        }
        case InsertionMode.IN_TABLE_TEXT: {
          tokenInTableText(this, token);
          break;
        }
        case InsertionMode.IN_CAPTION: {
          startTagInCaption(this, token);
          break;
        }
        case InsertionMode.IN_COLUMN_GROUP: {
          startTagInColumnGroup(this, token);
          break;
        }
        case InsertionMode.IN_TABLE_BODY: {
          startTagInTableBody(this, token);
          break;
        }
        case InsertionMode.IN_ROW: {
          startTagInRow(this, token);
          break;
        }
        case InsertionMode.IN_CELL: {
          startTagInCell(this, token);
          break;
        }
        case InsertionMode.IN_SELECT: {
          startTagInSelect(this, token);
          break;
        }
        case InsertionMode.IN_SELECT_IN_TABLE: {
          startTagInSelectInTable(this, token);
          break;
        }
        case InsertionMode.IN_TEMPLATE: {
          startTagInTemplate(this, token);
          break;
        }
        case InsertionMode.AFTER_BODY: {
          startTagAfterBody(this, token);
          break;
        }
        case InsertionMode.IN_FRAMESET: {
          startTagInFrameset(this, token);
          break;
        }
        case InsertionMode.AFTER_FRAMESET: {
          startTagAfterFrameset(this, token);
          break;
        }
        case InsertionMode.AFTER_AFTER_BODY: {
          startTagAfterAfterBody(this, token);
          break;
        }
        case InsertionMode.AFTER_AFTER_FRAMESET: {
          startTagAfterAfterFrameset(this, token);
          break;
        }
        default:
      }
    }
    /** @internal */
    onEndTag(token) {
      this.skipNextNewLine = false;
      this.currentToken = token;
      if (this.currentNotInHTML) {
        endTagInForeignContent(this, token);
      } else {
        this._endTagOutsideForeignContent(token);
      }
    }
    /** @protected */
    _endTagOutsideForeignContent(token) {
      switch (this.insertionMode) {
        case InsertionMode.INITIAL: {
          tokenInInitialMode(this, token);
          break;
        }
        case InsertionMode.BEFORE_HTML: {
          endTagBeforeHtml(this, token);
          break;
        }
        case InsertionMode.BEFORE_HEAD: {
          endTagBeforeHead(this, token);
          break;
        }
        case InsertionMode.IN_HEAD: {
          endTagInHead(this, token);
          break;
        }
        case InsertionMode.IN_HEAD_NO_SCRIPT: {
          endTagInHeadNoScript(this, token);
          break;
        }
        case InsertionMode.AFTER_HEAD: {
          endTagAfterHead(this, token);
          break;
        }
        case InsertionMode.IN_BODY: {
          endTagInBody(this, token);
          break;
        }
        case InsertionMode.TEXT: {
          endTagInText(this, token);
          break;
        }
        case InsertionMode.IN_TABLE: {
          endTagInTable(this, token);
          break;
        }
        case InsertionMode.IN_TABLE_TEXT: {
          tokenInTableText(this, token);
          break;
        }
        case InsertionMode.IN_CAPTION: {
          endTagInCaption(this, token);
          break;
        }
        case InsertionMode.IN_COLUMN_GROUP: {
          endTagInColumnGroup(this, token);
          break;
        }
        case InsertionMode.IN_TABLE_BODY: {
          endTagInTableBody(this, token);
          break;
        }
        case InsertionMode.IN_ROW: {
          endTagInRow(this, token);
          break;
        }
        case InsertionMode.IN_CELL: {
          endTagInCell(this, token);
          break;
        }
        case InsertionMode.IN_SELECT: {
          endTagInSelect(this, token);
          break;
        }
        case InsertionMode.IN_SELECT_IN_TABLE: {
          endTagInSelectInTable(this, token);
          break;
        }
        case InsertionMode.IN_TEMPLATE: {
          endTagInTemplate(this, token);
          break;
        }
        case InsertionMode.AFTER_BODY: {
          endTagAfterBody(this, token);
          break;
        }
        case InsertionMode.IN_FRAMESET: {
          endTagInFrameset(this, token);
          break;
        }
        case InsertionMode.AFTER_FRAMESET: {
          endTagAfterFrameset(this, token);
          break;
        }
        case InsertionMode.AFTER_AFTER_BODY: {
          tokenAfterAfterBody(this, token);
          break;
        }
        default:
      }
    }
    /** @internal */
    onEof(token) {
      switch (this.insertionMode) {
        case InsertionMode.INITIAL: {
          tokenInInitialMode(this, token);
          break;
        }
        case InsertionMode.BEFORE_HTML: {
          tokenBeforeHtml(this, token);
          break;
        }
        case InsertionMode.BEFORE_HEAD: {
          tokenBeforeHead(this, token);
          break;
        }
        case InsertionMode.IN_HEAD: {
          tokenInHead(this, token);
          break;
        }
        case InsertionMode.IN_HEAD_NO_SCRIPT: {
          tokenInHeadNoScript(this, token);
          break;
        }
        case InsertionMode.AFTER_HEAD: {
          tokenAfterHead(this, token);
          break;
        }
        case InsertionMode.IN_BODY:
        case InsertionMode.IN_TABLE:
        case InsertionMode.IN_CAPTION:
        case InsertionMode.IN_COLUMN_GROUP:
        case InsertionMode.IN_TABLE_BODY:
        case InsertionMode.IN_ROW:
        case InsertionMode.IN_CELL:
        case InsertionMode.IN_SELECT:
        case InsertionMode.IN_SELECT_IN_TABLE: {
          eofInBody(this, token);
          break;
        }
        case InsertionMode.TEXT: {
          eofInText(this, token);
          break;
        }
        case InsertionMode.IN_TABLE_TEXT: {
          tokenInTableText(this, token);
          break;
        }
        case InsertionMode.IN_TEMPLATE: {
          eofInTemplate(this, token);
          break;
        }
        case InsertionMode.AFTER_BODY:
        case InsertionMode.IN_FRAMESET:
        case InsertionMode.AFTER_FRAMESET:
        case InsertionMode.AFTER_AFTER_BODY:
        case InsertionMode.AFTER_AFTER_FRAMESET: {
          stopParsing(this, token);
          break;
        }
        default:
      }
    }
    /** @internal */
    onWhitespaceCharacter(token) {
      if (this.skipNextNewLine) {
        this.skipNextNewLine = false;
        if (token.chars.charCodeAt(0) === CODE_POINTS.LINE_FEED) {
          if (token.chars.length === 1) {
            return;
          }
          token.chars = token.chars.substr(1);
        }
      }
      if (this.tokenizer.inForeignNode) {
        this._insertCharacters(token);
        return;
      }
      switch (this.insertionMode) {
        case InsertionMode.IN_HEAD:
        case InsertionMode.IN_HEAD_NO_SCRIPT:
        case InsertionMode.AFTER_HEAD:
        case InsertionMode.TEXT:
        case InsertionMode.IN_COLUMN_GROUP:
        case InsertionMode.IN_SELECT:
        case InsertionMode.IN_SELECT_IN_TABLE:
        case InsertionMode.IN_FRAMESET:
        case InsertionMode.AFTER_FRAMESET: {
          this._insertCharacters(token);
          break;
        }
        case InsertionMode.IN_BODY:
        case InsertionMode.IN_CAPTION:
        case InsertionMode.IN_CELL:
        case InsertionMode.IN_TEMPLATE:
        case InsertionMode.AFTER_BODY:
        case InsertionMode.AFTER_AFTER_BODY:
        case InsertionMode.AFTER_AFTER_FRAMESET: {
          whitespaceCharacterInBody(this, token);
          break;
        }
        case InsertionMode.IN_TABLE:
        case InsertionMode.IN_TABLE_BODY:
        case InsertionMode.IN_ROW: {
          characterInTable(this, token);
          break;
        }
        case InsertionMode.IN_TABLE_TEXT: {
          whitespaceCharacterInTableText(this, token);
          break;
        }
        default:
      }
    }
  };
  function aaObtainFormattingElementEntry(p, token) {
    let formattingElementEntry = p.activeFormattingElements.getElementEntryInScopeWithTagName(token.tagName);
    if (formattingElementEntry) {
      if (!p.openElements.contains(formattingElementEntry.element)) {
        p.activeFormattingElements.removeEntry(formattingElementEntry);
        formattingElementEntry = null;
      } else if (!p.openElements.hasInScope(token.tagID)) {
        formattingElementEntry = null;
      }
    } else {
      genericEndTagInBody(p, token);
    }
    return formattingElementEntry;
  }
  function aaObtainFurthestBlock(p, formattingElementEntry) {
    let furthestBlock = null;
    let idx = p.openElements.stackTop;
    for (; idx >= 0; idx--) {
      const element = p.openElements.items[idx];
      if (element === formattingElementEntry.element) {
        break;
      }
      if (p._isSpecialElement(element, p.openElements.tagIDs[idx])) {
        furthestBlock = element;
      }
    }
    if (!furthestBlock) {
      p.openElements.shortenToLength(Math.max(idx, 0));
      p.activeFormattingElements.removeEntry(formattingElementEntry);
    }
    return furthestBlock;
  }
  function aaInnerLoop(p, furthestBlock, formattingElement) {
    let lastElement = furthestBlock;
    let nextElement = p.openElements.getCommonAncestor(furthestBlock);
    for (let i = 0, element = nextElement; element !== formattingElement; i++, element = nextElement) {
      nextElement = p.openElements.getCommonAncestor(element);
      const elementEntry = p.activeFormattingElements.getElementEntry(element);
      const counterOverflow = elementEntry && i >= AA_INNER_LOOP_ITER;
      const shouldRemoveFromOpenElements = !elementEntry || counterOverflow;
      if (shouldRemoveFromOpenElements) {
        if (counterOverflow) {
          p.activeFormattingElements.removeEntry(elementEntry);
        }
        p.openElements.remove(element);
      } else {
        element = aaRecreateElementFromEntry(p, elementEntry);
        if (lastElement === furthestBlock) {
          p.activeFormattingElements.bookmark = elementEntry;
        }
        p.treeAdapter.detachNode(lastElement);
        p.treeAdapter.appendChild(element, lastElement);
        lastElement = element;
      }
    }
    return lastElement;
  }
  function aaRecreateElementFromEntry(p, elementEntry) {
    const ns = p.treeAdapter.getNamespaceURI(elementEntry.element);
    const newElement = p.treeAdapter.createElement(elementEntry.token.tagName, ns, elementEntry.token.attrs);
    p.openElements.replace(elementEntry.element, newElement);
    elementEntry.element = newElement;
    return newElement;
  }
  function aaInsertLastNodeInCommonAncestor(p, commonAncestor, lastElement) {
    const tn = p.treeAdapter.getTagName(commonAncestor);
    const tid = getTagID(tn);
    if (p._isElementCausesFosterParenting(tid)) {
      p._fosterParentElement(lastElement);
    } else {
      const ns = p.treeAdapter.getNamespaceURI(commonAncestor);
      if (tid === TAG_ID.TEMPLATE && ns === NS.HTML) {
        commonAncestor = p.treeAdapter.getTemplateContent(commonAncestor);
      }
      p.treeAdapter.appendChild(commonAncestor, lastElement);
    }
  }
  function aaReplaceFormattingElement(p, furthestBlock, formattingElementEntry) {
    const ns = p.treeAdapter.getNamespaceURI(formattingElementEntry.element);
    const { token } = formattingElementEntry;
    const newElement = p.treeAdapter.createElement(token.tagName, ns, token.attrs);
    p._adoptNodes(furthestBlock, newElement);
    p.treeAdapter.appendChild(furthestBlock, newElement);
    p.activeFormattingElements.insertElementAfterBookmark(newElement, token);
    p.activeFormattingElements.removeEntry(formattingElementEntry);
    p.openElements.remove(formattingElementEntry.element);
    p.openElements.insertAfter(furthestBlock, newElement, token.tagID);
  }
  function callAdoptionAgency(p, token) {
    for (let i = 0; i < AA_OUTER_LOOP_ITER; i++) {
      const formattingElementEntry = aaObtainFormattingElementEntry(p, token);
      if (!formattingElementEntry) {
        break;
      }
      const furthestBlock = aaObtainFurthestBlock(p, formattingElementEntry);
      if (!furthestBlock) {
        break;
      }
      p.activeFormattingElements.bookmark = formattingElementEntry;
      const lastElement = aaInnerLoop(p, furthestBlock, formattingElementEntry.element);
      const commonAncestor = p.openElements.getCommonAncestor(formattingElementEntry.element);
      p.treeAdapter.detachNode(lastElement);
      if (commonAncestor)
        aaInsertLastNodeInCommonAncestor(p, commonAncestor, lastElement);
      aaReplaceFormattingElement(p, furthestBlock, formattingElementEntry);
    }
  }
  function appendComment(p, token) {
    p._appendCommentNode(token, p.openElements.currentTmplContentOrNode);
  }
  function appendCommentToRootHtmlElement(p, token) {
    p._appendCommentNode(token, p.openElements.items[0]);
  }
  function appendCommentToDocument(p, token) {
    p._appendCommentNode(token, p.document);
  }
  function stopParsing(p, token) {
    p.stopped = true;
    if (token.location) {
      const target = p.fragmentContext ? 0 : 2;
      for (let i = p.openElements.stackTop; i >= target; i--) {
        p._setEndLocation(p.openElements.items[i], token);
      }
      if (!p.fragmentContext && p.openElements.stackTop >= 0) {
        const htmlElement = p.openElements.items[0];
        const htmlLocation = p.treeAdapter.getNodeSourceCodeLocation(htmlElement);
        if (htmlLocation && !htmlLocation.endTag) {
          p._setEndLocation(htmlElement, token);
          if (p.openElements.stackTop >= 1) {
            const bodyElement = p.openElements.items[1];
            const bodyLocation = p.treeAdapter.getNodeSourceCodeLocation(bodyElement);
            if (bodyLocation && !bodyLocation.endTag) {
              p._setEndLocation(bodyElement, token);
            }
          }
        }
      }
    }
  }
  function doctypeInInitialMode(p, token) {
    p._setDocumentType(token);
    const mode = token.forceQuirks ? DOCUMENT_MODE.QUIRKS : getDocumentMode(token);
    if (!isConforming(token)) {
      p._err(token, ERR.nonConformingDoctype);
    }
    p.treeAdapter.setDocumentMode(p.document, mode);
    p.insertionMode = InsertionMode.BEFORE_HTML;
  }
  function tokenInInitialMode(p, token) {
    p._err(token, ERR.missingDoctype, true);
    p.treeAdapter.setDocumentMode(p.document, DOCUMENT_MODE.QUIRKS);
    p.insertionMode = InsertionMode.BEFORE_HTML;
    p._processToken(token);
  }
  function startTagBeforeHtml(p, token) {
    if (token.tagID === TAG_ID.HTML) {
      p._insertElement(token, NS.HTML);
      p.insertionMode = InsertionMode.BEFORE_HEAD;
    } else {
      tokenBeforeHtml(p, token);
    }
  }
  function endTagBeforeHtml(p, token) {
    const tn = token.tagID;
    if (tn === TAG_ID.HTML || tn === TAG_ID.HEAD || tn === TAG_ID.BODY || tn === TAG_ID.BR) {
      tokenBeforeHtml(p, token);
    }
  }
  function tokenBeforeHtml(p, token) {
    p._insertFakeRootElement();
    p.insertionMode = InsertionMode.BEFORE_HEAD;
    p._processToken(token);
  }
  function startTagBeforeHead(p, token) {
    switch (token.tagID) {
      case TAG_ID.HTML: {
        startTagInBody(p, token);
        break;
      }
      case TAG_ID.HEAD: {
        p._insertElement(token, NS.HTML);
        p.headElement = p.openElements.current;
        p.insertionMode = InsertionMode.IN_HEAD;
        break;
      }
      default: {
        tokenBeforeHead(p, token);
      }
    }
  }
  function endTagBeforeHead(p, token) {
    const tn = token.tagID;
    if (tn === TAG_ID.HEAD || tn === TAG_ID.BODY || tn === TAG_ID.HTML || tn === TAG_ID.BR) {
      tokenBeforeHead(p, token);
    } else {
      p._err(token, ERR.endTagWithoutMatchingOpenElement);
    }
  }
  function tokenBeforeHead(p, token) {
    p._insertFakeElement(TAG_NAMES.HEAD, TAG_ID.HEAD);
    p.headElement = p.openElements.current;
    p.insertionMode = InsertionMode.IN_HEAD;
    p._processToken(token);
  }
  function startTagInHead(p, token) {
    switch (token.tagID) {
      case TAG_ID.HTML: {
        startTagInBody(p, token);
        break;
      }
      case TAG_ID.BASE:
      case TAG_ID.BASEFONT:
      case TAG_ID.BGSOUND:
      case TAG_ID.LINK:
      case TAG_ID.META: {
        p._appendElement(token, NS.HTML);
        token.ackSelfClosing = true;
        break;
      }
      case TAG_ID.TITLE: {
        p._switchToTextParsing(token, TokenizerMode.RCDATA);
        break;
      }
      case TAG_ID.NOSCRIPT: {
        if (p.options.scriptingEnabled) {
          p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
        } else {
          p._insertElement(token, NS.HTML);
          p.insertionMode = InsertionMode.IN_HEAD_NO_SCRIPT;
        }
        break;
      }
      case TAG_ID.NOFRAMES:
      case TAG_ID.STYLE: {
        p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
        break;
      }
      case TAG_ID.SCRIPT: {
        p._switchToTextParsing(token, TokenizerMode.SCRIPT_DATA);
        break;
      }
      case TAG_ID.TEMPLATE: {
        p._insertTemplate(token);
        p.activeFormattingElements.insertMarker();
        p.framesetOk = false;
        p.insertionMode = InsertionMode.IN_TEMPLATE;
        p.tmplInsertionModeStack.unshift(InsertionMode.IN_TEMPLATE);
        break;
      }
      case TAG_ID.HEAD: {
        p._err(token, ERR.misplacedStartTagForHeadElement);
        break;
      }
      default: {
        tokenInHead(p, token);
      }
    }
  }
  function endTagInHead(p, token) {
    switch (token.tagID) {
      case TAG_ID.HEAD: {
        p.openElements.pop();
        p.insertionMode = InsertionMode.AFTER_HEAD;
        break;
      }
      case TAG_ID.BODY:
      case TAG_ID.BR:
      case TAG_ID.HTML: {
        tokenInHead(p, token);
        break;
      }
      case TAG_ID.TEMPLATE: {
        templateEndTagInHead(p, token);
        break;
      }
      default: {
        p._err(token, ERR.endTagWithoutMatchingOpenElement);
      }
    }
  }
  function templateEndTagInHead(p, token) {
    if (p.openElements.tmplCount > 0) {
      p.openElements.generateImpliedEndTagsThoroughly();
      if (p.openElements.currentTagId !== TAG_ID.TEMPLATE) {
        p._err(token, ERR.closingOfElementWithOpenChildElements);
      }
      p.openElements.popUntilTagNamePopped(TAG_ID.TEMPLATE);
      p.activeFormattingElements.clearToLastMarker();
      p.tmplInsertionModeStack.shift();
      p._resetInsertionMode();
    } else {
      p._err(token, ERR.endTagWithoutMatchingOpenElement);
    }
  }
  function tokenInHead(p, token) {
    p.openElements.pop();
    p.insertionMode = InsertionMode.AFTER_HEAD;
    p._processToken(token);
  }
  function startTagInHeadNoScript(p, token) {
    switch (token.tagID) {
      case TAG_ID.HTML: {
        startTagInBody(p, token);
        break;
      }
      case TAG_ID.BASEFONT:
      case TAG_ID.BGSOUND:
      case TAG_ID.HEAD:
      case TAG_ID.LINK:
      case TAG_ID.META:
      case TAG_ID.NOFRAMES:
      case TAG_ID.STYLE: {
        startTagInHead(p, token);
        break;
      }
      case TAG_ID.NOSCRIPT: {
        p._err(token, ERR.nestedNoscriptInHead);
        break;
      }
      default: {
        tokenInHeadNoScript(p, token);
      }
    }
  }
  function endTagInHeadNoScript(p, token) {
    switch (token.tagID) {
      case TAG_ID.NOSCRIPT: {
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_HEAD;
        break;
      }
      case TAG_ID.BR: {
        tokenInHeadNoScript(p, token);
        break;
      }
      default: {
        p._err(token, ERR.endTagWithoutMatchingOpenElement);
      }
    }
  }
  function tokenInHeadNoScript(p, token) {
    const errCode = token.type === TokenType.EOF ? ERR.openElementsLeftAfterEof : ERR.disallowedContentInNoscriptInHead;
    p._err(token, errCode);
    p.openElements.pop();
    p.insertionMode = InsertionMode.IN_HEAD;
    p._processToken(token);
  }
  function startTagAfterHead(p, token) {
    switch (token.tagID) {
      case TAG_ID.HTML: {
        startTagInBody(p, token);
        break;
      }
      case TAG_ID.BODY: {
        p._insertElement(token, NS.HTML);
        p.framesetOk = false;
        p.insertionMode = InsertionMode.IN_BODY;
        break;
      }
      case TAG_ID.FRAMESET: {
        p._insertElement(token, NS.HTML);
        p.insertionMode = InsertionMode.IN_FRAMESET;
        break;
      }
      case TAG_ID.BASE:
      case TAG_ID.BASEFONT:
      case TAG_ID.BGSOUND:
      case TAG_ID.LINK:
      case TAG_ID.META:
      case TAG_ID.NOFRAMES:
      case TAG_ID.SCRIPT:
      case TAG_ID.STYLE:
      case TAG_ID.TEMPLATE:
      case TAG_ID.TITLE: {
        p._err(token, ERR.abandonedHeadElementChild);
        p.openElements.push(p.headElement, TAG_ID.HEAD);
        startTagInHead(p, token);
        p.openElements.remove(p.headElement);
        break;
      }
      case TAG_ID.HEAD: {
        p._err(token, ERR.misplacedStartTagForHeadElement);
        break;
      }
      default: {
        tokenAfterHead(p, token);
      }
    }
  }
  function endTagAfterHead(p, token) {
    switch (token.tagID) {
      case TAG_ID.BODY:
      case TAG_ID.HTML:
      case TAG_ID.BR: {
        tokenAfterHead(p, token);
        break;
      }
      case TAG_ID.TEMPLATE: {
        templateEndTagInHead(p, token);
        break;
      }
      default: {
        p._err(token, ERR.endTagWithoutMatchingOpenElement);
      }
    }
  }
  function tokenAfterHead(p, token) {
    p._insertFakeElement(TAG_NAMES.BODY, TAG_ID.BODY);
    p.insertionMode = InsertionMode.IN_BODY;
    modeInBody(p, token);
  }
  function modeInBody(p, token) {
    switch (token.type) {
      case TokenType.CHARACTER: {
        characterInBody(p, token);
        break;
      }
      case TokenType.WHITESPACE_CHARACTER: {
        whitespaceCharacterInBody(p, token);
        break;
      }
      case TokenType.COMMENT: {
        appendComment(p, token);
        break;
      }
      case TokenType.START_TAG: {
        startTagInBody(p, token);
        break;
      }
      case TokenType.END_TAG: {
        endTagInBody(p, token);
        break;
      }
      case TokenType.EOF: {
        eofInBody(p, token);
        break;
      }
      default:
    }
  }
  function whitespaceCharacterInBody(p, token) {
    p._reconstructActiveFormattingElements();
    p._insertCharacters(token);
  }
  function characterInBody(p, token) {
    p._reconstructActiveFormattingElements();
    p._insertCharacters(token);
    p.framesetOk = false;
  }
  function htmlStartTagInBody(p, token) {
    if (p.openElements.tmplCount === 0) {
      p.treeAdapter.adoptAttributes(p.openElements.items[0], token.attrs);
    }
  }
  function bodyStartTagInBody(p, token) {
    const bodyElement = p.openElements.tryPeekProperlyNestedBodyElement();
    if (bodyElement && p.openElements.tmplCount === 0) {
      p.framesetOk = false;
      p.treeAdapter.adoptAttributes(bodyElement, token.attrs);
    }
  }
  function framesetStartTagInBody(p, token) {
    const bodyElement = p.openElements.tryPeekProperlyNestedBodyElement();
    if (p.framesetOk && bodyElement) {
      p.treeAdapter.detachNode(bodyElement);
      p.openElements.popAllUpToHtmlElement();
      p._insertElement(token, NS.HTML);
      p.insertionMode = InsertionMode.IN_FRAMESET;
    }
  }
  function addressStartTagInBody(p, token) {
    if (p.openElements.hasInButtonScope(TAG_ID.P)) {
      p._closePElement();
    }
    p._insertElement(token, NS.HTML);
  }
  function numberedHeaderStartTagInBody(p, token) {
    if (p.openElements.hasInButtonScope(TAG_ID.P)) {
      p._closePElement();
    }
    if (p.openElements.currentTagId !== void 0 && NUMBERED_HEADERS.has(p.openElements.currentTagId)) {
      p.openElements.pop();
    }
    p._insertElement(token, NS.HTML);
  }
  function preStartTagInBody(p, token) {
    if (p.openElements.hasInButtonScope(TAG_ID.P)) {
      p._closePElement();
    }
    p._insertElement(token, NS.HTML);
    p.skipNextNewLine = true;
    p.framesetOk = false;
  }
  function formStartTagInBody(p, token) {
    const inTemplate = p.openElements.tmplCount > 0;
    if (!p.formElement || inTemplate) {
      if (p.openElements.hasInButtonScope(TAG_ID.P)) {
        p._closePElement();
      }
      p._insertElement(token, NS.HTML);
      if (!inTemplate) {
        p.formElement = p.openElements.current;
      }
    }
  }
  function listItemStartTagInBody(p, token) {
    p.framesetOk = false;
    const tn = token.tagID;
    for (let i = p.openElements.stackTop; i >= 0; i--) {
      const elementId = p.openElements.tagIDs[i];
      if (tn === TAG_ID.LI && elementId === TAG_ID.LI || (tn === TAG_ID.DD || tn === TAG_ID.DT) && (elementId === TAG_ID.DD || elementId === TAG_ID.DT)) {
        p.openElements.generateImpliedEndTagsWithExclusion(elementId);
        p.openElements.popUntilTagNamePopped(elementId);
        break;
      }
      if (elementId !== TAG_ID.ADDRESS && elementId !== TAG_ID.DIV && elementId !== TAG_ID.P && p._isSpecialElement(p.openElements.items[i], elementId)) {
        break;
      }
    }
    if (p.openElements.hasInButtonScope(TAG_ID.P)) {
      p._closePElement();
    }
    p._insertElement(token, NS.HTML);
  }
  function plaintextStartTagInBody(p, token) {
    if (p.openElements.hasInButtonScope(TAG_ID.P)) {
      p._closePElement();
    }
    p._insertElement(token, NS.HTML);
    p.tokenizer.state = TokenizerMode.PLAINTEXT;
  }
  function buttonStartTagInBody(p, token) {
    if (p.openElements.hasInScope(TAG_ID.BUTTON)) {
      p.openElements.generateImpliedEndTags();
      p.openElements.popUntilTagNamePopped(TAG_ID.BUTTON);
    }
    p._reconstructActiveFormattingElements();
    p._insertElement(token, NS.HTML);
    p.framesetOk = false;
  }
  function aStartTagInBody(p, token) {
    const activeElementEntry = p.activeFormattingElements.getElementEntryInScopeWithTagName(TAG_NAMES.A);
    if (activeElementEntry) {
      callAdoptionAgency(p, token);
      p.openElements.remove(activeElementEntry.element);
      p.activeFormattingElements.removeEntry(activeElementEntry);
    }
    p._reconstructActiveFormattingElements();
    p._insertElement(token, NS.HTML);
    p.activeFormattingElements.pushElement(p.openElements.current, token);
  }
  function bStartTagInBody(p, token) {
    p._reconstructActiveFormattingElements();
    p._insertElement(token, NS.HTML);
    p.activeFormattingElements.pushElement(p.openElements.current, token);
  }
  function nobrStartTagInBody(p, token) {
    p._reconstructActiveFormattingElements();
    if (p.openElements.hasInScope(TAG_ID.NOBR)) {
      callAdoptionAgency(p, token);
      p._reconstructActiveFormattingElements();
    }
    p._insertElement(token, NS.HTML);
    p.activeFormattingElements.pushElement(p.openElements.current, token);
  }
  function appletStartTagInBody(p, token) {
    p._reconstructActiveFormattingElements();
    p._insertElement(token, NS.HTML);
    p.activeFormattingElements.insertMarker();
    p.framesetOk = false;
  }
  function tableStartTagInBody(p, token) {
    if (p.treeAdapter.getDocumentMode(p.document) !== DOCUMENT_MODE.QUIRKS && p.openElements.hasInButtonScope(TAG_ID.P)) {
      p._closePElement();
    }
    p._insertElement(token, NS.HTML);
    p.framesetOk = false;
    p.insertionMode = InsertionMode.IN_TABLE;
  }
  function areaStartTagInBody(p, token) {
    p._reconstructActiveFormattingElements();
    p._appendElement(token, NS.HTML);
    p.framesetOk = false;
    token.ackSelfClosing = true;
  }
  function isHiddenInput(token) {
    const inputType = getTokenAttr(token, ATTRS.TYPE);
    return inputType != null && inputType.toLowerCase() === HIDDEN_INPUT_TYPE;
  }
  function inputStartTagInBody(p, token) {
    p._reconstructActiveFormattingElements();
    p._appendElement(token, NS.HTML);
    if (!isHiddenInput(token)) {
      p.framesetOk = false;
    }
    token.ackSelfClosing = true;
  }
  function paramStartTagInBody(p, token) {
    p._appendElement(token, NS.HTML);
    token.ackSelfClosing = true;
  }
  function hrStartTagInBody(p, token) {
    if (p.openElements.hasInButtonScope(TAG_ID.P)) {
      p._closePElement();
    }
    p._appendElement(token, NS.HTML);
    p.framesetOk = false;
    token.ackSelfClosing = true;
  }
  function imageStartTagInBody(p, token) {
    token.tagName = TAG_NAMES.IMG;
    token.tagID = TAG_ID.IMG;
    areaStartTagInBody(p, token);
  }
  function textareaStartTagInBody(p, token) {
    p._insertElement(token, NS.HTML);
    p.skipNextNewLine = true;
    p.tokenizer.state = TokenizerMode.RCDATA;
    p.originalInsertionMode = p.insertionMode;
    p.framesetOk = false;
    p.insertionMode = InsertionMode.TEXT;
  }
  function xmpStartTagInBody(p, token) {
    if (p.openElements.hasInButtonScope(TAG_ID.P)) {
      p._closePElement();
    }
    p._reconstructActiveFormattingElements();
    p.framesetOk = false;
    p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
  }
  function iframeStartTagInBody(p, token) {
    p.framesetOk = false;
    p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
  }
  function rawTextStartTagInBody(p, token) {
    p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
  }
  function selectStartTagInBody(p, token) {
    p._reconstructActiveFormattingElements();
    p._insertElement(token, NS.HTML);
    p.framesetOk = false;
    p.insertionMode = p.insertionMode === InsertionMode.IN_TABLE || p.insertionMode === InsertionMode.IN_CAPTION || p.insertionMode === InsertionMode.IN_TABLE_BODY || p.insertionMode === InsertionMode.IN_ROW || p.insertionMode === InsertionMode.IN_CELL ? InsertionMode.IN_SELECT_IN_TABLE : InsertionMode.IN_SELECT;
  }
  function optgroupStartTagInBody(p, token) {
    if (p.openElements.currentTagId === TAG_ID.OPTION) {
      p.openElements.pop();
    }
    p._reconstructActiveFormattingElements();
    p._insertElement(token, NS.HTML);
  }
  function rbStartTagInBody(p, token) {
    if (p.openElements.hasInScope(TAG_ID.RUBY)) {
      p.openElements.generateImpliedEndTags();
    }
    p._insertElement(token, NS.HTML);
  }
  function rtStartTagInBody(p, token) {
    if (p.openElements.hasInScope(TAG_ID.RUBY)) {
      p.openElements.generateImpliedEndTagsWithExclusion(TAG_ID.RTC);
    }
    p._insertElement(token, NS.HTML);
  }
  function mathStartTagInBody(p, token) {
    p._reconstructActiveFormattingElements();
    adjustTokenMathMLAttrs(token);
    adjustTokenXMLAttrs(token);
    if (token.selfClosing) {
      p._appendElement(token, NS.MATHML);
    } else {
      p._insertElement(token, NS.MATHML);
    }
    token.ackSelfClosing = true;
  }
  function svgStartTagInBody(p, token) {
    p._reconstructActiveFormattingElements();
    adjustTokenSVGAttrs(token);
    adjustTokenXMLAttrs(token);
    if (token.selfClosing) {
      p._appendElement(token, NS.SVG);
    } else {
      p._insertElement(token, NS.SVG);
    }
    token.ackSelfClosing = true;
  }
  function genericStartTagInBody(p, token) {
    p._reconstructActiveFormattingElements();
    p._insertElement(token, NS.HTML);
  }
  function startTagInBody(p, token) {
    switch (token.tagID) {
      case TAG_ID.I:
      case TAG_ID.S:
      case TAG_ID.B:
      case TAG_ID.U:
      case TAG_ID.EM:
      case TAG_ID.TT:
      case TAG_ID.BIG:
      case TAG_ID.CODE:
      case TAG_ID.FONT:
      case TAG_ID.SMALL:
      case TAG_ID.STRIKE:
      case TAG_ID.STRONG: {
        bStartTagInBody(p, token);
        break;
      }
      case TAG_ID.A: {
        aStartTagInBody(p, token);
        break;
      }
      case TAG_ID.H1:
      case TAG_ID.H2:
      case TAG_ID.H3:
      case TAG_ID.H4:
      case TAG_ID.H5:
      case TAG_ID.H6: {
        numberedHeaderStartTagInBody(p, token);
        break;
      }
      case TAG_ID.P:
      case TAG_ID.DL:
      case TAG_ID.OL:
      case TAG_ID.UL:
      case TAG_ID.DIV:
      case TAG_ID.DIR:
      case TAG_ID.NAV:
      case TAG_ID.MAIN:
      case TAG_ID.MENU:
      case TAG_ID.ASIDE:
      case TAG_ID.CENTER:
      case TAG_ID.FIGURE:
      case TAG_ID.FOOTER:
      case TAG_ID.HEADER:
      case TAG_ID.HGROUP:
      case TAG_ID.DIALOG:
      case TAG_ID.DETAILS:
      case TAG_ID.ADDRESS:
      case TAG_ID.ARTICLE:
      case TAG_ID.SEARCH:
      case TAG_ID.SECTION:
      case TAG_ID.SUMMARY:
      case TAG_ID.FIELDSET:
      case TAG_ID.BLOCKQUOTE:
      case TAG_ID.FIGCAPTION: {
        addressStartTagInBody(p, token);
        break;
      }
      case TAG_ID.LI:
      case TAG_ID.DD:
      case TAG_ID.DT: {
        listItemStartTagInBody(p, token);
        break;
      }
      case TAG_ID.BR:
      case TAG_ID.IMG:
      case TAG_ID.WBR:
      case TAG_ID.AREA:
      case TAG_ID.EMBED:
      case TAG_ID.KEYGEN: {
        areaStartTagInBody(p, token);
        break;
      }
      case TAG_ID.HR: {
        hrStartTagInBody(p, token);
        break;
      }
      case TAG_ID.RB:
      case TAG_ID.RTC: {
        rbStartTagInBody(p, token);
        break;
      }
      case TAG_ID.RT:
      case TAG_ID.RP: {
        rtStartTagInBody(p, token);
        break;
      }
      case TAG_ID.PRE:
      case TAG_ID.LISTING: {
        preStartTagInBody(p, token);
        break;
      }
      case TAG_ID.XMP: {
        xmpStartTagInBody(p, token);
        break;
      }
      case TAG_ID.SVG: {
        svgStartTagInBody(p, token);
        break;
      }
      case TAG_ID.HTML: {
        htmlStartTagInBody(p, token);
        break;
      }
      case TAG_ID.BASE:
      case TAG_ID.LINK:
      case TAG_ID.META:
      case TAG_ID.STYLE:
      case TAG_ID.TITLE:
      case TAG_ID.SCRIPT:
      case TAG_ID.BGSOUND:
      case TAG_ID.BASEFONT:
      case TAG_ID.TEMPLATE: {
        startTagInHead(p, token);
        break;
      }
      case TAG_ID.BODY: {
        bodyStartTagInBody(p, token);
        break;
      }
      case TAG_ID.FORM: {
        formStartTagInBody(p, token);
        break;
      }
      case TAG_ID.NOBR: {
        nobrStartTagInBody(p, token);
        break;
      }
      case TAG_ID.MATH: {
        mathStartTagInBody(p, token);
        break;
      }
      case TAG_ID.TABLE: {
        tableStartTagInBody(p, token);
        break;
      }
      case TAG_ID.INPUT: {
        inputStartTagInBody(p, token);
        break;
      }
      case TAG_ID.PARAM:
      case TAG_ID.TRACK:
      case TAG_ID.SOURCE: {
        paramStartTagInBody(p, token);
        break;
      }
      case TAG_ID.IMAGE: {
        imageStartTagInBody(p, token);
        break;
      }
      case TAG_ID.BUTTON: {
        buttonStartTagInBody(p, token);
        break;
      }
      case TAG_ID.APPLET:
      case TAG_ID.OBJECT:
      case TAG_ID.MARQUEE: {
        appletStartTagInBody(p, token);
        break;
      }
      case TAG_ID.IFRAME: {
        iframeStartTagInBody(p, token);
        break;
      }
      case TAG_ID.SELECT: {
        selectStartTagInBody(p, token);
        break;
      }
      case TAG_ID.OPTION:
      case TAG_ID.OPTGROUP: {
        optgroupStartTagInBody(p, token);
        break;
      }
      case TAG_ID.NOEMBED:
      case TAG_ID.NOFRAMES: {
        rawTextStartTagInBody(p, token);
        break;
      }
      case TAG_ID.FRAMESET: {
        framesetStartTagInBody(p, token);
        break;
      }
      case TAG_ID.TEXTAREA: {
        textareaStartTagInBody(p, token);
        break;
      }
      case TAG_ID.NOSCRIPT: {
        if (p.options.scriptingEnabled) {
          rawTextStartTagInBody(p, token);
        } else {
          genericStartTagInBody(p, token);
        }
        break;
      }
      case TAG_ID.PLAINTEXT: {
        plaintextStartTagInBody(p, token);
        break;
      }
      case TAG_ID.COL:
      case TAG_ID.TH:
      case TAG_ID.TD:
      case TAG_ID.TR:
      case TAG_ID.HEAD:
      case TAG_ID.FRAME:
      case TAG_ID.TBODY:
      case TAG_ID.TFOOT:
      case TAG_ID.THEAD:
      case TAG_ID.CAPTION:
      case TAG_ID.COLGROUP: {
        break;
      }
      default: {
        genericStartTagInBody(p, token);
      }
    }
  }
  function bodyEndTagInBody(p, token) {
    if (p.openElements.hasInScope(TAG_ID.BODY)) {
      p.insertionMode = InsertionMode.AFTER_BODY;
      if (p.options.sourceCodeLocationInfo) {
        const bodyElement = p.openElements.tryPeekProperlyNestedBodyElement();
        if (bodyElement) {
          p._setEndLocation(bodyElement, token);
        }
      }
    }
  }
  function htmlEndTagInBody(p, token) {
    if (p.openElements.hasInScope(TAG_ID.BODY)) {
      p.insertionMode = InsertionMode.AFTER_BODY;
      endTagAfterBody(p, token);
    }
  }
  function addressEndTagInBody(p, token) {
    const tn = token.tagID;
    if (p.openElements.hasInScope(tn)) {
      p.openElements.generateImpliedEndTags();
      p.openElements.popUntilTagNamePopped(tn);
    }
  }
  function formEndTagInBody(p) {
    const inTemplate = p.openElements.tmplCount > 0;
    const { formElement } = p;
    if (!inTemplate) {
      p.formElement = null;
    }
    if ((formElement || inTemplate) && p.openElements.hasInScope(TAG_ID.FORM)) {
      p.openElements.generateImpliedEndTags();
      if (inTemplate) {
        p.openElements.popUntilTagNamePopped(TAG_ID.FORM);
      } else if (formElement) {
        p.openElements.remove(formElement);
      }
    }
  }
  function pEndTagInBody(p) {
    if (!p.openElements.hasInButtonScope(TAG_ID.P)) {
      p._insertFakeElement(TAG_NAMES.P, TAG_ID.P);
    }
    p._closePElement();
  }
  function liEndTagInBody(p) {
    if (p.openElements.hasInListItemScope(TAG_ID.LI)) {
      p.openElements.generateImpliedEndTagsWithExclusion(TAG_ID.LI);
      p.openElements.popUntilTagNamePopped(TAG_ID.LI);
    }
  }
  function ddEndTagInBody(p, token) {
    const tn = token.tagID;
    if (p.openElements.hasInScope(tn)) {
      p.openElements.generateImpliedEndTagsWithExclusion(tn);
      p.openElements.popUntilTagNamePopped(tn);
    }
  }
  function numberedHeaderEndTagInBody(p) {
    if (p.openElements.hasNumberedHeaderInScope()) {
      p.openElements.generateImpliedEndTags();
      p.openElements.popUntilNumberedHeaderPopped();
    }
  }
  function appletEndTagInBody(p, token) {
    const tn = token.tagID;
    if (p.openElements.hasInScope(tn)) {
      p.openElements.generateImpliedEndTags();
      p.openElements.popUntilTagNamePopped(tn);
      p.activeFormattingElements.clearToLastMarker();
    }
  }
  function brEndTagInBody(p) {
    p._reconstructActiveFormattingElements();
    p._insertFakeElement(TAG_NAMES.BR, TAG_ID.BR);
    p.openElements.pop();
    p.framesetOk = false;
  }
  function genericEndTagInBody(p, token) {
    const tn = token.tagName;
    const tid = token.tagID;
    for (let i = p.openElements.stackTop; i > 0; i--) {
      const element = p.openElements.items[i];
      const elementId = p.openElements.tagIDs[i];
      if (tid === elementId && (tid !== TAG_ID.UNKNOWN || p.treeAdapter.getTagName(element) === tn)) {
        p.openElements.generateImpliedEndTagsWithExclusion(tid);
        if (p.openElements.stackTop >= i)
          p.openElements.shortenToLength(i);
        break;
      }
      if (p._isSpecialElement(element, elementId)) {
        break;
      }
    }
  }
  function endTagInBody(p, token) {
    switch (token.tagID) {
      case TAG_ID.A:
      case TAG_ID.B:
      case TAG_ID.I:
      case TAG_ID.S:
      case TAG_ID.U:
      case TAG_ID.EM:
      case TAG_ID.TT:
      case TAG_ID.BIG:
      case TAG_ID.CODE:
      case TAG_ID.FONT:
      case TAG_ID.NOBR:
      case TAG_ID.SMALL:
      case TAG_ID.STRIKE:
      case TAG_ID.STRONG: {
        callAdoptionAgency(p, token);
        break;
      }
      case TAG_ID.P: {
        pEndTagInBody(p);
        break;
      }
      case TAG_ID.DL:
      case TAG_ID.UL:
      case TAG_ID.OL:
      case TAG_ID.DIR:
      case TAG_ID.DIV:
      case TAG_ID.NAV:
      case TAG_ID.PRE:
      case TAG_ID.MAIN:
      case TAG_ID.MENU:
      case TAG_ID.ASIDE:
      case TAG_ID.BUTTON:
      case TAG_ID.CENTER:
      case TAG_ID.FIGURE:
      case TAG_ID.FOOTER:
      case TAG_ID.HEADER:
      case TAG_ID.HGROUP:
      case TAG_ID.DIALOG:
      case TAG_ID.ADDRESS:
      case TAG_ID.ARTICLE:
      case TAG_ID.DETAILS:
      case TAG_ID.SEARCH:
      case TAG_ID.SECTION:
      case TAG_ID.SUMMARY:
      case TAG_ID.LISTING:
      case TAG_ID.FIELDSET:
      case TAG_ID.BLOCKQUOTE:
      case TAG_ID.FIGCAPTION: {
        addressEndTagInBody(p, token);
        break;
      }
      case TAG_ID.LI: {
        liEndTagInBody(p);
        break;
      }
      case TAG_ID.DD:
      case TAG_ID.DT: {
        ddEndTagInBody(p, token);
        break;
      }
      case TAG_ID.H1:
      case TAG_ID.H2:
      case TAG_ID.H3:
      case TAG_ID.H4:
      case TAG_ID.H5:
      case TAG_ID.H6: {
        numberedHeaderEndTagInBody(p);
        break;
      }
      case TAG_ID.BR: {
        brEndTagInBody(p);
        break;
      }
      case TAG_ID.BODY: {
        bodyEndTagInBody(p, token);
        break;
      }
      case TAG_ID.HTML: {
        htmlEndTagInBody(p, token);
        break;
      }
      case TAG_ID.FORM: {
        formEndTagInBody(p);
        break;
      }
      case TAG_ID.APPLET:
      case TAG_ID.OBJECT:
      case TAG_ID.MARQUEE: {
        appletEndTagInBody(p, token);
        break;
      }
      case TAG_ID.TEMPLATE: {
        templateEndTagInHead(p, token);
        break;
      }
      default: {
        genericEndTagInBody(p, token);
      }
    }
  }
  function eofInBody(p, token) {
    if (p.tmplInsertionModeStack.length > 0) {
      eofInTemplate(p, token);
    } else {
      stopParsing(p, token);
    }
  }
  function endTagInText(p, token) {
    var _a;
    if (token.tagID === TAG_ID.SCRIPT) {
      (_a = p.scriptHandler) === null || _a === void 0 ? void 0 : _a.call(p, p.openElements.current);
    }
    p.openElements.pop();
    p.insertionMode = p.originalInsertionMode;
  }
  function eofInText(p, token) {
    p._err(token, ERR.eofInElementThatCanContainOnlyText);
    p.openElements.pop();
    p.insertionMode = p.originalInsertionMode;
    p.onEof(token);
  }
  function characterInTable(p, token) {
    if (p.openElements.currentTagId !== void 0 && TABLE_STRUCTURE_TAGS.has(p.openElements.currentTagId)) {
      p.pendingCharacterTokens.length = 0;
      p.hasNonWhitespacePendingCharacterToken = false;
      p.originalInsertionMode = p.insertionMode;
      p.insertionMode = InsertionMode.IN_TABLE_TEXT;
      switch (token.type) {
        case TokenType.CHARACTER: {
          characterInTableText(p, token);
          break;
        }
        case TokenType.WHITESPACE_CHARACTER: {
          whitespaceCharacterInTableText(p, token);
          break;
        }
      }
    } else {
      tokenInTable(p, token);
    }
  }
  function captionStartTagInTable(p, token) {
    p.openElements.clearBackToTableContext();
    p.activeFormattingElements.insertMarker();
    p._insertElement(token, NS.HTML);
    p.insertionMode = InsertionMode.IN_CAPTION;
  }
  function colgroupStartTagInTable(p, token) {
    p.openElements.clearBackToTableContext();
    p._insertElement(token, NS.HTML);
    p.insertionMode = InsertionMode.IN_COLUMN_GROUP;
  }
  function colStartTagInTable(p, token) {
    p.openElements.clearBackToTableContext();
    p._insertFakeElement(TAG_NAMES.COLGROUP, TAG_ID.COLGROUP);
    p.insertionMode = InsertionMode.IN_COLUMN_GROUP;
    startTagInColumnGroup(p, token);
  }
  function tbodyStartTagInTable(p, token) {
    p.openElements.clearBackToTableContext();
    p._insertElement(token, NS.HTML);
    p.insertionMode = InsertionMode.IN_TABLE_BODY;
  }
  function tdStartTagInTable(p, token) {
    p.openElements.clearBackToTableContext();
    p._insertFakeElement(TAG_NAMES.TBODY, TAG_ID.TBODY);
    p.insertionMode = InsertionMode.IN_TABLE_BODY;
    startTagInTableBody(p, token);
  }
  function tableStartTagInTable(p, token) {
    if (p.openElements.hasInTableScope(TAG_ID.TABLE)) {
      p.openElements.popUntilTagNamePopped(TAG_ID.TABLE);
      p._resetInsertionMode();
      p._processStartTag(token);
    }
  }
  function inputStartTagInTable(p, token) {
    if (isHiddenInput(token)) {
      p._appendElement(token, NS.HTML);
    } else {
      tokenInTable(p, token);
    }
    token.ackSelfClosing = true;
  }
  function formStartTagInTable(p, token) {
    if (!p.formElement && p.openElements.tmplCount === 0) {
      p._insertElement(token, NS.HTML);
      p.formElement = p.openElements.current;
      p.openElements.pop();
    }
  }
  function startTagInTable(p, token) {
    switch (token.tagID) {
      case TAG_ID.TD:
      case TAG_ID.TH:
      case TAG_ID.TR: {
        tdStartTagInTable(p, token);
        break;
      }
      case TAG_ID.STYLE:
      case TAG_ID.SCRIPT:
      case TAG_ID.TEMPLATE: {
        startTagInHead(p, token);
        break;
      }
      case TAG_ID.COL: {
        colStartTagInTable(p, token);
        break;
      }
      case TAG_ID.FORM: {
        formStartTagInTable(p, token);
        break;
      }
      case TAG_ID.TABLE: {
        tableStartTagInTable(p, token);
        break;
      }
      case TAG_ID.TBODY:
      case TAG_ID.TFOOT:
      case TAG_ID.THEAD: {
        tbodyStartTagInTable(p, token);
        break;
      }
      case TAG_ID.INPUT: {
        inputStartTagInTable(p, token);
        break;
      }
      case TAG_ID.CAPTION: {
        captionStartTagInTable(p, token);
        break;
      }
      case TAG_ID.COLGROUP: {
        colgroupStartTagInTable(p, token);
        break;
      }
      default: {
        tokenInTable(p, token);
      }
    }
  }
  function endTagInTable(p, token) {
    switch (token.tagID) {
      case TAG_ID.TABLE: {
        if (p.openElements.hasInTableScope(TAG_ID.TABLE)) {
          p.openElements.popUntilTagNamePopped(TAG_ID.TABLE);
          p._resetInsertionMode();
        }
        break;
      }
      case TAG_ID.TEMPLATE: {
        templateEndTagInHead(p, token);
        break;
      }
      case TAG_ID.BODY:
      case TAG_ID.CAPTION:
      case TAG_ID.COL:
      case TAG_ID.COLGROUP:
      case TAG_ID.HTML:
      case TAG_ID.TBODY:
      case TAG_ID.TD:
      case TAG_ID.TFOOT:
      case TAG_ID.TH:
      case TAG_ID.THEAD:
      case TAG_ID.TR: {
        break;
      }
      default: {
        tokenInTable(p, token);
      }
    }
  }
  function tokenInTable(p, token) {
    const savedFosterParentingState = p.fosterParentingEnabled;
    p.fosterParentingEnabled = true;
    modeInBody(p, token);
    p.fosterParentingEnabled = savedFosterParentingState;
  }
  function whitespaceCharacterInTableText(p, token) {
    p.pendingCharacterTokens.push(token);
  }
  function characterInTableText(p, token) {
    p.pendingCharacterTokens.push(token);
    p.hasNonWhitespacePendingCharacterToken = true;
  }
  function tokenInTableText(p, token) {
    let i = 0;
    if (p.hasNonWhitespacePendingCharacterToken) {
      for (; i < p.pendingCharacterTokens.length; i++) {
        tokenInTable(p, p.pendingCharacterTokens[i]);
      }
    } else {
      for (; i < p.pendingCharacterTokens.length; i++) {
        p._insertCharacters(p.pendingCharacterTokens[i]);
      }
    }
    p.insertionMode = p.originalInsertionMode;
    p._processToken(token);
  }
  var TABLE_VOID_ELEMENTS = /* @__PURE__ */ new Set([TAG_ID.CAPTION, TAG_ID.COL, TAG_ID.COLGROUP, TAG_ID.TBODY, TAG_ID.TD, TAG_ID.TFOOT, TAG_ID.TH, TAG_ID.THEAD, TAG_ID.TR]);
  function startTagInCaption(p, token) {
    const tn = token.tagID;
    if (TABLE_VOID_ELEMENTS.has(tn)) {
      if (p.openElements.hasInTableScope(TAG_ID.CAPTION)) {
        p.openElements.generateImpliedEndTags();
        p.openElements.popUntilTagNamePopped(TAG_ID.CAPTION);
        p.activeFormattingElements.clearToLastMarker();
        p.insertionMode = InsertionMode.IN_TABLE;
        startTagInTable(p, token);
      }
    } else {
      startTagInBody(p, token);
    }
  }
  function endTagInCaption(p, token) {
    const tn = token.tagID;
    switch (tn) {
      case TAG_ID.CAPTION:
      case TAG_ID.TABLE: {
        if (p.openElements.hasInTableScope(TAG_ID.CAPTION)) {
          p.openElements.generateImpliedEndTags();
          p.openElements.popUntilTagNamePopped(TAG_ID.CAPTION);
          p.activeFormattingElements.clearToLastMarker();
          p.insertionMode = InsertionMode.IN_TABLE;
          if (tn === TAG_ID.TABLE) {
            endTagInTable(p, token);
          }
        }
        break;
      }
      case TAG_ID.BODY:
      case TAG_ID.COL:
      case TAG_ID.COLGROUP:
      case TAG_ID.HTML:
      case TAG_ID.TBODY:
      case TAG_ID.TD:
      case TAG_ID.TFOOT:
      case TAG_ID.TH:
      case TAG_ID.THEAD:
      case TAG_ID.TR: {
        break;
      }
      default: {
        endTagInBody(p, token);
      }
    }
  }
  function startTagInColumnGroup(p, token) {
    switch (token.tagID) {
      case TAG_ID.HTML: {
        startTagInBody(p, token);
        break;
      }
      case TAG_ID.COL: {
        p._appendElement(token, NS.HTML);
        token.ackSelfClosing = true;
        break;
      }
      case TAG_ID.TEMPLATE: {
        startTagInHead(p, token);
        break;
      }
      default: {
        tokenInColumnGroup(p, token);
      }
    }
  }
  function endTagInColumnGroup(p, token) {
    switch (token.tagID) {
      case TAG_ID.COLGROUP: {
        if (p.openElements.currentTagId === TAG_ID.COLGROUP) {
          p.openElements.pop();
          p.insertionMode = InsertionMode.IN_TABLE;
        }
        break;
      }
      case TAG_ID.TEMPLATE: {
        templateEndTagInHead(p, token);
        break;
      }
      case TAG_ID.COL: {
        break;
      }
      default: {
        tokenInColumnGroup(p, token);
      }
    }
  }
  function tokenInColumnGroup(p, token) {
    if (p.openElements.currentTagId === TAG_ID.COLGROUP) {
      p.openElements.pop();
      p.insertionMode = InsertionMode.IN_TABLE;
      p._processToken(token);
    }
  }
  function startTagInTableBody(p, token) {
    switch (token.tagID) {
      case TAG_ID.TR: {
        p.openElements.clearBackToTableBodyContext();
        p._insertElement(token, NS.HTML);
        p.insertionMode = InsertionMode.IN_ROW;
        break;
      }
      case TAG_ID.TH:
      case TAG_ID.TD: {
        p.openElements.clearBackToTableBodyContext();
        p._insertFakeElement(TAG_NAMES.TR, TAG_ID.TR);
        p.insertionMode = InsertionMode.IN_ROW;
        startTagInRow(p, token);
        break;
      }
      case TAG_ID.CAPTION:
      case TAG_ID.COL:
      case TAG_ID.COLGROUP:
      case TAG_ID.TBODY:
      case TAG_ID.TFOOT:
      case TAG_ID.THEAD: {
        if (p.openElements.hasTableBodyContextInTableScope()) {
          p.openElements.clearBackToTableBodyContext();
          p.openElements.pop();
          p.insertionMode = InsertionMode.IN_TABLE;
          startTagInTable(p, token);
        }
        break;
      }
      default: {
        startTagInTable(p, token);
      }
    }
  }
  function endTagInTableBody(p, token) {
    const tn = token.tagID;
    switch (token.tagID) {
      case TAG_ID.TBODY:
      case TAG_ID.TFOOT:
      case TAG_ID.THEAD: {
        if (p.openElements.hasInTableScope(tn)) {
          p.openElements.clearBackToTableBodyContext();
          p.openElements.pop();
          p.insertionMode = InsertionMode.IN_TABLE;
        }
        break;
      }
      case TAG_ID.TABLE: {
        if (p.openElements.hasTableBodyContextInTableScope()) {
          p.openElements.clearBackToTableBodyContext();
          p.openElements.pop();
          p.insertionMode = InsertionMode.IN_TABLE;
          endTagInTable(p, token);
        }
        break;
      }
      case TAG_ID.BODY:
      case TAG_ID.CAPTION:
      case TAG_ID.COL:
      case TAG_ID.COLGROUP:
      case TAG_ID.HTML:
      case TAG_ID.TD:
      case TAG_ID.TH:
      case TAG_ID.TR: {
        break;
      }
      default: {
        endTagInTable(p, token);
      }
    }
  }
  function startTagInRow(p, token) {
    switch (token.tagID) {
      case TAG_ID.TH:
      case TAG_ID.TD: {
        p.openElements.clearBackToTableRowContext();
        p._insertElement(token, NS.HTML);
        p.insertionMode = InsertionMode.IN_CELL;
        p.activeFormattingElements.insertMarker();
        break;
      }
      case TAG_ID.CAPTION:
      case TAG_ID.COL:
      case TAG_ID.COLGROUP:
      case TAG_ID.TBODY:
      case TAG_ID.TFOOT:
      case TAG_ID.THEAD:
      case TAG_ID.TR: {
        if (p.openElements.hasInTableScope(TAG_ID.TR)) {
          p.openElements.clearBackToTableRowContext();
          p.openElements.pop();
          p.insertionMode = InsertionMode.IN_TABLE_BODY;
          startTagInTableBody(p, token);
        }
        break;
      }
      default: {
        startTagInTable(p, token);
      }
    }
  }
  function endTagInRow(p, token) {
    switch (token.tagID) {
      case TAG_ID.TR: {
        if (p.openElements.hasInTableScope(TAG_ID.TR)) {
          p.openElements.clearBackToTableRowContext();
          p.openElements.pop();
          p.insertionMode = InsertionMode.IN_TABLE_BODY;
        }
        break;
      }
      case TAG_ID.TABLE: {
        if (p.openElements.hasInTableScope(TAG_ID.TR)) {
          p.openElements.clearBackToTableRowContext();
          p.openElements.pop();
          p.insertionMode = InsertionMode.IN_TABLE_BODY;
          endTagInTableBody(p, token);
        }
        break;
      }
      case TAG_ID.TBODY:
      case TAG_ID.TFOOT:
      case TAG_ID.THEAD: {
        if (p.openElements.hasInTableScope(token.tagID) || p.openElements.hasInTableScope(TAG_ID.TR)) {
          p.openElements.clearBackToTableRowContext();
          p.openElements.pop();
          p.insertionMode = InsertionMode.IN_TABLE_BODY;
          endTagInTableBody(p, token);
        }
        break;
      }
      case TAG_ID.BODY:
      case TAG_ID.CAPTION:
      case TAG_ID.COL:
      case TAG_ID.COLGROUP:
      case TAG_ID.HTML:
      case TAG_ID.TD:
      case TAG_ID.TH: {
        break;
      }
      default: {
        endTagInTable(p, token);
      }
    }
  }
  function startTagInCell(p, token) {
    const tn = token.tagID;
    if (TABLE_VOID_ELEMENTS.has(tn)) {
      if (p.openElements.hasInTableScope(TAG_ID.TD) || p.openElements.hasInTableScope(TAG_ID.TH)) {
        p._closeTableCell();
        startTagInRow(p, token);
      }
    } else {
      startTagInBody(p, token);
    }
  }
  function endTagInCell(p, token) {
    const tn = token.tagID;
    switch (tn) {
      case TAG_ID.TD:
      case TAG_ID.TH: {
        if (p.openElements.hasInTableScope(tn)) {
          p.openElements.generateImpliedEndTags();
          p.openElements.popUntilTagNamePopped(tn);
          p.activeFormattingElements.clearToLastMarker();
          p.insertionMode = InsertionMode.IN_ROW;
        }
        break;
      }
      case TAG_ID.TABLE:
      case TAG_ID.TBODY:
      case TAG_ID.TFOOT:
      case TAG_ID.THEAD:
      case TAG_ID.TR: {
        if (p.openElements.hasInTableScope(tn)) {
          p._closeTableCell();
          endTagInRow(p, token);
        }
        break;
      }
      case TAG_ID.BODY:
      case TAG_ID.CAPTION:
      case TAG_ID.COL:
      case TAG_ID.COLGROUP:
      case TAG_ID.HTML: {
        break;
      }
      default: {
        endTagInBody(p, token);
      }
    }
  }
  function startTagInSelect(p, token) {
    switch (token.tagID) {
      case TAG_ID.HTML: {
        startTagInBody(p, token);
        break;
      }
      case TAG_ID.OPTION: {
        if (p.openElements.currentTagId === TAG_ID.OPTION) {
          p.openElements.pop();
        }
        p._insertElement(token, NS.HTML);
        break;
      }
      case TAG_ID.OPTGROUP: {
        if (p.openElements.currentTagId === TAG_ID.OPTION) {
          p.openElements.pop();
        }
        if (p.openElements.currentTagId === TAG_ID.OPTGROUP) {
          p.openElements.pop();
        }
        p._insertElement(token, NS.HTML);
        break;
      }
      case TAG_ID.HR: {
        if (p.openElements.currentTagId === TAG_ID.OPTION) {
          p.openElements.pop();
        }
        if (p.openElements.currentTagId === TAG_ID.OPTGROUP) {
          p.openElements.pop();
        }
        p._appendElement(token, NS.HTML);
        token.ackSelfClosing = true;
        break;
      }
      case TAG_ID.INPUT:
      case TAG_ID.KEYGEN:
      case TAG_ID.TEXTAREA:
      case TAG_ID.SELECT: {
        if (p.openElements.hasInSelectScope(TAG_ID.SELECT)) {
          p.openElements.popUntilTagNamePopped(TAG_ID.SELECT);
          p._resetInsertionMode();
          if (token.tagID !== TAG_ID.SELECT) {
            p._processStartTag(token);
          }
        }
        break;
      }
      case TAG_ID.SCRIPT:
      case TAG_ID.TEMPLATE: {
        startTagInHead(p, token);
        break;
      }
      default:
    }
  }
  function endTagInSelect(p, token) {
    switch (token.tagID) {
      case TAG_ID.OPTGROUP: {
        if (p.openElements.stackTop > 0 && p.openElements.currentTagId === TAG_ID.OPTION && p.openElements.tagIDs[p.openElements.stackTop - 1] === TAG_ID.OPTGROUP) {
          p.openElements.pop();
        }
        if (p.openElements.currentTagId === TAG_ID.OPTGROUP) {
          p.openElements.pop();
        }
        break;
      }
      case TAG_ID.OPTION: {
        if (p.openElements.currentTagId === TAG_ID.OPTION) {
          p.openElements.pop();
        }
        break;
      }
      case TAG_ID.SELECT: {
        if (p.openElements.hasInSelectScope(TAG_ID.SELECT)) {
          p.openElements.popUntilTagNamePopped(TAG_ID.SELECT);
          p._resetInsertionMode();
        }
        break;
      }
      case TAG_ID.TEMPLATE: {
        templateEndTagInHead(p, token);
        break;
      }
      default:
    }
  }
  function startTagInSelectInTable(p, token) {
    const tn = token.tagID;
    if (tn === TAG_ID.CAPTION || tn === TAG_ID.TABLE || tn === TAG_ID.TBODY || tn === TAG_ID.TFOOT || tn === TAG_ID.THEAD || tn === TAG_ID.TR || tn === TAG_ID.TD || tn === TAG_ID.TH) {
      p.openElements.popUntilTagNamePopped(TAG_ID.SELECT);
      p._resetInsertionMode();
      p._processStartTag(token);
    } else {
      startTagInSelect(p, token);
    }
  }
  function endTagInSelectInTable(p, token) {
    const tn = token.tagID;
    if (tn === TAG_ID.CAPTION || tn === TAG_ID.TABLE || tn === TAG_ID.TBODY || tn === TAG_ID.TFOOT || tn === TAG_ID.THEAD || tn === TAG_ID.TR || tn === TAG_ID.TD || tn === TAG_ID.TH) {
      if (p.openElements.hasInTableScope(tn)) {
        p.openElements.popUntilTagNamePopped(TAG_ID.SELECT);
        p._resetInsertionMode();
        p.onEndTag(token);
      }
    } else {
      endTagInSelect(p, token);
    }
  }
  function startTagInTemplate(p, token) {
    switch (token.tagID) {
      // First, handle tags that can start without a mode change
      case TAG_ID.BASE:
      case TAG_ID.BASEFONT:
      case TAG_ID.BGSOUND:
      case TAG_ID.LINK:
      case TAG_ID.META:
      case TAG_ID.NOFRAMES:
      case TAG_ID.SCRIPT:
      case TAG_ID.STYLE:
      case TAG_ID.TEMPLATE:
      case TAG_ID.TITLE: {
        startTagInHead(p, token);
        break;
      }
      // Re-process the token in the appropriate mode
      case TAG_ID.CAPTION:
      case TAG_ID.COLGROUP:
      case TAG_ID.TBODY:
      case TAG_ID.TFOOT:
      case TAG_ID.THEAD: {
        p.tmplInsertionModeStack[0] = InsertionMode.IN_TABLE;
        p.insertionMode = InsertionMode.IN_TABLE;
        startTagInTable(p, token);
        break;
      }
      case TAG_ID.COL: {
        p.tmplInsertionModeStack[0] = InsertionMode.IN_COLUMN_GROUP;
        p.insertionMode = InsertionMode.IN_COLUMN_GROUP;
        startTagInColumnGroup(p, token);
        break;
      }
      case TAG_ID.TR: {
        p.tmplInsertionModeStack[0] = InsertionMode.IN_TABLE_BODY;
        p.insertionMode = InsertionMode.IN_TABLE_BODY;
        startTagInTableBody(p, token);
        break;
      }
      case TAG_ID.TD:
      case TAG_ID.TH: {
        p.tmplInsertionModeStack[0] = InsertionMode.IN_ROW;
        p.insertionMode = InsertionMode.IN_ROW;
        startTagInRow(p, token);
        break;
      }
      default: {
        p.tmplInsertionModeStack[0] = InsertionMode.IN_BODY;
        p.insertionMode = InsertionMode.IN_BODY;
        startTagInBody(p, token);
      }
    }
  }
  function endTagInTemplate(p, token) {
    if (token.tagID === TAG_ID.TEMPLATE) {
      templateEndTagInHead(p, token);
    }
  }
  function eofInTemplate(p, token) {
    if (p.openElements.tmplCount > 0) {
      p.openElements.popUntilTagNamePopped(TAG_ID.TEMPLATE);
      p.activeFormattingElements.clearToLastMarker();
      p.tmplInsertionModeStack.shift();
      p._resetInsertionMode();
      p.onEof(token);
    } else {
      stopParsing(p, token);
    }
  }
  function startTagAfterBody(p, token) {
    if (token.tagID === TAG_ID.HTML) {
      startTagInBody(p, token);
    } else {
      tokenAfterBody(p, token);
    }
  }
  function endTagAfterBody(p, token) {
    var _a;
    if (token.tagID === TAG_ID.HTML) {
      if (!p.fragmentContext) {
        p.insertionMode = InsertionMode.AFTER_AFTER_BODY;
      }
      if (p.options.sourceCodeLocationInfo && p.openElements.tagIDs[0] === TAG_ID.HTML) {
        p._setEndLocation(p.openElements.items[0], token);
        const bodyElement = p.openElements.items[1];
        if (bodyElement && !((_a = p.treeAdapter.getNodeSourceCodeLocation(bodyElement)) === null || _a === void 0 ? void 0 : _a.endTag)) {
          p._setEndLocation(bodyElement, token);
        }
      }
    } else {
      tokenAfterBody(p, token);
    }
  }
  function tokenAfterBody(p, token) {
    p.insertionMode = InsertionMode.IN_BODY;
    modeInBody(p, token);
  }
  function startTagInFrameset(p, token) {
    switch (token.tagID) {
      case TAG_ID.HTML: {
        startTagInBody(p, token);
        break;
      }
      case TAG_ID.FRAMESET: {
        p._insertElement(token, NS.HTML);
        break;
      }
      case TAG_ID.FRAME: {
        p._appendElement(token, NS.HTML);
        token.ackSelfClosing = true;
        break;
      }
      case TAG_ID.NOFRAMES: {
        startTagInHead(p, token);
        break;
      }
      default:
    }
  }
  function endTagInFrameset(p, token) {
    if (token.tagID === TAG_ID.FRAMESET && !p.openElements.isRootHtmlElementCurrent()) {
      p.openElements.pop();
      if (!p.fragmentContext && p.openElements.currentTagId !== TAG_ID.FRAMESET) {
        p.insertionMode = InsertionMode.AFTER_FRAMESET;
      }
    }
  }
  function startTagAfterFrameset(p, token) {
    switch (token.tagID) {
      case TAG_ID.HTML: {
        startTagInBody(p, token);
        break;
      }
      case TAG_ID.NOFRAMES: {
        startTagInHead(p, token);
        break;
      }
      default:
    }
  }
  function endTagAfterFrameset(p, token) {
    if (token.tagID === TAG_ID.HTML) {
      p.insertionMode = InsertionMode.AFTER_AFTER_FRAMESET;
    }
  }
  function startTagAfterAfterBody(p, token) {
    if (token.tagID === TAG_ID.HTML) {
      startTagInBody(p, token);
    } else {
      tokenAfterAfterBody(p, token);
    }
  }
  function tokenAfterAfterBody(p, token) {
    p.insertionMode = InsertionMode.IN_BODY;
    modeInBody(p, token);
  }
  function startTagAfterAfterFrameset(p, token) {
    switch (token.tagID) {
      case TAG_ID.HTML: {
        startTagInBody(p, token);
        break;
      }
      case TAG_ID.NOFRAMES: {
        startTagInHead(p, token);
        break;
      }
      default:
    }
  }
  function nullCharacterInForeignContent(p, token) {
    token.chars = REPLACEMENT_CHARACTER;
    p._insertCharacters(token);
  }
  function characterInForeignContent(p, token) {
    p._insertCharacters(token);
    p.framesetOk = false;
  }
  function popUntilHtmlOrIntegrationPoint(p) {
    while (p.treeAdapter.getNamespaceURI(p.openElements.current) !== NS.HTML && p.openElements.currentTagId !== void 0 && !p._isIntegrationPoint(p.openElements.currentTagId, p.openElements.current)) {
      p.openElements.pop();
    }
  }
  function startTagInForeignContent(p, token) {
    if (causesExit(token)) {
      popUntilHtmlOrIntegrationPoint(p);
      p._startTagOutsideForeignContent(token);
    } else {
      const current = p._getAdjustedCurrentElement();
      const currentNs = p.treeAdapter.getNamespaceURI(current);
      if (currentNs === NS.MATHML) {
        adjustTokenMathMLAttrs(token);
      } else if (currentNs === NS.SVG) {
        adjustTokenSVGTagName(token);
        adjustTokenSVGAttrs(token);
      }
      adjustTokenXMLAttrs(token);
      if (token.selfClosing) {
        p._appendElement(token, currentNs);
      } else {
        p._insertElement(token, currentNs);
      }
      token.ackSelfClosing = true;
    }
  }
  function endTagInForeignContent(p, token) {
    if (token.tagID === TAG_ID.P || token.tagID === TAG_ID.BR) {
      popUntilHtmlOrIntegrationPoint(p);
      p._endTagOutsideForeignContent(token);
      return;
    }
    for (let i = p.openElements.stackTop; i > 0; i--) {
      const element = p.openElements.items[i];
      if (p.treeAdapter.getNamespaceURI(element) === NS.HTML) {
        p._endTagOutsideForeignContent(token);
        break;
      }
      const tagName = p.treeAdapter.getTagName(element);
      if (tagName.toLowerCase() === token.tagName) {
        token.tagName = tagName;
        p.openElements.shortenToLength(i);
        break;
      }
    }
  }

  // ../../engine-v2/node_modules/parse5/dist/serializer/index.js
  var VOID_ELEMENTS = /* @__PURE__ */ new Set([
    TAG_NAMES.AREA,
    TAG_NAMES.BASE,
    TAG_NAMES.BASEFONT,
    TAG_NAMES.BGSOUND,
    TAG_NAMES.BR,
    TAG_NAMES.COL,
    TAG_NAMES.EMBED,
    TAG_NAMES.FRAME,
    TAG_NAMES.HR,
    TAG_NAMES.IMG,
    TAG_NAMES.INPUT,
    TAG_NAMES.KEYGEN,
    TAG_NAMES.LINK,
    TAG_NAMES.META,
    TAG_NAMES.PARAM,
    TAG_NAMES.SOURCE,
    TAG_NAMES.TRACK,
    TAG_NAMES.WBR
  ]);

  // ../../engine-v2/html-rules.mjs
  var htmlNames = {
    "outline-title": "ページの題名",
    "outline-sections": "大見出し",
    "outline-subsections": "小見出し",
    "outline-paragraphs": "説明の段落",
    "outline-breaks": "段落内の改行",
    "outline-emphasis": "重要語句の強調",
    "image-paths": "画像ファイルの指定",
    "image-widths": "画像の横幅",
    "image-heights": "画像の高さ",
    "image-alternatives": "代替テキスト",
    "relative-page-links": "同じフォルダのページへのリンク",
    "external-links": "外部サイトへのリンク",
    "external-new-tab": "外部リンクを新しいタブで開く",
    "contents-heading": "目次の見出し",
    "matching-fragment-links": "目次から各項目へのリンク",
    "topic-headings": "各項目の見出し",
    "topic-images": "各項目の画像",
    "ingredients-list": "材料の箇条書き",
    "procedure-list": "手順の番号付きリスト",
    "nested-topics": "入れ子リストの大項目",
    "nested-second-level": "入れ子リストの第2階層",
    "nested-third-level": "入れ子リストの第3階層",
    "ordinary-table": "基本の表",
    "horizontal-spans": "横方向のセル結合",
    "vertical-span": "縦方向のセル結合",
    "original-table": "自分で作成した表"
  };
  var htmlWeights = {
    "sample1-3_2": [10, 20, 30, 20, 10, 10],
    "sample1-4": [50, 20, 20, 10],
    "sample1-5_1": [60, 30, 10],
    "sample1-5_2": [10, 45, 15, 30],
    "sample1-6": [20, 20, 15, 25, 20],
    "sample1-7": [20, 25, 25, 30]
  };
  var outlineSections = [
    ["HTMLの基本構造", [
      ["HTMLとは何か", "HTMLはウェブページを作成するための言語です。", "主にテキストや画像を表示するために使われます。", "ウェブブラウザはHTMLを解釈し、ページの見た目を表示します。"],
      ["基本的なタグ", "HTMLには、見出しや段落などを定義するためのタグがあります。", "見出しはh1からh6まであり、段落はpで表されます。", "これらのタグを使うことで、ページの構造を作ることができます。"],
      ["HTMLファイルの構成", "通常、HTMLファイルはhtmlというタグで囲まれます。", "その中にheadタグとbodyタグが含まれます。", "headにはページのタイトルやスタイルなどが、bodyには実際のコンテンツが入ります。"]
    ]],
    ["CSSの基礎", [
      ["CSSとは", "CSSはウェブページのデザインを設定するための言語です。", "色やフォント、レイアウトなどを指定することができます。", "CSSを使うと、ウェブページの見た目を簡単に変えることができます。"],
      ["セレクタとプロパティ", "CSSでは、要素を選んで、そのデザインを指定します。", "たとえば、pというタグを選んで、文字の色や大きさを設定することができます。", "プロパティとしては、色やフォントサイズなどがあります。"],
      ["外部スタイルシートの使用", "外部のCSSファイルを使うと、複数のページに同じデザインを適用することができます。", "", "これにより、デザインの管理が簡単になります。"]
    ]]
  ];
  var ingredients = ["カレーのルウ（中辛）・・・1箱", "牛肉・・・250g", "玉ねぎ・・・4個", "じゃがいも・・・3個", "にんじん・・・1本", "サラダ油・・・大さじ1", "水・・・1000mL"];
  var procedure = ["玉ねぎをくし切りにします。", "じゃがいもを6～8等分に切り分けるのが目安です。", "にんじんを3cm大の乱切りにします。", "厚手の鍋にサラダ油を熱し、牛肉を入れて、焼き目がつくまで炒めます。", "鍋に、玉ねぎ、じゃがいも、にんじんを入れ、玉ねぎがしんなりするまで炒めます。", "水を加え、沸騰したらあくを取ります。", "具材が柔らかくなるまで弱火～中火で約15分煮込みます。", "いったん火を止め、沸騰がおさまってからルウを割り入れてよく溶かします。", "再び弱火で時々かき混ぜながら、とろみがつくまで約10分煮込んででき上がりです。"];
  var MAX_TABLE_SPAN = 100;
  var topicTextMinimums = [324, 293, 288];
  var htmlRuleConfigs = {
    "sample1-3_2": [
      { ruleId: "outline-title", ruleType: "registered-html", target: "先頭のページ題名", expected: { title: "Webページ制作の基礎" } },
      { ruleId: "outline-sections", ruleType: "registered-html", target: "大見出し2件", expected: { sections: outlineSections.map(([title]) => title) } },
      { ruleId: "outline-subsections", ruleType: "registered-html", target: "各大見出し内の小見出し", expected: { sections: outlineSections.map(([title, items]) => ({ title, headings: items.map(([heading]) => heading) })) } },
      { ruleId: "outline-paragraphs", ruleType: "registered-html", target: "各小見出しの説明段落", expected: { sections: outlineSections.map(([title, items]) => ({ title, paragraphs: items.map(([heading, first, second, last]) => ({ heading, first: first + second, last })) })) } },
      { ruleId: "outline-breaks", ruleType: "registered-html", target: "指定した説明段落内の改行", expected: { sections: outlineSections.map(([title, items]) => ({ title, paragraphs: items.map(([heading, first]) => ({ heading, beforeBreak: first })) })) } },
      { ruleId: "outline-emphasis", ruleType: "registered-html", target: "指定した段落内の強調語句", expected: { emphasis: [
        { tag: "strong", text: "タグ", section: 0, paragraph: 1, position: "first" },
        { tag: "strong", text: "html", section: 0, paragraph: 2, position: "first" },
        { tag: "strong", text: "head", section: 0, paragraph: 2, position: "first" },
        { tag: "strong", text: "body", section: 0, paragraph: 2, position: "first" },
        { tag: "strong", text: "head", section: 0, paragraph: 2, position: "last" },
        { tag: "strong", text: "body", section: 0, paragraph: 2, position: "last" },
        { tag: "strong", text: "p", section: 1, paragraph: 1, position: "first" },
        { tag: "em", text: "h1", section: 0, paragraph: 1, position: "first" },
        { tag: "em", text: "h6", section: 0, paragraph: 1, position: "first" },
        { tag: "em", text: "p", section: 0, paragraph: 1, position: "first" }
      ] } }
    ],
    "sample1-4": [
      { ruleId: "image-paths", ruleType: "registered-html", target: "5枚の画像ファイル", expected: { images: [
        { src: "images/photo01.jpg" },
        { src: "images/photo02.jpg" },
        { src: "images/photo03.jpg" },
        { src: "images/photo04.jpg" },
        { src: "images/photo05.jpg" }
      ] } },
      { ruleId: "image-widths", ruleType: "registered-html", target: "各画像の横幅", expected: { widths: [480, 300, 320, 480, 300] } },
      { ruleId: "image-heights", ruleType: "registered-html", target: "各画像の高さ", expected: { heights: [320, 200, null, 360, null] } },
      { ruleId: "image-alternatives", ruleType: "registered-html", target: "各画像の代替テキスト", expected: { alternatives: ["写真01", "写真02", "写真03", "写真04", "写真05"] } }
    ],
    "sample1-5_1": [
      { ruleId: "relative-page-links", ruleType: "registered-html", target: "同じフォルダのHTMLへのリンク", expected: { hrefs: ["sample1-2.html", "sample1-3_1.html", "sample1-3_2.html", "sample1-4.html"] } },
      { ruleId: "external-links", ruleType: "registered-html", target: "外部サイトへのリンク", expected: { hrefs: ["https://www.kaijo.ed.jp/", "https://www.apple.com/jp/", "https://www.google.com/"] } },
      { ruleId: "external-new-tab", ruleType: "registered-html", target: "外部リンクの新規タブ指定", expected: { hrefs: ["https://www.kaijo.ed.jp/", "https://www.apple.com/jp/", "https://www.google.com/"], target: "_blank" } }
    ],
    "sample1-5_2": [
      { ruleId: "contents-heading", ruleType: "registered-html", target: "目次の見出し", expected: { heading: "目次" } },
      { ruleId: "matching-fragment-links", ruleType: "registered-html", target: "目次から各項目へのページ内リンク", expected: { topics: ["インターネットの歴史", "プログラミング言語の歴史", "未来の技術"], minParagraphs: 10, minimumText: topicTextMinimums } },
      { ruleId: "topic-headings", ruleType: "registered-html", target: "各項目の見出し", expected: { headings: ["インターネットの歴史", "プログラミング言語の歴史", "未来の技術"] } },
      { ruleId: "topic-images", ruleType: "registered-html", target: "各項目の画像", expected: { images: [
        { src: "images/evolution_of_internet.png", width: 400 },
        { src: "images/history_of_programming_languages.png", width: 400 },
        { src: "images/futuristic_technologies.png", width: 400 }
      ] } }
    ],
    "sample1-6": [
      { ruleId: "ingredients-list", ruleType: "registered-html", target: "材料の箇条書き", expected: { items: ingredients } },
      { ruleId: "procedure-list", ruleType: "registered-html", target: "手順の番号付きリスト", expected: { items: procedure } },
      { ruleId: "nested-topics", ruleType: "registered-html", target: "入れ子リストの大項目", expected: { items: ["個人情報保護法によって義務づけられていること", "個人情報を取り扱う事業者が、本人からの求めに応じて、原則として行わなければならないこと", "個人情報の有効活用"] } },
      { ruleId: "nested-second-level", ruleType: "registered-html", target: "入れ子リストの第2階層", expected: { items: [["個人情報を取得する際は", "個人情報が漏れたり", "本人の同意がないのに"], ["開示", "訂正", "利用停止"], ["ターゲティング広告", "匿名加工情報の利用"]] } },
      { ruleId: "nested-third-level", ruleType: "registered-html", target: "入れ子リストの第3階層", expected: { items: [["法令に基づく場合", "人の生命・身体・財産の保護に必要な場合", "公衆衛生・児童の健全な育成に必要な場合"], ["オプトイン方式", "オプトアウト方式"], ["車のナビゲーションシステム", "医療情報を活用", "各家庭の電力利用履歴"]] } }
    ],
    "sample1-7": [
      { ruleId: "ordinary-table", ruleType: "registered-html", target: "見出し行と2行のデータからなる表", expected: { cells: [["見出し1", "見出し2", "見出し3"], ["2行目の1列目", "2行目の2列目", "2行目の3列目"], ["3行目の1列目", "3行目の2列目", "3行目の3列目"]] } },
      { ruleId: "horizontal-spans", ruleType: "registered-html", target: "横方向に結合した表セル", expected: {} },
      { ruleId: "vertical-span", ruleType: "registered-html", target: "縦方向に結合した表セル", expected: {} },
      { ruleId: "original-table", ruleType: "registered-html", target: "3行3列以上の自作表", expected: {} }
    ]
  };
  function applyHtmlRules(rubricId, ctx) {
    var _a, _b;
    const { tags, within, body, textOf: textOf2, normalized: normalized2, attr: attr3, hasAttr: hasAttr3, inside: inside2, diagnostics, rule, part: part2, position: position2 } = ctx;
    const norm = (value) => normalized2(value);
    const positions = new Map(ctx.active.map((node, index) => [node, index]));
    const order = (node) => {
      var _a2;
      return (_a2 = positions.get(node)) != null ? _a2 : -1;
    };
    const bodyCache = /* @__PURE__ */ new Map();
    const bodyNodes = (tag) => {
      if (!bodyCache.has(tag)) bodyCache.set(tag, within(tag, body));
      return bodyCache.get(tag);
    };
    const direct = (node, tag) => ((node == null ? void 0 : node.childNodes) || []).filter((child) => (child == null ? void 0 : child.tagName) === tag);
    const oneText = (tag, expected) => {
      const matches2 = bodyNodes(tag).filter((node) => textOf2(node) === norm(expected));
      if (matches2.length > 1) diagnostics.push({ code: "duplicate_answer", location: position2(matches2[0]) });
      return matches2.length === 1 ? matches2[0] : null;
    };
    const containsText = (node, expected) => textOf2(node).includes(norm(expected));
    const positiveInteger = (value) => /^\d+$/.test(String(value).trim()) && Number(value) > 0;
    const integerEquals = (value, expected) => /^\d+$/.test(String(value).trim()) && Number(value) === Number(expected);
    const isRelative = (value) => value && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(value);
    const samePath = (value, expected) => String(value).replace(/^\.\//, "") === expected;
    const nearest = (node, tag) => {
      for (let n = node == null ? void 0 : node.parentNode; n; n = n.parentNode) if (n.tagName === tag) return n;
      return null;
    };
    const descendants = (node, tag) => bodyNodes(tag).filter((child) => inside2(child, node));
    const uniqueCandidate = (candidates, expected) => {
      const matches2 = candidates.filter((node) => textOf2(node) === norm(expected));
      if (matches2.length > 1) diagnostics.push({ code: "duplicate_answer", location: position2(matches2[0]) });
      return matches2.length === 1 ? matches2[0] : null;
    };
    const expectedFor2 = (ruleId) => {
      var _a2, _b2, _c, _d;
      return (_d = (_a2 = ctx.expected) == null ? void 0 : _a2.call(ctx, ruleId)) != null ? _d : (_c = (_b2 = htmlRuleConfigs[rubricId]) == null ? void 0 : _b2.find((config) => config.ruleId === ruleId)) == null ? void 0 : _c.expected;
    };
    if (!htmlWeights[rubricId]) throw new Error("rubric_unavailable");
    if (rubricId === "sample1-3_2") {
      const h1 = oneText("h1", expectedFor2("outline-title").title);
      const sectionTitles = expectedFor2("outline-sections").sections;
      const subsectionConfig = expectedFor2("outline-subsections").sections;
      const paragraphConfig = expectedFor2("outline-paragraphs").sections;
      const breakConfig = expectedFor2("outline-breaks").sections;
      const h2s = sectionTitles.map((title) => oneText("h2", title));
      const firstHeading = [...tags("h1"), ...tags("h2"), ...tags("h3")].sort((a, b) => order(a) - order(b))[0];
      rule("outline-title", 10, [part2(Boolean(h1) && firstHeading === h1, 10, h1)]);
      rule("outline-sections", 20, [part2(Boolean(h2s[0]), 10, h2s[0]), part2(Boolean(h2s[1]) && (!h2s[0] || order(h2s[0]) < order(h2s[1])), 10, h2s[1])]);
      const allH3 = tags("h3");
      const subsectionParts = [], paragraphParts = [], breakParts = [];
      const contexts = [];
      subsectionConfig.forEach((sectionConfig, sectionIndex) => {
        const sections = sectionConfig.headings;
        const section = h2s[sectionIndex];
        const next = h2s[sectionIndex + 1];
        const range = section ? allH3.filter((node) => order(node) > order(section) && (!next || order(node) < order(next))) : [];
        const expectedH3 = sections.map((heading) => uniqueCandidate(range, heading));
        sections.forEach((heading, index) => {
          const paragraph = paragraphConfig[sectionIndex].paragraphs[index];
          const breakBefore = breakConfig[sectionIndex].paragraphs[index].beforeBreak;
          const h3 = expectedH3[index];
          const nextH3 = range[range.indexOf(h3) + 1];
          const ps = h3 ? bodyNodes("p").filter((node) => order(node) > order(h3) && (!nextH3 || order(node) < order(nextH3)) && (!next || order(node) < order(next))) : [];
          const previousExpected = expectedH3[index - 1];
          const nextExpected = expectedH3[index + 1];
          const ordered = Boolean(h3) && (!previousExpected || order(previousExpected) < order(h3)) && (!nextExpected || order(h3) < order(nextExpected));
          subsectionParts.push(part2(ordered, 5, h3));
          const firstP = uniqueCandidate(ps, paragraph.first);
          const lastP = uniqueCandidate(ps, paragraph.last);
          contexts.push({ sectionIndex, index, firstP, lastP });
          paragraphParts.push(part2(Boolean(firstP), 20 / 12, firstP), part2(Boolean(lastP), 20 / 12, lastP));
          if (sectionIndex * 3 + index < 5) {
            const brs = firstP ? descendants(firstP, "br") : [];
            let before = "";
            const hasBreak = firstP && (() => {
              const pending2 = [...firstP.childNodes || []].reverse();
              while (pending2.length) {
                const node = pending2.pop();
                if (node.nodeName === "#text") before += node.value;
                else if (node.tagName === "br" && norm(before) === norm(breakBefore)) return true;
                else if (node.childNodes) pending2.push(...node.childNodes.slice().reverse());
              }
              return false;
            })();
            breakParts.push(part2(Boolean(firstP) && hasBreak, 2, firstP));
          }
        });
      });
      const context = (sectionIndex, index, paragraph) => {
        var _a2;
        return (_a2 = contexts.find((item) => item.sectionIndex === sectionIndex && item.index === index)) == null ? void 0 : _a2[paragraph];
      };
      const emphasisParts = expectedFor2("outline-emphasis").emphasis.map(({ tag, text, section, paragraph, position: paragraphPosition }) => {
        const paragraphNode = context(section, paragraph, paragraphPosition + "P");
        const nodes = paragraphNode ? descendants(paragraphNode, tag).filter((node) => textOf2(node) === norm(text)) : [];
        if (nodes.length > 1) diagnostics.push({ code: "duplicate_answer", location: position2(nodes[0]) });
        return part2(nodes.length === 1, tag === "strong" ? 5 / 7 : 5 / 3, nodes[0]);
      });
      rule("outline-subsections", 30, subsectionParts);
      rule("outline-paragraphs", 20, paragraphParts);
      rule("outline-breaks", 10, breakParts);
      rule("outline-emphasis", 10, emphasisParts);
      return;
    }
    if (rubricId === "sample1-4") {
      const imagePaths = expectedFor2("image-paths").images;
      const widths = expectedFor2("image-widths").widths;
      const heights = expectedFor2("image-heights").heights;
      const alternatives = expectedFor2("image-alternatives").alternatives;
      const selected = imagePaths.map(({ src }) => {
        const matches2 = bodyNodes("img").filter((node) => samePath(attr3(node, "src"), src));
        if (matches2.length > 1) diagnostics.push({ code: "duplicate_answer", location: position2(matches2[0]) });
        return matches2.length === 1 ? matches2[0] : null;
      });
      rule("image-paths", 50, selected.map((node) => part2(Boolean(node), 10, node)));
      rule("image-widths", 20, selected.map((node, i) => part2(Boolean(node) && integerEquals(attr3(node, "width"), widths[i]), 4, node)));
      rule("image-heights", 20, selected.map((node, i) => part2(Boolean(node) && (heights[i] !== null ? integerEquals(attr3(node, "height"), heights[i]) : !hasAttr3(node, "height")), 4, node)));
      rule("image-alternatives", 10, selected.map((node, i) => {
        const value = attr3(node, "alt").trim();
        const expected = alternatives[i];
        const anotherPhoto = alternatives.includes(value) && value !== expected;
        if (value && value !== expected && !anotherPhoto) diagnostics.push({ code: "alt_requires_review", location: position2(node) });
        return part2(Boolean(node) && value === expected, 2, node);
      }));
      return;
    }
    if (rubricId === "sample1-5_1") {
      const local = expectedFor2("relative-page-links").hrefs;
      const external = expectedFor2("external-links").hrefs;
      const newTab = expectedFor2("external-new-tab");
      const anchors = bodyNodes("a");
      const findHref = (expected) => {
        const matches2 = anchors.filter((node) => attr3(node, "href").replace(/\/$/, "") === expected.replace(/\/$/, "") && Boolean(textOf2(node)));
        if (matches2.length > 1) diagnostics.push({ code: "duplicate_answer", location: position2(matches2[0]) });
        return matches2.length === 1 ? matches2[0] : null;
      };
      const localNodes = local.map((expected) => {
        const matches2 = anchors.filter((node) => isRelative(attr3(node, "href")) && samePath(attr3(node, "href"), expected) && Boolean(textOf2(node)));
        if (matches2.length > 1) diagnostics.push({ code: "duplicate_answer", location: position2(matches2[0]) });
        return matches2.length === 1 ? matches2[0] : null;
      });
      const externalNodes = external.map(findHref);
      rule("relative-page-links", 60, localNodes.map((node) => part2(Boolean(node), 15, node)));
      rule("external-links", 30, externalNodes.map((node) => part2(Boolean(node), 10, node)));
      rule("external-new-tab", 10, newTab.hrefs.map((expected) => {
        const node = findHref(expected);
        return part2(Boolean(node) && attr3(node, "target").toLowerCase() === newTab.target, 10 / 3, node);
      }));
      return;
    }
    if (rubricId === "sample1-5_2") {
      const fragmentTopics = expectedFor2("matching-fragment-links").topics;
      const headingNames = expectedFor2("topic-headings").headings;
      const imageExpected = expectedFor2("topic-images").images;
      const headings = headingNames.map((name50) => oneText("h2", name50));
      const contents = oneText("h2", expectedFor2("contents-heading").heading);
      const idNodes = ctx.active.filter((node) => hasAttr3(node, "id"));
      const fragmentParts = fragmentTopics.map((name50, index) => {
        const heading = headings[index];
        const id = attr3(heading, "id");
        const matches2 = bodyNodes("a").filter((node) => attr3(node, "href") === `#${id}` && Boolean(id) && Boolean(textOf2(node)) && containsText(node, name50));
        const uniqueId = id && idNodes.filter((node) => attr3(node, "id") === id).length === 1;
        if (id && !uniqueId) diagnostics.push({ code: "duplicate_id", location: position2(heading) });
        const link = matches2[0];
        const beforeTopics = headings[0] && link && order(contents) < order(link) && order(link) < order(headings[0]);
        const previousLink = index ? bodyNodes("a").find((node) => attr3(node, "href") === `#${attr3(headings[index - 1], "id")}`) : null;
        return part2(Boolean(heading) && uniqueId && matches2.length === 1 && beforeTopics && (!previousLink || order(previousLink) < order(link)), 15, link || heading);
      });
      const imageParts = imageExpected.map(({ src, width }, index) => {
        const heading = headings[index];
        const next = headings[index + 1];
        const candidates = heading ? bodyNodes("img").filter((node2) => order(node2) > order(heading) && (!next || order(node2) < order(next))) : [];
        const image = candidates.filter((node2) => samePath(attr3(node2, "src"), src));
        if (image.length > 1) diagnostics.push({ code: "duplicate_answer", location: position2(image[0]) });
        const node = image.length === 1 ? image[0] : null;
        return [part2(Boolean(node), 6, node), part2(Boolean(node) && integerEquals(attr3(node, "width"), width), 2, node), part2(Boolean(node) && Boolean(attr3(node, "alt").trim()), 2, node)];
      }).flat();
      rule("contents-heading", 10, [part2(Boolean(contents), 10, contents)]);
      rule("matching-fragment-links", 45, fragmentParts);
      rule("topic-headings", 15, headings.map((node) => part2(Boolean(node), 5, node)));
      rule("topic-images", 30, imageParts);
      const topicParagraphs = headings.map((heading, index) => heading ? bodyNodes("p").filter((node) => order(node) > order(heading) && (!headings[index + 1] || order(node) < order(headings[index + 1]))) : []);
      if (headings.every(Boolean) && topicParagraphs.some((paragraphs, index) => paragraphs.length < expectedFor2("matching-fragment-links").minParagraphs || paragraphs.reduce((sum, paragraph) => sum + textOf2(paragraph).length, 0) < expectedFor2("matching-fragment-links").minimumText[index])) {
        diagnostics.push({ code: "topic_text_requires_review", location: position2(headings[0]) });
      }
      return;
    }
    if (rubricId === "sample1-6") {
      const ingredientExpected = expectedFor2("ingredients-list").items;
      const procedureExpected = expectedFor2("procedure-list").items;
      const labels = expectedFor2("nested-topics").items;
      const secondExpected = expectedFor2("nested-second-level").items;
      const thirdExpected = expectedFor2("nested-third-level").items;
      const listItems = (list2, expected) => direct(list2, "li").filter((node) => textOf2(node) === norm(expected));
      const bestList = (tag, expected) => {
        const candidates = bodyNodes(tag).map((list2) => ({ list: list2, matches: expected.map((text) => listItems(list2, text)) }));
        const score = (candidate) => candidate.matches.filter((matches2) => matches2.length === 1).length;
        const maximum = Math.max(0, ...candidates.map(score));
        const best = candidates.filter((candidate) => score(candidate) === maximum && maximum > 0);
        if (best.length > 1) diagnostics.push({ code: "duplicate_answer", location: position2(best[0].list) });
        return best.length === 1 ? best[0] : { list: null, matches: expected.map(() => []) };
      };
      const ingredientCandidate = bestList("ul", ingredientExpected);
      const procedureCandidate = bestList("ol", procedureExpected);
      const ingredient = ingredientCandidate.list;
      const steps = procedureCandidate.list;
      const oneToOne = (items, expected) => {
        const used = /* @__PURE__ */ new Set();
        return expected.map((value) => {
          const candidates = items.filter((item) => containsText(item, value));
          if (candidates.length !== 1 || used.has(candidates[0])) return null;
          used.add(candidates[0]);
          return candidates[0];
        });
      };
      const topicCandidates = bodyNodes("ul").filter((list2) => direct(list2, "li").length === 3).map((list2) => ({ list: list2, assignments: oneToOne(direct(list2, "li"), labels) }));
      const topicScore = (candidate) => candidate.assignments.filter(Boolean).length;
      const bestTopicScore = Math.max(0, ...topicCandidates.map(topicScore));
      const bestTopics = topicCandidates.filter((candidate) => topicScore(candidate) === bestTopicScore && bestTopicScore > 0);
      if (bestTopics.length > 1) diagnostics.push({ code: "duplicate_answer", location: position2(bestTopics[0].list) });
      const topicList = bestTopics.length === 1 ? bestTopics[0].list : null;
      const top = bestTopics.length === 1 ? bestTopics[0].assignments : [];
      const secondParts = [], thirdParts = [];
      top.forEach((li, i) => {
        const childLists = li ? direct(li, "ul") : [];
        const child = childLists.length === 1 ? childLists[0] : null;
        const second = child ? oneToOne(direct(child, "li"), secondExpected[i]) : secondExpected[i].map(() => null);
        secondExpected[i].forEach((expected, secondIndex) => {
          secondParts.push(part2(Boolean(second[secondIndex]), 25 / 8, second[secondIndex]));
        });
        const thirdParents = i === 0 ? [second[2]] : i === 2 ? [second[0], second[1]] : [];
        const expectedGroups = i === 0 ? [thirdExpected[0]] : i === 2 ? [thirdExpected[1], thirdExpected[2]] : [];
        expectedGroups.forEach((expecteds, group) => {
          const nested = thirdParents[group] && direct(thirdParents[group], "ul")[0];
          const third = nested ? oneToOne(direct(nested, "li"), expecteds) : expecteds.map(() => null);
          expecteds.forEach((expected, thirdIndex) => {
            thirdParts.push(part2(Boolean(third[thirdIndex]), 20 / 8, third[thirdIndex]));
          });
        });
      });
      rule("ingredients-list", 20, ingredientExpected.map((expected, index) => part2(Boolean(ingredient) && ingredientCandidate.matches[index].length === 1, 20 / 7, ingredientCandidate.matches[index][0])));
      rule("procedure-list", 20, procedureExpected.map((expected, index) => part2(Boolean(steps) && procedureCandidate.matches[index].length === 1 && textOf2(direct(steps, "li")[index]) === norm(expected), 20 / 9, procedureCandidate.matches[index][0])));
      rule("nested-topics", 15, labels.map((label, i) => part2(Boolean(top[i]), 5, top[i])));
      rule("nested-second-level", 25, secondParts);
      rule("nested-third-level", 20, thirdParts);
      return;
    }
    const tableRows = (table) => bodyNodes("tr").filter((row) => nearest(row, "table") === table);
    const rowGroup = (row, table) => {
      for (let node = row == null ? void 0 : row.parentNode; node && node !== table; node = node.parentNode) {
        if (node.tagName === "thead" || node.tagName === "tbody" || node.tagName === "tfoot") return node;
      }
      return null;
    };
    const cells = (row) => direct(row, "th").concat(direct(row, "td")).sort((a, b) => {
      var _a2, _b2, _c, _d;
      return (((_b2 = (_a2 = a.sourceCodeLocation) == null ? void 0 : _a2.startTag) == null ? void 0 : _b2.startOffset) || 0) - (((_d = (_c = b.sourceCodeLocation) == null ? void 0 : _c.startTag) == null ? void 0 : _d.startOffset) || 0);
    });
    const reportedSpanCells = /* @__PURE__ */ new Set();
    const span = (cell, name50) => {
      var _a2, _b2;
      if (!hasAttr3(cell, name50)) return 1;
      const value = attr3(cell, name50).trim();
      const number2 = Number(value);
      if (!positiveInteger(value) || !Number.isSafeInteger(number2) || number2 > MAX_TABLE_SPAN) {
        const key = `${name50}:${((_a2 = position2(cell)) == null ? void 0 : _a2.line) || 0}:${((_b2 = position2(cell)) == null ? void 0 : _b2.column) || 0}`;
        if (!reportedSpanCells.has(key)) {
          reportedSpanCells.add(key);
          diagnostics.push({ code: "table_span_requires_review", location: position2(cell) });
        }
        return null;
      }
      return number2;
    };
    const logicalRows = (table) => {
      var _a2;
      const grid = [], open = [];
      const rows = tableRows(table);
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const result = [];
        let col = 0;
        for (const [index, entry] of Object.entries(open)) {
          const column = Number(index);
          result[column] = entry.node;
          if (--entry.remaining === 0) delete open[column];
        }
        for (const cell of cells(row)) {
          while (result[col]) col++;
          const width2 = span(cell, "colspan"), height = span(cell, "rowspan");
          if (width2 === null || height === null) return null;
          if (height > 1 && Array.from({ length: height - 1 }, (_, offset) => rows[rowIndex + offset + 1]).some((target) => !target || rowGroup(target, table) !== rowGroup(row, table))) {
            diagnostics.push({ code: "table_row_group_requires_review", location: position2(cell) });
            return null;
          }
          for (let x = 0; x < width2; x++) {
            if (result[col + x]) return null;
            result[col + x] = cell;
            if (height > 1) open[col + x] = { node: cell, remaining: height - 1 };
          }
          col += width2;
        }
        grid.push(result);
      }
      if (Object.keys(open).length) return null;
      const width = ((_a2 = grid[0]) == null ? void 0 : _a2.length) || 0;
      return width && grid.length && grid.every((row) => row.length === width && row.every(Boolean)) ? grid : null;
    };
    const tables = bodyNodes("table").filter((table) => !nearest(table, "table"));
    const normalExpected = expectedFor2("ordinary-table").cells;
    const normalCandidates = tables.map((table) => {
      const rows = tableRows(table);
      const structural = rows.length === 3 && rows.every((row) => cells(row).length === 3 && cells(row).every((cell) => !hasAttr3(cell, "colspan") && !hasAttr3(cell, "rowspan")));
      const matchedPositions = structural ? normalExpected.flat().filter((value, index) => textOf2(cells(rows[Math.floor(index / 3)])[index % 3]) === norm(value)).length : 0;
      return { table, matchedPositions };
    }).filter((candidate) => candidate.matchedPositions > 0);
    const normalBest = Math.max(0, ...normalCandidates.map((candidate) => candidate.matchedPositions));
    const normalMatches = normalCandidates.filter((candidate) => candidate.matchedPositions === normalBest && normalBest > 0).map((candidate) => candidate.table);
    if (normalMatches.length > 1) diagnostics.push({ code: "table_assignment_requires_review", location: position2(normalMatches[0]) });
    const horizontalMatches = tables.filter((table) => {
      const rows = tableRows(table);
      return rows.length === 3 && attr3(cells(rows[0])[0], "colspan") === "2" && attr3(cells(rows[2])[0], "colspan") === "3";
    });
    const verticalMatches = tables.filter((table) => {
      const rows = tableRows(table);
      return rows.length === 3 && cells(rows[1]).some((cell) => attr3(cell, "rowspan") === "2");
    });
    [normalMatches, horizontalMatches, verticalMatches].forEach((matches2) => {
      if (matches2.length > 1) diagnostics.push({ code: "duplicate_answer", location: position2(matches2[0]) });
    });
    const normal = normalMatches.length === 1 ? normalMatches[0] : null;
    const horizontal = horizontalMatches.length === 1 ? horizontalMatches[0] : null;
    const vertical = verticalMatches.length === 1 ? verticalMatches[0] : null;
    const original = tables.find((table) => table !== normal && table !== horizontal && table !== vertical && tableRows(table).length >= 3 && Boolean(logicalRows(table)));
    const normalRows = normal && tableRows(normal);
    const originalGrid = original && logicalRows(original);
    const normalDataParts = normal ? normalExpected.slice(1).flatMap((values, rowOffset) => values.map((value, column) => {
      const cell = cells(normalRows[rowOffset + 1])[column];
      return part2(Boolean(cell) && textOf2(cell) === norm(value), 10 / 6, cell);
    })) : normalExpected.slice(1).flat().map(() => part2(false, 10 / 6));
    rule("ordinary-table", 20, [part2(Boolean(normal && logicalRows(normal)), 5, normal), part2(Boolean(normalRows) && cells(normalRows[0]).length === 3 && cells(normalRows[0]).every((cell) => cell.tagName === "th"), 5, normalRows == null ? void 0 : normalRows[0]), ...normalDataParts]);
    rule("horizontal-spans", 25, [part2(Boolean(horizontal) && attr3(cells(tableRows(horizontal)[0])[0], "colspan") === "2", 10, horizontal), part2(Boolean(horizontal) && attr3(cells(tableRows(horizontal)[2])[0], "colspan") === "3", 10, horizontal), part2(Boolean(horizontal) && ((_a = logicalRows(horizontal)) == null ? void 0 : _a.every((row) => row.length === 3)), 5, horizontal)]);
    rule("vertical-span", 25, [part2(Boolean(vertical) && attr3(cells(tableRows(vertical)[1])[0], "rowspan") === "2", 15, vertical), part2(Boolean(vertical) && ((_b = logicalRows(vertical)) == null ? void 0 : _b.length) === 3 && logicalRows(vertical).every((row) => row.length === 3), 10, vertical)]);
    const originalFilled = original ? tableRows(original).flatMap(cells).filter((cell) => Boolean(textOf2(cell))).length : 0;
    rule("original-table", 30, [part2(Boolean(originalGrid) && originalGrid.length >= 3, 10, original), part2(Boolean(originalGrid) && originalGrid.every((row) => row.length >= 3), 10, original), part2(originalFilled >= 6, 10, original)]);
  }

  // ../../engine-v2/node_modules/css-tree/lib/tokenizer/types.js
  var EOF = 0;
  var Ident = 1;
  var Function = 2;
  var AtKeyword = 3;
  var Hash = 4;
  var String2 = 5;
  var BadString = 6;
  var Url = 7;
  var BadUrl = 8;
  var Delim = 9;
  var Number2 = 10;
  var Percentage = 11;
  var Dimension = 12;
  var WhiteSpace = 13;
  var CDO = 14;
  var CDC = 15;
  var Colon = 16;
  var Semicolon = 17;
  var Comma = 18;
  var LeftSquareBracket = 19;
  var RightSquareBracket = 20;
  var LeftParenthesis = 21;
  var RightParenthesis = 22;
  var LeftCurlyBracket = 23;
  var RightCurlyBracket = 24;
  var Comment = 25;

  // ../../engine-v2/node_modules/css-tree/lib/tokenizer/char-code-definitions.js
  var EOF2 = 0;
  function isDigit(code2) {
    return code2 >= 48 && code2 <= 57;
  }
  function isHexDigit(code2) {
    return isDigit(code2) || // 0 .. 9
    code2 >= 65 && code2 <= 70 || // A .. F
    code2 >= 97 && code2 <= 102;
  }
  function isUppercaseLetter(code2) {
    return code2 >= 65 && code2 <= 90;
  }
  function isLowercaseLetter(code2) {
    return code2 >= 97 && code2 <= 122;
  }
  function isLetter(code2) {
    return isUppercaseLetter(code2) || isLowercaseLetter(code2);
  }
  function isNonAscii(code2) {
    return code2 >= 128;
  }
  function isNameStart(code2) {
    return isLetter(code2) || isNonAscii(code2) || code2 === 95;
  }
  function isName(code2) {
    return isNameStart(code2) || isDigit(code2) || code2 === 45;
  }
  function isNonPrintable(code2) {
    return code2 >= 0 && code2 <= 8 || code2 === 11 || code2 >= 14 && code2 <= 31 || code2 === 127;
  }
  function isNewline(code2) {
    return code2 === 10 || code2 === 13 || code2 === 12;
  }
  function isWhiteSpace(code2) {
    return isNewline(code2) || code2 === 32 || code2 === 9;
  }
  function isValidEscape(first, second) {
    if (first !== 92) {
      return false;
    }
    if (isNewline(second) || second === EOF2) {
      return false;
    }
    return true;
  }
  function isIdentifierStart(first, second, third) {
    if (first === 45) {
      return isNameStart(second) || second === 45 || isValidEscape(second, third);
    }
    if (isNameStart(first)) {
      return true;
    }
    if (first === 92) {
      return isValidEscape(first, second);
    }
    return false;
  }
  function isNumberStart(first, second, third) {
    if (first === 43 || first === 45) {
      if (isDigit(second)) {
        return 2;
      }
      return second === 46 && isDigit(third) ? 3 : 0;
    }
    if (first === 46) {
      return isDigit(second) ? 2 : 0;
    }
    if (isDigit(first)) {
      return 1;
    }
    return 0;
  }
  function isBOM(code2) {
    if (code2 === 65279) {
      return 1;
    }
    if (code2 === 65534) {
      return 1;
    }
    return 0;
  }
  var CATEGORY = new Array(128);
  var EofCategory = 128;
  var WhiteSpaceCategory = 130;
  var DigitCategory = 131;
  var NameStartCategory = 132;
  var NonPrintableCategory = 133;
  for (let i = 0; i < CATEGORY.length; i++) {
    CATEGORY[i] = isWhiteSpace(i) && WhiteSpaceCategory || isDigit(i) && DigitCategory || isNameStart(i) && NameStartCategory || isNonPrintable(i) && NonPrintableCategory || i || EofCategory;
  }
  function charCodeCategory(code2) {
    return code2 < 128 ? CATEGORY[code2] : NameStartCategory;
  }

  // ../../engine-v2/node_modules/css-tree/lib/tokenizer/utils.js
  function getCharCode(source, offset) {
    return offset < source.length ? source.charCodeAt(offset) : 0;
  }
  function getNewlineLength(source, offset, code2) {
    if (code2 === 13 && getCharCode(source, offset + 1) === 10) {
      return 2;
    }
    return 1;
  }
  function cmpChar(testStr, offset, referenceCode) {
    let code2 = testStr.charCodeAt(offset);
    if (isUppercaseLetter(code2)) {
      code2 = code2 | 32;
    }
    return code2 === referenceCode;
  }
  function cmpStr(testStr, start, end, referenceStr) {
    if (end - start !== referenceStr.length) {
      return false;
    }
    if (start < 0 || end > testStr.length) {
      return false;
    }
    for (let i = start; i < end; i++) {
      const referenceCode = referenceStr.charCodeAt(i - start);
      let testCode = testStr.charCodeAt(i);
      if (isUppercaseLetter(testCode)) {
        testCode = testCode | 32;
      }
      if (testCode !== referenceCode) {
        return false;
      }
    }
    return true;
  }
  function findWhiteSpaceStart(source, offset) {
    for (; offset >= 0; offset--) {
      if (!isWhiteSpace(source.charCodeAt(offset))) {
        break;
      }
    }
    return offset + 1;
  }
  function findWhiteSpaceEnd(source, offset) {
    for (; offset < source.length; offset++) {
      if (!isWhiteSpace(source.charCodeAt(offset))) {
        break;
      }
    }
    return offset;
  }
  function findDecimalNumberEnd(source, offset) {
    for (; offset < source.length; offset++) {
      if (!isDigit(source.charCodeAt(offset))) {
        break;
      }
    }
    return offset;
  }
  function consumeEscaped(source, offset) {
    offset += 2;
    if (isHexDigit(getCharCode(source, offset - 1))) {
      for (const maxOffset = Math.min(source.length, offset + 5); offset < maxOffset; offset++) {
        if (!isHexDigit(getCharCode(source, offset))) {
          break;
        }
      }
      const code2 = getCharCode(source, offset);
      if (isWhiteSpace(code2)) {
        offset += getNewlineLength(source, offset, code2);
      }
    }
    return offset;
  }
  function consumeName(source, offset) {
    for (; offset < source.length; offset++) {
      const code2 = source.charCodeAt(offset);
      if (isName(code2)) {
        continue;
      }
      if (isValidEscape(code2, getCharCode(source, offset + 1))) {
        offset = consumeEscaped(source, offset) - 1;
        continue;
      }
      break;
    }
    return offset;
  }
  function consumeNumber(source, offset) {
    let code2 = source.charCodeAt(offset);
    if (code2 === 43 || code2 === 45) {
      code2 = source.charCodeAt(offset += 1);
    }
    if (isDigit(code2)) {
      offset = findDecimalNumberEnd(source, offset + 1);
      code2 = source.charCodeAt(offset);
    }
    if (code2 === 46 && isDigit(source.charCodeAt(offset + 1))) {
      offset += 2;
      offset = findDecimalNumberEnd(source, offset);
    }
    if (cmpChar(
      source,
      offset,
      101
      /* e */
    )) {
      let sign = 0;
      code2 = source.charCodeAt(offset + 1);
      if (code2 === 45 || code2 === 43) {
        sign = 1;
        code2 = source.charCodeAt(offset + 2);
      }
      if (isDigit(code2)) {
        offset = findDecimalNumberEnd(source, offset + 1 + sign + 1);
      }
    }
    return offset;
  }
  function consumeBadUrlRemnants(source, offset) {
    for (; offset < source.length; offset++) {
      const code2 = source.charCodeAt(offset);
      if (code2 === 41) {
        offset++;
        break;
      }
      if (isValidEscape(code2, getCharCode(source, offset + 1))) {
        offset = consumeEscaped(source, offset);
      }
    }
    return offset;
  }
  function decodeEscaped(escaped) {
    if (escaped.length === 1 && !isHexDigit(escaped.charCodeAt(0))) {
      return escaped[0];
    }
    let code2 = parseInt(escaped, 16);
    if (code2 === 0 || // If this number is zero,
    code2 >= 55296 && code2 <= 57343 || // or is for a surrogate,
    code2 > 1114111) {
      code2 = 65533;
    }
    return String.fromCodePoint(code2);
  }

  // ../../engine-v2/node_modules/css-tree/lib/tokenizer/names.js
  var names_default = [
    "EOF-token",
    "ident-token",
    "function-token",
    "at-keyword-token",
    "hash-token",
    "string-token",
    "bad-string-token",
    "url-token",
    "bad-url-token",
    "delim-token",
    "number-token",
    "percentage-token",
    "dimension-token",
    "whitespace-token",
    "CDO-token",
    "CDC-token",
    "colon-token",
    "semicolon-token",
    "comma-token",
    "[-token",
    "]-token",
    "(-token",
    ")-token",
    "{-token",
    "}-token",
    "comment-token"
  ];

  // ../../engine-v2/node_modules/css-tree/lib/tokenizer/adopt-buffer.js
  var MIN_SIZE = 16 * 1024;
  function adoptBuffer(buffer = null, size) {
    if (buffer === null || buffer.length < size) {
      return new Uint32Array(Math.max(size + 1024, MIN_SIZE));
    }
    return buffer;
  }

  // ../../engine-v2/node_modules/css-tree/lib/tokenizer/OffsetToLocation.js
  var N = 10;
  var F = 12;
  var R = 13;
  function computeLinesAndColumns(host) {
    const source = host.source;
    const sourceLength = source.length;
    const startOffset = source.length > 0 ? isBOM(source.charCodeAt(0)) : 0;
    const lines = adoptBuffer(host.lines, sourceLength);
    const columns = adoptBuffer(host.columns, sourceLength);
    let line = host.startLine;
    let column = host.startColumn;
    for (let i = startOffset; i < sourceLength; i++) {
      const code2 = source.charCodeAt(i);
      lines[i] = line;
      columns[i] = column++;
      if (code2 === N || code2 === R || code2 === F) {
        if (code2 === R && i + 1 < sourceLength && source.charCodeAt(i + 1) === N) {
          i++;
          lines[i] = line;
          columns[i] = column;
        }
        line++;
        column = 1;
      }
    }
    lines[sourceLength] = line;
    columns[sourceLength] = column;
    host.lines = lines;
    host.columns = columns;
    host.computed = true;
  }
  var OffsetToLocation = class {
    constructor(source, startOffset, startLine, startColumn) {
      this.setSource(source, startOffset, startLine, startColumn);
      this.lines = null;
      this.columns = null;
    }
    setSource(source = "", startOffset = 0, startLine = 1, startColumn = 1) {
      this.source = source;
      this.startOffset = startOffset;
      this.startLine = startLine;
      this.startColumn = startColumn;
      this.computed = false;
    }
    getLocation(offset, filename) {
      if (!this.computed) {
        computeLinesAndColumns(this);
      }
      return {
        source: filename,
        offset: this.startOffset + offset,
        line: this.lines[offset],
        column: this.columns[offset]
      };
    }
    getLocationRange(start, end, filename) {
      if (!this.computed) {
        computeLinesAndColumns(this);
      }
      return {
        source: filename,
        start: {
          offset: this.startOffset + start,
          line: this.lines[start],
          column: this.columns[start]
        },
        end: {
          offset: this.startOffset + end,
          line: this.lines[end],
          column: this.columns[end]
        }
      };
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/tokenizer/TokenStream.js
  var OFFSET_MASK = 16777215;
  var TYPE_SHIFT = 24;
  var BLOCK_OPEN_TOKEN = 1;
  var BLOCK_CLOSE_TOKEN = 2;
  var balancePair = new Uint8Array(32);
  balancePair[Function] = RightParenthesis;
  balancePair[LeftParenthesis] = RightParenthesis;
  balancePair[LeftSquareBracket] = RightSquareBracket;
  balancePair[LeftCurlyBracket] = RightCurlyBracket;
  var blockTokens = new Uint8Array(32);
  blockTokens[Function] = BLOCK_OPEN_TOKEN;
  blockTokens[LeftParenthesis] = BLOCK_OPEN_TOKEN;
  blockTokens[LeftSquareBracket] = BLOCK_OPEN_TOKEN;
  blockTokens[LeftCurlyBracket] = BLOCK_OPEN_TOKEN;
  blockTokens[RightParenthesis] = BLOCK_CLOSE_TOKEN;
  blockTokens[RightSquareBracket] = BLOCK_CLOSE_TOKEN;
  blockTokens[RightCurlyBracket] = BLOCK_CLOSE_TOKEN;
  function boundIndex(index, min, max) {
    return index < min ? min : index > max ? max : index;
  }
  var TokenStream = class {
    constructor(source, tokenize3) {
      this.setSource(source, tokenize3);
    }
    reset() {
      this.eof = false;
      this.tokenIndex = -1;
      this.tokenType = 0;
      this.tokenStart = this.firstCharOffset;
      this.tokenEnd = this.firstCharOffset;
    }
    setSource(source = "", tokenize3 = () => {
    }) {
      source = String(source || "");
      const sourceLength = source.length;
      const offsetAndType = adoptBuffer(this.offsetAndType, source.length + 1);
      const balance = adoptBuffer(this.balance, source.length + 1);
      let tokenCount = 0;
      let firstCharOffset = -1;
      let balanceCloseType = 0;
      let balanceStart = source.length;
      this.offsetAndType = null;
      this.balance = null;
      balance.fill(0);
      tokenize3(source, (type, start, end) => {
        const index = tokenCount++;
        offsetAndType[index] = type << TYPE_SHIFT | end;
        if (firstCharOffset === -1) {
          firstCharOffset = start;
        }
        balance[index] = balanceStart;
        if (type === balanceCloseType) {
          const prevBalanceStart = balance[balanceStart];
          balance[balanceStart] = index;
          balanceStart = prevBalanceStart;
          balanceCloseType = balancePair[offsetAndType[prevBalanceStart] >> TYPE_SHIFT];
        } else if (this.isBlockOpenerTokenType(type)) {
          balanceStart = index;
          balanceCloseType = balancePair[type];
        }
      });
      offsetAndType[tokenCount] = EOF << TYPE_SHIFT | sourceLength;
      balance[tokenCount] = tokenCount;
      for (let i = 0; i < tokenCount; i++) {
        const balanceStart2 = balance[i];
        if (balanceStart2 <= i) {
          const balanceEnd = balance[balanceStart2];
          if (balanceEnd !== i) {
            balance[i] = balanceEnd;
          }
        } else if (balanceStart2 > tokenCount) {
          balance[i] = tokenCount;
        }
      }
      this.source = source;
      this.firstCharOffset = firstCharOffset === -1 ? 0 : firstCharOffset;
      this.tokenCount = tokenCount;
      this.offsetAndType = offsetAndType;
      this.balance = balance;
      this.reset();
      this.next();
    }
    lookupType(offset) {
      offset += this.tokenIndex;
      if (offset < this.tokenCount) {
        return this.offsetAndType[offset] >> TYPE_SHIFT;
      }
      return EOF;
    }
    lookupTypeNonSC(idx) {
      for (let offset = this.tokenIndex; offset < this.tokenCount; offset++) {
        const tokenType2 = this.offsetAndType[offset] >> TYPE_SHIFT;
        if (tokenType2 !== WhiteSpace && tokenType2 !== Comment) {
          if (idx-- === 0) {
            return tokenType2;
          }
        }
      }
      return EOF;
    }
    lookupOffset(offset) {
      offset += this.tokenIndex;
      if (offset < this.tokenCount) {
        return this.offsetAndType[offset - 1] & OFFSET_MASK;
      }
      return this.source.length;
    }
    lookupOffsetNonSC(idx) {
      for (let offset = this.tokenIndex; offset < this.tokenCount; offset++) {
        const tokenType2 = this.offsetAndType[offset] >> TYPE_SHIFT;
        if (tokenType2 !== WhiteSpace && tokenType2 !== Comment) {
          if (idx-- === 0) {
            return offset - this.tokenIndex;
          }
        }
      }
      return EOF;
    }
    lookupValue(offset, referenceStr) {
      offset += this.tokenIndex;
      if (offset < this.tokenCount) {
        return cmpStr(
          this.source,
          this.offsetAndType[offset - 1] & OFFSET_MASK,
          this.offsetAndType[offset] & OFFSET_MASK,
          referenceStr
        );
      }
      return false;
    }
    getTokenStart(tokenIndex) {
      if (tokenIndex === this.tokenIndex) {
        return this.tokenStart;
      }
      if (tokenIndex > 0) {
        return tokenIndex < this.tokenCount ? this.offsetAndType[tokenIndex - 1] & OFFSET_MASK : this.offsetAndType[this.tokenCount] & OFFSET_MASK;
      }
      return this.firstCharOffset;
    }
    getTokenEnd(tokenIndex) {
      if (tokenIndex === this.tokenIndex) {
        return this.tokenEnd;
      }
      return this.offsetAndType[boundIndex(tokenIndex, 0, this.tokenCount)] & OFFSET_MASK;
    }
    getTokenType(tokenIndex) {
      if (tokenIndex === this.tokenIndex) {
        return this.tokenType;
      }
      return this.offsetAndType[boundIndex(tokenIndex, 0, this.tokenCount)] >> TYPE_SHIFT;
    }
    substrToCursor(start) {
      return this.source.substring(start, this.tokenStart);
    }
    isBlockOpenerTokenType(tokenType2) {
      return blockTokens[tokenType2] === BLOCK_OPEN_TOKEN;
    }
    isBlockCloserTokenType(tokenType2) {
      return blockTokens[tokenType2] === BLOCK_CLOSE_TOKEN;
    }
    getBlockTokenPairIndex(tokenIndex) {
      const type = this.getTokenType(tokenIndex);
      if (blockTokens[type] === 1) {
        const pairIndex = this.balance[tokenIndex];
        const closeType = this.getTokenType(pairIndex);
        return balancePair[type] === closeType ? pairIndex : -1;
      } else if (blockTokens[type] === 2) {
        const pairIndex = this.balance[tokenIndex];
        const openType = this.getTokenType(pairIndex);
        return balancePair[openType] === type ? pairIndex : -1;
      }
      return -1;
    }
    isBalanceEdge(tokenIndex) {
      return this.balance[this.tokenIndex] < tokenIndex;
    }
    isDelim(code2, offset) {
      if (offset) {
        return this.lookupType(offset) === Delim && this.source.charCodeAt(this.lookupOffset(offset)) === code2;
      }
      return this.tokenType === Delim && this.source.charCodeAt(this.tokenStart) === code2;
    }
    skip(tokenCount) {
      let next = this.tokenIndex + tokenCount;
      if (next < this.tokenCount) {
        this.tokenIndex = next;
        this.tokenStart = this.offsetAndType[next - 1] & OFFSET_MASK;
        next = this.offsetAndType[next];
        this.tokenType = next >> TYPE_SHIFT;
        this.tokenEnd = next & OFFSET_MASK;
      } else {
        this.tokenIndex = this.tokenCount;
        this.next();
      }
    }
    next() {
      let next = this.tokenIndex + 1;
      if (next < this.tokenCount) {
        this.tokenIndex = next;
        this.tokenStart = this.tokenEnd;
        next = this.offsetAndType[next];
        this.tokenType = next >> TYPE_SHIFT;
        this.tokenEnd = next & OFFSET_MASK;
      } else {
        this.eof = true;
        this.tokenIndex = this.tokenCount;
        this.tokenType = EOF;
        this.tokenStart = this.tokenEnd = this.source.length;
      }
    }
    skipSC() {
      while (this.tokenType === WhiteSpace || this.tokenType === Comment) {
        this.next();
      }
    }
    skipUntilBalanced(startToken, stopConsume) {
      let cursor = startToken;
      let balanceEnd = 0;
      let offset = 0;
      loop:
        for (; cursor < this.tokenCount; cursor++) {
          balanceEnd = this.balance[cursor];
          if (balanceEnd < startToken) {
            break loop;
          }
          offset = cursor > 0 ? this.offsetAndType[cursor - 1] & OFFSET_MASK : this.firstCharOffset;
          switch (stopConsume(this.source.charCodeAt(offset))) {
            case 1:
              break loop;
            case 2:
              cursor++;
              break loop;
            default:
              if (this.isBlockOpenerTokenType(this.offsetAndType[cursor] >> TYPE_SHIFT)) {
                cursor = balanceEnd;
              }
          }
        }
      this.skip(cursor - this.tokenIndex);
    }
    forEachToken(fn) {
      for (let i = 0, offset = this.firstCharOffset; i < this.tokenCount; i++) {
        const start = offset;
        const item = this.offsetAndType[i];
        const end = item & OFFSET_MASK;
        const type = item >> TYPE_SHIFT;
        offset = end;
        fn(type, start, end, i);
      }
    }
    dump() {
      const tokens = new Array(this.tokenCount);
      this.forEachToken((type, start, end, index) => {
        tokens[index] = {
          idx: index,
          type: names_default[type],
          chunk: this.source.substring(start, end),
          balance: this.balance[index]
        };
      });
      return tokens;
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/tokenizer/index.js
  function tokenize(source, onToken) {
    function getCharCode2(offset2) {
      return offset2 < sourceLength ? source.charCodeAt(offset2) : 0;
    }
    function consumeNumericToken() {
      offset = consumeNumber(source, offset);
      if (isIdentifierStart(getCharCode2(offset), getCharCode2(offset + 1), getCharCode2(offset + 2))) {
        type = Dimension;
        offset = consumeName(source, offset);
        return;
      }
      if (getCharCode2(offset) === 37) {
        type = Percentage;
        offset++;
        return;
      }
      type = Number2;
    }
    function consumeIdentLikeToken() {
      const nameStartOffset = offset;
      offset = consumeName(source, offset);
      if (cmpStr(source, nameStartOffset, offset, "url") && getCharCode2(offset) === 40) {
        offset = findWhiteSpaceEnd(source, offset + 1);
        if (getCharCode2(offset) === 34 || getCharCode2(offset) === 39) {
          type = Function;
          offset = nameStartOffset + 4;
          return;
        }
        consumeUrlToken();
        return;
      }
      if (getCharCode2(offset) === 40) {
        type = Function;
        offset++;
        return;
      }
      type = Ident;
    }
    function consumeStringToken(endingCodePoint) {
      if (!endingCodePoint) {
        endingCodePoint = getCharCode2(offset++);
      }
      type = String2;
      for (; offset < source.length; offset++) {
        const code2 = source.charCodeAt(offset);
        switch (charCodeCategory(code2)) {
          // ending code point
          case endingCodePoint:
            offset++;
            return;
          // EOF
          // case EofCategory:
          // This is a parse error. Return the <string-token>.
          // return;
          // newline
          case WhiteSpaceCategory:
            if (isNewline(code2)) {
              offset += getNewlineLength(source, offset, code2);
              type = BadString;
              return;
            }
            break;
          // U+005C REVERSE SOLIDUS (\)
          case 92:
            if (offset === source.length - 1) {
              break;
            }
            const nextCode = getCharCode2(offset + 1);
            if (isNewline(nextCode)) {
              offset += getNewlineLength(source, offset + 1, nextCode);
            } else if (isValidEscape(code2, nextCode)) {
              offset = consumeEscaped(source, offset) - 1;
            }
            break;
        }
      }
    }
    function consumeUrlToken() {
      type = Url;
      offset = findWhiteSpaceEnd(source, offset);
      for (; offset < source.length; offset++) {
        const code2 = source.charCodeAt(offset);
        switch (charCodeCategory(code2)) {
          // U+0029 RIGHT PARENTHESIS ())
          case 41:
            offset++;
            return;
          // EOF
          // case EofCategory:
          // This is a parse error. Return the <url-token>.
          // return;
          // whitespace
          case WhiteSpaceCategory:
            offset = findWhiteSpaceEnd(source, offset);
            if (getCharCode2(offset) === 41 || offset >= source.length) {
              if (offset < source.length) {
                offset++;
              }
              return;
            }
            offset = consumeBadUrlRemnants(source, offset);
            type = BadUrl;
            return;
          // U+0022 QUOTATION MARK (")
          // U+0027 APOSTROPHE (')
          // U+0028 LEFT PARENTHESIS (()
          // non-printable code point
          case 34:
          case 39:
          case 40:
          case NonPrintableCategory:
            offset = consumeBadUrlRemnants(source, offset);
            type = BadUrl;
            return;
          // U+005C REVERSE SOLIDUS (\)
          case 92:
            if (isValidEscape(code2, getCharCode2(offset + 1))) {
              offset = consumeEscaped(source, offset) - 1;
              break;
            }
            offset = consumeBadUrlRemnants(source, offset);
            type = BadUrl;
            return;
        }
      }
    }
    source = String(source || "");
    const sourceLength = source.length;
    let start = isBOM(getCharCode2(0));
    let offset = start;
    let type;
    while (offset < sourceLength) {
      const code2 = source.charCodeAt(offset);
      switch (charCodeCategory(code2)) {
        // whitespace
        case WhiteSpaceCategory:
          type = WhiteSpace;
          offset = findWhiteSpaceEnd(source, offset + 1);
          break;
        // U+0022 QUOTATION MARK (")
        case 34:
          consumeStringToken();
          break;
        // U+0023 NUMBER SIGN (#)
        case 35:
          if (isName(getCharCode2(offset + 1)) || isValidEscape(getCharCode2(offset + 1), getCharCode2(offset + 2))) {
            type = Hash;
            offset = consumeName(source, offset + 1);
          } else {
            type = Delim;
            offset++;
          }
          break;
        // U+0027 APOSTROPHE (')
        case 39:
          consumeStringToken();
          break;
        // U+0028 LEFT PARENTHESIS (()
        case 40:
          type = LeftParenthesis;
          offset++;
          break;
        // U+0029 RIGHT PARENTHESIS ())
        case 41:
          type = RightParenthesis;
          offset++;
          break;
        // U+002B PLUS SIGN (+)
        case 43:
          if (isNumberStart(code2, getCharCode2(offset + 1), getCharCode2(offset + 2))) {
            consumeNumericToken();
          } else {
            type = Delim;
            offset++;
          }
          break;
        // U+002C COMMA (,)
        case 44:
          type = Comma;
          offset++;
          break;
        // U+002D HYPHEN-MINUS (-)
        case 45:
          if (isNumberStart(code2, getCharCode2(offset + 1), getCharCode2(offset + 2))) {
            consumeNumericToken();
          } else {
            if (getCharCode2(offset + 1) === 45 && getCharCode2(offset + 2) === 62) {
              type = CDC;
              offset = offset + 3;
            } else {
              if (isIdentifierStart(code2, getCharCode2(offset + 1), getCharCode2(offset + 2))) {
                consumeIdentLikeToken();
              } else {
                type = Delim;
                offset++;
              }
            }
          }
          break;
        // U+002E FULL STOP (.)
        case 46:
          if (isNumberStart(code2, getCharCode2(offset + 1), getCharCode2(offset + 2))) {
            consumeNumericToken();
          } else {
            type = Delim;
            offset++;
          }
          break;
        // U+002F SOLIDUS (/)
        case 47:
          if (getCharCode2(offset + 1) === 42) {
            type = Comment;
            offset = source.indexOf("*/", offset + 2);
            offset = offset === -1 ? source.length : offset + 2;
          } else {
            type = Delim;
            offset++;
          }
          break;
        // U+003A COLON (:)
        case 58:
          type = Colon;
          offset++;
          break;
        // U+003B SEMICOLON (;)
        case 59:
          type = Semicolon;
          offset++;
          break;
        // U+003C LESS-THAN SIGN (<)
        case 60:
          if (getCharCode2(offset + 1) === 33 && getCharCode2(offset + 2) === 45 && getCharCode2(offset + 3) === 45) {
            type = CDO;
            offset = offset + 4;
          } else {
            type = Delim;
            offset++;
          }
          break;
        // U+0040 COMMERCIAL AT (@)
        case 64:
          if (isIdentifierStart(getCharCode2(offset + 1), getCharCode2(offset + 2), getCharCode2(offset + 3))) {
            type = AtKeyword;
            offset = consumeName(source, offset + 1);
          } else {
            type = Delim;
            offset++;
          }
          break;
        // U+005B LEFT SQUARE BRACKET ([)
        case 91:
          type = LeftSquareBracket;
          offset++;
          break;
        // U+005C REVERSE SOLIDUS (\)
        case 92:
          if (isValidEscape(code2, getCharCode2(offset + 1))) {
            consumeIdentLikeToken();
          } else {
            type = Delim;
            offset++;
          }
          break;
        // U+005D RIGHT SQUARE BRACKET (])
        case 93:
          type = RightSquareBracket;
          offset++;
          break;
        // U+007B LEFT CURLY BRACKET ({)
        case 123:
          type = LeftCurlyBracket;
          offset++;
          break;
        // U+007D RIGHT CURLY BRACKET (})
        case 125:
          type = RightCurlyBracket;
          offset++;
          break;
        // digit
        case DigitCategory:
          consumeNumericToken();
          break;
        // name-start code point
        case NameStartCategory:
          consumeIdentLikeToken();
          break;
        // EOF
        // case EofCategory:
        // Return an <EOF-token>.
        // break;
        // anything else
        default:
          type = Delim;
          offset++;
      }
      onToken(type, start, start = offset);
    }
  }

  // ../../engine-v2/node_modules/css-tree/lib/utils/List.js
  var releasedCursors = null;
  var List = class _List {
    static createItem(data) {
      return {
        prev: null,
        next: null,
        data
      };
    }
    constructor() {
      this.head = null;
      this.tail = null;
      this.cursor = null;
    }
    createItem(data) {
      return _List.createItem(data);
    }
    // cursor helpers
    allocateCursor(prev, next) {
      let cursor;
      if (releasedCursors !== null) {
        cursor = releasedCursors;
        releasedCursors = releasedCursors.cursor;
        cursor.prev = prev;
        cursor.next = next;
        cursor.cursor = this.cursor;
      } else {
        cursor = {
          prev,
          next,
          cursor: this.cursor
        };
      }
      this.cursor = cursor;
      return cursor;
    }
    releaseCursor() {
      const { cursor } = this;
      this.cursor = cursor.cursor;
      cursor.prev = null;
      cursor.next = null;
      cursor.cursor = releasedCursors;
      releasedCursors = cursor;
    }
    updateCursors(prevOld, prevNew, nextOld, nextNew) {
      let { cursor } = this;
      while (cursor !== null) {
        if (cursor.prev === prevOld) {
          cursor.prev = prevNew;
        }
        if (cursor.next === nextOld) {
          cursor.next = nextNew;
        }
        cursor = cursor.cursor;
      }
    }
    *[Symbol.iterator]() {
      for (let cursor = this.head; cursor !== null; cursor = cursor.next) {
        yield cursor.data;
      }
    }
    // getters
    get size() {
      let size = 0;
      for (let cursor = this.head; cursor !== null; cursor = cursor.next) {
        size++;
      }
      return size;
    }
    get isEmpty() {
      return this.head === null;
    }
    get first() {
      return this.head && this.head.data;
    }
    get last() {
      return this.tail && this.tail.data;
    }
    // convertors
    fromArray(array) {
      let cursor = null;
      this.head = null;
      for (let data of array) {
        const item = _List.createItem(data);
        if (cursor !== null) {
          cursor.next = item;
        } else {
          this.head = item;
        }
        item.prev = cursor;
        cursor = item;
      }
      this.tail = cursor;
      return this;
    }
    toArray() {
      return [...this];
    }
    toJSON() {
      return [...this];
    }
    // array-like methods
    forEach(fn, thisArg = this) {
      const cursor = this.allocateCursor(null, this.head);
      while (cursor.next !== null) {
        const item = cursor.next;
        cursor.next = item.next;
        fn.call(thisArg, item.data, item, this);
      }
      this.releaseCursor();
    }
    forEachRight(fn, thisArg = this) {
      const cursor = this.allocateCursor(this.tail, null);
      while (cursor.prev !== null) {
        const item = cursor.prev;
        cursor.prev = item.prev;
        fn.call(thisArg, item.data, item, this);
      }
      this.releaseCursor();
    }
    reduce(fn, initialValue, thisArg = this) {
      let cursor = this.allocateCursor(null, this.head);
      let acc = initialValue;
      let item;
      while (cursor.next !== null) {
        item = cursor.next;
        cursor.next = item.next;
        acc = fn.call(thisArg, acc, item.data, item, this);
      }
      this.releaseCursor();
      return acc;
    }
    reduceRight(fn, initialValue, thisArg = this) {
      let cursor = this.allocateCursor(this.tail, null);
      let acc = initialValue;
      let item;
      while (cursor.prev !== null) {
        item = cursor.prev;
        cursor.prev = item.prev;
        acc = fn.call(thisArg, acc, item.data, item, this);
      }
      this.releaseCursor();
      return acc;
    }
    some(fn, thisArg = this) {
      for (let cursor = this.head; cursor !== null; cursor = cursor.next) {
        if (fn.call(thisArg, cursor.data, cursor, this)) {
          return true;
        }
      }
      return false;
    }
    map(fn, thisArg = this) {
      const result = new _List();
      for (let cursor = this.head; cursor !== null; cursor = cursor.next) {
        result.appendData(fn.call(thisArg, cursor.data, cursor, this));
      }
      return result;
    }
    filter(fn, thisArg = this) {
      const result = new _List();
      for (let cursor = this.head; cursor !== null; cursor = cursor.next) {
        if (fn.call(thisArg, cursor.data, cursor, this)) {
          result.appendData(cursor.data);
        }
      }
      return result;
    }
    nextUntil(start, fn, thisArg = this) {
      if (start === null) {
        return;
      }
      const cursor = this.allocateCursor(null, start);
      while (cursor.next !== null) {
        const item = cursor.next;
        cursor.next = item.next;
        if (fn.call(thisArg, item.data, item, this)) {
          break;
        }
      }
      this.releaseCursor();
    }
    prevUntil(start, fn, thisArg = this) {
      if (start === null) {
        return;
      }
      const cursor = this.allocateCursor(start, null);
      while (cursor.prev !== null) {
        const item = cursor.prev;
        cursor.prev = item.prev;
        if (fn.call(thisArg, item.data, item, this)) {
          break;
        }
      }
      this.releaseCursor();
    }
    // mutation
    clear() {
      this.head = null;
      this.tail = null;
    }
    copy() {
      const result = new _List();
      for (let data of this) {
        result.appendData(data);
      }
      return result;
    }
    prepend(item) {
      this.updateCursors(null, item, this.head, item);
      if (this.head !== null) {
        this.head.prev = item;
        item.next = this.head;
      } else {
        this.tail = item;
      }
      this.head = item;
      return this;
    }
    prependData(data) {
      return this.prepend(_List.createItem(data));
    }
    append(item) {
      return this.insert(item);
    }
    appendData(data) {
      return this.insert(_List.createItem(data));
    }
    insert(item, before = null) {
      if (before !== null) {
        this.updateCursors(before.prev, item, before, item);
        if (before.prev === null) {
          if (this.head !== before) {
            throw new Error("before doesn't belong to list");
          }
          this.head = item;
          before.prev = item;
          item.next = before;
          this.updateCursors(null, item);
        } else {
          before.prev.next = item;
          item.prev = before.prev;
          before.prev = item;
          item.next = before;
        }
      } else {
        this.updateCursors(this.tail, item, null, item);
        if (this.tail !== null) {
          this.tail.next = item;
          item.prev = this.tail;
        } else {
          this.head = item;
        }
        this.tail = item;
      }
      return this;
    }
    insertData(data, before) {
      return this.insert(_List.createItem(data), before);
    }
    remove(item) {
      this.updateCursors(item, item.prev, item, item.next);
      if (item.prev !== null) {
        item.prev.next = item.next;
      } else {
        if (this.head !== item) {
          throw new Error("item doesn't belong to list");
        }
        this.head = item.next;
      }
      if (item.next !== null) {
        item.next.prev = item.prev;
      } else {
        if (this.tail !== item) {
          throw new Error("item doesn't belong to list");
        }
        this.tail = item.prev;
      }
      item.prev = null;
      item.next = null;
      return item;
    }
    push(data) {
      this.insert(_List.createItem(data));
    }
    pop() {
      return this.tail !== null ? this.remove(this.tail) : null;
    }
    unshift(data) {
      this.prepend(_List.createItem(data));
    }
    shift() {
      return this.head !== null ? this.remove(this.head) : null;
    }
    prependList(list2) {
      return this.insertList(list2, this.head);
    }
    appendList(list2) {
      return this.insertList(list2);
    }
    insertList(list2, before) {
      if (list2.head === null) {
        return this;
      }
      if (before !== void 0 && before !== null) {
        this.updateCursors(before.prev, list2.tail, before, list2.head);
        if (before.prev !== null) {
          before.prev.next = list2.head;
          list2.head.prev = before.prev;
        } else {
          this.head = list2.head;
        }
        before.prev = list2.tail;
        list2.tail.next = before;
      } else {
        this.updateCursors(this.tail, list2.tail, null, list2.head);
        if (this.tail !== null) {
          this.tail.next = list2.head;
          list2.head.prev = this.tail;
        } else {
          this.head = list2.head;
        }
        this.tail = list2.tail;
      }
      list2.head = null;
      list2.tail = null;
      return this;
    }
    replace(oldItem, newItemOrList) {
      if ("head" in newItemOrList) {
        this.insertList(newItemOrList, oldItem);
      } else {
        this.insert(newItemOrList, oldItem);
      }
      this.remove(oldItem);
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/utils/create-custom-error.js
  function createCustomError(name50, message) {
    const error = Object.create(SyntaxError.prototype);
    const errorStack = new Error();
    return Object.assign(error, {
      name: name50,
      message,
      get stack() {
        return (errorStack.stack || "").replace(/^(.+\n){1,3}/, `${name50}: ${message}
`);
      }
    });
  }

  // ../../engine-v2/node_modules/css-tree/lib/parser/SyntaxError.js
  var MAX_LINE_LENGTH = 100;
  var OFFSET_CORRECTION = 60;
  var TAB_REPLACEMENT = "    ";
  function sourceFragment({ source, line, column, baseLine, baseColumn }, extraLines) {
    function processLines(start, end) {
      return lines.slice(start, end).map(
        (line2, idx) => String(start + idx + 1).padStart(maxNumLength) + " |" + line2
      ).join("\n");
    }
    const prelines = "\n".repeat(Math.max(baseLine - 1, 0));
    const precolumns = " ".repeat(Math.max(baseColumn - 1, 0));
    const lines = (prelines + precolumns + source).split(/\r\n?|\n|\f/);
    const startLine = Math.max(1, line - extraLines) - 1;
    const endLine = Math.min(line + extraLines, lines.length + 1);
    const maxNumLength = Math.max(4, String(endLine).length) + 1;
    let cutLeft = 0;
    column += (TAB_REPLACEMENT.length - 1) * (lines[line - 1].substr(0, column - 1).match(/\t/g) || []).length;
    if (column > MAX_LINE_LENGTH) {
      cutLeft = column - OFFSET_CORRECTION + 3;
      column = OFFSET_CORRECTION - 2;
    }
    for (let i = startLine; i <= endLine; i++) {
      if (i >= 0 && i < lines.length) {
        lines[i] = lines[i].replace(/\t/g, TAB_REPLACEMENT);
        lines[i] = (cutLeft > 0 && lines[i].length > cutLeft ? "…" : "") + lines[i].substr(cutLeft, MAX_LINE_LENGTH - 2) + (lines[i].length > cutLeft + MAX_LINE_LENGTH - 1 ? "…" : "");
      }
    }
    return [
      processLines(startLine, line),
      new Array(column + maxNumLength + 2).join("-") + "^",
      processLines(line, endLine)
    ].filter(Boolean).join("\n").replace(/^(\s+\d+\s+\|\n)+/, "").replace(/\n(\s+\d+\s+\|)+$/, "");
  }
  function SyntaxError2(message, source, offset, line, column, baseLine = 1, baseColumn = 1) {
    const error = Object.assign(createCustomError("SyntaxError", message), {
      source,
      offset,
      line,
      column,
      sourceFragment(extraLines) {
        return sourceFragment({ source, line, column, baseLine, baseColumn }, isNaN(extraLines) ? 0 : extraLines);
      },
      get formattedMessage() {
        return `Parse error: ${message}
` + sourceFragment({ source, line, column, baseLine, baseColumn }, 2);
      }
    });
    return error;
  }

  // ../../engine-v2/node_modules/css-tree/lib/parser/sequence.js
  function readSequence(recognizer) {
    const children = this.createList();
    let space = false;
    const context = {
      recognizer
    };
    while (!this.eof) {
      switch (this.tokenType) {
        case Comment:
          this.next();
          continue;
        case WhiteSpace:
          space = true;
          this.next();
          continue;
      }
      let child = recognizer.getNode.call(this, context);
      if (child === void 0) {
        break;
      }
      if (space) {
        if (recognizer.onWhiteSpace) {
          recognizer.onWhiteSpace.call(this, child, children, context);
        }
        space = false;
      }
      children.push(child);
    }
    if (space && recognizer.onWhiteSpace) {
      recognizer.onWhiteSpace.call(this, null, children, context);
    }
    return children;
  }

  // ../../engine-v2/node_modules/css-tree/lib/parser/create.js
  var NOOP = () => {
  };
  var EXCLAMATIONMARK = 33;
  var NUMBERSIGN = 35;
  var SEMICOLON = 59;
  var LEFTCURLYBRACKET = 123;
  var NULL = 0;
  var arrayMethods = {
    createList() {
      return [];
    },
    createSingleNodeList(node) {
      return [node];
    },
    getFirstListNode(list2) {
      return list2 && list2[0] || null;
    },
    getLastListNode(list2) {
      return list2 && list2.length > 0 ? list2[list2.length - 1] : null;
    }
  };
  var listMethods = {
    createList() {
      return new List();
    },
    createSingleNodeList(node) {
      return new List().appendData(node);
    },
    getFirstListNode(list2) {
      return list2 && list2.first;
    },
    getLastListNode(list2) {
      return list2 && list2.last;
    }
  };
  function createParseContext(name50) {
    return function() {
      return this[name50]();
    };
  }
  function fetchParseValues(dict) {
    const result = /* @__PURE__ */ Object.create(null);
    for (const name50 of Object.keys(dict)) {
      const item = dict[name50];
      const fn = item.parse || item;
      if (fn) {
        result[name50] = fn;
      }
    }
    return result;
  }
  function processConfig(config) {
    const parseConfig = {
      context: /* @__PURE__ */ Object.create(null),
      features: Object.assign(/* @__PURE__ */ Object.create(null), config.features),
      scope: Object.assign(/* @__PURE__ */ Object.create(null), config.scope),
      atrule: fetchParseValues(config.atrule),
      pseudo: fetchParseValues(config.pseudo),
      node: fetchParseValues(config.node)
    };
    for (const [name50, context] of Object.entries(config.parseContext)) {
      switch (typeof context) {
        case "function":
          parseConfig.context[name50] = context;
          break;
        case "string":
          parseConfig.context[name50] = createParseContext(context);
          break;
      }
    }
    return {
      config: parseConfig,
      ...parseConfig,
      ...parseConfig.node
    };
  }
  function createParser(config) {
    let source = "";
    let filename = "<unknown>";
    let needPositions = false;
    let onParseError = NOOP;
    let onParseErrorThrow = false;
    const locationMap = new OffsetToLocation();
    const parser = Object.assign(new TokenStream(), processConfig(config || {}), {
      parseAtrulePrelude: true,
      parseRulePrelude: true,
      parseValue: true,
      parseCustomProperty: false,
      readSequence,
      consumeUntilBalanceEnd: () => 0,
      consumeUntilLeftCurlyBracket(code2) {
        return code2 === LEFTCURLYBRACKET ? 1 : 0;
      },
      consumeUntilLeftCurlyBracketOrSemicolon(code2) {
        return code2 === LEFTCURLYBRACKET || code2 === SEMICOLON ? 1 : 0;
      },
      consumeUntilExclamationMarkOrSemicolon(code2) {
        return code2 === EXCLAMATIONMARK || code2 === SEMICOLON ? 1 : 0;
      },
      consumeUntilSemicolonIncluded(code2) {
        return code2 === SEMICOLON ? 2 : 0;
      },
      createList: NOOP,
      createSingleNodeList: NOOP,
      getFirstListNode: NOOP,
      getLastListNode: NOOP,
      parseWithFallback(consumer, fallback) {
        const startIndex = this.tokenIndex;
        try {
          return consumer.call(this);
        } catch (e) {
          if (onParseErrorThrow) {
            throw e;
          }
          this.skip(startIndex - this.tokenIndex);
          const fallbackNode = fallback.call(this);
          onParseErrorThrow = true;
          onParseError(e, fallbackNode);
          onParseErrorThrow = false;
          return fallbackNode;
        }
      },
      lookupNonWSType(offset) {
        let type;
        do {
          type = this.lookupType(offset++);
          if (type !== WhiteSpace && type !== Comment) {
            return type;
          }
        } while (type !== NULL);
        return NULL;
      },
      charCodeAt(offset) {
        return offset >= 0 && offset < source.length ? source.charCodeAt(offset) : 0;
      },
      substring(offsetStart, offsetEnd) {
        return source.substring(offsetStart, offsetEnd);
      },
      substrToCursor(start) {
        return this.source.substring(start, this.tokenStart);
      },
      cmpChar(offset, charCode) {
        return cmpChar(source, offset, charCode);
      },
      cmpStr(offsetStart, offsetEnd, str) {
        return cmpStr(source, offsetStart, offsetEnd, str);
      },
      consume(tokenType2) {
        const start = this.tokenStart;
        this.eat(tokenType2);
        return this.substrToCursor(start);
      },
      consumeFunctionName() {
        const name50 = source.substring(this.tokenStart, this.tokenEnd - 1);
        this.eat(Function);
        return name50;
      },
      consumeNumber(type) {
        const number2 = source.substring(this.tokenStart, consumeNumber(source, this.tokenStart));
        this.eat(type);
        return number2;
      },
      eat(tokenType2) {
        if (this.tokenType !== tokenType2) {
          const tokenName = names_default[tokenType2].slice(0, -6).replace(/-/g, " ").replace(/^./, (m) => m.toUpperCase());
          let message = `${/[[\](){}]/.test(tokenName) ? `"${tokenName}"` : tokenName} is expected`;
          let offset = this.tokenStart;
          switch (tokenType2) {
            case Ident:
              if (this.tokenType === Function || this.tokenType === Url) {
                offset = this.tokenEnd - 1;
                message = "Identifier is expected but function found";
              } else {
                message = "Identifier is expected";
              }
              break;
            case Hash:
              if (this.isDelim(NUMBERSIGN)) {
                this.next();
                offset++;
                message = "Name is expected";
              }
              break;
            case Percentage:
              if (this.tokenType === Number2) {
                offset = this.tokenEnd;
                message = "Percent sign is expected";
              }
              break;
          }
          this.error(message, offset);
        }
        this.next();
      },
      eatIdent(name50) {
        if (this.tokenType !== Ident || this.lookupValue(0, name50) === false) {
          this.error(`Identifier "${name50}" is expected`);
        }
        this.next();
      },
      eatDelim(code2) {
        if (!this.isDelim(code2)) {
          this.error(`Delim "${String.fromCharCode(code2)}" is expected`);
        }
        this.next();
      },
      getLocation(start, end) {
        if (needPositions) {
          return locationMap.getLocationRange(
            start,
            end,
            filename
          );
        }
        return null;
      },
      getLocationFromList(list2) {
        if (needPositions) {
          const head = this.getFirstListNode(list2);
          const tail = this.getLastListNode(list2);
          return locationMap.getLocationRange(
            head !== null ? head.loc.start.offset - locationMap.startOffset : this.tokenStart,
            tail !== null ? tail.loc.end.offset - locationMap.startOffset : this.tokenStart,
            filename
          );
        }
        return null;
      },
      error(message, offset) {
        const location = typeof offset !== "undefined" && offset < source.length ? locationMap.getLocation(offset) : this.eof ? locationMap.getLocation(findWhiteSpaceStart(source, source.length - 1)) : locationMap.getLocation(this.tokenStart);
        throw new SyntaxError2(
          message || "Unexpected input",
          source,
          location.offset,
          location.line,
          location.column,
          locationMap.startLine,
          locationMap.startColumn
        );
      }
    });
    const createTokenIterateAPI = () => ({
      filename,
      source,
      tokenCount: parser.tokenCount,
      getTokenType: (index) => parser.getTokenType(index),
      getTokenTypeName: (index) => names_default[parser.getTokenType(index)],
      getTokenStart: (index) => parser.getTokenStart(index),
      getTokenEnd: (index) => parser.getTokenEnd(index),
      getTokenValue: (index) => parser.source.substring(parser.getTokenStart(index), parser.getTokenEnd(index)),
      substring: (start, end) => parser.source.substring(start, end),
      balance: parser.balance.subarray(0, parser.tokenCount + 1),
      isBlockOpenerTokenType: parser.isBlockOpenerTokenType,
      isBlockCloserTokenType: parser.isBlockCloserTokenType,
      getBlockTokenPairIndex: (index) => parser.getBlockTokenPairIndex(index),
      getLocation: (offset) => locationMap.getLocation(offset, filename),
      getRangeLocation: (start, end) => locationMap.getLocationRange(start, end, filename)
    });
    const parse52 = function(source_, options) {
      source = source_;
      options = options || {};
      parser.setSource(source, tokenize);
      locationMap.setSource(
        source,
        options.offset,
        options.line,
        options.column
      );
      filename = options.filename || "<unknown>";
      needPositions = Boolean(options.positions);
      onParseError = typeof options.onParseError === "function" ? options.onParseError : NOOP;
      onParseErrorThrow = false;
      parser.parseAtrulePrelude = "parseAtrulePrelude" in options ? Boolean(options.parseAtrulePrelude) : true;
      parser.parseRulePrelude = "parseRulePrelude" in options ? Boolean(options.parseRulePrelude) : true;
      parser.parseValue = "parseValue" in options ? Boolean(options.parseValue) : true;
      parser.parseCustomProperty = "parseCustomProperty" in options ? Boolean(options.parseCustomProperty) : false;
      const { context = "default", list: list2 = true, onComment, onToken } = options;
      if (context in parser.context === false) {
        throw new Error("Unknown context `" + context + "`");
      }
      Object.assign(parser, list2 ? listMethods : arrayMethods);
      if (Array.isArray(onToken)) {
        parser.forEachToken((type, start, end) => {
          onToken.push({ type, start, end });
        });
      } else if (typeof onToken === "function") {
        parser.forEachToken(onToken.bind(createTokenIterateAPI()));
      }
      if (typeof onComment === "function") {
        parser.forEachToken((type, start, end) => {
          if (type === Comment) {
            const loc = parser.getLocation(start, end);
            const value = cmpStr(source, end - 2, end, "*/") ? source.slice(start + 2, end - 2) : source.slice(start + 2, end);
            onComment(value, loc);
          }
        });
      }
      const ast = parser.context[context].call(parser, options);
      if (!parser.eof) {
        parser.error();
      }
      return ast;
    };
    return Object.assign(parse52, {
      SyntaxError: SyntaxError2,
      config: parser.config
    });
  }

  // ../../engine-v2/node_modules/css-tree/lib/generator/sourceMap.js
  var import_source_map_generator = __toESM(require_source_map_generator(), 1);
  var trackNodes = /* @__PURE__ */ new Set(["Atrule", "Selector", "Declaration"]);
  function generateSourceMap(handlers) {
    const map = new import_source_map_generator.SourceMapGenerator();
    const generated = {
      line: 1,
      column: 0
    };
    const original = {
      line: 0,
      // should be zero to add first mapping
      column: 0
    };
    const activatedGenerated = {
      line: 1,
      column: 0
    };
    const activatedMapping = {
      generated: activatedGenerated
    };
    let line = 1;
    let column = 0;
    let sourceMappingActive = false;
    const origHandlersNode = handlers.node;
    handlers.node = function(node) {
      if (node.loc && node.loc.start && trackNodes.has(node.type)) {
        const nodeLine = node.loc.start.line;
        const nodeColumn = node.loc.start.column - 1;
        if (original.line !== nodeLine || original.column !== nodeColumn) {
          original.line = nodeLine;
          original.column = nodeColumn;
          generated.line = line;
          generated.column = column;
          if (sourceMappingActive) {
            sourceMappingActive = false;
            if (generated.line !== activatedGenerated.line || generated.column !== activatedGenerated.column) {
              map.addMapping(activatedMapping);
            }
          }
          sourceMappingActive = true;
          map.addMapping({
            source: node.loc.source,
            original,
            generated
          });
        }
      }
      origHandlersNode.call(this, node);
      if (sourceMappingActive && trackNodes.has(node.type)) {
        activatedGenerated.line = line;
        activatedGenerated.column = column;
      }
    };
    const origHandlersEmit = handlers.emit;
    handlers.emit = function(value, type, auto) {
      for (let i = 0; i < value.length; i++) {
        if (value.charCodeAt(i) === 10) {
          line++;
          column = 0;
        } else {
          column++;
        }
      }
      origHandlersEmit(value, type, auto);
    };
    const origHandlersResult = handlers.result;
    handlers.result = function() {
      if (sourceMappingActive) {
        map.addMapping(activatedMapping);
      }
      return {
        css: origHandlersResult(),
        map
      };
    };
    return handlers;
  }

  // ../../engine-v2/node_modules/css-tree/lib/generator/token-before.js
  var token_before_exports = {};
  __export(token_before_exports, {
    safe: () => safe,
    spec: () => spec
  });
  var PLUSSIGN = 43;
  var HYPHENMINUS = 45;
  var code = (type, value) => {
    if (type === Delim) {
      type = value;
    }
    if (typeof type === "string") {
      type = Math.min(type.charCodeAt(0), 128) << 6;
    }
    return type << 1;
  };
  var specPairs = [
    [Ident, Ident],
    [Ident, Function],
    [Ident, Url],
    [Ident, BadUrl],
    [Ident, "-"],
    [Ident, Number2],
    [Ident, Percentage],
    [Ident, Dimension],
    [Ident, CDC],
    [Ident, LeftParenthesis],
    [AtKeyword, Ident],
    [AtKeyword, Function],
    [AtKeyword, Url],
    [AtKeyword, BadUrl],
    [AtKeyword, "-"],
    [AtKeyword, Number2],
    [AtKeyword, Percentage],
    [AtKeyword, Dimension],
    [AtKeyword, CDC],
    [Hash, Ident],
    [Hash, Function],
    [Hash, Url],
    [Hash, BadUrl],
    [Hash, "-"],
    [Hash, Number2],
    [Hash, Percentage],
    [Hash, Dimension],
    [Hash, CDC],
    [Dimension, Ident],
    [Dimension, Function],
    [Dimension, Url],
    [Dimension, BadUrl],
    [Dimension, "-"],
    [Dimension, Number2],
    [Dimension, Percentage],
    [Dimension, Dimension],
    [Dimension, CDC],
    ["#", Ident],
    ["#", Function],
    ["#", Url],
    ["#", BadUrl],
    ["#", "-"],
    ["#", Number2],
    ["#", Percentage],
    ["#", Dimension],
    ["#", CDC],
    // https://github.com/w3c/csswg-drafts/pull/6874
    ["-", Ident],
    ["-", Function],
    ["-", Url],
    ["-", BadUrl],
    ["-", "-"],
    ["-", Number2],
    ["-", Percentage],
    ["-", Dimension],
    ["-", CDC],
    // https://github.com/w3c/csswg-drafts/pull/6874
    [Number2, Ident],
    [Number2, Function],
    [Number2, Url],
    [Number2, BadUrl],
    [Number2, Number2],
    [Number2, Percentage],
    [Number2, Dimension],
    [Number2, "%"],
    [Number2, CDC],
    // https://github.com/w3c/csswg-drafts/pull/6874
    ["@", Ident],
    ["@", Function],
    ["@", Url],
    ["@", BadUrl],
    ["@", "-"],
    ["@", CDC],
    // https://github.com/w3c/csswg-drafts/pull/6874
    [".", Number2],
    [".", Percentage],
    [".", Dimension],
    ["+", Number2],
    ["+", Percentage],
    ["+", Dimension],
    ["/", "*"]
  ];
  var safePairs = specPairs.concat([
    [Ident, Hash],
    [Dimension, Hash],
    [Hash, Hash],
    [AtKeyword, LeftParenthesis],
    [AtKeyword, String2],
    [AtKeyword, Colon],
    [Percentage, Percentage],
    [Percentage, Dimension],
    [Percentage, Function],
    [Percentage, "-"],
    [RightParenthesis, Ident],
    [RightParenthesis, Function],
    [RightParenthesis, Percentage],
    [RightParenthesis, Dimension],
    [RightParenthesis, Hash],
    [RightParenthesis, "-"]
  ]);
  function createMap(pairs) {
    const isWhiteSpaceRequired = new Set(
      pairs.map(([prev, next]) => code(prev) << 16 | code(next))
    );
    return function(prevCode, type, value) {
      const nextCode = code(type, value);
      const nextCharCode = value.charCodeAt(0);
      const emitWs = nextCharCode === HYPHENMINUS && type !== Ident && type !== Function && type !== CDC || nextCharCode === PLUSSIGN ? isWhiteSpaceRequired.has((prevCode & 65534) << 16 | nextCharCode << 7) : isWhiteSpaceRequired.has((prevCode & 65534) << 16 | nextCode);
      return nextCode | emitWs;
    };
  }
  var spec = createMap(specPairs);
  var safe = createMap(safePairs);

  // ../../engine-v2/node_modules/css-tree/lib/generator/create.js
  var REVERSESOLIDUS = 92;
  function processChildren(node, delimeter) {
    if (typeof delimeter === "function") {
      let prev = null;
      node.children.forEach((node2) => {
        if (prev !== null) {
          delimeter.call(this, prev);
        }
        this.node(node2);
        prev = node2;
      });
      return;
    }
    node.children.forEach(this.node, this);
  }
  function createGenerator(config) {
    const types = /* @__PURE__ */ new Map();
    for (let [name50, item] of Object.entries(config.node)) {
      const fn = item.generate || item;
      if (typeof fn === "function") {
        types.set(name50, item.generate || item);
      }
    }
    return function(node, options) {
      let buffer = "";
      let prevCode = 0;
      let handlers = {
        node(node2) {
          if (types.has(node2.type)) {
            types.get(node2.type).call(publicApi, node2);
          } else {
            throw new Error("Unknown node type: " + node2.type);
          }
        },
        tokenBefore: safe,
        token(type, value, suppressAutoWhiteSpace) {
          prevCode = this.tokenBefore(prevCode, type, value);
          if (!suppressAutoWhiteSpace && prevCode & 1) {
            this.emit(" ", WhiteSpace, true);
          }
          this.emit(value, type, false);
          if (type === Delim && value.charCodeAt(0) === REVERSESOLIDUS) {
            this.emit("\n", WhiteSpace, true);
          }
        },
        emit(value) {
          buffer += value;
        },
        result() {
          return buffer;
        }
      };
      if (options) {
        if (typeof options.decorator === "function") {
          handlers = options.decorator(handlers);
        }
        if (options.sourceMap) {
          handlers = generateSourceMap(handlers);
        }
        if (options.mode in token_before_exports) {
          handlers.tokenBefore = token_before_exports[options.mode];
        }
      }
      const publicApi = {
        node: (node2) => handlers.node(node2),
        children: processChildren,
        token: (type, value) => handlers.token(type, value),
        tokenize: (raw) => tokenize(raw, (type, start, end) => {
          handlers.token(
            type,
            raw.slice(start, end),
            start !== 0
            // suppress auto whitespace for internal value tokens
          );
        })
      };
      handlers.node(node);
      return handlers.result();
    };
  }

  // ../../engine-v2/node_modules/css-tree/lib/convertor/create.js
  function createConvertor(walk3) {
    return {
      fromPlainObject(ast) {
        walk3(ast, {
          enter(node) {
            if (node.children && node.children instanceof List === false) {
              node.children = new List().fromArray(node.children);
            }
          }
        });
        return ast;
      },
      toPlainObject(ast) {
        walk3(ast, {
          leave(node) {
            if (node.children && node.children instanceof List) {
              node.children = node.children.toArray();
            }
          }
        });
        return ast;
      }
    };
  }

  // ../../engine-v2/node_modules/css-tree/lib/walker/create.js
  var { hasOwnProperty: hasOwnProperty2 } = Object.prototype;
  var noop = function() {
  };
  function ensureFunction(value) {
    return typeof value === "function" ? value : noop;
  }
  function invokeForType(fn, type) {
    return function(node, item, list2) {
      if (node.type === type) {
        fn.call(this, node, item, list2);
      }
    };
  }
  function getWalkersFromStructure(name50, nodeType) {
    const structure50 = nodeType.structure;
    const walkers = [];
    for (const key in structure50) {
      if (hasOwnProperty2.call(structure50, key) === false) {
        continue;
      }
      let fieldTypes = structure50[key];
      const walker = {
        name: key,
        type: false,
        nullable: false
      };
      if (!Array.isArray(fieldTypes)) {
        fieldTypes = [fieldTypes];
      }
      for (const fieldType of fieldTypes) {
        if (fieldType === null) {
          walker.nullable = true;
        } else if (typeof fieldType === "string") {
          walker.type = "node";
        } else if (Array.isArray(fieldType)) {
          walker.type = "list";
        }
      }
      if (walker.type) {
        walkers.push(walker);
      }
    }
    if (walkers.length) {
      return {
        context: nodeType.walkContext,
        fields: walkers
      };
    }
    return null;
  }
  function getTypesFromConfig(config) {
    const types = {};
    for (const name50 in config.node) {
      if (hasOwnProperty2.call(config.node, name50)) {
        const nodeType = config.node[name50];
        if (!nodeType.structure) {
          throw new Error("Missed `structure` field in `" + name50 + "` node type definition");
        }
        types[name50] = getWalkersFromStructure(name50, nodeType);
      }
    }
    return types;
  }
  function createTypeIterator(config, reverse) {
    const fields = config.fields.slice();
    const contextName = config.context;
    const useContext = typeof contextName === "string";
    if (reverse) {
      fields.reverse();
    }
    return function(node, context, walk3, walkReducer) {
      let prevContextValue;
      if (useContext) {
        prevContextValue = context[contextName];
        context[contextName] = node;
      }
      for (const field of fields) {
        const ref = node[field.name];
        if (!field.nullable || ref) {
          if (field.type === "list") {
            const breakWalk = reverse ? ref.reduceRight(walkReducer, false) : ref.reduce(walkReducer, false);
            if (breakWalk) {
              return true;
            }
          } else if (walk3(ref)) {
            return true;
          }
        }
      }
      if (useContext) {
        context[contextName] = prevContextValue;
      }
    };
  }
  function createFastTraveralMap({
    StyleSheet,
    Atrule,
    Rule,
    Block,
    DeclarationList
  }) {
    return {
      Atrule: {
        StyleSheet,
        Atrule,
        Rule,
        Block
      },
      Rule: {
        StyleSheet,
        Atrule,
        Rule,
        Block
      },
      Declaration: {
        StyleSheet,
        Atrule,
        Rule,
        Block,
        DeclarationList
      }
    };
  }
  function createWalker(config) {
    const types = getTypesFromConfig(config);
    const iteratorsNatural = {};
    const iteratorsReverse = {};
    const breakWalk = /* @__PURE__ */ Symbol("break-walk");
    const skipNode = /* @__PURE__ */ Symbol("skip-node");
    for (const name50 in types) {
      if (hasOwnProperty2.call(types, name50) && types[name50] !== null) {
        iteratorsNatural[name50] = createTypeIterator(types[name50], false);
        iteratorsReverse[name50] = createTypeIterator(types[name50], true);
      }
    }
    const fastTraversalIteratorsNatural = createFastTraveralMap(iteratorsNatural);
    const fastTraversalIteratorsReverse = createFastTraveralMap(iteratorsReverse);
    const walk3 = function(root, options) {
      function walkNode(node, item, list2) {
        const enterRet = enter.call(context, node, item, list2);
        if (enterRet === breakWalk) {
          return true;
        }
        if (enterRet === skipNode) {
          return false;
        }
        if (iterators.hasOwnProperty(node.type)) {
          if (iterators[node.type](node, context, walkNode, walkReducer)) {
            return true;
          }
        }
        if (leave.call(context, node, item, list2) === breakWalk) {
          return true;
        }
        return false;
      }
      let enter = noop;
      let leave = noop;
      let iterators = iteratorsNatural;
      let walkReducer = (ret, data, item, list2) => ret || walkNode(data, item, list2);
      const context = {
        break: breakWalk,
        skip: skipNode,
        root,
        stylesheet: null,
        atrule: null,
        atrulePrelude: null,
        rule: null,
        selector: null,
        block: null,
        declaration: null,
        function: null
      };
      if (typeof options === "function") {
        enter = options;
      } else if (options) {
        enter = ensureFunction(options.enter);
        leave = ensureFunction(options.leave);
        if (options.reverse) {
          iterators = iteratorsReverse;
        }
        if (options.visit) {
          if (fastTraversalIteratorsNatural.hasOwnProperty(options.visit)) {
            iterators = options.reverse ? fastTraversalIteratorsReverse[options.visit] : fastTraversalIteratorsNatural[options.visit];
          } else if (!types.hasOwnProperty(options.visit)) {
            throw new Error("Bad value `" + options.visit + "` for `visit` option (should be: " + Object.keys(types).sort().join(", ") + ")");
          }
          enter = invokeForType(enter, options.visit);
          leave = invokeForType(leave, options.visit);
        }
      }
      if (enter === noop && leave === noop) {
        throw new Error("Neither `enter` nor `leave` walker handler is set or both aren't a function");
      }
      walkNode(root);
    };
    walk3.break = breakWalk;
    walk3.skip = skipNode;
    walk3.find = function(ast, fn) {
      let found = null;
      walk3(ast, function(node, item, list2) {
        if (fn.call(this, node, item, list2)) {
          found = node;
          return breakWalk;
        }
      });
      return found;
    };
    walk3.findLast = function(ast, fn) {
      let found = null;
      walk3(ast, {
        reverse: true,
        enter(node, item, list2) {
          if (fn.call(this, node, item, list2)) {
            found = node;
            return breakWalk;
          }
        }
      });
      return found;
    };
    walk3.findAll = function(ast, fn) {
      const found = [];
      walk3(ast, function(node, item, list2) {
        if (fn.call(this, node, item, list2)) {
          found.push(node);
        }
      });
      return found;
    };
    return walk3;
  }

  // ../../engine-v2/node_modules/css-tree/lib/definition-syntax/generate.js
  function noop2(value) {
    return value;
  }
  function generateMultiplier(multiplier) {
    const { min, max, comma } = multiplier;
    if (min === 0 && max === 0) {
      return comma ? "#?" : "*";
    }
    if (min === 0 && max === 1) {
      return "?";
    }
    if (min === 1 && max === 0) {
      return comma ? "#" : "+";
    }
    if (min === 1 && max === 1) {
      return "";
    }
    return (comma ? "#" : "") + (min === max ? "{" + min + "}" : "{" + min + "," + (max !== 0 ? max : "") + "}");
  }
  function generateTypeOpts(node) {
    switch (node.type) {
      case "Range":
        return " [" + (node.min === null ? "-∞" : node.min) + "," + (node.max === null ? "∞" : node.max) + "]";
      default:
        throw new Error("Unknown node type `" + node.type + "`");
    }
  }
  function generateSequence(node, decorate, forceBraces, compact) {
    const combinator = node.combinator === " " || compact ? node.combinator : " " + node.combinator + " ";
    const result = node.terms.map((term) => internalGenerate(term, decorate, forceBraces, compact)).join(combinator);
    if (node.explicit || forceBraces) {
      return (compact || result[0] === "," ? "[" : "[ ") + result + (compact ? "]" : " ]");
    }
    return result;
  }
  function internalGenerate(node, decorate, forceBraces, compact) {
    let result;
    switch (node.type) {
      case "Group":
        result = generateSequence(node, decorate, forceBraces, compact) + (node.disallowEmpty ? "!" : "");
        break;
      case "Multiplier":
        return internalGenerate(node.term, decorate, forceBraces, compact) + decorate(generateMultiplier(node), node);
      case "Boolean":
        result = "<boolean-expr[" + internalGenerate(node.term, decorate, forceBraces, compact) + "]>";
        break;
      case "Type":
        result = "<" + node.name + (node.opts ? decorate(generateTypeOpts(node.opts), node.opts) : "") + ">";
        break;
      case "Property":
        result = "<'" + node.name + "'>";
        break;
      case "Keyword":
        result = node.name;
        break;
      case "AtKeyword":
        result = "@" + node.name;
        break;
      case "Function":
        result = node.name + "(";
        break;
      case "String":
      case "Token":
        result = node.value;
        break;
      case "Comma":
        result = ",";
        break;
      default:
        throw new Error("Unknown node type `" + node.type + "`");
    }
    return decorate(result, node);
  }
  function generate(node, options) {
    let decorate = noop2;
    let forceBraces = false;
    let compact = false;
    if (typeof options === "function") {
      decorate = options;
    } else if (options) {
      forceBraces = Boolean(options.forceBraces);
      compact = Boolean(options.compact);
      if (typeof options.decorate === "function") {
        decorate = options.decorate;
      }
    }
    return internalGenerate(node, decorate, forceBraces, compact);
  }

  // ../../engine-v2/node_modules/css-tree/lib/lexer/error.js
  var defaultLoc = { offset: 0, line: 1, column: 1 };
  function locateMismatch(matchResult, node) {
    const tokens = matchResult.tokens;
    const longestMatch = matchResult.longestMatch;
    const mismatchNode = longestMatch < tokens.length ? tokens[longestMatch].node || null : null;
    const badNode = mismatchNode !== node ? mismatchNode : null;
    let mismatchOffset = 0;
    let mismatchLength = 0;
    let entries = 0;
    let css = "";
    let start;
    let end;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].value;
      if (i === longestMatch) {
        mismatchLength = token.length;
        mismatchOffset = css.length;
      }
      if (badNode !== null && tokens[i].node === badNode) {
        if (i <= longestMatch) {
          entries++;
        } else {
          entries = 0;
        }
      }
      css += token;
    }
    if (longestMatch === tokens.length || entries > 1) {
      start = fromLoc(badNode || node, "end") || buildLoc(defaultLoc, css);
      end = buildLoc(start);
    } else {
      start = fromLoc(badNode, "start") || buildLoc(fromLoc(node, "start") || defaultLoc, css.slice(0, mismatchOffset));
      end = fromLoc(badNode, "end") || buildLoc(start, css.substr(mismatchOffset, mismatchLength));
    }
    return {
      css,
      mismatchOffset,
      mismatchLength,
      start,
      end
    };
  }
  function fromLoc(node, point) {
    const value = node && node.loc && node.loc[point];
    if (value) {
      return "line" in value ? buildLoc(value) : value;
    }
    return null;
  }
  function buildLoc({ offset, line, column }, extra) {
    const loc = {
      offset,
      line,
      column
    };
    if (extra) {
      const lines = extra.split(/\n|\r\n?|\f/);
      loc.offset += extra.length;
      loc.line += lines.length - 1;
      loc.column = lines.length === 1 ? loc.column + extra.length : lines.pop().length + 1;
    }
    return loc;
  }
  var SyntaxReferenceError = function(type, referenceName) {
    const error = createCustomError(
      "SyntaxReferenceError",
      type + (referenceName ? " `" + referenceName + "`" : "")
    );
    error.reference = referenceName;
    return error;
  };
  var SyntaxMatchError = function(message, syntax, node, matchResult) {
    const error = createCustomError("SyntaxMatchError", message);
    const {
      css,
      mismatchOffset,
      mismatchLength,
      start,
      end
    } = locateMismatch(matchResult, node);
    error.rawMessage = message;
    error.syntax = syntax ? generate(syntax) : "<generic>";
    error.css = css;
    error.mismatchOffset = mismatchOffset;
    error.mismatchLength = mismatchLength;
    error.message = message + "\n  syntax: " + error.syntax + "\n   value: " + (css || "<empty string>") + "\n  --------" + new Array(error.mismatchOffset + 1).join("-") + "^";
    Object.assign(error, start);
    error.loc = {
      source: node && node.loc && node.loc.source || "<unknown>",
      start,
      end
    };
    return error;
  };

  // ../../engine-v2/node_modules/css-tree/lib/utils/names.js
  var keywords = /* @__PURE__ */ new Map();
  var properties = /* @__PURE__ */ new Map();
  var HYPHENMINUS2 = 45;
  var keyword = getKeywordDescriptor;
  var property = getPropertyDescriptor;
  function isCustomProperty(str, offset) {
    offset = offset || 0;
    return str.length - offset >= 2 && str.charCodeAt(offset) === HYPHENMINUS2 && str.charCodeAt(offset + 1) === HYPHENMINUS2;
  }
  function getVendorPrefix(str, offset) {
    offset = offset || 0;
    if (str.length - offset >= 3) {
      if (str.charCodeAt(offset) === HYPHENMINUS2 && str.charCodeAt(offset + 1) !== HYPHENMINUS2) {
        const secondDashIndex = str.indexOf("-", offset + 2);
        if (secondDashIndex !== -1) {
          return str.substring(offset, secondDashIndex + 1);
        }
      }
    }
    return "";
  }
  function getKeywordDescriptor(keyword2) {
    if (keywords.has(keyword2)) {
      return keywords.get(keyword2);
    }
    const name50 = keyword2.toLowerCase();
    let descriptor3 = keywords.get(name50);
    if (descriptor3 === void 0) {
      const custom = isCustomProperty(name50, 0);
      const vendor = !custom ? getVendorPrefix(name50, 0) : "";
      descriptor3 = Object.freeze({
        basename: name50.substr(vendor.length),
        name: name50,
        prefix: vendor,
        vendor,
        custom
      });
    }
    keywords.set(keyword2, descriptor3);
    return descriptor3;
  }
  function getPropertyDescriptor(property2) {
    if (properties.has(property2)) {
      return properties.get(property2);
    }
    let name50 = property2;
    let hack = property2[0];
    if (hack === "/") {
      hack = property2[1] === "/" ? "//" : "/";
    } else if (hack !== "_" && hack !== "*" && hack !== "$" && hack !== "#" && hack !== "+" && hack !== "&") {
      hack = "";
    }
    const custom = isCustomProperty(name50, hack.length);
    if (!custom) {
      name50 = name50.toLowerCase();
      if (properties.has(name50)) {
        const descriptor4 = properties.get(name50);
        properties.set(property2, descriptor4);
        return descriptor4;
      }
    }
    const vendor = !custom ? getVendorPrefix(name50, hack.length) : "";
    const prefix = name50.substr(0, hack.length + vendor.length);
    const descriptor3 = Object.freeze({
      basename: name50.substr(prefix.length),
      name: name50.substr(hack.length),
      hack,
      vendor,
      prefix,
      custom
    });
    properties.set(property2, descriptor3);
    return descriptor3;
  }

  // ../../engine-v2/node_modules/css-tree/lib/lexer/generic-const.js
  var cssWideKeywords = [
    "initial",
    "inherit",
    "unset",
    "revert",
    "revert-layer"
  ];

  // ../../engine-v2/node_modules/css-tree/lib/lexer/generic-an-plus-b.js
  var PLUSSIGN2 = 43;
  var HYPHENMINUS3 = 45;
  var N2 = 110;
  var DISALLOW_SIGN = true;
  var ALLOW_SIGN = false;
  function isDelim(token, code2) {
    return token !== null && token.type === Delim && token.value.charCodeAt(0) === code2;
  }
  function skipSC(token, offset, getNextToken) {
    while (token !== null && (token.type === WhiteSpace || token.type === Comment)) {
      token = getNextToken(++offset);
    }
    return offset;
  }
  function checkInteger(token, valueOffset, disallowSign, offset) {
    if (!token) {
      return 0;
    }
    const code2 = token.value.charCodeAt(valueOffset);
    if (code2 === PLUSSIGN2 || code2 === HYPHENMINUS3) {
      if (disallowSign) {
        return 0;
      }
      valueOffset++;
    }
    for (; valueOffset < token.value.length; valueOffset++) {
      if (!isDigit(token.value.charCodeAt(valueOffset))) {
        return 0;
      }
    }
    return offset + 1;
  }
  function consumeB(token, offset_, getNextToken) {
    let sign = false;
    let offset = skipSC(token, offset_, getNextToken);
    token = getNextToken(offset);
    if (token === null) {
      return offset_;
    }
    if (token.type !== Number2) {
      if (isDelim(token, PLUSSIGN2) || isDelim(token, HYPHENMINUS3)) {
        sign = true;
        offset = skipSC(getNextToken(++offset), offset, getNextToken);
        token = getNextToken(offset);
        if (token === null || token.type !== Number2) {
          return 0;
        }
      } else {
        return offset_;
      }
    }
    if (!sign) {
      const code2 = token.value.charCodeAt(0);
      if (code2 !== PLUSSIGN2 && code2 !== HYPHENMINUS3) {
        return 0;
      }
    }
    return checkInteger(token, sign ? 0 : 1, sign, offset);
  }
  function anPlusB(token, getNextToken) {
    let offset = 0;
    if (!token) {
      return 0;
    }
    if (token.type === Number2) {
      return checkInteger(token, 0, ALLOW_SIGN, offset);
    } else if (token.type === Ident && token.value.charCodeAt(0) === HYPHENMINUS3) {
      if (!cmpChar(token.value, 1, N2)) {
        return 0;
      }
      switch (token.value.length) {
        // -n
        // -n <signed-integer>
        // -n ['+' | '-'] <signless-integer>
        case 2:
          return consumeB(getNextToken(++offset), offset, getNextToken);
        // -n- <signless-integer>
        case 3:
          if (token.value.charCodeAt(2) !== HYPHENMINUS3) {
            return 0;
          }
          offset = skipSC(getNextToken(++offset), offset, getNextToken);
          token = getNextToken(offset);
          return checkInteger(token, 0, DISALLOW_SIGN, offset);
        // <dashndashdigit-ident>
        default:
          if (token.value.charCodeAt(2) !== HYPHENMINUS3) {
            return 0;
          }
          return checkInteger(token, 3, DISALLOW_SIGN, offset);
      }
    } else if (token.type === Ident || isDelim(token, PLUSSIGN2) && getNextToken(offset + 1).type === Ident) {
      if (token.type !== Ident) {
        token = getNextToken(++offset);
      }
      if (token === null || !cmpChar(token.value, 0, N2)) {
        return 0;
      }
      switch (token.value.length) {
        // '+'? n
        // '+'? n <signed-integer>
        // '+'? n ['+' | '-'] <signless-integer>
        case 1:
          return consumeB(getNextToken(++offset), offset, getNextToken);
        // '+'? n- <signless-integer>
        case 2:
          if (token.value.charCodeAt(1) !== HYPHENMINUS3) {
            return 0;
          }
          offset = skipSC(getNextToken(++offset), offset, getNextToken);
          token = getNextToken(offset);
          return checkInteger(token, 0, DISALLOW_SIGN, offset);
        // '+'? <ndashdigit-ident>
        default:
          if (token.value.charCodeAt(1) !== HYPHENMINUS3) {
            return 0;
          }
          return checkInteger(token, 2, DISALLOW_SIGN, offset);
      }
    } else if (token.type === Dimension) {
      let code2 = token.value.charCodeAt(0);
      let sign = code2 === PLUSSIGN2 || code2 === HYPHENMINUS3 ? 1 : 0;
      let i = sign;
      for (; i < token.value.length; i++) {
        if (!isDigit(token.value.charCodeAt(i))) {
          break;
        }
      }
      if (i === sign) {
        return 0;
      }
      if (!cmpChar(token.value, i, N2)) {
        return 0;
      }
      if (i + 1 === token.value.length) {
        return consumeB(getNextToken(++offset), offset, getNextToken);
      } else {
        if (token.value.charCodeAt(i + 1) !== HYPHENMINUS3) {
          return 0;
        }
        if (i + 2 === token.value.length) {
          offset = skipSC(getNextToken(++offset), offset, getNextToken);
          token = getNextToken(offset);
          return checkInteger(token, 0, DISALLOW_SIGN, offset);
        } else {
          return checkInteger(token, i + 2, DISALLOW_SIGN, offset);
        }
      }
    }
    return 0;
  }

  // ../../engine-v2/node_modules/css-tree/lib/lexer/generic-urange.js
  var PLUSSIGN3 = 43;
  var HYPHENMINUS4 = 45;
  var QUESTIONMARK = 63;
  var U = 117;
  function isDelim2(token, code2) {
    return token !== null && token.type === Delim && token.value.charCodeAt(0) === code2;
  }
  function startsWith(token, code2) {
    return token.value.charCodeAt(0) === code2;
  }
  function hexSequence(token, offset, allowDash) {
    let hexlen = 0;
    for (let pos = offset; pos < token.value.length; pos++) {
      const code2 = token.value.charCodeAt(pos);
      if (code2 === HYPHENMINUS4 && allowDash && hexlen !== 0) {
        hexSequence(token, offset + hexlen + 1, false);
        return 6;
      }
      if (!isHexDigit(code2)) {
        return 0;
      }
      if (++hexlen > 6) {
        return 0;
      }
      ;
    }
    return hexlen;
  }
  function withQuestionMarkSequence(consumed, length2, getNextToken) {
    if (!consumed) {
      return 0;
    }
    while (isDelim2(getNextToken(length2), QUESTIONMARK)) {
      if (++consumed > 6) {
        return 0;
      }
      length2++;
    }
    return length2;
  }
  function urange(token, getNextToken) {
    let length2 = 0;
    if (token === null || token.type !== Ident || !cmpChar(token.value, 0, U)) {
      return 0;
    }
    token = getNextToken(++length2);
    if (token === null) {
      return 0;
    }
    if (isDelim2(token, PLUSSIGN3)) {
      token = getNextToken(++length2);
      if (token === null) {
        return 0;
      }
      if (token.type === Ident) {
        return withQuestionMarkSequence(hexSequence(token, 0, true), ++length2, getNextToken);
      }
      if (isDelim2(token, QUESTIONMARK)) {
        return withQuestionMarkSequence(1, ++length2, getNextToken);
      }
      return 0;
    }
    if (token.type === Number2) {
      const consumedHexLength = hexSequence(token, 1, true);
      if (consumedHexLength === 0) {
        return 0;
      }
      token = getNextToken(++length2);
      if (token === null) {
        return length2;
      }
      if (token.type === Dimension || token.type === Number2) {
        if (!startsWith(token, HYPHENMINUS4) || !hexSequence(token, 1, false)) {
          return 0;
        }
        return length2 + 1;
      }
      return withQuestionMarkSequence(consumedHexLength, length2, getNextToken);
    }
    if (token.type === Dimension) {
      return withQuestionMarkSequence(hexSequence(token, 1, true), ++length2, getNextToken);
    }
    return 0;
  }

  // ../../engine-v2/node_modules/css-tree/lib/lexer/generic.js
  var calcFunctionNames = [
    "calc(",
    "-moz-calc(",
    "-webkit-calc("
  ];
  var comparisonFunctionNames = [
    "min(",
    "max(",
    "clamp("
  ];
  var steppedValueFunctionNames = [
    "round(",
    "mod(",
    "rem("
  ];
  var trigNumberFunctionNames = [
    "sin(",
    "cos(",
    "tan("
  ];
  var trigAngleFunctionNames = [
    "asin(",
    "acos(",
    "atan(",
    "atan2("
  ];
  var otherNumberFunctionNames = [
    "pow(",
    "sqrt(",
    "log(",
    "exp(",
    "sign("
  ];
  var expNumberDimensionPercentageFunctionNames = [
    "hypot("
  ];
  var signFunctionNames = [
    "abs("
  ];
  var numberFunctionNames = [
    ...calcFunctionNames,
    ...comparisonFunctionNames,
    ...steppedValueFunctionNames,
    ...trigNumberFunctionNames,
    ...otherNumberFunctionNames,
    ...expNumberDimensionPercentageFunctionNames,
    ...signFunctionNames
  ];
  var percentageFunctionNames = [
    ...calcFunctionNames,
    ...comparisonFunctionNames,
    ...steppedValueFunctionNames,
    ...expNumberDimensionPercentageFunctionNames,
    ...signFunctionNames
  ];
  var dimensionFunctionNames = [
    ...calcFunctionNames,
    ...comparisonFunctionNames,
    ...steppedValueFunctionNames,
    ...trigAngleFunctionNames,
    ...expNumberDimensionPercentageFunctionNames,
    ...signFunctionNames
  ];
  var balancePair2 = /* @__PURE__ */ new Map([
    [Function, RightParenthesis],
    [LeftParenthesis, RightParenthesis],
    [LeftSquareBracket, RightSquareBracket],
    [LeftCurlyBracket, RightCurlyBracket]
  ]);
  function charCodeAt(str, index) {
    return index < str.length ? str.charCodeAt(index) : 0;
  }
  function eqStr(actual, expected) {
    return cmpStr(actual, 0, actual.length, expected);
  }
  function eqStrAny(actual, expected) {
    for (let i = 0; i < expected.length; i++) {
      if (eqStr(actual, expected[i])) {
        return true;
      }
    }
    return false;
  }
  function isPostfixIeHack(str, offset) {
    if (offset !== str.length - 2) {
      return false;
    }
    return charCodeAt(str, offset) === 92 && // U+005C REVERSE SOLIDUS (\)
    isDigit(charCodeAt(str, offset + 1));
  }
  function outOfRange(opts, value, numEnd) {
    if (opts && opts.type === "Range") {
      const num = Number(
        numEnd !== void 0 && numEnd !== value.length ? value.substr(0, numEnd) : value
      );
      if (isNaN(num)) {
        return true;
      }
      if (opts.min !== null && num < opts.min && typeof opts.min !== "string") {
        return true;
      }
      if (opts.max !== null && num > opts.max && typeof opts.max !== "string") {
        return true;
      }
    }
    return false;
  }
  function consumeFunction(token, getNextToken) {
    let balanceCloseType = 0;
    let balanceStash = [];
    let length2 = 0;
    scan:
      do {
        switch (token.type) {
          case RightCurlyBracket:
          case RightParenthesis:
          case RightSquareBracket:
            if (token.type !== balanceCloseType) {
              break scan;
            }
            balanceCloseType = balanceStash.pop();
            if (balanceStash.length === 0) {
              length2++;
              break scan;
            }
            break;
          case Function:
          case LeftParenthesis:
          case LeftSquareBracket:
          case LeftCurlyBracket:
            balanceStash.push(balanceCloseType);
            balanceCloseType = balancePair2.get(token.type);
            break;
        }
        length2++;
      } while (token = getNextToken(length2));
    return length2;
  }
  function math(next, functionNames) {
    return function(token, getNextToken, opts) {
      if (token === null) {
        return 0;
      }
      if (token.type === Function && eqStrAny(token.value, functionNames)) {
        return consumeFunction(token, getNextToken);
      }
      return next(token, getNextToken, opts);
    };
  }
  function tokenType(expectedTokenType) {
    return function(token) {
      if (token === null || token.type !== expectedTokenType) {
        return 0;
      }
      return 1;
    };
  }
  function customIdent(token) {
    if (token === null || token.type !== Ident) {
      return 0;
    }
    const name50 = token.value.toLowerCase();
    if (eqStrAny(name50, cssWideKeywords)) {
      return 0;
    }
    if (eqStr(name50, "default")) {
      return 0;
    }
    return 1;
  }
  function dashedIdent(token) {
    if (token === null || token.type !== Ident) {
      return 0;
    }
    if (charCodeAt(token.value, 0) !== 45 || charCodeAt(token.value, 1) !== 45) {
      return 0;
    }
    return 1;
  }
  function customPropertyName(token) {
    if (!dashedIdent(token)) {
      return 0;
    }
    if (token.value === "--") {
      return 0;
    }
    return 1;
  }
  function hexColor(token) {
    if (token === null || token.type !== Hash) {
      return 0;
    }
    const length2 = token.value.length;
    if (length2 !== 4 && length2 !== 5 && length2 !== 7 && length2 !== 9) {
      return 0;
    }
    for (let i = 1; i < length2; i++) {
      if (!isHexDigit(charCodeAt(token.value, i))) {
        return 0;
      }
    }
    return 1;
  }
  function idSelector(token) {
    if (token === null || token.type !== Hash) {
      return 0;
    }
    if (!isIdentifierStart(charCodeAt(token.value, 1), charCodeAt(token.value, 2), charCodeAt(token.value, 3))) {
      return 0;
    }
    return 1;
  }
  function declarationValue(token, getNextToken) {
    if (!token) {
      return 0;
    }
    let balanceCloseType = 0;
    let balanceStash = [];
    let length2 = 0;
    scan:
      do {
        switch (token.type) {
          // ... <bad-string-token>, <bad-url-token>,
          case BadString:
          case BadUrl:
            break scan;
          // ... unmatched <)-token>, <]-token>, or <}-token>,
          case RightCurlyBracket:
          case RightParenthesis:
          case RightSquareBracket:
            if (token.type !== balanceCloseType) {
              break scan;
            }
            balanceCloseType = balanceStash.pop();
            break;
          // ... or top-level <semicolon-token> tokens
          case Semicolon:
            if (balanceCloseType === 0) {
              break scan;
            }
            break;
          // ... or <delim-token> tokens with a value of "!"
          case Delim:
            if (balanceCloseType === 0 && token.value === "!") {
              break scan;
            }
            break;
          case Function:
          case LeftParenthesis:
          case LeftSquareBracket:
          case LeftCurlyBracket:
            balanceStash.push(balanceCloseType);
            balanceCloseType = balancePair2.get(token.type);
            break;
        }
        length2++;
      } while (token = getNextToken(length2));
    return length2;
  }
  function anyValue(token, getNextToken) {
    if (!token) {
      return 0;
    }
    let balanceCloseType = 0;
    let balanceStash = [];
    let length2 = 0;
    scan:
      do {
        switch (token.type) {
          // ... does not contain <bad-string-token>, <bad-url-token>,
          case BadString:
          case BadUrl:
            break scan;
          // ... unmatched <)-token>, <]-token>, or <}-token>,
          case RightCurlyBracket:
          case RightParenthesis:
          case RightSquareBracket:
            if (token.type !== balanceCloseType) {
              break scan;
            }
            balanceCloseType = balanceStash.pop();
            break;
          case Function:
          case LeftParenthesis:
          case LeftSquareBracket:
          case LeftCurlyBracket:
            balanceStash.push(balanceCloseType);
            balanceCloseType = balancePair2.get(token.type);
            break;
        }
        length2++;
      } while (token = getNextToken(length2));
    return length2;
  }
  function dimension(type) {
    if (type) {
      type = new Set(type);
    }
    return function(token, getNextToken, opts) {
      if (token === null || token.type !== Dimension) {
        return 0;
      }
      const numberEnd = consumeNumber(token.value, 0);
      if (type !== null) {
        const reverseSolidusOffset = token.value.indexOf("\\", numberEnd);
        const unit = reverseSolidusOffset === -1 || !isPostfixIeHack(token.value, reverseSolidusOffset) ? token.value.substr(numberEnd) : token.value.substring(numberEnd, reverseSolidusOffset);
        if (type.has(unit.toLowerCase()) === false) {
          return 0;
        }
      }
      if (outOfRange(opts, token.value, numberEnd)) {
        return 0;
      }
      return 1;
    };
  }
  function percentage(token, getNextToken, opts) {
    if (token === null || token.type !== Percentage) {
      return 0;
    }
    if (outOfRange(opts, token.value, token.value.length - 1)) {
      return 0;
    }
    return 1;
  }
  function zero(next) {
    if (typeof next !== "function") {
      next = function() {
        return 0;
      };
    }
    return function(token, getNextToken, opts) {
      if (token !== null && token.type === Number2) {
        if (Number(token.value) === 0) {
          return 1;
        }
      }
      return next(token, getNextToken, opts);
    };
  }
  function number(token, getNextToken, opts) {
    if (token === null) {
      return 0;
    }
    const numberEnd = consumeNumber(token.value, 0);
    const isNumber2 = numberEnd === token.value.length;
    if (!isNumber2 && !isPostfixIeHack(token.value, numberEnd)) {
      return 0;
    }
    if (outOfRange(opts, token.value, numberEnd)) {
      return 0;
    }
    return 1;
  }
  function integer(token, getNextToken, opts) {
    if (token === null || token.type !== Number2) {
      return 0;
    }
    let i = charCodeAt(token.value, 0) === 43 || // U+002B PLUS SIGN (+)
    charCodeAt(token.value, 0) === 45 ? 1 : 0;
    for (; i < token.value.length; i++) {
      if (!isDigit(charCodeAt(token.value, i))) {
        return 0;
      }
    }
    if (outOfRange(opts, token.value, i)) {
      return 0;
    }
    return 1;
  }
  var tokenTypes = {
    "ident-token": tokenType(Ident),
    "function-token": tokenType(Function),
    "at-keyword-token": tokenType(AtKeyword),
    "hash-token": tokenType(Hash),
    "string-token": tokenType(String2),
    "bad-string-token": tokenType(BadString),
    "url-token": tokenType(Url),
    "bad-url-token": tokenType(BadUrl),
    "delim-token": tokenType(Delim),
    "number-token": tokenType(Number2),
    "percentage-token": tokenType(Percentage),
    "dimension-token": tokenType(Dimension),
    "whitespace-token": tokenType(WhiteSpace),
    "CDO-token": tokenType(CDO),
    "CDC-token": tokenType(CDC),
    "colon-token": tokenType(Colon),
    "semicolon-token": tokenType(Semicolon),
    "comma-token": tokenType(Comma),
    "[-token": tokenType(LeftSquareBracket),
    "]-token": tokenType(RightSquareBracket),
    "(-token": tokenType(LeftParenthesis),
    ")-token": tokenType(RightParenthesis),
    "{-token": tokenType(LeftCurlyBracket),
    "}-token": tokenType(RightCurlyBracket)
  };
  var productionTypes = {
    // token type aliases
    "string": tokenType(String2),
    "ident": tokenType(Ident),
    // percentage
    "percentage": math(percentage, percentageFunctionNames),
    // numeric
    "zero": zero(),
    "number": math(number, numberFunctionNames),
    "integer": math(integer, numberFunctionNames),
    // complex types
    "custom-ident": customIdent,
    "dashed-ident": dashedIdent,
    "custom-property-name": customPropertyName,
    "hex-color": hexColor,
    "id-selector": idSelector,
    // element( <id-selector> )
    "an-plus-b": anPlusB,
    "urange": urange,
    "declaration-value": declarationValue,
    "any-value": anyValue
  };
  var unitGroups = [
    "length",
    "angle",
    "time",
    "frequency",
    "resolution",
    "flex",
    "decibel",
    "semitones"
  ];
  function createDemensionTypes(units) {
    const {
      angle: angle2,
      decibel: decibel2,
      frequency: frequency2,
      flex: flex2,
      length: length2,
      resolution: resolution2,
      semitones: semitones2,
      time: time2
    } = units || {};
    return {
      "dimension": math(dimension(null), dimensionFunctionNames),
      "angle": math(dimension(angle2), dimensionFunctionNames),
      "decibel": math(dimension(decibel2), dimensionFunctionNames),
      "frequency": math(dimension(frequency2), dimensionFunctionNames),
      "flex": math(dimension(flex2), dimensionFunctionNames),
      "length": math(zero(dimension(length2)), dimensionFunctionNames),
      "resolution": math(dimension(resolution2), dimensionFunctionNames),
      "semitones": math(dimension(semitones2), dimensionFunctionNames),
      "time": math(dimension(time2), dimensionFunctionNames)
    };
  }
  function createAttrUnit(units) {
    const unitSet = /* @__PURE__ */ new Set();
    for (const group of unitGroups) {
      if (Array.isArray(units[group])) {
        for (const unit of units[group]) {
          unitSet.add(unit.toLowerCase());
        }
      }
    }
    return function attrUnit(token) {
      if (token === null) {
        return 0;
      }
      if (token.type === Delim && token.value === "%") {
        return 1;
      }
      if (token.type === Ident && unitSet.has(token.value.toLowerCase())) {
        return 1;
      }
      return 0;
    };
  }
  function createGenericTypes(units) {
    return {
      ...tokenTypes,
      ...productionTypes,
      ...createDemensionTypes(units),
      "attr-unit": createAttrUnit(units)
    };
  }

  // ../../engine-v2/node_modules/css-tree/lib/lexer/units.js
  var units_exports = {};
  __export(units_exports, {
    angle: () => angle,
    decibel: () => decibel,
    flex: () => flex,
    frequency: () => frequency,
    length: () => length,
    resolution: () => resolution,
    semitones: () => semitones,
    time: () => time
  });
  var length = [
    // absolute length units https://www.w3.org/TR/css-values-3/#lengths
    "cm",
    "mm",
    "q",
    "in",
    "pt",
    "pc",
    "px",
    // font-relative length units https://drafts.csswg.org/css-values-4/#font-relative-lengths
    "em",
    "rem",
    "ex",
    "rex",
    "cap",
    "rcap",
    "ch",
    "rch",
    "ic",
    "ric",
    "lh",
    "rlh",
    // viewport-percentage lengths https://drafts.csswg.org/css-values-4/#viewport-relative-lengths
    "vw",
    "svw",
    "lvw",
    "dvw",
    "vh",
    "svh",
    "lvh",
    "dvh",
    "vi",
    "svi",
    "lvi",
    "dvi",
    "vb",
    "svb",
    "lvb",
    "dvb",
    "vmin",
    "svmin",
    "lvmin",
    "dvmin",
    "vmax",
    "svmax",
    "lvmax",
    "dvmax",
    // container relative lengths https://drafts.csswg.org/css-contain-3/#container-lengths
    "cqw",
    "cqh",
    "cqi",
    "cqb",
    "cqmin",
    "cqmax"
  ];
  var angle = ["deg", "grad", "rad", "turn"];
  var time = ["s", "ms"];
  var frequency = ["hz", "khz"];
  var resolution = ["dpi", "dpcm", "dppx", "x"];
  var flex = ["fr"];
  var decibel = ["db"];
  var semitones = ["st"];

  // ../../engine-v2/node_modules/css-tree/lib/definition-syntax/SyntaxError.js
  function SyntaxError3(message, input, offset) {
    return Object.assign(createCustomError("SyntaxError", message), {
      input,
      offset,
      rawMessage: message,
      message: message + "\n  " + input + "\n--" + new Array((offset || input.length) + 1).join("-") + "^"
    });
  }

  // ../../engine-v2/node_modules/css-tree/lib/definition-syntax/scanner.js
  var TAB = 9;
  var N3 = 10;
  var F2 = 12;
  var R2 = 13;
  var SPACE = 32;
  var NAME_CHAR = new Uint8Array(128).map(
    (_, idx) => /[a-zA-Z0-9\-]/.test(String.fromCharCode(idx)) ? 1 : 0
  );
  var Scanner = class {
    constructor(str) {
      this.str = str;
      this.pos = 0;
    }
    charCodeAt(pos) {
      return pos < this.str.length ? this.str.charCodeAt(pos) : 0;
    }
    charCode() {
      return this.charCodeAt(this.pos);
    }
    isNameCharCode(code2 = this.charCode()) {
      return code2 < 128 && NAME_CHAR[code2] === 1;
    }
    nextCharCode() {
      return this.charCodeAt(this.pos + 1);
    }
    nextNonWsCode(pos) {
      return this.charCodeAt(this.findWsEnd(pos));
    }
    skipWs() {
      this.pos = this.findWsEnd(this.pos);
    }
    findWsEnd(pos) {
      for (; pos < this.str.length; pos++) {
        const code2 = this.str.charCodeAt(pos);
        if (code2 !== R2 && code2 !== N3 && code2 !== F2 && code2 !== SPACE && code2 !== TAB) {
          break;
        }
      }
      return pos;
    }
    substringToPos(end) {
      return this.str.substring(this.pos, this.pos = end);
    }
    eat(code2) {
      if (this.charCode() !== code2) {
        this.error("Expect `" + String.fromCharCode(code2) + "`");
      }
      this.pos++;
    }
    peek() {
      return this.pos < this.str.length ? this.str.charAt(this.pos++) : "";
    }
    error(message) {
      throw new SyntaxError3(message, this.str, this.pos);
    }
    scanSpaces() {
      return this.substringToPos(this.findWsEnd(this.pos));
    }
    scanWord() {
      let end = this.pos;
      for (; end < this.str.length; end++) {
        const code2 = this.str.charCodeAt(end);
        if (code2 >= 128 || NAME_CHAR[code2] === 0) {
          break;
        }
      }
      if (this.pos === end) {
        this.error("Expect a keyword");
      }
      return this.substringToPos(end);
    }
    scanNumber() {
      let end = this.pos;
      for (; end < this.str.length; end++) {
        const code2 = this.str.charCodeAt(end);
        if (code2 < 48 || code2 > 57) {
          break;
        }
      }
      if (this.pos === end) {
        this.error("Expect a number");
      }
      return this.substringToPos(end);
    }
    scanString() {
      const end = this.str.indexOf("'", this.pos + 1);
      if (end === -1) {
        this.pos = this.str.length;
        this.error("Expect an apostrophe");
      }
      return this.substringToPos(end + 1);
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/definition-syntax/parse.js
  var TAB2 = 9;
  var N4 = 10;
  var F3 = 12;
  var R3 = 13;
  var SPACE2 = 32;
  var EXCLAMATIONMARK2 = 33;
  var NUMBERSIGN2 = 35;
  var AMPERSAND = 38;
  var APOSTROPHE = 39;
  var LEFTPARENTHESIS = 40;
  var RIGHTPARENTHESIS = 41;
  var ASTERISK = 42;
  var PLUSSIGN4 = 43;
  var COMMA = 44;
  var HYPERMINUS = 45;
  var LESSTHANSIGN = 60;
  var GREATERTHANSIGN = 62;
  var QUESTIONMARK2 = 63;
  var COMMERCIALAT = 64;
  var LEFTSQUAREBRACKET = 91;
  var RIGHTSQUAREBRACKET = 93;
  var LEFTCURLYBRACKET2 = 123;
  var VERTICALLINE = 124;
  var RIGHTCURLYBRACKET = 125;
  var INFINITY = 8734;
  var COMBINATOR_PRECEDENCE = {
    " ": 1,
    "&&": 2,
    "||": 3,
    "|": 4
  };
  function readMultiplierRange(scanner) {
    let min = null;
    let max = null;
    scanner.eat(LEFTCURLYBRACKET2);
    scanner.skipWs();
    min = scanner.scanNumber(scanner);
    scanner.skipWs();
    if (scanner.charCode() === COMMA) {
      scanner.pos++;
      scanner.skipWs();
      if (scanner.charCode() !== RIGHTCURLYBRACKET) {
        max = scanner.scanNumber(scanner);
        scanner.skipWs();
      }
    } else {
      max = min;
    }
    scanner.eat(RIGHTCURLYBRACKET);
    return {
      min: Number(min),
      max: max ? Number(max) : 0
    };
  }
  function readMultiplier(scanner) {
    let range = null;
    let comma = false;
    switch (scanner.charCode()) {
      case ASTERISK:
        scanner.pos++;
        range = {
          min: 0,
          max: 0
        };
        break;
      case PLUSSIGN4:
        scanner.pos++;
        range = {
          min: 1,
          max: 0
        };
        break;
      case QUESTIONMARK2:
        scanner.pos++;
        range = {
          min: 0,
          max: 1
        };
        break;
      case NUMBERSIGN2:
        scanner.pos++;
        comma = true;
        if (scanner.charCode() === LEFTCURLYBRACKET2) {
          range = readMultiplierRange(scanner);
        } else if (scanner.charCode() === QUESTIONMARK2) {
          scanner.pos++;
          range = {
            min: 0,
            max: 0
          };
        } else {
          range = {
            min: 1,
            max: 0
          };
        }
        break;
      case LEFTCURLYBRACKET2:
        range = readMultiplierRange(scanner);
        break;
      default:
        return null;
    }
    return {
      type: "Multiplier",
      comma,
      min: range.min,
      max: range.max,
      term: null
    };
  }
  function maybeMultiplied(scanner, node) {
    const multiplier = readMultiplier(scanner);
    if (multiplier !== null) {
      multiplier.term = node;
      if (scanner.charCode() === NUMBERSIGN2 && scanner.charCodeAt(scanner.pos - 1) === PLUSSIGN4) {
        return maybeMultiplied(scanner, multiplier);
      }
      if (scanner.charCode() === QUESTIONMARK2 && scanner.charCodeAt(scanner.pos - 1) === RIGHTCURLYBRACKET) {
        return maybeMultiplied(scanner, multiplier);
      }
      return multiplier;
    }
    return node;
  }
  function maybeToken(scanner) {
    const ch = scanner.peek();
    if (ch === "") {
      return null;
    }
    return maybeMultiplied(scanner, {
      type: "Token",
      value: ch
    });
  }
  function readProperty(scanner) {
    let name50;
    scanner.eat(LESSTHANSIGN);
    scanner.eat(APOSTROPHE);
    name50 = scanner.scanWord();
    scanner.eat(APOSTROPHE);
    scanner.eat(GREATERTHANSIGN);
    return maybeMultiplied(scanner, {
      type: "Property",
      name: name50
    });
  }
  function readTypeRange(scanner) {
    let min = null;
    let max = null;
    let sign = 1;
    scanner.eat(LEFTSQUAREBRACKET);
    if (scanner.charCode() === HYPERMINUS) {
      scanner.peek();
      sign = -1;
    }
    if (sign == -1 && scanner.charCode() === INFINITY) {
      scanner.peek();
    } else {
      min = sign * Number(scanner.scanNumber(scanner));
      if (scanner.isNameCharCode()) {
        min += scanner.scanWord();
      }
    }
    scanner.skipWs();
    scanner.eat(COMMA);
    scanner.skipWs();
    if (scanner.charCode() === INFINITY) {
      scanner.peek();
    } else {
      sign = 1;
      if (scanner.charCode() === HYPERMINUS) {
        scanner.peek();
        sign = -1;
      }
      max = sign * Number(scanner.scanNumber(scanner));
      if (scanner.isNameCharCode()) {
        max += scanner.scanWord();
      }
    }
    scanner.eat(RIGHTSQUAREBRACKET);
    return {
      type: "Range",
      min,
      max
    };
  }
  function readType(scanner) {
    let name50;
    let opts = null;
    scanner.eat(LESSTHANSIGN);
    name50 = scanner.scanWord();
    if (name50 === "boolean-expr") {
      scanner.eat(LEFTSQUAREBRACKET);
      const implicitGroup = readImplicitGroup(scanner, RIGHTSQUAREBRACKET);
      scanner.eat(RIGHTSQUAREBRACKET);
      scanner.eat(GREATERTHANSIGN);
      return maybeMultiplied(scanner, {
        type: "Boolean",
        term: implicitGroup.terms.length === 1 ? implicitGroup.terms[0] : implicitGroup
      });
    }
    if (scanner.charCode() === LEFTPARENTHESIS && scanner.nextCharCode() === RIGHTPARENTHESIS) {
      scanner.pos += 2;
      name50 += "()";
    }
    if (scanner.charCodeAt(scanner.findWsEnd(scanner.pos)) === LEFTSQUAREBRACKET) {
      scanner.skipWs();
      opts = readTypeRange(scanner);
    }
    scanner.eat(GREATERTHANSIGN);
    return maybeMultiplied(scanner, {
      type: "Type",
      name: name50,
      opts
    });
  }
  function readKeywordOrFunction(scanner) {
    const name50 = scanner.scanWord();
    if (scanner.charCode() === LEFTPARENTHESIS) {
      scanner.pos++;
      return {
        type: "Function",
        name: name50
      };
    }
    return maybeMultiplied(scanner, {
      type: "Keyword",
      name: name50
    });
  }
  function regroupTerms(terms, combinators) {
    function createGroup(terms2, combinator2) {
      return {
        type: "Group",
        terms: terms2,
        combinator: combinator2,
        disallowEmpty: false,
        explicit: false
      };
    }
    let combinator;
    combinators = Object.keys(combinators).sort((a, b) => COMBINATOR_PRECEDENCE[a] - COMBINATOR_PRECEDENCE[b]);
    while (combinators.length > 0) {
      combinator = combinators.shift();
      let i = 0;
      let subgroupStart = 0;
      for (; i < terms.length; i++) {
        const term = terms[i];
        if (term.type === "Combinator") {
          if (term.value === combinator) {
            if (subgroupStart === -1) {
              subgroupStart = i - 1;
            }
            terms.splice(i, 1);
            i--;
          } else {
            if (subgroupStart !== -1 && i - subgroupStart > 1) {
              terms.splice(
                subgroupStart,
                i - subgroupStart,
                createGroup(terms.slice(subgroupStart, i), combinator)
              );
              i = subgroupStart + 1;
            }
            subgroupStart = -1;
          }
        }
      }
      if (subgroupStart !== -1 && combinators.length) {
        terms.splice(
          subgroupStart,
          i - subgroupStart,
          createGroup(terms.slice(subgroupStart, i), combinator)
        );
      }
    }
    return combinator;
  }
  function readImplicitGroup(scanner, stopCharCode = -1) {
    const combinators = /* @__PURE__ */ Object.create(null);
    const terms = [];
    let prevToken = null;
    let prevTokenPos = scanner.pos;
    let prevTokenIsFunction = false;
    while (scanner.charCode() !== stopCharCode) {
      let token = prevTokenIsFunction ? readImplicitGroup(scanner, RIGHTPARENTHESIS) : peek(scanner);
      if (!token) {
        break;
      }
      if (token.type === "Spaces") {
        continue;
      }
      if (prevTokenIsFunction) {
        if (token.terms.length === 0) {
          prevTokenIsFunction = false;
          continue;
        }
        if (token.combinator === " ") {
          while (token.terms.length > 1) {
            combinators[" "] = true;
            terms.push({
              type: "Combinator",
              value: " "
            }, token.terms.shift());
          }
          token = token.terms[0];
        }
      }
      if (token.type === "Combinator") {
        if (prevToken === null || prevToken.type === "Combinator") {
          scanner.pos = prevTokenPos;
          scanner.error("Unexpected combinator");
        }
        combinators[token.value] = true;
      } else if (prevToken !== null && prevToken.type !== "Combinator") {
        combinators[" "] = true;
        terms.push({
          type: "Combinator",
          value: " "
        });
      }
      terms.push(token);
      prevToken = token;
      prevTokenPos = scanner.pos;
      prevTokenIsFunction = token.type === "Function";
    }
    if (prevToken !== null && prevToken.type === "Combinator") {
      scanner.pos -= prevTokenPos;
      scanner.error("Unexpected combinator");
    }
    return {
      type: "Group",
      terms,
      combinator: regroupTerms(terms, combinators) || " ",
      disallowEmpty: false,
      explicit: false
    };
  }
  function readGroup(scanner) {
    let result;
    scanner.eat(LEFTSQUAREBRACKET);
    result = readImplicitGroup(scanner, RIGHTSQUAREBRACKET);
    scanner.eat(RIGHTSQUAREBRACKET);
    result.explicit = true;
    if (scanner.charCode() === EXCLAMATIONMARK2) {
      scanner.pos++;
      result.disallowEmpty = true;
    }
    return result;
  }
  function peek(scanner) {
    let code2 = scanner.charCode();
    switch (code2) {
      case RIGHTSQUAREBRACKET:
        break;
      case LEFTSQUAREBRACKET:
        return maybeMultiplied(scanner, readGroup(scanner));
      case LESSTHANSIGN:
        return scanner.nextCharCode() === APOSTROPHE ? readProperty(scanner) : readType(scanner);
      case VERTICALLINE:
        return {
          type: "Combinator",
          value: scanner.substringToPos(
            scanner.pos + (scanner.nextCharCode() === VERTICALLINE ? 2 : 1)
          )
        };
      case AMPERSAND:
        scanner.pos++;
        scanner.eat(AMPERSAND);
        return {
          type: "Combinator",
          value: "&&"
        };
      case COMMA:
        scanner.pos++;
        return {
          type: "Comma"
        };
      case APOSTROPHE:
        return maybeMultiplied(scanner, {
          type: "String",
          value: scanner.scanString()
        });
      case SPACE2:
      case TAB2:
      case N4:
      case R3:
      case F3:
        return {
          type: "Spaces",
          value: scanner.scanSpaces()
        };
      case COMMERCIALAT:
        code2 = scanner.nextCharCode();
        if (scanner.isNameCharCode(code2)) {
          scanner.pos++;
          return {
            type: "AtKeyword",
            name: scanner.scanWord()
          };
        }
        return maybeToken(scanner);
      case ASTERISK:
      case PLUSSIGN4:
      case QUESTIONMARK2:
      case NUMBERSIGN2:
      case EXCLAMATIONMARK2:
        break;
      case LEFTCURLYBRACKET2:
        code2 = scanner.nextCharCode();
        if (code2 < 48 || code2 > 57) {
          return maybeToken(scanner);
        }
        break;
      default:
        if (scanner.isNameCharCode(code2)) {
          return readKeywordOrFunction(scanner);
        }
        return maybeToken(scanner);
    }
  }
  function parse(source) {
    const scanner = new Scanner(source);
    const result = readImplicitGroup(scanner);
    if (scanner.pos !== source.length) {
      scanner.error("Unexpected input");
    }
    if (result.terms.length === 1 && result.terms[0].type === "Group") {
      return result.terms[0];
    }
    return result;
  }

  // ../../engine-v2/node_modules/css-tree/lib/definition-syntax/walk.js
  var noop3 = function() {
  };
  function ensureFunction2(value) {
    return typeof value === "function" ? value : noop3;
  }
  function walk(node, options, context) {
    function walk3(node2) {
      enter.call(context, node2);
      switch (node2.type) {
        case "Group":
          node2.terms.forEach(walk3);
          break;
        case "Multiplier":
        case "Boolean":
          walk3(node2.term);
          break;
        case "Type":
        case "Property":
        case "Keyword":
        case "AtKeyword":
        case "Function":
        case "String":
        case "Token":
        case "Comma":
          break;
        default:
          throw new Error("Unknown type: " + node2.type);
      }
      leave.call(context, node2);
    }
    let enter = noop3;
    let leave = noop3;
    if (typeof options === "function") {
      enter = options;
    } else if (options) {
      enter = ensureFunction2(options.enter);
      leave = ensureFunction2(options.leave);
    }
    if (enter === noop3 && leave === noop3) {
      throw new Error("Neither `enter` nor `leave` walker handler is set or both aren't a function");
    }
    walk3(node, context);
  }

  // ../../engine-v2/node_modules/css-tree/lib/lexer/prepare-tokens.js
  var astToTokens = {
    decorator(handlers) {
      const tokens = [];
      let curNode = null;
      return {
        ...handlers,
        node(node) {
          const tmp = curNode;
          curNode = node;
          handlers.node.call(this, node);
          curNode = tmp;
        },
        emit(value, type, auto) {
          tokens.push({
            type,
            value,
            node: auto ? null : curNode
          });
        },
        result() {
          return tokens;
        }
      };
    }
  };
  function stringToTokens(str) {
    const tokens = [];
    tokenize(
      str,
      (type, start, end) => tokens.push({
        type,
        value: str.slice(start, end),
        node: null
      })
    );
    return tokens;
  }
  function prepare_tokens_default(value, syntax) {
    if (typeof value === "string") {
      return stringToTokens(value);
    }
    return syntax.generate(value, astToTokens);
  }

  // ../../engine-v2/node_modules/css-tree/lib/lexer/match-graph.js
  var MATCH = { type: "Match" };
  var MISMATCH = { type: "Mismatch" };
  var DISALLOW_EMPTY = { type: "DisallowEmpty" };
  var LEFTPARENTHESIS2 = 40;
  var RIGHTPARENTHESIS2 = 41;
  function createCondition(match, thenBranch, elseBranch) {
    if (thenBranch === MATCH && elseBranch === MISMATCH) {
      return match;
    }
    if (match === MATCH && thenBranch === MATCH && elseBranch === MATCH) {
      return match;
    }
    if (match.type === "If" && match.else === MISMATCH && thenBranch === MATCH) {
      thenBranch = match.then;
      match = match.match;
    }
    return {
      type: "If",
      match,
      then: thenBranch,
      else: elseBranch
    };
  }
  function isFunctionType(name50) {
    return name50.length > 2 && name50.charCodeAt(name50.length - 2) === LEFTPARENTHESIS2 && name50.charCodeAt(name50.length - 1) === RIGHTPARENTHESIS2;
  }
  function isEnumCapatible(term) {
    return term.type === "Keyword" || term.type === "AtKeyword" || term.type === "Function" || term.type === "Type" && isFunctionType(term.name);
  }
  function groupNode(terms, combinator = " ", explicit = false) {
    return {
      type: "Group",
      terms,
      combinator,
      disallowEmpty: false,
      explicit
    };
  }
  function replaceTypeInGraph(node, replacements, visited = /* @__PURE__ */ new Set()) {
    if (!visited.has(node)) {
      visited.add(node);
      switch (node.type) {
        case "If":
          node.match = replaceTypeInGraph(node.match, replacements, visited);
          node.then = replaceTypeInGraph(node.then, replacements, visited);
          node.else = replaceTypeInGraph(node.else, replacements, visited);
          break;
        case "Type":
          return replacements[node.name] || node;
      }
    }
    return node;
  }
  function buildGroupMatchGraph(combinator, terms, atLeastOneTermMatched) {
    switch (combinator) {
      case " ": {
        let result = MATCH;
        for (let i = terms.length - 1; i >= 0; i--) {
          const term = terms[i];
          result = createCondition(
            term,
            result,
            MISMATCH
          );
        }
        ;
        return result;
      }
      case "|": {
        let result = MISMATCH;
        let map = null;
        for (let i = terms.length - 1; i >= 0; i--) {
          let term = terms[i];
          if (isEnumCapatible(term)) {
            if (map === null && i > 0 && isEnumCapatible(terms[i - 1])) {
              map = /* @__PURE__ */ Object.create(null);
              result = createCondition(
                {
                  type: "Enum",
                  map
                },
                MATCH,
                result
              );
            }
            if (map !== null) {
              const key = (isFunctionType(term.name) ? term.name.slice(0, -1) : term.name).toLowerCase();
              if (key in map === false) {
                map[key] = term;
                continue;
              }
            }
          }
          map = null;
          result = createCondition(
            term,
            MATCH,
            result
          );
        }
        ;
        return result;
      }
      case "&&": {
        if (terms.length > 5) {
          return {
            type: "MatchOnce",
            terms,
            all: true
          };
        }
        let result = MISMATCH;
        for (let i = terms.length - 1; i >= 0; i--) {
          const term = terms[i];
          let thenClause;
          if (terms.length > 1) {
            thenClause = buildGroupMatchGraph(
              combinator,
              terms.filter(function(newGroupTerm) {
                return newGroupTerm !== term;
              }),
              false
            );
          } else {
            thenClause = MATCH;
          }
          result = createCondition(
            term,
            thenClause,
            result
          );
        }
        ;
        return result;
      }
      case "||": {
        if (terms.length > 5) {
          return {
            type: "MatchOnce",
            terms,
            all: false
          };
        }
        let result = atLeastOneTermMatched ? MATCH : MISMATCH;
        for (let i = terms.length - 1; i >= 0; i--) {
          const term = terms[i];
          let thenClause;
          if (terms.length > 1) {
            thenClause = buildGroupMatchGraph(
              combinator,
              terms.filter(function(newGroupTerm) {
                return newGroupTerm !== term;
              }),
              true
            );
          } else {
            thenClause = MATCH;
          }
          result = createCondition(
            term,
            thenClause,
            result
          );
        }
        ;
        return result;
      }
    }
  }
  function buildMultiplierMatchGraph(node) {
    let result = MATCH;
    let matchTerm = buildMatchGraphInternal(node.term);
    if (node.max === 0) {
      matchTerm = createCondition(
        matchTerm,
        DISALLOW_EMPTY,
        MISMATCH
      );
      result = createCondition(
        matchTerm,
        null,
        // will be a loop
        MISMATCH
      );
      result.then = createCondition(
        MATCH,
        MATCH,
        result
        // make a loop
      );
      if (node.comma) {
        result.then.else = createCondition(
          { type: "Comma", syntax: node },
          result,
          MISMATCH
        );
      }
    } else {
      for (let i = node.min || 1; i <= node.max; i++) {
        if (node.comma && result !== MATCH) {
          result = createCondition(
            { type: "Comma", syntax: node },
            result,
            MISMATCH
          );
        }
        result = createCondition(
          matchTerm,
          createCondition(
            MATCH,
            MATCH,
            result
          ),
          MISMATCH
        );
      }
    }
    if (node.min === 0) {
      result = createCondition(
        MATCH,
        MATCH,
        result
      );
    } else {
      for (let i = 0; i < node.min - 1; i++) {
        if (node.comma && result !== MATCH) {
          result = createCondition(
            { type: "Comma", syntax: node },
            result,
            MISMATCH
          );
        }
        result = createCondition(
          matchTerm,
          result,
          MISMATCH
        );
      }
    }
    return result;
  }
  function buildMatchGraphInternal(node) {
    if (typeof node === "function") {
      return {
        type: "Generic",
        fn: node
      };
    }
    switch (node.type) {
      case "Group": {
        let result = buildGroupMatchGraph(
          node.combinator,
          node.terms.map(buildMatchGraphInternal),
          false
        );
        if (node.disallowEmpty) {
          result = createCondition(
            result,
            DISALLOW_EMPTY,
            MISMATCH
          );
        }
        return result;
      }
      case "Multiplier":
        return buildMultiplierMatchGraph(node);
      // https://drafts.csswg.org/css-values-5/#boolean
      case "Boolean": {
        const term = buildMatchGraphInternal(node.term);
        const matchNode = buildMatchGraphInternal(groupNode([
          groupNode([
            { type: "Keyword", name: "not" },
            { type: "Type", name: "!boolean-group" }
          ]),
          groupNode([
            { type: "Type", name: "!boolean-group" },
            groupNode([
              { type: "Multiplier", comma: false, min: 0, max: 0, term: groupNode([
                { type: "Keyword", name: "and" },
                { type: "Type", name: "!boolean-group" }
              ]) },
              { type: "Multiplier", comma: false, min: 0, max: 0, term: groupNode([
                { type: "Keyword", name: "or" },
                { type: "Type", name: "!boolean-group" }
              ]) }
            ], "|")
          ])
        ], "|"));
        const booleanGroup = buildMatchGraphInternal(
          groupNode([
            { type: "Type", name: "!term" },
            groupNode([
              { type: "Token", value: "(" },
              { type: "Type", name: "!self" },
              { type: "Token", value: ")" }
            ]),
            { type: "Type", name: "general-enclosed" }
          ], "|")
        );
        replaceTypeInGraph(booleanGroup, { "!term": term, "!self": matchNode });
        replaceTypeInGraph(matchNode, { "!boolean-group": booleanGroup });
        return matchNode;
      }
      case "Type":
      case "Property":
        return {
          type: node.type,
          name: node.name,
          syntax: node
        };
      case "Keyword":
        return {
          type: node.type,
          name: node.name.toLowerCase(),
          syntax: node
        };
      case "AtKeyword":
        return {
          type: node.type,
          name: "@" + node.name.toLowerCase(),
          syntax: node
        };
      case "Function":
        return {
          type: node.type,
          name: node.name.toLowerCase() + "(",
          syntax: node
        };
      case "String":
        if (node.value.length === 3) {
          return {
            type: "Token",
            value: node.value.charAt(1),
            syntax: node
          };
        }
        return {
          type: node.type,
          value: node.value.substr(1, node.value.length - 2).replace(/\\'/g, "'"),
          syntax: node
        };
      case "Token":
        return {
          type: node.type,
          value: node.value,
          syntax: node
        };
      case "Comma":
        return {
          type: node.type,
          syntax: node
        };
      default:
        throw new Error("Unknown node type:", node.type);
    }
  }
  function buildMatchGraph(syntaxTree, ref) {
    if (typeof syntaxTree === "string") {
      syntaxTree = parse(syntaxTree);
    }
    return {
      type: "MatchGraph",
      match: buildMatchGraphInternal(syntaxTree),
      syntax: ref || null,
      source: syntaxTree
    };
  }

  // ../../engine-v2/node_modules/css-tree/lib/lexer/match.js
  var { hasOwnProperty: hasOwnProperty3 } = Object.prototype;
  var STUB = 0;
  var TOKEN = 1;
  var OPEN_SYNTAX = 2;
  var CLOSE_SYNTAX = 3;
  var EXIT_REASON_MATCH = "Match";
  var EXIT_REASON_MISMATCH = "Mismatch";
  var EXIT_REASON_ITERATION_LIMIT = "Maximum iteration number exceeded (please fill an issue on https://github.com/csstree/csstree/issues)";
  var ITERATION_LIMIT = 15e3;
  var totalIterationCount = 0;
  function reverseList(list2) {
    let prev = null;
    let next = null;
    let item = list2;
    while (item !== null) {
      next = item.prev;
      item.prev = prev;
      prev = item;
      item = next;
    }
    return prev;
  }
  function areStringsEqualCaseInsensitive(testStr, referenceStr) {
    if (testStr.length !== referenceStr.length) {
      return false;
    }
    for (let i = 0; i < testStr.length; i++) {
      const referenceCode = referenceStr.charCodeAt(i);
      let testCode = testStr.charCodeAt(i);
      if (testCode >= 65 && testCode <= 90) {
        testCode = testCode | 32;
      }
      if (testCode !== referenceCode) {
        return false;
      }
    }
    return true;
  }
  function isContextEdgeDelim(token) {
    if (token.type !== Delim) {
      return false;
    }
    return token.value !== "?";
  }
  function isCommaContextStart(token) {
    if (token === null) {
      return true;
    }
    return token.type === Comma || token.type === Function || token.type === LeftParenthesis || token.type === LeftSquareBracket || token.type === LeftCurlyBracket || isContextEdgeDelim(token);
  }
  function isCommaContextEnd(token) {
    if (token === null) {
      return true;
    }
    return token.type === RightParenthesis || token.type === RightSquareBracket || token.type === RightCurlyBracket || token.type === Delim && token.value === "/";
  }
  function internalMatch(tokens, state, syntaxes) {
    function moveToNextToken() {
      do {
        tokenIndex++;
        token = tokenIndex < tokens.length ? tokens[tokenIndex] : null;
      } while (token !== null && (token.type === WhiteSpace || token.type === Comment));
    }
    function getNextToken(offset) {
      const nextIndex = tokenIndex + offset;
      return nextIndex < tokens.length ? tokens[nextIndex] : null;
    }
    function stateSnapshotFromSyntax(nextState, prev) {
      return {
        nextState,
        matchStack,
        syntaxStack,
        thenStack,
        tokenIndex,
        prev
      };
    }
    function pushThenStack(nextState) {
      thenStack = {
        nextState,
        matchStack,
        syntaxStack,
        prev: thenStack
      };
    }
    function pushElseStack(nextState) {
      elseStack = stateSnapshotFromSyntax(nextState, elseStack);
    }
    function addTokenToMatch() {
      matchStack = {
        type: TOKEN,
        syntax: state.syntax,
        token,
        prev: matchStack
      };
      moveToNextToken();
      syntaxStash = null;
      if (tokenIndex > longestMatch) {
        longestMatch = tokenIndex;
      }
    }
    function openSyntax() {
      syntaxStack = {
        syntax: state.syntax,
        opts: state.syntax.opts || syntaxStack !== null && syntaxStack.opts || null,
        prev: syntaxStack
      };
      matchStack = {
        type: OPEN_SYNTAX,
        syntax: state.syntax,
        token: matchStack.token,
        prev: matchStack
      };
    }
    function closeSyntax() {
      if (matchStack.type === OPEN_SYNTAX) {
        matchStack = matchStack.prev;
      } else {
        matchStack = {
          type: CLOSE_SYNTAX,
          syntax: syntaxStack.syntax,
          token: matchStack.token,
          prev: matchStack
        };
      }
      syntaxStack = syntaxStack.prev;
    }
    let syntaxStack = null;
    let thenStack = null;
    let elseStack = null;
    let syntaxStash = null;
    let iterationCount = 0;
    let exitReason = null;
    let token = null;
    let tokenIndex = -1;
    let longestMatch = 0;
    let matchStack = {
      type: STUB,
      syntax: null,
      token: null,
      prev: null
    };
    moveToNextToken();
    while (exitReason === null && ++iterationCount < ITERATION_LIMIT) {
      switch (state.type) {
        case "Match":
          if (thenStack === null) {
            if (token !== null) {
              if (tokenIndex !== tokens.length - 1 || token.value !== "\\0" && token.value !== "\\9") {
                state = MISMATCH;
                break;
              }
            }
            exitReason = EXIT_REASON_MATCH;
            break;
          }
          state = thenStack.nextState;
          if (state === DISALLOW_EMPTY) {
            if (thenStack.matchStack === matchStack) {
              state = MISMATCH;
              break;
            } else {
              state = MATCH;
            }
          }
          while (thenStack.syntaxStack !== syntaxStack) {
            closeSyntax();
          }
          thenStack = thenStack.prev;
          break;
        case "Mismatch":
          if (syntaxStash !== null && syntaxStash !== false) {
            if (elseStack === null || tokenIndex > elseStack.tokenIndex) {
              elseStack = syntaxStash;
              syntaxStash = false;
            }
          } else if (elseStack === null) {
            exitReason = EXIT_REASON_MISMATCH;
            break;
          }
          state = elseStack.nextState;
          thenStack = elseStack.thenStack;
          syntaxStack = elseStack.syntaxStack;
          matchStack = elseStack.matchStack;
          tokenIndex = elseStack.tokenIndex;
          token = tokenIndex < tokens.length ? tokens[tokenIndex] : null;
          elseStack = elseStack.prev;
          break;
        case "MatchGraph":
          state = state.match;
          break;
        case "If":
          if (state.else !== MISMATCH) {
            pushElseStack(state.else);
          }
          if (state.then !== MATCH) {
            pushThenStack(state.then);
          }
          state = state.match;
          break;
        case "MatchOnce":
          state = {
            type: "MatchOnceBuffer",
            syntax: state,
            index: 0,
            mask: 0
          };
          break;
        case "MatchOnceBuffer": {
          const terms = state.syntax.terms;
          if (state.index === terms.length) {
            if (state.mask === 0 || state.syntax.all) {
              state = MISMATCH;
              break;
            }
            state = MATCH;
            break;
          }
          if (state.mask === (1 << terms.length) - 1) {
            state = MATCH;
            break;
          }
          for (; state.index < terms.length; state.index++) {
            const matchFlag = 1 << state.index;
            if ((state.mask & matchFlag) === 0) {
              pushElseStack(state);
              pushThenStack({
                type: "AddMatchOnce",
                syntax: state.syntax,
                mask: state.mask | matchFlag
              });
              state = terms[state.index++];
              break;
            }
          }
          break;
        }
        case "AddMatchOnce":
          state = {
            type: "MatchOnceBuffer",
            syntax: state.syntax,
            index: 0,
            mask: state.mask
          };
          break;
        case "Enum":
          if (token !== null) {
            let name50 = token.value.toLowerCase();
            if (name50.indexOf("\\") !== -1) {
              name50 = name50.replace(/\\[09].*$/, "");
            }
            if (hasOwnProperty3.call(state.map, name50)) {
              state = state.map[name50];
              break;
            }
          }
          state = MISMATCH;
          break;
        case "Generic": {
          const opts = syntaxStack !== null ? syntaxStack.opts : null;
          const lastTokenIndex2 = tokenIndex + Math.floor(state.fn(token, getNextToken, opts));
          if (!isNaN(lastTokenIndex2) && lastTokenIndex2 > tokenIndex) {
            while (tokenIndex < lastTokenIndex2) {
              addTokenToMatch();
            }
            state = MATCH;
          } else {
            state = MISMATCH;
          }
          break;
        }
        case "Type":
        case "Property": {
          const syntaxDict = state.type === "Type" ? "types" : "properties";
          const dictSyntax = hasOwnProperty3.call(syntaxes, syntaxDict) ? syntaxes[syntaxDict][state.name] : null;
          if (!dictSyntax || !dictSyntax.match) {
            throw new Error(
              "Bad syntax reference: " + (state.type === "Type" ? "<" + state.name + ">" : "<'" + state.name + "'>")
            );
          }
          if (syntaxStash !== false && token !== null && state.type === "Type") {
            const lowPriorityMatching = (
              // https://drafts.csswg.org/css-values-4/#custom-idents
              // When parsing positionally-ambiguous keywords in a property value, a <custom-ident> production
              // can only claim the keyword if no other unfulfilled production can claim it.
              state.name === "custom-ident" && token.type === Ident || // https://drafts.csswg.org/css-values-4/#lengths
              // ... if a `0` could be parsed as either a <number> or a <length> in a property (such as line-height),
              // it must parse as a <number>
              state.name === "length" && token.value === "0"
            );
            if (lowPriorityMatching) {
              if (syntaxStash === null) {
                syntaxStash = stateSnapshotFromSyntax(state, elseStack);
              }
              state = MISMATCH;
              break;
            }
          }
          openSyntax();
          state = dictSyntax.matchRef || dictSyntax.match;
          break;
        }
        case "Keyword": {
          const name50 = state.name;
          if (token !== null) {
            let keywordName = token.value;
            if (keywordName.indexOf("\\") !== -1) {
              keywordName = keywordName.replace(/\\[09].*$/, "");
            }
            if (areStringsEqualCaseInsensitive(keywordName, name50)) {
              addTokenToMatch();
              state = MATCH;
              break;
            }
          }
          state = MISMATCH;
          break;
        }
        case "AtKeyword":
        case "Function":
          if (token !== null && areStringsEqualCaseInsensitive(token.value, state.name)) {
            addTokenToMatch();
            state = MATCH;
            break;
          }
          state = MISMATCH;
          break;
        case "Token":
          if (token !== null && token.value === state.value) {
            addTokenToMatch();
            state = MATCH;
            break;
          }
          state = MISMATCH;
          break;
        case "Comma":
          if (token !== null && token.type === Comma) {
            if (isCommaContextStart(matchStack.token)) {
              state = MISMATCH;
            } else {
              addTokenToMatch();
              state = isCommaContextEnd(token) ? MISMATCH : MATCH;
            }
          } else {
            state = isCommaContextStart(matchStack.token) || isCommaContextEnd(token) ? MATCH : MISMATCH;
          }
          break;
        case "String":
          let string = "";
          let lastTokenIndex = tokenIndex;
          for (; lastTokenIndex < tokens.length && string.length < state.value.length; lastTokenIndex++) {
            string += tokens[lastTokenIndex].value;
          }
          if (areStringsEqualCaseInsensitive(string, state.value)) {
            while (tokenIndex < lastTokenIndex) {
              addTokenToMatch();
            }
            state = MATCH;
          } else {
            state = MISMATCH;
          }
          break;
        default:
          throw new Error("Unknown node type: " + state.type);
      }
    }
    totalIterationCount += iterationCount;
    switch (exitReason) {
      case null:
        console.warn("[csstree-match] BREAK after " + ITERATION_LIMIT + " iterations");
        exitReason = EXIT_REASON_ITERATION_LIMIT;
        matchStack = null;
        break;
      case EXIT_REASON_MATCH:
        while (syntaxStack !== null) {
          closeSyntax();
        }
        break;
      default:
        matchStack = null;
    }
    return {
      tokens,
      reason: exitReason,
      iterations: iterationCount,
      match: matchStack,
      longestMatch
    };
  }
  function matchAsTree(tokens, matchGraph, syntaxes) {
    const matchResult = internalMatch(tokens, matchGraph, syntaxes || {});
    if (matchResult.match === null) {
      return matchResult;
    }
    let item = matchResult.match;
    let host = matchResult.match = {
      syntax: matchGraph.syntax || null,
      match: []
    };
    const hostStack = [host];
    item = reverseList(item).prev;
    while (item !== null) {
      switch (item.type) {
        case OPEN_SYNTAX:
          host.match.push(host = {
            syntax: item.syntax,
            match: []
          });
          hostStack.push(host);
          break;
        case CLOSE_SYNTAX:
          hostStack.pop();
          host = hostStack[hostStack.length - 1];
          break;
        default:
          host.match.push({
            syntax: item.syntax || null,
            token: item.token.value,
            node: item.token.node
          });
      }
      item = item.prev;
    }
    return matchResult;
  }

  // ../../engine-v2/node_modules/css-tree/lib/lexer/trace.js
  var trace_exports = {};
  __export(trace_exports, {
    getTrace: () => getTrace,
    isKeyword: () => isKeyword,
    isProperty: () => isProperty,
    isType: () => isType
  });
  function getTrace(node) {
    function shouldPutToTrace(syntax) {
      if (syntax === null) {
        return false;
      }
      return syntax.type === "Type" || syntax.type === "Property" || syntax.type === "Keyword";
    }
    function hasMatch(matchNode) {
      if (Array.isArray(matchNode.match)) {
        for (let i = 0; i < matchNode.match.length; i++) {
          if (hasMatch(matchNode.match[i])) {
            if (shouldPutToTrace(matchNode.syntax)) {
              result.unshift(matchNode.syntax);
            }
            return true;
          }
        }
      } else if (matchNode.node === node) {
        result = shouldPutToTrace(matchNode.syntax) ? [matchNode.syntax] : [];
        return true;
      }
      return false;
    }
    let result = null;
    if (this.matched !== null) {
      hasMatch(this.matched);
    }
    return result;
  }
  function isType(node, type) {
    return testNode(this, node, (match) => match.type === "Type" && match.name === type);
  }
  function isProperty(node, property2) {
    return testNode(this, node, (match) => match.type === "Property" && match.name === property2);
  }
  function isKeyword(node) {
    return testNode(this, node, (match) => match.type === "Keyword");
  }
  function testNode(match, node, fn) {
    const trace = getTrace.call(match, node);
    if (trace === null) {
      return false;
    }
    return trace.some(fn);
  }

  // ../../engine-v2/node_modules/css-tree/lib/lexer/search.js
  function getFirstMatchNode(matchNode) {
    if ("node" in matchNode) {
      return matchNode.node;
    }
    return getFirstMatchNode(matchNode.match[0]);
  }
  function getLastMatchNode(matchNode) {
    if ("node" in matchNode) {
      return matchNode.node;
    }
    return getLastMatchNode(matchNode.match[matchNode.match.length - 1]);
  }
  function matchFragments(lexer2, ast, match, type, name50) {
    function findFragments(matchNode) {
      if (matchNode.syntax !== null && matchNode.syntax.type === type && matchNode.syntax.name === name50) {
        const start = getFirstMatchNode(matchNode);
        const end = getLastMatchNode(matchNode);
        lexer2.syntax.walk(ast, function(node, item, list2) {
          if (node === start) {
            const nodes = new List();
            do {
              nodes.appendData(item.data);
              if (item.data === end) {
                break;
              }
              item = item.next;
            } while (item !== null);
            fragments.push({
              parent: list2,
              nodes
            });
          }
        });
      }
      if (Array.isArray(matchNode.match)) {
        matchNode.match.forEach(findFragments);
      }
    }
    const fragments = [];
    if (match.matched !== null) {
      findFragments(match.matched);
    }
    return fragments;
  }

  // ../../engine-v2/node_modules/css-tree/lib/lexer/structure.js
  var { hasOwnProperty: hasOwnProperty4 } = Object.prototype;
  function isValidNumber(value) {
    return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value >= 0;
  }
  function isValidLocation(loc) {
    return Boolean(loc) && isValidNumber(loc.offset) && isValidNumber(loc.line) && isValidNumber(loc.column);
  }
  function createNodeStructureChecker(type, fields) {
    return function checkNode(node, warn) {
      if (!node || node.constructor !== Object) {
        return warn(node, "Type of node should be an Object");
      }
      for (let key in node) {
        let valid = true;
        if (hasOwnProperty4.call(node, key) === false) {
          continue;
        }
        if (key === "type") {
          if (node.type !== type) {
            warn(node, "Wrong node type `" + node.type + "`, expected `" + type + "`");
          }
        } else if (key === "loc") {
          if (node.loc === null) {
            continue;
          } else if (node.loc && node.loc.constructor === Object) {
            if (typeof node.loc.source !== "string") {
              key += ".source";
            } else if (!isValidLocation(node.loc.start)) {
              key += ".start";
            } else if (!isValidLocation(node.loc.end)) {
              key += ".end";
            } else {
              continue;
            }
          }
          valid = false;
        } else if (fields.hasOwnProperty(key)) {
          valid = false;
          for (let i = 0; !valid && i < fields[key].length; i++) {
            const fieldType = fields[key][i];
            switch (fieldType) {
              case String:
                valid = typeof node[key] === "string";
                break;
              case Boolean:
                valid = typeof node[key] === "boolean";
                break;
              case null:
                valid = node[key] === null;
                break;
              default:
                if (typeof fieldType === "string") {
                  valid = node[key] && node[key].type === fieldType;
                } else if (Array.isArray(fieldType)) {
                  valid = node[key] instanceof List;
                }
            }
          }
        } else {
          warn(node, "Unknown field `" + key + "` for " + type + " node type");
        }
        if (!valid) {
          warn(node, "Bad value for `" + type + "." + key + "`");
        }
      }
      for (const key in fields) {
        if (hasOwnProperty4.call(fields, key) && hasOwnProperty4.call(node, key) === false) {
          warn(node, "Field `" + type + "." + key + "` is missed");
        }
      }
    };
  }
  function genTypesList(fieldTypes, path) {
    const docsTypes = [];
    for (let i = 0; i < fieldTypes.length; i++) {
      const fieldType = fieldTypes[i];
      if (fieldType === String || fieldType === Boolean) {
        docsTypes.push(fieldType.name.toLowerCase());
      } else if (fieldType === null) {
        docsTypes.push("null");
      } else if (typeof fieldType === "string") {
        docsTypes.push(fieldType);
      } else if (Array.isArray(fieldType)) {
        docsTypes.push("List<" + (genTypesList(fieldType, path) || "any") + ">");
      } else {
        throw new Error("Wrong value `" + fieldType + "` in `" + path + "` structure definition");
      }
    }
    return docsTypes.join(" | ");
  }
  function processStructure(name50, nodeType) {
    const structure50 = nodeType.structure;
    const fields = {
      type: String,
      loc: true
    };
    const docs = {
      type: '"' + name50 + '"'
    };
    for (const key in structure50) {
      if (hasOwnProperty4.call(structure50, key) === false) {
        continue;
      }
      const fieldTypes = fields[key] = Array.isArray(structure50[key]) ? structure50[key].slice() : [structure50[key]];
      docs[key] = genTypesList(fieldTypes, name50 + "." + key);
    }
    return {
      docs,
      check: createNodeStructureChecker(name50, fields)
    };
  }
  function getStructureFromConfig(config) {
    const structure50 = {};
    if (config.node) {
      for (const name50 in config.node) {
        if (hasOwnProperty4.call(config.node, name50)) {
          const nodeType = config.node[name50];
          if (nodeType.structure) {
            structure50[name50] = processStructure(name50, nodeType);
          } else {
            throw new Error("Missed `structure` field in `" + name50 + "` node type definition");
          }
        }
      }
    }
    return structure50;
  }

  // ../../engine-v2/node_modules/css-tree/lib/lexer/Lexer.js
  function dumpMapSyntax(map, compact, syntaxAsAst) {
    const result = {};
    for (const name50 in map) {
      if (map[name50].syntax) {
        result[name50] = syntaxAsAst ? map[name50].syntax : generate(map[name50].syntax, { compact });
      }
    }
    return result;
  }
  function dumpAtruleMapSyntax(map, compact, syntaxAsAst) {
    const result = {};
    for (const [name50, atrule] of Object.entries(map)) {
      result[name50] = {
        prelude: atrule.prelude && (syntaxAsAst ? atrule.prelude.syntax : generate(atrule.prelude.syntax, { compact })),
        descriptors: atrule.descriptors && dumpMapSyntax(atrule.descriptors, compact, syntaxAsAst)
      };
    }
    return result;
  }
  function valueHasVar(tokens) {
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].value.toLowerCase() === "var(") {
        return true;
      }
    }
    return false;
  }
  function syntaxHasTopLevelCommaMultiplier(syntax) {
    const singleTerm = syntax.terms[0];
    return syntax.explicit === false && syntax.terms.length === 1 && singleTerm.type === "Multiplier" && singleTerm.comma === true;
  }
  function buildMatchResult(matched, error, iterations) {
    return {
      matched,
      iterations,
      error,
      ...trace_exports
    };
  }
  function matchSyntax(lexer2, syntax, value, useCssWideKeywords) {
    const tokens = prepare_tokens_default(value, lexer2.syntax);
    let result;
    if (valueHasVar(tokens)) {
      return buildMatchResult(null, new Error("Matching for a tree with var() is not supported"));
    }
    if (useCssWideKeywords) {
      result = matchAsTree(tokens, lexer2.cssWideKeywordsSyntax, lexer2);
    }
    if (!useCssWideKeywords || !result.match) {
      result = matchAsTree(tokens, syntax.match, lexer2);
      if (!result.match) {
        return buildMatchResult(
          null,
          new SyntaxMatchError(result.reason, syntax.syntax, value, result),
          result.iterations
        );
      }
    }
    return buildMatchResult(result.match, null, result.iterations);
  }
  var Lexer = class {
    constructor(config, syntax, structure50) {
      this.cssWideKeywords = cssWideKeywords;
      this.syntax = syntax;
      this.generic = false;
      this.units = { ...units_exports };
      this.atrules = /* @__PURE__ */ Object.create(null);
      this.properties = /* @__PURE__ */ Object.create(null);
      this.types = /* @__PURE__ */ Object.create(null);
      this.structure = structure50 || getStructureFromConfig(config);
      if (config) {
        if (config.cssWideKeywords) {
          this.cssWideKeywords = config.cssWideKeywords;
        }
        if (config.units) {
          for (const group of Object.keys(units_exports)) {
            if (Array.isArray(config.units[group])) {
              this.units[group] = config.units[group];
            }
          }
        }
        if (config.types) {
          for (const [name50, type] of Object.entries(config.types)) {
            this.addType_(name50, type);
          }
        }
        if (config.generic) {
          this.generic = true;
          for (const [name50, value] of Object.entries(createGenericTypes(this.units))) {
            this.addType_(name50, value);
          }
        }
        if (config.atrules) {
          for (const [name50, atrule] of Object.entries(config.atrules)) {
            this.addAtrule_(name50, atrule);
          }
        }
        if (config.properties) {
          for (const [name50, property2] of Object.entries(config.properties)) {
            this.addProperty_(name50, property2);
          }
        }
      }
      this.cssWideKeywordsSyntax = buildMatchGraph(this.cssWideKeywords.join(" |  "));
    }
    checkStructure(ast) {
      function collectWarning(node, message) {
        warns.push({ node, message });
      }
      const structure50 = this.structure;
      const warns = [];
      this.syntax.walk(ast, function(node) {
        if (structure50.hasOwnProperty(node.type)) {
          structure50[node.type].check(node, collectWarning);
        } else {
          collectWarning(node, "Unknown node type `" + node.type + "`");
        }
      });
      return warns.length ? warns : false;
    }
    createDescriptor(syntax, type, name50, parent2 = null) {
      const ref = {
        type,
        name: name50
      };
      const descriptor3 = {
        type,
        name: name50,
        parent: parent2,
        serializable: typeof syntax === "string" || syntax && typeof syntax.type === "string",
        syntax: null,
        match: null,
        matchRef: null
        // used for properties when a syntax referenced as <'property'> in other syntax definitions
      };
      if (typeof syntax === "function") {
        descriptor3.match = buildMatchGraph(syntax, ref);
      } else {
        if (typeof syntax === "string") {
          Object.defineProperty(descriptor3, "syntax", {
            get() {
              Object.defineProperty(descriptor3, "syntax", {
                value: parse(syntax)
              });
              return descriptor3.syntax;
            }
          });
        } else {
          descriptor3.syntax = syntax;
        }
        Object.defineProperty(descriptor3, "match", {
          get() {
            Object.defineProperty(descriptor3, "match", {
              value: buildMatchGraph(descriptor3.syntax, ref)
            });
            return descriptor3.match;
          }
        });
        if (type === "Property") {
          Object.defineProperty(descriptor3, "matchRef", {
            get() {
              const syntax2 = descriptor3.syntax;
              const value = syntaxHasTopLevelCommaMultiplier(syntax2) ? buildMatchGraph({
                ...syntax2,
                terms: [syntax2.terms[0].term]
              }, ref) : null;
              Object.defineProperty(descriptor3, "matchRef", {
                value
              });
              return value;
            }
          });
        }
      }
      return descriptor3;
    }
    addAtrule_(name50, syntax) {
      if (!syntax) {
        return;
      }
      this.atrules[name50] = {
        type: "Atrule",
        name: name50,
        prelude: syntax.prelude ? this.createDescriptor(syntax.prelude, "AtrulePrelude", name50) : null,
        descriptors: syntax.descriptors ? Object.keys(syntax.descriptors).reduce(
          (map, descName) => {
            map[descName] = this.createDescriptor(syntax.descriptors[descName], "AtruleDescriptor", descName, name50);
            return map;
          },
          /* @__PURE__ */ Object.create(null)
        ) : null
      };
    }
    addProperty_(name50, syntax) {
      if (!syntax) {
        return;
      }
      this.properties[name50] = this.createDescriptor(syntax, "Property", name50);
    }
    addType_(name50, syntax) {
      if (!syntax) {
        return;
      }
      this.types[name50] = this.createDescriptor(syntax, "Type", name50);
    }
    checkAtruleName(atruleName) {
      if (!this.getAtrule(atruleName)) {
        return new SyntaxReferenceError("Unknown at-rule", "@" + atruleName);
      }
    }
    checkAtrulePrelude(atruleName, prelude) {
      const error = this.checkAtruleName(atruleName);
      if (error) {
        return error;
      }
      const atrule = this.getAtrule(atruleName);
      if (!atrule.prelude && prelude) {
        return new SyntaxError("At-rule `@" + atruleName + "` should not contain a prelude");
      }
      if (atrule.prelude && !prelude) {
        if (!matchSyntax(this, atrule.prelude, "", false).matched) {
          return new SyntaxError("At-rule `@" + atruleName + "` should contain a prelude");
        }
      }
    }
    checkAtruleDescriptorName(atruleName, descriptorName) {
      const error = this.checkAtruleName(atruleName);
      if (error) {
        return error;
      }
      const atrule = this.getAtrule(atruleName);
      const descriptor3 = keyword(descriptorName);
      if (!atrule.descriptors) {
        return new SyntaxError("At-rule `@" + atruleName + "` has no known descriptors");
      }
      if (!atrule.descriptors[descriptor3.name] && !atrule.descriptors[descriptor3.basename]) {
        return new SyntaxReferenceError("Unknown at-rule descriptor", descriptorName);
      }
    }
    checkPropertyName(propertyName) {
      if (!this.getProperty(propertyName)) {
        return new SyntaxReferenceError("Unknown property", propertyName);
      }
    }
    matchAtrulePrelude(atruleName, prelude) {
      const error = this.checkAtrulePrelude(atruleName, prelude);
      if (error) {
        return buildMatchResult(null, error);
      }
      const atrule = this.getAtrule(atruleName);
      if (!atrule.prelude) {
        return buildMatchResult(null, null);
      }
      return matchSyntax(this, atrule.prelude, prelude || "", false);
    }
    matchAtruleDescriptor(atruleName, descriptorName, value) {
      const error = this.checkAtruleDescriptorName(atruleName, descriptorName);
      if (error) {
        return buildMatchResult(null, error);
      }
      const atrule = this.getAtrule(atruleName);
      const descriptor3 = keyword(descriptorName);
      return matchSyntax(this, atrule.descriptors[descriptor3.name] || atrule.descriptors[descriptor3.basename], value, false);
    }
    matchDeclaration(node) {
      if (node.type !== "Declaration") {
        return buildMatchResult(null, new Error("Not a Declaration node"));
      }
      return this.matchProperty(node.property, node.value);
    }
    matchProperty(propertyName, value) {
      if (property(propertyName).custom) {
        return buildMatchResult(null, new Error("Lexer matching doesn't applicable for custom properties"));
      }
      const error = this.checkPropertyName(propertyName);
      if (error) {
        return buildMatchResult(null, error);
      }
      return matchSyntax(this, this.getProperty(propertyName), value, true);
    }
    matchType(typeName, value) {
      const typeSyntax = this.getType(typeName);
      if (!typeSyntax) {
        return buildMatchResult(null, new SyntaxReferenceError("Unknown type", typeName));
      }
      return matchSyntax(this, typeSyntax, value, false);
    }
    match(syntax, value) {
      if (typeof syntax !== "string" && (!syntax || !syntax.type)) {
        return buildMatchResult(null, new SyntaxReferenceError("Bad syntax"));
      }
      if (typeof syntax === "string" || !syntax.match) {
        syntax = this.createDescriptor(syntax, "Type", "anonymous");
      }
      return matchSyntax(this, syntax, value, false);
    }
    findValueFragments(propertyName, value, type, name50) {
      return matchFragments(this, value, this.matchProperty(propertyName, value), type, name50);
    }
    findDeclarationValueFragments(declaration, type, name50) {
      return matchFragments(this, declaration.value, this.matchDeclaration(declaration), type, name50);
    }
    findAllFragments(ast, type, name50) {
      const result = [];
      this.syntax.walk(ast, {
        visit: "Declaration",
        enter: (declaration) => {
          result.push.apply(result, this.findDeclarationValueFragments(declaration, type, name50));
        }
      });
      return result;
    }
    getAtrule(atruleName, fallbackBasename = true) {
      const atrule = keyword(atruleName);
      const atruleEntry = atrule.vendor && fallbackBasename ? this.atrules[atrule.name] || this.atrules[atrule.basename] : this.atrules[atrule.name];
      return atruleEntry || null;
    }
    getAtrulePrelude(atruleName, fallbackBasename = true) {
      const atrule = this.getAtrule(atruleName, fallbackBasename);
      return atrule && atrule.prelude || null;
    }
    getAtruleDescriptor(atruleName, name50) {
      return this.atrules.hasOwnProperty(atruleName) && this.atrules.declarators ? this.atrules[atruleName].declarators[name50] || null : null;
    }
    getProperty(propertyName, fallbackBasename = true) {
      const property2 = property(propertyName);
      const propertyEntry = property2.vendor && fallbackBasename ? this.properties[property2.name] || this.properties[property2.basename] : this.properties[property2.name];
      return propertyEntry || null;
    }
    getType(name50) {
      return hasOwnProperty.call(this.types, name50) ? this.types[name50] : null;
    }
    validate() {
      function syntaxRef(name50, isType2) {
        return isType2 ? `<${name50}>` : `<'${name50}'>`;
      }
      function validate(syntax, name50, broken, descriptor3) {
        if (broken.has(name50)) {
          return broken.get(name50);
        }
        broken.set(name50, false);
        if (descriptor3.syntax !== null) {
          walk(descriptor3.syntax, function(node) {
            if (node.type !== "Type" && node.type !== "Property") {
              return;
            }
            const map = node.type === "Type" ? syntax.types : syntax.properties;
            const brokenMap = node.type === "Type" ? brokenTypes : brokenProperties;
            if (!hasOwnProperty.call(map, node.name)) {
              errors.push(`${syntaxRef(name50, broken === brokenTypes)} used missed syntax definition ${syntaxRef(node.name, node.type === "Type")}`);
              broken.set(name50, true);
            } else if (validate(syntax, node.name, brokenMap, map[node.name])) {
              errors.push(`${syntaxRef(name50, broken === brokenTypes)} used broken syntax definition ${syntaxRef(node.name, node.type === "Type")}`);
              broken.set(name50, true);
            }
          }, this);
        }
      }
      const errors = [];
      let brokenTypes = /* @__PURE__ */ new Map();
      let brokenProperties = /* @__PURE__ */ new Map();
      for (const key in this.types) {
        validate(this, key, brokenTypes, this.types[key]);
      }
      for (const key in this.properties) {
        validate(this, key, brokenProperties, this.properties[key]);
      }
      const brokenTypesArray = [...brokenTypes.keys()].filter((name50) => brokenTypes.get(name50));
      const brokenPropertiesArray = [...brokenProperties.keys()].filter((name50) => brokenProperties.get(name50));
      if (brokenTypesArray.length || brokenPropertiesArray.length) {
        return {
          errors,
          types: brokenTypesArray,
          properties: brokenPropertiesArray
        };
      }
      return null;
    }
    dump(syntaxAsAst, pretty) {
      return {
        generic: this.generic,
        cssWideKeywords: this.cssWideKeywords,
        units: this.units,
        types: dumpMapSyntax(this.types, !pretty, syntaxAsAst),
        properties: dumpMapSyntax(this.properties, !pretty, syntaxAsAst),
        atrules: dumpAtruleMapSyntax(this.atrules, !pretty, syntaxAsAst)
      };
    }
    toString() {
      return JSON.stringify(this.dump());
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/config/mix.js
  function appendOrSet(a, b) {
    if (typeof b === "string" && /^\s*\|/.test(b)) {
      return typeof a === "string" ? a + b : b.replace(/^\s*\|\s*/, "");
    }
    return b || null;
  }
  function extractProps(obj, props) {
    const result = /* @__PURE__ */ Object.create(null);
    for (const prop of Object.keys(obj)) {
      if (props.includes(prop)) {
        result[prop] = obj[prop];
      }
    }
    return result;
  }
  function mergeDicts(base, ext, fields) {
    const result = { ...base };
    for (const [key, props] of Object.entries(ext)) {
      result[key] = {
        ...result[key],
        ...fields ? extractProps(props, fields) : props
      };
    }
    return result;
  }
  function mix(dest, src) {
    const result = { ...dest };
    for (const [prop, value] of Object.entries(src)) {
      switch (prop) {
        case "generic":
          result[prop] = Boolean(value);
          break;
        case "cssWideKeywords":
          result[prop] = dest[prop] ? [...dest[prop], ...value] : value || [];
          break;
        case "units":
          result[prop] = { ...dest[prop] };
          for (const [name50, patch] of Object.entries(value)) {
            result[prop][name50] = Array.isArray(patch) ? patch : [];
          }
          break;
        case "atrules":
          result[prop] = { ...dest[prop] };
          for (const [name50, atrule] of Object.entries(value)) {
            const exists = result[prop][name50] || {};
            const current = result[prop][name50] = {
              prelude: exists.prelude || null,
              descriptors: {
                ...exists.descriptors
              }
            };
            if (!atrule) {
              continue;
            }
            current.prelude = atrule.prelude ? appendOrSet(current.prelude, atrule.prelude) : current.prelude || null;
            for (const [descriptorName, descriptorValue] of Object.entries(atrule.descriptors || {})) {
              current.descriptors[descriptorName] = descriptorValue ? appendOrSet(current.descriptors[descriptorName], descriptorValue) : null;
            }
            if (!Object.keys(current.descriptors).length) {
              current.descriptors = null;
            }
          }
          break;
        case "types":
        case "properties":
          result[prop] = { ...dest[prop] };
          for (const [name50, syntax] of Object.entries(value)) {
            result[prop][name50] = appendOrSet(result[prop][name50], syntax);
          }
          break;
        case "parseContext":
          result[prop] = {
            ...dest[prop],
            ...value
          };
          break;
        case "scope":
        case "features":
          result[prop] = mergeDicts(dest[prop], value);
          break;
        case "atrule":
        case "pseudo":
          result[prop] = mergeDicts(dest[prop], value, ["parse"]);
          break;
        case "node":
          result[prop] = mergeDicts(dest[prop], value, ["name", "structure", "parse", "generate", "walkContext"]);
          break;
      }
    }
    return result;
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/create.js
  function createSyntax(config) {
    const parse52 = createParser(config);
    const walk3 = createWalker(config);
    const generate52 = createGenerator(config);
    const { fromPlainObject: fromPlainObject2, toPlainObject: toPlainObject2 } = createConvertor(walk3);
    const syntax = {
      lexer: null,
      createLexer: (config2) => new Lexer(config2, syntax, syntax.lexer.structure),
      tokenize,
      parse: parse52,
      generate: generate52,
      walk: walk3,
      find: walk3.find,
      findLast: walk3.findLast,
      findAll: walk3.findAll,
      fromPlainObject: fromPlainObject2,
      toPlainObject: toPlainObject2,
      fork(extension) {
        const base = mix({}, config);
        return createSyntax(
          typeof extension === "function" ? extension(base) : mix(base, extension)
        );
      }
    };
    syntax.lexer = new Lexer({
      generic: config.generic,
      cssWideKeywords: config.cssWideKeywords,
      units: config.units,
      types: config.types,
      atrules: config.atrules,
      properties: config.properties,
      node: config.node
    }, syntax);
    return syntax;
  }
  var create_default = (config) => createSyntax(mix({}, config));

  // ../../engine-v2/node_modules/css-tree/dist/data.js
  var data_default = {
    "generic": true,
    "cssWideKeywords": [
      "initial",
      "inherit",
      "unset",
      "revert",
      "revert-layer"
    ],
    "units": {
      "angle": [
        "deg",
        "grad",
        "rad",
        "turn"
      ],
      "decibel": [
        "db"
      ],
      "flex": [
        "fr"
      ],
      "frequency": [
        "hz",
        "khz"
      ],
      "length": [
        "cm",
        "mm",
        "q",
        "in",
        "pt",
        "pc",
        "px",
        "em",
        "rem",
        "ex",
        "rex",
        "cap",
        "rcap",
        "ch",
        "rch",
        "ic",
        "ric",
        "lh",
        "rlh",
        "vw",
        "svw",
        "lvw",
        "dvw",
        "vh",
        "svh",
        "lvh",
        "dvh",
        "vi",
        "svi",
        "lvi",
        "dvi",
        "vb",
        "svb",
        "lvb",
        "dvb",
        "vmin",
        "svmin",
        "lvmin",
        "dvmin",
        "vmax",
        "svmax",
        "lvmax",
        "dvmax",
        "cqw",
        "cqh",
        "cqi",
        "cqb",
        "cqmin",
        "cqmax"
      ],
      "resolution": [
        "dpi",
        "dpcm",
        "dppx",
        "x"
      ],
      "semitones": [
        "st"
      ],
      "time": [
        "s",
        "ms"
      ]
    },
    "types": {
      "abs()": "abs( <calc-sum> )",
      "absolute-size": "xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large",
      "acos()": "acos( <calc-sum> )",
      "alpha-value": "<number>|<percentage>",
      "an+b": "odd|even|<integer>|<n-dimension>|'+'? † n|-n|<ndashdigit-dimension>|'+'? † <ndashdigit-ident>|<dashndashdigit-ident>|<n-dimension> <signed-integer>|'+'? † n <signed-integer>|-n <signed-integer>|<ndash-dimension> <signless-integer>|'+'? † n- <signless-integer>|-n- <signless-integer>|<n-dimension> ['+'|'-'] <signless-integer>|'+'? † n ['+'|'-'] <signless-integer>|-n ['+'|'-'] <signless-integer>",
      "anchor()": "anchor( <anchor-name>?&&<anchor-side> , <length-percentage>? )",
      "anchor-name": "<dashed-ident>",
      "anchor-side": "inside|outside|top|left|right|bottom|start|end|self-start|self-end|<percentage>|center",
      "anchor-size": "width|height|block|inline|self-block|self-inline",
      "anchor-size()": "anchor-size( [<anchor-name>||<anchor-size>]? , <length-percentage>? )",
      "angle-percentage": "<angle>|<percentage>",
      "angular-color-hint": "<angle-percentage>|<zero>",
      "angular-color-stop": "<color> <color-stop-angle>?",
      "angular-color-stop-list": "<angular-color-stop> , [<angular-color-hint>? , <angular-color-stop>]#?",
      "animateable-feature": "scroll-position|contents|<custom-ident>",
      "animation-action": "none|play|play-once|play-forwards|play-backwards|pause|reset|replay",
      "asin()": "asin( <calc-sum> )",
      "atan()": "atan( <calc-sum> )",
      "atan2()": "atan2( <calc-sum> , <calc-sum> )",
      "attachment": "scroll|fixed|local",
      "attr()": "attr( <attr-name> <attr-type>? , <declaration-value>? )",
      "attr-matcher": "['~'|'|'|'^'|'$'|'*']? '='",
      "attr-modifier": "i|s",
      "attr-type": "type( <syntax> )|raw-string|number|<attr-unit>",
      "attribute-selector": "'[' <wq-name> ']'|'[' <wq-name> <attr-matcher> [<string-token>|<ident-token>] <attr-modifier>? ']'",
      "auto-repeat": "repeat( [auto-fill|auto-fit] , [<line-names>? <fixed-size>]+ <line-names>? )",
      "auto-track-list": "[<line-names>? [<fixed-size>|<fixed-repeat>]]* <line-names>? <auto-repeat> [<line-names>? [<fixed-size>|<fixed-repeat>]]* <line-names>?",
      "axis": "block|inline|x|y",
      "baseline-position": "[first|last]? baseline",
      "basic-shape": "<inset()>|<xywh()>|<rect()>|<circle()>|<ellipse()>|<polygon()>|<path()>",
      "basic-shape-rect": "<inset()>|<rect()>|<xywh()>",
      "bg-clip": "<visual-box>|border-area|text",
      "bg-image": "<image>|none",
      "bg-layer": "<bg-image>||<bg-position> [/ <bg-size>]?||<repeat-style>||<attachment>||<visual-box>||<visual-box>",
      "bg-position": "[[left|center|right|top|bottom|<length-percentage>]|[left|center|right|<length-percentage>] [top|center|bottom|<length-percentage>]|[center|[left|right] <length-percentage>?]&&[center|[top|bottom] <length-percentage>?]]",
      "bg-size": "[<length-percentage [0,∞]>|auto]{1,2}|cover|contain",
      "blend-mode": "normal|multiply|screen|overlay|darken|lighten|color-dodge|color-burn|hard-light|soft-light|difference|exclusion|hue|saturation|color|luminosity",
      "blur()": "blur( <length>? )",
      "brightness()": "brightness( [<number>|<percentage>]? )",
      "calc()": "calc( <calc-sum> )",
      "calc-constant": "e|pi|infinity|-infinity|NaN",
      "calc-product": "<calc-value> ['*' <calc-value>|'/' <number>]*",
      "calc-size()": "calc-size( <calc-size-basis> , <calc-sum> )",
      "calc-size-basis": "<intrinsic-size-keyword>|<calc-size()>|any|<calc-sum>",
      "calc-sum": "<calc-product> [['+'|'-'] <calc-product>]*",
      "calc-value": "<number>|<dimension>|<percentage>|<calc-constant>|( <calc-sum> )",
      "cf-final-image": "<image>|<color>",
      "cf-mixing-image": "<percentage>?&&<image>",
      "circle()": "circle( <radial-size>? [at <position>]? )",
      "clamp()": "clamp( <calc-sum>#{3} )",
      "class-selector": "'.' <ident-token>",
      "clip-source": "<url>",
      "color": "<color-base>|currentColor|<system-color>|<device-cmyk()>|<light-dark()>|<-non-standard-color>",
      "color()": "color( <colorspace-params> [/ [<alpha-value>|none]]? )",
      "color-base": "<hex-color>|<color-function>|<named-color>|<color-mix()>|transparent",
      "color-function": "<rgb()>|<rgba()>|<hsl()>|<hsla()>|<hwb()>|<lab()>|<lch()>|<oklab()>|<oklch()>|<color()>",
      "color-interpolation-method": "in [<rectangular-color-space>|<polar-color-space> <hue-interpolation-method>?|<custom-color-space>]",
      "color-mix()": "color-mix( <color-interpolation-method> , [<color>&&<percentage [0,100]>?]#{2} )",
      "color-stop": "<color-stop-length>|<color-stop-angle>",
      "color-stop-angle": "[<angle-percentage>|<zero>]{1,2}",
      "color-stop-length": "<length-percentage>{1,2}",
      "color-stop-list": "<linear-color-stop> , [<linear-color-hint>? , <linear-color-stop>]#?",
      "colorspace-params": "[<predefined-rgb-params>|<xyz-params>]",
      "combinator": "'>'|'+'|'~'|['|' '|']",
      "common-lig-values": "[common-ligatures|no-common-ligatures]",
      "compat-auto": "searchfield|textarea|checkbox|radio|menulist|listbox|meter|progress-bar|button",
      "compat-special": "textfield|menulist-button",
      "complex-selector": "<complex-selector-unit> [<combinator>? <complex-selector-unit>]*",
      "complex-selector-list": "<complex-selector>#",
      "composite-style": "clear|copy|source-over|source-in|source-out|source-atop|destination-over|destination-in|destination-out|destination-atop|xor",
      "compositing-operator": "add|subtract|intersect|exclude",
      "compound-selector": "[<type-selector>? <subclass-selector>*]!",
      "compound-selector-list": "<compound-selector>#",
      "conic-gradient()": "conic-gradient( [<conic-gradient-syntax>] )",
      "conic-gradient-syntax": "[[[from [<angle>|<zero>]]? [at <position>]?]||<color-interpolation-method>]? , <angular-color-stop-list>",
      "container-condition": "not <query-in-parens>|<query-in-parens> [[and <query-in-parens>]*|[or <query-in-parens>]*]",
      "container-name": "<custom-ident>",
      "container-query": "not <query-in-parens>|<query-in-parens> [[and <query-in-parens>]*|[or <query-in-parens>]*]",
      "content-distribution": "space-between|space-around|space-evenly|stretch",
      "content-list": "[<string>|contents|<image>|<counter>|<quote>|<target>|<leader()>|<attr()>]+",
      "content-position": "center|start|end|flex-start|flex-end",
      "content-replacement": "<image>",
      "contextual-alt-values": "[contextual|no-contextual]",
      "contrast()": "contrast( [<number>|<percentage>]? )",
      "coord-box": "content-box|padding-box|border-box|fill-box|stroke-box|view-box",
      "corner-shape-value": "round|scoop|bevel|notch|square|squircle|<superellipse()>",
      "cos()": "cos( <calc-sum> )",
      "counter": "<counter()>|<counters()>",
      "counter()": "counter( <counter-name> , <counter-style>? )",
      "counter-name": "<custom-ident>",
      "counter-style": "<counter-style-name>|symbols( )",
      "counter-style-name": "<custom-ident>",
      "counters()": "counters( <counter-name> , <string> , <counter-style>? )",
      "cross-fade()": "cross-fade( <cf-mixing-image> , <cf-final-image>? )",
      "cubic-bezier()": "cubic-bezier( [<number [0,1]> , <number>]#{2} )",
      "cubic-bezier-easing-function": "ease|ease-in|ease-out|ease-in-out|cubic-bezier( <number [0,1]> , <number> , <number [0,1]> , <number> )",
      "cursor-predefined": "auto|default|none|context-menu|help|pointer|progress|wait|cell|crosshair|text|vertical-text|alias|copy|move|no-drop|not-allowed|e-resize|n-resize|ne-resize|nw-resize|s-resize|se-resize|sw-resize|w-resize|ew-resize|ns-resize|nesw-resize|nwse-resize|col-resize|row-resize|all-scroll|zoom-in|zoom-out|grab|grabbing",
      "custom-color-space": "<dashed-ident>",
      "custom-params": "<dashed-ident> [<number>|<percentage>|none]+",
      "dasharray": "[[<length-percentage>|<number>]+]#",
      "dashndashdigit-ident": "<ident-token>",
      "deprecated-system-color": "ActiveBorder|ActiveCaption|AppWorkspace|Background|ButtonHighlight|ButtonShadow|CaptionText|InactiveBorder|InactiveCaption|InactiveCaptionText|InfoBackground|InfoText|Menu|MenuText|Scrollbar|ThreeDDarkShadow|ThreeDFace|ThreeDHighlight|ThreeDLightShadow|ThreeDShadow|Window|WindowFrame|WindowText",
      "discretionary-lig-values": "[discretionary-ligatures|no-discretionary-ligatures]",
      "display-box": "contents|none",
      "display-inside": "flow|flow-root|table|flex|grid|ruby",
      "display-internal": "table-row-group|table-header-group|table-footer-group|table-row|table-cell|table-column-group|table-column|table-caption|ruby-base|ruby-text|ruby-base-container|ruby-text-container",
      "display-legacy": "inline-block|inline-list-item|inline-table|inline-flex|inline-grid",
      "display-listitem": "<display-outside>?&&[flow|flow-root]?&&list-item",
      "display-outside": "block|inline|run-in",
      "drop-shadow()": "drop-shadow( [<color>?&&<length>{2,3}] )",
      "dynamic-range-limit-mix()": "dynamic-range-limit-mix( [<'dynamic-range-limit'>&&<percentage [0,100]>]#{2,} )",
      "easing-function": "<linear-easing-function>|<cubic-bezier-easing-function>|<step-easing-function>",
      "east-asian-variant-values": "[jis78|jis83|jis90|jis04|simplified|traditional]",
      "east-asian-width-values": "[full-width|proportional-width]",
      "element()": "element( <custom-ident> , [first|start|last|first-except]? )|element( <id-selector> )",
      "ellipse()": "ellipse( <radial-size>? [at <position>]? )",
      "env()": "env( <custom-ident> , <declaration-value>? )",
      "exp()": "exp( <calc-sum> )",
      "explicit-track-list": "[<line-names>? <track-size>]+ <line-names>?",
      "family-name": "<string>|<custom-ident>+",
      "feature-tag-value": "<string> [<integer>|on|off]?",
      "feature-type": "@stylistic|@historical-forms|@styleset|@character-variant|@swash|@ornaments|@annotation",
      "feature-value-block": "<feature-type> '{' <feature-value-declaration-list> '}'",
      "feature-value-block-list": "<feature-value-block>+",
      "feature-value-declaration": "<custom-ident> : <integer>+ ;",
      "feature-value-declaration-list": "<feature-value-declaration>",
      "feature-value-name": "<custom-ident>",
      "filter-function": "<blur()>|<brightness()>|<contrast()>|<drop-shadow()>|<grayscale()>|<hue-rotate()>|<invert()>|<opacity()>|<saturate()>|<sepia()>",
      "filter-value-list": "[<filter-function>|<url>]+",
      "final-bg-layer": "<bg-image>||<bg-position> [/ <bg-size>]?||<repeat-style>||<attachment>||<visual-box>||<visual-box>||<'background-color'>",
      "fit-content()": "fit-content( <length-percentage [0,∞]> )",
      "fixed-breadth": "<length-percentage>",
      "fixed-repeat": "repeat( [<integer [1,∞]>] , [<line-names>? <fixed-size>]+ <line-names>? )",
      "fixed-size": "<fixed-breadth>|minmax( <fixed-breadth> , <track-breadth> )|minmax( <inflexible-breadth> , <fixed-breadth> )",
      "font-stretch-absolute": "normal|ultra-condensed|extra-condensed|condensed|semi-condensed|semi-expanded|expanded|extra-expanded|ultra-expanded|<percentage>",
      "font-variant-css2": "normal|small-caps",
      "font-weight-absolute": "normal|bold|<number [1,1000]>",
      "font-width-css3": "normal|ultra-condensed|extra-condensed|condensed|semi-condensed|semi-expanded|expanded|extra-expanded|ultra-expanded",
      "form-control-identifier": "select",
      "frequency-percentage": "<frequency>|<percentage>",
      "generic-complete": "serif|sans-serif|system-ui|cursive|fantasy|math|monospace",
      "general-enclosed": "[<function-token> <any-value>? )]|[( <any-value>? )]",
      "generic-family": "<generic-script-specific>|<generic-complete>|<generic-incomplete>|<-non-standard-generic-family>",
      "generic-incomplete": "ui-serif|ui-sans-serif|ui-monospace|ui-rounded",
      "geometry-box": "<shape-box>|fill-box|stroke-box|view-box",
      "gradient": "<linear-gradient()>|<repeating-linear-gradient()>|<radial-gradient()>|<repeating-radial-gradient()>|<conic-gradient()>|<repeating-conic-gradient()>|<-legacy-gradient>",
      "grayscale()": "grayscale( [<number>|<percentage>]? )",
      "grid-line": "auto|<custom-ident>|[<integer>&&<custom-ident>?]|[span&&[<integer>||<custom-ident>]]",
      "historical-lig-values": "[historical-ligatures|no-historical-ligatures]",
      "hsl()": "hsl( <hue> , <percentage> , <percentage> , <alpha-value>? )|hsl( [<hue>|none] [<percentage>|<number>|none] [<percentage>|<number>|none] [/ [<alpha-value>|none]]? )",
      "hsla()": "hsla( <hue> , <percentage> , <percentage> , <alpha-value>? )|hsla( [<hue>|none] [<percentage>|<number>|none] [<percentage>|<number>|none] [/ [<alpha-value>|none]]? )",
      "hue": "<number>|<angle>",
      "hue-interpolation-method": "[shorter|longer|increasing|decreasing] hue",
      "hue-rotate()": "hue-rotate( [<angle>|<zero>]? )",
      "hwb()": "hwb( [<hue>|none] [<percentage>|<number>|none] [<percentage>|<number>|none] [/ [<alpha-value>|none]]? )",
      "hypot()": "hypot( <calc-sum># )",
      "image": "<url>|<image()>|<image-set()>|<element()>|<paint()>|<cross-fade()>|<gradient>",
      "image()": "image( <image-tags>? [<image-src>? , <color>?]! )",
      "image-set()": "image-set( <image-set-option># )",
      "image-set-option": "[<image>|<string>] [<resolution>||type( <string> )]",
      "image-src": "<url>|<string>",
      "image-tags": "ltr|rtl",
      "inflexible-breadth": "<length-percentage>|min-content|max-content|auto",
      "inset()": "inset( <length-percentage>{1,4} [round <'border-radius'>]? )",
      "invert()": "invert( [<number>|<percentage>]? )",
      "keyframe-block": "<keyframe-selector># { <declaration-list> }",
      "keyframe-selector": "from|to|<percentage [0,100]>|<timeline-range-name> <percentage>",
      "keyframes-name": "<custom-ident>|<string>",
      "lab()": "lab( [<percentage>|<number>|none] [<percentage>|<number>|none] [<percentage>|<number>|none] [/ [<alpha-value>|none]]? )",
      "layer()": "layer( <layer-name> )",
      "layer-name": "<ident> ['.' <ident>]*",
      "lch()": "lch( [<percentage>|<number>|none] [<percentage>|<number>|none] [<hue>|none] [/ [<alpha-value>|none]]? )",
      "leader()": "leader( <leader-type> )",
      "leader-type": "dotted|solid|space|<string>",
      "length-percentage": "<length>|<percentage>",
      "light-dark()": "light-dark( <color> , <color> )",
      "line-name-list": "[<line-names>|<name-repeat>]+",
      "line-names": "'[' <custom-ident>* ']'",
      "line-style": "none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset",
      "line-width": "<length>|thin|medium|thick",
      "linear()": "linear( [<number>&&<percentage>{0,2}]# )",
      "linear-color-hint": "<length-percentage>",
      "linear-color-stop": "<color> <color-stop-length>?",
      "linear-easing-function": "linear|<linear()>",
      "linear-gradient()": "linear-gradient( [<linear-gradient-syntax>] )",
      "linear-gradient-syntax": "[[<angle>|<zero>|to <side-or-corner>]||<color-interpolation-method>]? , <color-stop-list>",
      "log()": "log( <calc-sum> , <calc-sum>? )",
      "mask-layer": "<mask-reference>||<position> [/ <bg-size>]?||<repeat-style>||<geometry-box>||[<geometry-box>|no-clip]||<compositing-operator>||<masking-mode>",
      "mask-position": "[<length-percentage>|left|center|right] [<length-percentage>|top|center|bottom]?",
      "mask-reference": "none|<image>|<mask-source>",
      "mask-source": "<url>",
      "masking-mode": "alpha|luminance|match-source",
      "matrix()": "matrix( <number>#{6} )",
      "matrix3d()": "matrix3d( <number>#{16} )",
      "max()": "max( <calc-sum># )",
      "media-and": "<media-in-parens> [and <media-in-parens>]+",
      "media-condition": "<media-not>|<media-and>|<media-or>|<media-in-parens>",
      "media-condition-without-or": "<media-not>|<media-and>|<media-in-parens>",
      "media-feature": "( [<mf-plain>|<mf-boolean>|<mf-range>] )",
      "media-in-parens": "( <media-condition> )|<media-feature>|<general-enclosed>",
      "media-not": "not <media-in-parens>",
      "media-or": "<media-in-parens> [or <media-in-parens>]+",
      "media-query": "<media-condition>|[not|only]? <media-type> [and <media-condition-without-or>]?",
      "media-query-list": "<media-query>#",
      "media-type": "<ident>",
      "mf-boolean": "<mf-name>",
      "mf-name": "<ident>",
      "mf-plain": "<mf-name> : <mf-value>",
      "mf-range": "<mf-name> ['<'|'>']? '='? <mf-value>|<mf-value> ['<'|'>']? '='? <mf-name>|<mf-value> '<' '='? <mf-name> '<' '='? <mf-value>|<mf-value> '>' '='? <mf-name> '>' '='? <mf-value>",
      "mf-value": "<number>|<dimension>|<ident>|<ratio>",
      "min()": "min( <calc-sum># )",
      "minmax()": "minmax( [<length-percentage>|min-content|max-content|auto] , [<length-percentage>|<flex>|min-content|max-content|auto] )",
      "mod()": "mod( <calc-sum> , <calc-sum> )",
      "n-dimension": "<dimension-token>",
      "name-repeat": "repeat( [<integer [1,∞]>|auto-fill] , <line-names>+ )",
      "named-color": "aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen",
      "namespace-prefix": "<ident>",
      "ndash-dimension": "<dimension-token>",
      "ndashdigit-dimension": "<dimension-token>",
      "ndashdigit-ident": "<ident-token>",
      "ns-prefix": "[<ident-token>|'*']? '|'",
      "number-percentage": "<number>|<percentage>",
      "numeric-figure-values": "[lining-nums|oldstyle-nums]",
      "numeric-fraction-values": "[diagonal-fractions|stacked-fractions]",
      "numeric-spacing-values": "[proportional-nums|tabular-nums]",
      "offset-path": "<ray()>|<url>|<basic-shape>",
      "oklab()": "oklab( [<percentage>|<number>|none] [<percentage>|<number>|none] [<percentage>|<number>|none] [/ [<alpha-value>|none]]? )",
      "oklch()": "oklch( [<percentage>|<number>|none] [<percentage>|<number>|none] [<hue>|none] [/ [<alpha-value>|none]]? )",
      "opacity()": "opacity( [<number>|<percentage>]? )",
      "opacity-value": "<number>|<percentage>",
      "outline-line-style": "none|dotted|dashed|solid|double|groove|ridge|inset|outset",
      "outline-radius": "<length>|<percentage>",
      "overflow-position": "unsafe|safe",
      "page-body": "<declaration>? [; <page-body>]?|<page-margin-box> <page-body>",
      "page-margin-box": "<page-margin-box-type> '{' <declaration-list> '}'",
      "page-margin-box-type": "@top-left-corner|@top-left|@top-center|@top-right|@top-right-corner|@bottom-left-corner|@bottom-left|@bottom-center|@bottom-right|@bottom-right-corner|@left-top|@left-middle|@left-bottom|@right-top|@right-middle|@right-bottom",
      "page-selector": "<pseudo-page>+|<ident> <pseudo-page>*",
      "page-selector-list": "[<page-selector>#]?",
      "page-size": "A5|A4|A3|B5|B4|JIS-B5|JIS-B4|letter|legal|ledger",
      "paint": "none|<color>|<url> [none|<color>]?|context-fill|context-stroke",
      "paint()": "paint( <ident> , <declaration-value>? )",
      "paint-box": "<visual-box>|fill-box|stroke-box",
      "palette-identifier": "<dashed-ident>",
      "palette-mix()": "palette-mix( <color-interpolation-method> , [[normal|light|dark|<palette-identifier>|<palette-mix()>]&&<percentage [0,100]>?]#{2} )",
      "path()": "path( <'fill-rule'>? , <string> )",
      "perspective()": "perspective( [<length [0,∞]>|none] )",
      "polar-color-space": "hsl|hwb|lch|oklch",
      "polygon()": "polygon( <'fill-rule'>? , [<length-percentage> <length-percentage>]# )",
      "position": "[[left|center|right]||[top|center|bottom]|[left|center|right|<length-percentage>] [top|center|bottom|<length-percentage>]?|[[left|right] <length-percentage>]&&[[top|bottom] <length-percentage>]]",
      "position-area": "[[left|center|right|span-left|span-right|x-start|x-end|span-x-start|span-x-end|x-self-start|x-self-end|span-x-self-start|span-x-self-end|span-all]||[top|center|bottom|span-top|span-bottom|y-start|y-end|span-y-start|span-y-end|y-self-start|y-self-end|span-y-self-start|span-y-self-end|span-all]|[block-start|center|block-end|span-block-start|span-block-end|span-all]||[inline-start|center|inline-end|span-inline-start|span-inline-end|span-all]|[self-block-start|center|self-block-end|span-self-block-start|span-self-block-end|span-all]||[self-inline-start|center|self-inline-end|span-self-inline-start|span-self-inline-end|span-all]|[start|center|end|span-start|span-end|span-all]{1,2}|[self-start|center|self-end|span-self-start|span-self-end|span-all]{1,2}]",
      "pow()": "pow( <calc-sum> , <calc-sum> )",
      "predefined-rgb": "srgb|srgb-linear|display-p3|display-p3-linear|a98-rgb|prophoto-rgb|rec2020",
      "predefined-rgb-params": "<predefined-rgb> [<number>|<percentage>|none]{3}",
      "pseudo-class-selector": "':' <ident-token>|':' <function-token> <any-value> ')'",
      "pseudo-element-selector": "':' <pseudo-class-selector>|<legacy-pseudo-element-selector>",
      "pseudo-page": ": [left|right|first|blank]",
      "query-in-parens": "( <container-condition> )|( <size-feature> )|style( <style-query> )|<general-enclosed>",
      "quote": "open-quote|close-quote|no-open-quote|no-close-quote",
      "radial-extent": "closest-corner|closest-side|farthest-corner|farthest-side",
      "radial-gradient()": "radial-gradient( [<radial-gradient-syntax>] )",
      "radial-gradient-syntax": "[[[<radial-shape>||<radial-size>]? [at <position>]?]||<color-interpolation-method>]? , <color-stop-list>",
      "radial-shape": "circle|ellipse",
      "radial-size": "<radial-extent>|<length [0,∞]>|<length-percentage [0,∞]>{2}",
      "ratio": "<number [0,∞]> [/ <number [0,∞]>]?",
      "ray()": "ray( <angle>&&<ray-size>?&&contain?&&[at <position>]? )",
      "ray-size": "closest-side|closest-corner|farthest-side|farthest-corner|sides",
      "rect()": "rect( [<length-percentage>|auto]{4} [round <'border-radius'>]? )",
      "rectangular-color-space": "srgb|srgb-linear|display-p3|display-p3-linear|a98-rgb|prophoto-rgb|rec2020|lab|oklab|xyz|xyz-d50|xyz-d65",
      "relative-selector": "<combinator>? <complex-selector>",
      "relative-selector-list": "<relative-selector>#",
      "relative-size": "larger|smaller",
      "rem()": "rem( <calc-sum> , <calc-sum> )",
      "repeat-style": "repeat-x|repeat-y|[repeat|space|round|no-repeat]{1,2}",
      "repeating-conic-gradient()": "repeating-conic-gradient( [<conic-gradient-syntax>] )",
      "repeating-linear-gradient()": "repeating-linear-gradient( [<linear-gradient-syntax>] )",
      "repeating-radial-gradient()": "repeating-radial-gradient( [<radial-gradient-syntax>] )",
      "reversed-counter-name": "reversed( <counter-name> )",
      "rgb()": "rgb( <percentage>#{3} , <alpha-value>? )|rgb( <number>#{3} , <alpha-value>? )|rgb( [<number>|<percentage>|none]{3} [/ [<alpha-value>|none]]? )",
      "rgba()": "rgba( <percentage>#{3} , <alpha-value>? )|rgba( <number>#{3} , <alpha-value>? )|rgba( [<number>|<percentage>|none]{3} [/ [<alpha-value>|none]]? )",
      "rotate()": "rotate( [<angle>|<zero>] )",
      "rotate3d()": "rotate3d( <number> , <number> , <number> , [<angle>|<zero>] )",
      "rotateX()": "rotateX( [<angle>|<zero>] )",
      "rotateY()": "rotateY( [<angle>|<zero>] )",
      "rotateZ()": "rotateZ( [<angle>|<zero>] )",
      "round()": "round( <rounding-strategy>? , <calc-sum> , <calc-sum> )",
      "rounding-strategy": "nearest|up|down|to-zero",
      "saturate()": "saturate( [<number>|<percentage>]? )",
      "scale()": "scale( [<number>|<percentage>]#{1,2} )",
      "scale3d()": "scale3d( [<number>|<percentage>]#{3} )",
      "scaleX()": "scaleX( [<number>|<percentage>] )",
      "scaleY()": "scaleY( [<number>|<percentage>] )",
      "scaleZ()": "scaleZ( [<number>|<percentage>] )",
      "scope-end": "<forgiving-selector-list>",
      "scope-start": "<forgiving-selector-list>",
      "scroll()": "scroll( [<scroller>||<axis>]? )",
      "scroller": "root|nearest|self",
      "scroll-state-feature": "<media-query-list>",
      "scroll-state-in-parens": "( <scroll-state-query> )|( <scroll-state-feature> )|<general-enclosed>",
      "scroll-state-query": "not <scroll-state-in-parens>|<scroll-state-in-parens> [[and <scroll-state-in-parens>]*|[or <scroll-state-in-parens>]*]|<scroll-state-feature>",
      "selector-list": "<complex-selector-list>",
      "self-position": "center|start|end|self-start|self-end|flex-start|flex-end",
      "sepia()": "sepia( [<number>|<percentage>]? )",
      "shadow": "inset?&&<length>{2,4}&&<color>?",
      "shadow-t": "[<length>{2,3}&&<color>?]",
      "shape": "rect( <top> , <right> , <bottom> , <left> )|rect( <top> <right> <bottom> <left> )",
      "shape-box": "<visual-box>|margin-box",
      "side-or-corner": "[left|right]||[top|bottom]",
      "sign()": "sign( <calc-sum> )",
      "signed-integer": "<number-token>",
      "signless-integer": "<number-token>",
      "sin()": "sin( <calc-sum> )",
      "single-animation": "<'animation-duration'>||<easing-function>||<'animation-delay'>||<single-animation-iteration-count>||<single-animation-direction>||<single-animation-fill-mode>||<single-animation-play-state>||[none|<keyframes-name>]||<single-animation-timeline>",
      "single-animation-composition": "replace|add|accumulate",
      "single-animation-direction": "normal|reverse|alternate|alternate-reverse",
      "single-animation-fill-mode": "none|forwards|backwards|both",
      "single-animation-iteration-count": "infinite|<number>",
      "single-animation-play-state": "running|paused",
      "single-animation-timeline": "auto|none|<dashed-ident>|<scroll()>|<view()>",
      "single-transition": "[none|<single-transition-property>]||<time>||<easing-function>||<time>||<transition-behavior-value>",
      "single-transition-property": "all|<custom-ident>",
      "size": "closest-side|farthest-side|closest-corner|farthest-corner|<length>|<length-percentage>{2}",
      "size-feature": "<mf-plain>|<mf-boolean>|<mf-range>",
      "skew()": "skew( [<angle>|<zero>] , [<angle>|<zero>]? )",
      "skewX()": "skewX( [<angle>|<zero>] )",
      "skewY()": "skewY( [<angle>|<zero>] )",
      "sqrt()": "sqrt( <calc-sum> )",
      "step-position": "jump-start|jump-end|jump-none|jump-both|start|end",
      "step-easing-function": "step-start|step-end|<steps()>",
      "steps()": "steps( <integer> , <step-position>? )",
      "style-feature": "<declaration>",
      "style-in-parens": "( <style-condition> )|( <style-feature> )|<general-enclosed>",
      "style-query": "<style-condition>|<style-feature>",
      "subclass-selector": "<id-selector>|<class-selector>|<attribute-selector>|<pseudo-class-selector>",
      "superellipse()": "superellipse( [<number>|infinity|-infinity] )",
      "supports-condition": "not <supports-in-parens>|<supports-in-parens> [and <supports-in-parens>]*|<supports-in-parens> [or <supports-in-parens>]*",
      "supports-decl": "( <declaration> )",
      "supports-feature": "<supports-decl>|<supports-selector-fn>",
      "supports-in-parens": "( <supports-condition> )|<supports-feature>|<general-enclosed>",
      "supports-selector-fn": "selector( <complex-selector> )",
      "symbol": "<string>|<image>|<custom-ident>",
      "symbols()": "symbols( <symbols-type>? [<string>|<image>]+ )",
      "symbols-type": "cyclic|numeric|alphabetic|symbolic|fixed",
      "system-color": "AccentColor|AccentColorText|ActiveText|ButtonBorder|ButtonFace|ButtonText|Canvas|CanvasText|Field|FieldText|GrayText|Highlight|HighlightText|LinkText|Mark|MarkText|SelectedItem|SelectedItemText|VisitedText",
      "system-family-name": "caption|icon|menu|message-box|small-caption|status-bar",
      "tan()": "tan( <calc-sum> )",
      "target": "<target-counter()>|<target-counters()>|<target-text()>",
      "target-counter()": "target-counter( [<string>|<url>] , <custom-ident> , <counter-style>? )",
      "target-counters()": "target-counters( [<string>|<url>] , <custom-ident> , <string> , <counter-style>? )",
      "target-text()": "target-text( [<string>|<url>] , [content|before|after|first-letter]? )",
      "text-edge": "[text|cap|ex|ideographic|ideographic-ink] [text|alphabetic|ideographic|ideographic-ink]?",
      "time-percentage": "<time>|<percentage>",
      "timeline-range-name": "cover|contain|entry|exit|entry-crossing|exit-crossing",
      "track-breadth": "<length-percentage>|<flex>|min-content|max-content|auto",
      "track-list": "[<line-names>? [<track-size>|<track-repeat>]]+ <line-names>?",
      "track-repeat": "repeat( [<integer [1,∞]>] , [<line-names>? <track-size>]+ <line-names>? )",
      "track-size": "<track-breadth>|minmax( <inflexible-breadth> , <track-breadth> )|fit-content( <length-percentage> )",
      "transform-function": "<matrix()>|<translate()>|<translateX()>|<translateY()>|<scale()>|<scaleX()>|<scaleY()>|<rotate()>|<skew()>|<skewX()>|<skewY()>|<matrix3d()>|<translate3d()>|<translateZ()>|<scale3d()>|<scaleZ()>|<rotate3d()>|<rotateX()>|<rotateY()>|<rotateZ()>|<perspective()>",
      "transform-list": "<transform-function>+",
      "transition-behavior-value": "normal|allow-discrete",
      "translate()": "translate( <length-percentage> , <length-percentage>? )",
      "translate3d()": "translate3d( <length-percentage> , <length-percentage> , <length> )",
      "translateX()": "translateX( <length-percentage> )",
      "translateY()": "translateY( <length-percentage> )",
      "translateZ()": "translateZ( <length> )",
      "try-size": "most-width|most-height|most-block-size|most-inline-size",
      "try-tactic": "flip-block||flip-inline||flip-start",
      "type-or-unit": "string|color|url|integer|number|length|angle|time|frequency|cap|ch|em|ex|ic|lh|rlh|rem|vb|vi|vw|vh|vmin|vmax|mm|Q|cm|in|pt|pc|px|deg|grad|rad|turn|ms|s|Hz|kHz|%",
      "type-selector": "<wq-name>|<ns-prefix>? '*'",
      "var()": "var( <custom-property-name> , <declaration-value>? )",
      "view()": "view( [<axis>||<'view-timeline-inset'>]? )",
      "viewport-length": "auto|<length-percentage>",
      "visual-box": "content-box|padding-box|border-box",
      "wq-name": "<ns-prefix>? <ident-token>",
      "xywh()": "xywh( <length-percentage>{2} <length-percentage [0,∞]>{2} [round <'border-radius'>]? )",
      "xyz": "xyz|xyz-d50|xyz-d65",
      "xyz-params": "<xyz-space> [<number>|<percentage>|none]{3}",
      "-legacy-gradient": "<-webkit-gradient()>|<-legacy-linear-gradient>|<-legacy-repeating-linear-gradient>|<-legacy-radial-gradient>|<-legacy-repeating-radial-gradient>",
      "-legacy-linear-gradient": "-moz-linear-gradient( <-legacy-linear-gradient-arguments> )|-webkit-linear-gradient( <-legacy-linear-gradient-arguments> )|-o-linear-gradient( <-legacy-linear-gradient-arguments> )",
      "-legacy-repeating-linear-gradient": "-moz-repeating-linear-gradient( <-legacy-linear-gradient-arguments> )|-webkit-repeating-linear-gradient( <-legacy-linear-gradient-arguments> )|-o-repeating-linear-gradient( <-legacy-linear-gradient-arguments> )",
      "-legacy-linear-gradient-arguments": "[<angle>|<side-or-corner>]? , <color-stop-list>",
      "-legacy-radial-gradient": "-moz-radial-gradient( <-legacy-radial-gradient-arguments> )|-webkit-radial-gradient( <-legacy-radial-gradient-arguments> )|-o-radial-gradient( <-legacy-radial-gradient-arguments> )",
      "-legacy-repeating-radial-gradient": "-moz-repeating-radial-gradient( <-legacy-radial-gradient-arguments> )|-webkit-repeating-radial-gradient( <-legacy-radial-gradient-arguments> )|-o-repeating-radial-gradient( <-legacy-radial-gradient-arguments> )",
      "-legacy-radial-gradient-arguments": "[<position> ,]? [[[<-legacy-radial-gradient-shape>||<-legacy-radial-gradient-size>]|[<length>|<percentage>]{2}] ,]? <color-stop-list>",
      "-legacy-radial-gradient-size": "closest-side|closest-corner|farthest-side|farthest-corner|contain|cover",
      "-legacy-radial-gradient-shape": "circle|ellipse",
      "-non-standard-font": "-apple-system-body|-apple-system-headline|-apple-system-subheadline|-apple-system-caption1|-apple-system-caption2|-apple-system-footnote|-apple-system-short-body|-apple-system-short-headline|-apple-system-short-subheadline|-apple-system-short-caption1|-apple-system-short-footnote|-apple-system-tall-body",
      "-non-standard-color": "-moz-ButtonDefault|-moz-ButtonHoverFace|-moz-ButtonHoverText|-moz-CellHighlight|-moz-CellHighlightText|-moz-Combobox|-moz-ComboboxText|-moz-Dialog|-moz-DialogText|-moz-dragtargetzone|-moz-EvenTreeRow|-moz-Field|-moz-FieldText|-moz-html-CellHighlight|-moz-html-CellHighlightText|-moz-mac-accentdarkestshadow|-moz-mac-accentdarkshadow|-moz-mac-accentface|-moz-mac-accentlightesthighlight|-moz-mac-accentlightshadow|-moz-mac-accentregularhighlight|-moz-mac-accentregularshadow|-moz-mac-chrome-active|-moz-mac-chrome-inactive|-moz-mac-focusring|-moz-mac-menuselect|-moz-mac-menushadow|-moz-mac-menutextselect|-moz-MenuHover|-moz-MenuHoverText|-moz-MenuBarText|-moz-MenuBarHoverText|-moz-nativehyperlinktext|-moz-OddTreeRow|-moz-win-communicationstext|-moz-win-mediatext|-moz-activehyperlinktext|-moz-default-background-color|-moz-default-color|-moz-hyperlinktext|-moz-visitedhyperlinktext|-webkit-activelink|-webkit-focus-ring-color|-webkit-link|-webkit-text",
      "-non-standard-image-rendering": "optimize-contrast|-moz-crisp-edges|-o-crisp-edges|-webkit-optimize-contrast",
      "-non-standard-overflow": "overlay|-moz-scrollbars-none|-moz-scrollbars-horizontal|-moz-scrollbars-vertical|-moz-hidden-unscrollable",
      "-non-standard-size": "intrinsic|min-intrinsic|-webkit-fill-available|-webkit-fit-content|-webkit-min-content|-webkit-max-content|-moz-available|-moz-fit-content|-moz-min-content|-moz-max-content",
      "-webkit-gradient()": "-webkit-gradient( <-webkit-gradient-type> , <-webkit-gradient-point> [, <-webkit-gradient-point>|, <-webkit-gradient-radius> , <-webkit-gradient-point>] [, <-webkit-gradient-radius>]? [, <-webkit-gradient-color-stop>]* )",
      "-webkit-gradient-color-stop": "from( <color> )|color-stop( [<number-zero-one>|<percentage>] , <color> )|to( <color> )",
      "-webkit-gradient-point": "[left|center|right|<length-percentage>] [top|center|bottom|<length-percentage>]",
      "-webkit-gradient-radius": "<length>|<percentage>",
      "-webkit-gradient-type": "linear|radial",
      "-webkit-mask-box-repeat": "repeat|stretch|round",
      "-ms-filter-function-list": "<-ms-filter-function>+",
      "-ms-filter-function": "<-ms-filter-function-progid>|<-ms-filter-function-legacy>",
      "-ms-filter-function-progid": "'progid:' [<ident-token> '.']* [<ident-token>|<function-token> <any-value>? )]",
      "-ms-filter-function-legacy": "<ident-token>|<function-token> <any-value>? )",
      "age": "child|young|old",
      "attr-name": "<wq-name>",
      "attr-fallback": "<any-value>",
      "autospace": "no-autospace|[ideograph-alpha||ideograph-numeric||punctuation]||[insert|replace]",
      "bottom": "<length>|auto",
      "generic-voice": "[<age>? <gender> <integer>?]",
      "gender": "male|female|neutral",
      "generic-script-specific": "generic( kai )|generic( fangsong )|generic( nastaliq )",
      "-non-standard-generic-family": "-apple-system|BlinkMacSystemFont",
      "intrinsic-size-keyword": "min-content|max-content|fit-content",
      "left": "<length>|auto",
      "device-cmyk()": "<legacy-device-cmyk-syntax>|<modern-device-cmyk-syntax>",
      "legacy-device-cmyk-syntax": "device-cmyk( <number>#{4} )",
      "modern-device-cmyk-syntax": "device-cmyk( <cmyk-component>{4} [/ [<alpha-value>|none]]? )",
      "cmyk-component": "<number>|<percentage>|none",
      "color-space": "<rectangular-color-space>|<polar-color-space>|<custom-color-space>",
      "right": "<length>|auto",
      "forgiving-selector-list": "<complex-real-selector-list>",
      "forgiving-relative-selector-list": "<relative-real-selector-list>",
      "complex-real-selector-list": "<complex-real-selector>#",
      "simple-selector-list": "<simple-selector>#",
      "relative-real-selector-list": "<relative-real-selector>#",
      "complex-selector-unit": "[<compound-selector>? <pseudo-compound-selector>*]!",
      "complex-real-selector": "<compound-selector> [<combinator>? <compound-selector>]*",
      "relative-real-selector": "<combinator>? <complex-real-selector>",
      "pseudo-compound-selector": "<pseudo-element-selector> <pseudo-class-selector>*",
      "simple-selector": "<type-selector>|<subclass-selector>",
      "legacy-pseudo-element-selector": "':' [before|after|first-line|first-letter]",
      "svg-length": "<percentage>|<length>|<number>",
      "svg-writing-mode": "lr-tb|rl-tb|tb-rl|lr|rl|tb",
      "top": "<length>|auto",
      "x": "<number>",
      "y": "<number>",
      "declaration": "<ident-token> : <declaration-value>? ['!' important]?",
      "declaration-list": "[<declaration>? ';']* <declaration>?",
      "url": "url( <string> <url-modifier>* )|<url-token>",
      "url-modifier": "<ident>|<function-token> <any-value> )",
      "number-zero-one": "<number [0,1]>",
      "number-one-or-greater": "<number [1,∞]>",
      "xyz-space": "xyz|xyz-d50|xyz-d65",
      "style-condition": "not <style-in-parens>|<style-in-parens> [[and <style-in-parens>]*|[or <style-in-parens>]*]",
      "-non-standard-display": "-ms-inline-flexbox|-ms-grid|-ms-inline-grid|-webkit-flex|-webkit-inline-flex|-webkit-box|-webkit-inline-box|-moz-inline-stack|-moz-box|-moz-inline-box",
      "inset-area": "[[left|center|right|span-left|span-right|x-start|x-end|span-x-start|span-x-end|x-self-start|x-self-end|span-x-self-start|span-x-self-end|span-all]||[top|center|bottom|span-top|span-bottom|y-start|y-end|span-y-start|span-y-end|y-self-start|y-self-end|span-y-self-start|span-y-self-end|span-all]|[block-start|center|block-end|span-block-start|span-block-end|span-all]||[inline-start|center|inline-end|span-inline-start|span-inline-end|span-all]|[self-block-start|self-block-end|span-self-block-start|span-self-block-end|span-all]||[self-inline-start|self-inline-end|span-self-inline-start|span-self-inline-end|span-all]|[start|center|end|span-start|span-end|span-all]{1,2}|[self-start|center|self-end|span-self-start|span-self-end|span-all]{1,2}]",
      "syntax": "'*'|<syntax-component> [<syntax-combinator> <syntax-component>]*|<syntax-string>",
      "syntax-component": "<syntax-single-component> <syntax-multiplier>?|'<' transform-list '>'",
      "syntax-single-component": "'<' <syntax-type-name> '>'|<ident>",
      "syntax-type-name": "angle|color|custom-ident|image|integer|length|length-percentage|number|percentage|resolution|string|time|url|transform-function",
      "syntax-combinator": "'|'",
      "syntax-multiplier": "'#'|'+'",
      "syntax-string": "<string>"
    },
    "properties": {
      "--*": "<declaration-value>",
      "-ms-accelerator": "false|true",
      "-ms-block-progression": "tb|rl|bt|lr",
      "-ms-content-zoom-chaining": "none|chained",
      "-ms-content-zoom-limit": "<'-ms-content-zoom-limit-min'> <'-ms-content-zoom-limit-max'>",
      "-ms-content-zoom-limit-max": "<percentage>",
      "-ms-content-zoom-limit-min": "<percentage>",
      "-ms-content-zoom-snap": "<'-ms-content-zoom-snap-type'>||<'-ms-content-zoom-snap-points'>",
      "-ms-content-zoom-snap-points": "snapInterval( <percentage> , <percentage> )|snapList( <percentage># )",
      "-ms-content-zoom-snap-type": "none|proximity|mandatory",
      "-ms-content-zooming": "none|zoom",
      "-ms-filter": "<string>",
      "-ms-flow-from": "[none|<custom-ident>]#",
      "-ms-flow-into": "[none|<custom-ident>]#",
      "-ms-grid-columns": "none|<track-list>|<auto-track-list>",
      "-ms-grid-rows": "none|<track-list>|<auto-track-list>",
      "-ms-high-contrast-adjust": "auto|none",
      "-ms-hyphenate-limit-chars": "auto|<integer>{1,3}",
      "-ms-hyphenate-limit-lines": "no-limit|<integer>",
      "-ms-hyphenate-limit-zone": "<percentage>|<length>",
      "-ms-ime-align": "auto|after",
      "-ms-overflow-style": "auto|none|scrollbar|-ms-autohiding-scrollbar",
      "-ms-scroll-chaining": "chained|none",
      "-ms-scroll-limit": "<'-ms-scroll-limit-x-min'> <'-ms-scroll-limit-y-min'> <'-ms-scroll-limit-x-max'> <'-ms-scroll-limit-y-max'>",
      "-ms-scroll-limit-x-max": "auto|<length>",
      "-ms-scroll-limit-x-min": "<length>",
      "-ms-scroll-limit-y-max": "auto|<length>",
      "-ms-scroll-limit-y-min": "<length>",
      "-ms-scroll-rails": "none|railed",
      "-ms-scroll-snap-points-x": "snapInterval( <length-percentage> , <length-percentage> )|snapList( <length-percentage># )",
      "-ms-scroll-snap-points-y": "snapInterval( <length-percentage> , <length-percentage> )|snapList( <length-percentage># )",
      "-ms-scroll-snap-type": "none|proximity|mandatory",
      "-ms-scroll-snap-x": "<'-ms-scroll-snap-type'> <'-ms-scroll-snap-points-x'>",
      "-ms-scroll-snap-y": "<'-ms-scroll-snap-type'> <'-ms-scroll-snap-points-y'>",
      "-ms-scroll-translation": "none|vertical-to-horizontal",
      "-ms-scrollbar-3dlight-color": "<color>",
      "-ms-scrollbar-arrow-color": "<color>",
      "-ms-scrollbar-base-color": "<color>",
      "-ms-scrollbar-darkshadow-color": "<color>",
      "-ms-scrollbar-face-color": "<color>",
      "-ms-scrollbar-highlight-color": "<color>",
      "-ms-scrollbar-shadow-color": "<color>",
      "-ms-scrollbar-track-color": "<color>",
      "-ms-text-autospace": "none|ideograph-alpha|ideograph-numeric|ideograph-parenthesis|ideograph-space",
      "-ms-touch-select": "grippers|none",
      "-ms-user-select": "none|element|text",
      "-ms-wrap-flow": "auto|both|start|end|maximum|clear",
      "-ms-wrap-margin": "<length>",
      "-ms-wrap-through": "wrap|none",
      "-moz-appearance": "none|button|button-arrow-down|button-arrow-next|button-arrow-previous|button-arrow-up|button-bevel|button-focus|caret|checkbox|checkbox-container|checkbox-label|checkmenuitem|dualbutton|groupbox|listbox|listitem|menuarrow|menubar|menucheckbox|menuimage|menuitem|menuitemtext|menulist|menulist-button|menulist-text|menulist-textfield|menupopup|menuradio|menuseparator|meterbar|meterchunk|progressbar|progressbar-vertical|progresschunk|progresschunk-vertical|radio|radio-container|radio-label|radiomenuitem|range|range-thumb|resizer|resizerpanel|scale-horizontal|scalethumbend|scalethumb-horizontal|scalethumbstart|scalethumbtick|scalethumb-vertical|scale-vertical|scrollbarbutton-down|scrollbarbutton-left|scrollbarbutton-right|scrollbarbutton-up|scrollbarthumb-horizontal|scrollbarthumb-vertical|scrollbartrack-horizontal|scrollbartrack-vertical|searchfield|separator|sheet|spinner|spinner-downbutton|spinner-textfield|spinner-upbutton|splitter|statusbar|statusbarpanel|tab|tabpanel|tabpanels|tab-scroll-arrow-back|tab-scroll-arrow-forward|textfield|textfield-multiline|toolbar|toolbarbutton|toolbarbutton-dropdown|toolbargripper|toolbox|tooltip|treeheader|treeheadercell|treeheadersortarrow|treeitem|treeline|treetwisty|treetwistyopen|treeview|-moz-mac-unified-toolbar|-moz-win-borderless-glass|-moz-win-browsertabbar-toolbox|-moz-win-communicationstext|-moz-win-communications-toolbox|-moz-win-exclude-glass|-moz-win-glass|-moz-win-mediatext|-moz-win-media-toolbox|-moz-window-button-box|-moz-window-button-box-maximized|-moz-window-button-close|-moz-window-button-maximize|-moz-window-button-minimize|-moz-window-button-restore|-moz-window-frame-bottom|-moz-window-frame-left|-moz-window-frame-right|-moz-window-titlebar|-moz-window-titlebar-maximized",
      "-moz-binding": "<url>|none",
      "-moz-border-bottom-colors": "<color>+|none",
      "-moz-border-left-colors": "<color>+|none",
      "-moz-border-right-colors": "<color>+|none",
      "-moz-border-top-colors": "<color>+|none",
      "-moz-context-properties": "none|[fill|fill-opacity|stroke|stroke-opacity]#",
      "-moz-float-edge": "border-box|content-box|margin-box|padding-box",
      "-moz-force-broken-image-icon": "0|1",
      "-moz-orient": "inline|block|horizontal|vertical",
      "-moz-outline-radius": "<outline-radius>{1,4} [/ <outline-radius>{1,4}]?",
      "-moz-outline-radius-bottomleft": "<outline-radius>",
      "-moz-outline-radius-bottomright": "<outline-radius>",
      "-moz-outline-radius-topleft": "<outline-radius>",
      "-moz-outline-radius-topright": "<outline-radius>",
      "-moz-stack-sizing": "ignore|stretch-to-fit",
      "-moz-text-blink": "none|blink",
      "-moz-user-focus": "ignore|normal|select-after|select-before|select-menu|select-same|select-all|none",
      "-moz-user-input": "auto|none|enabled|disabled",
      "-moz-user-modify": "read-only|read-write|write-only",
      "-moz-window-dragging": "drag|no-drag",
      "-moz-window-shadow": "default|menu|tooltip|sheet|none",
      "-webkit-appearance": "none|button|button-bevel|caps-lock-indicator|caret|checkbox|default-button|inner-spin-button|listbox|listitem|media-controls-background|media-controls-fullscreen-background|media-current-time-display|media-enter-fullscreen-button|media-exit-fullscreen-button|media-fullscreen-button|media-mute-button|media-overlay-play-button|media-play-button|media-seek-back-button|media-seek-forward-button|media-slider|media-sliderthumb|media-time-remaining-display|media-toggle-closed-captions-button|media-volume-slider|media-volume-slider-container|media-volume-sliderthumb|menulist|menulist-button|menulist-text|menulist-textfield|meter|progress-bar|progress-bar-value|push-button|radio|scrollbarbutton-down|scrollbarbutton-left|scrollbarbutton-right|scrollbarbutton-up|scrollbargripper-horizontal|scrollbargripper-vertical|scrollbarthumb-horizontal|scrollbarthumb-vertical|scrollbartrack-horizontal|scrollbartrack-vertical|searchfield|searchfield-cancel-button|searchfield-decoration|searchfield-results-button|searchfield-results-decoration|slider-horizontal|slider-vertical|sliderthumb-horizontal|sliderthumb-vertical|square-button|textarea|textfield|-apple-pay-button",
      "-webkit-border-before": "<'border-width'>||<'border-style'>||<color>",
      "-webkit-border-before-color": "<color>",
      "-webkit-border-before-style": "<'border-style'>",
      "-webkit-border-before-width": "<'border-width'>",
      "-webkit-box-reflect": "[above|below|right|left]? <length>? <image>?",
      "-webkit-line-clamp": "none|<integer>",
      "-webkit-mask": "[<mask-reference>||<position> [/ <bg-size>]?||<repeat-style>||[<visual-box>|border|padding|content|text]||[<visual-box>|border|padding|content]]#",
      "-webkit-mask-attachment": "<attachment>#",
      "-webkit-mask-clip": "[<coord-box>|no-clip|border|padding|content|text]#",
      "-webkit-mask-composite": "<composite-style>#",
      "-webkit-mask-image": "<mask-reference>#",
      "-webkit-mask-origin": "[<coord-box>|border|padding|content]#",
      "-webkit-mask-position": "<position>#",
      "-webkit-mask-position-x": "[<length-percentage>|left|center|right]#",
      "-webkit-mask-position-y": "[<length-percentage>|top|center|bottom]#",
      "-webkit-mask-repeat": "<repeat-style>#",
      "-webkit-mask-repeat-x": "repeat|no-repeat|space|round",
      "-webkit-mask-repeat-y": "repeat|no-repeat|space|round",
      "-webkit-mask-size": "<bg-size>#",
      "-webkit-overflow-scrolling": "auto|touch",
      "-webkit-tap-highlight-color": "<color>",
      "-webkit-text-fill-color": "<color>",
      "-webkit-text-stroke": "<length>||<color>",
      "-webkit-text-stroke-color": "<color>",
      "-webkit-text-stroke-width": "<length>",
      "-webkit-touch-callout": "default|none",
      "-webkit-user-modify": "read-only|read-write|read-write-plaintext-only",
      "-webkit-user-select": "auto|none|text|all",
      "accent-color": "auto|<color>",
      "align-content": "normal|<baseline-position>|<content-distribution>|<overflow-position>? <content-position>",
      "align-items": "normal|stretch|<baseline-position>|[<overflow-position>? <self-position>]|anchor-center",
      "align-self": "auto|normal|stretch|<baseline-position>|<overflow-position>? <self-position>|anchor-center",
      "align-tracks": "[normal|<baseline-position>|<content-distribution>|<overflow-position>? <content-position>]#",
      "alignment-baseline": "auto|baseline|before-edge|text-before-edge|middle|central|after-edge|text-after-edge|ideographic|alphabetic|hanging|mathematical",
      "all": "initial|inherit|unset|revert|revert-layer",
      "anchor-name": "none|<dashed-ident>#",
      "anchor-scope": "none|all|<dashed-ident>#",
      "animation": "<single-animation>#",
      "animation-composition": "<single-animation-composition>#",
      "animation-delay": "<time>#",
      "animation-direction": "<single-animation-direction>#",
      "animation-duration": "[auto|<time [0s,∞]>]#",
      "animation-fill-mode": "<single-animation-fill-mode>#",
      "animation-iteration-count": "<single-animation-iteration-count>#",
      "animation-name": "[none|<keyframes-name>]#",
      "animation-play-state": "<single-animation-play-state>#",
      "animation-range": "[<'animation-range-start'> <'animation-range-end'>?]#",
      "animation-range-end": "[normal|<length-percentage>|<timeline-range-name> <length-percentage>?]#",
      "animation-range-start": "[normal|<length-percentage>|<timeline-range-name> <length-percentage>?]#",
      "animation-timeline": "<single-animation-timeline>#",
      "animation-timing-function": "<easing-function>#",
      "animation-trigger": "[none|[<dashed-ident> <animation-action>+]+]#",
      "appearance": "none|auto|<compat-auto>|<compat-special>",
      "aspect-ratio": "auto||<ratio>",
      "backdrop-filter": "none|<filter-value-list>",
      "backface-visibility": "visible|hidden",
      "background": "<bg-layer>#? , <final-bg-layer>",
      "background-attachment": "<attachment>#",
      "background-blend-mode": "<blend-mode>#",
      "background-clip": "<bg-clip>#",
      "background-color": "<color>",
      "background-image": "<bg-image>#",
      "background-origin": "<visual-box>#",
      "background-position": "<bg-position>#",
      "background-position-x": "[center|[[left|right|x-start|x-end]? <length-percentage>?]!]#",
      "background-position-y": "[center|[[top|bottom|y-start|y-end]? <length-percentage>?]!]#",
      "background-repeat": "<repeat-style>#",
      "background-size": "<bg-size>#",
      "baseline-shift": "baseline|sub|super|<svg-length>",
      "baseline-source": "auto|first|last",
      "block-size": "<'width'>",
      "border": "<line-width>||<line-style>||<color>",
      "border-block": "<'border-block-start'>",
      "border-block-color": "<'border-top-color'>{1,2}",
      "border-block-end": "<'border-top-width'>||<'border-top-style'>||<color>",
      "border-block-end-color": "<'border-top-color'>",
      "border-block-end-style": "<'border-top-style'>",
      "border-block-end-width": "<'border-top-width'>",
      "border-block-start": "<'border-top-width'>||<'border-top-style'>||<color>",
      "border-block-start-color": "<'border-top-color'>",
      "border-block-start-style": "<'border-top-style'>",
      "border-block-start-width": "<'border-top-width'>",
      "border-block-style": "<'border-top-style'>{1,2}",
      "border-block-width": "<'border-top-width'>{1,2}",
      "border-bottom": "<line-width>||<line-style>||<color>",
      "border-bottom-color": "<'border-top-color'>",
      "border-bottom-left-radius": "<length-percentage [0,∞]>{1,2}",
      "border-bottom-right-radius": "<length-percentage [0,∞]>{1,2}",
      "border-bottom-style": "<line-style>",
      "border-bottom-width": "<line-width>",
      "border-collapse": "separate|collapse",
      "border-color": "<color>{1,4}",
      "border-end-end-radius": "<'border-top-left-radius'>",
      "border-end-start-radius": "<'border-top-left-radius'>",
      "border-image": "<'border-image-source'>||<'border-image-slice'> [/ <'border-image-width'>|/ <'border-image-width'>? / <'border-image-outset'>]?||<'border-image-repeat'>",
      "border-image-outset": "[<length [0,∞]>|<number [0,∞]>]{1,4}",
      "border-image-repeat": "[stretch|repeat|round|space]{1,2}",
      "border-image-slice": "[<number [0,∞]>|<percentage [0,∞]>]{1,4}&&fill?",
      "border-image-source": "none|<image>",
      "border-image-width": "[<length-percentage [0,∞]>|<number [0,∞]>|auto]{1,4}",
      "border-inline": "<'border-block-start'>",
      "border-inline-color": "<'border-top-color'>{1,2}",
      "border-inline-end": "<'border-top-width'>||<'border-top-style'>||<color>",
      "border-inline-end-color": "<'border-top-color'>",
      "border-inline-end-style": "<'border-top-style'>",
      "border-inline-end-width": "<'border-top-width'>",
      "border-inline-start": "<'border-top-width'>||<'border-top-style'>||<color>",
      "border-inline-start-color": "<'border-top-color'>",
      "border-inline-start-style": "<'border-top-style'>",
      "border-inline-start-width": "<'border-top-width'>",
      "border-inline-style": "<'border-top-style'>{1,2}",
      "border-inline-width": "<'border-top-width'>{1,2}",
      "border-left": "<line-width>||<line-style>||<color>",
      "border-left-color": "<color>",
      "border-left-style": "<line-style>",
      "border-left-width": "<line-width>",
      "border-radius": "<length-percentage [0,∞]>{1,4} [/ <length-percentage [0,∞]>{1,4}]?",
      "border-right": "<line-width>||<line-style>||<color>",
      "border-right-color": "<color>",
      "border-right-style": "<line-style>",
      "border-right-width": "<line-width>",
      "border-spacing": "<length>{1,2}",
      "border-start-end-radius": "<'border-top-left-radius'>",
      "border-start-start-radius": "<'border-top-left-radius'>",
      "border-style": "<line-style>{1,4}",
      "border-top": "<line-width>||<line-style>||<color>",
      "border-top-color": "<color>",
      "border-top-left-radius": "<length-percentage [0,∞]>{1,2}",
      "border-top-right-radius": "<length-percentage [0,∞]>{1,2}",
      "border-top-style": "<line-style>",
      "border-top-width": "<line-width>",
      "border-width": "<line-width>{1,4}",
      "bottom": "auto|<length-percentage>|<anchor()>|<anchor-size()>",
      "box-align": "start|center|end|baseline|stretch",
      "box-decoration-break": "slice|clone",
      "box-direction": "normal|reverse|inherit",
      "box-flex": "<number>",
      "box-flex-group": "<integer>",
      "box-lines": "single|multiple",
      "box-ordinal-group": "<integer>",
      "box-orient": "horizontal|vertical|inline-axis|block-axis|inherit",
      "box-pack": "start|center|end|justify",
      "box-shadow": "none|<shadow>#",
      "box-sizing": "content-box|border-box",
      "break-after": "auto|avoid|always|all|avoid-page|page|left|right|recto|verso|avoid-column|column|avoid-region|region",
      "break-before": "auto|avoid|always|all|avoid-page|page|left|right|recto|verso|avoid-column|column|avoid-region|region",
      "break-inside": "auto|avoid|avoid-page|avoid-column|avoid-region",
      "caption-side": "top|bottom",
      "caret": "<'caret-color'>||<'caret-animation'>||<'caret-shape'>",
      "caret-animation": "auto|manual",
      "caret-color": "auto|<color>",
      "caret-shape": "auto|bar|block|underscore",
      "clear": "none|left|right|both|inline-start|inline-end",
      "clip": "<shape>|auto",
      "clip-path": "<clip-source>|[<basic-shape>||<geometry-box>]|none",
      "clip-rule": "nonzero|evenodd",
      "color": "<color>",
      "color-interpolation-filters": "auto|sRGB|linearRGB",
      "color-scheme": "normal|[light|dark|<custom-ident>]+&&only?",
      "column-count": "<integer>|auto",
      "column-fill": "auto|balance",
      "column-gap": "normal|<length-percentage>",
      "column-height": "auto|<length [0,∞]>",
      "column-rule": "<'column-rule-width'>||<'column-rule-style'>||<'column-rule-color'>",
      "column-rule-color": "<color>",
      "column-rule-style": "<'border-style'>",
      "column-rule-width": "<'border-width'>",
      "column-span": "none|all",
      "column-width": "auto|<length [0,∞]>",
      "column-wrap": "auto|nowrap|wrap",
      "columns": "[<'column-width'>||<'column-count'>] [/ <'column-height'>]?",
      "contain": "none|strict|content|[[size||inline-size]||layout||style||paint]",
      "contain-intrinsic-block-size": "auto? [none|<length>]",
      "contain-intrinsic-height": "auto? [none|<length>]",
      "contain-intrinsic-inline-size": "auto? [none|<length>]",
      "contain-intrinsic-size": "[auto? [none|<length>]]{1,2}",
      "contain-intrinsic-width": "auto? [none|<length>]",
      "container": "<'container-name'> [/ <'container-type'>]?",
      "container-name": "none|<custom-ident>+",
      "container-type": "normal||[size|inline-size]",
      "content": "normal|none|[<content-replacement>|<content-list>] [/ [<string>|<counter>|<attr()>]+]?",
      "content-visibility": "visible|auto|hidden",
      "corner-block-end-shape": "<corner-shape-value>{1,2}",
      "corner-block-start-shape": "<corner-shape-value>{1,2}",
      "corner-bottom-shape": "<corner-shape-value>{1,2}",
      "corner-bottom-left-shape": "<corner-shape-value>",
      "corner-bottom-right-shape": "<corner-shape-value>",
      "corner-end-end-shape": "<corner-shape-value>",
      "corner-end-start-shape": "<corner-shape-value>",
      "corner-inline-end-shape": "<corner-shape-value>{1,2}",
      "corner-inline-start-shape": "<corner-shape-value>{1,2}",
      "corner-left-shape": "<corner-shape-value>{1,2}",
      "corner-right-shape": "<corner-shape-value>{1,2}",
      "corner-shape": "<corner-shape-value>{1,4}",
      "corner-start-start-shape": "<corner-shape-value>",
      "corner-start-end-shape": "<corner-shape-value>",
      "corner-top-shape": "<corner-shape-value>{1,2}",
      "corner-top-left-shape": "<corner-shape-value>",
      "corner-top-right-shape": "<corner-shape-value>",
      "counter-increment": "[<counter-name> <integer>?]+|none",
      "counter-reset": "[<counter-name> <integer>?|<reversed-counter-name> <integer>?]+|none",
      "counter-set": "[<counter-name> <integer>?]+|none",
      "cursor": "[[<url> [<x> <y>]? ,]* [auto|default|none|context-menu|help|pointer|progress|wait|cell|crosshair|text|vertical-text|alias|copy|move|no-drop|not-allowed|e-resize|n-resize|ne-resize|nw-resize|s-resize|se-resize|sw-resize|w-resize|ew-resize|ns-resize|nesw-resize|nwse-resize|col-resize|row-resize|all-scroll|zoom-in|zoom-out|grab|grabbing|hand|-webkit-grab|-webkit-grabbing|-webkit-zoom-in|-webkit-zoom-out|-moz-grab|-moz-grabbing|-moz-zoom-in|-moz-zoom-out]]",
      "cx": "<length>|<percentage>",
      "cy": "<length>|<percentage>",
      "d": "none|path( <string> )",
      "direction": "ltr|rtl",
      "display": "[<display-outside>||<display-inside>]|<display-listitem>|<display-internal>|<display-box>|<display-legacy>|<-non-standard-display>",
      "dominant-baseline": "auto|use-script|no-change|reset-size|ideographic|alphabetic|hanging|mathematical|central|middle|text-after-edge|text-before-edge",
      "dynamic-range-limit": "standard|no-limit|constrained|<dynamic-range-limit-mix()>",
      "empty-cells": "show|hide",
      "field-sizing": "content|fixed",
      "fill": "<paint>",
      "fill-opacity": "<number-zero-one>|<percentage>",
      "fill-rule": "nonzero|evenodd",
      "filter": "none|<filter-value-list>|<-ms-filter-function-list>",
      "flex": "none|[<'flex-grow'> <'flex-shrink'>?||<'flex-basis'>]",
      "flex-basis": "content|<'width'>",
      "flex-direction": "row|row-reverse|column|column-reverse",
      "flex-flow": "<'flex-direction'>||<'flex-wrap'>",
      "flex-grow": "<number>",
      "flex-shrink": "<number>",
      "flex-wrap": "nowrap|wrap|wrap-reverse",
      "float": "left|right|none|inline-start|inline-end",
      "flood-color": "<color>",
      "flood-opacity": "<'opacity'>",
      "font": "[[<'font-style'>||<font-variant-css2>||<'font-weight'>||<font-width-css3>]? <'font-size'> [/ <'line-height'>]? <'font-family'>#]|<system-family-name>|<-non-standard-font>",
      "font-family": "[<family-name>|<generic-family>]#",
      "font-feature-settings": "normal|<feature-tag-value>#",
      "font-kerning": "auto|normal|none",
      "font-language-override": "normal|<string>",
      "font-optical-sizing": "auto|none",
      "font-palette": "normal|light|dark|<palette-identifier>|<palette-mix()>",
      "font-size": "<absolute-size>|<relative-size>|<length-percentage [0,∞]>|math",
      "font-size-adjust": "none|[ex-height|cap-height|ch-width|ic-width|ic-height]? [from-font|<number>]",
      "font-smooth": "auto|never|always|<absolute-size>|<length>",
      "font-stretch": "<font-stretch-absolute>",
      "font-style": "normal|italic|oblique <angle>?",
      "font-synthesis": "none|[weight||style||small-caps||position]",
      "font-synthesis-position": "auto|none",
      "font-synthesis-small-caps": "auto|none",
      "font-synthesis-style": "auto|none",
      "font-synthesis-weight": "auto|none",
      "font-variant": "normal|none|[<common-lig-values>||<discretionary-lig-values>||<historical-lig-values>||<contextual-alt-values>||stylistic( <feature-value-name> )||historical-forms||styleset( <feature-value-name># )||character-variant( <feature-value-name># )||swash( <feature-value-name> )||ornaments( <feature-value-name> )||annotation( <feature-value-name> )||[small-caps|all-small-caps|petite-caps|all-petite-caps|unicase|titling-caps]||<numeric-figure-values>||<numeric-spacing-values>||<numeric-fraction-values>||ordinal||slashed-zero||<east-asian-variant-values>||<east-asian-width-values>||ruby]",
      "font-variant-alternates": "normal|[stylistic( <feature-value-name> )||historical-forms||styleset( <feature-value-name># )||character-variant( <feature-value-name># )||swash( <feature-value-name> )||ornaments( <feature-value-name> )||annotation( <feature-value-name> )]",
      "font-variant-caps": "normal|small-caps|all-small-caps|petite-caps|all-petite-caps|unicase|titling-caps",
      "font-variant-east-asian": "normal|[<east-asian-variant-values>||<east-asian-width-values>||ruby]",
      "font-variant-emoji": "normal|text|emoji|unicode",
      "font-variant-ligatures": "normal|none|[<common-lig-values>||<discretionary-lig-values>||<historical-lig-values>||<contextual-alt-values>]",
      "font-variant-numeric": "normal|[<numeric-figure-values>||<numeric-spacing-values>||<numeric-fraction-values>||ordinal||slashed-zero]",
      "font-variant-position": "normal|sub|super",
      "font-variation-settings": "normal|[<string> <number>]#",
      "font-weight": "<font-weight-absolute>|bolder|lighter",
      "font-width": "normal|<percentage [0,∞]>|ultra-condensed|extra-condensed|condensed|semi-condensed|semi-expanded|expanded|extra-expanded|ultra-expanded",
      "forced-color-adjust": "auto|none|preserve-parent-color",
      "gap": "<'row-gap'> <'column-gap'>?",
      "grid": "<'grid-template'>|<'grid-template-rows'> / [auto-flow&&dense?] <'grid-auto-columns'>?|[auto-flow&&dense?] <'grid-auto-rows'>? / <'grid-template-columns'>",
      "grid-area": "<grid-line> [/ <grid-line>]{0,3}",
      "grid-auto-columns": "<track-size>+",
      "grid-auto-flow": "[row|column]||dense",
      "grid-auto-rows": "<track-size>+",
      "grid-column": "<grid-line> [/ <grid-line>]?",
      "grid-column-end": "<grid-line>",
      "grid-column-gap": "<length-percentage>",
      "grid-column-start": "<grid-line>",
      "grid-gap": "<'grid-row-gap'> <'grid-column-gap'>?",
      "grid-row": "<grid-line> [/ <grid-line>]?",
      "grid-row-end": "<grid-line>",
      "grid-row-gap": "<length-percentage>",
      "grid-row-start": "<grid-line>",
      "grid-template": "none|[<'grid-template-rows'> / <'grid-template-columns'>]|[<line-names>? <string> <track-size>? <line-names>?]+ [/ <explicit-track-list>]?",
      "grid-template-areas": "none|<string>+",
      "grid-template-columns": "none|<track-list>|<auto-track-list>|subgrid <line-name-list>?",
      "grid-template-rows": "none|<track-list>|<auto-track-list>|subgrid <line-name-list>?",
      "hanging-punctuation": "none|[first||[force-end|allow-end]||last]",
      "height": "auto|<length-percentage [0,∞]>|min-content|max-content|fit-content|fit-content( <length-percentage [0,∞]> )|<calc-size()>|<anchor-size()>|stretch|<-non-standard-size>",
      "hyphenate-character": "auto|<string>",
      "hyphenate-limit-chars": "[auto|<integer>]{1,3}",
      "hyphens": "none|manual|auto",
      "image-orientation": "from-image|<angle>|[<angle>? flip]",
      "image-rendering": "auto|crisp-edges|pixelated|smooth|optimizeSpeed|optimizeQuality|<-non-standard-image-rendering>",
      "image-resolution": "[from-image||<resolution>]&&snap?",
      "ime-mode": "auto|normal|active|inactive|disabled",
      "initial-letter": "normal|[<number> <integer>?]",
      "initial-letter-align": "[auto|alphabetic|hanging|ideographic]",
      "inline-size": "<'width'>",
      "inset": "<'top'>{1,4}",
      "inset-block": "<'top'>{1,2}",
      "inset-block-end": "<'top'>",
      "inset-block-start": "<'top'>",
      "inset-inline": "<'top'>{1,2}",
      "inset-inline-end": "<'top'>",
      "inset-inline-start": "<'top'>",
      "interpolate-size": "numeric-only|allow-keywords",
      "isolation": "auto|isolate",
      "interactivity": "auto|inert",
      "interest-delay": "<'interest-delay-start'>{1,2}",
      "interest-delay-end": "normal|<time>",
      "interest-delay-start": "normal|<time>",
      "justify-content": "normal|<content-distribution>|<overflow-position>? [<content-position>|left|right]",
      "justify-items": "normal|stretch|<baseline-position>|<overflow-position>? [<self-position>|left|right]|legacy|legacy&&[left|right|center]|anchor-center",
      "justify-self": "auto|normal|stretch|<baseline-position>|<overflow-position>? [<self-position>|left|right]|anchor-center",
      "justify-tracks": "[normal|<content-distribution>|<overflow-position>? [<content-position>|left|right]]#",
      "left": "auto|<length-percentage>|<anchor()>|<anchor-size()>",
      "letter-spacing": "normal|<length-percentage>",
      "lighting-color": "<color>",
      "line-break": "auto|loose|normal|strict|anywhere",
      "line-clamp": "none|<integer>",
      "line-height": "normal|<number>|<length>|<percentage>",
      "line-height-step": "<length>",
      "list-style": "<'list-style-type'>||<'list-style-position'>||<'list-style-image'>",
      "list-style-image": "<image>|none",
      "list-style-position": "inside|outside",
      "list-style-type": "<counter-style>|<string>|none",
      "margin": "<'margin-top'>{1,4}",
      "margin-block": "<'margin-top'>{1,2}",
      "margin-block-end": "<'margin-top'>",
      "margin-block-start": "<'margin-top'>",
      "margin-bottom": "<length-percentage>|auto|<anchor-size()>",
      "margin-inline": "<'margin-top'>{1,2}",
      "margin-inline-end": "<'margin-top'>",
      "margin-inline-start": "<'margin-top'>",
      "margin-left": "<length-percentage>|auto|<anchor-size()>",
      "margin-right": "<length-percentage>|auto|<anchor-size()>",
      "margin-top": "<length-percentage>|auto|<anchor-size()>",
      "margin-trim": "none|in-flow|all",
      "marker": "none|<url>",
      "marker-end": "none|<url>",
      "marker-mid": "none|<url>",
      "marker-start": "none|<url>",
      "mask": "<mask-layer>#",
      "mask-border": "<'mask-border-source'>||<'mask-border-slice'> [/ <'mask-border-width'>? [/ <'mask-border-outset'>]?]?||<'mask-border-repeat'>||<'mask-border-mode'>",
      "mask-border-mode": "luminance|alpha",
      "mask-border-outset": "[<length>|<number>]{1,4}",
      "mask-border-repeat": "[stretch|repeat|round|space]{1,2}",
      "mask-border-slice": "<number-percentage>{1,4} fill?",
      "mask-border-source": "none|<image>",
      "mask-border-width": "[<length-percentage>|<number>|auto]{1,4}",
      "mask-clip": "[<coord-box>|no-clip]#",
      "mask-composite": "<compositing-operator>#",
      "mask-image": "<mask-reference>#",
      "mask-mode": "<masking-mode>#",
      "mask-origin": "<coord-box>#",
      "mask-position": "<position>#",
      "mask-repeat": "<repeat-style>#",
      "mask-size": "<bg-size>#",
      "mask-type": "luminance|alpha",
      "masonry-auto-flow": "[pack|next]||[definite-first|ordered]",
      "math-depth": "auto-add|add( <integer> )|<integer>",
      "math-shift": "normal|compact",
      "math-style": "normal|compact",
      "max-block-size": "<'max-width'>",
      "max-height": "none|<length-percentage [0,∞]>|min-content|max-content|fit-content|fit-content( <length-percentage [0,∞]> )|<calc-size()>|<anchor-size()>|stretch|<-non-standard-size>",
      "max-inline-size": "<'max-width'>",
      "max-lines": "none|<integer>",
      "max-width": "none|<length-percentage [0,∞]>|min-content|max-content|fit-content|fit-content( <length-percentage [0,∞]> )|<calc-size()>|<anchor-size()>|stretch|<-non-standard-size>",
      "min-block-size": "<'min-width'>",
      "min-height": "auto|<length-percentage [0,∞]>|min-content|max-content|fit-content|fit-content( <length-percentage [0,∞]> )|<calc-size()>|<anchor-size()>|stretch|<-non-standard-size>",
      "min-inline-size": "<'min-width'>",
      "min-width": "auto|<length-percentage [0,∞]>|min-content|max-content|fit-content|fit-content( <length-percentage [0,∞]> )|<calc-size()>|<anchor-size()>|stretch|<-non-standard-size>",
      "mix-blend-mode": "<blend-mode>|plus-darker|plus-lighter",
      "object-fit": "fill|contain|cover|none|scale-down",
      "object-position": "<position>",
      "object-view-box": "none|<basic-shape-rect>",
      "offset": "[<'offset-position'>? [<'offset-path'> [<'offset-distance'>||<'offset-rotate'>]?]?]! [/ <'offset-anchor'>]?",
      "offset-anchor": "auto|<position>",
      "offset-distance": "<length-percentage>",
      "offset-path": "none|<offset-path>||<coord-box>",
      "offset-position": "normal|auto|<position>",
      "offset-rotate": "[auto|reverse]||<angle>",
      "opacity": "<opacity-value>",
      "order": "<integer>",
      "orphans": "<integer>",
      "outline": "<'outline-width'>||<'outline-style'>||<'outline-color'>",
      "outline-color": "auto|<color>",
      "outline-offset": "<length>",
      "outline-style": "auto|<outline-line-style>",
      "outline-width": "<line-width>",
      "overflow": "[visible|hidden|clip|scroll|auto]{1,2}|<-non-standard-overflow>",
      "overflow-anchor": "auto|none",
      "overflow-block": "visible|hidden|clip|scroll|auto|<-non-standard-overflow>",
      "overflow-clip-box": "padding-box|content-box",
      "overflow-clip-margin": "<visual-box>||<length [0,∞]>",
      "overflow-inline": "visible|hidden|clip|scroll|auto|<-non-standard-overflow>",
      "overflow-wrap": "normal|break-word|anywhere",
      "overflow-x": "visible|hidden|clip|scroll|auto|<-non-standard-overflow>",
      "overflow-y": "visible|hidden|clip|scroll|auto|<-non-standard-overflow>",
      "overlay": "none|auto",
      "overscroll-behavior": "[contain|none|auto]{1,2}",
      "overscroll-behavior-block": "contain|none|auto",
      "overscroll-behavior-inline": "contain|none|auto",
      "overscroll-behavior-x": "contain|none|auto",
      "overscroll-behavior-y": "contain|none|auto",
      "padding": "<'padding-top'>{1,4}",
      "padding-block": "<'padding-top'>{1,2}",
      "padding-block-end": "<'padding-top'>",
      "padding-block-start": "<'padding-top'>",
      "padding-bottom": "<length-percentage [0,∞]>",
      "padding-inline": "<'padding-top'>{1,2}",
      "padding-inline-end": "<'padding-top'>",
      "padding-inline-start": "<'padding-top'>",
      "padding-left": "<length-percentage [0,∞]>",
      "padding-right": "<length-percentage [0,∞]>",
      "padding-top": "<length-percentage [0,∞]>",
      "page": "auto|<custom-ident>",
      "page-break-after": "auto|always|avoid|left|right|recto|verso",
      "page-break-before": "auto|always|avoid|left|right|recto|verso",
      "page-break-inside": "auto|avoid",
      "paint-order": "normal|[fill||stroke||markers]",
      "perspective": "none|<length>",
      "perspective-origin": "<position>",
      "place-content": "<'align-content'> <'justify-content'>?",
      "place-items": "<'align-items'> <'justify-items'>?",
      "place-self": "<'align-self'> <'justify-self'>?",
      "pointer-events": "auto|none|visiblePainted|visibleFill|visibleStroke|visible|painted|fill|stroke|all|inherit",
      "position": "static|relative|absolute|sticky|fixed|-webkit-sticky",
      "position-anchor": "auto|none|<anchor-name>",
      "position-area": "none|<position-area>",
      "position-try": "<'position-try-order'>? <'position-try-fallbacks'>",
      "position-try-fallbacks": "none|[[<dashed-ident>||<try-tactic>]|<'position-area'>]#",
      "position-try-order": "normal|<try-size>",
      "position-visibility": "always|[anchors-valid||anchors-visible||no-overflow]",
      "print-color-adjust": "economy|exact",
      "quotes": "none|auto|[<string> <string>]+",
      "r": "<length>|<percentage>",
      "reading-flow": "normal|source-order|flex-visual|flex-flow|grid-rows|grid-columns|grid-order",
      "reading-order": "<integer>",
      "resize": "none|both|horizontal|vertical|block|inline",
      "right": "auto|<length-percentage>|<anchor()>|<anchor-size()>",
      "rotate": "none|<angle>|[x|y|z|<number>{3}]&&<angle>",
      "row-gap": "normal|<length-percentage>",
      "ruby-align": "start|center|space-between|space-around",
      "ruby-merge": "separate|collapse|auto",
      "ruby-overhang": "auto|none",
      "ruby-position": "[alternate||[over|under]]|inter-character",
      "rx": "<length>|<percentage>",
      "ry": "<length>|<percentage>",
      "scale": "none|[<number>|<percentage>]{1,3}",
      "scroll-behavior": "auto|smooth",
      "scroll-initial-target": "none|nearest",
      "scroll-margin": "<length>{1,4}",
      "scroll-margin-block": "<length>{1,2}",
      "scroll-margin-block-end": "<length>",
      "scroll-margin-block-start": "<length>",
      "scroll-margin-bottom": "<length>",
      "scroll-margin-inline": "<length>{1,2}",
      "scroll-margin-inline-end": "<length>",
      "scroll-margin-inline-start": "<length>",
      "scroll-margin-left": "<length>",
      "scroll-margin-right": "<length>",
      "scroll-margin-top": "<length>",
      "scroll-marker-group": "none|before|after",
      "scroll-padding": "[auto|<length-percentage>]{1,4}",
      "scroll-padding-block": "[auto|<length-percentage>]{1,2}",
      "scroll-padding-block-end": "auto|<length-percentage>",
      "scroll-padding-block-start": "auto|<length-percentage>",
      "scroll-padding-bottom": "auto|<length-percentage>",
      "scroll-padding-inline": "[auto|<length-percentage>]{1,2}",
      "scroll-padding-inline-end": "auto|<length-percentage>",
      "scroll-padding-inline-start": "auto|<length-percentage>",
      "scroll-padding-left": "auto|<length-percentage>",
      "scroll-padding-right": "auto|<length-percentage>",
      "scroll-padding-top": "auto|<length-percentage>",
      "scroll-snap-align": "[none|start|end|center]{1,2}",
      "scroll-snap-coordinate": "none|<position>#",
      "scroll-snap-destination": "<position>",
      "scroll-snap-points-x": "none|repeat( <length-percentage> )",
      "scroll-snap-points-y": "none|repeat( <length-percentage> )",
      "scroll-snap-stop": "normal|always",
      "scroll-snap-type": "none|[x|y|block|inline|both] [mandatory|proximity]?",
      "scroll-snap-type-x": "none|mandatory|proximity",
      "scroll-snap-type-y": "none|mandatory|proximity",
      "scroll-target-group": "none|auto",
      "scroll-timeline": "[<'scroll-timeline-name'> <'scroll-timeline-axis'>?]#",
      "scroll-timeline-axis": "[block|inline|x|y]#",
      "scroll-timeline-name": "[none|<dashed-ident>]#",
      "scrollbar-color": "auto|<color>{2}",
      "scrollbar-gutter": "auto|stable&&both-edges?",
      "scrollbar-width": "auto|thin|none",
      "shape-image-threshold": "<opacity-value>",
      "shape-margin": "<length-percentage>",
      "shape-outside": "none|[<shape-box>||<basic-shape>]|<image>",
      "shape-rendering": "auto|optimizeSpeed|crispEdges|geometricPrecision",
      "speak-as": "normal|spell-out||digits||[literal-punctuation|no-punctuation]",
      "stop-color": "<'color'>",
      "stop-opacity": "<'opacity'>",
      "stroke": "<paint>",
      "stroke-color": "<color>",
      "stroke-dasharray": "none|[<svg-length>+]#",
      "stroke-dashoffset": "<svg-length>",
      "stroke-linecap": "butt|round|square",
      "stroke-linejoin": "miter|round|bevel",
      "stroke-miterlimit": "<number-one-or-greater>",
      "stroke-opacity": "<'opacity'>",
      "stroke-width": "<svg-length>",
      "tab-size": "<integer>|<length>",
      "table-layout": "auto|fixed",
      "text-align": "start|end|left|right|center|justify|match-parent",
      "text-align-last": "auto|start|end|left|right|center|justify",
      "text-anchor": "start|middle|end",
      "text-autospace": "normal|<autospace>|auto",
      "text-box": "normal|<'text-box-trim'>||<'text-box-edge'>",
      "text-box-edge": "auto|<text-edge>",
      "text-box-trim": "none|trim-start|trim-end|trim-both",
      "text-combine-upright": "none|all|[digits <integer>?]",
      "text-decoration": "<'text-decoration-line'>||<'text-decoration-style'>||<'text-decoration-color'>||<'text-decoration-thickness'>",
      "text-decoration-color": "<color>",
      "text-decoration-inset": "<length>{1,2}|auto",
      "text-decoration-line": "none|[underline||overline||line-through||blink]|spelling-error|grammar-error",
      "text-decoration-skip": "none|[objects||[spaces|[leading-spaces||trailing-spaces]]||edges||box-decoration]",
      "text-decoration-skip-ink": "auto|all|none",
      "text-decoration-style": "solid|double|dotted|dashed|wavy",
      "text-decoration-thickness": "auto|from-font|<length>|<percentage>",
      "text-emphasis": "<'text-emphasis-style'>||<'text-emphasis-color'>",
      "text-emphasis-color": "<color>",
      "text-emphasis-position": "auto|[over|under]&&[right|left]?",
      "text-emphasis-style": "none|[[filled|open]||[dot|circle|double-circle|triangle|sesame]]|<string>",
      "text-indent": "<length-percentage>&&hanging?&&each-line?",
      "text-justify": "auto|inter-character|inter-word|none",
      "text-orientation": "mixed|upright|sideways",
      "text-overflow": "[clip|ellipsis|<string>]{1,2}",
      "text-rendering": "auto|optimizeSpeed|optimizeLegibility|geometricPrecision",
      "text-shadow": "none|<shadow-t>#",
      "text-size-adjust": "none|auto|<percentage>",
      "text-spacing-trim": "space-all|normal|space-first|trim-start",
      "text-transform": "none|[capitalize|uppercase|lowercase]||full-width||full-size-kana|math-auto",
      "text-underline-offset": "auto|<length>|<percentage>",
      "text-underline-position": "auto|from-font|[under||[left|right]]",
      "text-wrap": "<'text-wrap-mode'>||<'text-wrap-style'>",
      "text-wrap-mode": "wrap|nowrap",
      "text-wrap-style": "auto|balance|stable|pretty",
      "timeline-scope": "none|<dashed-ident>#",
      "timeline-trigger": "none|[<'timeline-trigger-name'> <'timeline-trigger-source'> <'timeline-trigger-range'> ['/' <'timeline-trigger-exit-range'>]?]#",
      "timeline-trigger-name": "none|<dashed-ident>#",
      "timeline-trigger-exit-range": "[<'timeline-trigger-exit-range-start'> <'timeline-trigger-exit-range-end'>?]#",
      "timeline-trigger-exit-range-end": "[auto|normal|<length-percentage>|<timeline-range-name> <length-percentage>?]#",
      "timeline-trigger-exit-range-start": "[auto|normal|<length-percentage>|<timeline-range-name> <length-percentage>?]#",
      "timeline-trigger-range": "[<'timeline-trigger-range-start'> <'timeline-trigger-range-end'>?]#",
      "timeline-trigger-range-end": "[normal|<length-percentage>|<timeline-range-name> <length-percentage>?]#",
      "timeline-trigger-range-start": "[normal|<length-percentage>|<timeline-range-name> <length-percentage>?]#",
      "timeline-trigger-source": "<single-animation-timeline>#",
      "top": "auto|<length-percentage>|<anchor()>|<anchor-size()>",
      "touch-action": "auto|none|[[pan-x|pan-left|pan-right]||[pan-y|pan-up|pan-down]||pinch-zoom]|manipulation",
      "transform": "none|<transform-list>",
      "transform-box": "content-box|border-box|fill-box|stroke-box|view-box",
      "transform-origin": "[<length-percentage>|left|center|right|top|bottom]|[[<length-percentage>|left|center|right]&&[<length-percentage>|top|center|bottom]] <length>?",
      "transform-style": "flat|preserve-3d",
      "transition": "<single-transition>#",
      "transition-behavior": "<transition-behavior-value>#",
      "transition-delay": "<time>#",
      "transition-duration": "<time>#",
      "transition-property": "none|<single-transition-property>#",
      "transition-timing-function": "<easing-function>#",
      "translate": "none|<length-percentage> [<length-percentage> <length>?]?",
      "trigger-scope": "none|all|<dashed-ident>#",
      "unicode-bidi": "normal|embed|isolate|bidi-override|isolate-override|plaintext|-moz-isolate|-moz-isolate-override|-moz-plaintext|-webkit-isolate|-webkit-isolate-override|-webkit-plaintext",
      "user-select": "auto|text|none|all",
      "vector-effect": "none|non-scaling-stroke|non-scaling-size|non-rotation|fixed-position",
      "vertical-align": "baseline|sub|super|text-top|text-bottom|middle|top|bottom|<percentage>|<length>",
      "view-timeline": "[<'view-timeline-name'> [<'view-timeline-axis'>||<'view-timeline-inset'>]?]#",
      "view-timeline-axis": "[block|inline|x|y]#",
      "view-timeline-inset": "[[auto|<length-percentage>]{1,2}]#",
      "view-timeline-name": "[none|<dashed-ident>]#",
      "view-transition-class": "none|<custom-ident>+",
      "view-transition-name": "none|<custom-ident>|match-element",
      "visibility": "visible|hidden|collapse",
      "white-space": "normal|pre|pre-wrap|pre-line|<'white-space-collapse'>||<'text-wrap-mode'>",
      "white-space-collapse": "collapse|preserve|preserve-breaks|preserve-spaces|break-spaces",
      "widows": "<integer>",
      "width": "auto|<length-percentage [0,∞]>|min-content|max-content|fit-content|fit-content( <length-percentage [0,∞]> )|<calc-size()>|<anchor-size()>|stretch|<-non-standard-size>",
      "will-change": "auto|<animateable-feature>#",
      "word-break": "normal|break-all|keep-all|break-word|auto-phrase",
      "word-spacing": "normal|<length>",
      "word-wrap": "normal|break-word",
      "writing-mode": "horizontal-tb|vertical-rl|vertical-lr|sideways-rl|sideways-lr|<svg-writing-mode>",
      "x": "<length>|<percentage>",
      "y": "<length>|<percentage>",
      "z-index": "auto|<integer>",
      "zoom": "normal|reset|<number [0,∞]>||<percentage [0,∞]>",
      "-moz-background-clip": "padding|border",
      "-moz-border-radius-bottomleft": "<'border-bottom-left-radius'>",
      "-moz-border-radius-bottomright": "<'border-bottom-right-radius'>",
      "-moz-border-radius-topleft": "<'border-top-left-radius'>",
      "-moz-border-radius-topright": "<'border-bottom-right-radius'>",
      "-moz-control-character-visibility": "visible|hidden",
      "-moz-osx-font-smoothing": "auto|grayscale",
      "-moz-user-select": "none|text|all|-moz-none",
      "-ms-flex-align": "start|end|center|baseline|stretch",
      "-ms-flex-item-align": "auto|start|end|center|baseline|stretch",
      "-ms-flex-line-pack": "start|end|center|justify|distribute|stretch",
      "-ms-flex-negative": "<'flex-shrink'>",
      "-ms-flex-pack": "start|end|center|justify|distribute",
      "-ms-flex-order": "<integer>",
      "-ms-flex-positive": "<'flex-grow'>",
      "-ms-flex-preferred-size": "<'flex-basis'>",
      "-ms-interpolation-mode": "nearest-neighbor|bicubic",
      "-ms-grid-column-align": "start|end|center|stretch",
      "-ms-grid-row-align": "start|end|center|stretch",
      "-ms-hyphenate-limit-last": "none|always|column|page|spread",
      "-webkit-background-clip": "[<visual-box>|border|padding|content|text]#",
      "-webkit-column-break-after": "always|auto|avoid",
      "-webkit-column-break-before": "always|auto|avoid",
      "-webkit-column-break-inside": "always|auto|avoid",
      "-webkit-font-smoothing": "auto|none|antialiased|subpixel-antialiased",
      "-webkit-mask-box-image": "[<url>|<gradient>|none] [<length-percentage>{4} <-webkit-mask-box-repeat>{2}]?",
      "-webkit-print-color-adjust": "economy|exact",
      "-webkit-text-security": "none|circle|disc|square",
      "-webkit-user-drag": "none|element|auto",
      "behavior": "<url>+",
      "cue": "<'cue-before'> <'cue-after'>?",
      "cue-after": "<url> <decibel>?|none",
      "cue-before": "<url> <decibel>?|none",
      "glyph-orientation-horizontal": "<angle>",
      "glyph-orientation-vertical": "<angle>",
      "kerning": "auto|<svg-length>",
      "pause": "<'pause-before'> <'pause-after'>?",
      "pause-after": "<time>|none|x-weak|weak|medium|strong|x-strong",
      "pause-before": "<time>|none|x-weak|weak|medium|strong|x-strong",
      "position-try-options": "<'position-try-fallbacks'>",
      "rest": "<'rest-before'> <'rest-after'>?",
      "rest-after": "<time>|none|x-weak|weak|medium|strong|x-strong",
      "rest-before": "<time>|none|x-weak|weak|medium|strong|x-strong",
      "speak": "auto|never|always",
      "voice-balance": "<number>|left|center|right|leftwards|rightwards",
      "voice-duration": "auto|<time>",
      "voice-family": "[[<family-name>|<generic-voice>] ,]* [<family-name>|<generic-voice>]|preserve",
      "voice-pitch": "<frequency>&&absolute|[[x-low|low|medium|high|x-high]||[<frequency>|<semitones>|<percentage>]]",
      "voice-range": "<frequency>&&absolute|[[x-low|low|medium|high|x-high]||[<frequency>|<semitones>|<percentage>]]",
      "voice-rate": "[normal|x-slow|slow|medium|fast|x-fast]||<percentage>",
      "voice-stress": "normal|strong|moderate|none|reduced",
      "voice-volume": "silent|[[x-soft|soft|medium|loud|x-loud]||<decibel>]",
      "white-space-trim": "none|discard-before||discard-after||discard-inner"
    },
    "atrules": {
      "charset": {
        "prelude": "<string>",
        "descriptors": null
      },
      "counter-style": {
        "prelude": "<counter-style-name>",
        "descriptors": {
          "additive-symbols": "[<integer [0,∞]>&&<symbol>]#",
          "fallback": "<counter-style-name>",
          "negative": "<symbol> <symbol>?",
          "pad": "<integer [0,∞]>&&<symbol>",
          "prefix": "<symbol>",
          "range": "[[<integer>|infinite]{2}]#|auto",
          "speak-as": "auto|bullets|numbers|words|spell-out|<counter-style-name>",
          "suffix": "<symbol>",
          "symbols": "<symbol>+",
          "system": "cyclic|numeric|alphabetic|symbolic|additive|[fixed <integer>?]|[extends <counter-style-name>]"
        }
      },
      "container": {
        "prelude": "[<container-name>]? <container-condition>",
        "descriptors": null
      },
      "document": {
        "prelude": "[<url>|url-prefix( <string> )|domain( <string> )|media-document( <string> )|regexp( <string> )]#",
        "descriptors": null
      },
      "font-face": {
        "prelude": null,
        "descriptors": {
          "ascent-override": "normal|<percentage>",
          "descent-override": "normal|<percentage>",
          "font-display": "auto|block|swap|fallback|optional",
          "font-family": "<family-name>",
          "font-feature-settings": "normal|<feature-tag-value>#",
          "font-stretch": "<font-stretch-absolute>{1,2}",
          "font-style": "normal|italic|oblique <angle>{0,2}",
          "font-variation-settings": "normal|[<string> <number>]#",
          "font-weight": "<font-weight-absolute>{1,2}",
          "line-gap-override": "normal|<percentage>",
          "size-adjust": "<percentage>",
          "src": "[<url> [format( <string># )]?|local( <family-name> )]#",
          "unicode-range": "<urange>#"
        }
      },
      "font-feature-values": {
        "prelude": "<family-name>#",
        "descriptors": null
      },
      "font-palette-values": {
        "prelude": "<dashed-ident>",
        "descriptors": {
          "base-palette": "light|dark|<integer [0,∞]>",
          "font-family": "<family-name>#",
          "override-colors": "[<integer [0,∞]> <color>]#"
        }
      },
      "import": {
        "prelude": "[<string>|<url>] [layer|layer( <layer-name> )]? [supports( [<supports-condition>|<declaration>] )]? <media-query-list>?",
        "descriptors": null
      },
      "keyframes": {
        "prelude": "<keyframes-name>",
        "descriptors": null
      },
      "layer": {
        "prelude": "[<layer-name>#|<layer-name>?]",
        "descriptors": null
      },
      "media": {
        "prelude": "<media-query-list>",
        "descriptors": null
      },
      "namespace": {
        "prelude": "<namespace-prefix>? [<string>|<url>]",
        "descriptors": null
      },
      "page": {
        "prelude": "<page-selector-list>",
        "descriptors": {
          "bleed": "auto|<length>",
          "marks": "none|[crop||cross]",
          "page-orientation": "upright|rotate-left|rotate-right",
          "size": "<length [0,∞]>{1,2}|auto|[<page-size>||[portrait|landscape]]"
        }
      },
      "position-try": {
        "prelude": "<dashed-ident>",
        "descriptors": {
          "top": "<'top'>",
          "left": "<'left'>",
          "bottom": "<'bottom'>",
          "right": "<'right'>",
          "inset-block-start": "<'inset-block-start'>",
          "inset-block-end": "<'inset-block-end'>",
          "inset-inline-start": "<'inset-inline-start'>",
          "inset-inline-end": "<'inset-inline-end'>",
          "inset-block": "<'inset-block'>",
          "inset-inline": "<'inset-inline'>",
          "inset": "<'inset'>",
          "margin-top": "<'margin-top'>",
          "margin-left": "<'margin-left'>",
          "margin-bottom": "<'margin-bottom'>",
          "margin-right": "<'margin-right'>",
          "margin-block-start": "<'margin-block-start'>",
          "margin-block-end": "<'margin-block-end'>",
          "margin-inline-start": "<'margin-inline-start'>",
          "margin-inline-end": "<'margin-inline-end'>",
          "margin": "<'margin'>",
          "margin-block": "<'margin-block'>",
          "margin-inline": "<'margin-inline'>",
          "width": "<'width'>",
          "height": "<'height'>",
          "min-width": "<'min-width'>",
          "min-height": "<'min-height'>",
          "max-width": "<'max-width'>",
          "max-height": "<'max-height'>",
          "block-size": "<'block-size'>",
          "inline-size": "<'inline-size'>",
          "min-block-size": "<'min-block-size'>",
          "min-inline-size": "<'min-inline-size'>",
          "max-block-size": "<'max-block-size'>",
          "max-inline-size": "<'max-inline-size'>",
          "align-self": "<'align-self'>|anchor-center",
          "justify-self": "<'justify-self'>|anchor-center"
        }
      },
      "property": {
        "prelude": "<custom-property-name>",
        "descriptors": {
          "inherits": "true|false",
          "initial-value": "<declaration-value>?",
          "syntax": "<string>"
        }
      },
      "scope": {
        "prelude": "[( <scope-start> )]? [to ( <scope-end> )]?",
        "descriptors": null
      },
      "starting-style": {
        "prelude": null,
        "descriptors": null
      },
      "supports": {
        "prelude": "<supports-condition>",
        "descriptors": null
      },
      "view-transition": {
        "prelude": null,
        "descriptors": {
          "navigation": "auto|none",
          "types": "none|<custom-ident>+"
        }
      },
      "font-features-values": {
        "prelude": "[<string>|<custom-ident>]+",
        "descriptors": {
          "font-display": "auto|block|swap|fallback|optional"
        }
      }
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/index.js
  var node_exports = {};
  __export(node_exports, {
    AnPlusB: () => AnPlusB_exports,
    Atrule: () => Atrule_exports,
    AtrulePrelude: () => AtrulePrelude_exports,
    AttributeSelector: () => AttributeSelector_exports,
    Block: () => Block_exports,
    Brackets: () => Brackets_exports,
    CDC: () => CDC_exports,
    CDO: () => CDO_exports,
    ClassSelector: () => ClassSelector_exports,
    Combinator: () => Combinator_exports,
    Comment: () => Comment_exports,
    Condition: () => Condition_exports,
    Declaration: () => Declaration_exports,
    DeclarationList: () => DeclarationList_exports,
    Dimension: () => Dimension_exports,
    Feature: () => Feature_exports,
    FeatureFunction: () => FeatureFunction_exports,
    FeatureRange: () => FeatureRange_exports,
    Function: () => Function_exports,
    GeneralEnclosed: () => GeneralEnclosed_exports,
    Hash: () => Hash_exports,
    IdSelector: () => IdSelector_exports,
    Identifier: () => Identifier_exports,
    Layer: () => Layer_exports,
    LayerList: () => LayerList_exports,
    MediaQuery: () => MediaQuery_exports,
    MediaQueryList: () => MediaQueryList_exports,
    NestingSelector: () => NestingSelector_exports,
    Nth: () => Nth_exports,
    Number: () => Number_exports,
    Operator: () => Operator_exports,
    Parentheses: () => Parentheses_exports,
    Percentage: () => Percentage_exports,
    PseudoClassSelector: () => PseudoClassSelector_exports,
    PseudoElementSelector: () => PseudoElementSelector_exports,
    Ratio: () => Ratio_exports,
    Raw: () => Raw_exports,
    Rule: () => Rule_exports,
    Scope: () => Scope_exports,
    Selector: () => Selector_exports,
    SelectorList: () => SelectorList_exports,
    String: () => String_exports,
    StyleSheet: () => StyleSheet_exports,
    SupportsDeclaration: () => SupportsDeclaration_exports,
    TypeSelector: () => TypeSelector_exports,
    UnicodeRange: () => UnicodeRange_exports,
    Url: () => Url_exports,
    Value: () => Value_exports,
    WhiteSpace: () => WhiteSpace_exports
  });

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/AnPlusB.js
  var AnPlusB_exports = {};
  __export(AnPlusB_exports, {
    generate: () => generate2,
    name: () => name,
    parse: () => parse2,
    structure: () => structure
  });
  var PLUSSIGN5 = 43;
  var HYPHENMINUS5 = 45;
  var N5 = 110;
  var DISALLOW_SIGN2 = true;
  var ALLOW_SIGN2 = false;
  function checkInteger2(offset, disallowSign) {
    let pos = this.tokenStart + offset;
    const code2 = this.charCodeAt(pos);
    if (code2 === PLUSSIGN5 || code2 === HYPHENMINUS5) {
      if (disallowSign) {
        this.error("Number sign is not allowed");
      }
      pos++;
    }
    for (; pos < this.tokenEnd; pos++) {
      if (!isDigit(this.charCodeAt(pos))) {
        this.error("Integer is expected", pos);
      }
    }
  }
  function checkTokenIsInteger(disallowSign) {
    return checkInteger2.call(this, 0, disallowSign);
  }
  function expectCharCode(offset, code2) {
    if (!this.cmpChar(this.tokenStart + offset, code2)) {
      let msg = "";
      switch (code2) {
        case N5:
          msg = "N is expected";
          break;
        case HYPHENMINUS5:
          msg = "HyphenMinus is expected";
          break;
      }
      this.error(msg, this.tokenStart + offset);
    }
  }
  function consumeB2() {
    let offset = 0;
    let sign = 0;
    let type = this.tokenType;
    while (type === WhiteSpace || type === Comment) {
      type = this.lookupType(++offset);
    }
    if (type !== Number2) {
      if (this.isDelim(PLUSSIGN5, offset) || this.isDelim(HYPHENMINUS5, offset)) {
        sign = this.isDelim(PLUSSIGN5, offset) ? PLUSSIGN5 : HYPHENMINUS5;
        do {
          type = this.lookupType(++offset);
        } while (type === WhiteSpace || type === Comment);
        if (type !== Number2) {
          this.skip(offset);
          checkTokenIsInteger.call(this, DISALLOW_SIGN2);
        }
      } else {
        return null;
      }
    }
    if (offset > 0) {
      this.skip(offset);
    }
    if (sign === 0) {
      type = this.charCodeAt(this.tokenStart);
      if (type !== PLUSSIGN5 && type !== HYPHENMINUS5) {
        this.error("Number sign is expected");
      }
    }
    checkTokenIsInteger.call(this, sign !== 0);
    return sign === HYPHENMINUS5 ? "-" + this.consume(Number2) : this.consume(Number2);
  }
  var name = "AnPlusB";
  var structure = {
    a: [String, null],
    b: [String, null]
  };
  function parse2() {
    const start = this.tokenStart;
    let a = null;
    let b = null;
    if (this.tokenType === Number2) {
      checkTokenIsInteger.call(this, ALLOW_SIGN2);
      b = this.consume(Number2);
    } else if (this.tokenType === Ident && this.cmpChar(this.tokenStart, HYPHENMINUS5)) {
      a = "-1";
      expectCharCode.call(this, 1, N5);
      switch (this.tokenEnd - this.tokenStart) {
        // -n
        // -n <signed-integer>
        // -n ['+' | '-'] <signless-integer>
        case 2:
          this.next();
          b = consumeB2.call(this);
          break;
        // -n- <signless-integer>
        case 3:
          expectCharCode.call(this, 2, HYPHENMINUS5);
          this.next();
          this.skipSC();
          checkTokenIsInteger.call(this, DISALLOW_SIGN2);
          b = "-" + this.consume(Number2);
          break;
        // <dashndashdigit-ident>
        default:
          expectCharCode.call(this, 2, HYPHENMINUS5);
          checkInteger2.call(this, 3, DISALLOW_SIGN2);
          this.next();
          b = this.substrToCursor(start + 2);
      }
    } else if (this.tokenType === Ident || this.isDelim(PLUSSIGN5) && this.lookupType(1) === Ident) {
      let sign = 0;
      a = "1";
      if (this.isDelim(PLUSSIGN5)) {
        sign = 1;
        this.next();
      }
      expectCharCode.call(this, 0, N5);
      switch (this.tokenEnd - this.tokenStart) {
        // '+'? n
        // '+'? n <signed-integer>
        // '+'? n ['+' | '-'] <signless-integer>
        case 1:
          this.next();
          b = consumeB2.call(this);
          break;
        // '+'? n- <signless-integer>
        case 2:
          expectCharCode.call(this, 1, HYPHENMINUS5);
          this.next();
          this.skipSC();
          checkTokenIsInteger.call(this, DISALLOW_SIGN2);
          b = "-" + this.consume(Number2);
          break;
        // '+'? <ndashdigit-ident>
        default:
          expectCharCode.call(this, 1, HYPHENMINUS5);
          checkInteger2.call(this, 2, DISALLOW_SIGN2);
          this.next();
          b = this.substrToCursor(start + sign + 1);
      }
    } else if (this.tokenType === Dimension) {
      const code2 = this.charCodeAt(this.tokenStart);
      const sign = code2 === PLUSSIGN5 || code2 === HYPHENMINUS5;
      let i = this.tokenStart + sign;
      for (; i < this.tokenEnd; i++) {
        if (!isDigit(this.charCodeAt(i))) {
          break;
        }
      }
      if (i === this.tokenStart + sign) {
        this.error("Integer is expected", this.tokenStart + sign);
      }
      expectCharCode.call(this, i - this.tokenStart, N5);
      a = this.substring(start, i);
      if (i + 1 === this.tokenEnd) {
        this.next();
        b = consumeB2.call(this);
      } else {
        expectCharCode.call(this, i - this.tokenStart + 1, HYPHENMINUS5);
        if (i + 2 === this.tokenEnd) {
          this.next();
          this.skipSC();
          checkTokenIsInteger.call(this, DISALLOW_SIGN2);
          b = "-" + this.consume(Number2);
        } else {
          checkInteger2.call(this, i - this.tokenStart + 2, DISALLOW_SIGN2);
          this.next();
          b = this.substrToCursor(i + 1);
        }
      }
    } else {
      this.error();
    }
    if (a !== null && a.charCodeAt(0) === PLUSSIGN5) {
      a = a.substr(1);
    }
    if (b !== null && b.charCodeAt(0) === PLUSSIGN5) {
      b = b.substr(1);
    }
    return {
      type: "AnPlusB",
      loc: this.getLocation(start, this.tokenStart),
      a,
      b
    };
  }
  function generate2(node) {
    if (node.a) {
      const a = node.a === "+1" && "n" || node.a === "1" && "n" || node.a === "-1" && "-n" || node.a + "n";
      if (node.b) {
        const b = node.b[0] === "-" || node.b[0] === "+" ? node.b : "+" + node.b;
        this.tokenize(a + b);
      } else {
        this.tokenize(a);
      }
    } else {
      this.tokenize(node.b);
    }
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Atrule.js
  var Atrule_exports = {};
  __export(Atrule_exports, {
    generate: () => generate3,
    name: () => name2,
    parse: () => parse3,
    structure: () => structure2,
    walkContext: () => walkContext
  });
  function consumeRaw() {
    return this.Raw(this.consumeUntilLeftCurlyBracketOrSemicolon, true);
  }
  function isDeclarationBlockAtrule() {
    for (let offset = 1, type; type = this.lookupType(offset); offset++) {
      if (type === RightCurlyBracket) {
        return true;
      }
      if (type === LeftCurlyBracket || type === AtKeyword) {
        return false;
      }
    }
    return false;
  }
  var name2 = "Atrule";
  var walkContext = "atrule";
  var structure2 = {
    name: String,
    prelude: ["AtrulePrelude", "Raw", null],
    block: ["Block", null]
  };
  function parse3(isDeclaration = false) {
    const start = this.tokenStart;
    let name50;
    let nameLowerCase;
    let prelude = null;
    let block = null;
    this.eat(AtKeyword);
    name50 = this.substrToCursor(start + 1);
    nameLowerCase = name50.toLowerCase();
    this.skipSC();
    if (this.eof === false && this.tokenType !== LeftCurlyBracket && this.tokenType !== Semicolon) {
      if (this.parseAtrulePrelude) {
        prelude = this.parseWithFallback(this.AtrulePrelude.bind(this, name50, isDeclaration), consumeRaw);
      } else {
        prelude = consumeRaw.call(this, this.tokenIndex);
      }
      this.skipSC();
    }
    switch (this.tokenType) {
      case Semicolon:
        this.next();
        break;
      case LeftCurlyBracket:
        if (hasOwnProperty.call(this.atrule, nameLowerCase) && typeof this.atrule[nameLowerCase].block === "function") {
          block = this.atrule[nameLowerCase].block.call(this, isDeclaration);
        } else {
          block = this.Block(isDeclarationBlockAtrule.call(this));
        }
        break;
    }
    return {
      type: "Atrule",
      loc: this.getLocation(start, this.tokenStart),
      name: name50,
      prelude,
      block
    };
  }
  function generate3(node) {
    this.token(AtKeyword, "@" + node.name);
    if (node.prelude !== null) {
      this.node(node.prelude);
    }
    if (node.block) {
      this.node(node.block);
    } else {
      this.token(Semicolon, ";");
    }
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/AtrulePrelude.js
  var AtrulePrelude_exports = {};
  __export(AtrulePrelude_exports, {
    generate: () => generate4,
    name: () => name3,
    parse: () => parse4,
    structure: () => structure3,
    walkContext: () => walkContext2
  });
  var name3 = "AtrulePrelude";
  var walkContext2 = "atrulePrelude";
  var structure3 = {
    children: [[]]
  };
  function parse4(name50) {
    let children = null;
    if (name50 !== null) {
      name50 = name50.toLowerCase();
    }
    this.skipSC();
    if (hasOwnProperty.call(this.atrule, name50) && typeof this.atrule[name50].prelude === "function") {
      children = this.atrule[name50].prelude.call(this);
    } else {
      children = this.readSequence(this.scope.AtrulePrelude);
    }
    this.skipSC();
    if (this.eof !== true && this.tokenType !== LeftCurlyBracket && this.tokenType !== Semicolon) {
      this.error("Semicolon or block is expected");
    }
    return {
      type: "AtrulePrelude",
      loc: this.getLocationFromList(children),
      children
    };
  }
  function generate4(node) {
    this.children(node);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/AttributeSelector.js
  var AttributeSelector_exports = {};
  __export(AttributeSelector_exports, {
    generate: () => generate5,
    name: () => name4,
    parse: () => parse5,
    structure: () => structure4
  });
  var DOLLARSIGN = 36;
  var ASTERISK2 = 42;
  var EQUALSSIGN = 61;
  var CIRCUMFLEXACCENT = 94;
  var VERTICALLINE2 = 124;
  var TILDE = 126;
  function getAttributeName() {
    if (this.eof) {
      this.error("Unexpected end of input");
    }
    const start = this.tokenStart;
    let expectIdent = false;
    if (this.isDelim(ASTERISK2)) {
      expectIdent = true;
      this.next();
    } else if (!this.isDelim(VERTICALLINE2)) {
      this.eat(Ident);
    }
    if (this.isDelim(VERTICALLINE2)) {
      if (this.charCodeAt(this.tokenStart + 1) !== EQUALSSIGN) {
        this.next();
        this.eat(Ident);
      } else if (expectIdent) {
        this.error("Identifier is expected", this.tokenEnd);
      }
    } else if (expectIdent) {
      this.error("Vertical line is expected");
    }
    return {
      type: "Identifier",
      loc: this.getLocation(start, this.tokenStart),
      name: this.substrToCursor(start)
    };
  }
  function getOperator() {
    const start = this.tokenStart;
    const code2 = this.charCodeAt(start);
    if (code2 !== EQUALSSIGN && // =
    code2 !== TILDE && // ~=
    code2 !== CIRCUMFLEXACCENT && // ^=
    code2 !== DOLLARSIGN && // $=
    code2 !== ASTERISK2 && // *=
    code2 !== VERTICALLINE2) {
      this.error("Attribute selector (=, ~=, ^=, $=, *=, |=) is expected");
    }
    this.next();
    if (code2 !== EQUALSSIGN) {
      if (!this.isDelim(EQUALSSIGN)) {
        this.error("Equal sign is expected");
      }
      this.next();
    }
    return this.substrToCursor(start);
  }
  var name4 = "AttributeSelector";
  var structure4 = {
    name: "Identifier",
    matcher: [String, null],
    value: ["String", "Identifier", null],
    flags: [String, null]
  };
  function parse5() {
    const start = this.tokenStart;
    let name50;
    let matcher = null;
    let value = null;
    let flags = null;
    this.eat(LeftSquareBracket);
    this.skipSC();
    name50 = getAttributeName.call(this);
    this.skipSC();
    if (this.tokenType !== RightSquareBracket) {
      if (this.tokenType !== Ident) {
        matcher = getOperator.call(this);
        this.skipSC();
        value = this.tokenType === String2 ? this.String() : this.Identifier();
        this.skipSC();
      }
      if (this.tokenType === Ident) {
        flags = this.consume(Ident);
        this.skipSC();
      }
    }
    this.eat(RightSquareBracket);
    return {
      type: "AttributeSelector",
      loc: this.getLocation(start, this.tokenStart),
      name: name50,
      matcher,
      value,
      flags
    };
  }
  function generate5(node) {
    this.token(Delim, "[");
    this.node(node.name);
    if (node.matcher !== null) {
      this.tokenize(node.matcher);
      this.node(node.value);
    }
    if (node.flags !== null) {
      this.token(Ident, node.flags);
    }
    this.token(Delim, "]");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Block.js
  var Block_exports = {};
  __export(Block_exports, {
    generate: () => generate6,
    name: () => name5,
    parse: () => parse6,
    structure: () => structure5,
    walkContext: () => walkContext3
  });
  var AMPERSAND2 = 38;
  function consumeRaw2() {
    return this.Raw(null, true);
  }
  function consumeRule() {
    return this.parseWithFallback(this.Rule, consumeRaw2);
  }
  function consumeRawDeclaration() {
    return this.Raw(this.consumeUntilSemicolonIncluded, true);
  }
  function consumeDeclaration() {
    if (this.tokenType === Semicolon) {
      return consumeRawDeclaration.call(this, this.tokenIndex);
    }
    const node = this.parseWithFallback(this.Declaration, consumeRawDeclaration);
    if (this.tokenType === Semicolon) {
      this.next();
    }
    return node;
  }
  var name5 = "Block";
  var walkContext3 = "block";
  var structure5 = {
    children: [[
      "Atrule",
      "Rule",
      "Declaration"
    ]]
  };
  function parse6(isStyleBlock) {
    const consumer = isStyleBlock ? consumeDeclaration : consumeRule;
    const start = this.tokenStart;
    let children = this.createList();
    this.eat(LeftCurlyBracket);
    scan:
      while (!this.eof) {
        switch (this.tokenType) {
          case RightCurlyBracket:
            break scan;
          case WhiteSpace:
          case Comment:
            this.next();
            break;
          case AtKeyword:
            children.push(this.parseWithFallback(this.Atrule.bind(this, isStyleBlock), consumeRaw2));
            break;
          default:
            if (isStyleBlock && this.isDelim(AMPERSAND2)) {
              children.push(consumeRule.call(this));
            } else {
              children.push(consumer.call(this));
            }
        }
      }
    if (!this.eof) {
      this.eat(RightCurlyBracket);
    }
    return {
      type: "Block",
      loc: this.getLocation(start, this.tokenStart),
      children
    };
  }
  function generate6(node) {
    this.token(LeftCurlyBracket, "{");
    this.children(node, (prev) => {
      if (prev.type === "Declaration") {
        this.token(Semicolon, ";");
      }
    });
    this.token(RightCurlyBracket, "}");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Brackets.js
  var Brackets_exports = {};
  __export(Brackets_exports, {
    generate: () => generate7,
    name: () => name6,
    parse: () => parse7,
    structure: () => structure6
  });
  var name6 = "Brackets";
  var structure6 = {
    children: [[]]
  };
  function parse7(readSequence2, recognizer) {
    const start = this.tokenStart;
    let children = null;
    this.eat(LeftSquareBracket);
    children = readSequence2.call(this, recognizer);
    if (!this.eof) {
      this.eat(RightSquareBracket);
    }
    return {
      type: "Brackets",
      loc: this.getLocation(start, this.tokenStart),
      children
    };
  }
  function generate7(node) {
    this.token(Delim, "[");
    this.children(node);
    this.token(Delim, "]");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/CDC.js
  var CDC_exports = {};
  __export(CDC_exports, {
    generate: () => generate8,
    name: () => name7,
    parse: () => parse8,
    structure: () => structure7
  });
  var name7 = "CDC";
  var structure7 = [];
  function parse8() {
    const start = this.tokenStart;
    this.eat(CDC);
    return {
      type: "CDC",
      loc: this.getLocation(start, this.tokenStart)
    };
  }
  function generate8() {
    this.token(CDC, "-->");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/CDO.js
  var CDO_exports = {};
  __export(CDO_exports, {
    generate: () => generate9,
    name: () => name8,
    parse: () => parse9,
    structure: () => structure8
  });
  var name8 = "CDO";
  var structure8 = [];
  function parse9() {
    const start = this.tokenStart;
    this.eat(CDO);
    return {
      type: "CDO",
      loc: this.getLocation(start, this.tokenStart)
    };
  }
  function generate9() {
    this.token(CDO, "<!--");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/ClassSelector.js
  var ClassSelector_exports = {};
  __export(ClassSelector_exports, {
    generate: () => generate10,
    name: () => name9,
    parse: () => parse10,
    structure: () => structure9
  });
  var FULLSTOP = 46;
  var name9 = "ClassSelector";
  var structure9 = {
    name: String
  };
  function parse10() {
    this.eatDelim(FULLSTOP);
    return {
      type: "ClassSelector",
      loc: this.getLocation(this.tokenStart - 1, this.tokenEnd),
      name: this.consume(Ident)
    };
  }
  function generate10(node) {
    this.token(Delim, ".");
    this.token(Ident, node.name);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Combinator.js
  var Combinator_exports = {};
  __export(Combinator_exports, {
    generate: () => generate11,
    name: () => name10,
    parse: () => parse11,
    structure: () => structure10
  });
  var PLUSSIGN6 = 43;
  var SOLIDUS = 47;
  var GREATERTHANSIGN2 = 62;
  var TILDE2 = 126;
  var name10 = "Combinator";
  var structure10 = {
    name: String
  };
  function parse11() {
    const start = this.tokenStart;
    let name50;
    switch (this.tokenType) {
      case WhiteSpace:
        name50 = " ";
        break;
      case Delim:
        switch (this.charCodeAt(this.tokenStart)) {
          case GREATERTHANSIGN2:
          case PLUSSIGN6:
          case TILDE2:
            this.next();
            break;
          case SOLIDUS:
            this.next();
            this.eatIdent("deep");
            this.eatDelim(SOLIDUS);
            break;
          default:
            this.error("Combinator is expected");
        }
        name50 = this.substrToCursor(start);
        break;
    }
    return {
      type: "Combinator",
      loc: this.getLocation(start, this.tokenStart),
      name: name50
    };
  }
  function generate11(node) {
    this.tokenize(node.name);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Comment.js
  var Comment_exports = {};
  __export(Comment_exports, {
    generate: () => generate12,
    name: () => name11,
    parse: () => parse12,
    structure: () => structure11
  });
  var ASTERISK3 = 42;
  var SOLIDUS2 = 47;
  var name11 = "Comment";
  var structure11 = {
    value: String
  };
  function parse12() {
    const start = this.tokenStart;
    let end = this.tokenEnd;
    this.eat(Comment);
    if (end - start + 2 >= 2 && this.charCodeAt(end - 2) === ASTERISK3 && this.charCodeAt(end - 1) === SOLIDUS2) {
      end -= 2;
    }
    return {
      type: "Comment",
      loc: this.getLocation(start, this.tokenStart),
      value: this.substring(start + 2, end)
    };
  }
  function generate12(node) {
    this.token(Comment, "/*" + node.value + "*/");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Condition.js
  var Condition_exports = {};
  __export(Condition_exports, {
    generate: () => generate13,
    name: () => name12,
    parse: () => parse13,
    structure: () => structure12
  });
  var likelyFeatureToken = /* @__PURE__ */ new Set([Colon, RightParenthesis, EOF]);
  var name12 = "Condition";
  var structure12 = {
    kind: String,
    children: [[
      "Identifier",
      "Feature",
      "FeatureFunction",
      "FeatureRange",
      "SupportsDeclaration"
    ]]
  };
  function featureOrRange(kind) {
    if (this.lookupTypeNonSC(1) === Ident && likelyFeatureToken.has(this.lookupTypeNonSC(2))) {
      return this.Feature(kind);
    }
    return this.FeatureRange(kind);
  }
  var parentheses = {
    media: featureOrRange,
    container: featureOrRange,
    supports() {
      return this.SupportsDeclaration();
    }
  };
  function parse13(kind = "media") {
    const children = this.createList();
    scan: while (!this.eof) {
      switch (this.tokenType) {
        case Comment:
        case WhiteSpace:
          this.next();
          continue;
        case Ident:
          children.push(this.Identifier());
          break;
        case LeftParenthesis: {
          let term = this.parseWithFallback(
            () => parentheses[kind].call(this, kind),
            () => null
          );
          if (!term) {
            term = this.parseWithFallback(
              () => {
                this.eat(LeftParenthesis);
                const res = this.Condition(kind);
                this.eat(RightParenthesis);
                return res;
              },
              () => {
                return this.GeneralEnclosed(kind);
              }
            );
          }
          children.push(term);
          break;
        }
        case Function: {
          let term = this.parseWithFallback(
            () => this.FeatureFunction(kind),
            () => null
          );
          if (!term) {
            term = this.GeneralEnclosed(kind);
          }
          children.push(term);
          break;
        }
        default:
          break scan;
      }
    }
    if (children.isEmpty) {
      this.error("Condition is expected");
    }
    return {
      type: "Condition",
      loc: this.getLocationFromList(children),
      kind,
      children
    };
  }
  function generate13(node) {
    node.children.forEach((child) => {
      if (child.type === "Condition") {
        this.token(LeftParenthesis, "(");
        this.node(child);
        this.token(RightParenthesis, ")");
      } else {
        this.node(child);
      }
    });
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Declaration.js
  var Declaration_exports = {};
  __export(Declaration_exports, {
    generate: () => generate14,
    name: () => name13,
    parse: () => parse14,
    structure: () => structure13,
    walkContext: () => walkContext4
  });
  var EXCLAMATIONMARK3 = 33;
  var NUMBERSIGN3 = 35;
  var DOLLARSIGN2 = 36;
  var AMPERSAND3 = 38;
  var ASTERISK4 = 42;
  var PLUSSIGN7 = 43;
  var SOLIDUS3 = 47;
  function consumeValueRaw() {
    return this.Raw(this.consumeUntilExclamationMarkOrSemicolon, true);
  }
  function consumeCustomPropertyRaw() {
    return this.Raw(this.consumeUntilExclamationMarkOrSemicolon, false);
  }
  function consumeValue() {
    const startValueToken = this.tokenIndex;
    const value = this.Value();
    if (value.type !== "Raw" && this.eof === false && this.tokenType !== Semicolon && this.isDelim(EXCLAMATIONMARK3) === false && this.isBalanceEdge(startValueToken) === false) {
      this.error();
    }
    return value;
  }
  var name13 = "Declaration";
  var walkContext4 = "declaration";
  var structure13 = {
    important: [Boolean, String],
    property: String,
    value: ["Value", "Raw"]
  };
  function parse14() {
    const start = this.tokenStart;
    const startToken = this.tokenIndex;
    const property2 = readProperty2.call(this);
    const customProperty = isCustomProperty(property2);
    const parseValue = customProperty ? this.parseCustomProperty : this.parseValue;
    const consumeRaw6 = customProperty ? consumeCustomPropertyRaw : consumeValueRaw;
    let important = false;
    let value;
    this.skipSC();
    this.eat(Colon);
    const valueStart = this.tokenIndex;
    if (!customProperty) {
      this.skipSC();
    }
    if (parseValue) {
      value = this.parseWithFallback(consumeValue, consumeRaw6);
    } else {
      value = consumeRaw6.call(this, this.tokenIndex);
    }
    if (customProperty && value.type === "Value" && value.children.isEmpty) {
      for (let offset = valueStart - this.tokenIndex; offset <= 0; offset++) {
        if (this.lookupType(offset) === WhiteSpace) {
          value.children.appendData({
            type: "WhiteSpace",
            loc: null,
            value: " "
          });
          break;
        }
      }
    }
    if (this.isDelim(EXCLAMATIONMARK3)) {
      important = getImportant.call(this);
      this.skipSC();
    }
    if (this.eof === false && this.tokenType !== Semicolon && this.isBalanceEdge(startToken) === false) {
      this.error();
    }
    return {
      type: "Declaration",
      loc: this.getLocation(start, this.tokenStart),
      important,
      property: property2,
      value
    };
  }
  function generate14(node) {
    this.token(Ident, node.property);
    this.token(Colon, ":");
    this.node(node.value);
    if (node.important) {
      this.token(Delim, "!");
      this.token(Ident, node.important === true ? "important" : node.important);
    }
  }
  function readProperty2() {
    const start = this.tokenStart;
    if (this.tokenType === Delim) {
      switch (this.charCodeAt(this.tokenStart)) {
        case ASTERISK4:
        case DOLLARSIGN2:
        case PLUSSIGN7:
        case NUMBERSIGN3:
        case AMPERSAND3:
          this.next();
          break;
        // TODO: not sure we should support this hack
        case SOLIDUS3:
          this.next();
          if (this.isDelim(SOLIDUS3)) {
            this.next();
          }
          break;
      }
    }
    if (this.tokenType === Hash) {
      this.eat(Hash);
    } else {
      this.eat(Ident);
    }
    return this.substrToCursor(start);
  }
  function getImportant() {
    this.eat(Delim);
    this.skipSC();
    const important = this.consume(Ident);
    return important === "important" ? true : important;
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/DeclarationList.js
  var DeclarationList_exports = {};
  __export(DeclarationList_exports, {
    generate: () => generate15,
    name: () => name14,
    parse: () => parse15,
    structure: () => structure14
  });
  var AMPERSAND4 = 38;
  function consumeRaw3() {
    return this.Raw(this.consumeUntilSemicolonIncluded, true);
  }
  var name14 = "DeclarationList";
  var structure14 = {
    children: [[
      "Declaration",
      "Atrule",
      "Rule"
    ]]
  };
  function parse15() {
    const children = this.createList();
    scan:
      while (!this.eof) {
        switch (this.tokenType) {
          case WhiteSpace:
          case Comment:
          case Semicolon:
            this.next();
            break;
          case AtKeyword:
            children.push(this.parseWithFallback(this.Atrule.bind(this, true), consumeRaw3));
            break;
          default:
            if (this.isDelim(AMPERSAND4)) {
              children.push(this.parseWithFallback(this.Rule, consumeRaw3));
            } else {
              children.push(this.parseWithFallback(this.Declaration, consumeRaw3));
            }
        }
      }
    return {
      type: "DeclarationList",
      loc: this.getLocationFromList(children),
      children
    };
  }
  function generate15(node) {
    this.children(node, (prev) => {
      if (prev.type === "Declaration") {
        this.token(Semicolon, ";");
      }
    });
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Dimension.js
  var Dimension_exports = {};
  __export(Dimension_exports, {
    generate: () => generate16,
    name: () => name15,
    parse: () => parse16,
    structure: () => structure15
  });
  var name15 = "Dimension";
  var structure15 = {
    value: String,
    unit: String
  };
  function parse16() {
    const start = this.tokenStart;
    const value = this.consumeNumber(Dimension);
    return {
      type: "Dimension",
      loc: this.getLocation(start, this.tokenStart),
      value,
      unit: this.substring(start + value.length, this.tokenStart)
    };
  }
  function generate16(node) {
    this.token(Dimension, node.value + node.unit);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Feature.js
  var Feature_exports = {};
  __export(Feature_exports, {
    generate: () => generate17,
    name: () => name16,
    parse: () => parse17,
    structure: () => structure16
  });
  var SOLIDUS4 = 47;
  var name16 = "Feature";
  var structure16 = {
    kind: String,
    name: String,
    value: ["Identifier", "Number", "Dimension", "Ratio", "Function", null]
  };
  function parse17(kind) {
    const start = this.tokenStart;
    let name50;
    let value = null;
    this.eat(LeftParenthesis);
    this.skipSC();
    name50 = this.consume(Ident);
    this.skipSC();
    if (this.tokenType !== RightParenthesis) {
      this.eat(Colon);
      this.skipSC();
      switch (this.tokenType) {
        case Number2:
          if (this.lookupNonWSType(1) === Delim) {
            value = this.Ratio();
          } else {
            value = this.Number();
          }
          break;
        case Dimension:
          value = this.Dimension();
          break;
        case Ident:
          value = this.Identifier();
          break;
        case Function:
          value = this.parseWithFallback(
            () => {
              const res = this.Function(this.readSequence, this.scope.Value);
              this.skipSC();
              if (this.isDelim(SOLIDUS4)) {
                this.error();
              }
              return res;
            },
            () => {
              return this.Ratio();
            }
          );
          break;
        default:
          this.error("Number, dimension, ratio or identifier is expected");
      }
      this.skipSC();
    }
    if (!this.eof) {
      this.eat(RightParenthesis);
    }
    return {
      type: "Feature",
      loc: this.getLocation(start, this.tokenStart),
      kind,
      name: name50,
      value
    };
  }
  function generate17(node) {
    this.token(LeftParenthesis, "(");
    this.token(Ident, node.name);
    if (node.value !== null) {
      this.token(Colon, ":");
      this.node(node.value);
    }
    this.token(RightParenthesis, ")");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/FeatureFunction.js
  var FeatureFunction_exports = {};
  __export(FeatureFunction_exports, {
    generate: () => generate18,
    name: () => name17,
    parse: () => parse18,
    structure: () => structure17
  });
  var name17 = "FeatureFunction";
  var structure17 = {
    kind: String,
    feature: String,
    value: ["Declaration", "Selector"]
  };
  function getFeatureParser(kind, name50) {
    const featuresOfKind = this.features[kind] || {};
    const parser = featuresOfKind[name50];
    if (typeof parser !== "function") {
      this.error(`Unknown feature ${name50}()`);
    }
    return parser;
  }
  function parse18(kind = "unknown") {
    const start = this.tokenStart;
    const functionName = this.consumeFunctionName();
    const valueParser = getFeatureParser.call(this, kind, functionName.toLowerCase());
    this.skipSC();
    const value = this.parseWithFallback(
      () => {
        const startValueToken = this.tokenIndex;
        const value2 = valueParser.call(this);
        if (this.eof === false && this.isBalanceEdge(startValueToken) === false) {
          this.error();
        }
        return value2;
      },
      () => this.Raw(null, false)
    );
    if (!this.eof) {
      this.eat(RightParenthesis);
    }
    return {
      type: "FeatureFunction",
      loc: this.getLocation(start, this.tokenStart),
      kind,
      feature: functionName,
      value
    };
  }
  function generate18(node) {
    this.token(Function, node.feature + "(");
    this.node(node.value);
    this.token(RightParenthesis, ")");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/FeatureRange.js
  var FeatureRange_exports = {};
  __export(FeatureRange_exports, {
    generate: () => generate19,
    name: () => name18,
    parse: () => parse19,
    structure: () => structure18
  });
  var SOLIDUS5 = 47;
  var LESSTHANSIGN2 = 60;
  var EQUALSSIGN2 = 61;
  var GREATERTHANSIGN3 = 62;
  var name18 = "FeatureRange";
  var structure18 = {
    kind: String,
    left: ["Identifier", "Number", "Dimension", "Ratio", "Function"],
    leftComparison: String,
    middle: ["Identifier", "Number", "Dimension", "Ratio", "Function"],
    rightComparison: [String, null],
    right: ["Identifier", "Number", "Dimension", "Ratio", "Function", null]
  };
  function readTerm() {
    this.skipSC();
    switch (this.tokenType) {
      case Number2:
        if (this.isDelim(SOLIDUS5, this.lookupOffsetNonSC(1))) {
          return this.Ratio();
        } else {
          return this.Number();
        }
      case Dimension:
        return this.Dimension();
      case Ident:
        return this.Identifier();
      case Function:
        return this.parseWithFallback(
          () => {
            const res = this.Function(this.readSequence, this.scope.Value);
            this.skipSC();
            if (this.isDelim(SOLIDUS5)) {
              this.error();
            }
            return res;
          },
          () => {
            return this.Ratio();
          }
        );
      default:
        this.error("Number, dimension, ratio or identifier is expected");
    }
  }
  function readComparison(expectColon) {
    this.skipSC();
    if (this.isDelim(LESSTHANSIGN2) || this.isDelim(GREATERTHANSIGN3)) {
      const value = this.source[this.tokenStart];
      this.next();
      if (this.isDelim(EQUALSSIGN2)) {
        this.next();
        return value + "=";
      }
      return value;
    }
    if (this.isDelim(EQUALSSIGN2)) {
      return "=";
    }
    this.error(`Expected ${expectColon ? '":", ' : ""}"<", ">", "=" or ")"`);
  }
  function parse19(kind = "unknown") {
    const start = this.tokenStart;
    this.skipSC();
    this.eat(LeftParenthesis);
    const left = readTerm.call(this);
    const leftComparison = readComparison.call(this, left.type === "Identifier");
    const middle = readTerm.call(this);
    let rightComparison = null;
    let right = null;
    if (this.lookupNonWSType(0) !== RightParenthesis) {
      rightComparison = readComparison.call(this);
      right = readTerm.call(this);
    }
    this.skipSC();
    this.eat(RightParenthesis);
    return {
      type: "FeatureRange",
      loc: this.getLocation(start, this.tokenStart),
      kind,
      left,
      leftComparison,
      middle,
      rightComparison,
      right
    };
  }
  function generate19(node) {
    this.token(LeftParenthesis, "(");
    this.node(node.left);
    this.tokenize(node.leftComparison);
    this.node(node.middle);
    if (node.right) {
      this.tokenize(node.rightComparison);
      this.node(node.right);
    }
    this.token(RightParenthesis, ")");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Function.js
  var Function_exports = {};
  __export(Function_exports, {
    generate: () => generate20,
    name: () => name19,
    parse: () => parse20,
    structure: () => structure19,
    walkContext: () => walkContext5
  });
  var name19 = "Function";
  var walkContext5 = "function";
  var structure19 = {
    name: String,
    children: [[]]
  };
  function parse20(readSequence2, recognizer) {
    const start = this.tokenStart;
    const name50 = this.consumeFunctionName();
    const nameLowerCase = name50.toLowerCase();
    let children;
    children = recognizer.hasOwnProperty(nameLowerCase) ? recognizer[nameLowerCase].call(this, recognizer) : readSequence2.call(this, recognizer);
    if (!this.eof) {
      this.eat(RightParenthesis);
    }
    return {
      type: "Function",
      loc: this.getLocation(start, this.tokenStart),
      name: name50,
      children
    };
  }
  function generate20(node) {
    this.token(Function, node.name + "(");
    this.children(node);
    this.token(RightParenthesis, ")");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/GeneralEnclosed.js
  var GeneralEnclosed_exports = {};
  __export(GeneralEnclosed_exports, {
    generate: () => generate21,
    name: () => name20,
    parse: () => parse21,
    structure: () => structure20
  });
  var name20 = "GeneralEnclosed";
  var structure20 = {
    kind: String,
    function: [String, null],
    children: [[]]
  };
  function parse21(kind) {
    const start = this.tokenStart;
    let functionName = null;
    if (this.tokenType === Function) {
      functionName = this.consumeFunctionName();
    } else {
      this.eat(LeftParenthesis);
    }
    const children = this.parseWithFallback(
      () => {
        const startValueToken = this.tokenIndex;
        const children2 = this.readSequence(this.scope.Value);
        if (this.eof === false && this.isBalanceEdge(startValueToken) === false) {
          this.error();
        }
        return children2;
      },
      () => this.createSingleNodeList(
        this.Raw(null, false)
      )
    );
    if (!this.eof) {
      this.eat(RightParenthesis);
    }
    return {
      type: "GeneralEnclosed",
      loc: this.getLocation(start, this.tokenStart),
      kind,
      function: functionName,
      children
    };
  }
  function generate21(node) {
    if (node.function) {
      this.token(Function, node.function + "(");
    } else {
      this.token(LeftParenthesis, "(");
    }
    this.children(node);
    this.token(RightParenthesis, ")");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Hash.js
  var Hash_exports = {};
  __export(Hash_exports, {
    generate: () => generate22,
    name: () => name21,
    parse: () => parse22,
    structure: () => structure21,
    xxx: () => xxx
  });
  var xxx = "XXX";
  var name21 = "Hash";
  var structure21 = {
    value: String
  };
  function parse22() {
    const start = this.tokenStart;
    this.eat(Hash);
    return {
      type: "Hash",
      loc: this.getLocation(start, this.tokenStart),
      value: this.substrToCursor(start + 1)
    };
  }
  function generate22(node) {
    this.token(Hash, "#" + node.value);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Identifier.js
  var Identifier_exports = {};
  __export(Identifier_exports, {
    generate: () => generate23,
    name: () => name22,
    parse: () => parse23,
    structure: () => structure22
  });
  var name22 = "Identifier";
  var structure22 = {
    name: String
  };
  function parse23() {
    return {
      type: "Identifier",
      loc: this.getLocation(this.tokenStart, this.tokenEnd),
      name: this.consume(Ident)
    };
  }
  function generate23(node) {
    this.token(Ident, node.name);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/IdSelector.js
  var IdSelector_exports = {};
  __export(IdSelector_exports, {
    generate: () => generate24,
    name: () => name23,
    parse: () => parse24,
    structure: () => structure23
  });
  var name23 = "IdSelector";
  var structure23 = {
    name: String
  };
  function parse24() {
    const start = this.tokenStart;
    this.eat(Hash);
    return {
      type: "IdSelector",
      loc: this.getLocation(start, this.tokenStart),
      name: this.substrToCursor(start + 1)
    };
  }
  function generate24(node) {
    this.token(Delim, "#" + node.name);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Layer.js
  var Layer_exports = {};
  __export(Layer_exports, {
    generate: () => generate25,
    name: () => name24,
    parse: () => parse25,
    structure: () => structure24
  });
  var FULLSTOP2 = 46;
  var name24 = "Layer";
  var structure24 = {
    name: String
  };
  function parse25() {
    let tokenStart = this.tokenStart;
    let name50 = this.consume(Ident);
    while (this.isDelim(FULLSTOP2)) {
      this.eat(Delim);
      name50 += "." + this.consume(Ident);
    }
    return {
      type: "Layer",
      loc: this.getLocation(tokenStart, this.tokenStart),
      name: name50
    };
  }
  function generate25(node) {
    this.tokenize(node.name);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/LayerList.js
  var LayerList_exports = {};
  __export(LayerList_exports, {
    generate: () => generate26,
    name: () => name25,
    parse: () => parse26,
    structure: () => structure25
  });
  var name25 = "LayerList";
  var structure25 = {
    children: [[
      "Layer"
    ]]
  };
  function parse26() {
    const children = this.createList();
    this.skipSC();
    while (!this.eof) {
      children.push(this.Layer());
      if (this.lookupTypeNonSC(0) !== Comma) {
        break;
      }
      this.skipSC();
      this.next();
      this.skipSC();
    }
    return {
      type: "LayerList",
      loc: this.getLocationFromList(children),
      children
    };
  }
  function generate26(node) {
    this.children(node, () => this.token(Comma, ","));
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/MediaQuery.js
  var MediaQuery_exports = {};
  __export(MediaQuery_exports, {
    generate: () => generate27,
    name: () => name26,
    parse: () => parse27,
    structure: () => structure26
  });
  var name26 = "MediaQuery";
  var structure26 = {
    modifier: [String, null],
    mediaType: [String, null],
    condition: ["Condition", null]
  };
  function parse27() {
    const start = this.tokenStart;
    let modifier = null;
    let mediaType = null;
    let condition = null;
    this.skipSC();
    if (this.tokenType === Ident && this.lookupTypeNonSC(1) !== LeftParenthesis) {
      const ident = this.consume(Ident);
      const identLowerCase = ident.toLowerCase();
      if (identLowerCase === "not" || identLowerCase === "only") {
        this.skipSC();
        modifier = identLowerCase;
        mediaType = this.consume(Ident);
      } else {
        mediaType = ident;
      }
      switch (this.lookupTypeNonSC(0)) {
        case Ident: {
          this.skipSC();
          this.eatIdent("and");
          condition = this.Condition("media");
          break;
        }
        case LeftCurlyBracket:
        case Semicolon:
        case Comma:
        case EOF:
          break;
        default:
          this.error("Identifier or parenthesis is expected");
      }
    } else {
      switch (this.tokenType) {
        case Ident:
        case LeftParenthesis:
        case Function: {
          condition = this.Condition("media");
          break;
        }
        case LeftCurlyBracket:
        case Semicolon:
        case EOF:
          break;
        default:
          this.error("Identifier or parenthesis is expected");
      }
    }
    return {
      type: "MediaQuery",
      loc: this.getLocation(start, this.tokenStart),
      modifier,
      mediaType,
      condition
    };
  }
  function generate27(node) {
    if (node.mediaType) {
      if (node.modifier) {
        this.token(Ident, node.modifier);
      }
      this.token(Ident, node.mediaType);
      if (node.condition) {
        this.token(Ident, "and");
        this.node(node.condition);
      }
    } else if (node.condition) {
      this.node(node.condition);
    }
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/MediaQueryList.js
  var MediaQueryList_exports = {};
  __export(MediaQueryList_exports, {
    generate: () => generate28,
    name: () => name27,
    parse: () => parse28,
    structure: () => structure27
  });
  var name27 = "MediaQueryList";
  var structure27 = {
    children: [[
      "MediaQuery"
    ]]
  };
  function parse28() {
    const children = this.createList();
    this.skipSC();
    while (!this.eof) {
      children.push(this.MediaQuery());
      if (this.tokenType !== Comma) {
        break;
      }
      this.next();
    }
    return {
      type: "MediaQueryList",
      loc: this.getLocationFromList(children),
      children
    };
  }
  function generate28(node) {
    this.children(node, () => this.token(Comma, ","));
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/NestingSelector.js
  var NestingSelector_exports = {};
  __export(NestingSelector_exports, {
    generate: () => generate29,
    name: () => name28,
    parse: () => parse29,
    structure: () => structure28
  });
  var AMPERSAND5 = 38;
  var name28 = "NestingSelector";
  var structure28 = {};
  function parse29() {
    const start = this.tokenStart;
    this.eatDelim(AMPERSAND5);
    return {
      type: "NestingSelector",
      loc: this.getLocation(start, this.tokenStart)
    };
  }
  function generate29() {
    this.token(Delim, "&");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Nth.js
  var Nth_exports = {};
  __export(Nth_exports, {
    generate: () => generate30,
    name: () => name29,
    parse: () => parse30,
    structure: () => structure29
  });
  var name29 = "Nth";
  var structure29 = {
    nth: ["AnPlusB", "Identifier"],
    selector: ["SelectorList", null]
  };
  function parse30() {
    this.skipSC();
    const start = this.tokenStart;
    let end = start;
    let selector2 = null;
    let nth2;
    if (this.lookupValue(0, "odd") || this.lookupValue(0, "even")) {
      nth2 = this.Identifier();
    } else {
      nth2 = this.AnPlusB();
    }
    end = this.tokenStart;
    this.skipSC();
    if (this.lookupValue(0, "of")) {
      this.next();
      selector2 = this.SelectorList();
      end = this.tokenStart;
    }
    return {
      type: "Nth",
      loc: this.getLocation(start, end),
      nth: nth2,
      selector: selector2
    };
  }
  function generate30(node) {
    this.node(node.nth);
    if (node.selector !== null) {
      this.token(Ident, "of");
      this.node(node.selector);
    }
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Number.js
  var Number_exports = {};
  __export(Number_exports, {
    generate: () => generate31,
    name: () => name30,
    parse: () => parse31,
    structure: () => structure30
  });
  var name30 = "Number";
  var structure30 = {
    value: String
  };
  function parse31() {
    return {
      type: "Number",
      loc: this.getLocation(this.tokenStart, this.tokenEnd),
      value: this.consume(Number2)
    };
  }
  function generate31(node) {
    this.token(Number2, node.value);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Operator.js
  var Operator_exports = {};
  __export(Operator_exports, {
    generate: () => generate32,
    name: () => name31,
    parse: () => parse32,
    structure: () => structure31
  });
  var name31 = "Operator";
  var structure31 = {
    value: String
  };
  function parse32() {
    const start = this.tokenStart;
    this.next();
    return {
      type: "Operator",
      loc: this.getLocation(start, this.tokenStart),
      value: this.substrToCursor(start)
    };
  }
  function generate32(node) {
    this.tokenize(node.value);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Parentheses.js
  var Parentheses_exports = {};
  __export(Parentheses_exports, {
    generate: () => generate33,
    name: () => name32,
    parse: () => parse33,
    structure: () => structure32
  });
  var name32 = "Parentheses";
  var structure32 = {
    children: [[]]
  };
  function parse33(readSequence2, recognizer) {
    const start = this.tokenStart;
    let children = null;
    this.eat(LeftParenthesis);
    children = readSequence2.call(this, recognizer);
    if (!this.eof) {
      this.eat(RightParenthesis);
    }
    return {
      type: "Parentheses",
      loc: this.getLocation(start, this.tokenStart),
      children
    };
  }
  function generate33(node) {
    this.token(LeftParenthesis, "(");
    this.children(node);
    this.token(RightParenthesis, ")");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Percentage.js
  var Percentage_exports = {};
  __export(Percentage_exports, {
    generate: () => generate34,
    name: () => name33,
    parse: () => parse34,
    structure: () => structure33
  });
  var name33 = "Percentage";
  var structure33 = {
    value: String
  };
  function parse34() {
    return {
      type: "Percentage",
      loc: this.getLocation(this.tokenStart, this.tokenEnd),
      value: this.consumeNumber(Percentage)
    };
  }
  function generate34(node) {
    this.token(Percentage, node.value + "%");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/PseudoClassSelector.js
  var PseudoClassSelector_exports = {};
  __export(PseudoClassSelector_exports, {
    generate: () => generate35,
    name: () => name34,
    parse: () => parse35,
    structure: () => structure34,
    walkContext: () => walkContext6
  });
  var name34 = "PseudoClassSelector";
  var walkContext6 = "function";
  var structure34 = {
    name: String,
    children: [["Raw"], null]
  };
  function parse35() {
    const start = this.tokenStart;
    let children = null;
    let name50;
    let nameLowerCase;
    this.eat(Colon);
    if (this.tokenType === Function) {
      name50 = this.consumeFunctionName();
      nameLowerCase = name50.toLowerCase();
      if (this.lookupNonWSType(0) == RightParenthesis) {
        children = this.createList();
      } else if (hasOwnProperty.call(this.pseudo, nameLowerCase)) {
        this.skipSC();
        children = this.pseudo[nameLowerCase].call(this);
        this.skipSC();
      } else {
        children = this.createList();
        children.push(
          this.Raw(null, false)
        );
      }
      this.eat(RightParenthesis);
    } else {
      name50 = this.consume(Ident);
    }
    return {
      type: "PseudoClassSelector",
      loc: this.getLocation(start, this.tokenStart),
      name: name50,
      children
    };
  }
  function generate35(node) {
    this.token(Colon, ":");
    if (node.children === null) {
      this.token(Ident, node.name);
    } else {
      this.token(Function, node.name + "(");
      this.children(node);
      this.token(RightParenthesis, ")");
    }
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/PseudoElementSelector.js
  var PseudoElementSelector_exports = {};
  __export(PseudoElementSelector_exports, {
    generate: () => generate36,
    name: () => name35,
    parse: () => parse36,
    structure: () => structure35,
    walkContext: () => walkContext7
  });
  var name35 = "PseudoElementSelector";
  var walkContext7 = "function";
  var structure35 = {
    name: String,
    children: [["Raw"], null]
  };
  function parse36() {
    const start = this.tokenStart;
    let children = null;
    let name50;
    let nameLowerCase;
    this.eat(Colon);
    this.eat(Colon);
    if (this.tokenType === Function) {
      name50 = this.consumeFunctionName();
      nameLowerCase = name50.toLowerCase();
      if (this.lookupNonWSType(0) == RightParenthesis) {
        children = this.createList();
      } else if (hasOwnProperty.call(this.pseudo, nameLowerCase)) {
        this.skipSC();
        children = this.pseudo[nameLowerCase].call(this);
        this.skipSC();
      } else {
        children = this.createList();
        children.push(
          this.Raw(null, false)
        );
      }
      this.eat(RightParenthesis);
    } else {
      name50 = this.consume(Ident);
    }
    return {
      type: "PseudoElementSelector",
      loc: this.getLocation(start, this.tokenStart),
      name: name50,
      children
    };
  }
  function generate36(node) {
    this.token(Colon, ":");
    this.token(Colon, ":");
    if (node.children === null) {
      this.token(Ident, node.name);
    } else {
      this.token(Function, node.name + "(");
      this.children(node);
      this.token(RightParenthesis, ")");
    }
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Ratio.js
  var Ratio_exports = {};
  __export(Ratio_exports, {
    generate: () => generate37,
    name: () => name36,
    parse: () => parse37,
    structure: () => structure36
  });
  var SOLIDUS6 = 47;
  function consumeTerm() {
    this.skipSC();
    switch (this.tokenType) {
      case Number2:
        return this.Number();
      case Function:
        return this.Function(this.readSequence, this.scope.Value);
      default:
        this.error("Number of function is expected");
    }
  }
  var name36 = "Ratio";
  var structure36 = {
    left: ["Number", "Function"],
    right: ["Number", "Function", null]
  };
  function parse37() {
    const start = this.tokenStart;
    const left = consumeTerm.call(this);
    let right = null;
    this.skipSC();
    if (this.isDelim(SOLIDUS6)) {
      this.eatDelim(SOLIDUS6);
      right = consumeTerm.call(this);
    }
    return {
      type: "Ratio",
      loc: this.getLocation(start, this.tokenStart),
      left,
      right
    };
  }
  function generate37(node) {
    this.node(node.left);
    this.token(Delim, "/");
    if (node.right) {
      this.node(node.right);
    } else {
      this.node(Number2, 1);
    }
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Raw.js
  var Raw_exports = {};
  __export(Raw_exports, {
    generate: () => generate38,
    name: () => name37,
    parse: () => parse38,
    structure: () => structure37
  });
  function getOffsetExcludeWS() {
    if (this.tokenIndex > 0) {
      if (this.lookupType(-1) === WhiteSpace) {
        return this.tokenIndex > 1 ? this.getTokenStart(this.tokenIndex - 1) : this.firstCharOffset;
      }
    }
    return this.tokenStart;
  }
  var name37 = "Raw";
  var structure37 = {
    value: String
  };
  function parse38(consumeUntil, excludeWhiteSpace) {
    const startOffset = this.getTokenStart(this.tokenIndex);
    let endOffset;
    this.skipUntilBalanced(this.tokenIndex, consumeUntil || this.consumeUntilBalanceEnd);
    if (excludeWhiteSpace && this.tokenStart > startOffset) {
      endOffset = getOffsetExcludeWS.call(this);
    } else {
      endOffset = this.tokenStart;
    }
    return {
      type: "Raw",
      loc: this.getLocation(startOffset, endOffset),
      value: this.substring(startOffset, endOffset)
    };
  }
  function generate38(node) {
    this.tokenize(node.value);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Rule.js
  var Rule_exports = {};
  __export(Rule_exports, {
    generate: () => generate39,
    name: () => name38,
    parse: () => parse39,
    structure: () => structure38,
    walkContext: () => walkContext8
  });
  function consumeRaw4() {
    return this.Raw(this.consumeUntilLeftCurlyBracket, true);
  }
  function consumePrelude() {
    const prelude = this.SelectorList();
    if (prelude.type !== "Raw" && this.eof === false && this.tokenType !== LeftCurlyBracket) {
      this.error();
    }
    return prelude;
  }
  var name38 = "Rule";
  var walkContext8 = "rule";
  var structure38 = {
    prelude: ["SelectorList", "Raw"],
    block: ["Block"]
  };
  function parse39() {
    const startToken = this.tokenIndex;
    const startOffset = this.tokenStart;
    let prelude;
    let block;
    if (this.parseRulePrelude) {
      prelude = this.parseWithFallback(consumePrelude, consumeRaw4);
    } else {
      prelude = consumeRaw4.call(this, startToken);
    }
    block = this.Block(true);
    return {
      type: "Rule",
      loc: this.getLocation(startOffset, this.tokenStart),
      prelude,
      block
    };
  }
  function generate39(node) {
    this.node(node.prelude);
    this.node(node.block);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Scope.js
  var Scope_exports = {};
  __export(Scope_exports, {
    generate: () => generate40,
    name: () => name39,
    parse: () => parse40,
    structure: () => structure39
  });
  var name39 = "Scope";
  var structure39 = {
    root: ["SelectorList", "Raw", null],
    limit: ["SelectorList", "Raw", null]
  };
  function parse40() {
    let root = null;
    let limit = null;
    this.skipSC();
    const startOffset = this.tokenStart;
    if (this.tokenType === LeftParenthesis) {
      this.next();
      this.skipSC();
      root = this.parseWithFallback(
        this.SelectorList,
        () => this.Raw(false, true)
      );
      this.skipSC();
      this.eat(RightParenthesis);
    }
    if (this.lookupNonWSType(0) === Ident) {
      this.skipSC();
      this.eatIdent("to");
      this.skipSC();
      this.eat(LeftParenthesis);
      this.skipSC();
      limit = this.parseWithFallback(
        this.SelectorList,
        () => this.Raw(false, true)
      );
      this.skipSC();
      this.eat(RightParenthesis);
    }
    return {
      type: "Scope",
      loc: this.getLocation(startOffset, this.tokenStart),
      root,
      limit
    };
  }
  function generate40(node) {
    if (node.root) {
      this.token(LeftParenthesis, "(");
      this.node(node.root);
      this.token(RightParenthesis, ")");
    }
    if (node.limit) {
      this.token(Ident, "to");
      this.token(LeftParenthesis, "(");
      this.node(node.limit);
      this.token(RightParenthesis, ")");
    }
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Selector.js
  var Selector_exports = {};
  __export(Selector_exports, {
    generate: () => generate41,
    name: () => name40,
    parse: () => parse41,
    structure: () => structure40
  });
  var name40 = "Selector";
  var structure40 = {
    children: [[
      "TypeSelector",
      "IdSelector",
      "ClassSelector",
      "AttributeSelector",
      "PseudoClassSelector",
      "PseudoElementSelector",
      "Combinator"
    ]]
  };
  function parse41() {
    const children = this.readSequence(this.scope.Selector);
    if (this.getFirstListNode(children) === null) {
      this.error("Selector is expected");
    }
    return {
      type: "Selector",
      loc: this.getLocationFromList(children),
      children
    };
  }
  function generate41(node) {
    this.children(node);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/SelectorList.js
  var SelectorList_exports = {};
  __export(SelectorList_exports, {
    generate: () => generate42,
    name: () => name41,
    parse: () => parse42,
    structure: () => structure41,
    walkContext: () => walkContext9
  });
  var name41 = "SelectorList";
  var walkContext9 = "selector";
  var structure41 = {
    children: [[
      "Selector",
      "Raw"
    ]]
  };
  function parse42() {
    const children = this.createList();
    while (!this.eof) {
      children.push(this.Selector());
      if (this.tokenType === Comma) {
        this.next();
        continue;
      }
      break;
    }
    return {
      type: "SelectorList",
      loc: this.getLocationFromList(children),
      children
    };
  }
  function generate42(node) {
    this.children(node, () => this.token(Comma, ","));
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/String.js
  var String_exports = {};
  __export(String_exports, {
    generate: () => generate43,
    name: () => name42,
    parse: () => parse43,
    structure: () => structure42
  });

  // ../../engine-v2/node_modules/css-tree/lib/utils/string.js
  var REVERSE_SOLIDUS = 92;
  var QUOTATION_MARK = 34;
  var APOSTROPHE2 = 39;
  function decode(str) {
    const len = str.length;
    const firstChar = str.charCodeAt(0);
    const start = firstChar === QUOTATION_MARK || firstChar === APOSTROPHE2 ? 1 : 0;
    const end = start === 1 && len > 1 && str.charCodeAt(len - 1) === firstChar ? len - 2 : len - 1;
    let decoded = "";
    for (let i = start; i <= end; i++) {
      let code2 = str.charCodeAt(i);
      if (code2 === REVERSE_SOLIDUS) {
        if (i === end) {
          if (i !== len - 1) {
            decoded = str.substr(i + 1);
          }
          break;
        }
        code2 = str.charCodeAt(++i);
        if (isValidEscape(REVERSE_SOLIDUS, code2)) {
          const escapeStart = i - 1;
          const escapeEnd = consumeEscaped(str, escapeStart);
          i = escapeEnd - 1;
          decoded += decodeEscaped(str.substring(escapeStart + 1, escapeEnd));
        } else {
          if (code2 === 13 && str.charCodeAt(i + 1) === 10) {
            i++;
          }
        }
      } else {
        decoded += str[i];
      }
    }
    return decoded;
  }
  function encode(str, apostrophe) {
    const quote = apostrophe ? "'" : '"';
    const quoteCode = apostrophe ? APOSTROPHE2 : QUOTATION_MARK;
    let encoded = "";
    let wsBeforeHexIsNeeded = false;
    for (let i = 0; i < str.length; i++) {
      const code2 = str.charCodeAt(i);
      if (code2 === 0) {
        encoded += "�";
        continue;
      }
      if (code2 <= 31 || code2 === 127) {
        encoded += "\\" + code2.toString(16);
        wsBeforeHexIsNeeded = true;
        continue;
      }
      if (code2 === quoteCode || code2 === REVERSE_SOLIDUS) {
        encoded += "\\" + str.charAt(i);
        wsBeforeHexIsNeeded = false;
      } else {
        if (wsBeforeHexIsNeeded && (isHexDigit(code2) || isWhiteSpace(code2))) {
          encoded += " ";
        }
        encoded += str.charAt(i);
        wsBeforeHexIsNeeded = false;
      }
    }
    return quote + encoded + quote;
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/String.js
  var name42 = "String";
  var structure42 = {
    value: String
  };
  function parse43() {
    return {
      type: "String",
      loc: this.getLocation(this.tokenStart, this.tokenEnd),
      value: decode(this.consume(String2))
    };
  }
  function generate43(node) {
    this.token(String2, encode(node.value));
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/StyleSheet.js
  var StyleSheet_exports = {};
  __export(StyleSheet_exports, {
    generate: () => generate44,
    name: () => name43,
    parse: () => parse44,
    structure: () => structure43,
    walkContext: () => walkContext10
  });
  var EXCLAMATIONMARK4 = 33;
  function consumeRaw5() {
    return this.Raw(null, false);
  }
  var name43 = "StyleSheet";
  var walkContext10 = "stylesheet";
  var structure43 = {
    children: [[
      "Comment",
      "CDO",
      "CDC",
      "Atrule",
      "Rule",
      "Raw"
    ]]
  };
  function parse44() {
    const start = this.tokenStart;
    const children = this.createList();
    let child;
    scan:
      while (!this.eof) {
        switch (this.tokenType) {
          case WhiteSpace:
            this.next();
            continue;
          case Comment:
            if (this.charCodeAt(this.tokenStart + 2) !== EXCLAMATIONMARK4) {
              this.next();
              continue;
            }
            child = this.Comment();
            break;
          case CDO:
            child = this.CDO();
            break;
          case CDC:
            child = this.CDC();
            break;
          // CSS Syntax Module Level 3
          // §2.2 Error handling
          // At the "top level" of a stylesheet, an <at-keyword-token> starts an at-rule.
          case AtKeyword:
            child = this.parseWithFallback(this.Atrule, consumeRaw5);
            break;
          // Anything else starts a qualified rule ...
          default:
            child = this.parseWithFallback(this.Rule, consumeRaw5);
        }
        children.push(child);
      }
    return {
      type: "StyleSheet",
      loc: this.getLocation(start, this.tokenStart),
      children
    };
  }
  function generate44(node) {
    this.children(node);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/SupportsDeclaration.js
  var SupportsDeclaration_exports = {};
  __export(SupportsDeclaration_exports, {
    generate: () => generate45,
    name: () => name44,
    parse: () => parse45,
    structure: () => structure44
  });
  var name44 = "SupportsDeclaration";
  var structure44 = {
    declaration: "Declaration"
  };
  function parse45() {
    const start = this.tokenStart;
    this.eat(LeftParenthesis);
    this.skipSC();
    const declaration = this.Declaration();
    if (!this.eof) {
      this.eat(RightParenthesis);
    }
    return {
      type: "SupportsDeclaration",
      loc: this.getLocation(start, this.tokenStart),
      declaration
    };
  }
  function generate45(node) {
    this.token(LeftParenthesis, "(");
    this.node(node.declaration);
    this.token(RightParenthesis, ")");
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/TypeSelector.js
  var TypeSelector_exports = {};
  __export(TypeSelector_exports, {
    generate: () => generate46,
    name: () => name45,
    parse: () => parse46,
    structure: () => structure45
  });
  var ASTERISK5 = 42;
  var VERTICALLINE3 = 124;
  function eatIdentifierOrAsterisk() {
    if (this.tokenType !== Ident && this.isDelim(ASTERISK5) === false) {
      this.error("Identifier or asterisk is expected");
    }
    this.next();
  }
  var name45 = "TypeSelector";
  var structure45 = {
    name: String
  };
  function parse46() {
    const start = this.tokenStart;
    if (this.isDelim(VERTICALLINE3)) {
      this.next();
      eatIdentifierOrAsterisk.call(this);
    } else {
      eatIdentifierOrAsterisk.call(this);
      if (this.isDelim(VERTICALLINE3)) {
        this.next();
        eatIdentifierOrAsterisk.call(this);
      }
    }
    return {
      type: "TypeSelector",
      loc: this.getLocation(start, this.tokenStart),
      name: this.substrToCursor(start)
    };
  }
  function generate46(node) {
    this.tokenize(node.name);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/UnicodeRange.js
  var UnicodeRange_exports = {};
  __export(UnicodeRange_exports, {
    generate: () => generate47,
    name: () => name46,
    parse: () => parse47,
    structure: () => structure46
  });
  var PLUSSIGN8 = 43;
  var HYPHENMINUS6 = 45;
  var QUESTIONMARK3 = 63;
  function eatHexSequence(offset, allowDash) {
    let len = 0;
    for (let pos = this.tokenStart + offset; pos < this.tokenEnd; pos++) {
      const code2 = this.charCodeAt(pos);
      if (code2 === HYPHENMINUS6 && allowDash && len !== 0) {
        eatHexSequence.call(this, offset + len + 1, false);
        return -1;
      }
      if (!isHexDigit(code2)) {
        this.error(
          allowDash && len !== 0 ? "Hyphen minus" + (len < 6 ? " or hex digit" : "") + " is expected" : len < 6 ? "Hex digit is expected" : "Unexpected input",
          pos
        );
      }
      if (++len > 6) {
        this.error("Too many hex digits", pos);
      }
      ;
    }
    this.next();
    return len;
  }
  function eatQuestionMarkSequence(max) {
    let count = 0;
    while (this.isDelim(QUESTIONMARK3)) {
      if (++count > max) {
        this.error("Too many question marks");
      }
      this.next();
    }
  }
  function startsWith2(code2) {
    if (this.charCodeAt(this.tokenStart) !== code2) {
      this.error((code2 === PLUSSIGN8 ? "Plus sign" : "Hyphen minus") + " is expected");
    }
  }
  function scanUnicodeRange() {
    let hexLength = 0;
    switch (this.tokenType) {
      case Number2:
        hexLength = eatHexSequence.call(this, 1, true);
        if (this.isDelim(QUESTIONMARK3)) {
          eatQuestionMarkSequence.call(this, 6 - hexLength);
          break;
        }
        if (this.tokenType === Dimension || this.tokenType === Number2) {
          startsWith2.call(this, HYPHENMINUS6);
          eatHexSequence.call(this, 1, false);
          break;
        }
        break;
      case Dimension:
        hexLength = eatHexSequence.call(this, 1, true);
        if (hexLength > 0) {
          eatQuestionMarkSequence.call(this, 6 - hexLength);
        }
        break;
      default:
        this.eatDelim(PLUSSIGN8);
        if (this.tokenType === Ident) {
          hexLength = eatHexSequence.call(this, 0, true);
          if (hexLength > 0) {
            eatQuestionMarkSequence.call(this, 6 - hexLength);
          }
          break;
        }
        if (this.isDelim(QUESTIONMARK3)) {
          this.next();
          eatQuestionMarkSequence.call(this, 5);
          break;
        }
        this.error("Hex digit or question mark is expected");
    }
  }
  var name46 = "UnicodeRange";
  var structure46 = {
    value: String
  };
  function parse47() {
    const start = this.tokenStart;
    this.eatIdent("u");
    scanUnicodeRange.call(this);
    return {
      type: "UnicodeRange",
      loc: this.getLocation(start, this.tokenStart),
      value: this.substrToCursor(start)
    };
  }
  function generate47(node) {
    this.tokenize(node.value);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Url.js
  var Url_exports = {};
  __export(Url_exports, {
    generate: () => generate48,
    name: () => name47,
    parse: () => parse48,
    structure: () => structure47
  });

  // ../../engine-v2/node_modules/css-tree/lib/utils/url.js
  var SPACE3 = 32;
  var REVERSE_SOLIDUS2 = 92;
  var QUOTATION_MARK2 = 34;
  var APOSTROPHE3 = 39;
  var LEFTPARENTHESIS3 = 40;
  var RIGHTPARENTHESIS3 = 41;
  function decode2(str) {
    const len = str.length;
    let start = 4;
    let end = str.charCodeAt(len - 1) === RIGHTPARENTHESIS3 ? len - 2 : len - 1;
    let decoded = "";
    while (start < end && isWhiteSpace(str.charCodeAt(start))) {
      start++;
    }
    while (start < end && isWhiteSpace(str.charCodeAt(end))) {
      end--;
    }
    for (let i = start; i <= end; i++) {
      let code2 = str.charCodeAt(i);
      if (code2 === REVERSE_SOLIDUS2) {
        if (i === end) {
          if (i !== len - 1) {
            decoded = str.substr(i + 1);
          }
          break;
        }
        code2 = str.charCodeAt(++i);
        if (isValidEscape(REVERSE_SOLIDUS2, code2)) {
          const escapeStart = i - 1;
          const escapeEnd = consumeEscaped(str, escapeStart);
          i = escapeEnd - 1;
          decoded += decodeEscaped(str.substring(escapeStart + 1, escapeEnd));
        } else {
          if (code2 === 13 && str.charCodeAt(i + 1) === 10) {
            i++;
          }
        }
      } else {
        decoded += str[i];
      }
    }
    return decoded;
  }
  function encode2(str) {
    let encoded = "";
    let wsBeforeHexIsNeeded = false;
    for (let i = 0; i < str.length; i++) {
      const code2 = str.charCodeAt(i);
      if (code2 === 0) {
        encoded += "�";
        continue;
      }
      if (code2 <= 31 || code2 === 127) {
        encoded += "\\" + code2.toString(16);
        wsBeforeHexIsNeeded = true;
        continue;
      }
      if (code2 === SPACE3 || code2 === REVERSE_SOLIDUS2 || code2 === QUOTATION_MARK2 || code2 === APOSTROPHE3 || code2 === LEFTPARENTHESIS3 || code2 === RIGHTPARENTHESIS3) {
        encoded += "\\" + str.charAt(i);
        wsBeforeHexIsNeeded = false;
      } else {
        if (wsBeforeHexIsNeeded && isHexDigit(code2)) {
          encoded += " ";
        }
        encoded += str.charAt(i);
        wsBeforeHexIsNeeded = false;
      }
    }
    return "url(" + encoded + ")";
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Url.js
  var name47 = "Url";
  var structure47 = {
    value: String
  };
  function parse48() {
    const start = this.tokenStart;
    let value;
    switch (this.tokenType) {
      case Url:
        value = decode2(this.consume(Url));
        break;
      case Function:
        if (!this.cmpStr(this.tokenStart, this.tokenEnd, "url(")) {
          this.error("Function name must be `url`");
        }
        this.eat(Function);
        this.skipSC();
        value = decode(this.consume(String2));
        this.skipSC();
        if (!this.eof) {
          this.eat(RightParenthesis);
        }
        break;
      default:
        this.error("Url or Function is expected");
    }
    return {
      type: "Url",
      loc: this.getLocation(start, this.tokenStart),
      value
    };
  }
  function generate48(node) {
    this.token(Url, encode2(node.value));
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/Value.js
  var Value_exports = {};
  __export(Value_exports, {
    generate: () => generate49,
    name: () => name48,
    parse: () => parse49,
    structure: () => structure48
  });
  var name48 = "Value";
  var structure48 = {
    children: [[]]
  };
  function parse49() {
    const start = this.tokenStart;
    const children = this.readSequence(this.scope.Value);
    return {
      type: "Value",
      loc: this.getLocation(start, this.tokenStart),
      children
    };
  }
  function generate49(node) {
    this.children(node);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/WhiteSpace.js
  var WhiteSpace_exports = {};
  __export(WhiteSpace_exports, {
    generate: () => generate50,
    name: () => name49,
    parse: () => parse50,
    structure: () => structure49
  });
  var SPACE4 = Object.freeze({
    type: "WhiteSpace",
    loc: null,
    value: " "
  });
  var name49 = "WhiteSpace";
  var structure49 = {
    value: String
  };
  function parse50() {
    this.eat(WhiteSpace);
    return SPACE4;
  }
  function generate50(node) {
    this.token(WhiteSpace, node.value);
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/config/lexer.js
  var lexer_default = {
    generic: true,
    cssWideKeywords,
    ...data_default,
    node: node_exports
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/scope/index.js
  var scope_exports = {};
  __export(scope_exports, {
    AtrulePrelude: () => atrulePrelude_default,
    Selector: () => selector_default,
    Value: () => value_default
  });

  // ../../engine-v2/node_modules/css-tree/lib/syntax/scope/default.js
  var NUMBERSIGN4 = 35;
  var ASTERISK6 = 42;
  var PLUSSIGN9 = 43;
  var HYPHENMINUS7 = 45;
  var SOLIDUS7 = 47;
  var U2 = 117;
  function defaultRecognizer(context) {
    switch (this.tokenType) {
      case Hash:
        return this.Hash();
      case Comma:
        return this.Operator();
      case LeftParenthesis:
        return this.Parentheses(this.readSequence, context.recognizer);
      case LeftSquareBracket:
        return this.Brackets(this.readSequence, context.recognizer);
      case String2:
        return this.String();
      case Dimension:
        return this.Dimension();
      case Percentage:
        return this.Percentage();
      case Number2:
        return this.Number();
      case Function:
        return this.cmpStr(this.tokenStart, this.tokenEnd, "url(") ? this.Url() : this.Function(this.readSequence, context.recognizer);
      case Url:
        return this.Url();
      case Ident:
        if (this.cmpChar(this.tokenStart, U2) && this.cmpChar(this.tokenStart + 1, PLUSSIGN9)) {
          return this.UnicodeRange();
        } else {
          return this.Identifier();
        }
      case Delim: {
        const code2 = this.charCodeAt(this.tokenStart);
        if (code2 === SOLIDUS7 || code2 === ASTERISK6 || code2 === PLUSSIGN9 || code2 === HYPHENMINUS7) {
          return this.Operator();
        }
        if (code2 === NUMBERSIGN4) {
          this.error("Hex or identifier is expected", this.tokenStart + 1);
        }
        break;
      }
    }
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/scope/atrulePrelude.js
  var atrulePrelude_default = {
    getNode: defaultRecognizer
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/scope/selector.js
  var NUMBERSIGN5 = 35;
  var AMPERSAND6 = 38;
  var ASTERISK7 = 42;
  var PLUSSIGN10 = 43;
  var SOLIDUS8 = 47;
  var FULLSTOP3 = 46;
  var GREATERTHANSIGN4 = 62;
  var VERTICALLINE4 = 124;
  var TILDE3 = 126;
  function onWhiteSpace(next, children) {
    if (children.last !== null && children.last.type !== "Combinator" && next !== null && next.type !== "Combinator") {
      children.push({
        // FIXME: this.Combinator() should be used instead
        type: "Combinator",
        loc: null,
        name: " "
      });
    }
  }
  function getNode() {
    switch (this.tokenType) {
      case LeftSquareBracket:
        return this.AttributeSelector();
      case Hash:
        return this.IdSelector();
      case Colon:
        if (this.lookupType(1) === Colon) {
          return this.PseudoElementSelector();
        } else {
          return this.PseudoClassSelector();
        }
      case Ident:
        return this.TypeSelector();
      case Number2:
      case Percentage:
        return this.Percentage();
      case Dimension:
        if (this.charCodeAt(this.tokenStart) === FULLSTOP3) {
          this.error("Identifier is expected", this.tokenStart + 1);
        }
        break;
      case Delim: {
        const code2 = this.charCodeAt(this.tokenStart);
        switch (code2) {
          case PLUSSIGN10:
          case GREATERTHANSIGN4:
          case TILDE3:
          case SOLIDUS8:
            return this.Combinator();
          case FULLSTOP3:
            return this.ClassSelector();
          case ASTERISK7:
          case VERTICALLINE4:
            return this.TypeSelector();
          case NUMBERSIGN5:
            return this.IdSelector();
          case AMPERSAND6:
            return this.NestingSelector();
        }
        break;
      }
    }
  }
  var selector_default = {
    onWhiteSpace,
    getNode
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/function/expression.js
  function expression_default() {
    return this.createSingleNodeList(
      this.Raw(null, false)
    );
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/function/var.js
  function var_default() {
    const children = this.createList();
    this.skipSC();
    children.push(this.Identifier());
    this.skipSC();
    if (this.tokenType === Comma) {
      children.push(this.Operator());
      const startIndex = this.tokenIndex;
      const value = this.parseCustomProperty ? this.Value(null) : this.Raw(this.consumeUntilExclamationMarkOrSemicolon, false);
      if (value.type === "Value" && value.children.isEmpty) {
        for (let offset = startIndex - this.tokenIndex; offset <= 0; offset++) {
          if (this.lookupType(offset) === WhiteSpace) {
            value.children.appendData({
              type: "WhiteSpace",
              loc: null,
              value: " "
            });
            break;
          }
        }
      }
      children.push(value);
    }
    return children;
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/scope/value.js
  function isPlusMinusOperator(node) {
    return node !== null && node.type === "Operator" && (node.value[node.value.length - 1] === "-" || node.value[node.value.length - 1] === "+");
  }
  var value_default = {
    getNode: defaultRecognizer,
    onWhiteSpace(next, children) {
      if (isPlusMinusOperator(next)) {
        next.value = " " + next.value;
      }
      if (isPlusMinusOperator(children.last)) {
        children.last.value += " ";
      }
    },
    "expression": expression_default,
    "var": var_default
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/atrule/container.js
  var nonContainerNameKeywords = /* @__PURE__ */ new Set(["none", "and", "not", "or"]);
  var container_default = {
    parse: {
      prelude() {
        const children = this.createList();
        if (this.tokenType === Ident) {
          const name50 = this.substring(this.tokenStart, this.tokenEnd);
          if (!nonContainerNameKeywords.has(name50.toLowerCase())) {
            children.push(this.Identifier());
          }
        }
        children.push(this.Condition("container"));
        return children;
      },
      block(nested = false) {
        return this.Block(nested);
      }
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/atrule/font-face.js
  var font_face_default = {
    parse: {
      prelude: null,
      block() {
        return this.Block(true);
      }
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/atrule/import.js
  function parseWithFallback(parse52, fallback) {
    return this.parseWithFallback(
      () => {
        try {
          return parse52.call(this);
        } finally {
          this.skipSC();
          if (this.lookupNonWSType(0) !== RightParenthesis) {
            this.error();
          }
        }
      },
      fallback || (() => this.Raw(null, true))
    );
  }
  var parseFunctions = {
    layer() {
      this.skipSC();
      const children = this.createList();
      const node = parseWithFallback.call(this, this.Layer);
      if (node.type !== "Raw" || node.value !== "") {
        children.push(node);
      }
      return children;
    },
    supports() {
      this.skipSC();
      const children = this.createList();
      const node = parseWithFallback.call(
        this,
        this.Declaration,
        () => parseWithFallback.call(this, () => this.Condition("supports"))
      );
      if (node.type !== "Raw" || node.value !== "") {
        children.push(node);
      }
      return children;
    }
  };
  var import_default6 = {
    parse: {
      prelude() {
        const children = this.createList();
        switch (this.tokenType) {
          case String2:
            children.push(this.String());
            break;
          case Url:
          case Function:
            children.push(this.Url());
            break;
          default:
            this.error("String or url() is expected");
        }
        this.skipSC();
        if (this.tokenType === Ident && this.cmpStr(this.tokenStart, this.tokenEnd, "layer")) {
          children.push(this.Identifier());
        } else if (this.tokenType === Function && this.cmpStr(this.tokenStart, this.tokenEnd, "layer(")) {
          children.push(this.Function(null, parseFunctions));
        }
        this.skipSC();
        if (this.tokenType === Function && this.cmpStr(this.tokenStart, this.tokenEnd, "supports(")) {
          children.push(this.Function(null, parseFunctions));
        }
        if (this.lookupNonWSType(0) === Ident || this.lookupNonWSType(0) === LeftParenthesis) {
          children.push(this.MediaQueryList());
        }
        return children;
      },
      block: null
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/atrule/layer.js
  var layer_default = {
    parse: {
      prelude() {
        return this.createSingleNodeList(
          this.LayerList()
        );
      },
      block() {
        return this.Block(false);
      }
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/atrule/media.js
  var media_default = {
    parse: {
      prelude() {
        return this.createSingleNodeList(
          this.MediaQueryList()
        );
      },
      block(nested = false) {
        return this.Block(nested);
      }
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/atrule/nest.js
  var nest_default = {
    parse: {
      prelude() {
        return this.createSingleNodeList(
          this.SelectorList()
        );
      },
      block() {
        return this.Block(true);
      }
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/atrule/page.js
  var page_default = {
    parse: {
      prelude() {
        return this.createSingleNodeList(
          this.SelectorList()
        );
      },
      block() {
        return this.Block(true);
      }
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/atrule/scope.js
  var scope_default = {
    parse: {
      prelude() {
        return this.createSingleNodeList(
          this.Scope()
        );
      },
      block(nested = false) {
        return this.Block(nested);
      }
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/atrule/starting-style.js
  var starting_style_default = {
    parse: {
      prelude: null,
      block(nested = false) {
        return this.Block(nested);
      }
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/atrule/supports.js
  var supports_default = {
    parse: {
      prelude() {
        return this.createSingleNodeList(
          this.Condition("supports")
        );
      },
      block(nested = false) {
        return this.Block(nested);
      }
    }
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/atrule/index.js
  var atrule_default = {
    container: container_default,
    "font-face": font_face_default,
    import: import_default6,
    layer: layer_default,
    media: media_default,
    nest: nest_default,
    page: page_default,
    scope: scope_default,
    "starting-style": starting_style_default,
    supports: supports_default
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/pseudo/lang.js
  function parseLanguageRangeList() {
    const children = this.createList();
    this.skipSC();
    loop: while (!this.eof) {
      switch (this.tokenType) {
        case Ident:
          children.push(this.Identifier());
          break;
        case String2:
          children.push(this.String());
          break;
        case Comma:
          children.push(this.Operator());
          break;
        case RightParenthesis:
          break loop;
        default:
          this.error("Identifier, string or comma is expected");
      }
      this.skipSC();
    }
    return children;
  }

  // ../../engine-v2/node_modules/css-tree/lib/syntax/pseudo/index.js
  var selectorList = {
    parse() {
      return this.createSingleNodeList(
        this.SelectorList()
      );
    }
  };
  var selector = {
    parse() {
      return this.createSingleNodeList(
        this.Selector()
      );
    }
  };
  var identList = {
    parse() {
      return this.createSingleNodeList(
        this.Identifier()
      );
    }
  };
  var langList = {
    parse: parseLanguageRangeList
  };
  var nth = {
    parse() {
      return this.createSingleNodeList(
        this.Nth()
      );
    }
  };
  var pseudo_default = {
    "dir": identList,
    "has": selectorList,
    "lang": langList,
    "matches": selectorList,
    "is": selectorList,
    "-moz-any": selectorList,
    "-webkit-any": selectorList,
    "where": selectorList,
    "not": selectorList,
    "nth-child": nth,
    "nth-last-child": nth,
    "nth-last-of-type": nth,
    "nth-of-type": nth,
    "slotted": selector,
    "host": selector,
    "host-context": selector
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/node/index-parse.js
  var index_parse_exports = {};
  __export(index_parse_exports, {
    AnPlusB: () => parse2,
    Atrule: () => parse3,
    AtrulePrelude: () => parse4,
    AttributeSelector: () => parse5,
    Block: () => parse6,
    Brackets: () => parse7,
    CDC: () => parse8,
    CDO: () => parse9,
    ClassSelector: () => parse10,
    Combinator: () => parse11,
    Comment: () => parse12,
    Condition: () => parse13,
    Declaration: () => parse14,
    DeclarationList: () => parse15,
    Dimension: () => parse16,
    Feature: () => parse17,
    FeatureFunction: () => parse18,
    FeatureRange: () => parse19,
    Function: () => parse20,
    GeneralEnclosed: () => parse21,
    Hash: () => parse22,
    IdSelector: () => parse24,
    Identifier: () => parse23,
    Layer: () => parse25,
    LayerList: () => parse26,
    MediaQuery: () => parse27,
    MediaQueryList: () => parse28,
    NestingSelector: () => parse29,
    Nth: () => parse30,
    Number: () => parse31,
    Operator: () => parse32,
    Parentheses: () => parse33,
    Percentage: () => parse34,
    PseudoClassSelector: () => parse35,
    PseudoElementSelector: () => parse36,
    Ratio: () => parse37,
    Raw: () => parse38,
    Rule: () => parse39,
    Scope: () => parse40,
    Selector: () => parse41,
    SelectorList: () => parse42,
    String: () => parse43,
    StyleSheet: () => parse44,
    SupportsDeclaration: () => parse45,
    TypeSelector: () => parse46,
    UnicodeRange: () => parse47,
    Url: () => parse48,
    Value: () => parse49,
    WhiteSpace: () => parse50
  });

  // ../../engine-v2/node_modules/css-tree/lib/syntax/config/parser.js
  var parser_default = {
    parseContext: {
      default: "StyleSheet",
      stylesheet: "StyleSheet",
      atrule: "Atrule",
      atrulePrelude(options) {
        return this.AtrulePrelude(options.atrule ? String(options.atrule) : null);
      },
      mediaQueryList: "MediaQueryList",
      mediaQuery: "MediaQuery",
      condition(options) {
        return this.Condition(options.kind);
      },
      rule: "Rule",
      selectorList: "SelectorList",
      selector: "Selector",
      block() {
        return this.Block(true);
      },
      declarationList: "DeclarationList",
      declaration: "Declaration",
      value: "Value"
    },
    features: {
      supports: {
        selector() {
          return this.Selector();
        }
      },
      container: {
        style() {
          return this.Declaration();
        }
      }
    },
    scope: scope_exports,
    atrule: atrule_default,
    pseudo: pseudo_default,
    node: index_parse_exports
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/config/walker.js
  var walker_default = {
    node: node_exports
  };

  // ../../engine-v2/node_modules/css-tree/lib/syntax/index.js
  var syntax_default = create_default({
    ...lexer_default,
    ...parser_default,
    ...walker_default
  });

  // ../../engine-v2/node_modules/css-tree/lib/utils/ident.js
  var ident_exports = {};
  __export(ident_exports, {
    decode: () => decode3,
    encode: () => encode3
  });
  var REVERSE_SOLIDUS3 = 92;
  function decode3(str) {
    const end = str.length - 1;
    let decoded = "";
    for (let i = 0; i < str.length; i++) {
      let code2 = str.charCodeAt(i);
      if (code2 === REVERSE_SOLIDUS3) {
        if (i === end) {
          break;
        }
        code2 = str.charCodeAt(++i);
        if (isValidEscape(REVERSE_SOLIDUS3, code2)) {
          const escapeStart = i - 1;
          const escapeEnd = consumeEscaped(str, escapeStart);
          i = escapeEnd - 1;
          decoded += decodeEscaped(str.substring(escapeStart + 1, escapeEnd));
        } else {
          if (code2 === 13 && str.charCodeAt(i + 1) === 10) {
            i++;
          }
        }
      } else {
        decoded += str[i];
      }
    }
    return decoded;
  }
  function encode3(str) {
    let encoded = "";
    if (str.length === 1 && str.charCodeAt(0) === 45) {
      return "\\-";
    }
    for (let i = 0; i < str.length; i++) {
      const code2 = str.charCodeAt(i);
      if (code2 === 0) {
        encoded += "�";
        continue;
      }
      if (
        // If the character is in the range [\1-\1f] (U+0001 to U+001F) or is U+007F ...
        // Note: Do not compare with 0x0001 since 0x0000 is precessed before
        code2 <= 31 || code2 === 127 || // [or] ... is in the range [0-9] (U+0030 to U+0039),
        code2 >= 48 && code2 <= 57 && // If the character is the first character ...
        (i === 0 || // If the character is the second character ... and the first character is a "-" (U+002D)
        i === 1 && str.charCodeAt(0) === 45)
      ) {
        encoded += "\\" + code2.toString(16) + " ";
        continue;
      }
      if (isName(code2)) {
        encoded += str.charAt(i);
      } else {
        encoded += "\\" + str.charAt(i);
      }
    }
    return encoded;
  }

  // ../../engine-v2/node_modules/css-tree/lib/index.js
  var {
    tokenize: tokenize2,
    parse: parse51,
    generate: generate51,
    lexer,
    createLexer,
    walk: walk2,
    find,
    findLast,
    findAll,
    toPlainObject,
    fromPlainObject,
    fork
  } = syntax_default;

  // ../../engine-v2/css-rules.mjs
  var cssNames = {
    "specified-h1": "h1の指定書式",
    "specified-h2": "h2の指定書式",
    "specified-h3": "h3の指定書式",
    "specified-paragraph": "段落の指定書式",
    "specified-strong": "strongの指定書式",
    "specified-emphasis": "emの指定書式",
    "free-targets": "対象ごとの自由書式",
    "free-color": "色の指定",
    "free-size": "文字サイズの指定",
    "free-family": "フォントの指定",
    "free-emphasis": "太さ・斜体の指定",
    "class-paragraph1": "paragraph1の色",
    "class-paragraph2": "paragraph2の色",
    "class-paragraph3": "paragraph3の色",
    "class-paragraph4": "paragraph4の色",
    "block-width": "ブロックの幅",
    "block-height": "ブロックの高さ",
    "block-padding": "ブロックの内側余白",
    "block-margin": "ブロックの外側余白",
    "block-border": "ブロックの枠線"
  };
  var cssWeights = {
    "sample2-2_1": [20, 20, 20, 15, 15, 10],
    "sample2-2_2": [60, 10, 10, 10, 10],
    "sample2-3": [25, 25, 25, 25],
    "sample2-4": [20, 20, 20, 20, 20]
  };
  var cssRuleConfigs = {
    "sample2-2_1": [
      { ruleId: "specified-h1", ruleType: "registered-css", target: "h1要素の指定書式", expected: { "font-size": "40px", "font-family": "sans-serif", color: "#ff6464" } },
      { ruleId: "specified-h2", ruleType: "registered-css", target: "h2要素の指定書式", expected: { "font-size": "24px", "font-family": "sans-serif", color: "#6464ff" } },
      { ruleId: "specified-h3", ruleType: "registered-css", target: "h3要素の指定書式", expected: { "font-size": "20px", "font-family": "sans-serif", color: "#64cc64" } },
      { ruleId: "specified-paragraph", ruleType: "registered-css", target: "p要素の指定書式", expected: { "font-family": "serif", color: "#646464" } },
      { ruleId: "specified-strong", ruleType: "registered-css", target: "strong要素の指定書式", expected: { "font-family": "sans-serif", "font-weight": "bold" } },
      { ruleId: "specified-emphasis", ruleType: "registered-css", target: "em要素の指定書式", expected: { "font-family": "sans-serif" } }
    ],
    "sample2-2_2": [
      { ruleId: "free-targets", ruleType: "registered-css", target: "h1・h2・h3・p・strong・emへの自由書式", expected: {} },
      { ruleId: "free-color", ruleType: "registered-css", target: "いずれかの対象への色指定", expected: {} },
      { ruleId: "free-size", ruleType: "registered-css", target: "いずれかの対象への文字サイズ指定", expected: {} },
      { ruleId: "free-family", ruleType: "registered-css", target: "いずれかの対象へのフォント指定", expected: {} },
      { ruleId: "free-emphasis", ruleType: "registered-css", target: "いずれかの対象への太さ・斜体指定", expected: {} }
    ],
    "sample2-3": [
      { ruleId: "class-paragraph1", ruleType: "registered-css", target: "paragraph1 classのp要素", expected: { color: "red" } },
      { ruleId: "class-paragraph2", ruleType: "registered-css", target: "paragraph2 classのp要素", expected: { color: "blue" } },
      { ruleId: "class-paragraph3", ruleType: "registered-css", target: "paragraph3 classのp要素", expected: { color: "green" } },
      { ruleId: "class-paragraph4", ruleType: "registered-css", target: "paragraph4 classのp要素", expected: { color: "yellow" } }
    ],
    "sample2-4": [
      { ruleId: "block-width", ruleType: "registered-css", target: "test01〜test05 divの幅", expected: {} },
      { ruleId: "block-height", ruleType: "registered-css", target: "test01〜test05 divの高さ", expected: {} },
      { ruleId: "block-padding", ruleType: "registered-css", target: "test01〜test05 divの内側余白", expected: {} },
      { ruleId: "block-margin", ruleType: "registered-css", target: "test01〜test05 divの外側余白", expected: {} },
      { ruleId: "block-border", ruleType: "registered-css", target: "test01〜test05 divの枠線", expected: {} }
    ]
  };
  var HTML_NS = "http://www.w3.org/1999/xhtml";
  var textProps = ["color", "font-size", "font-family", "font-weight", "font-style"];
  var inherited = /* @__PURE__ */ new Set([...textProps, "line-height", "text-align", "visibility"]);
  var sides = ["top", "right", "bottom", "left"];
  var inert = /* @__PURE__ */ new Set(["template", "noscript", "script"]);
  var excluded = /* @__PURE__ */ new Set([...inert, "style", "pre", "code", "textarea", "xmp", "iframe"]);
  var supported = /* @__PURE__ */ new Set([
    ...textProps,
    "width",
    "height",
    "display",
    "visibility",
    "opacity",
    "padding",
    "margin",
    "border",
    "border-width",
    "border-style",
    "border-color",
    ...sides.flatMap((s) => [
      "padding-" + s,
      "margin-" + s,
      "border-" + s,
      ...["width", "style", "color"].map((p) => `border-${s}-${p}`)
    ])
  ]);
  var harmless = /* @__PURE__ */ new Set([
    "background-color",
    "text-align",
    "line-height",
    "letter-spacing",
    "word-spacing",
    "text-decoration",
    "text-decoration-line",
    "text-decoration-color",
    "text-decoration-style",
    "border-radius",
    "box-sizing"
  ]);
  var limits = { characters: 131072, rules: 1e3, declarations: 5e3, selectors: 4e3, operations: 5e5 };
  var wide = /* @__PURE__ */ new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);
  var attr = (n, key) => {
    var _a, _b, _c;
    return (_c = (_b = (_a = n == null ? void 0 : n.attrs) == null ? void 0 : _a.find((a) => a.name === key)) == null ? void 0 : _b.value) != null ? _c : "";
  };
  var hasAttr = (n, key) => {
    var _a;
    return Boolean((_a = n == null ? void 0 : n.attrs) == null ? void 0 : _a.some((a) => a.name === key));
  };
  var parent = (n) => {
    var _a;
    return ((_a = n == null ? void 0 : n.parentNode) == null ? void 0 : _a.tagName) ? n.parentNode : null;
  };
  var classes = (n) => attr(n, "class").split(/\s+/).filter(Boolean);
  var cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  var list = (n) => {
    var _a;
    return ((_a = n == null ? void 0 : n.children) == null ? void 0 : _a.toArray()) || [];
  };
  var decode4 = (name50) => ident_exports.decode(name50);
  var part = (ok, points, node) => ({ ok: Boolean(ok), points, node });
  function elements(root, excludeContent = false, includeForeign = false) {
    const out = [], stack = [root];
    while (stack.length) {
      const n = stack.pop();
      if (!n || (excludeContent ? excluded : inert).has(n.tagName) || excludeContent && hasAttr(n, "hidden")) continue;
      if (n.tagName && (includeForeign || n.namespaceURI === HTML_NS)) out.push(n);
      stack.push(...(n.childNodes || []).slice().reverse());
    }
    return out;
  }
  function bodyText(root) {
    const stack = [root];
    let text = "";
    while (stack.length) {
      const n = stack.pop();
      if (!n || excluded.has(n.tagName) || hasAttr(n, "hidden")) continue;
      if (n.nodeName === "#text") text += n.value;
      stack.push(...(n.childNodes || []).slice().reverse());
    }
    return text.replace(/\s/g, "");
  }
  var contentBaselines = {
    textLength: 677,
    tags: { h1: 1, h2: 3, h3: 6, p: 16, strong: 5, em: 5 },
    classes: { paragraph1: 6, paragraph2: 5, paragraph3: 4, paragraph4: 1 }
  };
  function checkContent(rubric, nodes, diag) {
    const body = nodes.find((n) => n.tagName === "body");
    if (rubric === "sample2-4") {
      for (let i = 1; i <= 5; i++) {
        const found = nodes.filter((n) => n.tagName === "div" && classes(n).includes("test0" + i));
        if (found.length !== 1 || !bodyText(found[0])) diag("css_target_content_changed");
      }
    } else {
      if (bodyText(body).length < contentBaselines.textLength * 0.8) diag("css_target_content_changed");
      for (const [tag, count] of Object.entries(contentBaselines.tags)) {
        const targets = nodes.filter((n) => n.tagName === tag);
        if (targets.length < count || targets.some((n) => !bodyText(n))) diag("css_target_content_changed");
      }
      if (rubric === "sample2-3") for (const [cl, count] of Object.entries(contentBaselines.classes)) {
        if (nodes.filter((n) => n.tagName === "p" && classes(n).includes(cl)).length < count) diag("css_target_content_changed");
      }
    }
  }
  function compileSelector(selector2) {
    if (selector2.type !== "Selector") return null;
    const parts = [{ tests: [], relation: null }], spec2 = [0, 0, 0], classNames = /* @__PURE__ */ new Set();
    for (const n of list(selector2)) {
      const current = parts[parts.length - 1];
      if (n.type === "Combinator") {
        if (![" ", ">"].includes(n.name) || !current.tests.length) return null;
        parts.push({ tests: [], relation: n.name });
      } else if (["TypeSelector", "ClassSelector", "IdSelector"].includes(n.type)) {
        const name50 = decode4(n.name);
        if (n.type === "TypeSelector" && (name50.includes("|") || name50 !== "*" && !/^[a-z][\w-]*$/i.test(name50))) return null;
        current.tests.push({ type: n.type, name: n.type === "TypeSelector" ? name50.toLowerCase() : name50 });
        if (n.type === "IdSelector") spec2[0]++;
        if (n.type === "ClassSelector") {
          spec2[1]++;
          classNames.add(name50);
        }
        if (n.type === "TypeSelector" && name50 !== "*") spec2[2]++;
      } else return null;
      if (parts.length > 32 || spec2.reduce((a, b) => a + b, 0) > 64) return null;
    }
    return parts.every((p) => p.tests.length) ? { parts, spec: spec2, classNames } : null;
  }
  function matches(node, selector2, tick) {
    function at(n, i) {
      tick();
      if (!n || n.namespaceURI !== HTML_NS) return false;
      if (!selector2.parts[i].tests.every((t) => t.type === "TypeSelector" ? t.name === "*" || n.tagName === t.name : t.type === "IdSelector" ? attr(n, "id") === t.name : classes(n).includes(t.name))) return false;
      if (i === 0) return true;
      if (selector2.parts[i].relation === ">") return at(parent(n), i - 1);
      for (let p = parent(n); p; p = parent(p)) if (at(p, i - 1)) return true;
      return false;
    }
    return at(node, selector2.parts.length - 1);
  }
  function validValue(property2, value) {
    let ast;
    try {
      ast = parse51(value, { context: "value" });
    } catch (_) {
      return { ok: false };
    }
    let unknown = false;
    walk2(ast, (n) => {
      if (n.type === "Raw" || n.type === "Function" && ["var", "env", "calc", "min", "max", "clamp", "attr"].includes(decode4(n.name).toLowerCase())) unknown = true;
      if (n.type === "Dimension" && !["px", "in", "cm", "mm", "q", "pt", "pc", "deg", "grad", "rad", "turn"].includes(n.unit.toLowerCase())) unknown = true;
      if (n.type === "Percentage" && !/color$/.test(property2)) unknown = true;
    });
    if (!unknown && lexer.matchProperty(property2, ast).error) return { ok: false };
    return { ok: !unknown, unknown, ast };
  }
  function valueTokens(ast) {
    return list(ast).filter((n) => n.type !== "WhiteSpace").map((n) => generate51(n));
  }
  function expand(prop, value, ast) {
    const vals = wide.has(value) ? [value] : valueTokens(ast);
    const four = [vals[0], vals[1] || vals[0], vals[2] || vals[0], vals[3] || vals[1] || vals[0]];
    if (["padding", "margin"].includes(prop)) return sides.map((s, i) => [prop + "-" + s, four[i]]);
    if (["border-width", "border-style", "border-color"].includes(prop)) return sides.map((s, i) => ["border-" + s + "-" + prop.slice(7), four[i]]);
    if (prop === "border" || sides.some((s) => prop === "border-" + s)) {
      const values = { width: "medium", style: "none", color: "currentcolor" };
      if (wide.has(value)) for (const p of Object.keys(values)) values[p] = value;
      else for (const token of vals) {
        if (validValue("border-style", token).ok) values.style = token;
        else if (validValue("border-width", token).ok) values.width = token;
        else values.color = token;
      }
      return (prop === "border" ? sides : [prop.slice(7)]).flatMap((s) => Object.entries(values).map(([p, v]) => ["border-" + s + "-" + p, v]));
    }
    return [[prop, value]];
  }
  function buildCascade(document, nodes, diag) {
    var _a, _b, _c, _d;
    const index = /* @__PURE__ */ new Map(), matchCache = /* @__PURE__ */ new Map(), winnerCache = /* @__PURE__ */ new Map(), authorCache = /* @__PURE__ */ new Map();
    let order = 0, operations = 0, ruleCount = 0, declarationCount = 0, selectorCount = 0, characters = 0;
    const tick = () => {
      if (++operations > limits.operations) throw new Error("css_complexity_limit");
    };
    const checkLength = (source) => {
      characters += source.length;
      if (characters > limits.characters) throw new Error("css_complexity_limit");
    };
    function declarations(children, selectors, node = null) {
      for (const d of children) {
        if (++declarationCount > limits.declarations) throw new Error("css_complexity_limit");
        if (d.type !== "Declaration") {
          diag("css_unsupported_syntax");
          continue;
        }
        const prop = decode4(d.property).toLowerCase(), val = generate51(d.value), keyword2 = val.toLowerCase();
        if (prop.startsWith("--")) {
          diag("css_value_needs_review");
          continue;
        }
        const check = validValue(prop, val);
        if (!check.ok) {
          if (check.unknown) diag("css_value_needs_review");
          continue;
        }
        if (harmless.has(prop)) continue;
        if (!supported.has(prop)) {
          diag("css_property_needs_review");
          continue;
        }
        if (keyword2 === "revert" || keyword2 === "revert-layer") {
          diag("css_value_needs_review");
          continue;
        }
        for (const [p, v] of expand(prop, wide.has(keyword2) ? keyword2 : val, check.ast)) {
          const entry = { prop: p, val: v, important: Boolean(d.important), order: order++, selectors, node };
          if (!index.has(p)) index.set(p, []);
          index.get(p).push(entry);
        }
      }
    }
    function parseSheet(source) {
      var _a2;
      checkLength(source);
      let ast;
      try {
        ast = parse51(source, { context: "stylesheet", onParseError: () => diag("css_parse_error") });
      } catch (_) {
        diag("css_parse_error");
        return;
      }
      for (const item of list(ast)) {
        if (++ruleCount > limits.rules) throw new Error("css_complexity_limit");
        if (item.type === "Atrule") {
          if (item.name.toLowerCase() !== "charset") diag("css_unsupported_at_rule");
          continue;
        }
        if (item.type !== "Rule" || ((_a2 = item.prelude) == null ? void 0 : _a2.type) !== "SelectorList") {
          diag("css_unsupported_syntax");
          continue;
        }
        const selectors = list(item.prelude).map(compileSelector);
        selectorCount += selectors.length;
        if (selectorCount > limits.selectors) throw new Error("css_complexity_limit");
        if (!selectors.length || selectors.some((s) => !s)) {
          diag("css_unsupported_selector");
          continue;
        }
        declarations(list(item.block), selectors);
      }
    }
    for (const n of elements(document, false, true)) {
      if (n.namespaceURI !== HTML_NS) {
        if (n.tagName === "style" || attr(n, "style")) diag("css_foreign_style_needs_review");
        continue;
      }
      if (n.tagName === "link" && /(?:^|\s)stylesheet(?:\s|$)/i.test(attr(n, "rel"))) diag("css_external_stylesheet");
      if (n.tagName === "style") {
        const type = attr(n, "type").trim().toLowerCase();
        if (type && type !== "text/css") continue;
        if (attr(n, "media").trim() && attr(n, "media").trim().toLowerCase() !== "all" || attr(n, "title") || hasAttr(n, "disabled")) {
          diag("css_conditional_stylesheet");
          continue;
        }
        parseSheet((n.childNodes || []).map((x) => x.value || "").join(""));
      }
      if (attr(n, "style")) {
        const source = attr(n, "style");
        checkLength(source);
        try {
          declarations(list(parse51(source, { context: "declarationList", onParseError: () => diag("css_parse_error") })), null, n);
        } catch (e) {
          if (e.message === "css_complexity_limit") throw e;
          diag("css_parse_error");
        }
      }
    }
    if (document.mode && document.mode !== "no-quirks") diag("css_document_mode_needs_review");
    function matched(node, sel) {
      let cache = matchCache.get(sel);
      if (!cache) {
        cache = /* @__PURE__ */ new Map();
        matchCache.set(sel, cache);
      }
      if (!cache.has(node)) cache.set(node, matches(node, sel, tick));
      return cache.get(node);
    }
    function winner(node, prop) {
      if (!node) return null;
      let cache = winnerCache.get(node);
      if (!cache) {
        cache = /* @__PURE__ */ new Map();
        winnerCache.set(node, cache);
      }
      if (cache.has(prop)) return cache.get(prop);
      let best = null;
      for (const d of index.get(prop) || []) {
        tick();
        let specificity = null;
        if (d.node) {
          if (d.node === node) specificity = [0, 0, 0];
        } else for (const s of d.selectors) if (matched(node, s) && (!specificity || cmp(s.spec, specificity) > 0)) specificity = s.spec;
        if (!specificity) continue;
        const hit = { ...d, specificity };
        if (!best || Number(hit.important) - Number(best.important) > 0 || hit.important === best.important && (Number(Boolean(hit.node)) - Number(Boolean(best.node)) > 0 || Boolean(hit.node) === Boolean(best.node) && (cmp(hit.specificity, best.specificity) > 0 || cmp(hit.specificity, best.specificity) === 0 && hit.order > best.order))) best = hit;
      }
      cache.set(prop, best);
      return best;
    }
    function authored(node, prop, depth = 0) {
      if (!node || depth > 128) return null;
      let cache = authorCache.get(node);
      if (!cache) {
        cache = /* @__PURE__ */ new Map();
        authorCache.set(node, cache);
      }
      if (cache.has(prop)) return cache.get(prop);
      const d = winner(node, prop);
      let hit = null;
      if (d) {
        const keyword2 = d.val.toLowerCase();
        if (keyword2 === "inherit" || keyword2 === "unset" && inherited.has(prop) || keyword2 === "currentcolor" && prop === "color") {
          const resolved = authored(parent(node), prop, depth + 1);
          if (resolved) hit = { ...resolved, decl: d };
          else diag("css_inheritance_needs_review");
        } else if (keyword2 === "initial" || keyword2 === "unset") {
          const initial = {
            "font-weight": "normal",
            "font-style": "normal",
            width: "auto",
            height: "auto",
            display: "inline",
            visibility: "visible",
            opacity: "1"
          };
          let value = initial[prop];
          if (/^(padding|margin)-/.test(prop)) value = "0";
          if (/^border-.*-width$/.test(prop)) value = "medium";
          if (/^border-.*-style$/.test(prop)) value = "none";
          if (/^border-.*-color$/.test(prop)) value = "currentcolor";
          if (value !== void 0) hit = { value, decl: d };
          else diag("css_initial_needs_review");
        } else hit = { value: d.val, decl: d };
      } else if (inherited.has(prop)) {
        const uaSpecified = /^h[1-6]$/.test(node.tagName) && ["font-size", "font-weight"].includes(prop) || ["strong", "b"].includes(node.tagName) && prop === "font-weight" || ["em", "i"].includes(node.tagName) && prop === "font-style";
        if (!uaSpecified) hit = authored(parent(node), prop, depth + 1);
        else if (prop === "font-size" && authored(parent(node), prop, depth + 1)) diag("css_ua_inheritance_needs_review");
      }
      cache.set(prop, hit);
      return hit;
    }
    function classTarget(node, cls) {
      return (index.get("color") || []).some((d) => {
        var _a2;
        tick();
        return (_a2 = d.selectors) == null ? void 0 : _a2.some((s) => s.classNames.has(cls) && matched(node, s));
      });
    }
    for (const n of nodes) {
      const display = (_a = winner(n, "display")) == null ? void 0 : _a.val.toLowerCase();
      const visibility = (_b = authored(n, "visibility")) == null ? void 0 : _b.value.toLowerCase();
      const opacity = (_c = winner(n, "opacity")) == null ? void 0 : _c.val;
      const fontSize = (_d = winner(n, "font-size")) == null ? void 0 : _d.val;
      if (display === "none" || ["hidden", "collapse"].includes(visibility) || opacity !== void 0 && Number(opacity) === 0 || fontSize && /^0(?:[a-z]+)?$/i.test(fontSize)) diag("css_hidden_content");
    }
    return { authored, classTarget };
  }
  var namedColors = {
    red: "#ff0000",
    blue: "#0000ff",
    green: "#008000",
    lime: "#00ff00",
    yellow: "#ffff00",
    black: "#000000",
    white: "#ffffff",
    gray: "#808080",
    grey: "#808080",
    silver: "#c0c0c0",
    maroon: "#800000",
    navy: "#000080",
    purple: "#800080",
    teal: "#008080",
    olive: "#808000",
    aqua: "#00ffff",
    cyan: "#00ffff",
    fuchsia: "#ff00ff",
    magenta: "#ff00ff",
    orange: "#ffa500"
  };
  function color(value) {
    const v = value.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(namedColors, v)) return namedColors[v];
    let m = v.match(/^#([0-9a-f]{3,8})$/);
    if (m) {
      let digits = m[1];
      if (digits.length === 3 || digits.length === 4) digits = [...digits].map((x) => x + x).join("");
      if (digits.length === 6 || digits.length === 8 && digits.endsWith("ff")) return "#" + digits.slice(0, 6);
      return null;
    }
    m = v.match(/^rgba?\((.*)\)$/);
    if (!m) return null;
    const pieces = m[1].trim().split(/\s*[,/]\s*|\s+/).filter(Boolean);
    if (pieces.length !== 3 && pieces.length !== 4) return null;
    const number2 = (p) => /^[-+]?(?:\d*\.)?\d+%?$/.test(p) ? parseFloat(p) : NaN;
    if (pieces.length === 4 && number2(pieces[3]) / (pieces[3].endsWith("%") ? 100 : 1) < 1) return null;
    const rgb = pieces.slice(0, 3).map((p) => Math.round(Math.max(0, Math.min(255, number2(p) * (p.endsWith("%") ? 255 / 100 : 1)))));
    return rgb.every(Number.isFinite) ? "#" + rgb.map((x) => x.toString(16).padStart(2, "0")).join("") : null;
  }
  function pixels(value) {
    const m = value.trim().match(/^([+-]?(?:\d*\.)?\d+)(px|in|cm|mm|q|pt|pc)?$/i);
    if (!m) return null;
    if (!m[2]) return Number(m[1]) === 0 ? 0 : null;
    return Number(m[1]) * { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, pt: 96 / 72, pc: 16 }[m[2].toLowerCase()];
  }
  var expectedTypes = {
    color: (value) => typeof value === "string" && color(value) !== null,
    "font-size": (value) => typeof value === "string" && pixels(value) !== null && Number.isFinite(pixels(value)) && pixels(value) > 0 && pixels(value) <= 1e5,
    "font-family": (value) => typeof value === "string" && (/* @__PURE__ */ new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong"])).has(value.trim().toLowerCase()),
    "font-weight": (value) => typeof value === "string" && (value === "bold" || value === "700"),
    "font-style": (value) => typeof value === "string" && ["normal", "italic", "oblique"].includes(value)
  };
  function configFor(rubricId, ruleId) {
    return (cssRuleConfigs[rubricId] || []).find((config) => config.ruleId === ruleId) || null;
  }
  function validateCssRuleExpected(rubricId, ruleId, expected) {
    const config = configFor(rubricId, ruleId);
    if (!config) return { ok: false, code: "css_rule_unknown" };
    if (!expected || typeof expected !== "object" || Array.isArray(expected)) return { ok: false, code: "css_expected_object" };
    const allowed = Object.keys(config.expected);
    const unknown = Object.keys(expected).find((key) => !allowed.includes(key));
    if (unknown) return { ok: false, code: "css_expected_unknown_key", key: unknown };
    const missing = allowed.find((key) => !Object.prototype.hasOwnProperty.call(expected, key));
    if (missing) return { ok: false, code: "css_expected_missing_key", key: missing };
    for (const [key, value] of Object.entries(expected)) {
      if (!expectedTypes[key] || !expectedTypes[key](value)) return { ok: false, code: "css_expected_value", key };
    }
    return { ok: true };
  }
  function expectedFor(ctx, rubricId, ruleId, defaults) {
    const supplied = typeof ctx.expected === "function" ? ctx.expected(ruleId) : void 0;
    const expected = supplied === void 0 ? defaults : supplied;
    const checked = validateCssRuleExpected(rubricId, ruleId, expected);
    if (!checked.ok) throw new Error(`${checked.code}:${rubricId}:${ruleId}${checked.key ? `:${checked.key}` : ""}`);
    return expected;
  }
  function valueMatches(prop, hit, expected, diag) {
    if (!hit) return false;
    const value = hit.value.trim().toLowerCase();
    if (prop === "color") {
      const actual = color(value);
      if (!actual) diag("css_color_needs_review");
      return actual === color(expected);
    }
    if (prop === "font-size") {
      const actual = pixels(value);
      if (actual === null) diag("css_font_size_needs_review");
      return actual !== null && Math.abs(actual - pixels(expected)) < 1e-8;
    }
    if (prop === "font-family") {
      const generic = /* @__PURE__ */ new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong"]);
      const names2 = value.split(",").map((x) => x.trim());
      if (!generic.has(names2[0])) {
        diag("css_font_family_needs_review");
        return false;
      }
      return names2[0] === expected.trim().toLowerCase();
    }
    if (prop === "font-weight") {
      if (["bolder", "lighter"].includes(value)) diag("css_font_weight_needs_review");
      return value === "bold" || Number(value) === 700;
    }
    return value === expected;
  }
  function addRule(ctx, out, id, points, parts) {
    if (ctx.rule) ctx.rule(id, points, parts);
    else out.push({
      ruleId: id,
      label: cssNames[id],
      points,
      earned: parts.reduce((sum, p) => sum + (p.ok ? p.points : 0), 0),
      checks: parts.map((p) => ({ passed: Boolean(p.ok), points: p.points }))
    });
  }
  function applyCssRules(rubricId, ctx = {}) {
    var _a;
    const out = [], document = ctx.document || ((_a = ctx.parsed) == null ? void 0 : _a.document), diagnostics = ctx.diagnostics || [];
    const seen = new Set(diagnostics.map((d) => d.code));
    const diag = (code2) => {
      if (!seen.has(code2)) {
        seen.add(code2);
        diagnostics.push({ code: code2 });
      }
    };
    const nodes = elements(document, true), all = (tag) => nodes.filter((n) => n.tagName === tag);
    checkContent(rubricId, nodes, diag);
    let cascade;
    try {
      cascade = buildCascade(document, nodes, diag);
    } catch (e) {
      if (e.message !== "css_complexity_limit") throw e;
      diag("css_complexity_limit");
      cascade = { authored: () => null, classTarget: () => false };
    }
    const { authored, classTarget } = cascade;
    const has = (n, prop) => Boolean(authored(n, prop));
    if (rubricId === "sample2-2_1") {
      const specs = [
        ["h1", "specified-h1", [["font-size", 8], ["font-family", 6], ["color", 6]]],
        ["h2", "specified-h2", [["font-size", 8], ["font-family", 6], ["color", 6]]],
        ["h3", "specified-h3", [["font-size", 8], ["font-family", 6], ["color", 6]]],
        ["p", "specified-paragraph", [["font-family", 7.5], ["color", 7.5]]],
        ["strong", "specified-strong", [["font-family", 10], ["font-weight", 5]]],
        ["em", "specified-emphasis", [["font-family", 10]]]
      ];
      for (const [tag, id, req] of specs) {
        const expected = expectedFor(ctx, rubricId, id, configFor(rubricId, id).expected);
        const ns = all(tag), parts = req.flatMap(([p, pts]) => ns.length ? ns.map((n) => part(valueMatches(p, authored(n, p), expected[p], diag), pts / ns.length, n)) : [part(false, pts)]);
        addRule(ctx, out, id, req.reduce((s, r) => s + r[1], 0), parts);
      }
    } else if (rubricId === "sample2-2_2") {
      const tags = ["h1", "h2", "h3", "p", "strong", "em"], targets = tags.flatMap(all);
      expectedFor(ctx, rubricId, "free-targets", {});
      addRule(ctx, out, "free-targets", 60, tags.flatMap((t) => all(t).length ? all(t).map((n) => part(textProps.some((p) => has(n, p)), 10 / all(t).length, n)) : [part(false, 10)]));
      for (const [id, props] of [["free-color", ["color"]], ["free-size", ["font-size"]], ["free-family", ["font-family"]], ["free-emphasis", ["font-weight", "font-style"]]]) {
        expectedFor(ctx, rubricId, id, {});
        const n = targets.find((n2) => props.some((p) => has(n2, p)));
        addRule(ctx, out, id, 10, [part(Boolean(n), 10, n)]);
      }
    } else if (rubricId === "sample2-3") {
      for (let i = 1; i <= 4; i++) {
        const cls = "paragraph" + i, ns = all("p").filter((n) => classes(n).includes(cls));
        const id = "class-" + cls, expected = expectedFor(ctx, rubricId, id, configFor(rubricId, id).expected);
        addRule(ctx, out, id, 25, [
          part(ns.length && ns.every((n) => classTarget(n, cls)), 10, ns[0]),
          part(ns.length && ns.every((n) => valueMatches("color", authored(n, "color"), expected.color, diag)), 15, ns[0])
        ]);
      }
    } else if (rubricId === "sample2-4") {
      for (const [id, prop] of [["block-width", "width"], ["block-height", "height"], ["block-padding", "padding"], ["block-margin", "margin"], ["block-border", "border"]]) {
        expectedFor(ctx, rubricId, id, {});
        const props = prop === "border" ? sides.flatMap((s) => ["width", "style", "color"].map((p) => `border-${s}-${p}`)) : ["padding", "margin"].includes(prop) ? sides.map((s) => prop + "-" + s) : [prop];
        addRule(ctx, out, id, 20, [1, 2, 3, 4, 5].map((i) => {
          const ns = all("div").filter((n) => classes(n).includes("test0" + i));
          return part(ns.length === 1 && props.every((p) => has(ns[0], p)), 4, ns[0]);
        }));
      }
    } else throw new Error("rubric_unavailable");
    return out;
  }

  // ../../engine-v2/legacy-config.mjs
  var legacyRuleConfigs = {
    "sample1-2": [
      ["document-doctype", "DOCTYPE宣言", 10, "document", {}],
      ["document-structure", "文書の構成", 20, "html > head, body", {}],
      ["document-language", "日本語の指定", 5, "html[lang]", { value: "ja" }],
      ["document-charset", "文字コード", 10, "head meta[charset]", { value: "utf-8" }],
      ["document-viewport", "画面幅の指定", 5, "head meta[name=viewport]", { width: "device-width", initialScale: 1 }],
      ["document-title", "ページの題名", 10, "head title", {}],
      ["document-heading", "見出し", 15, "body h1", {}],
      ["document-paragraphs", "2つの段落", 25, "body p (2 paragraphs)", { texts: ["pタグで囲まれたところは、段落を意味しています。", "新しい段落を追加します。"] }]
    ],
    "sample1-3_1": [
      ["heading-levels", "見出し1〜6", 30, "body h1..h6", { texts: [1, 2, 3, 4, 5, 6].map((n) => "見出し" + n) }],
      ["separate-paragraphs", "3つの段落", 20, "body p (3 paragraphs)", { texts: [1, 2, 3].map((n) => n + "段落目の文章") }],
      ["within-paragraph-break", "段落内の改行", 20, "body p > br", { before: "1段落目の文章をここに書きます。", after: "次の段落にはいかないが、改行したいときに改行タグを使います。" }],
      ["semantic-strong", "重要な語句", 15, "body p strong", { text: "strongタグ", context: "重要な語句にはstrongタグを使います。" }],
      ["semantic-emphasis", "強調する語句", 15, "body p em", { text: "emタグ", context: "strongほど強くはないが、強調したいときはemタグを使います。" }]
    ]
  };
  for (const id of Object.keys(legacyRuleConfigs)) {
    legacyRuleConfigs[id] = legacyRuleConfigs[id].map(([ruleId, label, points, target, expected]) => ({ ruleId, label, points, ruleType: "registered-html", target, expected }));
  }

  // ../../engine-v2/sheet-config.mjs
  var CONFIG_CONTRACT = "registered-html-css-v1";
  var RULE_HEADERS = ["targetId", "rubricVersion", "ruleId", "ruleType", "target", "expected", "points", "message", "enabled"];
  var POLICY_HEADERS = ["year", "grade", "targetId", "configVersion", "intakeEnabled", "proofPolicy", "submissionFormat", "assetPolicy", "rubricVersion", "acceptedTemplateVersions", "legacyRubricVersion", "lateSubmissionPolicy", "legacyFm2Pid", "legacyReceiptPolicy", "resultDisplayPolicy", "notes"];
  var own = (obj, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(obj, key);
  var plain = (obj) => obj !== null && typeof obj === "object" && !Array.isArray(obj) && Object.getPrototypeOf(obj) === Object.prototype;
  var fail = (reason) => {
    throw new Error("html_config_" + reason);
  };
  var clone = (value) => JSON.parse(JSON.stringify(value));
  var mergeCatalog = (configs, names2, weights) => Object.fromEntries(Object.entries(configs).map(([id, rules]) => [id, rules.map((rule, index) => ({ ...rule, label: rule.label || names2[rule.ruleId], points: weights[id][index] }))]));
  var catalog = { ...legacyRuleConfigs, ...mergeCatalog(htmlRuleConfigs, htmlNames, htmlWeights), ...mergeCatalog(cssRuleConfigs, cssNames, cssWeights) };
  function ruleCatalog() {
    return clone(catalog);
  }
  function canonicalJson(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
    if (plain(value)) return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
    return fail("non_json_value");
  }
  function sameShape(value, model, depth = 0) {
    if (depth > 12) fail("expected_depth");
    if (model === null) {
      if (value !== null) fail("expected_null");
      return;
    }
    if (Array.isArray(model)) {
      if (!Array.isArray(value) || value.length !== model.length) fail("expected_array");
      model.forEach((m, i) => sameShape(value[i], m, depth + 1));
      return;
    }
    if (plain(model)) {
      if (!plain(value) || canonicalJson(Object.keys(value).sort()) !== canonicalJson(Object.keys(model).sort())) fail("expected_keys");
      for (const key of Object.keys(model)) sameShape(value[key], model[key], depth + 1);
      return;
    }
    if (typeof value !== typeof model) fail("expected_type");
    if (typeof model === "string" && (value.length > 4e3 || model.trim() && !value.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))) fail("expected_text");
    if (typeof model === "number" && (!Number.isFinite(value) || value < 0 || value > 1e5)) fail("expected_number");
    if (!["string", "number", "boolean"].includes(typeof model)) fail("expected_type");
  }
  function identifier(value, kind) {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value)) fail(kind);
    return value;
  }
  function validateMeaning(targetId, ruleId, value, model) {
    if (own(cssRuleConfigs, targetId)) {
      if (!validateCssRuleExpected(targetId, ruleId, value).ok) fail("css_expected");
      return;
    }
    const positiveInt = (v) => Number.isInteger(v) && v >= 1 && v <= 1e5;
    const relativePath = (v) => typeof v === "string" && /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(v) && !v.split("/").some((p) => p === "." || p === "..");
    const distinct = (items) => new Set(items).size === items.length;
    const normalized2 = (v) => v.normalize("NFKC").replace(/[\s。、，．「」『』"']/g, "");
    const distinctText = (items) => items.every((v) => normalized2(v).length > 0) && distinct(items.map(normalized2));
    if (ruleId === "document-language" && !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value.value)) fail("language");
    if (ruleId === "document-charset" && value.value.toLowerCase() !== "utf-8") fail("charset");
    if (ruleId === "document-viewport" && (value.width !== "device-width" || value.initialScale <= 0 || value.initialScale > 10)) fail("viewport");
    if (ruleId === "image-widths" && !value.widths.every(positiveInt)) fail("widths");
    if (ruleId === "image-alternatives" && !distinctText(value.alternatives)) fail("image_alternatives");
    if (["document-paragraphs", "heading-levels", "separate-paragraphs"].includes(ruleId) && !distinctText(value.texts)) fail("duplicate_text");
    if (["ingredients-list", "procedure-list", "nested-topics"].includes(ruleId) && !distinctText(value.items)) fail("duplicate_items");
    if (["nested-second-level", "nested-third-level"].includes(ruleId) && !value.items.every(distinctText)) fail("duplicate_items");
    if (ruleId === "outline-sections" && !distinctText(value.sections)) fail("duplicate_sections");
    if (ruleId === "outline-subsections" && !value.sections.every((s) => distinctText(s.headings))) fail("duplicate_headings");
    if (ruleId === "image-paths" && (!value.images.every((v) => relativePath(v.src)) || !distinct(value.images.map((v) => v.src)))) fail("image_paths");
    if (ruleId === "topic-images" && (!value.images.every((v) => relativePath(v.src) && positiveInt(v.width)) || !distinct(value.images.map((v) => v.src)))) fail("topic_images");
    if (ruleId === "relative-page-links" && (!value.hrefs.every(relativePath) || !distinct(value.hrefs))) fail("relative_links");
    if (["external-links", "external-new-tab"].includes(ruleId) && (!value.hrefs.every((v) => /^https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9_.~!$&'()*+,;=:@%/?#-]*)?$/.test(v)) || !distinct(value.hrefs))) fail("external_links");
    if (ruleId === "external-new-tab" && value.target !== "_blank") fail("external_target");
    if (ruleId === "matching-fragment-links" && (!positiveInt(value.minParagraphs) || !value.minimumText.every(positiveInt) || !distinct(value.topics))) fail("topic_conditions");
    if (ruleId === "outline-emphasis" && value.emphasis.some((v, i) => v.tag !== model.emphasis[i].tag || !Number.isInteger(v.section) || v.section < 0 || v.section > 1 || !Number.isInteger(v.paragraph) || v.paragraph < 0 || v.paragraph > 2 || !["first", "last"].includes(v.position))) fail("emphasis_context");
  }
  function validateReferences(targetId, rules) {
    const expected = (id) => rules.find((r) => r.ruleId === id).expected;
    const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
    if (targetId === "sample1-3_2") {
      const sections = expected("outline-sections").sections;
      const subsections = expected("outline-subsections").sections;
      const paragraphs = expected("outline-paragraphs").sections;
      const breaks = expected("outline-breaks").sections;
      for (let s = 0; s < 2; s++) {
        if (subsections[s].title !== sections[s] || paragraphs[s].title !== sections[s] || breaks[s].title !== sections[s]) fail("outline_section_reference");
        for (let p = 0; p < 3; p++) {
          if (paragraphs[s].paragraphs[p].heading !== subsections[s].headings[p] || breaks[s].paragraphs[p].heading !== subsections[s].headings[p]) fail("outline_heading_reference");
          if (!paragraphs[s].paragraphs[p].first.startsWith(breaks[s].paragraphs[p].beforeBreak)) fail("outline_break_reference");
        }
      }
    }
    if (targetId === "sample1-5_1" && !equal(expected("external-links").hrefs, expected("external-new-tab").hrefs)) fail("external_link_reference");
    if (targetId === "sample1-5_2" && !equal(expected("matching-fragment-links").topics, expected("topic-headings").headings)) fail("topic_heading_reference");
  }
  function gridToRecords(grid, headers, formulas = []) {
    if (!Array.isArray(grid) || grid.length < 1 || grid.length > 2001) fail("row_limit");
    if (!Array.isArray(grid[0]) || grid[0].length !== headers.length || grid[0].some((v, i) => v !== headers[i])) fail("headers");
    if (formulas.some((row) => row.some((value) => value !== ""))) fail("formula_not_allowed");
    return grid.slice(1).filter((row) => row.some((value) => value !== "" && value !== null && value !== void 0)).map((row) => {
      if (row.length !== headers.length) fail("row_width");
      return Object.fromEntries(headers.map((key, index) => [key, row[index]]));
    });
  }
  function validateRules(targetId, version, inputRules) {
    identifier(targetId, "target_id");
    identifier(version, "version");
    if (!own(catalog, targetId)) fail("unknown_target");
    const definitions = catalog[targetId];
    if (!Array.isArray(inputRules) || inputRules.length !== definitions.length) fail("rule_count");
    const seen = /* @__PURE__ */ new Set();
    const rules = definitions.map((def) => {
      const matches2 = inputRules.filter((row2) => row2.ruleId === def.ruleId);
      if (matches2.length !== 1 || seen.has(def.ruleId)) fail("rule_duplicate_or_missing");
      seen.add(def.ruleId);
      const row = matches2[0];
      if (!plain(row) || canonicalJson(Object.keys(row).sort()) !== canonicalJson(["ruleId", "ruleType", "target", "expected", "points", "message", "enabled"].sort())) fail("rule_fields");
      if (row.ruleType !== def.ruleType || row.target !== def.target) fail("registered_target");
      if (typeof row.enabled !== "boolean") fail("enabled_boolean");
      if (typeof row.points !== "number" || !Number.isFinite(row.points) || row.points < 0 || row.points > 100) fail("points");
      if (typeof row.message !== "string" || !row.message.trim() || row.message.length > 500 || /[\u0000-\u001f<>]/.test(row.message)) fail("message");
      if (targetId === "sample1-4" && row.ruleId === "image-heights") {
        if (!plain(row.expected) || Object.keys(row.expected).join(",") !== "heights" || !Array.isArray(row.expected.heights) || row.expected.heights.length !== 5 || row.expected.heights.some((v) => v !== null && (!Number.isInteger(v) || v < 1 || v > 1e5))) fail("height_values");
      } else sameShape(row.expected, def.expected);
      validateMeaning(targetId, def.ruleId, row.expected, def.expected);
      return clone(row);
    });
    if (Math.abs(rules.reduce((sum, row) => sum + (row.enabled ? row.points : 0), 0) - 100) > 1e-8) fail("total_not_100");
    validateReferences(targetId, rules);
    return { schemaVersion: 1, contract: CONFIG_CONTRACT, targetId, version, rules };
  }
  function compileRubricRows(records, targetId, version) {
    if (!Array.isArray(records) || records.length > 2e3) fail("row_limit");
    for (const row of records) {
      if (!plain(row) || canonicalJson(Object.keys(row).sort()) !== canonicalJson([...RULE_HEADERS].sort())) fail("row_fields");
      identifier(row.targetId, "target_id");
      identifier(row.rubricVersion, "version");
    }
    const selected = records.filter((row) => row.targetId === targetId && row.rubricVersion === version).map((row) => {
      let expected;
      if (typeof row.expected !== "string" || row.expected.length > 3e4) fail("expected_json");
      try {
        expected = JSON.parse(row.expected);
      } catch {
        fail("expected_json");
      }
      return {
        ruleId: row.ruleId,
        ruleType: row.ruleType,
        target: row.target,
        expected,
        points: row.points,
        message: row.message,
        enabled: row.enabled
      };
    });
    return validateRules(targetId, version, selected);
  }
  function validateCompiledRubric(compiled) {
    if (!plain(compiled) || canonicalJson(Object.keys(compiled).sort()) !== canonicalJson(["schemaVersion", "contract", "targetId", "version", "rules"].sort()) || compiled.schemaVersion !== 1 || compiled.contract !== CONFIG_CONTRACT) fail("compiled_contract");
    return validateRules(compiled.targetId, compiled.version, compiled.rules);
  }

  // ../../engine-v2/parser-entry.mjs
  var engineVersion = "html-css-0.3.0-parse5-8.0.1-csstree-3.2.1";
  var engineSourceHash = typeof __HTML_ENGINE_SOURCE_HASH__ === "string" ? __HTML_ENGINE_SOURCE_HASH__ : "unbundled-local-candidate";
  var rubricVersion = "2026-09-trial-1";
  var extendedRubricVersion = "2026-09-candidate-2";
  var own2 = (object, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(object, key);
  var MAX_NODES = 2e4;
  var MAX_DEPTH = 128;
  var HTML_NS2 = "http://www.w3.org/1999/xhtml";
  var excluded2 = /* @__PURE__ */ new Set(["script", "style", "template", "noscript", "textarea", "xmp", "iframe", "pre", "code"]);
  var names = {
    "document-doctype": "DOCTYPE宣言",
    "document-structure": "文書の構成",
    "document-language": "日本語の指定",
    "document-charset": "文字コード",
    "document-viewport": "画面幅の指定",
    "document-title": "ページの題名",
    "document-heading": "見出し",
    "document-paragraphs": "2つの段落",
    "heading-levels": "見出し1〜6",
    "separate-paragraphs": "3つの段落",
    "within-paragraph-break": "段落内の改行",
    "semantic-strong": "重要な語句",
    "semantic-emphasis": "強調する語句",
    ...htmlNames,
    ...cssNames
  };
  function descriptor(id) {
    const weights = id === "sample1-2" ? [10, 20, 5, 10, 5, 10, 15, 25] : id === "sample1-3_1" ? [30, 20, 20, 15, 15] : own2(htmlWeights, id) ? htmlWeights[id] : own2(cssWeights, id) ? cssWeights[id] : null;
    if (!weights) throw new Error("rubric_unavailable");
    return {
      id,
      version: /^(sample1-2|sample1-3_1)$/.test(id) ? rubricVersion : extendedRubricVersion,
      engineVersion,
      engineSourceHash,
      points: [...weights],
      contract: "source-aware-html-css; no-execution; no-network; explicit-document; unique-content; excluded-inert; review-unsupported"
    };
  }
  function limitedParse(source) {
    let count = 0;
    const starts = [];
    const errors = [];
    const adapter = { ...defaultTreeAdapter };
    for (const method of ["createElement", "createCommentNode", "createDocument", "createDocumentFragment"]) {
      adapter[method] = (...args) => {
        if (++count > MAX_NODES) throw new Error("node_limit");
        return defaultTreeAdapter[method](...args);
      };
    }
    for (const method of ["appendChild", "insertBefore"]) {
      adapter[method] = (parent2, ...args) => {
        let depth = 0;
        for (let node = parent2; node; node = node.parentNode) {
          if (++depth > MAX_DEPTH) throw new Error("depth_limit");
        }
        return defaultTreeAdapter[method](parent2, ...args);
      };
    }
    const parser = new Parser({
      sourceCodeLocationInfo: true,
      scriptingEnabled: false,
      treeAdapter: adapter,
      onParseError(error) {
        if (errors.length >= 500) throw new Error("parse_error_limit");
        errors.push({ code: error.code, line: error.startLine || 0 });
      }
    });
    const originalStart = parser.onStartTag.bind(parser);
    parser.onStartTag = (token) => {
      var _a;
      if (starts.length >= MAX_NODES) throw new Error("node_limit");
      starts.push({ name: token.tagName, offset: (_a = token.location) == null ? void 0 : _a.startOffset });
      originalStart(token);
      if (parser.openElements.stackTop > MAX_DEPTH) throw new Error("depth_limit");
    };
    parser.tokenizer.write(source, true);
    return { document: parser.document, starts, errors };
  }
  function attr2(node, name50) {
    var _a, _b, _c;
    return (_c = (_b = (_a = node == null ? void 0 : node.attrs) == null ? void 0 : _a.find((a) => a.name === name50)) == null ? void 0 : _b.value) != null ? _c : "";
  }
  function hasAttr2(node, name50) {
    var _a;
    return Boolean((_a = node == null ? void 0 : node.attrs) == null ? void 0 : _a.some((a) => a.name === name50));
  }
  function normalized(value) {
    return String(value).normalize("NFKC").replace(/[\s。、，．「」『』"']/g, "");
  }
  function textOf(node) {
    let value = "";
    const queue = [node];
    while (queue.length) {
      const item = queue.pop();
      if (item.nodeName === "#text") value += item.value;
      else if (!excluded2.has(item.tagName) && !hasAttr2(item, "hidden")) {
        queue.push(...(item.childNodes || []).slice().reverse());
      }
    }
    return normalized(value);
  }
  function inside(node, ancestor) {
    for (let n = node == null ? void 0 : node.parentNode; n; n = n.parentNode) if (n === ancestor) return true;
    return false;
  }
  function position(node) {
    var _a;
    const loc = ((_a = node == null ? void 0 : node.sourceCodeLocation) == null ? void 0 : _a.startTag) || (node == null ? void 0 : node.sourceCodeLocation);
    return loc ? { line: loc.startLine, column: loc.startCol } : null;
  }
  function gradeConfigured(source, compiled) {
    let definition;
    try {
      definition = validateCompiledRubric(compiled);
    } catch {
      return pending("rubric_config_invalid");
    }
    try {
      return gradeChecked(source, definition.targetId, definition.version, definition);
    } catch (error) {
      return pending((error == null ? void 0 : error.message) === "css_complexity_limit" ? "css_complexity_limit" : "grader_error");
    }
  }
  function gradeChecked(source, rubricId, version, configured) {
    if (typeof source !== "string" || source.length > 2 * 1024 * 1024) return pending("source_limit");
    let bytes = 0;
    for (let index = 0; index < source.length; index++) {
      const code2 = source.charCodeAt(index);
      if (code2 >= 55296 && code2 <= 56319) {
        const low = source.charCodeAt(++index);
        if (!(low >= 56320 && low <= 57343)) return pending("source_encoding");
        bytes += 4;
      } else if (code2 >= 56320 && code2 <= 57343) return pending("source_encoding");
      else bytes += code2 < 128 ? 1 : code2 < 2048 ? 2 : 3;
      if (bytes > 2 * 1024 * 1024) return pending("source_limit");
    }
    let parsed, definition;
    try {
      definition = descriptor(rubricId);
      if (!configured && version !== void 0 && version !== definition.version) return pending("rubric_unavailable");
      version = configured ? configured.version : definition.version;
      parsed = limitedParse(source);
    } catch (error) {
      return pending(["depth_limit", "node_limit", "parse_error_limit", "rubric_unavailable"].includes(error.message) ? error.message : "parser_error");
    }
    const all = [], active = [], diagnostics = [];
    const walk3 = [{ node: parsed.document, excluded: false, depth: 0 }];
    let total = 0;
    while (walk3.length) {
      const current = walk3.pop(), n = current.node;
      if (++total > MAX_NODES || current.depth > MAX_DEPTH) return pending("tree_limit");
      const inert2 = current.excluded || excluded2.has(n.tagName) || hasAttr2(n, "hidden");
      if (n.tagName) {
        all.push(n);
        if (!inert2 && n.namespaceURI === HTML_NS2) active.push(n);
        if (!inert2 && n.sourceCodeLocation) {
          const loc = n.sourceCodeLocation;
          if (loc.endTag) {
            const closing = source.slice(loc.endTag.startOffset, loc.endTag.endOffset).match(/^<\/([^\s>]+)/);
            if (!closing || closing[1].toLowerCase() !== n.tagName) diagnostics.push({ code: "mismatched_end_tag", location: position(n) });
          } else if (/^(h[1-6]|strong|em|title)$/.test(n.tagName)) {
            diagnostics.push({ code: "missing_end_tag", location: position(n) });
          }
        }
        if (!own2(cssWeights, rubricId) && (n.tagName === "style" && textOfStyle(n).trim() || attr2(n, "style").trim() || n.tagName === "link" && /(?:^|\s)stylesheet(?:\s|$)/i.test(attr2(n, "rel")))) {
          diagnostics.push({ code: "css_requires_review", location: position(n) });
        }
        if (hasAttr2(n, "hidden")) diagnostics.push({ code: "hidden_content", location: position(n) });
      }
      const children = n.content ? [n.content, ...n.childNodes || []] : n.childNodes || [];
      walk3.push(...children.slice().reverse().map((node) => ({ node, excluded: inert2, depth: current.depth + 1 })));
    }
    const tags = (tag) => active.filter((n) => n.tagName === tag);
    if (["sample1-4", "sample1-5_1", "sample1-5_2"].includes(rubricId)) {
      for (const base of tags("base")) if (hasAttr2(base, "href") || hasAttr2(base, "target")) {
        diagnostics.push({ code: "base_url_requires_review", location: position(base) });
      }
    }
    if (["sample1-4", "sample1-5_2"].includes(rubricId) && (tags("img").some((n) => hasAttr2(n, "srcset") || hasAttr2(n, "sizes")) || tags("picture").length)) {
      diagnostics.push({ code: "responsive_images_require_review" });
    }
    const body = tags("body")[0], head = tags("head")[0], html = tags("html")[0];
    const within = (tag, parent2) => tags(tag).filter((n) => inside(n, parent2));
    const rules = [];
    const configuredRules = new Map(((configured == null ? void 0 : configured.rules) || []).map((r) => [r.ruleId, r]));
    const expected = (id) => {
      var _a, _b, _c, _d;
      return (_d = (_a = configuredRules.get(id)) == null ? void 0 : _a.expected) != null ? _d : (_c = (_b = legacyRuleConfigs[rubricId]) == null ? void 0 : _b.find((r) => r.ruleId === id)) == null ? void 0 : _c.expected;
    };
    function rule(id, points, parts) {
      const settings = configuredRules.get(id);
      if (configured && !settings) throw new Error("rule_config_missing");
      const factor = settings ? (settings.enabled ? settings.points : 0) / points : 1;
      points *= factor;
      parts = parts.map((p) => ({ ...p, points: p.points * factor }));
      const earned = parts.reduce((sum, part3) => sum + (part3.ok ? part3.points : 0), 0);
      rules.push({
        ruleId: id,
        label: (settings == null ? void 0 : settings.message) || names[id],
        points,
        earned,
        passed: Math.abs(earned - points) < 1e-8,
        ...settings ? { enabled: settings.enabled } : {},
        checks: parts.map((p) => ({ passed: Boolean(p.ok), points: p.points, location: position(p.node), code: p.ok ? "met" : "not_met" }))
      });
    }
    const part2 = (ok, points, node) => ({ ok, points, node });
    function unique(tag, expected2) {
      const found = within(tag, body).filter((n) => textOf(n) === normalized(expected2));
      if (found.length > 1) diagnostics.push({ code: "duplicate_answer", location: position(found[0]) });
      return found.length === 1 ? found[0] : null;
    }
    if (rubricId === "sample1-2") {
      const explicit = (n) => {
        var _a;
        return Boolean((_a = n == null ? void 0 : n.sourceCodeLocation) == null ? void 0 : _a.startTag);
      };
      const exactly = (tag) => parsed.starts.filter((s) => s.name === tag).length === 1;
      const dt = parsed.document.childNodes.find((n) => n.nodeName === "#documentType" && n.name === "html");
      rule("document-doctype", 10, [part2(Boolean(dt), 10, dt)]);
      rule("document-structure", 20, [
        part2(explicit(html) && exactly("html"), 5, html),
        part2(explicit(head) && exactly("head"), 5, head),
        part2(explicit(body) && exactly("body"), 5, body),
        part2(explicit(html) && explicit(head) && explicit(body) && head.parentNode === html && body.parentNode === html && head.sourceCodeLocation.startOffset > html.sourceCodeLocation.startOffset && body.sourceCodeLocation.startOffset >= head.sourceCodeLocation.endOffset && (!html.sourceCodeLocation.endTag || body.sourceCodeLocation.startOffset < html.sourceCodeLocation.endTag.startOffset), 5, html)
      ]);
      rule("document-language", 5, [part2(attr2(html, "lang").toLowerCase() === expected("document-language").value.toLowerCase(), 5, html)]);
      const charset = within("meta", head).find((n) => attr2(n, "charset").toLowerCase() === expected("document-charset").value.toLowerCase());
      rule("document-charset", 10, [part2(Boolean(charset), 10, charset)]);
      const viewport = within("meta", head).find((n) => {
        if (attr2(n, "name").toLowerCase() !== "viewport") return false;
        const values = attr2(n, "content").toLowerCase().split(",").map((p) => p.trim().split(/\s*=\s*/));
        const exp = expected("document-viewport");
        return values.some((v) => v[0] === "width" && v[1] === exp.width.toLowerCase()) && values.some((v) => v[0] === "initial-scale" && Number(v[1]) === exp.initialScale);
      });
      rule("document-viewport", 5, [part2(Boolean(viewport), 5, viewport)]);
      const title = within("title", head).find((n) => textOf(n));
      rule("document-title", 10, [part2(Boolean(title), 10, title)]);
      const heading = within("h1", body).find((n) => textOf(n));
      rule("document-heading", 15, [part2(Boolean(heading), 15, heading)]);
      const first = unique("p", expected("document-paragraphs").texts[0]);
      const second = unique("p", expected("document-paragraphs").texts[1]);
      rule("document-paragraphs", 25, [part2(Boolean(first), 15, first), part2(Boolean(second && second !== first), 10, second)]);
    } else if (rubricId === "sample1-3_1") {
      rule("heading-levels", 30, [1, 2, 3, 4, 5, 6].map((n) => {
        const node = unique("h" + n, expected("heading-levels").texts[n - 1]);
        return part2(Boolean(node), 5, node);
      }));
      rule("separate-paragraphs", 20, [1, 2, 3].map((n) => {
        const node = unique("p", expected("separate-paragraphs").texts[n - 1]);
        return part2(Boolean(node), 20 / 3, node);
      }));
      const a = expected("within-paragraph-break").before;
      const b = expected("within-paragraph-break").after;
      const paragraph = unique("p", a + b);
      let correctBreak = false;
      if (paragraph) {
        let before = "";
        const pendingNodes = [...paragraph.childNodes].reverse();
        while (pendingNodes.length) {
          const node = pendingNodes.pop();
          if (node.nodeName === "#text") before += node.value;
          else if (node.tagName === "br" && normalized(before) === normalized(a)) correctBreak = true;
          else if (!excluded2.has(node.tagName)) pendingNodes.push(...(node.childNodes || []).slice().reverse());
        }
      }
      rule("within-paragraph-break", 20, [part2(Boolean(paragraph), 10, paragraph), part2(correctBreak, 10, paragraph)]);
      for (const [tag, id, desired, context] of [
        ["strong", "semantic-strong", expected("semantic-strong").text, expected("semantic-strong").context],
        ["em", "semantic-emphasis", expected("semantic-emphasis").text, expected("semantic-emphasis").context]
      ]) {
        const withoutParticles = (value) => normalized(value).replace(/には|は|を/g, "");
        const candidates = within("p", body).filter((n) => withoutParticles(textOf(n)) === withoutParticles(context));
        const nodes = within(tag, body).filter((n) => textOf(n).replace(/^(?:は|が|を|に|で|の)|(?:は|が|を|に|で|の)$/g, "") === normalized(desired) && candidates.some((p) => inside(n, p)));
        if (nodes.length > 1) diagnostics.push({ code: "duplicate_answer", location: position(nodes[0]) });
        rule(id, 15, [part2(nodes.length === 1, 15, nodes[0])]);
      }
      const bodyText2 = textOf(body || parsed.document);
      const anchors = configured ? [
        ...expected("heading-levels").texts,
        ...expected("separate-paragraphs").texts.slice(1),
        a,
        b,
        expected("semantic-strong").context,
        expected("semantic-emphasis").context
      ] : [
        "見出し1",
        "見出し2",
        "見出し3",
        "見出し4",
        "見出し5",
        "見出し6",
        "2段落目の文章",
        "3段落目の文章",
        a,
        b,
        "重要な語句",
        "strongほど強くはない"
      ];
      anchors.forEach((anchor) => {
        const expected2 = normalized(anchor), count = bodyText2.split(expected2).length - 1;
        if (count > 1) diagnostics.push({ code: "duplicate_content" });
      });
      if (anchors.filter((anchor) => bodyText2.includes(normalized(anchor))).length < 3) diagnostics.push({ code: "content_missing" });
    } else {
      const context = {
        source,
        parsed,
        document: parsed.document,
        all,
        active,
        diagnostics,
        tags,
        body,
        head,
        html,
        within,
        rules,
        rule,
        part: part2,
        unique,
        attr: attr2,
        hasAttr: hasAttr2,
        normalized,
        textOf,
        inside,
        position,
        expected
      };
      (own2(cssWeights, rubricId) ? applyCssRules : applyHtmlRules)(rubricId, context);
    }
    const gradingPoints = configured ? configured.rules.map((r) => r.enabled ? r.points : 0) : definition.points;
    if (rules.length !== gradingPoints.length || rules.some((r, i) => !Number.isFinite(r.earned) || !Number.isFinite(r.points) || Math.abs(r.points - gradingPoints[i]) > 1e-8 || r.earned < 0 || r.earned > r.points + 1e-8) || Math.abs(rules.reduce((sum, r) => sum + r.points, 0) - 100) > 1e-8) return pending("rubric_invalid");
    diagnostics.push(...parsed.errors.filter((e) => e.code !== "missing-doctype").map((e) => ({ code: "html_parse_error", parserCode: e.code, line: e.line })));
    const state = diagnostics.length ? "needs_review" : "graded";
    const rawScore = rules.reduce((s, r) => s + r.earned, 0) / 100;
    const score = rules.every((r) => r.passed) ? 1 : Math.max(0, Math.min(1, rawScore));
    return {
      state,
      score: state === "graded" ? score : null,
      rubricId,
      rubricVersion: version,
      engineVersion,
      rules,
      diagnostics
    };
  }
  function textOfStyle(n) {
    return (n.childNodes || []).map((c) => c.value || "").join("");
  }
  function pending(code2) {
    return { state: "needs_review", score: null, engineVersion, rules: [], diagnostics: [{ code: code2 }] };
  }

  // normal-sheet.mjs
  var ID_MAP = Object.freeze({
    "sample1-2": "html12-01",
    "sample1-3_1": "html13-01",
    "sample1-3_2": "html13-02",
    "sample1-4": "html14-01",
    "sample1-5_1": "html15-01",
    "sample1-5_2": "html15-02",
    "sample1-6": "html16-01",
    "sample1-7": "html17-01",
    "sample2-2_1": "html22-01",
    "sample2-2_2": "html22-02",
    "sample2-3": "html23-01",
    "sample2-4": "html24-01"
  });
  var REVERSE_ID_MAP = Object.freeze(Object.fromEntries(Object.entries(ID_MAP).map(([oldId, newId]) => [newId, oldId])));
  var NORMAL_RUBRIC_VERSION = "2026-09-normal-1";
  var DRAFT_VERSION2 = "2026-09-normal-gss-draft-1";
  var RULE_HEADERS2 = [...RULE_HEADERS];
  var POLICY_HEADERS2 = [...POLICY_HEADERS];
  var own3 = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  var clone2 = (value) => JSON.parse(JSON.stringify(value));
  var rewrite = (value, direction) => {
    if (typeof value === "string") {
      for (const [oldId, newId] of Object.entries(ID_MAP)) {
        const from = direction === "toOld" ? newId : oldId;
        const to = direction === "toOld" ? oldId : newId;
        value = value.replaceAll(from + ".html", to + ".html");
      }
      return value;
    }
    if (Array.isArray(value)) return value.map((item) => rewrite(item, direction));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item, direction)]));
    return value;
  };
  var externalize = (id, value) => rewrite(value, "toNew");
  function ruleCatalog2() {
    return Object.fromEntries(Object.entries(ruleCatalog()).filter(([id]) => own3(ID_MAP, id)).map(([oldId, rules]) => [
      ID_MAP[oldId],
      rules.map((rule) => ({ ...rule, expected: externalize(ID_MAP[oldId], rule.expected) }))
    ]));
  }
  var canonicalJson2 = canonicalJson;
  function defaultRuleGrid2(version = DRAFT_VERSION2) {
    return [RULE_HEADERS2, ...Object.entries(ruleCatalog2()).flatMap(([id, rules]) => rules.map((rule) => [
      id,
      version,
      rule.ruleId,
      rule.ruleType,
      rule.target,
      canonicalJson2(rule.expected),
      rule.points,
      rule.label,
      true
    ]))];
  }
  function defaultPolicyGrid2(version = DRAFT_VERSION2) {
    return [POLICY_HEADERS2, ...Object.keys(ruleCatalog2()).map((id) => ["", "", id, "draft-1", false, "required", "single-html", "reference-only", version, "[]", "", "reject", "", "none", "rules", "通常HTML用の無効な下書き。"])];
  }
  var gridToRecords2 = gridToRecords;
  function compileRubricRows2(records, targetId, version) {
    const oldId = REVERSE_ID_MAP[targetId];
    if (!oldId || typeof version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(version)) throw new Error("normal_config_version");
    const selected = records.filter((row) => (row == null ? void 0 : row.targetId) === targetId && (row == null ? void 0 : row.rubricVersion) === version);
    const oldRecords = selected.map((row) => ({ ...row, targetId: oldId }));
    const compiled = compileRubricRows(oldRecords, oldId, version);
    return { ...compiled, targetId, version };
  }
  function validateCompiledRubric2(compiled) {
    if (!compiled || Object.keys(compiled).sort().join(",") !== "contract,rules,schemaVersion,targetId,version" || compiled.schemaVersion !== 1 || compiled.contract !== CONFIG_CONTRACT || !REVERSE_ID_MAP[compiled.targetId]) throw new Error("normal_config_contract");
    const old = { ...compiled, targetId: REVERSE_ID_MAP[compiled.targetId] };
    const checked = validateCompiledRubric(old);
    return { ...checked, targetId: compiled.targetId, version: compiled.version };
  }
  function validateDraftPolicies2(records) {
    const ids = new Set(Object.keys(ruleCatalog2()));
    const seen = /* @__PURE__ */ new Set();
    for (const row of records) {
      if (!row || !ids.has(row.targetId) || row.intakeEnabled !== false || row.year !== "" || row.grade !== "" || row.proofPolicy !== "required" || row.submissionFormat !== "single-html" || row.assetPolicy !== "reference-only" || row.acceptedTemplateVersions !== "[]" || row.legacyRubricVersion !== "" || row.legacyFm2Pid !== "" || row.lateSubmissionPolicy !== "reject" || row.legacyReceiptPolicy !== "none" || row.resultDisplayPolicy !== "rules") throw new Error("normal_policy_invalid");
      const key = canonicalJson2([row.year, row.grade, row.targetId]);
      if (seen.has(key)) throw new Error("normal_policy_duplicate");
      seen.add(key);
    }
    return clone2(records);
  }
  function freezeRubric2(compiled, engineVersion3, engineSourceHash3, sha256) {
    const rubric = validateCompiledRubric2(compiled);
    if (typeof engineVersion3 !== "string" || !/^[a-f0-9]{64}$/.test(engineSourceHash3) || typeof sha256 !== "function") throw new Error("normal_snapshot_engine");
    const body = { schemaVersion: 2, engineVersion: engineVersion3, engineSourceHash: engineSourceHash3, rubric };
    const hash = sha256(canonicalJson2(body));
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("normal_snapshot_hash");
    return { body, hash };
  }
  function verifyFrozenRubric2(snapshot, engineVersion3, engineSourceHash3, sha256) {
    if (!snapshot || Object.keys(snapshot).sort().join(",") !== "body,hash" || !snapshot.body || Object.keys(snapshot.body).sort().join(",") !== "engineSourceHash,engineVersion,rubric,schemaVersion" || snapshot.body.schemaVersion !== 2 || snapshot.body.engineVersion !== engineVersion3 || snapshot.body.engineSourceHash !== engineSourceHash3) throw new Error("normal_snapshot_engine_mismatch");
    const rebuilt = freezeRubric2(snapshot.body.rubric, engineVersion3, engineSourceHash3, sha256);
    if (snapshot.hash !== rebuilt.hash) throw new Error("normal_snapshot_hash_mismatch");
    return rebuilt.body.rubric;
  }
  function assertArchiveCompatible2(existing, next) {
    if (!existing) return;
    if (existing.body.rubric.targetId !== next.body.rubric.targetId || existing.body.rubric.version !== next.body.rubric.version || existing.hash !== next.hash) throw new Error("normal_version_already_frozen");
  }

  // parser-entry.mjs
  var engineVersion2 = `html-normal-1.0.0-${engineVersion}`;
  var engineSourceHash2 = true ? "e83fb967aaefe2ec448ee30c415e832587f31598cd10a3ef7824bd0f33a8b22f" : "unbundled-local-candidate";
  var toOldCompiled = (compiled) => ({ ...compiled, targetId: REVERSE_ID_MAP[compiled.targetId] });
  function descriptor2(id) {
    const catalog2 = ruleCatalog2();
    if (!catalog2[id]) throw new Error("rubric_unavailable");
    return { id, version: NORMAL_RUBRIC_VERSION, engineVersion: engineVersion2, engineSourceHash: engineSourceHash2, points: catalog2[id].map((rule) => rule.points), contract: "normal-html-v2; source-aware-html-css; no-execution; no-network" };
  }
  function grade(source, rubricId, version) {
    if (!REVERSE_ID_MAP[rubricId] || version !== void 0 && version !== NORMAL_RUBRIC_VERSION) return { state: "needs_review", score: null, engineVersion: engineVersion2, rules: [], diagnostics: [{ code: "rubric_unavailable" }] };
    const compiled = compileRubricRows2(gridToRecords2(defaultRuleGrid2(NORMAL_RUBRIC_VERSION), RULE_HEADERS2), rubricId, NORMAL_RUBRIC_VERSION);
    return gradeConfigured2(source, compiled);
  }
  function gradeConfigured2(source, compiled) {
    try {
      const checked = validateCompiledRubric2(compiled);
      const result = gradeConfigured(source, toOldCompiled(checked));
      return { ...result, rubricId: compiled.targetId, rubricVersion: compiled.version, engineVersion: engineVersion2 };
    } catch {
      return { state: "needs_review", score: null, engineVersion: engineVersion2, rules: [], diagnostics: [{ code: "rubric_config_invalid" }] };
    }
  }
  return __toCommonJS(parser_entry_exports);
})();
