import { voiceOrder, type Score, type ScoreLayout, type VoiceId } from '../../domain/music';

type Props = {
  score: Score;
  layout: ScoreLayout;
  activeVoice: VoiceId;
  playingVoice: VoiceId | null;
};

const pitchName = (midi: number) => {
  const names = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'H'];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
};

export function ScorePreview({ score, layout, activeVoice, playingVoice }: Props) {
  const displayed = layout === 'four-staves' ? voiceOrder : ['soprano', 'alto', 'tenor', 'bass'] as VoiceId[];
  return (
    <section className="score-panel">
      <div className="score-meta">
        <h2>{score.title}</h2>
        <span>{score.tempo} BPM · {score.timeSignature.join('/')}</span>
      </div>
      <div className={layout === 'four-staves' ? 'staves four' : 'staves choir'}>
        {displayed.map((voiceId) => {
          const voice = score.voices[voiceId];
          return (
            <div className={`staff ${voiceId === activeVoice ? 'active' : ''} ${voiceId === playingVoice ? 'playing' : ''}`} key={voiceId}>
              <div className="voice-name">{voice.label}</div>
              <div className="staff-lines" />
              <div className="notes">
                {voice.notes.length === 0 ? <span className="empty-notes">Zatím bez not</span> : voice.notes.map((n) => (
                  <div className="note-chip" key={n.id} title={`${pitchName(n.midi)} · ${n.durationTicks} ticks`}>
                    <span className="note-head">●</span>
                    <span>{pitchName(n.midi)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="preview-note">Náhled je záměrně jednoduchý. Hudební data jsou oddělená od renderu a připravená pro pozdější VexFlow/MusicXML renderer.</p>
    </section>
  );
}
