import type { MouseEvent } from 'react';

import type {
  CursorPosition,
  NoteEvent,
  ScoreProject,
  ScoreViewMode,
  VoiceId,
} from '../../domain/score';
import {
  TICKS_PER_MEASURE,
  VOICES,
  tickInMeasure,
  tickToMeasure,
} from '../../domain/score';

interface Props {
  project: ScoreProject;
  activeVoice: VoiceId;
  viewMode: ScoreViewMode;
  cursor: CursorPosition;
  selectedEventId: string | null;
  playingEventId: string | null;
  onSelectEvent: (event: NoteEvent) => void;
  onCursorChange: (position: CursorPosition) => void;
}

const SYSTEM_MEASURES = 4;
const MEASURE_WIDTH = 145;
const STAFF_CONTENT_LEFT = 42;
const NOTE_LEFT_PADDING = 18;
const WRITABLE_MEASURE_WIDTH = MEASURE_WIDTH - NOTE_LEFT_PADDING * 2;

/**
 * Renderer je stále jednoduchý, ale už pracuje s jemnou tickovou časovou osou.
 * Jeden systém má čtyři takty; stránky je jen skládají pod sebe jako A4.
 */
export function ScoreRenderer({
  project,
  activeVoice,
  viewMode,
  cursor,
  selectedEventId,
  playingEventId,
  onSelectEvent,
  onCursorChange,
}: Props) {
  const systemCount = Math.ceil(project.measureCount / SYSTEM_MEASURES);
  const systems = Array.from({ length: systemCount }, (_, index) => index);
  const systemsPerPage = getSystemsPerPage(project.layoutMode, viewMode);
  const pages = chunk(systems, systemsPerPage);

  return (
    <div className="score-pages">
      {pages.map((pageSystems, pageIndex) => (
        <article className="paper-page" key={pageIndex}>
          <header className="page-header">
            <h1>{project.title}</h1>
            <p className="page-meta">
              {viewMode === 'part'
                ? `${voiceName(activeVoice)} · samostatný hlas`
                : 'SATB · partitura'}
              {' · '}
              {project.tempo} BPM · 4/4
            </p>
          </header>

          <div className="score-systems">
            {pageSystems.map((systemIndex) => (
              <ScoreSystem
                key={systemIndex}
                project={project}
                viewMode={viewMode}
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

          <footer className="page-number">Strana {pageIndex + 1}</footer>
        </article>
      ))}
    </div>
  );
}

function ScoreSystem({
  project,
  viewMode,
  startMeasure,
  activeVoice,
  cursor,
  selectedEventId,
  playingEventId,
  onSelectEvent,
  onCursorChange,
}: Props & { startMeasure: number }) {
  const rowVoiceGroups = getRowVoiceGroups(
    project.layoutMode,
    viewMode,
    activeVoice,
  );

  const measures = Array.from(
    {
      length: Math.min(
        SYSTEM_MEASURES,
        project.measureCount - startMeasure,
      ),
    },
    (_, index) => startMeasure + index,
  );

  const startTick = startMeasure * TICKS_PER_MEASURE;
  const endTick = (startMeasure + measures.length) * TICKS_PER_MEASURE;
  const showBracket = rowVoiceGroups.length > 1;

  return (
    <section
      className={`score-system ${project.layoutMode} ${viewMode === 'part' ? 'part-system' : ''}`}
    >
      {showBracket && <div className="system-bracket" />}
      {showBracket && <div className="system-connector" />}

      {rowVoiceGroups.map((voiceIds) => {
        const isActiveStaff = voiceIds.includes(activeVoice);
        const staffVoice = voiceIds[0];
        const isBassStaff = clefForVoice(staffVoice) === 'bass';
        const cursorIsInThisSystem = isActiveStaff
          && cursor.tick >= startTick
          && cursor.tick < endTick;

        return (
          <div className="staff-row" key={voiceIds.join('-')}>
            <FiveLineStaff />

            <div className={`clef ${isBassStaff ? 'bass-clef' : ''}`}>
              {isBassStaff ? '𝄢' : '𝄞'}
            </div>

            {viewMode === 'part' && (
              <span className="part-voice-label">{voiceName(staffVoice)}</span>
            )}

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
                  && event.startTick >= startTick
                  && event.startTick < endTick
                ))
                .map((event) => (
                  <NoteGlyph
                    key={event.id}
                    event={event}
                    voiceId={voiceId}
                    left={getTickLeft(
                      event.startTick - startTick,
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
                style={{ left: getTickLeft(cursor.tick - startTick) }}
                aria-label={`Kurzor: takt ${tickToMeasure(cursor.tick) + 1}, doba ${Math.floor(tickInMeasure(cursor.tick) / 4) + 1}`}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}

function getRowVoiceGroups(
  layoutMode: ScoreProject['layoutMode'],
  viewMode: ScoreViewMode,
  activeVoice: VoiceId,
): VoiceId[][] {
  if (viewMode === 'part') {
    return [[activeVoice]];
  }

  return layoutMode === 'two-staves'
    ? [['s', 'a'], ['t', 'b']]
    : [['s'], ['a'], ['t'], ['b']];
}

function getSystemsPerPage(
  layoutMode: ScoreProject['layoutMode'],
  viewMode: ScoreViewMode,
): number {
  if (viewMode === 'part') {
    return 6;
  }

  return layoutMode === 'two-staves' ? 4 : 2;
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
    const normalized = Math.max(
      0,
      Math.min(
        1,
        (horizontalOffset - NOTE_LEFT_PADDING) / WRITABLE_MEASURE_WIDTH,
      ),
    );

    // Kliknutím lze umístit kurzor až na šestnáctinovou mřížku.
    const tickOffset = Math.max(
      0,
      Math.min(
        TICKS_PER_MEASURE - 1,
        Math.round(normalized * TICKS_PER_MEASURE),
      ),
    );

    onCursorChange({
      tick: measure * TICKS_PER_MEASURE + tickOffset,
    });
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
  const openHead = event.durationTicks >= 8;
  const stemless = event.durationTicks >= 16;

  return (
    <button
      type="button"
      className={[
        'note-glyph',
        down ? 'stem-down' : 'stem-up',
        selected ? 'selected' : '',
        playing ? 'playing' : '',
        activeVoice ? 'active-voice-note' : '',
        openHead ? 'open-head' : '',
        stemless ? 'stemless' : '',
      ].filter(Boolean).join(' ')}
      style={{ left, top }}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={`MIDI ${event.midi}`}
    >
      <span className="note-head" />
      {!stemless && <span className="note-stem" />}
      {event.lyric && <span className="lyric">{event.lyric}</span>}
    </button>
  );
}

function getTickLeft(relativeTick: number): number {
  const localMeasureIndex = Math.floor(relativeTick / TICKS_PER_MEASURE);
  const tickOffset = relativeTick % TICKS_PER_MEASURE;

  return STAFF_CONTENT_LEFT
    + localMeasureIndex * MEASURE_WIDTH
    + NOTE_LEFT_PADDING
    + (tickOffset / TICKS_PER_MEASURE) * WRITABLE_MEASURE_WIDTH;
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

function clefForVoice(voiceId: VoiceId): 'treble' | 'bass' {
  return VOICES.find((voice) => voice.id === voiceId)?.clef ?? 'treble';
}

function voiceName(voiceId: VoiceId): string {
  return VOICES.find((voice) => voice.id === voiceId)?.name ?? voiceId;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}
