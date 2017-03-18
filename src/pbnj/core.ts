namespace pbnj.core {

  var _ = pbnj.core;

  var mori;
  if (module != void 0 && module.exports) {
    module.exports = pbnj.core;
    mori = require('./mori.js');
  }

  // merge mori's API
  var extend = function(target, source, pred) {
    for (var key in source) {
      if (!pred || pred(source[key], key, source, target)) target[key] = source[key];
    }
  };
  _.extend = extend;

  if (typeof mori !== 'undefined') {
    extend(_, mori);
  }
  else {
    throw new Error('mori is required');
  }

  function Syntax(type, value, input) {
    this.type = type;
    this.value = value;
    this.line = input && input.line ? input.line() : 0;
    this.column = input && input.line ? input.column() : 0;
    if (_.isSymbol(input)) {
      this.source = _.str(input);
    }
    else if (input && input.source) {
      this.source = input.source();
    }
    else {
      this.source = 'unknown';
    }
    Object.freeze(this);
  };
  
  Syntax.prototype.toString = function() {
    return _.str('(syntax ', this.value, ')');
  };
  
  Object.freeze(Syntax.prototype);

  _.makeSyntax = function(type, value, input) {
    return new Syntax(type, value, input);
  };

  _['syntax-value'] = function(syn) { return syn.value };
  _['syntax-type'] = function(syn) { return syn.type };
  _['syntax-line'] = function(syn) { return syn.line };
  _['syntax-column'] = function(syn) { return syn.column };

  _.isSyntax = function(val) {
    return val instanceof Syntax;
  };

  _['->string'] = function(obj) { return obj.toString() };

  // Arithmetic
  
  _.add = function(a, b) {
    if (arguments.length === 0) return 0;
    else if (arguments.length === 1) return a;
    else {
      var sum = 0;
      for (var i = 0; i < arguments.length; ++i) {
        sum += arguments[i];
      }
      return sum;
    }
  };

  _.sub = function(a, b) {
    if (arguments.length === 0) return 0;
    else if (arguments.length === 1) return -a;
    else {
      var diff = arguments[0];
      for (var i = 1; i < arguments.length; ++i) {
        diff -= arguments[i];
      }
      return diff;
    }
  };

  _.mult = function(a, b) {
    if (arguments.length === 0) return 1;
    else if (arguments.length === 1) return a;
    else {
      var prod = 1;
      for (var i = 0; i < arguments.length; ++i) {
        prod *= arguments[i];
      }
      return prod;
    }
  };

  _.div = function(a, b) {
    if (arguments.length === 0) return 1;
    else if (arguments.length === 1) return a;
    else {
      var quot = arguments[0];
      for (var i = 1; i < arguments.length; ++i) {
        quot /= arguments[i];
      }
      return quot;
    }
  };

  /**
   * @param {*} val
   * @returns {boolean}
   */
  _.isNumber = function(val) {
    return Object.prototype.toString.call(val) === '[object Number]';
  };

  /**
   * @param {*} val
   * @returns {boolean}
   */
  _.isString = function(val) {
    return Object.prototype.toString.call(val) === '[object String]';
  };

  /**
   * @param {*} val
   * @returns {boolean}
   */
  _.isBoolean = function(val) {
    return val === true || val === false || Object.prototype.toString.call(val) === '[object Boolean]';
  };

  /**
   * @param {*} val
   * @returns {boolean}
   */
  _.isNull = function(val) {
    return val === null;
  };

  /**
   * @param {*} val
   * @returns {boolean}
   */
  _.isUndefined = function(val) {
    return val === void 0;
  };

  /**
   * @param {*} val
   * @returns {boolean}
   */
  _.isDate = function(val) {
    return Object.prototype.toString.call(val) === '[object Date]';
  };

  /**
   * @param {*} val
   * @returns {boolean}
   */
  _.isError = function(val) {
    return Object.prototype.toString.call(val) === '[object Error]';
  };

  /**
   * @param {*} val
   * @returns {boolean}
   */
  _.isRegExp = function(val) {
    return Object.prototype.toString.call(val) === '[object RegExp]';
  };

  /**
   * @param {*} val
   * @returns {boolean}
   */
  _.isFunction = function(val) {
    return Object.prototype.toString.call(val) === '[object Function]';
  };

  /**
   * @param {*} val
   * @returns {boolean}
   */
  _.isArguments = function(val) {
    return Object.prototype.toString.call(val) === '[object Arguments]';
  };

  /**
   * @param {*} val
   * @returns {boolean}
   */
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  _.name = function(sym) { return sym.name };
  _.namespace = function(sym) { return sym.ba };
  
  _.get = function(col, key, alt) {
    if (mori.isCollection(col)) {
      return mori.get(col, key, alt);
    }
    else {
      var val = col[key];
      return val != null
               ? val
               : alt == null
                   ? null
                   : alt;
    }
  };

  /** @interface */
  pbnj.IArray = function() {};
  pbnj.IArray.prototype.length = 0;
  
  /** @typedef {(Array<*>|pbnj.IArray)} */
  pbnj.ArrayLike;
  
  var optimizeCb = function(func, context, argCount) {
    if (context === void 0) return func;
    switch (argCount == null ? 3 : argCount) {
      case 1: return function(value) {
        return func.call(context, value);
      };
      case 2: return function(value, other) {
        return func.call(context, value, other);
      };
      case 3: return function(value, index, collection) {
        return func.call(context, value, index, collection);
      };
      case 4: return function(accumulator, value, index, collection) {
        return func.call(context, accumulator, value, index, collection);
      };
    }
    return function() {
      return func.apply(context, arguments);
    };
  };

  /**
   * Convert an Array like object into an instance of Array.
   * 
   * @param {(pbnj.ArrayLike|null)} obj
   * @returns {Array<*>}
   */
  _.toArray = function(obj) {
    if (!obj) return [];
    else if (_.isArray(obj)) return obj;
    else if (mori.isCollection(obj)) {
      return mori.intoArray(obj);
    }
    else {
      return Array.prototype.slice.call(obj);
    }
  };

  /**
   * @params {Object} obj
   * @returns {boolean}
   */
  _.isArray = Array.isArray || function(obj) {
    return Object.prototype.toString.call(obj) === '[object Array]';
  };

  var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;
  /**
   * @param {Object} obj
   * @returns {boolean}
   */
  _.isArrayLike = function(obj) {
    var length = obj && obj.length;
    return typeof length === 'number' && length >= 0 && length <= MAX_ARRAY_INDEX;
  };

  _.first = function(obj) {
    if (mori.isCollection(obj)) return mori.first(obj);
    return _.isArrayLike(obj) ? obj[0] : _.values(obj)[0];
  };

  _.last = function(obj) {
    if (mori.isCollection(obj)) return mori.last(obj);
    var a = _.isArrayLike(obj) ? obj : _.values(obj);
    return a[a.length - 1];
  };

  _.rest = function(obj) {
    if (mori.isCollection(obj)) return mori.rest(obj);
    var a = _.isArrayLike(obj) ? _.toArray(obj) : _.values(obj);
    return a.slice(1);
  };

  /**
   * @param {pbnj.ArrayLike} obj
   * @returns {number}
   */
  _.size = function(obj) {
    if (obj == null) return 0;
    return _.isArrayLike(obj) ? obj.length : _.keys(obj).length;
  };

  /**
   * @param {*} val
   * @returns {*}
   */
  _.identity = function(val) { return val };

  /**
   * @param {*} val
   * @returns {Function}
   */
  _.always = function (val) {
    return function () { return val }
  };

  /**
   * @param {Object} obj
   * @param {Function} fn
   * @returns {{}}
   */
  _.mapObject = function(obj, fn) {
    var keys = _.keys(obj);
    var results = {};
    for (var i = 0; i < keys.length; ++i) {
      results[keys[i]] = fn(obj[keys[i]], keys[i], obj);
    }
    return results;
  };

  /**
   * @param {Function} func
   * @param {?Function} hasher
   * @returns {Function}
   */
  _.memoize = function(func, hasher) {
    var memoize = function(key) {
      var cache = memoize.cache;
      var address = '' + (hasher ? hasher.apply(this, arguments) : key);
      if (!_.has(cache, address)) cache[address] = func.apply(this, arguments);
      return cache[address];
    };
    memoize.cache = {};
    return memoize;
  };

  /**
   * @param {Object} obj
   * @returns {boolean}
   */
  _.isObject = function(obj) {
    var type = typeof obj;
    return  type === 'function' || type === 'object' && !!obj;
  };

  /**
   * @param {Object} obj
   * @param {string} key
   * @returns {*}
   */
  _.has = _.hasKey = function(obj, key) {
    if (mori.isCollection(obj)) {
      return mori.hasKey(obj, key);
    }
    else {
      return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
    }
  };

  /**
   * @params {Object}
   * @returns {Array<*>}
   */
  _.keys = function(obj) {
    if (mori.isAssociative(obj)) {
      return mori.keys(obj);
    }
    else {
      if (!_.isObject(obj)) return [];
      if (Object.keys) return Object.keys(obj);
      var keys = [];
      for (var key in obj) if (_.has(obj, key)) keys.push(key);
      return keys;
    }
  };

  /**
   * @params {Object}
   * @returns {Array<*>}
   */
  _.values = function(obj) {
    if (mori.isAssociative(obj)) {
      return mori.values(obj);
    }
    else {
      if (!_.isObject(obj)) return [];
      if (Object.values) return Object.values(obj);
      var values = [];
      for (var key in obj) if (_.has(obj, key)) values.push(obj[key]);
      return values;
    }
  };
  
  /**
   * Coerce values into strings and concatenate arguments
   *
   * @param {...*} args
   * @returns {string}
   */
  _.str = function(/* args */) {
    if (arguments.length === 0) return '';
    else if (arguments.length === 1) return '' + arguments[0];
    else {
      return Array.prototype.slice.call(arguments).join('');
    }
  };

  /**
   * Return new copy of object with the given key and it's
   * associated value removed
   *
   * @param {Object} obj
   * @param {string} key
   * @returns {Object}
   */
  _.dissoc = function(obj, key) {
    if (mori.isAssociative(obj)) {
      return mori.dissoc(obj, key);
    }
    else {
      var newObj = {}, k;
      for (k in obj) if (k !== key) newObj[k] = obj[k];
      return newObj;
    }
  };

  /**
   * Return a new copy of object with the given key and value added
   *
   * @param {Object} obj
   * @param {string} key
   * @param {*} val
   * @returns {Object}
   */
  _.assoc = function(obj, key, val) {
    if (mori.isAssociative(obj)) {
      return mori.assoc(obj, key, val);
    }
    else {
      var newObj = {}, k;
      for (k in obj) newObj[k] = obj[k];
      newObj[key] = val;
      return newObj;
    }
  };

  /**
   * 
   * @param {Object} o1
   * @param {Object} o2
   * @returns {Object}
   */
  _.merge = function (o1, o2) {
    if (mori.isAssociative(o1) && mori.isAssociative(o2)) {
      return mori.merge(o1, o2);
    }
    else {
      var o = {}, k;
      for (k in o1) o[k] = o1[k];
      for (k in o2) o[k] = o2[k];
      return o;
    }
  };

  /**
   * @param {*} val
   * @returns {boolean}
   */
  _.exists = function(val) { return val != null };

  _.cons = function(v, col) {
    return mori.cons(v, col);
  };

  /**
   * @param {...*}
   * @returns {Array<*>}
   */
  _.cat = function(/* args */) {
    var args = _.toArray(arguments);
    return [].concat.apply(args[0], args.slice(1, args.length));
  };
  
  /**
   * @params {Array<*>}
   * @returns {Array<Array<*>>}
   */
  _.pair = function (a) {
    var i, pairs;
    if (mori.isCollection(a)) {
      pairs = mori.vector();
      for (i = 0; i < mori.count(a); i += 2) {
        pairs = mori.conj(pairs, mori.vector(mori.nth(a, i), mori.nth(a, i+1)));
      }
    }
    else {
      pairs = [];
      for (i = 0; i < a.length; i += 2) {
        pairs.push([a[i], a[i+1]]);
      }
    }
    return pairs;
  };

  var flatten = function(input, shallow, strict, startIndex) {
    var output = [], idx = 0;
    for (var i = startIndex || 0; i < input.length; i++) {
      var value = input[i];
      if (_.isArrayLike(value) && (_.isArray(value) || _.isArguments(value))) {
        if (!shallow) value = flatten(value, shallow, strict);
        var j = 0, len = value.length;
        output.length += len;
        while (j < len) {
          output[idx++] = value[j++];
        }
      } else if (!strict) {
        output[idx++] = value;
      }
    }
    return output;
  };

  _.flatten = function(array, shallow) {
    return flatten(array, shallow, false);
  };

  /**
   * 
   * @param {pbnj.ArrayLike} obj
   * @param {Function} fn
   * @param {?Object} context
   * @returns {*}
   */
  _.each = _.forEach = function(obj, fn) {
    if (mori.isCollection(obj)) {
      mori.each(obj, fn);
      return obj;
    }
    else {
      var iteratee = optimizeCb(fn);
      var i, length;
      if (_.isArrayLike(obj)) {
        for (i = 0, length = obj.length; i < length; i++) {
          iteratee(obj[i], i, obj);
        }
      }
      else {
        var keys = _.keys(obj);
        for (i = 0, length = keys.length; i < length; i++) {
          iteratee(obj[keys[i]], keys[i], obj);
        }
      }
      return obj;
    }
  };

  /**
   * @param {pbnj.ArrayLike} a
   * @param {Function} fn
   * @returns {Array<*>}
   */
  _.map = function (obj, fn) {
    if (mori.isCollection(obj)) {
      return mori.map(fn, obj);
    }
    else {
      var iteratee = optimizeCb(fn);
      var results = [], i;
      if (_.isArrayLike(obj)) {
        for (i = 0; i < obj.length; ++i) {
          results.push(iteratee(obj[i], i));
        }
      }
      else {
        var keys = _.keys(obj);
        for (i = 0; i < keys.length; ++i) {
          results.push(iteratee(obj[keys[i]], keys[i]));
        }
      }
      return results;
    }
  };

  /**
   * @param {pbnj.ArrayLike} a
   * @param {string} prop
   * @param {?Object} context
   * @returns {Array<*>}
   */
  _.pluck = function (a, prop, context) {
    return _.map(a, function (val) { return _.get(val, prop) }, context);
  };

  /**
   * @param {pbnj.ArrayLike} a
   * @param {string} prop
   * @param {...*}
   * returns {Array<*>}
   */
  _.invoke = function (a, prop) {
    var args = _.toArray(arguments).slice(2);
    return _.map(a, function (val) { return val[prop].apply(val, args) });
  };
  
  /**
   * @param {pbnj.ArrayLike} a
   * @param {Function} fn
   * @returns {Array<*>}
   */
  _.mapcat = function (a, fn) {
    if (mori.isCollection(a)) {
      return mori.mapcat(fn, a);
    }
    else {
      var a = _.map(a, fn), newA = [], i;
      for (i = 0; i < a.length; ++i) {
        newA = newA.concat(a[i]);
      }
      return newA;
    }
  };

  /**
   * @param {pbnj.ArrayLike} obj
   * @param {Function} fn
   * @param {?Object} context
   * @returns {Array<*>}
   */
  _.filter = function (obj, fn) {
    if (mori.isCollection(obj)) {
      return mori.filter(fn, obj);
    }
    else {
      var iteratee = optimizeCb(fn);
      var i, results = [];
      if (_.isArrayLike(obj)) {
        for (i = 0; i < obj.length; ++i) {
          if (iteratee(obj[i], i)) results.push(obj[i]);
        }
      }
      else {
        var keys = _.keys(obj);
        for (i = 0; i < keys.length; ++i) {
          if (iteratee(obj[keys[i]], keys[i])) results.push(obj[keys[i]]);
        }
      }
      return results;
    }
  };

  /**
   * @param {pbnj.ArrayLike} obj
   * @param {Function} fn
   * @param {?Object} context
   * @returns {Array<*>}
   */
  _.reject = _.remove = function (obj, fn) {
    if (mori.isCollection(obj)) {
      return mori.remove(fn, obj);
    }
    else {
      var iteratee = optimizeCb(fn);
      var i, results = [];
      if (_.isArrayLike(obj)) {
        for (i = 0; i < obj.length; ++i) {
          if (!iteratee(obj[i], i)) results.push(obj[i]);
        }
      }
      else {
        var keys = _.keys(obj);
        for (i = 0; i < keys.length; ++i) {
          if (!iteratee(obj[keys[i]], keys[i])) results.push(obj[keys[i]]);
        }
      }
      return results;
    }
  };

  /**
   * @param {pbnj.ArrayLike} obj
   * @param {Function} fn
   * @param {?*} memo
   * @param {?Object} context
   * @returns {*}
   */
  _.reduce = _.foldl = function (obj, fn, memo) {
    if (mori.isCollection(obj)) {
      return memo === void 0 ? mori.reduce(fn, obj) : mori.reduce(fn, memo, obj);
    }
    else {
      var iteratee = optimizeCb(fn, null, 4);
      var i;
      if (_.isArrayLike(obj)) {
        for (i = 0; i < obj.length; ++i) {
          if (memo == null && i === 0) memo = obj[i];
          memo = iteratee(memo, obj[i], i, obj);
        }
      }
      else {
        var keys = _.keys(obj);
        for (i = 0; i < keys.length; ++i) {
          if (memo == null && i === 0) memo = obj[keys[i]];
          memo = iteratee(memo, obj[keys[i]], keys[i], obj);
        }
      }
      return memo;
    }
  };

  /**
   * @param {pbnj.ArrayLike} obj
   * @param {Function} fn
   * @param {?*} memo
   * @param {?Object} context
   * @returns {*}
   */
  _.reduceRight = _.foldr = function (obj, fn, memo, context) {
    if (mori.isCollection(obj)) {
      return mori.reduceRight(fn, obj);
    }
    else {
      var iteratee = optimizeCb(fn, context, 4);
      var i, init;
      if (_.isArrayLike(obj)) {
        init = (obj.length - 1);
        for (i = init; i >= 0; --i) {
          if (memo == null && i === init) memo = obj[i];
          memo = iteratee(memo, obj[i], i, obj);
        }
      }
      else {
        var keys = _.keys(obj);
        init = (keys.length - 1);
        for (i = init; i >= 0; --i) {
          if (memo == null && i === init) memo = obj[keys[i]];
          memo = iteratee(memo, obj[keys[i]], keys[i], obj);
        }
      }
      return memo;
    }
  };

  _.min = function(a) {
    return _.reduce(a, function(memo, n) {
      return memo < n ? memo : n;
    }, null);
  };

  _.max = function(a) {
    return _.reduce(a, function(memo, n) {
      return memo > n ? memo : n;
    }, null);
  };

  _.any = function(a, fn) {
    return _.filter(a, fn).length !== 0;
  };

  _.all = function(a, fn) {
    return a.length === _.filter(a, fn).length;
  };

  // Array -> Array
  _.uniq = function (a) {
    var set = _.into(_.set(), a);
    return _.intoArray(set);
  };

} // namespace