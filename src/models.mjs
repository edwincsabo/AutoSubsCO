import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import catalog from './onnx-catalog.json' with { type: 'json' };

// Tamaños y SHA-256 LFS verificados en ggerganov/whisper.cpp el 25-10-2026 (Bogotá).
export const MODELS = Object.freeze([
  ...catalog.map(m => ({ ...m, name: m.id === 'orukeet' ? 'Orukeet' : 'Parakeet v3', label: `ONNX INT8 · ${Math.round(m.size/1e6)} MB`, gpu: 'DirectML opcional', languageSupport: '25 idiomas, incluido español' })),
  { id: 'base', name: 'Whisper Base', label: 'Prueba rápida · 148 MB', ramMb:1024, size: 147951465, sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe' },
  { id: 'small', name: 'Whisper Small', label: 'Equilibrado · 488 MB', ramMb:2048, size: 487601967, sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b' },
  { id: 'large-v3-turbo', name: 'Whisper Large v3 Turbo', label: 'Mayor capacidad · 1,62 GB', ramMb:6144, size: 1624555275, sha256: '1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69' }
]);
export const VAD_MODEL = Object.freeze({ id: 'silero-v5.1.2', name: 'Silero VAD', repo: 'ggml-org/whisper-vad', size: 885098, sha256: '29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf' });
const definition = id => MODELS.find(m => m.id === id) ?? (id === VAD_MODEL.id ? VAD_MODEL : null);
export const modelPath = (root, id) => path.join(root, `ggml-${id}.bin`);
const verified = new Map();
export async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function listModels(root) {
  return Promise.all(MODELS.map(async m => {
    if (m.engine === 'onnx') {
      const ready = await Promise.all(m.files.map(f => fs.stat(path.join(root,m.id,f.dest)).then(s=>s.size===f.size).catch(()=>false)));
      return {...m,installed:ready.every(Boolean),path:path.join(root,m.id)};
    }
    let stat; try { stat = await fs.stat(modelPath(root, m.id)); } catch {}
    return { ...m, installed: stat?.size === m.size, path: modelPath(root, m.id) };
  }));
}
export async function verifyModel(root, id, signal) {
  const model = definition(id);
  if (!model) throw new Error('Modelo no permitido.');
  if (model.engine === 'onnx') return (await import('./model-files.mjs')).verifyFiles(root,model,signal);
  const file = modelPath(root, id);
  const stat = await fs.stat(file).catch(() => null);
  if (stat?.size !== model.size) throw new Error(`Descarga ${model.name} antes de transcribir.`);
  const key = `${file}:${stat.size}:${stat.mtimeMs}`;
  if (!verified.has(key)) {
    if (signal?.aborted) throw new Error('Operación cancelada.');
    if (await hashFile(file) !== model.sha256) throw new Error('El modelo no coincide con su SHA-256. Vuelve a descargarlo.');
    verified.set(key, true);
  }
  return file;
}
export async function downloadModel(root, id, { signal, progress = () => {} } = {}) {
  const model = definition(id);
  if (!model) throw new Error('Modelo no permitido.');
  if (model.engine === 'onnx') { await (await import('./model-files.mjs')).downloadFiles(root,model,{signal,progress}); return listModels(root); }
  await fs.mkdir(root, { recursive: true });
  const dest = modelPath(root, id), partial = dest + '.part';
  try {
    const response = await fetch(`https://huggingface.co/${model.repo ?? 'ggerganov/whisper.cpp'}/resolve/main/ggml-${id}.bin`, { signal });
    if (!response.ok) throw new Error(`Descarga HTTP ${response.status}`);
    let loaded = 0, last = 0; const hash = createHash('sha256');
    const meter = new Transform({ transform(chunk, _, callback) {
      loaded += chunk.length; hash.update(chunk);
      if (Date.now() - last > 250) { progress({ stage: 'download', message: `Descargando ${model.name}`, percent: Math.min(99, loaded / model.size * 100) }); last = Date.now(); }
      callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(partial), { signal });
    if (loaded !== model.size || hash.digest('hex') !== model.sha256) throw new Error('La descarga no coincide con el tamaño o SHA-256 oficial.');
    await fs.rename(partial, dest);
    progress({ stage: 'done', message: `${model.name} preparado`, percent: 100 });
    return listModels(root);
  } catch (error) {
    await fs.rm(partial, { force: true }).catch(() => {});
    if (signal?.aborted) throw new Error('Operación cancelada.');
    throw error;
  }
}
