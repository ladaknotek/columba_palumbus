import type { InputMode } from '../../domain/score';

/**
 * Pořadí půltónů podle fyzické B-griff mapy na české QWERTZ klávesnici.
 * q → a → y → w → s … je chromatická řada nahoru.
 */
export const B_GRIFF_CHROMATIC_ORDER = [
  'q', 'a', 'y', 'w', 's', 'x', 'e', 'd', 'c', 'r',
  'f', 'v', 't', 'g', 'b', 'z', 'h', 'n', 'u', 'j',
  'm', 'i', 'k', ',', 'o', 'l', '.', 'p', 'ů', '-',
] as const;

/** Fyzické řady klávesnice pro klikací náhled. */
export const B_GRIFF_KEYBOARD_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ů'],
  ['y', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-'],
] as const;

const bGriffIndex = new Map<string, number>(
  B_GRIFF_CHROMATIC_ORDER.map((key, index) => [key, index]),
);

const letterMap: Readonly<Record<string, number>> = {
  c: 60,
  d: 62,
  e: 64,
  f: 65,
  g: 67,
  a: 69,
  h: 71,
};

export function normalizeKeyboardKey(key: string): string {
  return key.toLocaleLowerCase('cs-CZ');
}

export function midiForKeyboardKey(
  key: string,
  inputMode: InputMode,
  bGriffBaseMidi: number,
): number | null {
  const normalized = normalizeKeyboardKey(key);

  if (inputMode === 'letter') {
    return letterMap[normalized] ?? null;
  }

  const index = bGriffIndex.get(normalized);
  return index === undefined ? null : bGriffBaseMidi + index;
}

export function midiForBGriffKey(key: string, bGriffBaseMidi: number): number {
  const index = bGriffIndex.get(normalizeKeyboardKey(key));

  if (index === undefined) {
    throw new Error(`Neznámá B-griff klávesa: ${key}`);
  }

  return bGriffBaseMidi + index;
}
