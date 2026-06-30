import type { ScoreProject } from '../../domain/score';

const STORAGE_KEY = 'columba-palumbus/current-project/v1';

export function loadProject(): ScoreProject | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as ScoreProject) : null;
  } catch {
    return null;
  }
}

export function saveProject(project: ScoreProject): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export function downloadProject(project: ScoreProject): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.title.trim() || 'quartet-project'}.quartet.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function readProjectFile(file: File): Promise<ScoreProject> {
  const parsed = JSON.parse(await file.text()) as ScoreProject;
  if (parsed.version !== 1 || !Array.isArray(parsed.events)) {
    throw new Error('Soubor není kompatibilní projekt Quartet Workspace.');
  }
  return parsed;
}
