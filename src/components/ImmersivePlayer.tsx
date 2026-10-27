import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { fmt } from "./MiniPlayer"
import { Visualizer } from "./Visualizer"
import { usePlayer } from "../store"

export function ImmersivePlayer() {
  const {
    current, queue, index, playing, togglePlay, next, prev, currentTime, duration,
    seek, expanded, setExpanded, palette, resolving, removeFromQueue, jumpTo,
  } = usePlayer()
  const [showQueue, setShowQueue] = useState(false)
  const [scrubbing, setScrubbing] = useState<number | null>(null)

  if (!current) return null

  const shownTime = scrubbing ?? currentTime
  const progress = duration > 0 ? shownTime / duration : 0

  return (
    <AnimatePresence>
      {expanded && (
        <motion.div
          className="immersive"
          initial={{ opacity: 0, y: "6%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "8%" }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
        >
          <div className="immersive-bg">
            <img src={current.thumbnail} alt="" />
          </div>

          <div className="immersive-top">
            <button className="ghost-btn" onClick={() => setExpanded(false)} aria-label="Close">
              <svg viewBox="0 0 24 24">
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="immersive-label">Now playing</span>
            <button className="ghost-btn" onClick={() => setShowQueue((v) => !v)} aria-label="Queue">
              <svg viewBox="0 0 24 24">
                <path d="M4 6h16M4 12h10M4 18h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M18 9v8M15 13l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="immersive-body">
            <div className="art-wrap">
              <Visualizer playing={playing} />
              <motion.img
                key={current.videoId}
                src={current.thumbnail}
                alt=""
                className="immersive-art"
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 24 }}
                style={{ boxShadow: `0 30px 90px -20px ${palette.primary}` }}
              />
            </div>

            <div className="immersive-meta">
              <motion.h2
                key={current.videoId + "-t"}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
              >
                {current.title}
              </motion.h2>
              <motion.p
                key={current.videoId + "-a"}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14 }}
              >
                {resolving ? `connecting · ${resolving}` : current.artist}
              </motion.p>
            </div>

            <div
              className="seek"
              onPointerDown={(e) => {
                if (duration <= 0) return
                const rect = e.currentTarget.getBoundingClientRect()
                const update = (clientX: number) => {
                  const p = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
                  setScrubbing(p * duration)
                }
                update(e.clientX)
                const move = (ev: PointerEvent) => update(ev.clientX)
                const up = (ev: PointerEvent) => {
                  const p = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
                  seek(p * duration)
                  setScrubbing(null)
                  window.removeEventListener("pointermove", move)
                  window.removeEventListener("pointerup", up)
                }
                window.addEventListener("pointermove", move)
                window.addEventListener("pointerup", up)
              }}
            >
              <div className="seek-rail">
                <div className="seek-fill" style={{ transform: `scaleX(${progress})` }} />
                <div className="seek-knob" style={{ left: `${progress * 100}%` }} />
              </div>
              <div className="seek-times">
                <span>{fmt(shownTime)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>

            <div className="controls">
              <button className="ctl" onClick={prev} aria-label="Previous">
                <svg viewBox="0 0 24 24">
                  <path d="M18 5l-9 7 9 7zM6 5h-2v14h2z" fill="currentColor" transform="translate(2 0)" />
                </svg>
              </button>
              <button className="ctl play-big" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                {resolving && !playing ? (
                  <span className="mini-spinner big" />
                ) : playing ? (
                  <svg viewBox="0 0 24 24">
                    <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" fill="currentColor" />
                  </svg>
                )}
              </button>
              <button className="ctl" onClick={next} aria-label="Next">
                <svg viewBox="0 0 24 24">
                  <path d="M6 5l9 7-9 7zM16 5h2v14h-2z" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>

          <AnimatePresence>
            {showQueue && (
              <motion.div
                className="queue-sheet"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 32 }}
              >
                <div className="queue-head">
                  <span>Queue · {queue.length}</span>
                  <button className="ghost-btn" onClick={() => setShowQueue(false)} aria-label="Close queue">
                    <svg viewBox="0 0 24 24">
                      <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <div className="queue-list">
                  {queue.map((t, i) => (
                    <div
                      key={t.videoId + i}
                      className={`queue-row${i === index ? " active" : ""}`}
                      onClick={() => jumpTo(i)}
                    >
                      <img src={t.thumbnail} alt="" />
                      <div className="track-meta">
                        <span className="track-title">{t.title}</span>
                        <span className="track-sub">{t.artist}</span>
                      </div>
                      {i !== index && (
                        <button
                          className="ghost-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeFromQueue(i)
                          }}
                          aria-label="Remove"
                        >
                          <svg viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
