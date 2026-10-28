import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requested = [
  { id: 'orukeet', repo: 'oruk/orukeet', revision: '1751fce6ecde442f14543cf1804800c49b3e415c', prefix: 'onnx/combined-v0.1.0-int8/', license: 'CC-BY-SA-4.0', ramMb: 4096 },
  { id: 'parakeet', repo: 'istupakov/parakeet-tdt-0.6b-v3-onnx', prefix: '', license: 'CC-BY-4.0', ramMb: 2048 }
];
const names = ['config.json','encoder-model.int8.onnx','decoder_joint-model.int8.onnx','nemo128.onnx','vocab.txt'];
for (const m of requested) {
  if (!m.revision) { const r = await fetch(`https://huggingface.co/api/models/${m.repo}`); const j = await r.json(); m.revision = j.sha; }
  const r = await fetch(`https://huggingface.co/api/models/${m.repo}/tree/${m.revision}/${m.prefix}?recursive=false&expand=false`);
  if (!r.ok) throw new Error(`Catálogo ${m.repo}: ${r.status}`);
  const inventory = await r.json();
  m.files = names.map(name => { const item = inventory.find(f => f.path === m.prefix + name); if (!item) throw new Error(`Falta ${name}`); return { path: item.path, dest: name, size: item.size, sha256: item.lfs?.oid ?? null }; });
  // Archivos pequeños Git: fijar su SHA-256 del contenido de la revisión exacta.
  for (const f of m.files.filter(f => !f.sha256)) { const data = new Uint8Array(await(await fetch(`https://huggingface.co/${m.repo}/resolve/${m.revision}/${f.path}`)).arrayBuffer()); const { createHash } = await import('node:crypto'); f.sha256 = createHash('sha256').update(data).digest('hex'); }
  m.size = m.files.reduce((sum, f) => sum + f.size, 0); m.engine = 'onnx';
  console.log(m.id, m.revision, m.size);
}
await fs.writeFile(path.join(root, 'src', 'onnx-catalog.json'), JSON.stringify(requested, null, 2));
