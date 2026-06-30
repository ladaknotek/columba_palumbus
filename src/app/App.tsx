import { useEffect, useMemo, useRef, useState } from 'react';

import {
  createEmptyProject,
  defaultMidiForVoice,
  type Duration,
  type NoteEvent,
  type ScoreProject,
  type VoiceId,
} from '../domain/score';

import {
  GriffPanel,
  NotationToolbar,
  VoicePanel,
} from '../features/editor/EditorControls';

import { ScoreRenderer } from '../features/editor/ScoreRenderer';
import {
  downloadProject,
  loadProject,
  readProjectFile,
  saveProject,
} from '../features/projects/projectStorage';
import { PlaybackEngine } from '../features/playback/playbackEngine';

const SLOT_COUNT = 4;

export function App() {
  const [project, setProject] = useState<ScoreProject>(
    () => loadProject() ?? createEmptyProject(),
  );

  const [activeVoice, setActiveVoice] = useState<VoiceId>('s');
  const [duration, setDuration] = useState<Duration>('quarter');
  const [cursor, setCursor] = useState({ measure: 0, slot: 0 });
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [playingEventId, setPlayingEventId] = useState<string | null>(null);
  const [status, setStatus] = useState('Připraveno');
  const [zoom, setZoom] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const playbackRef = useRef(new PlaybackEngine());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveProject(project);
      setStatus('Uloženo lokálně');
    }, 350);

    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('input, textarea')) {
        return;
      }

      const noteMap: Record<string, number> = {
        c: 60,
        d: 62,
        e: 64,
        f: 65,
        g: 67,
        a: 69,
        h: 71,
      };

      const midi = noteMap[event.key.toLowerCase()];

      if (midi !== undefined) {
        event.preventDefault();
        insertNote(midi);
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        deleteSelectedOrLast();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function updateProject(
    mutator: (current: ScoreProject) => ScoreProject,
  ) {
    setProject((current) => ({
      ...mutator(current),
      updatedAt: new Date().toISOString(),
    }));
  }

  function insertNote(midi: number) {
    const id = crypto.randomUUID();

    const event: NoteEvent = {
      id,
      voiceId: activeVoice,
      measure: cursor.measure,
      slot: cursor.slot,
      midi,
      duration,
    };

    updateProject((current) => ({
      ...current,
      events: [
        ...current.events.filter(
          (existing) =>
            !(
              existing.voiceId === activeVoice
              && existing.measure === cursor.measure
              && existing.slot === cursor.slot
            ),
        ),
        event,
      ],
    }));

    setSelectedEventId(id);
    advanceCursor();
  }

  function advanceCursor() {
    setCursor((current) => {
      const nextSlot = current.slot + 1;

      if (nextSlot < SLOT_COUNT) {
        return { ...current, slot: nextSlot };
      }

      const nextMeasure = current.measure + 1;

      if (nextMeasure >= project.measureCount) {
        updateProject((score) => ({
          ...score,
          measureCount: score.measureCount + 4,
        }));
      }

      return { measure: nextMeasure, slot: 0 };
    });
  }

  function deleteSelectedOrLast() {
    const target =
      selectedEventId
      ?? [...project.events]
        .filter((item) => item.voiceId === activeVoice)
        .at(-1)?.id;

    if (!target) {
      return;
    }

    updateProject((current) => ({
      ...current,
      events: current.events.filter((event) => event.id !== target),
    }));

    setSelectedEventId(null);
  }

  const selectedEvent = useMemo(
    () => project.events.find((event) => event.id === selectedEventId) ?? null,
    [project.events, selectedEventId],
  );

  function changeLyric(value: string) {
    if (!selectedEventId) {
      return;
    }

    updateProject((current) => ({
      ...current,
      events: current.events.map((event) =>
        event.id === selectedEventId
          ? { ...event, lyric: value || undefined }
          : event,
      ),
    }));
  }

  function changeTitle(value: string) {
    updateProject((current) => ({ ...current, title: value }));
  }

  function resetProject() {
    if (!confirm('Opravdu vytvořit nový projekt?')) {
      return;
    }

    playbackRef.current.stop();
    setProject(createEmptyProject());
    setCursor({ measure: 0, slot: 0 });
    setSelectedEventId(null);
  }

  function importProject(file: File) {
    readProjectFile(file)
      .then((loaded) => {
        setProject(loaded);
        setStatus('Projekt otevřen');
      })
      .catch((error: Error) => alert(error.message));
  }

  function play() {
    playbackRef.current.play(project, setPlayingEventId);
  }

  function stop() {
    playbackRef.current.stop();
    setPlayingEventId(null);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">Quartet Workspace</div>

        <button type="button" onClick={resetProject}>
          Nový
        </button>

        <button
          type="button"
          className="primary"
          onClick={() => {
            saveProject(project);
            setStatus('Uloženo');
          }}
        >
          Uložit
        </button>

        <button type="button" onClick={() => downloadProject(project)}>
          Export
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          Otevřít
        </button>

        <input
          ref={fileInputRef}
          hidden
          type="file"
          accept="application/json,.json,.quartet.json"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              importProject(file);
            }

            event.currentTarget.value = '';
          }}
        />

        <span className="header-spacer" />

        <button type="button" className="play-button" onClick={play}>
          ▶ Přehrát
        </button>

        <button type="button" onClick={stop}>
          ■ Stop
        </button>

        <span className="status">{status}</span>
      </header>

      {/* Přesně tři přímé položky gridu: levý panel, editor, pravý panel. */}
      <div className="workspace">
        <VoicePanel
          activeVoice={activeVoice}
          onVoiceChange={setActiveVoice}
        />

        <main className="editor-main">
          <div className="editor-toolbar title-row">
            <label>
              Název
              <input
                value={project.title}
                onChange={(event) => changeTitle(event.target.value)}
              />
            </label>

            <label>
              Tempo
              <input
                className="tempo-input"
                type="number"
                min="30"
                max="300"
                value={project.tempo}
                onChange={(event) =>
                  updateProject((current) => ({
                    ...current,
                    tempo: Math.max(
                      30,
                      Math.min(300, Number(event.target.value) || 96),
                    ),
                  }))
                }
              />
            </label>

            <span>
              Kurzor: takt {cursor.measure + 1}, pozice {cursor.slot + 1}
            </span>
          </div>

          <NotationToolbar
            duration={duration}
            layoutMode={project.layoutMode}
            onDurationChange={setDuration}
            onLayoutChange={(layoutMode) =>
              updateProject((current) => ({
                ...current,
                layoutMode,
              }))
            }
          />

          <div
            className="editor-scroll"
            onWheel={(event) => {
              if (!event.ctrlKey) {
                return;
              }

              event.preventDefault();

              setZoom((current) =>
                Math.max(
                  0.55,
                  Math.min(
                    1.85,
                    current + (event.deltaY < 0 ? 0.1 : -0.1),
                  ),
                ),
              );
            }}
          >
            <div className="zoom-hint">
              Ctrl + kolečko: {Math.round(zoom * 100)} %
            </div>

            <div
              className="zoom-stage"
              style={{ transform: `scale(${zoom})` }}
            >
              <ScoreRenderer
                project={project}
                activeVoice={activeVoice}
                selectedEventId={selectedEventId}
                playingEventId={playingEventId}
                onSelectEvent={(event) => {
                  setSelectedEventId(event.id);
                  setActiveVoice(event.voiceId);
                }}
              />
            </div>
          </div>
        </main>

        <aside className="right-panel">
          <div className="panel-heading">Vybraná nota</div>

          {selectedEvent ? (
            <>
              <p>
                <strong>{selectedEvent.voiceId.toUpperCase()}</strong>
                {' · '}
                MIDI {selectedEvent.midi}
                <br />
                takt {selectedEvent.measure + 1}
              </p>

              <label>
                Text / slabika
                <textarea
                  value={selectedEvent.lyric ?? ''}
                  onChange={(event) => changeLyric(event.target.value)}
                  placeholder="např. A-"
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  updateProject((current) => ({
                    ...current,
                    events: current.events.map((event) =>
                      event.id === selectedEvent.id
                        ? {
                            ...event,
                            midi: defaultMidiForVoice(event.voiceId),
                          }
                        : event,
                    ),
                  }));
                }}
              >
                Vrátit výšku hlasu
              </button>
            </>
          ) : (
            <p className="muted">
              Vyber notu v partituře. Pak jí můžeš přiřadit slabiku textu.
            </p>
          )}

          <GriffPanel onInsertNote={insertNote} />
        </aside>
      </div>
    </div>
  );
}