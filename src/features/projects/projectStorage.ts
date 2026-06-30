import type { ScoreProject, SoundStyle } from '../../domain/score';

const STORAGE_KEY = 'columba-palumbus/current-project/v1';

function isSoundStyle(value: unknown): value is SoundStyle {
  return value === 'piano' || value === 'vocal';
}

/**
 * Starší projekty ještě nemají playbackSound.
 * Při načítání jim bezpečně doplníme výchozí piano, takže se neztratí staré zápisy.
 */
function normalizeProject(value: unknown): ScoreProject | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ScoreProject>;

  if (candidate.version !== 1 || !Array.isArray(candidate.events)) {
    return null;
  }

  return {
    ...(candidate as ScoreProject),
    playbackSound: isSoundStyle(candidate.playbackSound)
      ? candidate.playbackSound
      : 'piano',
  };
}

export function loadProject(): ScoreProject | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);

    return value ? normalizeProject(JSON.parse(value)) : null;
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
