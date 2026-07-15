import type {
  CursorPosition,
  NoteEvent,
  RestEvent,
  ScoreProject,
  ScoreViewMode,
  VoiceId,
} from '../../domain/score';
import {
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
  STAFF_LINE_GAP,
  STAFF_LINE_TOP,
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
  getRestVisualExtents,
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
  rests: PositionedRest[];
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
  leftExtent: number;
  rightExtent: number;
}

export type RestKind = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';

export interface PositionedRest {
  id: string;
  voiceId: VoiceId;
  startTick: number;
  durationTicks: number;
  left: number;
  top: number;
  kind: RestKind;
  fullMeasure: boolean;
  explicit: boolean;
  leftExtent: number;
  rightExtent: number;
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

type RestSegment = Omit<PositionedRest, 'left' | 'top' | 'leftExtent' | 'rightExtent'>;

const REST_NOTE_GAP = 0;

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
  const lastUsedNoteMeasure = project.events.reduce(
    (last, event) => Math.max(last, tickToMeasure(event.startTick)),
    -1,
  );
  const lastUsedRestMeasure = (project.rests ?? []).reduce(
    (last, rest) => Math.max(last, tickToMeasure(rest.startTick)),
    -1,
  );
  const lastUsedMeasure = Math.max(lastUsedNoteMeasure, lastUsedRestMeasure);

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
  const noteItems = project.events
    .filter((event) => (
      visibleVoiceIds.has(event.voiceId)
      && event.startTick >= measureStart
      && event.startTick < measureEnd
    ))
    .map((event) => ({
      startTick: event.startTick,
      extents: getNoteVisualExtents(event),
    }));
  const restItems = [...visibleVoiceIds]
    .flatMap((voiceId) => buildRestSegmentsForVoiceInMeasure(
      project.events,
      project.rests ?? [],
      voiceId,
      measureStart,
      measureEnd,
    ))
    .filter((rest) => !rest.fullMeasure)
    .flatMap((rest) => {
      const extents = getRestVisualExtents(rest.kind);
      const endTick = rest.startTick + rest.durationTicks;

      return [
        {
          startTick: rest.startTick,
          extents,
        },
        {
          startTick: endTick,
          extents: { left: 4, right: 4 },
        },
      ];
    });
  const rhythmicItems = [...noteItems, ...restItems]
    .filter((item) => item.startTick >= measureStart && item.startTick <= measureEnd);

  if (rhythmicItems.length === 0) {
    return {
      measure,
      minimumWidth: MEASURE_AREA_WIDTH / DEFAULT_MEASURES_PER_SYSTEM,
      columns: [],
    };
  }

  const grouped = groupBy(rhythmicItems, (item) => item.startTick - measureStart);
  const tickOffsets = [...grouped.keys()].sort((left, right) => left - right);
  const columns: IntrinsicColumn[] = [];
  let previous: IntrinsicColumn | null = null;

  for (const tickOffset of tickOffsets) {
    const itemsAtTick = grouped.get(tickOffset) ?? [];
    const extents = itemsAtTick.reduce(
      (maximum, item) => ({
        left: Math.max(maximum.left, item.extents.left),
        right: Math.max(maximum.right, item.extents.right),
      }),
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
    minimumWidth: Math.min(MEASURE_AREA_WIDTH, Math.ceil(minimumWidth)),
    columns,
  };
}

function gapBetweenTicks(previousTick: number, currentTick: number): number {
  const tickDistance = Math.max(1, currentTick - previousTick);

  if (tickDistance <= 1) {
    return MIN_COLUMN_GAP + 0;
  }

  if (tickDistance <= 2) {
    return MIN_COLUMN_GAP + 0;
  }

  return MIN_COLUMN_GAP + 0;
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
  const rests = voiceIds.flatMap((voiceId) => getPositionedRestsForVoice(
    project.events,
    project.rests ?? [],
    voiceId,
    voiceIds,
    startTick,
    endTick,
    measures,
    notes.filter((note) => note.voiceId === voiceId),
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
    rests,
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
      const extents = getNoteVisualExtents(event);

      return {
        event,
        voiceId,
        left: leftForEvent(event, startTick, measures),
        top,
        direction: stemDirectionForVoice(voiceId),
        accidental: accidentalForMidi(event.midi),
        ledgerLines: ledgerLineTopsForNote(top),
        leftExtent: extents.left,
        rightExtent: extents.right,
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

function buildRestSegmentsForVoiceInMeasure(
  events: NoteEvent[],
  rests: RestEvent[],
  voiceId: VoiceId,
  measureStart: number,
  measureEnd: number,
): RestSegment[] {
  const explicitRests = rests
    .filter((rest) => (
      rest.voiceId === voiceId
      && rest.startTick < measureEnd
      && rest.startTick + rest.durationTicks > measureStart
    ));
  const occupiedRanges = mergeRanges([
    ...events
      .filter((event) => (
        event.voiceId === voiceId
        && event.startTick < measureEnd
        && event.startTick + event.durationTicks > measureStart
      ))
      .map((event) => ({
        start: Math.max(measureStart, event.startTick),
        end: Math.min(measureEnd, event.startTick + event.durationTicks),
      })),
    ...explicitRests.map((rest) => ({
      start: Math.max(measureStart, rest.startTick),
      end: Math.min(measureEnd, rest.startTick + rest.durationTicks),
    })),
  ]);

  if (occupiedRanges.length === 0) {
    return [{
      id: `implicit-rest:${voiceId}:${measureStart}:full`,
      voiceId,
      startTick: measureStart,
      durationTicks: TICKS_PER_MEASURE,
      kind: 'whole',
      fullMeasure: true,
      explicit: false,
    }];
  }

  const result: RestSegment[] = [];

  for (const rest of explicitRests) {
    const restStart = Math.max(measureStart, rest.startTick);
    const restEnd = Math.min(measureEnd, rest.startTick + rest.durationTicks);

    result.push(...splitRestRange(
      restStart,
      restEnd,
      true,
      `${rest.id}:${Math.floor(measureStart / TICKS_PER_MEASURE)}`,
      voiceId,
    ));
  }

  let cursor = measureStart;

  for (const range of occupiedRanges) {
    if (range.start > cursor) {
      result.push(...splitRestRange(
        cursor,
        range.start,
        false,
        `implicit-rest:${voiceId}:${cursor}`,
        voiceId,
      ));
    }

    cursor = Math.max(cursor, range.end);
  }

  if (cursor < measureEnd) {
    result.push(...splitRestRange(
      cursor,
      measureEnd,
      false,
      `implicit-rest:${voiceId}:${cursor}`,
      voiceId,
    ));
  }

  return result.sort((left, right) => left.startTick - right.startTick);
}

function getPositionedRestsForVoice(
  events: NoteEvent[],
  rests: RestEvent[],
  voiceId: VoiceId,
  rowVoiceIds: VoiceId[],
  startTick: number,
  endTick: number,
  measures: MeasureLayoutPlan[],
  positionedNotes: PositionedNote[],
): PositionedRest[] {
  const result: PositionedRest[] = [];

  for (const measure of measures) {
    const measureStart = measure.measure * TICKS_PER_MEASURE;
    const measureEnd = measureStart + TICKS_PER_MEASURE;

    if (measureEnd <= startTick || measureStart >= endTick) {
      continue;
    }

    const segments = buildRestSegmentsForVoiceInMeasure(
      events,
      rests,
      voiceId,
      measureStart,
      measureEnd,
    );

    const notesInMeasure = positionedNotes.filter((note) => (
      note.event.startTick < measureEnd
      && note.event.startTick + note.event.durationTicks > measureStart
    ));

    for (const segment of segments) {
      result.push(positionRest(
        segment,
        measure,
        rowVoiceIds,
        notesInMeasure,
      ));
    }
  }

  return result.sort((left, right) => left.startTick - right.startTick);
}

function positionRest(
  rest: RestSegment,
  measure: MeasureLayoutPlan,
  rowVoiceIds: VoiceId[],
  positionedNotes: PositionedNote[],
): PositionedRest {
  const extents = getRestVisualExtents(rest.kind);
  const naturalLeft = getRestNaturalLeft(rest, measure);

  const previousNote = positionedNotes
    .filter((note) => note.event.startTick + note.event.durationTicks <= rest.startTick)
    .sort((left, right) => (
      (right.event.startTick + right.event.durationTicks)
      - (left.event.startTick + left.event.durationTicks)
    ))
    .at(0);
  const nextNote = positionedNotes
    .filter((note) => note.event.startTick >= rest.startTick + rest.durationTicks)
    .sort((left, right) => left.event.startTick - right.event.startTick)
    .at(0);

  const slot = restSlotBounds(rest, measure);
  const minLeftFromSlot = slot.left + extents.left;
  const maxLeftFromSlot = slot.right - extents.right;
  const minLeftFromPreviousNote = previousNote
    ? previousNote.left + previousNote.rightExtent + REST_NOTE_GAP + extents.left
    : Number.NEGATIVE_INFINITY;
  const maxLeftFromNextNote = nextNote
    ? nextNote.left - nextNote.leftExtent - REST_NOTE_GAP - extents.right
    : Number.POSITIVE_INFINITY;

  const minLeft = Math.max(minLeftFromSlot, minLeftFromPreviousNote);
  const maxLeft = Math.min(maxLeftFromSlot, maxLeftFromNextNote);
  const left = minLeft <= maxLeft
    ? clamp(naturalLeft, minLeft, maxLeft)
    : clamp(naturalLeft, minLeftFromSlot, maxLeftFromSlot);

  return {
    ...rest,
    left,
    top: restTopForVoice(rest.voiceId, rest.kind, rest.fullMeasure, rowVoiceIds),
    leftExtent: extents.left,
    rightExtent: extents.right,
  };
}

function getRestNaturalLeft(
  rest: RestSegment,
  measure: MeasureLayoutPlan,
): number {
  const slot = restSlotBounds(rest, measure);
  return slot.left + (slot.right - slot.left) / 2;
}

function restSlotBounds(
  rest: RestSegment,
  measure: MeasureLayoutPlan,
): { left: number; right: number } {
  const measureStartTick = measure.measure * TICKS_PER_MEASURE;
  const startOffset = rest.fullMeasure
    ? 0
    : rest.startTick - measureStartTick;
  const endOffset = rest.fullMeasure
    ? TICKS_PER_MEASURE
    : rest.startTick + rest.durationTicks - measureStartTick;

  return {
    left: leftWithinRestRhythmicSlot(measure, startOffset),
    right: leftWithinRestRhythmicSlot(measure, endOffset),
  };
}

function leftWithinRestRhythmicSlot(
  measure: MeasureLayoutPlan,
  tickOffset: number,
): number {
  const normalizedTick = clamp(tickOffset, 0, TICKS_PER_MEASURE);
  const padding = Math.min(NOTE_LEFT_PADDING, measure.width * 0.18);
  const writableWidth = Math.max(8, measure.width - padding * 2);

  return measure.left
    + padding
    + (normalizedTick / TICKS_PER_MEASURE) * writableWidth;
}

function splitRestRange(
  startTick: number,
  endTick: number,
  explicit: boolean,
  idPrefix: string,
  voiceId: VoiceId,
): RestSegment[] {
  const result: RestSegment[] = [];
  let cursor = Math.max(0, Math.round(startTick));
  let remaining = Math.max(0, Math.round(endTick - startTick));

  if (remaining <= 0) {
    return result;
  }

  const startsAtMeasure = cursor % TICKS_PER_MEASURE === 0;

  if (remaining === TICKS_PER_MEASURE && startsAtMeasure) {
    return [{
      id: `${idPrefix}:whole:${cursor}`,
      voiceId,
      startTick: cursor,
      durationTicks: TICKS_PER_MEASURE,
      kind: 'whole',
      fullMeasure: true,
      explicit,
    }];
  }

  while (remaining > 0) {
    const localTick = cursor % TICKS_PER_MEASURE;
    const [durationTicks, kind] = bestRestDurationForPosition(localTick, remaining);

    result.push({
      id: `${idPrefix}:${kind}:${cursor}`,
      voiceId,
      startTick: cursor,
      durationTicks,
      kind,
      fullMeasure: false,
      explicit,
    });

    cursor += durationTicks;
    remaining -= durationTicks;
  }

  return result;
}

function bestRestDurationForPosition(
  localTick: number,
  remaining: number,
): [number, RestKind] {
  // V 4/4 nedáváme půlovou pomlku přes slabou půlku taktu.
  // Například mezera 2.–4. doba se rozdělí na čtvrťovou + půlovou,
  // podobně jako v běžné sazbě a v MuseScore.
  if ((localTick === 0 || localTick === 8) && remaining >= 8) {
    return [8, 'half'];
  }

  if (localTick % 4 === 0 && remaining >= 4) {
    return [4, 'quarter'];
  }

  if (localTick % 2 === 0 && remaining >= 2) {
    return [2, 'eighth'];
  }

  return [1, 'sixteenth'];
}

function restTopForVoice(
  voiceId: VoiceId,
  kind: RestKind,
  fullMeasure: boolean,
  rowVoiceIds: VoiceId[],
): number {
  const restMiddleLine = STAFF_LINE_TOP + STAFF_LINE_GAP * 2;

  // V samostatném hlasu a ve čtyřosnovém zobrazení nemá smysl posouvat
  // pomlky podle názvu hlasu. Každá osnova obsahuje jen jeden hlas, takže
  // pomlka má být ve všech hlasech na stejném, čitelně nižším místě.
  const rowHasSingleVoice = rowVoiceIds.length === 1;
  const voiceOffset = rowHasSingleVoice
    ? STAFF_LINE_GAP
    : (voiceId === 's' || voiceId === 't' ? -6 : 8) + STAFF_LINE_GAP;

  const fullMeasureOffset = fullMeasure || kind === 'whole' ? -2 : 0;
  return restMiddleLine + voiceOffset + fullMeasureOffset;
}

function mergeRanges(
  ranges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const ordered = ranges
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start);
  const merged: Array<{ start: number; end: number }> = [];

  for (const range of ordered) {
    const previous = merged.at(-1);

    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
      continue;
    }

    previous.end = Math.max(previous.end, range.end);
  }

  return merged;
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
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
