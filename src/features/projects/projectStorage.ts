import {
  TICKS_PER_BEAT,
  durationToTicks,
  type Duration,
  type LayoutMode,
  type NoteEvent,
  type RestEvent,
  type ScoreProject,
  type SoundStyle,
  type VoiceId,
} from '../../domain/score';

const STORAGE_KEY = 'columba-palumbus/current-project/v2';
const LEGACY_STORAGE_KEY = 'columba-palumbus/current-project/v1';

interface LegacyNoteEvent {
  id: string;
  voiceId: VoiceId;
  measure: number;
  slot: number;
  midi: number;
  duration: Duration;
  lyric?: string;
}

interface LegacyProject {
  version: 1;
  id: string;
  title: string;
  tempo: number;
  layoutMode: LayoutMode;
  playbackSound?: SoundStyle;
  measureCount: number;
  events: LegacyNoteEvent[];
  updatedAt: string;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSoundStyle(value: unknown): value is SoundStyle {
  return value === 'piano' || value === 'vocal';
}

function isVoiceId(value: unknown): value is VoiceId {
  return value === 's' || value === 'a' || value === 't' || value === 'b';
}

function isLayoutMode(value: unknown): value is LayoutMode {
  return value === 'two-staves' || value === 'four-staves';
}

function isDuration(value: unknown): value is Duration {
  return value === 'whole'
    || value === 'half'
    || value === 'quarter'
    || value === 'eighth'
    || value === 'sixteenth';
}

function isV2Event(value: unknown): value is NoteEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<NoteEvent>;
  return typeof candidate.id === 'string'
    && isVoiceId(candidate.voiceId)
    && isFiniteNumber(candidate.startTick)
    && isFiniteNumber(candidate.durationTicks)
    && isFiniteNumber(candidate.midi);
}

function isV2Rest(value: unknown): value is RestEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RestEvent>;
  return typeof candidate.id === 'string'
    && isVoiceId(candidate.voiceId)
    && isFiniteNumber(candidate.startTick)
    && isFiniteNumber(candidate.durationTicks);
}

function normalizeV2(value: unknown): ScoreProject | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ScoreProject>;

  if (candidate.version !== 2 || !Array.isArray(candidate.events)) {
    return null;
  }

  const events = candidate.events.filter(isV2Event).map((event) => ({
    ...event,
    startTick: Math.max(0, Math.round(event.startTick)),
    durationTicks: Math.max(1, Math.round(event.durationTicks)),
    midi: Math.max(0, Math.min(127, Math.round(event.midi))),
  }));
  const rests = Array.isArray(candidate.rests)
    ? candidate.rests.filter(isV2Rest).map((rest) => ({
      ...rest,
      startTick: Math.max(0, Math.round(rest.startTick)),
      durationTicks: Math.max(1, Math.round(rest.durationTicks)),
    }))
    : [];

  return {
    version: 2,
    id: typeof candidate.id === 'string' ? candidate.id : crypto.randomUUID(),
    title: typeof candidate.title === 'string' ? candidate.title : 'Nová skladba',
    tempo: isFiniteNumber(candidate.tempo)
      ? Math.max(30, Math.min(300, Math.round(candidate.tempo)))
      : 96,
    layoutMode: isLayoutMode(candidate.layoutMode) ? candidate.layoutMode : 'two-staves',
    playbackSound: isSoundStyle(candidate.playbackSound) ? candidate.playbackSound : 'piano',
    measureCount: isFiniteNumber(candidate.measureCount)
      ? Math.max(4, Math.round(candidate.measureCount))
      : 4,
    events,
    rests,
    updatedAt: typeof candidate.updatedAt === 'string'
      ? candidate.updatedAt
      : new Date().toISOString(),
  };
}

/**
 * Převod starších projektů v1 (measure + slot) do v2 (startTick).
 * Data uživatele se tím neztratí – při prvním autosave se uloží v nové podobě.
 */
function migrateLegacyProject(value: unknown): ScoreProject | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<LegacyProject>;

  if (candidate.version !== 1 || !Array.isArray(candidate.events)) {
    return null;
  }

  const events: NoteEvent[] = [];

  for (const raw of candidate.events) {
    const event = raw as Partial<LegacyNoteEvent>;

    if (
      typeof event.id !== 'string'
      || !isVoiceId(event.voiceId)
      || !isFiniteNumber(event.measure)
      || !isFiniteNumber(event.slot)
      || !isFiniteNumber(event.midi)
      || !isDuration(event.duration)
    ) {
      continue;
    }

    events.push({
      id: event.id,
      voiceId: event.voiceId,
      startTick: Math.max(
        0,
        Math.round((event.measure * 4 + event.slot) * TICKS_PER_BEAT),
      ),
      durationTicks: durationToTicks(event.duration),
      midi: Math.max(0, Math.min(127, Math.round(event.midi))),
      lyric: typeof event.lyric === 'string' ? event.lyric : undefined,
    });
  }

  return {
    version: 2,
    id: typeof candidate.id === 'string' ? candidate.id : crypto.randomUUID(),
    title: typeof candidate.title === 'string' ? candidate.title : 'Nová skladba',
    tempo: isFiniteNumber(candidate.tempo)
      ? Math.max(30, Math.min(300, Math.round(candidate.tempo)))
      : 96,
    layoutMode: isLayoutMode(candidate.layoutMode) ? candidate.layoutMode : 'two-staves',
    playbackSound: isSoundStyle(candidate.playbackSound) ? candidate.playbackSound : 'piano',
    measureCount: isFiniteNumber(candidate.measureCount)
      ? Math.max(4, Math.round(candidate.measureCount))
      : 4,
    events,
    rests: [],
    updatedAt: typeof candidate.updatedAt === 'string'
      ? candidate.updatedAt
      : new Date().toISOString(),
  };
}

function normalizeProject(value: unknown): ScoreProject | null {
  return normalizeV2(value) ?? migrateLegacyProject(value);
}

export function loadProject(): ScoreProject | null {
  try {
    const current = localStorage.getItem(STORAGE_KEY);

    if (current) {
      return normalizeProject(JSON.parse(current));
    }

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    return legacy ? normalizeProject(JSON.parse(legacy)) : null;
  } catch {
    return null;
  }
}

export function saveProject(project: ScoreProject): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export function downloadProject(project: ScoreProject): void {
  const blob = new Blob(
    [JSON.stringify(project, null, 2)],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${project.title.trim() || 'quartet-project'}.quartet.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function readProjectFile(file: File): Promise<ScoreProject> {
  const parsed: unknown = JSON.parse(await file.text());
  const project = normalizeProject(parsed);

  if (!project) {
    throw new Error('Soubor není kompatibilní projekt Quartet Workspace.');
  }

  return project;
}
