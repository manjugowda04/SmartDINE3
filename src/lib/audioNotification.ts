// Synthesized notification audio using Web Audio API
// No external audio files or network requests needed.

class AudioNotifier {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private listeners: Set<(muted: boolean) => void> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("smartdine_sound_muted");
        this.muted = stored === "true";
      } catch {
        this.muted = false;
      }

      // Auto-unlock AudioContext on first user interaction if suspended
      const unlock = () => {
        if (this.ctx && this.ctx.state === "suspended") {
          this.ctx.resume().catch(() => {});
        }
        window.removeEventListener("click", unlock);
        window.removeEventListener("touchstart", unlock);
        window.removeEventListener("keydown", unlock);
      };
      window.addEventListener("click", unlock, { once: true, passive: true });
      window.addEventListener("touchstart", unlock, { once: true, passive: true });
      window.addEventListener("keydown", unlock, { once: true, passive: true });
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem("smartdine_sound_muted", String(muted));
    } catch (e) {
      console.warn("Could not save sound mute preference:", e);
    }
    this.listeners.forEach((fn) => fn(muted));
  }

  public subscribe(listener: (muted: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Order Chime: Crisp, pleasant two-tone restaurant bell (D5 -> A5)
   */
  public playOrderChime() {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      this.synthesizeTone(ctx, 587.33, now, 0.35, "sine", 0.28); // D5
      this.synthesizeTone(ctx, 880.0, now + 0.12, 0.55, "sine", 0.32); // A5
    } catch (e) {
      console.warn("Could not play order chime:", e);
    }
  }

  /**
   * Request Chime: Distinctive, warm service bell (G5 -> C6)
   */
  public playRequestChime() {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      this.synthesizeTone(ctx, 783.99, now, 0.3, "triangle", 0.24); // G5
      this.synthesizeTone(ctx, 1046.5, now + 0.1, 0.45, "triangle", 0.28); // C6
    } catch (e) {
      console.warn("Could not play request chime:", e);
    }
  }

  /**
   * Reset AudioContext for testing
   */
  public resetForTesting() {
    this.ctx = null;
  }
  public testSound() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      this.synthesizeTone(ctx, 880.0, now, 0.3, "sine", 0.25);
    } catch (e) {
      console.warn("Could not play test sound:", e);
    }
  }

  private synthesizeTone(
    ctx: AudioContext,
    frequency: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    peakGain: number
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);

    // Natural attack and exponential decay
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }
}

export const audioNotifier = new AudioNotifier();
