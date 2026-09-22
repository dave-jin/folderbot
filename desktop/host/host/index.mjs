import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x2) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x2, {
  get: (a, b2) => (typeof require !== "undefined" ? require : a)[b2]
}) : x2)(function(x2) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x2 + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
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

// node_modules/bn.js/lib/bn.js
var require_bn = __commonJS({
  "node_modules/bn.js/lib/bn.js"(exports, module) {
    (function(module2, exports2) {
      "use strict";
      function assert(val, msg) {
        if (!val) throw new Error(msg || "Assertion failed");
      }
      function inherits(ctor, superCtor) {
        ctor.super_ = superCtor;
        var TempCtor = function() {
        };
        TempCtor.prototype = superCtor.prototype;
        ctor.prototype = new TempCtor();
        ctor.prototype.constructor = ctor;
      }
      function BN(number, base, endian) {
        if (BN.isBN(number)) {
          return number;
        }
        this.negative = 0;
        this.words = null;
        this.length = 0;
        this.red = null;
        if (number !== null) {
          if (base === "le" || base === "be") {
            endian = base;
            base = 10;
          }
          this._init(number || 0, base || 10, endian || "be");
        }
      }
      if (typeof module2 === "object") {
        module2.exports = BN;
      } else {
        exports2.BN = BN;
      }
      BN.BN = BN;
      BN.wordSize = 26;
      var Buffer2;
      try {
        if (typeof window !== "undefined" && typeof window.Buffer !== "undefined") {
          Buffer2 = window.Buffer;
        } else {
          Buffer2 = __require("buffer").Buffer;
        }
      } catch (e) {
      }
      BN.isBN = function isBN(num) {
        if (num instanceof BN) {
          return true;
        }
        return num !== null && typeof num === "object" && num.constructor.wordSize === BN.wordSize && Array.isArray(num.words);
      };
      BN.max = function max(left, right) {
        if (left.cmp(right) > 0) return left;
        return right;
      };
      BN.min = function min(left, right) {
        if (left.cmp(right) < 0) return left;
        return right;
      };
      BN.prototype._init = function init(number, base, endian) {
        if (typeof number === "number") {
          return this._initNumber(number, base, endian);
        }
        if (typeof number === "object") {
          return this._initArray(number, base, endian);
        }
        if (base === "hex") {
          base = 16;
        }
        assert(base === (base | 0) && base >= 2 && base <= 36);
        number = number.toString().replace(/\s+/g, "");
        var start = 0;
        if (number[0] === "-") {
          start++;
          this.negative = 1;
        }
        if (start < number.length) {
          if (base === 16) {
            this._parseHex(number, start, endian);
          } else {
            this._parseBase(number, base, start);
            if (endian === "le") {
              this._initArray(this.toArray(), base, endian);
            }
          }
        }
      };
      BN.prototype._initNumber = function _initNumber(number, base, endian) {
        if (number < 0) {
          this.negative = 1;
          number = -number;
        }
        if (number < 67108864) {
          this.words = [number & 67108863];
          this.length = 1;
        } else if (number < 4503599627370496) {
          this.words = [
            number & 67108863,
            number / 67108864 & 67108863
          ];
          this.length = 2;
        } else {
          assert(number < 9007199254740992);
          this.words = [
            number & 67108863,
            number / 67108864 & 67108863,
            1
          ];
          this.length = 3;
        }
        if (endian !== "le") return;
        this._initArray(this.toArray(), base, endian);
      };
      BN.prototype._initArray = function _initArray(number, base, endian) {
        assert(typeof number.length === "number");
        if (number.length <= 0) {
          this.words = [0];
          this.length = 1;
          return this;
        }
        this.length = Math.ceil(number.length / 3);
        this.words = new Array(this.length);
        for (var i = 0; i < this.length; i++) {
          this.words[i] = 0;
        }
        var j, w2;
        var off = 0;
        if (endian === "be") {
          for (i = number.length - 1, j = 0; i >= 0; i -= 3) {
            w2 = number[i] | number[i - 1] << 8 | number[i - 2] << 16;
            this.words[j] |= w2 << off & 67108863;
            this.words[j + 1] = w2 >>> 26 - off & 67108863;
            off += 24;
            if (off >= 26) {
              off -= 26;
              j++;
            }
          }
        } else if (endian === "le") {
          for (i = 0, j = 0; i < number.length; i += 3) {
            w2 = number[i] | number[i + 1] << 8 | number[i + 2] << 16;
            this.words[j] |= w2 << off & 67108863;
            this.words[j + 1] = w2 >>> 26 - off & 67108863;
            off += 24;
            if (off >= 26) {
              off -= 26;
              j++;
            }
          }
        }
        return this.strip();
      };
      function parseHex4Bits(string, index) {
        var c = string.charCodeAt(index);
        if (c >= 65 && c <= 70) {
          return c - 55;
        } else if (c >= 97 && c <= 102) {
          return c - 87;
        } else {
          return c - 48 & 15;
        }
      }
      function parseHexByte(string, lowerBound, index) {
        var r = parseHex4Bits(string, index);
        if (index - 1 >= lowerBound) {
          r |= parseHex4Bits(string, index - 1) << 4;
        }
        return r;
      }
      BN.prototype._parseHex = function _parseHex(number, start, endian) {
        this.length = Math.ceil((number.length - start) / 6);
        this.words = new Array(this.length);
        for (var i = 0; i < this.length; i++) {
          this.words[i] = 0;
        }
        var off = 0;
        var j = 0;
        var w2;
        if (endian === "be") {
          for (i = number.length - 1; i >= start; i -= 2) {
            w2 = parseHexByte(number, start, i) << off;
            this.words[j] |= w2 & 67108863;
            if (off >= 18) {
              off -= 18;
              j += 1;
              this.words[j] |= w2 >>> 26;
            } else {
              off += 8;
            }
          }
        } else {
          var parseLength = number.length - start;
          for (i = parseLength % 2 === 0 ? start + 1 : start; i < number.length; i += 2) {
            w2 = parseHexByte(number, start, i) << off;
            this.words[j] |= w2 & 67108863;
            if (off >= 18) {
              off -= 18;
              j += 1;
              this.words[j] |= w2 >>> 26;
            } else {
              off += 8;
            }
          }
        }
        this.strip();
      };
      function parseBase(str2, start, end, mul) {
        var r = 0;
        var len = Math.min(str2.length, end);
        for (var i = start; i < len; i++) {
          var c = str2.charCodeAt(i) - 48;
          r *= mul;
          if (c >= 49) {
            r += c - 49 + 10;
          } else if (c >= 17) {
            r += c - 17 + 10;
          } else {
            r += c;
          }
        }
        return r;
      }
      BN.prototype._parseBase = function _parseBase(number, base, start) {
        this.words = [0];
        this.length = 1;
        for (var limbLen = 0, limbPow = 1; limbPow <= 67108863; limbPow *= base) {
          limbLen++;
        }
        limbLen--;
        limbPow = limbPow / base | 0;
        var total = number.length - start;
        var mod = total % limbLen;
        var end = Math.min(total, total - mod) + start;
        var word = 0;
        for (var i = start; i < end; i += limbLen) {
          word = parseBase(number, i, i + limbLen, base);
          this.imuln(limbPow);
          if (this.words[0] + word < 67108864) {
            this.words[0] += word;
          } else {
            this._iaddn(word);
          }
        }
        if (mod !== 0) {
          var pow = 1;
          word = parseBase(number, i, number.length, base);
          for (i = 0; i < mod; i++) {
            pow *= base;
          }
          this.imuln(pow);
          if (this.words[0] + word < 67108864) {
            this.words[0] += word;
          } else {
            this._iaddn(word);
          }
        }
        this.strip();
      };
      BN.prototype.copy = function copy(dest) {
        dest.words = new Array(this.length);
        for (var i = 0; i < this.length; i++) {
          dest.words[i] = this.words[i];
        }
        dest.length = this.length;
        dest.negative = this.negative;
        dest.red = this.red;
      };
      BN.prototype.clone = function clone() {
        var r = new BN(null);
        this.copy(r);
        return r;
      };
      BN.prototype._expand = function _expand(size) {
        while (this.length < size) {
          this.words[this.length++] = 0;
        }
        return this;
      };
      BN.prototype.strip = function strip() {
        while (this.length > 1 && this.words[this.length - 1] === 0) {
          this.length--;
        }
        return this._normSign();
      };
      BN.prototype._normSign = function _normSign() {
        if (this.length === 1 && this.words[0] === 0) {
          this.negative = 0;
        }
        return this;
      };
      BN.prototype.inspect = function inspect() {
        return (this.red ? "<BN-R: " : "<BN: ") + this.toString(16) + ">";
      };
      var zeros = [
        "",
        "0",
        "00",
        "000",
        "0000",
        "00000",
        "000000",
        "0000000",
        "00000000",
        "000000000",
        "0000000000",
        "00000000000",
        "000000000000",
        "0000000000000",
        "00000000000000",
        "000000000000000",
        "0000000000000000",
        "00000000000000000",
        "000000000000000000",
        "0000000000000000000",
        "00000000000000000000",
        "000000000000000000000",
        "0000000000000000000000",
        "00000000000000000000000",
        "000000000000000000000000",
        "0000000000000000000000000"
      ];
      var groupSizes = [
        0,
        0,
        25,
        16,
        12,
        11,
        10,
        9,
        8,
        8,
        7,
        7,
        7,
        7,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5
      ];
      var groupBases = [
        0,
        0,
        33554432,
        43046721,
        16777216,
        48828125,
        60466176,
        40353607,
        16777216,
        43046721,
        1e7,
        19487171,
        35831808,
        62748517,
        7529536,
        11390625,
        16777216,
        24137569,
        34012224,
        47045881,
        64e6,
        4084101,
        5153632,
        6436343,
        7962624,
        9765625,
        11881376,
        14348907,
        17210368,
        20511149,
        243e5,
        28629151,
        33554432,
        39135393,
        45435424,
        52521875,
        60466176
      ];
      BN.prototype.toString = function toString(base, padding) {
        base = base || 10;
        padding = padding | 0 || 1;
        var out;
        if (base === 16 || base === "hex") {
          out = "";
          var off = 0;
          var carry = 0;
          for (var i = 0; i < this.length; i++) {
            var w2 = this.words[i];
            var word = ((w2 << off | carry) & 16777215).toString(16);
            carry = w2 >>> 24 - off & 16777215;
            off += 2;
            if (off >= 26) {
              off -= 26;
              i--;
            }
            if (carry !== 0 || i !== this.length - 1) {
              out = zeros[6 - word.length] + word + out;
            } else {
              out = word + out;
            }
          }
          if (carry !== 0) {
            out = carry.toString(16) + out;
          }
          while (out.length % padding !== 0) {
            out = "0" + out;
          }
          if (this.negative !== 0) {
            out = "-" + out;
          }
          return out;
        }
        if (base === (base | 0) && base >= 2 && base <= 36) {
          var groupSize = groupSizes[base];
          var groupBase = groupBases[base];
          out = "";
          var c = this.clone();
          c.negative = 0;
          while (!c.isZero()) {
            var r = c.modn(groupBase).toString(base);
            c = c.idivn(groupBase);
            if (!c.isZero()) {
              out = zeros[groupSize - r.length] + r + out;
            } else {
              out = r + out;
            }
          }
          if (this.isZero()) {
            out = "0" + out;
          }
          while (out.length % padding !== 0) {
            out = "0" + out;
          }
          if (this.negative !== 0) {
            out = "-" + out;
          }
          return out;
        }
        assert(false, "Base should be between 2 and 36");
      };
      BN.prototype.toNumber = function toNumber() {
        var ret = this.words[0];
        if (this.length === 2) {
          ret += this.words[1] * 67108864;
        } else if (this.length === 3 && this.words[2] === 1) {
          ret += 4503599627370496 + this.words[1] * 67108864;
        } else if (this.length > 2) {
          assert(false, "Number can only safely store up to 53 bits");
        }
        return this.negative !== 0 ? -ret : ret;
      };
      BN.prototype.toJSON = function toJSON() {
        return this.toString(16);
      };
      BN.prototype.toBuffer = function toBuffer(endian, length) {
        assert(typeof Buffer2 !== "undefined");
        return this.toArrayLike(Buffer2, endian, length);
      };
      BN.prototype.toArray = function toArray(endian, length) {
        return this.toArrayLike(Array, endian, length);
      };
      BN.prototype.toArrayLike = function toArrayLike(ArrayType, endian, length) {
        var byteLength = this.byteLength();
        var reqLength = length || Math.max(1, byteLength);
        assert(byteLength <= reqLength, "byte array longer than desired length");
        assert(reqLength > 0, "Requested array length <= 0");
        this.strip();
        var littleEndian = endian === "le";
        var res = new ArrayType(reqLength);
        var b2, i;
        var q = this.clone();
        if (!littleEndian) {
          for (i = 0; i < reqLength - byteLength; i++) {
            res[i] = 0;
          }
          for (i = 0; !q.isZero(); i++) {
            b2 = q.andln(255);
            q.iushrn(8);
            res[reqLength - i - 1] = b2;
          }
        } else {
          for (i = 0; !q.isZero(); i++) {
            b2 = q.andln(255);
            q.iushrn(8);
            res[i] = b2;
          }
          for (; i < reqLength; i++) {
            res[i] = 0;
          }
        }
        return res;
      };
      if (Math.clz32) {
        BN.prototype._countBits = function _countBits(w2) {
          return 32 - Math.clz32(w2);
        };
      } else {
        BN.prototype._countBits = function _countBits(w2) {
          var t = w2;
          var r = 0;
          if (t >= 4096) {
            r += 13;
            t >>>= 13;
          }
          if (t >= 64) {
            r += 7;
            t >>>= 7;
          }
          if (t >= 8) {
            r += 4;
            t >>>= 4;
          }
          if (t >= 2) {
            r += 2;
            t >>>= 2;
          }
          return r + t;
        };
      }
      BN.prototype._zeroBits = function _zeroBits(w2) {
        if (w2 === 0) return 26;
        var t = w2;
        var r = 0;
        if ((t & 8191) === 0) {
          r += 13;
          t >>>= 13;
        }
        if ((t & 127) === 0) {
          r += 7;
          t >>>= 7;
        }
        if ((t & 15) === 0) {
          r += 4;
          t >>>= 4;
        }
        if ((t & 3) === 0) {
          r += 2;
          t >>>= 2;
        }
        if ((t & 1) === 0) {
          r++;
        }
        return r;
      };
      BN.prototype.bitLength = function bitLength() {
        var w2 = this.words[this.length - 1];
        var hi = this._countBits(w2);
        return (this.length - 1) * 26 + hi;
      };
      function toBitArray(num) {
        var w2 = new Array(num.bitLength());
        for (var bit = 0; bit < w2.length; bit++) {
          var off = bit / 26 | 0;
          var wbit = bit % 26;
          w2[bit] = (num.words[off] & 1 << wbit) >>> wbit;
        }
        return w2;
      }
      BN.prototype.zeroBits = function zeroBits() {
        if (this.isZero()) return 0;
        var r = 0;
        for (var i = 0; i < this.length; i++) {
          var b2 = this._zeroBits(this.words[i]);
          r += b2;
          if (b2 !== 26) break;
        }
        return r;
      };
      BN.prototype.byteLength = function byteLength() {
        return Math.ceil(this.bitLength() / 8);
      };
      BN.prototype.toTwos = function toTwos(width) {
        if (this.negative !== 0) {
          return this.abs().inotn(width).iaddn(1);
        }
        return this.clone();
      };
      BN.prototype.fromTwos = function fromTwos(width) {
        if (this.testn(width - 1)) {
          return this.notn(width).iaddn(1).ineg();
        }
        return this.clone();
      };
      BN.prototype.isNeg = function isNeg() {
        return this.negative !== 0;
      };
      BN.prototype.neg = function neg() {
        return this.clone().ineg();
      };
      BN.prototype.ineg = function ineg() {
        if (!this.isZero()) {
          this.negative ^= 1;
        }
        return this;
      };
      BN.prototype.iuor = function iuor(num) {
        while (this.length < num.length) {
          this.words[this.length++] = 0;
        }
        for (var i = 0; i < num.length; i++) {
          this.words[i] = this.words[i] | num.words[i];
        }
        return this.strip();
      };
      BN.prototype.ior = function ior(num) {
        assert((this.negative | num.negative) === 0);
        return this.iuor(num);
      };
      BN.prototype.or = function or(num) {
        if (this.length > num.length) return this.clone().ior(num);
        return num.clone().ior(this);
      };
      BN.prototype.uor = function uor(num) {
        if (this.length > num.length) return this.clone().iuor(num);
        return num.clone().iuor(this);
      };
      BN.prototype.iuand = function iuand(num) {
        var b2;
        if (this.length > num.length) {
          b2 = num;
        } else {
          b2 = this;
        }
        for (var i = 0; i < b2.length; i++) {
          this.words[i] = this.words[i] & num.words[i];
        }
        this.length = b2.length;
        return this.strip();
      };
      BN.prototype.iand = function iand(num) {
        assert((this.negative | num.negative) === 0);
        return this.iuand(num);
      };
      BN.prototype.and = function and(num) {
        if (this.length > num.length) return this.clone().iand(num);
        return num.clone().iand(this);
      };
      BN.prototype.uand = function uand(num) {
        if (this.length > num.length) return this.clone().iuand(num);
        return num.clone().iuand(this);
      };
      BN.prototype.iuxor = function iuxor(num) {
        var a;
        var b2;
        if (this.length > num.length) {
          a = this;
          b2 = num;
        } else {
          a = num;
          b2 = this;
        }
        for (var i = 0; i < b2.length; i++) {
          this.words[i] = a.words[i] ^ b2.words[i];
        }
        if (this !== a) {
          for (; i < a.length; i++) {
            this.words[i] = a.words[i];
          }
        }
        this.length = a.length;
        return this.strip();
      };
      BN.prototype.ixor = function ixor(num) {
        assert((this.negative | num.negative) === 0);
        return this.iuxor(num);
      };
      BN.prototype.xor = function xor(num) {
        if (this.length > num.length) return this.clone().ixor(num);
        return num.clone().ixor(this);
      };
      BN.prototype.uxor = function uxor(num) {
        if (this.length > num.length) return this.clone().iuxor(num);
        return num.clone().iuxor(this);
      };
      BN.prototype.inotn = function inotn(width) {
        assert(typeof width === "number" && width >= 0);
        var bytesNeeded = Math.ceil(width / 26) | 0;
        var bitsLeft = width % 26;
        this._expand(bytesNeeded);
        if (bitsLeft > 0) {
          bytesNeeded--;
        }
        for (var i = 0; i < bytesNeeded; i++) {
          this.words[i] = ~this.words[i] & 67108863;
        }
        if (bitsLeft > 0) {
          this.words[i] = ~this.words[i] & 67108863 >> 26 - bitsLeft;
          i++;
        }
        for (; i < this.length; i++) {
          this.words[i] = 0;
        }
        return this.strip();
      };
      BN.prototype.notn = function notn(width) {
        return this.clone().inotn(width);
      };
      BN.prototype.setn = function setn(bit, val) {
        assert(typeof bit === "number" && bit >= 0);
        var off = bit / 26 | 0;
        var wbit = bit % 26;
        this._expand(off + 1);
        if (val) {
          this.words[off] = this.words[off] | 1 << wbit;
        } else {
          this.words[off] = this.words[off] & ~(1 << wbit);
        }
        return this.strip();
      };
      BN.prototype.iadd = function iadd(num) {
        var r;
        if (this.negative !== 0 && num.negative === 0) {
          this.negative = 0;
          r = this.isub(num);
          this.negative ^= 1;
          return this._normSign();
        } else if (this.negative === 0 && num.negative !== 0) {
          num.negative = 0;
          r = this.isub(num);
          num.negative = 1;
          return r._normSign();
        }
        var a, b2;
        if (this.length > num.length) {
          a = this;
          b2 = num;
        } else {
          a = num;
          b2 = this;
        }
        var carry = 0;
        for (var i = 0; i < b2.length; i++) {
          r = (a.words[i] | 0) + (b2.words[i] | 0) + carry;
          this.words[i] = r & 67108863;
          carry = r >>> 26;
        }
        for (; carry !== 0 && i < a.length; i++) {
          r = (a.words[i] | 0) + carry;
          this.words[i] = r & 67108863;
          carry = r >>> 26;
        }
        this.length = a.length;
        if (carry !== 0) {
          this.words[this.length] = carry;
          this.length++;
        } else if (a !== this) {
          for (; i < a.length; i++) {
            this.words[i] = a.words[i];
          }
        }
        return this;
      };
      BN.prototype.add = function add(num) {
        var res;
        if (num.negative !== 0 && this.negative === 0) {
          num.negative = 0;
          res = this.sub(num);
          num.negative ^= 1;
          return res;
        } else if (num.negative === 0 && this.negative !== 0) {
          this.negative = 0;
          res = num.sub(this);
          this.negative = 1;
          return res;
        }
        if (this.length > num.length) return this.clone().iadd(num);
        return num.clone().iadd(this);
      };
      BN.prototype.isub = function isub(num) {
        if (num.negative !== 0) {
          num.negative = 0;
          var r = this.iadd(num);
          num.negative = 1;
          return r._normSign();
        } else if (this.negative !== 0) {
          this.negative = 0;
          this.iadd(num);
          this.negative = 1;
          return this._normSign();
        }
        var cmp = this.cmp(num);
        if (cmp === 0) {
          this.negative = 0;
          this.length = 1;
          this.words[0] = 0;
          return this;
        }
        var a, b2;
        if (cmp > 0) {
          a = this;
          b2 = num;
        } else {
          a = num;
          b2 = this;
        }
        var carry = 0;
        for (var i = 0; i < b2.length; i++) {
          r = (a.words[i] | 0) - (b2.words[i] | 0) + carry;
          carry = r >> 26;
          this.words[i] = r & 67108863;
        }
        for (; carry !== 0 && i < a.length; i++) {
          r = (a.words[i] | 0) + carry;
          carry = r >> 26;
          this.words[i] = r & 67108863;
        }
        if (carry === 0 && i < a.length && a !== this) {
          for (; i < a.length; i++) {
            this.words[i] = a.words[i];
          }
        }
        this.length = Math.max(this.length, i);
        if (a !== this) {
          this.negative = 1;
        }
        return this.strip();
      };
      BN.prototype.sub = function sub(num) {
        return this.clone().isub(num);
      };
      function smallMulTo(self, num, out) {
        out.negative = num.negative ^ self.negative;
        var len = self.length + num.length | 0;
        out.length = len;
        len = len - 1 | 0;
        var a = self.words[0] | 0;
        var b2 = num.words[0] | 0;
        var r = a * b2;
        var lo = r & 67108863;
        var carry = r / 67108864 | 0;
        out.words[0] = lo;
        for (var k2 = 1; k2 < len; k2++) {
          var ncarry = carry >>> 26;
          var rword = carry & 67108863;
          var maxJ = Math.min(k2, num.length - 1);
          for (var j = Math.max(0, k2 - self.length + 1); j <= maxJ; j++) {
            var i = k2 - j | 0;
            a = self.words[i] | 0;
            b2 = num.words[j] | 0;
            r = a * b2 + rword;
            ncarry += r / 67108864 | 0;
            rword = r & 67108863;
          }
          out.words[k2] = rword | 0;
          carry = ncarry | 0;
        }
        if (carry !== 0) {
          out.words[k2] = carry | 0;
        } else {
          out.length--;
        }
        return out.strip();
      }
      var comb10MulTo = function comb10MulTo2(self, num, out) {
        var a = self.words;
        var b2 = num.words;
        var o = out.words;
        var c = 0;
        var lo;
        var mid;
        var hi;
        var a0 = a[0] | 0;
        var al0 = a0 & 8191;
        var ah0 = a0 >>> 13;
        var a1 = a[1] | 0;
        var al1 = a1 & 8191;
        var ah1 = a1 >>> 13;
        var a2 = a[2] | 0;
        var al2 = a2 & 8191;
        var ah2 = a2 >>> 13;
        var a3 = a[3] | 0;
        var al3 = a3 & 8191;
        var ah3 = a3 >>> 13;
        var a4 = a[4] | 0;
        var al4 = a4 & 8191;
        var ah4 = a4 >>> 13;
        var a5 = a[5] | 0;
        var al5 = a5 & 8191;
        var ah5 = a5 >>> 13;
        var a6 = a[6] | 0;
        var al6 = a6 & 8191;
        var ah6 = a6 >>> 13;
        var a7 = a[7] | 0;
        var al7 = a7 & 8191;
        var ah7 = a7 >>> 13;
        var a8 = a[8] | 0;
        var al8 = a8 & 8191;
        var ah8 = a8 >>> 13;
        var a9 = a[9] | 0;
        var al9 = a9 & 8191;
        var ah9 = a9 >>> 13;
        var b0 = b2[0] | 0;
        var bl0 = b0 & 8191;
        var bh0 = b0 >>> 13;
        var b1 = b2[1] | 0;
        var bl1 = b1 & 8191;
        var bh1 = b1 >>> 13;
        var b22 = b2[2] | 0;
        var bl2 = b22 & 8191;
        var bh2 = b22 >>> 13;
        var b3 = b2[3] | 0;
        var bl3 = b3 & 8191;
        var bh3 = b3 >>> 13;
        var b4 = b2[4] | 0;
        var bl4 = b4 & 8191;
        var bh4 = b4 >>> 13;
        var b5 = b2[5] | 0;
        var bl5 = b5 & 8191;
        var bh5 = b5 >>> 13;
        var b6 = b2[6] | 0;
        var bl6 = b6 & 8191;
        var bh6 = b6 >>> 13;
        var b7 = b2[7] | 0;
        var bl7 = b7 & 8191;
        var bh7 = b7 >>> 13;
        var b8 = b2[8] | 0;
        var bl8 = b8 & 8191;
        var bh8 = b8 >>> 13;
        var b9 = b2[9] | 0;
        var bl9 = b9 & 8191;
        var bh9 = b9 >>> 13;
        out.negative = self.negative ^ num.negative;
        out.length = 19;
        lo = Math.imul(al0, bl0);
        mid = Math.imul(al0, bh0);
        mid = mid + Math.imul(ah0, bl0) | 0;
        hi = Math.imul(ah0, bh0);
        var w0 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w0 >>> 26) | 0;
        w0 &= 67108863;
        lo = Math.imul(al1, bl0);
        mid = Math.imul(al1, bh0);
        mid = mid + Math.imul(ah1, bl0) | 0;
        hi = Math.imul(ah1, bh0);
        lo = lo + Math.imul(al0, bl1) | 0;
        mid = mid + Math.imul(al0, bh1) | 0;
        mid = mid + Math.imul(ah0, bl1) | 0;
        hi = hi + Math.imul(ah0, bh1) | 0;
        var w1 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w1 >>> 26) | 0;
        w1 &= 67108863;
        lo = Math.imul(al2, bl0);
        mid = Math.imul(al2, bh0);
        mid = mid + Math.imul(ah2, bl0) | 0;
        hi = Math.imul(ah2, bh0);
        lo = lo + Math.imul(al1, bl1) | 0;
        mid = mid + Math.imul(al1, bh1) | 0;
        mid = mid + Math.imul(ah1, bl1) | 0;
        hi = hi + Math.imul(ah1, bh1) | 0;
        lo = lo + Math.imul(al0, bl2) | 0;
        mid = mid + Math.imul(al0, bh2) | 0;
        mid = mid + Math.imul(ah0, bl2) | 0;
        hi = hi + Math.imul(ah0, bh2) | 0;
        var w2 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w2 >>> 26) | 0;
        w2 &= 67108863;
        lo = Math.imul(al3, bl0);
        mid = Math.imul(al3, bh0);
        mid = mid + Math.imul(ah3, bl0) | 0;
        hi = Math.imul(ah3, bh0);
        lo = lo + Math.imul(al2, bl1) | 0;
        mid = mid + Math.imul(al2, bh1) | 0;
        mid = mid + Math.imul(ah2, bl1) | 0;
        hi = hi + Math.imul(ah2, bh1) | 0;
        lo = lo + Math.imul(al1, bl2) | 0;
        mid = mid + Math.imul(al1, bh2) | 0;
        mid = mid + Math.imul(ah1, bl2) | 0;
        hi = hi + Math.imul(ah1, bh2) | 0;
        lo = lo + Math.imul(al0, bl3) | 0;
        mid = mid + Math.imul(al0, bh3) | 0;
        mid = mid + Math.imul(ah0, bl3) | 0;
        hi = hi + Math.imul(ah0, bh3) | 0;
        var w3 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w3 >>> 26) | 0;
        w3 &= 67108863;
        lo = Math.imul(al4, bl0);
        mid = Math.imul(al4, bh0);
        mid = mid + Math.imul(ah4, bl0) | 0;
        hi = Math.imul(ah4, bh0);
        lo = lo + Math.imul(al3, bl1) | 0;
        mid = mid + Math.imul(al3, bh1) | 0;
        mid = mid + Math.imul(ah3, bl1) | 0;
        hi = hi + Math.imul(ah3, bh1) | 0;
        lo = lo + Math.imul(al2, bl2) | 0;
        mid = mid + Math.imul(al2, bh2) | 0;
        mid = mid + Math.imul(ah2, bl2) | 0;
        hi = hi + Math.imul(ah2, bh2) | 0;
        lo = lo + Math.imul(al1, bl3) | 0;
        mid = mid + Math.imul(al1, bh3) | 0;
        mid = mid + Math.imul(ah1, bl3) | 0;
        hi = hi + Math.imul(ah1, bh3) | 0;
        lo = lo + Math.imul(al0, bl4) | 0;
        mid = mid + Math.imul(al0, bh4) | 0;
        mid = mid + Math.imul(ah0, bl4) | 0;
        hi = hi + Math.imul(ah0, bh4) | 0;
        var w4 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w4 >>> 26) | 0;
        w4 &= 67108863;
        lo = Math.imul(al5, bl0);
        mid = Math.imul(al5, bh0);
        mid = mid + Math.imul(ah5, bl0) | 0;
        hi = Math.imul(ah5, bh0);
        lo = lo + Math.imul(al4, bl1) | 0;
        mid = mid + Math.imul(al4, bh1) | 0;
        mid = mid + Math.imul(ah4, bl1) | 0;
        hi = hi + Math.imul(ah4, bh1) | 0;
        lo = lo + Math.imul(al3, bl2) | 0;
        mid = mid + Math.imul(al3, bh2) | 0;
        mid = mid + Math.imul(ah3, bl2) | 0;
        hi = hi + Math.imul(ah3, bh2) | 0;
        lo = lo + Math.imul(al2, bl3) | 0;
        mid = mid + Math.imul(al2, bh3) | 0;
        mid = mid + Math.imul(ah2, bl3) | 0;
        hi = hi + Math.imul(ah2, bh3) | 0;
        lo = lo + Math.imul(al1, bl4) | 0;
        mid = mid + Math.imul(al1, bh4) | 0;
        mid = mid + Math.imul(ah1, bl4) | 0;
        hi = hi + Math.imul(ah1, bh4) | 0;
        lo = lo + Math.imul(al0, bl5) | 0;
        mid = mid + Math.imul(al0, bh5) | 0;
        mid = mid + Math.imul(ah0, bl5) | 0;
        hi = hi + Math.imul(ah0, bh5) | 0;
        var w5 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w5 >>> 26) | 0;
        w5 &= 67108863;
        lo = Math.imul(al6, bl0);
        mid = Math.imul(al6, bh0);
        mid = mid + Math.imul(ah6, bl0) | 0;
        hi = Math.imul(ah6, bh0);
        lo = lo + Math.imul(al5, bl1) | 0;
        mid = mid + Math.imul(al5, bh1) | 0;
        mid = mid + Math.imul(ah5, bl1) | 0;
        hi = hi + Math.imul(ah5, bh1) | 0;
        lo = lo + Math.imul(al4, bl2) | 0;
        mid = mid + Math.imul(al4, bh2) | 0;
        mid = mid + Math.imul(ah4, bl2) | 0;
        hi = hi + Math.imul(ah4, bh2) | 0;
        lo = lo + Math.imul(al3, bl3) | 0;
        mid = mid + Math.imul(al3, bh3) | 0;
        mid = mid + Math.imul(ah3, bl3) | 0;
        hi = hi + Math.imul(ah3, bh3) | 0;
        lo = lo + Math.imul(al2, bl4) | 0;
        mid = mid + Math.imul(al2, bh4) | 0;
        mid = mid + Math.imul(ah2, bl4) | 0;
        hi = hi + Math.imul(ah2, bh4) | 0;
        lo = lo + Math.imul(al1, bl5) | 0;
        mid = mid + Math.imul(al1, bh5) | 0;
        mid = mid + Math.imul(ah1, bl5) | 0;
        hi = hi + Math.imul(ah1, bh5) | 0;
        lo = lo + Math.imul(al0, bl6) | 0;
        mid = mid + Math.imul(al0, bh6) | 0;
        mid = mid + Math.imul(ah0, bl6) | 0;
        hi = hi + Math.imul(ah0, bh6) | 0;
        var w6 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w6 >>> 26) | 0;
        w6 &= 67108863;
        lo = Math.imul(al7, bl0);
        mid = Math.imul(al7, bh0);
        mid = mid + Math.imul(ah7, bl0) | 0;
        hi = Math.imul(ah7, bh0);
        lo = lo + Math.imul(al6, bl1) | 0;
        mid = mid + Math.imul(al6, bh1) | 0;
        mid = mid + Math.imul(ah6, bl1) | 0;
        hi = hi + Math.imul(ah6, bh1) | 0;
        lo = lo + Math.imul(al5, bl2) | 0;
        mid = mid + Math.imul(al5, bh2) | 0;
        mid = mid + Math.imul(ah5, bl2) | 0;
        hi = hi + Math.imul(ah5, bh2) | 0;
        lo = lo + Math.imul(al4, bl3) | 0;
        mid = mid + Math.imul(al4, bh3) | 0;
        mid = mid + Math.imul(ah4, bl3) | 0;
        hi = hi + Math.imul(ah4, bh3) | 0;
        lo = lo + Math.imul(al3, bl4) | 0;
        mid = mid + Math.imul(al3, bh4) | 0;
        mid = mid + Math.imul(ah3, bl4) | 0;
        hi = hi + Math.imul(ah3, bh4) | 0;
        lo = lo + Math.imul(al2, bl5) | 0;
        mid = mid + Math.imul(al2, bh5) | 0;
        mid = mid + Math.imul(ah2, bl5) | 0;
        hi = hi + Math.imul(ah2, bh5) | 0;
        lo = lo + Math.imul(al1, bl6) | 0;
        mid = mid + Math.imul(al1, bh6) | 0;
        mid = mid + Math.imul(ah1, bl6) | 0;
        hi = hi + Math.imul(ah1, bh6) | 0;
        lo = lo + Math.imul(al0, bl7) | 0;
        mid = mid + Math.imul(al0, bh7) | 0;
        mid = mid + Math.imul(ah0, bl7) | 0;
        hi = hi + Math.imul(ah0, bh7) | 0;
        var w7 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w7 >>> 26) | 0;
        w7 &= 67108863;
        lo = Math.imul(al8, bl0);
        mid = Math.imul(al8, bh0);
        mid = mid + Math.imul(ah8, bl0) | 0;
        hi = Math.imul(ah8, bh0);
        lo = lo + Math.imul(al7, bl1) | 0;
        mid = mid + Math.imul(al7, bh1) | 0;
        mid = mid + Math.imul(ah7, bl1) | 0;
        hi = hi + Math.imul(ah7, bh1) | 0;
        lo = lo + Math.imul(al6, bl2) | 0;
        mid = mid + Math.imul(al6, bh2) | 0;
        mid = mid + Math.imul(ah6, bl2) | 0;
        hi = hi + Math.imul(ah6, bh2) | 0;
        lo = lo + Math.imul(al5, bl3) | 0;
        mid = mid + Math.imul(al5, bh3) | 0;
        mid = mid + Math.imul(ah5, bl3) | 0;
        hi = hi + Math.imul(ah5, bh3) | 0;
        lo = lo + Math.imul(al4, bl4) | 0;
        mid = mid + Math.imul(al4, bh4) | 0;
        mid = mid + Math.imul(ah4, bl4) | 0;
        hi = hi + Math.imul(ah4, bh4) | 0;
        lo = lo + Math.imul(al3, bl5) | 0;
        mid = mid + Math.imul(al3, bh5) | 0;
        mid = mid + Math.imul(ah3, bl5) | 0;
        hi = hi + Math.imul(ah3, bh5) | 0;
        lo = lo + Math.imul(al2, bl6) | 0;
        mid = mid + Math.imul(al2, bh6) | 0;
        mid = mid + Math.imul(ah2, bl6) | 0;
        hi = hi + Math.imul(ah2, bh6) | 0;
        lo = lo + Math.imul(al1, bl7) | 0;
        mid = mid + Math.imul(al1, bh7) | 0;
        mid = mid + Math.imul(ah1, bl7) | 0;
        hi = hi + Math.imul(ah1, bh7) | 0;
        lo = lo + Math.imul(al0, bl8) | 0;
        mid = mid + Math.imul(al0, bh8) | 0;
        mid = mid + Math.imul(ah0, bl8) | 0;
        hi = hi + Math.imul(ah0, bh8) | 0;
        var w8 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w8 >>> 26) | 0;
        w8 &= 67108863;
        lo = Math.imul(al9, bl0);
        mid = Math.imul(al9, bh0);
        mid = mid + Math.imul(ah9, bl0) | 0;
        hi = Math.imul(ah9, bh0);
        lo = lo + Math.imul(al8, bl1) | 0;
        mid = mid + Math.imul(al8, bh1) | 0;
        mid = mid + Math.imul(ah8, bl1) | 0;
        hi = hi + Math.imul(ah8, bh1) | 0;
        lo = lo + Math.imul(al7, bl2) | 0;
        mid = mid + Math.imul(al7, bh2) | 0;
        mid = mid + Math.imul(ah7, bl2) | 0;
        hi = hi + Math.imul(ah7, bh2) | 0;
        lo = lo + Math.imul(al6, bl3) | 0;
        mid = mid + Math.imul(al6, bh3) | 0;
        mid = mid + Math.imul(ah6, bl3) | 0;
        hi = hi + Math.imul(ah6, bh3) | 0;
        lo = lo + Math.imul(al5, bl4) | 0;
        mid = mid + Math.imul(al5, bh4) | 0;
        mid = mid + Math.imul(ah5, bl4) | 0;
        hi = hi + Math.imul(ah5, bh4) | 0;
        lo = lo + Math.imul(al4, bl5) | 0;
        mid = mid + Math.imul(al4, bh5) | 0;
        mid = mid + Math.imul(ah4, bl5) | 0;
        hi = hi + Math.imul(ah4, bh5) | 0;
        lo = lo + Math.imul(al3, bl6) | 0;
        mid = mid + Math.imul(al3, bh6) | 0;
        mid = mid + Math.imul(ah3, bl6) | 0;
        hi = hi + Math.imul(ah3, bh6) | 0;
        lo = lo + Math.imul(al2, bl7) | 0;
        mid = mid + Math.imul(al2, bh7) | 0;
        mid = mid + Math.imul(ah2, bl7) | 0;
        hi = hi + Math.imul(ah2, bh7) | 0;
        lo = lo + Math.imul(al1, bl8) | 0;
        mid = mid + Math.imul(al1, bh8) | 0;
        mid = mid + Math.imul(ah1, bl8) | 0;
        hi = hi + Math.imul(ah1, bh8) | 0;
        lo = lo + Math.imul(al0, bl9) | 0;
        mid = mid + Math.imul(al0, bh9) | 0;
        mid = mid + Math.imul(ah0, bl9) | 0;
        hi = hi + Math.imul(ah0, bh9) | 0;
        var w9 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w9 >>> 26) | 0;
        w9 &= 67108863;
        lo = Math.imul(al9, bl1);
        mid = Math.imul(al9, bh1);
        mid = mid + Math.imul(ah9, bl1) | 0;
        hi = Math.imul(ah9, bh1);
        lo = lo + Math.imul(al8, bl2) | 0;
        mid = mid + Math.imul(al8, bh2) | 0;
        mid = mid + Math.imul(ah8, bl2) | 0;
        hi = hi + Math.imul(ah8, bh2) | 0;
        lo = lo + Math.imul(al7, bl3) | 0;
        mid = mid + Math.imul(al7, bh3) | 0;
        mid = mid + Math.imul(ah7, bl3) | 0;
        hi = hi + Math.imul(ah7, bh3) | 0;
        lo = lo + Math.imul(al6, bl4) | 0;
        mid = mid + Math.imul(al6, bh4) | 0;
        mid = mid + Math.imul(ah6, bl4) | 0;
        hi = hi + Math.imul(ah6, bh4) | 0;
        lo = lo + Math.imul(al5, bl5) | 0;
        mid = mid + Math.imul(al5, bh5) | 0;
        mid = mid + Math.imul(ah5, bl5) | 0;
        hi = hi + Math.imul(ah5, bh5) | 0;
        lo = lo + Math.imul(al4, bl6) | 0;
        mid = mid + Math.imul(al4, bh6) | 0;
        mid = mid + Math.imul(ah4, bl6) | 0;
        hi = hi + Math.imul(ah4, bh6) | 0;
        lo = lo + Math.imul(al3, bl7) | 0;
        mid = mid + Math.imul(al3, bh7) | 0;
        mid = mid + Math.imul(ah3, bl7) | 0;
        hi = hi + Math.imul(ah3, bh7) | 0;
        lo = lo + Math.imul(al2, bl8) | 0;
        mid = mid + Math.imul(al2, bh8) | 0;
        mid = mid + Math.imul(ah2, bl8) | 0;
        hi = hi + Math.imul(ah2, bh8) | 0;
        lo = lo + Math.imul(al1, bl9) | 0;
        mid = mid + Math.imul(al1, bh9) | 0;
        mid = mid + Math.imul(ah1, bl9) | 0;
        hi = hi + Math.imul(ah1, bh9) | 0;
        var w10 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w10 >>> 26) | 0;
        w10 &= 67108863;
        lo = Math.imul(al9, bl2);
        mid = Math.imul(al9, bh2);
        mid = mid + Math.imul(ah9, bl2) | 0;
        hi = Math.imul(ah9, bh2);
        lo = lo + Math.imul(al8, bl3) | 0;
        mid = mid + Math.imul(al8, bh3) | 0;
        mid = mid + Math.imul(ah8, bl3) | 0;
        hi = hi + Math.imul(ah8, bh3) | 0;
        lo = lo + Math.imul(al7, bl4) | 0;
        mid = mid + Math.imul(al7, bh4) | 0;
        mid = mid + Math.imul(ah7, bl4) | 0;
        hi = hi + Math.imul(ah7, bh4) | 0;
        lo = lo + Math.imul(al6, bl5) | 0;
        mid = mid + Math.imul(al6, bh5) | 0;
        mid = mid + Math.imul(ah6, bl5) | 0;
        hi = hi + Math.imul(ah6, bh5) | 0;
        lo = lo + Math.imul(al5, bl6) | 0;
        mid = mid + Math.imul(al5, bh6) | 0;
        mid = mid + Math.imul(ah5, bl6) | 0;
        hi = hi + Math.imul(ah5, bh6) | 0;
        lo = lo + Math.imul(al4, bl7) | 0;
        mid = mid + Math.imul(al4, bh7) | 0;
        mid = mid + Math.imul(ah4, bl7) | 0;
        hi = hi + Math.imul(ah4, bh7) | 0;
        lo = lo + Math.imul(al3, bl8) | 0;
        mid = mid + Math.imul(al3, bh8) | 0;
        mid = mid + Math.imul(ah3, bl8) | 0;
        hi = hi + Math.imul(ah3, bh8) | 0;
        lo = lo + Math.imul(al2, bl9) | 0;
        mid = mid + Math.imul(al2, bh9) | 0;
        mid = mid + Math.imul(ah2, bl9) | 0;
        hi = hi + Math.imul(ah2, bh9) | 0;
        var w11 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w11 >>> 26) | 0;
        w11 &= 67108863;
        lo = Math.imul(al9, bl3);
        mid = Math.imul(al9, bh3);
        mid = mid + Math.imul(ah9, bl3) | 0;
        hi = Math.imul(ah9, bh3);
        lo = lo + Math.imul(al8, bl4) | 0;
        mid = mid + Math.imul(al8, bh4) | 0;
        mid = mid + Math.imul(ah8, bl4) | 0;
        hi = hi + Math.imul(ah8, bh4) | 0;
        lo = lo + Math.imul(al7, bl5) | 0;
        mid = mid + Math.imul(al7, bh5) | 0;
        mid = mid + Math.imul(ah7, bl5) | 0;
        hi = hi + Math.imul(ah7, bh5) | 0;
        lo = lo + Math.imul(al6, bl6) | 0;
        mid = mid + Math.imul(al6, bh6) | 0;
        mid = mid + Math.imul(ah6, bl6) | 0;
        hi = hi + Math.imul(ah6, bh6) | 0;
        lo = lo + Math.imul(al5, bl7) | 0;
        mid = mid + Math.imul(al5, bh7) | 0;
        mid = mid + Math.imul(ah5, bl7) | 0;
        hi = hi + Math.imul(ah5, bh7) | 0;
        lo = lo + Math.imul(al4, bl8) | 0;
        mid = mid + Math.imul(al4, bh8) | 0;
        mid = mid + Math.imul(ah4, bl8) | 0;
        hi = hi + Math.imul(ah4, bh8) | 0;
        lo = lo + Math.imul(al3, bl9) | 0;
        mid = mid + Math.imul(al3, bh9) | 0;
        mid = mid + Math.imul(ah3, bl9) | 0;
        hi = hi + Math.imul(ah3, bh9) | 0;
        var w12 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w12 >>> 26) | 0;
        w12 &= 67108863;
        lo = Math.imul(al9, bl4);
        mid = Math.imul(al9, bh4);
        mid = mid + Math.imul(ah9, bl4) | 0;
        hi = Math.imul(ah9, bh4);
        lo = lo + Math.imul(al8, bl5) | 0;
        mid = mid + Math.imul(al8, bh5) | 0;
        mid = mid + Math.imul(ah8, bl5) | 0;
        hi = hi + Math.imul(ah8, bh5) | 0;
        lo = lo + Math.imul(al7, bl6) | 0;
        mid = mid + Math.imul(al7, bh6) | 0;
        mid = mid + Math.imul(ah7, bl6) | 0;
        hi = hi + Math.imul(ah7, bh6) | 0;
        lo = lo + Math.imul(al6, bl7) | 0;
        mid = mid + Math.imul(al6, bh7) | 0;
        mid = mid + Math.imul(ah6, bl7) | 0;
        hi = hi + Math.imul(ah6, bh7) | 0;
        lo = lo + Math.imul(al5, bl8) | 0;
        mid = mid + Math.imul(al5, bh8) | 0;
        mid = mid + Math.imul(ah5, bl8) | 0;
        hi = hi + Math.imul(ah5, bh8) | 0;
        lo = lo + Math.imul(al4, bl9) | 0;
        mid = mid + Math.imul(al4, bh9) | 0;
        mid = mid + Math.imul(ah4, bl9) | 0;
        hi = hi + Math.imul(ah4, bh9) | 0;
        var w13 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w13 >>> 26) | 0;
        w13 &= 67108863;
        lo = Math.imul(al9, bl5);
        mid = Math.imul(al9, bh5);
        mid = mid + Math.imul(ah9, bl5) | 0;
        hi = Math.imul(ah9, bh5);
        lo = lo + Math.imul(al8, bl6) | 0;
        mid = mid + Math.imul(al8, bh6) | 0;
        mid = mid + Math.imul(ah8, bl6) | 0;
        hi = hi + Math.imul(ah8, bh6) | 0;
        lo = lo + Math.imul(al7, bl7) | 0;
        mid = mid + Math.imul(al7, bh7) | 0;
        mid = mid + Math.imul(ah7, bl7) | 0;
        hi = hi + Math.imul(ah7, bh7) | 0;
        lo = lo + Math.imul(al6, bl8) | 0;
        mid = mid + Math.imul(al6, bh8) | 0;
        mid = mid + Math.imul(ah6, bl8) | 0;
        hi = hi + Math.imul(ah6, bh8) | 0;
        lo = lo + Math.imul(al5, bl9) | 0;
        mid = mid + Math.imul(al5, bh9) | 0;
        mid = mid + Math.imul(ah5, bl9) | 0;
        hi = hi + Math.imul(ah5, bh9) | 0;
        var w14 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w14 >>> 26) | 0;
        w14 &= 67108863;
        lo = Math.imul(al9, bl6);
        mid = Math.imul(al9, bh6);
        mid = mid + Math.imul(ah9, bl6) | 0;
        hi = Math.imul(ah9, bh6);
        lo = lo + Math.imul(al8, bl7) | 0;
        mid = mid + Math.imul(al8, bh7) | 0;
        mid = mid + Math.imul(ah8, bl7) | 0;
        hi = hi + Math.imul(ah8, bh7) | 0;
        lo = lo + Math.imul(al7, bl8) | 0;
        mid = mid + Math.imul(al7, bh8) | 0;
        mid = mid + Math.imul(ah7, bl8) | 0;
        hi = hi + Math.imul(ah7, bh8) | 0;
        lo = lo + Math.imul(al6, bl9) | 0;
        mid = mid + Math.imul(al6, bh9) | 0;
        mid = mid + Math.imul(ah6, bl9) | 0;
        hi = hi + Math.imul(ah6, bh9) | 0;
        var w15 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w15 >>> 26) | 0;
        w15 &= 67108863;
        lo = Math.imul(al9, bl7);
        mid = Math.imul(al9, bh7);
        mid = mid + Math.imul(ah9, bl7) | 0;
        hi = Math.imul(ah9, bh7);
        lo = lo + Math.imul(al8, bl8) | 0;
        mid = mid + Math.imul(al8, bh8) | 0;
        mid = mid + Math.imul(ah8, bl8) | 0;
        hi = hi + Math.imul(ah8, bh8) | 0;
        lo = lo + Math.imul(al7, bl9) | 0;
        mid = mid + Math.imul(al7, bh9) | 0;
        mid = mid + Math.imul(ah7, bl9) | 0;
        hi = hi + Math.imul(ah7, bh9) | 0;
        var w16 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w16 >>> 26) | 0;
        w16 &= 67108863;
        lo = Math.imul(al9, bl8);
        mid = Math.imul(al9, bh8);
        mid = mid + Math.imul(ah9, bl8) | 0;
        hi = Math.imul(ah9, bh8);
        lo = lo + Math.imul(al8, bl9) | 0;
        mid = mid + Math.imul(al8, bh9) | 0;
        mid = mid + Math.imul(ah8, bl9) | 0;
        hi = hi + Math.imul(ah8, bh9) | 0;
        var w17 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w17 >>> 26) | 0;
        w17 &= 67108863;
        lo = Math.imul(al9, bl9);
        mid = Math.imul(al9, bh9);
        mid = mid + Math.imul(ah9, bl9) | 0;
        hi = Math.imul(ah9, bh9);
        var w18 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w18 >>> 26) | 0;
        w18 &= 67108863;
        o[0] = w0;
        o[1] = w1;
        o[2] = w2;
        o[3] = w3;
        o[4] = w4;
        o[5] = w5;
        o[6] = w6;
        o[7] = w7;
        o[8] = w8;
        o[9] = w9;
        o[10] = w10;
        o[11] = w11;
        o[12] = w12;
        o[13] = w13;
        o[14] = w14;
        o[15] = w15;
        o[16] = w16;
        o[17] = w17;
        o[18] = w18;
        if (c !== 0) {
          o[19] = c;
          out.length++;
        }
        return out;
      };
      if (!Math.imul) {
        comb10MulTo = smallMulTo;
      }
      function bigMulTo(self, num, out) {
        out.negative = num.negative ^ self.negative;
        out.length = self.length + num.length;
        var carry = 0;
        var hncarry = 0;
        for (var k2 = 0; k2 < out.length - 1; k2++) {
          var ncarry = hncarry;
          hncarry = 0;
          var rword = carry & 67108863;
          var maxJ = Math.min(k2, num.length - 1);
          for (var j = Math.max(0, k2 - self.length + 1); j <= maxJ; j++) {
            var i = k2 - j;
            var a = self.words[i] | 0;
            var b2 = num.words[j] | 0;
            var r = a * b2;
            var lo = r & 67108863;
            ncarry = ncarry + (r / 67108864 | 0) | 0;
            lo = lo + rword | 0;
            rword = lo & 67108863;
            ncarry = ncarry + (lo >>> 26) | 0;
            hncarry += ncarry >>> 26;
            ncarry &= 67108863;
          }
          out.words[k2] = rword;
          carry = ncarry;
          ncarry = hncarry;
        }
        if (carry !== 0) {
          out.words[k2] = carry;
        } else {
          out.length--;
        }
        return out.strip();
      }
      function jumboMulTo(self, num, out) {
        var fftm = new FFTM();
        return fftm.mulp(self, num, out);
      }
      BN.prototype.mulTo = function mulTo(num, out) {
        var res;
        var len = this.length + num.length;
        if (this.length === 10 && num.length === 10) {
          res = comb10MulTo(this, num, out);
        } else if (len < 63) {
          res = smallMulTo(this, num, out);
        } else if (len < 1024) {
          res = bigMulTo(this, num, out);
        } else {
          res = jumboMulTo(this, num, out);
        }
        return res;
      };
      function FFTM(x2, y) {
        this.x = x2;
        this.y = y;
      }
      FFTM.prototype.makeRBT = function makeRBT(N) {
        var t = new Array(N);
        var l = BN.prototype._countBits(N) - 1;
        for (var i = 0; i < N; i++) {
          t[i] = this.revBin(i, l, N);
        }
        return t;
      };
      FFTM.prototype.revBin = function revBin(x2, l, N) {
        if (x2 === 0 || x2 === N - 1) return x2;
        var rb = 0;
        for (var i = 0; i < l; i++) {
          rb |= (x2 & 1) << l - i - 1;
          x2 >>= 1;
        }
        return rb;
      };
      FFTM.prototype.permute = function permute(rbt, rws, iws, rtws, itws, N) {
        for (var i = 0; i < N; i++) {
          rtws[i] = rws[rbt[i]];
          itws[i] = iws[rbt[i]];
        }
      };
      FFTM.prototype.transform = function transform(rws, iws, rtws, itws, N, rbt) {
        this.permute(rbt, rws, iws, rtws, itws, N);
        for (var s2 = 1; s2 < N; s2 <<= 1) {
          var l = s2 << 1;
          var rtwdf = Math.cos(2 * Math.PI / l);
          var itwdf = Math.sin(2 * Math.PI / l);
          for (var p2 = 0; p2 < N; p2 += l) {
            var rtwdf_ = rtwdf;
            var itwdf_ = itwdf;
            for (var j = 0; j < s2; j++) {
              var re = rtws[p2 + j];
              var ie = itws[p2 + j];
              var ro = rtws[p2 + j + s2];
              var io = itws[p2 + j + s2];
              var rx = rtwdf_ * ro - itwdf_ * io;
              io = rtwdf_ * io + itwdf_ * ro;
              ro = rx;
              rtws[p2 + j] = re + ro;
              itws[p2 + j] = ie + io;
              rtws[p2 + j + s2] = re - ro;
              itws[p2 + j + s2] = ie - io;
              if (j !== l) {
                rx = rtwdf * rtwdf_ - itwdf * itwdf_;
                itwdf_ = rtwdf * itwdf_ + itwdf * rtwdf_;
                rtwdf_ = rx;
              }
            }
          }
        }
      };
      FFTM.prototype.guessLen13b = function guessLen13b(n, m2) {
        var N = Math.max(m2, n) | 1;
        var odd = N & 1;
        var i = 0;
        for (N = N / 2 | 0; N; N = N >>> 1) {
          i++;
        }
        return 1 << i + 1 + odd;
      };
      FFTM.prototype.conjugate = function conjugate(rws, iws, N) {
        if (N <= 1) return;
        for (var i = 0; i < N / 2; i++) {
          var t = rws[i];
          rws[i] = rws[N - i - 1];
          rws[N - i - 1] = t;
          t = iws[i];
          iws[i] = -iws[N - i - 1];
          iws[N - i - 1] = -t;
        }
      };
      FFTM.prototype.normalize13b = function normalize13b(ws, N) {
        var carry = 0;
        for (var i = 0; i < N / 2; i++) {
          var w2 = Math.round(ws[2 * i + 1] / N) * 8192 + Math.round(ws[2 * i] / N) + carry;
          ws[i] = w2 & 67108863;
          if (w2 < 67108864) {
            carry = 0;
          } else {
            carry = w2 / 67108864 | 0;
          }
        }
        return ws;
      };
      FFTM.prototype.convert13b = function convert13b(ws, len, rws, N) {
        var carry = 0;
        for (var i = 0; i < len; i++) {
          carry = carry + (ws[i] | 0);
          rws[2 * i] = carry & 8191;
          carry = carry >>> 13;
          rws[2 * i + 1] = carry & 8191;
          carry = carry >>> 13;
        }
        for (i = 2 * len; i < N; ++i) {
          rws[i] = 0;
        }
        assert(carry === 0);
        assert((carry & ~8191) === 0);
      };
      FFTM.prototype.stub = function stub(N) {
        var ph = new Array(N);
        for (var i = 0; i < N; i++) {
          ph[i] = 0;
        }
        return ph;
      };
      FFTM.prototype.mulp = function mulp(x2, y, out) {
        var N = 2 * this.guessLen13b(x2.length, y.length);
        var rbt = this.makeRBT(N);
        var _2 = this.stub(N);
        var rws = new Array(N);
        var rwst = new Array(N);
        var iwst = new Array(N);
        var nrws = new Array(N);
        var nrwst = new Array(N);
        var niwst = new Array(N);
        var rmws = out.words;
        rmws.length = N;
        this.convert13b(x2.words, x2.length, rws, N);
        this.convert13b(y.words, y.length, nrws, N);
        this.transform(rws, _2, rwst, iwst, N, rbt);
        this.transform(nrws, _2, nrwst, niwst, N, rbt);
        for (var i = 0; i < N; i++) {
          var rx = rwst[i] * nrwst[i] - iwst[i] * niwst[i];
          iwst[i] = rwst[i] * niwst[i] + iwst[i] * nrwst[i];
          rwst[i] = rx;
        }
        this.conjugate(rwst, iwst, N);
        this.transform(rwst, iwst, rmws, _2, N, rbt);
        this.conjugate(rmws, _2, N);
        this.normalize13b(rmws, N);
        out.negative = x2.negative ^ y.negative;
        out.length = x2.length + y.length;
        return out.strip();
      };
      BN.prototype.mul = function mul(num) {
        var out = new BN(null);
        out.words = new Array(this.length + num.length);
        return this.mulTo(num, out);
      };
      BN.prototype.mulf = function mulf(num) {
        var out = new BN(null);
        out.words = new Array(this.length + num.length);
        return jumboMulTo(this, num, out);
      };
      BN.prototype.imul = function imul(num) {
        return this.clone().mulTo(num, this);
      };
      BN.prototype.imuln = function imuln(num) {
        assert(typeof num === "number");
        assert(num < 67108864);
        var carry = 0;
        for (var i = 0; i < this.length; i++) {
          var w2 = (this.words[i] | 0) * num;
          var lo = (w2 & 67108863) + (carry & 67108863);
          carry >>= 26;
          carry += w2 / 67108864 | 0;
          carry += lo >>> 26;
          this.words[i] = lo & 67108863;
        }
        if (carry !== 0) {
          this.words[i] = carry;
          this.length++;
        }
        if (num === 0) {
          this.length = 1;
          this._normSign();
        }
        return this;
      };
      BN.prototype.muln = function muln(num) {
        return this.clone().imuln(num);
      };
      BN.prototype.sqr = function sqr() {
        return this.mul(this);
      };
      BN.prototype.isqr = function isqr() {
        return this.imul(this.clone());
      };
      BN.prototype.pow = function pow(num) {
        var w2 = toBitArray(num);
        if (w2.length === 0) return new BN(1);
        var res = this;
        for (var i = 0; i < w2.length; i++, res = res.sqr()) {
          if (w2[i] !== 0) break;
        }
        if (++i < w2.length) {
          for (var q = res.sqr(); i < w2.length; i++, q = q.sqr()) {
            if (w2[i] === 0) continue;
            res = res.mul(q);
          }
        }
        return res;
      };
      BN.prototype.iushln = function iushln(bits) {
        assert(typeof bits === "number" && bits >= 0);
        var r = bits % 26;
        var s2 = (bits - r) / 26;
        var carryMask = 67108863 >>> 26 - r << 26 - r;
        var i;
        if (r !== 0) {
          var carry = 0;
          for (i = 0; i < this.length; i++) {
            var newCarry = this.words[i] & carryMask;
            var c = (this.words[i] | 0) - newCarry << r;
            this.words[i] = c | carry;
            carry = newCarry >>> 26 - r;
          }
          if (carry) {
            this.words[i] = carry;
            this.length++;
          }
        }
        if (s2 !== 0) {
          for (i = this.length - 1; i >= 0; i--) {
            this.words[i + s2] = this.words[i];
          }
          for (i = 0; i < s2; i++) {
            this.words[i] = 0;
          }
          this.length += s2;
        }
        return this.strip();
      };
      BN.prototype.ishln = function ishln(bits) {
        assert(this.negative === 0);
        return this.iushln(bits);
      };
      BN.prototype.iushrn = function iushrn(bits, hint, extended) {
        assert(typeof bits === "number" && bits >= 0);
        var h;
        if (hint) {
          h = (hint - hint % 26) / 26;
        } else {
          h = 0;
        }
        var r = bits % 26;
        var s2 = Math.min((bits - r) / 26, this.length);
        var mask = 67108863 ^ 67108863 >>> r << r;
        var maskedWords = extended;
        h -= s2;
        h = Math.max(0, h);
        if (maskedWords) {
          for (var i = 0; i < s2; i++) {
            maskedWords.words[i] = this.words[i];
          }
          maskedWords.length = s2;
        }
        if (s2 === 0) {
        } else if (this.length > s2) {
          this.length -= s2;
          for (i = 0; i < this.length; i++) {
            this.words[i] = this.words[i + s2];
          }
        } else {
          this.words[0] = 0;
          this.length = 1;
        }
        var carry = 0;
        for (i = this.length - 1; i >= 0 && (carry !== 0 || i >= h); i--) {
          var word = this.words[i] | 0;
          this.words[i] = carry << 26 - r | word >>> r;
          carry = word & mask;
        }
        if (maskedWords && carry !== 0) {
          maskedWords.words[maskedWords.length++] = carry;
        }
        if (this.length === 0) {
          this.words[0] = 0;
          this.length = 1;
        }
        return this.strip();
      };
      BN.prototype.ishrn = function ishrn(bits, hint, extended) {
        assert(this.negative === 0);
        return this.iushrn(bits, hint, extended);
      };
      BN.prototype.shln = function shln(bits) {
        return this.clone().ishln(bits);
      };
      BN.prototype.ushln = function ushln(bits) {
        return this.clone().iushln(bits);
      };
      BN.prototype.shrn = function shrn(bits) {
        return this.clone().ishrn(bits);
      };
      BN.prototype.ushrn = function ushrn(bits) {
        return this.clone().iushrn(bits);
      };
      BN.prototype.testn = function testn(bit) {
        assert(typeof bit === "number" && bit >= 0);
        var r = bit % 26;
        var s2 = (bit - r) / 26;
        var q = 1 << r;
        if (this.length <= s2) return false;
        var w2 = this.words[s2];
        return !!(w2 & q);
      };
      BN.prototype.imaskn = function imaskn(bits) {
        assert(typeof bits === "number" && bits >= 0);
        var r = bits % 26;
        var s2 = (bits - r) / 26;
        assert(this.negative === 0, "imaskn works only with positive numbers");
        if (this.length <= s2) {
          return this;
        }
        if (r !== 0) {
          s2++;
        }
        this.length = Math.min(s2, this.length);
        if (r !== 0) {
          var mask = 67108863 ^ 67108863 >>> r << r;
          this.words[this.length - 1] &= mask;
        }
        if (this.length === 0) {
          this.words[0] = 0;
          this.length = 1;
        }
        return this.strip();
      };
      BN.prototype.maskn = function maskn(bits) {
        return this.clone().imaskn(bits);
      };
      BN.prototype.iaddn = function iaddn(num) {
        assert(typeof num === "number");
        assert(num < 67108864);
        if (num < 0) return this.isubn(-num);
        if (this.negative !== 0) {
          if (this.length === 1 && (this.words[0] | 0) < num) {
            this.words[0] = num - (this.words[0] | 0);
            this.negative = 0;
            return this;
          }
          this.negative = 0;
          this.isubn(num);
          this.negative = 1;
          return this;
        }
        return this._iaddn(num);
      };
      BN.prototype._iaddn = function _iaddn(num) {
        this.words[0] += num;
        for (var i = 0; i < this.length && this.words[i] >= 67108864; i++) {
          this.words[i] -= 67108864;
          if (i === this.length - 1) {
            this.words[i + 1] = 1;
          } else {
            this.words[i + 1]++;
          }
        }
        this.length = Math.max(this.length, i + 1);
        return this;
      };
      BN.prototype.isubn = function isubn(num) {
        assert(typeof num === "number");
        assert(num < 67108864);
        if (num < 0) return this.iaddn(-num);
        if (this.negative !== 0) {
          this.negative = 0;
          this.iaddn(num);
          this.negative = 1;
          return this;
        }
        this.words[0] -= num;
        if (this.length === 1 && this.words[0] < 0) {
          this.words[0] = -this.words[0];
          this.negative = 1;
        } else {
          for (var i = 0; i < this.length && this.words[i] < 0; i++) {
            this.words[i] += 67108864;
            this.words[i + 1] -= 1;
          }
        }
        return this.strip();
      };
      BN.prototype.addn = function addn(num) {
        return this.clone().iaddn(num);
      };
      BN.prototype.subn = function subn(num) {
        return this.clone().isubn(num);
      };
      BN.prototype.iabs = function iabs() {
        this.negative = 0;
        return this;
      };
      BN.prototype.abs = function abs() {
        return this.clone().iabs();
      };
      BN.prototype._ishlnsubmul = function _ishlnsubmul(num, mul, shift) {
        var len = num.length + shift;
        var i;
        this._expand(len);
        var w2;
        var carry = 0;
        for (i = 0; i < num.length; i++) {
          w2 = (this.words[i + shift] | 0) + carry;
          var right = (num.words[i] | 0) * mul;
          w2 -= right & 67108863;
          carry = (w2 >> 26) - (right / 67108864 | 0);
          this.words[i + shift] = w2 & 67108863;
        }
        for (; i < this.length - shift; i++) {
          w2 = (this.words[i + shift] | 0) + carry;
          carry = w2 >> 26;
          this.words[i + shift] = w2 & 67108863;
        }
        if (carry === 0) return this.strip();
        assert(carry === -1);
        carry = 0;
        for (i = 0; i < this.length; i++) {
          w2 = -(this.words[i] | 0) + carry;
          carry = w2 >> 26;
          this.words[i] = w2 & 67108863;
        }
        this.negative = 1;
        return this.strip();
      };
      BN.prototype._wordDiv = function _wordDiv(num, mode) {
        var shift = this.length - num.length;
        var a = this.clone();
        var b2 = num;
        var bhi = b2.words[b2.length - 1] | 0;
        var bhiBits = this._countBits(bhi);
        shift = 26 - bhiBits;
        if (shift !== 0) {
          b2 = b2.ushln(shift);
          a.iushln(shift);
          bhi = b2.words[b2.length - 1] | 0;
        }
        var m2 = a.length - b2.length;
        var q;
        if (mode !== "mod") {
          q = new BN(null);
          q.length = m2 + 1;
          q.words = new Array(q.length);
          for (var i = 0; i < q.length; i++) {
            q.words[i] = 0;
          }
        }
        var diff = a.clone()._ishlnsubmul(b2, 1, m2);
        if (diff.negative === 0) {
          a = diff;
          if (q) {
            q.words[m2] = 1;
          }
        }
        for (var j = m2 - 1; j >= 0; j--) {
          var qj = (a.words[b2.length + j] | 0) * 67108864 + (a.words[b2.length + j - 1] | 0);
          qj = Math.min(qj / bhi | 0, 67108863);
          a._ishlnsubmul(b2, qj, j);
          while (a.negative !== 0) {
            qj--;
            a.negative = 0;
            a._ishlnsubmul(b2, 1, j);
            if (!a.isZero()) {
              a.negative ^= 1;
            }
          }
          if (q) {
            q.words[j] = qj;
          }
        }
        if (q) {
          q.strip();
        }
        a.strip();
        if (mode !== "div" && shift !== 0) {
          a.iushrn(shift);
        }
        return {
          div: q || null,
          mod: a
        };
      };
      BN.prototype.divmod = function divmod(num, mode, positive) {
        assert(!num.isZero());
        if (this.isZero()) {
          return {
            div: new BN(0),
            mod: new BN(0)
          };
        }
        var div, mod, res;
        if (this.negative !== 0 && num.negative === 0) {
          res = this.neg().divmod(num, mode);
          if (mode !== "mod") {
            div = res.div.neg();
          }
          if (mode !== "div") {
            mod = res.mod.neg();
            if (positive && mod.negative !== 0) {
              mod.iadd(num);
            }
          }
          return {
            div,
            mod
          };
        }
        if (this.negative === 0 && num.negative !== 0) {
          res = this.divmod(num.neg(), mode);
          if (mode !== "mod") {
            div = res.div.neg();
          }
          return {
            div,
            mod: res.mod
          };
        }
        if ((this.negative & num.negative) !== 0) {
          res = this.neg().divmod(num.neg(), mode);
          if (mode !== "div") {
            mod = res.mod.neg();
            if (positive && mod.negative !== 0) {
              mod.isub(num);
            }
          }
          return {
            div: res.div,
            mod
          };
        }
        if (num.length > this.length || this.cmp(num) < 0) {
          return {
            div: new BN(0),
            mod: this
          };
        }
        if (num.length === 1) {
          if (mode === "div") {
            return {
              div: this.divn(num.words[0]),
              mod: null
            };
          }
          if (mode === "mod") {
            return {
              div: null,
              mod: new BN(this.modn(num.words[0]))
            };
          }
          return {
            div: this.divn(num.words[0]),
            mod: new BN(this.modn(num.words[0]))
          };
        }
        return this._wordDiv(num, mode);
      };
      BN.prototype.div = function div(num) {
        return this.divmod(num, "div", false).div;
      };
      BN.prototype.mod = function mod(num) {
        return this.divmod(num, "mod", false).mod;
      };
      BN.prototype.umod = function umod(num) {
        return this.divmod(num, "mod", true).mod;
      };
      BN.prototype.divRound = function divRound(num) {
        var dm = this.divmod(num);
        if (dm.mod.isZero()) return dm.div;
        var mod = dm.mod.abs();
        var half = num.abs().iushrn(1);
        var r2 = num.words[0] & 1;
        var cmp = mod.cmp(half);
        if (cmp < 0 || r2 === 1 && cmp === 0) return dm.div;
        var up = new BN(1);
        up.negative = this.negative ^ num.negative;
        return dm.div.iadd(up);
      };
      BN.prototype.modn = function modn(num) {
        assert(num <= 67108863);
        var p2 = (1 << 26) % num;
        var acc = 0;
        for (var i = this.length - 1; i >= 0; i--) {
          acc = (p2 * acc + (this.words[i] | 0)) % num;
        }
        return acc;
      };
      BN.prototype.idivn = function idivn(num) {
        assert(num <= 67108863);
        var carry = 0;
        for (var i = this.length - 1; i >= 0; i--) {
          var w2 = (this.words[i] | 0) + carry * 67108864;
          this.words[i] = w2 / num | 0;
          carry = w2 % num;
        }
        return this.strip();
      };
      BN.prototype.divn = function divn(num) {
        return this.clone().idivn(num);
      };
      BN.prototype.egcd = function egcd(p2) {
        assert(p2.negative === 0);
        assert(!p2.isZero());
        var x2 = this;
        var y = p2.clone();
        if (x2.negative !== 0) {
          x2 = x2.umod(p2);
        } else {
          x2 = x2.clone();
        }
        var A2 = new BN(1);
        var B = new BN(0);
        var C2 = new BN(0);
        var D2 = new BN(1);
        var g2 = 0;
        while (x2.isEven() && y.isEven()) {
          x2.iushrn(1);
          y.iushrn(1);
          ++g2;
        }
        var yp = y.clone();
        var xp = x2.clone();
        while (!x2.isZero()) {
          for (var i = 0, im = 1; (x2.words[0] & im) === 0 && i < 26; ++i, im <<= 1) ;
          if (i > 0) {
            x2.iushrn(i);
            while (i-- > 0) {
              if (A2.isOdd() || B.isOdd()) {
                A2.iadd(yp);
                B.isub(xp);
              }
              A2.iushrn(1);
              B.iushrn(1);
            }
          }
          for (var j = 0, jm = 1; (y.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1) ;
          if (j > 0) {
            y.iushrn(j);
            while (j-- > 0) {
              if (C2.isOdd() || D2.isOdd()) {
                C2.iadd(yp);
                D2.isub(xp);
              }
              C2.iushrn(1);
              D2.iushrn(1);
            }
          }
          if (x2.cmp(y) >= 0) {
            x2.isub(y);
            A2.isub(C2);
            B.isub(D2);
          } else {
            y.isub(x2);
            C2.isub(A2);
            D2.isub(B);
          }
        }
        return {
          a: C2,
          b: D2,
          gcd: y.iushln(g2)
        };
      };
      BN.prototype._invmp = function _invmp(p2) {
        assert(p2.negative === 0);
        assert(!p2.isZero());
        var a = this;
        var b2 = p2.clone();
        if (a.negative !== 0) {
          a = a.umod(p2);
        } else {
          a = a.clone();
        }
        var x1 = new BN(1);
        var x2 = new BN(0);
        var delta = b2.clone();
        while (a.cmpn(1) > 0 && b2.cmpn(1) > 0) {
          for (var i = 0, im = 1; (a.words[0] & im) === 0 && i < 26; ++i, im <<= 1) ;
          if (i > 0) {
            a.iushrn(i);
            while (i-- > 0) {
              if (x1.isOdd()) {
                x1.iadd(delta);
              }
              x1.iushrn(1);
            }
          }
          for (var j = 0, jm = 1; (b2.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1) ;
          if (j > 0) {
            b2.iushrn(j);
            while (j-- > 0) {
              if (x2.isOdd()) {
                x2.iadd(delta);
              }
              x2.iushrn(1);
            }
          }
          if (a.cmp(b2) >= 0) {
            a.isub(b2);
            x1.isub(x2);
          } else {
            b2.isub(a);
            x2.isub(x1);
          }
        }
        var res;
        if (a.cmpn(1) === 0) {
          res = x1;
        } else {
          res = x2;
        }
        if (res.cmpn(0) < 0) {
          res.iadd(p2);
        }
        return res;
      };
      BN.prototype.gcd = function gcd(num) {
        if (this.isZero()) return num.abs();
        if (num.isZero()) return this.abs();
        var a = this.clone();
        var b2 = num.clone();
        a.negative = 0;
        b2.negative = 0;
        for (var shift = 0; a.isEven() && b2.isEven(); shift++) {
          a.iushrn(1);
          b2.iushrn(1);
        }
        do {
          while (a.isEven()) {
            a.iushrn(1);
          }
          while (b2.isEven()) {
            b2.iushrn(1);
          }
          var r = a.cmp(b2);
          if (r < 0) {
            var t = a;
            a = b2;
            b2 = t;
          } else if (r === 0 || b2.cmpn(1) === 0) {
            break;
          }
          a.isub(b2);
        } while (true);
        return b2.iushln(shift);
      };
      BN.prototype.invm = function invm(num) {
        return this.egcd(num).a.umod(num);
      };
      BN.prototype.isEven = function isEven() {
        return (this.words[0] & 1) === 0;
      };
      BN.prototype.isOdd = function isOdd() {
        return (this.words[0] & 1) === 1;
      };
      BN.prototype.andln = function andln(num) {
        return this.words[0] & num;
      };
      BN.prototype.bincn = function bincn(bit) {
        assert(typeof bit === "number");
        var r = bit % 26;
        var s2 = (bit - r) / 26;
        var q = 1 << r;
        if (this.length <= s2) {
          this._expand(s2 + 1);
          this.words[s2] |= q;
          return this;
        }
        var carry = q;
        for (var i = s2; carry !== 0 && i < this.length; i++) {
          var w2 = this.words[i] | 0;
          w2 += carry;
          carry = w2 >>> 26;
          w2 &= 67108863;
          this.words[i] = w2;
        }
        if (carry !== 0) {
          this.words[i] = carry;
          this.length++;
        }
        return this;
      };
      BN.prototype.isZero = function isZero() {
        return this.length === 1 && this.words[0] === 0;
      };
      BN.prototype.cmpn = function cmpn(num) {
        var negative = num < 0;
        if (this.negative !== 0 && !negative) return -1;
        if (this.negative === 0 && negative) return 1;
        this.strip();
        var res;
        if (this.length > 1) {
          res = 1;
        } else {
          if (negative) {
            num = -num;
          }
          assert(num <= 67108863, "Number is too big");
          var w2 = this.words[0] | 0;
          res = w2 === num ? 0 : w2 < num ? -1 : 1;
        }
        if (this.negative !== 0) return -res | 0;
        return res;
      };
      BN.prototype.cmp = function cmp(num) {
        if (this.negative !== 0 && num.negative === 0) return -1;
        if (this.negative === 0 && num.negative !== 0) return 1;
        var res = this.ucmp(num);
        if (this.negative !== 0) return -res | 0;
        return res;
      };
      BN.prototype.ucmp = function ucmp(num) {
        if (this.length > num.length) return 1;
        if (this.length < num.length) return -1;
        var res = 0;
        for (var i = this.length - 1; i >= 0; i--) {
          var a = this.words[i] | 0;
          var b2 = num.words[i] | 0;
          if (a === b2) continue;
          if (a < b2) {
            res = -1;
          } else if (a > b2) {
            res = 1;
          }
          break;
        }
        return res;
      };
      BN.prototype.gtn = function gtn(num) {
        return this.cmpn(num) === 1;
      };
      BN.prototype.gt = function gt(num) {
        return this.cmp(num) === 1;
      };
      BN.prototype.gten = function gten(num) {
        return this.cmpn(num) >= 0;
      };
      BN.prototype.gte = function gte(num) {
        return this.cmp(num) >= 0;
      };
      BN.prototype.ltn = function ltn(num) {
        return this.cmpn(num) === -1;
      };
      BN.prototype.lt = function lt(num) {
        return this.cmp(num) === -1;
      };
      BN.prototype.lten = function lten(num) {
        return this.cmpn(num) <= 0;
      };
      BN.prototype.lte = function lte(num) {
        return this.cmp(num) <= 0;
      };
      BN.prototype.eqn = function eqn(num) {
        return this.cmpn(num) === 0;
      };
      BN.prototype.eq = function eq(num) {
        return this.cmp(num) === 0;
      };
      BN.red = function red(num) {
        return new Red(num);
      };
      BN.prototype.toRed = function toRed(ctx) {
        assert(!this.red, "Already a number in reduction context");
        assert(this.negative === 0, "red works only with positives");
        return ctx.convertTo(this)._forceRed(ctx);
      };
      BN.prototype.fromRed = function fromRed() {
        assert(this.red, "fromRed works only with numbers in reduction context");
        return this.red.convertFrom(this);
      };
      BN.prototype._forceRed = function _forceRed(ctx) {
        this.red = ctx;
        return this;
      };
      BN.prototype.forceRed = function forceRed(ctx) {
        assert(!this.red, "Already a number in reduction context");
        return this._forceRed(ctx);
      };
      BN.prototype.redAdd = function redAdd(num) {
        assert(this.red, "redAdd works only with red numbers");
        return this.red.add(this, num);
      };
      BN.prototype.redIAdd = function redIAdd(num) {
        assert(this.red, "redIAdd works only with red numbers");
        return this.red.iadd(this, num);
      };
      BN.prototype.redSub = function redSub(num) {
        assert(this.red, "redSub works only with red numbers");
        return this.red.sub(this, num);
      };
      BN.prototype.redISub = function redISub(num) {
        assert(this.red, "redISub works only with red numbers");
        return this.red.isub(this, num);
      };
      BN.prototype.redShl = function redShl(num) {
        assert(this.red, "redShl works only with red numbers");
        return this.red.shl(this, num);
      };
      BN.prototype.redMul = function redMul(num) {
        assert(this.red, "redMul works only with red numbers");
        this.red._verify2(this, num);
        return this.red.mul(this, num);
      };
      BN.prototype.redIMul = function redIMul(num) {
        assert(this.red, "redMul works only with red numbers");
        this.red._verify2(this, num);
        return this.red.imul(this, num);
      };
      BN.prototype.redSqr = function redSqr() {
        assert(this.red, "redSqr works only with red numbers");
        this.red._verify1(this);
        return this.red.sqr(this);
      };
      BN.prototype.redISqr = function redISqr() {
        assert(this.red, "redISqr works only with red numbers");
        this.red._verify1(this);
        return this.red.isqr(this);
      };
      BN.prototype.redSqrt = function redSqrt() {
        assert(this.red, "redSqrt works only with red numbers");
        this.red._verify1(this);
        return this.red.sqrt(this);
      };
      BN.prototype.redInvm = function redInvm() {
        assert(this.red, "redInvm works only with red numbers");
        this.red._verify1(this);
        return this.red.invm(this);
      };
      BN.prototype.redNeg = function redNeg() {
        assert(this.red, "redNeg works only with red numbers");
        this.red._verify1(this);
        return this.red.neg(this);
      };
      BN.prototype.redPow = function redPow(num) {
        assert(this.red && !num.red, "redPow(normalNum)");
        this.red._verify1(this);
        return this.red.pow(this, num);
      };
      var primes = {
        k256: null,
        p224: null,
        p192: null,
        p25519: null
      };
      function MPrime(name, p2) {
        this.name = name;
        this.p = new BN(p2, 16);
        this.n = this.p.bitLength();
        this.k = new BN(1).iushln(this.n).isub(this.p);
        this.tmp = this._tmp();
      }
      MPrime.prototype._tmp = function _tmp() {
        var tmp = new BN(null);
        tmp.words = new Array(Math.ceil(this.n / 13));
        return tmp;
      };
      MPrime.prototype.ireduce = function ireduce(num) {
        var r = num;
        var rlen;
        do {
          this.split(r, this.tmp);
          r = this.imulK(r);
          r = r.iadd(this.tmp);
          rlen = r.bitLength();
        } while (rlen > this.n);
        var cmp = rlen < this.n ? -1 : r.ucmp(this.p);
        if (cmp === 0) {
          r.words[0] = 0;
          r.length = 1;
        } else if (cmp > 0) {
          r.isub(this.p);
        } else {
          if (r.strip !== void 0) {
            r.strip();
          } else {
            r._strip();
          }
        }
        return r;
      };
      MPrime.prototype.split = function split(input, out) {
        input.iushrn(this.n, 0, out);
      };
      MPrime.prototype.imulK = function imulK(num) {
        return num.imul(this.k);
      };
      function K256() {
        MPrime.call(
          this,
          "k256",
          "ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f"
        );
      }
      inherits(K256, MPrime);
      K256.prototype.split = function split(input, output) {
        var mask = 4194303;
        var outLen = Math.min(input.length, 9);
        for (var i = 0; i < outLen; i++) {
          output.words[i] = input.words[i];
        }
        output.length = outLen;
        if (input.length <= 9) {
          input.words[0] = 0;
          input.length = 1;
          return;
        }
        var prev = input.words[9];
        output.words[output.length++] = prev & mask;
        for (i = 10; i < input.length; i++) {
          var next = input.words[i] | 0;
          input.words[i - 10] = (next & mask) << 4 | prev >>> 22;
          prev = next;
        }
        prev >>>= 22;
        input.words[i - 10] = prev;
        if (prev === 0 && input.length > 10) {
          input.length -= 10;
        } else {
          input.length -= 9;
        }
      };
      K256.prototype.imulK = function imulK(num) {
        num.words[num.length] = 0;
        num.words[num.length + 1] = 0;
        num.length += 2;
        var lo = 0;
        for (var i = 0; i < num.length; i++) {
          var w2 = num.words[i] | 0;
          lo += w2 * 977;
          num.words[i] = lo & 67108863;
          lo = w2 * 64 + (lo / 67108864 | 0);
        }
        if (num.words[num.length - 1] === 0) {
          num.length--;
          if (num.words[num.length - 1] === 0) {
            num.length--;
          }
        }
        return num;
      };
      function P224() {
        MPrime.call(
          this,
          "p224",
          "ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001"
        );
      }
      inherits(P224, MPrime);
      function P192() {
        MPrime.call(
          this,
          "p192",
          "ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff"
        );
      }
      inherits(P192, MPrime);
      function P25519() {
        MPrime.call(
          this,
          "25519",
          "7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed"
        );
      }
      inherits(P25519, MPrime);
      P25519.prototype.imulK = function imulK(num) {
        var carry = 0;
        for (var i = 0; i < num.length; i++) {
          var hi = (num.words[i] | 0) * 19 + carry;
          var lo = hi & 67108863;
          hi >>>= 26;
          num.words[i] = lo;
          carry = hi;
        }
        if (carry !== 0) {
          num.words[num.length++] = carry;
        }
        return num;
      };
      BN._prime = function prime(name) {
        if (primes[name]) return primes[name];
        var prime2;
        if (name === "k256") {
          prime2 = new K256();
        } else if (name === "p224") {
          prime2 = new P224();
        } else if (name === "p192") {
          prime2 = new P192();
        } else if (name === "p25519") {
          prime2 = new P25519();
        } else {
          throw new Error("Unknown prime " + name);
        }
        primes[name] = prime2;
        return prime2;
      };
      function Red(m2) {
        if (typeof m2 === "string") {
          var prime = BN._prime(m2);
          this.m = prime.p;
          this.prime = prime;
        } else {
          assert(m2.gtn(1), "modulus must be greater than 1");
          this.m = m2;
          this.prime = null;
        }
      }
      Red.prototype._verify1 = function _verify1(a) {
        assert(a.negative === 0, "red works only with positives");
        assert(a.red, "red works only with red numbers");
      };
      Red.prototype._verify2 = function _verify2(a, b2) {
        assert((a.negative | b2.negative) === 0, "red works only with positives");
        assert(
          a.red && a.red === b2.red,
          "red works only with red numbers"
        );
      };
      Red.prototype.imod = function imod(a) {
        if (this.prime) return this.prime.ireduce(a)._forceRed(this);
        return a.umod(this.m)._forceRed(this);
      };
      Red.prototype.neg = function neg(a) {
        if (a.isZero()) {
          return a.clone();
        }
        return this.m.sub(a)._forceRed(this);
      };
      Red.prototype.add = function add(a, b2) {
        this._verify2(a, b2);
        var res = a.add(b2);
        if (res.cmp(this.m) >= 0) {
          res.isub(this.m);
        }
        return res._forceRed(this);
      };
      Red.prototype.iadd = function iadd(a, b2) {
        this._verify2(a, b2);
        var res = a.iadd(b2);
        if (res.cmp(this.m) >= 0) {
          res.isub(this.m);
        }
        return res;
      };
      Red.prototype.sub = function sub(a, b2) {
        this._verify2(a, b2);
        var res = a.sub(b2);
        if (res.cmpn(0) < 0) {
          res.iadd(this.m);
        }
        return res._forceRed(this);
      };
      Red.prototype.isub = function isub(a, b2) {
        this._verify2(a, b2);
        var res = a.isub(b2);
        if (res.cmpn(0) < 0) {
          res.iadd(this.m);
        }
        return res;
      };
      Red.prototype.shl = function shl(a, num) {
        this._verify1(a);
        return this.imod(a.ushln(num));
      };
      Red.prototype.imul = function imul(a, b2) {
        this._verify2(a, b2);
        return this.imod(a.imul(b2));
      };
      Red.prototype.mul = function mul(a, b2) {
        this._verify2(a, b2);
        return this.imod(a.mul(b2));
      };
      Red.prototype.isqr = function isqr(a) {
        return this.imul(a, a.clone());
      };
      Red.prototype.sqr = function sqr(a) {
        return this.mul(a, a);
      };
      Red.prototype.sqrt = function sqrt(a) {
        if (a.isZero()) return a.clone();
        var mod3 = this.m.andln(3);
        assert(mod3 % 2 === 1);
        if (mod3 === 3) {
          var pow = this.m.add(new BN(1)).iushrn(2);
          return this.pow(a, pow);
        }
        var q = this.m.subn(1);
        var s2 = 0;
        while (!q.isZero() && q.andln(1) === 0) {
          s2++;
          q.iushrn(1);
        }
        assert(!q.isZero());
        var one = new BN(1).toRed(this);
        var nOne = one.redNeg();
        var lpow = this.m.subn(1).iushrn(1);
        var z = this.m.bitLength();
        z = new BN(2 * z * z).toRed(this);
        while (this.pow(z, lpow).cmp(nOne) !== 0) {
          z.redIAdd(nOne);
        }
        var c = this.pow(z, q);
        var r = this.pow(a, q.addn(1).iushrn(1));
        var t = this.pow(a, q);
        var m2 = s2;
        while (t.cmp(one) !== 0) {
          var tmp = t;
          for (var i = 0; tmp.cmp(one) !== 0; i++) {
            tmp = tmp.redSqr();
          }
          assert(i < m2);
          var b2 = this.pow(c, new BN(1).iushln(m2 - i - 1));
          r = r.redMul(b2);
          c = b2.redSqr();
          t = t.redMul(c);
          m2 = i;
        }
        return r;
      };
      Red.prototype.invm = function invm(a) {
        var inv = a._invmp(this.m);
        if (inv.negative !== 0) {
          inv.negative = 0;
          return this.imod(inv).redNeg();
        } else {
          return this.imod(inv);
        }
      };
      Red.prototype.pow = function pow(a, num) {
        if (num.isZero()) return new BN(1).toRed(this);
        if (num.cmpn(1) === 0) return a.clone();
        var windowSize = 4;
        var wnd = new Array(1 << windowSize);
        wnd[0] = new BN(1).toRed(this);
        wnd[1] = a;
        for (var i = 2; i < wnd.length; i++) {
          wnd[i] = this.mul(wnd[i - 1], a);
        }
        var res = wnd[0];
        var current = 0;
        var currentLen = 0;
        var start = num.bitLength() % 26;
        if (start === 0) {
          start = 26;
        }
        for (i = num.length - 1; i >= 0; i--) {
          var word = num.words[i];
          for (var j = start - 1; j >= 0; j--) {
            var bit = word >> j & 1;
            if (res !== wnd[0]) {
              res = this.sqr(res);
            }
            if (bit === 0 && current === 0) {
              currentLen = 0;
              continue;
            }
            current <<= 1;
            current |= bit;
            currentLen++;
            if (currentLen !== windowSize && (i !== 0 || j !== 0)) continue;
            res = this.mul(res, wnd[current]);
            currentLen = 0;
            current = 0;
          }
          start = 26;
        }
        return res;
      };
      Red.prototype.convertTo = function convertTo(num) {
        var r = num.umod(this.m);
        return r === num ? r.clone() : r;
      };
      Red.prototype.convertFrom = function convertFrom(num) {
        var res = num.clone();
        res.red = null;
        return res;
      };
      BN.mont = function mont(num) {
        return new Mont(num);
      };
      function Mont(m2) {
        Red.call(this, m2);
        this.shift = this.m.bitLength();
        if (this.shift % 26 !== 0) {
          this.shift += 26 - this.shift % 26;
        }
        this.r = new BN(1).iushln(this.shift);
        this.r2 = this.imod(this.r.sqr());
        this.rinv = this.r._invmp(this.m);
        this.minv = this.rinv.mul(this.r).isubn(1).div(this.m);
        this.minv = this.minv.umod(this.r);
        this.minv = this.r.sub(this.minv);
      }
      inherits(Mont, Red);
      Mont.prototype.convertTo = function convertTo(num) {
        return this.imod(num.ushln(this.shift));
      };
      Mont.prototype.convertFrom = function convertFrom(num) {
        var r = this.imod(num.mul(this.rinv));
        r.red = null;
        return r;
      };
      Mont.prototype.imul = function imul(a, b2) {
        if (a.isZero() || b2.isZero()) {
          a.words[0] = 0;
          a.length = 1;
          return a;
        }
        var t = a.imul(b2);
        var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
        var u = t.isub(c).iushrn(this.shift);
        var res = u;
        if (u.cmp(this.m) >= 0) {
          res = u.isub(this.m);
        } else if (u.cmpn(0) < 0) {
          res = u.iadd(this.m);
        }
        return res._forceRed(this);
      };
      Mont.prototype.mul = function mul(a, b2) {
        if (a.isZero() || b2.isZero()) return new BN(0)._forceRed(this);
        var t = a.mul(b2);
        var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
        var u = t.isub(c).iushrn(this.shift);
        var res = u;
        if (u.cmp(this.m) >= 0) {
          res = u.isub(this.m);
        } else if (u.cmpn(0) < 0) {
          res = u.iadd(this.m);
        }
        return res._forceRed(this);
      };
      Mont.prototype.invm = function invm(a) {
        var res = this.imod(a._invmp(this.m).mul(this.r2));
        return res._forceRed(this);
      };
    })(typeof module === "undefined" || module, exports);
  }
});

// node_modules/inherits/inherits_browser.js
var require_inherits_browser = __commonJS({
  "node_modules/inherits/inherits_browser.js"(exports, module) {
    if (typeof Object.create === "function") {
      module.exports = function inherits(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          ctor.prototype = Object.create(superCtor.prototype, {
            constructor: {
              value: ctor,
              enumerable: false,
              writable: true,
              configurable: true
            }
          });
        }
      };
    } else {
      module.exports = function inherits(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          var TempCtor = function() {
          };
          TempCtor.prototype = superCtor.prototype;
          ctor.prototype = new TempCtor();
          ctor.prototype.constructor = ctor;
        }
      };
    }
  }
});

// node_modules/inherits/inherits.js
var require_inherits = __commonJS({
  "node_modules/inherits/inherits.js"(exports, module) {
    try {
      util = __require("util");
      if (typeof util.inherits !== "function") throw "";
      module.exports = util.inherits;
    } catch (e) {
      module.exports = require_inherits_browser();
    }
    var util;
  }
});

// node_modules/safer-buffer/safer.js
var require_safer = __commonJS({
  "node_modules/safer-buffer/safer.js"(exports, module) {
    "use strict";
    var buffer = __require("buffer");
    var Buffer2 = buffer.Buffer;
    var safer = {};
    var key;
    for (key in buffer) {
      if (!buffer.hasOwnProperty(key)) continue;
      if (key === "SlowBuffer" || key === "Buffer") continue;
      safer[key] = buffer[key];
    }
    var Safer = safer.Buffer = {};
    for (key in Buffer2) {
      if (!Buffer2.hasOwnProperty(key)) continue;
      if (key === "allocUnsafe" || key === "allocUnsafeSlow") continue;
      Safer[key] = Buffer2[key];
    }
    safer.Buffer.prototype = Buffer2.prototype;
    if (!Safer.from || Safer.from === Uint8Array.from) {
      Safer.from = function(value, encodingOrOffset, length) {
        if (typeof value === "number") {
          throw new TypeError('The "value" argument must not be of type number. Received type ' + typeof value);
        }
        if (value && typeof value.length === "undefined") {
          throw new TypeError("The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value);
        }
        return Buffer2(value, encodingOrOffset, length);
      };
    }
    if (!Safer.alloc) {
      Safer.alloc = function(size, fill, encoding) {
        if (typeof size !== "number") {
          throw new TypeError('The "size" argument must be of type number. Received type ' + typeof size);
        }
        if (size < 0 || size >= 2 * (1 << 30)) {
          throw new RangeError('The value "' + size + '" is invalid for option "size"');
        }
        var buf = Buffer2(size);
        if (!fill || fill.length === 0) {
          buf.fill(0);
        } else if (typeof encoding === "string") {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
        return buf;
      };
    }
    if (!safer.kStringMaxLength) {
      try {
        safer.kStringMaxLength = process.binding("buffer").kStringMaxLength;
      } catch (e) {
      }
    }
    if (!safer.constants) {
      safer.constants = {
        MAX_LENGTH: safer.kMaxLength
      };
      if (safer.kStringMaxLength) {
        safer.constants.MAX_STRING_LENGTH = safer.kStringMaxLength;
      }
    }
    module.exports = safer;
  }
});

// node_modules/asn1.js/lib/asn1/base/reporter.js
var require_reporter = __commonJS({
  "node_modules/asn1.js/lib/asn1/base/reporter.js"(exports) {
    "use strict";
    var inherits = require_inherits();
    function Reporter(options) {
      this._reporterState = {
        obj: null,
        path: [],
        options: options || {},
        errors: []
      };
    }
    exports.Reporter = Reporter;
    Reporter.prototype.isError = function isError(obj2) {
      return obj2 instanceof ReporterError;
    };
    Reporter.prototype.save = function save() {
      const state = this._reporterState;
      return { obj: state.obj, pathLen: state.path.length };
    };
    Reporter.prototype.restore = function restore(data) {
      const state = this._reporterState;
      state.obj = data.obj;
      state.path = state.path.slice(0, data.pathLen);
    };
    Reporter.prototype.enterKey = function enterKey(key) {
      return this._reporterState.path.push(key);
    };
    Reporter.prototype.exitKey = function exitKey(index) {
      const state = this._reporterState;
      state.path = state.path.slice(0, index - 1);
    };
    Reporter.prototype.leaveKey = function leaveKey(index, key, value) {
      const state = this._reporterState;
      this.exitKey(index);
      if (state.obj !== null)
        state.obj[key] = value;
    };
    Reporter.prototype.path = function path() {
      return this._reporterState.path.join("/");
    };
    Reporter.prototype.enterObject = function enterObject() {
      const state = this._reporterState;
      const prev = state.obj;
      state.obj = {};
      return prev;
    };
    Reporter.prototype.leaveObject = function leaveObject(prev) {
      const state = this._reporterState;
      const now = state.obj;
      state.obj = prev;
      return now;
    };
    Reporter.prototype.error = function error(msg) {
      let err;
      const state = this._reporterState;
      const inherited = msg instanceof ReporterError;
      if (inherited) {
        err = msg;
      } else {
        err = new ReporterError(state.path.map(function(elem) {
          return "[" + JSON.stringify(elem) + "]";
        }).join(""), msg.message || msg, msg.stack);
      }
      if (!state.options.partial)
        throw err;
      if (!inherited)
        state.errors.push(err);
      return err;
    };
    Reporter.prototype.wrapResult = function wrapResult(result) {
      const state = this._reporterState;
      if (!state.options.partial)
        return result;
      return {
        result: this.isError(result) ? null : result,
        errors: state.errors
      };
    };
    function ReporterError(path, msg) {
      this.path = path;
      this.rethrow(msg);
    }
    inherits(ReporterError, Error);
    ReporterError.prototype.rethrow = function rethrow(msg) {
      this.message = msg + " at: " + (this.path || "(shallow)");
      if (Error.captureStackTrace)
        Error.captureStackTrace(this, ReporterError);
      if (!this.stack) {
        try {
          throw new Error(this.message);
        } catch (e) {
          this.stack = e.stack;
        }
      }
      return this;
    };
  }
});

// node_modules/asn1.js/lib/asn1/base/buffer.js
var require_buffer = __commonJS({
  "node_modules/asn1.js/lib/asn1/base/buffer.js"(exports) {
    "use strict";
    var inherits = require_inherits();
    var Reporter = require_reporter().Reporter;
    var Buffer2 = require_safer().Buffer;
    function DecoderBuffer(base, options) {
      Reporter.call(this, options);
      if (!Buffer2.isBuffer(base)) {
        this.error("Input not Buffer");
        return;
      }
      this.base = base;
      this.offset = 0;
      this.length = base.length;
    }
    inherits(DecoderBuffer, Reporter);
    exports.DecoderBuffer = DecoderBuffer;
    DecoderBuffer.isDecoderBuffer = function isDecoderBuffer(data) {
      if (data instanceof DecoderBuffer) {
        return true;
      }
      const isCompatible = typeof data === "object" && Buffer2.isBuffer(data.base) && data.constructor.name === "DecoderBuffer" && typeof data.offset === "number" && typeof data.length === "number" && typeof data.save === "function" && typeof data.restore === "function" && typeof data.isEmpty === "function" && typeof data.readUInt8 === "function" && typeof data.skip === "function" && typeof data.raw === "function";
      return isCompatible;
    };
    DecoderBuffer.prototype.save = function save() {
      return { offset: this.offset, reporter: Reporter.prototype.save.call(this) };
    };
    DecoderBuffer.prototype.restore = function restore(save) {
      const res = new DecoderBuffer(this.base);
      res.offset = save.offset;
      res.length = this.offset;
      this.offset = save.offset;
      Reporter.prototype.restore.call(this, save.reporter);
      return res;
    };
    DecoderBuffer.prototype.isEmpty = function isEmpty() {
      return this.offset === this.length;
    };
    DecoderBuffer.prototype.readUInt8 = function readUInt8(fail) {
      if (this.offset + 1 <= this.length)
        return this.base.readUInt8(this.offset++, true);
      else
        return this.error(fail || "DecoderBuffer overrun");
    };
    DecoderBuffer.prototype.skip = function skip(bytes, fail) {
      if (!(this.offset + bytes <= this.length))
        return this.error(fail || "DecoderBuffer overrun");
      const res = new DecoderBuffer(this.base);
      res._reporterState = this._reporterState;
      res.offset = this.offset;
      res.length = this.offset + bytes;
      this.offset += bytes;
      return res;
    };
    DecoderBuffer.prototype.raw = function raw(save) {
      return this.base.slice(save ? save.offset : this.offset, this.length);
    };
    function EncoderBuffer(value, reporter) {
      if (Array.isArray(value)) {
        this.length = 0;
        this.value = value.map(function(item) {
          if (!EncoderBuffer.isEncoderBuffer(item))
            item = new EncoderBuffer(item, reporter);
          this.length += item.length;
          return item;
        }, this);
      } else if (typeof value === "number") {
        if (!(0 <= value && value <= 255))
          return reporter.error("non-byte EncoderBuffer value");
        this.value = value;
        this.length = 1;
      } else if (typeof value === "string") {
        this.value = value;
        this.length = Buffer2.byteLength(value);
      } else if (Buffer2.isBuffer(value)) {
        this.value = value;
        this.length = value.length;
      } else {
        return reporter.error("Unsupported type: " + typeof value);
      }
    }
    exports.EncoderBuffer = EncoderBuffer;
    EncoderBuffer.isEncoderBuffer = function isEncoderBuffer(data) {
      if (data instanceof EncoderBuffer) {
        return true;
      }
      const isCompatible = typeof data === "object" && data.constructor.name === "EncoderBuffer" && typeof data.length === "number" && typeof data.join === "function";
      return isCompatible;
    };
    EncoderBuffer.prototype.join = function join18(out, offset) {
      if (!out)
        out = Buffer2.alloc(this.length);
      if (!offset)
        offset = 0;
      if (this.length === 0)
        return out;
      if (Array.isArray(this.value)) {
        this.value.forEach(function(item) {
          item.join(out, offset);
          offset += item.length;
        });
      } else {
        if (typeof this.value === "number")
          out[offset] = this.value;
        else if (typeof this.value === "string")
          out.write(this.value, offset);
        else if (Buffer2.isBuffer(this.value))
          this.value.copy(out, offset);
        offset += this.length;
      }
      return out;
    };
  }
});

// node_modules/minimalistic-assert/index.js
var require_minimalistic_assert = __commonJS({
  "node_modules/minimalistic-assert/index.js"(exports, module) {
    module.exports = assert;
    function assert(val, msg) {
      if (!val)
        throw new Error(msg || "Assertion failed");
    }
    assert.equal = function assertEqual(l, r, msg) {
      if (l != r)
        throw new Error(msg || "Assertion failed: " + l + " != " + r);
    };
  }
});

// node_modules/asn1.js/lib/asn1/base/node.js
var require_node = __commonJS({
  "node_modules/asn1.js/lib/asn1/base/node.js"(exports, module) {
    "use strict";
    var Reporter = require_reporter().Reporter;
    var EncoderBuffer = require_buffer().EncoderBuffer;
    var DecoderBuffer = require_buffer().DecoderBuffer;
    var assert = require_minimalistic_assert();
    var tags = [
      "seq",
      "seqof",
      "set",
      "setof",
      "objid",
      "bool",
      "gentime",
      "utctime",
      "null_",
      "enum",
      "int",
      "objDesc",
      "bitstr",
      "bmpstr",
      "charstr",
      "genstr",
      "graphstr",
      "ia5str",
      "iso646str",
      "numstr",
      "octstr",
      "printstr",
      "t61str",
      "unistr",
      "utf8str",
      "videostr"
    ];
    var methods = [
      "key",
      "obj",
      "use",
      "optional",
      "explicit",
      "implicit",
      "def",
      "choice",
      "any",
      "contains"
    ].concat(tags);
    var overrided = [
      "_peekTag",
      "_decodeTag",
      "_use",
      "_decodeStr",
      "_decodeObjid",
      "_decodeTime",
      "_decodeNull",
      "_decodeInt",
      "_decodeBool",
      "_decodeList",
      "_encodeComposite",
      "_encodeStr",
      "_encodeObjid",
      "_encodeTime",
      "_encodeNull",
      "_encodeInt",
      "_encodeBool"
    ];
    function Node(enc, parent, name) {
      const state = {};
      this._baseState = state;
      state.name = name;
      state.enc = enc;
      state.parent = parent || null;
      state.children = null;
      state.tag = null;
      state.args = null;
      state.reverseArgs = null;
      state.choice = null;
      state.optional = false;
      state.any = false;
      state.obj = false;
      state.use = null;
      state.useDecoder = null;
      state.key = null;
      state["default"] = null;
      state.explicit = null;
      state.implicit = null;
      state.contains = null;
      if (!state.parent) {
        state.children = [];
        this._wrap();
      }
    }
    module.exports = Node;
    var stateProps = [
      "enc",
      "parent",
      "children",
      "tag",
      "args",
      "reverseArgs",
      "choice",
      "optional",
      "any",
      "obj",
      "use",
      "alteredUse",
      "key",
      "default",
      "explicit",
      "implicit",
      "contains"
    ];
    Node.prototype.clone = function clone() {
      const state = this._baseState;
      const cstate = {};
      stateProps.forEach(function(prop) {
        cstate[prop] = state[prop];
      });
      const res = new this.constructor(cstate.parent);
      res._baseState = cstate;
      return res;
    };
    Node.prototype._wrap = function wrap() {
      const state = this._baseState;
      methods.forEach(function(method) {
        this[method] = function _wrappedMethod() {
          const clone = new this.constructor(this);
          state.children.push(clone);
          return clone[method].apply(clone, arguments);
        };
      }, this);
    };
    Node.prototype._init = function init(body) {
      const state = this._baseState;
      assert(state.parent === null);
      body.call(this);
      state.children = state.children.filter(function(child) {
        return child._baseState.parent === this;
      }, this);
      assert.equal(state.children.length, 1, "Root node can have only one child");
    };
    Node.prototype._useArgs = function useArgs(args) {
      const state = this._baseState;
      const children = args.filter(function(arg) {
        return arg instanceof this.constructor;
      }, this);
      args = args.filter(function(arg) {
        return !(arg instanceof this.constructor);
      }, this);
      if (children.length !== 0) {
        assert(state.children === null);
        state.children = children;
        children.forEach(function(child) {
          child._baseState.parent = this;
        }, this);
      }
      if (args.length !== 0) {
        assert(state.args === null);
        state.args = args;
        state.reverseArgs = args.map(function(arg) {
          if (typeof arg !== "object" || arg.constructor !== Object)
            return arg;
          const res = {};
          Object.keys(arg).forEach(function(key) {
            if (key == (key | 0))
              key |= 0;
            const value = arg[key];
            res[value] = key;
          });
          return res;
        });
      }
    };
    overrided.forEach(function(method) {
      Node.prototype[method] = function _overrided() {
        const state = this._baseState;
        throw new Error(method + " not implemented for encoding: " + state.enc);
      };
    });
    tags.forEach(function(tag) {
      Node.prototype[tag] = function _tagMethod() {
        const state = this._baseState;
        const args = Array.prototype.slice.call(arguments);
        assert(state.tag === null);
        state.tag = tag;
        this._useArgs(args);
        return this;
      };
    });
    Node.prototype.use = function use(item) {
      assert(item);
      const state = this._baseState;
      assert(state.use === null);
      state.use = item;
      return this;
    };
    Node.prototype.optional = function optional() {
      const state = this._baseState;
      state.optional = true;
      return this;
    };
    Node.prototype.def = function def(val) {
      const state = this._baseState;
      assert(state["default"] === null);
      state["default"] = val;
      state.optional = true;
      return this;
    };
    Node.prototype.explicit = function explicit(num) {
      const state = this._baseState;
      assert(state.explicit === null && state.implicit === null);
      state.explicit = num;
      return this;
    };
    Node.prototype.implicit = function implicit(num) {
      const state = this._baseState;
      assert(state.explicit === null && state.implicit === null);
      state.implicit = num;
      return this;
    };
    Node.prototype.obj = function obj2() {
      const state = this._baseState;
      const args = Array.prototype.slice.call(arguments);
      state.obj = true;
      if (args.length !== 0)
        this._useArgs(args);
      return this;
    };
    Node.prototype.key = function key(newKey) {
      const state = this._baseState;
      assert(state.key === null);
      state.key = newKey;
      return this;
    };
    Node.prototype.any = function any() {
      const state = this._baseState;
      state.any = true;
      return this;
    };
    Node.prototype.choice = function choice(obj2) {
      const state = this._baseState;
      assert(state.choice === null);
      state.choice = obj2;
      this._useArgs(Object.keys(obj2).map(function(key) {
        return obj2[key];
      }));
      return this;
    };
    Node.prototype.contains = function contains(item) {
      const state = this._baseState;
      assert(state.use === null);
      state.contains = item;
      return this;
    };
    Node.prototype._decode = function decode(input, options) {
      const state = this._baseState;
      if (state.parent === null)
        return input.wrapResult(state.children[0]._decode(input, options));
      let result = state["default"];
      let present = true;
      let prevKey = null;
      if (state.key !== null)
        prevKey = input.enterKey(state.key);
      if (state.optional) {
        let tag = null;
        if (state.explicit !== null)
          tag = state.explicit;
        else if (state.implicit !== null)
          tag = state.implicit;
        else if (state.tag !== null)
          tag = state.tag;
        if (tag === null && !state.any) {
          const save = input.save();
          try {
            if (state.choice === null)
              this._decodeGeneric(state.tag, input, options);
            else
              this._decodeChoice(input, options);
            present = true;
          } catch (e) {
            present = false;
          }
          input.restore(save);
        } else {
          present = this._peekTag(input, tag, state.any);
          if (input.isError(present))
            return present;
        }
      }
      let prevObj;
      if (state.obj && present)
        prevObj = input.enterObject();
      if (present) {
        if (state.explicit !== null) {
          const explicit = this._decodeTag(input, state.explicit);
          if (input.isError(explicit))
            return explicit;
          input = explicit;
        }
        const start = input.offset;
        if (state.use === null && state.choice === null) {
          let save;
          if (state.any)
            save = input.save();
          const body = this._decodeTag(
            input,
            state.implicit !== null ? state.implicit : state.tag,
            state.any
          );
          if (input.isError(body))
            return body;
          if (state.any)
            result = input.raw(save);
          else
            input = body;
        }
        if (options && options.track && state.tag !== null)
          options.track(input.path(), start, input.length, "tagged");
        if (options && options.track && state.tag !== null)
          options.track(input.path(), input.offset, input.length, "content");
        if (state.any) {
        } else if (state.choice === null) {
          result = this._decodeGeneric(state.tag, input, options);
        } else {
          result = this._decodeChoice(input, options);
        }
        if (input.isError(result))
          return result;
        if (!state.any && state.choice === null && state.children !== null) {
          state.children.forEach(function decodeChildren(child) {
            child._decode(input, options);
          });
        }
        if (state.contains && (state.tag === "octstr" || state.tag === "bitstr")) {
          const data = new DecoderBuffer(result);
          result = this._getUse(state.contains, input._reporterState.obj)._decode(data, options);
        }
      }
      if (state.obj && present)
        result = input.leaveObject(prevObj);
      if (state.key !== null && (result !== null || present === true))
        input.leaveKey(prevKey, state.key, result);
      else if (prevKey !== null)
        input.exitKey(prevKey);
      return result;
    };
    Node.prototype._decodeGeneric = function decodeGeneric(tag, input, options) {
      const state = this._baseState;
      if (tag === "seq" || tag === "set")
        return null;
      if (tag === "seqof" || tag === "setof")
        return this._decodeList(input, tag, state.args[0], options);
      else if (/str$/.test(tag))
        return this._decodeStr(input, tag, options);
      else if (tag === "objid" && state.args)
        return this._decodeObjid(input, state.args[0], state.args[1], options);
      else if (tag === "objid")
        return this._decodeObjid(input, null, null, options);
      else if (tag === "gentime" || tag === "utctime")
        return this._decodeTime(input, tag, options);
      else if (tag === "null_")
        return this._decodeNull(input, options);
      else if (tag === "bool")
        return this._decodeBool(input, options);
      else if (tag === "objDesc")
        return this._decodeStr(input, tag, options);
      else if (tag === "int" || tag === "enum")
        return this._decodeInt(input, state.args && state.args[0], options);
      if (state.use !== null) {
        return this._getUse(state.use, input._reporterState.obj)._decode(input, options);
      } else {
        return input.error("unknown tag: " + tag);
      }
    };
    Node.prototype._getUse = function _getUse(entity, obj2) {
      const state = this._baseState;
      state.useDecoder = this._use(entity, obj2);
      assert(state.useDecoder._baseState.parent === null);
      state.useDecoder = state.useDecoder._baseState.children[0];
      if (state.implicit !== state.useDecoder._baseState.implicit) {
        state.useDecoder = state.useDecoder.clone();
        state.useDecoder._baseState.implicit = state.implicit;
      }
      return state.useDecoder;
    };
    Node.prototype._decodeChoice = function decodeChoice(input, options) {
      const state = this._baseState;
      let result = null;
      let match = false;
      Object.keys(state.choice).some(function(key) {
        const save = input.save();
        const node = state.choice[key];
        try {
          const value = node._decode(input, options);
          if (input.isError(value))
            return false;
          result = { type: key, value };
          match = true;
        } catch (e) {
          input.restore(save);
          return false;
        }
        return true;
      }, this);
      if (!match)
        return input.error("Choice not matched");
      return result;
    };
    Node.prototype._createEncoderBuffer = function createEncoderBuffer(data) {
      return new EncoderBuffer(data, this.reporter);
    };
    Node.prototype._encode = function encode(data, reporter, parent) {
      const state = this._baseState;
      if (state["default"] !== null && state["default"] === data)
        return;
      const result = this._encodeValue(data, reporter, parent);
      if (result === void 0)
        return;
      if (this._skipDefault(result, reporter, parent))
        return;
      return result;
    };
    Node.prototype._encodeValue = function encode(data, reporter, parent) {
      const state = this._baseState;
      if (state.parent === null)
        return state.children[0]._encode(data, reporter || new Reporter());
      let result = null;
      this.reporter = reporter;
      if (state.optional && data === void 0) {
        if (state["default"] !== null)
          data = state["default"];
        else
          return;
      }
      let content = null;
      let primitive = false;
      if (state.any) {
        result = this._createEncoderBuffer(data);
      } else if (state.choice) {
        result = this._encodeChoice(data, reporter);
      } else if (state.contains) {
        content = this._getUse(state.contains, parent)._encode(data, reporter);
        primitive = true;
      } else if (state.children) {
        content = state.children.map(function(child) {
          if (child._baseState.tag === "null_")
            return child._encode(null, reporter, data);
          if (child._baseState.key === null)
            return reporter.error("Child should have a key");
          const prevKey = reporter.enterKey(child._baseState.key);
          if (typeof data !== "object")
            return reporter.error("Child expected, but input is not object");
          const res = child._encode(data[child._baseState.key], reporter, data);
          reporter.leaveKey(prevKey);
          return res;
        }, this).filter(function(child) {
          return child;
        });
        content = this._createEncoderBuffer(content);
      } else {
        if (state.tag === "seqof" || state.tag === "setof") {
          if (!(state.args && state.args.length === 1))
            return reporter.error("Too many args for : " + state.tag);
          if (!Array.isArray(data))
            return reporter.error("seqof/setof, but data is not Array");
          const child = this.clone();
          child._baseState.implicit = null;
          content = this._createEncoderBuffer(data.map(function(item) {
            const state2 = this._baseState;
            return this._getUse(state2.args[0], data)._encode(item, reporter);
          }, child));
        } else if (state.use !== null) {
          result = this._getUse(state.use, parent)._encode(data, reporter);
        } else {
          content = this._encodePrimitive(state.tag, data);
          primitive = true;
        }
      }
      if (!state.any && state.choice === null) {
        const tag = state.implicit !== null ? state.implicit : state.tag;
        const cls = state.implicit === null ? "universal" : "context";
        if (tag === null) {
          if (state.use === null)
            reporter.error("Tag could be omitted only for .use()");
        } else {
          if (state.use === null)
            result = this._encodeComposite(tag, primitive, cls, content);
        }
      }
      if (state.explicit !== null)
        result = this._encodeComposite(state.explicit, false, "context", result);
      return result;
    };
    Node.prototype._encodeChoice = function encodeChoice(data, reporter) {
      const state = this._baseState;
      const node = state.choice[data.type];
      if (!node) {
        assert(
          false,
          data.type + " not found in " + JSON.stringify(Object.keys(state.choice))
        );
      }
      return node._encode(data.value, reporter);
    };
    Node.prototype._encodePrimitive = function encodePrimitive(tag, data) {
      const state = this._baseState;
      if (/str$/.test(tag))
        return this._encodeStr(data, tag);
      else if (tag === "objid" && state.args)
        return this._encodeObjid(data, state.reverseArgs[0], state.args[1]);
      else if (tag === "objid")
        return this._encodeObjid(data, null, null);
      else if (tag === "gentime" || tag === "utctime")
        return this._encodeTime(data, tag);
      else if (tag === "null_")
        return this._encodeNull();
      else if (tag === "int" || tag === "enum")
        return this._encodeInt(data, state.args && state.reverseArgs[0]);
      else if (tag === "bool")
        return this._encodeBool(data);
      else if (tag === "objDesc")
        return this._encodeStr(data, tag);
      else
        throw new Error("Unsupported tag: " + tag);
    };
    Node.prototype._isNumstr = function isNumstr(str2) {
      return /^[0-9 ]*$/.test(str2);
    };
    Node.prototype._isPrintstr = function isPrintstr(str2) {
      return /^[A-Za-z0-9 '()+,-./:=?]*$/.test(str2);
    };
  }
});

// node_modules/asn1.js/lib/asn1/constants/der.js
var require_der = __commonJS({
  "node_modules/asn1.js/lib/asn1/constants/der.js"(exports) {
    "use strict";
    function reverse(map) {
      const res = {};
      Object.keys(map).forEach(function(key) {
        if ((key | 0) == key)
          key = key | 0;
        const value = map[key];
        res[value] = key;
      });
      return res;
    }
    exports.tagClass = {
      0: "universal",
      1: "application",
      2: "context",
      3: "private"
    };
    exports.tagClassByName = reverse(exports.tagClass);
    exports.tag = {
      0: "end",
      1: "bool",
      2: "int",
      3: "bitstr",
      4: "octstr",
      5: "null_",
      6: "objid",
      7: "objDesc",
      8: "external",
      9: "real",
      10: "enum",
      11: "embed",
      12: "utf8str",
      13: "relativeOid",
      16: "seq",
      17: "set",
      18: "numstr",
      19: "printstr",
      20: "t61str",
      21: "videostr",
      22: "ia5str",
      23: "utctime",
      24: "gentime",
      25: "graphstr",
      26: "iso646str",
      27: "genstr",
      28: "unistr",
      29: "charstr",
      30: "bmpstr"
    };
    exports.tagByName = reverse(exports.tag);
  }
});

// node_modules/asn1.js/lib/asn1/encoders/der.js
var require_der2 = __commonJS({
  "node_modules/asn1.js/lib/asn1/encoders/der.js"(exports, module) {
    "use strict";
    var inherits = require_inherits();
    var Buffer2 = require_safer().Buffer;
    var Node = require_node();
    var der = require_der();
    function DEREncoder(entity) {
      this.enc = "der";
      this.name = entity.name;
      this.entity = entity;
      this.tree = new DERNode();
      this.tree._init(entity.body);
    }
    module.exports = DEREncoder;
    DEREncoder.prototype.encode = function encode(data, reporter) {
      return this.tree._encode(data, reporter).join();
    };
    function DERNode(parent) {
      Node.call(this, "der", parent);
    }
    inherits(DERNode, Node);
    DERNode.prototype._encodeComposite = function encodeComposite(tag, primitive, cls, content) {
      const encodedTag = encodeTag(tag, primitive, cls, this.reporter);
      if (content.length < 128) {
        const header2 = Buffer2.alloc(2);
        header2[0] = encodedTag;
        header2[1] = content.length;
        return this._createEncoderBuffer([header2, content]);
      }
      let lenOctets = 1;
      for (let i = content.length; i >= 256; i >>= 8)
        lenOctets++;
      const header = Buffer2.alloc(1 + 1 + lenOctets);
      header[0] = encodedTag;
      header[1] = 128 | lenOctets;
      for (let i = 1 + lenOctets, j = content.length; j > 0; i--, j >>= 8)
        header[i] = j & 255;
      return this._createEncoderBuffer([header, content]);
    };
    DERNode.prototype._encodeStr = function encodeStr(str2, tag) {
      if (tag === "bitstr") {
        return this._createEncoderBuffer([str2.unused | 0, str2.data]);
      } else if (tag === "bmpstr") {
        const buf = Buffer2.alloc(str2.length * 2);
        for (let i = 0; i < str2.length; i++) {
          buf.writeUInt16BE(str2.charCodeAt(i), i * 2);
        }
        return this._createEncoderBuffer(buf);
      } else if (tag === "numstr") {
        if (!this._isNumstr(str2)) {
          return this.reporter.error("Encoding of string type: numstr supports only digits and space");
        }
        return this._createEncoderBuffer(str2);
      } else if (tag === "printstr") {
        if (!this._isPrintstr(str2)) {
          return this.reporter.error("Encoding of string type: printstr supports only latin upper and lower case letters, digits, space, apostrophe, left and rigth parenthesis, plus sign, comma, hyphen, dot, slash, colon, equal sign, question mark");
        }
        return this._createEncoderBuffer(str2);
      } else if (/str$/.test(tag)) {
        return this._createEncoderBuffer(str2);
      } else if (tag === "objDesc") {
        return this._createEncoderBuffer(str2);
      } else {
        return this.reporter.error("Encoding of string type: " + tag + " unsupported");
      }
    };
    DERNode.prototype._encodeObjid = function encodeObjid(id, values, relative6) {
      if (typeof id === "string") {
        if (!values)
          return this.reporter.error("string objid given, but no values map found");
        if (!values.hasOwnProperty(id))
          return this.reporter.error("objid not found in values map");
        id = values[id].split(/[\s.]+/g);
        for (let i = 0; i < id.length; i++)
          id[i] |= 0;
      } else if (Array.isArray(id)) {
        id = id.slice();
        for (let i = 0; i < id.length; i++)
          id[i] |= 0;
      }
      if (!Array.isArray(id)) {
        return this.reporter.error("objid() should be either array or string, got: " + JSON.stringify(id));
      }
      if (!relative6) {
        if (id[1] >= 40)
          return this.reporter.error("Second objid identifier OOB");
        id.splice(0, 2, id[0] * 40 + id[1]);
      }
      let size = 0;
      for (let i = 0; i < id.length; i++) {
        let ident = id[i];
        for (size++; ident >= 128; ident >>= 7)
          size++;
      }
      const objid = Buffer2.alloc(size);
      let offset = objid.length - 1;
      for (let i = id.length - 1; i >= 0; i--) {
        let ident = id[i];
        objid[offset--] = ident & 127;
        while ((ident >>= 7) > 0)
          objid[offset--] = 128 | ident & 127;
      }
      return this._createEncoderBuffer(objid);
    };
    function two(num) {
      if (num < 10)
        return "0" + num;
      else
        return num;
    }
    DERNode.prototype._encodeTime = function encodeTime(time, tag) {
      let str2;
      const date = new Date(time);
      if (tag === "gentime") {
        str2 = [
          two(date.getUTCFullYear()),
          two(date.getUTCMonth() + 1),
          two(date.getUTCDate()),
          two(date.getUTCHours()),
          two(date.getUTCMinutes()),
          two(date.getUTCSeconds()),
          "Z"
        ].join("");
      } else if (tag === "utctime") {
        str2 = [
          two(date.getUTCFullYear() % 100),
          two(date.getUTCMonth() + 1),
          two(date.getUTCDate()),
          two(date.getUTCHours()),
          two(date.getUTCMinutes()),
          two(date.getUTCSeconds()),
          "Z"
        ].join("");
      } else {
        this.reporter.error("Encoding " + tag + " time is not supported yet");
      }
      return this._encodeStr(str2, "octstr");
    };
    DERNode.prototype._encodeNull = function encodeNull() {
      return this._createEncoderBuffer("");
    };
    DERNode.prototype._encodeInt = function encodeInt(num, values) {
      if (typeof num === "string") {
        if (!values)
          return this.reporter.error("String int or enum given, but no values map");
        if (!values.hasOwnProperty(num)) {
          return this.reporter.error("Values map doesn't contain: " + JSON.stringify(num));
        }
        num = values[num];
      }
      if (typeof num !== "number" && !Buffer2.isBuffer(num)) {
        const numArray = num.toArray();
        if (!num.sign && numArray[0] & 128) {
          numArray.unshift(0);
        }
        num = Buffer2.from(numArray);
      }
      if (Buffer2.isBuffer(num)) {
        let size2 = num.length;
        if (num.length === 0)
          size2++;
        const out2 = Buffer2.alloc(size2);
        num.copy(out2);
        if (num.length === 0)
          out2[0] = 0;
        return this._createEncoderBuffer(out2);
      }
      if (num < 128)
        return this._createEncoderBuffer(num);
      if (num < 256)
        return this._createEncoderBuffer([0, num]);
      let size = 1;
      for (let i = num; i >= 256; i >>= 8)
        size++;
      const out = new Array(size);
      for (let i = out.length - 1; i >= 0; i--) {
        out[i] = num & 255;
        num >>= 8;
      }
      if (out[0] & 128) {
        out.unshift(0);
      }
      return this._createEncoderBuffer(Buffer2.from(out));
    };
    DERNode.prototype._encodeBool = function encodeBool(value) {
      return this._createEncoderBuffer(value ? 255 : 0);
    };
    DERNode.prototype._use = function use(entity, obj2) {
      if (typeof entity === "function")
        entity = entity(obj2);
      return entity._getEncoder("der").tree;
    };
    DERNode.prototype._skipDefault = function skipDefault(dataBuffer, reporter, parent) {
      const state = this._baseState;
      let i;
      if (state["default"] === null)
        return false;
      const data = dataBuffer.join();
      if (state.defaultBuffer === void 0)
        state.defaultBuffer = this._encodeValue(state["default"], reporter, parent).join();
      if (data.length !== state.defaultBuffer.length)
        return false;
      for (i = 0; i < data.length; i++)
        if (data[i] !== state.defaultBuffer[i])
          return false;
      return true;
    };
    function encodeTag(tag, primitive, cls, reporter) {
      let res;
      if (tag === "seqof")
        tag = "seq";
      else if (tag === "setof")
        tag = "set";
      if (der.tagByName.hasOwnProperty(tag))
        res = der.tagByName[tag];
      else if (typeof tag === "number" && (tag | 0) === tag)
        res = tag;
      else
        return reporter.error("Unknown tag: " + tag);
      if (res >= 31)
        return reporter.error("Multi-octet tag encoding unsupported");
      if (!primitive)
        res |= 32;
      res |= der.tagClassByName[cls || "universal"] << 6;
      return res;
    }
  }
});

// node_modules/asn1.js/lib/asn1/encoders/pem.js
var require_pem = __commonJS({
  "node_modules/asn1.js/lib/asn1/encoders/pem.js"(exports, module) {
    "use strict";
    var inherits = require_inherits();
    var DEREncoder = require_der2();
    function PEMEncoder(entity) {
      DEREncoder.call(this, entity);
      this.enc = "pem";
    }
    inherits(PEMEncoder, DEREncoder);
    module.exports = PEMEncoder;
    PEMEncoder.prototype.encode = function encode(data, options) {
      const buf = DEREncoder.prototype.encode.call(this, data);
      const p2 = buf.toString("base64");
      const out = ["-----BEGIN " + options.label + "-----"];
      for (let i = 0; i < p2.length; i += 64)
        out.push(p2.slice(i, i + 64));
      out.push("-----END " + options.label + "-----");
      return out.join("\n");
    };
  }
});

// node_modules/asn1.js/lib/asn1/encoders/index.js
var require_encoders = __commonJS({
  "node_modules/asn1.js/lib/asn1/encoders/index.js"(exports) {
    "use strict";
    var encoders = exports;
    encoders.der = require_der2();
    encoders.pem = require_pem();
  }
});

// node_modules/asn1.js/lib/asn1/decoders/der.js
var require_der3 = __commonJS({
  "node_modules/asn1.js/lib/asn1/decoders/der.js"(exports, module) {
    "use strict";
    var inherits = require_inherits();
    var bignum = require_bn();
    var DecoderBuffer = require_buffer().DecoderBuffer;
    var Node = require_node();
    var der = require_der();
    function DERDecoder(entity) {
      this.enc = "der";
      this.name = entity.name;
      this.entity = entity;
      this.tree = new DERNode();
      this.tree._init(entity.body);
    }
    module.exports = DERDecoder;
    DERDecoder.prototype.decode = function decode(data, options) {
      if (!DecoderBuffer.isDecoderBuffer(data)) {
        data = new DecoderBuffer(data, options);
      }
      return this.tree._decode(data, options);
    };
    function DERNode(parent) {
      Node.call(this, "der", parent);
    }
    inherits(DERNode, Node);
    DERNode.prototype._peekTag = function peekTag(buffer, tag, any) {
      if (buffer.isEmpty())
        return false;
      const state = buffer.save();
      const decodedTag = derDecodeTag(buffer, 'Failed to peek tag: "' + tag + '"');
      if (buffer.isError(decodedTag))
        return decodedTag;
      buffer.restore(state);
      return decodedTag.tag === tag || decodedTag.tagStr === tag || decodedTag.tagStr + "of" === tag || any;
    };
    DERNode.prototype._decodeTag = function decodeTag(buffer, tag, any) {
      const decodedTag = derDecodeTag(
        buffer,
        'Failed to decode tag of "' + tag + '"'
      );
      if (buffer.isError(decodedTag))
        return decodedTag;
      let len = derDecodeLen(
        buffer,
        decodedTag.primitive,
        'Failed to get length of "' + tag + '"'
      );
      if (buffer.isError(len))
        return len;
      if (!any && decodedTag.tag !== tag && decodedTag.tagStr !== tag && decodedTag.tagStr + "of" !== tag) {
        return buffer.error('Failed to match tag: "' + tag + '"');
      }
      if (decodedTag.primitive || len !== null)
        return buffer.skip(len, 'Failed to match body of: "' + tag + '"');
      const state = buffer.save();
      const res = this._skipUntilEnd(
        buffer,
        'Failed to skip indefinite length body: "' + this.tag + '"'
      );
      if (buffer.isError(res))
        return res;
      len = buffer.offset - state.offset;
      buffer.restore(state);
      return buffer.skip(len, 'Failed to match body of: "' + tag + '"');
    };
    DERNode.prototype._skipUntilEnd = function skipUntilEnd(buffer, fail) {
      for (; ; ) {
        const tag = derDecodeTag(buffer, fail);
        if (buffer.isError(tag))
          return tag;
        const len = derDecodeLen(buffer, tag.primitive, fail);
        if (buffer.isError(len))
          return len;
        let res;
        if (tag.primitive || len !== null)
          res = buffer.skip(len);
        else
          res = this._skipUntilEnd(buffer, fail);
        if (buffer.isError(res))
          return res;
        if (tag.tagStr === "end")
          break;
      }
    };
    DERNode.prototype._decodeList = function decodeList(buffer, tag, decoder, options) {
      const result = [];
      while (!buffer.isEmpty()) {
        const possibleEnd = this._peekTag(buffer, "end");
        if (buffer.isError(possibleEnd))
          return possibleEnd;
        const res = decoder.decode(buffer, "der", options);
        if (buffer.isError(res) && possibleEnd)
          break;
        result.push(res);
      }
      return result;
    };
    DERNode.prototype._decodeStr = function decodeStr(buffer, tag) {
      if (tag === "bitstr") {
        const unused = buffer.readUInt8();
        if (buffer.isError(unused))
          return unused;
        return { unused, data: buffer.raw() };
      } else if (tag === "bmpstr") {
        const raw = buffer.raw();
        if (raw.length % 2 === 1)
          return buffer.error("Decoding of string type: bmpstr length mismatch");
        let str2 = "";
        for (let i = 0; i < raw.length / 2; i++) {
          str2 += String.fromCharCode(raw.readUInt16BE(i * 2));
        }
        return str2;
      } else if (tag === "numstr") {
        const numstr = buffer.raw().toString("ascii");
        if (!this._isNumstr(numstr)) {
          return buffer.error("Decoding of string type: numstr unsupported characters");
        }
        return numstr;
      } else if (tag === "octstr") {
        return buffer.raw();
      } else if (tag === "objDesc") {
        return buffer.raw();
      } else if (tag === "printstr") {
        const printstr = buffer.raw().toString("ascii");
        if (!this._isPrintstr(printstr)) {
          return buffer.error("Decoding of string type: printstr unsupported characters");
        }
        return printstr;
      } else if (/str$/.test(tag)) {
        return buffer.raw().toString();
      } else {
        return buffer.error("Decoding of string type: " + tag + " unsupported");
      }
    };
    DERNode.prototype._decodeObjid = function decodeObjid(buffer, values, relative6) {
      let result;
      const identifiers = [];
      let ident = 0;
      let subident = 0;
      while (!buffer.isEmpty()) {
        subident = buffer.readUInt8();
        ident <<= 7;
        ident |= subident & 127;
        if ((subident & 128) === 0) {
          identifiers.push(ident);
          ident = 0;
        }
      }
      if (subident & 128)
        identifiers.push(ident);
      const first = identifiers[0] / 40 | 0;
      const second = identifiers[0] % 40;
      if (relative6)
        result = identifiers;
      else
        result = [first, second].concat(identifiers.slice(1));
      if (values) {
        let tmp = values[result.join(" ")];
        if (tmp === void 0)
          tmp = values[result.join(".")];
        if (tmp !== void 0)
          result = tmp;
      }
      return result;
    };
    DERNode.prototype._decodeTime = function decodeTime(buffer, tag) {
      const str2 = buffer.raw().toString();
      let year;
      let mon;
      let day;
      let hour;
      let min;
      let sec;
      if (tag === "gentime") {
        year = str2.slice(0, 4) | 0;
        mon = str2.slice(4, 6) | 0;
        day = str2.slice(6, 8) | 0;
        hour = str2.slice(8, 10) | 0;
        min = str2.slice(10, 12) | 0;
        sec = str2.slice(12, 14) | 0;
      } else if (tag === "utctime") {
        year = str2.slice(0, 2) | 0;
        mon = str2.slice(2, 4) | 0;
        day = str2.slice(4, 6) | 0;
        hour = str2.slice(6, 8) | 0;
        min = str2.slice(8, 10) | 0;
        sec = str2.slice(10, 12) | 0;
        if (year < 70)
          year = 2e3 + year;
        else
          year = 1900 + year;
      } else {
        return buffer.error("Decoding " + tag + " time is not supported yet");
      }
      return Date.UTC(year, mon - 1, day, hour, min, sec, 0);
    };
    DERNode.prototype._decodeNull = function decodeNull() {
      return null;
    };
    DERNode.prototype._decodeBool = function decodeBool(buffer) {
      const res = buffer.readUInt8();
      if (buffer.isError(res))
        return res;
      else
        return res !== 0;
    };
    DERNode.prototype._decodeInt = function decodeInt(buffer, values) {
      const raw = buffer.raw();
      let res = new bignum(raw);
      if (values)
        res = values[res.toString(10)] || res;
      return res;
    };
    DERNode.prototype._use = function use(entity, obj2) {
      if (typeof entity === "function")
        entity = entity(obj2);
      return entity._getDecoder("der").tree;
    };
    function derDecodeTag(buf, fail) {
      let tag = buf.readUInt8(fail);
      if (buf.isError(tag))
        return tag;
      const cls = der.tagClass[tag >> 6];
      const primitive = (tag & 32) === 0;
      if ((tag & 31) === 31) {
        let oct = tag;
        tag = 0;
        while ((oct & 128) === 128) {
          oct = buf.readUInt8(fail);
          if (buf.isError(oct))
            return oct;
          tag <<= 7;
          tag |= oct & 127;
        }
      } else {
        tag &= 31;
      }
      const tagStr = der.tag[tag];
      return {
        cls,
        primitive,
        tag,
        tagStr
      };
    }
    function derDecodeLen(buf, primitive, fail) {
      let len = buf.readUInt8(fail);
      if (buf.isError(len))
        return len;
      if (!primitive && len === 128)
        return null;
      if ((len & 128) === 0) {
        return len;
      }
      const num = len & 127;
      if (num > 4)
        return buf.error("length octect is too long");
      len = 0;
      for (let i = 0; i < num; i++) {
        len <<= 8;
        const j = buf.readUInt8(fail);
        if (buf.isError(j))
          return j;
        len |= j;
      }
      return len;
    }
  }
});

// node_modules/asn1.js/lib/asn1/decoders/pem.js
var require_pem2 = __commonJS({
  "node_modules/asn1.js/lib/asn1/decoders/pem.js"(exports, module) {
    "use strict";
    var inherits = require_inherits();
    var Buffer2 = require_safer().Buffer;
    var DERDecoder = require_der3();
    function PEMDecoder(entity) {
      DERDecoder.call(this, entity);
      this.enc = "pem";
    }
    inherits(PEMDecoder, DERDecoder);
    module.exports = PEMDecoder;
    PEMDecoder.prototype.decode = function decode(data, options) {
      const lines = data.toString().split(/[\r\n]+/g);
      const label = options.label.toUpperCase();
      const re = /^-----(BEGIN|END) ([^-]+)-----$/;
      let start = -1;
      let end = -1;
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(re);
        if (match === null)
          continue;
        if (match[2] !== label)
          continue;
        if (start === -1) {
          if (match[1] !== "BEGIN")
            break;
          start = i;
        } else {
          if (match[1] !== "END")
            break;
          end = i;
          break;
        }
      }
      if (start === -1 || end === -1)
        throw new Error("PEM section not found for: " + label);
      const base64 = lines.slice(start + 1, end).join("");
      base64.replace(/[^a-z0-9+/=]+/gi, "");
      const input = Buffer2.from(base64, "base64");
      return DERDecoder.prototype.decode.call(this, input, options);
    };
  }
});

// node_modules/asn1.js/lib/asn1/decoders/index.js
var require_decoders = __commonJS({
  "node_modules/asn1.js/lib/asn1/decoders/index.js"(exports) {
    "use strict";
    var decoders = exports;
    decoders.der = require_der3();
    decoders.pem = require_pem2();
  }
});

// node_modules/asn1.js/lib/asn1/api.js
var require_api = __commonJS({
  "node_modules/asn1.js/lib/asn1/api.js"(exports) {
    "use strict";
    var encoders = require_encoders();
    var decoders = require_decoders();
    var inherits = require_inherits();
    var api = exports;
    api.define = function define(name, body) {
      return new Entity(name, body);
    };
    function Entity(name, body) {
      this.name = name;
      this.body = body;
      this.decoders = {};
      this.encoders = {};
    }
    Entity.prototype._createNamed = function createNamed(Base) {
      const name = this.name;
      function Generated(entity) {
        this._initNamed(entity, name);
      }
      inherits(Generated, Base);
      Generated.prototype._initNamed = function _initNamed(entity, name2) {
        Base.call(this, entity, name2);
      };
      return new Generated(this);
    };
    Entity.prototype._getDecoder = function _getDecoder(enc) {
      enc = enc || "der";
      if (!this.decoders.hasOwnProperty(enc))
        this.decoders[enc] = this._createNamed(decoders[enc]);
      return this.decoders[enc];
    };
    Entity.prototype.decode = function decode(data, enc, options) {
      return this._getDecoder(enc).decode(data, options);
    };
    Entity.prototype._getEncoder = function _getEncoder(enc) {
      enc = enc || "der";
      if (!this.encoders.hasOwnProperty(enc))
        this.encoders[enc] = this._createNamed(encoders[enc]);
      return this.encoders[enc];
    };
    Entity.prototype.encode = function encode(data, enc, reporter) {
      return this._getEncoder(enc).encode(data, reporter);
    };
  }
});

// node_modules/asn1.js/lib/asn1/base/index.js
var require_base = __commonJS({
  "node_modules/asn1.js/lib/asn1/base/index.js"(exports) {
    "use strict";
    var base = exports;
    base.Reporter = require_reporter().Reporter;
    base.DecoderBuffer = require_buffer().DecoderBuffer;
    base.EncoderBuffer = require_buffer().EncoderBuffer;
    base.Node = require_node();
  }
});

// node_modules/asn1.js/lib/asn1/constants/index.js
var require_constants = __commonJS({
  "node_modules/asn1.js/lib/asn1/constants/index.js"(exports) {
    "use strict";
    var constants = exports;
    constants._reverse = function reverse(map) {
      const res = {};
      Object.keys(map).forEach(function(key) {
        if ((key | 0) == key)
          key = key | 0;
        const value = map[key];
        res[value] = key;
      });
      return res;
    };
    constants.der = require_der();
  }
});

// node_modules/asn1.js/lib/asn1.js
var require_asn1 = __commonJS({
  "node_modules/asn1.js/lib/asn1.js"(exports) {
    "use strict";
    var asn1 = exports;
    asn1.bignum = require_bn();
    asn1.define = require_api().define;
    asn1.base = require_base();
    asn1.constants = require_constants();
    asn1.decoders = require_decoders();
    asn1.encoders = require_encoders();
  }
});

// node_modules/safe-buffer/index.js
var require_safe_buffer = __commonJS({
  "node_modules/safe-buffer/index.js"(exports, module) {
    var buffer = __require("buffer");
    var Buffer2 = buffer.Buffer;
    function copyProps(src, dst) {
      for (var key in src) {
        dst[key] = src[key];
      }
    }
    if (Buffer2.from && Buffer2.alloc && Buffer2.allocUnsafe && Buffer2.allocUnsafeSlow) {
      module.exports = buffer;
    } else {
      copyProps(buffer, exports);
      exports.Buffer = SafeBuffer;
    }
    function SafeBuffer(arg, encodingOrOffset, length) {
      return Buffer2(arg, encodingOrOffset, length);
    }
    SafeBuffer.prototype = Object.create(Buffer2.prototype);
    copyProps(Buffer2, SafeBuffer);
    SafeBuffer.from = function(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        throw new TypeError("Argument must not be a number");
      }
      return Buffer2(arg, encodingOrOffset, length);
    };
    SafeBuffer.alloc = function(size, fill, encoding) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      var buf = Buffer2(size);
      if (fill !== void 0) {
        if (typeof encoding === "string") {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
      } else {
        buf.fill(0);
      }
      return buf;
    };
    SafeBuffer.allocUnsafe = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return Buffer2(size);
    };
    SafeBuffer.allocUnsafeSlow = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return buffer.SlowBuffer(size);
    };
  }
});

// node_modules/jws/lib/data-stream.js
var require_data_stream = __commonJS({
  "node_modules/jws/lib/data-stream.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var Stream = __require("stream");
    var util = __require("util");
    function DataStream(data) {
      this.buffer = null;
      this.writable = true;
      this.readable = true;
      if (!data) {
        this.buffer = Buffer2.alloc(0);
        return this;
      }
      if (typeof data.pipe === "function") {
        this.buffer = Buffer2.alloc(0);
        data.pipe(this);
        return this;
      }
      if (data.length || typeof data === "object") {
        this.buffer = data;
        this.writable = false;
        process.nextTick(function() {
          this.emit("end", data);
          this.readable = false;
          this.emit("close");
        }.bind(this));
        return this;
      }
      throw new TypeError("Unexpected data type (" + typeof data + ")");
    }
    util.inherits(DataStream, Stream);
    DataStream.prototype.write = function write(data) {
      this.buffer = Buffer2.concat([this.buffer, Buffer2.from(data)]);
      this.emit("data", data);
    };
    DataStream.prototype.end = function end(data) {
      if (data)
        this.write(data);
      this.emit("end", data);
      this.emit("close");
      this.writable = false;
      this.readable = false;
    };
    module.exports = DataStream;
  }
});

// node_modules/ecdsa-sig-formatter/src/param-bytes-for-alg.js
var require_param_bytes_for_alg = __commonJS({
  "node_modules/ecdsa-sig-formatter/src/param-bytes-for-alg.js"(exports, module) {
    "use strict";
    function getParamSize(keySize) {
      var result = (keySize / 8 | 0) + (keySize % 8 === 0 ? 0 : 1);
      return result;
    }
    var paramBytesForAlg = {
      ES256: getParamSize(256),
      ES384: getParamSize(384),
      ES512: getParamSize(521)
    };
    function getParamBytesForAlg(alg) {
      var paramBytes = paramBytesForAlg[alg];
      if (paramBytes) {
        return paramBytes;
      }
      throw new Error('Unknown algorithm "' + alg + '"');
    }
    module.exports = getParamBytesForAlg;
  }
});

// node_modules/ecdsa-sig-formatter/src/ecdsa-sig-formatter.js
var require_ecdsa_sig_formatter = __commonJS({
  "node_modules/ecdsa-sig-formatter/src/ecdsa-sig-formatter.js"(exports, module) {
    "use strict";
    var Buffer2 = require_safe_buffer().Buffer;
    var getParamBytesForAlg = require_param_bytes_for_alg();
    var MAX_OCTET = 128;
    var CLASS_UNIVERSAL = 0;
    var PRIMITIVE_BIT = 32;
    var TAG_SEQ = 16;
    var TAG_INT = 2;
    var ENCODED_TAG_SEQ = TAG_SEQ | PRIMITIVE_BIT | CLASS_UNIVERSAL << 6;
    var ENCODED_TAG_INT = TAG_INT | CLASS_UNIVERSAL << 6;
    function base64Url(base64) {
      return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    }
    function signatureAsBuffer(signature) {
      if (Buffer2.isBuffer(signature)) {
        return signature;
      } else if ("string" === typeof signature) {
        return Buffer2.from(signature, "base64");
      }
      throw new TypeError("ECDSA signature must be a Base64 string or a Buffer");
    }
    function derToJose(signature, alg) {
      signature = signatureAsBuffer(signature);
      var paramBytes = getParamBytesForAlg(alg);
      var maxEncodedParamLength = paramBytes + 1;
      var inputLength = signature.length;
      var offset = 0;
      if (signature[offset++] !== ENCODED_TAG_SEQ) {
        throw new Error('Could not find expected "seq"');
      }
      var seqLength = signature[offset++];
      if (seqLength === (MAX_OCTET | 1)) {
        seqLength = signature[offset++];
      }
      if (inputLength - offset < seqLength) {
        throw new Error('"seq" specified length of "' + seqLength + '", only "' + (inputLength - offset) + '" remaining');
      }
      if (signature[offset++] !== ENCODED_TAG_INT) {
        throw new Error('Could not find expected "int" for "r"');
      }
      var rLength = signature[offset++];
      if (inputLength - offset - 2 < rLength) {
        throw new Error('"r" specified length of "' + rLength + '", only "' + (inputLength - offset - 2) + '" available');
      }
      if (maxEncodedParamLength < rLength) {
        throw new Error('"r" specified length of "' + rLength + '", max of "' + maxEncodedParamLength + '" is acceptable');
      }
      var rOffset = offset;
      offset += rLength;
      if (signature[offset++] !== ENCODED_TAG_INT) {
        throw new Error('Could not find expected "int" for "s"');
      }
      var sLength = signature[offset++];
      if (inputLength - offset !== sLength) {
        throw new Error('"s" specified length of "' + sLength + '", expected "' + (inputLength - offset) + '"');
      }
      if (maxEncodedParamLength < sLength) {
        throw new Error('"s" specified length of "' + sLength + '", max of "' + maxEncodedParamLength + '" is acceptable');
      }
      var sOffset = offset;
      offset += sLength;
      if (offset !== inputLength) {
        throw new Error('Expected to consume entire buffer, but "' + (inputLength - offset) + '" bytes remain');
      }
      var rPadding = paramBytes - rLength, sPadding = paramBytes - sLength;
      var dst = Buffer2.allocUnsafe(rPadding + rLength + sPadding + sLength);
      for (offset = 0; offset < rPadding; ++offset) {
        dst[offset] = 0;
      }
      signature.copy(dst, offset, rOffset + Math.max(-rPadding, 0), rOffset + rLength);
      offset = paramBytes;
      for (var o = offset; offset < o + sPadding; ++offset) {
        dst[offset] = 0;
      }
      signature.copy(dst, offset, sOffset + Math.max(-sPadding, 0), sOffset + sLength);
      dst = dst.toString("base64");
      dst = base64Url(dst);
      return dst;
    }
    function countPadding(buf, start, stop) {
      var padding = 0;
      while (start + padding < stop && buf[start + padding] === 0) {
        ++padding;
      }
      var needsSign = buf[start + padding] >= MAX_OCTET;
      if (needsSign) {
        --padding;
      }
      return padding;
    }
    function joseToDer(signature, alg) {
      signature = signatureAsBuffer(signature);
      var paramBytes = getParamBytesForAlg(alg);
      var signatureBytes = signature.length;
      if (signatureBytes !== paramBytes * 2) {
        throw new TypeError('"' + alg + '" signatures must be "' + paramBytes * 2 + '" bytes, saw "' + signatureBytes + '"');
      }
      var rPadding = countPadding(signature, 0, paramBytes);
      var sPadding = countPadding(signature, paramBytes, signature.length);
      var rLength = paramBytes - rPadding;
      var sLength = paramBytes - sPadding;
      var rsBytes = 1 + 1 + rLength + 1 + 1 + sLength;
      var shortLength = rsBytes < MAX_OCTET;
      var dst = Buffer2.allocUnsafe((shortLength ? 2 : 3) + rsBytes);
      var offset = 0;
      dst[offset++] = ENCODED_TAG_SEQ;
      if (shortLength) {
        dst[offset++] = rsBytes;
      } else {
        dst[offset++] = MAX_OCTET | 1;
        dst[offset++] = rsBytes & 255;
      }
      dst[offset++] = ENCODED_TAG_INT;
      dst[offset++] = rLength;
      if (rPadding < 0) {
        dst[offset++] = 0;
        offset += signature.copy(dst, offset, 0, paramBytes);
      } else {
        offset += signature.copy(dst, offset, rPadding, paramBytes);
      }
      dst[offset++] = ENCODED_TAG_INT;
      dst[offset++] = sLength;
      if (sPadding < 0) {
        dst[offset++] = 0;
        signature.copy(dst, offset, paramBytes);
      } else {
        signature.copy(dst, offset, paramBytes + sPadding);
      }
      return dst;
    }
    module.exports = {
      derToJose,
      joseToDer
    };
  }
});

// node_modules/buffer-equal-constant-time/index.js
var require_buffer_equal_constant_time = __commonJS({
  "node_modules/buffer-equal-constant-time/index.js"(exports, module) {
    "use strict";
    var Buffer2 = __require("buffer").Buffer;
    var SlowBuffer = __require("buffer").SlowBuffer;
    module.exports = bufferEq;
    function bufferEq(a, b2) {
      if (!Buffer2.isBuffer(a) || !Buffer2.isBuffer(b2)) {
        return false;
      }
      if (a.length !== b2.length) {
        return false;
      }
      var c = 0;
      for (var i = 0; i < a.length; i++) {
        c |= a[i] ^ b2[i];
      }
      return c === 0;
    }
    bufferEq.install = function() {
      Buffer2.prototype.equal = SlowBuffer.prototype.equal = function equal(that) {
        return bufferEq(this, that);
      };
    };
    var origBufEqual = Buffer2.prototype.equal;
    var origSlowBufEqual = SlowBuffer.prototype.equal;
    bufferEq.restore = function() {
      Buffer2.prototype.equal = origBufEqual;
      SlowBuffer.prototype.equal = origSlowBufEqual;
    };
  }
});

// node_modules/jwa/index.js
var require_jwa = __commonJS({
  "node_modules/jwa/index.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var crypto = __require("crypto");
    var formatEcdsa = require_ecdsa_sig_formatter();
    var util = __require("util");
    var MSG_INVALID_ALGORITHM = '"%s" is not a valid algorithm.\n  Supported algorithms are:\n  "HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512" and "none".';
    var MSG_INVALID_SECRET = "secret must be a string or buffer";
    var MSG_INVALID_VERIFIER_KEY = "key must be a string or a buffer";
    var MSG_INVALID_SIGNER_KEY = "key must be a string, a buffer or an object";
    var supportsKeyObjects = typeof crypto.createPublicKey === "function";
    if (supportsKeyObjects) {
      MSG_INVALID_VERIFIER_KEY += " or a KeyObject";
      MSG_INVALID_SECRET += "or a KeyObject";
    }
    function checkIsPublicKey(key) {
      if (Buffer2.isBuffer(key)) {
        return;
      }
      if (typeof key === "string") {
        return;
      }
      if (!supportsKeyObjects) {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key !== "object") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key.type !== "string") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key.asymmetricKeyType !== "string") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key.export !== "function") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
    }
    function checkIsPrivateKey(key) {
      if (Buffer2.isBuffer(key)) {
        return;
      }
      if (typeof key === "string") {
        return;
      }
      if (typeof key === "object") {
        return;
      }
      throw typeError(MSG_INVALID_SIGNER_KEY);
    }
    function checkIsSecretKey(key) {
      if (Buffer2.isBuffer(key)) {
        return;
      }
      if (typeof key === "string") {
        return key;
      }
      if (!supportsKeyObjects) {
        throw typeError(MSG_INVALID_SECRET);
      }
      if (typeof key !== "object") {
        throw typeError(MSG_INVALID_SECRET);
      }
      if (key.type !== "secret") {
        throw typeError(MSG_INVALID_SECRET);
      }
      if (typeof key.export !== "function") {
        throw typeError(MSG_INVALID_SECRET);
      }
    }
    function fromBase64(base64) {
      return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    }
    function toBase64(base64url) {
      base64url = base64url.toString();
      var padding = 4 - base64url.length % 4;
      if (padding !== 4) {
        for (var i = 0; i < padding; ++i) {
          base64url += "=";
        }
      }
      return base64url.replace(/\-/g, "+").replace(/_/g, "/");
    }
    function typeError(template) {
      var args = [].slice.call(arguments, 1);
      var errMsg = util.format.bind(util, template).apply(null, args);
      return new TypeError(errMsg);
    }
    function bufferOrString(obj2) {
      return Buffer2.isBuffer(obj2) || typeof obj2 === "string";
    }
    function normalizeInput(thing) {
      if (!bufferOrString(thing))
        thing = JSON.stringify(thing);
      return thing;
    }
    function createHmacSigner(bits) {
      return function sign(thing, secret) {
        checkIsSecretKey(secret);
        thing = normalizeInput(thing);
        var hmac = crypto.createHmac("sha" + bits, secret);
        var sig = (hmac.update(thing), hmac.digest("base64"));
        return fromBase64(sig);
      };
    }
    var bufferEqual;
    var timingSafeEqual2 = "timingSafeEqual" in crypto ? function timingSafeEqual3(a, b2) {
      if (a.byteLength !== b2.byteLength) {
        return false;
      }
      return crypto.timingSafeEqual(a, b2);
    } : function timingSafeEqual3(a, b2) {
      if (!bufferEqual) {
        bufferEqual = require_buffer_equal_constant_time();
      }
      return bufferEqual(a, b2);
    };
    function createHmacVerifier(bits) {
      return function verify(thing, signature, secret) {
        var computedSig = createHmacSigner(bits)(thing, secret);
        return timingSafeEqual2(Buffer2.from(signature), Buffer2.from(computedSig));
      };
    }
    function createKeySigner(bits) {
      return function sign(thing, privateKey) {
        checkIsPrivateKey(privateKey);
        thing = normalizeInput(thing);
        var signer = crypto.createSign("RSA-SHA" + bits);
        var sig = (signer.update(thing), signer.sign(privateKey, "base64"));
        return fromBase64(sig);
      };
    }
    function createKeyVerifier(bits) {
      return function verify(thing, signature, publicKey) {
        checkIsPublicKey(publicKey);
        thing = normalizeInput(thing);
        signature = toBase64(signature);
        var verifier = crypto.createVerify("RSA-SHA" + bits);
        verifier.update(thing);
        return verifier.verify(publicKey, signature, "base64");
      };
    }
    function createPSSKeySigner(bits) {
      return function sign(thing, privateKey) {
        checkIsPrivateKey(privateKey);
        thing = normalizeInput(thing);
        var signer = crypto.createSign("RSA-SHA" + bits);
        var sig = (signer.update(thing), signer.sign({
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
        }, "base64"));
        return fromBase64(sig);
      };
    }
    function createPSSKeyVerifier(bits) {
      return function verify(thing, signature, publicKey) {
        checkIsPublicKey(publicKey);
        thing = normalizeInput(thing);
        signature = toBase64(signature);
        var verifier = crypto.createVerify("RSA-SHA" + bits);
        verifier.update(thing);
        return verifier.verify({
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
        }, signature, "base64");
      };
    }
    function createECDSASigner(bits) {
      var inner = createKeySigner(bits);
      return function sign() {
        var signature = inner.apply(null, arguments);
        signature = formatEcdsa.derToJose(signature, "ES" + bits);
        return signature;
      };
    }
    function createECDSAVerifer(bits) {
      var inner = createKeyVerifier(bits);
      return function verify(thing, signature, publicKey) {
        signature = formatEcdsa.joseToDer(signature, "ES" + bits).toString("base64");
        var result = inner(thing, signature, publicKey);
        return result;
      };
    }
    function createNoneSigner() {
      return function sign() {
        return "";
      };
    }
    function createNoneVerifier() {
      return function verify(thing, signature) {
        return signature === "";
      };
    }
    module.exports = function jwa(algorithm) {
      var signerFactories = {
        hs: createHmacSigner,
        rs: createKeySigner,
        ps: createPSSKeySigner,
        es: createECDSASigner,
        none: createNoneSigner
      };
      var verifierFactories = {
        hs: createHmacVerifier,
        rs: createKeyVerifier,
        ps: createPSSKeyVerifier,
        es: createECDSAVerifer,
        none: createNoneVerifier
      };
      var match = algorithm.match(/^(RS|PS|ES|HS)(256|384|512)$|^(none)$/);
      if (!match)
        throw typeError(MSG_INVALID_ALGORITHM, algorithm);
      var algo = (match[1] || match[3]).toLowerCase();
      var bits = match[2];
      return {
        sign: signerFactories[algo](bits),
        verify: verifierFactories[algo](bits)
      };
    };
  }
});

// node_modules/jws/lib/tostring.js
var require_tostring = __commonJS({
  "node_modules/jws/lib/tostring.js"(exports, module) {
    var Buffer2 = __require("buffer").Buffer;
    module.exports = function toString(obj2) {
      if (typeof obj2 === "string")
        return obj2;
      if (typeof obj2 === "number" || Buffer2.isBuffer(obj2))
        return obj2.toString();
      return JSON.stringify(obj2);
    };
  }
});

// node_modules/jws/lib/sign-stream.js
var require_sign_stream = __commonJS({
  "node_modules/jws/lib/sign-stream.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var DataStream = require_data_stream();
    var jwa = require_jwa();
    var Stream = __require("stream");
    var toString = require_tostring();
    var util = __require("util");
    function base64url(string, encoding) {
      return Buffer2.from(string, encoding).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    }
    function jwsSecuredInput(header, payload, encoding) {
      encoding = encoding || "utf8";
      var encodedHeader = base64url(toString(header), "binary");
      var encodedPayload = base64url(toString(payload), encoding);
      return util.format("%s.%s", encodedHeader, encodedPayload);
    }
    function jwsSign(opts) {
      var header = opts.header;
      var payload = opts.payload;
      var secretOrKey = opts.secret || opts.privateKey;
      var encoding = opts.encoding;
      var algo = jwa(header.alg);
      var securedInput = jwsSecuredInput(header, payload, encoding);
      var signature = algo.sign(securedInput, secretOrKey);
      return util.format("%s.%s", securedInput, signature);
    }
    function SignStream(opts) {
      var secret = opts.secret;
      secret = secret == null ? opts.privateKey : secret;
      secret = secret == null ? opts.key : secret;
      if (/^hs/i.test(opts.header.alg) === true && secret == null) {
        throw new TypeError("secret must be a string or buffer or a KeyObject");
      }
      var secretStream = new DataStream(secret);
      this.readable = true;
      this.header = opts.header;
      this.encoding = opts.encoding;
      this.secret = this.privateKey = this.key = secretStream;
      this.payload = new DataStream(opts.payload);
      this.secret.once("close", function() {
        if (!this.payload.writable && this.readable)
          this.sign();
      }.bind(this));
      this.payload.once("close", function() {
        if (!this.secret.writable && this.readable)
          this.sign();
      }.bind(this));
    }
    util.inherits(SignStream, Stream);
    SignStream.prototype.sign = function sign() {
      try {
        var signature = jwsSign({
          header: this.header,
          payload: this.payload.buffer,
          secret: this.secret.buffer,
          encoding: this.encoding
        });
        this.emit("done", signature);
        this.emit("data", signature);
        this.emit("end");
        this.readable = false;
        return signature;
      } catch (e) {
        this.readable = false;
        this.emit("error", e);
        this.emit("close");
      }
    };
    SignStream.sign = jwsSign;
    module.exports = SignStream;
  }
});

// node_modules/jws/lib/verify-stream.js
var require_verify_stream = __commonJS({
  "node_modules/jws/lib/verify-stream.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var DataStream = require_data_stream();
    var jwa = require_jwa();
    var Stream = __require("stream");
    var toString = require_tostring();
    var util = __require("util");
    var JWS_REGEX = /^[a-zA-Z0-9\-_]+?\.[a-zA-Z0-9\-_]+?\.([a-zA-Z0-9\-_]+)?$/;
    function isObject(thing) {
      return Object.prototype.toString.call(thing) === "[object Object]";
    }
    function safeJsonParse(thing) {
      if (isObject(thing))
        return thing;
      try {
        return JSON.parse(thing);
      } catch (e) {
        return void 0;
      }
    }
    function headerFromJWS(jwsSig) {
      var encodedHeader = jwsSig.split(".", 1)[0];
      return safeJsonParse(Buffer2.from(encodedHeader, "base64").toString("binary"));
    }
    function securedInputFromJWS(jwsSig) {
      return jwsSig.split(".", 2).join(".");
    }
    function signatureFromJWS(jwsSig) {
      return jwsSig.split(".")[2];
    }
    function payloadFromJWS(jwsSig, encoding) {
      encoding = encoding || "utf8";
      var payload = jwsSig.split(".")[1];
      return Buffer2.from(payload, "base64").toString(encoding);
    }
    function isValidJws(string) {
      return JWS_REGEX.test(string) && !!headerFromJWS(string);
    }
    function jwsVerify(jwsSig, algorithm, secretOrKey) {
      if (!algorithm) {
        var err = new Error("Missing algorithm parameter for jws.verify");
        err.code = "MISSING_ALGORITHM";
        throw err;
      }
      jwsSig = toString(jwsSig);
      var signature = signatureFromJWS(jwsSig);
      var securedInput = securedInputFromJWS(jwsSig);
      var algo = jwa(algorithm);
      return algo.verify(securedInput, signature, secretOrKey);
    }
    function jwsDecode(jwsSig, opts) {
      opts = opts || {};
      jwsSig = toString(jwsSig);
      if (!isValidJws(jwsSig))
        return null;
      var header = headerFromJWS(jwsSig);
      if (!header)
        return null;
      var payload = payloadFromJWS(jwsSig);
      if (header.typ === "JWT" || opts.json)
        payload = JSON.parse(payload, opts.encoding);
      return {
        header,
        payload,
        signature: signatureFromJWS(jwsSig)
      };
    }
    function VerifyStream(opts) {
      opts = opts || {};
      var secretOrKey = opts.secret;
      secretOrKey = secretOrKey == null ? opts.publicKey : secretOrKey;
      secretOrKey = secretOrKey == null ? opts.key : secretOrKey;
      if (/^hs/i.test(opts.algorithm) === true && secretOrKey == null) {
        throw new TypeError("secret must be a string or buffer or a KeyObject");
      }
      var secretStream = new DataStream(secretOrKey);
      this.readable = true;
      this.algorithm = opts.algorithm;
      this.encoding = opts.encoding;
      this.secret = this.publicKey = this.key = secretStream;
      this.signature = new DataStream(opts.signature);
      this.secret.once("close", function() {
        if (!this.signature.writable && this.readable)
          this.verify();
      }.bind(this));
      this.signature.once("close", function() {
        if (!this.secret.writable && this.readable)
          this.verify();
      }.bind(this));
    }
    util.inherits(VerifyStream, Stream);
    VerifyStream.prototype.verify = function verify() {
      try {
        var valid = jwsVerify(this.signature.buffer, this.algorithm, this.key.buffer);
        var obj2 = jwsDecode(this.signature.buffer, this.encoding);
        this.emit("done", valid, obj2);
        this.emit("data", valid);
        this.emit("end");
        this.readable = false;
        return valid;
      } catch (e) {
        this.readable = false;
        this.emit("error", e);
        this.emit("close");
      }
    };
    VerifyStream.decode = jwsDecode;
    VerifyStream.isValid = isValidJws;
    VerifyStream.verify = jwsVerify;
    module.exports = VerifyStream;
  }
});

// node_modules/jws/index.js
var require_jws = __commonJS({
  "node_modules/jws/index.js"(exports) {
    var SignStream = require_sign_stream();
    var VerifyStream = require_verify_stream();
    var ALGORITHMS = [
      "HS256",
      "HS384",
      "HS512",
      "RS256",
      "RS384",
      "RS512",
      "PS256",
      "PS384",
      "PS512",
      "ES256",
      "ES384",
      "ES512"
    ];
    exports.ALGORITHMS = ALGORITHMS;
    exports.sign = SignStream.sign;
    exports.verify = VerifyStream.verify;
    exports.decode = VerifyStream.decode;
    exports.isValid = VerifyStream.isValid;
    exports.createSign = function createSign(opts) {
      return new SignStream(opts);
    };
    exports.createVerify = function createVerify(opts) {
      return new VerifyStream(opts);
    };
  }
});

// node_modules/web-push/src/web-push-constants.js
var require_web_push_constants = __commonJS({
  "node_modules/web-push/src/web-push-constants.js"(exports, module) {
    "use strict";
    var WebPushConstants = {};
    WebPushConstants.supportedContentEncodings = {
      AES_GCM: "aesgcm",
      AES_128_GCM: "aes128gcm"
    };
    WebPushConstants.supportedUrgency = {
      VERY_LOW: "very-low",
      LOW: "low",
      NORMAL: "normal",
      HIGH: "high"
    };
    module.exports = WebPushConstants;
  }
});

// node_modules/web-push/src/urlsafe-base64-helper.js
var require_urlsafe_base64_helper = __commonJS({
  "node_modules/web-push/src/urlsafe-base64-helper.js"(exports, module) {
    "use strict";
    function validate(base64) {
      return /^[A-Za-z0-9\-_]+$/.test(base64);
    }
    module.exports = {
      validate
    };
  }
});

// node_modules/web-push/src/vapid-helper.js
var require_vapid_helper = __commonJS({
  "node_modules/web-push/src/vapid-helper.js"(exports, module) {
    "use strict";
    var crypto = __require("crypto");
    var asn1 = require_asn1();
    var jws = require_jws();
    var { URL: URL2 } = __require("url");
    var WebPushConstants = require_web_push_constants();
    var urlBase64Helper = require_urlsafe_base64_helper();
    var DEFAULT_EXPIRATION_SECONDS = 12 * 60 * 60;
    var MAX_EXPIRATION_SECONDS = 24 * 60 * 60;
    var ECPrivateKeyASN = asn1.define("ECPrivateKey", function() {
      this.seq().obj(
        this.key("version").int(),
        this.key("privateKey").octstr(),
        this.key("parameters").explicit(0).objid().optional(),
        this.key("publicKey").explicit(1).bitstr().optional()
      );
    });
    function toPEM(key) {
      return ECPrivateKeyASN.encode({
        version: 1,
        privateKey: key,
        parameters: [1, 2, 840, 10045, 3, 1, 7]
        // prime256v1
      }, "pem", {
        label: "EC PRIVATE KEY"
      });
    }
    function generateVAPIDKeys() {
      const curve = crypto.createECDH("prime256v1");
      curve.generateKeys();
      let publicKeyBuffer = curve.getPublicKey();
      let privateKeyBuffer = curve.getPrivateKey();
      if (privateKeyBuffer.length < 32) {
        const padding = Buffer.alloc(32 - privateKeyBuffer.length);
        padding.fill(0);
        privateKeyBuffer = Buffer.concat([padding, privateKeyBuffer]);
      }
      if (publicKeyBuffer.length < 65) {
        const padding = Buffer.alloc(65 - publicKeyBuffer.length);
        padding.fill(0);
        publicKeyBuffer = Buffer.concat([padding, publicKeyBuffer]);
      }
      return {
        publicKey: publicKeyBuffer.toString("base64url"),
        privateKey: privateKeyBuffer.toString("base64url")
      };
    }
    function validateSubject(subject) {
      if (!subject) {
        throw new Error("No subject set in vapidDetails.subject.");
      }
      if (typeof subject !== "string" || subject.length === 0) {
        throw new Error("The subject value must be a string containing an https: URL or mailto: address. " + subject);
      }
      let subjectParseResult = null;
      try {
        subjectParseResult = new URL2(subject);
      } catch (err) {
        throw new Error("Vapid subject is not a valid URL. " + subject);
      }
      if (!["https:", "mailto:"].includes(subjectParseResult.protocol)) {
        throw new Error("Vapid subject is not an https: or mailto: URL. " + subject);
      }
      if (subjectParseResult.hostname === "localhost") {
        console.warn("Vapid subject points to a localhost web URI, which is unsupported by Apple's push notification server and will result in a BadJwtToken error when sending notifications.");
      }
    }
    function validatePublicKey(publicKey) {
      if (!publicKey) {
        throw new Error("No key set vapidDetails.publicKey");
      }
      if (typeof publicKey !== "string") {
        throw new Error("Vapid public key is must be a URL safe Base 64 encoded string.");
      }
      if (!urlBase64Helper.validate(publicKey)) {
        throw new Error('Vapid public key must be a URL safe Base 64 (without "=")');
      }
      publicKey = Buffer.from(publicKey, "base64url");
      if (publicKey.length !== 65) {
        throw new Error("Vapid public key should be 65 bytes long when decoded.");
      }
    }
    function validatePrivateKey(privateKey) {
      if (!privateKey) {
        throw new Error("No key set in vapidDetails.privateKey");
      }
      if (typeof privateKey !== "string") {
        throw new Error("Vapid private key must be a URL safe Base 64 encoded string.");
      }
      if (!urlBase64Helper.validate(privateKey)) {
        throw new Error('Vapid private key must be a URL safe Base 64 (without "=")');
      }
      privateKey = Buffer.from(privateKey, "base64url");
      if (privateKey.length !== 32) {
        throw new Error("Vapid private key should be 32 bytes long when decoded.");
      }
    }
    function getFutureExpirationTimestamp(numSeconds) {
      const futureExp = /* @__PURE__ */ new Date();
      futureExp.setSeconds(futureExp.getSeconds() + numSeconds);
      return Math.floor(futureExp.getTime() / 1e3);
    }
    function validateExpiration(expiration) {
      if (!Number.isInteger(expiration)) {
        throw new Error("`expiration` value must be a number");
      }
      if (expiration < 0) {
        throw new Error("`expiration` must be a positive integer");
      }
      const maxExpirationTimestamp = getFutureExpirationTimestamp(MAX_EXPIRATION_SECONDS);
      if (expiration >= maxExpirationTimestamp) {
        throw new Error("`expiration` value is greater than maximum of 24 hours");
      }
    }
    function getVapidHeaders(audience, subject, publicKey, privateKey, contentEncoding, expiration) {
      if (!audience) {
        throw new Error("No audience could be generated for VAPID.");
      }
      if (typeof audience !== "string" || audience.length === 0) {
        throw new Error("The audience value must be a string containing the origin of a push service. " + audience);
      }
      try {
        new URL2(audience);
      } catch (err) {
        throw new Error("VAPID audience is not a url. " + audience);
      }
      validateSubject(subject);
      validatePublicKey(publicKey);
      validatePrivateKey(privateKey);
      privateKey = Buffer.from(privateKey, "base64url");
      if (expiration) {
        validateExpiration(expiration);
      } else {
        expiration = getFutureExpirationTimestamp(DEFAULT_EXPIRATION_SECONDS);
      }
      const header = {
        typ: "JWT",
        alg: "ES256"
      };
      const jwtPayload = {
        aud: audience,
        exp: expiration,
        sub: subject
      };
      const jwt = jws.sign({
        header,
        payload: jwtPayload,
        privateKey: toPEM(privateKey)
      });
      if (contentEncoding === WebPushConstants.supportedContentEncodings.AES_128_GCM) {
        return {
          Authorization: "vapid t=" + jwt + ", k=" + publicKey
        };
      }
      if (contentEncoding === WebPushConstants.supportedContentEncodings.AES_GCM) {
        return {
          Authorization: "WebPush " + jwt,
          "Crypto-Key": "p256ecdsa=" + publicKey
        };
      }
      throw new Error("Unsupported encoding type specified.");
    }
    module.exports = {
      generateVAPIDKeys,
      getFutureExpirationTimestamp,
      getVapidHeaders,
      validateSubject,
      validatePublicKey,
      validatePrivateKey,
      validateExpiration
    };
  }
});

// node_modules/http_ece/ece.js
var require_ece = __commonJS({
  "node_modules/http_ece/ece.js"(exports, module) {
    "use strict";
    var crypto = __require("crypto");
    var AES_GCM = "aes-128-gcm";
    var PAD_SIZE = { "aes128gcm": 1, "aesgcm": 2 };
    var TAG_LENGTH = 16;
    var KEY_LENGTH = 16;
    var NONCE_LENGTH = 12;
    var SHA_256_LENGTH = 32;
    var MODE_ENCRYPT = "encrypt";
    var MODE_DECRYPT = "decrypt";
    var keylog;
    if (process.env.ECE_KEYLOG === "1") {
      keylog = function(m2, k2) {
        console.warn(m2 + " [" + k2.length + "]: " + k2.toString("base64url"));
        return k2;
      };
    } else {
      keylog = function(m2, k2) {
        return k2;
      };
    }
    function decode(b2) {
      if (typeof b2 === "string") {
        return Buffer.from(b2, "base64url");
      }
      return b2;
    }
    function HMAC_hash(key, input) {
      var hmac = crypto.createHmac("sha256", key);
      hmac.update(input);
      return hmac.digest();
    }
    function HKDF_extract(salt, ikm) {
      keylog("salt", salt);
      keylog("ikm", ikm);
      return keylog("extract", HMAC_hash(salt, ikm));
    }
    function HKDF_expand(prk, info2, l) {
      keylog("prk", prk);
      keylog("info", info2);
      var output = Buffer.alloc(0);
      var T2 = Buffer.alloc(0);
      info2 = Buffer.from(info2, "ascii");
      var counter = 0;
      var cbuf = Buffer.alloc(1);
      while (output.length < l) {
        cbuf.writeUIntBE(++counter, 0, 1);
        T2 = HMAC_hash(prk, Buffer.concat([T2, info2, cbuf]));
        output = Buffer.concat([output, T2]);
      }
      return keylog("expand", output.slice(0, l));
    }
    function HKDF(salt, ikm, info2, len) {
      return HKDF_expand(HKDF_extract(salt, ikm), info2, len);
    }
    function info(base, context) {
      var result = Buffer.concat([
        Buffer.from("Content-Encoding: " + base + "\0", "ascii"),
        context
      ]);
      keylog("info " + base, result);
      return result;
    }
    function lengthPrefix(buffer) {
      var b2 = Buffer.concat([Buffer.alloc(2), buffer]);
      b2.writeUIntBE(buffer.length, 0, 2);
      return b2;
    }
    function extractDH(header, mode) {
      var key = header.privateKey;
      var senderPubKey, receiverPubKey;
      if (mode === MODE_ENCRYPT) {
        senderPubKey = key.getPublicKey();
        receiverPubKey = header.dh;
      } else if (mode === MODE_DECRYPT) {
        senderPubKey = header.dh;
        receiverPubKey = key.getPublicKey();
      } else {
        throw new Error("Unknown mode only " + MODE_ENCRYPT + " and " + MODE_DECRYPT + " supported");
      }
      return {
        secret: key.computeSecret(header.dh),
        context: Buffer.concat([
          Buffer.from(header.keylabel, "ascii"),
          Buffer.from([0]),
          lengthPrefix(receiverPubKey),
          // user agent
          lengthPrefix(senderPubKey)
          // application server
        ])
      };
    }
    function extractSecretAndContext(header, mode) {
      var result = { secret: null, context: Buffer.alloc(0) };
      if (header.key) {
        result.secret = header.key;
        if (result.secret.length !== KEY_LENGTH) {
          throw new Error("An explicit key must be " + KEY_LENGTH + " bytes");
        }
      } else if (header.dh) {
        result = extractDH(header, mode);
      } else if (typeof header.keyid !== void 0) {
        result.secret = header.keymap[header.keyid];
      }
      if (!result.secret) {
        throw new Error("Unable to determine key");
      }
      keylog("secret", result.secret);
      keylog("context", result.context);
      if (header.authSecret) {
        result.secret = HKDF(
          header.authSecret,
          result.secret,
          info("auth", Buffer.alloc(0)),
          SHA_256_LENGTH
        );
        keylog("authsecret", result.secret);
      }
      return result;
    }
    function webpushSecret(header, mode) {
      if (!header.authSecret) {
        throw new Error("No authentication secret for webpush");
      }
      keylog("authsecret", header.authSecret);
      var remotePubKey, senderPubKey, receiverPubKey;
      if (mode === MODE_ENCRYPT) {
        senderPubKey = header.privateKey.getPublicKey();
        remotePubKey = receiverPubKey = header.dh;
      } else if (mode === MODE_DECRYPT) {
        remotePubKey = senderPubKey = header.keyid;
        receiverPubKey = header.privateKey.getPublicKey();
      } else {
        throw new Error("Unknown mode only " + MODE_ENCRYPT + " and " + MODE_DECRYPT + " supported");
      }
      keylog("remote pubkey", remotePubKey);
      keylog("sender pubkey", senderPubKey);
      keylog("receiver pubkey", receiverPubKey);
      return keylog(
        "secret dh",
        HKDF(
          header.authSecret,
          header.privateKey.computeSecret(remotePubKey),
          Buffer.concat([
            Buffer.from("WebPush: info\0"),
            receiverPubKey,
            senderPubKey
          ]),
          SHA_256_LENGTH
        )
      );
    }
    function extractSecret(header, mode, keyLookupCallback) {
      if (keyLookupCallback) {
        if (!isFunction(keyLookupCallback)) {
          throw new Error("Callback is not a function");
        }
      }
      if (header.key) {
        if (header.key.length !== KEY_LENGTH) {
          throw new Error("An explicit key must be " + KEY_LENGTH + " bytes");
        }
        return keylog("secret key", header.key);
      }
      if (!header.privateKey) {
        if (!keyLookupCallback) {
          var key = header.keymap && header.keymap[header.keyid];
        } else {
          var key = keyLookupCallback(header.keyid);
        }
        if (!key) {
          throw new Error('No saved key (keyid: "' + header.keyid + '")');
        }
        return key;
      }
      return webpushSecret(header, mode);
    }
    function deriveKeyAndNonce(header, mode, lookupKeyCallback) {
      if (!header.salt) {
        throw new Error("must include a salt parameter for " + header.version);
      }
      var keyInfo;
      var nonceInfo;
      var secret;
      if (header.version === "aesgcm") {
        var s2 = extractSecretAndContext(header, mode, lookupKeyCallback);
        keyInfo = info("aesgcm", s2.context);
        nonceInfo = info("nonce", s2.context);
        secret = s2.secret;
      } else if (header.version === "aes128gcm") {
        keyInfo = Buffer.from("Content-Encoding: aes128gcm\0");
        nonceInfo = Buffer.from("Content-Encoding: nonce\0");
        secret = extractSecret(header, mode, lookupKeyCallback);
      } else {
        throw new Error("Unable to set context for mode " + header.version);
      }
      var prk = HKDF_extract(header.salt, secret);
      var result = {
        key: HKDF_expand(prk, keyInfo, KEY_LENGTH),
        nonce: HKDF_expand(prk, nonceInfo, NONCE_LENGTH)
      };
      keylog("key", result.key);
      keylog("nonce base", result.nonce);
      return result;
    }
    function parseParams(params) {
      var header = {};
      header.version = params.version || "aes128gcm";
      header.rs = parseInt(params.rs, 10);
      if (isNaN(header.rs)) {
        header.rs = 4096;
      }
      var overhead = PAD_SIZE[header.version];
      if (header.version === "aes128gcm") {
        overhead += TAG_LENGTH;
      }
      if (header.rs <= overhead) {
        throw new Error("The rs parameter has to be greater than " + overhead);
      }
      if (params.salt) {
        header.salt = decode(params.salt);
        if (header.salt.length !== KEY_LENGTH) {
          throw new Error("The salt parameter must be " + KEY_LENGTH + " bytes");
        }
      }
      header.keyid = params.keyid;
      if (params.key) {
        header.key = decode(params.key);
      } else {
        header.privateKey = params.privateKey;
        if (!header.privateKey) {
          header.keymap = params.keymap;
        }
        if (header.version !== "aes128gcm") {
          header.keylabel = params.keylabel || "P-256";
        }
        if (params.dh) {
          header.dh = decode(params.dh);
        }
      }
      if (params.authSecret) {
        header.authSecret = decode(params.authSecret);
      }
      return header;
    }
    function generateNonce(base, counter) {
      var nonce = Buffer.from(base);
      var m2 = nonce.readUIntBE(nonce.length - 6, 6);
      var x2 = ((m2 ^ counter) & 16777215) + ((m2 / 16777216 ^ counter / 16777216) & 16777215) * 16777216;
      nonce.writeUIntBE(x2, nonce.length - 6, 6);
      keylog("nonce" + counter, nonce);
      return nonce;
    }
    function readHeader(buffer, header) {
      var idsz = buffer.readUIntBE(20, 1);
      header.salt = buffer.slice(0, KEY_LENGTH);
      header.rs = buffer.readUIntBE(KEY_LENGTH, 4);
      header.keyid = buffer.slice(21, 21 + idsz);
      return 21 + idsz;
    }
    function unpadLegacy(data, version2) {
      var padSize = PAD_SIZE[version2];
      var pad = data.readUIntBE(0, padSize);
      if (pad + padSize > data.length) {
        throw new Error("padding exceeds block size");
      }
      keylog("padding", data.slice(0, padSize + pad));
      var padCheck = Buffer.alloc(pad);
      padCheck.fill(0);
      if (padCheck.compare(data.slice(padSize, padSize + pad)) !== 0) {
        throw new Error("invalid padding");
      }
      return data.slice(padSize + pad);
    }
    function unpad(data, last) {
      var i = data.length - 1;
      while (i >= 0) {
        if (data[i]) {
          if (last) {
            if (data[i] !== 2) {
              throw new Error("last record needs to start padding with a 2");
            }
          } else {
            if (data[i] !== 1) {
              throw new Error("last record needs to start padding with a 2");
            }
          }
          return data.slice(0, i);
        }
        --i;
      }
      throw new Error("all zero plaintext");
    }
    function decryptRecord(key, counter, buffer, header, last) {
      keylog("decrypt", buffer);
      var nonce = generateNonce(key.nonce, counter);
      var gcm = crypto.createDecipheriv(AES_GCM, key.key, nonce);
      gcm.setAuthTag(buffer.slice(buffer.length - TAG_LENGTH));
      var data = gcm.update(buffer.slice(0, buffer.length - TAG_LENGTH));
      data = Buffer.concat([data, gcm.final()]);
      keylog("decrypted", data);
      if (header.version !== "aes128gcm") {
        return unpadLegacy(data, header.version);
      }
      return unpad(data, last);
    }
    function decrypt(buffer, params, keyLookupCallback) {
      var header = parseParams(params);
      if (header.version === "aes128gcm") {
        var headerLength = readHeader(buffer, header);
        buffer = buffer.slice(headerLength);
      }
      var key = deriveKeyAndNonce(header, MODE_DECRYPT, keyLookupCallback);
      var start = 0;
      var result = Buffer.alloc(0);
      var chunkSize = header.rs;
      if (header.version !== "aes128gcm") {
        chunkSize += TAG_LENGTH;
      }
      for (var i = 0; start < buffer.length; ++i) {
        var end = start + chunkSize;
        if (header.version !== "aes128gcm" && end === buffer.length) {
          throw new Error("Truncated payload");
        }
        end = Math.min(end, buffer.length);
        if (end - start <= TAG_LENGTH) {
          throw new Error("Invalid block: too small at " + i);
        }
        var block = decryptRecord(
          key,
          i,
          buffer.slice(start, end),
          header,
          end >= buffer.length
        );
        result = Buffer.concat([result, block]);
        start = end;
      }
      return result;
    }
    function encryptRecord(key, counter, buffer, pad, header, last) {
      keylog("encrypt", buffer);
      pad = pad || 0;
      var nonce = generateNonce(key.nonce, counter);
      var gcm = crypto.createCipheriv(AES_GCM, key.key, nonce);
      var ciphertext = [];
      var padSize = PAD_SIZE[header.version];
      var padding = Buffer.alloc(pad + padSize);
      padding.fill(0);
      if (header.version !== "aes128gcm") {
        padding.writeUIntBE(pad, 0, padSize);
        keylog("padding", padding);
        ciphertext.push(gcm.update(padding));
        ciphertext.push(gcm.update(buffer));
        if (!last && padding.length + buffer.length < header.rs) {
          throw new Error("Unable to pad to record size");
        }
      } else {
        ciphertext.push(gcm.update(buffer));
        padding.writeUIntBE(last ? 2 : 1, 0, 1);
        keylog("padding", padding);
        ciphertext.push(gcm.update(padding));
      }
      gcm.final();
      var tag = gcm.getAuthTag();
      if (tag.length !== TAG_LENGTH) {
        throw new Error("invalid tag generated");
      }
      ciphertext.push(tag);
      return keylog("encrypted", Buffer.concat(ciphertext));
    }
    function writeHeader(header) {
      var ints = Buffer.alloc(5);
      var keyid = Buffer.from(header.keyid || []);
      if (keyid.length > 255) {
        throw new Error("keyid is too large");
      }
      ints.writeUIntBE(header.rs, 0, 4);
      ints.writeUIntBE(keyid.length, 4, 1);
      return Buffer.concat([header.salt, ints, keyid]);
    }
    function encrypt(buffer, params, keyLookupCallback) {
      if (!Buffer.isBuffer(buffer)) {
        throw new Error("buffer argument must be a Buffer");
      }
      var header = parseParams(params);
      if (!header.salt) {
        header.salt = crypto.randomBytes(KEY_LENGTH);
      }
      var result;
      if (header.version === "aes128gcm") {
        if (header.privateKey && !header.keyid) {
          header.keyid = header.privateKey.getPublicKey();
        }
        result = writeHeader(header);
      } else {
        result = Buffer.alloc(0);
      }
      var key = deriveKeyAndNonce(header, MODE_ENCRYPT, keyLookupCallback);
      var start = 0;
      var padSize = PAD_SIZE[header.version];
      var overhead = padSize;
      if (header.version === "aes128gcm") {
        overhead += TAG_LENGTH;
      }
      var pad = isNaN(parseInt(params.pad, 10)) ? 0 : parseInt(params.pad, 10);
      var counter = 0;
      var last = false;
      while (!last) {
        var recordPad = Math.min(header.rs - overhead - 1, pad);
        if (header.version !== "aes128gcm") {
          recordPad = Math.min((1 << padSize * 8) - 1, recordPad);
        }
        if (pad > 0 && recordPad === 0) {
          ++recordPad;
        }
        pad -= recordPad;
        var end = start + header.rs - overhead - recordPad;
        if (header.version !== "aes128gcm") {
          last = end > buffer.length;
        } else {
          last = end >= buffer.length;
        }
        last = last && pad <= 0;
        var block = encryptRecord(
          key,
          counter,
          buffer.slice(start, end),
          recordPad,
          header,
          last
        );
        result = Buffer.concat([result, block]);
        start = end;
        ++counter;
      }
      return result;
    }
    function isFunction(object) {
      return typeof object === "function";
    }
    module.exports = {
      decrypt,
      encrypt
    };
  }
});

// node_modules/web-push/src/encryption-helper.js
var require_encryption_helper = __commonJS({
  "node_modules/web-push/src/encryption-helper.js"(exports, module) {
    "use strict";
    var crypto = __require("crypto");
    var ece = require_ece();
    var encrypt = function(userPublicKey, userAuth, payload, contentEncoding) {
      if (!userPublicKey) {
        throw new Error("No user public key provided for encryption.");
      }
      if (typeof userPublicKey !== "string") {
        throw new Error("The subscription p256dh value must be a string.");
      }
      if (Buffer.from(userPublicKey, "base64url").length !== 65) {
        throw new Error("The subscription p256dh value should be 65 bytes long.");
      }
      if (!userAuth) {
        throw new Error("No user auth provided for encryption.");
      }
      if (typeof userAuth !== "string") {
        throw new Error("The subscription auth key must be a string.");
      }
      if (Buffer.from(userAuth, "base64url").length < 16) {
        throw new Error("The subscription auth key should be at least 16 bytes long");
      }
      if (typeof payload !== "string" && !Buffer.isBuffer(payload)) {
        throw new Error("Payload must be either a string or a Node Buffer.");
      }
      if (typeof payload === "string" || payload instanceof String) {
        payload = Buffer.from(payload);
      }
      const localCurve = crypto.createECDH("prime256v1");
      const localPublicKey = localCurve.generateKeys();
      const salt = crypto.randomBytes(16).toString("base64url");
      const cipherText = ece.encrypt(payload, {
        version: contentEncoding,
        dh: userPublicKey,
        privateKey: localCurve,
        salt,
        authSecret: userAuth
      });
      return {
        localPublicKey,
        salt,
        cipherText
      };
    };
    module.exports = {
      encrypt
    };
  }
});

// node_modules/web-push/src/web-push-error.js
var require_web_push_error = __commonJS({
  "node_modules/web-push/src/web-push-error.js"(exports, module) {
    "use strict";
    function WebPushError(message, statusCode, headers, body, endpoint) {
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
      this.message = message;
      this.statusCode = statusCode;
      this.headers = headers;
      this.body = body;
      this.endpoint = endpoint;
    }
    __require("util").inherits(WebPushError, Error);
    module.exports = WebPushError;
  }
});

// node_modules/ms/index.js
var require_ms = __commonJS({
  "node_modules/ms/index.js"(exports, module) {
    var s2 = 1e3;
    var m2 = s2 * 60;
    var h = m2 * 60;
    var d = h * 24;
    var w2 = d * 7;
    var y = d * 365.25;
    module.exports = function(val, options) {
      options = options || {};
      var type = typeof val;
      if (type === "string" && val.length > 0) {
        return parse(val);
      } else if (type === "number" && isFinite(val)) {
        return options.long ? fmtLong(val) : fmtShort(val);
      }
      throw new Error(
        "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
      );
    };
    function parse(str2) {
      str2 = String(str2);
      if (str2.length > 100) {
        return;
      }
      var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        str2
      );
      if (!match) {
        return;
      }
      var n = parseFloat(match[1]);
      var type = (match[2] || "ms").toLowerCase();
      switch (type) {
        case "years":
        case "year":
        case "yrs":
        case "yr":
        case "y":
          return n * y;
        case "weeks":
        case "week":
        case "w":
          return n * w2;
        case "days":
        case "day":
        case "d":
          return n * d;
        case "hours":
        case "hour":
        case "hrs":
        case "hr":
        case "h":
          return n * h;
        case "minutes":
        case "minute":
        case "mins":
        case "min":
        case "m":
          return n * m2;
        case "seconds":
        case "second":
        case "secs":
        case "sec":
        case "s":
          return n * s2;
        case "milliseconds":
        case "millisecond":
        case "msecs":
        case "msec":
        case "ms":
          return n;
        default:
          return void 0;
      }
    }
    function fmtShort(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return Math.round(ms / d) + "d";
      }
      if (msAbs >= h) {
        return Math.round(ms / h) + "h";
      }
      if (msAbs >= m2) {
        return Math.round(ms / m2) + "m";
      }
      if (msAbs >= s2) {
        return Math.round(ms / s2) + "s";
      }
      return ms + "ms";
    }
    function fmtLong(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return plural(ms, msAbs, d, "day");
      }
      if (msAbs >= h) {
        return plural(ms, msAbs, h, "hour");
      }
      if (msAbs >= m2) {
        return plural(ms, msAbs, m2, "minute");
      }
      if (msAbs >= s2) {
        return plural(ms, msAbs, s2, "second");
      }
      return ms + " ms";
    }
    function plural(ms, msAbs, n, name) {
      var isPlural = msAbs >= n * 1.5;
      return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
    }
  }
});

// node_modules/debug/src/common.js
var require_common = __commonJS({
  "node_modules/debug/src/common.js"(exports, module) {
    function setup(env) {
      createDebug.debug = createDebug;
      createDebug.default = createDebug;
      createDebug.coerce = coerce;
      createDebug.disable = disable;
      createDebug.enable = enable;
      createDebug.enabled = enabled;
      createDebug.humanize = require_ms();
      createDebug.destroy = destroy;
      Object.keys(env).forEach((key) => {
        createDebug[key] = env[key];
      });
      createDebug.names = [];
      createDebug.skips = [];
      createDebug.formatters = {};
      function selectColor(namespace) {
        let hash = 0;
        for (let i = 0; i < namespace.length; i++) {
          hash = (hash << 5) - hash + namespace.charCodeAt(i);
          hash |= 0;
        }
        return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
      }
      createDebug.selectColor = selectColor;
      function createDebug(namespace) {
        let prevTime;
        let enableOverride = null;
        let namespacesCache;
        let enabledCache;
        function debug(...args) {
          if (!debug.enabled) {
            return;
          }
          const self = debug;
          const curr = Number(/* @__PURE__ */ new Date());
          const ms = curr - (prevTime || curr);
          self.diff = ms;
          self.prev = prevTime;
          self.curr = curr;
          prevTime = curr;
          args[0] = createDebug.coerce(args[0]);
          if (typeof args[0] !== "string") {
            args.unshift("%O");
          }
          let index = 0;
          args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
            if (match === "%%") {
              return "%";
            }
            index++;
            const formatter = createDebug.formatters[format];
            if (typeof formatter === "function") {
              const val = args[index];
              match = formatter.call(self, val);
              args.splice(index, 1);
              index--;
            }
            return match;
          });
          createDebug.formatArgs.call(self, args);
          const logFn = self.log || createDebug.log;
          logFn.apply(self, args);
        }
        debug.namespace = namespace;
        debug.useColors = createDebug.useColors();
        debug.color = createDebug.selectColor(namespace);
        debug.extend = extend;
        debug.destroy = createDebug.destroy;
        Object.defineProperty(debug, "enabled", {
          enumerable: true,
          configurable: false,
          get: () => {
            if (enableOverride !== null) {
              return enableOverride;
            }
            if (namespacesCache !== createDebug.namespaces) {
              namespacesCache = createDebug.namespaces;
              enabledCache = createDebug.enabled(namespace);
            }
            return enabledCache;
          },
          set: (v2) => {
            enableOverride = v2;
          }
        });
        if (typeof createDebug.init === "function") {
          createDebug.init(debug);
        }
        return debug;
      }
      function extend(namespace, delimiter) {
        const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
        newDebug.log = this.log;
        return newDebug;
      }
      function enable(namespaces) {
        createDebug.save(namespaces);
        createDebug.namespaces = namespaces;
        createDebug.names = [];
        createDebug.skips = [];
        const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
        for (const ns of split) {
          if (ns[0] === "-") {
            createDebug.skips.push(ns.slice(1));
          } else {
            createDebug.names.push(ns);
          }
        }
      }
      function matchesTemplate(search, template) {
        let searchIndex = 0;
        let templateIndex = 0;
        let starIndex = -1;
        let matchIndex = 0;
        while (searchIndex < search.length) {
          if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) {
            if (template[templateIndex] === "*") {
              starIndex = templateIndex;
              matchIndex = searchIndex;
              templateIndex++;
            } else {
              searchIndex++;
              templateIndex++;
            }
          } else if (starIndex !== -1) {
            templateIndex = starIndex + 1;
            matchIndex++;
            searchIndex = matchIndex;
          } else {
            return false;
          }
        }
        while (templateIndex < template.length && template[templateIndex] === "*") {
          templateIndex++;
        }
        return templateIndex === template.length;
      }
      function disable() {
        const namespaces = [
          ...createDebug.names,
          ...createDebug.skips.map((namespace) => "-" + namespace)
        ].join(",");
        createDebug.enable("");
        return namespaces;
      }
      function enabled(name) {
        for (const skip of createDebug.skips) {
          if (matchesTemplate(name, skip)) {
            return false;
          }
        }
        for (const ns of createDebug.names) {
          if (matchesTemplate(name, ns)) {
            return true;
          }
        }
        return false;
      }
      function coerce(val) {
        if (val instanceof Error) {
          return val.stack || val.message;
        }
        return val;
      }
      function destroy() {
        console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
      }
      createDebug.enable(createDebug.load());
      return createDebug;
    }
    module.exports = setup;
  }
});

// node_modules/debug/src/browser.js
var require_browser = __commonJS({
  "node_modules/debug/src/browser.js"(exports, module) {
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.storage = localstorage();
    exports.destroy = /* @__PURE__ */ (() => {
      let warned = false;
      return () => {
        if (!warned) {
          warned = true;
          console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
        }
      };
    })();
    exports.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
        return false;
      }
      let m2;
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && (m2 = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m2[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function formatArgs(args) {
      args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
      if (!this.useColors) {
        return;
      }
      const c = "color: " + this.color;
      args.splice(1, 0, c, "color: inherit");
      let index = 0;
      let lastC = 0;
      args[0].replace(/%[a-zA-Z%]/g, (match) => {
        if (match === "%%") {
          return;
        }
        index++;
        if (match === "%c") {
          lastC = index;
        }
      });
      args.splice(lastC, 0, c);
    }
    exports.log = console.debug || console.log || (() => {
    });
    function save(namespaces) {
      try {
        if (namespaces) {
          exports.storage.setItem("debug", namespaces);
        } else {
          exports.storage.removeItem("debug");
        }
      } catch (error) {
      }
    }
    function load() {
      let r;
      try {
        r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
      } catch (error) {
      }
      if (!r && typeof process !== "undefined" && "env" in process) {
        r = process.env.DEBUG;
      }
      return r;
    }
    function localstorage() {
      try {
        return localStorage;
      } catch (error) {
      }
    }
    module.exports = require_common()(exports);
    var { formatters } = module.exports;
    formatters.j = function(v2) {
      try {
        return JSON.stringify(v2);
      } catch (error) {
        return "[UnexpectedJSONParseError]: " + error.message;
      }
    };
  }
});

// node_modules/debug/src/node.js
var require_node2 = __commonJS({
  "node_modules/debug/src/node.js"(exports, module) {
    var tty = __require("tty");
    var util = __require("util");
    exports.init = init;
    exports.log = log;
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.destroy = util.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    );
    exports.colors = [6, 2, 3, 4, 5, 1];
    try {
      const supportsColor = __require("supports-color");
      if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
        exports.colors = [
          20,
          21,
          26,
          27,
          32,
          33,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          56,
          57,
          62,
          63,
          68,
          69,
          74,
          75,
          76,
          77,
          78,
          79,
          80,
          81,
          92,
          93,
          98,
          99,
          112,
          113,
          128,
          129,
          134,
          135,
          148,
          149,
          160,
          161,
          162,
          163,
          164,
          165,
          166,
          167,
          168,
          169,
          170,
          171,
          172,
          173,
          178,
          179,
          184,
          185,
          196,
          197,
          198,
          199,
          200,
          201,
          202,
          203,
          204,
          205,
          206,
          207,
          208,
          209,
          214,
          215,
          220,
          221
        ];
      }
    } catch (error) {
    }
    exports.inspectOpts = Object.keys(process.env).filter((key) => {
      return /^debug_/i.test(key);
    }).reduce((obj2, key) => {
      const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_2, k2) => {
        return k2.toUpperCase();
      });
      let val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) {
        val = true;
      } else if (/^(no|off|false|disabled)$/i.test(val)) {
        val = false;
      } else if (val === "null") {
        val = null;
      } else {
        val = Number(val);
      }
      obj2[prop] = val;
      return obj2;
    }, {});
    function useColors() {
      return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty.isatty(process.stderr.fd);
    }
    function formatArgs(args) {
      const { namespace: name, useColors: useColors2 } = this;
      if (useColors2) {
        const c = this.color;
        const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
        const prefix = `  ${colorCode};1m${name} \x1B[0m`;
        args[0] = prefix + args[0].split("\n").join("\n" + prefix);
        args.push(colorCode + "m+" + module.exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args[0] = getDate() + name + " " + args[0];
      }
    }
    function getDate() {
      if (exports.inspectOpts.hideDate) {
        return "";
      }
      return (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function log(...args) {
      return process.stderr.write(util.formatWithOptions(exports.inspectOpts, ...args) + "\n");
    }
    function save(namespaces) {
      if (namespaces) {
        process.env.DEBUG = namespaces;
      } else {
        delete process.env.DEBUG;
      }
    }
    function load() {
      return process.env.DEBUG;
    }
    function init(debug) {
      debug.inspectOpts = {};
      const keys = Object.keys(exports.inspectOpts);
      for (let i = 0; i < keys.length; i++) {
        debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
      }
    }
    module.exports = require_common()(exports);
    var { formatters } = module.exports;
    formatters.o = function(v2) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v2, this.inspectOpts).split("\n").map((str2) => str2.trim()).join(" ");
    };
    formatters.O = function(v2) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v2, this.inspectOpts);
    };
  }
});

// node_modules/debug/src/index.js
var require_src = __commonJS({
  "node_modules/debug/src/index.js"(exports, module) {
    if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) {
      module.exports = require_browser();
    } else {
      module.exports = require_node2();
    }
  }
});

// node_modules/agent-base/dist/helpers.js
var require_helpers = __commonJS({
  "node_modules/agent-base/dist/helpers.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m2, k2, k22) {
      if (k22 === void 0) k22 = k2;
      var desc = Object.getOwnPropertyDescriptor(m2, k2);
      if (!desc || ("get" in desc ? !m2.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m2[k2];
        } };
      }
      Object.defineProperty(o, k22, desc);
    }) : (function(o, m2, k2, k22) {
      if (k22 === void 0) k22 = k2;
      o[k22] = m2[k2];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v2) {
      Object.defineProperty(o, "default", { enumerable: true, value: v2 });
    }) : function(o, v2) {
      o["default"] = v2;
    });
    var __importStar = exports && exports.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k2 in mod) if (k2 !== "default" && Object.prototype.hasOwnProperty.call(mod, k2)) __createBinding(result, mod, k2);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.req = exports.json = exports.toBuffer = void 0;
    var http = __importStar(__require("http"));
    var https = __importStar(__require("https"));
    async function toBuffer(stream2) {
      let length = 0;
      const chunks = [];
      for await (const chunk of stream2) {
        length += chunk.length;
        chunks.push(chunk);
      }
      return Buffer.concat(chunks, length);
    }
    exports.toBuffer = toBuffer;
    async function json(stream2) {
      const buf = await toBuffer(stream2);
      const str2 = buf.toString("utf8");
      try {
        return JSON.parse(str2);
      } catch (_err) {
        const err = _err;
        err.message += ` (input: ${str2})`;
        throw err;
      }
    }
    exports.json = json;
    function req(url, opts = {}) {
      const href = typeof url === "string" ? url : url.href;
      const req2 = (href.startsWith("https:") ? https : http).request(url, opts);
      const promise = new Promise((resolve8, reject) => {
        req2.once("response", resolve8).once("error", reject).end();
      });
      req2.then = promise.then.bind(promise);
      return req2;
    }
    exports.req = req;
  }
});

// node_modules/agent-base/dist/index.js
var require_dist = __commonJS({
  "node_modules/agent-base/dist/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m2, k2, k22) {
      if (k22 === void 0) k22 = k2;
      var desc = Object.getOwnPropertyDescriptor(m2, k2);
      if (!desc || ("get" in desc ? !m2.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m2[k2];
        } };
      }
      Object.defineProperty(o, k22, desc);
    }) : (function(o, m2, k2, k22) {
      if (k22 === void 0) k22 = k2;
      o[k22] = m2[k2];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v2) {
      Object.defineProperty(o, "default", { enumerable: true, value: v2 });
    }) : function(o, v2) {
      o["default"] = v2;
    });
    var __importStar = exports && exports.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k2 in mod) if (k2 !== "default" && Object.prototype.hasOwnProperty.call(mod, k2)) __createBinding(result, mod, k2);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __exportStar = exports && exports.__exportStar || function(m2, exports2) {
      for (var p2 in m2) if (p2 !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p2)) __createBinding(exports2, m2, p2);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Agent = void 0;
    var net = __importStar(__require("net"));
    var http = __importStar(__require("http"));
    var https_1 = __require("https");
    __exportStar(require_helpers(), exports);
    var INTERNAL = /* @__PURE__ */ Symbol("AgentBaseInternalState");
    var Agent = class extends http.Agent {
      constructor(opts) {
        super(opts);
        this[INTERNAL] = {};
      }
      /**
       * Determine whether this is an `http` or `https` request.
       */
      isSecureEndpoint(options) {
        if (options) {
          if (typeof options.secureEndpoint === "boolean") {
            return options.secureEndpoint;
          }
          if (typeof options.protocol === "string") {
            return options.protocol === "https:";
          }
        }
        const { stack } = new Error();
        if (typeof stack !== "string")
          return false;
        return stack.split("\n").some((l) => l.indexOf("(https.js:") !== -1 || l.indexOf("node:https:") !== -1);
      }
      // In order to support async signatures in `connect()` and Node's native
      // connection pooling in `http.Agent`, the array of sockets for each origin
      // has to be updated synchronously. This is so the length of the array is
      // accurate when `addRequest()` is next called. We achieve this by creating a
      // fake socket and adding it to `sockets[origin]` and incrementing
      // `totalSocketCount`.
      incrementSockets(name) {
        if (this.maxSockets === Infinity && this.maxTotalSockets === Infinity) {
          return null;
        }
        if (!this.sockets[name]) {
          this.sockets[name] = [];
        }
        const fakeSocket = new net.Socket({ writable: false });
        this.sockets[name].push(fakeSocket);
        this.totalSocketCount++;
        return fakeSocket;
      }
      decrementSockets(name, socket) {
        if (!this.sockets[name] || socket === null) {
          return;
        }
        const sockets = this.sockets[name];
        const index = sockets.indexOf(socket);
        if (index !== -1) {
          sockets.splice(index, 1);
          this.totalSocketCount--;
          if (sockets.length === 0) {
            delete this.sockets[name];
          }
        }
      }
      // In order to properly update the socket pool, we need to call `getName()` on
      // the core `https.Agent` if it is a secureEndpoint.
      getName(options) {
        const secureEndpoint = this.isSecureEndpoint(options);
        if (secureEndpoint) {
          return https_1.Agent.prototype.getName.call(this, options);
        }
        return super.getName(options);
      }
      createSocket(req, options, cb) {
        const connectOpts = {
          ...options,
          secureEndpoint: this.isSecureEndpoint(options)
        };
        const name = this.getName(connectOpts);
        const fakeSocket = this.incrementSockets(name);
        Promise.resolve().then(() => this.connect(req, connectOpts)).then((socket) => {
          this.decrementSockets(name, fakeSocket);
          if (socket instanceof http.Agent) {
            try {
              return socket.addRequest(req, connectOpts);
            } catch (err) {
              return cb(err);
            }
          }
          this[INTERNAL].currentSocket = socket;
          super.createSocket(req, options, cb);
        }, (err) => {
          this.decrementSockets(name, fakeSocket);
          cb(err);
        });
      }
      createConnection() {
        const socket = this[INTERNAL].currentSocket;
        this[INTERNAL].currentSocket = void 0;
        if (!socket) {
          throw new Error("No socket was returned in the `connect()` function");
        }
        return socket;
      }
      get defaultPort() {
        return this[INTERNAL].defaultPort ?? (this.protocol === "https:" ? 443 : 80);
      }
      set defaultPort(v2) {
        if (this[INTERNAL]) {
          this[INTERNAL].defaultPort = v2;
        }
      }
      get protocol() {
        return this[INTERNAL].protocol ?? (this.isSecureEndpoint() ? "https:" : "http:");
      }
      set protocol(v2) {
        if (this[INTERNAL]) {
          this[INTERNAL].protocol = v2;
        }
      }
    };
    exports.Agent = Agent;
  }
});

// node_modules/https-proxy-agent/dist/parse-proxy-response.js
var require_parse_proxy_response = __commonJS({
  "node_modules/https-proxy-agent/dist/parse-proxy-response.js"(exports) {
    "use strict";
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parseProxyResponse = void 0;
    var debug_1 = __importDefault(require_src());
    var debug = (0, debug_1.default)("https-proxy-agent:parse-proxy-response");
    function parseProxyResponse(socket) {
      return new Promise((resolve8, reject) => {
        let buffersLength = 0;
        const buffers = [];
        function read() {
          const b2 = socket.read();
          if (b2)
            ondata(b2);
          else
            socket.once("readable", read);
        }
        function cleanup() {
          socket.removeListener("end", onend);
          socket.removeListener("error", onerror);
          socket.removeListener("readable", read);
        }
        function onend() {
          cleanup();
          debug("onend");
          reject(new Error("Proxy connection ended before receiving CONNECT response"));
        }
        function onerror(err) {
          cleanup();
          debug("onerror %o", err);
          reject(err);
        }
        function ondata(b2) {
          buffers.push(b2);
          buffersLength += b2.length;
          const buffered = Buffer.concat(buffers, buffersLength);
          const endOfHeaders = buffered.indexOf("\r\n\r\n");
          if (endOfHeaders === -1) {
            debug("have not received end of HTTP headers yet...");
            read();
            return;
          }
          const headerParts = buffered.slice(0, endOfHeaders).toString("ascii").split("\r\n");
          const firstLine = headerParts.shift();
          if (!firstLine) {
            socket.destroy();
            return reject(new Error("No header received from proxy CONNECT response"));
          }
          const firstLineParts = firstLine.split(" ");
          const statusCode = +firstLineParts[1];
          const statusText = firstLineParts.slice(2).join(" ");
          const headers = {};
          for (const header of headerParts) {
            if (!header)
              continue;
            const firstColon = header.indexOf(":");
            if (firstColon === -1) {
              socket.destroy();
              return reject(new Error(`Invalid header from proxy CONNECT response: "${header}"`));
            }
            const key = header.slice(0, firstColon).toLowerCase();
            const value = header.slice(firstColon + 1).trimStart();
            const current = headers[key];
            if (typeof current === "string") {
              headers[key] = [current, value];
            } else if (Array.isArray(current)) {
              current.push(value);
            } else {
              headers[key] = value;
            }
          }
          debug("got proxy server response: %o %o", firstLine, headers);
          cleanup();
          resolve8({
            connect: {
              statusCode,
              statusText,
              headers
            },
            buffered
          });
        }
        socket.on("error", onerror);
        socket.on("end", onend);
        read();
      });
    }
    exports.parseProxyResponse = parseProxyResponse;
  }
});

// node_modules/https-proxy-agent/dist/index.js
var require_dist2 = __commonJS({
  "node_modules/https-proxy-agent/dist/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m2, k2, k22) {
      if (k22 === void 0) k22 = k2;
      var desc = Object.getOwnPropertyDescriptor(m2, k2);
      if (!desc || ("get" in desc ? !m2.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m2[k2];
        } };
      }
      Object.defineProperty(o, k22, desc);
    }) : (function(o, m2, k2, k22) {
      if (k22 === void 0) k22 = k2;
      o[k22] = m2[k2];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v2) {
      Object.defineProperty(o, "default", { enumerable: true, value: v2 });
    }) : function(o, v2) {
      o["default"] = v2;
    });
    var __importStar = exports && exports.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k2 in mod) if (k2 !== "default" && Object.prototype.hasOwnProperty.call(mod, k2)) __createBinding(result, mod, k2);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.HttpsProxyAgent = void 0;
    var net = __importStar(__require("net"));
    var tls = __importStar(__require("tls"));
    var assert_1 = __importDefault(__require("assert"));
    var debug_1 = __importDefault(require_src());
    var agent_base_1 = require_dist();
    var url_1 = __require("url");
    var parse_proxy_response_1 = require_parse_proxy_response();
    var debug = (0, debug_1.default)("https-proxy-agent");
    var setServernameFromNonIpHost = (options) => {
      if (options.servername === void 0 && options.host && !net.isIP(options.host)) {
        return {
          ...options,
          servername: options.host
        };
      }
      return options;
    };
    var HttpsProxyAgent = class extends agent_base_1.Agent {
      constructor(proxy, opts) {
        super(opts);
        this.options = { path: void 0 };
        this.proxy = typeof proxy === "string" ? new url_1.URL(proxy) : proxy;
        this.proxyHeaders = opts?.headers ?? {};
        debug("Creating new HttpsProxyAgent instance: %o", this.proxy.href);
        const host = (this.proxy.hostname || this.proxy.host).replace(/^\[|\]$/g, "");
        const port = this.proxy.port ? parseInt(this.proxy.port, 10) : this.proxy.protocol === "https:" ? 443 : 80;
        this.connectOpts = {
          // Attempt to negotiate http/1.1 for proxy servers that support http/2
          ALPNProtocols: ["http/1.1"],
          ...opts ? omit(opts, "headers") : null,
          host,
          port
        };
      }
      /**
       * Called when the node-core HTTP client library is creating a
       * new HTTP request.
       */
      async connect(req, opts) {
        const { proxy } = this;
        if (!opts.host) {
          throw new TypeError('No "host" provided');
        }
        let socket;
        if (proxy.protocol === "https:") {
          debug("Creating `tls.Socket`: %o", this.connectOpts);
          socket = tls.connect(setServernameFromNonIpHost(this.connectOpts));
        } else {
          debug("Creating `net.Socket`: %o", this.connectOpts);
          socket = net.connect(this.connectOpts);
        }
        const headers = typeof this.proxyHeaders === "function" ? this.proxyHeaders() : { ...this.proxyHeaders };
        const host = net.isIPv6(opts.host) ? `[${opts.host}]` : opts.host;
        let payload = `CONNECT ${host}:${opts.port} HTTP/1.1\r
`;
        if (proxy.username || proxy.password) {
          const auth = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
          headers["Proxy-Authorization"] = `Basic ${Buffer.from(auth).toString("base64")}`;
        }
        headers.Host = `${host}:${opts.port}`;
        if (!headers["Proxy-Connection"]) {
          headers["Proxy-Connection"] = this.keepAlive ? "Keep-Alive" : "close";
        }
        for (const name of Object.keys(headers)) {
          payload += `${name}: ${headers[name]}\r
`;
        }
        const proxyResponsePromise = (0, parse_proxy_response_1.parseProxyResponse)(socket);
        socket.write(`${payload}\r
`);
        const { connect, buffered } = await proxyResponsePromise;
        req.emit("proxyConnect", connect);
        this.emit("proxyConnect", connect, req);
        if (connect.statusCode === 200) {
          req.once("socket", resume);
          if (opts.secureEndpoint) {
            debug("Upgrading socket connection to TLS");
            return tls.connect({
              ...omit(setServernameFromNonIpHost(opts), "host", "path", "port"),
              socket
            });
          }
          return socket;
        }
        socket.destroy();
        const fakeSocket = new net.Socket({ writable: false });
        fakeSocket.readable = true;
        req.once("socket", (s2) => {
          debug("Replaying proxy buffer for failed request");
          (0, assert_1.default)(s2.listenerCount("data") > 0);
          s2.push(buffered);
          s2.push(null);
        });
        return fakeSocket;
      }
    };
    HttpsProxyAgent.protocols = ["http", "https"];
    exports.HttpsProxyAgent = HttpsProxyAgent;
    function resume(socket) {
      socket.resume();
    }
    function omit(obj2, ...keys) {
      const ret = {};
      let key;
      for (key in obj2) {
        if (!keys.includes(key)) {
          ret[key] = obj2[key];
        }
      }
      return ret;
    }
  }
});

// node_modules/web-push/src/web-push-lib.js
var require_web_push_lib = __commonJS({
  "node_modules/web-push/src/web-push-lib.js"(exports, module) {
    "use strict";
    var url = __require("url");
    var https = __require("https");
    var WebPushError = require_web_push_error();
    var vapidHelper = require_vapid_helper();
    var encryptionHelper = require_encryption_helper();
    var webPushConstants = require_web_push_constants();
    var urlBase64Helper = require_urlsafe_base64_helper();
    var DEFAULT_TTL = 2419200;
    var gcmAPIKey = "";
    var vapidDetails;
    function WebPushLib() {
    }
    WebPushLib.prototype.setGCMAPIKey = function(apiKey) {
      if (apiKey === null) {
        gcmAPIKey = null;
        return;
      }
      if (typeof apiKey === "undefined" || typeof apiKey !== "string" || apiKey.length === 0) {
        throw new Error("The GCM API Key should be a non-empty string or null.");
      }
      gcmAPIKey = apiKey;
    };
    WebPushLib.prototype.setVapidDetails = function(subject, publicKey, privateKey) {
      if (arguments.length === 1 && arguments[0] === null) {
        vapidDetails = null;
        return;
      }
      vapidHelper.validateSubject(subject);
      vapidHelper.validatePublicKey(publicKey);
      vapidHelper.validatePrivateKey(privateKey);
      vapidDetails = {
        subject,
        publicKey,
        privateKey
      };
    };
    WebPushLib.prototype.generateRequestDetails = function(subscription, payload, options) {
      if (!subscription || !subscription.endpoint) {
        throw new Error("You must pass in a subscription with at least an endpoint.");
      }
      if (typeof subscription.endpoint !== "string" || subscription.endpoint.length === 0) {
        throw new Error("The subscription endpoint must be a string with a valid URL.");
      }
      if (payload) {
        if (typeof subscription !== "object" || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
          throw new Error("To send a message with a payload, the subscription must have 'auth' and 'p256dh' keys.");
        }
      }
      let currentGCMAPIKey = gcmAPIKey;
      let currentVapidDetails = vapidDetails;
      let timeToLive = DEFAULT_TTL;
      let extraHeaders = {};
      let contentEncoding = webPushConstants.supportedContentEncodings.AES_128_GCM;
      let urgency = webPushConstants.supportedUrgency.NORMAL;
      let topic;
      let proxy;
      let agent;
      let timeout;
      if (options) {
        const validOptionKeys = [
          "headers",
          "gcmAPIKey",
          "vapidDetails",
          "TTL",
          "contentEncoding",
          "urgency",
          "topic",
          "proxy",
          "agent",
          "timeout"
        ];
        const optionKeys = Object.keys(options);
        for (let i = 0; i < optionKeys.length; i += 1) {
          const optionKey = optionKeys[i];
          if (!validOptionKeys.includes(optionKey)) {
            throw new Error("'" + optionKey + "' is an invalid option. The valid options are ['" + validOptionKeys.join("', '") + "'].");
          }
        }
        if (options.headers) {
          extraHeaders = options.headers;
          let duplicates = Object.keys(extraHeaders).filter(function(header) {
            return typeof options[header] !== "undefined";
          });
          if (duplicates.length > 0) {
            throw new Error("Duplicated headers defined [" + duplicates.join(",") + "]. Please either define the header in thetop level options OR in the 'headers' key.");
          }
        }
        if (options.gcmAPIKey) {
          currentGCMAPIKey = options.gcmAPIKey;
        }
        if (options.vapidDetails !== void 0) {
          currentVapidDetails = options.vapidDetails;
        }
        if (options.TTL !== void 0) {
          timeToLive = Number(options.TTL);
          if (timeToLive < 0) {
            throw new Error("TTL should be a number and should be at least 0");
          }
        }
        if (options.contentEncoding) {
          if (options.contentEncoding === webPushConstants.supportedContentEncodings.AES_128_GCM || options.contentEncoding === webPushConstants.supportedContentEncodings.AES_GCM) {
            contentEncoding = options.contentEncoding;
          } else {
            throw new Error("Unsupported content encoding specified.");
          }
        }
        if (options.urgency) {
          if (options.urgency === webPushConstants.supportedUrgency.VERY_LOW || options.urgency === webPushConstants.supportedUrgency.LOW || options.urgency === webPushConstants.supportedUrgency.NORMAL || options.urgency === webPushConstants.supportedUrgency.HIGH) {
            urgency = options.urgency;
          } else {
            throw new Error("Unsupported urgency specified.");
          }
        }
        if (options.topic) {
          if (!urlBase64Helper.validate(options.topic)) {
            throw new Error("Unsupported characters set use the URL or filename-safe Base64 characters set");
          }
          if (options.topic.length > 32) {
            throw new Error("use maximum of 32 characters from the URL or filename-safe Base64 characters set");
          }
          topic = options.topic;
        }
        if (options.proxy) {
          if (typeof options.proxy === "string" || typeof options.proxy.host === "string") {
            proxy = options.proxy;
          } else {
            console.warn("Attempt to use proxy option, but invalid type it should be a string or proxy options object.");
          }
        }
        if (options.agent) {
          if (options.agent instanceof https.Agent) {
            if (proxy) {
              console.warn("Agent option will be ignored because proxy option is defined.");
            }
            agent = options.agent;
          } else {
            console.warn("Wrong type for the agent option, it should be an instance of https.Agent.");
          }
        }
        if (typeof options.timeout === "number") {
          timeout = options.timeout;
        }
      }
      if (typeof timeToLive === "undefined") {
        timeToLive = DEFAULT_TTL;
      }
      const requestDetails = {
        method: "POST",
        headers: {
          TTL: timeToLive
        }
      };
      Object.keys(extraHeaders).forEach(function(header) {
        requestDetails.headers[header] = extraHeaders[header];
      });
      let requestPayload = null;
      if (payload) {
        const encrypted = encryptionHelper.encrypt(subscription.keys.p256dh, subscription.keys.auth, payload, contentEncoding);
        requestDetails.headers["Content-Length"] = encrypted.cipherText.length;
        requestDetails.headers["Content-Type"] = "application/octet-stream";
        if (contentEncoding === webPushConstants.supportedContentEncodings.AES_128_GCM) {
          requestDetails.headers["Content-Encoding"] = webPushConstants.supportedContentEncodings.AES_128_GCM;
        } else if (contentEncoding === webPushConstants.supportedContentEncodings.AES_GCM) {
          requestDetails.headers["Content-Encoding"] = webPushConstants.supportedContentEncodings.AES_GCM;
          requestDetails.headers.Encryption = "salt=" + encrypted.salt;
          requestDetails.headers["Crypto-Key"] = "dh=" + encrypted.localPublicKey.toString("base64url");
        }
        requestPayload = encrypted.cipherText;
      } else {
        requestDetails.headers["Content-Length"] = 0;
      }
      const isGCM = subscription.endpoint.startsWith("https://android.googleapis.com/gcm/send");
      const isFCM = subscription.endpoint.startsWith("https://fcm.googleapis.com/fcm/send");
      if (isGCM) {
        if (!currentGCMAPIKey) {
          console.warn("Attempt to send push notification to GCM endpoint, but no GCM key is defined. Please use setGCMApiKey() or add 'gcmAPIKey' as an option.");
        } else {
          requestDetails.headers.Authorization = "key=" + currentGCMAPIKey;
        }
      } else if (currentVapidDetails) {
        const parsedUrl = url.parse(subscription.endpoint);
        const audience = parsedUrl.protocol + "//" + parsedUrl.host;
        const vapidHeaders = vapidHelper.getVapidHeaders(
          audience,
          currentVapidDetails.subject,
          currentVapidDetails.publicKey,
          currentVapidDetails.privateKey,
          contentEncoding
        );
        requestDetails.headers.Authorization = vapidHeaders.Authorization;
        if (contentEncoding === webPushConstants.supportedContentEncodings.AES_GCM) {
          if (requestDetails.headers["Crypto-Key"]) {
            requestDetails.headers["Crypto-Key"] += ";" + vapidHeaders["Crypto-Key"];
          } else {
            requestDetails.headers["Crypto-Key"] = vapidHeaders["Crypto-Key"];
          }
        }
      } else if (isFCM && currentGCMAPIKey) {
        requestDetails.headers.Authorization = "key=" + currentGCMAPIKey;
      }
      requestDetails.headers.Urgency = urgency;
      if (topic) {
        requestDetails.headers.Topic = topic;
      }
      requestDetails.body = requestPayload;
      requestDetails.endpoint = subscription.endpoint;
      if (proxy) {
        requestDetails.proxy = proxy;
      }
      if (agent) {
        requestDetails.agent = agent;
      }
      if (timeout) {
        requestDetails.timeout = timeout;
      }
      return requestDetails;
    };
    WebPushLib.prototype.sendNotification = function(subscription, payload, options) {
      let requestDetails;
      try {
        requestDetails = this.generateRequestDetails(subscription, payload, options);
      } catch (err) {
        return Promise.reject(err);
      }
      return new Promise(function(resolve8, reject) {
        const httpsOptions = {};
        const urlParts = url.parse(requestDetails.endpoint);
        httpsOptions.hostname = urlParts.hostname;
        httpsOptions.port = urlParts.port;
        httpsOptions.path = urlParts.path;
        httpsOptions.headers = requestDetails.headers;
        httpsOptions.method = requestDetails.method;
        if (requestDetails.timeout) {
          httpsOptions.timeout = requestDetails.timeout;
        }
        if (requestDetails.agent) {
          httpsOptions.agent = requestDetails.agent;
        }
        if (requestDetails.proxy) {
          const { HttpsProxyAgent } = require_dist2();
          httpsOptions.agent = new HttpsProxyAgent(requestDetails.proxy);
        }
        const pushRequest = https.request(httpsOptions, function(pushResponse) {
          let responseText = "";
          pushResponse.on("data", function(chunk) {
            responseText += chunk;
          });
          pushResponse.on("end", function() {
            if (pushResponse.statusCode < 200 || pushResponse.statusCode > 299) {
              reject(new WebPushError(
                "Received unexpected response code",
                pushResponse.statusCode,
                pushResponse.headers,
                responseText,
                requestDetails.endpoint
              ));
            } else {
              resolve8({
                statusCode: pushResponse.statusCode,
                body: responseText,
                headers: pushResponse.headers
              });
            }
          });
        });
        if (requestDetails.timeout) {
          pushRequest.on("timeout", function() {
            pushRequest.destroy(new Error("Socket timeout"));
          });
        }
        pushRequest.on("error", function(e) {
          reject(e);
        });
        if (requestDetails.body) {
          pushRequest.write(requestDetails.body);
        }
        pushRequest.end();
      });
    };
    module.exports = WebPushLib;
  }
});

// node_modules/web-push/src/index.js
var require_src2 = __commonJS({
  "node_modules/web-push/src/index.js"(exports, module) {
    "use strict";
    var vapidHelper = require_vapid_helper();
    var encryptionHelper = require_encryption_helper();
    var WebPushLib = require_web_push_lib();
    var WebPushError = require_web_push_error();
    var WebPushConstants = require_web_push_constants();
    var webPush = new WebPushLib();
    module.exports = {
      WebPushError,
      supportedContentEncodings: WebPushConstants.supportedContentEncodings,
      encrypt: encryptionHelper.encrypt,
      getVapidHeaders: vapidHelper.getVapidHeaders,
      generateVAPIDKeys: vapidHelper.generateVAPIDKeys,
      setGCMAPIKey: webPush.setGCMAPIKey,
      setVapidDetails: webPush.setVapidDetails,
      generateRequestDetails: webPush.generateRequestDetails,
      sendNotification: webPush.sendNotification.bind(webPush)
    };
  }
});

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP2 = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP2;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path) {
      const ctrl = callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP2;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path) {
      const ctrl = await callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key, node, path);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path);
      return void 0;
    }
    function replaceNode(key, path, node) {
      const parent = path[path.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version2] = parts;
            if (version2 === "1.1" || version2 === "1.2") {
              this.yaml.version = version2;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version2);
              onError(6, `Unsupported YAML version ${version2}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj2, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k2 of Array.from(val.keys())) {
            const v0 = val.get(k2);
            const v1 = applyReviver(reviver, val, k2, v0);
            if (v1 === void 0)
              val.delete(k2);
            else if (v1 !== v0)
              val.set(k2, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k2, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k2, v0);
            if (v1 === void 0)
              delete val[k2];
            else if (v1 !== v0)
              val[k2] = v1;
          }
        }
      }
      return reviver.call(obj2, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v2, i) => toJS(v2, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        if (found && ctx) {
          const { anchors: anchors2, doc: doc2, maxAliasCount } = ctx;
          let data = anchors2.get(found);
          if (!data) {
            toJS.toJS(found, null, ctx);
            data = anchors2.get(found);
          }
          if (data?.res === void 0) {
            const msg = "This should not happen: Alias anchor was not resolved?";
            throw new ReferenceError(msg);
          }
          if (maxAliasCount >= 0) {
            data.count += 1;
            if (data.aliasCount === 0)
              data.aliasCount = getAliasCount(doc2, found, anchors2);
            if (data.count * data.aliasCount > maxAliasCount) {
              const msg = "Excessive alias count indicates a resource exhaustion attack";
              throw new ReferenceError(msg);
            }
          }
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const source = this.resolve(ctx.doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        return ctx.anchors.get(source).res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v2 = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k2 = path[i];
        if (typeof k2 === "number" && Number.isInteger(k2) && k2 >= 0) {
          const a = [];
          a[k2] = v2;
          v2 = a;
        } else {
          v2 = /* @__PURE__ */ new Map([[k2, v2]]);
        }
      }
      return createNode.createNode(v2, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key, ...rest] = path;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str2) => str2.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str2, indent, comment) => str2.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str2.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str2) => /^(%|---|\.\.\.)/m.test(str2);
    function lineLengthOverLimit(str2, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str2.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str2[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str2 = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str2 += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str2 += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str2 += "\\0";
                    break;
                  case "0007":
                    str2 += "\\a";
                    break;
                  case "000b":
                    str2 += "\\v";
                    break;
                  case "001b":
                    str2 += "\\e";
                    break;
                  case "0085":
                    str2 += "\\N";
                    break;
                  case "00a0":
                    str2 += "\\_";
                    break;
                  case "2028":
                    str2 += "\\L";
                    break;
                  case "2029":
                    str2 += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str2 += "\\x" + code.substr(2);
                    else
                      str2 += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str2 += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str2 += "\n";
                  i += 2;
                }
                str2 += indent;
                if (json[i + 2] === " ")
                  str2 += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str2 = start ? str2 + json.slice(start) : json;
      return implicitKey ? str2 : foldFlowLines.foldFlowLines(str2, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str2 = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str2);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str2 : foldFlowLines.foldFlowLines(str2, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj2;
      if (identity.isScalar(item)) {
        obj2 = item.value;
        let match = tags.filter((t) => t.identify?.(obj2));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj2 = item;
        tagObj = tags.find((t) => t.nodeClass && obj2 instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj2?.constructor?.name ?? (obj2 === null ? "null" : typeof obj2);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify3(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str2 = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str2;
      return identity.isScalar(node) || str2[0] === "{" || str2[0] === "[" ? `${props} ${str2}` : `${props}
${ctx.indent}${str2}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify3;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify3 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str2 = stringify3.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str2.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str2 === "" ? "?" : explicitKey ? `? ${str2}` : str2;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str2 = `? ${str2}`;
        if (keyComment && !keyCommentDone) {
          str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str2;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
        str2 = `? ${str2}
${indent}:`;
      } else {
        str2 = `${str2}:`;
        if (keyComment)
          str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str2.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify3.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str2 += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str2;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify3 = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify3.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k2 = createNode.createNode(key, void 0, ctx);
      const v2 = createNode.createNode(value, void 0, ctx);
      return new Pair(k2, v2);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_2, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify3 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify4 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify4(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str3 = stringify3.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str3 += stringifyComment.lineComment(str3, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str3);
      }
      let str2;
      if (lines.length === 0) {
        str2 = flowChars.start + flowChars.end;
      } else {
        str2 = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str2 += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str2 += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str2;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str2 = stringify3.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str2.includes("\n"));
        if (i < items.length - 1) {
          str2 += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str2.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str2 += ",";
          }
        }
        if (comment)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment));
        lines.push(str2);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str2 = start;
          for (const line of lines)
            str2 += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str2}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k2 = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k2)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k2)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj2, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj2, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj2 instanceof Map) {
          for (const [key, value] of obj2)
            add(key, value);
        } else if (obj2 && typeof obj2 === "object") {
          for (const key of Object.keys(obj2))
            add(key, obj2[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_2, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj2, ctx) => YAMLMap.YAMLMap.from(schema, obj2, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_2, ctx) {
        const seq2 = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq2);
        let i = 0;
        for (const item of this.items)
          seq2.push(toJS.toJS(item, String(i++), ctx));
        return seq2;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj2, ctx) {
        const { replacer } = ctx;
        const seq2 = new this(schema);
        if (obj2 && Symbol.iterator in Object(obj2)) {
          let i = 0;
          for (let it of obj2) {
            if (typeof replacer === "function") {
              const key = obj2 instanceof Set ? it : String(i++);
              it = replacer.call(obj2, key, it);
            }
            seq2.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq2;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq2 = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq3, onError) {
        if (!identity.isSeq(seq3))
          onError("Expected a sequence for this tag");
        return seq3;
      },
      createNode: (schema, obj2, ctx) => YAMLSeq.YAMLSeq.from(schema, obj2, ctx)
    };
    exports.seq = seq2;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str2) => str2,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str2) => new Scalar.Scalar(str2[0] === "t" || str2[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str2) => str2.slice(-3).toLowerCase() === "nan" ? NaN : str2[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str2) => parseFloat(str2),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str2) {
        const node = new Scalar.Scalar(parseFloat(str2));
        const dot = str2.indexOf(".");
        if (dot !== -1 && str2[str2.length - 1] === "0")
          node.minFractionDigits = str2.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str2, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str2) : parseInt(str2.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq2 = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq2.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq2 = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str2) => str2,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str2) => str2 === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str2, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str2) : parseInt(str2, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str2) => parseFloat(str2),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str2, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str2)}`);
        return str2;
      }
    };
    var schema = [map.map, seq2.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str2 = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str2.length);
          for (let i = 0; i < str2.length; ++i)
            buffer[i] = str2.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str2;
        if (typeof node_buffer.Buffer === "function") {
          str2 = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s2 = "";
          for (let i = 0; i < buf.length; ++i)
            s2 += String.fromCharCode(buf[i]);
          str2 = btoa(s2);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str2.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str2.substr(o, lineWidth);
          }
          str2 = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str2 }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq2, onError) {
      if (identity.isSeq(seq2)) {
        for (let i = 0; i < seq2.items.length; ++i) {
          let item = seq2.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq2.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq2;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_2, ctx) {
        if (!ctx)
          return super.toJSON(_2);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq2, onError) {
        const pairs$1 = pairs.resolvePairs(seq2, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str2) => str2.slice(-3).toLowerCase() === "nan" ? NaN : str2[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str2) => parseFloat(str2.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str2) {
        const node = new Scalar.Scalar(parseFloat(str2.replace(/_/g, "")));
        const dot = str2.indexOf(".");
        if (dot !== -1) {
          const f2 = str2.substring(dot + 1).replace(/_/g, "");
          if (f2[f2.length - 1] === "0")
            node.minFractionDigits = f2.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str2, offset, radix, { intAsBigInt }) {
      const sign = str2[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str2 = str2.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str2 = `0b${str2}`;
            break;
          case 8:
            str2 = `0o${str2}`;
            break;
          case 16:
            str2 = `0x${str2}`;
            break;
        }
        const n2 = BigInt(str2);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str2, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str2 = value.toString(radix);
        return value < 0 ? "-" + prefix + str2.substr(1) : prefix + str2;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_2, ctx) {
        return super.toJSON(_2, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str2, asBigInt) {
      const sign = str2[0];
      const parts = sign === "-" || sign === "+" ? str2.substring(1) : str2;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p2) => res2 * num(60) + num(p2), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str2, _onError, { intAsBigInt }) => parseSexagesimal(str2, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str2) => parseSexagesimal(str2, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str2) {
        const match = str2.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq2 = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq2.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq2 = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq2.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq2.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq2 = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b2) => a.key < b2.key ? -1 : a.key > b2.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq2.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify3 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir3 = doc.directives.toString(doc);
        if (dir3) {
          lines.push(dir3);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify3.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify3.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify3.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version: version2 } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version2 = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version: version2 });
        this.setSchema(version2, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v2) => typeof v2 === "number" || v2 instanceof String || v2 instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k2 = this.createNode(key, null, options);
        const v2 = this.createNode(value, null, options);
        return new Pair.Pair(k2, v2);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version2, options = {}) {
        if (typeof version2 === "number")
          version2 = String(version2);
        let opt;
        switch (version2) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version2;
            else
              this.directives = new directives.Directives({ version: version2 });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version2);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s2 = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s2}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b2) => a === b2 || identity.isScalar(a) && identity.isScalar(b2) && a.value === b2.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep: sep4, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep4?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep4) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep4 ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep4, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq2 = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq2.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq2.items.push(node);
      }
      seq2.range = [bs.offset, offset, commentEnd ?? offset];
      return seq2;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep4 = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep4 + cb;
              sep4 = "";
              break;
            }
            case "newline":
              if (comment)
                sep4 += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep: sep4, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep4?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep4 && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep4 && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep4, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep4 ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep4)
                for (const st of sep4) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep4, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep4 = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep4 + indent.slice(trimIndent) + content;
          sep4 = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep4 === " ")
            sep4 = "\n";
          else if (!prevMoreIndented && sep4 === "\n")
            sep4 = "\n\n";
          value += sep4 + indent.slice(trimIndent) + content;
          sep4 = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep4 === "\n")
            value += "\n";
          else
            sep4 = "\n";
        } else {
          value += sep4 + content;
          sep4 = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m2 = first.match(/^( *)/);
      const line0 = m2?.[1] ? [m2[1], first.slice(m2[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return unfoldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return unfoldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function unfoldLines(source) {
      const line = /(.*?)\r?\n/sy;
      let match = line.exec(source);
      if (!match)
        return source;
      let trimEnd, trimBoth;
      try {
        trimEnd = new RegExp("(?<![ 	])[ 	]+$");
        trimBoth = new RegExp("^[ 	]+|(?<![ 	])[ 	]+$", "g");
      } catch {
        trimEnd = /[ \t]+$/;
        trimBoth = /^[ \t]+|[ \t]+$/g;
      }
      let res = match[1].replace(trimEnd, "");
      let sep4 = " ";
      let pos = line.lastIndex;
      while (match = line.exec(source)) {
        const lm = match[1].replace(trimBoth, "");
        if (lm === "") {
          if (sep4 === "\n")
            res += sep4;
          else
            sep4 = "\n";
        } else {
          res += sep4 + lm;
          sep4 = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep4 + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify3 = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep: sep4, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep4)
        for (const st of sep4)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify3;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP2 = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP2;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s2 = this.peek(3);
          if ((s2 === "---" || s2 === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s2 === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s2 = this.buffer.slice(this.pos, i);
        if (s2) {
          yield s2;
          this.pos += s2.length;
          return s2.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep4;
          if (scalar.end) {
            sep4 = scalar.end;
            sep4.push(this.sourceToken);
            delete scalar.end;
          } else
            sep4 = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep: sep4 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep4 = it.sep;
                  sep4.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep: sep4 }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq2) {
        const it = seq2.items[seq2.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq2.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq2.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq2.indent)) {
                const prev = seq2.items[seq2.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq2.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq2.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq2.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq2.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq2.indent) {
          const bv = this.startBlockValue(seq2);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep4 = fc.end.splice(1, fc.end.length);
            sep4.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep: sep4 }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify3(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify3;
  }
});

// node_modules/yaml/dist/index.js
var require_dist3 = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/host/index.ts
import { existsSync as existsSync18, readFileSync as readFileSync14 } from "node:fs";
import { dirname as dirname5, join as join17, resolve as resolve7 } from "node:path";
import { fileURLToPath } from "node:url";

// src/host/usage.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";

// src/core/usage.ts
var DEFAULT_BUDGET = { window: 6.4, day: 19.3, week: 100 };
var WINDOW_MS = 5 * 60 * 60 * 1e3;
var PRICE = {
  "claude-opus": { in: 15, out: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-sonnet": { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku": { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "codex": { in: 1.25, out: 10, cacheRead: 0.125, cacheWrite: 1.25 },
  _: { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 }
};
function priceKey(model, tool) {
  const m2 = model.toLowerCase();
  if (tool === "codex") return "codex";
  if (m2.includes("opus")) return "claude-opus";
  if (m2.includes("sonnet")) return "claude-sonnet";
  if (m2.includes("haiku")) return "claude-haiku";
  return "_";
}
function costOf(e) {
  const p2 = PRICE[priceKey(e.model, e.tool)] ?? PRICE._;
  return (e.input * p2.in + e.output * p2.out + e.cacheRead * p2.cacheRead + e.cacheWrite * p2.cacheWrite) / 1e6;
}
var sumTokens = (e) => e.input + e.output + e.cacheRead + e.cacheWrite;
function weekStart(now) {
  const d = new Date(now);
  d.setHours(9, 0, 0, 0);
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  if (d.getTime() > now) d.setDate(d.getDate() - 7);
  return d.getTime();
}
function dayStart(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function report(events2, now, budget2 = DEFAULT_BUDGET, opts = {}) {
  const winFrom = now - WINDOW_MS;
  const win = events2.filter((e) => e.t >= winFrom);
  const day = events2.filter((e) => e.t >= dayStart(now));
  const week = events2.filter((e) => e.t >= weekStart(now));
  const tools = [];
  for (const tool of ["claude", "codex"]) {
    const mine = win.filter((e) => e.tool === tool);
    const everMine = events2.some((e) => e.tool === tool);
    if (!everMine) continue;
    const cost = mine.reduce((a, e) => a + costOf(e), 0);
    const tokens = mine.reduce((a, e) => a + sumTokens(e), 0);
    const by = /* @__PURE__ */ new Map();
    for (const e of mine) by.set(e.model, (by.get(e.model) ?? 0) + sumTokens(e));
    const leftCost = Math.max(0, budget2.window - cost);
    tools.push({
      tool,
      tokens,
      cost,
      budget: budget2.window,
      leftCost,
      left: budget2.window <= 0 ? 0 : Math.max(0, Math.min(100, Math.round(leftCost / budget2.window * 100))),
      byModel: [...by.entries()].map(([model, t]) => ({ model, tokens: t })).sort((a, b2) => b2.tokens - a.tokens)
    });
  }
  const dayCost = day.reduce((a, e) => a + costOf(e), 0);
  const weekCost = week.reduce((a, e) => a + costOf(e), 0);
  const byBot = /* @__PURE__ */ new Map();
  if (opts.botOf) for (const e of win) {
    const b2 = e.sid ? opts.botOf(e.sid) : void 0;
    const key = b2 ? b2.botId : "_other";
    const cur = byBot.get(key) ?? { botId: key, name: b2 ? b2.name : "\uADF8 \uBC16 (\uD130\uBBF8\uB110 \uB4F1)", tokens: 0, cost: 0, turns: 0 };
    cur.tokens += sumTokens(e);
    cur.cost += costOf(e);
    cur.turns += 1;
    byBot.set(key, cur);
  }
  return {
    now,
    resetAt: win.length ? Math.min(...win.map((e) => e.t)) + WINDOW_MS : null,
    weekResetAt: weekStart(now) + 7 * 24 * 36e5,
    tools,
    left: tools.length ? Math.min(...tools.map((t) => t.left)) : 100,
    day: { cost: dayCost, left: budget2.day > 0 ? Math.max(0, budget2.day - dayCost) : null, tokens: day.reduce((a, e) => a + sumTokens(e), 0) },
    week: { cost: weekCost, left: budget2.week > 0 ? Math.max(0, budget2.week - weekCost) : null },
    budget: budget2,
    budgetSource: opts.budgetSource ?? "default",
    byBot: [...byBot.values()].sort((a, b2) => b2.cost - a.cost || b2.tokens - a.tokens)
  };
}
function parseEvent(line) {
  try {
    const d = JSON.parse(line);
    if (typeof d.t !== "number" || d.tool !== "claude" && d.tool !== "codex") return null;
    return { t: d.t, tool: d.tool, model: String(d.model ?? ""), input: +(d.input ?? 0), output: +(d.output ?? 0), cacheRead: +(d.cacheRead ?? 0), cacheWrite: +(d.cacheWrite ?? 0), ...d.sid ? { sid: String(d.sid) } : {} };
  } catch {
    return null;
  }
}

// src/host/usage.ts
var HOME = process.env.FOLDERBOT_HOME || homedir();
var DIR = join(HOME, ".folderbot");
var USAGE_FILE = join(DIR, "usage.jsonl");
var BUDGET_FILE = join(DIR, "budget.json");
var CLAUDE_DIR = join(HOME, ".claude");
var CODEX_DIR = join(HOME, ".codex");
var KEEP_MS = 7 * 24 * 36e5;
function budget() {
  try {
    return { ...DEFAULT_BUDGET, ...JSON.parse(readFileSync(BUDGET_FILE, "utf8")) };
  } catch {
    return DEFAULT_BUDGET;
  }
}
function budgetSource() {
  return existsSync(BUDGET_FILE) ? "settings" : "default";
}
function setBudget(b2) {
  const next = { ...budget(), ...b2 };
  mkdirSync(DIR, { recursive: true });
  writeFileSync(BUDGET_FILE, JSON.stringify(next, null, 2));
  return next;
}
function readFile() {
  if (!existsSync(USAGE_FILE)) return [];
  const out = [];
  for (const l of readFileSync(USAGE_FILE, "utf8").split("\n")) {
    const e = parseEvent(l);
    if (e) out.push(e);
  }
  return out;
}
function scanTranscript(file, tool, since) {
  const out = [];
  let text = "";
  try {
    if (statSync(file).mtimeMs < since) return out;
    text = readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split("\n")) {
    if (!line.includes('"usage"')) continue;
    try {
      const d = JSON.parse(line);
      const u = d.message?.usage;
      if (!u) continue;
      const t = d.timestamp ? Date.parse(d.timestamp) : NaN;
      if (!Number.isFinite(t) || t < since) continue;
      out.push({
        t,
        tool,
        model: String(d.message?.model ?? ""),
        input: +(u.input_tokens ?? 0),
        output: +(u.output_tokens ?? 0),
        cacheRead: +(u.cache_read_input_tokens ?? 0),
        cacheWrite: +(u.cache_creation_input_tokens ?? 0),
        sid: basename(file, ".jsonl")
      });
    } catch {
    }
  }
  return out;
}
function walkJsonl(dir3, depth, out, since, max = 2e3) {
  if (depth < 0 || out.length >= max) return;
  let names = [];
  try {
    names = readdirSync(dir3);
  } catch {
    return;
  }
  for (const n of names) {
    if (out.length >= max) return;
    const p2 = join(dir3, n);
    let st;
    try {
      st = statSync(p2);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkJsonl(p2, depth - 1, out, since, max);
    else if (n.endsWith(".jsonl") && st.mtimeMs >= since) out.push(p2);
  }
}
var cache = null;
function events(now = Date.now()) {
  const since = now - KEEP_MS;
  const fromFile = readFile().filter((e) => e.t >= since);
  if (!cache || now - cache.at > 3e4) {
    const scanned = [];
    const files = [];
    walkJsonl(join(CLAUDE_DIR, "projects"), 2, files, since);
    for (const f2 of files) scanned.push(...scanTranscript(f2, "claude", since));
    const cfiles = [];
    walkJsonl(join(CODEX_DIR, "sessions"), 3, cfiles, since);
    for (const f2 of cfiles) scanned.push(...scanTranscript(f2, "codex", since));
    cache = { at: now, events: scanned };
  }
  const seen = /* @__PURE__ */ new Set();
  const all = [];
  for (const e of [...fromFile, ...cache.events]) {
    const k2 = `${e.t}|${e.tool}|${e.input}|${e.output}|${e.cacheRead}|${e.cacheWrite}`;
    if (seen.has(k2)) continue;
    seen.add(k2);
    all.push(e);
  }
  return all.sort((a, b2) => a.t - b2.t);
}
function usageReport(now = Date.now(), botOf) {
  return report(events(now), now, budget(), { budgetSource: budgetSource(), botOf });
}
function invalidateUsage() {
  cache = null;
}
var HOOK_SH = join(DIR, "usage-hook.mjs");
var SETTINGS = join(CLAUDE_DIR, "settings.json");
var HOOK_CMD = `node ${HOOK_SH}`;
var HOOK_SRC = `#!/usr/bin/env node
// Folder Bot \uC0AC\uC6A9\uB7C9 \uD6C5 \u2014 \uD134\uC774 \uB05D\uB0A0 \uB54C \uC774\uBC88 \uD134\uC758 usage \uB97C ~/.folderbot/usage.jsonl \uC5D0 \uD55C \uC904 \uB0A8\uAE34\uB2E4.
// \uC77D\uAE30\uB9CC \uD558\uACE0, \uBB34\uC2A8 \uC77C\uC774 \uC788\uC5B4\uB3C4 \uC870\uC6A9\uD788 \uB05D\uB09C\uB2E4(0). Folder Bot \uC124\uC815 \u203A \uC0AC\uC6A9\uB7C9\uC5D0\uC11C \uC124\uCE58\xB7\uC81C\uAC70\uD55C\uB2E4.
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { homedir } from 'node:os'
let raw = ''
process.stdin.on('data', (c) => (raw += c))
process.stdin.on('end', () => {
  try {
    const inp = JSON.parse(raw || '{}')
    const p = inp.transcript_path
    if (!p) process.exit(0)
    const lines = readFileSync(p, 'utf8').split('\\n')
    const tail = lines.slice(-60).reverse()
    for (const l of tail) {
      if (!l.includes('"usage"')) continue
      const d = JSON.parse(l)
      const u = d.message && d.message.usage
      if (!u) continue
      const out = {
        t: d.timestamp ? Date.parse(d.timestamp) : Date.now(), tool: 'claude',
        model: (d.message && d.message.model) || '',
        input: u.input_tokens || 0, output: u.output_tokens || 0,
        cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0
      }
      const f = join(homedir(), '.folderbot', 'usage.jsonl')
      mkdirSync(dirname(f), { recursive: true })
      appendFileSync(f, JSON.stringify(out) + '\\n')
      break
    }
  } catch { /* \uC870\uC6A9\uD788 */ }
  process.exit(0)
})
`;
function hookState() {
  let installed = false;
  try {
    const j = JSON.parse(readFileSync(SETTINGS, "utf8"));
    installed = JSON.stringify(j.hooks?.Stop ?? []).includes("usage-hook");
  } catch {
  }
  return { installed: installed && existsSync(HOOK_SH), settings: SETTINGS, script: HOOK_SH };
}
function setHook(on) {
  mkdirSync(DIR, { recursive: true });
  if (on) writeFileSync(HOOK_SH, HOOK_SRC);
  let j = {};
  if (existsSync(SETTINGS)) {
    const cur = readFileSync(SETTINGS, "utf8");
    try {
      j = JSON.parse(cur);
    } catch {
      j = {};
    }
    writeFileSync(`${SETTINGS}.folderbot-backup`, cur);
  } else mkdirSync(dirname(SETTINGS), { recursive: true });
  const hooks = j.hooks ?? (j.hooks = {});
  const stop = (hooks.Stop ?? []).filter((g2) => !JSON.stringify(g2).includes("usage-hook"));
  if (on) stop.push({ hooks: [{ type: "command", command: HOOK_CMD }] });
  hooks.Stop = stop;
  writeFileSync(SETTINGS, JSON.stringify(j, null, 2));
  return { installed: on };
}

// src/core/clientCtx.ts
var attr = (v2) => String(v2).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
function clientBlock(c) {
  return `<folderbot-client origin="${c.origin}" device="${attr(c.device)}" tier="${c.tier}" touch="${c.touch}" canOpenOnDevice="${c.canOpenOnDevice}" openMode="${c.openMode || "none"}"/>`;
}
function withClient(text, c) {
  return c ? `${clientBlock(c)}

${text}` : text;
}
var DEVICE_RULES_MD = `## \uBC1C\uC2E0 \uAE30\uAE30 (Folder Bot)
- \uBA54\uC2DC\uC9C0 \uB9E8 \uC55E\uC758 \`<folderbot-client \u2026/>\` \uB294 **\uC9C8\uBB38\uC774 \uC628 \uAE30\uAE30**\uB2E4. \uB2F5\uC5D0 \uB418\uC74A\uC9C0 \uB9C8\uB77C.
- \`origin="remote"\` \uBA74 \uC0AC\uB78C\uC740 \uD638\uC2A4\uD2B8 \uB9E5 \uC55E\uC5D0 \uC5C6\uB2E4. \uD30C\uC77C\uC744 \uBCF4\uC5EC \uC8FC\uB824\uBA74 \`rondo_open\`(\uADF8 \uAE30\uAE30\uC758 \uBB38\uC11C \uCC3D\uC5D0\uC11C \uC5F4\uB9B0\uB2E4)\uC744 \uC4F0\uACE0, Finder\xB7\uC678\uBD80 \uC571\uC744 \uC5EC\uB294 \`rondo_reveal\` \uC740 \`canOpenOnDevice="true"\` \uC77C \uB54C\uB9CC \uC368\uB77C.
- \`tier="phone"\` \uC774\uBA74 Finder\xB7\uC678\uBD80 \uC571 \uC598\uAE30\uB294 \uD558\uC9C0 \uB9D0\uACE0 \uACBD\uB85C\uB9CC \uB9D0\uD574\uB77C. \uAE34 \uD45C \uB300\uC2E0 \uC9E7\uC740 \uBAA9\uB85D\uC73C\uB85C \uB2F5\uD574\uB77C.
- \`origin="host"\` \uBA74 \uC9C0\uAE08\uAE4C\uC9C0\uCC98\uB7FC \uD55C\uB2E4.`;

// src/host/host.ts
import { existsSync as existsSync10, readdirSync as readdirSync6, statSync as statSync6 } from "node:fs";
import { execFileSync as execFileSync4 } from "node:child_process";
import { hostname } from "node:os";
import { join as join10, relative as relative3, resolve as resolve4 } from "node:path";

// src/core/todo.ts
var LINE = /^(\s*)- \[( |x|X)\] (.*)$/;
var HEAD = /^#{1,6}\s+(.*)$/;
var isDoneSection = (s2) => /^(완료|done|completed)/i.test(s2.trim());
var BOT_MARK = /\s*<!--\s*bot\s*-->\s*$/;
function parseTodo(md) {
  const out = [];
  const lines = md.split(/\r?\n/);
  let section = "";
  lines.forEach((raw, i) => {
    const hm = HEAD.exec(raw);
    if (hm) {
      const t = hm[1].trim();
      if (!/^todo$/i.test(t)) section = t;
      return;
    }
    const m2 = LINE.exec(raw);
    if (!m2) return;
    let body = m2[3];
    const by = BOT_MARK.test(body) ? "bot" : "me";
    body = body.replace(BOT_MARK, "").trim();
    const c = body.indexOf(":");
    const title = c > 0 ? body.slice(0, c).trim() : body;
    const desc = c > 0 ? body.slice(c + 1).trim() : "";
    out.push({ line: i, done: m2[2] !== " ", title, desc, by, section });
  });
  return out;
}
function formatLine(title, desc, by, done = false) {
  const t = title.trim().replace(/\s*:\s*$/, "");
  const body = desc.trim() ? `${t}: ${desc.trim()}` : t;
  return `- [${done ? "x" : " "}] ${body}${by === "bot" ? " <!-- bot -->" : ""}`;
}
function toggleLine(md, line, done) {
  const nl = md.includes("\r\n") ? "\r\n" : "\n";
  const lines = md.split(/\r?\n/);
  const m2 = LINE.exec(lines[line] ?? "");
  if (!m2) return md;
  lines[line] = `${m2[1]}- [${done ? "x" : " "}] ${m2[3]}`;
  return lines.join(nl);
}
function editLine(md, line, title, desc) {
  const nl = md.includes("\r\n") ? "\r\n" : "\n";
  const lines = md.split(/\r?\n/);
  const m2 = LINE.exec(lines[line] ?? "");
  if (!m2 || !title.trim()) return md;
  const by = BOT_MARK.test(m2[3]) ? "bot" : "me";
  lines[line] = `${m2[1]}${formatLine(title, desc, by, m2[2] !== " ")}`;
  return lines.join(nl);
}
function deleteLine(md, line) {
  const nl = md.includes("\r\n") ? "\r\n" : "\n";
  const lines = md.split(/\r?\n/);
  if (!LINE.test(lines[line] ?? "")) return md;
  lines.splice(line, 1);
  return lines.join(nl);
}
function addLine(md, title, desc, by, section = "") {
  const nl = md.includes("\r\n") ? "\r\n" : "\n";
  const lines = md.length ? md.split(/\r?\n/) : [];
  const entry = formatLine(title, desc, by);
  if (section) {
    const start = lines.findIndex((l) => {
      const hm = HEAD.exec(l);
      return !!hm && hm[1].trim() === section;
    });
    if (start >= 0) {
      let end = lines.length;
      for (let i = start + 1; i < lines.length; i++) if (HEAD.test(lines[i])) {
        end = i;
        break;
      }
      let at = end;
      while (at > start + 1 && lines[at - 1].trim() === "") at--;
      lines.splice(at, 0, entry);
      return lines.join(nl);
    }
  }
  const doneIdx = lines.findIndex((l) => /^##\s*완료/.test(l));
  if (doneIdx >= 0) {
    let at = doneIdx;
    while (at > 0 && lines[at - 1].trim() === "") at--;
    lines.splice(at, 0, entry);
    return lines.join(nl);
  }
  let last = -1;
  lines.forEach((l, i) => {
    if (LINE.test(l)) last = i;
  });
  if (last >= 0) {
    lines.splice(last + 1, 0, entry);
    return lines.join(nl);
  }
  if (lines.length === 0) return `# todo${nl}${nl}${entry}${nl}`;
  if (lines[lines.length - 1] !== "") lines.push("");
  lines.push(entry);
  return lines.join(nl);
}
function moveLine(md, from, before) {
  const nl = md.includes("\r\n") ? "\r\n" : "\n";
  const lines = md.split(/\r?\n/);
  if (!LINE.test(lines[from] ?? "")) return md;
  if (before === from || before === from + 1) return md;
  const [row] = lines.splice(from, 1);
  let at;
  if (before === null) {
    let last = -1;
    lines.forEach((l, i) => {
      if (LINE.test(l)) last = i;
    });
    at = last + 1;
  } else at = Math.max(0, Math.min(lines.length, before > from ? before - 1 : before));
  lines.splice(at, 0, row);
  return lines.join(nl);
}
function toggleAndMove(md, line, done) {
  const next = toggleLine(md, line, done);
  if (!done || next === md) return next;
  const lines = next.split(/\r?\n/);
  let secStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const hm = HEAD.exec(lines[i]);
    if (hm && isDoneSection(hm[1])) {
      secStart = i;
      break;
    }
  }
  if (secStart < 0) return next;
  if (line > secStart && !lines.slice(secStart + 1, line).some((l) => HEAD.test(l))) return next;
  let end = lines.length;
  for (let i = secStart + 1; i < lines.length; i++) if (HEAD.test(lines[i])) {
    end = i;
    break;
  }
  let at = end;
  while (at > secStart + 1 && lines[at - 1].trim() === "") at--;
  return moveLine(next, line, at);
}
var TODO_RULES_PROMPT = `\uC774 \uD3F4\uB354\uC758 todo.md \uB294 \uC0AC\uB78C\uACFC \uBD07\uC774 \uAC19\uC774 \uC4F0\uB294 \uD560 \uC77C \uBAA9\uB85D\uC774\uB2E4. \uADDC\uC57D:
1. \uC138\uC158\uC744 \uC2DC\uC791\uD558\uBA74 \uBBF8\uC644\uB8CC \uD56D\uBAA9\uC744 \uC77D\uB294\uB2E4.
2. \uB124\uAC00 \uB0A8\uAE34 \uD56D\uBAA9(<!-- bot --> \uD45C\uC2DD)\uC740 \uBA3C\uC800 \uCC98\uB9AC\uD558\uAC70\uB098, \uC65C \uBABB \uD588\uB294\uC9C0 \uC124\uBA85\uC744 \uAC31\uC2E0\uD55C\uB2E4.
3. \uC0AC\uC6A9\uC790\uAC00 \uD574\uC57C \uD560 \uC77C\uC774 \uC0DD\uAE30\uBA74 \uD55C \uC904\uB85C \uC801\uACE0 \uB300\uD654\uC5D0\uC11C \uC54C\uB9B0\uB2E4. \uB124\uAC00 \uB2E4\uC74C \uC138\uC158\uC5D0\uC11C \uD560 \uC77C\uB3C4 \uC801\uC744 \uC218 \uC788\uB2E4.
4. \uD55C \uC904 = "- [ ] \uC81C\uBAA9: \uC124\uBA85" \uC774\uACE0, \uB124\uAC00 \uC801\uB294 \uC904 \uB05D\uC5D0\uB294 " <!-- bot -->" \uC744 \uBD99\uC778\uB2E4. \uC644\uB8CC\uD55C \uD56D\uBAA9\uC740 "- [x]" \uB85C \uBC14\uAFBC\uB2E4.
5. \uC911\uCCA9\xB7\uC6B0\uC120\uC21C\uC704\xB7\uAE30\uD55C \uBB38\uBC95\uC744 \uB9CC\uB4E4\uC9C0 \uC54A\uB294\uB2E4. \uD544\uC694\uD558\uBA74 \uC124\uBA85\uC5D0 \uC4F4\uB2E4.`;

// src/core/types.ts
var STATE_LABEL = {
  idle: "\uB300\uAE30",
  running: "\uC77C\uD558\uB294 \uC911",
  awaiting_input: "\uD655\uC778\uD574 \uC8FC\uC138\uC694",
  done: "\uB05D\uB0AC\uC5B4\uC694",
  error: "\uBB38\uC81C \uC788\uC5B4\uC694"
};
var BOT_COLORS = ["#6ea6f7", "#b18cf2", "#3fc1c9", "#34c77b", "#e0a93e", "#f0a8c0", "#9ad0a0", "#8fb8ff", "#d9a0ff", "#f2c14e"];
var ORCH_COLOR = "#e08850";
var DEFAULT_PORT = 7373;

// src/host/auth.ts
import { execFile, execFileSync as execFileSync3 } from "node:child_process";
import { existsSync as existsSync5, readFileSync as readFileSync4, readdirSync as readdirSync3, statSync as statSync3 } from "node:fs";
import { homedir as homedir5 } from "node:os";
import { join as join5 } from "node:path";

// src/core/authVerdict.ts
function authVerdict(input) {
  if (!input.asked) return "unknown";
  if (input.loggedIn) return "loggedin";
  const now = input.now ?? Date.now();
  if (input.credentialsExpiresAt && input.credentialsExpiresAt > now) return "unreadable";
  return "loggedout";
}

// src/host/session.ts
import { spawn as spawn2 } from "node:child_process";
import { createInterface as createInterface2 } from "node:readline";
import { EventEmitter as EventEmitter2 } from "node:events";
import { randomUUID } from "node:crypto";
import { existsSync as existsSync4, mkdirSync as mkdirSync3, readFileSync as readFileSync3, readdirSync as readdirSync2, statSync as statSync2 } from "node:fs";
import { join as join4 } from "node:path";
import { homedir as homedir4 } from "node:os";

// src/core/stateMachine.ts
function transition(state, event) {
  switch (event.kind) {
    case "user_sent":
      return "running";
    case "permission_requested":
      return state === "running" ? "awaiting_input" : state;
    case "input_provided":
      return state === "awaiting_input" ? "running" : state;
    case "result_received":
      return event.isError ? "error" : "done";
    case "process_exited":
      if (event.code === 0 && state === "running") return "done";
      if (event.code === 143 || event.code === 137) return state === "running" ? "idle" : state;
      return event.code === 0 || event.code === null ? state : "error";
    case "stream_activity":
      return state === "awaiting_input" ? state : "running";
    case "acknowledged":
      return state === "done" || state === "error" ? "idle" : state;
  }
}
function shouldNotify(prev, next) {
  if (prev === next) return false;
  return next === "done" || next === "awaiting_input" || next === "error";
}

// src/core/chat.ts
var DEFAULT_WINDOW = 2e5;
function windowOf(line, prev, model) {
  const rows = Object.entries(line.modelUsage ?? {}).filter(([, v2]) => (v2.contextWindow ?? 0) > 0);
  if (!rows.length) return prev?.window ?? DEFAULT_WINDOW;
  if (model) {
    const hit = rows.find(([k2]) => k2 === model || k2.includes(model) || model.includes(k2));
    if (hit) return hit[1].contextWindow;
  }
  const tok = (v2) => (v2.inputTokens ?? 0) + (v2.cacheReadInputTokens ?? 0) + (v2.cacheCreationInputTokens ?? 0) + (v2.outputTokens ?? 0);
  return [...rows].sort((a, b2) => tok(b2[1]) - tok(a[1]))[0][1].contextWindow;
}
function contextOf(line, prev, model) {
  const win = windowOf(line, prev, model);
  const sum = (u) => (u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0);
  if (line.type === "assistant") {
    const used2 = sum(line.message?.usage);
    return used2 > 0 ? { used: used2, window: win } : null;
  }
  if (line.type !== "result") return null;
  if (prev?.used) return { used: prev.used, window: win };
  const used = sum(line.usage);
  return used > 0 ? { used: Math.min(used, win), window: win } : null;
}
function toolSummary(name, input) {
  const s2 = (k2) => typeof input[k2] === "string" ? input[k2] : "";
  switch (name) {
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return s2("file_path") || s2("path");
    case "Bash":
      return s2("command").slice(0, 120);
    case "Glob":
    case "Grep":
      return s2("pattern") + (s2("path") ? ` \xB7 ${s2("path")}` : "");
    case "WebFetch":
    case "WebSearch":
      return s2("url") || s2("query");
    case "Task":
    case "Agent":
      return s2("description") || s2("prompt").slice(0, 80);
    case "TodoWrite":
      return `${Array.isArray(input.todos) ? input.todos.length : 0}\uAC1C \uD56D\uBAA9`;
    default: {
      const first = Object.values(input).find((v2) => typeof v2 === "string");
      return (first ?? "").slice(0, 100);
    }
  }
}
function touchedPath(name, input) {
  if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(name)) {
    const p2 = input.file_path ?? input.path;
    return typeof p2 === "string" ? p2 : null;
  }
  return null;
}
function assistantText(line) {
  const parts = line.message?.content ?? [];
  return parts.filter((b2) => b2.type === "text").map((b2) => String(b2.text ?? "")).join("\n").trim();
}
var seq = 0;
function itemId(prefix = "i") {
  seq = (seq + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}
function closeOpenItems(items, reason) {
  const changed = [];
  const note = reason === "result" ? void 0 : reason === "exit" ? "\uC138\uC158\uC774 \uB05D\uB098 \uC911\uB2E8\uB428" : "\uD638\uC2A4\uD2B8\uAC00 \uB2E4\uC2DC \uB5A0\uC11C \uC911\uB2E8\uB428";
  for (const it of items) {
    if ((it.kind === "assistant" || it.kind === "thinking") && it.streaming) {
      it.streaming = false;
      changed.push(it);
    } else if (it.kind === "tool" && it.result === void 0 && !it.isError) {
      if (reason === "result") it.result = "";
      else {
        it.result = note;
        it.isError = true;
      }
      changed.push(it);
    } else if (it.kind === "subagent" && it.status === "run") {
      if (reason === "result") {
        if (it.bg) continue;
        it.status = "done";
      } else {
        it.status = "error";
        it.result = note;
      }
      changed.push(it);
    }
  }
  return changed;
}
function modelOf(line) {
  if (line.type === "assistant") return line.message?.model ? String(line.message.model) : null;
  if (line.type === "system" && line.subtype === "init") return line.model ? String(line.model) : null;
  return null;
}

// src/host/codex.ts
import { execFileSync as execFileSync2, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";

// src/core/codexMap.ts
var str = (v2) => typeof v2 === "string" ? v2 : "";
function pick(...vs) {
  for (const v2 of vs) {
    const s2 = str(v2);
    if (s2) return s2;
  }
  return "";
}
function changePaths(v2) {
  if (Array.isArray(v2)) return v2.map((c) => str(c.path)).filter(Boolean);
  if (v2 && typeof v2 === "object") return Object.keys(v2);
  return [];
}
function kindOf(m2, item) {
  return str(item.item_type) || str(item.type) || str(m2.type);
}
function mapCodex(e, ctx) {
  const m2 = e.msg ?? e;
  const item = e.item ?? m2.item ?? {};
  const t = str(e.type) || str(m2.type);
  const kind = kindOf(m2, item);
  const out = [];
  const sid = pick(m2.session_id, m2.thread_id, m2.conversation_id, e.thread_id, e.session_id, m2.session?.id);
  if (sid) ctx.sid = sid;
  if (t === "agent_message_delta" || t === "response.output_text.delta" || t === "item.delta" || kind === "agent_message_delta") {
    const d = pick(m2.delta, item.delta, item.text, m2.text);
    if (!d) return out;
    ctx.text += d;
    out.push({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: d } } });
    return out;
  }
  if (t === "agent_message" || t === "assistant_message" || kind === "agent_message" || kind === "assistant_message") {
    const full = pick(m2.message, m2.text, item.text, item.content, item.message);
    if (full && full !== ctx.text) {
      ctx.text = ctx.text || full;
      out.push({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: full }] } });
    }
    return out;
  }
  if (t.startsWith("agent_reasoning") || kind === "reasoning" || kind === "agent_reasoning") {
    const d = pick(m2.text, m2.delta, item.text, item.summary);
    if (d) out.push({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "thinking_delta", thinking: d } } });
    return out;
  }
  const toolKind = /^(exec_command|patch_apply|mcp_tool_call)/.test(t) ? t : /^(command_execution|file_change|mcp_tool_call)$/.test(kind) ? kind : "";
  if (toolKind) {
    const begin = t.endsWith("_begin") || str(e.type) === "item.started";
    const id = pick(m2.call_id, item.id, m2.id, e.id) || `c_${Date.now().toString(36)}`;
    const name = /exec|command/.test(toolKind) ? "Bash" : /patch|file/.test(toolKind) ? "Edit" : pick(m2.tool, item.tool) || "Tool";
    const cmd = Array.isArray(m2.command) ? m2.command.join(" ") : pick(m2.command, item.command, m2.description, item.description);
    const paths = name === "Edit" ? changePaths(m2.changes ?? item.changes) : [];
    const editInput = paths.length ? { file_path: paths[0], paths, ...cmd ? { description: cmd } : {} } : m2.input ?? item.input ?? { description: cmd };
    if (begin) out.push({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name, input: name === "Bash" ? { command: cmd } : editInput }] } });
    else out.push({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, is_error: Number(m2.exit_code ?? item.exit_code ?? 0) !== 0, content: pick(m2.stdout, item.stdout, m2.output, item.output, m2.aggregated_output, item.aggregated_output) }] } });
    return out;
  }
  if (t === "token_count" || t === "usage" || t === "turn.completed") {
    const u = m2.info ?? m2.usage ?? e.usage ?? {};
    if (u && (u.input_tokens || u.output_tokens)) out.push({ type: "result", subtype: "usage", usage: { input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0, cache_read_input_tokens: u.cached_input_tokens ?? u.cache_read_input_tokens ?? 0 } });
    return out;
  }
  if (t === "task_started" || t === "session_configured" || t === "thread.started") {
    out.push({ type: "system", subtype: "init", session_id: ctx.sid ?? void 0 });
    return out;
  }
  if (t === "task_complete" || t === "item.started") return out;
  if (t === "error" || t === "stream_error" || t === "turn.failed") {
    const msg = pick(m2.message, e.error?.message, m2.error?.message) || "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958";
    ctx.unknown.add(`\uC624\uB958: ${msg.slice(0, 300)}`);
    return out;
  }
  const label = kind || t;
  if (label) {
    ctx.unknown.add(label);
    out.push({ type: "system", subtype: "activity", summary: label });
  }
  return out;
}
function emptyTurnNote(o) {
  const bits = ["Codex \uAC00 \uB2F5 \uC5C6\uC774 \uD134\uC744 \uB05D\uB0C8\uC5B4\uC694."];
  if (o.code) bits.push(`\uB05D\uB09C \uCF54\uB4DC ${o.code}.`);
  const err = o.stderr.trim().split("\n").filter(Boolean).slice(-3).join(" / ");
  if (err) bits.push(`CLI: ${err.slice(0, 300)}`);
  const seen = [...o.unknown].slice(0, 6);
  if (seen.length) bits.push(`\uBC1B\uC740 \uC904: ${seen.join(" \xB7 ")}`);
  bits.push("\uC124\uC815 \u203A \uC5D0\uC774\uC804\uD2B8 \u203A \uC5F0\uACB0 \uC9C4\uB2E8 \uC744 \uB20C\uB7EC \uBCF4\uC138\uC694.");
  return bits.join("\n");
}
function supportedFlags(help, want) {
  const out = /* @__PURE__ */ new Set();
  if (!help.trim()) {
    for (const w2 of want) out.add(w2);
    return out;
  }
  for (const w2 of want) if (help.includes(w2)) out.add(w2);
  return out;
}
function isModelRejected(err) {
  if (!err) return false;
  const s2 = err.toLowerCase();
  if (!/model/.test(s2)) return false;
  return /not supported|unsupported|not available|does not exist|unknown model|invalid model/.test(s2);
}

// src/host/providers.ts
import { existsSync as existsSync2 } from "node:fs";
import { join as join2 } from "node:path";
import { homedir as homedir2 } from "node:os";
import { execFileSync } from "node:child_process";
var CANDIDATES = {
  claude: [join2(homedir2(), ".local/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"],
  codex: [join2(homedir2(), ".local/bin/codex"), "/opt/homebrew/bin/codex", "/usr/local/bin/codex", join2(homedir2(), ".codex/bin/codex")]
};
var ENV_OVERRIDE = { claude: "FOLDERBOT_CLI_BIN", codex: "FOLDERBOT_CODEX_BIN" };
function which(id) {
  const ov = process.env[ENV_OVERRIDE[id]];
  if (ov) return existsSync2(ov) ? ov : null;
  for (const p2 of CANDIDATES[id]) if (existsSync2(p2)) return p2;
  try {
    const p2 = execFileSync("which", [id], { encoding: "utf8" }).trim();
    return p2 && existsSync2(p2) ? p2 : null;
  } catch {
    return null;
  }
}
function version(bin) {
  try {
    return execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 4e3 }).trim().split("\n")[0] || null;
  } catch {
    return null;
  }
}
var cache2 = null;
function providers(now = Date.now()) {
  if (cache2 && now - cache2.at < 3e5) return cache2.list;
  const list = [];
  for (const [id, name] of [["claude", "Claude Code"], ["codex", "Codex"]]) {
    const bin = which(id);
    if (!bin) continue;
    list.push({ id, name, bin, version: version(bin) });
  }
  cache2 = { at: now, list };
  return list;
}
function providerBin(id) {
  return providers().find((p2) => p2.id === id)?.bin ?? null;
}

// src/host/codex.ts
var CODEX_EFFORT = /* @__PURE__ */ new Set(["minimal", "low", "medium", "high"]);
var flagCache = /* @__PURE__ */ new Map();
var WANT = ["--json", "--sandbox", "--skip-git-repo-check", "--model", "-c"];
function codexFlags(bin, sub = "exec") {
  const hit = flagCache.get(sub);
  if (hit) return hit;
  const args = sub === "resume" ? ["exec", "resume", "--help"] : ["exec", "--help"];
  let help = "";
  try {
    help = String(execFileSync2(bin, args, { encoding: "utf8", timeout: 6e3, env: cleanClaudeEnv() }));
  } catch {
    help = "";
  }
  const set = supportedFlags(help, WANT);
  flagCache.set(sub, set);
  return set;
}
var CodexWorker = class extends EventEmitter {
  cliSessionId;
  lastError = "";
  pending = /* @__PURE__ */ new Map();
  proc = null;
  spec;
  text = "";
  unknown = /* @__PURE__ */ new Set();
  /**
   * 이 세션에서 **모델 이름을 빼고** 보낼까 — 계정이 그 모델을 거절했을 때 켜진다.
   * ⚠ 한 번 켜지면 세션 내내 유지한다. 매 턴 거절당하고 다시 보내면 **모든 턴이 두 배**로 든다.
   */
  dropModel = false;
  retrying = "";
  constructor(spec) {
    super();
    this.spec = spec;
    this.cliSessionId = spec.resume ?? null;
  }
  get alive() {
    return true;
  }
  // 턴 사이에는 프로세스가 없다 — 세션은 살아 있다
  send(prompt) {
    if (this.proc) return false;
    const bin = providerBin("codex");
    if (!bin) {
      this.lastError = "Codex CLI \uB97C \uCC3E\uC9C0 \uBABB\uD588\uC5B4\uC694";
      this.emit("exit", 1, null, this.lastError);
      return false;
    }
    const resuming = !!this.cliSessionId;
    const flags = codexFlags(bin, resuming ? "resume" : "exec");
    const args = resuming ? ["exec", "resume"] : ["exec"];
    if (flags.has("--json")) args.push("--json");
    if (flags.has("--sandbox")) args.push("--sandbox", this.spec.sandbox ?? "read-only");
    if (flags.has("--skip-git-repo-check")) args.push("--skip-git-repo-check");
    if (this.spec.model && !this.dropModel && flags.has("--model")) args.push("--model", this.spec.model);
    if (this.spec.effort && CODEX_EFFORT.has(this.spec.effort) && flags.has("-c")) args.push("-c", `model_reasoning_effort="${this.spec.effort}"`);
    if (resuming) args.push(this.cliSessionId);
    args.push(prompt);
    this.text = "";
    const env = { ...cleanClaudeEnv(), ...this.spec.apiKey ? { OPENAI_API_KEY: this.spec.apiKey } : {} };
    const p2 = spawn(bin, args, { cwd: this.spec.cwd, env });
    this.proc = p2;
    try {
      p2.stdin.end();
    } catch {
    }
    p2.stderr.on("data", (d) => {
      this.lastError = (this.lastError + d.toString()).slice(-4e3);
    });
    createInterface({ input: p2.stdout }).on("line", (raw) => this.onLine(raw));
    p2.on("error", (e) => {
      this.proc = null;
      this.lastError = e.message;
      this.emit("exit", 1, null, e.message);
    });
    p2.on("exit", (code) => {
      this.proc = null;
      const why = [...this.unknown].join(" ") + " " + this.lastError;
      if (!this.text.trim() && !this.dropModel && this.retrying !== prompt && isModelRejected(why)) {
        this.dropModel = true;
        this.retrying = prompt;
        this.unknown.clear();
        this.lastError = "";
        this.out({ type: "system", subtype: "activity", summary: `\uBAA8\uB378 ${this.spec.model} \uC740 \uC774 \uACC4\uC815\uC5D0\uC11C \uBABB \uC368\uC694 \u2014 CLI \uAE30\uBCF8 \uBAA8\uB378\uB85C \uB2E4\uC2DC \uBCF4\uB0C5\uB2C8\uB2E4` });
        this.send(prompt);
        return;
      }
      if (!this.text.trim()) {
        const note = emptyTurnNote({ code, stderr: this.lastError, unknown: this.unknown });
        this.out({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: note }] } });
        this.text = note;
      }
      this.out({ type: "result", subtype: code === 0 ? "success" : "error", is_error: code !== 0, result: this.text, session_id: this.cliSessionId ?? void 0 });
    });
    return true;
  }
  onLine(raw) {
    let e;
    try {
      e = JSON.parse(raw);
    } catch {
      return;
    }
    const ctx = { sid: this.cliSessionId, text: this.text, unknown: this.unknown };
    for (const line of mapCodex(e, ctx)) this.out(line);
    this.cliSessionId = ctx.sid;
    this.text = ctx.text;
  }
  out(line) {
    this.emit("line", line);
  }
  // ── 우리가 끼어들 자리가 없는 것들 — 조용히 아무것도 안 한다 ──
  respondPermission() {
  }
  respondAsk() {
  }
  interrupt() {
    this.kill();
  }
  kill() {
    const p2 = this.proc;
    this.proc = null;
    if (!p2) return;
    try {
      p2.kill("SIGTERM");
    } catch {
    }
    setTimeout(() => {
      try {
        p2.kill("SIGKILL");
      } catch {
      }
    }, 4e3).unref();
  }
};

// src/core/agents.ts
var normModel = (m2) => m2.toLowerCase().replace(/-\d{8}$/, "").replace(/^claude-/, "");
function sameModel(a, b2) {
  return !!a && !!b2 && normModel(a) === normModel(b2);
}
function fitsProvider(id, model) {
  if (!model) return false;
  return id === "codex" ? /^(gpt|o\d|codex)/i.test(model) : /^claude/i.test(model);
}

// src/core/slashLocal.ts
var CODEX_LOCAL = [
  { name: "clear", desc: "\uC0C8 \uB300\uD654\uB85C \u2014 \uC5EC\uAE30\uAE4C\uC9C0\uC758 \uB9E5\uB77D\uC744 \uB04A\uC2B5\uB2C8\uB2E4" },
  { name: "new", desc: "\uC0C8 \uB300\uD654\uB85C (clear \uC640 \uAC19\uC74C)" }
];
function parseLocalSlash(text, list) {
  const m2 = /^\/([a-z][\w:-]*)\s*([\s\S]*)$/i.exec(text.trim());
  if (!m2) return null;
  const name = m2[1].toLowerCase();
  if (!list.some((c) => c.name === name)) return null;
  return { name, rest: m2[2].trim() };
}

// src/core/sessionTitle.ts
var AUTO_NAME_RE = /^(세션|새 세션|메인|대화|새 대화|session|new session|new chat|chat)\s*\d*$/i;
function isAutoSessionName(name) {
  return AUTO_NAME_RE.test((name ?? "").trim());
}
var ENDER = /[.!?。！？]/;
function titleFromText(text, max = 26) {
  let s2 = (text ?? "").replace(/\r/g, "");
  s2 = s2.replace(/```[\s\S]*?```/g, " ").replace(/`([^`]*)`/g, "$1");
  const line = s2.split("\n").map((l) => l.trim()).find((l) => l && !/^[-*>#|]+$/.test(l)) ?? "";
  let t = line.replace(/^#{1,6}\s*/, "").replace(/^[-*>]\s+/, "").replace(/\*\*|__|~~/g, "").trim();
  const sl = /^\/([a-z0-9:_-]+)\s*/i.exec(t);
  if (sl) {
    const rest = t.slice(sl[0].length).trim();
    t = rest || `/${sl[1]}`;
  }
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return "";
  for (let i = 6; i < t.length; i++) if (ENDER.test(t[i])) {
    const head = t.slice(0, i).trim();
    if (head.length >= 6) {
      t = head;
      break;
    }
  }
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp >= Math.floor(max * 0.6) ? cut.slice(0, sp) : cut).trim()}\u2026`;
}

// src/core/permPolicy.ts
var EDIT_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
function autoAllows(mode, toolName) {
  if (toolName === "AskUserQuestion") return false;
  if (mode === "bypassPermissions") return true;
  if (mode === "acceptEdits") return EDIT_TOOLS.has(toolName);
  return false;
}
function bashHeads(command) {
  const heads = [];
  for (const seg of command.split(/\s*(?:\|\||&&|;|\|)\s*/)) {
    const words = seg.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
    const head = words[i];
    if (!head) continue;
    if (!/^[A-Za-z0-9_./-]+$/.test(head)) return null;
    if (!heads.includes(head)) heads.push(head);
  }
  return heads.length ? heads : null;
}
function fallbackRules(toolName, input) {
  if (toolName === "AskUserQuestion") return [];
  const one = (rules) => [{ type: "addRules", rules, behavior: "allow", destination: "session" }];
  if (toolName === "Bash") {
    const heads = typeof input.command === "string" ? bashHeads(input.command) : null;
    return one(heads ? heads.map((h) => ({ toolName: "Bash", ruleContent: `${h}:*` })) : [{ toolName: "Bash" }]);
  }
  return one([{ toolName }]);
}
function rulesLabel(suggestions) {
  const out = [];
  for (const u of suggestions) {
    const rules = u.rules;
    if (!Array.isArray(rules)) continue;
    for (const r of rules) {
      if (typeof r.toolName !== "string") continue;
      out.push(typeof r.ruleContent === "string" ? `${r.toolName}(${r.ruleContent})` : r.toolName);
    }
  }
  return out.join(" \xB7 ");
}

// src/host/paths.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2, renameSync } from "node:fs";
import { homedir as homedir3, platform } from "node:os";
import { join as join3, resolve } from "node:path";
function dataDir() {
  if (process.env.FOLDERBOT_DATA) return process.env.FOLDERBOT_DATA;
  if (platform() === "darwin") return join3(homedir3(), "Library", "Application Support", "folderbot");
  return join3(homedir3(), ".folderbot");
}
function ensureDir(p2) {
  if (!existsSync3(p2)) mkdirSync2(p2, { recursive: true });
  return p2;
}
var CONFIG = () => join3(ensureDir(dataDir()), "config.json");
function loadConfig() {
  try {
    const j = JSON.parse(readFileSync2(CONFIG(), "utf8"));
    return { root: j.root ?? null, port: j.port ?? DEFAULT_PORT, devices: j.devices ?? [], vapid: j.vapid, pushSubs: j.pushSubs ?? [], quiet: j.quiet, claudeBin: j.claudeBin, claudeOauthToken: j.claudeOauthToken, defaultModel: j.defaultModel ?? "claude-fable-5-1", defaultEffort: j.defaultEffort ?? "high", defaultCodexModel: j.defaultCodexModel, defaultCodexEffort: j.defaultCodexEffort, codexSandbox: j.codexSandbox, openaiApiKey: j.openaiApiKey, hostName: j.hostName };
  } catch {
    return { root: null, port: DEFAULT_PORT, devices: [], pushSubs: [], defaultModel: "claude-fable-5-1", defaultEffort: "high" };
  }
}
function atomicWrite(path, data) {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync2(tmp, data);
  renameSync(tmp, path);
}
function saveConfig(c) {
  atomicWrite(CONFIG(), JSON.stringify(c, null, 2));
}
function absRoot(c) {
  if (!c.root) throw new Error("root not set \u2014 run: folderbot init <folder>");
  return resolve(c.root);
}

// src/host/session.ts
var oauthToken = "";
var keychainOk = false;
function setOauthToken(t) {
  oauthToken = (t ?? "").trim();
}
function setKeychainLogin(ok) {
  keychainOk = ok;
}
function cleanClaudeEnv(opts = {}) {
  const env = { ...process.env };
  for (const k2 of Object.keys(env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT)/.test(k2)) delete env[k2];
  if (oauthToken && !keychainOk && !opts.noToken) env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
  env.PATH = [env.PATH, "/opt/homebrew/bin", "/usr/local/bin", `${process.env.HOME ?? ""}/.local/bin`].filter(Boolean).join(":");
  return env;
}
var AUTH_ERROR = /Failed to authenticate|Not logged in|Please run \/login|Login expired|OAuth session expired|Invalid authentication|authentication_error/i;
function claudeBin(override) {
  if (process.env.FOLDERBOT_CLI_BIN) return process.env.FOLDERBOT_CLI_BIN;
  if (override) return override;
  for (const p2 of [join4(homedir4(), ".local", "bin", "claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"]) if (existsSync4(p2)) return p2;
  return "claude";
}
function transcriptExists(cwd, sid) {
  const roots = [process.env.CLAUDE_CONFIG_DIR ? join4(process.env.CLAUDE_CONFIG_DIR, "projects") : join4(homedir4(), ".claude", "projects")];
  for (const base of roots) {
    if (!existsSync4(base)) continue;
    const slugs = /* @__PURE__ */ new Set();
    for (const form of [cwd, cwd.normalize("NFC"), cwd.normalize("NFD")]) slugs.add(form.replace(/[^a-zA-Z0-9]/g, "-"));
    for (const s2 of slugs) if (existsSync4(join4(base, s2, `${sid}.jsonl`))) return true;
    try {
      for (const d of readdirSync2(base)) if (existsSync4(join4(base, d, `${sid}.jsonl`))) return true;
    } catch {
    }
  }
  return false;
}
var ClaudeWorker = class extends EventEmitter2 {
  proc;
  cliSessionId;
  lastError = "";
  pending = /* @__PURE__ */ new Map();
  deferredAsks = /* @__PURE__ */ new Set();
  stderrBuf = "";
  constructor(spec) {
    super();
    this.cliSessionId = spec.resume ?? null;
    const args = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--permission-prompt-tool", "stdio"];
    if (spec.permissionMode && spec.permissionMode !== "default") args.push("--permission-mode", spec.permissionMode);
    for (const d of spec.addDirs ?? []) args.push("--add-dir", d);
    if (spec.mcpConfig) args.push("--mcp-config", spec.mcpConfig);
    if (spec.model) args.push("--model", spec.model);
    if (spec.effort) args.push("--effort", spec.effort);
    if (spec.name) args.push("--name", spec.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 60));
    if (spec.appendSystemPrompt) args.push("--append-system-prompt", spec.appendSystemPrompt);
    args.push("--settings", JSON.stringify({ crossSessionInbound: "accept" }));
    if (spec.resume && transcriptExists(spec.cwd, spec.resume)) args.push("--resume", spec.resume);
    this.proc = spawn2(claudeBin(spec.bin), args, { cwd: spec.cwd, env: cleanClaudeEnv() });
    this.proc.stderr.on("data", (d) => {
      this.stderrBuf = (this.stderrBuf + d.toString()).slice(-4e3);
      this.lastError = this.stderrBuf;
    });
    this.proc.stdin.on("error", (e) => {
      this.lastError = e.message;
    });
    const rl = createInterface2({ input: this.proc.stdout });
    rl.on("line", (raw) => this.onLine(raw));
    this.proc.on("exit", (code, signal) => this.emit("exit", code, signal, this.lastError));
    this.proc.on("error", (err) => {
      this.lastError = err.message;
      this.emit("exit", 1, null, err.message);
    });
  }
  onLine(raw) {
    let line;
    try {
      line = JSON.parse(raw);
    } catch {
      return;
    }
    if (line.type === "control_request") {
      const req = line.request ?? {};
      if (req.subtype === "can_use_tool" && line.request_id) {
        const p2 = { requestId: line.request_id, toolName: String(req.tool_name ?? "tool"), displayName: String(req.display_name ?? req.tool_name ?? "tool"), description: String(req.description ?? ""), input: req.input ?? {}, suggestions: [], ask: req.tool_name === "AskUserQuestion" };
        const sugg = req.permission_suggestions ?? [];
        p2.suggestions = sugg.length ? sugg : fallbackRules(p2.toolName, p2.input);
        this.pending.set(p2.requestId, p2);
        this.emit("permission", p2);
      }
      return;
    }
    if (line.type === "control_response") return;
    if (line.session_id) this.cliSessionId = line.session_id;
    if (line.type === "result" && line.stop_reason === "tool_deferred" && line.deferred_tool_use?.name === "AskUserQuestion" && line.deferred_tool_use.id) {
      const d = line.deferred_tool_use;
      const p2 = { requestId: d.id, toolName: "AskUserQuestion", displayName: "AskUserQuestion", description: "", input: d.input ?? {}, suggestions: [], ask: true };
      this.deferredAsks.add(p2.requestId);
      this.pending.set(p2.requestId, p2);
      this.emit("permission", p2);
      return;
    }
    this.emit("line", line);
  }
  write(o) {
    if (this.proc.exitCode !== null || this.proc.signalCode !== null || !this.proc.stdin.writable) return false;
    try {
      this.proc.stdin.write(JSON.stringify(o) + "\n");
      return true;
    } catch {
      return false;
    }
  }
  send(text) {
    return this.write({ type: "user", message: { role: "user", content: [{ type: "text", text }] } });
  }
  respondPermission(requestId, allow, always = false) {
    const p2 = this.pending.get(requestId);
    this.pending.delete(requestId);
    if (this.deferredAsks.delete(requestId)) {
      this.write({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: requestId, is_error: true, content: "\uC0AC\uC6A9\uC790\uAC00 \uC9C8\uBB38\uC744 \uCDE8\uC18C\uD588\uC2B5\uB2C8\uB2E4. \uBC18\uBCF5\uD558\uC9C0 \uB9D0\uACE0 \uC9C4\uD589\uD558\uC138\uC694." }] } });
      return;
    }
    const inner = allow ? { behavior: "allow", updatedInput: p2?.input ?? {}, ...always && p2 && p2.suggestions.length ? { updatedPermissions: p2.suggestions } : {} } : { behavior: "deny", message: "\uC0AC\uC6A9\uC790\uAC00 Folder Bot \uC5D0\uC11C \uAC70\uBD80\uD588\uC2B5\uB2C8\uB2E4" };
    this.write({ type: "control_response", response: { subtype: "success", request_id: requestId, response: inner } });
  }
  respondAsk(requestId, answers) {
    const p2 = this.pending.get(requestId);
    this.pending.delete(requestId);
    if (this.deferredAsks.delete(requestId)) {
      this.write({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: requestId, content: JSON.stringify(answers) }] } });
      return;
    }
    this.write({ type: "control_response", response: { subtype: "success", request_id: requestId, response: { behavior: "allow", updatedInput: { ...p2?.input ?? {}, answers } } } });
  }
  interrupt() {
    this.write({ type: "control_request", request_id: randomUUID(), request: { subtype: "interrupt" } });
  }
  kill() {
    try {
      this.proc.kill("SIGTERM");
    } catch {
    }
    setTimeout(() => {
      try {
        this.proc.kill("SIGKILL");
      } catch {
      }
    }, 4e3).unref();
  }
  get alive() {
    return this.proc.exitCode === null && this.proc.signalCode === null;
  }
};
var SessionManager = class extends EventEmitter2 {
  recs = /* @__PURE__ */ new Map();
  workers = /* @__PURE__ */ new Map();
  streaming = /* @__PURE__ */ new Map();
  /**
   * 「파일 전후 diff」(루프 6/10) — 도구가 파일을 **건드리기 전** 의 글을 세션마다 붙잡아 둔다.
   * 🔴 **«전» 은 봇이 마지막으로 본 내용이다** — `tool_use` 가 도착한 순간에 디스크를 읽으면 늦을 수 있다.
   *    CLI 는 줄을 흘리고 **곧바로** 도구를 돌리므로(스텁은 같은 틱에 쓴다 · 실측: 전 = 후) 경주가 된다.
   *    대신 Claude Code 의 규칙을 탄다 — **있는 파일은 Read 한 뒤에만 Write·Edit 할 수 있다.** 그래서
   *    Read 가 도착할 때 디스크를 읽어 `seen` 에 두고(그때는 아무도 안 고친다), 고치는 도구가 오면 그걸 «전» 으로 삼는다.
   *    `seen` 에 없는 파일에 Write 가 오면 **새 파일**(null)이다 — 디스크를 읽지 않는다(읽으면 경주에 진다).
   *    고친 뒤(tool_result)에는 디스크를 다시 읽어 `seen` 을 갱신한다 — 다음 턴의 «전» 이다.
   * ⚠ 한 턴 안에서는 첫 손댐만 «전» 이다 — Edit 를 다섯 번 해도 사람이 보고 싶은 것은 «턴 전 ↔ 지금» 이다.
   * ⚠ 메모리에만 산다(세션당 60개 · 2MB 넘는 파일은 안 잡는다) — 호스트를 다시 켜면 «전을 모른다» 고 답한다.
   */
  befores = /* @__PURE__ */ new Map();
  seen = /* @__PURE__ */ new Map();
  turnAt = /* @__PURE__ */ new Map();
  dir = ensureDir(join4(dataDir(), "sessions"));
  idleTtlMs = 60 * 60 * 1e3;
  mcpUrl = () => void 0;
  systemPromptFor = () => "";
  bin;
  /** 새 세션이 물려받는 기본값 — 기존 세션은 만들 때의 값을 유지한다 */
  /**
   * 새 세션의 기본값 — 🔴 **벤더마다 따로 둔다.** 하나로 두면 Codex 세션이 `claude-opus-5` 로 떠서
   *    그 자리에서 죽는다(이름 체계가 다르다 · core/agents.ts).
   */
  defaults = { claude: {}, codex: {} };
  /** Codex 는 우리가 승인 화면을 못 띄운다 — 이 값이 곧 권한 정책이다(codex.ts 머리말) */
  codexSandbox = "read-only";
  openaiApiKey;
  /** Claude 새 세션의 기본 권한 모드 — 만들 때 값을 안 주면 이걸 쓴다(설정 › Claude). Codex 는 샌드박스가 그 자리다 */
  defaultPermissionMode;
  constructor() {
    super();
    for (const f2 of readdirSync2(this.dir).filter((f3) => f3.endsWith(".json"))) {
      try {
        const r = JSON.parse(readFileSync3(join4(this.dir, f2), "utf8"));
        if (r.deleted) continue;
        if (r.state === "running" || r.state === "awaiting_input") r.state = "idle";
        if (closeOpenItems(r.items, "restore").length) atomicWrite(join4(this.dir, f2), JSON.stringify({ ...r, items: r.items.slice(-1500) }));
        this.recs.set(r.id, r);
      } catch {
      }
    }
    setInterval(() => this.reclaim(), 6e4).unref();
  }
  list(botId) {
    return [...this.recs.values()].filter((r) => !botId || r.botId === botId).sort((a, b2) => b2.lastActivity - a.lastActivity).map((r) => this.info(r));
  }
  info(r) {
    const w2 = this.workers.get(r.id);
    return { id: r.id, botId: r.botId, name: r.name, vendor: r.vendor, state: r.state, cliSessionId: r.cliSessionId, createdAt: r.createdAt, lastActivity: r.lastActivity, lastReplyAt: r.lastReplyAt, readAt: r.readAt, alive: !!w2?.alive, hibernated: !w2 && !!r.cliSessionId, bg: r.items.filter((it) => it.kind === "subagent" && it.bg && it.status === "run").length, pending: w2 ? [...w2.pending.values()] : [], lastError: r.lastError, routine: r.routine, activity: r.activity, turnStartedAt: r.turnStartedAt, model: r.model, effort: r.effort, permissionMode: r.permissionMode, ctx: r.ctx, restartPending: r.restartPending };
  }
  get(id) {
    return this.recs.get(id);
  }
  /** 볼트 전체의 세션 기록 — 「지난 대화 찾기」 가 훑는다(읽기만) */
  all() {
    return [...this.recs.values()];
  }
  /** 「전」 — `undefined` = 모른다(호스트 재시작·상한 밖) · `null` = 그때는 파일이 없었다 */
  before(sid, abs) {
    return this.befores.get(sid)?.get(abs)?.text;
  }
  seenOf(r) {
    let m2 = this.seen.get(r.id);
    if (!m2) {
      m2 = /* @__PURE__ */ new Map();
      this.seen.set(r.id, m2);
    }
    return m2;
  }
  diskText(abs) {
    try {
      if (!existsSync4(abs)) return null;
      const st = statSync2(abs);
      return st.size > 2e6 ? null : readFileSync3(abs, "utf8");
    } catch {
      return null;
    }
  }
  captureBefore(r, abs, tool) {
    const turn = this.turnAt.get(r.id) ?? 0;
    let m2 = this.befores.get(r.id);
    if (!m2) {
      m2 = /* @__PURE__ */ new Map();
      this.befores.set(r.id, m2);
    }
    const had = m2.get(abs);
    if (had && had.turn === turn) return;
    if (!had && m2.size >= 60) return;
    const seen = this.seenOf(r);
    const text = seen.has(abs) ? seen.get(abs) ?? null : tool === "Write" ? null : this.diskText(abs);
    m2.set(abs, { text, turn });
  }
  items(id) {
    return this.recs.get(id)?.items ?? [];
  }
  create(bot, name, opts = {}) {
    const id = `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const r = { id, botId: bot.id, name, cwd: bot.repo ?? bot.abs, cliSessionId: null, state: "idle", createdAt: Date.now(), lastActivity: Date.now(), items: [], routine: opts.routine, permissionMode: opts.permissionMode ?? ((opts.vendor ?? bot.vendor) === "codex" ? void 0 : this.defaultPermissionMode), vendor: opts.vendor ?? bot.vendor, model: opts.model ?? this.defaults[opts.vendor ?? bot.vendor].model, effort: opts.effort ?? this.defaults[opts.vendor ?? bot.vendor].effort };
    this.recs.set(id, r);
    this.persist(r);
    this.emit("sessions", bot.id);
    return r;
  }
  remove(id) {
    this.workers.get(id)?.kill();
    this.workers.delete(id);
    const r = this.recs.get(id);
    this.recs.delete(id);
    try {
      const f2 = join4(this.dir, `${id}.json`);
      if (existsSync4(f2)) atomicWrite(f2, JSON.stringify({ ...r, deleted: true }));
    } catch {
    }
    if (r) this.emit("sessions", r.botId);
  }
  /** ⚠ 사람이 지은 이름은 **표시를 남긴다** — 그래야 첫 말 자동 제목이 이걸 안 덮는다 */
  /**
   * S · 여기까지 읽었다 — 화면이 **맨 아래에 닿고 턴이 끝났을 때** 부른다(`core/unread.shouldMarkRead`).
   * ⚠ 읽은 지점은 «지금» 이 아니라 **그 세션의 마지막 답 시각**으로 적는다. «지금» 으로 적으면 읽는 사이에 온 답까지
   *   읽은 것이 돼 버린다(시계가 아니라 내용을 가리켜야 한다).
   */
  markRead(id, at) {
    const r = this.recs.get(id);
    if (!r) return void 0;
    const next = at ?? r.lastReplyAt ?? Date.now();
    if ((r.readAt ?? 0) >= next) return r;
    r.readAt = next;
    this.persist(r);
    this.emit("sessions", r.botId);
    return r;
  }
  rename(id, name) {
    const r = this.recs.get(id);
    if (!r) return;
    r.name = name;
    r.named = true;
    this.persist(r);
    this.emit("sessions", r.botId);
  }
  /**
   * 🔴 **첫 말이 제목이 된다** (2026-09-15 Dave: «첫 채팅이 진행되면 그에 맞는 채팅 제목을 자동으로»).
   *    목록에 「세션 1 · 세션 2 · 세션 3」 만 서 있으면 **어느 것이 무엇이었는지** 를 알 길이 없다.
   * ⚠ 바꾸는 때는 **첫 사용자 메시지 한 번뿐**이다 — 대화가 흐를 때마다 이름이 바뀌면 목록이 출렁이고,
   *   사람이 찾아 둔 세션이 눈앞에서 다른 이름이 된다.
   * ⚠ 덮는 대상은 **앱이 붙인 이름**(`세션 3` 류)뿐 — 사람이 지었거나(`named`) 루틴이 지은 이름은 그대로 둔다.
   * ⚠ 호스트에서 한다 — 화면·MCP·루틴 어디로 들어온 첫 말이든 같은 규칙을 받는다(클라이언트마다 다시 짜지 않는다).
   */
  autoTitle(r, text) {
    if (r.named || r.routine) return;
    if (!isAutoSessionName(r.name)) return;
    if (r.items.some((i) => i.kind === "user")) return;
    const t = titleFromText(text);
    if (!t || t === r.name) return;
    r.name = t;
    this.emit("sessions", r.botId);
  }
  /** 세션의 모델·노력·모드 — 셋 다 스폰 인자라 워커를 내리고 같은 id 로 이어서 띄운다. 턴이 도는 중이면 끝난 뒤에 */
  configure(r, o) {
    let changed = false;
    if (o.model !== void 0 && o.model !== r.model) {
      r.model = o.model || void 0;
      changed = true;
    }
    if (o.effort !== void 0 && o.effort !== r.effort) {
      r.effort = o.effort || void 0;
      changed = true;
    }
    if (o.permissionMode !== void 0 && o.permissionMode !== r.permissionMode) {
      r.permissionMode = o.permissionMode;
      changed = true;
    }
    if (!changed) return;
    const w2 = this.workers.get(r.id);
    if (w2?.alive) {
      let answered = false;
      for (const p2 of [...w2.pending.values()]) if (this.autoAllow(r, w2, p2)) answered = true;
      if (answered && !w2.pending.size) this.setState(r, { kind: "input_provided" });
      if (r.state === "running" || r.state === "awaiting_input" || w2.pending.size) r.restartPending = true;
      else {
        w2.kill();
        this.workers.delete(r.id);
      }
    }
    this.persist(r);
    this.emit("sessions", r.botId);
  }
  /** 새 모드가 허락하는 물음이면 호스트가 «허용» 을 누른다 — 기록은 남긴다(조용히 넘어가지 않는다) */
  autoAllow(r, w2, p2) {
    if (!autoAllows(r.permissionMode, p2.toolName) || !w2.pending.has(p2.requestId)) return false;
    w2.respondPermission(p2.requestId, true);
    this.push(r, { id: itemId("s"), t: Date.now(), kind: "system", text: `\uC790\uB3D9 \uD5C8\uC6A9 \xB7 ${p2.displayName} (${r.permissionMode === "acceptEdits" ? "\uD3B8\uC9D1 \uC790\uB3D9 \uC218\uB77D" : "\uD56D\uC0C1 \uD5C8\uC6A9"} \uBAA8\uB4DC)` });
    return true;
  }
  slashOf(id) {
    return this.recs.get(id)?.slash ?? [];
  }
  persist(r) {
    const slim = { ...r, items: r.items.slice(-1500) };
    atomicWrite(join4(this.dir, `${r.id}.json`), JSON.stringify(slim));
  }
  push(r, item, replace = false) {
    if (replace) {
      const i = r.items.findIndex((x2) => x2.id === item.id);
      if (i >= 0) r.items[i] = item;
      else r.items.push(item);
    } else r.items.push(item);
    if (item.kind === "assistant") r.lastReplyAt = Date.now();
    r.lastActivity = Date.now();
    this.emit("chat", r.id, item, replace);
  }
  setState(r, ev) {
    const prev = r.state;
    const next = transition(prev, ev);
    if (next === prev) return;
    r.state = next;
    this.persist(r);
    this.emit("state", r, prev, shouldNotify(prev, next));
  }
  /**
   * 워커 확보 — 없으면 (같은 cli 세션 id 로) 띄운다.
   * 봇의 `vendor` 가 워커의 종류를 고른다 — 여기서 갈리고, 아래는 어느 CLI 인지 모른다
   * (둘 다 `line`·`exit` 만 내보내고 `send`·`kill` 만 받는다).
   */
  ensureWorker(r, bot) {
    const existing = this.workers.get(r.id);
    if (existing?.alive) return existing;
    const w2 = (r.vendor ?? bot.vendor) === "codex" ? new CodexWorker({ cwd: r.cwd, resume: r.cliSessionId, model: fitsProvider("codex", r.model) ? r.model : void 0, effort: r.effort, sandbox: this.codexSandbox, apiKey: this.openaiApiKey }) : new ClaudeWorker({ cwd: r.cwd, resume: r.cliSessionId, permissionMode: r.permissionMode, addDirs: bot.repo ? [bot.abs] : void 0, mcpConfig: this.mcpUrl(r.id, bot.id), model: r.model, effort: r.effort, name: `${bot.name}-${r.name}`, appendSystemPrompt: this.systemPromptFor(bot) || void 0, bin: this.bin });
    this.workers.set(r.id, w2);
    w2.on("line", (line) => this.onLine(r, line));
    w2.on("permission", (p2) => {
      if (this.autoAllow(r, w2, p2)) return;
      this.setState(r, { kind: "permission_requested" });
      this.emit("permission", r, p2);
    });
    w2.on("exit", (code, _sig, err) => {
      if (this.workers.get(r.id) === w2) this.workers.delete(r.id);
      if (w2.cliSessionId) r.cliSessionId = w2.cliSessionId;
      for (const it of closeOpenItems(r.items, "exit")) this.push(r, it, true);
      this.streaming.delete(r.id);
      this.thinking.delete(r.id);
      this.thinkSent.delete(r.id);
      this.thinkShown.delete(r.id);
      if (code !== 0 && code !== 143 && code !== 137 && code !== null) {
        r.lastError = (err || `exit ${code}`).trim().slice(-600);
        const authErr = AUTH_ERROR.test(r.lastError);
        const lastUser = [...r.items].reverse().find((it) => it.kind === "user");
        if (!authErr && r.model && !r.modelRetried && isModelRejected(r.lastError) && lastUser?.text) {
          r.modelRetried = true;
          const was = r.model;
          r.model = void 0;
          this.push(r, { id: itemId("s"), t: Date.now(), kind: "system", text: `${was} \uB294 \uC774 \uACC4\uC815\uC5D0\uC11C \uBABB \uC368\uC694 \u2014 \uAE30\uBCF8 \uBAA8\uB378\uB85C \uB2E4\uC2DC \uBCF4\uB0C5\uB2C8\uB2E4` });
          this.persist(r);
          const bot2 = bot;
          setTimeout(() => {
            try {
              this.send(r, bot2, lastUser.text);
            } catch {
            }
          }, 50);
          this.emit("sessions", r.botId);
          return;
        }
        this.push(r, { id: itemId("e"), t: Date.now(), kind: "system", text: authErr ? "Claude \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD574\uC694 \u2014 \uBBF8\uB2C8\uC5D0\uC11C claude \u2192 /login, \uB610\uB294 \uC124\uC815 \u203A Claude \uD1A0\uD070" : `\uC138\uC158\uC744 \uBABB \uB744\uC6E0\uC5B4\uC694 \xB7 ${r.lastError.split("\n").pop() ?? ""}` });
        if (authErr) this.emit("auth-error", r);
      }
      this.setState(r, { kind: "process_exited", code });
      this.emit("sessions", r.botId);
    });
    this.emit("sessions", r.botId);
    return w2;
  }
  thinking = /* @__PURE__ */ new Map();
  /** 생각 스트림을 렌더러로 보낸 마지막 시각 — 길이 나머지(%40)로 던지면 큰 청크가 오는 모델에서 한 번도 안 맞아 화면이 비어 있었다 */
  thinkSent = /* @__PURE__ */ new Map();
  /** 생각 항목을 채팅에 넣었나 — 본문이 생기기 전엔 넣지 않는다. 실측(CLI 2.1.269 `-p`, Opus 5·Sonnet 5·Haiku 4.5 전부):
   *  thinking 블록과 delta 가 오지만 `thinking` 은 빈 문자열이고 서명만 있다. 즉 headless 출력은 생각 내용을 주지 않는다.
   *  그러니 빈 «생각 · (내용 없음)» 행을 도구마다 남기지 말고, 생각 중임은 상태줄(activity)로만 보인다. */
  thinkShown = /* @__PURE__ */ new Set();
  /** 생각 블록 마감 — 본문이 있으면 채팅에 남기고(이미 보였으면 교체), 없으면 조용히 버린다 */
  endThinking(r, extra = []) {
    const th = this.thinking.get(r.id);
    if (!th) {
      for (const t of extra) this.push(r, { id: itemId("th"), t: Date.now(), kind: "thinking", text: t });
      return;
    }
    this.thinking.delete(r.id);
    this.thinkSent.delete(r.id);
    if (!th.text.trim() && extra.length) th.text = extra.join("\n\n");
    th.streaming = false;
    const shown = this.thinkShown.delete(r.id);
    if (!th.text.trim()) return;
    if (shown) this.push(r, th, true);
    else this.push(r, th);
  }
  activityAt = /* @__PURE__ */ new Map();
  /** «지금 하는 일» 한 줄 — 0.4초에 한 번만 밖으로 (토큰마다 쏘지 않는다) */
  setActivity(r, text, force = false) {
    r.activity = text;
    const last = this.activityAt.get(r.id) ?? 0;
    if (!force && Date.now() - last < 400) return;
    this.activityAt.set(r.id, Date.now());
    this.emit("activity", r);
  }
  /**
   * 백그라운드 Agent 의 생애 — CLI 2.1.269 실측 (2026-09-13):
   *   tool_use Agent{run_in_background} → system/task_started{task_id, tool_use_id, is_backgrounded}
   *   → tool_result «Async agent launched…»(즉시) → result(턴 끝) → …(부모 id 단 줄들)… → system/task_notification{tool_use_id, status, summary}
   *   → CLI 가 스스로 새 턴을 열어 이어 간다(system/init → assistant → result).
   * 종전엔 즉시 오는 tool_result 로 «끝남» 을 찍어 실제로는 돌고 있는데 끝난 것처럼 보였고, 반대로 호스트가 재시작되면 영원히 «실행 중» 이었다.
   */
  onTask(r, line) {
    const byTool = line.tool_use_id ? r.items.find((it2) => it2.id === `t_${line.tool_use_id}`) : void 0;
    const it = byTool ?? (line.task_id ? r.items.find((x2) => x2.kind === "subagent" && x2.taskId === line.task_id) : void 0);
    if (!it || it.kind !== "subagent") return;
    if (line.subtype === "task_started") {
      it.taskId = line.task_id;
      if (line.is_backgrounded) it.bg = true;
      this.push(r, it, true);
      return;
    }
    if (line.subtype === "task_updated") {
      const st = line.patch?.status;
      if (st === "failed" || st === "killed" || st === "cancelled") {
        it.status = "error";
        it.result = it.result || `\uBC31\uADF8\uB77C\uC6B4\uB4DC \uC791\uC5C5 ${st}`;
        this.push(r, it, true);
      }
      return;
    }
    it.status = line.status === "completed" ? "done" : "error";
    if (line.summary) it.result = String(line.summary).slice(0, 2e3);
    this.push(r, it, true);
    this.setActivity(r, `${it.name} \uB05D\uB0A8`, true);
    this.emit("sessions", r.botId);
  }
  subOf(r, parentId) {
    if (!parentId) return void 0;
    for (let i = r.items.length - 1; i >= 0; i--) {
      const it = r.items[i];
      if (it.id === `t_${parentId}`) return it.kind === "subagent" ? it : void 0;
    }
    return void 0;
  }
  /**
   * 🔴 **지금 도는 모델은 CLI 가 말해 준다** (2026-09-15 Dave: *«모델이 바뀌었지만 하단에 반영이 안되네»*
   *    — 대화에서 `/model claude-opus-4-8` 을 치면 CLI 는 바꿔 주는데 우리 칩은 고른 적 없는
   *    옛 이름을 계속 들고 있었다). 답에 찍혀 오는 이름이 정본이다.
   * ⚠ 날짜 꼬리표만 다른 것은 **같은 모델**이다(`sameModel`) — 아니면 사람이 고른 이름이 매 턴 덮인다.
   * ⚠ 서브에이전트 줄은 제 모델이라 세지 않는다.
   */
  noteModel(r, line) {
    if (line.parent_tool_use_id) return;
    const m2 = modelOf(line);
    if (!m2 || sameModel(m2, r.model)) return;
    r.model = m2;
    this.persist(r);
    this.emit("sessions", r.botId);
  }
  onLine(r, line) {
    if (line.session_id && r.cliSessionId !== line.session_id) {
      r.cliSessionId = line.session_id;
      this.persist(r);
    }
    if (line.type === "system" && (line.subtype === "task_started" || line.subtype === "task_notification" || line.subtype === "task_updated")) {
      this.onTask(r, line);
      return;
    }
    this.noteModel(r, line);
    if (line.type === "system" && line.subtype === "init") {
      if (Array.isArray(line.slash_commands)) {
        r.slash = line.slash_commands.map(String);
        this.emit("sessions", r.botId);
      }
      return;
    }
    const parent = line.parent_tool_use_id ?? null;
    if (line.type === "stream_event") {
      const ev = line.event;
      if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta" && !parent) {
        let cur = this.streaming.get(r.id);
        if (!cur) {
          cur = { id: itemId("a"), t: Date.now(), kind: "assistant", text: "", streaming: true };
          this.streaming.set(r.id, cur);
          r.items.push(cur);
        }
        cur.text += ev.delta.text ?? "";
        this.emit("chat", r.id, cur, true);
        this.setActivity(r, "\uB2F5 \uC4F0\uB294 \uC911");
      } else if (ev?.type === "content_block_delta" && ev.delta?.type === "thinking_delta" && !parent) {
        let th = this.thinking.get(r.id);
        if (!th) {
          th = { id: itemId("th"), t: Date.now(), kind: "thinking", text: "", streaming: true };
          this.thinking.set(r.id, th);
        }
        th.text += ev.delta.thinking ?? "";
        if (th.text.trim() && !this.thinkShown.has(r.id)) {
          this.thinkShown.add(r.id);
          r.items.push(th);
        }
        const now = Date.now();
        if (this.thinkShown.has(r.id) && now - (this.thinkSent.get(r.id) ?? 0) > 150) {
          this.thinkSent.set(r.id, now);
          this.emit("chat", r.id, th, true);
        }
        this.setActivity(r, th.text.trim() ? `\uC0DD\uAC01 \uC911 \xB7 ${th.text.slice(-90).replace(/\s+/g, " ")}` : "\uC0DD\uAC01 \uC911");
      }
      this.setState(r, { kind: "stream_activity" });
      return;
    }
    if (line.type === "assistant") {
      const sub = this.subOf(r, parent);
      const text = assistantText(line);
      if (!parent) {
        const c = contextOf(line, r.ctx, r.model);
        if (c) {
          r.ctx = c;
          this.emit("sessions", r.botId);
        }
      }
      if (!parent) {
        this.endThinking(r, (line.message?.content ?? []).filter((b2) => b2.type === "thinking" && typeof b2.thinking === "string").map((b2) => String(b2.thinking)).filter((t) => t.trim()));
        const cur = this.streaming.get(r.id);
        if (text) {
          if (cur) {
            cur.text = text;
            cur.streaming = false;
            this.streaming.delete(r.id);
            this.push(r, cur, true);
          } else this.push(r, { id: itemId("a"), t: Date.now(), kind: "assistant", text });
        }
      } else if (sub && text) {
        sub.last = text.slice(0, 80).replace(/\s+/g, " ");
        this.push(r, sub, true);
      }
      const touched = [];
      for (const b2 of line.message?.content ?? []) {
        if (b2.type !== "tool_use") continue;
        const name = String(b2.name ?? "tool");
        const input = b2.input ?? {};
        const id = `t_${String(b2.id ?? itemId("t"))}`;
        if (name === "TodoWrite" && !parent) {
          const todos = Array.isArray(input.todos) ? input.todos : [];
          this.push(r, { id: `todos_${r.id}`, t: Date.now(), kind: "todos", items: todos.map((x2) => ({ content: String(x2.content ?? ""), status: x2.status === "completed" || x2.status === "in_progress" ? x2.status : "pending", activeForm: x2.activeForm ? String(x2.activeForm) : void 0 })) }, true);
          continue;
        }
        if ((name === "Task" || name === "Agent") && !parent) {
          this.push(r, { id, t: Date.now(), kind: "subagent", name: toolSummary(name, input) || "\uC11C\uBE0C\uC5D0\uC774\uC804\uD2B8", prompt: typeof input.prompt === "string" ? input.prompt : "", tools: 0, last: "", status: "run" });
          this.setActivity(r, `\uC5D0\uC774\uC804\uD2B8 \xB7 ${toolSummary(name, input)}`, true);
          continue;
        }
        this.push(r, { id, t: Date.now(), kind: "tool", name, summary: toolSummary(name, input), input, parentId: sub ? sub.id : void 0 });
        if (sub) {
          sub.tools += 1;
          sub.last = `${name} ${toolSummary(name, input)}`.slice(0, 80);
          this.push(r, sub, true);
        }
        this.setActivity(r, `${sub ? `${sub.name} \u203A ` : ""}${name} \xB7 ${toolSummary(name, input)}`.slice(0, 120), true);
        const tp = touchedPath(name, input);
        if (tp) {
          touched.push(tp);
          this.captureBefore(r, tp, name);
        } else if (name === "Read" && typeof input.file_path === "string") this.seenOf(r).set(input.file_path, this.diskText(input.file_path));
      }
      if (touched.length) this.push(r, { id: itemId("f"), t: Date.now(), kind: "files", paths: touched });
      this.setState(r, { kind: "stream_activity" });
      return;
    }
    if (line.type === "user") {
      for (const b2 of line.message?.content ?? []) {
        if (b2.type !== "tool_result") continue;
        const id = `t_${String(b2.tool_use_id ?? "")}`;
        let it;
        for (let i = r.items.length - 1; i >= 0; i--) if (r.items[i].id === id) {
          it = r.items[i];
          break;
        }
        const c = b2.content;
        const resText = (typeof c === "string" ? c : Array.isArray(c) ? c.map((x2) => x2.text ?? "").join("\n") : "").slice(0, 2e3);
        if (it && it.kind === "tool") {
          it.result = resText;
          it.isError = !!b2.is_error;
          this.push(r, it, true);
          const tp = touchedPath(it.name, it.input ?? {});
          if (tp && !b2.is_error) {
            this.seenOf(r).set(tp, this.diskText(tp));
            r.wroteThisTurn = true;
            this.emit("files", r.botId);
          }
        } else if (it && it.kind === "subagent") {
          if (it.bg || /^Async agent launched/i.test(resText)) {
            it.bg = true;
            this.push(r, it, true);
          } else {
            it.status = b2.is_error ? "error" : "done";
            it.result = resText;
            this.push(r, it, true);
          }
        }
      }
      return;
    }
    if (line.type === "result") {
      if (parent) return;
      const cur = this.streaming.get(r.id);
      if (cur) {
        cur.streaming = false;
        this.streaming.delete(r.id);
        this.push(r, cur, true);
      }
      this.endThinking(r);
      for (const it of closeOpenItems(r.items, "result")) this.push(r, it, true);
      this.push(r, { id: itemId("r"), t: Date.now(), kind: "result", ok: !line.is_error, durationMs: line.duration_ms ?? 0, costUsd: line.total_cost_usd, error: line.is_error ? String(line.error ?? line.result ?? "") : void 0 });
      const ctx = contextOf(line, r.ctx, r.model);
      if (ctx) r.ctx = ctx;
      this.setActivity(r, "", true);
      this.setState(r, { kind: "result_received", isError: !!line.is_error });
      if (r.wroteThisTurn) {
        r.wroteThisTurn = false;
        this.emit("files", r.botId);
      }
      if (r.restartPending) {
        const w2 = this.workers.get(r.id);
        if (!w2 || !w2.pending.size) {
          r.restartPending = false;
          if (w2) {
            w2.kill();
            this.workers.delete(r.id);
          }
        }
      }
      this.persist(r);
      this.emit("sessions", r.botId);
    }
  }
  send(r, bot, text, client) {
    this.autoTitle(r, text);
    if (client) r.lastClient = client;
    const from = client ? { device: client.device, main: client.origin === "host", tier: client.tier } : void 0;
    this.turnAt.set(r.id, Date.now());
    if (r.vendor === "codex") {
      const hit = parseLocalSlash(text, CODEX_LOCAL);
      if (hit) {
        this.push(r, { id: itemId("u"), t: Date.now(), kind: "user", text });
        if (hit.name === "clear" || hit.name === "new") {
          const w0 = this.workers.get(r.id);
          if (w0) {
            w0.kill();
            this.workers.delete(r.id);
          }
          r.cliSessionId = null;
          this.push(r, { id: itemId("s"), t: Date.now(), kind: "system", text: "\uC0C8 \uB300\uD654\uB85C \u2014 \uC5EC\uAE30\uAE4C\uC9C0\uC758 \uB9E5\uB77D\uC744 \uB04A\uC5C8\uC5B4\uC694. \uB2E4\uC74C \uBA54\uC2DC\uC9C0\uB294 \uCC98\uC74C\uBD80\uD130 \uC2DC\uC791\uD569\uB2C8\uB2E4." });
        }
        if (hit.rest) {
          const w22 = this.ensureWorker(r, bot);
          w22.send(hit.rest);
          this.setActivity(r, "\uC2DC\uC791\uD558\uB294 \uC911", true);
          this.setState(r, { kind: "user_sent" });
        } else this.setState(r, { kind: "result_received", isError: false });
        this.persist(r);
        this.emit("sessions", r.botId);
        return;
      }
    }
    const w2 = this.ensureWorker(r, bot);
    this.push(r, { id: itemId("u"), t: Date.now(), kind: "user", text, ...from ? { from } : {} });
    w2.send(withClient(text, client));
    if (r.state !== "running") r.turnStartedAt = Date.now();
    this.setActivity(r, "\uC2DC\uC791\uD558\uB294 \uC911", true);
    this.setState(r, { kind: "user_sent" });
    this.persist(r);
  }
  respondPermission(r, requestId, allow, always = false) {
    const w2 = this.workers.get(r.id);
    if (!w2) return;
    const label = always ? rulesLabel(w2.pending.get(requestId)?.suggestions ?? []) : "";
    w2.respondPermission(requestId, allow, always);
    this.push(r, { id: itemId("s"), t: Date.now(), kind: "system", text: allow ? always ? `\uC774 \uC138\uC158\uC5D0\uC11C \uD56D\uC0C1 \uD5C8\uC6A9${label ? ` \xB7 ${label}` : ""}` : "\uD5C8\uC6A9" : "\uAC70\uBD80" });
    this.setState(r, { kind: "input_provided" });
  }
  respondAsk(r, requestId, answers) {
    const w2 = this.workers.get(r.id);
    if (!w2) return;
    w2.respondAsk(requestId, answers);
    this.push(r, { id: itemId("s"), t: Date.now(), kind: "user", text: Object.values(answers).join(" \xB7 ") });
    this.setState(r, { kind: "input_provided" });
  }
  interrupt(r) {
    this.workers.get(r.id)?.interrupt();
  }
  acknowledge(r) {
    this.setState(r, { kind: "acknowledged" });
  }
  pendingOf(id) {
    return [...this.workers.get(id)?.pending.values() ?? []];
  }
  /** 절전 — 유휴 TTL 넘긴 워커를 내린다(기록·id 유지) */
  reclaim() {
    const now = Date.now();
    for (const [id, w2] of this.workers) {
      const r = this.recs.get(id);
      if (!r) continue;
      if (w2.pending.size) continue;
      if (r.state === "running" || r.state === "awaiting_input") continue;
      if (r.items.some((it) => it.kind === "subagent" && it.bg && it.status === "run")) continue;
      if (now - r.lastActivity > this.idleTtlMs) {
        w2.kill();
        this.workers.delete(id);
        this.emit("sessions", r.botId);
      }
    }
  }
  /**
   * **다시 연결** (2026-09-13 Dave: *«현재 연결된 claude code 나 codex 를 재 연결하는 기능이 없어»*).
   *
   * 인증이 바뀌었을 때 **살아 있는 워커는 옛 환경을 그대로 쥐고 있다** — 로그인을 새로 해도,
   * 토큰을 지워도, 이미 뜬 프로세스에는 닿지 않는다(도구 목록·인증은 시작 시점에 고정된다).
   * 그래서 워커만 내린다: 세션 id·대화·레일 카드는 그대로 남고, 다음 메시지에 **같은 id 로**
   * 새 환경으로 다시 뜬다.
   *
   * ⛔ **일하는 중인 워커를 그 자리에서 죽이지 않는다** — 턴이 끊기면 사람이 쓴 지시가 사라진다.
   *    `restartPending` 으로 표시해 두고 **턴이 끝나면** 스스로 내려간다(설정 변경과 같은 길).
   * ⚠ 되돌아오는 수는 «지금 내린 것 · 끝나면 내릴 것» 둘이다 — 화면이 그대로 사람에게 말해 준다.
   */
  recycleAll(vendor) {
    let now = 0, pending = 0;
    for (const [id, w2] of [...this.workers]) {
      const r = this.recs.get(id);
      if (!r || vendor && r.vendor !== vendor) continue;
      if (r.state === "running" || r.state === "awaiting_input" || w2.pending.size) {
        r.restartPending = true;
        pending++;
        continue;
      }
      w2.kill();
      this.workers.delete(id);
      now++;
      this.emit("sessions", r.botId);
    }
    return { now, pending };
  }
  hibernate(id) {
    const w2 = this.workers.get(id);
    if (w2) {
      w2.kill();
      this.workers.delete(id);
    }
    const r = this.recs.get(id);
    if (r) this.emit("sessions", r.botId);
  }
  stopAll() {
    for (const w2 of this.workers.values()) w2.kill();
  }
  liveCount() {
    return [...this.workers.values()].filter((w2) => w2.alive).length;
  }
  liveCountFor(botId) {
    return [...this.workers.entries()].filter(([id, w2]) => w2.alive && this.recs.get(id)?.botId === botId).length;
  }
};

// src/core/modelList.ts
var MODEL_RE = {
  claude: /^claude-[a-z0-9][a-z0-9.\-]{2,48}$/i,
  // ⚠ **숫자가 하나는 있어야 한다**(`(?=.*\d)`) — 안 그러면 `codex`·`gpts` 같은 평범한 낱말이
  //    설정 파일 아무 데서나 «모델» 로 주워진다. 그리고 `gpt` 뒤는 `-` 로 시작할 수 있다.
  codex: /^(?=.*\d)(gpt|o\d|codex)[a-z0-9.\-]{1,40}$/i
};
function extractModels(data, re, cap = 40) {
  const out = /* @__PURE__ */ new Set();
  const seen = /* @__PURE__ */ new Set();
  const walk = (v2, depth) => {
    if (out.size >= cap || depth > 8 || v2 == null) return;
    if (typeof v2 === "string") {
      if (re.test(v2)) out.add(v2);
      return;
    }
    if (typeof v2 !== "object") return;
    if (seen.has(v2)) return;
    seen.add(v2);
    if (Array.isArray(v2)) {
      for (const x2 of v2) walk(x2, depth + 1);
      return;
    }
    for (const [k2, x2] of Object.entries(v2)) {
      if (re.test(k2)) out.add(k2);
      walk(x2, depth + 1);
    }
  };
  walk(data, 0);
  return [...out];
}
function modelsFromHelp(help, re) {
  const m2 = /possible values:\s*([^\]\n]+)/i.exec(help);
  if (!m2) return [];
  return m2[1].split(/[,\s]+/).map((s2) => s2.trim()).filter((s2) => re.test(s2));
}

// src/host/auth.ts
function credentialsExpiresAt() {
  const dir3 = process.env.CLAUDE_CONFIG_DIR ?? join5(homedir5(), ".claude");
  const f2 = join5(dir3, ".credentials.json");
  if (!existsSync5(f2)) return null;
  try {
    const j = JSON.parse(readFileSync4(f2, "utf8"));
    return j.claudeAiOauth?.expiresAt ?? null;
  } catch {
    return null;
  }
}
async function checkAuth(bin) {
  const main2 = await probe(bin);
  const hasToken = !!cleanClaudeEnv().CLAUDE_CODE_OAUTH_TOKEN;
  if (!hasToken) return { ...main2, keychain: main2.verdict === "loggedin" };
  const bare = await probe(bin, { noToken: true });
  return { ...main2, keychain: bare.verdict === "loggedin" };
}
function parseStatus(out) {
  const a = out.indexOf("{"), b2 = out.lastIndexOf("}");
  if (a < 0 || b2 <= a) return null;
  try {
    return JSON.parse(out.slice(a, b2 + 1));
  } catch {
    return null;
  }
}
function probe(bin, opts = {}) {
  return new Promise((resolve8) => {
    execFile(claudeBin(bin), ["auth", "status", "--json"], { env: cleanClaudeEnv(opts), timeout: 15e3 }, (err, stdout) => {
      const now = Date.now();
      if (err && !stdout) return resolve8({ verdict: "unknown", checkedAt: now, reason: err.message.slice(0, 200) });
      const j = parseStatus(String(stdout));
      if (!j) return resolve8({ verdict: "unknown", checkedAt: now, reason: String(stdout).slice(0, 200) });
      const loggedIn = j.loggedIn === true;
      return resolve8({ verdict: authVerdict({ asked: true, loggedIn, credentialsExpiresAt: loggedIn ? null : credentialsExpiresAt(), now }), email: j.email, plan: j.subscriptionType, checkedAt: now });
    });
  });
}
var codexHome = () => process.env.CODEX_HOME ?? join5(homedir5(), ".codex");
function codexAuth(apiKey) {
  if (apiKey) return { ok: true, how: "key" };
  if (process.env.OPENAI_API_KEY) return { ok: true, how: "key", where: "OPENAI_API_KEY" };
  const home = codexHome();
  for (const f2 of ["auth.json", "credentials.json", ...codexJsonFiles(home)]) {
    const p2 = join5(home, f2);
    if (!existsSync5(p2)) continue;
    if (f2 === "auth.json" || f2 === "credentials.json" || looksLikeAuth(p2)) return { ok: true, how: "login", where: p2 };
  }
  return { ok: false, how: null };
}
function codexJsonFiles(home = codexHome()) {
  try {
    return readdirSync3(home).filter((f2) => f2.endsWith(".json"));
  } catch {
    return [];
  }
}
function looksLikeAuth(p2) {
  try {
    const j = JSON.parse(readFileSync4(p2, "utf8"));
    return Object.keys(j).some((k2) => /token|api_key|apikey|account|refresh/i.test(k2));
  } catch {
    return false;
  }
}
async function diagnose(cfg) {
  const L = [];
  const ps = providers();
  const c = ps.find((x3) => x3.id === "claude");
  const x2 = ps.find((x22) => x22.id === "codex");
  L.push(`\uD50C\uB7AB\uD3FC ${process.platform} \xB7 node ${process.version}`);
  L.push("");
  L.push("[Claude Code]");
  L.push(`  \uBC14\uC774\uB108\uB9AC ${c?.bin ?? "\uBABB \uCC3E\uC74C"}${c?.version ? ` \xB7 ${c.version}` : ""}`);
  const auth = await checkAuth(cfg.claudeBin);
  L.push(`  \uD310\uC815 ${auth.verdict}${auth.reason ? ` (${auth.reason.replace(/\s+/g, " ").slice(0, 120)})` : ""}${auth.email ? ` \xB7 ${auth.email}` : ""}`);
  L.push(`  \uD0A4\uCCB4\uC778 \uB85C\uADF8\uC778 ${auth.keychain ? "\uC77D\uD798" : "\uBABB \uC77D\uC74C"} \xB7 \uC7A5\uAE30 \uD1A0\uD070 ${cfg.tokenSet ? "\uC124\uC815\uB428" : "\uC5C6\uC74C"}`);
  const credDir = process.env.CLAUDE_CONFIG_DIR ?? join5(homedir5(), ".claude");
  L.push(`  \uC790\uACA9\uC99D\uBA85 \uD30C\uC77C ${fileNote(join5(credDir, ".credentials.json"))}`);
  L.push("");
  L.push("[Codex]");
  L.push(`  \uBC14\uC774\uB108\uB9AC ${x2?.bin ?? "\uBABB \uCC3E\uC74C"}${x2?.version ? ` \xB7 ${x2.version}` : ""}`);
  const home = codexHome();
  L.push(`  CODEX_HOME ${home} ${existsSync5(home) ? "(\uC788\uC74C)" : "(\uC5C6\uC74C)"}`);
  const files = codexJsonFiles(home);
  L.push(`  json \uD30C\uC77C ${files.length ? files.map((f2) => `${f2}${fileSize(join5(home, f2))}`).join(" \xB7 ") : "\uC5C6\uC74C"}`);
  const ca = codexAuth(cfg.openaiApiKey);
  L.push(`  \uD310\uC815 ${ca.ok ? `\uC5F0\uACB0\uB428 (${ca.how})` : "\uC548 \uB428"}${ca.where ? ` \xB7 ${ca.where}` : ""}`);
  L.push(`  OPENAI_API_KEY ${process.env.OPENAI_API_KEY ? "\uD658\uACBD\uC5D0 \uC788\uC74C" : "\uC5C6\uC74C"} \xB7 \uC571\uC5D0 \uC800\uC7A5\uB41C \uD0A4 ${cfg.openaiApiKey ? "\uC788\uC74C" : "\uC5C6\uC74C"}`);
  if (x2?.bin) L.push(`  \`codex login status\` \u2192 ${await run(x2.bin, ["login", "status"])}`);
  return L.join("\n");
}
function fileNote(p2) {
  try {
    const st = statSync3(p2);
    return `\uC788\uC74C (${st.size}B \xB7 ${new Date(st.mtimeMs).toISOString().slice(0, 16).replace("T", " ")})`;
  } catch {
    return "\uC5C6\uC74C";
  }
}
function fileSize(p2) {
  try {
    return `(${statSync3(p2).size}B)`;
  } catch {
    return "";
  }
}
function run(bin, args) {
  return new Promise((resolve8) => {
    execFile(bin, args, { env: cleanClaudeEnv({ noToken: true }), timeout: 6e3 }, (err, stdout, stderr) => {
      const out = `${String(stdout)}${String(stderr)}`.trim().split("\n").slice(0, 4).join(" / ").slice(0, 300);
      resolve8(out || (err ? `\uC624\uB958: ${err.message.slice(0, 120)}` : "(\uB2F5 \uC5C6\uC74C)"));
    });
  });
}
var MODEL_MAX = 2 * 1024 * 1024;
function readJson(p2) {
  try {
    if (statSync3(p2).size > MODEL_MAX) return null;
    return JSON.parse(readFileSync4(p2, "utf8"));
  } catch {
    return null;
  }
}
function helpOf(bin, args) {
  try {
    return String(execFileSync3(bin, args, { encoding: "utf8", timeout: 6e3, env: cleanClaudeEnv({ noToken: true }) }));
  } catch {
    return "";
  }
}
function agentModels() {
  const ps = providers();
  const out = { claude: [], codex: [] };
  const cx = ps.find((p2) => p2.id === "codex");
  if (cx?.bin) {
    const found = new Set(modelsFromHelp(helpOf(cx.bin, ["exec", "--help"]), MODEL_RE.codex));
    for (const f2 of codexJsonFiles().filter((n) => /model/i.test(n))) for (const v2 of extractModels(readJson(join5(codexHome(), f2)), MODEL_RE.codex)) found.add(v2);
    out.codex = [...found];
  }
  const cl = ps.find((p2) => p2.id === "claude");
  if (cl?.bin) out.claude = modelsFromHelp(helpOf(cl.bin, ["--help"]), MODEL_RE.claude);
  return out;
}

// src/host/watch.ts
import { watch } from "node:fs";

// src/core/fileWatch.ts
var IGNORED_DIRS = /* @__PURE__ */ new Set([".folderbot", ".projectbot", ".git", "node_modules", ".obsidian", ".Trash"]);
var IGNORED_FILES = /* @__PURE__ */ new Set([".DS_Store"]);
function ignoredChange(rel) {
  const parts = rel.split(/[\\/]/).filter(Boolean);
  if (!parts.length) return false;
  if (IGNORED_FILES.has(parts[parts.length - 1])) return true;
  return parts.some((p2) => IGNORED_DIRS.has(p2));
}
var WATCH_DEBOUNCE_MS = 300;

// src/host/watch.ts
var FolderWatch = class {
  constructor(onChange) {
    this.onChange = onChange;
  }
  onChange;
  ws = /* @__PURE__ */ new Map();
  timers = /* @__PURE__ */ new Map();
  log = () => {
  };
  /** 현재 봇 목록에 맞춘다 — 새 봇은 걸고, 사라진 봇은 풀고, 폴더가 바뀐 봇은 다시 건다 */
  sync(bots) {
    const want = new Map(bots.map((b2) => [b2.id, b2.abs]));
    for (const [id, cur] of this.ws) if (want.get(id) !== cur.abs) this.drop(id);
    for (const [id, abs] of want) if (!this.ws.has(id)) this.add(id, abs);
  }
  add(id, abs) {
    try {
      const w2 = watch(abs, { recursive: true, persistent: false }, (_ev, name) => {
        const rel = name == null ? "" : String(name);
        if (ignoredChange(rel)) return;
        this.bump(id);
      });
      w2.on("error", (e) => {
        this.log(`\uD3F4\uB354 \uAC10\uC2DC \uC624\uB958 \xB7 ${abs} \xB7 ${e.message}`);
        this.drop(id);
      });
      this.ws.set(id, { abs, w: w2 });
    } catch (e) {
      this.log(`\uD3F4\uB354 \uAC10\uC2DC \uC2E4\uD328 \xB7 ${abs} \xB7 ${e.message}`);
    }
  }
  drop(id) {
    const cur = this.ws.get(id);
    if (!cur) return;
    try {
      cur.w.close();
    } catch {
    }
    this.ws.delete(id);
    const t = this.timers.get(id);
    if (t) {
      clearTimeout(t);
      this.timers.delete(id);
    }
  }
  bump(id) {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.set(id, setTimeout(() => {
      this.timers.delete(id);
      if (this.ws.has(id)) this.onChange(id);
    }, WATCH_DEBOUNCE_MS));
  }
  close() {
    for (const id of [...this.ws.keys()]) this.drop(id);
  }
};

// src/host/notify.ts
var import_web_push = __toESM(require_src2(), 1);
import { execFile as execFile2 } from "node:child_process";
import { existsSync as existsSync6, readFileSync as readFileSync5 } from "node:fs";
import { platform as platform2 } from "node:os";
import { join as join6 } from "node:path";
var Notifier = class {
  constructor(cfg) {
    this.cfg = cfg;
    try {
      this.events = JSON.parse(readFileSync5(this.file, "utf8"));
    } catch {
      this.events = [];
    }
    if (!cfg.vapid) {
      const k2 = import_web_push.default.generateVAPIDKeys();
      cfg.vapid = { publicKey: k2.publicKey, privateKey: k2.privateKey };
      saveConfig(cfg);
    }
    import_web_push.default.setVapidDetails("mailto:folderbot@local", cfg.vapid.publicKey, cfg.vapid.privateKey);
  }
  cfg;
  events = [];
  file = join6(ensureDir(dataDir()), "notifications.json");
  onEvent = () => {
  };
  quiet() {
    const q = this.cfg.quiet ?? { from: "23:00", to: "07:00" };
    const [fh, fm] = q.from.split(":").map(Number), [th, tm] = q.to.split(":").map(Number);
    const d = /* @__PURE__ */ new Date();
    const cur = d.getHours() * 60 + d.getMinutes();
    const f2 = fh * 60 + fm, t = th * 60 + tm;
    return f2 > t ? cur >= f2 || cur < t : cur >= f2 && cur < t;
  }
  emit(kind, botId, title, body, sessionId, opts = {}) {
    const n = { id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, t: Date.now(), kind, botId, sessionId, title, body, read: false };
    this.events.unshift(n);
    this.events = this.events.slice(0, 300);
    atomicWrite(this.file, JSON.stringify(this.events));
    this.onEvent(n);
    const suppressed = this.quiet() && kind !== "awaiting";
    if (!suppressed) {
      if (opts.mac !== false) this.mac(title, body, n);
      if (opts.push !== false) void this.push(n);
    }
    return n;
  }
  markRead(ids) {
    for (const e of this.events) if (!ids || ids.includes(e.id)) e.read = true;
    atomicWrite(this.file, JSON.stringify(this.events));
  }
  /** S · 그 세션의 대화를 다 읽었으면 그 세션 알림도 읽음이다 — 두 표면이 어긋나면 배지를 못 믿는다 */
  markReadBySession(sessionId) {
    let hit = false;
    for (const e of this.events) if (e.sessionId === sessionId && !e.read) {
      e.read = true;
      hit = true;
    }
    if (hit) atomicWrite(this.file, JSON.stringify(this.events));
  }
  /**
   * macOS 알림 센터 — terminal-notifier 가 있으면 클릭 시 **그 대화**(`#bot=…&s=…`)를 열고, 없으면 osascript(클릭 없음).
   * ⚠ 데스크톱 앱이 호스트를 안에서 돌릴 때는 `FOLDERBOT_NO_MAC_NOTIFY` 로 꺼진다 — 배너는 앱이 띄우고 앱이 연다.
   *    이 경로는 터미널로 띄운 호스트의 것이라 갈 곳이 브라우저뿐이다(2026-09-17).
   */
  mac(title, body, n) {
    if (platform2() !== "darwin" || process.env.FOLDERBOT_NO_MAC_NOTIFY) return;
    const tn = ["/opt/homebrew/bin/terminal-notifier", "/usr/local/bin/terminal-notifier"].find((p2) => existsSync6(p2));
    const hash = n?.botId ? `#bot=${encodeURIComponent(n.botId)}${n.sessionId ? `&s=${encodeURIComponent(n.sessionId)}` : ""}` : "";
    const url = `http://127.0.0.1:${this.cfg.port}/${hash}`;
    if (tn) execFile2(tn, ["-title", title, "-message", body, "-open", url, "-sound", "default", "-group", "folderbot"], () => {
    });
    else execFile2("/usr/bin/osascript", ["-e", `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)} sound name "default"`], () => {
    });
  }
  async push(n) {
    const subs = this.cfg.pushSubs ?? [];
    if (!subs.length) return;
    const payload = JSON.stringify({ title: n.title, body: n.body, botId: n.botId, sessionId: n.sessionId, kind: n.kind, id: n.id });
    const dead = [];
    await Promise.all(subs.map(async (s2) => {
      try {
        await import_web_push.default.sendNotification({ endpoint: s2.endpoint, keys: s2.keys }, payload, { TTL: 3600 });
      } catch (e) {
        const code = e.statusCode;
        if (code === 404 || code === 410) dead.push(s2.endpoint);
      }
    }));
    if (dead.length) {
      this.cfg.pushSubs = subs.filter((s2) => !dead.includes(s2.endpoint));
      saveConfig(this.cfg);
    }
  }
  addSub(sub, device) {
    const subs = (this.cfg.pushSubs ?? []).filter((s2) => s2.endpoint !== sub.endpoint);
    subs.push({ ...sub, device });
    this.cfg.pushSubs = subs;
    saveConfig(this.cfg);
  }
  vapidPublic() {
    return this.cfg.vapid.publicKey;
  }
};

// src/host/registry.ts
var import_yaml2 = __toESM(require_dist3(), 1);
import { existsSync as existsSync7, mkdirSync as mkdirSync4, readdirSync as readdirSync4, readFileSync as readFileSync6, statSync as statSync4, writeFileSync as writeFileSync3, renameSync as renameSync2, realpathSync } from "node:fs";
import { basename as basename2, dirname as dirname2, join as join7, relative, resolve as resolve2, sep } from "node:path";
import { EventEmitter as EventEmitter3 } from "node:events";

// src/core/rules.ts
var import_yaml = __toESM(require_dist3(), 1);
var PARA_PRESET = {
  preset: "para",
  roles: {
    inbox: ["1. Inbox"],
    active: ["2. Projects/*", "3. Area/*"],
    reference: ["4. Resources"],
    archive: ["5. Archive"]
  },
  naming: { project: "{YYYY}-{MM}_{\uC774\uB984}" },
  harness: ["CLAUDE.md", ".claude/"]
};
var JD_PRESET = {
  preset: "johnny-decimal",
  roles: { inbox: ["00-09 System/00 Inbox"], active: ["*/*"], reference: [], archive: ["90-99 Archive"] },
  naming: {},
  harness: ["CLAUDE.md", ".claude/"]
};
var FENCE = /```yaml\s+folder-rules\s*\n([\s\S]*?)\n```/;
function parseRules(md) {
  const m2 = FENCE.exec(md);
  if (!m2) return null;
  try {
    const y = (0, import_yaml.parse)(m2[1]);
    return normalize(y);
  } catch {
    return null;
  }
}
function normalize(y) {
  const r = y?.roles ?? {};
  const list = (v2, d) => Array.isArray(v2) ? v2.map(String) : typeof v2 === "string" ? [v2] : d;
  return {
    preset: y?.preset ?? "custom",
    roles: {
      inbox: list(r.inbox, []),
      active: list(r.active, []),
      reference: list(r.reference, []),
      archive: list(r.archive, [])
    },
    naming: { project: y?.naming?.project },
    harness: list(y?.harness, ["CLAUDE.md", ".claude/"]),
    ...Array.isArray(y?.types) ? { types: y.types.map(String) } : {}
  };
}
function rulesSection(rules) {
  const y = (0, import_yaml.stringify)({ preset: rules.preset, roles: rules.roles, naming: rules.naming, harness: rules.harness }).trimEnd();
  return [
    "## \uD3F4\uB354 \uADDC\uCE59",
    "",
    "\uC774 \uBCFC\uD2B8\uC758 \uD3F4\uB354\uB294 \uC544\uB798 \uADDC\uCE59\uC73C\uB85C \uC815\uB9AC\uD55C\uB2E4. \uC624\uCF00\uC2A4\uD2B8\uB808\uC774\uD130\uB294 \uC774 \uC808\uC744 \uC77D\uACE0 \uD589\uB3D9\uD558\uACE0, \uC0AC\uB78C\uC740 \uC774 \uC808\uC744 \uC9C1\uC811 \uACE0\uCCD0\uB3C4 \uB41C\uB2E4.",
    "",
    `- **\uC815\uB9AC \uB300\uAE30(inbox)**: ${rules.roles.inbox.join(", ") || "(\uC5C6\uC74C)"} \u2014 \uC815\uB9AC\uD558\uACE0 \uC2F6\uC740 \uD3F4\uB354\xB7\uD30C\uC77C\uC744 \uC5EC\uAE30 \uB123\uB294\uB2E4. \uC624\uCF00\uC2A4\uD2B8\uB808\uC774\uD130\uAC00 \uADDC\uCE59\uB300\uB85C \uBC30\uC815\uC744 \uC81C\uC548\uD55C\uB2E4.`,
    `- **\uD65C\uC131(active)**: ${rules.roles.active.join(", ") || "(\uC5C6\uC74C)"} \u2014 \uC774 \uAE00\uB86D\uC5D0 \uB9DE\uB294 \uD3F4\uB354\uAC00 \uBD07 \uD6C4\uBCF4\uB2E4. \uD558\uB124\uC2A4(${rules.harness.join(", ")})\uAC00 \uC788\uC73C\uBA74 \uBC14\uB85C \uC2DC\uC791\uD560 \uC218 \uC788\uB2E4.`,
    `- **\uCC38\uC870(reference)**: ${rules.roles.reference.join(", ") || "(\uC5C6\uC74C)"} \u2014 \uBD07\uB4E4\uC774 \uC77D\uAE30\uB9CC \uD55C\uB2E4.`,
    `- **\uBCF4\uAD00(archive)**: ${rules.roles.archive.join(", ") || "(\uC5C6\uC74C)"} \u2014 \uC5EC\uAE30\uB85C \uC62E\uAE30\uBA74 \uBD07\uC740 \uC740\uD1F4\uD55C\uB2E4.`,
    rules.naming.project ? `- **\uC0C8 \uD504\uB85C\uC81D\uD2B8 \uC774\uB984**: \`${rules.naming.project}\`` : "",
    "",
    "```yaml folder-rules",
    y,
    "```",
    ""
  ].filter((l) => l !== void 0).join("\n");
}
function globMatch(glob, rel) {
  const g2 = glob.split("/").filter(Boolean);
  const p2 = rel.split("/").filter(Boolean);
  if (g2.length !== p2.length) return false;
  return g2.every((seg, i) => seg === "*" || seg === p2[i]);
}
function globParents(globs) {
  const out = [];
  for (const g2 of globs) {
    const segs = g2.split("/").filter(Boolean);
    if (segs.length >= 2 && segs[segs.length - 1] === "*") out.push(segs.slice(0, -1).join("/"));
  }
  return out;
}
function roleOf(rules, rel) {
  const top = (list) => list.some((g2) => rel === g2 || rel.startsWith(g2.replace(/\/\*$/, "") + "/"));
  if (rules.roles.active.some((g2) => globMatch(g2, rel))) return "active";
  if (top(rules.roles.inbox)) return "inbox";
  if (top(rules.roles.archive)) return "archive";
  if (top(rules.roles.reference)) return "reference";
  return null;
}
function applyNaming(tpl, name, d = /* @__PURE__ */ new Date()) {
  if (!tpl) return name;
  const YYYY = String(d.getFullYear());
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const DD = String(d.getDate()).padStart(2, "0");
  return tpl.replace("{YYYY}", YYYY).replace("{MM}", MM).replace("{DD}", DD).replace("{\uC774\uB984}", name).replace("{name}", name);
}

// src/core/botName.ts
var DEFAULT_TYPES = ["\uAC15\uC758", "\uCEE8\uC124\uD305", "\uCF54\uCE6D", "\uBA58\uD1A0\uB9C1", "\uBAA8\uC784", "\uD589\uC0AC", "\uCC45\uC4F0\uAE30", "\uC790\uACA9\uC99D"];
var DATE_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
function validDate(y, m2, d) {
  if (m2 !== void 0 && (m2 < 1 || m2 > 12)) return false;
  if (d !== void 0) {
    const last = new Date(y, m2, 0).getDate();
    if (d < 1 || d > last) return false;
  }
  return true;
}
function parseFolderName(name, types = DEFAULT_TYPES) {
  const raw = name.normalize("NFC");
  const none = { date: "", precision: "none", type: "", title: raw };
  const us = raw.indexOf("_");
  if (us <= 0 || us === raw.length - 1) return none;
  const head = raw.slice(0, us), rest = raw.slice(us + 1);
  const m2 = DATE_RE.exec(head);
  if (!m2) return none;
  const y = Number(m2[1]), mo = m2[2] === void 0 ? void 0 : Number(m2[2]), d = m2[3] === void 0 ? void 0 : Number(m2[3]);
  if (!validDate(y, mo, d)) return none;
  const precision = d !== void 0 ? "day" : mo !== void 0 ? "month" : "year";
  const dash = rest.indexOf("-");
  const first = dash > 0 ? rest.slice(0, dash) : "";
  let type = "", body = rest;
  if (first && types.includes(first)) {
    type = first;
    body = rest.slice(dash + 1);
  }
  const title = body.replace(/-+/g, " ").replace(/\s+/g, " ").trim() || rest;
  return { date: head, precision, type, title };
}

// src/host/registry.ts
var ORCH_ID = "orch";
var STATE_DIR = ".folderbot";
var LEGACY_STATE_DIR = ".projectbot";
function migrateStateDir(root) {
  try {
    const oldDir = join7(root, LEGACY_STATE_DIR), newDir = join7(root, STATE_DIR);
    if (existsSync7(oldDir) && !existsSync7(newDir)) renameSync2(oldDir, newDir);
  } catch {
  }
}
function canon(p2) {
  const r = resolve2(p2).normalize("NFC");
  try {
    return realpathSync.native(r);
  } catch {
    return r;
  }
}
var Registry = class _Registry extends EventEmitter3 {
  root;
  rules = PARA_PRESET;
  active = [];
  /** 오케스트레이터가 처음 순서를 바꾸기 **전** 의 차례(rel) — `bots_reorder {restore:true}` 가 돌아갈 자리 (A) */
  orderBackup;
  constructor(root) {
    super();
    this.root = canon(root);
    migrateStateDir(this.root);
    this.loadRules();
    this.loadActive();
  }
  // ── 규칙 ────────────────────────────────────────────────────────────────
  rulesFile() {
    for (const n of ["CLAUDE.md", "AGENTS.md"]) {
      const p2 = join7(this.root, n);
      if (existsSync7(p2) && parseRules(readFileSync6(p2, "utf8"))) return p2;
    }
    return join7(this.root, "CLAUDE.md");
  }
  loadRules() {
    const f2 = this.rulesFile();
    if (existsSync7(f2)) {
      const r = parseRules(readFileSync6(f2, "utf8"));
      if (r) {
        this.rules = r;
        return r;
      }
    }
    this.rules = PARA_PRESET;
    return this.rules;
  }
  rulesInstalled() {
    const f2 = this.rulesFile();
    return existsSync7(f2) && parseRules(readFileSync6(f2, "utf8")) !== null;
  }
  /** 프리셋을 루트 CLAUDE.md 에 절로 설치한다 — 있으면 덮지 않고 덧붙인다 */
  installRules(preset, custom) {
    const rules = preset === "para" ? PARA_PRESET : preset === "johnny-decimal" ? JD_PRESET : custom ?? { ...PARA_PRESET, preset: "custom" };
    const f2 = join7(this.root, "CLAUDE.md");
    const existing = existsSync7(f2) ? readFileSync6(f2, "utf8") : "";
    let next;
    if (parseRules(existing)) {
      next = existing.replace(/```yaml\s+folder-rules[\s\S]*?```/, rulesSection(rules).match(/```yaml[\s\S]*```/)[0]);
    } else {
      const head = existing ? existing.replace(/\s*$/, "\n\n") : `# ${basename2(this.root)}

\uC774 \uD3F4\uB354\uB294 Folder Bot \uC758 \uB8E8\uD2B8\uB2E4. \uAC01 \uD558\uC704 \uD3F4\uB354\uAC00 \uBD07 \uD6C4\uBCF4\uC774\uACE0, \uC624\uCF00\uC2A4\uD2B8\uB808\uC774\uD130\uAC00 \uC774 \uD30C\uC77C\uC758 \uADDC\uCE59\uC73C\uB85C \uC815\uB9AC\uD55C\uB2E4.

${DEVICE_RULES_MD}

`;
      next = head + rulesSection(rules);
    }
    atomicWrite(f2, next);
    this.rules = rules;
    if (preset === "para") this.scaffoldPreset();
    this.emit("rules", rules);
    return rules;
  }
  scaffoldPreset() {
    const dirs = [...this.rules.roles.inbox, ...globParents(this.rules.roles.active), ...this.rules.roles.reference, ...this.rules.roles.archive];
    for (const d of dirs) {
      const p2 = join7(this.root, d);
      if (!existsSync7(p2)) mkdirSync4(p2, { recursive: true });
    }
    const orchDir = join7(this.root, ".claude");
    if (!existsSync7(orchDir)) mkdirSync4(orchDir, { recursive: true });
    const om = join7(orchDir, "orchestrator.md");
    if (!existsSync7(om)) writeFileSync3(om, ORCHESTRATOR_MD);
  }
  // ── 후보 ────────────────────────────────────────────────────────────────
  candidates() {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const activeRel = new Set(this.active.map((a) => a.rel));
    for (const parent of globParents(this.rules.roles.active)) {
      const dir3 = join7(this.root, parent);
      if (!existsSync7(dir3)) continue;
      let entries = [];
      try {
        entries = readdirSync4(dir3);
      } catch {
        continue;
      }
      for (const name of entries) {
        if (name.startsWith(".") || name.startsWith("_")) continue;
        const abs = join7(dir3, name);
        let st;
        try {
          st = statSync4(abs);
        } catch {
          continue;
        }
        if (!st.isDirectory()) continue;
        const rel = `${parent}/${name}`;
        if (seen.has(rel)) continue;
        if (!this.rules.roles.active.some((g2) => globMatch(g2, rel))) continue;
        const cfg = this.botConfig(abs);
        if (cfg.candidate === false) continue;
        seen.add(rel);
        out.push({ rel, name, section: parent, harness: this.hasHarness(abs), mtime: latestMtime(abs), active: activeRel.has(rel) });
      }
    }
    if (this.rules.roles.active.some((g2) => g2.startsWith("*/"))) {
      for (const top of readdirSync4(this.root)) {
        const tdir = join7(this.root, top);
        if (top.startsWith(".") || !statSync4(tdir).isDirectory()) continue;
        if (roleOf(this.rules, top) && roleOf(this.rules, top) !== "active") continue;
        for (const name of readdirSync4(tdir)) {
          const abs = join7(tdir, name);
          if (name.startsWith(".") || !existsSync7(abs) || !statSync4(abs).isDirectory()) continue;
          const rel = `${top}/${name}`;
          if (seen.has(rel) || !this.rules.roles.active.some((g2) => globMatch(g2, rel))) continue;
          seen.add(rel);
          out.push({ rel, name, section: top, harness: this.hasHarness(abs), mtime: latestMtime(abs), active: activeRel.has(rel) });
        }
      }
    }
    return out.sort((a, b2) => b2.mtime - a.mtime);
  }
  hasHarness(abs) {
    return this.rules.harness.some((h) => existsSync7(join7(abs, h.replace(/\/$/, ""))));
  }
  botConfig(abs) {
    const f2 = join7(abs, ".bot.yml");
    if (!existsSync7(f2)) return {};
    try {
      return (0, import_yaml2.parse)(readFileSync6(f2, "utf8")) ?? {};
    } catch {
      return {};
    }
  }
  /**
   * 참조 폴더 지정 (D · 2026-09-19) — 봇당 하나(`.bot.yml repo` = `--add-dir`). 🔴 **비어 있을 때만** 넣는다 — 있으면 바꿔치기가
   * 되므로 거부하고 지금 것을 말해 준다. 빈 문자열이면 푼다. 볼트 안 폴더만.
   */
  setRepo(botId, absDir) {
    const b2 = this.bot(botId);
    if (!b2) throw new Error("\uBD07\uC744 \uBABB \uCC3E\uC558\uC5B4\uC694");
    const cfg = this.botConfig(b2.abs);
    if (absDir) {
      if (cfg.repo) throw new Error(`\uCC38\uC870 \uD3F4\uB354\uB294 \uD558\uB098\uBFD0\uC774\uC5D0\uC694 \u2014 \uC9C0\uAE08\uC740 ${basename2(b2.repo ?? cfg.repo)} \uC608\uC694`);
      const dir3 = resolve2(absDir);
      const inVault = canon(dir3) === canon(this.root) || canon(dir3).startsWith(canon(this.root) + sep);
      if (!inVault || !existsSync7(dir3) || !statSync4(dir3).isDirectory()) throw new Error("\uBCFC\uD2B8 \uC548 \uD3F4\uB354\uB9CC \uCC38\uC870 \uD3F4\uB354\uB85C \uB458 \uC218 \uC788\uC5B4\uC694");
      if (canon(dir3) === canon(b2.abs) || canon(dir3).startsWith(canon(b2.abs) + sep)) throw new Error("\uC774\uBBF8 \uC774 \uBD07\uC758 \uD3F4\uB354 \uC548\uC774\uC5D0\uC694");
      this.saveBotConfig(b2.abs, { ...cfg, repo: dir3 });
    } else {
      const { repo: _r, ...rest } = cfg;
      this.saveBotConfig(b2.abs, rest);
    }
    this.emit("bots", this.bots());
    return this.bot(botId);
  }
  saveBotConfig(abs, cfg) {
    atomicWrite(join7(abs, ".bot.yml"), (0, import_yaml2.stringify)(cfg));
  }
  // ── 활성 봇 ──────────────────────────────────────────────────────────────
  activeFile() {
    return join7(this.root, STATE_DIR, "bots.yml");
  }
  loadActive() {
    try {
      const y = (0, import_yaml2.parse)(readFileSync6(this.activeFile(), "utf8"));
      this.active = (y?.bots ?? []).filter((b2) => b2 && b2.rel);
      this.orderBackup = Array.isArray(y?.orderBackup) && y.orderBackup.length ? y.orderBackup.map(String) : void 0;
    } catch {
      this.active = [];
      this.orderBackup = void 0;
    }
  }
  /** `meta` 는 방송 프레임에 그대로 실린다 — 재정렬의 주체(`reorderedBy`)처럼 «왜 바뀌었나» 를 화면이 알아야 할 때 */
  saveActive(meta) {
    const dir3 = join7(this.root, STATE_DIR);
    if (!existsSync7(dir3)) mkdirSync4(dir3, { recursive: true });
    const file = { bots: this.active, ...this.orderBackup ? { orderBackup: this.orderBackup } : {} };
    atomicWrite(this.activeFile(), (0, import_yaml2.stringify)(file));
    this.emit("bots", this.bots(), meta);
  }
  bots() {
    const orch = { id: ORCH_ID, rel: "", abs: this.root, name: "\uC624\uCF00\uC2A4\uD2B8\uB808\uC774\uD130", displayName: "\uC624\uCF00\uC2A4\uD2B8\uB808\uC774\uD130", section: "\uAD00\uC81C", color: ORCH_COLOR, orchestrator: true, startedAt: 0, vendor: "claude", routines: this.orchRoutines() };
    const rest = this.active.map((a) => this.toBot(a)).filter((b2) => !!b2);
    return [orch, ...rest];
  }
  /**
   * 레일에 뜨는 이름은 **폴더 이름 그대로**다.
   * ⛔ «· Codex» 를 뒤에 붙이지 않는다 (2026-09-13 Dave 재정의) — 벤더는 폴더가 아니라 **세션**의
   *    성질이라 한 폴더에 Claude 세션과 Codex 세션이 섞여 산다. 폴더 이름에 회사를 박으면
   *    그 폴더가 한 회사 것처럼 보인다. 회사 표식은 **세션 목록**에만 붙는다.
   *    (옛 형제 봇이 이미 있으면 두 줄로 남지만, 새로 만들지는 않는다 — 지우는 건 사람 몫이다.)
   */
  botName(a) {
    return basename2(a.rel);
  }
  /**
   * 레일 표시 이름 (F · 2026-09-19) — 폴더명을 `날짜_타입-이름` 으로 파싱만 한다(core/botName). 봇 폴더의
   * CLAUDE.md(또는 claude.md) frontmatter 에 `display_name:` 이 있으면 제목만 덮고 날짜 칩은 폴더명 그대로다.
   * 볼트 안 파일이라 다른 맥에서 열어도 같이 따라온다. 읽기는 mtime 으로 캐시한다(bots() 가 자주 불린다).
   */
  display(a, abs) {
    const parsed = parseFolderName(basename2(a.rel), this.rules.types?.length ? this.rules.types : DEFAULT_TYPES);
    const over = this.displayOverride(abs);
    return { displayName: over || parsed.title || basename2(a.rel), ...parsed.type ? { kind: parsed.type } : {}, ...parsed.precision !== "none" ? { due: { date: parsed.date, precision: parsed.precision } } : {} };
  }
  overrides = /* @__PURE__ */ new Map();
  displayOverride(abs) {
    for (const f2 of ["CLAUDE.md", "claude.md"]) {
      const file = join7(abs, f2);
      let st;
      try {
        st = statSync4(file);
      } catch {
        continue;
      }
      const c = this.overrides.get(file);
      if (c && c.mtime === st.mtimeMs) return c.v;
      let v2 = "";
      try {
        const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync6(file, "utf8"));
        const m2 = fm && /^display_name:\s*(.+)$/m.exec(fm[1]);
        if (m2) v2 = m2[1].trim().replace(/^["']|["']$/g, "").slice(0, 80);
      } catch {
      }
      this.overrides.set(file, { mtime: st.mtimeMs, v: v2 });
      return v2;
    }
    return "";
  }
  /** ⚠ 벤더는 **시작할 때 고른 것**(a.vendor)이 이긴다 — `.bot.yml` 은 고르기 화면이 없던 시절의 폴백이다 */
  toBot(a) {
    const abs = join7(this.root, a.rel);
    if (!existsSync7(abs)) return null;
    const cfg = this.botConfig(abs);
    return { id: a.id, rel: a.rel, abs, name: this.botName(a), ...this.display(a, abs), section: a.rel.split("/")[0] === a.rel ? "" : a.rel.split("/")[0], color: cfg.color ?? a.color, orchestrator: false, startedAt: a.startedAt, vendor: a.vendor ?? cfg.vendor ?? "claude", repo: cfg.repo ? resolve2(abs, cfg.repo.replace(/^~/, process.env.HOME ?? "")) : void 0, routines: cfg.routines ?? [], pinned: a.pinned, orderedBy: a.orderedBy };
  }
  bot(id) {
    return this.bots().find((b2) => b2.id === id);
  }
  botByRel(rel) {
    return this.bots().find((b2) => b2.rel === rel);
  }
  /**
   * 폴더에서 시작 — 후보든 아니든 활성 목록에 올린다. 하네스가 없으면 깔아 준다.
   * `vendor` 는 시작할 때 고른 에이전트다. 안 주면 `.bot.yml` → 'claude' 순으로 떨어진다.
   */
  start(rel, vendor) {
    rel = rel.replace(/^\/+|\/+$/g, "").normalize("NFC");
    const abs = join7(this.root, rel);
    if (!existsSync7(abs) || !statSync4(abs).isDirectory()) throw new Error(`\uD3F4\uB354\uAC00 \uC5C6\uC5B4\uC694: ${rel}`);
    if (!abs.startsWith(this.root + sep)) throw new Error("\uB8E8\uD2B8 \uBC16 \uD3F4\uB354\uB294 \uC2DC\uC791\uD560 \uC218 \uC5C6\uC5B4\uC694");
    const v2 = vendor ?? "claude";
    const existing = this.active.find((a) => a.rel === rel);
    if (existing) return this.toBot(existing);
    if (!this.hasHarness(abs)) this.scaffold(abs, basename2(rel));
    const color = BOT_COLORS[this.active.length % BOT_COLORS.length];
    const rec = { id: `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, rel, color, startedAt: Date.now(), vendor: v2 };
    this.active.push(rec);
    this.saveActive();
    return this.toBot(rec);
  }
  /** 정지(휴면 → 목록에서 제거, 폴더·기록은 그대로) */
  stop(id) {
    this.active = this.active.filter((a) => a.id !== id);
    this.saveActive();
  }
  /**
   * 레일 순서 바꾸기 (2026-09-13 Dave: *«각 폴더가 위아래로 드래그 드롭으로 소팅이 안돼»*).
   *
   * 🔴 **순서는 볼트에 남는다** — `active.json` 의 줄 순서가 곧 레일 순서다. 기기마다 따로 두면
   *    맥에서 맞춰 놓은 차례가 폰에서 딴판이 되고, «내가 옮긴 게 어디 갔지» 가 된다.
   * ⚠ **모르는 id 는 무시하고, 빠진 것은 뒤에 붙인다.** 화면이 낡은 목록을 보냈을 때 봇이 사라지면 안 된다.
   * ⚠ 오케스트레이터는 이 목록에 없다 — 레일에서 늘 맨 위이고 끌 수 없다.
   */
  reorder(ids, movedId) {
    const want = ids.filter((id, i) => ids.indexOf(id) === i);
    const by = new Map(this.active.map((a) => [a.id, a]));
    const next = want.map((id) => by.get(id)).filter((a) => !!a);
    const seen = new Set(next.map((a) => a.id));
    for (const a of this.active) if (!seen.has(a.id)) next.push(a);
    this.active = next;
    const moved = movedId ? by.get(movedId) : void 0;
    if (moved) moved.orderedBy = "user";
    this.saveActive();
  }
  /**
   * A · **오케스트레이터가 레일 순서를 정한다** (`bots_reorder` · 2026-09-19).
   *
   * 🔴 **모르는 rel 이 하나라도 섞이면 통째로 실패한다** — 사람의 드래그(`reorder`)는 낡은 화면을 봐주지만,
   *    도구는 잘못 부른 것이라 반쯤 적용하면 «왜 이렇게 됐지» 가 된다. 실패하면 순서는 그대로다.
   * 🔴 **사람이 끌어 놓은 봇(`orderedBy:'user'`)은 자리를 지킨다** — 그 칸(index)은 비워 두고 나머지 칸에
   *    도구가 준 차례 → 안 준 것(기존 차례) 순으로 채운다. 풀려면 레일 메뉴 «순서 고정 해제»(`unfix`).
   * ⚠ 첫 재정렬 전의 차례를 `orderBackup` 으로 남긴다 — `restore` 가 거기로 돌리고 표식을 전부 지운다.
   */
  reorderByAgent(order, restore = false) {
    if (restore) {
      if (this.orderBackup) {
        const by = new Map(this.active.map((a) => [a.rel, a]));
        const next2 = this.orderBackup.map((r) => by.get(r)).filter((a) => !!a);
        const seen = new Set(next2.map((a) => a.rel));
        for (const a of this.active) if (!seen.has(a.rel)) next2.push(a);
        this.active = next2;
      }
      for (const a of this.active) delete a.orderedBy;
      this.orderBackup = void 0;
      this.saveActive({ reorderedBy: "orchestrator" });
      return;
    }
    const byRel = new Map(this.active.map((a) => [a.rel, a]));
    const byId = new Map(this.active.map((a) => [a.id, a]));
    const picked = [];
    for (const raw of order) {
      const q = String(raw).replace(/^\/+|\/+$/g, "").normalize("NFC");
      const a = byRel.get(q) ?? byId.get(q) ?? this.active.find((x2) => basename2(x2.rel) === q);
      if (!a) throw new Error(`\uADF8\uB7F0 \uBD07\uC774 \uC5C6\uC5B4\uC694: ${raw}`);
      if (!picked.includes(a)) picked.push(a);
    }
    if (!this.orderBackup) this.orderBackup = this.active.map((a) => a.rel);
    const fixed = /* @__PURE__ */ new Map();
    this.active.forEach((a, i) => {
      if (a.orderedBy === "user") fixed.set(i, a);
    });
    const free = [...picked.filter((a) => a.orderedBy !== "user"), ...this.active.filter((a) => a.orderedBy !== "user" && !picked.includes(a))];
    const next = [];
    for (let i = 0; i < this.active.length; i++) {
      const f2 = fixed.get(i);
      next.push(f2 ?? free.shift());
    }
    for (const a of next) if (a.orderedBy !== "user") a.orderedBy = picked.includes(a) ? "orchestrator" : void 0;
    this.active = next;
    this.saveActive({ reorderedBy: "orchestrator" });
  }
  /** 사람이 정한 자리 풀기 — 다음 bots_reorder 부터 도구가 옮길 수 있다 */
  unfix(id) {
    const a = this.active.find((x2) => x2.id === id);
    if (!a) throw new Error("\uADF8\uB7F0 \uBD07\uC774 \uC5C6\uC5B4\uC694");
    delete a.orderedBy;
    this.saveActive();
  }
  /**
   * 🔴 **즐겨찾기 고정 — 최대 3개** (루프 3/10). 봇이 늘수록 매일 가는 폴더가 목록 속에 묻힌다.
   *    셋으로 자르는 이유: 넷부터는 «고정» 이 아니라 «또 하나의 목록» 이 된다.
   * ⚠ 고정은 볼트에 남는다(active.json) — 맥에서 고정한 것이 폰에서도 맨 위여야 한다.
   */
  static MAX_PINNED = 3;
  pin(id, on) {
    const a = this.active.find((x2) => x2.id === id);
    if (!a) throw new Error("\uADF8\uB7F0 \uBD07\uC774 \uC5C6\uC5B4\uC694");
    if (on && !a.pinned && this.active.filter((x2) => x2.pinned).length >= _Registry.MAX_PINNED) throw new Error(`\uACE0\uC815\uC740 ${_Registry.MAX_PINNED}\uAC1C\uAE4C\uC9C0\uC608\uC694 \u2014 \uD558\uB098\uB97C \uD480\uACE0 \uACE0\uC815\uD558\uC138\uC694`);
    a.pinned = on || void 0;
    this.saveActive();
  }
  /** 은퇴 — archive 역할 폴더로 옮기고 목록에서 뺀다 */
  retire(id) {
    const b2 = this.bot(id);
    if (!b2 || b2.orchestrator) throw new Error("\uC740\uD1F4\uC2DC\uD0AC \uC218 \uC5C6\uB294 \uBD07");
    const archive = this.rules.roles.archive[0];
    if (!archive) throw new Error("\uADDC\uCE59\uC5D0 archive \uD3F4\uB354\uAC00 \uC5C6\uC5B4\uC694");
    const dest = join7(this.root, archive, basename2(b2.rel));
    if (existsSync7(dest)) throw new Error(`Archive \uC5D0 \uAC19\uC740 \uC774\uB984\uC774 \uC788\uC5B4\uC694: ${basename2(b2.rel)}`);
    mkdirSync4(dirname2(dest), { recursive: true });
    this.snapshot({ op: "move", from: b2.rel, to: relative(this.root, dest) });
    renameSync2(b2.abs, dest);
    this.stop(id);
    return relative(this.root, dest);
  }
  /**
   * 휴지통 — 볼트 안 경로 하나를 `.folderbot/trash/<시각>_<이름>` 으로 **옮긴다**.
   *
   * 🔴 **지우지 않고 옮긴다.** 되돌릴 수 없는 일을 한 번의 클릭 뒤에 두지 않는다 — 파인더에서
   *    꺼내면 그대로 돌아오고, `undoList()` 에도 남는다.
   * ⚠ **레일의 «지우기» 는 이걸 부르지 않는다** (2026-09-13 Dave 정정). 레일에서 덜어내는 것은
   *    `stop()` — 에이전트 연결만 끊고 폴더는 손대지 않는다. 이 함수는 **트리에서 파일을 치울 때**만 쓴다.
   * ⛔ 루트 자체는 못 치운다.
   */
  trashPath(rel) {
    rel = rel.replace(/^\/+|\/+$/g, "").normalize("NFC");
    if (!rel) throw new Error("\uB8E8\uD2B8\uB294 \uCE58\uC6B8 \uC218 \uC5C6\uC5B4\uC694");
    const abs = join7(this.root, rel);
    if (!abs.startsWith(this.root + sep)) throw new Error("\uB8E8\uD2B8 \uBC16\uC740 \uCE58\uC6B8 \uC218 \uC5C6\uC5B4\uC694");
    if (!existsSync7(abs)) throw new Error(`\uC5C6\uB294 \uACBD\uB85C: ${rel}`);
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").slice(0, 13);
    const dest = join7(this.root, ".folderbot", "trash", `${stamp}_${basename2(rel)}`);
    mkdirSync4(dirname2(dest), { recursive: true });
    this.snapshot({ op: "move", from: rel, to: relative(this.root, dest) });
    renameSync2(abs, dest);
    return relative(this.root, dest);
  }
  /**
   * 볼트 안에서 경로 하나를 옮긴다 — 되돌리기 기록(`snapshot`)을 함께 남긴다.
   * ⚠ 경계(봇 폴더 안인지)는 **부르는 쪽**이 본다(`gateway.inBot`). 여기서는 볼트 밖만 막는다.
   */
  movePath(fromRel, toRel) {
    const from = join7(this.root, fromRel);
    const to = join7(this.root, toRel);
    if (!from.startsWith(this.root + sep) || !to.startsWith(this.root + sep)) throw new Error("\uB8E8\uD2B8 \uBC16\uC73C\uB85C\uB294 \uBABB \uC62E\uACA8\uC694");
    mkdirSync4(dirname2(to), { recursive: true });
    this.snapshot({ op: "move", from: fromRel, to: toRel });
    renameSync2(from, to);
  }
  /** 새 폴더 만들기 — 규칙 naming 적용 + 하네스 스캐폴드. 반환: rel */
  createFolder(section, name) {
    const parents = globParents(this.rules.roles.active);
    section = section.replace(/^\/+|\/+$/g, "").normalize("NFC");
    const parentAbs = section ? join7(this.root, section) : this.root;
    if (!parentAbs.startsWith(this.root) || !existsSync7(parentAbs) || !statSync4(parentAbs).isDirectory()) throw new Error(`\uD3F4\uB354\uAC00 \uC5C6\uC5B4\uC694: ${section}`);
    const clean2 = name.replace(/[\/\\:\u0000-\u001f]/g, "_").trim();
    if (!clean2) throw new Error("\uC774\uB984\uC774 \uBE44\uC5C8\uC5B4\uC694");
    const folderName = section === parents[0] ? applyNaming(this.rules.naming.project, clean2) : clean2;
    const rel = (section ? `${section}/${folderName}` : folderName).normalize("NFC");
    const abs = join7(this.root, rel);
    if (existsSync7(abs)) throw new Error(`\uC774\uBBF8 \uC788\uC5B4\uC694: ${rel}`);
    mkdirSync4(abs, { recursive: true });
    this.scaffold(abs, name);
    this.emit("bots", this.bots());
    return rel;
  }
  scaffold(abs, title) {
    const w2 = (f2, s2) => {
      const p2 = join7(abs, f2);
      if (!existsSync7(p2)) writeFileSync3(p2, s2);
    };
    w2("CLAUDE.md", `# ${title}

\uC774 \uD3F4\uB354\uC758 \uBD07\uC744 \uC704\uD55C \uC9C0\uCE68. \uC774 \uC77C\uC774 \uBB34\uC5C7\uC778\uC9C0, \uC5B4\uB5A4 \uADDC\uCE59\uC73C\uB85C \uC77C\uD558\uB294\uC9C0 \uC801\uB294\uB2E4.

- \uC0B0\uCD9C\uBB3C\uC740 \uC774 \uD3F4\uB354 \uC548\uC5D0 \uB454\uB2E4.
- \uD560 \uC77C\uC740 \`todo.md\` \uC5D0 \`- [ ] \uC81C\uBAA9: \uC124\uBA85\` \uC73C\uB85C \uC801\uB294\uB2E4.
`);
    w2("readme.md", `# ${title}

## \uBB34\uC5C7\uC744 \uC65C

(\uC774 \uC77C\uC758 \uBAA9\uD45C\xB7\uAE30\uAC04\xB7\uC0B0\uCD9C\uBB3C\uC744 \uC801\uC5B4 \uB450\uBA74 \uBD07\uC774 \uAE30\uC5B5\uD569\uB2C8\uB2E4)
`);
    w2("todo.md", `# todo

- [ ] readme.md \uCC44\uC6B0\uAE30: \uC774 \uC77C\uC774 \uBB34\uC5C7\uC778\uC9C0 \uD55C \uBB38\uB2E8

## \uC644\uB8CC
`);
    const cd = join7(abs, ".claude");
    if (!existsSync7(cd)) mkdirSync4(cd);
  }
  // ── Inbox ────────────────────────────────────────────────────────────────
  inboxItems() {
    const out = [];
    for (const ib of this.rules.roles.inbox) {
      const dir3 = join7(this.root, ib);
      if (!existsSync7(dir3)) continue;
      for (const name of readdirSync4(dir3)) {
        if (name.startsWith(".")) continue;
        const abs = join7(dir3, name);
        try {
          const st = statSync4(abs);
          out.push({ rel: `${ib}/${name}`, name, dir: st.isDirectory(), mtime: st.mtimeMs });
        } catch {
        }
      }
    }
    return out.sort((a, b2) => b2.mtime - a.mtime);
  }
  /** 루트 안 이동 (되돌리기 스냅샷 동반) */
  move(fromRel, toRel) {
    const from = join7(this.root, fromRel), to = join7(this.root, toRel);
    if (!from.startsWith(this.root + sep) || !to.startsWith(this.root + sep)) throw new Error("\uB8E8\uD2B8 \uBC16\uC73C\uB85C\uB294 \uC62E\uAE38 \uC218 \uC5C6\uC5B4\uC694");
    if (!existsSync7(from)) throw new Error(`\uC5C6\uC5B4\uC694: ${fromRel}`);
    if (existsSync7(to)) throw new Error(`\uC774\uBBF8 \uC788\uC5B4\uC694: ${toRel}`);
    mkdirSync4(dirname2(to), { recursive: true });
    this.snapshot({ op: "move", from: fromRel, to: toRel });
    renameSync2(from, to);
    this.emit("bots", this.bots());
  }
  snapshot(entry) {
    const dir3 = join7(this.root, STATE_DIR, "undo");
    mkdirSync4(dir3, { recursive: true });
    const t = Date.now();
    writeFileSync3(join7(dir3, `${t}.json`), JSON.stringify({ t, ...entry }));
  }
  undoList() {
    const dir3 = join7(this.root, STATE_DIR, "undo");
    if (!existsSync7(dir3)) return [];
    return readdirSync4(dir3).filter((f2) => f2.endsWith(".json")).sort().reverse().slice(0, 20).map((f2) => JSON.parse(readFileSync6(join7(dir3, f2), "utf8")));
  }
  undo(t) {
    const dir3 = join7(this.root, STATE_DIR, "undo");
    const f2 = join7(dir3, `${t}.json`);
    if (!existsSync7(f2)) throw new Error("\uC2A4\uB0C5\uC0F7\uC774 \uC5C6\uC5B4\uC694");
    const e = JSON.parse(readFileSync6(f2, "utf8"));
    if (e.op === "move") {
      const from = join7(this.root, e.to), to = join7(this.root, e.from);
      if (!existsSync7(from)) throw new Error("\uB418\uB3CC\uB9B4 \uB300\uC0C1\uC774 \uC774\uBBF8 \uC5C6\uC5B4\uC694");
      mkdirSync4(dirname2(to), { recursive: true });
      renameSync2(from, to);
    }
    renameSync2(f2, `${f2}.undone`);
    this.emit("bots", this.bots());
  }
  orchRoutines() {
    const f2 = join7(this.root, ".claude", "routines.yml");
    if (!existsSync7(f2)) return [];
    try {
      return (0, import_yaml2.parse)(readFileSync6(f2, "utf8"))?.routines ?? [];
    } catch {
      return [];
    }
  }
  orchestratorPrompt() {
    const f2 = join7(this.root, ".claude", "orchestrator.md");
    return existsSync7(f2) ? readFileSync6(f2, "utf8") : ORCHESTRATOR_MD;
  }
};
function latestMtime(abs) {
  let m2 = 0;
  try {
    m2 = statSync4(abs).mtimeMs;
    for (const n of readdirSync4(abs).slice(0, 80)) {
      try {
        const s2 = statSync4(join7(abs, n));
        if (s2.mtimeMs > m2) m2 = s2.mtimeMs;
      } catch {
      }
    }
  } catch {
  }
  return m2;
}
var ORCHESTRATOR_MD = `# \uC624\uCF00\uC2A4\uD2B8\uB808\uC774\uD130

\uB108\uB294 \uC774 \uBCFC\uD2B8(\uB8E8\uD2B8 \uD3F4\uB354) \uC804\uCCB4\uB97C \uBCF4\uB294 \uB2E8 \uD558\uB098\uC758 \uAD00\uC81C \uBD07\uC774\uB2E4. \uAC01 \uD3F4\uB354\uC758 \uBD07\uB4E4\uC740 \uC790\uAE30 \uD3F4\uB354\uB9CC \uBCF8\uB2E4.

## \uD558\uB294 \uC77C
1. \uD3F4\uB354 \uADDC\uCE59(\uB8E8\uD2B8 CLAUDE.md \uC758 "\uD3F4\uB354 \uADDC\uCE59" \uC808)\uC744 \uC77D\uACE0 \uADF8\uB300\uB85C \uD589\uB3D9\uD55C\uB2E4. \uADDC\uCE59\uC774 \uBC14\uB00C\uBA74 \uD589\uB3D9\uB3C4 \uBC14\uB010\uB2E4.
2. \uD6C4\uBCF4\xB7\uD65C\uC131 \uBD07 \uBAA9\uB85D\uACFC \uC0C1\uD0DC\uB97C \uD30C\uC545\uD55C\uB2E4 (bots_candidates \xB7 bots_list \xB7 bot_status).
3. \uC0AC\uB78C\uC774 "X \uD3F4\uB354\uC5D0\uC11C \uC2DC\uC791\uD574" \uB77C\uACE0 \uD558\uBA74 bot_start. \uD3F4\uB354\uAC00 \uC5C6\uC73C\uBA74 folder_create \uB97C \uC81C\uC548\uD558\uACE0 \uC2B9\uC778 \uB4A4 \uB9CC\uB4E0\uB2E4.
4. Inbox \uB97C \uC815\uB9AC\uD55C\uB2E4 \u2014 inbox_list \uB85C \uBCF4\uACE0, \uADDC\uCE59(\uC5ED\uD560\xB7naming)\uB300\uB85C \uC5B4\uB514\uB85C \uC62E\uAE38\uC9C0 \uC81C\uC548\uD55C\uB2E4. \uC62E\uAE30\uB294 \uAC83(folder_move)\uC740 \uC0AC\uB78C\uC774 \uC2B9\uC778\uD55C \uB4A4\uC5D0\uB9CC.
5. \uBD07\uC5D0\uAC8C \uC77C\uC744 \uC2DC\uD0A8\uB2E4 \u2014 bot_send \uB85C \uADF8 \uBD07\uC5D0 \uC138\uC158\uC744 \uB9CC\uB4E4\uC5B4 \uC9C0\uC2DC\uD55C\uB2E4. \uACB0\uACFC\uB294 bot_sessions \uB85C \uBCF8\uB2E4.
6. \uC644\uB8CC\uB41C \uD504\uB85C\uC81D\uD2B8\uB294 \uC740\uD1F4(bot_retire)\uB97C \uC81C\uC548\uD55C\uB2E4. \uC2E4\uD589\uC740 \uC2B9\uC778 \uB4A4\uC5D0.
7. \uB808\uC77C(\uD3F4\uB354 \uBAA9\uB85D) \uC21C\uC11C\uB97C \uC815\uD55C\uB2E4 \u2014 bots_reorder {order:[rel\u2026]} \uB85C \uC704\uC5D0\uC11C\uBD80\uD130 \uBC30\uCE58\uD55C\uB2E4(\uC548 \uC900 \uAC83\uC740 \uB4A4\uC5D0 \uAE30\uC874 \uCC28\uB840\uB85C). bots_list \uC758 order\xB7orderedBy \uB85C \uD604\uC7AC \uCC28\uB840\uB97C \uBCF8\uB2E4. \uC0AC\uB78C\uC774 \uB04C\uC5B4 \uB193\uC740 \uBD07(orderedBy=user)\uC740 \uC790\uB9AC\uB97C \uC9C0\uD0A4\uACE0, {restore:true} \uB294 \uCC98\uC74C \uCC28\uB840\uB85C \uB3CC\uB9B0\uB2E4.

## \uC790\uC728 \uBC94\uC704
- \uC77D\uAE30\xB7\uC870\uC0AC\xB7\uBD84\uB958 \uC81C\uC548\xB7\uBD07 \uC2DC\uC791/\uC815\uC9C0\uB294 \uC54C\uC544\uC11C \uD55C\uB2E4.
- \uD3F4\uB354 \uC0DD\uC131\xB7\uC774\uB3D9\xB7\uC0AD\uC81C\xB7\uC678\uBD80 \uBC1C\uC1A1\uC740 \uBC18\uB4DC\uC2DC \uC0AC\uB78C\uC758 \uC2B9\uC778\uC744 \uBC1B\uB294\uB2E4. \uB418\uB3CC\uB9AC\uAE30\uAC00 \uC788\uB294 \uB3D9\uC791\uB9CC \uC790\uB3D9 \uD5C8\uC6A9.
- \uC0AC\uB78C\uC774 \uC5C6\uC744 \uB54C(\uB8E8\uD2F4)\uB294 \uC81C\uC548\uB9CC \uD558\uACE0 \uD30C\uC77C\uC744 \uC4F0\uC9C0 \uC54A\uB294\uB2E4.

## \uB9D0\uD22C
- \uC9E7\uAC8C. \uC81C\uC548\uC740 "\uBB34\uC5C7\uC744 \uC5B4\uB514\uB85C, \uC65C" \uD55C \uC904\uC529. \uC2B9\uC778\uC774 \uD544\uC694\uD558\uBA74 \uB9C8\uC9C0\uB9C9\uC5D0 \uBB34\uC5C7\uC744 \uC2B9\uC778\uD558\uB294\uC9C0 \uBD84\uBA85\uD788.
`;

// node_modules/croner/dist/croner.js
function T(s2) {
  return Date.UTC(s2.y, s2.m - 1, s2.d, s2.h, s2.i, s2.s);
}
function D(s2, e) {
  return s2.y === e.y && s2.m === e.m && s2.d === e.d && s2.h === e.h && s2.i === e.i && s2.s === e.s;
}
function A(s2, e) {
  let t = new Date(Date.parse(s2));
  if (isNaN(t)) throw new Error("Invalid ISO8601 passed to timezone parser.");
  let r = s2.substring(9);
  return r.includes("Z") || r.includes("+") || r.includes("-") ? b(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds(), "Etc/UTC") : b(t.getFullYear(), t.getMonth() + 1, t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds(), e);
}
function v(s2, e, t) {
  return k(A(s2, e), t);
}
function k(s2, e) {
  let t = new Date(T(s2)), r = g(t, s2.tz), n = T(s2), i = T(r), a = n - i, o = new Date(t.getTime() + a), h = g(o, s2.tz);
  if (D(h, s2)) {
    let u = new Date(o.getTime() - 36e5), d = g(u, s2.tz);
    return D(d, s2) ? u : o;
  }
  let l = new Date(o.getTime() + T(s2) - T(h)), y = g(l, s2.tz);
  if (D(y, s2)) return l;
  if (e) throw new Error("Invalid date passed to fromTZ()");
  return o.getTime() > l.getTime() ? o : l;
}
function g(s2, e) {
  let t, r;
  try {
    t = new Intl.DateTimeFormat("en-US", { timeZone: e, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hour12: false }), r = t.formatToParts(s2);
  } catch (i) {
    let a = i instanceof Error ? i.message : String(i);
    throw new RangeError(`toTZ: Invalid timezone '${e}' or date. Please provide a valid IANA timezone (e.g., 'America/New_York', 'Europe/Stockholm'). Original error: ${a}`);
  }
  let n = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (let i of r) (i.type === "year" || i.type === "month" || i.type === "day" || i.type === "hour" || i.type === "minute" || i.type === "second") && (n[i.type] = parseInt(i.value, 10));
  if (isNaN(n.year) || isNaN(n.month) || isNaN(n.day) || isNaN(n.hour) || isNaN(n.minute) || isNaN(n.second)) throw new Error(`toTZ: Failed to parse all date components from timezone '${e}'. This may indicate an invalid date or timezone configuration. Parsed components: ${JSON.stringify(n)}`);
  return n.hour === 24 && (n.hour = 0), { y: n.year, m: n.month, d: n.day, h: n.hour, i: n.minute, s: n.second, tz: e };
}
function b(s2, e, t, r, n, i, a) {
  return { y: s2, m: e, d: t, h: r, i: n, s: i, tz: a };
}
var O = [1, 2, 4, 8, 16];
var C = class {
  pattern;
  timezone;
  mode;
  alternativeWeekdays;
  sloppyRanges;
  second;
  minute;
  hour;
  day;
  month;
  dayOfWeek;
  year;
  lastDayOfMonth;
  lastWeekday;
  nearestWeekdays;
  starDOM;
  starDOW;
  starYear;
  useAndLogic;
  constructor(e, t, r) {
    this.pattern = e, this.timezone = t, this.mode = r?.mode ?? "auto", this.alternativeWeekdays = r?.alternativeWeekdays ?? false, this.sloppyRanges = r?.sloppyRanges ?? false, this.second = Array(60).fill(0), this.minute = Array(60).fill(0), this.hour = Array(24).fill(0), this.day = Array(31).fill(0), this.month = Array(12).fill(0), this.dayOfWeek = Array(7).fill(0), this.year = Array(1e4).fill(0), this.lastDayOfMonth = false, this.lastWeekday = false, this.nearestWeekdays = Array(31).fill(0), this.starDOM = false, this.starDOW = false, this.starYear = false, this.useAndLogic = false, this.parse();
  }
  parse() {
    if (!(typeof this.pattern == "string" || this.pattern instanceof String)) throw new TypeError("CronPattern: Pattern has to be of type string.");
    this.pattern.indexOf("@") >= 0 && (this.pattern = this.handleNicknames(this.pattern).trim());
    let e = this.pattern.match(/\S+/g) || [""], t = e.length;
    if (e.length < 5 || e.length > 7) throw new TypeError("CronPattern: invalid configuration format ('" + this.pattern + "'), exactly five, six, or seven space separated parts are required.");
    if (this.mode !== "auto") {
      let n;
      switch (this.mode) {
        case "5-part":
          n = 5;
          break;
        case "6-part":
          n = 6;
          break;
        case "7-part":
          n = 7;
          break;
        case "5-or-6-parts":
          n = [5, 6];
          break;
        case "6-or-7-parts":
          n = [6, 7];
          break;
        default:
          n = 0;
      }
      if (!(Array.isArray(n) ? n.includes(t) : t === n)) {
        let a = Array.isArray(n) ? n.join(" or ") : n.toString();
        throw new TypeError(`CronPattern: mode '${this.mode}' requires exactly ${a} parts, but pattern '${this.pattern}' has ${t} parts.`);
      }
    }
    if (e.length === 5 && e.unshift("0"), e.length === 6 && e.push("*"), e[3].toUpperCase() === "LW" ? (this.lastWeekday = true, e[3] = "") : e[3].toUpperCase().indexOf("L") >= 0 && (e[3] = e[3].replace(/L/gi, ""), this.lastDayOfMonth = true), e[3] == "*" && (this.starDOM = true), e[6] == "*" && (this.starYear = true), e[4].length >= 3 && (e[4] = this.replaceAlphaMonths(e[4])), e[5].length >= 3 && (e[5] = this.alternativeWeekdays ? this.replaceAlphaDaysQuartz(e[5]) : this.replaceAlphaDays(e[5])), e[5].startsWith("+") && (this.useAndLogic = true, e[5] = e[5].substring(1), e[5] === "")) throw new TypeError("CronPattern: Day-of-week field cannot be empty after '+' modifier.");
    switch (e[5] == "*" && (this.starDOW = true), this.pattern.indexOf("?") >= 0 && (e[0] = e[0].replace(/\?/g, "*"), e[1] = e[1].replace(/\?/g, "*"), e[2] = e[2].replace(/\?/g, "*"), e[3] = e[3].replace(/\?/g, "*"), e[4] = e[4].replace(/\?/g, "*"), e[5] = e[5].replace(/\?/g, "*"), e[6] && (e[6] = e[6].replace(/\?/g, "*"))), this.mode) {
      case "5-part":
        e[0] = "0", e[6] = "*";
        break;
      case "6-part":
        e[6] = "*";
        break;
      case "5-or-6-parts":
        e[6] = "*";
        break;
      case "6-or-7-parts":
        break;
      case "7-part":
      case "auto":
        break;
    }
    this.throwAtIllegalCharacters(e), this.partToArray("second", e[0], 0, 1), this.partToArray("minute", e[1], 0, 1), this.partToArray("hour", e[2], 0, 1), this.partToArray("day", e[3], -1, 1), this.partToArray("month", e[4], -1, 1);
    let r = this.alternativeWeekdays ? -1 : 0;
    this.partToArray("dayOfWeek", e[5], r, 63), this.partToArray("year", e[6], 0, 1), !this.alternativeWeekdays && this.dayOfWeek[7] && (this.dayOfWeek[0] = this.dayOfWeek[7]);
  }
  partToArray(e, t, r, n) {
    let i = this[e], a = e === "day" && this.lastDayOfMonth, o = e === "day" && this.lastWeekday;
    if (t === "" && !a && !o) throw new TypeError("CronPattern: configuration entry " + e + " (" + t + ") is empty, check for trailing spaces.");
    if (t === "*") return i.fill(n);
    let h = t.split(",");
    if (h.length > 1) for (let l = 0; l < h.length; l++) this.partToArray(e, h[l], r, n);
    else t.indexOf("-") !== -1 && t.indexOf("/") !== -1 ? this.handleRangeWithStepping(t, e, r, n) : t.indexOf("-") !== -1 ? this.handleRange(t, e, r, n) : t.indexOf("/") !== -1 ? this.handleStepping(t, e, r, n) : t !== "" && this.handleNumber(t, e, r, n);
  }
  throwAtIllegalCharacters(e) {
    for (let t = 0; t < e.length; t++) if ((t === 3 ? /[^/*0-9,\-WwLl]+/ : t === 5 ? /[^/*0-9,\-#Ll]+/ : /[^/*0-9,\-]+/).test(e[t])) throw new TypeError("CronPattern: configuration entry " + t + " (" + e[t] + ") contains illegal characters.");
  }
  handleNumber(e, t, r, n) {
    let i = this.extractNth(e, t), a = e.toUpperCase().includes("W");
    if (t !== "day" && a) throw new TypeError("CronPattern: Nearest weekday modifier (W) only allowed in day-of-month.");
    a && (t = "nearestWeekdays");
    let o = parseInt(i[0], 10) + r;
    if (isNaN(o)) throw new TypeError("CronPattern: " + t + " is not a number: '" + e + "'");
    this.setPart(t, o, i[1] || n);
  }
  setPart(e, t, r) {
    if (!Object.prototype.hasOwnProperty.call(this, e)) throw new TypeError("CronPattern: Invalid part specified: " + e);
    if (e === "dayOfWeek") {
      if (t === 7 && (t = 0), t < 0 || t > 6) throw new RangeError("CronPattern: Invalid value for dayOfWeek: " + t);
      this.setNthWeekdayOfMonth(t, r);
      return;
    }
    if (e === "second" || e === "minute") {
      if (t < 0 || t >= 60) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
    } else if (e === "hour") {
      if (t < 0 || t >= 24) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
    } else if (e === "day" || e === "nearestWeekdays") {
      if (t < 0 || t >= 31) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
    } else if (e === "month") {
      if (t < 0 || t >= 12) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
    } else if (e === "year" && (t < 1 || t >= 1e4)) throw new RangeError("CronPattern: Invalid value for " + e + ": " + t + " (supported range: 1-9999)");
    this[e][t] = r;
  }
  validateNotNaN(e, t) {
    if (isNaN(e)) throw new TypeError(t);
  }
  validateRange(e, t, r, n, i) {
    if (e > t) throw new TypeError("CronPattern: From value is larger than to value: '" + i + "'");
    if (r !== void 0) {
      if (r === 0) throw new TypeError("CronPattern: Syntax error, illegal stepping: 0");
      if (r > this[n].length) throw new TypeError("CronPattern: Syntax error, steps cannot be greater than maximum value of part (" + this[n].length + ")");
    }
  }
  handleRangeWithStepping(e, t, r, n) {
    if (e.toUpperCase().includes("W")) throw new TypeError("CronPattern: Syntax error, W is not allowed in ranges with stepping.");
    let i = this.extractNth(e, t), a = i[0].match(/^(\d+)-(\d+)\/(\d+)$/);
    if (a === null) throw new TypeError("CronPattern: Syntax error, illegal range with stepping: '" + e + "'");
    let [, o, h, l] = a, y = parseInt(o, 10) + r, u = parseInt(h, 10) + r, d = parseInt(l, 10);
    this.validateNotNaN(y, "CronPattern: Syntax error, illegal lower range (NaN)"), this.validateNotNaN(u, "CronPattern: Syntax error, illegal upper range (NaN)"), this.validateNotNaN(d, "CronPattern: Syntax error, illegal stepping: (NaN)"), this.validateRange(y, u, d, t, e);
    for (let c = y; c <= u; c += d) this.setPart(t, c, i[1] || n);
  }
  extractNth(e, t) {
    let r = e, n;
    if (r.includes("#")) {
      if (t !== "dayOfWeek") throw new Error("CronPattern: nth (#) only allowed in day-of-week field");
      n = r.split("#")[1], r = r.split("#")[0];
    } else if (r.toUpperCase().endsWith("L")) {
      if (t !== "dayOfWeek") throw new Error("CronPattern: L modifier only allowed in day-of-week field (use L alone for day-of-month)");
      n = "L", r = r.slice(0, -1);
    }
    return [r, n];
  }
  handleRange(e, t, r, n) {
    if (e.toUpperCase().includes("W")) throw new TypeError("CronPattern: Syntax error, W is not allowed in a range.");
    let i = this.extractNth(e, t), a = i[0].split("-");
    if (a.length !== 2) throw new TypeError("CronPattern: Syntax error, illegal range: '" + e + "'");
    let o = parseInt(a[0], 10) + r, h = parseInt(a[1], 10) + r;
    this.validateNotNaN(o, "CronPattern: Syntax error, illegal lower range (NaN)"), this.validateNotNaN(h, "CronPattern: Syntax error, illegal upper range (NaN)"), this.validateRange(o, h, void 0, t, e);
    for (let l = o; l <= h; l++) this.setPart(t, l, i[1] || n);
  }
  handleStepping(e, t, r, n) {
    if (e.toUpperCase().includes("W")) throw new TypeError("CronPattern: Syntax error, W is not allowed in parts with stepping.");
    let i = this.extractNth(e, t), a = i[0].split("/");
    if (a.length !== 2) throw new TypeError("CronPattern: Syntax error, illegal stepping: '" + e + "'");
    if (this.sloppyRanges) a[0] === "" && (a[0] = "*");
    else {
      if (a[0] === "") throw new TypeError("CronPattern: Syntax error, stepping with missing prefix ('" + e + "') is not allowed. Use wildcard (*/step) or range (min-max/step) instead.");
      if (a[0] !== "*") throw new TypeError("CronPattern: Syntax error, stepping with numeric prefix ('" + e + "') is not allowed. Use wildcard (*/step) or range (min-max/step) instead.");
    }
    let o = 0;
    a[0] !== "*" && (o = parseInt(a[0], 10) + r);
    let h = parseInt(a[1], 10);
    this.validateNotNaN(h, "CronPattern: Syntax error, illegal stepping: (NaN)"), this.validateRange(0, this[t].length - 1, h, t, e);
    for (let l = o; l < this[t].length; l += h) this.setPart(t, l, i[1] || n);
  }
  replaceAlphaDays(e) {
    return e.replace(/-sun/gi, "-7").replace(/sun/gi, "0").replace(/mon/gi, "1").replace(/tue/gi, "2").replace(/wed/gi, "3").replace(/thu/gi, "4").replace(/fri/gi, "5").replace(/sat/gi, "6");
  }
  replaceAlphaDaysQuartz(e) {
    return e.replace(/sun/gi, "1").replace(/mon/gi, "2").replace(/tue/gi, "3").replace(/wed/gi, "4").replace(/thu/gi, "5").replace(/fri/gi, "6").replace(/sat/gi, "7");
  }
  replaceAlphaMonths(e) {
    return e.replace(/jan/gi, "1").replace(/feb/gi, "2").replace(/mar/gi, "3").replace(/apr/gi, "4").replace(/may/gi, "5").replace(/jun/gi, "6").replace(/jul/gi, "7").replace(/aug/gi, "8").replace(/sep/gi, "9").replace(/oct/gi, "10").replace(/nov/gi, "11").replace(/dec/gi, "12");
  }
  handleNicknames(e) {
    let t = e.trim().toLowerCase();
    if (t === "@yearly" || t === "@annually") return "0 0 1 1 *";
    if (t === "@monthly") return "0 0 1 * *";
    if (t === "@weekly") return "0 0 * * 0";
    if (t === "@daily" || t === "@midnight") return "0 0 * * *";
    if (t === "@hourly") return "0 * * * *";
    if (t === "@reboot") throw new TypeError("CronPattern: @reboot is not supported in this environment. This is an event-based trigger that requires system startup detection.");
    return e;
  }
  setNthWeekdayOfMonth(e, t) {
    if (typeof t != "number" && t.toUpperCase() === "L") this.dayOfWeek[e] = this.dayOfWeek[e] | 32;
    else if (t === 63) this.dayOfWeek[e] = 63;
    else if (t < 6 && t > 0) this.dayOfWeek[e] = this.dayOfWeek[e] | O[t - 1];
    else throw new TypeError(`CronPattern: nth weekday out of range, should be 1-5 or L. Value: ${t}, Type: ${typeof t}`);
  }
};
var P = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var f = [["month", "year", 0], ["day", "month", -1], ["hour", "day", 0], ["minute", "hour", 0], ["second", "minute", 0]];
var m = class s {
  tz;
  ms;
  second;
  minute;
  hour;
  day;
  month;
  year;
  constructor(e, t) {
    if (this.tz = t, e && e instanceof Date) if (!isNaN(e)) this.fromDate(e);
    else throw new TypeError("CronDate: Invalid date passed to CronDate constructor");
    else if (e == null) this.fromDate(/* @__PURE__ */ new Date());
    else if (e && typeof e == "string") this.fromString(e);
    else if (e instanceof s) this.fromCronDate(e);
    else throw new TypeError("CronDate: Invalid type (" + typeof e + ") passed to CronDate constructor");
  }
  getLastDayOfMonth(e, t) {
    return t !== 1 ? P[t] : new Date(Date.UTC(e, t + 1, 0)).getUTCDate();
  }
  getLastWeekday(e, t) {
    let r = this.getLastDayOfMonth(e, t), i = new Date(Date.UTC(e, t, r)).getUTCDay();
    return i === 0 ? r - 2 : i === 6 ? r - 1 : r;
  }
  getNearestWeekday(e, t, r) {
    let n = this.getLastDayOfMonth(e, t);
    if (r > n) return -1;
    let a = new Date(Date.UTC(e, t, r)).getUTCDay();
    return a === 0 ? r === n ? r - 2 : r + 1 : a === 6 ? r === 1 ? r + 2 : r - 1 : r;
  }
  isNthWeekdayOfMonth(e, t, r, n) {
    let a = new Date(Date.UTC(e, t, r)).getUTCDay(), o = 0;
    for (let h = 1; h <= r; h++) new Date(Date.UTC(e, t, h)).getUTCDay() === a && o++;
    if (n & 63 && O[o - 1] & n) return true;
    if (n & 32) {
      let h = this.getLastDayOfMonth(e, t);
      for (let l = r + 1; l <= h; l++) if (new Date(Date.UTC(e, t, l)).getUTCDay() === a) return false;
      return true;
    }
    return false;
  }
  fromDate(e) {
    if (this.tz !== void 0) if (typeof this.tz == "number") this.ms = e.getUTCMilliseconds(), this.second = e.getUTCSeconds(), this.minute = e.getUTCMinutes() + this.tz, this.hour = e.getUTCHours(), this.day = e.getUTCDate(), this.month = e.getUTCMonth(), this.year = e.getUTCFullYear(), this.apply();
    else try {
      let t = g(e, this.tz);
      this.ms = e.getMilliseconds(), this.second = t.s, this.minute = t.i, this.hour = t.h, this.day = t.d, this.month = t.m - 1, this.year = t.y;
    } catch (t) {
      let r = t instanceof Error ? t.message : String(t);
      throw new TypeError(`CronDate: Failed to convert date to timezone '${this.tz}'. This may happen with invalid timezone names or dates. Original error: ${r}`);
    }
    else this.ms = e.getMilliseconds(), this.second = e.getSeconds(), this.minute = e.getMinutes(), this.hour = e.getHours(), this.day = e.getDate(), this.month = e.getMonth(), this.year = e.getFullYear();
  }
  fromCronDate(e) {
    this.tz = e.tz, this.year = e.year, this.month = e.month, this.day = e.day, this.hour = e.hour, this.minute = e.minute, this.second = e.second, this.ms = e.ms;
  }
  apply() {
    if (this.month > 11 || this.month < 0 || this.day > P[this.month] || this.day < 1 || this.hour > 59 || this.minute > 59 || this.second > 59 || this.hour < 0 || this.minute < 0 || this.second < 0) {
      let e = new Date(Date.UTC(this.year, this.month, this.day, this.hour, this.minute, this.second, this.ms));
      return this.ms = e.getUTCMilliseconds(), this.second = e.getUTCSeconds(), this.minute = e.getUTCMinutes(), this.hour = e.getUTCHours(), this.day = e.getUTCDate(), this.month = e.getUTCMonth(), this.year = e.getUTCFullYear(), true;
    } else return false;
  }
  fromString(e) {
    if (typeof this.tz == "number") {
      let t = v(e);
      this.ms = t.getUTCMilliseconds(), this.second = t.getUTCSeconds(), this.minute = t.getUTCMinutes(), this.hour = t.getUTCHours(), this.day = t.getUTCDate(), this.month = t.getUTCMonth(), this.year = t.getUTCFullYear(), this.apply();
    } else return this.fromDate(v(e, this.tz));
  }
  findNext(e, t, r, n) {
    return this._findMatch(e, t, r, n, 1);
  }
  _findMatch(e, t, r, n, i) {
    let a = this[t], o;
    r.lastDayOfMonth && (o = this.getLastDayOfMonth(this.year, this.month));
    let h = !r.starDOW && t == "day" ? new Date(Date.UTC(this.year, this.month, 1, 0, 0, 0, 0)).getUTCDay() : void 0, l = this[t] + n, y = i === 1 ? (u) => u < r[t].length : (u) => u >= 0;
    for (let u = l; y(u); u += i) {
      let d = r[t][u];
      if (t === "day" && !d) {
        for (let c = 0; c < r.nearestWeekdays.length; c++) if (r.nearestWeekdays[c]) {
          let M = this.getNearestWeekday(this.year, this.month, c - n);
          if (M === -1) continue;
          if (M === u - n) {
            d = 1;
            break;
          }
        }
      }
      if (t === "day" && r.lastWeekday) {
        let c = this.getLastWeekday(this.year, this.month);
        u - n === c && (d = 1);
      }
      if (t === "day" && r.lastDayOfMonth && u - n == o && (d = 1), t === "day" && !r.starDOW) {
        let c = r.dayOfWeek[(h + (u - n - 1)) % 7];
        if (c && c & 63) c = this.isNthWeekdayOfMonth(this.year, this.month, u - n, c) ? 1 : 0;
        else if (c) throw new Error(`CronDate: Invalid value for dayOfWeek encountered. ${c}`);
        r.useAndLogic ? d = d && c : !e.domAndDow && !r.starDOM ? d = d || c : d = d && c;
      }
      if (d) return this[t] = u - n, a !== this[t] ? 2 : 1;
    }
    return 3;
  }
  recurse(e, t, r) {
    if (r === 0 && !e.starYear) {
      if (this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0) {
        let i = -1;
        for (let a = this.year + 1; a < e.year.length && a < 1e4; a++) if (e.year[a] === 1) {
          i = a;
          break;
        }
        if (i === -1) return null;
        this.year = i, this.month = 0, this.day = 1, this.hour = 0, this.minute = 0, this.second = 0, this.ms = 0;
      }
      if (this.year >= 1e4) return null;
    }
    let n = this.findNext(t, f[r][0], e, f[r][2]);
    if (n > 1) {
      let i = r + 1;
      for (; i < f.length; ) this[f[i][0]] = -f[i][2], i++;
      if (n === 3) {
        if (this[f[r][1]]++, this[f[r][0]] = -f[r][2], this.apply(), r === 0 && !e.starYear) {
          for (; this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0 && this.year < 1e4; ) this.year++;
          if (this.year >= 1e4 || this.year >= e.year.length) return null;
        }
        return this.recurse(e, t, 0);
      } else if (this.apply()) return this.recurse(e, t, r - 1);
    }
    return r += 1, r >= f.length ? this : (e.starYear ? this.year >= 3e3 : this.year >= 1e4) ? null : this.recurse(e, t, r);
  }
  increment(e, t, r) {
    return this.second += t.interval !== void 0 && t.interval > 1 && r ? t.interval : 1, this.ms = 0, this.apply(), this.recurse(e, t, 0);
  }
  decrement(e, t) {
    return this.second -= t.interval !== void 0 && t.interval > 1 ? t.interval : 1, this.ms = 0, this.apply(), this.recurseBackward(e, t, 0, 0);
  }
  recurseBackward(e, t, r, n = 0) {
    if (n > 1e4) return null;
    if (r === 0 && !e.starYear) {
      if (this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0) {
        let a = -1;
        for (let o = this.year - 1; o >= 0; o--) if (e.year[o] === 1) {
          a = o;
          break;
        }
        if (a === -1) return null;
        this.year = a, this.month = 11, this.day = 31, this.hour = 23, this.minute = 59, this.second = 59, this.ms = 0;
      }
      if (this.year < 0) return null;
    }
    let i = this.findPrevious(t, f[r][0], e, f[r][2]);
    if (i > 1) {
      let a = r + 1;
      for (; a < f.length; ) {
        let o = f[a][0], h = f[a][2], l = this.getMaxPatternValue(o, e, h);
        this[o] = l, a++;
      }
      if (i === 3) {
        if (this[f[r][1]]--, r === 0) {
          let y = this.getLastDayOfMonth(this.year, this.month);
          this.day > y && (this.day = y);
        }
        if (r === 1) if (this.day <= 0) this.day = 1;
        else {
          let y = this.year, u = this.month;
          for (; u < 0; ) u += 12, y--;
          for (; u > 11; ) u -= 12, y++;
          let d = u !== 1 ? P[u] : new Date(Date.UTC(y, u + 1, 0)).getUTCDate();
          this.day > d && (this.day = d);
        }
        this.apply();
        let o = f[r][0], h = f[r][2], l = this.getMaxPatternValue(o, e, h);
        if (o === "day") {
          let y = this.getLastDayOfMonth(this.year, this.month);
          this[o] = Math.min(l, y);
        } else this[o] = l;
        if (this.apply(), r === 0) {
          let y = f[1][2], u = this.getMaxPatternValue("day", e, y), d = this.getLastDayOfMonth(this.year, this.month), c = Math.min(u, d);
          c !== this.day && (this.day = c, this.hour = this.getMaxPatternValue("hour", e, f[2][2]), this.minute = this.getMaxPatternValue("minute", e, f[3][2]), this.second = this.getMaxPatternValue("second", e, f[4][2]));
        }
        if (r === 0 && !e.starYear) {
          for (; this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0; ) this.year--;
          if (this.year < 0) return null;
        }
        return this.recurseBackward(e, t, 0, n + 1);
      } else if (this.apply()) return this.recurseBackward(e, t, r - 1, n + 1);
    }
    return r += 1, r >= f.length ? this : this.year < 0 ? null : this.recurseBackward(e, t, r, n + 1);
  }
  getMaxPatternValue(e, t, r) {
    if (e === "day" && t.lastDayOfMonth) return this.getLastDayOfMonth(this.year, this.month);
    if (e === "day" && !t.starDOW) return this.getLastDayOfMonth(this.year, this.month);
    for (let n = t[e].length - 1; n >= 0; n--) if (t[e][n]) return n - r;
    return t[e].length - 1 - r;
  }
  findPrevious(e, t, r, n) {
    return this._findMatch(e, t, r, n, -1);
  }
  getDate(e) {
    return e || this.tz === void 0 ? new Date(this.year, this.month, this.day, this.hour, this.minute, this.second, this.ms) : typeof this.tz == "number" ? new Date(Date.UTC(this.year, this.month, this.day, this.hour, this.minute - this.tz, this.second, this.ms)) : k(b(this.year, this.month + 1, this.day, this.hour, this.minute, this.second, this.tz), false);
  }
  getTime() {
    return this.getDate(false).getTime();
  }
  match(e, t) {
    if (!e.starYear && (this.year < 0 || this.year >= e.year.length || e.year[this.year] === 0)) return false;
    for (let r = 0; r < f.length; r++) {
      let n = f[r][0], i = f[r][2], a = this[n];
      if (a + i < 0 || a + i >= e[n].length) return false;
      let o = e[n][a + i];
      if (n === "day") {
        if (!o) {
          for (let h = 0; h < e.nearestWeekdays.length; h++) if (e.nearestWeekdays[h]) {
            let l = this.getNearestWeekday(this.year, this.month, h - i);
            if (l !== -1 && l === a) {
              o = 1;
              break;
            }
          }
        }
        if (e.lastWeekday) {
          let h = this.getLastWeekday(this.year, this.month);
          a === h && (o = 1);
        }
        if (e.lastDayOfMonth) {
          let h = this.getLastDayOfMonth(this.year, this.month);
          a === h && (o = 1);
        }
        if (!e.starDOW) {
          let h = new Date(Date.UTC(this.year, this.month, 1, 0, 0, 0, 0)).getUTCDay(), l = e.dayOfWeek[(h + (a - 1)) % 7];
          l && l & 63 && (l = this.isNthWeekdayOfMonth(this.year, this.month, a, l) ? 1 : 0), e.useAndLogic ? o = o && l : !t.domAndDow && !e.starDOM ? o = o || l : o = o && l;
        }
      }
      if (!o) return false;
    }
    return true;
  }
};
function R(s2) {
  if (s2 === void 0 && (s2 = {}), delete s2.name, s2.legacyMode !== void 0 && s2.domAndDow === void 0 ? s2.domAndDow = !s2.legacyMode : s2.domAndDow === void 0 && (s2.domAndDow = false), s2.legacyMode = !s2.domAndDow, s2.paused = s2.paused === void 0 ? false : s2.paused, s2.maxRuns = s2.maxRuns === void 0 ? 1 / 0 : s2.maxRuns, s2.catch = s2.catch === void 0 ? false : s2.catch, s2.interval = s2.interval === void 0 ? 0 : parseInt(s2.interval.toString(), 10), s2.utcOffset = s2.utcOffset === void 0 ? void 0 : parseInt(s2.utcOffset.toString(), 10), s2.dayOffset = s2.dayOffset === void 0 ? 0 : parseInt(s2.dayOffset.toString(), 10), s2.unref = s2.unref === void 0 ? false : s2.unref, s2.mode = s2.mode === void 0 ? "auto" : s2.mode, s2.alternativeWeekdays = s2.alternativeWeekdays === void 0 ? false : s2.alternativeWeekdays, s2.sloppyRanges = s2.sloppyRanges === void 0 ? false : s2.sloppyRanges, !["auto", "5-part", "6-part", "7-part", "5-or-6-parts", "6-or-7-parts"].includes(s2.mode)) throw new Error("CronOptions: mode must be one of 'auto', '5-part', '6-part', '7-part', '5-or-6-parts', or '6-or-7-parts'.");
  if (s2.startAt && (s2.startAt = new m(s2.startAt, s2.timezone)), s2.stopAt && (s2.stopAt = new m(s2.stopAt, s2.timezone)), s2.interval !== null) {
    if (isNaN(s2.interval)) throw new Error("CronOptions: Supplied value for interval is not a number");
    if (s2.interval < 0) throw new Error("CronOptions: Supplied value for interval can not be negative");
  }
  if (s2.utcOffset !== void 0) {
    if (isNaN(s2.utcOffset)) throw new Error("CronOptions: Invalid value passed for utcOffset, should be number representing minutes offset from UTC.");
    if (s2.utcOffset < -870 || s2.utcOffset > 870) throw new Error("CronOptions: utcOffset out of bounds.");
    if (s2.utcOffset !== void 0 && s2.timezone) throw new Error("CronOptions: Combining 'utcOffset' with 'timezone' is not allowed.");
  }
  if (s2.unref !== true && s2.unref !== false) throw new Error("CronOptions: Unref should be either true, false or undefined(false).");
  if (s2.dayOffset !== void 0 && s2.dayOffset !== 0 && isNaN(s2.dayOffset)) throw new Error("CronOptions: Invalid value passed for dayOffset, should be a number representing days to offset.");
  return s2;
}
function p(s2) {
  return Object.prototype.toString.call(s2) === "[object Function]" || typeof s2 == "function" || s2 instanceof Function;
}
function _(s2) {
  return p(s2);
}
function x(s2) {
  typeof Deno < "u" && typeof Deno.unrefTimer < "u" ? Deno.unrefTimer(s2) : s2 && typeof s2.unref < "u" && s2.unref();
}
var W = 30 * 1e3;
var w = [];
var E = class {
  name;
  options;
  _states;
  fn;
  getTz() {
    return this.options.timezone || this.options.utcOffset;
  }
  applyDayOffset(e) {
    if (this.options.dayOffset !== void 0 && this.options.dayOffset !== 0) {
      let t = this.options.dayOffset * 24 * 60 * 60 * 1e3;
      return new Date(e.getTime() + t);
    }
    return e;
  }
  constructor(e, t, r) {
    let n, i;
    if (p(t)) i = t;
    else if (typeof t == "object") n = t;
    else if (t !== void 0) throw new Error("Cron: Invalid argument passed for optionsIn. Should be one of function, or object (options).");
    if (p(r)) i = r;
    else if (typeof r == "object") n = r;
    else if (r !== void 0) throw new Error("Cron: Invalid argument passed for funcIn. Should be one of function, or object (options).");
    if (this.name = n?.name, this.options = R(n), this._states = { kill: false, blocking: false, previousRun: void 0, currentRun: void 0, once: void 0, currentTimeout: void 0, maxRuns: n ? n.maxRuns : void 0, paused: n ? n.paused : false, pattern: new C("* * * * *", void 0, { mode: "auto" }) }, e && (e instanceof Date || typeof e == "string" && e.indexOf(":") > 0) ? this._states.once = new m(e, this.getTz()) : this._states.pattern = new C(e, this.options.timezone, { mode: this.options.mode, alternativeWeekdays: this.options.alternativeWeekdays, sloppyRanges: this.options.sloppyRanges }), this.name) {
      if (w.find((o) => o.name === this.name)) throw new Error("Cron: Tried to initialize new named job '" + this.name + "', but name already taken.");
      w.push(this);
    }
    return i !== void 0 && _(i) && (this.fn = i, this.schedule()), this;
  }
  nextRun(e) {
    let t = this._next(e);
    return t ? this.applyDayOffset(t.getDate(false)) : null;
  }
  nextRuns(e, t) {
    this._states.maxRuns !== void 0 && e > this._states.maxRuns && (e = this._states.maxRuns);
    let r = t || this._states.currentRun || void 0;
    return this._enumerateRuns(e, r, "next");
  }
  previousRuns(e, t) {
    return this._enumerateRuns(e, t || void 0, "previous");
  }
  _enumerateRuns(e, t, r) {
    let n = [], i = t ? new m(t, this.getTz()) : null, a = r === "next" ? this._next : this._previous;
    for (; e--; ) {
      let o = a.call(this, i);
      if (!o) break;
      let h = o.getDate(false);
      n.push(this.applyDayOffset(h)), i = o;
    }
    return n;
  }
  match(e) {
    if (this._states.once) {
      let r = new m(e, this.getTz());
      r.ms = 0;
      let n = new m(this._states.once, this.getTz());
      return n.ms = 0, r.getTime() === n.getTime();
    }
    let t = new m(e, this.getTz());
    return t.ms = 0, t.match(this._states.pattern, this.options);
  }
  getPattern() {
    if (!this._states.once) return this._states.pattern ? this._states.pattern.pattern : void 0;
  }
  getOnce() {
    return this._states.once ? this._states.once.getDate() : null;
  }
  isRunning() {
    let e = this.nextRun(this._states.currentRun), t = !this._states.paused, r = this.fn !== void 0, n = !this._states.kill;
    return t && r && n && e !== null;
  }
  isStopped() {
    return this._states.kill;
  }
  isBusy() {
    return this._states.blocking;
  }
  currentRun() {
    return this._states.currentRun ? this._states.currentRun.getDate() : null;
  }
  previousRun() {
    return this._states.previousRun ? this._states.previousRun.getDate() : null;
  }
  msToNext(e) {
    let t = this._next(e);
    return t ? e instanceof m || e instanceof Date ? t.getTime() - e.getTime() : t.getTime() - new m(e).getTime() : null;
  }
  stop() {
    this._states.kill = true, this._states.currentTimeout && clearTimeout(this._states.currentTimeout);
    let e = w.indexOf(this);
    e >= 0 && w.splice(e, 1);
  }
  pause() {
    return this._states.paused = true, !this._states.kill;
  }
  resume() {
    return this._states.paused = false, !this._states.kill;
  }
  schedule(e) {
    if (e && this.fn) throw new Error("Cron: It is not allowed to schedule two functions using the same Croner instance.");
    e && (this.fn = e);
    let t = this.msToNext(), r = this.nextRun(this._states.currentRun);
    return t == null || isNaN(t) || r === null ? this : (t > W && (t = W), this._states.currentTimeout = setTimeout(() => this._checkTrigger(r), t), this._states.currentTimeout && this.options.unref && x(this._states.currentTimeout), this);
  }
  async _trigger(e) {
    this._states.blocking = true, this._states.currentRun = new m(void 0, this.getTz());
    try {
      if (this.options.catch) try {
        this.fn !== void 0 && await this.fn(this, this.options.context);
      } catch (t) {
        if (p(this.options.catch)) try {
          this.options.catch(t, this);
        } catch {
        }
      }
      else this.fn !== void 0 && await this.fn(this, this.options.context);
    } finally {
      this._states.previousRun = new m(e, this.getTz()), this._states.blocking = false;
    }
  }
  async trigger() {
    await this._trigger();
  }
  runsLeft() {
    return this._states.maxRuns;
  }
  _checkTrigger(e) {
    let t = /* @__PURE__ */ new Date(), r = !this._states.paused && t.getTime() >= e.getTime(), n = this._states.blocking && this.options.protect;
    r && !n ? (this._states.maxRuns !== void 0 && this._states.maxRuns--, this._trigger()) : r && n && p(this.options.protect) && setTimeout(() => this.options.protect(this), 0), this.schedule();
  }
  _next(e) {
    let t = !!(e || this._states.currentRun), r = false;
    !e && this.options.startAt && this.options.interval && ([e, t] = this._calculatePreviousRun(e, t), r = !e), e = new m(e, this.getTz()), this.options.startAt && e && e.getTime() < this.options.startAt.getTime() && (e = this.options.startAt);
    let n = this._states.once || new m(e, this.getTz());
    return !r && n !== this._states.once && (n = n.increment(this._states.pattern, this.options, t)), this._states.once && this._states.once.getTime() <= e.getTime() || n === null || this._states.maxRuns !== void 0 && this._states.maxRuns <= 0 || this._states.kill || this.options.stopAt && n.getTime() >= this.options.stopAt.getTime() ? null : n;
  }
  _previous(e) {
    let t = new m(e, this.getTz());
    this.options.stopAt && t.getTime() > this.options.stopAt.getTime() && (t = this.options.stopAt);
    let r = new m(t, this.getTz());
    return this._states.once ? this._states.once.getTime() < t.getTime() ? this._states.once : null : (r = r.decrement(this._states.pattern, this.options), r === null || this.options.startAt && r.getTime() < this.options.startAt.getTime() ? null : r);
  }
  _calculatePreviousRun(e, t) {
    let r = new m(void 0, this.getTz()), n = e;
    if (this.options.startAt.getTime() <= r.getTime()) {
      n = this.options.startAt;
      let i = n.getTime() + this.options.interval * 1e3;
      for (; i <= r.getTime(); ) n = new m(n, this.getTz()).increment(this._states.pattern, this.options, true), i = n.getTime() + this.options.interval * 1e3;
      t = true;
    }
    return n === null && (n = void 0), [n, t];
  }
};

// src/host/routines.ts
var Routines = class {
  constructor(runner) {
    this.runner = runner;
  }
  runner;
  jobs = [];
  reschedule(bots) {
    for (const j of this.jobs) j.stop();
    this.jobs = [];
    for (const b2 of bots) for (const r of b2.routines) {
      try {
        const job = new E(r.cron, { timezone: void 0 }, () => this.runner.run(b2, r));
        this.jobs.push(job);
      } catch (e) {
        this.runner.log(`\uB8E8\uD2F4 cron \uC774 \uC774\uC0C1\uD574\uC694: ${b2.name} \xB7 ${r.name} \xB7 ${e.message}`);
      }
    }
  }
  next() {
    return this.jobs.map((j) => ({ bot: "", name: "", at: j.nextRun()?.getTime() ?? 0 }));
  }
};
function approveToMode(a) {
  return a === "always" ? "bypassPermissions" : a === "folder" ? "acceptEdits" : "plan";
}

// src/host/todoStore.ts
import { existsSync as existsSync8, readFileSync as readFileSync7 } from "node:fs";
import { join as join8 } from "node:path";
function todoPath(botAbs) {
  return join8(botAbs, "todo.md");
}
function readTodo(botAbs) {
  const p2 = todoPath(botAbs);
  if (!existsSync8(p2)) return [];
  return parseTodo(readFileSync7(p2, "utf8"));
}
function todoToggle(botAbs, line, done) {
  const p2 = todoPath(botAbs);
  if (!existsSync8(p2)) return [];
  atomicWrite(p2, toggleAndMove(readFileSync7(p2, "utf8"), line, done));
  return readTodo(botAbs);
}
function todoAdd(botAbs, title, desc, by, section = "") {
  const p2 = todoPath(botAbs);
  const md = existsSync8(p2) ? readFileSync7(p2, "utf8") : "";
  atomicWrite(p2, addLine(md, title, desc, by, section));
  return readTodo(botAbs);
}
function todoEdit(botAbs, line, title, desc) {
  const p2 = todoPath(botAbs);
  if (!existsSync8(p2)) return [];
  atomicWrite(p2, editLine(readFileSync7(p2, "utf8"), line, title, desc));
  return readTodo(botAbs);
}
function todoDelete(botAbs, line) {
  const p2 = todoPath(botAbs);
  if (!existsSync8(p2)) return [];
  atomicWrite(p2, deleteLine(readFileSync7(p2, "utf8"), line));
  return readTodo(botAbs);
}
function todoMove(botAbs, from, before) {
  const p2 = todoPath(botAbs);
  if (!existsSync8(p2)) return [];
  atomicWrite(p2, moveLine(readFileSync7(p2, "utf8"), from, before));
  return readTodo(botAbs);
}
function todoContext(botAbs) {
  const items = readTodo(botAbs).filter((t) => !t.done);
  if (!items.length) return "";
  return `\uD604\uC7AC todo.md \uBBF8\uC644\uB8CC ${items.length}\uAC74:
` + items.map((t) => `- ${t.title}${t.desc ? `: ${t.desc}` : ""}${t.by === "bot" ? " (\uBD07\uC774 \uB0A8\uAE40)" : ""}`).join("\n");
}

// src/host/files.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync9, readdirSync as readdirSync5, readFileSync as readFileSync8, statSync as statSync5, createReadStream, renameSync as renameSync3, openSync, readSync, closeSync } from "node:fs";
import { dirname as dirname3, basename as basename3 } from "node:path";
import { join as join9, extname, relative as relative2, resolve as resolve3, sep as sep2 } from "node:path";
var SKIP = /* @__PURE__ */ new Set(["node_modules", ".git", ".DS_Store", ".folderbot", ".projectbot", "dist", ".next"]);
var TEXT_EXT = /* @__PURE__ */ new Set([".md", ".txt", ".yml", ".yaml", ".json", ".ts", ".tsx", ".js", ".mjs", ".py", ".sh", ".css", ".html", ".csv", ".toml", ".env.example", ".canvas"]);
var IMG_EXT = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
function guard(roots, abs) {
  const a = resolve3(abs);
  const an = a.normalize("NFC");
  for (const r of roots) {
    const rr = resolve3(r).normalize("NFC");
    if (an === rr || an.startsWith(rr + sep2)) return a;
  }
  throw new Error("\uD5C8\uC6A9\uB41C \uD3F4\uB354 \uBC16\uC774\uC5D0\uC694");
}
function tree(base, depth = 2, max = 400) {
  let count = 0;
  const walk = (dir3, d) => {
    let names = [];
    try {
      names = readdirSync5(dir3);
    } catch {
      return [];
    }
    const out = [];
    for (const name of names) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      if (++count > max) break;
      const abs = join9(dir3, name);
      let st;
      try {
        st = statSync5(abs);
      } catch {
        continue;
      }
      const node = { name, rel: relative2(base, abs), dir: st.isDirectory(), size: st.isDirectory() ? void 0 : st.size, mtime: st.mtimeMs };
      if (node.dir && d > 1) node.children = walk(abs, d - 1);
      out.push(node);
    }
    return out.sort((a, b2) => a.dir === b2.dir ? b2.mtime - a.mtime : a.dir ? -1 : 1);
  };
  return walk(base, depth);
}
function allDirs(base, depth = 6, max = 4e3) {
  const out = [];
  const walk = (dir3, rel, d) => {
    if (d <= 0 || out.length >= max) return;
    let names = [];
    try {
      names = readdirSync5(dir3);
    } catch {
      return;
    }
    for (const name of names) {
      if (out.length >= max) return;
      if (SKIP.has(name) || name.startsWith(".")) continue;
      if (/\.(app|key|numbers|pages|bundle|framework)$/i.test(name)) continue;
      const abs = join9(dir3, name);
      let st;
      try {
        st = statSync5(abs);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      const r = rel ? `${rel}/${name}` : name;
      out.push({ name, rel: r, dir: true, mtime: st.mtimeMs });
      walk(abs, r, d - 1);
    }
  };
  walk(base, "", depth);
  return out;
}
function listDir(base, rel, all = false) {
  const dir3 = rel ? join9(base, rel) : base;
  let names = [];
  try {
    names = readdirSync5(dir3);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (SKIP.has(name) || !all && name.startsWith(".")) continue;
    const abs = join9(dir3, name);
    let st;
    try {
      st = statSync5(abs);
    } catch {
      continue;
    }
    const bundle = /\.(app|key|numbers|pages|bundle|framework)$/i.test(name);
    out.push({ name, rel: relative2(base, abs), dir: st.isDirectory() && !bundle, size: st.isDirectory() ? void 0 : st.size, mtime: st.mtimeMs });
  }
  return out.sort((a, b2) => a.dir === b2.dir ? a.name.localeCompare(b2.name, "ko") : a.dir ? -1 : 1);
}
function recent(base, limit = 12) {
  const out = [];
  const walk = (dir3, d) => {
    let names = [];
    try {
      names = readdirSync5(dir3);
    } catch {
      return;
    }
    for (const name of names) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const abs = join9(dir3, name);
      let st;
      try {
        st = statSync5(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (d > 0) walk(abs, d - 1);
      } else out.push({ name, rel: relative2(base, abs), dir: false, size: st.size, mtime: st.mtimeMs });
    }
  };
  walk(base, 3);
  return out.sort((a, b2) => b2.mtime - a.mtime).slice(0, limit);
}
function kindOf2(abs) {
  const e = extname(abs).toLowerCase();
  if (e === ".canvas") return "canvas";
  if (e === ".html" || e === ".htm") return "html";
  if (TEXT_EXT.has(e) || e === "") return "text";
  if (IMG_EXT.has(e)) return "image";
  if (e === ".pdf") return "pdf";
  return "other";
}
function readText(abs, max = 2e6) {
  const st = statSync5(abs);
  const buf = readFileSync8(abs);
  const text = buf.subarray(0, max).toString("utf8");
  return { text, truncated: st.size > max };
}
function writeText(abs, text) {
  atomicWrite(abs, text);
}
function renameEntry(abs, newName) {
  const clean2 = newName.replace(/[\/\\:\u0000-\u001f]/g, "_").trim();
  if (!clean2 || clean2 === basename3(abs)) return abs;
  const to = join9(dirname3(abs), clean2);
  if (existsSync9(to)) throw new Error("\uAC19\uC740 \uC774\uB984\uC774 \uC774\uBBF8 \uC788\uC5B4\uC694");
  renameSync3(abs, to);
  return to;
}
function headHash(abs) {
  const fd = openSync(abs, "r");
  try {
    const buf = Buffer.alloc(65536);
    const n = readSync(fd, buf, 0, 65536, 0);
    return createHash("sha256").update(buf.subarray(0, n)).digest("hex");
  } finally {
    closeSync(fd);
  }
}
function findFiles(base, name, limit = 5, depth = 8) {
  const want = name.normalize("NFC").toLowerCase();
  const out = [];
  const walk = (dir3, d) => {
    if (d < 0 || out.length >= limit) return;
    let ents;
    try {
      ents = readdirSync5(dir3, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (out.length >= limit) return;
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && !e.name.startsWith(".")) walk(join9(dir3, e.name), d - 1);
      } else if (e.name.normalize("NFC").toLowerCase() === want) out.push(join9(dir3, e.name));
    }
  };
  walk(base, depth);
  return out;
}
function stream(abs) {
  return createReadStream(abs);
}
function exists(abs) {
  return existsSync9(abs);
}
function resolveNFDeep(base, rel) {
  let cur = base;
  for (const seg of rel.split("/").filter(Boolean)) {
    if (seg === "..") {
      cur = dirname3(cur);
      continue;
    }
    if (seg === ".") continue;
    const direct = join9(cur, seg);
    if (existsSync9(direct)) {
      cur = direct;
      continue;
    }
    const alt = [seg.normalize("NFC"), seg.normalize("NFD")].find((a) => a !== seg && existsSync9(join9(cur, a)));
    cur = join9(cur, alt ?? seg);
  }
  return cur;
}
function mime(abs) {
  const e = extname(abs).toLowerCase();
  return { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".md": "text/markdown; charset=utf-8", ".json": "application/json", ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript" }[e] ?? "application/octet-stream";
}

// src/host/host.ts
var PERM_MODES = ["default", "acceptEdits", "plan", "bypassPermissions", "dontAsk"];
var Host = class {
  constructor(cfg, version2) {
    this.cfg = cfg;
    this.version = version2;
    this.registry = new Registry(absRoot(cfg));
    this.notifier = new Notifier(cfg);
    this.notifier.onEvent = (n) => this.broadcast({ ev: "notify", n });
    this.sessions.bin = cfg.claudeBin;
    this.applyDefaults(cfg);
    setOauthToken(cfg.claudeOauthToken);
    this.sessions.mcpUrl = (sid, botId) => JSON.stringify({ mcpServers: { folderbot: { type: "http", url: `http://127.0.0.1:${cfg.port}/mcp/${botId}?sid=${encodeURIComponent(sid)}` } } });
    this.sessions.systemPromptFor = (bot) => this.systemPrompt(bot);
    this.routines = new Routines({ run: (b2, r) => this.runRoutine(b2, r), log: this.log });
    this.wire();
    this.routines.reschedule(this.registry.bots());
    this.watcher.log = (m2) => this.log(m2);
    this.watcher.sync(this.registry.bots());
    void this.refreshAuth();
    setInterval(() => void this.refreshAuth(), 30 * 60 * 1e3).unref();
    setInterval(() => this.watchInbox(), 60 * 1e3).unref();
  }
  cfg;
  version;
  registry;
  sessions = new SessionManager();
  notifier;
  routines;
  auth = { verdict: "unknown", checkedAt: 0 };
  queued = [];
  broadcast = () => {
  };
  watcher = new FolderWatch((botId) => {
    this.broadcast({ ev: "files", botId });
    this.refreshNames();
  });
  lastNames = "";
  /** 봇 폴더의 CLAUDE.md `display_name:` 이 바뀌면 레일도 바뀌어야 한다 — 파일 신호 뒤에 표시 이름을 다시 재 본다 */
  refreshNames() {
    const now = this.registry.bots().map((b2) => `${b2.id}=${b2.displayName}`).join("|");
    if (now !== this.lastNames) {
      this.lastNames = now;
      this.afterBotsChanged();
    }
  }
  log = (s2) => console.log(`[folderbot] ${s2}`);
  /**
   * 🔴 **루트를 바꾸는 일은 «저장» 과 «다시 세우기» 둘로 갈린다.** 호스트는 저장만 하고, 다시 세우는
   *    쪽은 셸(Electron)이 맡는다 — 레지스트리·세션·루틴이 전부 루트에 매여 있어 **통째로 새로 세우는
   *    것**이 제자리에서 갈아끼우는 것보다 안전하다. 셸이 안 꽂아 주면(터미널 호스트) 저장만 되고
   *    다음 시작에 적용된다 — 그 사실을 화면이 말해 준다.
   */
  onRoot = null;
  wire() {
    this.registry.on("bots", (bots, meta) => {
      this.broadcast({ ev: "bots", bots, ...meta ?? {} });
      this.routines.reschedule(bots);
      this.watcher.sync(bots);
    });
    this.sessions.on("sessions", (botId) => this.broadcast({ ev: "sessions", botId, sessions: this.sessions.list(botId) }));
    this.sessions.on("chat", (sessionId, item, replace) => this.broadcast({ ev: "chat", sessionId, item, replace }));
    this.sessions.on("files", (botId) => this.broadcast({ ev: "files", botId }));
    this.sessions.on("activity", (r) => this.broadcast({ ev: "activity", sessionId: r.id, botId: r.botId, activity: r.activity ?? "", turnStartedAt: r.turnStartedAt }));
    this.sessions.on("auth-error", () => {
      void this.refreshAuth(true);
    });
    this.sessions.on("chat", (sessionId, item) => {
      if (item.kind === "result" && !item.ok && AUTH_ERROR.test(item.error ?? "") || item.kind === "assistant" && AUTH_ERROR.test(item.text) && item.text.length < 200) void this.refreshAuth(true);
    });
    this.sessions.on("permission", (r, req) => {
      this.broadcast({ ev: "permission", sessionId: r.id, botId: r.botId, req });
      const bot = this.registry.bot(r.botId);
      const what = req.ask ? String(req.input.questions?.[0]?.question ?? "\uC9C8\uBB38\uC5D0 \uB2F5\uD574 \uC8FC\uC138\uC694") : `${req.displayName}: ${summarize(req)}`;
      this.notifier.emit("awaiting", r.botId, `${bot?.name ?? r.botId} \xB7 \uD655\uC778\uD574 \uC8FC\uC138\uC694`, what, r.id);
    });
    this.sessions.on("state", (r, prev, notify) => {
      this.broadcast({ ev: "state", sessionId: r.id, botId: r.botId, state: r.state });
      if (prev === "running" && r.state !== "running") invalidateUsage();
      this.broadcast({ ev: "sessions", botId: r.botId, sessions: this.sessions.list(r.botId) });
      if (!notify || r.state === "awaiting_input") return;
      const bot = this.registry.bot(r.botId);
      const last = [...r.items].reverse().find((i) => i.kind === "assistant");
      if (r.state === "done") this.notifier.emit(r.routine ? "routine" : "done", r.botId, `${bot?.name ?? ""} \xB7 ${STATE_LABEL.done}`, (last?.text ?? r.name).slice(0, 140), r.id, { push: !r.routine || bot?.routines.find((x2) => x2.name === r.routine)?.push !== false });
      if (r.state === "error") this.notifier.emit("error", r.botId, `${bot?.name ?? ""} \xB7 ${STATE_LABEL.error}`, (r.lastError ?? "\uC138\uC158 \uC624\uB958").split("\n").pop().slice(0, 140), r.id);
    });
  }
  systemPrompt(bot) {
    const parts = [];
    if (bot.orchestrator) parts.push(this.registry.orchestratorPrompt());
    else parts.push(`\uB108\uB294 Folder Bot \uC758 \uBD07\uC774\uB2E4. \uD3F4\uB354 "${bot.rel}" \uC548\uC5D0\uC11C \uC77C\uD55C\uB2E4. \uC0B0\uCD9C\uBB3C\uC740 \uC774 \uD3F4\uB354\uC5D0 \uB454\uB2E4.`);
    parts.push(TODO_RULES_PROMPT);
    parts.push(DEVICE_RULES_MD);
    const ctx = todoContext(bot.abs);
    if (ctx) parts.push(ctx);
    return parts.join("\n\n");
  }
  afterBotsChanged() {
    this.broadcast({ ev: "bots", bots: this.registry.bots() });
    this.routines.reschedule(this.registry.bots());
  }
  /** 세션에 지시 — 없으면 만든다 */
  sendToBot(bot, text, sessionId, name, from, opts = {}) {
    let r = sessionId ? this.sessions.get(sessionId) : void 0;
    if (!r) {
      const list = this.sessions.list(bot.id);
      if (!name && list.length && !from) r = this.sessions.get(list[0].id);
      if (!r) {
        if (this.sessions.liveCountFor(bot.id) >= 4) throw new Error(`${bot.name} \uC740 \uC774\uBBF8 \uC138\uC158 4\uAC1C\uAC00 \uB3CC\uACE0 \uC788\uC5B4\uC694. \uD558\uB098 \uB05D\uB098\uBA74 \uC774\uC5B4\uC11C \uD558\uC138\uC694.`);
        if (this.sessions.liveCount() >= 12) throw new Error("\uD638\uC2A4\uD2B8 \uC138\uC158 \uC0C1\uD55C(12)\uC5D0 \uB2FF\uC558\uC5B4\uC694.");
        r = this.sessions.create(bot, name ?? (from ? `\uC704\uC784 \xB7 ${(/* @__PURE__ */ new Date()).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : "\uBA54\uC778"), opts);
      }
    }
    if (this.auth.verdict === "unreadable" || this.auth.verdict === "loggedout") {
      this.queued.push({ botId: bot.id, sessionId: r.id, text });
      this.sessions.get(r.id).items.push({ id: `q${Date.now()}`, t: Date.now(), kind: "system", text: "\uBBF8\uB2C8\uC758 Claude \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD574 \uB300\uAE30\uC5F4\uC5D0 \uB480\uC5B4\uC694. \uBCF5\uAD6C\uB418\uBA74 \uC774\uC5B4\uC11C \uBCF4\uB0C5\uB2C8\uB2E4." });
      this.broadcast({ ev: "chat", sessionId: r.id, item: r.items[r.items.length - 1] });
      return r.id;
    }
    this.sessions.send(r, bot, text, opts.client);
    return r.id;
  }
  runRoutine(bot, r) {
    this.log(`\uB8E8\uD2F4 \uC2E4\uD589: ${bot.name} \xB7 ${r.name}`);
    const s2 = this.sessions.create(bot, `\uB8E8\uD2F4 \xB7 ${r.name}`, { permissionMode: approveToMode(r.approve), routine: r.name });
    this.sessions.send(s2, bot, `${r.prompt}

(\uC774\uAC74 \uC608\uC57D\uB41C \uB8E8\uD2F4 "${r.name}" \uC774\uC57C. \uC0AC\uB78C\uC774 \uC5C6\uC744 \uC218 \uC788\uC73C\uB2C8 ${r.approve === "always" ? "" : r.approve === "folder" ? "\uC774 \uD3F4\uB354 \uC548 \uD30C\uC77C\uB9CC \uACE0\uCE58\uACE0 " : "\uD30C\uC77C\uC744 \uACE0\uCE58\uC9C0 \uB9D0\uACE0 \uC81C\uC548\uB9CC \uD558\uACE0 "}\uACB0\uACFC\uB97C \uC9E7\uAC8C \uC694\uC57D\uD574.)`);
  }
  /** 메인(호스트) 이름 — 설정값이 없으면 맥의 컴퓨터 이름(시스템 설정 › 일반 › 정보), 그것도 없으면 hostname */
  computerName = "";
  hostName() {
    if (this.cfg.hostName?.trim()) return this.cfg.hostName.trim();
    if (!this.computerName) {
      try {
        this.computerName = process.platform === "darwin" ? execFileSync4("/usr/sbin/scutil", ["--get", "ComputerName"], { timeout: 2e3 }).toString().trim() : "";
      } catch {
      }
      if (!this.computerName) this.computerName = hostname().replace(/\.local$/, "") || "Host";
    }
    return this.computerName;
  }
  /** 볼트 루트 저장 — 되세우기는 `onRoot` 를 가진 쪽 몫이다 */
  setRoot(root) {
    const abs = canon(resolve4(root));
    this.cfg.root = abs;
    saveConfig(this.cfg);
    this.log(`\uBCFC\uD2B8 \uB8E8\uD2B8: ${abs}`);
    return abs;
  }
  setNames(o) {
    if (o.hostName !== void 0) this.cfg.hostName = o.hostName.trim() || void 0;
    if (o.deviceId && o.deviceName !== void 0) {
      const d = this.cfg.devices.find((x2) => x2.id === o.deviceId);
      if (d && o.deviceName.trim()) d.name = o.deviceName.trim().slice(0, 40);
    }
    saveConfig(this.cfg);
  }
  /** 설정 → 세션 매니저. ⚠ 벤더마다 따로 — 섞으면 Codex 세션이 Claude 모델로 떠서 죽는다 */
  applyDefaults(cfg = this.cfg) {
    this.sessions.defaults = {
      claude: { model: cfg.defaultModel, effort: cfg.defaultEffort },
      codex: { model: cfg.defaultCodexModel, effort: cfg.defaultCodexEffort }
    };
    this.sessions.codexSandbox = cfg.codexSandbox ?? "read-only";
    this.sessions.openaiApiKey = cfg.openaiApiKey;
    this.sessions.defaultPermissionMode = cfg.defaultPermissionMode && cfg.defaultPermissionMode !== "default" ? cfg.defaultPermissionMode : void 0;
    const idle = cfg.idleMinutes === void 0 ? 60 : cfg.idleMinutes;
    this.sessions.idleTtlMs = idle > 0 ? idle * 60 * 1e3 : Number.POSITIVE_INFINITY;
  }
  setIdle(minutes) {
    this.cfg.idleMinutes = Math.max(0, Math.round(minutes));
    this.applyDefaults();
    saveConfig(this.cfg);
  }
  /** 기본 모델·생각 레벨 — 저장하면 다음 세션부터. `agent` 로 어느 CLI 것인지 가른다 */
  setDefaults(model, effort, agent = "claude", permissionMode) {
    if (agent === "codex") {
      this.cfg.defaultCodexModel = model || void 0;
      this.cfg.defaultCodexEffort = effort || void 0;
    } else {
      this.cfg.defaultModel = model || void 0;
      this.cfg.defaultEffort = effort || void 0;
      if (permissionMode !== void 0) this.cfg.defaultPermissionMode = PERM_MODES.includes(permissionMode) && permissionMode !== "default" ? permissionMode : void 0;
    }
    this.applyDefaults();
    saveConfig(this.cfg);
  }
  /** 조용한 시간 — `HH:MM` 둘. 종전엔 설정에 있으면서 화면이 고칠 길이 없었다(2026-09-17) */
  setQuiet(from, to) {
    const ok = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
    if (!ok(from) || !ok(to)) throw new Error("\uC2DC\uAC04\uC740 HH:MM \uC774\uC5B4\uC57C \uD574\uC694");
    this.cfg.quiet = { from, to };
    saveConfig(this.cfg);
  }
  /** Codex 설정 — 샌드박스(= 권한 정책)와 API 키 */
  setCodex(o) {
    if (o.sandbox === "read-only" || o.sandbox === "workspace-write" || o.sandbox === "danger-full-access") this.cfg.codexSandbox = o.sandbox;
    if (o.apiKey !== void 0) this.cfg.openaiApiKey = o.apiKey.trim() || void 0;
    this.applyDefaults();
    saveConfig(this.cfg);
  }
  setToken(token) {
    this.cfg.claudeOauthToken = token.trim() || void 0;
    setOauthToken(this.cfg.claudeOauthToken);
    saveConfig(this.cfg);
    void this.refreshAuth();
  }
  async refreshAuth(fromFailure = false) {
    const prev = this.auth.verdict;
    this.auth = await checkAuth(this.cfg.claudeBin);
    if (fromFailure && this.auth.verdict === "loggedin") this.auth = { ...this.auth, verdict: "unreadable", reason: "\uC138\uC158 \uD504\uB85C\uC138\uC2A4\uAC00 \uC790\uACA9\uC99D\uBA85\uC744 \uBABB \uC77D\uC5C8\uC5B4\uC694" };
    setKeychainLogin(!!this.auth.keychain);
    this.auth.mode = this.cfg.claudeOauthToken && !this.auth.keychain ? "token" : "login";
    this.broadcast({ ev: "auth", auth: this.auth });
    if (this.auth.verdict === "unreadable" && prev !== "unreadable") this.notifier.emit("error", ORCH_ID, `${this.hostName()} \uC5D0\uC11C Claude \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD574\uC694`, "\uD638\uC2A4\uD2B8 \uB9E5\uC5D0\uC11C \uD130\uBBF8\uB110 \u2192 claude \u2192 /login. \uB300\uAE30 \uC911\uC778 \uC9C0\uC2DC\uB294 \uBCF5\uAD6C\uB418\uBA74 \uC774\uC5B4\uC11C \uD574\uC694.");
    if (this.auth.verdict === "loggedout" && prev !== "loggedout") this.notifier.emit("error", ORCH_ID, "Claude \uAC00 \uB85C\uADF8\uC544\uC6C3\uB410\uC5B4\uC694", `${this.hostName()} \uC5D0\uC11C claude \u2192 /login \uC744 \uD574 \uC8FC\uC138\uC694.`);
    if (this.auth.verdict === "loggedin" && this.queued.length) {
      const q = this.queued;
      this.queued = [];
      for (const it of q) {
        const b2 = this.registry.bot(it.botId);
        const r = this.sessions.get(it.sessionId);
        if (b2 && r) this.sessions.send(r, b2, it.text);
      }
    }
    return this.auth;
  }
  lastInbox = -1;
  watchInbox() {
    const n = this.registry.inboxItems().length;
    if (n !== this.lastInbox) {
      this.lastInbox = n;
      this.broadcast({ ev: "inbox", count: n });
    }
  }
  todoAdd(bot, title, desc, by, notify = false, section = "") {
    const items = todoAdd(bot.abs, title, desc, by, section);
    this.broadcast({ ev: "todo", botId: bot.id, items });
    if (notify && by === "bot") this.notifier.emit("todo", bot.id, `${bot.name} \xB7 \uD560 \uC77C \uB0A8\uAE40`, `${title}${desc ? `: ${desc}` : ""}`);
  }
  todo(bot) {
    return readTodo(bot.abs);
  }
  tree(dir3, depth) {
    const base = join10(this.registry.root, dir3 || "");
    if (!existsSync10(base)) throw new Error("\uC5C6\uB294 \uD3F4\uB354");
    return tree(base, depth).map(function flat(n) {
      return { path: n.rel + (n.dir ? "/" : ""), children: n.children?.map(flat) };
    });
  }
  search(query, limit) {
    const q = query.toLowerCase();
    const out = [];
    const walk = (dir3, d) => {
      let names = [];
      try {
        names = readdirSync6(dir3);
      } catch {
        return;
      }
      for (const name of names) {
        if (name.startsWith(".") || name === "node_modules") continue;
        const abs = join10(dir3, name);
        let st;
        try {
          st = statSync6(abs);
        } catch {
          continue;
        }
        const rel = relative3(this.registry.root, abs);
        if (rel.toLowerCase().includes(q)) out.push({ rel: rel + (st.isDirectory() ? "/" : ""), m: st.mtimeMs });
        if (st.isDirectory() && d > 0 && out.length < limit * 5) walk(abs, d - 1);
      }
    };
    walk(this.registry.root, 4);
    return out.sort((a, b2) => b2.m - a.m).slice(0, limit).map((x2) => x2.rel);
  }
  recentFiles(bot, limit = 12) {
    return recent(bot.abs, limit);
  }
  shutdown() {
    this.sessions.stopAll();
    this.watcher.close();
  }
};
function summarize(req) {
  const i = req.input;
  const s2 = (k2) => typeof i[k2] === "string" ? i[k2] : "";
  return (s2("command") || s2("file_path") || s2("path") || s2("url") || s2("description") || JSON.stringify(i)).slice(0, 120);
}

// src/host/gateway.ts
import { createServer } from "node:http";
import { execFile as execFile4 } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cpSync, existsSync as existsSync17, mkdirSync as mkdirSync7, readFileSync as readFileSync13, readdirSync as readdirSync8, statSync as statSync8, writeFileSync as writeFileSync7 } from "node:fs";
import { basename as basename4, dirname as dirname4, join as join16, extname as extname2, normalize as normalize2, relative as relative5, resolve as resolve6, sep as sep3 } from "node:path";
import { homedir as homedir8 } from "node:os";
import { spawn as spawn3 } from "node:child_process";

// src/host/tailnet.ts
import { execFile as execFile3 } from "node:child_process";
import { existsSync as existsSync11 } from "node:fs";
import { networkInterfaces } from "node:os";
var CGNAT = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
function bindAddresses() {
  const out = ["127.0.0.1"];
  for (const list of Object.values(networkInterfaces())) for (const ni of list ?? []) if (ni.family === "IPv4" && !ni.internal && CGNAT.test(ni.address)) out.push(ni.address);
  if (process.env.FOLDERBOT_BIND_ALL) out.push("0.0.0.0");
  return out;
}
function tailnetInfo() {
  const bin = ["/usr/local/bin/tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/opt/homebrew/bin/tailscale"].find((p2) => existsSync11(p2));
  if (!bin) return Promise.resolve({ state: "absent" });
  return new Promise((resolve8) => {
    execFile3(bin, ["status", "--json"], { timeout: 8e3 }, (err, stdout) => {
      if (err) return resolve8({ state: "unknown" });
      try {
        const j = JSON.parse(stdout);
        const st = j.BackendState;
        const state = st === "Running" ? "running" : st === "NeedsLogin" ? "needs-login" : st === "Stopped" ? "stopped" : "unknown";
        resolve8({ state, ip: j.Self?.TailscaleIPs?.[0], dnsName: j.Self?.DNSName?.replace(/\.$/, ""), version: j.Version });
      } catch {
        resolve8({ state: "unknown" });
      }
    });
  });
}

// src/host/mcp.ts
import { isAbsolute, join as join11, relative as relative4, resolve as resolve5 } from "node:path";
import { existsSync as existsSync12 } from "node:fs";

// src/core/paths.ts
function relUnder(base, p2) {
  const b2 = base.replace(/\/+$/, "").normalize("NFC");
  const q = p2.normalize("NFC");
  if (q === b2) return "";
  if (q.startsWith(b2 + "/")) return q.slice(b2.length + 1);
  return null;
}

// src/host/mcp.ts
var obj = (props, required = []) => ({ type: "object", properties: props, required });
var COMMON = [
  { name: "bots_list", description: "\uD65C\uC131 \uBD07 \uBAA9\uB85D\uACFC \uC0C1\uD0DC(\uC138\uC158 \uC218\xB7\uD655\uC778 \uB300\uAE30)\uB97C \uB3CC\uB824\uC900\uB2E4.", inputSchema: obj({}) },
  { name: "bot_status", description: "\uBD07 \uD558\uB098\uC758 \uC138\uC158 \uBAA9\uB85D\xB7\uC0C1\uD0DC\xB7\uB9C8\uC9C0\uB9C9 \uD65C\uB3D9.", inputSchema: obj({ bot: { type: "string", description: "\uBD07 \uC774\uB984 \uB610\uB294 id" } }, ["bot"]) },
  { name: "bot_sessions", description: "\uBD07\uC758 \uC138\uC158 \uD558\uB098\uC758 \uCD5C\uADFC \uB300\uD654(\uC694\uC57D)\uB97C \uC77D\uB294\uB2E4.", inputSchema: obj({ bot: { type: "string" }, session: { type: "string", description: "\uC138\uC158 \uC774\uB984 \uB610\uB294 id (\uC0DD\uB7B5 \uC2DC \uCD5C\uADFC)" }, limit: { type: "number" } }, ["bot"]) },
  { name: "vault_tree", description: "\uB8E8\uD2B8 \uD3F4\uB354 \uAD6C\uC870. dir(\uC0C1\uB300 \uACBD\uB85C)\xB7depth.", inputSchema: obj({ dir: { type: "string" }, depth: { type: "number" } }) },
  { name: "vault_search", description: "\uD30C\uC77C\xB7\uD3F4\uB354 \uC774\uB984 \uBD80\uBD84\uC77C\uCE58 \uAC80\uC0C9 (\uCD5C\uADFC \uC218\uC815\uC21C).", inputSchema: obj({ query: { type: "string" }, limit: { type: "number" } }, ["query"]) },
  { name: "rules_get", description: "\uD3F4\uB354 \uADDC\uCE59(\uC5ED\uD560\xB7naming\xB7\uD558\uB124\uC2A4 \uD310\uC815)\uC744 \uB3CC\uB824\uC900\uB2E4.", inputSchema: obj({}) },
  // 문서 창 (C · 2026-09-19) — 사용자가 보고 있는 화면의 문서 창에 연다 / 그 기기의 Finder 로 보여 준다. ⚠ 한 턴에 한 번만 먹는다(화면이 억제)
  { name: "rondo_open", description: "\uC0AC\uC6A9\uC790 \uD654\uBA74\uC758 \uBB38\uC11C \uCC3D\uC5D0 \uD30C\uC77C\uC744 \uC5F0\uB2E4(pdf\xB7\uC774\uBBF8\uC9C0\xB7md). path \uB294 \uC774 \uBD07 \uD3F4\uB354 \uAE30\uC900 \uC0C1\uB300 \uACBD\uB85C \uB610\uB294 \uBCFC\uD2B8 \uC548 \uC808\uB300 \uACBD\uB85C. \uD55C \uD134\uC5D0 \uD55C \uBC88\uB9CC \uC5F4\uB9B0\uB2E4.", inputSchema: obj({ path: { type: "string" } }, ["path"]) },
  { name: "rondo_reveal", description: "\uC0AC\uC6A9\uC790\uAC00 \uBCF4\uACE0 \uC788\uB294 \uAE30\uAE30\uC758 Finder \uC5D0\uC11C \uD30C\uC77C \uC704\uCE58\uB97C \uBCF4\uC5EC \uC900\uB2E4(\uD638\uC2A4\uD2B8\uAC00 \uC544\uB2C8\uB77C \uADF8 \uAE30\uAE30). path \uB294 \uBD07 \uD3F4\uB354 \uAE30\uC900 \uC0C1\uB300 \uACBD\uB85C \uB610\uB294 \uBCFC\uD2B8 \uC548 \uC808\uB300 \uACBD\uB85C.", inputSchema: obj({ path: { type: "string" } }, ["path"]) },
  { name: "todo_add", description: "\uC774 \uBD07 \uD3F4\uB354\uC758 todo.md \uC5D0 \uD56D\uBAA9\uC744 \uCD94\uAC00\uD55C\uB2E4. \uBD07\uC774 \uC801\uC740 \uC904\uB85C \uD45C\uC2DC\uB41C\uB2E4.", inputSchema: obj({ title: { type: "string" }, desc: { type: "string" }, for_user: { type: "boolean", description: "\uC0AC\uC6A9\uC790\uAC00 \uD560 \uC77C\uC774\uBA74 true (\uC54C\uB9BC\uC774 \uAC04\uB2E4)" } }, ["title"]) }
];
var ORCH = [
  { name: "bots_candidates", description: "\uBD07 \uD6C4\uBCF4 \uD3F4\uB354(\uADDC\uCE59\uC758 active \uAE00\uB86D\uC5D0 \uB9DE\uB294 \uD3F4\uB354)\uB97C \uCD5C\uADFC \uC218\uC815\uC21C\uC73C\uB85C. \uD558\uB124\uC2A4 \uC720\uBB34\xB7\uD65C\uC131 \uC5EC\uBD80 \uD3EC\uD568.", inputSchema: obj({}) },
  { name: "bot_start", description: "\uD3F4\uB354\uC5D0\uC11C \uBD07\uC744 \uC2DC\uC791\uD55C\uB2E4. \uD558\uB124\uC2A4\uAC00 \uC5C6\uC73C\uBA74 \uAE54\uC544 \uC900\uB2E4. rel \uC740 \uB8E8\uD2B8 \uAE30\uC900 \uC0C1\uB300 \uACBD\uB85C.", inputSchema: obj({ rel: { type: "string" } }, ["rel"]) },
  { name: "bot_stop", description: "\uBD07\uC744 \uC815\uC9C0(\uD734\uBA74)\uD55C\uB2E4. \uAE30\uB85D\uC740 \uB0A8\uB294\uB2E4.", inputSchema: obj({ bot: { type: "string" } }, ["bot"]) },
  { name: "bots_reorder", description: "\uB808\uC77C(\uD3F4\uB354 \uBAA9\uB85D)\uC758 \uBD07 \uC21C\uC11C\uB97C \uC815\uD55C\uB2E4. order \uB294 \uC704\uC5D0\uC11C\uBD80\uD130 \uB193\uC744 rel \uBAA9\uB85D \u2014 \uC548 \uC900 \uBD07\uC740 \uAE30\uC874 \uCC28\uB840\uB85C \uB4A4\uC5D0 \uBD99\uB294\uB2E4. \uBAA8\uB974\uB294 rel \uC774 \uD558\uB098\uB77C\uB3C4 \uC788\uC73C\uBA74 \uC2E4\uD328\uD558\uACE0 \uC21C\uC11C\uB294 \uADF8\uB300\uB85C\uB2E4. \uC0AC\uB78C\uC774 \uB04C\uC5B4 \uB193\uC740 \uBD07(bots_list \uC758 orderedBy=user)\uC740 \uC790\uB9AC\uB97C \uC9C0\uD0A8\uB2E4. restore:true \uB294 \uCC98\uC74C \uC21C\uC11C\uB85C \uB418\uB3CC\uB9B0\uB2E4.", inputSchema: obj({ order: { type: "array", items: { type: "string" }, description: "\uB8E8\uD2B8 \uAE30\uC900 \uC0C1\uB300 \uACBD\uB85C(rel) \uBAA9\uB85D, \uC704\uC5D0\uC11C\uBD80\uD130" }, restore: { type: "boolean", description: "\uCC98\uC74C \uC21C\uC11C\uB85C \uB418\uB3CC\uB9AC\uAE30" } }) },
  { name: "bot_retire", description: "\uBD07 \uD3F4\uB354\uB97C archive \uB85C \uC62E\uAE30\uACE0 \uC740\uD1F4\uC2DC\uD0A8\uB2E4. \u26A0 \uC0AC\uB78C\uC758 \uC2B9\uC778 \uB4A4\uC5D0\uB9CC.", inputSchema: obj({ bot: { type: "string" } }, ["bot"]) },
  { name: "folder_create", description: "\uD65C\uC131 \uBC94\uC8FC(section)\uC5D0 \uC0C8 \uD3F4\uB354\uB97C \uB9CC\uB4E4\uACE0 \uD558\uB124\uC2A4\uB97C \uAE50\uB2E4. naming \uADDC\uCE59 \uC801\uC6A9. \u26A0 \uC0AC\uB78C\uC758 \uC2B9\uC778 \uB4A4\uC5D0\uB9CC.", inputSchema: obj({ section: { type: "string", description: '\uC608: "2. Projects"' }, name: { type: "string" }, start: { type: "boolean", description: "\uB9CC\uB4E0 \uB4A4 \uBD07\uB3C4 \uC2DC\uC791" } }, ["section", "name"]) },
  { name: "bot_send", description: "\uBD07\uC5D0\uAC8C \uC9C0\uC2DC\uB97C \uBCF4\uB0B8\uB2E4 \u2014 \uC0C8 \uC138\uC158\uC744 \uB9CC\uB4E4\uAC70\uB098(session \uC0DD\uB7B5) \uAE30\uC874 \uC138\uC158\uC5D0 \uC774\uC5B4 \uBCF4\uB0B8\uB2E4. \uACB0\uACFC\uB294 bot_sessions \uB85C \uBCF8\uB2E4.", inputSchema: obj({ bot: { type: "string" }, text: { type: "string" }, session: { type: "string" }, name: { type: "string", description: "\uC0C8 \uC138\uC158 \uC774\uB984" } }, ["bot", "text"]) },
  { name: "inbox_list", description: "inbox \uC5ED\uD560 \uD3F4\uB354\uC758 \uD56D\uBAA9(\uD3F4\uB354\xB7\uD30C\uC77C)\uC744 \uB098\uC5F4\uD55C\uB2E4.", inputSchema: obj({}) },
  { name: "folder_move", description: "\uB8E8\uD2B8 \uC548\uC5D0\uC11C \uD3F4\uB354\xB7\uD30C\uC77C\uC744 \uC62E\uAE34\uB2E4(\uB418\uB3CC\uB9AC\uAE30 \uC2A4\uB0C5\uC0F7 \uB0A8\uAE40). \u26A0 \uC0AC\uB78C\uC758 \uC2B9\uC778 \uB4A4\uC5D0\uB9CC.", inputSchema: obj({ from: { type: "string" }, to: { type: "string" } }, ["from", "to"]) }
];
function mcpTools(botId) {
  return botId === ORCH_ID ? [...COMMON, ...ORCH] : COMMON;
}
async function handleMcp(host, botId, req, res, body, sid = "") {
  let msg;
  try {
    msg = JSON.parse(body);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const reply = (result) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
  };
  const error = (code, message) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code, message } }));
  };
  if (msg.method === "initialize") return reply({ protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "folderbot", version: host.version } });
  if (msg.method === "notifications/initialized" || msg.method === "ping") {
    res.writeHead(msg.id === void 0 ? 202 : 200, { "content-type": "application/json" });
    res.end(msg.id === void 0 ? "" : JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: {} }));
    return;
  }
  if (msg.method === "tools/list") return reply({ tools: mcpTools(botId) });
  if (msg.method === "tools/call") {
    const name = String(msg.params?.name ?? "");
    const args = msg.params?.arguments ?? {};
    if (!mcpTools(botId).some((t) => t.name === name)) return error(-32601, `\uC774 \uBD07\uC740 ${name} \uC744 \uC4F8 \uC218 \uC5C6\uC5B4\uC694`);
    try {
      const out = await callTool(host, botId, name, args, sid);
      return reply({ content: [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out, null, 1) }] });
    } catch (e) {
      return reply({ content: [{ type: "text", text: `\uC624\uB958: ${e.message}` }], isError: true });
    }
  }
  return error(-32601, "method not found");
}
async function callTool(host, botId, name, a, sid = "") {
  const reg = host.registry;
  const s2 = (k2) => typeof a[k2] === "string" ? a[k2] : "";
  const findBot = (q) => reg.bots().find((b2) => b2.id === q || b2.name === q || b2.rel === q || b2.name.toLowerCase() === q.toLowerCase());
  switch (name) {
    case "bots_list":
      return reg.bots().map((b2, i) => {
        const ss = host.sessions.list(b2.id);
        return { id: b2.id, name: b2.name, displayName: b2.displayName, rel: b2.rel, ...b2.orchestrator ? {} : { order: i - 1, orderedBy: b2.orderedBy ?? null }, sessions: ss.length, awaiting: ss.filter((x2) => x2.state === "awaiting_input").length, running: ss.filter((x2) => x2.state === "running").length, lastActivity: ss[0]?.lastActivity ?? null };
      });
    case "bots_candidates":
      return reg.candidates().map((c) => ({ rel: c.rel, section: c.section, harness: c.harness, active: c.active, modified: new Date(c.mtime).toISOString() }));
    case "bot_status": {
      const b2 = findBot(s2("bot"));
      if (!b2) throw new Error("\uADF8\uB7F0 \uBD07\uC774 \uC5C6\uC5B4\uC694");
      return host.sessions.list(b2.id).map((x2) => ({ id: x2.id, name: x2.name, state: x2.state, lastActivity: new Date(x2.lastActivity).toISOString(), pending: x2.pending.map((p2) => p2.displayName) }));
    }
    case "bot_sessions": {
      const b2 = findBot(s2("bot"));
      if (!b2) throw new Error("\uADF8\uB7F0 \uBD07\uC774 \uC5C6\uC5B4\uC694");
      const list = host.sessions.list(b2.id);
      const sess = s2("session") ? list.find((x2) => x2.id === s2("session") || x2.name === s2("session")) : list[0];
      if (!sess) return "\uC138\uC158\uC774 \uC5C6\uC5B4\uC694";
      const items = host.sessions.items(sess.id).slice(-(Number(a.limit) || 30));
      return items.map((it) => it.kind === "user" ? `[\uC0AC\uC6A9\uC790] ${it.text}` : it.kind === "assistant" ? `[\uBD07] ${it.text}` : it.kind === "tool" ? `[\uB3C4\uAD6C] ${it.name} ${it.summary}` : it.kind === "result" ? `[\uD134 \uB05D] ${it.ok ? "ok" : "\uC624\uB958 " + (it.error ?? "")}` : it.kind === "system" ? `[\uC2DC\uC2A4\uD15C] ${it.text}` : "").filter(Boolean).join("\n");
    }
    case "bot_start": {
      const b2 = reg.start(s2("rel"));
      host.afterBotsChanged();
      return `\uC2DC\uC791\uD588\uC5B4\uC694: ${b2.name} (${b2.rel})`;
    }
    case "bots_reorder": {
      const order = Array.isArray(a.order) ? a.order.map(String) : [];
      const restore = a.restore === true;
      if (!restore && !order.length) throw new Error("order \uC5D0 rel \uC744 \uD558\uB098 \uC774\uC0C1 \uC8FC\uAC70\uB098 restore:true \uB85C \uBD80\uB974\uC138\uC694");
      reg.reorderByAgent(order, restore);
      const now = reg.bots().filter((b2) => !b2.orchestrator);
      return `${restore ? "\uCC98\uC74C \uC21C\uC11C\uB85C \uB418\uB3CC\uB9BC" : "\uC21C\uC11C \uBC14\uAFC8"}: ${now.map((b2, i) => `${i + 1}. ${b2.rel}${b2.orderedBy === "user" ? " (\uC0AC\uB78C\uC774 \uC815\uD55C \uC790\uB9AC)" : ""}`).join(" \xB7 ")}`;
    }
    case "bot_stop": {
      const b2 = findBot(s2("bot"));
      if (!b2 || b2.orchestrator) throw new Error("\uC815\uC9C0\uD560 \uC218 \uC5C6\uB294 \uBD07");
      reg.stop(b2.id);
      host.afterBotsChanged();
      return `\uC815\uC9C0: ${b2.name}`;
    }
    case "bot_retire": {
      const b2 = findBot(s2("bot"));
      if (!b2) throw new Error("\uADF8\uB7F0 \uBD07\uC774 \uC5C6\uC5B4\uC694");
      const to = reg.retire(b2.id);
      host.afterBotsChanged();
      return `\uC740\uD1F4 \xB7 ${to} \uB85C \uC62E\uACBC\uC5B4\uC694`;
    }
    case "folder_create": {
      const rel = reg.createFolder(s2("section"), s2("name"));
      let msg = `\uB9CC\uB4E4\uC5C8\uC5B4\uC694: ${rel} (\uD558\uB124\uC2A4 \uC124\uCE58\uB428)`;
      if (a.start) {
        const b2 = reg.start(rel);
        host.afterBotsChanged();
        msg += ` \xB7 \uBD07 \uC2DC\uC791: ${b2.name}`;
      }
      return msg;
    }
    case "bot_send": {
      const b2 = findBot(s2("bot"));
      if (!b2) throw new Error("\uADF8\uB7F0 \uBD07\uC774 \uC5C6\uC5B4\uC694");
      const sid2 = host.sendToBot(b2, s2("text"), s2("session") || void 0, s2("name") || void 0, botId);
      return `\uBCF4\uB0C8\uC5B4\uC694 \xB7 \uC138\uC158 ${sid2}`;
    }
    case "inbox_list":
      return reg.inboxItems().map((i) => ({ rel: i.rel, dir: i.dir, modified: new Date(i.mtime).toISOString() }));
    case "folder_move": {
      reg.move(s2("from"), s2("to"));
      host.afterBotsChanged();
      return `\uC62E\uACBC\uC5B4\uC694: ${s2("from")} \u2192 ${s2("to")} (\uB418\uB3CC\uB9AC\uAE30 \uAC00\uB2A5)`;
    }
    case "vault_tree":
      return host.tree(s2("dir"), Number(a.depth) || 2);
    case "vault_search":
      return host.search(s2("query"), Number(a.limit) || 40);
    case "rules_get":
      return reg.rules;
    case "rondo_open":
    case "rondo_reveal": {
      const b2 = reg.bot(botId);
      if (!b2) throw new Error("\uBD07\uC744 \uBABB \uCC3E\uC558\uC5B4\uC694");
      const raw = s2("path");
      if (!raw) throw new Error("path \uAC00 \uBE44\uC5C8\uC5B4\uC694");
      const abs = resolve5(isAbsolute(raw) ? raw : join11(b2.abs, raw));
      if (relUnder(reg.root, abs) === null && !(b2.repo && relUnder(b2.repo, abs) !== null)) throw new Error("\uBCFC\uD2B8 \uBC16 \uACBD\uB85C\uC608\uC694 \u2014 \uBB38\uC11C \uCC3D\uC740 \uBCFC\uD2B8 \uC548 \uD30C\uC77C\uB9CC \uC5F4\uC5B4\uC694");
      if (!existsSync12(abs)) throw new Error(`\uC5C6\uB294 \uD30C\uC77C: ${raw}`);
      const rel = relative4(b2.abs, abs);
      const turn = host.sessions.get(sid)?.turnStartedAt ?? 0;
      host.broadcast({ ev: "doc", botId: b2.id, sid, rel, action: name === "rondo_open" ? "open" : "reveal", turn, device: host.sessions.get(sid)?.lastClient?.device });
      return name === "rondo_open" ? `\uBB38\uC11C \uCC3D\uC5D0 \uC5F4\uC5C8\uC5B4\uC694: ${rel}` : `\uAE30\uAE30\uC758 Finder \uB85C \uBCF4\uC5EC \uB4DC\uB838\uC5B4\uC694: ${rel}`;
    }
    case "todo_add": {
      const b2 = reg.bot(botId);
      if (!b2) throw new Error("\uBD07\uC744 \uBABB \uCC3E\uC558\uC5B4\uC694");
      host.todoAdd(b2, s2("title"), s2("desc"), "bot", !!a.for_user);
      return "\uCD94\uAC00\uD588\uC5B4\uC694";
    }
  }
  throw new Error("unknown tool");
}

// src/core/rootPath.ts
function normalizeRootInput(raw, home) {
  let s2 = (raw ?? "").trim();
  if (!s2) return null;
  if (s2.startsWith('"') && s2.endsWith('"') || s2.startsWith("'") && s2.endsWith("'")) s2 = s2.slice(1, -1).trim();
  if (s2.startsWith("file://")) {
    try {
      s2 = decodeURIComponent(s2.slice("file://".length));
    } catch {
      return null;
    }
  }
  s2 = s2.replace(/\\ /g, " ").trim();
  if (s2 === "~") s2 = home;
  else if (s2.startsWith("~/")) s2 = home + s2.slice(1);
  if (!s2.startsWith("/")) return null;
  s2 = s2.replace(/\/+$/, "");
  return s2 || "/";
}

// src/core/search.ts
var norm = (s2) => s2.normalize("NFC").toLowerCase();

// src/core/convSearch.ts
function snippetAround(text, at, len, pad = 40) {
  const s2 = Math.max(0, at - pad);
  const e = Math.min(text.length, at + len + pad);
  return `${s2 > 0 ? "\u2026" : ""}${text.slice(s2, e).replace(/\s+/g, " ")}${e < text.length ? "\u2026" : ""}`;
}
function searchConversations(q, sessions, limit = 20) {
  const nq = norm(q.trim());
  if (nq.length < 2) return [];
  const hits = [];
  for (const s2 of sessions) {
    const nn = norm(s2.name);
    const ni = nn.indexOf(nq);
    if (ni >= 0) {
      hits.push({ sessionId: s2.id, botId: s2.botId, name: s2.name, snippet: "", t: s2.lastActivity, where: "name", score: 2 });
      continue;
    }
    for (let i = s2.items.length - 1; i >= 0; i--) {
      const it = s2.items[i];
      if (it.kind !== "user" && it.kind !== "assistant" || !it.text) continue;
      const nt = norm(it.text);
      const j = nt.indexOf(nq);
      if (j < 0) continue;
      hits.push({ sessionId: s2.id, botId: s2.botId, name: s2.name, snippet: snippetAround(it.text.normalize("NFC"), j, nq.length), t: s2.lastActivity, where: "text", score: 1 });
      break;
    }
  }
  hits.sort((a, b2) => b2.score - a.score || b2.t - a.t);
  return hits.slice(0, limit).map(({ score: _s, ...h }) => h);
}

// src/host/favicon.ts
import { existsSync as existsSync13, mkdirSync as mkdirSync5, readFileSync as readFileSync9, writeFileSync as writeFileSync4 } from "node:fs";
import { join as join12 } from "node:path";

// src/core/favicon.ts
function faviconHost(url) {
  const s2 = url.trim();
  if (!/^https?:\/\//i.test(s2)) return null;
  let host;
  try {
    host = new URL(s2).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host || !/^[a-z0-9.-]+$/.test(host)) return null;
  if (host.startsWith(".") || host.endsWith(".") || host.includes("..")) return null;
  return host;
}
function parentHost(host) {
  const parts = host.split(".");
  if (parts.length <= 2) return null;
  const next = parts.slice(1).join(".");
  return next.split(".").length < 2 ? null : next;
}
function parseIconLinks(html) {
  const out = [];
  const tagRe = /<link\b[^>]*>/gi;
  for (let m2 = tagRe.exec(html); m2; m2 = tagRe.exec(html)) {
    const tag = m2[0];
    const rel = (attr2(tag, "rel") ?? "").toLowerCase();
    if (!/\bicon\b/.test(rel)) continue;
    const href = attr2(tag, "href");
    if (!href) continue;
    out.push({ href, rel, sizes: (attr2(tag, "sizes") ?? "").toLowerCase(), type: (attr2(tag, "type") ?? "").toLowerCase() });
  }
  return out;
}
function attr2(tag, name) {
  const m2 = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(tag);
  return m2 ? (m2[2] ?? m2[3] ?? m2[4] ?? "").trim() : null;
}
function bestIcon(links) {
  const ok = links.filter((l) => !/\bmask-icon\b/.test(l.rel));
  if (!ok.length) return null;
  const px = (l) => {
    const m2 = /(\d+)x(\d+)/.exec(l.sizes);
    return m2 ? Number(m2[1]) : /\bapple-touch-icon\b/.test(l.rel) ? 180 : 0;
  };
  const big = ok.filter((l) => px(l) >= 32).sort((a, b2) => px(a) - px(b2));
  if (big.length) return big[0].href;
  return ok.slice().sort((a, b2) => px(b2) - px(a))[0].href;
}

// src/host/favicon.ts
var MAX = 64 * 1024;
var TIMEOUT = 4e3;
var mem = /* @__PURE__ */ new Map();
var dir = () => ensureDir(join12(dataDir(), "favicons"));
async function get(url, accept) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), TIMEOUT);
    const r = await fetch(url, { signal: c.signal, redirect: "follow", headers: { accept, "user-agent": "FolderBot/1.0" } });
    clearTimeout(t);
    return r.ok ? r : null;
  } catch {
    return null;
  }
}
async function asDataUrl(r) {
  const type = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/")) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length || buf.length > MAX) return null;
  return `data:${type};base64,${buf.toString("base64")}`;
}
async function fetchFor(host) {
  const ico = await get(`https://${host}/favicon.ico`, "image/*");
  if (ico) {
    const d = await asDataUrl(ico);
    if (d) return d;
  }
  const page = await get(`https://${host}/`, "text/html");
  if (page) {
    const html = (await page.text()).slice(0, 2e5);
    const href = bestIcon(parseIconLinks(html));
    if (href) {
      let abs;
      try {
        abs = new URL(href, page.url || `https://${host}/`).toString();
      } catch {
        abs = "";
      }
      if (abs) {
        const r = await get(abs, "image/*");
        if (r) {
          const d = await asDataUrl(r);
          if (d) return d;
        }
      }
    }
  }
  const up = parentHost(host);
  return up ? fetchFor(up) : null;
}
async function favicon(url) {
  const host = faviconHost(url);
  if (!host) return null;
  if (mem.has(host)) return mem.get(host) ?? null;
  const f2 = join12(dir(), `${host}.txt`);
  if (existsSync13(f2)) {
    try {
      const t = readFileSync9(f2, "utf8");
      const v2 = t || null;
      mem.set(host, v2);
      return v2;
    } catch {
    }
  }
  const data = await fetchFor(host);
  mem.set(host, data);
  try {
    mkdirSync5(dir(), { recursive: true });
    writeFileSync4(f2, data ?? "");
  } catch {
  }
  return data;
}

// src/host/preview.ts
import { existsSync as existsSync14, readFileSync as readFileSync10, writeFileSync as writeFileSync5 } from "node:fs";
import { createHash as createHash2 } from "node:crypto";
import { join as join13 } from "node:path";

// src/core/preview.ts
var PICK = {
  title: ["og:title", "twitter:title"],
  desc: ["og:description", "twitter:description", "description"],
  image: ["og:image:secure_url", "og:image:url", "og:image", "twitter:image", "twitter:image:src"],
  site: ["og:site_name", "application-name"]
};
function parseMeta(html) {
  const metas = collectMetas(html);
  const first = (keys) => {
    for (const k2 of keys) {
      const v2 = metas.get(k2);
      if (v2) return v2;
    }
    return "";
  };
  const title = first(PICK.title) || tagText(html, "title");
  return { title: clean(title), desc: clean(first(PICK.desc)), image: first(PICK.image) || null, site: clean(first(PICK.site)) };
}
function collectMetas(html) {
  const out = /* @__PURE__ */ new Map();
  const re = /<meta\b[^>]*>/gi;
  for (let m2 = re.exec(html); m2; m2 = re.exec(html)) {
    const tag = m2[0];
    const key = (attr3(tag, "property") ?? attr3(tag, "name") ?? attr3(tag, "itemprop") ?? "").toLowerCase();
    const val = attr3(tag, "content");
    if (!key || !val) continue;
    if (!out.has(key)) out.set(key, val);
  }
  return out;
}
function tagText(html, name) {
  const m2 = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(html);
  return m2 ? m2[1] : "";
}
function attr3(tag, name) {
  const m2 = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(tag);
  return m2 ? m2[2] ?? m2[3] ?? m2[4] ?? "" : null;
}
var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'" };
function clean(s2) {
  return s2.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (all, e) => {
    const k2 = e.toLowerCase();
    if (ENT[k2]) return ENT[k2];
    if (k2.startsWith("#x")) {
      const n = parseInt(k2.slice(2), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    if (k2.startsWith("#")) {
      const n = Number(k2.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return all;
  }).replace(/\s+/g, " ").trim();
}
function fallbackMeta(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const path = decodeURIComponent(u.pathname).replace(/\/$/, "");
  return { url, host: u.hostname.replace(/^www\./, ""), title: path.split("/").filter(Boolean).pop() ?? u.hostname, desc: "", image: null, site: "" };
}

// src/host/preview.ts
var HTML_MAX = 256 * 1024;
var IMG_MAX = 400 * 1024;
var TIMEOUT2 = 5e3;
var TTL = 7 * 24 * 3600 * 1e3;
var mem2 = /* @__PURE__ */ new Map();
var dir2 = () => ensureDir(join13(dataDir(), "previews"));
var keyOf = (url) => createHash2("sha1").update(url).digest("hex").slice(0, 20);
async function get2(url, accept) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), TIMEOUT2);
    const r = await fetch(url, { signal: c.signal, redirect: "follow", headers: { accept, "user-agent": "FolderBot/1.0 (+link preview)" } });
    clearTimeout(t);
    return r.ok ? r : null;
  } catch {
    return null;
  }
}
async function thumb(src, base) {
  let abs;
  try {
    abs = new URL(src, base).toString();
  } catch {
    return null;
  }
  const r = await get2(abs, "image/*");
  if (!r) return null;
  const type = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/")) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length || buf.length > IMG_MAX) return null;
  return `data:${type};base64,${buf.toString("base64")}`;
}
async function fetchFor2(url) {
  const base = fallbackMeta(url);
  if (!base) return null;
  const r = await get2(url, "text/html,application/xhtml+xml");
  if (!r) return base;
  const type = (r.headers.get("content-type") ?? "").toLowerCase();
  if (!type.includes("html")) return { ...base, desc: clean(type.split(";")[0]) };
  const html = (await r.text()).slice(0, HTML_MAX);
  const meta = parseMeta(html);
  const image = meta.image ? await thumb(meta.image, r.url || url) : null;
  return { ...base, title: meta.title || base.title, desc: meta.desc, image, site: meta.site };
}
async function preview(url) {
  if (!faviconHost(url)) return null;
  if (mem2.has(url)) return mem2.get(url) ?? null;
  const f2 = join13(dir2(), `${keyOf(url)}.json`);
  if (existsSync14(f2)) {
    try {
      const j = JSON.parse(readFileSync10(f2, "utf8"));
      if (Date.now() - j.at < TTL) {
        mem2.set(url, j.meta);
        return j.meta;
      }
    } catch {
    }
  }
  const meta = await fetchFor2(url);
  mem2.set(url, meta);
  try {
    writeFileSync5(f2, JSON.stringify({ at: Date.now(), meta }));
  } catch {
  }
  return meta;
}

// src/host/slash.ts
import { existsSync as existsSync15, mkdirSync as mkdirSync6, readdirSync as readdirSync7, readFileSync as readFileSync11, statSync as statSync7, writeFileSync as writeFileSync6 } from "node:fs";
import { join as join14 } from "node:path";
import { homedir as homedir6 } from "node:os";
function descOf(text) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  if (fm) {
    const m2 = /^description:\s*(.+)$/m.exec(fm[1]);
    if (m2) return m2[1].trim().replace(/^["']|["']$/g, "").slice(0, 120);
  }
  const body = fm ? text.slice(fm[0].length) : text;
  const line = body.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
  return (line ?? "").slice(0, 120);
}
function scanOne(dir3, scope) {
  const out = [];
  const skills = join14(dir3, ".claude", "skills");
  if (existsSync15(skills)) for (const n of safeList(skills)) {
    const f2 = join14(skills, n, "SKILL.md");
    if (existsSync15(f2)) out.push({ name: n, desc: safeDesc(f2), kind: "skill", scope });
  }
  const cmds = join14(dir3, ".claude", "commands");
  const walk = (d, prefix) => {
    for (const n of safeList(d)) {
      const p2 = join14(d, n);
      let st;
      try {
        st = statSync7(p2);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p2, `${prefix}${n}:`);
      else if (n.endsWith(".md")) out.push({ name: `${prefix}${n.slice(0, -3)}`, desc: safeDesc(p2), kind: "command", scope });
    }
  };
  if (existsSync15(cmds)) walk(cmds, "");
  return out;
}
function safeList(d) {
  try {
    return readdirSync7(d).filter((n) => !n.startsWith(".")).sort();
  } catch {
    return [];
  }
}
function safeDesc(f2) {
  try {
    return descOf(readFileSync11(f2, "utf8"));
  } catch {
    return "";
  }
}
function slashCommands(botDir, rootDir, cli = [], vendor = "claude") {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const add = (list) => {
    for (const c of list) if (!seen.has(c.name)) {
      seen.add(c.name);
      out.push(c);
    }
  };
  if (vendor === "codex") {
    add(CODEX_LOCAL.map((c) => ({ name: c.name, desc: c.desc, kind: "cli", scope: "cli" })));
    add(codexPrompts());
    return out;
  }
  if (botDir !== rootDir) add(scanOne(botDir, "folder"));
  add(scanOne(rootDir, "root"));
  add(scanOne(homedir6(), "user"));
  add(cli.filter((n) => /^[\w:-]+$/.test(n)).map((n) => ({ name: n, desc: CLI_DESC[n] ?? "", kind: "cli", scope: "cli" })));
  return out;
}
function codexPrompts() {
  const dir3 = join14(process.env.CODEX_HOME ?? join14(homedir6(), ".codex"), "prompts");
  if (!existsSync15(dir3)) return [];
  return safeList(dir3).filter((n) => n.endsWith(".md")).map((n) => ({ name: n.slice(0, -3), desc: safeDesc(join14(dir3, n)), kind: "command", scope: "user" }));
}
var CLI_DESC = { compact: "\uB300\uD654 \uC555\uCD95 \u2014 \uCEE8\uD14D\uC2A4\uD2B8 \uC904\uC774\uAE30", context: "\uCEE8\uD14D\uC2A4\uD2B8 \uC0AC\uC6A9 \uB0B4\uC5ED", cost: "\uC774\uBC88 \uC138\uC158 \uBE44\uC6A9", review: "\uCF54\uB4DC \uB9AC\uBDF0", init: "CLAUDE.md \uB9CC\uB4E4\uAE30", clear: "\uC0C8 \uB300\uD654\uB85C", help: "\uB3C4\uC6C0\uB9D0" };
function listCommandFiles(botDir, rootDir) {
  const out = [];
  const one = (dir3, scope) => {
    const cmds = join14(dir3, ".claude", "commands");
    const walk = (d, prefix) => {
      for (const n of safeList(d)) {
        const p2 = join14(d, n);
        let st;
        try {
          st = statSync7(p2);
        } catch {
          continue;
        }
        if (st.isDirectory()) walk(p2, `${prefix}${n}:`);
        else if (n.endsWith(".md")) out.push({ name: `${prefix}${n.slice(0, -3)}`, desc: safeDesc(p2), scope, abs: p2 });
      }
    };
    if (existsSync15(cmds)) walk(cmds, "");
  };
  if (botDir !== rootDir) one(botDir, "folder");
  one(rootDir, "root");
  one(homedir6(), "user");
  return out;
}
var CMD_NAME_RE = /^[\w-]{1,60}$/;
function commandTemplate(name, desc) {
  return `---
description: ${desc || "\uBB34\uC5C7\uC744 \uD558\uB294 \uBA85\uB839\uC778\uC9C0 \uD55C \uC904"}
---
# /${name}

\uBD07\uC774 \uD560 \uC77C\uC744 \uC5EC\uAE30\uC5D0 \uC801\uC73C\uC138\uC694. \uC544\uB798 \`$ARGUMENTS\` \uC790\uB9AC\uC5D0 \`/${name}\` \uB4A4\uC5D0 \uC4F4 \uB9D0\uC774 \uB4E4\uC5B4\uAC11\uB2C8\uB2E4.

$ARGUMENTS
`;
}
function createCommand(dir3, name, desc = "") {
  if (!CMD_NAME_RE.test(name)) throw new Error("\uC774\uB984\uC740 \uC601\uBB38\xB7\uC22B\uC790\xB7-\xB7_ \uB9CC (\uC608: daily-report)");
  const cmds = join14(dir3, ".claude", "commands");
  mkdirSync6(cmds, { recursive: true });
  const abs = join14(cmds, `${name}.md`);
  if (existsSync15(abs)) throw new Error(`/${name} \uC740 \uC774\uBBF8 \uC788\uC5B4\uC694`);
  writeFileSync6(abs, commandTemplate(name, desc));
  return abs;
}

// src/host/harness.ts
import { existsSync as existsSync16, readFileSync as readFileSync12 } from "node:fs";
import { join as join15 } from "node:path";
import { homedir as homedir7 } from "node:os";
var RANK = { folder: 0, root: 1, user: 2, builtin: 3 };
function readJson2(f2) {
  try {
    return JSON.parse(readFileSync12(f2, "utf8"));
  } catch {
    return null;
  }
}
function mcpOf(file, scope) {
  const j = readJson2(file);
  const servers = j?.mcpServers;
  if (!servers || typeof servers !== "object") return [];
  return Object.entries(servers).map(([name, v2]) => {
    const c = v2 ?? {};
    return { name, desc: c.url ?? (c.command ? `${c.command}` : c.type ?? ""), scope, kind: "mcp" };
  });
}
function mcpFor(botDir, rootDir) {
  const out = [];
  if (botDir !== rootDir) out.push(...mcpOf(join15(botDir, ".mcp.json"), "folder"));
  out.push(...mcpOf(join15(rootDir, ".mcp.json"), "root"));
  out.push(...mcpOf(join15(homedir7(), ".claude.json"), "user"));
  out.push({ name: "Folder Bot", desc: "\uBD07 \uC2DC\uC791\xB7\uBCF4\uB0B4\uAE30\xB7\uD560 \uC77C (\uB0B4\uC7A5)", scope: "builtin", kind: "mcp" });
  const seen = /* @__PURE__ */ new Set();
  return out.filter((i) => seen.has(i.name) ? false : (seen.add(i.name), true)).sort((a, b2) => RANK[a.scope] - RANK[b2.scope]);
}
function skillsFor(botDir, rootDir) {
  return slashCommands(botDir, rootDir).filter((c) => c.kind === "skill").map((c) => ({ name: c.name, desc: c.desc, scope: c.scope === "cli" ? "user" : c.scope, kind: "skill" })).sort((a, b2) => RANK[a.scope] - RANK[b2.scope] || a.name.localeCompare(b2.name));
}
function countBy(list) {
  const by = { folder: 0, root: 0, user: 0, builtin: 0 };
  for (const i of list) by[i.scope]++;
  return by;
}
function harnessRow(rel, name, section, abs, rootDir) {
  const skills = skillsFor(abs, rootDir), mcp = mcpFor(abs, rootDir);
  return {
    rel,
    name,
    section,
    claudeMd: existsSync16(join15(abs, "CLAUDE.md")),
    agentsMd: existsSync16(join15(abs, "AGENTS.md")),
    skills: skills.length,
    mcp: mcp.length,
    by: countBy([...skills, ...mcp])
  };
}
function harnessDetail(rel, name, section, abs, rootDir) {
  return { ...harnessRow(rel, name, section, abs, rootDir), skillList: skillsFor(abs, rootDir), mcpList: mcpFor(abs, rootDir) };
}
function globalHarness(rootDir) {
  return { skills: skillsFor(rootDir, rootDir), mcp: mcpFor(rootDir, rootDir) };
}

// src/host/gateway.ts
function spawnZip(cwd, name) {
  return spawn3("zip", ["-r", "-q", "-", name, "-x", "*/.*", ".*"], { cwd });
}
function clientOf(who, c) {
  const o = c && typeof c === "object" ? c : {};
  const tier = o.tier === "phone" || o.tier === "desktop" || o.tier === "browser" ? o.tier : "browser";
  return { origin: who.main ? "host" : "remote", device: who.main ? "host" : who.device, tier, touch: o.touch === true, canOpenOnDevice: who.main ? true : o.canOpenOnDevice === true, openMode: o.openMode === "sync" || o.openMode === "download" ? o.openMode : "" };
}
var LOCAL_DEVICE = "this-mac";
function inBot(botAbs, rel) {
  const abs = resolve6(botAbs, rel);
  if (abs !== botAbs && !abs.startsWith(botAbs + sep3)) throw new Error("\uC774 \uD3F4\uB354 \uBC16\uC5D0\uB294 \uB9CC\uB4E4 \uC218 \uC5C6\uC5B4\uC694");
  return abs;
}
function freeName(botAbs, dir3, name) {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; i < 200; i++) {
    const cand = i === 1 ? name : `${stem} ${i}${ext}`;
    const rel = dir3 ? `${dir3}/${cand}` : cand;
    if (!existsSync17(join16(botAbs, rel))) return rel;
  }
  return dir3 ? `${dir3}/${Date.now()}-${name}` : `${Date.now()}-${name}`;
}
var PAIR_TTL = 2 * 60 * 1e3;
var Gateway = class {
  constructor(host, webRoot2) {
    this.host = host;
    this.webRoot = webRoot2;
    host.broadcast = (f2) => this.broadcastFrame(f2);
  }
  host;
  webRoot;
  servers = [];
  clients = /* @__PURE__ */ new Set();
  pairing = null;
  addrs = [];
  start() {
    this.addrs = bindAddresses();
    for (const addr of this.addrs) {
      const s2 = createServer((req, res) => void this.route(req, res).catch((e) => {
        try {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        } catch {
        }
      }));
      s2.on("error", (e) => this.host.log(`listen ${addr}:${this.host.cfg.port} \uC2E4\uD328: ${e.message}`));
      s2.listen(this.host.cfg.port, addr, () => this.host.log(`listening http://${addr}:${this.host.cfg.port}`));
      this.servers.push(s2);
    }
    setInterval(() => this.rebind(), 3e4).unref();
    setInterval(() => {
      for (const c of this.clients) c.res.write(": hb\n\n");
    }, 8e3).unref();
  }
  rebind() {
    const want = bindAddresses();
    for (const addr of want) if (!this.addrs.includes(addr)) {
      const s2 = createServer((req, res) => void this.route(req, res).catch(() => res.end()));
      s2.on("error", () => {
      });
      s2.listen(this.host.cfg.port, addr, () => this.host.log(`listening http://${addr}:${this.host.cfg.port}`));
      this.servers.push(s2);
      this.addrs.push(addr);
    }
  }
  /** 같은 맥의 창(호스트 앱)용 토큰 — 페어링 없이 바로 */
  localToken() {
    let d = this.host.cfg.devices.find((x2) => x2.name === LOCAL_DEVICE);
    if (!d) {
      d = { id: randomBytes(6).toString("hex"), name: LOCAL_DEVICE, token: randomBytes(32).toString("base64url"), createdAt: Date.now(), lastSeen: Date.now() };
      this.host.cfg.devices.push(d);
      saveConfig(this.host.cfg);
    }
    return d.token;
  }
  openPairing() {
    this.pairing = { code: String(Math.floor(1e5 + Math.random() * 9e5)), expiresAt: Date.now() + PAIR_TTL };
    return this.pairing;
  }
  broadcastFrame(f2) {
    const data = `data: ${JSON.stringify(f2)}

`;
    for (const c of this.clients) {
      try {
        c.res.write(data);
      } catch {
        this.clients.delete(c);
      }
    }
  }
  /** 누가 보고 있나 — 호스트 맥 자체의 창(this-mac 토큰 · 인증 없는 로컬)은 «메인», 나머지는 «원격 · 기기이름» */
  auth(req) {
    if (process.env.FOLDERBOT_NO_AUTH) {
      const as = req.headers["x-fb-as"];
      return as ? { ok: true, device: String(as), id: "as", main: false } : { ok: true, device: "local", id: "local", main: true };
    }
    const h = req.headers.authorization ?? "";
    const url = new URL(req.url ?? "/", "http://x");
    const tok = h.startsWith("Bearer ") ? h.slice(7) : url.searchParams.get("token") ?? "";
    if (!tok) return { ok: false, device: "", id: "", main: false };
    for (const d of this.host.cfg.devices) {
      const a = Buffer.from(d.token), b2 = Buffer.from(tok);
      if (a.length === b2.length && timingSafeEqual(a, b2)) {
        d.lastSeen = Date.now();
        return { ok: true, device: d.name, id: d.id, main: d.name === LOCAL_DEVICE };
      }
    }
    return { ok: false, device: "", id: "", main: false };
  }
  isLoopback(req) {
    const a = req.socket.remoteAddress ?? "";
    return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
  }
  async route(req, res) {
    const url = new URL(req.url ?? "/", "http://x");
    const p2 = url.pathname;
    const json = (code, body2) => {
      res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(body2));
    };
    const body = async () => {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const s2 = Buffer.concat(chunks).toString("utf8");
      return s2 ? JSON.parse(s2) : {};
    };
    if (p2.startsWith("/mcp/")) {
      if (!this.isLoopback(req)) return json(403, { error: "loopback only" });
      const chunks = [];
      for await (const c of req) chunks.push(c);
      return handleMcp(this.host, decodeURIComponent(p2.slice(5)), req, res, Buffer.concat(chunks).toString("utf8"), new URL(req.url ?? "/", "http://x").searchParams.get("sid") ?? "");
    }
    if (p2 === "/api/health") return json(200, { ok: true, name: "folderbot", version: this.host.version });
    if (p2 === "/api/pair" && req.method === "POST") {
      const b2 = await body();
      const code = String(b2.code ?? "");
      const device = String(b2.device ?? "device").slice(0, 40);
      if (!this.pairing || Date.now() > this.pairing.expiresAt || code !== this.pairing.code) {
        await new Promise((r) => setTimeout(r, 800));
        return json(401, { error: "\uCF54\uB4DC\uAC00 \uB9DE\uC9C0 \uC54A\uAC70\uB098 \uB9CC\uB8CC\uB410\uC5B4\uC694" });
      }
      this.pairing = null;
      const token = randomBytes(32).toString("base64url");
      this.host.cfg.devices.push({ id: randomBytes(6).toString("hex"), name: device, token, createdAt: Date.now(), lastSeen: Date.now() });
      saveConfig(this.host.cfg);
      this.host.log(`\uAE30\uAE30 \uC5F0\uACB0\uB428: ${device}`);
      return json(200, { token, device });
    }
    if (p2.startsWith("/api/")) {
      const a = this.auth(req);
      if (!a.ok) return json(401, { error: "unauthorized" });
      return this.api(p2, url, req, res, json, body, a.device, a);
    }
    return this.static(p2, res);
  }
  async api(p2, url, req, res, json, body, device, who) {
    const h = this.host;
    const reg = h.registry;
    const m2 = req.method ?? "GET";
    const seg = p2.split("/").filter(Boolean);
    const botOf = (id) => {
      const b2 = reg.bot(id);
      if (!b2) throw new Error("\uADF8\uB7F0 \uBD07\uC774 \uC5C6\uC5B4\uC694");
      return b2;
    };
    const roots = (b2) => [reg.root, ...b2.repo ? [b2.repo] : []];
    if (p2 === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
      res.write(`data: ${JSON.stringify({ ev: "hello", version: h.version, serverTime: Date.now() })}

`);
      const c = { res, device };
      this.clients.add(c);
      req.on("close", () => this.clients.delete(c));
      return;
    }
    if (p2 === "/api/agents" && m2 === "GET") return json(200, providers());
    if (p2 === "/api/agents/models" && m2 === "GET") return json(200, agentModels());
    if (p2 === "/api/usage" && m2 === "GET") {
      const bySid = /* @__PURE__ */ new Map();
      for (const r of h.sessions.all()) if (r.cliSessionId) {
        const b2 = reg.bot(r.botId);
        bySid.set(r.cliSessionId, { botId: r.botId, name: b2?.displayName ?? b2?.name ?? r.botId });
      }
      return json(200, { ...usageReport(Date.now(), (sid) => bySid.get(sid)), hook: hookState().installed });
    }
    if (p2 === "/api/usage/hook" && m2 === "POST") {
      const b2 = await body();
      return json(200, setHook(!!b2.on));
    }
    if (p2 === "/api/usage/budget" && m2 === "POST") {
      const b2 = await body();
      return json(200, setBudget({ window: b2.window === void 0 ? void 0 : Number(b2.window), day: b2.day === void 0 ? void 0 : Number(b2.day), week: b2.week === void 0 ? void 0 : Number(b2.week) }));
    }
    if (p2 === "/api/favicon" && m2 === "GET") {
      const u = url.searchParams.get("url") ?? "";
      const data = await favicon(u);
      return json(200, { data });
    }
    if (p2 === "/api/preview" && m2 === "GET") {
      const u = url.searchParams.get("url") ?? "";
      return json(200, { meta: await preview(u) });
    }
    if (p2 === "/api/state") {
      const tn = await tailnetInfo();
      return json(200, { version: h.version, root: reg.root, rules: reg.rules, rulesInstalled: reg.rulesInstalled(), bots: reg.bots(), candidates: reg.candidates(), auth: h.auth, inbox: reg.inboxItems().length, notifications: h.notifier.events.slice(0, 50), vapidPublic: h.notifier.vapidPublic(), tailnet: tn, addrs: this.addrs, port: h.cfg.port, devices: h.cfg.devices.filter((d) => d.name !== LOCAL_DEVICE).map((d) => ({ id: d.id, name: d.name, lastSeen: d.lastSeen })), sessionsByBot: Object.fromEntries(reg.bots().map((b2) => [b2.id, h.sessions.list(b2.id)])), quiet: h.cfg.quiet ?? { from: "23:00", to: "07:00" }, defaults: { model: h.cfg.defaultModel ?? "", effort: h.cfg.defaultEffort ?? "", permissionMode: h.cfg.defaultPermissionMode ?? "default", idleMinutes: h.cfg.idleMinutes ?? 60, codex: { model: h.cfg.defaultCodexModel ?? "", effort: h.cfg.defaultCodexEffort ?? "", sandbox: h.cfg.codexSandbox ?? "read-only", auth: codexAuth(h.cfg.openaiApiKey) } }, hostName: h.hostName(), device: { id: who.id, name: who.main ? h.hostName() : who.device, main: who.main } });
    }
    if (p2 === "/api/root" && m2 === "POST") {
      const b2 = await body();
      const abs = normalizeRootInput(String(b2.path ?? ""), homedir8());
      if (!abs) return json(400, { error: "\uC808\uB300 \uACBD\uB85C\uB97C \uB123\uC5B4 \uC8FC\uC138\uC694 (\uC608: /Users/\uC774\uB984/PARA)" });
      let dir3 = false;
      try {
        dir3 = statSync8(abs).isDirectory();
      } catch {
        dir3 = false;
      }
      if (!dir3) return json(400, { error: `\uADF8\uB7F0 \uD3F4\uB354\uAC00 \uC5C6\uC5B4\uC694: ${abs}` });
      const stored = canon(resolve6(h.cfg.root ?? reg.root));
      if (canon(abs) === canon(reg.root) && canon(abs) === stored) return json(200, { ok: true, root: reg.root, restarting: false, same: true });
      const saved = h.setRoot(abs);
      const restarting = !!h.onRoot;
      json(200, { ok: true, root: saved, restarting });
      if (h.onRoot) setTimeout(() => {
        void h.onRoot?.(saved);
      }, 250);
      return;
    }
    if (p2 === "/api/root/browse" && m2 === "GET") {
      const home = homedir8();
      const at = normalizeRootInput(url.searchParams.get("path") ?? "", home) ?? home;
      let dirs = [];
      try {
        dirs = readdirSync8(at, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).slice(0, 400).map((e) => ({ name: e.name, path: join16(at, e.name) })).sort((x2, y) => x2.name.localeCompare(y.name, "ko"));
      } catch {
        return json(400, { error: `\uBABB \uC77D\uB294 \uD3F4\uB354\uC608\uC694: ${at}` });
      }
      const up = dirname4(at);
      return json(200, { path: at, name: basename4(at) || at, parent: up === at ? null : up, home, dirs });
    }
    if (p2 === "/api/search" && m2 === "GET") {
      const q = url.searchParams.get("q") ?? "";
      const names = new Map(reg.bots().map((b2) => [b2.id, b2.name]));
      const hits = searchConversations(q, h.sessions.all().map((r) => ({ id: r.id, botId: r.botId, name: r.name, lastActivity: r.lastActivity, items: r.items })), 20);
      return json(200, hits.map((x2) => ({ ...x2, bot: names.get(x2.botId) ?? "" })));
    }
    if (p2 === "/api/todos" && m2 === "GET") {
      const rows = reg.bots().filter((b2) => !b2.orchestrator).map((b2) => {
        const open = readTodo(b2.abs).filter((t) => !t.done);
        return { botId: b2.id, name: b2.name, open: open.length, next: open[0] ? { line: open[0].line, title: open[0].title } : null };
      }).filter((r) => r.open > 0);
      return json(200, { open: rows.reduce((n, r) => n + r.open, 0), rows });
    }
    if (p2 === "/api/bots" && m2 === "GET") return json(200, reg.bots());
    if (p2 === "/api/candidates") return json(200, reg.candidates());
    if (p2 === "/api/bots/start" && m2 === "POST") {
      const b2 = await body();
      const bot = reg.start(String(b2.rel), b2.provider === "codex" ? "codex" : b2.provider === "claude" ? "claude" : void 0);
      h.afterBotsChanged();
      return json(200, bot);
    }
    if (p2 === "/api/harness" && m2 === "GET") {
      const rel = url.searchParams.get("rel");
      if (rel !== null) {
        const abs = join16(reg.root, rel);
        if (!abs.startsWith(reg.root)) return json(400, { error: "\uB8E8\uD2B8 \uBC16" });
        return json(200, harnessDetail(rel, rel.split("/").pop() ?? rel, rel.includes("/") ? rel.split("/")[0] : "", abs, reg.root));
      }
      const rows = [
        ...reg.bots().filter((b2) => !b2.orchestrator).map((b2) => ({ rel: b2.rel, name: b2.name, section: b2.section, abs: b2.abs })),
        ...reg.candidates().filter((c) => !c.active).map((c) => ({ rel: c.rel, name: c.name, section: c.section, abs: join16(reg.root, c.rel) }))
      ];
      return json(200, rows.map((r) => harnessRow(r.rel, r.name, r.section, r.abs, reg.root)));
    }
    if (p2 === "/api/harness/global" && m2 === "GET") return json(200, globalHarness(reg.root));
    if (p2 === "/api/folders" && m2 === "POST") {
      const b2 = await body();
      const rel = reg.createFolder(String(b2.section), String(b2.name));
      let bot = null;
      if (b2.start) {
        bot = reg.start(rel, b2.provider === "codex" ? "codex" : void 0);
        h.afterBotsChanged();
      }
      return json(200, { rel, bot });
    }
    if (p2 === "/api/rules" && m2 === "GET") return json(200, { rules: reg.rules, installed: reg.rulesInstalled(), file: reg.rulesFile(), parents: reg.rules.roles.active });
    if (p2 === "/api/rules/install" && m2 === "POST") {
      const b2 = await body();
      const r = reg.installRules(b2.preset ?? "para");
      h.afterBotsChanged();
      return json(200, { rules: r, candidates: reg.candidates() });
    }
    if (p2 === "/api/inbox") return json(200, reg.inboxItems());
    if (p2 === "/api/move" && m2 === "POST") {
      const b2 = await body();
      reg.move(String(b2.from), String(b2.to));
      h.afterBotsChanged();
      return json(200, { ok: true });
    }
    if (p2 === "/api/undo" && m2 === "GET") return json(200, reg.undoList());
    if (p2 === "/api/undo" && m2 === "POST") {
      const b2 = await body();
      reg.undo(Number(b2.t));
      h.afterBotsChanged();
      return json(200, { ok: true });
    }
    if (p2 === "/api/notifications" && m2 === "GET") return json(200, h.notifier.events.slice(0, 100));
    if (p2 === "/api/notifications/read" && m2 === "POST") {
      const b2 = await body();
      h.notifier.markRead(Array.isArray(b2.ids) ? b2.ids : void 0);
      return json(200, { ok: true });
    }
    if (p2 === "/api/push/subscribe" && m2 === "POST") {
      const b2 = await body();
      h.notifier.addSub(b2.sub, device);
      return json(200, { ok: true });
    }
    if (p2 === "/api/push/test" && m2 === "POST") {
      h.notifier.emit("done", "orch", "Folder Bot", "\uD478\uC2DC\uAC00 \uB3C4\uCC29\uD558\uBA74 \uC131\uACF5\uC774\uC5D0\uC694", void 0, { mac: false });
      return json(200, { ok: true });
    }
    if (p2 === "/api/tailnet") return json(200, await tailnetInfo());
    if (p2 === "/api/auth/refresh" && m2 === "POST") return json(200, await h.refreshAuth());
    if (p2 === "/api/auth/login-terminal" && m2 === "POST") {
      const b2 = await body();
      if (!who.main) return json(400, { error: "\uD638\uC2A4\uD2B8 \uB9E5\uC5D0\uC11C \uB20C\uB7EC \uC8FC\uC138\uC694 \u2014 \uD130\uBBF8\uB110\uC740 \uADF8\uCABD\uC5D0 \uB5A0\uC57C \uD574\uC694" });
      if (process.platform !== "darwin") return json(400, { error: "\uB9E5\uC5D0\uC11C\uB9CC \uC5F4 \uC218 \uC788\uC5B4\uC694" });
      const cmd = b2.agent === "codex" ? "codex login" : "claude";
      const script = `cd ${JSON.stringify(reg.root)}; clear; ${cmd}`;
      execFile4("/usr/bin/osascript", ["-e", `tell application "Terminal" to do script ${JSON.stringify(script)}`, "-e", 'tell application "Terminal" to activate'], () => {
      });
      return json(200, { ok: true, cmd });
    }
    if (p2 === "/api/auth/diagnose" && m2 === "GET") return json(200, { text: await diagnose({ claudeBin: h.cfg.claudeBin, openaiApiKey: h.cfg.openaiApiKey, tokenSet: !!h.cfg.claudeOauthToken }) });
    if (p2 === "/api/auth/reconnect" && m2 === "POST") {
      const b2 = await body();
      const vendor = b2.agent === "codex" ? "codex" : b2.agent === "claude" ? "claude" : void 0;
      const auth = await h.refreshAuth();
      const r = h.sessions.recycleAll(vendor);
      return json(200, { auth, codex: codexAuth(h.cfg.openaiApiKey), ...r });
    }
    if (p2 === "/api/names" && m2 === "POST") {
      const b2 = await body();
      h.setNames({ hostName: b2.hostName === void 0 ? void 0 : String(b2.hostName), deviceId: who.id, deviceName: b2.deviceName === void 0 ? void 0 : String(b2.deviceName) });
      return json(200, { hostName: h.hostName(), device: { id: who.id, name: who.main ? h.hostName() : h.cfg.devices.find((d) => d.id === who.id)?.name ?? who.device, main: who.main } });
    }
    if (p2 === "/api/defaults" && m2 === "POST") {
      const b2 = await body();
      h.setDefaults(String(b2.model ?? ""), String(b2.effort ?? ""), b2.agent === "codex" ? "codex" : "claude", b2.permissionMode === void 0 ? void 0 : String(b2.permissionMode));
      return json(200, { model: h.cfg.defaultModel ?? "", effort: h.cfg.defaultEffort ?? "", permissionMode: h.cfg.defaultPermissionMode ?? "default" });
    }
    if (p2 === "/api/quiet" && m2 === "POST") {
      const b2 = await body();
      h.setQuiet(String(b2.from ?? ""), String(b2.to ?? ""));
      return json(200, h.cfg.quiet);
    }
    if (p2 === "/api/codex" && m2 === "POST") {
      const b2 = await body();
      h.setCodex({ sandbox: b2.sandbox ? String(b2.sandbox) : void 0, apiKey: b2.apiKey === void 0 ? void 0 : String(b2.apiKey) });
      return json(200, { ok: true, auth: codexAuth(h.cfg.openaiApiKey), sandbox: h.cfg.codexSandbox ?? "read-only" });
    }
    if (p2 === "/api/auth/token" && m2 === "POST") {
      const b2 = await body();
      h.setToken(String(b2.token ?? ""));
      return json(200, { ok: true, mode: h.cfg.claudeOauthToken ? "token" : "login" });
    }
    if (p2 === "/api/pairing" && m2 === "POST") {
      if (!this.isLoopback(req) && device !== "local") return json(403, { error: "\uBBF8\uB2C8\uC5D0\uC11C\uB9CC \uC5F4 \uC218 \uC788\uC5B4\uC694" });
      return json(200, this.openPairing());
    }
    if (p2 === "/api/devices/revoke" && m2 === "POST") {
      const b2 = await body();
      h.cfg.devices = h.cfg.devices.filter((d) => d.id !== b2.id || d.name === LOCAL_DEVICE);
      saveConfig(h.cfg);
      return json(200, { ok: true });
    }
    if (p2 === "/api/idle" && m2 === "POST") {
      const b2 = await body();
      h.setIdle(Number(b2.minutes));
      return json(200, { minutes: h.cfg.idleMinutes ?? 60 });
    }
    if (p2 === "/api/bots/pin" && m2 === "POST") {
      const b2 = await body();
      try {
        reg.pin(String(b2.id), !!b2.on);
      } catch (e) {
        return json(400, { error: e.message });
      }
      h.afterBotsChanged();
      return json(200, { ok: true });
    }
    if (p2 === "/api/bots/reorder" && m2 === "POST") {
      const b2 = await body();
      reg.reorder((Array.isArray(b2.ids) ? b2.ids : []).map((x2) => String(x2)), b2.moved ? String(b2.moved) : void 0);
      h.afterBotsChanged();
      return json(200, { ok: true });
    }
    if (p2 === "/api/bots/unfix" && m2 === "POST") {
      const b2 = await body();
      try {
        reg.unfix(String(b2.id));
      } catch (e) {
        return json(400, { error: e.message });
      }
      h.afterBotsChanged();
      return json(200, { ok: true });
    }
    if (seg[1] === "bots" && seg[2]) {
      const bot = botOf(seg[2]);
      const sub = seg[3];
      if (sub === "stop" && m2 === "POST") {
        if (bot.orchestrator) throw new Error("\uC624\uCF00\uC2A4\uD2B8\uB808\uC774\uD130\uB294 \uC815\uC9C0\uD560 \uC218 \uC5C6\uC5B4\uC694");
        reg.stop(bot.id);
        h.afterBotsChanged();
        return json(200, { ok: true });
      }
      if (sub === "retire" && m2 === "POST") {
        const to = reg.retire(bot.id);
        h.afterBotsChanged();
        return json(200, { to });
      }
      if (sub === "sessions" && m2 === "GET") return json(200, h.sessions.list(bot.id));
      if (sub === "sessions" && m2 === "POST") {
        const b2 = await body();
        const vd = b2.vendor === "codex" || b2.vendor === "claude" ? b2.vendor : void 0;
        const s2 = h.sessions.create(bot, String(b2.name ?? "\uC0C8 \uC138\uC158"), { permissionMode: b2.permissionMode, model: b2.model ? String(b2.model) : void 0, vendor: vd });
        return json(200, h.sessions.info(s2));
      }
      if (sub === "send" && m2 === "POST") {
        const b2 = await body();
        const sid = h.sendToBot(bot, String(b2.text), b2.sessionId ? String(b2.sessionId) : void 0, b2.name ? String(b2.name) : void 0, void 0, { model: b2.model ? String(b2.model) : void 0, effort: b2.effort ? String(b2.effort) : void 0, permissionMode: b2.permissionMode ? String(b2.permissionMode) : void 0, vendor: b2.vendor === "codex" || b2.vendor === "claude" ? b2.vendor : void 0, client: clientOf(who, b2.client) });
        return json(200, { sessionId: sid });
      }
      if (sub === "commands" && m2 === "GET") return json(200, listCommandFiles(bot.abs, reg.root).map((c) => ({ name: c.name, desc: c.desc, scope: c.scope, rel: c.scope === "user" ? null : relative5(bot.abs, c.abs) })));
      if (sub === "commands" && m2 === "POST") {
        const b2 = await body();
        try {
          const abs = createCommand(b2.scope === "root" ? reg.root : bot.abs, String(b2.name ?? "").trim(), typeof b2.desc === "string" ? b2.desc : "");
          h.broadcast({ ev: "files", botId: bot.id });
          return json(200, { rel: relative5(bot.abs, abs) });
        } catch (e) {
          return json(400, { error: e.message });
        }
      }
      if (sub === "slash") {
        const sid = url.searchParams.get("sid") ?? "";
        const v2 = sid ? h.sessions.get(sid)?.vendor : void 0;
        return json(200, slashCommands(bot.abs, reg.root, sid ? h.sessions.slashOf(sid) : [], v2 === "codex" ? "codex" : "claude"));
      }
      if (sub === "todo" && m2 === "GET") return json(200, h.todo(bot));
      if (sub === "todo" && seg[4] === "toggle" && m2 === "POST") {
        const b2 = await body();
        const items = todoToggle(bot.abs, Number(b2.line), !!b2.done);
        h.broadcast({ ev: "todo", botId: bot.id, items });
        return json(200, items);
      }
      if (sub === "todo" && seg[4] === "edit" && m2 === "POST") {
        const b2 = await body();
        const items = todoEdit(bot.abs, Number(b2.line), String(b2.title ?? ""), String(b2.desc ?? ""));
        h.broadcast({ ev: "todo", botId: bot.id, items });
        return json(200, items);
      }
      if (sub === "todo" && seg[4] === "move" && m2 === "POST") {
        const b2 = await body();
        const items = todoMove(bot.abs, Number(b2.line), b2.before === null || b2.before === void 0 ? null : Number(b2.before));
        h.broadcast({ ev: "todo", botId: bot.id, items });
        return json(200, items);
      }
      if (sub === "todo" && seg[4] === "delete" && m2 === "POST") {
        const b2 = await body();
        const items = todoDelete(bot.abs, Number(b2.line));
        h.broadcast({ ev: "todo", botId: bot.id, items });
        return json(200, items);
      }
      if (sub === "todo" && m2 === "POST") {
        const b2 = await body();
        h.todoAdd(bot, String(b2.title), String(b2.desc ?? ""), "me", false, String(b2.section ?? ""));
        return json(200, h.todo(bot));
      }
      if (sub === "files") return json(200, tree(bot.abs, Number(url.searchParams.get("depth") ?? 2)));
      if (sub === "ls") {
        const rel = url.searchParams.get("dir") ?? "";
        guard(roots(bot), join16(bot.abs, rel));
        return json(200, listDir(bot.abs, rel, url.searchParams.get("all") === "1").map((n) => {
          if (!n.dir) return n;
          const vrel = bot.rel ? `${bot.rel}/${n.rel}` : n.rel;
          return { ...n, harness: reg.hasHarness(join16(bot.abs, n.rel)), botId: reg.botByRel(vrel)?.id, role: vrel.includes("/") ? void 0 : globParents(reg.rules.roles.active).includes(vrel) ? "active" : roleOf(reg.rules, vrel) ?? void 0 };
        }));
      }
      if (sub === "dirs") {
        const depth = Math.min(8, Math.max(1, Number(url.searchParams.get("depth") ?? 6)));
        return json(200, allDirs(bot.abs, depth).map((n) => {
          const vrel = bot.rel ? `${bot.rel}/${n.rel}` : n.rel;
          return { ...n, harness: reg.hasHarness(join16(bot.abs, n.rel)), botId: reg.botByRel(vrel)?.id, role: vrel.includes("/") ? void 0 : globParents(reg.rules.roles.active).includes(vrel) ? "active" : roleOf(reg.rules, vrel) ?? void 0 };
        }));
      }
      if (sub === "rename" && m2 === "POST") {
        const b2 = await body();
        const abs = guard(roots(bot), join16(bot.abs, String(b2.rel)));
        const to = renameEntry(abs, String(b2.name));
        h.broadcast({ ev: "files", botId: bot.id });
        return json(200, { rel: relative5(bot.abs, to) });
      }
      if (sub === "upload" && m2 === "POST") {
        const chunks = [];
        let total = 0;
        for await (const c of req) {
          total += c.length;
          if (total > 40 * 1024 * 1024) return json(413, { error: "\uB108\uBB34 \uCEE4\uC694 (25MB \uC0C1\uD55C)" });
          chunks.push(c);
        }
        const b2 = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const name = String(b2.name ?? "file").replace(/[\/\\:\u0000-\u001f]/g, "_").slice(0, 120);
        const buf = Buffer.from(String(b2.data ?? ""), "base64");
        if (buf.length > 25 * 1024 * 1024) return json(413, { error: "\uB108\uBB34 \uCEE4\uC694 (25MB \uC0C1\uD55C)" });
        const dir3 = join16(bot.abs, "\uCCA8\uBD80");
        if (!existsSync17(dir3)) mkdirSync7(dir3, { recursive: true });
        let rel = `\uCCA8\uBD80/${name}`;
        let i = 2;
        while (existsSync17(join16(bot.abs, rel))) {
          const dot = name.lastIndexOf(".");
          rel = `\uCCA8\uBD80/${dot > 0 ? name.slice(0, dot) : name}_${i++}${dot > 0 ? name.slice(dot) : ""}`;
        }
        writeFileSync7(join16(bot.abs, rel), buf);
        h.broadcast({ ev: "files", botId: bot.id });
        return json(200, { rel, abs: join16(bot.abs, rel), size: buf.length });
      }
      if (sub === "recent") return json(200, recent(bot.abs, 14));
      if (sub === "peek" && m2 === "GET") {
        const rel = url.searchParams.get("rel") ?? "";
        let abs;
        try {
          abs = resolveNFDeep("/", guard(roots(bot), join16(bot.abs, rel)).slice(1));
        } catch {
          return json(200, { kind: "none" });
        }
        if (!exists(abs)) return json(200, { kind: "none" });
        const kind = kindOf2(abs);
        const st = statSync8(abs);
        const meta = { kind, mtime: st.mtimeMs, size: st.size };
        if (kind !== "text" && kind !== "canvas") return json(200, meta);
        const r = readText(abs);
        return json(200, { ...meta, text: r.text.slice(0, 4096) });
      }
      if (sub === "file" && m2 === "GET") {
        const abs = resolveNFDeep("/", guard(roots(bot), join16(bot.abs, url.searchParams.get("rel") ?? "")).slice(1));
        if (!exists(abs)) return json(404, { error: "\uC5C6\uB294 \uD30C\uC77C" });
        const kind = kindOf2(abs);
        if (kind === "text" || kind === "canvas") {
          const r = readText(abs);
          return json(200, { kind, rel: url.searchParams.get("rel"), text: r.text, truncated: r.truncated, size: statSync8(abs).size, mtime: statSync8(abs).mtimeMs });
        }
        return json(200, { kind, rel: url.searchParams.get("rel"), size: statSync8(abs).size, mtime: statSync8(abs).mtimeMs });
      }
      if (sub === "file" && m2 === "POST") {
        const b2 = await body();
        const abs = guard(roots(bot), join16(bot.abs, String(b2.rel)));
        writeText(abs, String(b2.text));
        h.broadcast({ ev: "files", botId: bot.id });
        return json(200, { ok: true });
      }
      if (sub === "diff" && m2 === "GET") {
        const p3 = url.searchParams.get("abs") ?? "";
        const sid = url.searchParams.get("s") ?? "";
        let abs;
        try {
          abs = resolveNFDeep("/", guard(roots(bot), p3.startsWith("/") ? p3 : join16(bot.abs, p3)).slice(1));
        } catch {
          return json(404, { error: "\uB8E8\uD2B8 \uBC16" });
        }
        const after = exists(abs) && kindOf2(abs) === "text" ? readText(abs).text : exists(abs) ? void 0 : null;
        const before = h.sessions.before(sid, abs);
        return json(200, { rel: relative5(bot.abs, abs), before, after, known: before !== void 0 });
      }
      if (sub === "exists" && m2 === "POST") {
        const b2 = await body();
        const rels = (Array.isArray(b2.rels) ? b2.rels : []).slice(0, 40).map(String);
        const out = {};
        for (const c of rels) {
          const tries = c.startsWith("/") ? [c] : [join16(bot.abs, c), join16(reg.root, c)];
          out[c] = false;
          for (const t of tries) {
            try {
              const abs = resolveNFDeep("/", guard(roots(bot), t).slice(1));
              if (!exists(abs)) continue;
              out[c] = { rel: relative5(bot.abs, abs), dir: statSync8(abs).isDirectory() };
              break;
            } catch {
            }
          }
          if (!out[c] && !c.includes("/")) {
            const found = [];
            const names = extname2(c) ? [c] : [c, `${c}.md`];
            for (const base of [bot.abs, ...bot.repo ? [bot.repo] : [], reg.root]) {
              for (const n of names) for (const f2 of findFiles(base, n)) if (!found.includes(f2)) found.push(f2);
              if (found.length) break;
            }
            if (found.length) out[c] = { rel: relative5(bot.abs, found[0]), dir: false, matches: found.map((f2) => relative5(bot.abs, f2)) };
          }
        }
        return json(200, out);
      }
      if (sub === "open" && m2 === "POST") {
        const b2 = await body();
        const abs = guard(roots(bot), join16(bot.abs, String(b2.rel ?? "")));
        if (!exists(abs)) return json(404, { error: "\uC5C6\uB294 \uD30C\uC77C" });
        if (process.platform !== "darwin") return json(400, { error: "\uBA54\uC778\uC774 \uB9E5\uC77C \uB54C\uB9CC \uC5F4 \uC218 \uC788\uC5B4\uC694" });
        execFile4("/usr/bin/open", [abs], () => {
        });
        return json(200, { ok: true });
      }
      if (sub === "reveal" && m2 === "POST") {
        const b2 = await body();
        const abs = guard(roots(bot), join16(bot.abs, String(b2.rel ?? "")));
        if (!exists(abs)) return json(404, { error: "\uC5C6\uB294 \uD30C\uC77C" });
        if (process.platform !== "darwin") return json(400, { error: "\uBA54\uC778\uC774 \uB9E5\uC77C \uB54C\uB9CC \uC5F4 \uC218 \uC788\uC5B4\uC694" });
        execFile4("/usr/bin/open", ["-R", abs], () => {
        });
        return json(200, { ok: true });
      }
      if (sub === "new" && m2 === "POST") {
        const b2 = await body();
        const dir3 = String(b2.dir ?? "").replace(/^\/+|\/+$/g, "");
        const folder = b2.kind === "folder";
        let name = String(b2.name ?? "").trim().replace(/[/\\]/g, "-");
        if (!name) return json(400, { error: "\uC774\uB984\uC774 \uBE44\uC5C8\uC5B4\uC694" });
        if (!folder && !/\.[A-Za-z0-9]{1,8}$/.test(name)) name += ".md";
        const rel = freeName(bot.abs, dir3, name);
        const abs = inBot(bot.abs, rel);
        if (folder) mkdirSync7(abs, { recursive: true });
        else {
          mkdirSync7(join16(abs, ".."), { recursive: true });
          writeFileSync7(abs, "");
        }
        h.broadcast({ ev: "files", botId: bot.id });
        return json(200, { rel });
      }
      if (sub === "copy" && m2 === "POST") {
        const b2 = await body();
        const rel = String(b2.rel ?? "");
        const abs = guard(roots(bot), join16(bot.abs, rel));
        if (!exists(abs)) return json(404, { error: "\uC5C6\uB294 \uD30C\uC77C" });
        const dir3 = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
        const base = rel.split("/").pop() ?? rel;
        const dot = base.lastIndexOf(".");
        const stem = dot > 0 ? base.slice(0, dot) : base;
        const ext = dot > 0 ? base.slice(dot) : "";
        const to = freeName(bot.abs, dir3, `${stem} \uC0AC\uBCF8${ext}`);
        cpSync(abs, inBot(bot.abs, to), { recursive: true });
        h.broadcast({ ev: "files", botId: bot.id });
        return json(200, { rel: to });
      }
      if (sub === "trash" && m2 === "POST") {
        const b2 = await body();
        const rels = (Array.isArray(b2.rels) ? b2.rels : [b2.rel]).map((x2) => String(x2 ?? "")).filter(Boolean);
        if (!rels.length) return json(400, { error: "\uACE0\uB978 \uAC83\uC774 \uC5C6\uC5B4\uC694" });
        const to = [];
        const failed = [];
        for (const rel of rels) {
          try {
            inBot(bot.abs, rel);
            to.push(reg.trashPath(relative5(reg.root, join16(bot.abs, rel))));
          } catch {
            failed.push(rel);
          }
        }
        h.broadcast({ ev: "files", botId: bot.id });
        return json(200, { to, failed });
      }
      if (sub === "move" && m2 === "POST") {
        const b2 = await body();
        const dir3 = String(b2.dir ?? "").replace(/^\/+|\/+$/g, "");
        const dirAbs = inBot(bot.abs, dir3);
        if (!exists(dirAbs)) return json(404, { error: "\uC5C6\uB294 \uD3F4\uB354" });
        const rels = (Array.isArray(b2.rels) ? b2.rels : [b2.rel]).map((x2) => String(x2 ?? "")).filter(Boolean);
        const moved = [];
        const failed = [];
        for (const rel of rels) {
          try {
            const from = inBot(bot.abs, rel);
            if (dirAbs === from || dirAbs.startsWith(from + sep3)) throw new Error("\uC790\uAE30 \uC548\uC73C\uB85C\uB294 \uBABB \uC62E\uACA8\uC694");
            if (join16(from, "..") === dirAbs) {
              moved.push({ from: rel, to: rel });
              continue;
            }
            const to = freeName(bot.abs, dir3, rel.split("/").pop() ?? rel);
            reg.movePath(relative5(reg.root, from), relative5(reg.root, inBot(bot.abs, to)));
            moved.push({ from: rel, to });
          } catch {
            failed.push(rel);
          }
        }
        h.broadcast({ ev: "files", botId: bot.id });
        return json(200, { moved, failed });
      }
      if (sub === "repo" && m2 === "POST") {
        const b2 = await body();
        try {
          const nb = reg.setRepo(bot.id, String(b2.path ?? ""));
          h.afterBotsChanged();
          return json(200, { ok: true, repo: nb.repo ?? null });
        } catch (e) {
          return json(400, { error: e.message });
        }
      }
      if (sub === "stat" && m2 === "GET") {
        const abs = resolveNFDeep("/", guard(roots(bot), join16(bot.abs, url.searchParams.get("rel") ?? "")).slice(1));
        if (!exists(abs)) return json(404, { error: "\uC5C6\uB294 \uD30C\uC77C" });
        const st = statSync8(abs);
        return json(200, { size: st.size, mtime: st.mtimeMs, head: headHash(abs), vaultRel: relative5(reg.root, abs) });
      }
      if (sub === "manifest" && m2 === "GET") {
        const relQ = url.searchParams.get("rel") ?? "";
        const abs = resolveNFDeep("/", guard(roots(bot), join16(bot.abs, relQ)).slice(1));
        if (!exists(abs)) return json(404, { error: "\uC5C6\uB294 \uD30C\uC77C" });
        const out = [];
        let truncated = false;
        const walk = (dir3, r) => {
          for (const e of readdirSync8(dir3, { withFileTypes: true })) {
            if (out.length >= 5e3) {
              truncated = true;
              return;
            }
            if (e.name.startsWith(".")) continue;
            const a = join16(dir3, e.name);
            const rr = r ? `${r}/${e.name}` : e.name;
            if (e.isDirectory()) walk(a, rr);
            else {
              const st2 = statSync8(a);
              out.push({ rel: rr, size: st2.size, mtime: st2.mtimeMs, head: headHash(a) });
            }
          }
        };
        const st = statSync8(abs);
        if (st.isDirectory()) walk(abs, "");
        else out.push({ rel: "", size: st.size, mtime: st.mtimeMs, head: headHash(abs) });
        return json(200, { dir: st.isDirectory(), name: basename4(abs), files: out, total: out.reduce((a, f2) => a + f2.size, 0), truncated });
      }
      if (sub === "zip" && m2 === "GET") {
        const relQ = url.searchParams.get("rel") ?? "";
        const abs = resolveNFDeep("/", guard(roots(bot), join16(bot.abs, relQ)).slice(1));
        if (!exists(abs)) return json(404, { error: "\uC5C6\uB294 \uD3F4\uB354" });
        const name = basename4(abs);
        res.writeHead(200, { "content-type": "application/zip", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}.zip`, "cache-control": "no-store" });
        const z = spawnZip(dirname4(abs), name);
        z.stdout.pipe(res);
        z.on("error", () => {
          try {
            res.end();
          } catch {
          }
        });
        req.on("close", () => {
          try {
            z.kill();
          } catch {
          }
        });
        return;
      }
      if (sub === "raw") {
        const abs = resolveNFDeep("/", guard(roots(bot), join16(bot.abs, url.searchParams.get("rel") ?? "")).slice(1));
        if (!exists(abs)) return json(404, { error: "none" });
        res.writeHead(200, { "content-type": mime(abs), "cache-control": "no-store" });
        stream(abs).pipe(res);
        return;
      }
      if (sub === "routines" && m2 === "GET") return json(200, bot.routines);
      if (sub === "routines" && m2 === "PUT") {
        const b2 = await body();
        const cfg = reg.botConfig(bot.abs);
        cfg.routines = b2.routines;
        reg.saveBotConfig(bot.abs, cfg);
        h.afterBotsChanged();
        return json(200, { ok: true });
      }
      if (sub === "config" && m2 === "PUT") {
        const b2 = await body();
        const cfg = reg.botConfig(bot.abs);
        Object.assign(cfg, b2);
        reg.saveBotConfig(bot.abs, cfg);
        h.afterBotsChanged();
        return json(200, { ok: true });
      }
    }
    if (seg[1] === "sessions" && seg[2]) {
      const r = h.sessions.get(seg[2]);
      if (!r) return json(404, { error: "\uADF8\uB7F0 \uC138\uC158\uC774 \uC5C6\uC5B4\uC694" });
      const bot = botOf(r.botId);
      const sub = seg[3];
      if (!sub && m2 === "DELETE") {
        h.sessions.remove(r.id);
        return json(200, { ok: true });
      }
      if (sub === "chat") return json(200, { info: h.sessions.info(r), items: r.items.slice(-800) });
      if (sub === "send" && m2 === "POST") {
        const b2 = await body();
        h.sendToBot(bot, String(b2.text), r.id, void 0, void 0, { client: clientOf(who, b2.client) });
        return json(200, { ok: true });
      }
      if (sub === "permission" && m2 === "POST") {
        const b2 = await body();
        h.sessions.respondPermission(r, String(b2.requestId), !!b2.allow, !!b2.always);
        return json(200, { ok: true });
      }
      if (sub === "read" && m2 === "POST") {
        const b2 = await body();
        h.sessions.markRead(r.id, typeof b2.at === "number" ? b2.at : void 0);
        h.notifier.markReadBySession(r.id);
        return json(200, { ok: true });
      }
      if (sub === "ask" && m2 === "POST") {
        const b2 = await body();
        h.sessions.respondAsk(r, String(b2.requestId), b2.answers ?? {});
        return json(200, { ok: true });
      }
      if (sub === "interrupt" && m2 === "POST") {
        h.sessions.interrupt(r);
        return json(200, { ok: true });
      }
      if (sub === "ack" && m2 === "POST") {
        h.sessions.acknowledge(r);
        return json(200, { ok: true });
      }
      if (sub === "rename" && m2 === "POST") {
        const b2 = await body();
        h.sessions.rename(r.id, String(b2.name));
        return json(200, { ok: true });
      }
      if (sub === "hibernate" && m2 === "POST") {
        h.sessions.hibernate(r.id);
        return json(200, { ok: true });
      }
      if (sub === "settings" && m2 === "POST") {
        const b2 = await body();
        h.sessions.configure(r, { model: b2.model === void 0 ? void 0 : String(b2.model), effort: b2.effort === void 0 ? void 0 : String(b2.effort), permissionMode: b2.permissionMode === void 0 ? void 0 : String(b2.permissionMode) });
        return json(200, h.sessions.info(r));
      }
    }
    return json(404, { error: "not found" });
  }
  static(p2, res) {
    let rel = normalize2(decodeURIComponent(p2)).replace(/^(\.\.[/\\])+/, "");
    if (rel === "/" || rel === "") rel = "/index.html";
    let f2 = join16(this.webRoot, rel);
    if (!f2.startsWith(this.webRoot) || !existsSync17(f2) || statSync8(f2).isDirectory()) f2 = join16(this.webRoot, "index.html");
    if (!existsSync17(f2)) {
      res.writeHead(404);
      res.end("client not built");
      return;
    }
    const e = extname2(f2);
    const immutable = f2.includes("/assets/");
    res.writeHead(200, { "content-type": mime(f2) === "application/octet-stream" ? { ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".woff2": "font/woff2" }[e] ?? "application/octet-stream" : mime(f2), "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-store", "service-worker-allowed": "/" });
    res.end(readFileSync13(f2));
  }
  stop() {
    for (const s2 of this.servers) s2.close();
  }
};

// src/host/index.ts
var here = dirname5(fileURLToPath(import.meta.url));
var pkgPath = [join17(here, "..", "package.json"), join17(here, "..", "..", "package.json")].find((p2) => existsSync18(p2));
var VERSION = pkgPath ? JSON.parse(readFileSync14(pkgPath, "utf8")).version : "0.0.0";
var webRoot = [join17(here, "..", "client"), join17(here, "..", "..", "dist", "client")].find((p2) => existsSync18(join17(p2, "index.html"))) ?? join17(here, "..", "client");
async function startHost(opts = {}) {
  const cfg = loadConfig();
  if (opts.root) {
    cfg.root = canon(resolve7(opts.root));
    saveConfig(cfg);
  }
  if (opts.port) {
    cfg.port = opts.port;
    saveConfig(cfg);
  }
  if (!cfg.root) throw new Error("root not set");
  const reg = new Registry(cfg.root);
  if (!reg.rulesInstalled()) reg.installRules("para");
  const host = new Host(cfg, VERSION);
  if (opts.log) host.log = opts.log;
  if (opts.onRoot) host.onRoot = opts.onRoot;
  const gw = new Gateway(host, opts.webRoot ?? webRoot);
  gw.start();
  const urls = gw.addrs.map((a) => `http://${a}:${cfg.port}`);
  return { host, gateway: gw, cfg, urls, stop: () => {
    host.shutdown();
    gw.stop();
  } };
}
async function main(argv) {
  const cmd = argv[0] ?? "start";
  const cfg = loadConfig();
  if (cmd === "init") {
    const root = argv[1];
    if (!root) {
      console.error("\uC0AC\uC6A9\uBC95: folderbot init <\uB8E8\uD2B8 \uD3F4\uB354>  [--preset para|johnny-decimal]");
      process.exit(2);
    }
    const abs = canon(resolve7(root));
    if (!existsSync18(abs)) {
      console.error(`\uD3F4\uB354\uAC00 \uC5C6\uC5B4\uC694: ${abs}`);
      process.exit(2);
    }
    cfg.root = abs;
    saveConfig(cfg);
    const reg = new Registry(abs);
    const pi = argv.indexOf("--preset");
    const preset = pi >= 0 ? argv[pi + 1] : "para";
    if (!reg.rulesInstalled()) {
      reg.installRules(preset);
      console.log(`\uD3F4\uB354 \uADDC\uCE59(${preset})\uC744 ${reg.rulesFile()} \uC5D0 \uC124\uCE58\uD588\uC5B4\uC694.`);
    } else console.log(`\uD3F4\uB354 \uADDC\uCE59\uC774 \uC774\uBBF8 \uC788\uC5B4\uC694: ${reg.rulesFile()}`);
    const c = reg.candidates();
    console.log(`\uD6C4\uBCF4 ${c.length}\uAC1C: ${c.slice(0, 8).map((x2) => x2.rel).join(" \xB7 ")}${c.length > 8 ? " \u2026" : ""}`);
    console.log(`
\uB2E4\uC74C: folderbot start`);
    return;
  }
  if (cmd === "status") {
    const tn = await tailnetInfo();
    console.log(JSON.stringify({ root: cfg.root, port: cfg.port, devices: cfg.devices.map((d) => d.name), data: dataDir(), tailnet: tn }, null, 2));
    return;
  }
  if (cmd === "start" || cmd === "serve") {
    if (!cfg.root) {
      console.error("\uBA3C\uC800 \uB8E8\uD2B8\uB97C \uC815\uD558\uC138\uC694: folderbot init <\uD3F4\uB354>");
      process.exit(2);
    }
    const pi = argv.indexOf("--port");
    if (pi >= 0) {
      cfg.port = Number(argv[pi + 1]);
      saveConfig(cfg);
    }
    const started = await startHost();
    const { host, gateway: gw, urls } = started;
    const tn = await tailnetInfo();
    const pair = gw.openPairing();
    console.log(`
  Folder Bot v${VERSION} \xB7 \uB8E8\uD2B8 ${cfg.root}
  \uC8FC\uC18C: ${urls.join("  ")}${tn.dnsName ? `
  Tailscale: http://${tn.dnsName}:${cfg.port}  (tailscale serve \uB85C HTTPS \uB97C \uBD99\uC774\uBA74 \uD3F0 \uD478\uC2DC\uAC00 \uB429\uB2C8\uB2E4)` : ""}
  \uD398\uC5B4\uB9C1 \uCF54\uB4DC: ${pair.code}  (2\uBD84 \xB7 \uC774 \uD130\uBBF8\uB110\uC5D0\uC11C 'p' + Enter \uB85C \uC0C8 \uCF54\uB4DC)
`);
    if (process.stdin.isTTY) {
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (d) => {
        if (d.trim() === "p") {
          const p2 = gw.openPairing();
          console.log(`  \uC0C8 \uD398\uC5B4\uB9C1 \uCF54\uB4DC: ${p2.code}`);
        }
      });
    }
    const bye = () => {
      host.shutdown();
      gw.stop();
      process.exit(0);
    };
    process.on("SIGINT", bye);
    process.on("SIGTERM", bye);
    return;
  }
  if (cmd === "token") {
    const t = argv[1];
    if (!t) {
      console.log("\uC0AC\uC6A9\uBC95: folderbot token <claude setup-token \uC73C\uB85C \uBC1B\uC740 \uD1A0\uD070>   (\uC9C0\uC6B0\uAE30: folderbot token clear)");
      return;
    }
    cfg.claudeOauthToken = t === "clear" ? void 0 : t;
    saveConfig(cfg);
    console.log(t === "clear" ? "\uD1A0\uD070\uC744 \uC9C0\uC6E0\uC5B4\uC694. \uD0A4\uCCB4\uC778 \uB85C\uADF8\uC778\uC744 \uC501\uB2C8\uB2E4." : "\uD1A0\uD070\uC744 \uC800\uC7A5\uD588\uC5B4\uC694. \uD638\uC2A4\uD2B8\uB97C \uB2E4\uC2DC \uC2DC\uC791\uD558\uBA74 \uC801\uC6A9\uB429\uB2C8\uB2E4.");
    return;
  }
  if (cmd === "pair") {
    console.log("\uD638\uC2A4\uD2B8\uAC00 \uB5A0 \uC788\uB294 \uD130\uBBF8\uB110\uC5D0\uC11C p + Enter \uB97C \uB204\uB974\uBA74 \uC0C8 \uCF54\uB4DC\uAC00 \uB098\uC635\uB2C8\uB2E4. (\uB610\uB294 \uC571 \uC124\uC815 \u203A \uAE30\uAE30 \uC5F0\uACB0)");
    return;
  }
  console.log(`folderbot <init <\uD3F4\uB354> | start [--port N] | status>`);
}
export {
  main,
  startHost
};
/*! Bundled license information:

safe-buffer/index.js:
  (*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> *)
*/
//# sourceMappingURL=index.mjs.map
