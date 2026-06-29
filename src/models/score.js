export const VOICES = [
  { id: 'soprano', name: 'Soprán', clef: 'treble', color: '#ab4b58' },
  { id: 'alto', name: 'Alt', clef: 'treble', color: '#956540' },
  { id: 'tenor', name: 'Tenor', clef: 'treble', color: '#4277a8' },
  { id: 'bass', name: 'Bas', clef: 'bass', color: '#4d8b66' },
];

export const DURATIONS = [
  { id: 'whole', label: 'Celá', ticks: 16, symbol: '𝅝' },
  { id: 'half', label: 'Půlová', ticks: 8, symbol: '𝅗𝅥' },
  { id: 'quarter', label: 'Čtvrťová', ticks: 4, symbol: '♩' },
  { id: 'eighth', label: 'Osminová', ticks: 2, symbol: '♪' },
];

export const DEFAULT_SETTINGS = {
  staffLayout: 'four',
  notationInput: 'letter',
  griffSystem: 'b',
  activeVoiceId: 'soprano',
  selectedDurationId: 'quarter',
  accidental: 'natural',
  metronome: false,
};

const uid = () => crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function createEmptyScore(title = 'Nová skladba') {
  return {
    schemaVersion: 1,
    id: uid(),
    title,
    composer: '',
    updatedAt: new Date().toISOString(),
    tempo: 92,
    timeSignature: { beats: 4, beatUnit: 4 },
    key: 'C dur',
    measures: Array.from({ length: 4 }, (_, index) => ({ id: uid(), number: index + 1 })),
    voices: Object.fromEntries(VOICES.map(({ id }) => [id, { id, cursor: { measureIndex: 0, tick: 0 }, events: [] }])),
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function clone(value) { return structuredClone(value); }

export function durationById(id) { return DURATIONS.find((d) => d.id === id) ?? DURATIONS[2]; }

export function createNote({ voiceId, measureIndex, startTick, durationTicks, midi, lyric = '' }) {
  return { id: uid(), type: 'note', voiceId, measureIndex, startTick, durationTicks, midi, lyric, createdAt: Date.now() };
}

export function createRest({ voiceId, measureIndex, startTick, durationTicks }) {
  return { id: uid(), type: 'rest', voiceId, measureIndex, startTick, durationTicks, createdAt: Date.now() };
}

export function displayPitch(midi) {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'H'];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function appendMeasures(score, count = 4) {
  const firstNumber = score.measures.length + 1;
  for (let index = 0; index < count; index += 1) {
    score.measures.push({ id: uid(), number: firstNumber + index });
  }
}

export function moveCursor(score, voiceId, ticks) {
  const voice = score.voices[voiceId];
  const current = voice.cursor.measureIndex * 16 + voice.cursor.tick;
  const requested = current + ticks;

  if (requested < 0) {
    voice.cursor.measureIndex = 0;
    voice.cursor.tick = 0;
    return;
  }

  // Když zapisování dojde na konec, přidáme celý další notový systém
  // (4 takty). Editor tak přirozeně roste směrem dolů.
  while (requested >= score.measures.length * 16) {
    appendMeasures(score, 4);
  }

  voice.cursor.measureIndex = Math.floor(requested / 16);
  voice.cursor.tick = requested % 16;
}
