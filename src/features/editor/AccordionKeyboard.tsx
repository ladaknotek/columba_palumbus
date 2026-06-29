import { defaultBGriffProfile } from '../settings/accordionMapping';

type Props = { onNote: (midi: number) => void };

const rows = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const midiToName = (midi: number) => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
};

export function AccordionKeyboard({ onNote }: Props) {
  return (
    <section className="accordion-panel">
      <div className="section-heading">
        <div>
          <h2>Pravá klaviatura</h2>
          <p>Výchozí profil: B-griff. Mapování je trvalé nastavení, ne rychlý přepínač.</p>
        </div>
      </div>
      <div className="button-grid">
        {rows.map((row) => (
          <div className="button-row" key={row.join('')}>
            {row.map((key) => {
              const midi = defaultBGriffProfile.keyboardToMidi[key];
              return (
                <button key={key} className="accordion-button" onClick={() => onNote(midi)}>
                  <span>{key.toUpperCase()}</span>
                  <strong>{midiToName(midi)}</strong>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
