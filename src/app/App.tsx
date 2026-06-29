import { useEffect, useMemo, useRef, useState } from 'react';
import { voiceOrder, type NoteLength, type VoiceId } from '../domain/music';
import { AccordionKeyboard } from '../features/editor/AccordionKeyboard';
import { ScorePreview } from '../features/editor/ScorePreview';
import { useScoreStore } from '../features/editor/scoreStore';
import { AudioEngine } from '../features/playback/audioEngine';
import { defaultBGriffProfile } from '../features/settings/accordionMapping';

const plainKeyboardMap: Record<string, number> = { c: 60, d: 62, e: 64, f: 65, g: 67, a: 69, h: 71 };
const lengths: { id: NoteLength; label: string; symbol: string }[] = [
  { id: 'whole', label: 'Celá', symbol: '𝅝' },
  { id: 'half', label: 'Půlová', symbol: '𝅗𝅥' },
  { id: 'quarter', label: 'Čtvrťová', symbol: '♩' },
  { id: 'eighth', label: 'Osminová', symbol: '♪' },
  { id: 'sixteenth', label: 'Šestnáctinová', symbol: '𝅘𝅥𝅯' },
];

export function App() {
  const { state, dispatch } = useScoreStore();
  const audio = useMemo(() => new AudioEngine(), []);
  const [playingVoice, setPlayingVoice] = useState<VoiceId | null>(null);
  const [inputMode, setInputMode] = useState<'letters' | 'accordion'>('letters');
  const held = useRef(new Set<string>());

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const key = event.key.toLowerCase();
      if (key === 'backspace') { event.preventDefault(); dispatch({ type: 'deleteLast' }); return; }
      const midi = inputMode === 'letters' ? plainKeyboardMap[key] : defaultBGriffProfile.keyboardToMidi[key];
      if (midi === undefined || held.current.has(key)) return;
      held.current.add(key);
      dispatch({ type: 'appendNote', midi });
      audio.playTone(midi);
    };
    const onKeyUp = (event: KeyboardEvent) => held.current.delete(event.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      audio.stop();
    };
  }, [audio, dispatch, inputMode]);

  const addNote = (midi: number) => { dispatch({ type: 'appendNote', midi }); audio.playTone(midi); };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Quartet Workspace · v0.1</p>
          <h1>Pracovní prostor pro vokální aranže</h1>
        </div>
        <div className="top-actions">
          <button className="secondary" onClick={() => dispatch({ type: 'reset' })}>Nová skladba</button>
          <button className="primary" onClick={() => audio.playScore(state.score, setPlayingVoice)}>▶ Přehrát</button>
          <button className="secondary" onClick={() => { audio.stop(); setPlayingVoice(null); }}>■ Stop</button>
        </div>
      </header>

      <section className="toolbar">
        <label>Tempo <input type="number" min="30" max="240" value={state.score.tempo} onChange={(e) => dispatch({ type: 'setTempo', tempo: Number(e.target.value) || 92 })} /> BPM</label>
        <div className="toggle-group">
          <button className={state.layout === 'four-staves' ? 'selected' : ''} onClick={() => dispatch({ type: 'setLayout', layout: 'four-staves' })}>4 osnovy</button>
          <button className={state.layout === 'choir-two-staves' ? 'selected' : ''} onClick={() => dispatch({ type: 'setLayout', layout: 'choir-two-staves' })}>Sbor 2+2</button>
        </div>
        <div className="toggle-group">
          <button className={inputMode === 'letters' ? 'selected' : ''} onClick={() => setInputMode('letters')}>C–H klávesy</button>
          <button className={inputMode === 'accordion' ? 'selected' : ''} onClick={() => setInputMode('accordion')}>B-griff klávesy</button>
        </div>
      </section>

      <div className="workspace-grid">
        <aside className="sidebar">
          <section>
            <h2>Aktivní hlas</h2>
            <div className="voice-list">
              {voiceOrder.map((voiceId) => {
                const voice = state.score.voices[voiceId];
                return <div className="voice-item" key={voiceId}>
                  <button className={state.activeVoice === voiceId ? 'voice selected' : 'voice'} onClick={() => dispatch({ type: 'selectVoice', voiceId })}>{voice.label}</button>
                  <button className="mute" aria-label={`Ztlumit ${voice.label}`} onClick={() => dispatch({ type: 'toggleMute', voiceId })}>{voice.muted ? '🔇' : '🔊'}</button>
                </div>;
              })}
            </div>
          </section>
          <section>
            <h2>Délka noty</h2>
            <div className="length-list">
              {lengths.map((length) => <button key={length.id} className={state.selectedLength === length.id ? 'length selected' : 'length'} onClick={() => dispatch({ type: 'selectLength', length: length.id })}><span>{length.symbol}</span>{length.label}</button>)}
            </div>
          </section>
          <section className="help">
            <h2>Ovládání</h2>
            <p><kbd>Backspace</kbd> smaže poslední notu aktivního hlasu.</p>
            <p>Režim C–H: <kbd>C</kbd> až <kbd>H</kbd>.</p>
            <p>Režim B-griff: Q–I, A–K a Z–M dle uloženého profilu.</p>
          </section>
        </aside>

        <section className="editor-area">
          <ScorePreview score={state.score} layout={state.layout} activeVoice={state.activeVoice} playingVoice={playingVoice} />
          <AccordionKeyboard onNote={addNote} />
        </section>
      </div>

      <footer>Architektura v0.1: doménový model not → editorový stav → vstupy → audio → budoucí renderer/export. Nejprve stabilní jádro, potom VexFlow/MusicXML.</footer>
    </main>
  );
}
