import io

p = 'src/store.tsx'
s = io.open(p, encoding='utf-8').read()

# --- new types + storage keys ---
s = s.replace('''const RECENTS_KEY = "ob-recents"
const LIKED_KEY = "ob-liked"
const VOLUME_KEY = "ob-volume"
const QUEUE_KEY = "ob-queue"''', '''const RECENTS_KEY = "ob-recents"
const LIKED_KEY = "ob-liked"
const VOLUME_KEY = "ob-volume"
const QUEUE_KEY = "ob-queue"
const HISTORY_KEY = "ob-history"
const PLAYLISTS_KEY = "ob-playlists"
const SPEED_KEY = "ob-speed"

export interface HistoryEntry {
  track: Track
  playedAt: number
}

export interface Playlist {
  id: string
  name: string
  tracks: Track[]
  createdAt: number
}

export type SleepMode = { kind: "off" } | { kind: "time"; at: number } | { kind: "end" }''')

s = s.replace('''interface PlayerState {''', '''function loadHistory(): HistoryEntry[] {
  return loadJSON<HistoryEntry[]>(HISTORY_KEY, [])
}

function loadPlaylists(): Playlist[] {
  return loadJSON<Playlist[]>(PLAYLISTS_KEY, [])
}

interface PlayerState {''', 1)

# --- state fields ---
s = s.replace('''  const [loaded, setLoaded] = useState(false)''', '''  const [loaded, setLoaded] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [playlists, setPlaylists] = useState<Playlist[]>(loadPlaylists)
  const [sleep, setSleep] = useState<SleepMode>({ kind: "off" })
  const [speed, setSpeedState] = useState(() => {
    const v = Number(localStorage.getItem(SPEED_KEY) ?? "1")
    return [0.75, 1, 1.25, 1.5, 2].includes(v) ? v : 1
  })''', 1)

# --- record history in loadIndex ---
s = s.replace('''      setRecents((prev) => {
        const next = [track, ...prev.filter((t) => t.videoId !== track.videoId)].slice(0, 14)
        saveJSON(RECENTS_KEY, next)
        return next
      })''', '''      setRecents((prev) => {
        const next = [track, ...prev.filter((t) => t.videoId !== track.videoId)].slice(0, 14)
        saveJSON(RECENTS_KEY, next)
        return next
      })

      setHistory((prev) => {
        const next = [{ track, playedAt: Date.now() }, ...prev].slice(0, 120)
        saveJSON(HISTORY_KEY, next)
        return next
      })''', 1)

# --- speed applied to element ---
s = s.replace('''  // restore volume on the element
  useEffect(() => {
    audioEngine.el.volume = volume
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])''', '''  // restore volume + speed on the element
  useEffect(() => {
    audioEngine.el.volume = volume
    audioEngine.el.playbackRate = speed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setSpeed = useCallback((v: number) => {
    setSpeedState(v)
    audioEngine.el.playbackRate = v
    localStorage.setItem(SPEED_KEY, String(v))
  }, [])''', 1)

# --- sleep timer tick ---
s = s.replace('''  // auto-dismiss errors''', '''  // sleep timer tick
  useEffect(() => {
    if (sleep.kind !== "time") return
    const t = setInterval(() => {
      if (Date.now() >= (sleep as { kind: "time"; at: number }).at) {
        audioEngine.pause()
        setSleep({ kind: "off" })
      }
    }, 1000)
    return () => clearInterval(t)
  }, [sleep])

  // auto-dismiss errors''', 1)

# --- end-of-track honors sleep ---
s = s.replace('''    const onEnded = () => {
      if (index + 1 < queue.length) void loadIndex(queue, index + 1)
    }''', '''    const onEnded = () => {
      if (sleepRef.current.kind === "end") {
        audioEngine.pause()
        setSleep({ kind: "off" })
        return
      }
      if (index + 1 < queue.length) void loadIndex(queue, index + 1)
    }''', 1)

s = s.replace('''  const current = index >= 0 && index < queue.length ? queue[index] : null
  const loadToken = useRef(0)
  const preloaded = useRef<string | null>(null)''', '''  const current = index >= 0 && index < queue.length ? queue[index] : null
  const loadToken = useRef(0)
  const preloaded = useRef<string | null>(null)
  const sleepRef = useRef<SleepMode>({ kind: "off" })
  sleepRef.current = sleep''', 1)

# --- actions ---
s = s.replace('''  const dismissError = useCallback(() => setError(null), [])''', '''  const dismissError = useCallback(() => setError(null), [])

  const createPlaylist = useCallback((name: string) => {
    const pl: Playlist = {
      id: `pl_${Date.now().toString(36)}`,
      name: name.trim() || "New playlist",
      tracks: [],
      createdAt: Date.now(),
    }
    setPlaylists((prev) => {
      const next = [pl, ...prev]
      saveJSON(PLAYLISTS_KEY, next)
      return next
    })
    return pl.id
  }, [])

  const deletePlaylist = useCallback((id: string) => {
    setPlaylists((prev) => {
      const next = prev.filter((p) => p.id !== id)
      saveJSON(PLAYLISTS_KEY, next)
      return next
    })
  }, [])

  const renamePlaylist = useCallback((id: string, name: string) => {
    setPlaylists((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, name } : p))
      saveJSON(PLAYLISTS_KEY, next)
      return next
    })
  }, [])

  const addToPlaylist = useCallback((playlistId: string, track: Track) => {
    setPlaylists((prev) => {
      const next = prev.map((p) =>
        p.id === playlistId && !p.tracks.some((t) => t.videoId === track.videoId)
          ? { ...p, tracks: [...p.tracks, track] }
          : p,
      )
      saveJSON(PLAYLISTS_KEY, next)
      return next
    })
  }, [])

  const removeFromPlaylist = useCallback((playlistId: string, videoId: string) => {
    setPlaylists((prev) => {
      const next = prev.map((p) =>
        p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.videoId !== videoId) } : p,
      )
      saveJSON(PLAYLISTS_KEY, next)
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    saveJSON(HISTORY_KEY, [])
  }, [])

  const setSleepTimer = useCallback((mode: SleepMode) => setSleep(mode), [])''', 1)

# --- context types ---
s = s.replace('''  volume: number
  loaded: boolean // true once the current queue entry has a live stream
}''', '''  volume: number
  loaded: boolean // true once the current queue entry has a live stream
  history: HistoryEntry[]
  playlists: Playlist[]
  sleep: SleepMode
  speed: number
}''', 1)

s = s.replace('''  toggleLike: (track: Track) => void
  isLiked: (videoId: string) => boolean
  dismissError: () => void
}''', '''  toggleLike: (track: Track) => void
  isLiked: (videoId: string) => boolean
  dismissError: () => void
  createPlaylist: (name: string) => string
  deletePlaylist: (id: string) => void
  renamePlaylist: (id: string, name: string) => void
  addToPlaylist: (playlistId: string, track: Track) => void
  removeFromPlaylist: (playlistId: string, videoId: string) => void
  clearHistory: () => void
  setSleepTimer: (mode: SleepMode) => void
  setSpeed: (v: number) => void
}''', 1)

s = s.replace('''      queue, index, current, playing, currentTime, duration, resolving, error,
      recents, liked, lyrics, lyricsLoading, volume, loaded,
      playTracks, playTrackNext, addToQueue, removeFromQueue, jumpTo, playNow,
      togglePlay, next, prev, seek, setVolume, toggleLike, isLiked, dismissError,
    }),
    [
      queue, index, current, playing, currentTime, duration, resolving, error,
      recents, liked, lyrics, lyricsLoading, volume, loaded, playTracks,
      playTrackNext, addToQueue, removeFromQueue, jumpTo, playNow, togglePlay,
      next, prev, seek, setVolume, toggleLike, isLiked, dismissError,
    ],''', '''      queue, index, current, playing, currentTime, duration, resolving, error,
      recents, liked, lyrics, lyricsLoading, volume, loaded, history, playlists,
      sleep, speed,
      playTracks, playTrackNext, addToQueue, removeFromQueue, jumpTo, playNow,
      togglePlay, next, prev, seek, setVolume, toggleLike, isLiked, dismissError,
      createPlaylist, deletePlaylist, renamePlaylist, addToPlaylist,
      removeFromPlaylist, clearHistory, setSleepTimer, setSpeed,
    }),
    [
      queue, index, current, playing, currentTime, duration, resolving, error,
      recents, liked, lyrics, lyricsLoading, volume, loaded, history, playlists,
      sleep, speed, playTracks, playTrackNext, addToQueue, removeFromQueue,
      jumpTo, playNow, togglePlay, next, prev, seek, setVolume, toggleLike,
      isLiked, dismissError, createPlaylist, deletePlaylist, renamePlaylist,
      addToPlaylist, removeFromPlaylist, clearHistory, setSleepTimer, setSpeed,
    ],''', 1)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('store extended OK')
