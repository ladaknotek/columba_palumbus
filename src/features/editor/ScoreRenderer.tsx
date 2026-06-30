import type { LayoutMode, NoteEvent, ScoreProject, VoiceId } from '../../domain/score';
import { VOICES } from '../../domain/score';

interface Props {
  project: ScoreProject;
  activeVoice: VoiceId;
  selectedEventId: string | null;
  playingEventId: string | null;
  onSelectEvent: (event: NoteEvent) => void;
}

const SYSTEM_MEASURES = 4;
const MEASURE_WIDTH = 145;

export function ScoreRenderer({ project, activeVoice, selectedEventId, playingEventId, onSelectEvent }: Props) {
  const systems = Array.from({ length: Math.ceil(project.measureCount / SYSTEM_MEASURES) }, (_, index) => index);
  return (
    <div className="paper-page">
      <h1>{project.title}</h1>
      <p className="page-meta">SATB · {project.tempo} BPM · 4/4</p>
      <div className="score-systems">
        {systems.map((systemIndex) => (
          <ScoreSystem
            key={systemIndex}
            project={project}
            startMeasure={systemIndex * SYSTEM_MEASURES}
            activeVoice={activeVoice}
            selectedEventId={selectedEventId}
            playingEventId={playingEventId}
            onSelectEvent={onSelectEvent}
          />
        ))}
      </div>
    </div>
  );
}

function ScoreSystem({ project, startMeasure, activeVoice, selectedEventId, playingEventId, onSelectEvent }: Props & { startMeasure: number }) {
  const rowVoiceGroups: VoiceId[][] = project.layoutMode === 'two-staves' ? [['s', 'a'], ['t', 'b']] : [['s'], ['a'], ['t'], ['b']];
  const measures = Array.from({ length: Math.min(SYSTEM_MEASURES, project.measureCount - startMeasure) }, (_, index) => startMeasure + index);

  return (
    <section className={`score-system ${project.layoutMode}`}>
      <div className="system-bracket" />
      <div className="system-connector" />
      {rowVoiceGroups.map((voiceIds, rowIndex) => (
        <div className="staff-row" key={voiceIds.join('-')}>
          <FiveLineStaff />
          <div className={`clef ${rowIndex >= Math.ceil(rowVoiceGroups.length / 2) ? 'bass-clef' : ''}`}>
            {rowIndex >= Math.ceil(rowVoiceGroups.length / 2) ? '𝄢' : '𝄞'}
          </div>
          {measures.map((measure, localIndex) => (
            <div className="measure" style={{ left: 42 + localIndex * MEASURE_WIDTH }} key={measure}>
              <span className="measure-number">{measure + 1}</span>
            </div>
          ))}
          {voiceIds.flatMap((voiceId) => project.events.filter((event) => event.voiceId === voiceId && event.measure >= startMeasure && event.measure < startMeasure + SYSTEM_MEASURES)
            .map((event) => (
              <NoteGlyph
                key={event.id}
                event={event}
                voiceId={voiceId}
                left={42 + (event.measure - startMeasure) * MEASURE_WIDTH + 22 + event.slot * 28}
                selected={event.id === selectedEventId}
                playing={event.id === playingEventId}
                activeVoice={voiceId === activeVoice}
                onClick={() => onSelectEvent(event)}
              />
            )))}
        </div>
      ))}
    </section>
  );
}

function FiveLineStaff() {
  return <div className="staff-lines" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>;
}

function NoteGlyph({ event, voiceId, left, selected, playing, activeVoice, onClick }: {
  event: NoteEvent; voiceId: VoiceId; left: number; selected: boolean; playing: boolean; activeVoice: boolean; onClick: () => void;
}) {
  const down = voiceId === 'a' || voiceId === 'b';
  const top = pitchToTop(event.midi, voiceId);
  return (
    <button
      type="button"
      className={`note-glyph ${down ? 'stem-down' : 'stem-up'} ${selected ? 'selected' : ''} ${playing ? 'playing' : ''} ${activeVoice ? 'active-voice-note' : ''}`}
      style={{ left, top }}
      onClick={onClick}
      title={`MIDI ${event.midi}`}
    >
      <span className="note-head" />
      <span className="note-stem" />
      {event.lyric && <span className="lyric">{event.lyric}</span>}
    </button>
  );
}

function pitchToTop(midi: number, voiceId: VoiceId): number {
  const bases: Record<VoiceId, number> = { s: 49, a: 50, t: 51, b: 51 };
  return bases[voiceId] - (midi - 60) * 2.1;
}
