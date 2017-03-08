; vim: ft=clojure
(module pbnj.peanutbutter)

(define *components* {})

(define-function nil? [exp] (or (pbnj.core/nil? exp) (and (collection? exp) (empty? exp))))

(define render-nil (always ""))

(define-function tag? [exp]
  (and (sequential? exp)
       (let [nm (first exp)]
         (or (symbol? nm) (keyword? nm)))))

(define-function- render-tag-name [tname]
  (let [ns (namespace tname)
        nm (name tname)]
    (if ns
      (str ns ":" nm)
      nm)))

(define-function- render-single-tag [tag]
  (str "<" (render-tag-name (first tag)) " />"))

(define-function- render-content-tag [tag]
  (let [nm (render-tag-name (first tag))]
    (str "<" nm ">" (render-expression-list (rest tag)) "</" nm ">")))

(define-function render-attrs [attrs]
  (pbnj.core/join
    (mori/map
         (lambda [pair]
                 (let [attr (pair 0)]
                  (str (if (keyword? attr) (name attr) attr) "=\"" (pair 1) "\""))) attrs) " "))

(define-function- render-attrs-tag [tag]
  (let [nm (render-tag-name (first tag))
        attrs (render-attrs (second tag))]
    (str "<" nm " " attrs ">" (render-expression-list (rest (rest tag))) "</" nm ">")))

(define-function render-tag [tag]
  (cond (attrs? (second tag)) (render-attrs-tag tag)
        (> (count tag) 1) (render-content-tag tag)
        :else
          (render-single-tag tag)))

(define attrs? map?)

(define expression-list? sequential?)

(define-function render-expression-list [exprs]
  (reduce (mori/map html exprs) str))

(define-function define-component [nm fn]
  (set! *components*
        (assoc *components*
               (if (keyword? nm) (name nm) (str nm))
               fn))
  fn)

(define-function definition? [exp]
  (and (list? exp) (= (first exp) 'define)))

(define-function eval-definition
  ([nm value]
   (define-component nm (always value)))
  ([nm args &body]
   (unless (vector? args) (throw "argument list should be a vector"))
   (define-component nm (eval (cons 'lambda (cons args body))))))

(define-function component? [exp]
  (if (tag? exp)
    (let [nm (first exp)
          nmstr (if (keyword? nm) (name nm) (str nm))]
      (has-key? *components* nmstr))))

(define-function render-component [exp]
  (let [component
         (*components*
           (let [nm (first exp)]
             (if (keyword? nm) (name nm) (str nm))))]
    (html (apply component (rest exp)))))

(define-function atom? [exp]
  (or (number? exp) (boolean? exp) (string? exp)))

(define render-atom str)

(define-function html
  [exp]
  (cond (nil? exp) (render-nil)
        (atom? exp) (render-atom exp)
        (definition? exp) (apply eval-definition (rest exp))
        (component? exp) (render-component exp)
        (tag? exp) (render-tag exp)
        (expression-list? exp) (render-expression-list exp)
        :else
          (throw "invalid expression")))

(define-function render-to [elem expr])

(define-function render [expr]
  (. js/document write (html expr)))

(define-component :javascript
  (lambda
    [code]
    [:script {:type "text/javascript"}
     (if (string? code)
       code
       (pbnj.jess/compile code))]))

(define-component :wonderscript
  (lambda
    [code]
    [:script {:type "text/javascript"} (pbnj.wonderscript/compile code)]))

(test html
  (is (= "<br />" (html [:br])))
  (is (= "<br />" (html '(br))))
  (is (= "<b>Test</b>" (html [:b "Test"])))
  (is (= "<a href=\"#\">Test</a>" (html [:a {:href "#"} "Test"])))
  (is (= "<script type=\"text/javascript\">alert(\"test\")</script>"
         (html [:javascript "alert(\"test\")"])))
  (is (= "<script type=\"text/javascript\">alert(\"test\")</script>"
         (html [:javascript '(alert "test")])))
  (is (= "<script type=\"text/javascript\">alert(\"test\")</script>"
         (html [:wonderscript '(alert "test")]))))