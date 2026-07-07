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

/**
 * Výchozí délka systému. Sazba ji může podle hustoty not a textu zkrátit,
 * nikdy ji ale neprodlouží nad deset taktů.
 */
const DEFAULT_MEASURES_PER_SYSTEM = 10;

/** Šířka vnitřní plochy A4 stránky z app.css. */
const SYSTEM_WIDTH = 686;
const STAFF_CONTENT_LEFT = 46;
const MEASURE_AREA_WIDTH = SYSTEM_WIDTH - STAFF_CONTENT_LEFT;
const NOTE_LEFT_PADDING = 11;

/**
 * Přibližná použitelná výška A4 pod titulkem. Podle ní skládáme systémy na
 * skutečné stránky; systém s textem má větší výšku než systém bez textu.
 */
const PAGE_SYSTEMS_HEIGHT = 900;
const SYSTEM_GAP = 24;
const NORMAL_STAFF_HEIGHT = 56;
const LYRIC_STAFF_HEIGHT = 80;
const STAFF_GAP = 16;

type StemDirection = 'up' | 'down';

interface PositionedNote {
  event: NoteEvent;
  voiceId: VoiceId;
  left: number;
  top: number;
  direction: StemDirection;
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
  direction: StemDirection;
}

interface BeamLayout {
  attachments: Map<string, BeamAttachment>;
  segments: BeamSegment[];
}

interface SystemPlan {
  measures: number[];
  measureWidths: number[];
  rowHeights: number[];
  height: number;
}

/**
 * Renderer je stále jednoduchý a čitelný, ale už nepočítá s pevnými čtyřmi
 * takty na systém. Systémy skládá podle obsahu:
 *
 * - prázdné takty: typicky 10 za řádek;
 * - hustší rytmus: jednotlivé takty dostanou více místa;
 * - text: šířka taktů se zvětší tak, aby se slabiky zbytečně nepřekrývaly;
 * - při překročení šířky A4 systém přejde na nový řádek.
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
  const rowVoiceGroups = getRowVoiceGroups(
    project.layoutMode,
    viewMode,
    activeVoice,
  );

  const renderMeasureCount = getRenderedMeasureCount(project);
  const systemPlans = buildSystemPlans(
    project,
    renderMeasureCount,
    rowVoiceGroups,
  );
  const pages = paginateSystemPlans(systemPlans);

  return (
    <div className="score-pages">
      {pages.map((pagePlans, pageIndex) => (
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
            {pagePlans.map((plan) => (
              <ScoreSystem
                key={plan.measures[0]}
                project={project}
                viewMode={viewMode}
                activeVoice={activeVoice}
                cursor={cursor}
                selectedEventId={selectedEventId}
                playingEventId={playingEventId}
                rowVoiceGroups={rowVoiceGroups}
                plan={plan}
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
  activeVoice,
  cursor,
  selectedEventId,
  playingEventId,
  rowVoiceGroups,
  plan,
  onSelectEvent,
  onCursorChange,
}: Props & {
  rowVoiceGroups: VoiceId[][];
  plan: SystemPlan;
}) {
  const startMeasure = plan.measures[0];
  const endMeasureExclusive = plan.measures.at(-1)! + 1;
  const startTick = startMeasure * TICKS_PER_MEASURE;
  const endTick = endMeasureExclusive * TICKS_PER_MEASURE;
  const showBracket = rowVoiceGroups.length > 1;

  const systemStyle = {
    '--system-height': `${plan.height}px`,
    '--bracket-height': `${Math.max(42, plan.height - 22)}px`,
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

      {rowVoiceGroups.map((voiceIds, rowIndex) => {
        const isActiveStaff = voiceIds.includes(activeVoice);
        const staffVoice = voiceIds[0];
        const isBassStaff = clefForVoice(staffVoice) === 'bass';
        const cursorIsInThisSystem = isActiveStaff
          && cursor.tick >= startTick
          && cursor.tick < endTick;

        const notes = getPositionedNotes(
          project.events,
          voiceIds,
          startTick,
          endTick,
          plan.measureWidths,
        );
        const beamLayout = createBeamLayout(notes);
        const hasLyrics = notes.some((note) => Boolean(note.event.lyric?.trim()));
        const staffStyle = {
          '--staff-row-height': `${plan.rowHeights[rowIndex]}px`,
        } as CSSProperties;

        return (
          <div
            className={`staff-row ${hasLyrics ? 'has-lyrics' : ''}`}
            key={voiceIds.join('-')}
            style={staffStyle}
          >
            <FiveLineStaff />

            <div className={`clef ${isBassStaff ? 'bass-clef' : ''}`}>
              {isBassStaff ? '𝄢' : '𝄞'}
            </div>

            {viewMode === 'part' && (
              <span className="part-voice-label">{voiceName(staffVoice)}</span>
            )}

            {plan.measures.map((measure, localIndex) => (
              <MeasureTarget
                key={measure}
                measure={measure}
                localIndex={localIndex}
                measureWidth={plan.measureWidths[localIndex]}
                measureWidths={plan.measureWidths}
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
                style={{
                  left: getTickLeft(
                    cursor.tick - startTick,
                    plan.measureWidths,
                  ),
                }}
                aria-label={`Kurzor: takt ${tickToMeasure(cursor.tick) + 1}, doba ${Math.floor(tickInMeasure(cursor.tick) / TICKS_PER_BEAT) + 1}`}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}

function getRenderedMeasureCount(project: ScoreProject): number {
  const lastUsedMeasure = project.events.reduce(
    (last, event) => Math.max(last, tickToMeasure(event.startTick)),
    -1,
  );

  const meaningfulCount = Math.max(
    project.measureCount,
    lastUsedMeasure + 1,
    DEFAULT_MEASURES_PER_SYSTEM,
  );

  return Math.ceil(meaningfulCount / DEFAULT_MEASURES_PER_SYSTEM)
    * DEFAULT_MEASURES_PER_SYSTEM;
}

function buildSystemPlans(
  project: ScoreProject,
  renderMeasureCount: number,
  rowVoiceGroups: VoiceId[][],
): SystemPlan[] {
  const plans: SystemPlan[] = [];
  let currentMeasures: number[] = [];
  let currentMinimumWidths: number[] = [];
  let currentWidth = 0;

  const pushCurrent = () => {
    if (currentMeasures.length === 0) {
      return;
    }

    const measureWidths = justifyMeasureWidths(currentMinimumWidths);
    const rowHeights = getRowHeights(
      project,
      rowVoiceGroups,
      currentMeasures[0],
      currentMeasures.at(-1)! + 1,
    );

    plans.push({
      measures: currentMeasures,
      measureWidths,
      rowHeights,
      height: getSystemHeight(rowHeights),
    });

    currentMeasures = [];
    currentMinimumWidths = [];
    currentWidth = 0;
  };

  for (let measure = 0; measure < renderMeasureCount; measure += 1) {
    const minimumWidth = getMeasureMinimumWidth(
      project,
      measure,
      rowVoiceGroups,
    );
    const exceedsMeasureLimit = currentMeasures.length >= DEFAULT_MEASURES_PER_SYSTEM;
    const exceedsPageWidth = currentMeasures.length > 0
      && currentWidth + minimumWidth > MEASURE_AREA_WIDTH;

    if (exceedsMeasureLimit || exceedsPageWidth) {
      pushCurrent();
    }

    currentMeasures.push(measure);
    currentMinimumWidths.push(minimumWidth);
    currentWidth += minimumWidth;
  }

  pushCurrent();
  return plans;
}

/**
 * Základní aproximace profesionální sazby:
 *
 * - 10 prázdných taktů vyplní řádek rovnoměrně;
 * - hustší rytmus si vezme více místa;
 * - mezi slabikami textu hlídáme minimální odstup.
 *
 * Přesná typografická sazba jako v MuseScore je složitý optimalizační problém,
 * ale tento plán je dobře rozšiřitelný a už dává praktické rozestupy pro práci.
 */
function getMeasureMinimumWidth(
  project: ScoreProject,
  measure: number,
  rowVoiceGroups: VoiceId[][],
): number {
  const measureStart = measure * TICKS_PER_MEASURE;
  const measureEnd = measureStart + TICKS_PER_MEASURE;
  const events = project.events
    .filter((event) => (
      event.startTick >= measureStart && event.startTick < measureEnd
    ));

  let required = MEASURE_AREA_WIDTH / DEFAULT_MEASURES_PER_SYSTEM;
  const shortestDuration = events.reduce(
    (shortest, event) => Math.min(shortest, event.durationTicks),
    Number.POSITIVE_INFINITY,
  );

  if (events.length >= 4) {
    required = Math.max(required, 76);
  }

  if (events.length >= 6 || shortestDuration <= 1) {
    required = Math.max(required, 94);
  }

  if (events.length >= 8) {
    required = Math.max(required, 112);
  }

  for (const voiceIds of rowVoiceGroups) {
    for (const voiceId of voiceIds) {
      const lyricNotes = events
        .filter((event) => event.voiceId === voiceId && event.lyric?.trim())
        .sort((left, right) => left.startTick - right.startTick);

      required = Math.max(
        required,
        getLyricDrivenMeasureWidth(lyricNotes, measureStart),
      );
    }
  }

  // Jediný takt nesmí systém rozbít. Velmi dlouhé texty se zatím ponechají
  // jako přesah do sousedního prostoru; později sem lze přidat dělení slov.
  return Math.min(240, Math.ceil(required));
}

function getLyricDrivenMeasureWidth(
  notes: NoteEvent[],
  measureStart: number,
): number {
  if (notes.length < 2) {
    return 0;
  }

  let required = 0;

  for (let index = 1; index < notes.length; index += 1) {
    const previous = notes[index - 1];
    const current = notes[index];
    const tickDistance = current.startTick - previous.startTick;

    if (tickDistance <= 0) {
      continue;
    }

    const previousWidth = estimateLyricWidth(previous.lyric ?? '');
    const currentWidth = estimateLyricWidth(current.lyric ?? '');
    const desiredDistance = (previousWidth + currentWidth) / 2 + 7;

    required = Math.max(
      required,
      desiredDistance * TICKS_PER_MEASURE / tickDistance,
    );
  }

  // První a poslední slabika mohou mírně přesahovat taktovou čáru, ale u
  // delšího textu dáme taktu přirozené minimum.
  const longest = Math.max(
    ...notes.map((note) => estimateLyricWidth(note.lyric ?? '')),
  );
  const firstOffset = notes[0].startTick - measureStart;
  const lastOffset = notes.at(-1)!.startTick - measureStart;

  if (firstOffset > 0 && lastOffset < TICKS_PER_MEASURE) {
    required = Math.max(required, longest + 20);
  }

  return required;
}

function estimateLyricWidth(text: string): number {
  return Array.from(text).reduce((width, character) => {
    if (character === ' ') {
      return width + 4;
    }

    if ('.,:;!|'.includes(character)) {
      return width + 4;
    }

    if ('ilIíĺ'.includes(character)) {
      return width + 4.5;
    }

    if ('mwMW'.includes(character)) {
      return width + 10;
    }

    return width + 7.4;
  }, 2);
}

function justifyMeasureWidths(minimumWidths: number[]): number[] {
  const minimumTotal = minimumWidths.reduce((sum, width) => sum + width, 0);
  const freeSpace = Math.max(0, MEASURE_AREA_WIDTH - minimumTotal);
  const extraPerMeasure = freeSpace / minimumWidths.length;

  return minimumWidths.map((width) => width + extraPerMeasure);
}

function getRowHeights(
  project: ScoreProject,
  rowVoiceGroups: VoiceId[][],
  startMeasure: number,
  endMeasureExclusive: number,
): number[] {
  const startTick = startMeasure * TICKS_PER_MEASURE;
  const endTick = endMeasureExclusive * TICKS_PER_MEASURE;

  return rowVoiceGroups.map((voiceIds) => {
    const hasLyrics = project.events.some((event) => (
      voiceIds.includes(event.voiceId)
      && event.startTick >= startTick
      && event.startTick < endTick
      && Boolean(event.lyric?.trim())
    ));

    return hasLyrics ? LYRIC_STAFF_HEIGHT : NORMAL_STAFF_HEIGHT;
  });
}

function getSystemHeight(rowHeights: number[]): number {
  return rowHeights.reduce((sum, height) => sum + height, 0)
    + Math.max(0, rowHeights.length - 1) * STAFF_GAP;
}

function paginateSystemPlans(plans: SystemPlan[]): SystemPlan[][] {
  const pages: SystemPlan[][] = [];
  let currentPage: SystemPlan[] = [];
  let usedHeight = 0;

  for (const plan of plans) {
    const requiredHeight = plan.height
      + (currentPage.length > 0 ? SYSTEM_GAP : 0);

    if (currentPage.length > 0 && usedHeight + requiredHeight > PAGE_SYSTEMS_HEIGHT) {
      pages.push(currentPage);
      currentPage = [];
      usedHeight = 0;
    }

    currentPage.push(plan);
    usedHeight += plan.height
      + (currentPage.length > 1 ? SYSTEM_GAP : 0);
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}

function getPositionedNotes(
  events: NoteEvent[],
  voiceIds: VoiceId[],
  startTick: number,
  endTick: number,
  measureWidths: number[],
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
        left: getTickLeft(event.startTick - startTick, measureWidths),
        top: pitchToTop(event.midi, voiceId),
        direction: stemDirectionForVoice(voiceId),
      }))
  ));
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

function MeasureTarget({
  measure,
  localIndex,
  measureWidth,
  measureWidths,
  isActiveStaff,
  onCursorChange,
}: {
  measure: number;
  localIndex: number;
  measureWidth: number;
  measureWidths: number[];
  isActiveStaff: boolean;
  onCursorChange: (position: CursorPosition) => void;
}) {
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!isActiveStaff) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const padding = Math.min(NOTE_LEFT_PADDING, rect.width * 0.18);
    const horizontalOffset = event.clientX - rect.left;
    const normalized = Math.max(
      0,
      Math.min(1, (horizontalOffset - padding) / Math.max(1, rect.width - padding * 2)),
    );

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
      style={{
        left: getMeasureLeft(localIndex, measureWidths),
        width: measureWidth,
      }}
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

function getMeasureLeft(localMeasureIndex: number, measureWidths: number[]): number {
  return STAFF_CONTENT_LEFT
    + measureWidths
      .slice(0, localMeasureIndex)
      .reduce((sum, width) => sum + width, 0);
}

function getTickLeft(relativeTick: number, measureWidths: number[]): number {
  const localMeasureIndex = Math.floor(relativeTick / TICKS_PER_MEASURE);
  const tickOffset = relativeTick % TICKS_PER_MEASURE;
  const measureWidth = measureWidths[localMeasureIndex]
    ?? MEASURE_AREA_WIDTH / DEFAULT_MEASURES_PER_SYSTEM;
  const padding = Math.min(NOTE_LEFT_PADDING, measureWidth * 0.18);
  const writableWidth = Math.max(8, measureWidth - padding * 2);

  return getMeasureLeft(localMeasureIndex, measureWidths)
    + padding
    + (tickOffset / TICKS_PER_MEASURE) * writableWidth;
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
