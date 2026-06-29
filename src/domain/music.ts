export type VoiceId = 'soprano' | 'alto' | 'tenor' | 'bass';
export type Clef = 'treble' | 'bass';
export type NoteLength = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';

export const TICKS_PER_QUARTER = 480;

export const lengthToTicks: Record<NoteLength, number> = {
  whole: TICKS_PER_QUARTER * 4,
  half: TICKS_PER_QUARTER * 2,
  quarter: TICKS_PER_QUARTER,
  eighth: TICKS_PER_QUARTER / 2,
  sixteenth: TICKS_PER_QUARTER / 4,
};

export type NoteEvent = {
  id: string;
  startTick: number;
  durationTicks: number;
  midi: number;
  isRest?: boolean;
};

export type Voice = {
  id: VoiceId;
  label: string;
  clef: Clef;
  muted: boolean;
  notes: NoteEvent[];
};

export type Score = {
  id: string;
  title: string;
  tempo: number;
  timeSignature: [number, number];
  voices: Record<VoiceId, Voice>;
};

export type ScoreLayout = 'four-staves' | 'choir-two-staves';

export const voiceOrder: VoiceId[] = ['soprano', 'alto', 'tenor', 'bass'];

export const makeInitialScore = (): Score => ({
  id: crypto.randomUUID(),
  title: 'Nová skladba',
  tempo: 92,
  timeSignature: [4, 4],
  voices: {
    soprano: { id: 'soprano', label: 'Soprán', clef: 'treble', muted: false, notes: [] },
    alto: { id: 'alto', label: 'Alt', clef: 'treble', muted: false, notes: [] },
    tenor: { id: 'tenor', label: 'Tenor', clef: 'treble', muted: false, notes: [] },
    bass: { id: 'bass', label: 'Bas', clef: 'bass', muted: false, notes: [] },
  },
});
