// V1: praktická pravá melodická klaviatura. Mapování je izolované, aby šlo nahradit přesným osobním rozložením.
const B_GRIFF = {
  KeyQ: 60, KeyW: 62, KeyE: 64, KeyR: 65, KeyT: 67, KeyY: 69, KeyU: 71, KeyI: 72,
  KeyA: 61, KeyS: 63, KeyD: 65, KeyF: 66, KeyG: 68, KeyH: 70, KeyJ: 72, KeyK: 73,
  KeyZ: 62, KeyX: 64, KeyC: 66, KeyV: 67, KeyB: 69, KeyN: 71, KeyM: 73,
};
const LETTERS = { KeyC: 60, KeyD: 62, KeyE: 64, KeyF: 65, KeyG: 67, KeyA: 69, KeyH: 71 };
export function midiForKeyboard(code, inputMode) { return inputMode === 'griff' ? B_GRIFF[code] : LETTERS[code]; }
export function griffRows() {
  return [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ].map((row) => row.map((key) => ({ key, midi: B_GRIFF[`Key${key}`] })));
}
