import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Dev-only mirror of api/youtubei.js so `npm run dev` behaves like the
 * Vercel deployment. JSON metadata only: media streams are never proxied.
 */
function innertubeDevProxy(): Plugin {
  return {
    name: 'innertube-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/youtubei', (req, res) => {
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        req.on('end', async () => {
          try {
            const { endpoint, body, client, visitorId } = JSON.parse(raw || '{}')
            const urls: Record<string, string> = {
              search: 'https://www.youtube.com/youtubei/v1/search',
              player: 'https://www.youtube.com/youtubei/v1/player',
            }
            const ids: Record<string, string> = {
              WEB_REMIX: '67',
              ANDROID_VR: '28',
              IOS: '5',
              VISIONOS: '96',
            }
            if (endpoint === 'suggest') {
              const upstream = await fetch(
                `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(body.q ?? '')}`,
              )
              res.setHeader('Cache-Control', 'public, max-age=300')
              res.end(JSON.stringify(await upstream.json()))
              return
            }
            const upstreamUrl = urls[endpoint]
            if (!upstreamUrl || !body) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'bad request' }))
              return
            }
            const upstream = await fetch(`${upstreamUrl}?prettyPrint=false`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Format-Version': '1',
                'X-YouTube-Client-Name': String(ids[client?.name] ?? 67),
                'X-YouTube-Client-Version': client?.version ?? '1.20250609.03.00',
                'User-Agent':
                  client?.userAgent ??
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                ...(visitorId ? { 'X-Goog-Visitor-Id': visitorId } : {}),
                Origin: 'https://music.youtube.com',
              },
              body: JSON.stringify(body),
            })
            res.statusCode = upstream.status
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'public, max-age=60')
            res.end(JSON.stringify(await upstream.json()))
          } catch (e: any) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: e?.message ?? 'upstream failed' }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), innertubeDevProxy()],
})
