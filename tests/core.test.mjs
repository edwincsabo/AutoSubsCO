import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject, visibleCues, DEFAULT_STYLE } from '../src/project.mjs';
import { timestamp, srt, vtt, ass, parseSrt, normalizeWhisper, formatCues } from '../src/subtitles.mjs';

const media = { id: 'test-media', path: 'C:\\videos\\ejemplo.mp4', name: 'ejemplo.mp4', duration: 20, width: 1280, height: 720, hasVideo: true, hasAudio: true, size: 100 };
test('el recorte conserva tiempos de fuente y exporta tiempos relativos con límites', () => {
  const p = {...createProject(media),version:1}; p.timeline.clips[0].sourceIn = 5; p.timeline.clips[0].sourceOut = 12;
  p.cues = [{ id: 'a', start: 3, end: 6, text: 'Uno' }, { id: 'b', start: 11, end: 14, text: 'Dos' }, { id: 'c', start: 15, end: 16, text: 'Fuera' }];
  assert.deepEqual(visibleCues(validateProject(p)).map(c => [c.start, c.end]), [[0, 1], [6, 7]]);
  assert.equal(p.cues[0].start, 3);
});
test('los proyectos rechazan versiones ajenas, clips adicionales y números no finitos', () => {
  const p = createProject(media);
  assert.throws(() => validateProject({ ...p, version: 99 }));
  assert.throws(() => validateProject({ ...p, cues: [{ id: 'a', start: NaN, end: 3, text: 'No' }] }));
  p.timeline.clips.push(p.timeline.clips[0]); assert.throws(() => validateProject(p));
});
test('SRT conserva milisegundos, saltos y texto español en ida y vuelta', () => {
  const cues = [{ start: 0.95, end: 3.125, text: '¡Hola, Colombia!\nSegunda línea.' }];
  assert.deepEqual(parseSrt(srt(cues)).map(c => ({ start: c.start, end: c.end, text: c.text })), cues);
  assert.equal(timestamp(59.9996), '00:01:00,000');
  assert.equal(timestamp(3600.05), '01:00:00,050');
});
test('WebVTT escapa texto que puede interpretarse como marcado', () => {
  assert.match(vtt([{ start: 0, end: 1, text: '<voz> & texto' }]), /&lt;voz&gt; &amp; texto/);
});
test('ASS conserva hora y neutraliza comandos de estilo dentro del texto', () => {
  const output = ass([{ start: 3600.05, end: 3601, text: '{\\pos(0,0)}\nTexto' }], DEFAULT_STYLE);
  assert.match(output, /1:00:00\.05/); assert.ok(!output.includes('{\\pos')); assert.match(output, /\\NTexto/);
});
test('normaliza offsets de Whisper en milisegundos y aplica el desplazamiento del recorte', () => {
  const raw = { transcription: [{ offsets: { from: 100, to: 1600 }, text: ' Hola Colombia', tokens: [
    { text: ' Hola', offsets: { from: 100, to: 500 } }, { text: ' Colom', offsets: { from: 600, to: 1100 } }, { text: 'bia', offsets: { from: 1100, to: 1600 } }, { text: '[_TT_80]', offsets: { from: 1600, to: 1600 } }
  ] }] };
  const [cue] = normalizeWhisper(raw, 5, 20);
  assert.equal(cue.start, 5.1); assert.equal(cue.end, 6.6); assert.deepEqual(cue.words.map(w => w.text), ['Hola', 'Colombia']);
});
test('la división por palabras conserva los tiempos disponibles y no supera líneas', () => {
  const words = 'Esta es una prueba para subtitular nuestro video'.split(' ').map((text, i) => ({ text, start: i * .5, end: i * .5 + .45 }));
  const cues = formatCues([{ id: 'source', start: 0, end: 4, text: words.map(w => w.text).join(' '), words }], { maxChars: 12, maxLines: 1, maxDuration: 3 });
  assert.ok(cues.length > 1); assert.ok(cues.every(c => !c.text.includes('\n')));
  assert.equal(cues.map(c => c.text).join(' '), words.map(w => w.text).join(' '));
  assert.equal(cues[1].start, cues[1].words[0].start);
});
test('los tokens sin tiempos no hacen desaparecer texto de la transcripción', () => {
  const [cue] = normalizeWhisper({ transcription: [{ offsets: { from: 0, to: 2000 }, text: 'Hola mundo.', tokens: [
    { text: ' Hola', offsets: { from: 0, to: 900 } }, { text: ' mundo' }, { text: '.' }
  ] }] });
  assert.equal(cue.text, 'Hola mundo.'); assert.deepEqual(cue.words, []);
  assert.equal(formatCues([cue], { maxChars: 42, maxLines: 2, maxDuration: 6 })[0].text, 'Hola mundo.');
});
test('los tokens fuera del recorte se excluyen sin producir duraciones negativas', () => {
  const [cue] = normalizeWhisper({ transcription: [{ offsets: { from: 0, to: 3000 }, text: 'Hello world', tokens: [
    { text: ' Hello', offsets: { from: 0, to: 900 } }, { text: ' world', offsets: { from: 2500, to: 3000 } }
  ] }] }, 0, 2);
  assert.equal(cue.text, 'Hello'); assert.ok(cue.words.every(w => w.end > w.start && w.end <= 2));
});
test('con VAD conserva tiempos de segmento de la fuente y no usa tokens del audio comprimido', () => {
  const [cue] = normalizeWhisper({ transcription: [{ offsets: { from: 7010, to: 9960 }, text: 'Hola Colombia', tokens: [
    { text: ' Hola', offsets: { from: 0, to: 900 } }, { text: ' Colombia', offsets: { from: 900, to: 2580 } }
  ] }] }, 0, 36.4, { useWordTimes: false });
  assert.equal(cue.start, 7.01); assert.equal(cue.end, 9.96); assert.deepEqual(cue.words, []);
  const [formatted] = formatCues([cue], { maxChars: 42, maxLines: 2, maxDuration: 6 });
  assert.equal(formatted.start, 7.01); assert.equal(formatted.text, 'Hola Colombia');
});
test('SRT inválido falla y las fuentes y colores no aceptan sintaxis ASS', () => {
  assert.throws(() => parseSrt('1\n00:00:02,000 --> 00:00:01,000\nTexto'));
  const p = createProject(media); p.style.font = 'Arial,123'; assert.throws(() => validateProject(p));
});
test('sin palabras medidas conserva todo el texto y declara límites de formato pendientes', () => {
  const text = 'Esta transcripción larga conserva todas las palabras del segmento sin inventar tiempos';
  const [cue] = formatCues([{ id: 's', start: 0, end: 20, text, words: [] }], { maxChars: 12, maxLines: 1, maxDuration: 1 });
  assert.equal(cue.text, text); assert.equal(cue.end, 20); assert.equal(cue.formatWarnings.length, 2);
});
