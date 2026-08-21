import { useEffect, useRef, useState } from 'react'

// Cubic ease-out: fast start, gentle settle — feels more polished than a
// linear tick-up for a short (~1-1.5s) animation.
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

// Animates a number from 0 up to `value` once the element scrolls into
// view, then never again — IntersectionObserver disconnects itself after
// the first trigger. Renders the final value immediately (no animation)
// when the user has requested reduced motion.
function CountUp({ value, decimals = 0, suffix = '', duration = 1300 }) {
  const ref = useRef(null)
  const frameRef = useRef(null)
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()

        const start = performance.now()
        function tick(now) {
          const t = Math.min((now - start) / duration, 1)
          setDisplay(value * easeOutCubic(t))
          if (t < 1) frameRef.current = requestAnimationFrame(tick)
        }
        frameRef.current = requestAnimationFrame(tick)
      },
      { threshold: 0.4 }
    )
    observer.observe(node)

    return () => {
      observer.disconnect()
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [value, duration])

  return (
    <span ref={ref}>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  )
}

export default CountUp
