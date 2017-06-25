namespace pbnj.wonderscript {
  var ws = wonderscript;

  var _, ROOT_OBJECT;
  if (typeof exports !== 'undefined') {
    mori = require('mori');
    _    = require('./core.js');
    var pbnjEnv = require('./env.js');
    var pbnj = pbnj || {};
    pbnj.env = pbnjEnv.env;
    pbnj.core = _;
    pbnj.core.isEnv = pbnjEnv.isEnv;
    pbnj.reader = require('./reader.js');
    ROOT_OBJECT = global;
  }
  else {
    ROOT_OBJECT = window;
    _ = ROOT_OBJECT.pbnj.core;
  }
  ROOT_OBJECT.pbnj = ROOT_OBJECT.pbnj || {};
  ROOT_OBJECT.pbnj.wonderscript = ws;
  ROOT_OBJECT.pbnj.core = _;
  ROOT_OBJECT.pbnj.reader = pbnj.reader;
  ROOT_OBJECT.pbnj.env = pbnj.env;

  var isSelfEvaluating = ws.isSelfEvaluating = function(exp) {
    return _.isNull(exp) ||
           _.isUndefined(exp) ||
           _.isBoolean(exp) ||
           _.isString(exp) ||
           _.isNumber(exp) ||
           _.isDate(exp) ||
           _.isRegExp(exp);
  };

  var makeTagPredicate = _.makeTagPredicate;

  var evalSelfEvaluating = _.identity;

  var evalKeyword = function(exp, env) {
    var sexp = '' + exp;
    if (sexp.startsWith('::')) {
      var modname = env.lookup('*module-name*')
                        ? env.lookup('*module-name*').get('*module-name*')
                        : ws.MODULE_SCOPE["@@NAME@@"];
      return _.keyword('' + modname, sexp.replace(/^::/, ''));
    }
    return exp;
  };

  var isCollectionLiteral = ws.isCollectionLiteral = function(exp) {
    return _.isMap(exp) || _.isVector(exp) || _.isSet(exp);
  };

  var evalCollectionLiteral = function(exp, env) {
    if (_.isMap(exp)) {
      return mori.into(mori.hashMap(),
              mori.map(
                function(xs) { return mori.vector(ws.eval(mori.nth(xs, 0), env), ws.eval(mori.nth(xs, 1), env)) },
                exp));
    }
    else if (_.isVector(exp)) {
      return mori.into(mori.vector(),
              mori.map(
                function(x) { return ws.eval(x, env) },
                exp));
    }
    else if (_.isSet(exp)) {
      return mori.into(mori.set(),
              mori.map(
                function(x) { return ws.eval(x, env) },
                exp));
    }
    else {
      throw new Error(['invalid form: ', exp].join(''));
    }
  };

  var isQuoted = ws.isQuoted = makeTagPredicate(_.symbol('quote'));

  var evalQuote = _.second;

  var isVariable = ws.isVariable = _.isSymbol;

  var lookupVariable = function(sym, env) {
    var env = env || globalEnv;
    if (_.isSymbol(sym)) {
      var name = _.name(sym);
      var ns = _.namespace(sym);
      if (ns === null) {
        // find local scope
        scope = env.lookup(name);
        if (scope === null) {
          if (ws.MODULE_SCOPE[name] == null) {
            if (pbnj.core[name] == null) {
              return null;
            }
            return pbnj.core;
          }
          return ws.MODULE_SCOPE;
        }
        else {
          return scope;
        }
      }
      else {
        if (ns === 'js') {
          return ROOT_OBJECT;
        }
        else {
          var mod = findModule(_.symbol(ns));
          if (mod == null) {
            return lookupVariable(_.symbol(ns));
          }
          return mod;
        }
      }
    }
    throw new Error("variable should be a symbol");
  };
  ws.lookupVariable = lookupVariable;

  var getVariable = function(env, name) {
    var env_ = _.isEnv(env) ? env : env["@@SCOPE@@"];
    if (env_) {
      var obj = env_.getObject(name)
      if (_.get(obj.getMeta(), _.keyword('macro')) === true) {
        console.log(name);
        //throw new Error("Cannot use a macro in this context");
      }
      return obj.getValue();
    }
    if (env[name]) return env[name];
    throw new Error(['cannot find variable: ', name].join(''));
  };

  var evalVariable = function(exp, env) {
    var name = _.name(exp);
    var mod = lookupVariable(exp, env);
    if (mod === null) throw new Error(["Undefined variable: '", exp, "'"].join(''));
    var val = getVariable(mod, name);
    return val;
  };

  var isDefinition = ws.isDefinition = makeTagPredicate(_.symbol('define'));

  var defineVariable = function(env, ident, value, meta) {
    var meta = meta || _.hashMap();
    var isPrivate = _.get(meta, _.keyword('private'), false);
    var name = _.name(ident);
    var ns   = _.namespace(ident);
    if (isPrivate) {
      env.define(name, value, _.assoc(meta, _.keyword('private'), true));
    }
    else {
      // define value in module scope
      var mod = ns == null ? pbnj.MODULE_SCOPE : getModule(_.symbol(ns));
      if (!mod) throw new Error(["module ", ns ," is undefined"].join(''));
      if (!mod["@@SCOPE@@"]) {
        mod["@@SCOPE@@"] = globalEnv.extend();
      }
      meta = _.assoc(meta, _.keyword('module'), mod["@@NAME@@"]);
      mod["@@SCOPE@@"].define(name, value, meta);
      mod[name] = value;
    }
    return env;
  };
  ws.defineVariable = defineVariable;

  var evalDefinition = function(exp, env) {
    var rest  = _.rest(exp);
    var first = _.first(rest);
    if (_.isSymbol(first)) {
      var meta   = _.hashMap();
      var ident  = first;
      var preVal = _.second(rest);
    }
    else if (_.isMap(first)) {
      var meta   = first;
      var ident  = _.first(_.rest(rest));
      var preVal = _.second(_.rest(rest));
    }
    else if (_.isKeyword(first)) {
      var meta   = _.hashMap(first, true);
      var ident  = _.first(_.rest(rest));
      var preVal = _.second(_.rest(rest));
    }
    else {
      throw new Error(['define: first element should be a symbol, keyword, or map from: ', ws.inspect(exp)].join(''));
    }

    var name = _.name(ident);
    var ns   = _.namespace(ident);
    
    env.define(name); // so definition can refer to itself

    var value = preVal == null ? null : ws.eval(preVal, env);
    defineVariable(env, ident, value, meta);

    if (_.isFunction(value)) {
      value.$lang$ws$ident = ident;
    }
    return value;
  };

  var isProtocol = ws.isProtocol = makeTagPredicate(_.symbol('define-protocol'));

  // (distance [self other] ...)
  var evalMethod = function(exp, env) {
    var lambda, name, expr;
    name = _.first(exp);
    expr = _.cons(_.symbol('lambda'), _.rest(exp));
    lambda = ws.eval(expr, env);
    return [name, function() {
      return lambda.apply(null, [].concat([this], Array.prototype.slice.call(arguments)));
    }];
  };

  // (define-protocol IPoint
  //  (distance [self] ...))
  // (define-type Point [x y] IPoint)
  var evalProtocol = function(exp, env) {
    var rest, name, specs, mixin, methods;
    rest = _.rest(exp);
    name = _.first(rest);
    specs = _.rest(rest);

    if (!_.isSymbol(name)) throw new Error('name should be a symbol');
    
    methods = _.intoArray(mori.map(function(spec) { return evalMethod(spec, env) }, specs));

    mixin = function(obj) {
      for (var i = 0; i < methods.length; i++) {
        obj[methods[i][0]] = methods[i][1];
      }
    };

    defineVariable(env, name, mixin, _.hashMap(_.keyword('protocol'), true));

    return name;
  };

  var isType = ws.isType = makeTagPredicate(_.symbol('define-type'));

  // (define-type Point [x y])
  var evalType = function(exp, env) {
    var rest, name, fields, specs, argc, names, ctr, mixin, method, i;
    rest = _.rest(exp);
    name = _.first(rest);
    fields = _.second(rest);
    specs = _.intoArray(_.rest(_.rest(rest)));

    if (!_.isSymbol(name)) throw new Error('name should be a symbol');
    if (!_.isVector(fields)) throw new Error('field list should be a vector of symbols');

    argc  = _.count(fields);
    names = _.intoArray(fields);
    ctr = function() {
      if (arguments.length !== argc) {
        throw new Error(['expected ', argc, ' arguments, got: ', arguments.length].join(''));
      }
      for (i = 0; i < names.length; i++) {
        this[names[i]] = arguments[i];
      }
    };

    // TODO: add checks to make sure that specs list is in the following format (PROTOCOL METHODS?, PROTOCOL METHODS?, ...)
    if (specs.length !== 0) {
      ctr.prototype = {};
      for (i = 0; i < specs.length; i++) {
        if (_.isSymbol(specs[i])) {
          mixin = ws.eval(specs[i], env);
          // TODO: perform checks based on meta data
          mixin.call(null, ctr.prototype);
        }
        else if (_.isList(specs[i])) {
          method = evalMethod(specs[i], env);
          ctr.prototype[method[0]] = method[1];
        }
        else {
          console.log(specs[i]);
          throw new Error('spec should be either a protocol name or a method definition');
        }
      }
    }

    defineVariable(env, name, ctr, _.hashMap(_.keyword('type'), true));

    return name;
  };

  var arity = function(fn) {
    return fn.$lang$ws$arity || fn.length;
  };

  var funcIdent = function(func) {
    return func.$lang$ws$ident || func.name || 'anonymous';
  };

  var isInvocable = function(val) {
    return _.isFunction(val) || _.isAssociative(val) || _.isKeyword(val) || _.isSet(val) || (isQuoted(val) && _.isSymbol(evalQuoted(val)));
  };

  ws.apply = function(func, args) {
    if (arguments.length !== 1 && arguments.length !== 2) {
      throw new Error(['wrong number of arguments expected: 1 or 2 arguments, got: ', arguments.length].join(''));
    }

    if (!isInvocable(func)) {
      throw new Error(["'", func, "' is not invocable"].join(''));
    }

    return func.apply(null, args ? _.intoArray(args) : []);
  };

  var isLambda = ws.isLambda = makeTagPredicate(_.symbol('lambda'));

  var lambdaID = 0;
  function Lambda(exp, env) {
    var id, rest, names, argCount, bodies, i, fn, exprs, args, body, sum, keys, arities;

    if (arguments.length !== 2) {
      throw new Error(['2 arguments expected got: ', arguments.length].join(''));
    }

    id = ['lambda-', lambdaID++].join('');
    rest = _.rest(exp);
    names = _.first(rest);
    argCount = 0;
    bodies = {};

    if (_.isVector(names)) {
      argCount = _.count(names);
      for (var i = 0; i < argCount; i++) {
        var sname = '' + _.nth(names, i);
        if (sname[0] === '&') {
          argCount = (argCount - 1) * -1;
        }
      }
      bodies[argCount] = {arity: argCount, args: names, code: _.rest(rest)};
      var body = bodies[argCount].body;
    }
    else if (_.isList(names)) {
      exprs = rest;
      while (fn = _.first(exprs)) {
        args = _.intoArray(_.first(fn));
        body = _.rest(fn);
        sum = 0;
        for (i = 0; i < args.length; i++) {
          if (('' + args[i])[0] === '&') {
            sum = (sum + 1) * -1
          }
          else {
            sum++;
          }
        }
        bodies[sum] = {arity: sum, args: args, code: body};
        exprs = _.rest(exprs);
      }
      keys = _.keys(bodies);
      arities = [];
      for (i = 0; i < keys.length; i++) {
        arities.push(Math.abs(bodies[keys[i]].arity));
      }
      argCount = _.sort(arities)[0] * -1;
    }
    else {
      throw new Error('the second element of a lambda expression should be an argument vector or the beginning of a list of lambda bodies');
    }
    this.bodies = function() {
      return bodies;
    };
    this.arglists = function() {
      return _.map(function(body) { return _.isArray(body.args) ? _.vector.apply(null, body.args) : body.args }, _.values(bodies));
    };
    this.id = function() {
      return id;
    };
    this.arity = function() {
      return argCount;
    };
    this.length = argCount;
    this.scope = env.extend().setIdent(id).initStash();
    this.toString = function() {
      return ws.inspect(exp);
    };
  }

  Lambda.prototype.bind = function(values) {
    var bodies = this.bodies();
    var scope = this.scope.extend();

    var args = values;
    var argCount = this.arity();
    if (argCount <= 0 && args.length < Math.abs(argCount)) {
      throw new Error(['"', this, '" wrong number of arguments expected at least: ', Math.abs(argCount), ' got: ', args.length].join(''));
    }
    else if (argCount > 0 && argCount !== args.length) {
      throw new Error(['"', this, '" wrong number of arguments expected: ', argCount, ' got: ', args.length].join(''));
    }
    var argc = args.length;
    var body = bodies[argc];
    if (body == null) {
      for (var i = (argc * -1); i <= 0; i++) {
        body = bodies[i];
        if (body != null) break;
      }
      if (body == null) throw new Error(["wrong number of arguments for: ", this, ' got: ', args.length].join(''));
    }
    var i = 0;
    var bodyArgs = body.args;
    var name;
    while (name = _.first(bodyArgs)) {
      var sname = '' + name;
      if (sname[0] === '&') {
        var list = _.list.apply(null, [].slice.call(args, i))
        scope.define(sname.slice(1), list);
      }
      else {
        scope.define(sname, i < args.length ? args[i] : false);
      }
      i++;
      bodyArgs = _.rest(bodyArgs);
    }
    this.scope = scope;
    this.body = body;
    return this;
  };

  Lambda.prototype.exec = function() {
    var body = this.body;
    if (!body) throw new Error('the lambda must be bound to arguments first');
    var exprs = body.code, exp, ret;
    while (_.count(exprs) !== 0) {
      try {
        exp = _.first(exprs);
        ret = ws.eval(exp, this.scope);
        exprs = _.rest(exprs);
      }
      catch (e) {
        if (e instanceof RecursionPoint) {
          this.bind(e.args).exec();
        }
        else {
          throw e;
        }
      }
    }
    return ret;
  };

  Lambda.prototype.apply = function(obj, args) {
    return this.bind(args).exec();
  };

  Lambda.prototype.call = function() {
    return this.bind(_.toArray(arguments).slice(1)).exec();
  };

  Lambda.prototype.toFunction = function() {
    var that = this;
    var fn = function() {
      return that.bind(arguments).exec();
    };
    var prop;
    for (prop in this) {
      if (this.hasOwnProperty(prop)) {
        fn[prop] = this[prop];
      }
    }
    return fn;
  };

  var evalLambda = function(exp, env) {
    return new Lambda(exp, env).toFunction();
  };

  var isLoop = ws.isLoop = makeTagPredicate(_.symbol('loop'));
  var isRecursionPoint = ws.isRecursionPoint = makeTagPredicate(_.symbol('again'));

  function Loop(bindings, body, env) {
    if (arguments.length !== 3) {
      throw new Error(['3 arguments expected got: ', arguments.length].join(''));
    }
    this.bindings = function() {
      return bindings;
    };
    this.body = function() {
      return body;
    };
    this.scope = env.extend().setIdent('loop').initStash();
    this.scope.define('*recursion-point*', this);
    var names = [];
    for (var i = 0; i < _.count(bindings); i += 2) {
      var name = _.nth(bindings, i);
      names.push(name);
      if (env) {
        this.scope.define(name);
        this.scope.define(name, ws.eval(_.nth(bindings, i + 1), this.scope));
      }
    }
    this.names = function() {
      return names;
    };
  }

  Loop.prototype.bind = function(values) {
    var names = this.names();
    var scope = this.scope.extend();
    if (names.length !== values.length) {
      throw new Error('values should match bindings arity');
    }
    for (var i = 0; i < names.length; i++) {
      scope.define(names[i]);
      scope.define(names[i], values[i]);
    }
    this.scope = scope;
    return this;
  };

  Loop.prototype.exec = function(env) {
    var exp, ret, exprs = this.body();
    while (_.count(exprs) !== 0) {
      try {
        exp = _.first(exprs);
        ret = ws.eval(exp, env ? env : this.scope);
        exprs = _.rest(exprs);
      }
      catch (e) {
        if (e instanceof RecursionPoint) {
          this.bind(e.args).exec();
        }
        else {
          throw e;
        }
      }
    }
    return ret;
  };

  var evalLoop = function(exp, env) {
    var bindings = _.second(exp);
    var body = _.rest(_.rest(exp));
    if (!_.isVector(bindings)) throw new Error('bindings should be a vector');
    return new Loop(bindings, body, env).exec();
  };

  function RecursionPoint(args) {
    this.args = args;
  }

  // TODO: add tail position check
  var evalRecursionPoint = function(exp, env) {
    var args = _.intoArray(mori.map(function(x) { return ws.eval(x, env); }, _.rest(exp)));
    throw new RecursionPoint(args);
  };

  var isApplication = ws.isApplication = function(exp) {
    return _.isList(exp);
  };

  var evalApplication = ws.evalApplication = function(exp, env) {
    var func, args, rawargs, buffer, op, sop, newExp, obj, meth, ctr, i;

    args    = [];
    rawargs = _.intoArray(_.rest(exp));
    for (i = 0; i < rawargs.length; i++) {
      args.push(ws.eval(rawargs[i], env));
    }

    // Primitive operators are inlined for performance
    op = _.first(exp);
    if (_.equals(op, _.symbol('+'))) {
      if (args.length === 0) return 0;
      return eval(args.join('+'));
    }
    else if (_.equals(op, _.symbol('-'))) {
      if (args.length === 0) return 0;
      else if (args.length === 1) return eval(['-', args[0]].join(''));
      return eval(args.join('-'));
    }
    else if (_.equals(op, _.symbol('*')) || _.equals(op, _.symbol('/'))) {
      if (args.length === 0) return 1;
      return eval(args.join(op.toString()));
    }
    else if (_.equals(op, _.symbol('str'))) {
      if (args.length === 0) return '';
      else if (args.length === 1) return '' + args[0];
      return args.join('');
    }
    else if (_.equals(op, _.symbol('add1'))) {
      if (args.length !== 1) {
        throw new Error(['expected 1 argument, got: ', args.length].join(''));
      }
      else {
        return eval(['1+', args[0]].join(''));
      }
    }
    else if (_.equals(op, _.symbol('sub1'))) {
      if (args.length !== 1) {
        throw new Error(['expected 1 argument, got: ', args.length].join(''));
      }
      else {
        return eval([args[0], '-1'].join(''));
      }
    }
    else if (_.equals(op, _.symbol('not'))) {
      if (args.length !== 1) {
        throw new Error(['expected 1 argument, got: ', _.coargs.length].join(''));
      }
      else {
        if (args[0] == null) return true;
        return eval(['!', args[0]].join(''));
      }
    }
    else if (_.equals(op, _.symbol('mod'))) {
      return eval(args.join('%'));
    }
    else if (_.equals(op, _.symbol('bit-or'))) {
      return eval(args.join('|'));
    }
    else if (_.equals(op, _.symbol('bit-and'))) {
      return eval(args.join('&'));
    }
    else if (_.equals(op, _.symbol('bit-xor'))) {
      return eval(args.join('^'));
    }
    else if (_.equals(op, _.symbol('bit-not'))) {
      if (args.length !== 1) {
        throw new Error(['expected 1 argument, got: ', args.length].join(''));
      }
      else {
        return eval(['~', args.length].join(''));
      }
    }
    else if (_.equals(op, _.symbol('bit-shift-left'))) {
      if (args.length !== 2) {
        throw new Error(['expected 2 argument, got: ', args.length].join(''));
      }
      else {
        return eval([args[0], '<<', args[1]].join(''));
      }
    }
    else if (_.equals(op, _.symbol('bit-shift-right'))) {
      if (args.length !== 2) {
        throw new Error(['expected 2 argument, got: ', args.length].join(''));
      }
      else {
        return eval([args[0], '>>', args[1]].join(''));
      }
    }
    else if ((sop = op.toString()).startsWith('.-')) {
      meth = _.symbol.apply(null, op.toString().slice(2).split('/'));
      obj  = _.first(_.rest(exp));
      newExp = _.list(_.symbol('.-'), obj, meth);
      ws.pprint(newExp);
      return evalPropertyAccessor(newExp, env);
    }
    else if ((sop = op.toString()).startsWith('.')) {
      meth = _.symbol.apply(null, op.toString().slice(1).split('/'));
      obj  = _.first(_.rest(exp));
      newExp = _.list(_.symbol('.'), obj, _.cons(meth, _.rest(_.rest(exp))));
      return evalMethodApplication(newExp, env);
    }
    else if (sop.endsWith('.')) {
      ctr = _.symbol.apply(null, sop.slice(0, sop.length - 1).split('/'));
      newExp = _.cons(_.symbol('new'), _.cons(ctr, _.rest(exp)))
      return evalClassInstantiation(newExp, env);
    }
    else if (_.isAssociative(op) || _.isKeyword(op) || _.isSet(op) || (isQuoted(op) && _.isSymbol(op = evalQuote(op)))) {
      return op.apply(null, args);
    }
    
    func = ws.eval(op, env);

    if (isInvocable(func)) {
      return func.apply(null, args);
    }
    else {
      console.log(func);
      throw new Error(["'", ws.inspect(exp), "' is not a function"].join(''));
    }
  };

  var isBlock = ws.isBlock = makeTagPredicate(_.symbol('do'));

  var evalBlock = function(exp, env) {
    var body = _.rest(exp);
    var scope = env.extend();
    scope.setIdent('do');
    var value = null;
    _.each(body, function(exp) {
      value = ws.eval(exp, scope);
    });
    return value;
  };

  var isCond = ws.isCond = makeTagPredicate(_.symbol('cond'));

  var evalCond = function(exp, env) {
    var rest = _.rest(exp);
    if (_.count(rest) % 2 !== 0) throw new Error(['cond requires an even number of elements ', ws.inspect(exp)].join(''));
    var pairs = _.pair(rest);
    for (var i = 0; i < _.count(pairs); i++) {
      var pred = _.nth(_.nth(pairs, i), 0);
      var cons = _.nth(_.nth(pairs, i), 1);
      if (_.equals(pred, _.keyword('else')) || !_.isFalse(ws.eval(pred, env))) {
        return ws.eval(cons, env);
      }
    }
    return null;
  };

  var isMacroDef = makeTagPredicate(_.symbol('define-macro'));

  ws.TAGGED_SPECIAL_FORMS = _.set([
    _.symbol('lambda'),
    _.symbol('quote'),
    _.symbol('cond'),
    _.symbol('define'),
    _.symbol('do'),
    _.symbol('try'),
    _.symbol('catch'),
    _.symbol('throw'),
    _.symbol('again'),
    _.symbol('set!'),
    _.symbol('define-type'),
    _.symbol('define-protocol'),
    _.symbol('define-macro'),
    _.symbol('.-'),
    _.symbol('.'),
    _.symbol('new'),
    _.symbol('module'),
    _.symbol('require'),
    _.symbol('use')
  ]);

  var evalMacroDef = function(exp, env) {
    var rest, name, args, body, lambda, fn;

    rest = _.rest(exp);
    name = _.first(rest);
    forms = _.rest(rest);
    var x = _.first(forms);
    if (_.isString(x)) {
      args = _.second(forms);
      body = _.rest(_.rest(forms));
      meta = _.hashMap(_.keyword('doc'), x);
    }
    else {
      args = _.second(rest);
      body = _.rest(_.rest(rest));
      meta = _.hashMap();
    }
    lambda = _.cons(_.symbol('lambda'), _.cons(args, body));
    //ns = _.namespace(name);

    env.define(name); // so macro can refer to itself
    fn = evalLambda(lambda, env);
    fn.$lang$ws$ident = name; // give it an ident for stacktrace
    defineVariable(env, name, fn, _.assoc(meta, _.keyword('macro'), true));
    
    /*var mod = ns ? getModule(_.symbol(ns)) : ws.MODULE_SCOPE;
    mod['@@MACROS@@'] = mod['@@MACROS@@'] || {}; 
    mod['@@MACROS@@'][_.name(name)] = fn;*/
    return name;
  };

  var getMacro = function(scope, name) {
    if (scope === null) return null;
    var env = _.isEnv(scope) ? scope : scope["@@SCOPE@@"];
    if (env) {
      var obj = env.getObject(_.name(name));
      var meta = obj.getMeta();
      if (_.get(meta, _.keyword('macro')) === true) {
        return obj.getValue();
      }
    }
    else {
      //console.log(scope);
      //ws.pprint(name);
      //throw new Error('nothing in @@SCOPE@@');
    }
    return null;
  };

  var isMacro = ws.isMacro = ws['macro?'] = function(name) {
    var scope = lookupVariable(name);
    return getMacro(scope, name);
  };

  var macroexpand = ws.macroexpand = function(exp) {
    var macro, name;
    if (!(_.isList(exp) && _.isSymbol(name = _.first(exp)))) {
      return exp;
    }
    if (_.hasKey(ws.TAGGED_SPECIAL_FORMS, name)) {
      return exp;
    }
    if (macro = isMacro(name)) {
      return macroexpand(macro.apply(macro, _.intoArray(_.rest(exp))));
    }
    return exp;
  };

  var isAssignment = ws.isAssignment = makeTagPredicate(_.symbol('set!'));

  var evalAssignment = function(exp, env) {
    var name = _.second(exp);
    var scope = lookupVariable(name, env);
    if (scope === null) throw new Error(["Undefined variable '", name, "'"].join(''));
    var value = ws.eval(_.second(_.rest(exp)), env);
    var ns = _.namespace(name);
    var sname = '' + name;
    if (_.isEnv(scope)) {
      scope.set(sname, value);
    }
    else {
      scope[sname] = value;
      if (env = env.lookup(sname)) {
        env.set(sname, value);
      }
    }
    return value;
  };

  var isThrownException = ws.isThrownException = makeTagPredicate(_.symbol('throw'));

  var evalThrownException = function(exp, env) {
    var error = ws.eval(_.second(exp), env);
    if (_.isString(error)) {
      throw new Error(wsError(error, env.stacktrace()));
    }
    else {
      throw error;
    }
  };

  var isPropertyAccessor = ws.isPropertyAccessor = makeTagPredicate(_.symbol('.-'));

  var evalPropertyAccessor = function(exp, env) {
    var obj = ws.eval(_.second(exp), env);
    if (obj == null) throw new Error(["nil is not an object from: ", ws.inspect(_.second(exp))].join(''));
    var prop = _.second(_.rest(exp));
    if (_.isSymbol(prop)) {
      return obj[prop];
    }
    else {
      return obj[ws.eval(prop, env)];
    }
  };

  var isPropertyAssignment = ws.isPropertyAssignment = makeTagPredicate(_.symbol('.-set!'));

  var evalPropertyAssignment = function(exp, env) {
    var obj = ws.eval(_.second(exp), env);
    if (obj == null) throw new Error("nil is not an object");
    var prop = _.second(_.rest(exp));
    var value = ws.eval(_.second(_.rest(_.rest(exp))), env);
    if (_.isSymbol(prop)) {
      return obj[prop] = value;
    }
    else {
      return obj[ws.eval(prop, env)] = value;
    }
  };

  var isClassInstantiation = ws.isClassInstantiation = makeTagPredicate(_.symbol('new'));

  var evalClassInstantiation = ws.evalClassInstantiation = function(exp, env) {
    var ctr = ws.eval(_.second(exp), env);
    if (!_.isFunction(ctr)) throw new Error('class given is not a valid constructor');
    var args = _.intoArray(mori.map(function(arg) { return ws.eval(arg, env) }, _.rest(exp)));
    return new (ctr.bind.apply(ctr, args));
  };

  var evalModuleName = function(name, root) {
    if (!_.isSymbol(name)) throw new Error('symbol expected');
    if (!root) throw new Error('root object is required');
    var path = ('' + name).split('/')[0].split('.');
    var mod = root;
    for (var i = 0; i < path.length; i++) {
      var name = path[i];
      if (!_.isObject(mod[name])) {
        mod[name] = {};
      }
      mod = mod[name];
    }
    return mod;
  };

  var defineModule = function(name) {
    var mod = evalModuleName(name, ROOT_OBJECT);
    if (mod) {
      var scope = globalEnv.extend().setIdent('' + name);
      scope.define('*module-name*', name);
      mod.$lang$ws$type = 'module';
      pbnj.MODULE_SCOPE = mod;
      globalEnv.define(name, mod, _.hashMap(_.keyword('tag'), _.keyword('module')));
    }
    else {
      throw new Error(['There was an error defining module "', name, '"'].join(''));
    }
    return mod;
  };
  ws.defineModule = defineModule;

  var isModuleDefinition = ws.isModuleDefinition = makeTagPredicate(_.symbol('module'));

  var evalModuleDefinition = function(exp, env) {
    var name = _.second(exp); 
    var mod = defineModule(name);
    if (mod) {
      var scope = env.extend().setIdent('' + name);
      scope.define('*module-name*', name);
      if (!mod["@@SCOPE@@"]) mod["@@SCOPE@@"] = scope;
      if (!mod["@@NAME@@"]) mod["@@NAME@@"] = name;
      mod.$lang$ws$type = 'module';
      ws.MODULE_SCOPE = mod;
      globalEnv.define(name, mod, _.hashMap(_.keyword('tag'), _.keyword('module')));
    }
    else {
      throw new Error(['There was an error defining module "', name, '"'].join(''));
    }
    return mod;
  };

  var isModuleRequire = ws.isModuleRequire = makeTagPredicate(_.symbol('require'));

  var evalModuleRequire = function(exp, env) {
    var name = _.second(exp);
    var mod = ws.MODULE_SCOPE;
    var dir = typeof exports !== 'undefined' ? env.lookup('*dir*').get('*dir*') : '/';

    if (_.isString(name)) {
      var full = dir ? [dir, name].join('/') : name;
      try {
        ws.readFile(full, env.extend().setIdent('require'));
      }
      catch (e) {
        throw new Error(["Reading file: \"", full, "\": ", e.message ? e.message : e].join(''));
      }
    }
    else if (_.isSymbol(name)) {
      var path = ["src/", ('' + name).split('.').join('/'), ".ws"].join('');
      ws.readFile(dir ? [dir, path].join('/') : path, env.extend().setIdent('require'));
      var mod = findModule(name);
      if (mod == null) {
        throw new Error(['module ', name, ' does not exist'].join(''));
      }
    }
    else {
      throw new Error("module name should be a symbol or string");
    }
    ws.MODULE_SCOPE = mod;
    return true;
  };

  var isModuleSet = ws.isModuleSet = makeTagPredicate(_.symbol('use'));

  var evalModuleSet = function(exp, env) {
    var name = _.second(exp);
    if (_.isSymbol(name)) {
      ws.MODULE_SCOPE = getModule(name);
      env.define('*module-name*', name);
    }
    else {
      throw new Error("module name should be a symbol");
    }
    return null;
  };

  var findModule = ws.getModule = function(name) {
    if (!_.isSymbol(name)) throw new Error('symbol expected');
    var path = ('' + name).split('/')[0].split('.');
    var mod = ROOT_OBJECT;
    for (var i = 0; i < path.length; i++) {
      mod = mod[path[i]];
      if (mod == null) break; //throw new Error(_.str('module ', name, ' is undefined'));
    }
    return mod;
  };

  var getModule = ws.getModule = function(name) {
    if (!_.isSymbol(name)) throw new Error('symbol expected');
    var path = ('' + name).split('/')[0].split('.');
    var mod = ROOT_OBJECT;
    _.each(path, function(nm) {
      if (!_.isObject(mod[nm])) {
        mod[nm] = {};
      }
      mod = mod[nm];
    });
    return mod;
  };

  var importModule = function(mod) {
    for (var fn in mod) {
      if (pbnj.core.hasOwnProperty(fn)) {
        globalEnv.define(fn, mod[fn]);
      }
    }
  };

  var isMethodApplication = ws.isMethodApplication = makeTagPredicate(_.symbol('.'));

  var evalMethodApplication = function(exp, env) {
    var args = _.rest(exp);
    var obj = ws.eval(_.first(args), env);
    if (obj == null) throw new Error(['nil is not an object from: ', ws.inspect(exp)].join(''));
    var method = _.second(args);
    if (_.isList(method)) {
      var mname = _.first(method);
      var m = obj[mname]
      if (m == null) {
        throw new Error(['method "', ws.inspect(mname), '" does not exist'].join(''));
      }
      return m.apply(obj, _.intoArray(mori.map(function(x) { return ws.eval(x, env) }, _.rest(method))));
    }
    else {
      var m = obj[method]
      if (m == null) {
        throw new Error(['method "', ws.inspect(method), '" does not exist'].join(''));
      }
      return m.apply(obj);
    }
  };

  var isTryBlock = ws.isTryBlock = makeTagPredicate(_.symbol('try'));
  var isCatchBlock = ws.isCatchBlock = makeTagPredicate(_.symbol('catch'));
  var isFinallyBlock = ws.isFinallyBlock = makeTagPredicate(_.symbol('finally'));

  var evalCatchBlock = function(exp, e, env) {
    var binds = _.second(exp);
    var body = _.rest(_.rest(exp));
    var expr, value = null;
    var scope = env.extend().setIdent('catch');

    if (!_.isVector(binds) || _.count(binds) !== 2) {
      console.log('binds', ws.inspect(binds));
      throw new Error("bindings should be a vector of 2 elements");
    }

    var vari = _.first(binds);
    var klass = ws.eval(_.second(binds), scope);

    if (e instanceof klass) {
      scope.define('' + vari, e);
      while (expr = _.first(body)) {
        value = ws.eval(expr, scope);
        body = _.rest(body);
      }
    }
    return value;
  };

  var evalFinallyBlock = function(exp, env) {
    var body = _.rest(exp), expr, value;
    while (expr = _.first(body)) {
      value = ws.eval(expr, env);
      body = _.rest(body);
    }
    return value;
  };

  var evalTryBlock = function(exp, env) {
    var body = _.rest(exp), expr, value;
    var catchBlock = mori.filter(isCatchBlock, body);
    var finallyBlock = _.first(mori.filter(isFinallyBlock, body));
    body = mori.remove(function(exp) { return isFinallyBlock(exp) || isCatchBlock(exp) }, body);
    var scope = env.extend().setIdent('try');
    if (!catchBlock && !finallyBlock) throw new Error("A try block should have a catch block or a finally block");
    if (catchBlock) {
      try {
        while (expr = _.first(body)) {
          value = ws.eval(expr, scope);
          body = _.rest(body);
        }
      }
      catch (e) {
        var cBlock;
        while (cBlock = _.first(catchBlock)) {
          ws.pprint(cBlock);
          value = evalCatchBlock(cBlock, e, scope);
          catchBlock = _.rest(catchBlock);
        }
      }
    }
    if (finallyBlock) {
      value = evalFinallyBlock(finallyBlock, scope);
    }
    return value;
  };

  ws.MODULE_SCOPE = pbnj.core; // default scope
  pbnj.core["@@NAME@@"] = _.symbol('pbnj.core');

  var globalEnv = pbnj.core['@@SCOPE@@'] = pbnj.env().setSource('src/pbnj/wonderscript.js');
  globalEnv.define('*module-name*', _.symbol('pbnj.core'));
  importModule(pbnj.core);
  ws.globalEnv = globalEnv;
  
  globalEnv.define('*source*', null);
  globalEnv.define('macroexpand', macroexpand);
  globalEnv.define('arity', arity);
  
  ws.inspect = function(exp) {
    if (exp == null) {
      return 'nil';
    }
    else if (_.isBoolean(exp)) {
      return exp === true ? 'true' : 'false';
    }
    else if (_.isString(exp)) {
      return ['"', exp, '"'].join('');
    }
    else if (isQuoted(exp)) {
      return ["'", ws.inspect(_.second(exp))].join('');
    }
    else if (_.isArray(exp)) {
      var buffer = [];
      for (var i = 0; i < exp.length; i++) {
        buffer.push(ws.inspect(exp[i]));
      }
      return ["(array ", buffer.join(' '), ")"].join('');
    }
    else {
      return '' + exp;
    }
  };
  globalEnv.define('inspect', ws.inspect);

  ws.pprint = function(exp) {
    console.log(ws.inspect(exp));
  }
  globalEnv.define('pprint', ws.pprint);
  globalEnv.define('p', ws.pprint);

  ws.eval = function(exp, env) {
    var env = env || globalEnv;
    var exp = macroexpand(exp);

    if (isSelfEvaluating(exp)) {
      return evalSelfEvaluating(exp);
    }
    else if (_.isKeyword(exp)) {
      return evalKeyword(exp, env);
    }
    else if (isCollectionLiteral(exp)) {
      return evalCollectionLiteral(exp, env);
    }
    else if (isVariable(exp)) {
      return evalVariable(exp, env);
    }
    else if (isQuoted(exp)) {
      return evalQuote(exp);
    }
    else if (isDefinition(exp)) {
      return evalDefinition(exp, env);
    }
    else if (isCond(exp)) {
      return evalCond(exp, env);
    }
    else if (isLambda(exp)) {
      return evalLambda(exp, env);
    }
    else if (isBlock(exp)) {
      return evalBlock(exp, env);
    }
    else if (isTryBlock(exp)) {
      return evalTryBlock(exp, env);
    }
    else if (isLoop(exp)) {
      return evalLoop(exp, env);
    }
    else if (isRecursionPoint(exp)) {
      return evalRecursionPoint(exp, env);
    }
    else if (isAssignment(exp)) {
      return evalAssignment(exp, env);
    }
    else if (isProtocol(exp)) {
      return evalProtocol(exp, env);
    }
    else if (isType(exp)) {
      return evalType(exp, env);
    }
    else if (isMacroDef(exp)) {
      return evalMacroDef(exp, env);
    }
    else if (isThrownException(exp)) {
      return evalThrownException(exp, env);
    }
    else if (isPropertyAccessor(exp)) {
      return evalPropertyAccessor(exp, env);
    }
    else if (isPropertyAssignment(exp)) {
      return evalPropertyAssignment(exp, env);
    }
    else if (isMethodApplication(exp)) {
      return evalMethodApplication(exp, env);
    }
    else if (isClassInstantiation(exp)) {
      return evalClassInstantiation(exp, env);
    }
    else if (isModuleDefinition(exp)) {
      return evalModuleDefinition(exp, env);
    }
    else if (isModuleRequire(exp)) {
      return evalModuleRequire(exp, env);
    }
    else if (isModuleSet(exp)) {
      return evalModuleSet(exp, env);
    }
    else if (isApplication(exp)) {
      return evalApplication(exp, env);
    }
    else {
      throw new Error(["invalid expression: '", exp, "'"].join(''));
    }
  };
  globalEnv.define('eval', ws.eval);
  globalEnv.define('apply', ws.apply);

  var wsError = function(e, trace) {
    var wsStack = ''; //_.str(ws.pprint(exp), ' @ ', stream.source(), ':', stream.line(), ':', stream.column(), '\n');
    if (!_.isEmpty(trace)) {
      wsStack = fmtStacktrace(trace)
    }
    return [e.message ? e.message : e, ":\n", wsStack, e.stack ? _.str("\n", e.stack) : null].join('');
  };

  function fmtStacktrace(trace) {
    var i, x, buffer = [];
    for (i = 0; i < trace.length; i++) {
      x = trace[i];
      buffer.push([x[1], "@", x[0] || 'unknown', ":", x[2]].join(''));
    }
    return buffer.join('\n');
  }

  ws.readStream = function(stream, env) {
    var env = (env || globalEnv).extend().setSource(stream.source()).setLocation(stream.line(), stream.column());
    try {
      var value = null;
      while (!stream.eof()) {
        var exp = stream.peek();
        value = ws.eval(exp, env);
        if (_.isFunction(value) || isBlock(exp) || isTryBlock(exp)) {
          env.setLocation(stream.line(), stream.column());
        }
        else if (value && value["@@SCOPE@@"]) {
          env = value["@@SCOPE@@"].setLocation(stream.line(), stream.column());
        }
        else {
          env.setLocation(stream.line(), stream.column());
        }
        stream.next();
      }
      return value;
    }
    catch(e) {
      console.log(e);
      //console.log(env);
      console.log(fmtStacktrace(env.stacktrace()));
      throw e; //new Error(wsError(e, env.stacktrace()));
    }
  };
  globalEnv.define('read-stream', ws.readStream);

  ws.compileStream = function(stream) {
    var env = globalEnv.setSource(stream.source());
    try {
      var buffer = [];
      while (!stream.eof()) {
        var exp = stream.peek();
        buffer.push(ws.compile(exp));
        stream.next();
      }
      return buffer.join('\n');
    }
    catch(e) {
      throw new Error(wsError(e, env.stacktrace()));
    }
  };
  globalEnv.define('compile-stream', ws.compileStream);

  ws.readString = function(str, input) {
    //console.log(str);
    var stream = pbnj.reader.readString(str, input);
    return ws.readStream(stream);
  };
  globalEnv.define('read-string', ws.readString);

  ws.evalJS = function(exp) {
    //console.log(str);
    var data = pbnj.reader.readJS(exp);
    return ws.eval(data);
  };
  globalEnv.define('eval-js', ws.evalJS);

  ws.compileString = function(str, input) {
    var stream = pbnj.reader.readString(str, input);
    return ws.compileStream(stream);
  };
  globalEnv.define('compile-string', ws.compileString);

  ws.readFile = function(file, env) {
    var env = env || globalEnv;
    scope = env.extend().setIdent('read-file');
    scope.define('*file*', file);
    var path = file.split('/');
    scope.define('*dir*', path.slice(0, path.length - 1).join('/'));
    var stream = pbnj.reader.readFile(file);
    return ws.readStream(stream, scope);
  };
  globalEnv.define('read-file', ws.readFile);

  ws.compileFile = function(file) {
    var stream = pbnj.reader.readFile(file);
    return ws.compileStream(stream);
  };
  globalEnv.define('compile-file', ws.compileFile);
  
  globalEnv.define('*version*', '0.0.1-alpha');
  globalEnv.define('*environment*', _.keyword('development'));
  globalEnv.define('*platform*', typeof exports !== 'undefined' ? _.keyword('nodejs') : _.keyword('browser'));
  // TODO: add browser detection
  globalEnv.define('*platform-version*', typeof exports !== 'undefined' ? _.str("Node.js ", process.versions.v8) : "Unknown Browser");
  globalEnv.define('*target-language*', _.keyword('javascript'));

  ws["@@SCOPE@@"] = globalEnv.extend().setIdent(_.symbol('pbnj.wonderscript'));

  for (var prop in ws) {
    if (ws.hasOwnProperty(prop)) {
      ws["@@SCOPE@@"].define(prop, ws[prop]);
    }
  }

  if (typeof exports !== 'undefined') {
    module.exports = ws;
    var mod = defineModule(_.symbol('js.node'));
    [
      'Buffer',
      '__dirname',
      '__filename',
      'clearImmediate',
      'clearInterval',
      'clearTimeout',
      'console',
      'exports',
      'global',
      'module',
      'process',
      'require',
      'setImmediate',
      'setInterval',
      'setTimeout'
    ].forEach(function(name) {
      defineVariable(globalEnv, _.symbol('js.node', name), eval(name));
    });
  }
  ws.readFile("src/pbnj/core.ws");

} // namespace pbnj.wonderscript
