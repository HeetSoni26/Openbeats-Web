import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AuroraBackground } from "./components/AuroraBackground"
import { SearchBar } from "./components/SearchBar"
import { TrackList } from "./components/TrackList"
import { MiniPlayer } from "./components/MiniPlayer"
import { ImmersivePlayer } from "./components/ImmersivePlayer"
import { searchTracks, type Track } from "./lib/innertube"
import { usePlayer } from "./store"

function Wordmark() {
  return (
    <div className="wordmark">
      <div className="wordmark-badge">
        <svg viewBox="0 0 24 24" className="wordmark-beats">
          {[4, 9, 14, 19].map((x, i) => (
            <rect key={x} x={x} className={`beat beat-${i}`} width="1.6" rx="0.8" />
          ))}
        </svg>
      </div>
      <span className="wordmark-text">
        Open<em>beats</em>
      </span>
    </div>
  )
}

function Hero() {
  return (
    <motion.div
      className="hero"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="hero-badge">
        <svg viewBox="0 0 24 24">
          {[4, 9, 14, 19].map((x, i) => (
            <rect key={x} x={x} className={`beat beat-${i}`} width="1.6" rx="0.8" />
          ))}
        </svg>
      </div>
      <h1>
        Your music.
        <br />
        <span>Zero installs.</span>
      </h1>
      <p>
        Search any song and press play — right here in your browser.
        <br />
        Free, no account, works on laptop and iPhone.
      </p>
    </motion.div>
  )
}

export default function App() {
  const [results, setResults] = useState<Track[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const { current, error, expanded } = usePlayer()

  const doSearch = async (q: string) => {
    setSearching(true)
    setSearchError(null)
    setHasSearched(true)
    try {
      const tracks = await searchTracks(q)
      setResults(tracks)
      if (!tracks.length) setSearchError("No songs found. Try another search.")
    } catch {
      setSearchError("Search failed — YouTube may be blocking this network. Try again.")
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="app">
      <AuroraBackground />

      <header className="topbar">
        <Wordmark />
        <SearchBar onSearch={doSearch} busy={searching} />
      </header>

      <main className="content">
        {!hasSearched && <Hero />}

        {hasSearched && (
          <>
            {searchError && <div className="notice">{searchError}</div>}
            {results.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="results-head"
              >
                <span>{results.length} songs</span>
              </motion.div>
            )}
            <TrackList tracks={results} />
            {!searching && results.length === 0 && !searchError && (
              <div className="notice">Searching…</div>
            )}
          </>
        )}
      </main>

      <AnimatePresence>{current && !expanded && <MiniPlayer />}</AnimatePresence>
      <ImmersivePlayer />

      <AnimatePresence>
        {error && (
          <motion.div
            className="notice error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
