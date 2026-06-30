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
  VOICES,
  tickInMeasure,
  tickToMeasure,
} from '../../domain/score';
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

const SYSTEM_MEASURES = 4;
const MEASURE_WIDTH = 145;
const STAFF_CONTENT_LEFT = 42;
const NOTE_LEFT_PADDING = 18;
const WRITABLE_MEASURE_WIDTH = MEASURE_WIDTH - NOTE_LEFT_PADDING * 2;

/**
 * Jedna nota připravená pro vykreslení v konkrétním notovém řádku.
 * `left` a `top` jsou už souřadnice v rámci osnovy, takže se z nich
 * stejně počítají jak hlavičky, tak nožičky a trámce.
 */
type StemDirection = 'up' | 'down';

interface PositionedNote {
  event: NoteEvent;
  voiceId: VoiceId;
  left: number;
  top: number;
  direction: StemDirection;
}

interface BeamAttachment {
  /** Pozice začátku nožičky relativně k tlačítku s notou. */
  stemTop: number;
  /** Výška nožičky, aby skutečně dosáhla až k trámci. */
  stemHeight: number;
}

interface BeamSegment {
  id: string;
  left: number;
  top: number;
  width: number;
  level: 1 | 2;
  direction: StemDirection;
}

interface BeamLayout {
  attachments: Map<string, BeamAttachment>;
  segments: BeamSegment[];
}

/**
 * Renderer pracuje s jemnou tickovou časovou osou.
 * Jeden systém má čtyři takty; stránky skládají systémy pod sebe jako A4.
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

        /**
         * V režimu dvou osnov zde mohou být dva hlasy. Trámce se ale
         * počítají pro každý hlas zvlášť, nikdy se tedy nespojí soprán s altem.
         */
        const notes = getPositionedNotes(
          project.events,
          voiceIds,
          startTick,
          endTick,
        );
        const beamLayout = createBeamLayout(notes);

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

            <BeamLayer segments={beamLayout.segments} />

            {notes.map((note) => (
              <NoteGlyph
                key={note.event.id}
                event={note.event}
                voiceId={note.voiceId}
                left={note.left}
                top={note.top}
                beam={beamLayout.attachments.get(note.event.id)}
                selected={note.event.id === selectedEventId}
                playing={note.event.id === playingEventId}
                activeVoice={note.voiceId === activeVoice}
                onClick={() => onSelectEvent(note.event)}
              />
            ))}

            {cursorIsInThisSystem && (
              <div
                className="score-cursor"
                style={{ left: getTickLeft(cursor.tick - startTick) }}
                aria-label={`Kurzor: takt ${tickToMeasure(cursor.tick) + 1}, doba ${Math.floor(tickInMeasure(cursor.tick) / TICKS_PER_BEAT) + 1}`}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}

function getPositionedNotes(
  events: NoteEvent[],
  voiceIds: VoiceId[],
  startTick: number,
  endTick: number,
): PositionedNote[] {
  return voiceIds.flatMap((voiceId) => (
    events
      .filter((event) => (
        event.voiceId === voiceId
        && event.startTick >= startTick
        && event.startTick < endTick
      ))
      .map((event) => ({
        event,
        voiceId,
        left: getTickLeft(event.startTick - startTick),
        top: pitchToTop(event.midi, voiceId),
        direction: stemDirectionForVoice(voiceId),
      }))
  ));
}

/**
 * Vytváří notové trámce po jednotlivých dobách taktu.
 *
 * - osminy mají jeden trámec;
 * - šestnáctiny mají vedle hlavního ještě druhý trámec;
 * - smíšené skupiny (např. 16 + 16 + 8) mají hlavní trámec přes všechny
 *   noty a druhý jen nad dvojicí šestnáctin;
 * - jednotlivá osmina/šestnáctina bez souseda nedostane trámec, ale praporek.
 */
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

    /**
     * Jediná šestnáctina uvnitř už svázané skupiny (např. 16 + 8)
     * nedostává dva praporky. Správně má krátký druhý trámec – háček.
     */
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
  // Element noty má výšku 18 px a je posunutý translate(-50%, -50%).
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
  // Zohledňuje vnitřní pozici nožičky uvnitř 18px tlačítka noty.
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
  top,
  beam,
  selected,
  playing,
  activeVoice,
  onClick,
}: {
  event: NoteEvent;
  voiceId: VoiceId;
  left: number;
  top: number;
  beam: BeamAttachment | undefined;
  selected: boolean;
  playing: boolean;
  activeVoice: boolean;
  onClick: () => void;
}) {
  const down = voiceId === 'a' || voiceId === 'b';
  const openHead = event.durationTicks >= 8;
  const stemless = event.durationTicks >= 16;
  const flagCount = !beam && !stemless && event.durationTicks < 4
    ? (event.durationTicks <= 1 ? 2 : 1)
    : 0;

  const style = beam
    ? ({
      left,
      top,
      '--beam-stem-top': `${beam.stemTop}px`,
      '--beam-stem-height': `${beam.stemHeight}px`,
    } as CSSProperties)
    : { left, top };

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
      title={`MIDI ${event.midi}`}
    >
      <span className="note-head" />
      {!stemless && <span className="note-stem" />}
      {Array.from({ length: flagCount }, (_, index) => (
        <span className={`note-flag flag-${index + 1}`} key={index} />
      ))}
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

function stemDirectionForVoice(voiceId: VoiceId): StemDirection {
  return voiceId === 'a' || voiceId === 'b' ? 'down' : 'up';
}

function clefForVoice(voiceId: VoiceId): 'treble' | 'bass' {
  return VOICES.find((voice) => voice.id === voiceId)?.clef ?? 'treble';
}

function voiceName(voiceId: VoiceId): string {
  return VOICES.find((voice) => voice.id === voiceId)?.name ?? voiceId;
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

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}
