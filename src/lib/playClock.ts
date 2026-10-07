// The preview's clock while sound plays. A media element's currentTime moves in steps (per audio block in Chrome,
// coarser in Safari and Firefox), so a preview drawn from it stutters and a hit can show a frame or two away from
// where the final render puts it. These clocks are continuous and never run backwards while playing.

// The sample the speakers are playing now, in the context's time: its output timestamp carried forward to this
// moment, or its clock less the output latency where that call is missing.
function heardTime(ctx: AudioContext): number {
  const stamp = typeof ctx.getOutputTimestamp === "function" ? ctx.getOutputTimestamp() : null;
  if (stamp && stamp.contextTime !== undefined && stamp.performanceTime) {
    return stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000;
  }
  return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
}

// Plays a mix (an AudioBuffer) through Web Audio. time() is sample-accurate, the same in every browser. A new
// mix (the piece changed while playing) picks up from the same second.
export class MixPlayer {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  // Piece time `anchorT` sounds at context time `anchorCtx`.
  private anchorT = 0;
  private anchorCtx = 0;
  private stopped = 0;
  private last = 0;
  // Called when the mix plays to its end.
  onEnd: (() => void) | null = null;

  get playing(): boolean {
    return this.source !== null;
  }

  get ready(): boolean {
    return this.buffer !== null;
  }

  // Swaps the mix. While playing, the new one carries on from the second the old one had reached.
  setBuffer(buffer: AudioBuffer | null) {
    const at = this.time();
    const was = this.playing;
    this.stopSource();
    this.buffer = buffer;
    this.stopped = at;
    if (was && buffer) void this.play(at);
  }

  async play(from: number) {
    const buffer = this.buffer;
    if (!buffer) return;
    this.ctx ??= new AudioContext({ latencyHint: "interactive" });
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.stopSource();
    const start = Math.min(Math.max(0, from), Math.max(0, buffer.duration - 0.01));
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    // A short lead so the start is scheduled ahead, never late.
    const when = this.ctx.currentTime + 0.03;
    source.start(when, start);
    source.onended = () => {
      if (this.source !== source) return;
      this.source = null;
      this.stopped = buffer.duration;
      this.onEnd?.();
    };
    this.anchorT = start;
    this.anchorCtx = when;
    this.last = start;
    this.source = source;
  }

  pause() {
    this.stopped = this.time();
    this.stopSource();
  }

  // Moves the play position; keeps playing if it was.
  seek(t: number) {
    if (this.playing) void this.play(t);
    else this.stopped = Math.max(0, t);
  }

  // The piece's second being heard now (or where it stopped).
  time(): number {
    if (!this.source || !this.ctx || !this.buffer) return this.stopped;
    const t = Math.max(this.last, this.anchorT + Math.max(0, heardTime(this.ctx) - this.anchorCtx));
    this.last = t;
    return Math.min(t, this.buffer.duration);
  }

  close() {
    this.stopSource();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  private stopSource() {
    const source = this.source;
    this.source = null;
    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
    source.disconnect();
  }
}

// A smooth clock over a media element that keeps its own controls (the song of a lyric video): each fresh reading
// of currentTime anchors it, and between readings it runs on performance.now(). It never runs backwards while
// playing, unless the element jumped (a seek), and it stops with the element.
export function mediaClock(): (el: HTMLMediaElement | null | undefined) => number {
  let reading = -1;
  let readAt = 0;
  let out = 0;
  return (el) => {
    if (!el) return 0;
    const now = performance.now();
    const media = el.currentTime;
    if (el.paused || el.seeking || el.ended || el.readyState < 2) {
      reading = media;
      readAt = now;
      out = media;
      return media;
    }
    if (media !== reading) {
      reading = media;
      readAt = now;
    }
    const t = reading + ((now - readAt) / 1000) * (el.playbackRate || 1);
    // A jump of more than a quarter second is a seek: follow it, even backwards.
    out = Math.abs(t - out) > 0.25 ? t : Math.max(out, t);
    return out;
  };
}
