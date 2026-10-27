import { motion } from "framer-motion"
import type { Track } from "../lib/innertube"
import { usePlayer } from "../store"

function PlayNextIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path
        d="M4 6h11M4 12h11M4 18h7M17 13l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function AddQueueIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path
        d="M3 6h13M3 12h13M3 18h8M18 10v8M14 14h8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function TrackRow({
  track,
  index,
  queueContext,
  active,
}: {
  track: Track
  index: number
  queueContext: Track[]
  active: boolean
}) {
  const { playTracks, playTrackNext, addToQueue } = usePlayer()

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.035, 0.4), duration: 0.35, ease: "easeOut" }}
      className={`track-row${active ? " active" : ""}`}
      onClick={() => playTracks(queueContext, queueContext.indexOf(track))}
    >
      <div className="track-art">
        <img src={track.thumbnail} alt="" loading="lazy" />
        {active && <div className="track-art-eq"><i /><i /><i /></div>}
        <div className="track-art-play">
          <svg viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
        </div>
      </div>

      <div className="track-meta">
        <span className="track-title">{track.title}</span>
        <span className="track-sub">
          {track.artist}
          {track.album ? ` · ${track.album}` : ""}
        </span>
      </div>

      {track.duration && <span className="track-duration">{track.duration}</span>}

      <div className="track-actions" onClick={(e) => e.stopPropagation()}>
        <button title="Play next" onClick={() => playTrackNext(track)}>
          <PlayNextIcon />
        </button>
        <button title="Add to queue" onClick={() => addToQueue(track)}>
          <AddQueueIcon />
        </button>
      </div>
    </motion.div>
  )
}

export function TrackList({ tracks }: { tracks: Track[] }) {
  return (
    <div className="track-list">
      {tracks.map((t, i) => (
        <TrackRow
          key={t.videoId + i}
          track={t}
          index={i}
          queueContext={tracks}
          active={false}
        />
      ))}
    </div>
  )
}
