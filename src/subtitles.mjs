import { randomUUID } from 'node:crypto';
import {timedChunks} from './caption-layout.mjs';

export function timestamp(seconds, separator = ',') {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}${separator}${String(ms % 1000).padStart(3, '0')}`;
}
export const srt = cues => cues.map((c, i) => `${i + 1}\n${timestamp(c.start)} --> ${timestamp(c.end)}\n${c.text}\n`).join('\n');
export const vtt = cues => 'WEBVTT\n\n' + cues.map((c, i) => `${i + 1}\n${timestamp(c.start, '.')} --> ${timestamp(c.end, '.')}\n${c.text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}\n`).join('\n');
export const assTime = sec => { const n = Math.max(0, Math.round(sec * 100)); return `${Math.floor(n / 360000)}:${String(Math.floor(n / 6000) % 60).padStart(2, '0')}:${String(Math.floor(n / 100) % 60).padStart(2, '0')}.${String(n % 100).padStart(2, '0')}`; };
const assColor = hex => '&H00' + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3);
export function ass(cues,style,width=1920,height=1080){
 const escape=t=>t.replaceAll('\\','\uFF3C').replaceAll('{','\uFF5B').replaceAll('}','\uFF5D').replaceAll('\n','\\N'),primary=style.preset==='gold'?'#facc15':style.color,border=style.preset==='box'?3:1,colors=[...new Set(cues.map(c=>c.speakerColor).filter(Boolean))],styleName=c=>c.speakerColor?'Voice'+c.speakerColor.slice(1):'Default';
 const line=(name,color)=>`Style: ${name},${style.font},${style.fontSize},${assColor(color)},&H000000FF,${assColor(style.outline)},&H80000000,-1,0,0,0,100,100,0,0,${border},${style.outlineWidth},0,2,40,40,${style.margin},1`;
 const body=c=>{if(!style.karaoke)return escape(c.text);const reset=styleName(c),base=assColor(c.speakerColor??primary).replace('&H00','&H')+'&',high=assColor(style.highlightColor??'#facc15').replace('&H00','&H')+'&';return timedChunks(c).map(chunk=>{if(chunk.wordIndex===null)return `{\\r${reset}}${escape(chunk.text)}`;const a=Math.max(0,Math.round((chunk.start-c.start)*1000)),b=Math.max(a+1,Math.round((chunk.end-c.start)*1000));return `{\\r${reset}\\1c${base}\\t(${a},${a+1},\\1c${high})\\t(${b},${b+1},\\1c${base})}${escape(chunk.text)}`;}).join('');};
 return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width||1920}\nPlayResY: ${height||1080}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${[line('Default',primary),...colors.map(c=>line('Voice'+c.slice(1),c))].join('\n')}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`+cues.map(c=>`Dialogue: 0,${assTime(c.start)},${assTime(c.end)},${styleName(c)},,0,0,0,,${body(c)}`).join('\n')+'\n';
}

function parseTime(value) {
  if (typeof value !== 'string') return NaN;
  const m = /^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(value.trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000 : NaN;
}
export function parseSrt(text, duration = Infinity) {
  const blocks = text.replace(/^\uFEFF/, '').replaceAll('\r', '').trim().split(/\n\s*\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const at = lines.findIndex(l => l.includes('-->'));
    if (at < 0) continue;
    const [from, to] = lines[at].split('-->').map(s => s.trim());
    const start = parseTime(from), end = Math.min(duration, parseTime(to?.split(/\s/)[0]));
    const body = lines.slice(at + 1).join('\n').replace(/<\/?(?:i|b|u)>/gi, '').trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || !body) throw new Error('El SRT contiene tiempos o texto inválidos.');
    cues.push({ id: randomUUID(), start, end, text: body, words: [] });
  }
  if (!cues.length) throw new Error('No se encontraron subtítulos SRT válidos.');
  return cues;
}

export function normalizeWhisper(json, offset = 0, duration = Infinity, { useWordTimes = true } = {}) {
  if (!Array.isArray(json.transcription)) throw new Error('La respuesta de Whisper no contiene una transcripción válida.');
  return json.transcription.flatMap(segment => {
    const start = Number(segment.offsets?.from) / 1000;
    const end = Number(segment.offsets?.to) / 1000;
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('Whisper devolvió tiempos no válidos.');
    const text = String(segment.text ?? '').trim();
    if (!text || end <= start || start + offset >= duration) return [];
    const words = []; let allTimed = true;
    for (const token of segment.tokens ?? []) {
      if (!token.text || /^\[_.*\]$/.test(token.text) || /^<\|.*\|>$/.test(token.text)) continue;
      const a = Number(token.offsets?.from) / 1000, b = Number(token.offsets?.to) / 1000;
      if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b <= a) { if (String(token.text).trim()) allTimed = false; continue; }
      const piece = String(token.text);
      if (/^\s/.test(piece) || !words.length) words.push({ text: piece.trim(), start: a + offset, end: b + offset });
      else { words.at(-1).text += piece; words.at(-1).end = b + offset; }
    }
    const canonical = t => t.replace(/\s+/g, ' ').trim();
    // Nunca se reconstruye texto a partir de una lista de palabras incompleta.
    const complete = useWordTimes && allTimed && words.length && canonical(words.map(w => w.text).join(' ')) === canonical(text);
    const clipped = complete ? words.filter(w => w.start < duration && w.end > offset).map(w => ({ ...w, start: Math.max(offset, w.start), end: Math.min(w.end, duration) })).filter(w => w.end > w.start) : [];
    if (complete && !clipped.length) return [];
    return [{ id: randomUUID(), start: Math.max(0, start + offset), end: Math.min(end + offset, duration),
      text: complete ? clipped.map(w => w.text).join(' ') : text, words: clipped, timing: complete ? 'word' : 'segment' }];
  });
}

export function wrapText(text, maxChars, maxLines) {
  const lines = []; let current = '';
  for (const word of text.trim().split(/\s+/)) {
    if (current && current.length + 1 + word.length > maxChars) { lines.push(current); current = ''; }
    current += (current ? ' ' : '') + word;
  }
  if (current) lines.push(current);
  // Palabras más largas que el ancho se conservan completas.
  return lines.join('\n');
}

export function formatCues(cues, format) {
  const result = [];
  for (const cue of cues) {
    const words = cue.words?.length && cue.words.every(w => Number.isFinite(w.start) && w.end > w.start)
      ? cue.words : null;
    if (!words) {
      const lines = wrapText(cue.text, format.maxChars).split('\n');
      const warnings = [];
      if (lines.length > format.maxLines) warnings.push('Sin tiempos por palabra: se limitan las líneas y se conserva todo el texto; puede superar el ancho elegido.');
      if (cue.end - cue.start > format.maxDuration) warnings.push('Sin tiempos por palabra: se conserva la duración del segmento; revisa y divide manualmente.');
      const limited = [...lines.slice(0, format.maxLines - 1), lines.slice(format.maxLines - 1).join(' ')].filter(Boolean).join('\n');
      result.push({ ...cue, text: limited, formatWarnings: warnings }); continue;
    }
    let group = [];
    const flush = () => {
      if (!group.length) return;
      result.push({ id: randomUUID(), start: group[0].start, end: Math.max(group.at(-1).end, group[0].start + 0.02),
        text: wrapText(group.map(w => w.text).join(' '), format.maxChars, format.maxLines), words: group });
      group = [];
    };
    for (const word of words) {
      const wrapped = wrapText([...group, word].map(w => w.text).join(' '), format.maxChars, format.maxLines);
      if (group.length && (wrapped.split('\n').length > format.maxLines || word.end - group[0].start > format.maxDuration || word.start - group.at(-1).end > 0.65)) flush();
      group.push(word);
      if (/[.!?…]$/.test(word.text) && word.end - group[0].start > 1) flush();
    }
    flush();
  }
  return result.sort((a, b) => a.start - b.start);
}
