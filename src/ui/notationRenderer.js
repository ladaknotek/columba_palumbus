import { VOICES, displayPitch } from '../models/score.js';

const PAGE_W = 1123; // A4 poměr při 96 dpi
const PAGE_H = 1587;
const MARGIN_X = 86;
const TITLE_AREA = 112;
const SYSTEM_GAP = 42;
const MEASURES_PER_SYSTEM = 4;

const esc = (value) => String(value ?? '').replace(/[<>&"']/g, (char) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[char]));

function pitchY(midi, staffTop) {
  // 3 px na půltón je záměrně čitelné pro první verzi; později nahradí diatonický layout.
  return staffTop + 45 - (midi - 60) * 3;
}

function stemDirection(voiceId) {
  // V sborovém zápisu jsou hlasy na společné osnově rozlišeny směrem nožiček.
  return voiceId === 'soprano' || voiceId === 'tenor' ? 'up' : 'down';
}

function staffLines(x, y, width) {
  let out = '';
  for (let line = 0; line < 5; line++) {
    out += `<line class="staff-line" x1="${x}" x2="${x + width}" y1="${y + line * 12}" y2="${y + line * 12}"/>`;
  }
  return out;
}

function clef(clef, x, y) {
  return `<text class="clef" x="${x}" y="${y + 39}">${clef === 'bass' ? '𝄢' : '𝄞'}</text>`;
}

function drawBrace(x, top, bottom) {
  const mid = (top + bottom) / 2;
  return `<path class="brace" d="M ${x + 16} ${top} C ${x - 7} ${top + 8}, ${x - 7} ${mid - 14}, ${x + 7} ${mid} C ${x - 7} ${mid + 14}, ${x - 7} ${bottom - 8}, ${x + 16} ${bottom}"/>`;
}

function drawSystem(score, state, startMeasure, pageIndex, systemIndex, isFirstSystem) {
  const isFour = score.settings.staffLayout === 'four';
  const rows = isFour
    ? [
      { label: 'Soprán', voices: [VOICES[0]], clef: 'treble' },
      { label: 'Alt', voices: [VOICES[1]], clef: 'treble' },
      { label: 'Tenor', voices: [VOICES[2]], clef: 'treble' },
      { label: 'Bas', voices: [VOICES[3]], clef: 'bass' },
    ]
    : [
      { label: 'Soprán / Alt', voices: [VOICES[0], VOICES[1]], clef: 'treble' },
      { label: 'Tenor / Bas', voices: [VOICES[2], VOICES[3]], clef: 'bass' },
    ];

  const rowGap = isFour ? 82 : 118;
  const systemTop = isFirstSystem ? TITLE_AREA + 32 : 40;
  const staffX = MARGIN_X + 55;
  const usableW = PAGE_W - MARGIN_X * 2 - 55;
  const measureW = usableW / MEASURES_PER_SYSTEM;
  const systemBottom = systemTop + (rows.length - 1) * rowGap + 48;
  const systemHeight = systemBottom - systemTop;
  let out = `<g class="system" data-page="${pageIndex}" data-system="${systemIndex}">`;

  out += drawBrace(MARGIN_X + 20, systemTop, systemBottom);
  out += `<line class="system-bar" x1="${staffX}" x2="${staffX}" y1="${systemTop}" y2="${systemBottom}"/>`;

  rows.forEach((row, rowIndex) => {
    const y = systemTop + rowIndex * rowGap;
    out += `<text class="staff-label" x="${MARGIN_X + 10}" y="${y + 20}">${row.label}</text>`;
    out += staffLines(staffX, y, usableW);
    out += clef(row.clef, staffX + 7, y);

    for (let i = 0; i <= MEASURES_PER_SYSTEM; i++) {
      const x = staffX + 72 + i * measureW;
      const measure = startMeasure + i;
      const thickness = i === MEASURES_PER_SYSTEM ? 'end-bar-line' : 'bar-line';
      out += `<line class="${thickness}" x1="${x}" x2="${x}" y1="${y}" y2="${y + 48}"/>`;
      if (rowIndex === 0 && i < MEASURES_PER_SYSTEM && measure < score.measures.length) {
        out += `<text class="measure-number" x="${x + 6}" y="${y - 9}">${measure + 1}</text>`;
      }
    }

    row.voices.forEach((voice) => {
      const events = score.voices[voice.id].events.filter((event) => event.measureIndex >= startMeasure && event.measureIndex < startMeasure + MEASURES_PER_SYSTEM);
      events.forEach((event) => {
        const localMeasure = event.measureIndex - startMeasure;
        const x = staffX + 88 + localMeasure * measureW + (event.startTick / 16) * (measureW - 18);
        if (event.type === 'rest') {
          out += `<text class="rest" x="${x}" y="${y + 31}">𝄽</text>`;
          return;
        }
        const yy = pitchY(event.midi, y);
        const selected = state.selectedEventId === event.id ? ' selected' : '';
        const active = score.settings.activeVoiceId === voice.id ? ' active' : '';
        const direction = stemDirection(voice.id);
        const stemX = direction === 'up' ? x + 6 : x - 6;
        const stemEnd = direction === 'up' ? yy - 32 : yy + 32;
        out += `<g class="note${selected}${active}" data-event-id="${event.id}" data-voice-id="${voice.id}">`;
        out += `<ellipse cx="${x}" cy="${yy}" rx="7" ry="5" transform="rotate(-20 ${x} ${yy})" fill="${voice.color}"/>`;
        if (event.durationTicks < 16) {
          out += `<line class="stem" x1="${stemX}" x2="${stemX}" y1="${yy}" y2="${stemEnd}"/>`;
          if (event.durationTicks <= 2) out += `<path class="flag" d="M ${stemX} ${stemEnd} q ${direction === 'up' ? 14 : -14} 6 ${direction === 'up' ? 11 : -11} 16"/>`;
        }
        if (event.lyric) out += `<text class="lyric" x="${x}" y="${y + 79}">${esc(event.lyric)}</text>`;
        out += `<title>${displayPitch(event.midi)} · ${voice.name}</title></g>`;
      });
    });

    // Kurzor se ve dvouosnovém pohledu ukazuje pouze na příslušné sdílené osnově.
    const activeId = score.settings.activeVoiceId;
    if (row.voices.some((v) => v.id === activeId)) {
      const cursor = score.voices[activeId]?.cursor;
      if (cursor && cursor.measureIndex >= startMeasure && cursor.measureIndex < startMeasure + MEASURES_PER_SYSTEM) {
        const localMeasure = cursor.measureIndex - startMeasure;
        const cursorX = staffX + 88 + localMeasure * measureW + (cursor.tick / 16) * (measureW - 18);
        out += `<line class="cursor" x1="${cursorX}" x2="${cursorX}" y1="${y - 8}" y2="${y + 59}"/>`;
      }
    }
  });

  out += `</g>`;
  return { svg: out, height: systemHeight };
}

export function renderNotation(score, state) {
  const perPage = score.settings.staffLayout === 'four' ? 2 : 4;
  const systemCount = Math.ceil(score.measures.length / MEASURES_PER_SYSTEM);
  const pages = [];

  for (let pageStart = 0; pageStart < systemCount; pageStart += perPage) {
    const pageIndex = pages.length;
    let content = `<svg class="notation-page-svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" role="img" aria-label="Notový zápis na stránce A4">`;
    content += `<rect class="page-bg" width="${PAGE_W}" height="${PAGE_H}"/>`;
    if (pageIndex === 0) {
      content += `<text class="score-title" x="${PAGE_W / 2}" y="55">${esc(score.title)}</text>`;
      if (score.composer) content += `<text class="score-composer" x="${PAGE_W - MARGIN_X}" y="84">${esc(score.composer)}</text>`;
      content += `<text class="score-meta" x="${MARGIN_X}" y="84">${esc(score.key)} · ${score.timeSignature.beats}/${score.timeSignature.beatUnit} · ♩ = ${score.tempo}</text>`;
    }
    for (let systemOffset = 0; systemOffset < perPage; systemOffset++) {
      const systemIndex = pageStart + systemOffset;
      if (systemIndex >= systemCount) break;
      const startMeasure = systemIndex * MEASURES_PER_SYSTEM;
      const isFirstSystem = pageIndex === 0 && systemOffset === 0;
      const rendered = drawSystem(score, state, startMeasure, pageIndex, systemIndex, isFirstSystem);
      // Přesun dalších systémů je řešen SVG transformací; první má prostor pro titul.
      const offsetY = systemOffset === 0 ? 0 : (score.settings.staffLayout === 'four' ? 390 : 285) * systemOffset + (pageIndex === 0 ? 118 : 0);
      content += `<g transform="translate(0 ${offsetY})">${rendered.svg}</g>`;
    }
    content += `<text class="page-number" x="${PAGE_W / 2}" y="${PAGE_H - 34}">${pageIndex + 1}</text></svg>`;
    pages.push(`<section class="paper-page">${content}</section>`);
  }
  return `<div class="paper-stack" style="--notation-zoom:${state.notationZoom || 1}">${pages.join('')}</div>`;
}
