import type { ScoreProject, ScoreViewMode, VoiceId } from '../../domain/score';
import { VOICES } from '../../domain/score';

export type StemDirection = 'up' | 'down';

/**
 * Jediný zdroj pravdy pro geometrii notového systému.
 * CSS má tyto rozměry pouze vykreslovat, ne znovu počítat.
 */
export const DEFAULT_MEASURES_PER_SYSTEM = 9;
export const SYSTEM_WIDTH = 686;
export const STAFF_ROW_LEFT = 27;
export const STAFF_ROW_WIDTH = SYSTEM_WIDTH - STAFF_ROW_LEFT;
export const STAFF_CONTENT_LEFT = 46;
export const MEASURE_AREA_WIDTH = STAFF_ROW_WIDTH - STAFF_CONTENT_LEFT;

export const NOTE_LEFT_PADDING = 5;
export const NOTE_RIGHT_PADDING = 5;
export const MIN_COLUMN_GAP = 0;

export const PAGE_SYSTEMS_HEIGHT = 900;
export const SYSTEM_GAP = 24;
export const NORMAL_STAFF_HEIGHT = 56;
export const LYRIC_LINE_HEIGHT = 20;
export const STAFF_GAP = 16;
export const STAFF_BOTTOM_PADDING = 8;

export const STAFF_LINE_TOP = 0;
export const STAFF_LINE_GAP = 7.95;
export const STAFF_STEP = STAFF_LINE_GAP / 2;
export const STAFF_TOP = STAFF_LINE_TOP;
export const STAFF_BOTTOM = STAFF_LINE_TOP + STAFF_LINE_GAP * 4;

export const NOTE_TOP = 8.7;

export const TREBLE_C4_Y = NOTE_TOP + STAFF_LINE_GAP * 5;
export const BASS_C3_Y = NOTE_TOP + STAFF_LINE_GAP * 2.5;

export function getRowVoiceGroups(
  layoutMode: ScoreProject['layoutMode'],
  viewMode: ScoreViewMode,
  activeVoice: VoiceId,
): VoiceId[][] {
  if (viewMode === 'part') {
    return [[activeVoice]];
  }

  return layoutMode === 'two-staves'
    ? [['s', 'a'], ['t', 'b']]
    : [['s'], ['a'], ['t'], ['b']];
}

export function accidentalForMidi(midi: number): '♯' | '♭' | undefined {
  // Data zatím neobsahují tóninu ani enharmonické pojmenování.
  // Tento výchozí zápis používá v češtině přirozenou směs: cis/fis/gis a es/b.
  const pitchClass = ((midi % 12) + 12) % 12;
  return ({
    1: '♯',
    3: '♭',
    6: '♯',
    8: '♯',
    10: '♭',
  } as Partial<Record<number, '♯' | '♭'>>)[pitchClass];
}

export function diatonicStepForMidi(midi: number): number {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const letterStep = [0, 0, 1, 2, 2, 3, 3, 4, 4, 5, 6, 6][pitchClass];
  return octave * 7 + letterStep;
}

export function pitchToTop(midi: number, voiceId: VoiceId): number {
  const isBass = voiceId === 'b';
  const referenceMidi = isBass ? 48 : 60; // C3 pro basovou, C4 pro houslovou osnovu
  const referenceY = isBass ? BASS_C3_Y : TREBLE_C4_Y;
  const staffSteps = diatonicStepForMidi(midi) - diatonicStepForMidi(referenceMidi);
  return referenceY - staffSteps * STAFF_STEP;
}

export function ledgerLineTopsForNote(noteTop: number): number[] {
  const lines: number[] = [];

  for (let lineTop = STAFF_TOP - STAFF_LINE_GAP; lineTop >= noteTop - STAFF_STEP; lineTop -= STAFF_LINE_GAP) {
    lines.push(lineTop);
  }

  for (let lineTop = STAFF_BOTTOM + STAFF_LINE_GAP; lineTop <= noteTop + STAFF_STEP; lineTop += STAFF_LINE_GAP) {
    lines.push(lineTop);
  }

  return lines;
}

export function noteLowerVisualBound(
  noteTop: number,
  direction: StemDirection,
  durationTicks: number,
  ledgerLines: number[],
): number {
  const ledgerBottom = ledgerLines.length > 0
    ? Math.max(...ledgerLines) + STAFF_STEP
    : Number.NEGATIVE_INFINITY;

  const headBottom = noteTop + 10;
  const stemBottom = direction === 'down'
    ? noteTop + (durationTicks <= 1 ? 49 : durationTicks <= 2 ? 43 : 39)
    : noteTop + 10;

  return Math.max(STAFF_BOTTOM, headBottom, stemBottom, ledgerBottom);
}

export function stemDirectionForVoice(voiceId: VoiceId): StemDirection {
  return voiceId === 'a' || voiceId === 'b' ? 'down' : 'up';
}

export function clefForVoice(voiceId: VoiceId): 'treble' | 'bass' {
  return VOICES.find((voice) => voice.id === voiceId)?.clef ?? 'treble';
}

export function voiceName(voiceId: VoiceId): string {
  return VOICES.find((voice) => voice.id === voiceId)?.name ?? voiceId;
}
