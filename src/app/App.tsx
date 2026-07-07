import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  advanceCursor,
  createEmptyProject,
  defaultMidiForVoice,
  durationToTicks,
  getCursorAfterLastVoiceEvent,
  quantizationToTicks,
  tickToBeatNumber,
  tickToMeasure,
  type CursorPosition,
  type Duration,
  type EntryMode,
  type InputMode,
  type NoteEvent,
  type RecordQuantization,
  type ScoreProject,
  type ScoreViewMode,
  type SoundStyle,
  type VoiceId,
} from '../domain/score';

import {
  NotationToolbar,
  VoicePanel,
} from '../features/editor/EditorControls';
import { InputPanel } from '../features/editor/InputPanel';
import { ScoreRenderer } from '../features/editor/ScoreRenderer';
import {
  loadInputSettings,
  saveInputSettings,
  type InputSettings,
} from '../features/input/inputSettings';
import {
  midiForKeyboardKey,
  normalizeKeyboardKey,
} from '../features/input/keyboardMaps';
import { PlaybackControls } from '../features/playback/PlaybackControls';
import { PlaybackEngine } from '../features/playback/playbackEngine';
import {
  downloadProject,
  loadProject,
  readProjectFile,
  saveProject,
} from '../features/projects/projectStorage';
import { Metronome } from '../features/recording/Metronome';

const SYSTEM_MEASURES = 4;

interface HeldLiveInput {
  midi: number;
  voiceId: VoiceId;
  startedAt: number;
}

interface LiveRecordingSession {
  baseTick: number;
  startedAt: number;
  tempo: number;
  quantizationTicks: number;
  startedMetronome: boolean;
}

export function App() {
  const [project, setProject] = useState<ScoreProject>(
    () => loadProject() ?? createEmptyProject(),
  );
  const [inputSettings, setInputSettings] = useState<InputSettings>(
    () => loadInputSettings(),
  );

  const [activeVoice, setActiveVoice] = useState<VoiceId>('s');
  const [duration, setDuration] = useState<Duration>('quarter');
  const [viewMode, setViewMode] = useState<ScoreViewMode>('score');
  const [entryMode, setEntryMode] = useState<EntryMode>('step');
  const [quantization, setQuantization] = useState<RecordQuantization>('eighth');
  const [cursor, setCursor] = useState<CursorPosition>({ tick: 0 });
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [playingEventId, setPlayingEventId] = useState<string | null>(null);
  const [status, setStatus] = useState('Připraveno');
  const [zoom, setZoom] = useState(1);
  const [metronomeRunning, setMetronomeRunning] = useState(false);
  const [metronomeBeat, setMetronomeBeat] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const lyricInputRef = useRef<HTMLInputElement>(null);
  const playbackRef = useRef(new PlaybackEngine());
  const metronomeRef = useRef(new Metronome());
  const editorScrollRef = useRef<HTMLDivElement>(null);

  // Refs dovolují klávesovým událostem pracovat se zcela aktuálním stavem
  // i při rychlém hraní několika not za sebou mezi dvěma React rendery.
  const projectRef = useRef(project);
  const activeVoiceRef = useRef(activeVoice);
  const durationRef = useRef(duration);
  const inputModeRef = useRef<InputMode>(inputSettings.inputMode);
  const bGriffBaseRef = useRef(inputSettings.bGriffBaseMidi);
  const entryModeRef = useRef(entryMode);
  const cursorRef = useRef(cursor);
  const isRecordingRef = useRef(isRecording);
  const recordingSessionRef = useRef<LiveRecordingSession | null>(null);
  const heldLiveInputsRef = useRef(new Map<string, HeldLiveInput>());

  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { activeVoiceRef.current = activeVoice; }, [activeVoice]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { inputModeRef.current = inputSettings.inputMode; }, [inputSettings.inputMode]);
  useEffect(() => { bGriffBaseRef.current = inputSettings.bGriffBaseMidi; }, [inputSettings.bGriffBaseMidi]);
  useEffect(() => { entryModeRef.current = entryMode; }, [entryMode]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  /**
   * Ctrl + kolečko zachytíme nativním nepasivním listenerem přímo na ploše
   * partitury. Chrome pak nezvětší celou stránku, pouze notový editor.
   */
  useEffect(() => {
    const editorElement = editorScrollRef.current;

    if (!editorElement) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();
      setZoom((current) => Math.max(
        0.55,
        Math.min(1.85, current + (event.deltaY < 0 ? 0.1 : -0.1)),
      ));
    };

    editorElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => editorElement.removeEventListener('wheel', handleWheel);
  }, []);

  /** Při načtení existující skladby pokračujeme za poslední sopránovou notou. */
  useEffect(() => {
    moveCursorToVoiceEnd('s');
    // Úmyslně jen při prvním načtení.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Autosave projektu. Nastavení klávesnice se ukládá zvlášť jako uživatelská preference. */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveProject(project);
      setStatus((current) => current.startsWith('Záznam') ? current : 'Uloženo lokálně');
    }, 350);

    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    saveInputSettings(inputSettings);
  }, [inputSettings]);

  useEffect(() => {
    return () => {
      playbackRef.current.stop();
      metronomeRef.current.stop();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLElement
        && target.matches('input, textarea, select')
      ) {
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        return;
      }

      const midi = midiForKeyboardKey(
        event.key,
        inputModeRef.current,
        bGriffBaseRef.current,
      );

      if (midi !== null) {
        event.preventDefault();

        if (event.repeat) {
          return;
        }

        const sourceId = `keyboard:${normalizeKeyboardKey(event.key)}`;

        if (entryModeRef.current === 'live' && isRecordingRef.current) {
          startLiveInput(sourceId, midi);
        } else {
          insertStepNote(midi);
        }

        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        deleteSelectedOrLast();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (entryModeRef.current !== 'live' || !isRecordingRef.current) {
        return;
      }

      const midi = midiForKeyboardKey(
        event.key,
        inputModeRef.current,
        bGriffBaseRef.current,
      );

      if (midi === null) {
        return;
      }

      event.preventDefault();
      endLiveInput(`keyboard:${normalizeKeyboardKey(event.key)}`);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  function updateProject(mutator: (current: ScoreProject) => ScoreProject) {
    setProject((current) => {
      const next = {
        ...mutator(current),
        updatedAt: new Date().toISOString(),
      };

      projectRef.current = next;
      return next;
    });
  }

  function requiredMeasureCountForTick(tick: number): number {
    const measure = tickToMeasure(tick);
    return Math.max(
      SYSTEM_MEASURES,
      (Math.floor(measure / SYSTEM_MEASURES) + 1) * SYSTEM_MEASURES,
    );
  }

  function ensureTickIsVisible(tick: number) {
    const requiredMeasureCount = requiredMeasureCountForTick(tick);

    updateProject((current) => (
      current.measureCount >= requiredMeasureCount
        ? current
        : { ...current, measureCount: requiredMeasureCount }
    ));
  }

  function setCursorPosition(position: CursorPosition, ensureVisible = true) {
    const normalized = { tick: Math.max(0, Math.round(position.tick)) };
    cursorRef.current = normalized;
    setCursor(normalized);

    if (ensureVisible) {
      ensureTickIsVisible(normalized.tick);
    }
  }

  function moveCursorToVoiceEnd(voiceId: VoiceId) {
    const position = getCursorAfterLastVoiceEvent(projectRef.current.events, voiceId);
    setCursorPosition(position);
  }

  function activateVoice(voiceId: VoiceId) {
    activeVoiceRef.current = voiceId;
    setActiveVoice(voiceId);
    setSelectedEventId(null);
    moveCursorToVoiceEnd(voiceId);
  }

  /** Krokový zápis používá předvolenou délku a hned posune kurzor. */
  function insertStepNote(midi: number) {
    const voiceId = activeVoiceRef.current;
    const insertionPosition = cursorRef.current;
    const noteDuration = durationRef.current;
    const event: NoteEvent = {
      id: crypto.randomUUID(),
      voiceId,
      startTick: insertionPosition.tick,
      durationTicks: durationToTicks(noteDuration),
      midi,
    };
    const nextCursor = advanceCursor(insertionPosition, noteDuration);

    updateProject((current) => ({
      ...current,
      measureCount: Math.max(
        current.measureCount,
        requiredMeasureCountForTick(nextCursor.tick),
      ),
      events: [
        ...current.events.filter((existing) => !(
          existing.voiceId === voiceId
          && existing.startTick === insertionPosition.tick
        )),
        event,
      ],
    }));

    setSelectedEventId(event.id);
    playbackRef.current.previewNote({
      midi,
      duration: noteDuration,
      tempo: projectRef.current.tempo,
      soundStyle: projectRef.current.playbackSound,
    });
    setCursorPosition(nextCursor, false);
  }

  function deleteSelectedOrLast() {
    const target = selectedEventId
      ? projectRef.current.events.find((event) => event.id === selectedEventId)
      : [...projectRef.current.events]
        .filter((event) => event.voiceId === activeVoiceRef.current)
        .sort((left, right) => right.startTick - left.startTick)
        .at(0);

    if (!target) {
      return;
    }

    updateProject((current) => ({
      ...current,
      events: current.events.filter((event) => event.id !== target.id),
    }));

    setCursorPosition({ tick: target.startTick }, false);
    setSelectedEventId(null);
  }

  function startMetronome() {
    metronomeRef.current.start(projectRef.current.tempo, setMetronomeBeat);
    setMetronomeRunning(true);
  }

  function stopMetronome() {
    metronomeRef.current.stop();
    setMetronomeRunning(false);
    setMetronomeBeat(null);
  }

  function toggleMetronome() {
    if (metronomeRef.current.isRunning) {
      stopMetronome();
    } else {
      startMetronome();
    }
  }

  function startLiveRecording() {
    if (isRecordingRef.current) {
      stopLiveRecording();
      return;
    }

    const startedMetronome = !metronomeRef.current.isRunning;

    if (startedMetronome) {
      startMetronome();
    }

    recordingSessionRef.current = {
      baseTick: cursorRef.current.tick,
      startedAt: performance.now(),
      tempo: projectRef.current.tempo,
      quantizationTicks: quantizationToTicks(quantization),
      startedMetronome,
    };

    isRecordingRef.current = true;
    setIsRecording(true);
    setStatus('Záznam běží');
  }

  function stopLiveRecording() {
    const activeInputs = [...heldLiveInputsRef.current.keys()];

    for (const sourceId of activeInputs) {
      endLiveInput(sourceId);
    }

    const session = recordingSessionRef.current;
    recordingSessionRef.current = null;
    isRecordingRef.current = false;
    setIsRecording(false);

    if (session?.startedMetronome) {
      stopMetronome();
    }

    setStatus('Záznam ukončen');
  }

  /**
   * Živý záznam je zatím monofonní pro aktivní hlas. Start a délka se při
   * puštění klávesy zaokrouhlí na zvolenou rytmickou mřížku.
   */
  function startLiveInput(sourceId: string, midi: number) {
    const session = recordingSessionRef.current;

    if (!session || heldLiveInputsRef.current.has(sourceId)) {
      return;
    }

    heldLiveInputsRef.current.set(sourceId, {
      midi,
      voiceId: activeVoiceRef.current,
      startedAt: performance.now(),
    });

    playbackRef.current.previewNote({
      midi,
      duration: 'quarter',
      tempo: session.tempo,
      soundStyle: projectRef.current.playbackSound,
    });
  }

  function endLiveInput(sourceId: string) {
    const held = heldLiveInputsRef.current.get(sourceId);
    const session = recordingSessionRef.current;

    if (!held || !session) {
      return;
    }

    heldLiveInputsRef.current.delete(sourceId);

    const millisecondsPerTick = 60_000 / session.tempo / 4;
    const elapsedBeforeStart = held.startedAt - session.startedAt;
    const heldMilliseconds = Math.max(1, performance.now() - held.startedAt);

    const startOffsetTicks = snapTicks(
      elapsedBeforeStart / millisecondsPerTick,
      session.quantizationTicks,
    );
    const durationTicks = Math.max(
      session.quantizationTicks,
      snapTicks(
        heldMilliseconds / millisecondsPerTick,
        session.quantizationTicks,
      ),
    );
    const startTick = session.baseTick + startOffsetTicks;
    const endTick = startTick + durationTicks;

    const event: NoteEvent = {
      id: crypto.randomUUID(),
      voiceId: held.voiceId,
      startTick,
      durationTicks,
      midi: held.midi,
    };

    updateProject((current) => ({
      ...current,
      measureCount: Math.max(
        current.measureCount,
        requiredMeasureCountForTick(endTick),
      ),
      events: [
        ...current.events.filter((existing) => !(
          existing.voiceId === held.voiceId
          && existing.startTick === startTick
        )),
        event,
      ],
    }));

    setSelectedEventId(event.id);

    if (held.voiceId === activeVoiceRef.current && endTick >= cursorRef.current.tick) {
      setCursorPosition({ tick: endTick }, false);
    }
  }

  const selectedEvent = useMemo(
    () => project.events.find((event) => event.id === selectedEventId) ?? null,
    [project.events, selectedEventId],
  );

  function selectEvent(event: NoteEvent) {
    activeVoiceRef.current = event.voiceId;
    setActiveVoice(event.voiceId);
    setSelectedEventId(event.id);
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

  /**
   * Psaní textu písně je po slabikách: mezerník uloží slabiku a přeskočí
   * na další notu stejného hlasu; pomlčka navíc uloží spojení mezi slabikami.
   */
  function commitLyricAndMove(connector?: 'hyphen') {
    const current = projectRef.current.events.find(
      (event) => event.id === selectedEventId,
    );

    if (!current) {
      return;
    }

    const next = projectRef.current.events
      .filter((event) => (
        event.voiceId === current.voiceId
        && event.startTick > current.startTick
      ))
      .sort((left, right) => left.startTick - right.startTick)
      .at(0);

    updateProject((project) => ({
      ...project,
      events: project.events.map((event) => (
        event.id === current.id
          ? {
            ...event,
            lyric: event.lyric?.trim() || undefined,
            lyricConnector: connector,
          }
          : event
      )),
    }));

    if (!next) {
      setStatus('V tomto hlase už není další nota pro text.');
      return;
    }

    setSelectedEventId(next.id);
    activeVoiceRef.current = next.voiceId;
    setActiveVoice(next.voiceId);

    window.setTimeout(() => lyricInputRef.current?.focus(), 0);
  }

  function handleLyricKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === ' ') {
      event.preventDefault();
      commitLyricAndMove();
      return;
    }

    if (event.key === '-') {
      event.preventDefault();
      commitLyricAndMove('hyphen');
    }
  }

  function changeTitle(value: string) {
    updateProject((current) => ({ ...current, title: value }));
  }

  function changeTempo(value: number) {
    const tempo = Math.max(30, Math.min(300, Math.round(value || 96)));
    updateProject((current) => ({ ...current, tempo }));

    if (metronomeRef.current.isRunning) {
      metronomeRef.current.start(tempo, setMetronomeBeat);
    }
  }

  function changePlaybackSound(soundStyle: SoundStyle) {
    updateProject((current) => ({ ...current, playbackSound: soundStyle }));
  }

  function changeInputMode(inputMode: InputMode) {
    inputModeRef.current = inputMode;
    setInputSettings((current) => ({ ...current, inputMode }));
  }

  function changeBGriffBaseMidi(bGriffBaseMidi: number) {
    const normalized = Math.max(24, Math.min(96, Math.round(bGriffBaseMidi)));
    bGriffBaseRef.current = normalized;
    setInputSettings((current) => ({ ...current, bGriffBaseMidi: normalized }));
  }

  function changeEntryMode(mode: EntryMode) {
    if (mode === 'step' && isRecordingRef.current) {
      stopLiveRecording();
    }

    entryModeRef.current = mode;
    setEntryMode(mode);
  }

  function resetProject() {
    if (!confirm('Opravdu vytvořit nový projekt?')) {
      return;
    }

    playbackRef.current.stop();
    stopLiveRecording();

    const empty = createEmptyProject();
    projectRef.current = empty;
    setProject(empty);
    activeVoiceRef.current = 's';
    setActiveVoice('s');
    setCursorPosition({ tick: 0 }, false);
    setSelectedEventId(null);
    setPlayingEventId(null);
  }

  function importProject(file: File) {
    readProjectFile(file)
      .then((loaded) => {
        playbackRef.current.stop();
        stopLiveRecording();

        projectRef.current = loaded;
        setProject(loaded);
        const position = getCursorAfterLastVoiceEvent(loaded.events, activeVoiceRef.current);
        setCursorPosition(position);
        setSelectedEventId(null);
        setPlayingEventId(null);
        setStatus('Projekt otevřen');
      })
      .catch((error: Error) => alert(error.message));
  }

  function play() {
    playbackRef.current.play(
      projectRef.current,
      projectRef.current.playbackSound,
      setPlayingEventId,
    );
  }

  function stop() {
    playbackRef.current.stop();
    setPlayingEventId(null);
  }

  const cursorMeasure = tickToMeasure(cursor.tick) + 1;
  const cursorBeat = tickToBeatNumber(cursor.tick);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">Quartet Workspace</div>

        <button type="button" onClick={resetProject}>Nový</button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            saveProject(projectRef.current);
            setStatus('Uloženo');
          }}
        >
          Uložit
        </button>
        <button type="button" onClick={() => downloadProject(projectRef.current)}>
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
        <VoicePanel activeVoice={activeVoice} onVoiceChange={activateVoice} />

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
                onChange={(event) => changeTempo(Number(event.target.value))}
              />
            </label>

            <span>Kurzor: takt {cursorMeasure}, doba {cursorBeat}</span>
          </div>

          <NotationToolbar
            duration={duration}
            layoutMode={project.layoutMode}
            viewMode={viewMode}
            inputMode={inputSettings.inputMode}
            entryMode={entryMode}
            quantization={quantization}
            metronomeRunning={metronomeRunning}
            isRecording={isRecording}
            currentBeat={metronomeBeat}
            onDurationChange={setDuration}
            onLayoutChange={(layoutMode) => updateProject((current) => ({
              ...current,
              layoutMode,
            }))}
            onViewModeChange={setViewMode}
            onInputModeChange={changeInputMode}
            onEntryModeChange={changeEntryMode}
            onQuantizationChange={setQuantization}
            onToggleMetronome={toggleMetronome}
            onToggleRecording={startLiveRecording}
          />

          <div ref={editorScrollRef} className="editor-scroll">
            <div className="zoom-hint">
              Ctrl + kolečko: {Math.round(zoom * 100)} %
            </div>

            <div className="zoom-stage" style={{ transform: `scale(${zoom})` }}>
              <ScoreRenderer
                project={project}
                activeVoice={activeVoice}
                viewMode={viewMode}
                cursor={cursor}
                selectedEventId={selectedEventId}
                playingEventId={playingEventId}
                onSelectEvent={selectEvent}
                onCursorChange={setCursorPosition}
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
                {' · '}MIDI {selectedEvent.midi}
                <br />
                takt {tickToMeasure(selectedEvent.startTick) + 1}
              </p>

              <label>
                Text / slabika
                <input
                  ref={lyricInputRef}
                  className="lyric-entry"
                  value={selectedEvent.lyric ?? ''}
                  onChange={(event) => changeLyric(event.target.value)}
                  onKeyDown={handleLyricKeyDown}
                  placeholder="např. ko"
                />
              </label>

              <p className="lyric-entry-hint">
                Mezerník uloží slabiku a přesune se na další notu. Pomlčka
                přidá spojení mezi slabikami a také přejde dál.
              </p>

              <button
                type="button"
                onClick={() => {
                  updateProject((current) => ({
                    ...current,
                    events: current.events.map((event) => (
                      event.id === selectedEvent.id
                        ? { ...event, midi: defaultMidiForVoice(event.voiceId) }
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
              Klikni do aktivní osnovy pro umístění kurzoru nebo vyber notu pro
              přidání textu.
            </p>
          )}

          <InputPanel
            inputMode={inputSettings.inputMode}
            bGriffBaseMidi={inputSettings.bGriffBaseMidi}
            isLiveRecording={isRecording}
            onInputModeChange={changeInputMode}
            onBaseMidiChange={changeBGriffBaseMidi}
            onInsertStepNote={insertStepNote}
            onLiveNoteStart={startLiveInput}
            onLiveNoteEnd={endLiveInput}
          />
        </aside>
      </div>
    </div>
  );
}

function snapTicks(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}
