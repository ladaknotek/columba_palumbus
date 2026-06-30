import {
  durationToBeats,
  TICKS_PER_BEAT,
  type Duration,
  type ScoreProject,
  type SoundStyle,
} from '../../domain/score';

interface PreviewNoteOptions {
  midi: number;
  duration: Duration;
  tempo: number;
  soundStyle: SoundStyle;
}

/**
 * Přehrávání je nezávislé na Reactu i rendereru not.
 * App pouze předá projekt a zvolený styl zvuku.
 */
export class PlaybackEngine {
  private context: AudioContext | null = null;
  private sources = new Set<OscillatorNode>();
  private timerIds = new Set<number>();
  private playbackToken = 0;

  stop(): void {
    this.playbackToken += 1;

    for (const timerId of this.timerIds) {
      window.clearTimeout(timerId);
    }

    this.timerIds.clear();

    const now = this.context?.currentTime ?? 0;

    for (const source of this.sources) {
      try {
        source.stop(now + 0.015);
      } catch {
        // Oscilátor už mohl být ukončen.
      }
    }

    this.sources.clear();
  }

  /** Krátký zvukový náhled po vložení noty klávesou nebo myší. */
  previewNote(options: PreviewNoteOptions): void {
    const context = this.ensureContext();
    const secondsPerBeat = 60 / options.tempo;
    const previewDuration = Math.min(
      0.9,
      Math.max(0.16, durationToBeats(options.duration) * secondsPerBeat),
    );

    this.scheduleNote(
      context,
      options.midi,
      context.currentTime + 0.01,
      previewDuration,
      options.soundStyle,
      0.2,
    );
  }

  play(
    project: ScoreProject,
    soundStyle: SoundStyle,
    onActive?: (eventId: string | null) => void,
  ): void {
    this.stop();
    onActive?.(null);

    const currentToken = this.playbackToken;
    const context = this.ensureContext();
    const orderedEvents = [...project.events].sort(
      (a, b) => a.startTick - b.startTick || a.midi - b.midi,
    );

    if (orderedEvents.length === 0) {
      return;
    }

    const secondsPerBeat = 60 / project.tempo;
    const startTime = context.currentTime + 0.06;
    let endTime = startTime;

    for (const event of orderedEvents) {
      const eventStart = startTime
        + (event.startTick / TICKS_PER_BEAT) * secondsPerBeat;
      const eventDuration = (event.durationTicks / TICKS_PER_BEAT)
        * secondsPerBeat;

      this.scheduleNote(
        context,
        event.midi,
        eventStart,
        eventDuration,
        soundStyle,
        0.18,
      );

      endTime = Math.max(endTime, eventStart + eventDuration);

      this.scheduleTimer(
        () => {
          if (currentToken === this.playbackToken) {
            onActive?.(event.id);
          }
        },
        (eventStart - context.currentTime) * 1000,
      );
    }

    this.scheduleTimer(
      () => {
        if (currentToken === this.playbackToken) {
          onActive?.(null);
        }
      },
      (endTime - context.currentTime) * 1000 + 80,
    );
  }

  private ensureContext(): AudioContext {
    this.context ??= new AudioContext();

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    return this.context;
  }

  private scheduleTimer(callback: () => void, delayMs: number): void {
    const timerId = window.setTimeout(() => {
      this.timerIds.delete(timerId);
      callback();
    }, Math.max(0, delayMs));

    this.timerIds.add(timerId);
  }

  private scheduleNote(
    context: AudioContext,
    midi: number,
    startTime: number,
    duration: number,
    soundStyle: SoundStyle,
    volume: number,
  ): void {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const noteGain = context.createGain();
    noteGain.connect(context.destination);

    const releaseSeconds = soundStyle === 'vocal' ? 0.06 : 0.03;
    const endTime = startTime + duration + releaseSeconds;

    if (soundStyle === 'piano') {
      this.applyPianoEnvelope(noteGain, startTime, duration, endTime, volume);

      const fundamental = context.createOscillator();
      fundamental.type = 'triangle';
      fundamental.frequency.setValueAtTime(frequency, startTime);

      const harmonic = context.createOscillator();
      harmonic.type = 'sine';
      harmonic.frequency.setValueAtTime(frequency * 2, startTime);

      const harmonicGain = context.createGain();
      harmonicGain.gain.setValueAtTime(0.14, startTime);

      fundamental.connect(noteGain);
      harmonic.connect(harmonicGain).connect(noteGain);
      this.startAndTrack([fundamental, harmonic], startTime, endTime);
      return;
    }

    this.applyVocalEnvelope(noteGain, startTime, duration, endTime, volume);

    const voice = context.createOscillator();
    voice.type = 'sawtooth';
    voice.frequency.setValueAtTime(frequency, startTime);

    const fundamental = context.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.setValueAtTime(frequency, startTime);

    const fundamentalGain = context.createGain();
    fundamentalGain.gain.setValueAtTime(0.24, startTime);

    const formantA = context.createBiquadFilter();
    formantA.type = 'bandpass';
    formantA.frequency.setValueAtTime(820, startTime);
    formantA.Q.setValueAtTime(4, startTime);

    const formantB = context.createBiquadFilter();
    formantB.type = 'bandpass';
    formantB.frequency.setValueAtTime(1_350, startTime);
    formantB.Q.setValueAtTime(5, startTime);

    voice.connect(formantA).connect(noteGain);
    voice.connect(formantB).connect(noteGain);
    fundamental.connect(fundamentalGain).connect(noteGain);
    this.startAndTrack([voice, fundamental], startTime, endTime);
  }

  private applyPianoEnvelope(
    gainNode: GainNode,
    startTime: number,
    duration: number,
    endTime: number,
    volume: number,
  ): void {
    const gain = gainNode.gain;
    const decayTime = startTime + Math.min(0.16, duration * 0.45);

    gain.setValueAtTime(0.0001, startTime);
    gain.exponentialRampToValueAtTime(volume, startTime + 0.008);
    gain.exponentialRampToValueAtTime(
      Math.max(0.0001, volume * 0.34),
      decayTime,
    );
    gain.exponentialRampToValueAtTime(0.0001, endTime);
  }

  private applyVocalEnvelope(
    gainNode: GainNode,
    startTime: number,
    duration: number,
    endTime: number,
    volume: number,
  ): void {
    const gain = gainNode.gain;
    const attackEnd = startTime + Math.min(0.045, duration * 0.35);
    const sustainEnd = startTime + duration;

    gain.setValueAtTime(0.0001, startTime);
    gain.linearRampToValueAtTime(volume, attackEnd);
    gain.setValueAtTime(volume * 0.82, sustainEnd);
    gain.exponentialRampToValueAtTime(0.0001, endTime);
  }

  private startAndTrack(
    sources: OscillatorNode[],
    startTime: number,
    endTime: number,
  ): void {
    for (const source of sources) {
      this.sources.add(source);
      source.onended = () => {
        this.sources.delete(source);
        try {
          source.disconnect();
        } catch {
          // Už odpojeno.
        }
      };
      source.start(startTime);
      source.stop(endTime);
    }
  }
}
