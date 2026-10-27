import io

p = 'src/App.tsx'
s = io.open(p, encoding='utf-8').read()

# --- imports ---
s = s.replace('''import { audioEngine } from "./lib/audioEngine"
import { searchSuggestions, searchTracks, type Track } from "./lib/innertube"
import { usePlayer } from "./store"''',
'''import { audioEngine } from "./lib/audioEngine"
import { searchSuggestions, searchTracks, type SearchFilter, type Track } from "./lib/innertube"
import { usePlayer } from "./store"''')

# --- SearchTop takes filter ---
s = s.replace('''function SearchTop({
  onResults,
}: {
  onResults: (tracks: Track[] | null, query: string) => void
}) {''',
'''function SearchTop({
  onResults,
  filter,
}: {
  onResults: (tracks: Track[] | null, query: string) => void
  filter: SearchFilter
}) {''')
s = s.replace('        onResults(await searchTracks(query), query)',
              '        onResults(await searchTracks(query, filter), query)')
s = s.replace('''      } finally {
        setBusy(false)
      }
    },
    [busy, onResults],
  )''',
'''      } finally {
        setBusy(false)
      }
    },
    [busy, onResults, filter],
  )''')

# --- App state + destructure ---
s = s.replace('''  const {
    current, playing, togglePlay, next, prev, currentTime, duration, seek,
    resolving, error, recents, liked, queue, index, jumpTo, removeFromQueue,
    playTracks, playNow, setVolume, volume, lyrics, lyricsLoading,
    toggleLike, isLiked, dismissError,
  } = usePlayer()''',
'''  const {
    current, playing, togglePlay, next, prev, currentTime, duration, seek,
    resolving, error, recents, liked, queue, index, jumpTo, removeFromQueue,
    playTracks, playNow, setVolume, volume, lyrics, lyricsLoading,
    toggleLike, isLiked, dismissError,
    history, playlists, sleep, speed,
    createPlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist,
    clearHistory, setSleepTimer, setSpeed,
  } = usePlayer()''')

s = s.replace('''  const [results, setResults] = useState<Track[] | null>(null)
  const [resultQuery, setResultQuery] = useState<string>("")
  const [lyricsOpen, setLyricsOpen] = useState(false)''',
'''  const [results, setResults] = useState<Track[] | null>(null)
  const [resultQuery, setResultQuery] = useState("")
  const [searchFilter, setSearchFilter] = useState<SearchFilter>("songs")
  const [lyricsOpen, setLyricsOpen] = useState(false)''')
s = s.replace('''  const [results, setResults] = useState<Track[] | null>(null)
  const [resultQuery, setResultQuery] = useState("")
  const [lyricsOpen, setLyricsOpen] = useState(false)''',
'''  const [results, setResults] = useState<Track[] | null>(null)
  const [resultQuery, setResultQuery] = useState("")
  const [searchFilter, setSearchFilter] = useState<SearchFilter>("songs")
  const [lyricsOpen, setLyricsOpen] = useState(false)''')

s = s.replace('        <SearchTop onResults={onResults} />',
              '        <SearchTop onResults={onResults} filter={searchFilter} />')

# --- sleep + speed cycle helpers ---
s = s.replace('''  const progress = duration > 0 ? currentTime / duration : 0''',
'''  const progress = duration > 0 ? currentTime / duration : 0

  const cycleSleep = () => {
    if (sleep.kind === "off") setSleepTimer({ kind: "time", at: Date.now() + 15 * 60 * 1000 })
    else if (sleep.kind === "time") {
      const minsLeft = Math.max(1, Math.round(((sleep.at - Date.now()) / 60000)))
      if (minsLeft >= 60) setSleepTimer({ kind: "end" })
      else setSleepTimer({ kind: "time", at: Date.now() + (minsLeft + 15) * 60 * 1000 })
    } else setSleepTimer({ kind: "off" })
  }

  const sleepLabel =
    sleep.kind === "time"
      ? fmt((sleep.at - Date.now()) / 1000)
      : sleep.kind === "end"
        ? "track"
        : ""

  const cycleSpeed = () => {
    const steps = [1, 1.25, 1.5, 2, 0.75]
    setSpeed(steps[(steps.indexOf(speed) + 1) % steps.length])
  }''')

# --- search tabs above results ---
s = s.replace('''          {results && (
            <section className="glass pad">
              <h2>{results.length ? `Results · ${resultQuery}` : `Results · ${resultQuery}`}</h2>''',
'''          {results && (
            <section className="glass pad">
              <div className="section-head">
                <h2>Results · {resultQuery}</h2>
                <div className="tabs">
                  {(["songs", "videos"] as SearchFilter[]).map((f) => (
                    <button
                      key={f}
                      className={`tab${searchFilter === f ? " on" : ""}`}
                      onClick={() => {
                        setSearchFilter(f)
                        void searchTracks(resultQuery, f).then((r) => setResults(r)).catch(() => setResults([]))
                      }}
                    >
                      {f === "songs" ? "Songs" : "Videos"}
                    </button>
                  ))}
                </div>
              </div>''')

# --- history + playlists sections after .sh ---
s = s.replace('''              ) : (
                <div className="empty">Your queue is empty. Play something and it shows up here.</div>
              )}
            </section>
          </div>
        </main>''',
'''              ) : (
                <div className="empty">Your queue is empty. Play something and it shows up here.</div>
              )}
            </section>
          </div>

          {playlists.length > 0 && (
            <section className="glass pad">
              <h2>Your playlists</h2>
              <div className="pl-list">
                {playlists.map((pl) => (
                  <PlaylistRow
                    key={pl.id}
                    pl={pl}
                    onPlay={() => pl.tracks.length && playTracks(pl.tracks, 0)}
                    onDelete={() => deletePlaylist(pl.id)}
                    onRemoveTrack={(videoId) => removeFromPlaylist(pl.id, videoId)}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="glass pad">
            <div className="section-head">
              <h2>History</h2>
              {history.length > 0 && (
                <button className="qx-wide" onClick={clearHistory}>
                  Clear
                </button>
              )}
            </div>
            {history.length ? (
              history.slice(0, 12).map((entry, i) => (
                <div
                  key={entry.track.videoId + entry.playedAt + i}
                  className="q"
                  onClick={() => playNow(entry.track)}
                >
                  <div className="cardart" style={artStyle(entry.track)}>
                    <div className="cardplay">
                      <svg viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" fill="currentColor" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <b>{entry.track.title}</b>
                    <small>
                      {entry.track.artist} · {new Date(entry.playedAt).toLocaleDateString()}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty">Songs you play are logged here — on this device only.</div>
            )}
          </section>
        </main>''')

# --- player bar: sleep + speed buttons in .right ---
s = s.replace('''          <div className="right">
            <button''',
'''          <div className="right">
            <button
              className={`ic${sleep.kind !== "off" ? " liked" : ""}`}
              onClick={cycleSleep}
              aria-label="Sleep timer"
              title={sleep.kind === "off" ? "Sleep timer" : `Sleep: ${sleepLabel}`}
            >
              <svg viewBox="0 0 24 24">
                <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />
              </svg>
            </button>
            <button className="ic speed" onClick={cycleSpeed} aria-label="Playback speed" title="Playback speed">
              {speed}×
            </button>
            <button''')

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('app extended OK')
