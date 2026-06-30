export type VoiceId = 's' | 'a' | 't' | 'b';
export type LayoutMode = 'two-staves' | 'four-staves';
export type Duration = 'whole' | 'half' | 'quarter' | 'eighth';
export type SoundStyle = 'piano' | 'vocal';

/**
 * Aktuální editor používá v každém 4/4 taktu čtyři zapisovací pozice.
 * Později to nahradíme jemnější tickovou mřížkou pro osminy, trioly apod.
 */
export const SLOTS_PER_MEASURE = 4;

export interface CursorPosition {
  measure: number;
  slot: number;
}

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
  return { s: 72, a: 67, t: 60, b: 52 }[voiceId];
}

export function durationToBeats(duration: Duration): number {
  return {
    whole: 4,
    half: 2,
    quarter: 1,
    eighth: 0.5,
  }[duration];
}

/**
 * Kolik pozic aktuální čtyřdílné mřížky zabere nota.
 * Osmina je zatím dočasně jedna pozice, protože editor dosud neumí
 * polohu „mezi dobami“. To vyřeší budoucí přechod na tickovou mřížku.
 */
export function durationToSlots(duration: Duration): number {
  return {
    whole: 4,
    half: 2,
    quarter: 1,
    eighth: 1,
  }[duration];
}

export function advanceCursor(
  position: CursorPosition,
  duration: Duration = 'quarter',
): CursorPosition {
  const absoluteSlot =
    position.measure * SLOTS_PER_MEASURE
    + position.slot
    + durationToSlots(duration);

  return {
    measure: Math.floor(absoluteSlot / SLOTS_PER_MEASURE),
    slot: absoluteSlot % SLOTS_PER_MEASURE,
  };
}

/**
 * Vrátí první rozumnou pozici pro další zápis konkrétního hlasu.
 * Hledá skutečný konec noty, ne jen její začátek, takže půlová a celá
 * nota posunou kurzor dál než čtvrťová.
 */
export function getCursorAfterLastVoiceEvent(
  events: NoteEvent[],
  voiceId: VoiceId,
): CursorPosition {
  const voiceEvents = events.filter((event) => event.voiceId === voiceId);

  if (voiceEvents.length === 0) {
    return { measure: 0, slot: 0 };
  }

  return voiceEvents
    .map((event) => advanceCursor(
      { measure: event.measure, slot: event.slot },
      event.duration,
    ))
    .sort((left, right) => (
      left.measure - right.measure || left.slot - right.slot
    ))
    .at(-1) ?? { measure: 0, slot: 0 };
}
