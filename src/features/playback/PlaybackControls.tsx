import type { SoundStyle } from '../../domain/score';

interface PlaybackControlsProps {
  soundStyle: SoundStyle;
  onSoundStyleChange: (soundStyle: SoundStyle) => void;
  onPlay: () => void;
  onStop: () => void;
}

/** Ovládání přehrávání záměrně držíme odděleně od App.tsx. */
export function PlaybackControls({
  soundStyle,
  onSoundStyleChange,
  onPlay,
  onStop,
}: PlaybackControlsProps) {
  return (
    <div className="playback-controls">
      <label className="sound-style-label">
        <span>Zvuk</span>
        <select
          className="sound-style-select"
          value={soundStyle}
          onChange={(event) =>
            onSoundStyleChange(event.target.value as SoundStyle)
          }
        >
          <option value="piano">Piano</option>
          <option value="vocal">Vokál</option>
        </select>
      </label>

      <button type="button" className="play-button" onClick={onPlay}>
        ▶ Přehrát
      </button>

      <button type="button" onClick={onStop}>
        ■ Stop
      </button>
    </div>
  );
}
