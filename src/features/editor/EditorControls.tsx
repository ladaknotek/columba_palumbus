import type { ReactNode } from 'react';

import type {
  Duration,
  EntryMode,
  InputMode,
  LayoutMode,
  RecordQuantization,
  ScoreViewMode,
  VoiceId,
} from '../../domain/score';
import { VOICES } from '../../domain/score';

interface VoicePanelProps {
  activeVoice: VoiceId;
  onVoiceChange: (voiceId: VoiceId) => void;
}

interface NotationToolbarProps {
  duration: Duration;
  layoutMode: LayoutMode;
  viewMode: ScoreViewMode;
  inputMode: InputMode;
  entryMode: EntryMode;
  quantization: RecordQuantization;
  metronomeRunning: boolean;
  isRecording: boolean;
  currentBeat: number | null;
  onDurationChange: (duration: Duration) => void;
  onLayoutChange: (layoutMode: LayoutMode) => void;
  onViewModeChange: (viewMode: ScoreViewMode) => void;
  onInputModeChange: (inputMode: InputMode) => void;
  onEntryModeChange: (entryMode: EntryMode) => void;
  onQuantizationChange: (quantization: RecordQuantization) => void;
  onToggleMetronome: () => void;
  onToggleRecording: () => void;
}

const DURATIONS: ReadonlyArray<{ id: Duration; label: string }> = [
  { id: 'whole', label: 'Celá' },
  { id: 'half', label: 'Půl' },
  { id: 'quarter', label: '¼' },
  { id: 'eighth', label: '⅛' },
  { id: 'sixteenth', label: '1/16' },
];

export function VoicePanel({ activeVoice, onVoiceChange }: VoicePanelProps) {
  return (
    <aside className="left-panel">
      <div className="panel-heading">Hlasy</div>

      {VOICES.map((voice) => (
        <button
          type="button"
          className={`voice-button ${activeVoice === voice.id ? 'active' : ''}`}
          key={voice.id}
          onClick={() => onVoiceChange(voice.id)}
        >
          <span className={`voice-dot ${voice.id}`} />
          {voice.name}
        </button>
      ))}

      <p className="panel-help">
        Výběr hlasu určuje, do kterého partu se zapisuje a který samostatný
        hlas se zobrazí v režimu Part.
      </p>
    </aside>
  );
}

export function NotationToolbar({
  duration,
  layoutMode,
  viewMode,
  inputMode,
  entryMode,
  quantization,
  metronomeRunning,
  isRecording,
  currentBeat,
  onDurationChange,
  onLayoutChange,
  onViewModeChange,
  onInputModeChange,
  onEntryModeChange,
  onQuantizationChange,
  onToggleMetronome,
  onToggleRecording,
}: NotationToolbarProps) {
  return (
    <div className="editor-toolbar notation-toolbar">
      <ToolbarGroup label="Pohled">
        <SegmentButton
          active={viewMode === 'score'}
          onClick={() => onViewModeChange('score')}
        >
          Partitura
        </SegmentButton>
        <SegmentButton
          active={viewMode === 'part'}
          onClick={() => onViewModeChange('part')}
        >
          Aktivní hlas
        </SegmentButton>
      </ToolbarGroup>

      {viewMode === 'score' && (
        <ToolbarGroup label="Osnovy">
          <SegmentButton
            active={layoutMode === 'two-staves'}
            onClick={() => onLayoutChange('two-staves')}
          >
            2 osnovy
          </SegmentButton>
          <SegmentButton
            active={layoutMode === 'four-staves'}
            onClick={() => onLayoutChange('four-staves')}
          >
            4 osnovy
          </SegmentButton>
        </ToolbarGroup>
      )}

      <ToolbarGroup label="Zápis">
        <SegmentButton
          active={inputMode === 'letter'}
          onClick={() => onInputModeChange('letter')}
        >
          C D E F G A H
        </SegmentButton>
        <SegmentButton
          active={inputMode === 'bgriff'}
          onClick={() => onInputModeChange('bgriff')}
        >
          B-griff
        </SegmentButton>
      </ToolbarGroup>

      <ToolbarGroup label="Režim">
        <SegmentButton
          active={entryMode === 'step'}
          onClick={() => onEntryModeChange('step')}
        >
          Krokový
        </SegmentButton>
        <SegmentButton
          active={entryMode === 'live'}
          onClick={() => onEntryModeChange('live')}
        >
          Živý
        </SegmentButton>
      </ToolbarGroup>

      {entryMode === 'step' ? (
        <ToolbarGroup label="Délka">
          {DURATIONS.map((item) => (
            <SegmentButton
              active={duration === item.id}
              key={item.id}
              onClick={() => onDurationChange(item.id)}
            >
              {item.label}
            </SegmentButton>
          ))}
        </ToolbarGroup>
      ) : (
        <>
          <ToolbarGroup label="Kvantizace">
            <SegmentButton
              active={quantization === 'quarter'}
              onClick={() => onQuantizationChange('quarter')}
            >
              ¼
            </SegmentButton>
            <SegmentButton
              active={quantization === 'eighth'}
              onClick={() => onQuantizationChange('eighth')}
            >
              ⅛
            </SegmentButton>
            <SegmentButton
              active={quantization === 'sixteenth'}
              onClick={() => onQuantizationChange('sixteenth')}
            >
              1/16
            </SegmentButton>
          </ToolbarGroup>

          <button
            type="button"
            className={metronomeRunning ? 'metronome-button active' : 'metronome-button'}
            onClick={onToggleMetronome}
            title="Zapnout nebo zastavit metronom"
          >
            ♪ Metronom{currentBeat ? ` ${currentBeat}` : ''}
          </button>

          <button
            type="button"
            className={isRecording ? 'record-button recording' : 'record-button'}
            onClick={onToggleRecording}
          >
            {isRecording ? '■ Ukončit záznam' : '● Záznam'}
          </button>
        </>
      )}

      <span className="toolbar-tip">
        {entryMode === 'live'
          ? 'Záznam: stisk začíná a puštění klávesy určuje délku noty.'
          : 'Kliknutím do aktivní osnovy nastavíš kurzor. Ctrl + kolečko: zoom.'}
      </span>
    </div>
  );
}

function ToolbarGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="toolbar-group">
      <span className="tool-label">{label}</span>
      <div className="button-group">{children}</div>
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? 'active' : ''}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
