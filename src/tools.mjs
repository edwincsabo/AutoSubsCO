import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
export async function exists(file) { try { return (await fs.stat(file)).isFile(); } catch { return false; } }
async function find(dir, name, depth = 0) {
  if (depth > 5) return null;
  let entries; try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return null; }
  const match = entries.find(e => e.isFile() && e.name.toLowerCase() === name.toLowerCase());
  if (match) return path.join(dir, match.name);
  for (const entry of entries.filter(e => e.isDirectory() && !e.isSymbolicLink())) { const result = await find(path.join(dir, entry.name), name, depth + 1); if (result) return result; }
  return null;
}
export async function discoverTools(root, config = {}) {
  const install = path.join(os.homedir(), 'AppData', 'Local', 'AutoSubs');
  async function pick(name, env, subdir) {
    if (config[name] && await exists(config[name])) return config[name];
    if (process.env[env] && await exists(process.env[env])) return process.env[env];
    return await find(path.join(root, 'tools', subdir), name + '.exe')
      ?? (await exists(path.join(install, name + '.exe')) ? path.join(install, name + '.exe') : null);
  }
  return { ffmpeg: await pick('ffmpeg', 'AUTOSUBSCO_FFMPEG', 'ffmpeg'), ffprobe: await pick('ffprobe', 'AUTOSUBSCO_FFPROBE', 'ffmpeg'),
    whisper: config.whisper && await exists(config.whisper) ? config.whisper : await find(path.join(root, 'tools', 'whisper'), 'whisper-cli.exe'),
    whisperGpu: config.whisperGpu && await exists(config.whisperGpu) ? config.whisperGpu : await find(path.join(root,'tools','whisper-gpu'),'whisper-cli.exe'),
    python: await exists(path.join(root,'tools','python','python.exe')) ? path.join(root,'tools','python','python.exe') : null,
    alignmentWorker: await exists(path.join(root,'tools','alignment','worker.py')) ? path.join(root,'tools','alignment','worker.py') : null,
    onnxWorker: await exists(path.join(root,'tools','onnx','worker.py')) ? path.join(root,'tools','onnx','worker.py') : null,
    studioWorker: await exists(path.join(root,'tools','studio','worker.py')) ? path.join(root,'tools','studio','worker.py') : null,
    studioExtractor: await exists(path.join(root,'tools','studio','extract_resource.py')) ? path.join(root,'tools','studio','extract_resource.py') : null };
}
