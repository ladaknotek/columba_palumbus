import { VOICES, DURATIONS, createEmptyScore, clone, durationById, createNote, createRest, moveCursor, displayPitch } from './models/score.js';
import { listProjects, saveProject, loadProject, getLastProjectId, deleteProject, exportProject, importProject } from './storage/projectStore.js';
import { playMidi, playScore } from './audio/playback.js';
import { midiForKeyboard, griffRows } from './services/griffMapping.js';
import { renderNotation } from './ui/notationRenderer.js';

const app = document.querySelector('#app');
const state = {
  score: loadProject(getLastProjectId()) || createEmptyScore('Nová čtyřhlasá píseň'),
  selectedEventId: null,
  muted: new Set(),
  history: [],
  future: [],
  dirty: false,
  autoSaveTimer: null,
  notationZoom: 1.28,
};

function snapshot() { state.history.push(clone(state.score)); if (state.history.length > 80) state.history.shift(); state.future = []; }
function markDirty() {
  state.dirty = true;
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(() => { state.score = saveProject(state.score); state.dirty = false; render(); }, 700);
}
function mutate(fn) { snapshot(); fn(); markDirty(); render(); }
function activeVoice() { return state.score.voices[state.score.settings.activeVoiceId]; }
function selectedDuration() { return durationById(state.score.settings.selectedDurationId); }
function selectedEvent() { return Object.values(state.score.voices).flatMap((v) => v.events).find((e) => e.id === state.selectedEventId) || null; }

function insertEvent(type, midi = null) {
  const voice = activeVoice();
  const duration = selectedDuration();
  const cursor = clone(voice.cursor);
  const event = type === 'note'
    ? createNote({ voiceId: voice.id, measureIndex: cursor.measureIndex, startTick: cursor.tick, durationTicks: duration.ticks, midi })
    : createRest({ voiceId: voice.id, measureIndex: cursor.measureIndex, startTick: cursor.tick, durationTicks: duration.ticks });
  mutate(() => {
    voice.events = voice.events.filter((existing) => !(existing.measureIndex === event.measureIndex && existing.startTick === event.startTick));
    voice.events.push(event);
    voice.events.sort((a, b) => a.measureIndex - b.measureIndex || a.startTick - b.startTick);
    moveCursor(state.score, voice.id, duration.ticks);
    state.selectedEventId = event.id;
  });
  if (type === 'note') playMidi(midi, 0.28);
}

function removeSelected() {
  const event = selectedEvent();
  if (!event) return;
  mutate(() => {
    const voice = state.score.voices[event.voiceId];
    voice.events = voice.events.filter((e) => e.id !== event.id);
    state.selectedEventId = null;
  });
}
function undo() { const previous = state.history.pop(); if (!previous) return; state.future.push(clone(state.score)); state.score = previous; state.dirty = true; render(); }
function redo() { const next = state.future.pop(); if (!next) return; state.history.push(clone(state.score)); state.score = next; state.dirty = true; render(); }
function setLyric(text) {
  const event = selectedEvent();
  if (!event || event.type !== 'note') return;
  mutate(() => { event.lyric = text; });
}
function newProject() {
  if (state.dirty && !confirm('Rozpracované změny se před vytvořením nové skladby automaticky uloží. Pokračovat?')) return;
  state.score = createEmptyScore('Nová čtyřhlasá píseň'); state.selectedEventId = null; state.history = []; state.future = []; state.dirty = true; render();
}
function manualSave() { state.score = saveProject(state.score); state.dirty = false; render(); }
function openProject(id) { const project = loadProject(id); if (!project) return; state.score = project; state.selectedEventId = null; state.history = []; state.future = []; state.dirty = false; render(); }

function render() {
  const score = state.score;
  const event = selectedEvent();
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">Quartet <span>Workspace</span></div>
        <input id="titleInput" class="title-input" value="${escapeHtml(score.title)}" aria-label="Název skladby" />
        <button class="btn" data-action="new">Nový</button>
        <button class="btn primary" data-action="save">Uložit</button>
        <button class="btn" data-action="open-file">Otevřít soubor</button>
        <button class="btn" data-action="export">Export projektu</button>
        <input id="importInput" class="hidden" type="file" accept=".json,.quartet.json,application/json" />
        <div class="spacer"></div>
        <div class="status">${state.dirty ? 'Ukládám změny…' : `Uloženo ${formatTime(score.updatedAt)}`}</div>
      </header>
      <div class="workspace">
        <aside class="sidebar">
          <p class="section-title">Hlasy</p>
          <div class="voice-list">
            ${VOICES.map((v) => `<button class="voice-button ${score.settings.activeVoiceId === v.id ? 'active' : ''}" data-voice="${v.id}"><span class="dot" style="background:${v.color}"></span>${v.name}</button>`).join('')}
          </div>
          <div class="project-list">
            <p class="section-title">Uložené projekty</p>
            ${listProjects().slice(0, 8).map((p) => `<button class="project-row" data-open-project="${p.id}">${escapeHtml(p.title)}<small>${formatTime(p.updatedAt)}</small></button>`).join('') || '<small>Ještě tu nic není.</small>'}
          </div>
        </aside>
        <main class="main">
          <section class="toolbar">
            <div class="toolbar-group">
              <button class="btn ${score.settings.staffLayout === 'four' ? 'active' : ''}" data-layout="four">4 osnovy</button>
              <button class="btn ${score.settings.staffLayout === 'two' ? 'active' : ''}" data-layout="two">2 osnovy</button>
            </div>
            <div class="toolbar-group">
              ${DURATIONS.map((d) => `<button title="${d.label}" class="btn duration ${score.settings.selectedDurationId === d.id ? 'active' : ''}" data-duration="${d.id}">${d.symbol}</button>`).join('')}
              <button class="btn" data-action="rest">Pomlka</button>
            </div>
            <div class="toolbar-group">
              <button class="btn ${score.settings.notationInput === 'letter' ? 'active' : ''}" data-input-mode="letter">CDE…</button>
              <button class="btn ${score.settings.notationInput === 'griff' ? 'active' : ''}" data-input-mode="griff">B‑griff</button>
            </div>
            <div class="toolbar-group">
              <button class="btn" data-action="undo" title="Zpět">↶</button>
              <button class="btn" data-action="redo" title="Znovu">↷</button>
              <button class="btn" data-action="delete">Smazat notu</button>
            </div>
            <div class="toolbar-group">
              <button class="btn" data-action="play">▶ Přehrát</button>
              <label class="btn">Tempo <input id="tempoInput" type="number" min="35" max="260" value="${score.tempo}" style="width:48px;border:0;background:transparent" /></label>
            </div>
          </section>
          <section class="editor-card" id="notation">
            <div class="zoom-hint">Ctrl + kolečko: přiblížení · ${Math.round(state.notationZoom * 100)} %</div>
            ${renderNotation(score, state)}
          </section>
          <section class="input-dock">
            <div class="help">
              ${score.settings.notationInput === 'griff'
                ? 'B‑griff vstup: Q–I / A–K / Z–M. Hraje tón a vloží ho do aktivního hlasu.'
                : 'Klasický vstup: C D E F G A H. Shift zvýší tón o oktávu. Mezerník vloží pomlku.'}
              <br><b>Aktivní hlas:</b> ${VOICES.find((v) => v.id === score.settings.activeVoiceId).name} · <b>Kurz:</b> takt ${activeVoice().cursor.measureIndex + 1}, doba ${activeVoice().cursor.tick / 4 + 1}
            </div>
            ${score.settings.notationInput === 'griff' ? `<div class="griff">${griffRows().map((row) => `<div class="griff-row">${row.map((key) => `<button class="griff-key" data-griff-midi="${key.midi}"><b>${key.key}</b>${displayPitch(key.midi)}</button>`).join('')}</div>`).join('')}</div>` : ''}
          </section>
        </main>
        <aside class="inspector">
          <p class="section-title">Partitura</p>
          <div class="field"><label>Skladatel / úprava</label><input id="composerInput" value="${escapeHtml(score.composer || '')}" placeholder="např. úprava: kvartet" /></div>
          <div class="field"><label>Tónina</label><input id="keyInput" value="${escapeHtml(score.key)}" /></div>
          <div class="field"><label>Takt</label><select id="timeInput"><option value="4/4" ${score.timeSignature.beats === 4 ? 'selected' : ''}>4/4</option><option value="3/4" ${score.timeSignature.beats === 3 ? 'selected' : ''}>3/4</option></select></div>
          <p class="section-title" style="margin-top:22px">Vybraná událost</p>
          ${event ? `<div class="event-info"><b>${event.type === 'note' ? displayPitch(event.midi) : 'Pomlka'}</b><br>Takt ${event.measureIndex + 1}, začátek ${event.startTick / 4 + 1}. doba<br><br>${event.type === 'note' ? `<div class="field"><label>Text pod notou</label><input id="lyricInput" value="${escapeHtml(event.lyric || '')}" placeholder="např. A-" /></div>` : ''}</div>` : '<div class="event-info">Klikni na notu v zápisu. Text se váže přímo ke konkrétní notě.</div>'}
          <p class="section-title" style="margin-top:22px">Více možností</p>
          <div class="event-info">Zatím schované v jádru: samostatné hlasy, takty, délky, pomlky, text, import/export projektu. MusicXML, ligatury a dynamika přijdou jako další vrstva.</div>
        </aside>
      </div>
    </div>`;
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('[data-voice]').forEach((button) => button.addEventListener('click', () => { state.score.settings.activeVoiceId = button.dataset.voice; render(); }));
  document.querySelectorAll('[data-layout]').forEach((button) => button.addEventListener('click', () => { state.score.settings.staffLayout = button.dataset.layout; markDirty(); render(); }));
  document.querySelectorAll('[data-duration]').forEach((button) => button.addEventListener('click', () => { state.score.settings.selectedDurationId = button.dataset.duration; render(); }));
  document.querySelectorAll('[data-input-mode]').forEach((button) => button.addEventListener('click', () => { state.score.settings.notationInput = button.dataset.inputMode; render(); }));
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => action(button.dataset.action)));
  document.querySelectorAll('[data-open-project]').forEach((button) => button.addEventListener('click', () => openProject(button.dataset.openProject)));
  document.querySelectorAll('[data-griff-midi]').forEach((button) => button.addEventListener('click', () => insertEvent('note', Number(button.dataset.griffMidi))));
  document.querySelectorAll('[data-event-id]').forEach((node) => node.addEventListener('click', () => { state.selectedEventId = node.dataset.eventId; state.score.settings.activeVoiceId = node.dataset.voiceId; render(); }));
  document.querySelector('#titleInput').addEventListener('change', (e) => mutate(() => { state.score.title = e.target.value || 'Bez názvu'; }));
  document.querySelector('#composerInput').addEventListener('change', (e) => mutate(() => { state.score.composer = e.target.value; }));
  document.querySelector('#keyInput').addEventListener('change', (e) => mutate(() => { state.score.key = e.target.value; }));
  document.querySelector('#tempoInput').addEventListener('change', (e) => mutate(() => { state.score.tempo = Math.max(35, Math.min(260, Number(e.target.value) || 92)); }));
  document.querySelector('#timeInput').addEventListener('change', (e) => mutate(() => { const [beats, beatUnit] = e.target.value.split('/').map(Number); state.score.timeSignature = { beats, beatUnit }; }));
  document.querySelector('#lyricInput')?.addEventListener('input', (e) => setLyric(e.target.value));
  document.querySelector('#importInput').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { state.score = await importProject(file); state.selectedEventId = null; state.history = []; state.future = []; manualSave(); }
    catch (error) { alert(error.message); }
    e.target.value = '';
  });
}
function action(name) {
  if (name === 'new') return newProject();
  if (name === 'save') return manualSave();
  if (name === 'open-file') return document.querySelector('#importInput').click();
  if (name === 'export') return exportProject(state.score);
  if (name === 'rest') return insertEvent('rest');
  if (name === 'delete') return removeSelected();
  if (name === 'undo') return undo();
  if (name === 'redo') return redo();
  if (name === 'play') return playScore(state.score, state.muted);
}

document.querySelector('#notation')?.addEventListener('wheel', (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const step = event.deltaY < 0 ? 0.08 : -0.08;
  state.notationZoom = Math.max(0.65, Math.min(2.1, Math.round((state.notationZoom + step) * 100) / 100));
  render();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  const editable = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if (editable) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); manualSave(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (e.code === 'Space') { e.preventDefault(); insertEvent('rest'); return; }
  if (e.code === 'Backspace' || e.code === 'Delete') { e.preventDefault(); removeSelected(); return; }
  if (e.code === 'ArrowLeft') { e.preventDefault(); mutate(() => moveCursor(state.score, state.score.settings.activeVoiceId, -selectedDuration().ticks)); return; }
  if (e.code === 'ArrowRight') { e.preventDefault(); mutate(() => moveCursor(state.score, state.score.settings.activeVoiceId, selectedDuration().ticks)); return; }
  const midi = midiForKeyboard(e.code, state.score.settings.notationInput);
  if (midi != null && !e.repeat) { e.preventDefault(); insertEvent('note', midi + (e.shiftKey ? 12 : 0)); }
});

function formatTime(value) { if (!value) return 'zatím neuloženo'; const date = new Date(value); return date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[character])); }

render();
