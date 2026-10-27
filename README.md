# Openbeats Web

Listen to any song right in your browser — free, no account, no install.
The web companion to the [Openbeats Android app](https://github.com/HeetSoni26/Openbeats).

- **Search** YouTube Music's catalog with instant suggestions
- **Play** full songs directly from YouTube's CDN — nothing is proxied or re-hosted
- **Queue** — play next, add to queue, jump around, remove
- **Immersive player** — live visualizer halo, dynamic color theme pulled from the album art, aurora background
- **PWA** — installable on iPhone/Android home screens, works offline for the app shell

## How it works (and why it's free)

Everything runs in the visitor's browser:

1. Search and playback metadata come from YouTube's innertube API, requested client-side with
   app-client emulation (ANDROID_VR → IOS → WEB_REMIX fallback chain, visitor-identity reuse,
   bot-gate retries) — the same techniques as the Android app.
2. A tiny serverless function (`api/youtubei.js`) only forwards **JSON metadata** when a browser
   blocks the direct call (CORS). It never touches audio.
3. Audio streams are resolved per visitor and played straight from `googlevideo.com` through a
   plain `<audio>` element — **no media ever flows through this site**, which keeps hosting at
   $0 on Vercel's hobby tier.

## Deploy to Vercel (free)

1. Push this repo to GitHub (or use the existing `Openbeats-Web` repo).
2. Go to [vercel.com/new](https://vercel.com/new), import the repo — Vercel auto-detects Vite.
3. Deploy. Done: `https://<your-project>.vercel.app`.

No environment variables needed. The `api/` folder is automatically deployed as a serverless
function.

## Run locally

```bash
npm install
npm run dev
```

The dev server includes a middleware that mirrors the Vercel function, so search and playback
work identically.

## Status

Phase 1 — search, play, queue, immersive UI, PWA. Planned: synced lyrics, playlists, listening
history, local library.

## License

GPL-3.0 — same as the Openbeats Android app.
