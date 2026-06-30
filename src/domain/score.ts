export type VoiceId = 's' | 'a' | 't' | 'b';

export type LayoutMode = 'two-staves' | 'four-staves';

export type Duration = 'whole' | 'half' | 'quarter' | 'eighth';

/**
 * Zatím jsou oba zvuky syntetizované přímo přes Web Audio API.
 * Piano má krátký perkusivní náběh; vokál je měkký, filtry upravený syntetický tón.
 * Skutečné samply / SoundFonty půjdou později přidat bez změny notového modelu.
 */
export type SoundStyle = 'piano' | 'vocal';

export interface NoteEvent {
  id: string;
  voiceId: VoiceId;
  measure: number;
  slot: number;
  midi: number;
  duration: Duration;
  lyric?: string;
}

export interface ScoreProject {
  version: 1;
  id: string;
  title: string;
  tempo: number;
  layoutMode: LayoutMode;

  /** Uloží se do localStorage i do exportovaného .quartet.json. */
  playbackSound: SoundStyle;

  measureCount: number;
  events: NoteEvent[];
  updatedAt: string;
}

export const VOICES: ReadonlyArray<{
  id: VoiceId;
  name: string;
  clef: 'treble' | 'bass';
}> = [
  { id: 's', name: 'Soprán', clef: 'treble' },
  { id: 'a', name: 'Alt', clef: 'treble' },
  { id: 't', name: 'Tenor', clef: 'bass' },
  { id: 'b', name: 'Bas', clef: 'bass' },
];

export function createEmptyProject(): ScoreProject {
  return {
    version: 1,
    id: crypto.randomUUID(),
    title: 'Nová skladba',
    tempo: 96,
    layoutMode: 'two-staves',
    playbackSound: 'piano',
    measureCount: 4,
    events: [],
    updatedAt: new Date().toISOString(),
  };
}

export function defaultMidiForVoice(voiceId: VoiceId): number {
  return {
    s: 72,
    a: 67,
    t: 60,
    b: 52,
  }[voiceId];
}

/** Převádí notovou hodnotu na počet dob ve 4/4. */
export function durationToBeats(duration: Duration): number {
  return {
    whole: 4,
    half: 2,
    quarter: 1,
    eighth: 0.5,
  }[duration];
}
