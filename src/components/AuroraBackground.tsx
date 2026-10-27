import { useEffect, useRef } from "react"

/**
 * Drifting aurora blobs that tint themselves from the live accent palette.
 * Rendered at quarter resolution and upscaled with CSS blur — cheap and soft.
 */
export function AuroraBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    let t = 0
    const dpr = 0.25

    const resize = () => {
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr))
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr))
    }
    resize()
    window.addEventListener("resize", resize)

    const readVar = (name: string, fallback: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

    const blob = (
      cx: number,
      cy: number,
      r: number,
      color: string,
      alpha: number,
    ) => {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      grad.addColorStop(0, color)
      grad.addColorStop(1, "transparent")
      ctx.globalAlpha = alpha
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }

    const tick = () => {
      t += 0.0016
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      const accent = readVar("--accent", "#7c5cff")
      const soft = readVar("--accent-soft", "#2a2440")

      blob(
        w * (0.25 + 0.12 * Math.sin(t * 1.1)),
        h * (0.3 + 0.1 * Math.cos(t * 0.9)),
        w * 0.55,
        accent,
        0.16,
      )
      blob(
        w * (0.75 + 0.1 * Math.cos(t * 0.8 + 2)),
        h * (0.65 + 0.12 * Math.sin(t * 1.3 + 1)),
        w * 0.6,
        soft,
        0.5,
      )
      blob(
        w * (0.55 + 0.15 * Math.sin(t * 0.7 + 4)),
        h * (0.15 + 0.1 * Math.cos(t * 1.05 + 3)),
        w * 0.35,
        accent,
        0.1,
      )

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return <canvas ref={ref} className="aurora" aria-hidden />
}
