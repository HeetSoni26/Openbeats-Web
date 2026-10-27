/*
 * Openbeats Web — synced lyrics via LRCLIB (free, no key).
 * Falls back to plain lyrics when no synced (LRC) version exists.
 */

export interface LyricLine {
  time: number // seconds
  text: string
}

export interface Lyrics {
  synced: boolean
  lines: LyricLine[]
}

const cache = new Map<string, Lyrics | null>()

function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of lrc.split("\n")) {
    const m = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/)
    if (!m) continue
    const text = m[3].trim()
    if (!text) continue
    lines.push({ time: parseInt(m[1], 10) * 60 + parseFloat(m[2]), text })
  }
  return lines.sort((a, b) => a.time - b.time)
}

export async function fetchLyrics(
  track: string,
  artist: string,
  durationSec: number,
): Promise<Lyrics | null> {
  const key = `${track}|${artist}`.toLowerCase()
  if (cache.has(key)) return cache.get(key) ?? null

  try {
    const params = new URLSearchParams({
      track_name: track,
      artist_name: artist,
    })
    if (durationSec > 0) {
      params.set("duration", String(Math.round(durationSec)))
    }
    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { "Lrclib-Client": "Openbeats Web (github.com/HeetSoni26/Openbeats-Web)" },
    })
    if (res.ok) {
      const data = await res.json()
      const lyrics = toLyrics(data)
      if (lyrics) {
        cache.set(key, lyrics)
        return lyrics
      }
    }

    // get misses often; search is fuzzier.
    const sres = await fetch(
      `https://lrclib.net/api/search?${new URLSearchParams({ q: `${track} ${artist}` })}`,
      { headers: { "Lrclib-Client": "Openbeats Web (github.com/HeetSoni26/Openbeats-Web)" } },
    )
    if (sres.ok) {
      const results = await sres.json()
      for (const r of results ?? []) {
        const lyrics = toLyrics(r)
        if (lyrics) {
          cache.set(key, lyrics)
          return lyrics
        }
      }
    }
  } catch {
    /* lyrics are best-effort */
  }
  cache.set(key, null)
  return null
}

function toLyrics(data: any): Lyrics | null {
  if (!data) return null
  if (data.syncedLyrics) {
    const lines = parseLrc(data.syncedLyrics)
    if (lines.length) return { synced: true, lines }
  }
  if (data.plainLyrics) {
    const lines = String(data.plainLyrics)
      .split("\n")
      .filter((l) => l.trim())
      .map((text, i) => ({ time: i * 3, text }))
    if (lines.length) return { synced: false, lines }
  }
  return null
}
