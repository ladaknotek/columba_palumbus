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
  tickToMeasure,
} from '../../domain/score';
import {
  DEFAULT_MEASURES_PER_SYSTEM,
  MEASURE_AREA_WIDTH,
  MIN_COLUMN_GAP,
  NORMAL_STAFF_HEIGHT,
  NOTE_LEFT_PADDING,
  NOTE_RIGHT_PADDING,
  PAGE_SYSTEMS_HEIGHT,
  STAFF_BOTTOM_PADDING,
  STAFF_CONTENT_LEFT,
  STAFF_GAP,
  SYSTEM_GAP,
  accidentalForMidi,
  clefForVoice,
  getRowVoiceGroups,
  ledgerLineTopsForNote,
  noteLowerVisualBound,
  pitchToTop,
  stemDirectionForVoice,
  type StemDirection,
  LYRIC_LINE_HEIGHT,
} from './scoreGeometry';
import {
  estimateLyricWidth,
  getEventLyricSyllables,
  getNoteVisualExtents,
  type LyricSyllableLayout,
} from './noteMetrics';

export interface ScoreLayoutPlan {
  rowVoiceGroups: VoiceId[][];
  renderMeasureCount: number;
  pages: PageLayoutPlan[];
}

export interface PageLayoutPlan {
  index: number;
  systems: SystemLayoutPlan[];
}

export interface SystemLayoutPlan {
  id: string;
  measures: MeasureLayoutPlan[];
  rows: StaffRowLayoutPlan[];
  startTick: number;
  endTick: number;
  height: number;
  isFinalSystem: boolean;
}

export interface MeasureLayoutPlan {
  measure: number;
  localIndex: number;
  left: number;
  width: number;
  columns: TickColumnLayout[];
}

export interface TickColumnLayout {
  tickOffset: number;
  intrinsicLeft: number;
  left: number;
  leftExtent: number;
  rightExtent: number;
}

export interface StaffRowLayoutPlan {
  id: string;
  voiceIds: VoiceId[];
  staffVoice: VoiceId;
  isTenorStaff: boolean;
  isBassStaff: boolean;
  height: number;
  lyricTop: number | null;
  lyricLanes: LyricLaneLayout[];
  notes: PositionedNote[];
  lyrics: LyricLineLayout[];
}

export interface LyricLaneLayout {
  voiceId: VoiceId;
  verse: number;
  top: number;
}

export interface PositionedNote {
  event: NoteEvent;
  voiceId: VoiceId;
  left: number;
  top: number;
  direction: StemDirection;
  accidental?: '♯' | '♭';
  ledgerLines: number[];
}

export interface LyricLineLayout {
  id: string;
  event: NoteEvent;
  voiceId: VoiceId;
  verse: number;
  text: string;
  left: number;
  top: number;
  hyphenLeft?: number;
}

interface MeasureDraft {
  measure: number;
  minimumWidth: number;
  columns: IntrinsicColumn[];
}

interface IntrinsicColumn {
  tickOffset: number;
  intrinsicLeft: number;
  leftExtent: number;
  rightExtent: number;
}

interface SystemDraft {
  measures: MeasureDraft[];
  minimumWidth: number;
}

export function buildScoreLayout(
  project: ScoreProject,
  activeVoice: VoiceId,
  viewMode: ScoreViewMode,
): ScoreLayoutPlan {
  const rowVoiceGroups = getRowVoiceGroups(
    project.layoutMode,
    viewMode,
    activeVoice,
  );

  const renderMeasureCount = getRenderedMeasureCount(project);
  const systemDrafts = buildSystemDrafts(
    project,
    renderMeasureCount,
    rowVoiceGroups,
  );
  const systems = systemDrafts.map((draft, index) => buildSystemPlan(
    project,
    draft,
    rowVoiceGroups,
    index,
    draft.measures.at(-1)?.measure === renderMeasureCount - 1,
  ));

  return {
    rowVoiceGroups,
    renderMeasureCount,
    pages: paginateSystemPlans(systems),
  };
}

export function leftForCursorTick(
  tick: number,
  system: SystemLayoutPlan,
): number {
  const relativeTick = Math.max(0, tick - system.startTick);
  const localMeasureIndex = Math.floor(relativeTick / TICKS_PER_MEASURE);
  const tickOffset = relativeTick % TICKS_PER_MEASURE;
  const measure = system.measures[localMeasureIndex];

  if (!measure) {
    return STAFF_CONTENT_LEFT;
  }

  return measure.left + leftWithinMeasure(measure, tickOffset);
}

export function cursorFromMeasureClick(
  measure: MeasureLayoutPlan,
  localX: number,
): CursorPosition {
  const candidates = Array.from({ length: TICKS_PER_MEASURE }, (_, tickOffset) => ({
    tickOffset,
    left: leftWithinMeasure(measure, tickOffset),
  }));

  const closest = candidates.reduce((best, candidate) => (
    Math.abs(candidate.left - localX) < Math.abs(best.left - localX)
      ? candidate
      : best
  ));

  return { tick: measure.measure * TICKS_PER_MEASURE + closest.tickOffset };
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

function buildSystemDrafts(
  project: ScoreProject,
  renderMeasureCount: number,
  rowVoiceGroups: VoiceId[][],
): SystemDraft[] {
  const drafts: SystemDraft[] = [];
  let currentMeasures: MeasureDraft[] = [];
  let currentWidth = 0;

  const pushCurrent = () => {
    if (currentMeasures.length === 0) {
      return;
    }

    drafts.push({
      measures: currentMeasures,
      minimumWidth: currentWidth,
    });

    currentMeasures = [];
    currentWidth = 0;
  };

  for (let measure = 0; measure < renderMeasureCount; measure += 1) {
    const draft = buildMeasureDraft(project, measure, rowVoiceGroups);
    const exceedsMeasureLimit = currentMeasures.length >= DEFAULT_MEASURES_PER_SYSTEM;
    const exceedsPageWidth = currentMeasures.length > 0
      && currentWidth + draft.minimumWidth > MEASURE_AREA_WIDTH;

    if (exceedsMeasureLimit || exceedsPageWidth) {
      pushCurrent();
    }

    currentMeasures.push(draft);
    currentWidth += draft.minimumWidth;
  }

  pushCurrent();
  return drafts;
}

function buildMeasureDraft(
  project: ScoreProject,
  measure: number,
  rowVoiceGroups: VoiceId[][],
): MeasureDraft {
  const measureStart = measure * TICKS_PER_MEASURE;
  const measureEnd = measureStart + TICKS_PER_MEASURE;
  const visibleVoiceIds = new Set(rowVoiceGroups.flat());
  const events = project.events
    .filter((event) => (
      visibleVoiceIds.has(event.voiceId)
      && event.startTick >= measureStart
      && event.startTick < measureEnd
    ));

  if (events.length === 0) {
    return {
      measure,
      minimumWidth: MEASURE_AREA_WIDTH / DEFAULT_MEASURES_PER_SYSTEM,
      columns: [],
    };
  }

  const grouped = groupBy(events, (event) => event.startTick - measureStart);
  const tickOffsets = [...grouped.keys()].sort((left, right) => left - right);
  const columns: IntrinsicColumn[] = [];
  let previous: IntrinsicColumn | null = null;

  for (const tickOffset of tickOffsets) {
    const eventsAtTick = grouped.get(tickOffset) ?? [];
    const extents = eventsAtTick.reduce(
      (maximum, event) => {
        const eventExtents = getNoteVisualExtents(event);
        return {
          left: Math.max(maximum.left, eventExtents.left),
          right: Math.max(maximum.right, eventExtents.right),
        };
      },
      { left: 8, right: 12 },
    );

    let intrinsicLeft = NOTE_LEFT_PADDING + extents.left;

    if (previous) {
      const proportionalMinimum = NOTE_LEFT_PADDING
        + (tickOffset / TICKS_PER_MEASURE) * 78;
      intrinsicLeft = Math.max(
        intrinsicLeft,
        proportionalMinimum,
        previous.intrinsicLeft
          + previous.rightExtent
          + extents.left
          + gapBetweenTicks(previous.tickOffset, tickOffset),
      );
    }

    const column: IntrinsicColumn = {
      tickOffset,
      intrinsicLeft,
      leftExtent: extents.left,
      rightExtent: extents.right,
    };

    columns.push(column);
    previous = column;
  }

  const last = columns.at(-1)!;
  const minimumWidth = Math.max(
    MEASURE_AREA_WIDTH / DEFAULT_MEASURES_PER_SYSTEM,
    last.intrinsicLeft + last.rightExtent + NOTE_RIGHT_PADDING,
  );

  return {
    measure,
    minimumWidth: Math.min(360, Math.ceil(minimumWidth)),
    columns,
  };
}

function gapBetweenTicks(previousTick: number, currentTick: number): number {
  const tickDistance = Math.max(1, currentTick - previousTick);

  if (tickDistance <= 1) {
    return MIN_COLUMN_GAP + 3;
  }

  if (tickDistance <= 2) {
    return MIN_COLUMN_GAP + 5;
  }

  return MIN_COLUMN_GAP + 8;
}

function buildSystemPlan(
  project: ScoreProject,
  draft: SystemDraft,
  rowVoiceGroups: VoiceId[][],
  systemIndex: number,
  isFinalSystem: boolean,
): SystemLayoutPlan {
  const measureWidths = justifyMeasureWidths(draft.measures.map((measure) => measure.minimumWidth));
  let measureLeft = STAFF_CONTENT_LEFT;
  const measures = draft.measures.map((measureDraft, localIndex) => {
    const width = measureWidths[localIndex];
    const measure: MeasureLayoutPlan = {
      measure: measureDraft.measure,
      localIndex,
      left: measureLeft,
      width,
      columns: finalizeColumns(measureDraft, width),
    };

    measureLeft += width;
    return measure;
  });

  const startMeasure = measures[0].measure;
  const endMeasureExclusive = measures.at(-1)!.measure + 1;
  const startTick = startMeasure * TICKS_PER_MEASURE;
  const endTick = endMeasureExclusive * TICKS_PER_MEASURE;

  const rows = rowVoiceGroups.map((voiceIds) => buildStaffRowPlan(
    project,
    voiceIds,
    startTick,
    endTick,
    measures,
  ));

  const height = rows.reduce((sum, row) => sum + row.height, 0)
    + Math.max(0, rows.length - 1) * STAFF_GAP;

  return {
    id: `system:${systemIndex}:${startMeasure}`,
    measures,
    rows,
    startTick,
    endTick,
    height,
    isFinalSystem,
  };
}

function finalizeColumns(
  draft: MeasureDraft,
  finalWidth: number,
): TickColumnLayout[] {
  if (draft.columns.length === 0) {
    return [];
  }

  const extra = Math.max(0, finalWidth - draft.minimumWidth);

  return draft.columns.map((column) => ({
    ...column,
    left: column.intrinsicLeft + extra * (column.tickOffset / TICKS_PER_MEASURE),
  }));
}

function justifyMeasureWidths(minimumWidths: number[]): number[] {
  const minimumTotal = minimumWidths.reduce((sum, width) => sum + width, 0);
  const freeSpace = Math.max(0, MEASURE_AREA_WIDTH - minimumTotal);
  const extraPerMeasure = freeSpace / minimumWidths.length;

  return minimumWidths.map((width) => width + extraPerMeasure);
}

function buildStaffRowPlan(
  project: ScoreProject,
  voiceIds: VoiceId[],
  startTick: number,
  endTick: number,
  measures: MeasureLayoutPlan[],
): StaffRowLayoutPlan {
  const staffVoice = voiceIds[0];
  const notes = voiceIds.flatMap((voiceId) => getPositionedNotesForVoice(
    project.events,
    voiceId,
    startTick,
    endTick,
    measures,
  ));

  const lyricLanes = getLyricLanes(notes, voiceIds);
  const contentBottom = notes.reduce(
    (maximum, note) => Math.max(
      maximum,
      noteLowerVisualBound(
        note.top,
        note.direction,
        note.event.durationTicks,
        note.ledgerLines,
      ),
    ),
    41,
  );
  const lyricTop = lyricLanes.length > 0
    ? Math.max(55, contentBottom + 16)
    : null;

  const lanesWithTop = lyricLanes.map((lane, index) => ({
    ...lane,
    top: (lyricTop ?? 0) + index * LYRIC_LINE_HEIGHT,
  }));

  const lyrics = lyricTop === null
    ? []
    : getLyricLines(notes, lanesWithTop);

  const height = lyricTop === null
    ? Math.max(NORMAL_STAFF_HEIGHT, contentBottom + STAFF_BOTTOM_PADDING)
    : lyricTop + lanesWithTop.length * LYRIC_LINE_HEIGHT + STAFF_BOTTOM_PADDING;

  return {
    id: voiceIds.join('-'),
    voiceIds,
    staffVoice,
    isTenorStaff: staffVoice === 't',
    isBassStaff: clefForVoice(staffVoice) === 'bass' && staffVoice !== 't',
    height,
    lyricTop,
    lyricLanes: lanesWithTop,
    notes,
    lyrics,
  };
}

function getPositionedNotesForVoice(
  events: NoteEvent[],
  voiceId: VoiceId,
  startTick: number,
  endTick: number,
  measures: MeasureLayoutPlan[],
): PositionedNote[] {
  return events
    .filter((event) => (
      event.voiceId === voiceId
      && event.startTick >= startTick
      && event.startTick < endTick
    ))
    .sort((left, right) => left.startTick - right.startTick)
    .map((event) => {
      const top = pitchToTop(event.midi, voiceId);

      return {
        event,
        voiceId,
        left: leftForEvent(event, startTick, measures),
        top,
        direction: stemDirectionForVoice(voiceId),
        accidental: accidentalForMidi(event.midi),
        ledgerLines: ledgerLineTopsForNote(top),
      };
    });
}

function leftForEvent(
  event: NoteEvent,
  systemStartTick: number,
  measures: MeasureLayoutPlan[],
): number {
  const relativeTick = event.startTick - systemStartTick;
  const localMeasureIndex = Math.floor(relativeTick / TICKS_PER_MEASURE);
  const tickOffset = relativeTick % TICKS_PER_MEASURE;
  const measure = measures[localMeasureIndex];

  if (!measure) {
    return STAFF_CONTENT_LEFT;
  }

  return measure.left + leftWithinMeasure(measure, tickOffset);
}

function leftWithinMeasure(
  measure: MeasureLayoutPlan,
  tickOffset: number,
): number {
  const exactColumn = measure.columns.find((column) => column.tickOffset === tickOffset);

  if (exactColumn) {
    return exactColumn.left;
  }

  const before = [...measure.columns]
    .filter((column) => column.tickOffset < tickOffset)
    .sort((left, right) => right.tickOffset - left.tickOffset)
    .at(0);
  const after = [...measure.columns]
    .filter((column) => column.tickOffset > tickOffset)
    .sort((left, right) => left.tickOffset - right.tickOffset)
    .at(0);

  if (before && after) {
    const ratio = (tickOffset - before.tickOffset) / (after.tickOffset - before.tickOffset);
    return before.left + (after.left - before.left) * ratio;
  }

  const padding = Math.min(NOTE_LEFT_PADDING, measure.width * 0.18);
  const writableWidth = Math.max(8, measure.width - padding * 2);
  return padding + (tickOffset / TICKS_PER_MEASURE) * writableWidth;
}

function getLyricLanes(
  notes: PositionedNote[],
  voiceIds: VoiceId[],
): LyricLaneLayout[] {
  return voiceIds.flatMap((voiceId) => {
    const verses = new Set<number>();

    for (const note of notes) {
      if (note.voiceId !== voiceId) {
        continue;
      }

      for (const lyric of getEventLyricSyllables(note.event)) {
        verses.add(lyric.verse);
      }
    }

    return [...verses]
      .sort((left, right) => left - right)
      .map((verse) => ({ voiceId, verse, top: 0 }));
  });
}

function getLyricLines(
  notes: PositionedNote[],
  lanes: LyricLaneLayout[],
): LyricLineLayout[] {
  const lines: LyricLineLayout[] = [];

  for (const lane of lanes) {
    const laneNotes = notes
      .filter((note) => note.voiceId === lane.voiceId)
      .map((note) => ({
        note,
        lyric: getEventLyricSyllables(note.event)
          .find((candidate) => candidate.verse === lane.verse),
      }))
      .filter((item): item is { note: PositionedNote; lyric: LyricSyllableLayout } => Boolean(item.lyric))
      .sort((left, right) => left.note.event.startTick - right.note.event.startTick);

    for (let index = 0; index < laneNotes.length; index += 1) {
      const current = laneNotes[index];
      const next = laneNotes[index + 1];
      const hasHyphen = current.lyric.connector === 'hyphen' && next;

      lines.push({
        id: `${current.note.event.id}:verse:${lane.verse}`,
        event: current.note.event,
        voiceId: current.note.voiceId,
        verse: lane.verse,
        text: current.lyric.text,
        left: current.note.left,
        top: lane.top,
        hyphenLeft: hasHyphen
          ? current.note.left
            + estimateLyricWidth(current.lyric.text) / 2
            + Math.max(
              5,
              (
                next.note.left
                - current.note.left
                - estimateLyricWidth(current.lyric.text) / 2
                - estimateLyricWidth(next.lyric.text) / 2
              ) / 2,
            )
          : undefined,
      });
    }
  }

  return lines;
}

function paginateSystemPlans(systems: SystemLayoutPlan[]): PageLayoutPlan[] {
  const pages: PageLayoutPlan[] = [];
  let currentSystems: SystemLayoutPlan[] = [];
  let usedHeight = 0;

  for (const system of systems) {
    const requiredHeight = system.height
      + (currentSystems.length > 0 ? SYSTEM_GAP : 0);

    if (currentSystems.length > 0 && usedHeight + requiredHeight > PAGE_SYSTEMS_HEIGHT) {
      pages.push({ index: pages.length, systems: currentSystems });
      currentSystems = [];
      usedHeight = 0;
    }

    currentSystems.push(system);
    usedHeight += system.height
      + (currentSystems.length > 1 ? SYSTEM_GAP : 0);
  }

  if (currentSystems.length > 0) {
    pages.push({ index: pages.length, systems: currentSystems });
  }

  return pages;
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
