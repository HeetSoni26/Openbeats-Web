/*
 * Openbeats Web — player store. React context over a single audio engine
 * instance: queue (survives refresh), recents, liked songs, lyrics,
 * media-session integration and next-track preloading.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { audioEngine } from "./lib/audioEngine"
import { fetchLyrics, type Lyrics } from "./lib/lyrics"
import { invalidateStream, prefetchStream, resolveStreamCached, type Track } from "./lib/innertube"

const RECENTS_KEY = "ob-recents"
const LIKED_KEY = "ob-liked"
const VOLUME_KEY = "ob-volume"
const QUEUE_KEY = "ob-queue"

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode */
  }
}

function loadRecents(): Track[] {
  return loadJSON<Track[]>(RECENTS_KEY, [])
}

function loadQueue(): { queue: Track[]; index: number } {
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY)
    if (!raw) return { queue: [], index: -1 }
    const parsed = JSON.parse(raw) as { queue: Track[]; index: number }
    if (!Array.isArray(parsed.queue) || !parsed.queue.length) return { queue: [], index: -1 }
    return { queue: parsed.queue, index: Math.min(parsed.index, parsed.queue.length - 1) }
  } catch {
    return { queue: [], index: -1 }
  }
}

interface PlayerState {
  queue: Track[]
  index: number
  current: Track | null
  playing: boolean
  currentTime: number
  duration: number
  resolving: string | null
  error: string | null
  recents: Track[]
  liked: Track[]
  lyrics: Lyrics | null
  lyricsLoading: boolean
  volume: number
  loaded: boolean // true once the current queue entry has a live stream
}

interface PlayerActions {
  playTracks: (tracks: Track[], startIndex: number) => void
  playTrackNext: (track: Track) => void
  addToQueue: (track: Track) => void
  removeFromQueue: (index: number) => void
  jumpTo: (index: number) => void
  playNow: (track: Track) => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  seek: (t: number) => void
  setVolume: (v: number) => void
  toggleLike: (track: Track) => void
  isLiked: (videoId: string) => boolean
  dismissError: () => void
}

const PlayerContext = createContext<(PlayerState & PlayerActions) | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const restored = useRef(loadQueue())
  const [queue, setQueue] = useState<Track[]>(restored.current.queue)
  const [index, setIndex] = useState(restored.current.index)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [resolving, setResolving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recents, setRecents] = useState<Track[]>(loadRecents)
  const [liked, setLiked] = useState<Track[]>(() => loadJSON<Track[]>(LIKED_KEY, []))
  const [lyrics, setLyrics] = useState<Lyrics | null>(null)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [volume, setVolumeState] = useState(() => {
    const v = Number(localStorage.getItem(VOLUME_KEY) ?? "0.7")
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.7
  })
  const [loaded, setLoaded] = useState(false)

  const current = index >= 0 && index < queue.length ? queue[index] : null
  const loadToken = useRef(0)
  const preloaded = useRef<string | null>(null)

  // restore volume on the element
  useEffect(() => {
    audioEngine.el.volume = volume
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(
    () => {
      const unsub = audioEngine.subscribe(() => {
        const s = audioEngine.state
        setPlaying(s.playing)
        setCurrentTime(s.currentTime)
        setDuration(s.duration)
      })
      return () => {
        unsub()
      }
    },
    [],
  )

  // persist queue so a refresh doesn't lose it
  useEffect(() => {
    try {
      sessionStorage.setItem(QUEUE_KEY, JSON.stringify({ queue, index }))
    } catch {
      /* ignore */
    }
  }, [queue, index])

  const loadIndex = useCallback(
    async (q: Track[], i: number) => {
      const track = q[i]
      if (!track) return
      const token = ++loadToken.current
      setError(null)
      setResolving("searching")
      setIndex(i)
      setCurrentTime(0)
      setDuration(0)
      setLyrics(null)
      preloaded.current = null

      setRecents((prev) => {
        const next = [track, ...prev.filter((t) => t.videoId !== track.videoId)].slice(0, 14)
        saveJSON(RECENTS_KEY, next)
        return next
      })

      // lyrics load in parallel with stream resolution
      setLyricsLoading(true)
      const lyricsPromise = fetchLyrics(
        track.title.replace(/\s*\((official|lyrics|audio|video|hd|4k)[^)]*\)/gi, ""),
        track.artist,
        0,
      ).finally(() => {
        if (token === loadToken.current) setLyricsLoading(false)
      })

      try {
        const stream = await resolveStreamCached(track.videoId, (client) => {
          if (token === loadToken.current) setResolving(client)
        })
        if (token !== loadToken.current) return
        audioEngine.load(stream.url)
        await audioEngine.play()
        await audioEngine.connectAnalyser()
        setLoaded(true)
        setResolving(null)
        const l = await lyricsPromise
        if (token === loadToken.current) setLyrics(l)
      } catch (e: any) {
        if (token !== loadToken.current) return
        setResolving(null)
        setPlaying(false)
        setLoaded(false)
        void lyricsPromise
        setError(e?.message ?? "Could not play this track")
      }
    },
    [],
  )

  const playTracks = useCallback(
    (tracks: Track[], startIndex: number) => {
      setQueue(tracks)
      void loadIndex(tracks, startIndex)
    },
    [loadIndex],
  )

  const playNow = useCallback(
    (track: Track) => {
      setQueue((q) => {
        const next = [track, ...q.filter((t) => t.videoId !== track.videoId)]
        void loadIndex(next, 0)
        return next
      })
    },
    [loadIndex],
  )

  const jumpTo = useCallback(
    (i: number) => {
      void loadIndex(queue, i)
    },
    [queue, loadIndex],
  )

  const playTrackNext = useCallback(
    (track: Track) => {
      setQueue((q) => {
        const next = [...q]
        next.splice(index + 1, 0, track)
        return next
      })
    },
    [index],
  )

  const addToQueue = useCallback((track: Track) => {
    setQueue((q) => [...q, track])
  }, [])

  const removeFromQueue = useCallback(
    (i: number) => {
      setQueue((q) => q.filter((_, j) => j !== i))
      if (i < index) setIndex((v) => v - 1)
    },
    [index],
  )

  const togglePlay = useCallback(() => {
    if (current == null) return
    if (!audioEngine.el.src || !loaded) {
      // restored after refresh: re-resolve a fresh stream for this track
      void loadIndex(queue, index)
      return
    }
    if (audioEngine.state.playing) {
      audioEngine.pause()
    } else {
      void audioEngine.play()
    }
  }, [current, loaded, queue, index, loadIndex])

  const next = useCallback(() => {
    if (index + 1 < queue.length) void loadIndex(queue, index + 1)
  }, [index, queue, loadIndex])

  const prev = useCallback(() => {
    if (audioEngine.state.currentTime > 4) {
      audioEngine.seek(0)
    } else if (index - 1 >= 0) {
      void loadIndex(queue, index - 1)
    } else {
      audioEngine.seek(0)
    }
  }, [index, queue, loadIndex])

  const seek = useCallback((t: number) => audioEngine.seek(t), [])

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    audioEngine.el.volume = v
    localStorage.setItem(VOLUME_KEY, String(v))
  }, [])

  const toggleLike = useCallback((track: Track) => {
    setLiked((prev) => {
      const isL = prev.some((t) => t.videoId === track.videoId)
      const next = isL
        ? prev.filter((t) => t.videoId !== track.videoId)
        : [track, ...prev]
      saveJSON(LIKED_KEY, next)
      return next
    })
  }, [])

  const likedIds = useMemo(() => new Set(liked.map((t) => t.videoId)), [liked])
  const isLiked = useCallback((videoId: string) => likedIds.has(videoId), [likedIds])

  const dismissError = useCallback(() => setError(null), [])

  // auto-dismiss errors
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 8000)
    return () => clearTimeout(t)
  }, [error])

  // auto-advance + preload the next track halfway through this one
  useEffect(() => {
    const el = audioEngine.el
    const onEnded = () => {
      if (index + 1 < queue.length) void loadIndex(queue, index + 1)
    }
    const onProgress = () => {
      const nxt = queue[index + 1]
      if (
        nxt &&
        el.duration > 0 &&
        el.currentTime / el.duration > 0.5 &&
        preloaded.current !== nxt.videoId
      ) {
        preloaded.current = nxt.videoId
        prefetchStream(nxt.videoId)
      }
    }
    el.addEventListener("ended", onEnded)
    el.addEventListener("timeupdate", onProgress)
    return () => {
      el.removeEventListener("ended", onEnded)
      el.removeEventListener("timeupdate", onProgress)
    }
  }, [index, queue, loadIndex])

  // dead-stream recovery: a cached/prefetched URL can expire or belong to a
  // gated fallback; invalidate it and re-resolve the same track exactly once.
  const mediaRetried = useRef<string | null>(null)
  useEffect(() => {
    audioEngine.onMediaError = (src) => {
      const track = current
      if (!track || mediaRetried.current === track.videoId) return
      try {
        if (new URL(src).searchParams.get("videoId") !== track.videoId && !src.includes(track.videoId)) {
          // stale src from a previous track; ignore
          return
        }
      } catch {
        /* malformed src */
      }
      mediaRetried.current = track.videoId
      invalidateStream(track.videoId)
      void loadIndex(queue, index)
    }
    return () => {
      audioEngine.onMediaError = null
    }
  }, [current, queue, index, loadIndex])

  // OS media session: lock-screen controls, media keys, artwork
  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: "Openbeats",
        artwork: [
          { src: current.thumbnail, sizes: "544x544", type: "image/jpeg" },
        ],
      })
      navigator.mediaSession.setActionHandler("play", () => void audioEngine.play())
      navigator.mediaSession.setActionHandler("pause", () => audioEngine.pause())
      navigator.mediaSession.setActionHandler("previoustrack", () => prev())
      navigator.mediaSession.setActionHandler("nexttrack", () => next())
      navigator.mediaSession.setActionHandler("seekto", (d) => {
        if (d.seekTime != null) audioEngine.seek(d.seekTime)
      })
    } catch {
      /* not supported */
    }
  }, [current, prev, next])

  useEffect(() => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = playing ? "playing" : "paused"
    }
  }, [playing])

  // live page title
  useEffect(() => {
    document.title = current
      ? `${current.title} · ${current.artist} — Openbeats`
      : "Openbeats — free music, right in your browser"
  }, [current])

  const value = useMemo(
    () => ({
      queue, index, current, playing, currentTime, duration, resolving, error,
      recents, liked, lyrics, lyricsLoading, volume, loaded,
      playTracks, playTrackNext, addToQueue, removeFromQueue, jumpTo, playNow,
      togglePlay, next, prev, seek, setVolume, toggleLike, isLiked, dismissError,
    }),
    [
      queue, index, current, playing, currentTime, duration, resolving, error,
      recents, liked, lyrics, lyricsLoading, volume, loaded, playTracks,
      playTrackNext, addToQueue, removeFromQueue, jumpTo, playNow, togglePlay,
      next, prev, seek, setVolume, toggleLike, isLiked, dismissError,
    ],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error("usePlayer outside PlayerProvider")
  return ctx
}
