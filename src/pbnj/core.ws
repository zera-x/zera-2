; vim: ft=clojure

(macro fn [args &body]
  (do
    (unless (vector? args) (throw "arguments should be a vector"))
    (list 'paren
      (cons 'function
            (cons args
                (reduce
                  (lambda [l exp]
                          (if (empty? l) (cons (list 'return exp) l) (cons exp l)))
                  (list)
                  (reverse body)))))))

(console.log ((fn [x] x) 1))

(comment
(set! pbnj.wonderscript.CURRENT_MODULE (symbol "pbnj.jess"))
(macro module [nm &body]
  (let [prev-mod pbnj.jess/CURRENT_MODULE
        set-mod! (lambda [nm]
                         (list 'set! 'pbnj.jess.CURRENT_MODULE (list 'symbol (str nm))))]
    (pbnj.jess/eval (set-mod! nm))
    (list
      'paren
      (list
        (cons
          'fn
          (cons
            []
            (cons
              (list '.-set! 'ROOT_OBJECT (into [] (. (str nm) split ".")) (hash-map))
              (concat body (list (set-mod! prev-mod)) (list nm)))))))))

(macro def [nm value]
  (let [nm_ (symbol (name nm))
        ns (namespace name)
        ns_ (symbol (if ns ns pbnj.wonderscript/CURRENT_MODULE))]
    (list 'do
          (list 'var nm_ value)
          (list 'set! (symbol ns_ nm_) nm_))))

(macro def- [nm value]
  (list 'var nm value))

(macro defn [nm args &body]
  (list 'def nm (cons 'fn (cons args body))))

(macro defn- [nm args &body]
  (list 'def- nm (cons 'fn (cons args body))))

(macro class
  [nm fields &methods]
   (let [klass (symbol nm)
         assigns (map-indexed
                   (lambda [i f]
                           (list '.-set! 'this (name f) (list '.- 'arguments i))) fields)
         ctr (cons 'function (cons nm (cons (apply vector fields) assigns)))
         meths (mori/map (lambda [meth]
                            (let [n (str (first meth))
                                  args (first (rest meth))
                                  body (rest (rest meth))]
                              (list '.-set! klass (vector "prototype" n) (cons 'fn (cons args body))))) methods)
         proto (if (empty? meths) [] (cons (list '.-set! klass "prototype" (hash-map)) meths))]
     (list 'def nm (list (cons 'fn (cons [] (into (list) (reverse (concat (list ctr) proto (list klass))))))))))

(macro mixin
  ([&methods]
   (let [meths
         (map methods
              (lambda [meth]
                      (let [n (str (first meth))
                            args (first (rest meth))
                            body (rest (rest meth))]
                        (list '.-set! 'this n (cons 'fn (cons args body))))))]
     (cons 'function (cons [] meths))))
  ([nm &methods]
   (list 'def nm (cons 'mixin methods))))

(module pbnj.core
  (defn extend [obj mix] (. mix call obj))

  (defn type [value]
    (var t (typeof value))
    (cond (=== value null) "null"
          (=== t "object")
            (if (value.constructor.name)
              (str "object[" value.constructor.name "]")
              t)
          :else t)))

(mixin Point
       (isPoint [] true))

(class Point2D [x y]
       (toString
         []
         (pbnj.core.str "(" this.x ", " this.y ")"))
       (distance
         [that]
         (Math.sqrt (+ (Math.pow (- that.x this.x) 2) (Math.pow (- that.y this.y) 2)))))

(extend Point2D.prototype Point)

(macro init [ctr args]
  (list 'new (list 'paren (list '. (list '.- ctr 'bind) 'apply ctr args))))

(defn point []
  (if-else
    (=== arguments.length 2)
      (. Point2D.bind apply Point2D arguments)
    :else
      (throw (new Error "invaid point"))))

(set! window.point (fn [x y] (new Point x y)))

(var p1 (new Point 3 4))

(console.log (.- p1 x))
(console.log p1.y)
(console.log (instance? p1 Point))
(console.log (type 1))
(console.log (. p1 toString))

(var i 0)
(while (< i 10)
  (console.log i)
  (++ i))
)
