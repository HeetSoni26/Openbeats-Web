import { useEffect, useRef } from "react"
import { audioEngine } from "../lib/audioEngine"

/**
 * Radial halo around the album art. Uses the real analyser when available,
 * otherwise a graceful pseudo-wave driven by playback time.
 */
export function Visualizer({ playing }: { playing: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    let phase = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const tick = () => {
      const w = canvas.width
      const h = canvas.height
      const cx = w / 2
      const cy = h / 2
      const baseR = Math.min(w, h) * 0.33
      ctx.clearRect(0, 0, w, h)

      const accent =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--accent")
          .trim() || "#7c5cff"

      const analyser = audioEngine.state.analyser
      let bins: number[] | null = null
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        bins = Array.from(data.slice(0, 40))
      }

      ctx.strokeStyle = accent
      ctx.lineCap = "round"
      const bars = 48
      for (let i = 0; i < bars; i++) {
        const angle = (i / bars) * Math.PI * 2 - Math.PI / 2
        let amp: number
        if (bins && playing) {
          amp = (bins[Math.floor((i / bars) * bins.length)] / 255) * baseR * 0.5
        } else {
          amp =
            playing
              ? (Math.sin(phase * 2 + i * 0.4) * 0.5 + 0.5) * baseR * 0.16 +
                baseR * 0.05
              : baseR * 0.025
        }
        const inner = baseR * 1.06
        const outer = inner + Math.max(amp, 2)
        ctx.globalAlpha = 0.35 + (amp / (baseR * 0.5)) * 0.5
        ctx.lineWidth = (w / bars) * 0.32
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      phase += playing ? 0.045 : 0.008
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [playing])

  return <canvas ref={ref} className="visualizer" aria-hidden />
}
