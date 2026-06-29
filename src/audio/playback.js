let context;
function ctx() { context ??= new AudioContext(); return context; }
export function midiToFrequency(midi) { return 440 * 2 ** ((midi - 69) / 12); }
export function playMidi(midi, seconds = 0.35, when = 0, gain = 0.08) {
  const audio = ctx();
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = 'triangle';
  osc.frequency.value = midiToFrequency(midi);
  amp.gain.setValueAtTime(0.0001, audio.currentTime + when);
  amp.gain.exponentialRampToValueAtTime(gain, audio.currentTime + when + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + when + seconds);
  osc.connect(amp).connect(audio.destination);
  osc.start(audio.currentTime + when);
  osc.stop(audio.currentTime + when + seconds + 0.03);
}
export function playScore(score, muted = new Set()) {
  const secPerTick = 60 / score.tempo / 4;
  for (const voice of Object.values(score.voices)) {
    if (muted.has(voice.id)) continue;
    for (const event of voice.events.filter((e) => e.type === 'note')) {
      const absoluteTick = event.measureIndex * 16 + event.startTick;
      playMidi(event.midi, Math.max(0.1, event.durationTicks * secPerTick * 0.88), absoluteTick * secPerTick, 0.05);
    }
  }
}
