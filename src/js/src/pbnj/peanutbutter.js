goog.provide('pbnj.peanutbutter');

goog.require('pbnj.jess');
goog.require('pbnj.reader');
goog.require('pbnj.util');

goog.scope(function() {
  'use strict';

  /** @const */
  var pb = pbnj.peanutbutter;
  var jess = pbnj.jess;
  //var _ = pbnj.util;
  
  var str = pbnj.util.str;
  var assoc = pbnj.util.assoc;

  /** @const */
  var HAVE_WS = typeof wonderscript !== 'undefined';

  if (HAVE_WS) {
    /** @const */
    var ws = wonderscript;
  }

  /**
   * @param {*} exp
   * @return {boolean}
   */
  function isNil(exp) {
    return (_.isArray(exp) && _.size(exp) === 0) || !_.exists(exp);
  }

  /**
   * walk trees
   *
   * @param {Function} inner
   * @param {Function} outer
   * @param {(Array|Object)} form
   * @return {(Array|Object)}
   */
  function walk(inner, outer, form) {
    if (isNil(form)) return outer([]);
    else if (_.isArray(form)) return outer(util.map(form, inner));
    else {
      return outer(inner(form));
    }
  }

  function verify(prop, proto, success, failure) {
    if (_.exists(proto) && _.exists(proto[prop])) {
      if (success) return success(proto[prop], prop, proto);
      else {
        return proto[prop];
      }
    }
    else {
      if (failure) return failure(prop, proto);
      else {
        throw new Exception(str("'", prop, "' is required"));
      }
    }
  }

  function defaultTo(prop, proto, def) {
    return verify(prop, proto, null, function() { return def; });
  }

  var pp = _.memoize(function(forms) {
    function outer(form) {
      if (_.isArray(form)) return str('[', form.join(', '), ']');
      else {
        return form;
      }
    }

    function inner(form) {
      if (_.isArray(form)) return pp(form);
      else if (_.isObject(form) && !_.isFunction(form)) {
        var objStr = _.reduce(form, function(memo, value, key) {
          var pair = str("'", key, "':", pp(value));
          if (memo) return str(memo, ', ', pair);
          else {
            return pair;
          }
        }, null);
        return str('{', objStr, '}');
      }
      else if (typeof(form) === 'string') {
        return str("'", form, "'");
      }
      else {
        return str(form);
      }
    }

    return walk(inner, outer, forms);
  });

  // HTML Generation
  // ---------------

  function isPromise(obj) {
    return obj && obj.then && obj.catch;
  }

  /**
   * An expression
   * @interface
   */
  function Exp() {}

  /** @return {string} */
  Exp.prototype.toHTML = function() {};

  /** @return {promise} */
  Exp.prototype.toPromise = function() {};

  /**
   * An HTML Tag
   * @final
   * @constructor
   * @implements {Exp}
   *
   * @param {string} name
   * @param {Object} attrs
   * @param {Array} children
   * @param {Object} env
   */
  function Tag(name, attrs, children, env) {
    var children = children || [],
        attrs = attrs || {};

    var kids = new TagList(children, env);
    this.length = kids.length;
    this.pb$lang$children = kids;

    for (var i = 0; i < this.length; ++i) {
      this[i] = kids[i];
    }

    this.pb$lang$name = name;
    this.pb$lang$attrs = attrs;
    this.pb$lang$env = env;
  }

  Tag.prototype.name = function() { return this.pb$lang$name };
  Tag.prototype.attrs = function() { return this.pb$lang$attrs };
  Tag.prototype.children = function() { return this.pb$lang$children };
  Tag.prototype.env = function() { return this.pb$lang$env };

  Tag.prototype.id = function() {
    return this['data-element-id'];
  };

  Tag.prototype.attr = function(k) {
    return this.attrs()[k];
  };

  /**
   * @param {string} k
   * @return {boolean}
   */
  Tag.prototype.has = function(k) {
    return typeof this.pb$lang$attrs[k] !== 'undefined';
  };

  Tag.prototype.definition = function() {
    return this.env()[this.name()];
  };

  Tag.prototype.toHTML = function(opts) {
    var code,
        id = genID(),
        attrs = this.attrs()
        env = assoc(this.env(), 'id', id);

    if (isNil(this.children())) {
      code = str('<', this.name(), renderAttrs(attrs, env), '>');
    }
    else {
      code = str('<', this.name(), renderAttrs(attrs, env), '>',
              this.children().toHTML(opts),
              '</', this.name(), '>');
    }

    return code;
  };

  /**
   * @override
   * @returns {Promise}
   */
  Tag.prototype.toPromise = function() {
    var attrs;

    if (_.any(this.attrs(), isPromise)) {
      attrs = Promise.all(_.chain(this.attrs())
                           .map(function(value, name) {
                              if (!isPromise(value)) return [name, value];
                              return value.then(function(val) {
                                return [name, val];
                              });
                            })
                           .value())
                      .reduce(function(amap, attr) {
                         return assoc(amap, attr[0], attr[1]);
                      }, {});
    }
    else {
      attrs = Promise.all([this.attrs()]).spread(_.identity);
    }

    var self = this;
    return attrs.then(function(val) {
      if (isNil(self.children())) {
        return str('<', self.name(), renderAttrs(val, self.env()), '>');
      }
      else {
        return self.children().then(function(chHTML) {
          return str('<', self.name(), renderAttrs(val, self.env()), '>',
                     chHTML,
                     '</', self.name(), '>');
        });
      }
    })
    .catch(function(error) {
      console.error('Error: ', error);
      console.error(str('\n', stackTrace(pb.stack).join('\n')));
    });
  };

  Tag.prototype.then = function(fn) { return this.toPromise().then(fn); };

  /**
   * Build a Tag from JS object format
   *
   * @param {*} form
   * @param {Object} env
   * @return {Tag}
   */
  function tag(form, env) {
    var tag = pb.macroExpand(form),
        tagName = name(tag),
        rest = content(tag),
        attr = hasAttrs(tag) ? attrs(tag) : {},
        id = genID();

    attr['data-element-id'] = id;
    attr.id = attr.id || id;

    env = _.merge(env, attr); // add attr values to scope
    env = _.merge(env,
             _.mapObject(attr,
                function(v) {
                  return env[v] || v; })); // lookup values in scope

    return new Tag(tagName, attr, rest, env);
  }

  /**
   * An atomic value
   * @final
   * @constructor
   * @implements {Exp}
   *
   * @param {(string|boolean|number)} value
   * @param {Object} env
   */
  function Atom(value, env) {
    this.pb$lang$value = value;
    this.pb$lang$env = env;
  }

  Atom.prototype.valueOf = function() { return this.pb$lang$value; };

  Atom.prototype.env = function(k) {
    if (typeof k !== 'undefined') return this.pb$lang$env[k];
    return this.pb$lang$env;
  };

  Atom.prototype.toString = function() {
    return this.valueOf().toString();
  };

  Atom.prototype.toHTML = function() {
    var v = this.env(this.valueOf());
    if (typeof v !== 'undefined') return v.toString();
    return this.toString();
  };

  Atom.prototype.toPromise = function(opts) {
    return Promise.resolve(this.toHTML(opts));
  };

  Atom.prototype.then = function(fn) {
    return this.toPromise().then(fn);
  };

  /**
   * A Nil value null | undefined
   */
  var Nil = {
    toHTML: function() { return '' },
    toPromise: function() { return Promise.resolve('') },
    then: function(fn) { return this.toPromise().then(fn) }
  };

  function scope(value, env) {
    var env = env || {},
        bindings = _.mapObject(value[1],
                        function(v) { return env[v] || v });
    return new TagList(value.slice(2), _.merge(env, bindings));
  }

  /**
   * An expression list
   * @final
   * @constructor
   * @implements {Exp}
   *
   * @param {Array} value
   * @param {Object} env
   */
  function TagList(value, env) {
    this.pb$lang$value = value;
    this.pb$lang$env = env;

    var kids = _.map(value, function(f) { return pb.eval(f, {env: env}) });
    this.pb$lang$children = kids;
    this.length = value ? value.length : 0;
    var i = 0;
    for (; i < this.length; ++i) {
      this[i] = kids[i];
    }
  }

  TagList.prototype.valueOf = function() { return this.pb$lang$value; };

  TagList.prototype.env = function() { return this.pb$lang$env; };

  TagList.prototype.children = function() { return this.pb$lang$children; };

  TagList.prototype.toHTML = function(opts) {
    return _.chain(this.children())
            .map(function(ch) {
                return ch.toHTML(opts); })
            .value()
            .join('');
  };

  /**
   * Partially render and wrap in a promise
   *
   * @param {?Object} opts
   * @return {Promise}
   */
  TagList.prototype.toPromise = function(opts) {
    var kids = _.chain(this.children())
                .map(function(ch) {
                  return ch.toPromise
                            ? ch.toPromise()
                            : isPromise(ch)
                                ? ch.then(function (exp) { return pb.eval(exp) })
                                : ch })
                .value();

    return Promise.all(kids).then(function(kids) { return kids.join(''); });
  };

  TagList.prototype.then = function(fn) {
    return this.toPromise().then(fn);
  };

  function renderTagList(list) {
    return mori.reduce(
              function (s, exp) {
                return str(s, pb.eval(exp)) }, "", list);
  }

  function fmtAttrs(attrs) {
    var makePairs = function(pair) { return str(mori.first(pair), '="', mori.second(pair), '"') };
    return mori.intoArray(mori.map(makePairs, attrs)).join(' ');
  }

  pb.eval = function (exp) {
    if (exp == null || mori.isSymbol(exp) && mori.equals(mori.symbol('nil'), exp)) {
      return '';
    }
    else if (typeof exp === 'string' || typeof exp === 'number' || mori.isSymbol(exp)) {
      return str(exp);
    }
    else if (mori.isList(exp) || mori.isVector(exp) || pbnj.util.isArray(exp)) {
      if (mori.isEmpty(exp)) return '';
      // evaluate as a tag list
      else if (!mori.isSymbol(mori.first(exp))) {
        return renderTagList(exp);
      }
      // evaluate as a teg
      else {
        var tag = mori.first(exp);
        // evaluate as a tag with attributes
        if (mori.isMap(mori.second(exp))) {
          var attrs = mori.second(exp);
          var rest = mori.rest(mori.rest(exp));
          return str('<', tag, ' ', fmtAttrs(attrs), '>', renderTagList(rest), '</', tag, '>'); 
        }
        // evaluate as a tag without attributes
        else {
          var rest = mori.rest(exp);
          return str('<', tag, '>', renderTagList(rest), '</', tag, '>'); 
        }
      }
    }
    else {
      throw new Error(str("'", exp, "' is an invalid expression"));
    }
  };

  pb.readString = function (input) {
    return pbnj.reader.readString(input);
  };

  pb.readJSON = function(input) {
    return pb.readJS(JSON.parse(input));
  };

  pb.readJS = function(exp) {
    var tag, attrs, rest;

    if (exp == null) return mori.symbol('nil');
    else if (typeof exp === 'number') return exp;
    else if (typeof exp === 'string') {
      if (/^".*"$/.test(exp)) {
        return exp.replace(/^"/, '').replace(/"$/, '');
      }
      return mori.symbol(exp);
    }
    else if (typeof exp === 'object') {
      if (exp instanceof Array) {
        if      (exp.length === 0) return mori.symbol('nil');
        else if (typeof exp[0] !== 'string') {
          return mori.map(pb.readJS, exp);
        }
        // evaluate as a tag
        else {
          tag = exp[0];
          // evaluate as a tag with attributes
          if ( typeof exp[1] === 'object' && exp[1].__proto__.__proto__ == null ) {
            attrs = exp[1];
            rest = exp.slice(2);
            return mori.intoArray(mori.concat(mori.vector(mori.symbol(tag), mori.toClj(attrs)), mori.map(pb.readJS, rest)));
          }
          // evaluate as a tag without attributes
          else {
            rest = exp.slice(1);
            return mori.intoArray(mori.concat(mori.vector(mori.symbol(tag)), mori.map(pb.readJS, rest)));
          }
        }
      }
      else {
        return str(exp);
      }
    }
    else {
      throw new Error(str("'", exp, "' is an invalid expression"));
}
  };

  function isAtom(obj) {
    return !_.isObject(obj) && typeof(obj) !== 'undefined';
  }

  function isTag(exp) {
    return _.isArray(exp) && typeof(_.first(exp)) === 'string';
  }

  function children(tag) {
    if (isNil(tag) || !isTag(tag)) return [];
    else {
      if (hasAttrs(tag)) return _.filter(_.rest(_.rest(tag)), isTag);
      else {
        return _.filter(_.rest(tag), isTag);
      }
    }
  }

  function text(tag) {
    if (isNil(tag) || !isTag(tag)) return [];
    else {
      if (hasAttrs(tag)) {
        return _.reject(_.rest(_.rest(tag)), isTag);
      }
      else {
        return _.reject(_.rest(tag), isTag);
      }
    }
  }

  function content(tag) {
    if (isNil(tag) || !isTag(tag)) return [];
    else {
      if (hasAttrs(tag)) {
        return _.rest(_.rest(tag));
      }
      else {
        return _.rest(tag);
      }
    }
  }

  function name(tag) { return tag[0] }

  function hasAttrs(exp) {
    return isTag(exp) && isAttrs(_.first(_.rest(exp)));
  }

  function attrs(form) { return _.first(_.rest(form)) }

  function isAttrs(exp) {
    return _.isObject(exp) && !_.isFunction(exp) && !_.isArray(exp);
  }

  // render object as an HTML attribute list
//  function renderAttrs(obj, env) {
//    var buffer = [];
//    for (var attr in obj) {
//      buffer.push(renderAttrValue(_.toDash(attr), obj[attr], env));
//    }
//    return buffer.join(' ');
//  }
  function renderAttrs(obj, env) {
    var buffer = '';
    for (var attr in obj) {
      buffer += ' ' + renderAttrValue(_.toDash(attr), obj[attr], env);
    }
    return buffer;
  }

  /** @const */
  var EVENTS = {
    'onclick': 'onclick',
    'ondblclick': 'ondblclick',
    'onfocus': 'onfocus',
    'onmousedown': 'onmousedown',
    'onmouseup': 'onmouseup',
    'onmouseover': 'onmouseover',
    'onmousemove': 'onmousemove',
    'onmouseout': 'onmouseout',
    'ondragstart': 'ondragstart',
    'ondrag': 'ondrag',
    'ondragenter': 'ondragenter',
    'ondragleave': 'ondragleave',
    'ondragover': 'ondragover',
    'ondrop': 'ondrop',
    'ondragend': 'ondragend',
    'onload': 'onload',
    'onchange': 'onchange'
  };

  function isCB(name) { return !!EVENTS[name] }

  /** @const */
  var POST_RENDER_CBS = [];
  var callPostRenderCallbacks = function () {
    var cbs = POST_RENDER_CBS.deref();
    _.each(cbs, function (pair) {
      var elem = pb.get(pair[1]);
      var code = jess.emit(pair[0]);
      var thunk = function () { return eval(code) };
      console.log('calling ', code, ' with ', elem);
      thunk.call(elem);
    });
  };

  function renderAttrValue(key, value, env) {
    var env = env || {};
    if ((key === 'class' || key === 'id') && _.isArray(value)) {
      return str(key, '="', value.join(' '), '"');
    }
    else if (isCB(key) && _.isArray(value)) {
      if (HAVE_WS) {
        return str(EVENTS[key], "='", ws.emit(value, {env: env}), "'");
      }
      else {
        return str(EVENTS[key], "='", jess.emit(value, {env: env}), "'");
      }
    }
    else if ( key === 'onrender' ) {
      POST_RENDER_CBS.push([value, env.id]);
      return '';
    }
    else if (_.isBoolean(value)) {
      if (value === true) return str(key);
      else {
        return '';
      }
    }
    else if (key === 'style' && isCSSRule(value)) {
      return str(key, '="', renderCSSRule(value), '"');
    }
    else {
      return str(key, '="', value, '"');
    }
  }

  /** @const */
  var DEFINITIONS = {};

  /**
   * Define expressions
   *
   * @param {string} name
   * @param {Function} fn
   * @return {string}
   */
  pb.define = function define(name, value) {
    if (DEFINITIONS[name]) console.warn('overwriting "', name, '" definition');
    var func = typeof value === 'function' ? value : function () { return value };
    DEFINITIONS[name] = func;
    return name;
  };

  /**
   * @return {number}
   */
  var genID = function() {
    var last = 1;
    return function() {
      var n = last++;
      n = ((n >> 16) ^ n) * 0x45d9f3b;
      n = ((n >> 16) ^ n) * 0x45d9f3b;
      n = ((n >> 16) ^ n);
      return n;
    };
  }();

  pb.genID = genID;

  /**
   * @param {(string|number)} id
   * @return {Element}
   */
  pb.get = function get(id) {
    return document.getElementById(id);
  };

  /**
   * convert s-expressions into HTML code
   *
   * @param {*} form
   * @param {?Object} opts
   * @return {string}
   */
  pb.html = function html(form, opts) {
    return pb.eval(form, opts).toHTML();
  };

  // walk tag trees
  pb.walkTags = _.memoize(function(form, fn) {
    var inner = function(form) {
      if (isTag(form)) return fn(form);
      else {
        return form;
      }
    };
    var outer = function(form) { return form };
    return walk(inner, outer, form);
  });


  /**
   * expand macros
   *
   * @param {Array} form
   * @return {Array}
   */
  pb.macroExpand = function macroExpand(form) {
    var name = _.first(form);
    if (/\./.test(name) || /#/.test(name)) {
      var parts = name.split(/(\.|\#)/),
          tag = parts[0] || 'div',
          classes = [],
          ids = [],
          ctx = null,
          newAttrs = hasAttrs(form) ? attrs(form) : {};

      if (newAttrs['class']) {
        classes.push(newAttrs['class']);
        classes = _.flatten(classes);
      }

      if (newAttrs['id']) {
        ids.push(newAttrs['id']);
        ids = _.flatten(ids);
      }

      for (var i = 0; i < parts.length; i++) {
        if (parts[i] === '.') {
          ctx = 'class';
          continue;
        }
        else if (parts[i] === '#') {
          ctx = 'id';
          continue;
        }
        else {
          if (ctx === 'class') {
            classes.push(parts[i]);
            continue;
          }
          if (ctx === 'id') {
            ids.push(parts[i]);
            continue;
          }
        }
      }

      if (classes.length !== 0) newAttrs['class'] = classes;
      if (ids.length !== 0) newAttrs['id'] = ids;
      return _.flatten([tag, newAttrs, children(form), text(form)], true);
    }
    else {
      return form;
    }
  };

  /**
   * render expressions to element
   *
   * @param {(string|Element)} elem
   * @param {Array} exp a list of peanubutter expressions
   * @return {void}
   */
  pb.renderTo = function renderTo(elem, exp) {
    pb.eval(exp)
      .toPromise()
      .then(function(html) {
        jQuery(elem).html(html);
        callPostRenderCallbacks();
      })
      .catch(function(error) {
        console.error('Error: ', error);
        console.error(str('\n', stackTrace(pb.stack).join('\n')));
      });
  };

  /**
   * append expressions to element
   *
   * @param {(string|Element)} elem
   * @param {Array} exp
   * @return {void}
   */
  pb.appendTo = function appendTo(elem, exp) {
    pb.eval(exp)
      .toPromise()
      .then(function(html) {
        jQuery(elem).append(html);
        callPostRenderCallbacks();
      })
      .catch(function(error) {
        console.error('Error: ', error);
        console.error(str('\n', stackTrace(pb.stack).join('\n')));
      });
  };

  /**
   * Convert an expression into a function
   *
   * @param {Array} form
   * @return {function(...args): Array}
   */
  pb.toFn = function toFn(form) {
    return function() {
      return [].concat(form, _.toArray(arguments));
    };
  };

  // CSS
  // ---

  function renderCSSRule(obj) {
    return _.reduce(obj, function(memo, value, key) {
      if (memo === null) return str(_.toDash(key), ':', value, ';');
      else {
        return str(memo, ' ', _.toDash(key), ':', value, ';');
      }
    }, null);
  }

  var isCSSRule = function(obj) {
    return _.exists(obj) && _.isObject(obj);
  };

  /**
   * Default components
   */
  
  pb.define('javascript', function (attr, exp) {
    return [['script', {type: 'text/javascript'}, exp]];
  });

  pb.define('jess', function (attr) {
    return [['javascript', jess.emit(['do'].concat(Array.prototype.slice.call(arguments, 1)))]];
  });

  pb.define('nbsp', function () {
    return '&nbsp;';
  });

  pb.define('=', function () {
    var code = ['do'].concat(Array.prototype.slice.call(arguments, 1));
    console.log(code);
    console.log(jess.emit(code));
    return jess.eval(code);
  });
});