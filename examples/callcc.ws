; vim: ft=clojure
(module callcc)

(define C false)

(define-function test-cc
  []
  (define- i 0)
  (call-with-current-continuation (lambda [k] (set! C k)))
  (set! i (add1 i))
  i)

(say (test-cc))
;(println "test-cc: " (test-cc))
;(println "test-cc: " (test-cc))
(println (C))
(println (C))
(say (test-cc))
(println (C))
