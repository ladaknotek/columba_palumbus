/**
 * Hudební jádro je záměrně nezávislé na Reactu i rendereru.
 * Čas zapisujeme v ticích: 4 ticky = jedna doba, 16 ticků = takt 4/4.
 * To dovoluje krokový zápis, osminy i pozdější živý záznam bez dalšího
 * přepisování celého datového modelu.
 */
export type VoiceId = 's' | 'a' | 't' | 'b';
export type LayoutMode = 'two-staves' | 'four-staves';
export type ScoreViewMode = 'score' | 'part';
export type InputMode = 'letter' | 'bgriff';
export type EntryMode = 'step' | 'live';
export type Duration = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';
export type RecordQuantization = 'quarter' | 'eighth' | 'sixteenth';
export type SoundStyle = 'piano' | 'vocal';

export const TICKS_PER_BEAT = 4;
export const BEATS_PER_MEASURE = 4;
export const TICKS_PER_MEASURE = TICKS_PER_BEAT * BEATS_PER_MEASURE;

export interface CursorPosition {
  /** Absolutní pozice od začátku skladby v ticích. */
  tick: number;
}

export interface LyricSyllable {
  /** Číslo sloky; první sloka má hodnotu 1. */
  verse: number;
  text: string;
  /** Pomlčka mezi touto a následující slabikou stejné sloky. */
  connector?: 'hyphen';
}

export interface NoteEvent {
  id: string;
  voiceId: VoiceId;
  /** Absolutní začátek noty v ticích. */
  startTick: number;
  /** Délka noty v ticích. */
  durationTicks: number;
  midi: number;

  /** Starší jednoduchý text první sloky. Zůstává kvůli kompatibilitě. */
  lyric?: string;
  /** Starší pomlčka pro jednoduchý text první sloky. */
  lyricConnector?: 'hyphen';

  /** Připraveno pro více slok pod sebou. UI na editaci více slok doplníme zvlášť. */
  lyrics?: LyricSyllable[];
}

export interface RestEvent {
  id: string;
  voiceId: VoiceId;
  /** Absolutní začátek pomlky v ticích. */
  startTick: number;
  /** Délka pomlky v ticích. */
  durationTicks: number;
}

export interface ScoreProject {
  version: 2;
  id: string;
  title: string;
  tempo: number;
  layoutMode: LayoutMode;
  playbackSound: SoundStyle;
  measureCount: number;
  events: NoteEvent[];
  /** Explicitně zapsané pomlky. Implicitní pomlky dopočítává layout engine. */
  rests: RestEvent[];
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
    version: 2,
    id: crypto.randomUUID(),
    title: 'Nová skladba',
    tempo: 96,
    layoutMode: 'two-staves',
    playbackSound: 'piano',
    measureCount: 4,
    events: [],
    rests: [],
    updatedAt: new Date().toISOString(),
  };
}

export function defaultMidiForVoice(voiceId: VoiceId): number {
  return { s: 72, a: 67, t: 60, b: 52 }[voiceId];
}

export function durationToTicks(duration: Duration): number {
  return {
    whole: 16,
    half: 8,
    quarter: 4,
    eighth: 2,
    sixteenth: 1,
  }[duration];
}

export function durationToBeats(duration: Duration): number {
  return durationToTicks(duration) / TICKS_PER_BEAT;
}

export function quantizationToTicks(value: RecordQuantization): number {
  return {
    quarter: 4,
    eighth: 2,
    sixteenth: 1,
  }[value];
}

export function advanceCursor(
  position: CursorPosition,
  duration: Duration = 'quarter',
): CursorPosition {
  return { tick: Math.max(0, position.tick + durationToTicks(duration)) };
}

export function tickToMeasure(tick: number): number {
  return Math.max(0, Math.floor(tick / TICKS_PER_MEASURE));
}

export function tickInMeasure(tick: number): number {
  const normalized = Math.max(0, tick);
  return normalized % TICKS_PER_MEASURE;
}

export function tickToBeatNumber(tick: number): number {
  return Math.floor(tickInMeasure(tick) / TICKS_PER_BEAT) + 1;
}

export function getCursorAfterLastVoiceEvent(
  events: NoteEvent[],
  voiceId: VoiceId,
  rests: RestEvent[] = [],
): CursorPosition {
  const lastNoteTick = events
    .filter((event) => event.voiceId === voiceId)
    .reduce(
      (maximum, event) => Math.max(
        maximum,
        event.startTick + event.durationTicks,
      ),
      0,
    );

  const lastRestTick = rests
    .filter((rest) => rest.voiceId === voiceId)
    .reduce(
      (maximum, rest) => Math.max(
        maximum,
        rest.startTick + rest.durationTicks,
      ),
      0,
    );

  return { tick: Math.max(lastNoteTick, lastRestTick) };
}

export function measureCountRequiredForTick(tick: number): number {
  return Math.max(1, Math.floor(Math.max(0, tick) / TICKS_PER_MEASURE) + 1);
}

export function midiToName(midi: number): string {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H'];
  const normalized = Math.max(0, Math.min(127, Math.round(midi)));
  const octave = Math.floor(normalized / 12) - 1;

  return `${names[normalized % 12]}${octave}`;
}
