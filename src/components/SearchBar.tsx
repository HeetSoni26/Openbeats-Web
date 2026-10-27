import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { searchSuggestions } from "../lib/innertube"

export function SearchBar({
  onSearch,
  busy,
}: {
  onSearch: (q: string) => void
  busy: boolean
}) {
  const [value, setValue] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
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
    const t = setTimeout(async () => {
      setSuggestions(await searchSuggestions(q))
    }, 220)
    return () => clearTimeout(t)
  }, [value])

  const submit = (q: string) => {
    const query = q.trim()
    if (!query) return
    setOpen(false)
    onSearch(query)
  }

  return (
    <div className="searchbox" ref={boxRef}>
      <motion.div
        className="searchbar"
        animate={{ boxShadow: open ? "0 0 0 1px var(--accent)" : "0 0 0 1px transparent" }}
        transition={{ duration: 0.25 }}
      >
        <svg viewBox="0 0 24 24" className="search-icon">
          <path
            d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <input
          value={value}
          placeholder="Search songs, artists…"
          onChange={(e) => {
            setValue(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit(value)
            if (e.key === "Escape") setOpen(false)
          }}
          spellCheck={false}
          aria-label="Search songs"
        />
        {busy && <span className="search-spinner" />}
        <button className="search-go" onClick={() => submit(value)} aria-label="Search">
          <svg viewBox="0 0 24 24">
            <path
              d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </motion.div>

      <AnimatePresence>
        {open && suggestions.length > 0 && (
          <motion.div
            className="suggestions"
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {suggestions.map((s) => (
              <button
                key={s}
                className="suggestion"
                onClick={() => {
                  setValue(s)
                  submit(s)
                }}
              >
                <svg viewBox="0 0 24 24">
                  <path
                    d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                {s}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
