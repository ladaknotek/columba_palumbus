import type { NoteEvent } from '../../domain/score';
import { accidentalForMidi } from './scoreGeometry';

export interface LyricSyllableLayout {
  verse: number;
  text: string;
  connector?: 'hyphen';
}

export interface NoteVisualExtents {
  left: number;
  right: number;
  lyricHalfWidth: number;
}

export function estimateLyricWidth(text: string): number {
  return Array.from(text).reduce((width, character) => {
    if (character === ' ') {
      return width + 4;
    }

    if ('.,:;!|'.includes(character)) {
      return width + 4;
    }

    if ('ilIíĺ'.includes(character)) {
      return width + 4.5;
    }

    if ('mwMW'.includes(character)) {
      return width + 10;
    }

    return width + 7.4;
  }, 2);
}

/**
 * Vrátí všechny textové slabiky dané noty.
 * Starší projekty mají jen event.lyric, nové mohou mít event.lyrics pro více slok.
 */
export function getEventLyricSyllables(event: NoteEvent): LyricSyllableLayout[] {
  if (Array.isArray(event.lyrics) && event.lyrics.length > 0) {
    return event.lyrics
      .filter((item) => item.text.trim())
      .map((item) => ({
        verse: Math.max(1, Math.round(item.verse)),
        text: item.text,
        connector: item.connector,
      }))
      .sort((left, right) => left.verse - right.verse);
  }

  if (!event.lyric?.trim()) {
    return [];
  }

  return [{
    verse: 1,
    text: event.lyric,
    connector: event.lyricConnector,
  }];
}

export function getLargestLyricHalfWidth(event: NoteEvent): number {
  return getEventLyricSyllables(event).reduce(
    (maximum, lyric) => Math.max(maximum, estimateLyricWidth(lyric.text) / 2),
    0,
  );
}

/**
 * Vizuální box noty pro horizontální sazbu.
 * Bez textu žádnou textovou rezervu nepřidáváme.
 * Pokud text existuje, rozšíří box jen tolik, kolik skutečně potřebuje.
 */
export function getNoteVisualExtents(event: NoteEvent): NoteVisualExtents {
  const accidental = accidentalForMidi(event.midi);
  const accidentalLeft = accidental ? 18 : 0;

  const headLeft = 8;
  const headRight = event.durationTicks <= 1 ? 16 : event.durationTicks <= 2 ? 14 : 12;
  const lyricHalfWidth = getLargestLyricHalfWidth(event);

  return {
    left: Math.max(accidentalLeft + headLeft, lyricHalfWidth),
    right: Math.max(headRight, lyricHalfWidth),
    lyricHalfWidth,
  };
}
