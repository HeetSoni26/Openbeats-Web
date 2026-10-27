/*
 * Openbeats Web — player store. React context over a single audio engine
 * instance; queue + resolution state live here.
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
import { extractPalette, type Palette } from "./lib/colors"
import { resolveStream, type Track } from "./lib/innertube"

interface PlayerState {
  queue: Track[]
  index: number
  current: Track | null
  playing: boolean
  currentTime: number
  duration: number
  resolving: string | null // client name being tried, or "searching"
  error: string | null
  expanded: boolean
  palette: Palette
  analyserReady: boolean
}

interface PlayerActions {
  playTracks: (tracks: Track[], startIndex: number) => void
  playTrackNext: (track: Track) => void
  addToQueue: (track: Track) => void
  removeFromQueue: (index: number) => void
  jumpTo: (index: number) => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  seek: (t: number) => void
  setExpanded: (v: boolean) => void
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
  const [expanded, setExpanded] = useState(false)
  const [palette, setPalette] = useState<Palette>({ primary: "#7c5cff", soft: "#181528" })
  const [analyserReady, setAnalyserReady] = useState(false)

  const current = index >= 0 && index < queue.length ? queue[index] : null
  const loadToken = useRef(0)

  // Mirror engine state into React.
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

  // Load + play a queue index: resolve stream through the client chain.
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

      extractPalette(track.thumbnail).then((p) => {
        setPalette(p)
        const root = document.documentElement
        root.style.setProperty("--accent", p.primary)
        root.style.setProperty("--accent-soft", p.soft)
      })

      try {
        const stream = await resolveStream(track.videoId, (client) => {
          if (token === loadToken.current) setResolving(client)
        })
        if (token !== loadToken.current) return
        audioEngine.load(stream.url)
        await audioEngine.play()
        const analyser = await audioEngine.connectAnalyser()
        setAnalyserReady(!!analyser)
        setResolving(null)
      } catch (e: any) {
        if (token !== loadToken.current) return
        setResolving(null)
        setPlaying(false)
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

  const jumpTo = useCallback(
    (i: number) => {
      void loadIndex(queue, i)
    },
    [queue, loadIndex],
  )

  const playTrackNext = useCallback(
    (track: Track) => {
      setQueue((q) => {
        const insertAt = index + 1
        const next = [...q]
        next.splice(insertAt, 0, track)
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

  // Auto-advance on track end.
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
      queue,
      index,
      current,
      playing,
      currentTime,
      duration,
      resolving,
      error,
      expanded,
      palette,
      analyserReady,
      playTracks,
      playTrackNext,
      addToQueue,
      removeFromQueue,
      jumpTo,
      togglePlay,
      next,
      prev,
      seek,
      setExpanded,
    }),
    [
      queue, index, current, playing, currentTime, duration, resolving, error,
      expanded, palette, analyserReady, playTracks, playTrackNext, addToQueue,
      removeFromQueue, jumpTo, togglePlay, next, prev, seek,
    ],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error("usePlayer outside PlayerProvider")
  return ctx
}
