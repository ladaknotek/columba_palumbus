import type { Duration, LayoutMode, VoiceId } from '../../domain/score';
import { VOICES } from '../../domain/score';

interface Props {
  activeVoice: VoiceId;
  duration: Duration;
  layoutMode: LayoutMode;
  onVoiceChange: (value: VoiceId) => void;
  onDurationChange: (value: Duration) => void;
  onLayoutChange: (value: LayoutMode) => void;
  onInsertNote: (midi: number) => void;
}

const DURATIONS: ReadonlyArray<{ id: Duration; label: string }> = [
  { id: 'whole', label: 'Celá' }, { id: 'half', label: 'Půl' }, { id: 'quarter', label: '¼' }, { id: 'eighth', label: '⅛' },
];

export function EditorControls({ activeVoice, duration, layoutMode, onVoiceChange, onDurationChange, onLayoutChange, onInsertNote }: Props) {
  return <>
    <aside className="left-panel">
      <div className="panel-heading">Hlasy</div>
      {VOICES.map((voice) => <button type="button" className={`voice-button ${activeVoice === voice.id ? 'active' : ''}`} key={voice.id} onClick={() => onVoiceChange(voice.id)}><span className={`voice-dot ${voice.id}`} />{voice.name}</button>)}
    </aside>
    <div className="editor-toolbar">
      <span className="tool-label">Délka</span>
      <div className="button-group">{DURATIONS.map((item) => <button type="button" key={item.id} className={duration === item.id ? 'active' : ''} onClick={() => onDurationChange(item.id)}>{item.label}</button>)}</div>
      <span className="tool-label">Zobrazení</span>
      <div className="button-group"><button type="button" className={layoutMode === 'two-staves' ? 'active' : ''} onClick={() => onLayoutChange('two-staves')}>2 osnovy</button><button type="button" className={layoutMode === 'four-staves' ? 'active' : ''} onClick={() => onLayoutChange('four-staves')}>4 osnovy</button></div>
      <span className="toolbar-tip">Zápis: C D E F G A H · Ctrl + kolečko: zoom</span>
    </div>
    <div className="griff-panel">
      <strong>B-griff vstup</strong>
      <div className="griff-buttons">{[
        ['Q', 60], ['W', 62], ['E', 64], ['R', 65], ['T', 67], ['Y', 69], ['U', 71],
        ['A', 72], ['S', 74], ['D', 76], ['F', 77], ['G', 79], ['H', 81], ['J', 83],
      ].map(([key, midi]) => <button type="button" key={String(key)} onClick={() => onInsertNote(Number(midi))}>{key}<small>{midi}</small></button>)}</div>
    </div>
  </>;
}
