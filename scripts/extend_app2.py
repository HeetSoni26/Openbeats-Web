import io

p = 'src/App.tsx'
s = io.open(p, encoding='utf-8').read()

# --- PlaylistRow component + TrackCard playlist popover ---

# add PlaylistRow before "/* ---------------------------------- app ---"
s = s.replace('''/* ---------------------------------- app ------------------------------------ */''',
'''function PlaylistRow({
  pl,
  onPlay,
  onDelete,
  onRemoveTrack,
}: {
  pl: import("./store").Playlist
  onPlay: () => void
  onDelete: () => void
  onRemoveTrack: (videoId: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="pl">
      <div className="q" onClick={() => setOpen((v) => !v)}>
        <div className="cardart pl-art">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
        </div>
        <div>
          <b>{pl.name}</b>
          <small>
            {pl.tracks.length} {pl.tracks.length === 1 ? "song" : "songs"}
          </small>
        </div>
        <button
          className="qx"
          aria-label="Play playlist"
          onClick={(e) => {
            e.stopPropagation()
            onPlay()
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        <button
          className="qx"
          aria-label="Delete playlist"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="pl-tracks">
          {pl.tracks.length ? (
            pl.tracks.map((t) => (
              <div key={t.videoId} className="q" onClick={() => onPlay()}>
                <div className="cardart" style={artStyle(t)} />
                <div>
                  <b>{t.title}</b>
                  <small>{t.artist}</small>
                </div>
                <button
                  className="qx"
                  aria-label="Remove from playlist"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveTrack(t.videoId)
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          ) : (
            <div className="empty">Empty — add songs from any card's "Save" action.</div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------- app ------------------------------------ */''')

# --- TrackCard: add "Save" playlist popover ---
s = s.replace('''function TrackCard({
  track,
  onPlay,
  queueNote,
}: {
  track: Track
  onPlay: () => void
  queueNote?: string
}) {
  const { playTrackNext, addToQueue, current } = usePlayer()
  const active = current?.videoId === track.videoId''',
'''function TrackCard({
  track,
  onPlay,
  queueNote,
}: {
  track: Track
  onPlay: () => void
  queueNote?: string
}) {
  const { playTrackNext, addToQueue, current, playlists, createPlaylist, addToPlaylist } =
    usePlayer()
  const active = current?.videoId === track.videoId
  const [plOpen, setPlOpen] = useState(false)''')

s = s.replace('''      <div className="acts" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => playTrackNext(track)}
          title="Play next"
        >
          Play next
        </button>
        <button onClick={() => addToQueue(track)} title="Add to queue">
          Queue
        </button>
      </div>''',
'''      <div className="acts" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => playTrackNext(track)} title="Play next">
          Play next
        </button>
        <button onClick={() => addToQueue(track)} title="Add to queue">
          Queue
        </button>
        <button onClick={() => setPlOpen((v) => !v)} title="Save to playlist">
          Save
        </button>
        {plOpen && (
          <div className="glass pl-pop">
            {playlists.map((pl) => (
              <button
                key={pl.id}
                className="suggest-item"
                onClick={() => {
                  addToPlaylist(pl.id, track)
                  setPlOpen(false)
                }}
              >
                {pl.name}
              </button>
            ))}
            <button
              className="suggest-item new"
              onClick={() => {
                const id = createPlaylist("My playlist")
                addToPlaylist(id, track)
                setPlOpen(false)
              }}
            >
              + New playlist
            </button>
          </div>
        )}
      </div>''')

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('app components added OK')
