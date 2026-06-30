import type { PointerEvent } from 'react';

import type { InputMode } from '../../domain/score';
import { midiToName } from '../../domain/score';
import {
  B_GRIFF_KEYBOARD_ROWS,
  midiForBGriffKey,
} from '../input/keyboardMaps';

interface InputPanelProps {
  inputMode: InputMode;
  bGriffBaseMidi: number;
  isLiveRecording: boolean;
  onInputModeChange: (mode: InputMode) => void;
  onBaseMidiChange: (midi: number) => void;
  onInsertStepNote: (midi: number) => void;
  onLiveNoteStart: (sourceId: string, midi: number) => void;
  onLiveNoteEnd: (sourceId: string) => void;
}

const LETTER_KEYS = [
  ['C', 60], ['D', 62], ['E', 64], ['F', 65],
  ['G', 67], ['A', 69], ['H', 71],
] as const;

/**
 * Klikací vstup funguje v obou stylech. V živém záznamu držení myši určuje
 * délku podobně jako držení fyzické klávesy.
 */
export function InputPanel({
  inputMode,
  bGriffBaseMidi,
  isLiveRecording,
  onInputModeChange,
  onBaseMidiChange,
  onInsertStepNote,
  onLiveNoteStart,
  onLiveNoteEnd,
}: InputPanelProps) {
  function attachPointerHandlers(sourceId: string, midi: number) {
    return {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);

        if (isLiveRecording) {
          onLiveNoteStart(sourceId, midi);
        } else {
          onInsertStepNote(midi);
        }
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        if (isLiveRecording) {
          onLiveNoteEnd(sourceId);
        }

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      },
      onPointerCancel: () => {
        if (isLiveRecording) {
          onLiveNoteEnd(sourceId);
        }
      },
    };
  }

  return (
    <section className="input-panel">
      <div className="panel-heading">Vstup not</div>

      <div className="input-mode-switch" aria-label="Styl klávesového vstupu">
        <button
          type="button"
          className={inputMode === 'letter' ? 'active' : ''}
          onClick={() => onInputModeChange('letter')}
        >
          C D E F G A H
        </button>
        <button
          type="button"
          className={inputMode === 'bgriff' ? 'active' : ''}
          onClick={() => onInputModeChange('bgriff')}
        >
          B-griff
        </button>
      </div>

      {inputMode === 'letter' ? (
        <>
          <p className="input-description">
            Písmena <strong>C D E F G A H</strong> zapisují přirozené tóny.
            Stejná tlačítka lze použít myší.
          </p>
          <div className="letter-keyboard">
            {LETTER_KEYS.map(([key, midi]) => (
              <button
                type="button"
                className="virtual-note-key"
                key={key}
                {...attachPointerHandlers(`mouse-letter-${key}`, midi)}
                title={`${key} = ${midiToName(midi)}`}
              >
                <strong>{key}</strong>
                <small>{midiToName(midi)}</small>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="bgriff-base-controls">
            <span>q = <strong>{midiToName(bGriffBaseMidi)}</strong></span>
            <button
              type="button"
              onClick={() => onBaseMidiChange(bGriffBaseMidi - 12)}
              title="Posunout celou B-griff mapu o oktávu dolů"
            >
              −12
            </button>
            <button
              type="button"
              onClick={() => onBaseMidiChange(bGriffBaseMidi - 1)}
              title="Posunout celou B-griff mapu o půltón dolů"
            >
              −1
            </button>
            <button
              type="button"
              onClick={() => onBaseMidiChange(bGriffBaseMidi + 1)}
              title="Posunout celou B-griff mapu o půltón nahoru"
            >
              +1
            </button>
            <button
              type="button"
              onClick={() => onBaseMidiChange(bGriffBaseMidi + 12)}
              title="Posunout celou B-griff mapu o oktávu nahoru"
            >
              +12
            </button>
          </div>

          <p className="input-description">
            Chromatická řada: q a y w s x e d c r f v t g b z h n u j m i k ,
            o l . p ů −. Polohu celé mapy si nastavuješ tlačítky nahoře.
          </p>

          <div className="bgriff-keyboard" aria-label="Virtuální B-griff klaviatura">
            {B_GRIFF_KEYBOARD_ROWS.map((row, rowIndex) => (
              <div className={`bgriff-row row-${rowIndex + 1}`} key={row.join('')}>
                {row.map((key) => {
                  const midi = midiForBGriffKey(key, bGriffBaseMidi);
                  return (
                    <button
                      type="button"
                      className="virtual-note-key"
                      key={key}
                      {...attachPointerHandlers(`mouse-bgriff-${key}`, midi)}
                      title={`${key} = ${midiToName(midi)}`}
                    >
                      <strong>{key}</strong>
                      <small>{midiToName(midi)}</small>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      {isLiveRecording && (
        <p className="recording-hint">
          Záznam běží: držení fyzické klávesy nebo tlačítka určí délku noty.
        </p>
      )}
    </section>
  );
}
