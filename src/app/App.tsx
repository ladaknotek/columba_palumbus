import { useEffect, useMemo, useRef, useState } from 'react';

import {
  advanceCursor,
  createEmptyProject,
  defaultMidiForVoice,
  getCursorAfterLastVoiceEvent,
  type CursorPosition,
  type Duration,
  type NoteEvent,
  type ScoreProject,
  type SoundStyle,
  type VoiceId,
} from '../domain/score';

import {
  GriffPanel,
  NotationToolbar,
  VoicePanel,
} from '../features/editor/EditorControls';
import { ScoreRenderer } from '../features/editor/ScoreRenderer';
import { PlaybackControls } from '../features/playback/PlaybackControls';
import { PlaybackEngine } from '../features/playback/playbackEngine';
import {
  downloadProject,
  loadProject,
  readProjectFile,
  saveProject,
} from '../features/projects/projectStorage';

const SYSTEM_MEASURES = 4;

export function App() {
  const [project, setProject] = useState<ScoreProject>(
    () => loadProject() ?? createEmptyProject(),
  );

  const [activeVoice, setActiveVoice] = useState<VoiceId>('s');
  const [duration, setDuration] = useState<Duration>('quarter');
  const [cursor, setCursor] = useState<CursorPosition>({
    measure: 0,
    slot: 0,
  });
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [playingEventId, setPlayingEventId] = useState<string | null>(null);
  const [status, setStatus] = useState('Připraveno');
  const [zoom, setZoom] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const playbackRef = useRef(new PlaybackEngine());

  /**
   * Při prvním otevření existujícího projektu nezačínáme vždy na taktu 1.
   * Výchozí hlas je soprán, proto kurzor přesuneme za poslední sopránovou notu.
   */
  useEffect(() => {
    moveCursorToVoiceEnd('s');
    // Úmyslně jen při prvním načtení aplikace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave se zpožděním: při rychlém zápisu neukládáme po každém stisku zvlášť.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveProject(project);
      setStatus('Uloženo lokálně');
    }, 350);

    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('input, textarea, select')) {
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

  function requiredMeasureCount(measure: number): number {
    return Math.max(
      SYSTEM_MEASURES,
      (Math.floor(measure / SYSTEM_MEASURES) + 1) * SYSTEM_MEASURES,
    );
  }

  /**
   * Kurzor může být hned za posledním existujícím taktem.
   * V tom případě rovnou vytvoříme další systém, aby byl kurzor viditelný
   * a šlo do něj okamžitě psát.
   */
  function ensureCursorIsVisible(position: CursorPosition) {
    const minimumMeasureCount = requiredMeasureCount(position.measure);

    setProject((current) => {
      if (current.measureCount >= minimumMeasureCount) {
        return current;
      }

      return {
        ...current,
        measureCount: minimumMeasureCount,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function setInsertionCursor(position: CursorPosition) {
    setCursor(position);
    setSelectedEventId(null);
    ensureCursorIsVisible(position);
  }

  function moveCursorToVoiceEnd(voiceId: VoiceId) {
    const position = getCursorAfterLastVoiceEvent(project.events, voiceId);
    setCursor(position);
    ensureCursorIsVisible(position);
  }

  /**
   * Přepnutí hlasu nikdy nepřebírá kurzor z předchozího hlasu.
   * Každý hlas má vlastní logickou „pracovní pozici“ za svou poslední notou.
   */
  function activateVoice(voiceId: VoiceId) {
    setActiveVoice(voiceId);
    setSelectedEventId(null);
    moveCursorToVoiceEnd(voiceId);
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

    const nextCursor = advanceCursor(cursor, duration);
    const minimumMeasureCount = requiredMeasureCount(nextCursor.measure);

    updateProject((current) => ({
      ...current,
      measureCount: Math.max(current.measureCount, minimumMeasureCount),
      events: [
        ...current.events.filter(
          (existing) => !(
            existing.voiceId === activeVoice
            && existing.measure === cursor.measure
            && existing.slot === cursor.slot
          ),
        ),
        event,
      ],
    }));

    setSelectedEventId(id);

    // Okamžitá zvuková odezva při zápisu noty.
    playbackRef.current.previewNote({
      midi,
      duration,
      tempo: project.tempo,
      soundStyle: project.playbackSound,
    });

    setCursor(nextCursor);
  }

  function deleteSelectedOrLast() {
    const target = selectedEventId
      ? project.events.find((event) => event.id === selectedEventId)
      : [...project.events]
        .filter((item) => item.voiceId === activeVoice)
        .sort((left, right) => (
          right.measure - left.measure || right.slot - left.slot
        ))
        .at(0);

    if (!target) {
      return;
    }

    updateProject((current) => ({
      ...current,
      events: current.events.filter((event) => event.id !== target.id),
    }));

    // Po Backspace je přirozené pokračovat přesně na uvolněném místě.
    setCursor({ measure: target.measure, slot: target.slot });
    setSelectedEventId(null);
  }

  const selectedEvent = useMemo(
    () => project.events.find((event) => event.id === selectedEventId) ?? null,
    [project.events, selectedEventId],
  );

  function selectEvent(event: NoteEvent) {
    setSelectedEventId(event.id);
    setActiveVoice(event.voiceId);

    // Kliknutí na notu je výběr pro text a vlastnosti, ne příkaz k přepsání.
    // Zápis dál pokračuje za poslední notou stejného hlasu.
    moveCursorToVoiceEnd(event.voiceId);
  }

  function changeLyric(value: string) {
    if (!selectedEventId) {
      return;
    }

    updateProject((current) => ({
      ...current,
      events: current.events.map((event) => (
        event.id === selectedEventId
          ? { ...event, lyric: value || undefined }
          : event
      )),
    }));
  }

  function changeTitle(value: string) {
    updateProject((current) => ({ ...current, title: value }));
  }

  function changePlaybackSound(soundStyle: SoundStyle) {
    updateProject((current) => ({ ...current, playbackSound: soundStyle }));
  }

  function resetProject() {
    if (!confirm('Opravdu vytvořit nový projekt?')) {
      return;
    }

    playbackRef.current.stop();
    setProject(createEmptyProject());
    setActiveVoice('s');
    setCursor({ measure: 0, slot: 0 });
    setSelectedEventId(null);
    setPlayingEventId(null);
  }

  function importProject(file: File) {
    readProjectFile(file)
      .then((loaded) => {
        playbackRef.current.stop();

        const firstCursor = getCursorAfterLastVoiceEvent(
          loaded.events,
          activeVoice,
        );

        setProject({
          ...loaded,
          measureCount: Math.max(
            loaded.measureCount,
            requiredMeasureCount(firstCursor.measure),
          ),
        });
        setCursor(firstCursor);
        setSelectedEventId(null);
        setPlayingEventId(null);
        setStatus('Projekt otevřen');
      })
      .catch((error: Error) => alert(error.message));
  }

  function play() {
    playbackRef.current.play(
      project,
      project.playbackSound,
      setPlayingEventId,
    );
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

        <button type="button" onClick={() => fileInputRef.current?.click()}>
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

        <PlaybackControls
          soundStyle={project.playbackSound}
          onSoundStyleChange={changePlaybackSound}
          onPlay={play}
          onStop={stop}
        />

        <span className="status">{status}</span>
      </header>

      <div className="workspace">
        <VoicePanel
          activeVoice={activeVoice}
          onVoiceChange={activateVoice}
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
                onChange={(event) => (
                  updateProject((current) => ({
                    ...current,
                    tempo: Math.max(
                      30,
                      Math.min(300, Number(event.target.value) || 96),
                    ),
                  }))
                )}
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
            onLayoutChange={(layoutMode) => (
              updateProject((current) => ({
                ...current,
                layoutMode,
              }))
            )}
          />

          <div
            className="editor-scroll"
            onWheel={(event) => {
              if (!event.ctrlKey) {
                return;
              }

              event.preventDefault();

              setZoom((current) => (
                Math.max(
                  0.55,
                  Math.min(
                    1.85,
                    current + (event.deltaY < 0 ? 0.1 : -0.1),
                  ),
                )
              ));
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
                cursor={cursor}
                selectedEventId={selectedEventId}
                playingEventId={playingEventId}
                onSelectEvent={selectEvent}
                onCursorChange={setInsertionCursor}
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
                    events: current.events.map((event) => (
                      event.id === selectedEvent.id
                        ? {
                            ...event,
                            midi: defaultMidiForVoice(event.voiceId),
                          }
                        : event
                    )),
                  }));
                }}
              >
                Vrátit výšku hlasu
              </button>
            </>
          ) : (
            <p className="muted">
              Klikni do aktivní osnovy pro umístění kurzoru nebo vyber notu
              pro přidání textu.
            </p>
          )}

          <GriffPanel onInsertNote={insertNote} />
        </aside>
      </div>
    </div>
  );
}
