; vim: ft=clojure
(module pbnj.core)

; aliases
(define list? isList)
(define map? isMap)
(define vector? isVector)
(define set? isSet)
(define collection? isCollection)
(define seq? isSeq)
(define sequential? isSequential)
(define associative? isAssociative)
(define counted? isCounted)
(define indexed? isIndexed)
(define reduceable? isReduceable)
(define seqable? isSeqable)
(define reversible? isReversible)

(define symbol? isSymbol)
(define keyword? isKeyword)

; js types
(define number? isNumber)
(define string? isString)
(define boolean? isBoolean)
(define nil? isNull)
(define undefined? isUndefined)
(define date? isDate)
(define error? isError)
(define regexp? isRegExp)
(define function? isFunction)
(define object? isObject)
(define arguments? isArguments)
(define element? isElement)
(define map-object mapObject)
(define map-indexed mapIndexed)

; arrays
(define array? isArray)
(define arraylike? isArrayLike)
(define ->array toArray)
(define into-array intoArray)

(define odd? isOdd)
(define even? isEven)

(define subset? isSubset)
(define superset? isSuperset)

(define empty? isEmpty)

; other mori functions
(define has? hasKey)
(define has-key? hasKey)
(define hash-map hashMap)
(define sorted-set sortedSet)
(define get-in getIn)
(define assoc-in assocIn)
(define update-in updateIn)
(define reduce-kv reduceKV)
(define take-while takeWhile)
(define drop-while dropWhile)
(define sort-by sortBy)
(define partition-by partitionBy)
(define group-by groupBy)
(define prim-seq primSeq)
(define ->ws toClj)
(define ->js toJs)

(define + add)
(define - sub)
(define * mult)
(define / div)

(define-macro define-once [nm value]
  (list 'cond (list 'not (list 'defined? nm)) (list 'define nm value) :else nm))

(define-macro define-test [nm &body]
  (do
    (define- t (keyword (namespace nm) (name nm)))
    (define-once *tests* {})
    (list 'set! '*tests*
          (list 'assoc '*tests* (keyword (namespace nm) (name nm))
                {:test/name (keyword (namespace nm) (name nm))
                 :test/fn (cons 'lambda (cons [] (concat body [[(keyword (namespace nm) (name nm)) :passed]])))}))))

(define-macro is [body]
  (list 'cond (list 'not body) (list 'throw (str "FAILURE: " (inspect body) " is false"))))

(define-macro is-not [body]
  (list 'is (list 'not body)))

(define-test literals
  (let [n (generate-nat)]
    (is (= n (read-string (str n)))))
  (is (= -1 (read-string "-1")))
  (is (= -1.14 (read-string "-1.14")))
  (is (= 1.14 (read-string "+1.14")))
  (is (= 1 (read-string "+1")))
  (is (= 3.14159 (read-string "3.14159")))
  (is (= 3000 (read-string "3_000")))
  (is (= "abc" (read-string "\"abc\"")))
  (is (= :a (read-string ":a")))
  (is (= 'b (read-string "'b")))
  (is (= '(1 2 3) (read-string "'(1 2 3)")))
  (is (= [1 2 3] (read-string "[1 2 3]")))
  (is (= {:a 1 :b 2 :c 3} (read-string "{:a 1 :b 2 :c 3}")))
  (is (= 5000 (read-string "5,000")))
  (is (= 5000 (read-string "5_000")))
  (is (= 5 (read-string "5.000"))))

(define-macro comment [&forms] nil)

(define-test comment
  (is (= nil (comment)))
  (is (= nil (comment asdfasdf asfasdf sfasdfasd asfasdfasd))))

(define-macro let [bindings &body]
  (cond (not (vector? bindings)) (throw "let bindings should be a vector"))
  (cons 'do
        (concat (map (pair bindings)
                     (lambda [pair] (list 'define- (pair 0) (pair 1))))
                body)))

(define-test let
  (is (= [1 2]
         (let [x 1
               y (+ x 1)]
           (is (= x 1))
           (is (= y 2))
           [x y]))))

(define-macro if
  ([pred conse] (list 'cond pred conse))
  ([pred conse alt] (list 'cond pred conse :else alt))) 

(define-test if
  (is (= 1 (if true 1)))
  (is (= 1 (if true 1 2)))
  (is (= 2 (if false 1 2)))
  (is (= nil (if false 1)))
  (is (= 2 (if nil 1 2))))

(define-macro if-not
  ([pred conse] (list 'cond (list 'not pred) conse))
  ([pred conse alt] (list 'cond (list 'not pred) conse :else alt)))

(define-test if-not
  (is (= 1 (if-not false 1)))
  (is (= 1 (if-not false 1 2)))
  (is (= 2 (if-not true 1 2)))
  (is (= nil (if-not true 1)))
  (is (= 1 (if-not nil 1 2))))

(define-macro unless [pred &acts]
  (list 'cond (list 'not pred) (cons 'do acts)))

(define-test unless
  (is (= 5 (unless false 1 2 3 4 5)))
  (is (= nil (unless true 1 2 3 4 5))))

(define-macro when [pred &acts]
  (list 'cond pred (cons 'do acts)))

(define-test when
  (is (= 5 (when true 1 2 3 4 5)))
  (is (= nil (when false 1 2 3 4 5))))

(define-macro or
  ([] nil)
  ([a] a)
  ([&forms]
   (let [or* (first forms)]
     (list 'if or* or* (cons 'or (rest forms))))))

(define-test or
  (is (or true))
  (is (or false true))
  (is (or false false true))
  (is (or false false false true))
  (is-not (or false))
  (is-not (or false false))
  (is-not (or false false false)))

(define-macro and
  ([] true)
  ([a] a)
  ([&forms]
   (let [and* (first forms)]
     (list 'if and* (cons 'and (rest forms)) and*))))

(define-test and
  (is (and true))
  (is (and true true))
  (is (and true true true))
  (is-not (and false))
  (is-not (and false false))
  (is-not (and false false false))
  (is-not (and false true))
  (is-not (and false true true))
  (is-not (and true true false)))

(define-macro define-function
  [name &forms]
  (list 'define name
        (cons 'lambda forms)))

(define-test define-function
  (define-function ident [x] x)
  (define-function inc [x] (+ 1 x))
  (is (= 1 (ident 1)))
  (is (= :a (pbnj.core/ident :a)))
  (is (= 4 (inc 3)))
  (is (= 5 (pbnj.core/inc 4))))

(define-macro define-function-
  [name &forms]
  (list 'define- name
        (cons 'lambda forms)))

(define-test define-function-
  (define-function- ident- [x] x)
  (define-function- inc- [x] (+ 1 x))
  ;(is (= :a (pbnj.core/ident- :a)))
  ;(is (= 5 (pbnj.core/+1- 4)))
  (is (= 1 (ident- 1)))
  (is (= 4 (inc- 3))))

(define-macro not= [&values]
  (list 'not (cons '= values)))

(define-test not=
  (is (not= 1 2))
  (is (not= :a :b))
  (is (not= 1 :a))
  (is-not (not= 1 1))
  (is-not (not= :a :a))
  (is-not (not= [1 2 3 4] [1 2 3 4])))

(define-function add1 [n] (+ 1 n))
(define-function sub1 [n] (- 1 n))

(define-function join
  [col delim]
  (reduce col (lambda [s x] (str s delim x))))

(define-function prove [t] ((:test/fn (*tests* (keyword (namespace t) (name t))))))

(define-test prove
  (define-test passing-test (is (= 1 1)))
  (define-test failing-test (is (= 0 1)))
  (is (= (prove :passing-test) [:passing-test :passed])))

(define-function collect-tests [module] (vals (eval (symbol (name module) "*tests*"))))

(define-function prove-module [module]
  (into [] (map (map (collect-tests module) :test/name) prove)))

(define-macro do-times
  [bindings &body]
  (if-not (and (vector? bindings) (= (count bindings) 2))
    (throw "bindings should be a vector with two elements"))
  (let [block-nm (gen-sym "do-times")
        act-nm (gen-sym "do-times-act")
        var (bindings 0)
        init (bindings 1)]
    (list 'do
          (list 'define- var 0)
          (list 'define- act-nm (cons 'lambda (cons [var] body)))
          (list 'define- block-nm
                (list 'lambda []
                      (list 'if (list '< var init)
                            (list 'do
                                  (list act-nm var)
                                  (list 'set! var (list '+ 1 var))
                                  (list block-nm)))))
          (list block-nm))))

(define-function fraction [n]
  (- n (. js/Math floor n)))

(define-function sign [n]
  (if (number? n) (. js/Math sign n) 0))

(define-function positive? [n]
  (= n (. js/Math abs n)))

(define-function negative? [n]
  (not= n (. js/Math abs n)))

(define-function integer? [n] (= 0 (fraction n)))

(define-function natural? [n]
  (and (integer? n) (positive? n)))

(define-test natural?
  (is (natural? 0))
  (is (natural? 1))
  (is (natural? 34))
  (is (natural? 21412412341234123463456435437456))
  (is-not (natural? -1))
  (is-not (natrual? 1.1)))

(define-function generate-int
  ([] (generate-int -100 100))
  ([min max]
   (let [a (. js/Math ceil min)
         b (. js/Math ceil max)]
     (+ a (. js/Math floor (* (. js/Math random) (- b a)))))))

(define-test generate-int
  (do-times [n 100]
    (is (integer? (generate-int)))))

(define-function generate-nat
  ([] (generate-int 0 100))
  ([min max]
   (let [a (. js/Math abs min)]
    (if (> a max) (throw "The absolute value of min should be less than max"))
    (generate-int a max))))

(define-test generate-nat
  (do-times [n 100]
    (let [m (generate-nat)]
      (is (natural? (generate-nat))))))

(define-function generate-float
  ([] (generate-float 0 100))
  ([min max]
   (+ (generate-int min max) (* (. js/Math random (- max min))))))

(define-test generate-float
  (do-times [n 100]
    (is (number? (generate-float)))))

(define-function generate-str
  ([] (generate-str 1 20))
  ([min max]
   (let [n (generate-nat min max)
         xs (take n (iterate (partial generate-nat 0x20 0x4000) (generate-nat 0x20 0x4000)))]
     (apply-method js/String (.- js/String fromCodePoint) xs))))

(define-test generate-string
  (do-times [n 100]
    (is (string? (generate-string)))))

(define-function generate-keyword
  ([] (generate-keyword 1 20))
  ([min max]
   (let [ns? (> (generate-int 0 2) 0)
         nm (generate-str min max)
         ns (generate-str min max)]
     (if ns?
      (keyword ns nm)
      (keyword nm)))))

(define-test generate-keyword
  (do-times [n 100]
    (is (keyword? (generate-keyword)))))

(define-function generate-symbol
  ([] (generate-keyword 1 20))
  ([min max]
   (let [ns? (> (generate-int 0 2) 0)
         nm (generate-str min max)
         ns (generate-str min max)]
     (if ns?
      (symbol ns nm)
      (symbol nm)))))

(define-test generate-symbol
  (do-times [n 100]
    (is (symbol? (generate-symbol)))))

(require "src/pbnj/jess.ws")
(require "src/pbnj/wonderscript/compiler.ws")

(use pbnj.core)

(define *sym-count* 0)
(define-function gen-sym 
  ([] (gen-sym "sym"))
  ([prefix]
   (let [sym (symbol (str prefix "-" *sym-count*))]
     (set! *sym-count* (+ 1 *sym-count*))
     sym)))

(define-test gen-sym
  (is (symbol? (gen-sym)))
  (is (symbol? (gen-sym "prefix")))
  (is-not (= (gen-sym) (gen-sym)))
  (is-not (= (gen-sym "prefix") (gen-sym "prefix"))))

(define-macro .
  [obj method &args]
  (let [name (gen-sym)]
    (list 'do
          (list 'define name obj)
          (list 'apply-method name (list '.- name method) (into (vector) args)))))

(define-test .
  (let [d (new js/Date 2016 10 25)]
    (is (= (. d getMonth) 10))
    (is (= (. d getFullYear) 2016))
    (is (= (. d getDate) 25))
    (is (= (. js/Math abs -3) 3))))

(define-macro .?
  [obj method &args]
  (list 'if (list '.- obj method) (cons '. (cons obj (cons method args))) nil))

(define-test .?
  (let [d (new js/Date 2016 10 25)]
    (is (= (.? d getMonth) 10))
    (is (= (.? d missing-method) nil))))

(define-macro define-class [nm fields &methods]
  (let [klass (symbol nm)
        assigns (map-indexed
                  (lambda [i f]
                          (list '.-set! 'this (name f) f)) fields)
        ctr (cons 'function (cons nm (cons (apply vector fields) assigns)))
        meths (map methods
                   (lambda [meth]
                           (let [n (str (first meth))
                                 args (first (rest meth))
                                 body (rest (rest meth))]
                             (list '.-set! klass (vector "prototype" n)
                                   (list 'fn
                                         (into (vector) (rest args))
                                         (list '.
                                               (cons 'fn (cons [(first args)] (map body pbnj.wonderscript/ws->jess)))
                                               'apply
                                               'this
                                               (list '. '[this] 'concat (list 'Array.prototype.slice.call 'arguments))))))))
        proto (cons (list '.-set! klass "prototype" (hash-map)) meths)]
    (list 'define nm (list 'pbnj.jess/eval (list 'quote (into (list) (reverse (concat (list 'do) (list ctr) proto (list klass)))))))))

(define-test define-class
  (define-class Point
    [x y]
    (toString
      [self]
      (str "(" (.- self x) ", " (.- self y) ")")))
  (let [p (new Point 3 4)]
    (is (= 3 (.- p x)))
    (is (= 4 (.- p y)))
    (is (= "(3, 4)", (str p)))
    (is (= "(3, 4)", (. p toString)))))

(comment
(define-macro define-method
  [nm value args &body]
  )

(define-method distance Point [p1 p2]
  (Math/sqrt (+ (Math/pow (- (point-x p2) (point-x p1)) 2) (Math/pow (- (point-y p2) (point-y p1)) 2)))) 

(define-class pbnj.core/PersistentList [h t]
  (first [] this.h)
  (rest  [] this.t)
  (isEmpty [] (and (nil? this.h) (nil? this.t))))

(define pbnj.core.PersistentList/EMPTY (new PersistentList nil nil))

(define-function plist
  [&elements]
  (reduce elements
          (lambda [e] ) ))
)
