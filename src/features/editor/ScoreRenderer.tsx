import type { MouseEvent } from 'react';

import type {
  CursorPosition,
  LayoutMode,
  NoteEvent,
  ScoreProject,
  VoiceId,
} from '../../domain/score';
import { SLOTS_PER_MEASURE, VOICES } from '../../domain/score';

interface Props {
  project: ScoreProject;
  activeVoice: VoiceId;
  cursor: CursorPosition;
  selectedEventId: string | null;
  playingEventId: string | null;
  onSelectEvent: (event: NoteEvent) => void;
  onCursorChange: (position: CursorPosition) => void;
}

const SYSTEM_MEASURES = 4;
const MEASURE_WIDTH = 145;
const STAFF_CONTENT_LEFT = 42;
const NOTE_OFFSET_IN_MEASURE = 22;
const SLOT_STEP = 28;

export function ScoreRenderer({
  project,
  activeVoice,
  cursor,
  selectedEventId,
  playingEventId,
  onSelectEvent,
  onCursorChange,
}: Props) {
  const systems = Array.from(
    { length: Math.ceil(project.measureCount / SYSTEM_MEASURES) },
    (_, index) => index,
  );

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
            cursor={cursor}
            selectedEventId={selectedEventId}
            playingEventId={playingEventId}
            onSelectEvent={onSelectEvent}
            onCursorChange={onCursorChange}
          />
        ))}
      </div>
    </div>
  );
}

function ScoreSystem({
  project,
  startMeasure,
  activeVoice,
  cursor,
  selectedEventId,
  playingEventId,
  onSelectEvent,
  onCursorChange,
}: Props & { startMeasure: number }) {
  const rowVoiceGroups: VoiceId[][] = project.layoutMode === 'two-staves'
    ? [['s', 'a'], ['t', 'b']]
    : [['s'], ['a'], ['t'], ['b']];

  const measures = Array.from(
    {
      length: Math.min(
        SYSTEM_MEASURES,
        project.measureCount - startMeasure,
      ),
    },
    (_, index) => startMeasure + index,
  );

  return (
    <section className={`score-system ${project.layoutMode}`}>
      <div className="system-bracket" />
      <div className="system-connector" />

      {rowVoiceGroups.map((voiceIds, rowIndex) => {
        const isActiveStaff = voiceIds.includes(activeVoice);
        const isBassStaff = rowIndex >= Math.ceil(rowVoiceGroups.length / 2);
        const cursorIsInThisSystem =
          isActiveStaff
          && cursor.measure >= startMeasure
          && cursor.measure < startMeasure + measures.length;

        return (
          <div className="staff-row" key={voiceIds.join('-')}>
            <FiveLineStaff />

            <div className={`clef ${isBassStaff ? 'bass-clef' : ''}`}>
              {isBassStaff ? '𝄢' : '𝄞'}
            </div>

            {measures.map((measure, localIndex) => (
              <MeasureTarget
                key={measure}
                measure={measure}
                localIndex={localIndex}
                isActiveStaff={isActiveStaff}
                onCursorChange={onCursorChange}
              />
            ))}

            {voiceIds.flatMap((voiceId) => (
              project.events
                .filter((event) => (
                  event.voiceId === voiceId
                  && event.measure >= startMeasure
                  && event.measure < startMeasure + SYSTEM_MEASURES
                ))
                .map((event) => (
                  <NoteGlyph
                    key={event.id}
                    event={event}
                    voiceId={voiceId}
                    left={getSlotLeft(
                      event.measure - startMeasure,
                      event.slot,
                    )}
                    selected={event.id === selectedEventId}
                    playing={event.id === playingEventId}
                    activeVoice={voiceId === activeVoice}
                    onClick={() => onSelectEvent(event)}
                  />
                ))
            ))}

            {cursorIsInThisSystem && (
              <div
                className="score-cursor"
                style={{
                  left: getSlotLeft(
                    cursor.measure - startMeasure,
                    cursor.slot,
                  ),
                }}
                aria-label={`Kurzor: takt ${cursor.measure + 1}, pozice ${cursor.slot + 1}`}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}

function MeasureTarget({
  measure,
  localIndex,
  isActiveStaff,
  onCursorChange,
}: {
  measure: number;
  localIndex: number;
  isActiveStaff: boolean;
  onCursorChange: (position: CursorPosition) => void;
}) {
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!isActiveStaff) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const horizontalOffset = event.clientX - rect.left;
    const slotWidth = MEASURE_WIDTH / SLOTS_PER_MEASURE;
    const slot = Math.max(
      0,
      Math.min(
        SLOTS_PER_MEASURE - 1,
        Math.floor(horizontalOffset / slotWidth),
      ),
    );

    onCursorChange({ measure, slot });
  }

  return (
    <div
      className={`measure ${isActiveStaff ? 'cursor-target' : ''}`}
      style={{ left: STAFF_CONTENT_LEFT + localIndex * MEASURE_WIDTH }}
      onClick={isActiveStaff ? handleClick : undefined}
      title={isActiveStaff
        ? 'Kliknutím nastavíš místo dalšího zápisu.'
        : undefined}
    >
      <span className="measure-number">{measure + 1}</span>
    </div>
  );
}

function FiveLineStaff() {
  return (
    <div className="staff-lines" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
    </div>
  );
}

function NoteGlyph({
  event,
  voiceId,
  left,
  selected,
  playing,
  activeVoice,
  onClick,
}: {
  event: NoteEvent;
  voiceId: VoiceId;
  left: number;
  selected: boolean;
  playing: boolean;
  activeVoice: boolean;
  onClick: () => void;
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

function getSlotLeft(localMeasureIndex: number, slot: number): number {
  return (
    STAFF_CONTENT_LEFT
    + localMeasureIndex * MEASURE_WIDTH
    + NOTE_OFFSET_IN_MEASURE
    + slot * SLOT_STEP
  );
}

function pitchToTop(midi: number, voiceId: VoiceId): number {
  const bases: Record<VoiceId, number> = {
    s: 49,
    a: 50,
    t: 51,
    b: 51,
  };

  return bases[voiceId] - (midi - 60) * 2.1;
}
