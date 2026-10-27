/*
 * Openbeats Web — player store. React context over a single audio engine
 * instance; queue, recents, lyrics and resolution state live here.
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
import { resolveStream, type Track } from "./lib/innertube"

const RECENTS_KEY = "ob-recents"

function loadRecents(): Track[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    return raw ? (JSON.parse(raw) as Track[]) : []
  } catch {
    return []
  }
}

function saveRecents(tracks: Track[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(tracks.slice(0, 14)))
  } catch {
    /* private mode */
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
  lyrics: Lyrics | null
  lyricsLoading: boolean
  volume: number
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
}

const PlayerContext = createContext<(PlayerState & PlayerActions) | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Track[]>([])
  const [index, setIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [resolving, setResolving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recents, setRecents] = useState<Track[]>(loadRecents)
  const [lyrics, setLyrics] = useState<Lyrics | null>(null)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [volume, setVolumeState] = useState(0.7)

  const current = index >= 0 && index < queue.length ? queue[index] : null
  const loadToken = useRef(0)

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

      setRecents((prev) => {
        const next = [track, ...prev.filter((t) => t.videoId !== track.videoId)].slice(0, 14)
        saveRecents(next)
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
        const stream = await resolveStream(track.videoId, (client) => {
          if (token === loadToken.current) setResolving(client)
        })
        if (token !== loadToken.current) return
        audioEngine.load(stream.url)
        await audioEngine.play()
        await audioEngine.connectAnalyser()
        setResolving(null)
        const l = await lyricsPromise
        if (token === loadToken.current) setLyrics(l)
      } catch (e: any) {
        if (token !== loadToken.current) return
        setResolving(null)
        setPlaying(false)
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
      // Put the track at the head of the queue and play it.
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
    if (audioEngine.state.playing) {
      audioEngine.pause()
    } else {
      void audioEngine.play()
    }
  }, [current])

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
  }, [])

  useEffect(() => {
    const el = audioEngine.el
    const onEnded = () => {
      if (index + 1 < queue.length) void loadIndex(queue, index + 1)
    }
    el.addEventListener("ended", onEnded)
    return () => el.removeEventListener("ended", onEnded)
  }, [index, queue, loadIndex])

  const value = useMemo(
    () => ({
      queue, index, current, playing, currentTime, duration, resolving, error,
      recents, lyrics, lyricsLoading, volume,
      playTracks, playTrackNext, addToQueue, removeFromQueue, jumpTo, playNow,
      togglePlay, next, prev, seek, setVolume,
    }),
    [
      queue, index, current, playing, currentTime, duration, resolving, error,
      recents, lyrics, lyricsLoading, volume, playTracks, playTrackNext,
      addToQueue, removeFromQueue, jumpTo, playNow, togglePlay, next, prev,
      seek, setVolume,
    ],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error("usePlayer outside PlayerProvider")
  return ctx
}
