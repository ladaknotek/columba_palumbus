import type { InputMode } from '../../domain/score';

const STORAGE_KEY = 'columba-palumbus/input-settings/v1';

export interface InputSettings {
  /** MIDI tón prvního B-griff klávesu q. */
  bGriffBaseMidi: number;
  /** Posledně použitý styl vstupu je uživatelské nastavení, ne vlastnost skladby. */
  inputMode: InputMode;
}

const DEFAULT_SETTINGS: InputSettings = {
  bGriffBaseMidi: 60,
  inputMode: 'letter',
};

export function loadInputSettings(): InputSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const candidate = JSON.parse(raw) as Partial<InputSettings>;
    const inputMode = candidate.inputMode === 'bgriff' ? 'bgriff' : 'letter';
    const base = Number(candidate.bGriffBaseMidi);

    return {
      inputMode,
      bGriffBaseMidi: Number.isFinite(base)
        ? Math.max(24, Math.min(96, Math.round(base)))
        : DEFAULT_SETTINGS.bGriffBaseMidi,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveInputSettings(settings: InputSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
