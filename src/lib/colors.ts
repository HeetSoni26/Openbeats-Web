/*
 * Openbeats Web — extract a two-color palette from album art so the whole UI
 * breathes with the currently playing song.
 */

export interface Palette {
  primary: string // vivid accent
  soft: string // desaturated companion
}

export async function extractPalette(imageUrl: string): Promise<Palette> {
  const fallback: Palette = { primary: "#7c5cff", soft: "#2a2440" }
  try {
    const img = new Image()
    img.crossOrigin = "anonymous"
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("load failed"))
      img.src = imageUrl
    })

    const size = 24
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) return fallback
    ctx.drawImage(img, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    let bestScore = -1
    let best: [number, number, number] = [124, 92, 255]
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const sat = max === 0 ? 0 : (max - min) / max
      const lum = (r + g + b) / 3
      // Prefer vivid, mid-brightness pixels; skip near-black/white.
      const score = sat * 2 + (1 - Math.abs(lum - 128) / 128)
      if (score > bestScore) {
        bestScore = score
        best = [r, g, b]
      }
    }

    const [r, g, b] = best
    const primary = `rgb(${r}, ${g}, ${b})`
    // Soft variant: darker + desaturated for backgrounds.
    const soft = `rgb(${Math.round(r * 0.28 + 10)}, ${Math.round(g * 0.28 + 10)}, ${Math.round(b * 0.28 + 22)})`
    return { primary, soft }
  } catch {
    return fallback
  }
}
