import type { Score, VoiceId } from '../../domain/music';

const midiToFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class AudioEngine {
  private context?: AudioContext;
  private timers: number[] = [];

  private getContext(): AudioContext {
    this.context ??= new AudioContext();
    return this.context;
  }

  stop(): void {
    this.timers.forEach(window.clearTimeout);
    this.timers = [];
  }

  playTone(midi: number, durationMs = 240, volume = 0.08): void {
    const ctx = this.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = midiToFrequency(midi);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  }

  playScore(score: Score, onVoice?: (voiceId: VoiceId | null) => void): void {
    this.stop();
    const msPerQuarter = 60000 / score.tempo;

    Object.values(score.voices).forEach((voice) => {
      if (voice.muted) return;
      voice.notes.forEach((note) => {
        if (note.isRest) return;
        const startMs = (note.startTick / 480) * msPerQuarter;
        const durationMs = (note.durationTicks / 480) * msPerQuarter;
        const timer = window.setTimeout(() => {
          onVoice?.(voice.id);
          this.playTone(note.midi, Math.max(80, durationMs * 0.9));
        }, startMs);
        this.timers.push(timer);
      });
    });

    const maxEnd = Math.max(0, ...Object.values(score.voices).flatMap((v) => v.notes.map((n) => n.startTick + n.durationTicks)));
    this.timers.push(window.setTimeout(() => onVoice?.(null), (maxEnd / 480) * msPerQuarter + 80));
  }
}
