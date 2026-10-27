/*
 * Openbeats Web — audio engine: a single <audio> element plus an optional
 * Web Audio analyser for the visualizer. Falls back to visualizer-free
 * playback when cross-origin analysis is unavailable.
 */

export type AudioState = {
  playing: boolean
  currentTime: number
  duration: number
  analyser: AnalyserNode | null
}

type Listener = () => void

class AudioEngine {
  el: HTMLAudioElement
  /** Invoked when the element fails after the built-in crossOrigin retry. */
  onMediaError: ((src: string) => void) | null = null
  ctx: AudioContext | null = null
  analyser: AnalyserNode | null = null
  private source: MediaElementAudioSourceNode | null = null
  private listeners = new Set<Listener>()
  private analyzerAvailable = false

  constructor() {
    this.el = new Audio()
    this.el.preload = "auto"
    this.el.crossOrigin = "anonymous"
    // Test/verification handle (read-only usage in diagnostics).
    ;(window as any).__obAudio = this.el
    const events = ["play", "pause", "timeupdate", "durationchange", "ended", "loadedmetadata"]
    events.forEach((e) => this.el.addEventListener(e, () => this.emit()))
    this.el.addEventListener("error", () => {
      // Cross-origin analysis sometimes breaks loading; retry without it.
      if (this.el.crossOrigin && this.el.src) {
        this.el.crossOrigin = null
        this.analyzerAvailable = false
        const t = this.el.currentTime
        this.el.load()
        this.el.addEventListener(
          "loadedmetadata",
          () => {
            this.el.currentTime = t
            this.el.play().catch(() => {})
          },
          { once: true },
        )
      } else if (this.onMediaError && this.el.src) {
        // Still failing without CORS mode: the stream URL itself is dead
        // (expired cache entry, gated fallback). Let the store re-resolve.
        this.onMediaError(this.el.src)
      }
      this.emit()
    })
  }

  subscribe(l: Listener) {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }

  async connectAnalyser(): Promise<AnalyserNode | null> {
    if (this.analyser) return this.analyser
    if (!this.analyzerAvailable) return null
    try {
      this.ctx = this.ctx ?? new AudioContext()
      if (!this.source) {
        this.source = this.ctx.createMediaElementSource(this.el)
      }
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 128
      this.analyser.smoothingTimeConstant = 0.82
      this.source.connect(this.analyser)
      this.analyser.connect(this.ctx.destination)
      return this.analyser
    } catch {
      this.analyzerAvailable = false
      this.analyser = null
      return null
    }
  }

  load(url: string) {
    this.el.src = url
    this.el.load()
  }

  async play() {
    try {
      await this.el.play()
      if (this.ctx?.state === "suspended") await this.ctx.resume()
    } catch {
      /* autoplay guard */
    }
  }

  pause() {
    this.el.pause()
  }

  seek(t: number) {
    if (Number.isFinite(t)) this.el.currentTime = t
  }

  get state(): AudioState {
    return {
      playing: !this.el.paused && !this.el.ended,
      currentTime: this.el.currentTime,
      duration: Number.isFinite(this.el.duration) ? this.el.duration : 0,
      analyser: this.analyser,
    }
  }
}

export const audioEngine = new AudioEngine()
