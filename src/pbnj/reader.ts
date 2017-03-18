/*goog.provide('pbnj.reader');

goog.require('pbnj.core');*/

namespace pbnj.reader {

  var _, pair;
  if (module != void 0 && module.exports) {
    _ = require('./pbnj.core.js');
    pair = _.pair;
  }
  else {
    pair = pbnj.core.pair;
    _ = pbnj.core;
  }

  // should support full EDN spec
  // see: https://github.com/edn-format/edn
  //
  // also look to the Clojure reader spec for ideas
  // see: http://clojure.org/reference/reader 

  function inputStream(input, sourceName) {
    var pos = 0, line = 1, col = 0;
    return {
      next: next,
      peek: peek,
      peekAhead: peekAhead,
      eof: eof,
      croak: croak,
      source: source,
      line: lineNumber,
      column: columnNumber
    };
    function source() { return sourceName }
    function lineNumber() { return line }
    function columnNumber() { return col }
    function next() {
      var ch = input.charAt(pos++);
      if (ch === "\n") {
        line++;
        col = 0;
      }
      else {
        col++;
      }
      return ch;
    }
    function peekAhead() {
      return input.charAt(pos+1);
    }
    function peek() {
      return input.charAt(pos);
    }
    function eof() {
      return peek() == "";
    }
    function croak(msg) {
      throw new Error(msg + " at (" + line + ":" + col + ")");
    }
  }

  var WHITESPACE_CHARS = {
    " ": true,
    "\n": true,
    "\t": true,
    ",": true
  };

  var COLLECTION_START = {
    '(': 'list',
    '[': 'vector',
    '{': 'map',
    '#': 'set'
  };

  var COLLECTION_END = {
    '(': ')',
    '[': ']',
    '{': '}',
    '#': '}',
  };

  var COLLECTION_END_NAME = {
    ')': 'list',
    ']': 'vector',
    '}': 'map',
    //'}': 'set',
  };

  var TYPE_DISPATCH = {
    mori: {
      string: function (rep) { return rep },
      symbol: function (rep) { return mori.symbol.apply(mori, rep === '/' ? [rep] : rep.split('/')) },
      boolean: function (rep) { return rep === 'true' ? true : false; },
      nil: function (rep) { return null },
      number: function (rep) { return parseFloat(rep) },
      list: function (rep) { return mori.list.apply(mori, rep) },
      vector: function (rep) { return mori.vector.apply(mori, rep) },
      set: function (rep) { return mori.set(rep) },
      map: function (rep) { return mori.hashMap.apply(mori, rep) },
      keyword: function (rep) { return mori.keyword.apply(mori, rep === '/' ? [rep] : rep.split('/')) },
      quote: function (form) { return mori.list(mori.symbol('quote'), form) }
    },
    js: {
      string: function (rep) { return rep },
      symbol: function (rep) { return Symbol(rep) },
      boolean: function (rep) { return rep === 'true' ? true : false; },
      nil: function (rep) { return null },
      number: function (rep) { return parseFloat(rep) },
      list: function (rep) { return rep },
      vector: function (rep) { return rep },
      set: buildSet,
      map: buildMap,
      keyword: function (rep) { return rep },
      quote: function (form) { return ['quote', form] }
    }
  };


  var ESCAPE_CHARS = {
    n: true,
    r: true,
    t: true,
    v: true,
    b: true,
    f: true,
    u: true
  };

  function buildSet(rep) {
    var set = {};
    for (var i = 0; i < rep.length; ++i) {
      set[rep[i]] = true;
    }
    return set;
  }

  function buildMap(rep) {
    var pairs = pair(rep);
    var map = {};
    for (var i = 0; i < pairs.length; ++i) {
      map[pairs[i][0]] = pairs[i][1];
    }
    return map;
  }

  // TODO: add rationals, dates (#inst ...) and regexes
  function tokenStream(input, dispatch) {
    var dispatch = dispatch || TYPE_DISPATCH.mori;
    var current = null;
    return {
      next: next,
      peek: peek,
      eof: eof,
      source: input.source,
      line: input.line,
      column: input.column,
      croak: input.croak
    };

    function isDigit(ch) {
      return /[0-9\_\,]/.test(ch);
    }

    function isWhitespace(ch) {
      return !!WHITESPACE_CHARS[ch];
    }

    function isSymbol(ch) {
      return /[a-zA-Z0-9_\.\/\-\!\?\*\$\=\<\>\&\+\~\|\%]/.test(ch);
    }

    function isKeywordStart(ch) {
      return ch === ':';
    }

    function isQuoteStart(ch) {
      return ch === "'";
    }

    function isCollStart(ch) {
      return !!COLLECTION_START[ch];
    }

    function readWhile(pred) {
      var buffer = [];
      while (!input.eof() && pred(input.peek())) {
        buffer.push(input.next());
      }
      return buffer.join('');
    }

    function skipComment() {
      readWhile(function(ch) { return ch != "\n" });
      input.next();
    }

    function readEscaped(end) {
      var escaped = false, buffer = [];
      input.next();
      while (!input.eof()) {
        var ch = input.next();
        if (escaped) {
          if (ESCAPE_CHARS[ch]) {
            buffer.push(_.str('\\', ch));
          }
          else {
            buffer.push(ch);
          }
          escaped = false;
        }
        else if (ch == "\\") {
          escaped = true;
        }
        else if (ch == end) {
          break;
        }
        else {
          buffer.push(ch);
        }
      }
      return buffer.join('');
    }

    function readString() {
      return dispatch.string(readEscaped('"'));
    }

    function readNumber(hasSign) {
      var hasDot = false;
      var sign = hasSign ? input.next() : null;
      var num = readWhile(function(ch) {
        if (ch === '.') {
          if (hasDot) throw new Error("unexpexted '.'");
          hasDot = true;
          return true;
        }
        if (hasSign && (ch === '-' || ch === '+')) {
          throw new Error(_.str("unexpected '", ch, "'"));
        }
        return isDigit(ch);
      });
      num = _.str(sign, num.replace(/[,_]/g, ''));
      return dispatch.number(hasDot ? parseFloat(num) : parseInt(num));
    }

    function readSymbol() {
      var sym = readWhile(isSymbol);
      if (sym === 'true' || sym === 'false') {
        return dispatch.boolean(sym);
      }
      else if (sym === 'nil') {
        return dispatch.nil(sym);
      }
      else {
        return dispatch.symbol(sym);
      }
    }

    function readKeyword() {
      input.next();
      var head = '';
      if (input.peek() === ':') {
        head = input.peek();
        input.next();
      }
      var kw = readWhile(isSymbol);
      return dispatch.keyword(_.str(head, kw));
    }

    function readCollection(tag, end) {
      var buffer = [];
      if (tag === 'set') input.next();
      while (!input.eof()) {
        var ch = input.next();
        if (ch === end || input.peek() === end) {
          break;
        }
        else {
          buffer.push(readNext());
        }
      }
      return dispatch[tag](buffer);
    }

    function readQuotedForm() {
      input.next();
      return dispatch.quote(readNext());
    }

    function readNext() {
      readWhile(isWhitespace);
      if (input.eof()) return null;

      var ch = input.peek();
      if (ch === ";") {
        skipComment();
        return readNext();
      }
      else if (ch === '"') {
        return readString();
      }
      else if (isDigit(ch) || (ch === '-' || ch === '+') && isDigit(input.peekAhead())) {
        return readNumber(ch === '-' || ch === '+');
      }
      else if (isSymbol(ch)) {
        return readSymbol();
      }
      else if (ch === ':') {
        return readKeyword();
      }
      else if (ch === "'") {
        return readQuotedForm();
      }
      else if (isCollStart(ch)) {
        return readCollection(COLLECTION_START[ch], COLLECTION_END[ch]);
      }
      else if (!!COLLECTION_END_NAME[ch]) {
        input.next();
        return readNext();
      }
      else {
        input.croak("Can't handle character: '" + ch + "'");
      }
    }

    function peek() {
      return current || (current = readNext());
    }

    function next() {
      var token = current;
      current = null;
      return token || readNext();
    }

    function eof() {
      return peek() == null;
    }
  }

  /**
   * @param {string} str
   * @returns {Array<Object>}
   */
  function readString(str, input) {
    if (str == null || typeof str !== 'string') return [];
    var tokens = [];
    return tokenStream(inputStream(str, input || 'string-input'));
  }

  var readFile = null;
  if (module != void 0 && module.exports) {
    var fs = require('fs');
    /**
     * @param {string} str
     * @returns {Array<Object>}
     */
    var readFileNode = function(file, dispatch) {
      if (file == null || typeof file !== 'string') return [];
      var str = fs.readFileSync(file).toString();
      if (/^#!/.test(str)) {
        str = str.split("\n").slice(1).join("\n");
      }
      return readString(str, file);
    };
  }
  else {
    var readFileBrowser = function(file) {
      var xhr = new XMLHttpRequest();
      var res = null;
      xhr.onreadystatechange = function() {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status === 200) {
            res = xhr.responseText;
          }
          else {
            throw new Error(_.str("There was an error processing the path: '", file, "'"));
          }
        }
      };
      xhr.open('GET', file, false);
      xhr.send();
      return readString(res, file);
    };
  }


  var readJS = function(exp) {
    if (exp === null || exp === void 0) return null;
    var type = typeof exp;
    switch (type) {
      case 'boolean':
      case 'number':
        return exp;
      case 'string':
        if (exp.startsWith('"') && exp.endsWith('"')) {
          return exp;
        }
        else if (exp.startsWith(':')) {
          return _.keyword(exp);
        } 
        else {
          return _.symbol(exp);
        }
      case 'object':
        if (_.isArray(exp)) {
          return _.list.apply(null, _.map(exp, readJS));
        }
        else {
          return _.reduce(exp,
                     function (hmap, value, key) {
                       return _.assoc(hmap, _.keyword(key), readJS(value)) }, _.hashMap());
        }
      default:
        throw new Error(_.str("'", exp, "' is an invalid expression"));
    }
  };

  var readJSON = function(str) {
    return readJS(JSON.parse(str));
  };

  pbnj.reader = {
    inputStream: inputStream,
    tokenStream: tokenStream,
    readString: readString,
    readJS: readJS,
    readJSON: readJSON,
    readFile: module != void 0 && module.exports ? readFileNode : readFileBrowser,
    TYPE_DISPATCH: TYPE_DISPATCH
  };

  if (module != void 0 && module.exports) {
    module.exports = pbnj.reader;
  }
}