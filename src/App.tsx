import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { audioEngine } from "./lib/audioEngine"
import { searchSuggestions, searchTracks, type Track } from "./lib/innertube"
import { usePlayer } from "./store"

/* ---------------------------------- utils ---------------------------------- */

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00"
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
}

function artStyle(track: Track | null | undefined): React.CSSProperties {
  return track?.thumbnail
    ? { backgroundImage: `url(${track.thumbnail})` }
    : { background: "linear-gradient(135deg, #3a3a44, #101014)" }
}

/* ------------------------------ beat + visuals ----------------------------- */

/**
 * Owns the canvas visualizer and the global --beat CSS variable that makes
 * the whole page pulse. Uses the live analyser when cross-origin analysis
 * is allowed; otherwise a synthetic 2 Hz pulse while playing.
 */
function useBeatEngine(playing: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const x = canvas.getContext("2d")
    if (!x) return

    let raf = 0
    let last = performance.now()
    let beat = 0
    let shown = -1
    let prevBass = 0
    let rings: Array<{ p: number; s: number }> = []
    const N = 96
    const fd = new Uint8Array(128)

    const tick = (ts: number) => {
      const dt = Math.min((ts - last) / 1000, 0.1)
      last = ts

      // ---- beat source ----
      const analyser = audioEngine.state.analyser
      let live = false
      if (analyser && playing) {
        analyser.getByteFrequencyData(fd)
        live = true
        let bass = 0
        for (let i = 1; i < 9; i++) bass += fd[i]
        bass /= 8 * 255
        if (bass > beat) beat = bass
        if (bass > 0.28 && bass > prevBass * 1.35) {
          rings.push({ p: 0, s: Math.min(1, bass + 0.3) })
          if (rings.length > 6) rings.shift()
        }
        prevBass = bass
      } else if (playing) {
        // synthetic 2 Hz pulse
        const w = Math.pow(Math.abs(Math.sin((ts / 1000) * Math.PI * 2 * (120 / 60 / 2))), 12)
        beat = Math.max(beat, w)
        if (w > 0.7 && beat - w < 0.01) {
          rings.push({ p: 0, s: 0.7 })
          if (rings.length > 6) rings.shift()
        }
      }
      beat *= Math.exp(-dt * 7.5)
      if (beat < 0.004) beat = 0
      if (Math.abs(beat - shown) > 0.004) {
        shown = beat
        document.documentElement.style.setProperty("--beat", beat.toFixed(3))
      }

      // ---- radial bars ----
      const w = canvas.width
      const h = canvas.height
      const cx = w / 2
      const cy = h / 2
      const rgb =
        document.documentElement.dataset.theme === "light" ? "0,0,0" : "255,255,255"
      x.clearRect(0, 0, w, h)
      x.save()
      x.translate(cx, cy)
      for (let n = 0; n < N; n++) {
        const m = n < N / 2 ? n : N - n
        const b = live ? fd[1 + Math.floor(Math.pow(m / (N / 2), 1.5) * 70)] / 255 : 0
        const idle = (Math.sin(ts / 900 + n * 0.4) + 1) * 0.04
        const v = Math.max(b, idle)
        const barH = 14 + v * v * 230
        x.save()
        x.rotate((n / N) * Math.PI * 2 + ts / 12000)
        x.fillStyle = `rgba(${rgb},${0.25 + v * 0.75})`
        x.beginPath()
        const r = w * 0.31
        const bw = (w / N) * 0.32
        x.roundRect(-bw / 2, -r - barH, bw, barH, bw / 2)
        x.fill()
        x.restore()
      }
      rings = rings.filter((r) => r.p < 1)
      rings.forEach((r) => {
        r.p += dt * 1.1
        x.beginPath()
        x.arc(0, 0, w * 0.31 + r.p * w * 0.18, 0, 7)
        x.lineWidth = 3 * (1 - r.p) + 0.5
        x.strokeStyle = `rgba(${rgb},${(1 - r.p) * 0.45 * r.s})`
        x.stroke()
      })
      x.restore()

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  return canvasRef
}

/* --------------------------------- pieces ---------------------------------- */

const LOGO_SVG = (
  <svg viewBox="0 0 24 24">
    <path d="M3 10h2v4H3zm4-4h2v12H7zm4-3h2v18h-2zm4 5h2v8h-2zm4 2h2v4h-2z" />
  </svg>
)

function Wordmark() {
  return (
    <div className="logo" aria-label="Openbeats">
      {LOGO_SVG}
    </div>
  )
}

function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement
    const next = root.dataset.theme === "dark" ? "light" : "dark"
    root.dataset.theme = next
    try {
      localStorage.setItem("ob-theme", next)
    } catch {
      /* ignore */
    }
  }
  return (
    <button className="glass tgl" onClick={toggle} aria-label="Switch theme">
      <svg className="moon" viewBox="0 0 24 24">
        <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />
      </svg>
      <svg className="sun" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  )
}

function SearchTop({
  onResults,
}: {
  onResults: (tracks: Track[] | null, query: string) => void
}) {
  const [value, setValue] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  useEffect(() => {
    const q = value.trim()
    if (!q) {
      setSuggestions([])
      return
    }
    const t = setTimeout(async () => setSuggestions(await searchSuggestions(q)), 220)
    return () => clearTimeout(t)
  }, [value])

  const submit = useCallback(
    async (q: string) => {
      const query = q.trim()
      if (!query || busy) return
      setOpen(false)
      setBusy(true)
      try {
        onResults(await searchTracks(query), query)
      } catch {
        onResults(null, query)
      } finally {
        setBusy(false)
      }
    },
    [busy, onResults],
  )

  return (
    <div className="top">
      <div className="searchbox-wrap" ref={boxRef} style={{ flex: 1, position: "relative", display: "flex" }}>
        <label className="glass search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <input
            placeholder="Search songs, artists, albums"
            aria-label="Search"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit(value)
              if (e.key === "Escape") setOpen(false)
            }}
          />
          {busy ? (
            <span className="search-spinner" />
          ) : (
            <button className="go" onClick={() => void submit(value)} aria-label="Search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </svg>
            </button>
          )}
        </label>
        <AnimatePresence>
          {open && suggestions.length > 0 && (
            <motion.div
              className="glass suggest-pop"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
            >
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="suggest-item"
                  onClick={() => {
                    setValue(s)
                    setOpen(false)
                    void submit(s)
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-4-4" />
                  </svg>
                  {s}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ThemeToggle />
      <div className="glass avatar">H</div>
    </div>
  )
}

function TrackCard({
  track,
  onPlay,
  queueNote,
}: {
  track: Track
  onPlay: () => void
  queueNote?: string
}) {
  const { playTrackNext, addToQueue, current } = usePlayer()
  const active = current?.videoId === track.videoId
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="card"
      onClick={onPlay}
    >
      <div className="cardart" style={artStyle(track)}>
        <div className="cardplay">
          <svg viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
        </div>
      </div>
      <b style={active ? { color: "var(--ink)" } : undefined}>{track.title}</b>
      <small>
        {track.artist}
        {queueNote ? ` · ${queueNote}` : ""}
      </small>
      <div className="acts" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => playTrackNext(track)}
          title="Play next"
        >
          Play next
        </button>
        <button onClick={() => addToQueue(track)} title="Add to queue">
          Queue
        </button>
      </div>
    </motion.button>
  )
}

/* ---------------------------------- app ------------------------------------ */

export default function App() {
  const {
    current, playing, togglePlay, next, prev, currentTime, duration, seek,
    resolving, error, recents, queue, index, jumpTo, removeFromQueue,
    playTracks, playNow, setVolume, volume, lyrics, lyricsLoading,
  } = usePlayer()

  const [results, setResults] = useState<Track[] | null>(null)
  const [resultQuery, setResultQuery] = useState("")
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const stageRef = useBeatEngine(playing)
  const mainRef = useRef<HTMLElement>(null)
  const lyricsLinesRef = useRef<HTMLDivElement>(null)

  const onResults = useCallback((tracks: Track[] | null, query: string) => {
    setResults(tracks)
    setResultQuery(query)
    if (tracks?.length && mainRef.current) {
      mainRef.current.scrollTo({ top: 320, behavior: "smooth" })
    }
  }, [])

  // glass mouse-follow highlight
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const g = (e.target as HTMLElement).closest?.(".glass") as HTMLElement | null
      if (g) {
        const r = g.getBoundingClientRect()
        g.style.setProperty("--mx", `${e.clientX - r.left}px`)
        g.style.setProperty("--my", `${e.clientY - r.top}px`)
      }
    }
    document.addEventListener("pointermove", handler)
    return () => document.removeEventListener("pointermove", handler)
  }, [])

  // keyboard: space play/pause, escape closes lyrics
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLyricsOpen(false)
      if (e.code === "Space" && !["INPUT", "BUTTON", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        togglePlay()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [togglePlay])

  const progress = duration > 0 ? currentTime / duration : 0
  const lyr = lyrics

  // active lyric line + word progress
  let activeLine = -1
  let wordP = 0
  if (lyr?.synced && lyr.lines.length && duration > 0) {
    // use real timestamps
    let lo = 0
    for (let i = 0; i < lyr.lines.length; i++) {
      if (currentTime >= lyr.lines[i].time) lo = i
      else break
    }
    activeLine = lo
    const lineStart = lyr.lines[lo].time
    const lineEnd = lo + 1 < lyr.lines.length ? lyr.lines[lo + 1].time : duration
    if (lineEnd > lineStart) wordP = (currentTime - lineStart) / (lineEnd - lineStart)
  } else if (lyr && !lyr.synced && lyr.lines.length) {
    activeLine = Math.min(lyr.lines.length - 1, Math.floor((currentTime / Math.max(duration, 1)) * lyr.lines.length))
    wordP = 1
  }

  useEffect(() => {
    if (!lyricsOpen || !lyr) return
    const box = lyricsLinesRef.current
    const act = (box?.children[activeLine] ?? null) as HTMLElement | null
    if (box && act) {
      box.scrollTo({ top: act.offsetTop - box.clientHeight / 2 + act.offsetHeight / 2, behavior: "smooth" })
    }
  }, [activeLine, lyricsOpen, lyr])

  return (
    <>
      <div className="mesh" aria-hidden>
        <div className="orb" style={{ "--d": "24s", "--x": "9vmax", "--y": "6vmax", width: "42vmin", height: "42vmin", left: "-6vmin", top: "-8vmin" } as React.CSSProperties}><b /></div>
        <div className="orb" style={{ "--d": "30s", "--x": "-10vmax", "--y": "8vmax", width: "26vmin", height: "26vmin", right: "6vmin", top: "12vmin" } as React.CSSProperties}><b /></div>
        <div className="orb" style={{ "--d": "36s", "--x": "8vmax", "--y": "-10vmax", width: "34vmin", height: "34vmin", left: "30vmin", bottom: "-14vmin" } as React.CSSProperties}><b /></div>
        <div className="orb" style={{ "--d": "20s", "--x": "-6vmax", "--y": "-6vmax", width: "15vmin", height: "15vmin", right: "26vmin", bottom: "16vmin" } as React.CSSProperties}><b /></div>
      </div>
      <div className="grain" aria-hidden />

      <div className={`app${playing ? " playing" : ""}`}>
        <nav className="glass side" aria-label="Main">
          <Wordmark />
          <button className="nav on" aria-label="Home" onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" })}>
            <svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" /></svg>
          </button>
          <button className="nav" aria-label="Explore" onClick={() => (document.querySelector(".search input") as HTMLInputElement)?.focus()}>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>
          </button>
          <button
            className="nav"
            aria-label="Jump back in"
            onClick={() => document.getElementById("jump")?.scrollIntoView({ behavior: "smooth", block: "center" })}
          >
            <svg viewBox="0 0 24 24"><path d="M4 4v16M9 4v16M14 6l6 14" /></svg>
          </button>
          <button
            className="nav"
            aria-label="Lyrics"
            style={{ marginTop: "auto" }}
            onClick={() => setLyricsOpen(true)}
          >
            <svg viewBox="0 0 24 24"><path d="M4 5h16v2H4zm0 6h10v2H4zm0 6h16v2H4z" /></svg>
          </button>
        </nav>

        <main className="main" ref={mainRef}>
          <SearchTop onResults={onResults} />

          <section className="glass hero">
            <div>
              <h1>
                Music, <span>unlocked.</span>
              </h1>
              <p>
                No ads, no subscription. Synced lyrics, gapless playback and your whole
                library, in one place. Press play and the whole page moves with the beat.
              </p>
              <div className="row">
                <button className="btn p" onClick={togglePlay} disabled={!current}>
                  {resolving && !playing ? (
                    <span className="mini-spinner" />
                  ) : playing ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 4l13 8-13 8z" />
                    </svg>
                  )}
                  <span>{playing ? "Pause" : "Play now"}</span>
                </button>
                <button className="btn g" onClick={() => setLyricsOpen(true)}>
                  Open lyrics
                </button>
              </div>
            </div>
            <div className="stage">
              <canvas ref={stageRef} width={920} height={920} />
              <div className="disc">
                <div className="art" style={artStyle(current)} />
              </div>
            </div>
          </section>

          {results && (
            <section className="glass pad">
              <h2>{results.length ? `Results · ${resultQuery}` : `Results · ${resultQuery}`}</h2>
              {results.length ? (
                <div className="cards">
                  {results.map((t) => (
                    <TrackCard
                      key={t.videoId}
                      track={t}
                      onPlay={() => playTracks(results, results.indexOf(t))}
                      queueNote={t.duration}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty">
                  No songs found. YouTube may be limiting this network — try again in a moment.
                </div>
              )}
            </section>
          )}

          <div className="sh">
            <section className="glass pad" id="jump">
              <h2>Jump back in</h2>
              {recents.length ? (
                <div className="cards">
                  {recents.map((t) => (
                    <TrackCard key={t.videoId} track={t} onPlay={() => playNow(t)} />
                  ))}
                </div>
              ) : (
                <div className="empty">
                  Nothing yet — search a song and press play. What you listen to lands here.
                </div>
              )}
            </section>

            <section className="glass pad">
              <h2>Up next</h2>
              {queue.length ? (
                queue.map((t, i) => (
                  <div key={t.videoId + i} className={`q${i === index ? " on" : ""}`} onClick={() => jumpTo(i)}>
                    <div className="cardart" style={artStyle(t)}>
                      <div className="cardplay">
                        <svg viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" fill="currentColor" />
                        </svg>
                      </div>
                    </div>
                    <div>
                      <b>{t.title}</b>
                      <small>{t.artist}</small>
                    </div>
                    {i === index && playing ? (
                      <span className="search-spinner" style={{ flex: "none" }} />
                    ) : null}
                    {i !== index && (
                      <button
                        className="qx"
                        aria-label="Remove"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFromQueue(i)
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty">Your queue is empty. Play something and it shows up here.</div>
              )}
            </section>
          </div>
        </main>
      </div>

      {/* player bar */}
      {current && (
        <footer className="glass bar">
          <div className="meta" onClick={() => setLyricsOpen(true)}>
            <div className="cardart" style={artStyle(current)} />
            <div style={{ minWidth: 0 }}>
              <b>{current.title}</b>
              <small style={{ color: "var(--mute)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {resolving ? `connecting · ${resolving}` : current.artist}
              </small>
            </div>
          </div>
          <div className="ctl">
            <div className="btns">
              <button className="ic sk" onClick={prev} aria-label="Previous">
                <svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zm3 7l10 7V5z" /></svg>
              </button>
              <button className="ic pl" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                {resolving && !playing ? (
                  <span className="mini-spinner" />
                ) : playing ? (
                  <svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" /></svg>
                )}
              </button>
              <button className="ic sk" onClick={next} aria-label="Next">
                <svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM5 5v14l10-7z" /></svg>
              </button>
            </div>
            <div className="prog">
              <span>{fmt(currentTime)}</span>
              <div
                className="track"
                onPointerDown={(e) => {
                  if (duration <= 0) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const move = (ev: PointerEvent) => {
                    const p = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
                    seek(p * duration)
                  }
                  const up = (ev: PointerEvent) => {
                    const p = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
                    seek(p * duration)
                    window.removeEventListener("pointermove", move)
                    window.removeEventListener("pointerup", up)
                  }
                  window.addEventListener("pointermove", move)
                  window.addEventListener("pointerup", up)
                }}
              >
                <i style={{ width: `${progress * 100}%` }} />
              </div>
              <span>{fmt(duration)}</span>
            </div>
          </div>
          <div className="right">
            <input
              className="vol"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
            />
            <button className="ic" onClick={() => setLyricsOpen(true)} aria-label="Lyrics">
              <svg viewBox="0 0 24 24"><path d="M4 5h16v2H4zm0 6h10v2H4zm0 6h16v2H4z" /></svg>
            </button>
          </div>
        </footer>
      )}

      {/* lyrics overlay */}
      <section className={`ly${lyricsOpen ? " open" : ""}`} aria-label="Lyrics" aria-hidden={!lyricsOpen}>
        <div className="lyhead">
          <div className="cardart" style={artStyle(current)} />
          <div>
            <b>{current?.title ?? "Lyrics"}</b>
            <div style={{ color: "var(--mute)" }}>{current?.artist ?? ""}</div>
          </div>
          <button className="ic" onClick={() => setLyricsOpen(false)} aria-label="Close lyrics">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>
        <div className="lines" ref={lyricsLinesRef}>
          {lyr ? (
            lyr.lines.map((line, n) => {
              const words = line.text.split(" ")
              return (
                <button
                  key={n}
                  className={`ln${n === activeLine ? " act" : ""}${lyr.synced && Math.abs(n - activeLine) === 1 ? " near" : ""}`}
                  onClick={() => {
                    if (lyr.synced) seek(line.time + 0.01)
                  }}
                >
                  {words.map((w, m) => {
                    const done = lyr.synced
                      ? n < activeLine || (n === activeLine && m / words.length < wordP)
                      : false
                    const cur = lyr.synced && n === activeLine && done && (m + 1) / words.length >= wordP
                    return (
                      <span key={m} className={`w${done ? " d" : ""}${cur ? " cur" : ""}`}>
                        {w}{" "}
                      </span>
                    )
                  })}
                </button>
              )
            })
          ) : (
            <div className="lyempty">
              {lyricsLoading ? "Finding lyrics…" : "No lyrics found for this song"}
            </div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {error && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
