/*
 * Openbeats Web — client-side YouTube Music innertube access.
 * All requests happen from the visitor's browser; audio streams are played
 * directly from YouTube's CDN and never proxied through this site.
 */

export interface Track {
  videoId: string
  title: string
  artist: string
  album?: string
  duration?: string
  thumbnail: string
}

export interface StreamResult {
  url: string
  itag: number
  mimeType: string
  bitrate: number
  contentLength: number
  client: string
}

const ENDPOINTS = {
  search: "https://www.youtube.com/youtubei/v1/search",
  player: "https://www.youtube.com/youtubei/v1/player",
}

const SUGGEST_URL = "https://suggestqueries.google.com/complete/search"

interface InnertubeClient {
  name: string
  clientVersion: string
  extra?: Record<string, unknown>
  userAgent: string
}

// Same client chain philosophy as the Android app: try the clients that
// currently serve complete streams, best-first. Web clients are last
// (they may need a PO token; app-client emulation usually succeeds first).
const PLAYER_CLIENTS: InnertubeClient[] = [
  {
    name: "ANDROID_VR",
    clientVersion: "1.61.48",
    extra: {
      androidSdkVersion: 32,
      osName: "Android",
      osVersion: "12L",
      deviceModel: "Quest 3",
    },
    userAgent:
      "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
  },
  {
    name: "IOS",
    clientVersion: "20.10.4",
    extra: {
      deviceMake: "Apple",
      deviceModel: "iPhone16,2",
      osName: "iPhone",
      osVersion: "18.5.0.22F76",
      platform: "MOBILE",
    },
    userAgent:
      "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_5_0 like Mac OS X;)",
  },
  {
    name: "WEB_REMIX",
    clientVersion: "1.20260114.01.00",
    extra: { platform: "DESKTOP", originalUrl: "https://music.youtube.com/" },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  },
]

// Session-wide visitor identity: YouTube issues one per response and
// bot-gating loosens dramatically when the same identity is reused — the web
// equivalent of the Android app's visitorData handling.
let visitorId: string | null = sessionStorage.getItem("obVisitor")

function clientContext(client: InnertubeClient) {
  return {
    client: {
      clientName: client.name,
      clientVersion: client.clientVersion,
      hl: "en",
      gl: "US",
      ...(visitorId ? { visitorData: visitorId } : {}),
      ...client.extra,
    },
  }
}

function captureVisitor(data: any) {
  const vid = data?.responseContext?.visitorData
  if (vid && vid !== visitorId) {
    visitorId = vid
    try {
      sessionStorage.setItem("obVisitor", vid)
    } catch {
      /* private mode */
    }
  }
}

/** Proxy endpoint (same-origin) used when the browser blocks direct calls. */
const PROXY_PATH = "/api/youtubei"

/**
 * Innertube POST with layered transport: direct browser fetch first (works
 * when youtubei sends permissive CORS), then the same-origin metadata proxy.
 * Never streams media through the proxy — JSON only.
 */
export async function innertubePost(
  endpoint: keyof typeof ENDPOINTS,
  body: unknown,
  client?: InnertubeClient,
  forceProxy = false,
): Promise<any> {
  const url = `${ENDPOINTS[endpoint]}?prettyPrint=false`
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Goog-Api-Format-Version": "1",
    "X-YouTube-Client-Name": clientNameId(client?.name ?? "WEB_REMIX"),
    "X-YouTube-Client-Version": client?.clientVersion ?? "1.20260114.01.00",
  }
  if (client?.userAgent && !isBrowserUserAgent()) {
    // Browsers forbid setting User-Agent; harmless on direct calls.
    try {
      Object.defineProperty(headers, "User-Agent", { value: client.userAgent })
    } catch {
      /* ignore */
    }
  }

  try {
    if (forceProxy) throw new Error("proxy")
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    captureVisitor(json)
    return json
  } catch (directError) {
    // CORS or network failure — fall back to the metadata-only proxy.
    const res = await fetch(PROXY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, body, visitorId, client: client ? {
        name: client.name,
        version: client.clientVersion,
        userAgent: client.userAgent,
      } : null }),
    })
    if (!res.ok) throw directError
    const json = await res.json()
    captureVisitor(json)
    return json
  }
}

function isBrowserUserAgent(): boolean {
  return typeof navigator !== "undefined" && /Mozilla/.test(navigator.userAgent)
}

function clientNameId(name: string): string {
  const ids: Record<string, string> = {
    WEB_REMIX: "67",
    ANDROID_VR: "28",
    IOS: "5",
    VISIONOS: "96",
  }
  return ids[name] ?? "67"
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function textOf(runs: any[] | undefined): string {
  return (runs ?? []).map((r) => r.text).join("").trim()
}

function bestThumbnail(renderers: any): string {
  const thumbs =
    renderers?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
    renderers?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
    []
  const best = thumbs[thumbs.length - 1]
  return best?.url ?? ""
}

export async function searchTracks(query: string): Promise<Track[]> {
  // Songs-filter params constant (same as the Android app's FILTER_SONG).
  const data = await innertubePost("search", {
    context: clientContext(PLAYER_CLIENTS[3]),
    query,
    params: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D",
  })

  const tracks: Track[] = []
  const sections =
    data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents ?? []

  for (const section of sections) {
    const shelf = section.musicShelfRenderer
    if (!shelf) continue
    for (const content of shelf.contents ?? []) {
      const item = content.musicResponsiveListItemRenderer
      if (!item?.playlistItemRenderer?.videoId && !item?.overlay && !item?.flexColumns) continue
      const videoId =
        item.playlistItemRenderer?.videoId ??
        item.overlay?.musicItemThumbnailOverlayRenderer?.content
          ?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ??
        item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text
          ?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId
      if (!videoId) continue

      const cols = (item.flexColumns ?? []).map(
        (c: any) => textOf(c.musicResponsiveListItemFlexColumnRenderer?.text?.runs),
      )
      const title = cols[0]
      if (!title) continue
      const meta = cols.slice(1).filter(Boolean)
      // Typical meta: [artist, album, duration] or [artist, duration]
      const artist = meta[0] ?? "Unknown artist"
      const duration = meta.find((m: string) => /^\d+:\d{2}$/.test(m))
      const album = meta.length >= 3 ? meta[1] : undefined

      tracks.push({
        videoId,
        title,
        artist,
        album,
        duration,
        thumbnail: bestThumbnail(item),
      })
      if (tracks.length >= 40) return tracks
    }
  }
  return tracks
}

export async function searchSuggestions(query: string): Promise<string[]> {
  const q = query.trim()
  if (!q) return []
  // Google's public suggest endpoint (same one youtube.com uses); falls back
  // to the metadata proxy when CORS blocks the direct call.
  const url = `${SUGGEST_URL}?client=firefox&ds=yt&q=${encodeURIComponent(q)}`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return (data?.[1] ?? []).slice(0, 8)
  } catch {
    try {
      const res = await fetch(PROXY_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "suggest", body: { q }, visitorId }),
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data?.[1] ?? []).slice(0, 8)
    } catch {
      return []
    }
  }
}

// ---------------------------------------------------------------------------
// Playback resolution
// ---------------------------------------------------------------------------

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string }
  streamingData?: {
    adaptiveFormats?: Array<{
      itag: number
      mimeType: string
      bitrate: number
      contentLength?: string | number
      url?: string
      audioQuality?: string
    }>
  }
}

function pickAudioFormat(data: PlayerResponse): StreamResult | null {
  const formats = (data.streamingData?.adaptiveFormats ?? []).filter(
    (f) => f.url && f.mimeType.startsWith("audio/"),
  )
  if (!formats.length) return null
  // Prefer opus 251 > 250 > 249, then m4a 140; higher bitrate first within type.
  const score = (f: any) => {
    const itag = f.itag
    if (itag === 251) return 500
    if (itag === 250) return 400
    if (itag === 249) return 300
    if (itag === 140) return 200
    return 100 + (f.bitrate ?? 0) / 100000
  }
  const best = formats.sort((a, b) => score(b) - score(a))[0]
  return {
    url: best.url!,
    itag: best.itag,
    mimeType: best.mimeType,
    bitrate: best.bitrate ?? 0,
    contentLength: Number(best.contentLength ?? 0),
    client: "",
  }
}

/**
 * Resolve a playable stream for a video, walking the client chain like the
 * Android app. Streams are validated with tiny range probes; if CORS blocks
 * the probe we trust the URL and let the audio element report failures.
 */
export async function resolveStream(
  videoId: string,
  onProgress?: (client: string) => void,
): Promise<StreamResult> {
  const failures: string[] = []
  ;(window as any).__obFailures = failures

  const playerBody = {
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
    playbackContext: {
      contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" },
    },
  }

  for (const client of PLAYER_CLIENTS) {
    onProgress?.(client.name)
    // App-client emulation is impossible from a browser (UA mismatch = 403),
    // so non-web clients always go through the metadata proxy. YouTube's
    // bot-gate is intermittent per request: retry gated clients a few times
    // with jitter, letting a fresh visitor identity settle between tries.
    const forceProxy = client.name !== "WEB_REMIX"

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data: PlayerResponse = await innertubePost(
          "player",
          { context: clientContext(client), ...playerBody },
          client,
          forceProxy,
        )
        const status = data.playabilityStatus?.status
        if (status !== "OK") {
          failures.push(
            `${client.name}#${attempt}: ${status ?? "?"} ${data.playabilityStatus?.reason ?? ""}`,
          )
          if (status === "LOGIN_REQUIRED") {
            // Discard the current identity so the next try mints one fresh.
            visitorId = null
            try {
              sessionStorage.removeItem("obVisitor")
            } catch {
              /* ignore */
            }
            await new Promise((r) => setTimeout(r, 400 + attempt * 500 + Math.random() * 300))
            continue
          }
          break
        }

        const stream = pickAudioFormat(data)
        if (!stream) {
          failures.push(`${client.name}#${attempt}: no audio format`)
          break
        }
        const verdict = await probeStream(stream.url, stream.contentLength)
        if (verdict === "ok" || verdict === "unverifiable") {
          stream.client = client.name
          return stream
        }
        failures.push(`${client.name}#${attempt}: probe ${verdict}`)
        break
      } catch (e: any) {
        failures.push(`${client.name}#${attempt}: ${e?.message ?? "error"}`)
        await new Promise((r) => setTimeout(r, 300))
      }
    }
  }

  throw new Error(`No playable stream. ${failures.join(" | ")}`)
}

async function probeStream(
  url: string,
  contentLength: number,
): Promise<"ok" | "truncated" | "unverifiable"> {
  try {
    // End-of-file probe: catches YouTube's 1MB-truncation enforcement.
    if (contentLength > 4096) {
      const head = Math.max(0, contentLength - 1024)
      const res = await fetch(url, {
        headers: { Range: `bytes=${head}-${contentLength - 1}` },
      })
      if (res.status === 403 || res.status === 429) return "truncated"
      await res.body?.cancel().catch(() => {})
    }
    const res = await fetch(url, { headers: { Range: "bytes=0-0" } })
    await res.body?.cancel().catch(() => {})
    if (res.status === 206 || res.status === 200) return "ok"
    if (res.status === 403 || res.status === 429) return "truncated"
    return "unverifiable"
  } catch {
    // CORS on media endpoints may block fetch probes; the audio element
    // itself can still play (media elements bypass CORS).
    return "unverifiable"
  }
}
