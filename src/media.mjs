import {STILL_DURATION,isGraphic} from './graphics.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { run } from './process.mjs';
import { exists } from './tools.mjs';

export async function probe(file, tools, signal) {
  if (!tools.ffprobe) throw new Error('Falta FFprobe. Ejecuta npm run setup o elige el ejecutable en Herramientas.');
  const { stdout } = await run(tools.ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { signal });
  const info = JSON.parse(stdout), video = info.streams?.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = info.streams?.find(s => s.codec_type === 'audio');
  const still=['.png','.jpg','.jpeg'].includes(path.extname(file).toLowerCase())&&!!video;
  const duration = still?STILL_DURATION:Number(info.format?.duration ?? video?.duration ?? audio?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || (!video && !audio)) throw new Error('No se pudo leer la duración del archivo.');
  const rotation = Number(video?.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? video?.tags?.rotate ?? 0);
  const swapped = Math.abs(Math.sin(rotation * Math.PI / 180)) > .7;
  const stat=await fs.stat(file);
  return { modifiedAtMs:stat.mtimeMs,...(still?{type:'image'}:{}), id: randomUUID(), path: path.resolve(file), name: path.basename(file), duration,
    width: (swapped ? video?.height : video?.width) ?? 0, height: (swapped ? video?.width : video?.height) ?? 0,
    codedWidth: video?.width ?? 0, codedHeight: video?.height ?? 0, rotation, hasVideo: Boolean(video), hasAudio: Boolean(audio),
    videoCodec: video?.codec_name ?? null, audioCodec: audio?.codec_name ?? null,
    fps: video?.avg_frame_rate ?? null, size: Number(info.format?.size ?? 0) };
}

export {transcribeProject as transcribe} from './asr.mjs';

export async function preparePreview(media, tools, root, { signal, progress = () => {} } = {}) {
  if(isGraphic(media))return media.path;
  const supported = ['h264', 'vp8', 'vp9', 'av1'];
  const supportedContainers = ['.mp4', '.m4v', '.webm', '.mov'];
  if (!media.hasVideo || (supported.includes(media.videoCodec) && supportedContainers.includes(path.extname(media.path).toLowerCase()))) return media.path;
  if (!tools.ffmpeg) throw new Error('FFmpeg es necesario para preparar la vista previa de este códec.');
  const { createHash } = await import('node:crypto');
  const stat = await fs.stat(media.path);
  const key = createHash('sha256').update(`${media.path}:${stat.size}:${stat.mtimeMs}:preview-v1`).digest('hex');
  await fs.mkdir(root, { recursive: true });
  const dest = path.join(root, key + '.mp4'), partial = path.join(root, key + '.partial.mp4');
  if (await exists(dest)) return dest;
  let tail = '';
  try {
    progress({ stage: 'preview', message: 'Preparando vista previa del video', percent: 0 });
    await run(tools.ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-i', media.path, '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', partial], { signal, onStdout: d => {
      tail = (tail + d).slice(-4000); const values = [...tail.matchAll(/out_time_us=(\d+)/g)];
      if (values.length) progress({ stage: 'preview', message: 'Preparando vista previa del video', percent: Math.min(99, Number(values.at(-1)[1]) / 1e6 / media.duration * 100) });
    } });
    await fs.rename(partial, dest); return dest;
  } finally { await fs.rm(partial, { force: true }).catch(() => {}); }
}

export async function waveform(file, tools, directory, signal) {
  if (!tools.ffmpeg) return [];
  await fs.mkdir(directory, { recursive: true });
  const raw = path.join(directory, randomUUID() + '.pcm');
  try {
    await run(tools.ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-i', file, '-map', '0:a:0', '-vn', '-af', 'aformat=channel_layouts=mono,aeval=abs(val(0))', '-ac', '1', '-ar', '100', '-c:a', 'pcm_s16le', '-f', 's16le', raw], { signal });
    const data = await fs.readFile(raw); const count = Math.floor(data.length / 2), bins = Math.min(900, count), peaks = [];
    for (let b = 0; b < bins; b++) {
      let peak = 0;
      for (let i = Math.floor(b * count / bins); i < Math.floor((b + 1) * count / bins); i++) peak = Math.max(peak, Math.abs(data.readInt16LE(i * 2)) / 32768);
      peaks.push(peak);
    }
    const maximum = Math.max(...peaks, 0.001); return peaks.map(p => p / maximum);
  } finally { await fs.rm(raw, { force: true }).catch(() => {}); }
}

export {exportSequence as exportVideo} from './sequence.mjs';
