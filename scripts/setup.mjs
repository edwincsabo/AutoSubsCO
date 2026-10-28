import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { downloadModel, VAD_MODEL } from '../src/models.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(root, 'tools');
await fs.mkdir(tools, { recursive: true });
const version = 'b5454';
const zipSha = '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb';
const zip = path.join(tools, 'whisper-bin-x64.zip');
async function download(url, dest, sha) {
  try {
    const existing = await fs.readFile(dest);
    if (!sha || createHash('sha256').update(existing).digest('hex') === sha) return;
  } catch {}
  console.log(`Descargando ${path.basename(dest)}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest + '.part'));
  const actual = createHash('sha256').update(await fs.readFile(dest + '.part')).digest('hex');
  if (sha && sha !== actual) throw new Error(`SHA-256 incorrecto para ${dest}`);
  await fs.rename(dest + '.part', dest);
}
await download(`https://github.com/ggml-org/whisper.cpp/releases/download/${version}/whisper-bin-x64.zip`, zip, zipSha);
const whisperDir = path.join(tools, 'whisper');
await fs.mkdir(whisperDir, { recursive: true });
const quote = s => "'" + s.replaceAll("'", "''") + "'";
const expand = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  `Expand-Archive -LiteralPath ${quote(zip)} -DestinationPath ${quote(whisperDir)} -Force`], { windowsHide: true, encoding: 'utf8' });
if (expand.status !== 0) throw new Error(expand.stderr || 'No se pudo extraer whisper.cpp');
// Solo copias locales: ninguna instalación existente se modifica.
const source = process.env.AUTOSUBSCO_FFMPEG_SOURCE ?? path.join(os.homedir(), 'AppData', 'Local', 'AutoSubs');
const ffmpegDir = path.join(tools, 'ffmpeg');
await fs.mkdir(ffmpegDir, { recursive: true });
for (const name of ['ffmpeg.exe', 'ffprobe.exe']) {
  try { await fs.copyFile(path.join(source, name), path.join(ffmpegDir, name)); }
  catch { console.log(`Coloca ${name} en tools/ffmpeg o configura su ruta en la aplicación.`); }
}
await download('https://raw.githubusercontent.com/ggml-org/whisper.cpp/' + version + '/LICENSE', path.join(whisperDir, 'LICENSE-whisper.cpp.txt'));
const manifest = { whisper: { release: version, archiveSha256: zipSha, acceleration: 'CPU', source: 'https://github.com/ggml-org/whisper.cpp' }, ffmpegLocalSource: source };
await fs.writeFile(path.join(tools, 'provenance.json'), JSON.stringify(manifest, null, 2));
await downloadModel(path.join(root, 'models'), VAD_MODEL.id);
console.log('Motor local preparado. Los modelos se descargan desde la aplicación al solicitarlos.');
