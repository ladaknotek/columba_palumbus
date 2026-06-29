/**
 * Tohle je trvalé nastavení konkrétního uživatele / ansámblu.
 * Editor nemusí mít rychlý přepínač B/C griffu.
 */
export type AccordionSystem = 'b-griff' | 'c-griff';

export type AccordionProfile = {
  system: AccordionSystem;
  keyboardToMidi: Record<string, number>;
};

// Výchozí demonstrativní B-griff mapa. Je v samostatném modulu, aby se později
// dala nahradit přesným uživatelským rozložením, rozsahy a posuny oktáv.
export const defaultBGriffProfile: AccordionProfile = {
  system: 'b-griff',
  keyboardToMidi: {
    q: 60, w: 62, e: 64, r: 65, t: 67, y: 69, u: 71, i: 72,
    a: 61, s: 63, d: 66, f: 68, g: 70, h: 73, j: 74, k: 76,
    z: 59, x: 58, c: 57, v: 56, b: 55, n: 54, m: 53,
  },
};
