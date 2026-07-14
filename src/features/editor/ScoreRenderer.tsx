import type { CSSProperties, MouseEvent } from 'react';

import type {
  CursorPosition,
  NoteEvent,
  ScoreProject,
  ScoreViewMode,
  VoiceId,
} from '../../domain/score';
import {
  TICKS_PER_BEAT,
  TICKS_PER_MEASURE,
  tickInMeasure,
  tickToMeasure,
} from '../../domain/score';
import {
  STAFF_LINE_GAP,
  STAFF_LINE_TOP,
  voiceName,
} from './scoreGeometry';
import {
  buildScoreLayout,
  cursorFromMeasureClick,
  leftForCursorTick,
  type LyricLineLayout,
  type MeasureLayoutPlan,
  type PositionedNote,
  type SystemLayoutPlan,
} from './scoreLayoutEngine';
import './noteBeaming.css';

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

interface BeamAttachment {
  stemTop: number;
  stemHeight: number;
}

interface BeamSegment {
  id: string;
  left: number;
  top: number;
  width: number;
  level: 1 | 2;
  direction: 'up' | 'down';
}

interface BeamLayout {
  attachments: Map<string, BeamAttachment>;
  segments: BeamSegment[];
}

/**
 * ScoreRenderer už nepočítá horizontální sazbu not po kouskách.
 * Tu dělá scoreLayoutEngine.ts. Renderer pouze vykresluje hotový plán.
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
  const layout = buildScoreLayout(project, activeVoice, viewMode);

  return (
    <div className="score-pages">
      {layout.pages.map((page) => (
        <article className="paper-page" key={page.index}>
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
            {page.systems.map((system) => (
              <ScoreSystem
                key={system.id}
                project={project}
                viewMode={viewMode}
                activeVoice={activeVoice}
                cursor={cursor}
                selectedEventId={selectedEventId}
                playingEventId={playingEventId}
                system={system}
                onSelectEvent={onSelectEvent}
                onCursorChange={onCursorChange}
              />
            ))}
          </div>

          <footer className="page-number">Strana {page.index + 1}</footer>
        </article>
      ))}
    </div>
  );
}

function ScoreSystem({
  project,
  viewMode,
  activeVoice,
  cursor,
  selectedEventId,
  playingEventId,
  system,
  onSelectEvent,
  onCursorChange,
}: Props & {
  system: SystemLayoutPlan;
}) {
  const showBracket = system.rows.length > 1;
  const systemStyle = {
    '--system-height': `${system.height}px`,
    '--bracket-height': `${Math.max(42, system.height - 22)}px`,
  } as CSSProperties;

  return (
    <section
      className={[
        'score-system',
        project.layoutMode,
        viewMode === 'part' ? 'part-system' : '',
      ].filter(Boolean).join(' ')}
      style={systemStyle}
    >
      {showBracket && <div className="system-bracket" />}
      {showBracket && <div className="system-connector" />}

      {system.rows.map((row) => {
        const isActiveStaff = row.voiceIds.includes(activeVoice);
        const cursorIsInThisSystem = isActiveStaff
          && cursor.tick >= system.startTick
          && cursor.tick < system.endTick;
        const beamLayout = createBeamLayout(row.notes);
        const staffStyle = {
          '--staff-row-height': `${row.height}px`,
        } as CSSProperties;

        return (
          <div
            className={`staff-row ${row.lyrics.length > 0 ? 'has-lyrics' : ''}`}
            key={row.id}
            style={staffStyle}
          >
            <FiveLineStaff />

            <div className={`clef ${row.isBassStaff ? 'bass-clef' : ''}`}>
              {row.isBassStaff ? '𝄢' : '𝄞'}
              {row.isTenorStaff && <span className="tenor-octave">8</span>}
            </div>

            {viewMode === 'part' && (
              <span className="part-voice-label">{voiceName(row.staffVoice)}</span>
            )}

            {system.measures.map((measure) => (
              <MeasureTarget
                key={measure.measure}
                measure={measure}
                isActiveStaff={isActiveStaff}
                isSystemEnd={measure.localIndex === system.measures.length - 1}
                isFinalSystem={system.isFinalSystem}
                onCursorChange={onCursorChange}
              />
            ))}

            <BeamLayer segments={beamLayout.segments} />

            {row.notes.map((note) => (
              <NoteGlyph
                key={note.event.id}
                note={note}
                beam={beamLayout.attachments.get(note.event.id)}
                selected={note.event.id === selectedEventId}
                playing={note.event.id === playingEventId}
                activeVoice={note.voiceId === activeVoice}
                onClick={() => onSelectEvent(note.event)}
              />
            ))}

            <LyricLayer lines={row.lyrics} />

            {cursorIsInThisSystem && (
              <div
                className="score-cursor"
                style={{ left: leftForCursorTick(cursor.tick, system) }}
                aria-label={`Kurzor: takt ${tickToMeasure(cursor.tick) + 1}, doba ${Math.floor(tickInMeasure(cursor.tick) / TICKS_PER_BEAT) + 1}`}
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
  isActiveStaff,
  isSystemEnd,
  isFinalSystem,
  onCursorChange,
}: {
  measure: MeasureLayoutPlan;
  isActiveStaff: boolean;
  isSystemEnd: boolean;
  isFinalSystem: boolean;
  onCursorChange: (position: CursorPosition) => void;
}) {
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!isActiveStaff) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    onCursorChange(cursorFromMeasureClick(measure, localX));
  }

  return (
    <div
      className={[
        'measure',
        isActiveStaff ? 'cursor-target' : '',
        isSystemEnd ? 'system-end-measure' : '',
        isSystemEnd && isFinalSystem ? 'final-system-measure' : '',
      ].filter(Boolean).join(' ')}
      style={{
        left: measure.left,
        width: measure.width,
      }}
      onClick={isActiveStaff ? handleClick : undefined}
      title={isActiveStaff ? 'Kliknutím nastavíš místo dalšího zápisu.' : undefined}
    >
      <span className="measure-number">{measure.measure + 1}</span>
      {isSystemEnd && <span className="system-end-bar" aria-hidden="true" />}
    </div>
  );
}

function FiveLineStaff() {
  return (
    <div className="staff-lines" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          style={{ top: STAFF_LINE_TOP + index * STAFF_LINE_GAP }}
        />
      ))}
    </div>
  );
}

function NoteGlyph({
  note,
  beam,
  selected,
  playing,
  activeVoice,
  onClick,
}: {
  note: PositionedNote;
  beam: BeamAttachment | undefined;
  selected: boolean;
  playing: boolean;
  activeVoice: boolean;
  onClick: () => void;
}) {
  const down = note.direction === 'down';
  const openHead = note.event.durationTicks >= 8;
  const stemless = note.event.durationTicks >= 16;
  const flagCount = !beam && !stemless && note.event.durationTicks < 4
    ? (note.event.durationTicks <= 1 ? 2 : 1)
    : 0;

  const style = beam
    ? ({
      left: note.left,
      top: note.top,
      '--beam-stem-top': `${beam.stemTop}px`,
      '--beam-stem-height': `${beam.stemHeight}px`,
    } as CSSProperties)
    : { left: note.left, top: note.top };

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
        beam ? 'beamed' : '',
      ].filter(Boolean).join(' ')}
      style={style}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onClick();
      }}
      title={`MIDI ${note.event.midi}`}
    >
      {note.ledgerLines.map((lineTop) => (
        <span
          className="ledger-line"
          key={lineTop}
          style={{ top: lineTop - note.top + 9 }}
        />
      ))}
      {note.accidental && <span className="note-accidental">{note.accidental}</span>}
      <span className="note-head" />
      {!stemless && <span className="note-stem" />}
      {Array.from({ length: flagCount }, (_, index) => (
        <span className={`note-flag flag-${index + 1}`} key={index} />
      ))}
    </button>
  );
}

function LyricLayer({ lines }: { lines: LyricLineLayout[] }) {
  return (
    <div className="lyric-layer" aria-label="Text písně">
      {lines.map((line) => (
        <span
          className="lyric-syllable"
          key={line.id}
          style={{ left: line.left, top: line.top }}
        >
          {line.text}
          {line.hyphenLeft !== undefined && (
            <span className="lyric-hyphen" style={{ left: line.hyphenLeft - line.left }}>‐</span>
          )}
        </span>
      ))}
    </div>
  );
}

function createBeamLayout(notes: PositionedNote[]): BeamLayout {
  const attachments = new Map<string, BeamAttachment>();
  const segments: BeamSegment[] = [];

  for (const voiceId of ['s', 'a', 't', 'b'] as const) {
    const voiceNotes = notes
      .filter((note) => note.voiceId === voiceId)
      .sort((left, right) => left.event.startTick - right.event.startTick);

    const notesByMeasure = groupBy(
      voiceNotes,
      (note) => tickToMeasure(note.event.startTick),
    );

    for (const [measure, measureNotes] of notesByMeasure) {
      for (let beat = 0; beat < 4; beat += 1) {
        const beatStart = measure * TICKS_PER_MEASURE + beat * TICKS_PER_BEAT;
        const beatEnd = beatStart + TICKS_PER_BEAT;
        const beamable = measureNotes.filter((note) => (
          note.event.durationTicks <= 2
          && note.event.startTick >= beatStart
          && note.event.startTick < beatEnd
        ));

        for (const group of splitContiguousNotes(beamable)) {
          if (group.length < 2) {
            continue;
          }

          addPrimaryBeam(group, attachments, segments);
          addSecondarySixteenthBeams(group, segments);
        }
      }
    }
  }

  return { attachments, segments };
}

function addPrimaryBeam(
  notes: PositionedNote[],
  attachments: Map<string, BeamAttachment>,
  segments: BeamSegment[],
) {
  const direction = notes[0].direction;
  const beamTop = direction === 'up'
    ? Math.min(...notes.map((note) => note.top)) - 29
    : Math.max(...notes.map((note) => note.top)) + 30;
  const firstX = stemX(notes[0]);
  const lastX = stemX(notes.at(-1)!);

  segments.push({
    id: `primary:${notes.map((note) => note.event.id).join(':')}`,
    left: firstX,
    top: beamTop,
    width: Math.max(4, lastX - firstX + 2),
    level: 1,
    direction,
  });

  for (const note of notes) {
    attachments.set(note.event.id, stemToBeam(note, beamTop));
  }
}

function addSecondarySixteenthBeams(
  notes: PositionedNote[],
  segments: BeamSegment[],
) {
  const sixteenths = notes.filter((note) => note.event.durationTicks === 1);
  const direction = notes[0].direction;
  const primaryTop = direction === 'up'
    ? Math.min(...notes.map((note) => note.top)) - 29
    : Math.max(...notes.map((note) => note.top)) + 30;
  const secondTop = direction === 'up' ? primaryTop + 5 : primaryTop - 5;

  for (const group of splitContiguousNotes(sixteenths)) {
    if (group.length >= 2) {
      const firstX = stemX(group[0]);
      const lastX = stemX(group.at(-1)!);

      segments.push({
        id: `secondary:${group.map((note) => note.event.id).join(':')}`,
        left: firstX,
        top: secondTop,
        width: Math.max(4, lastX - firstX + 2),
        level: 2,
        direction,
      });
      continue;
    }

    const note = group[0];
    const noteIndex = notes.findIndex(
      (candidate) => candidate.event.id === note.event.id,
    );
    const next = notes[noteIndex + 1];
    const previous = notes[noteIndex - 1];
    const anchor = stemX(note);

    if (next) {
      const width = Math.max(
        5,
        Math.min(10, Math.abs(stemX(next) - anchor) + 1),
      );

      segments.push({
        id: `secondary-hook-right:${note.event.id}`,
        left: anchor,
        top: secondTop,
        width,
        level: 2,
        direction,
      });
    } else if (previous) {
      const width = Math.max(
        5,
        Math.min(10, Math.abs(anchor - stemX(previous)) + 1),
      );

      segments.push({
        id: `secondary-hook-left:${note.event.id}`,
        left: anchor - width,
        top: secondTop,
        width,
        level: 2,
        direction,
      });
    }
  }
}

function splitContiguousNotes(notes: PositionedNote[]): PositionedNote[][] {
  const ordered = [...notes].sort(
    (left, right) => left.event.startTick - right.event.startTick,
  );
  const result: PositionedNote[][] = [];
  let current: PositionedNote[] = [];
  let expectedStartTick: number | null = null;

  for (const note of ordered) {
    if (expectedStartTick === null || note.event.startTick === expectedStartTick) {
      current.push(note);
      expectedStartTick = note.event.startTick + note.event.durationTicks;
      continue;
    }

    if (current.length > 0) {
      result.push(current);
    }

    current = [note];
    expectedStartTick = note.event.startTick + note.event.durationTicks;
  }

  if (current.length > 0) {
    result.push(current);
  }

  return result;
}

function stemToBeam(note: PositionedNote, beamTop: number): BeamAttachment {
  const glyphPhysicalTop = note.top - 9;

  if (note.direction === 'up') {
    return {
      stemTop: beamTop - glyphPhysicalTop,
      stemHeight: Math.max(12, note.top + 2 - beamTop),
    };
  }

  return {
    stemTop: 8,
    stemHeight: Math.max(12, beamTop - (note.top - 1)),
  };
}

function stemX(note: PositionedNote): number {
  return note.left + (note.direction === 'up' ? 3 : -7);
}

function BeamLayer({ segments }: { segments: BeamSegment[] }) {
  return (
    <div className="beam-layer" aria-hidden="true">
      {segments.map((segment) => (
        <span
          className={`note-beam beam-level-${segment.level} beam-${segment.direction}`}
          key={segment.id}
          style={{
            left: segment.left,
            top: segment.top,
            width: segment.width,
          }}
        />
      ))}
    </div>
  );
}

function groupBy<T, K>(items: T[], keyForItem: (item: T) => K): Map<K, T[]> {
  const result = new Map<K, T[]>();

  for (const item of items) {
    const key = keyForItem(item);
    const group = result.get(key) ?? [];
    group.push(item);
    result.set(key, group);
  }

  return result;
}
