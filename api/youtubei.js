/*
 * Vercel serverless function: metadata-only innertube proxy.
 *
 * Used only as a fallback when a visitor's browser blocks direct calls to
 * youtubei (CORS). JSON payloads are a few KB; **audio streams are never
 * proxied through this function** — playback always goes browser → YouTube
 * CDN directly.
 */

const ENDPOINTS = {
  search: "https://www.youtube.com/youtubei/v1/search",
  player: "https://www.youtube.com/youtubei/v1/player",
}

const CLIENT_IDS = { WEB_REMIX: "67", ANDROID_VR: "28", IOS: "5", VISIONOS: "96" }

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" })
    return
  }

  const { endpoint, body, client, visitorId } = req.body ?? {}

  if (endpoint === "suggest") {
    const upstream = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(body?.q ?? "")}`,
    )
    res.setHeader("Cache-Control", "public, max-age=300")
    res.status(200).json(await upstream.json())
    return
  }

  const url = ENDPOINTS[endpoint]
  if (!url || !body) {
    res.status(400).json({ error: "bad request" })
    return
  }

  const headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Format-Version": "1",
    "X-YouTube-Client-Name": String(CLIENT_IDS[client?.name] ?? 67),
    "X-YouTube-Client-Version": client?.version ?? "1.20250609.03.00",
    "User-Agent": client?.userAgent ?? BROWSER_UA,
    "Accept-Language": "en-US,en;q=0.9",
    ...(visitorId ? { "X-Goog-Visitor-Id": visitorId } : {}),
    Origin: "https://music.youtube.com",
  }

  try {
    const upstream = await fetch(`${url}?prettyPrint=false`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
    const data = await upstream.json()
    res.setHeader("Cache-Control", "public, max-age=60")
    res.status(upstream.status).json(data)
  } catch (e) {
    res.status(502).json({ error: "upstream failed" })
  }
}
