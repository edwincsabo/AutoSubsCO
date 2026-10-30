import {discoverTools} from '../src/tools.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),checkOnly=process.argv.includes('--check');
const exists=f=>fs.stat(path.join(root,f)).then(s=>s.isFile()).catch(()=>false),python=path.join(root,'tools/python/python.exe');
const pythonModule=name=>spawnSync(python,['-c',`import ${name}`],{windowsHide:true,stdio:'ignore'}).status===0;
const available=await discoverTools(root);
const steps=[
 {label:'Interfaz Electron',ready:await exists('node_modules/electron/dist/electron.exe'),run:()=>spawnSync('cmd.exe',['/d','/s','/c','npm ci --cache .npm-cache'],{cwd:root,stdio:'inherit',windowsHide:true})},
 {label:'Whisper CPU y detector de voz',ready:!!available.whisper&&await exists('models/ggml-silero-v5.1.2.bin'),script:'setup.mjs'},
 {label:'Python y ONNX Runtime',ready:await exists('tools/python/python.exe')&&pythonModule('onnxruntime, numpy, onnx_asr'),script:'setup-onnx.mjs'},
 {label:'Separación y traducción',ready:await exists('tools/python/python.exe')&&pythonModule('sherpa_onnx, ctranslate2, sentencepiece'),script:'setup-studio.mjs'}
];
console.log('AutoSubsCO · preparación de este equipo\nCPU predeterminada; la GPU es opcional. Solo se preparan los componentes que falten.\n');
for(const step of steps){console.log(`${step.ready?'Disponible':'Pendiente'} · ${step.label}`);if(!step.ready&&!checkOnly){const r=step.run?step.run():spawnSync(process.execPath,[path.join(root,'scripts',step.script)],{cwd:root,stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error('No se pudo preparar: '+step.label);}}
const ffmpeg=await exists('tools/ffmpeg/ffmpeg.exe')&&await exists('tools/ffmpeg/ffprobe.exe');console.log(ffmpeg?'FFmpeg y FFprobe disponibles.':'Coloca FFmpeg y FFprobe en tools/ffmpeg o configura sus rutas en Equipo. Guía: docs/INSTALACION.md.');
console.log(checkOnly?'Comprobación terminada.':'Preparación terminada. Abre Probar AutoSubsCO.cmd y descarga desde la aplicación el modelo que quieras utilizar.');
