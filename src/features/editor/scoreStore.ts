import { useMemo, useReducer } from 'react';
import { lengthToTicks, makeInitialScore, type NoteEvent, type NoteLength, type Score, type ScoreLayout, type VoiceId } from '../../domain/music';

type EditorState = {
  score: Score;
  activeVoice: VoiceId;
  selectedLength: NoteLength;
  layout: ScoreLayout;
  cursorTick: number;
};

type Action =
  | { type: 'selectVoice'; voiceId: VoiceId }
  | { type: 'selectLength'; length: NoteLength }
  | { type: 'setLayout'; layout: ScoreLayout }
  | { type: 'setTempo'; tempo: number }
  | { type: 'appendNote'; midi: number }
  | { type: 'deleteLast' }
  | { type: 'toggleMute'; voiceId: VoiceId }
  | { type: 'reset' };

const initial: EditorState = {
  score: makeInitialScore(),
  activeVoice: 'soprano',
  selectedLength: 'quarter',
  layout: 'four-staves',
  cursorTick: 0,
};

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'selectVoice': return { ...state, activeVoice: action.voiceId };
    case 'selectLength': return { ...state, selectedLength: action.length };
    case 'setLayout': return { ...state, layout: action.layout };
    case 'setTempo': return { ...state, score: { ...state.score, tempo: action.tempo } };
    case 'toggleMute': {
      const voice = state.score.voices[action.voiceId];
      return { ...state, score: { ...state.score, voices: { ...state.score.voices, [action.voiceId]: { ...voice, muted: !voice.muted } } } };
    }
    case 'appendNote': {
      const durationTicks = lengthToTicks[state.selectedLength];
      const note: NoteEvent = { id: crypto.randomUUID(), startTick: state.cursorTick, durationTicks, midi: action.midi };
      const voice = state.score.voices[state.activeVoice];
      return {
        ...state,
        score: { ...state.score, voices: { ...state.score.voices, [state.activeVoice]: { ...voice, notes: [...voice.notes, note] } } },
        cursorTick: state.cursorTick + durationTicks,
      };
    }
    case 'deleteLast': {
      const voice = state.score.voices[state.activeVoice];
      const notes = voice.notes.slice(0, -1);
      const last = voice.notes.at(-1);
      return {
        ...state,
        score: { ...state.score, voices: { ...state.score.voices, [state.activeVoice]: { ...voice, notes } } },
        cursorTick: Math.max(0, state.cursorTick - (last?.durationTicks ?? 0)),
      };
    }
    case 'reset': return { ...initial, score: makeInitialScore() };
  }
}

export function useScoreStore() {
  const [state, dispatch] = useReducer(reducer, initial);
  return useMemo(() => ({ state, dispatch }), [state]);
}
