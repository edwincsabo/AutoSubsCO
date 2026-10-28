import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'tools', 'python'); await fs.mkdir(dir, { recursive: true });
const zip = path.join(root, 'tools', 'python-3.12.10-embed-amd64.zip');
async function fetchFile(url, dest) { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`); await fs.writeFile(dest, new Uint8Array(await r.arrayBuffer())); }
if (!await fs.stat(path.join(dir, 'python.exe')).catch(() => null)) {
  await fetchFile('https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip', zip);
  const q = s => "'" + s.replaceAll("'", "''") + "'";
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${q(zip)} -DestinationPath ${q(dir)} -Force`], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr);
}
await fs.writeFile(path.join(dir, 'python312._pth'), 'python312.zip\n.\nLib/site-packages\nimport site\n');
const python = path.join(dir, 'python.exe');
const env = { ...process.env, PYTHONNOUSERSITE: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1', PIP_CACHE_DIR: path.join(root, '.pip-cache') };
function run(args) { const r = spawnSync(python, args, { env, stdio: 'inherit', windowsHide: true }); if (r.status !== 0) throw new Error(`Python terminó con ${r.status}`); }
const pip = spawnSync(python, ['-m', 'pip', '--version'], { env, windowsHide: true });
if (pip.status !== 0) { const bootstrap = path.join(dir, 'get-pip.py'); await fetchFile('https://bootstrap.pypa.io/get-pip.py', bootstrap); run([bootstrap, '--no-warn-script-location', '--no-cache-dir']); }
run(['-m', 'pip', 'install', '--no-warn-script-location', '--no-cache-dir', 'onnx-asr==0.12.0', 'onnxruntime-directml==1.24.4', 'numpy==2.2.6']);
run(['-c', 'import onnxruntime,onnx_asr;print(onnxruntime.get_available_providers())']);
const sha = await fs.readFile(zip).then(b => createHash('sha256').update(b).digest('hex')).catch(() => null);
await fs.writeFile(path.join(dir, 'AUTOSUBSCO-PROVENANCE.json'), JSON.stringify({ python: '3.12.10 embedded x64', source: 'https://www.python.org/ftp/python/3.12.10/', archiveSha256: sha, onnxAsr: '0.12.0', onnxruntimeDirectml: '1.24.4', numpy: '2.2.6' }, null, 2));
