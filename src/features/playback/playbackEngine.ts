import type { NoteEvent, ScoreProject } from '../../domain/score';

export class PlaybackEngine {
  private context: AudioContext | null = null;
  private stopTimer: number | null = null;
  private stopped = false;

  stop(): void {
    this.stopped = true;
    if (this.stopTimer !== null) window.clearTimeout(this.stopTimer);
    this.stopTimer = null;
  }

  play(project: ScoreProject, onActive?: (eventId: string | null) => void): void {
    this.stop();
    this.stopped = false;
    this.context ??= new AudioContext();
    const ctx = this.context;
    const ordered = [...project.events].sort((a, b) => a.measure - b.measure || a.slot - b.slot || a.midi - b.midi);
    if (ordered.length === 0) return;

    const secondsPerBeat = 60 / project.tempo;
    const now = ctx.currentTime + 0.06;
    let endAt = 0;

    for (const event of ordered) {
      const start = now + (event.measure * 4 + event.slot / 2) * secondsPerBeat;
      const duration = durationSeconds(event, secondsPerBeat);
      endAt = Math.max(endAt, start + duration);
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 440 * 2 ** ((event.midi - 69) / 12);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.05, duration - 0.015));
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
      window.setTimeout(() => { if (!this.stopped) onActive?.(event.id); }, Math.max(0, (start - ctx.currentTime) * 1000));
    }

    this.stopTimer = window.setTimeout(() => onActive?.(null), Math.max(0, (endAt - ctx.currentTime) * 1000) + 50);
  }
}

function durationSeconds(event: NoteEvent, secondsPerBeat: number): number {
  const beats = { whole: 4, half: 2, quarter: 1, eighth: 0.5 }[event.duration];
  return beats * secondsPerBeat * 0.92;
}
