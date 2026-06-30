/**
 * Jednoduchý metronom stojí mimo React a používá audio hodiny pro zvuk.
 * UI dostává jen číslo právě znějící doby.
 */
export class Metronome {
  private context: AudioContext | null = null;
  private timerId: number | null = null;
  private nextBeatAt = 0;
  private beatIndex = 0;

  get isRunning(): boolean {
    return this.timerId !== null;
  }

  start(tempo: number, onBeat?: (beat: number) => void): void {
    this.stop();

    this.context ??= new AudioContext();

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const intervalMs = 60_000 / tempo;
    this.nextBeatAt = performance.now();
    this.beatIndex = 0;

    const tick = () => {
      const now = performance.now();
      const isDownbeat = this.beatIndex % 4 === 0;

      this.playClick(isDownbeat);
      onBeat?.((this.beatIndex % 4) + 1);
      this.beatIndex += 1;
      this.nextBeatAt += intervalMs;

      const delay = Math.max(0, this.nextBeatAt - now);
      this.timerId = window.setTimeout(tick, delay);
    };

    tick();
  }

  stop(): void {
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private playClick(isDownbeat: boolean): void {
    if (!this.context) {
      return;
    }

    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(isDownbeat ? 1_450 : 1_050, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(isDownbeat ? 0.18 : 0.11, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.05);
  }
}
