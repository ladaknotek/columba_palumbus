const KEY = 'quartet-workspace-projects-v3';
const LAST = 'quartet-workspace-last-project-v3';

export function listProjects() {
  const entries = JSON.parse(localStorage.getItem(KEY) || '[]');
  return entries.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function saveProject(score) {
  const all = listProjects().filter((entry) => entry.id !== score.id);
  const record = { ...score, updatedAt: new Date().toISOString() };
  all.push(record);
  localStorage.setItem(KEY, JSON.stringify(all));
  localStorage.setItem(LAST, record.id);
  return record;
}

export function loadProject(id) { return listProjects().find((entry) => entry.id === id) ?? null; }
export function getLastProjectId() { return localStorage.getItem(LAST); }
export function deleteProject(id) { localStorage.setItem(KEY, JSON.stringify(listProjects().filter((entry) => entry.id !== id))); }

export function exportProject(score) {
  const blob = new Blob([JSON.stringify(score, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${score.title.trim().replace(/[^\wáčďéěíňóřšťúůýž]+/gi, '-').replace(/^-|-$/g, '') || 'skladba'}.quartet.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importProject(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || !parsed.schemaVersion || !parsed.voices || !parsed.measures) throw new Error('Soubor není platný projekt Quartet Workspace.');
  return parsed;
}
