import { motion } from "framer-motion"
import { usePlayer } from "../store"

function fmt(t: number): string {
  if (!Number.isFinite(t)) return "0:00"
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function MiniPlayer() {
  const { current, playing, togglePlay, next, currentTime, duration, setExpanded, resolving } =
    usePlayer()
  if (!current) return null

  const progress = duration > 0 ? currentTime / duration : 0

  return (
    <motion.div
      className="mini-player"
      initial={{ y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 90, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      onClick={() => setExpanded(true)}
    >
      <div className="mini-progress" style={{ transform: `scaleX(${progress})` }} />
      <img src={current.thumbnail} alt="" className="mini-art" />
      <div className="mini-meta">
        <span className="mini-title">{current.title}</span>
        <span className="mini-sub">
          {resolving ? `connecting · ${resolving}` : current.artist}
        </span>
      </div>
      <button
        className="mini-btn"
        onClick={(e) => {
          e.stopPropagation()
          togglePlay()
        }}
        aria-label={playing ? "Pause" : "Play"}
      >
        {resolving && !playing ? (
          <span className="mini-spinner" />
        ) : playing ? (
          <svg viewBox="0 0 24 24">
            <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
        )}
      </button>
      <button
        className="mini-btn"
        onClick={(e) => {
          e.stopPropagation()
          next()
        }}
        aria-label="Next"
      >
        <svg viewBox="0 0 24 24">
          <path d="M6 5l9 7-9 7zM17 5h2v14h-2z" fill="currentColor" />
        </svg>
      </button>
    </motion.div>
  )
}

export { fmt }
