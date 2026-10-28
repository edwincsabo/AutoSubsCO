import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),python=path.join(root,'tools','python','python.exe');
const r=spawnSync(python,['-m','pip','install','--no-cache-dir','--no-warn-script-location','sherpa-onnx==2.0.0','ctranslate2==4.8.4','sentencepiece==0.2.2','sacremoses==0.2.0','subword-nmt==0.3.8'],{stdio:'inherit',windowsHide:true,env:{...process.env,PYTHONNOUSERSITE:'1',PIP_DISABLE_PIP_VERSION_CHECK:'1'}});if(r.status!==0)throw new Error('No se pudo preparar el runtime local de estudio.');
const check=spawnSync(python,['-c','import sherpa_onnx,ctranslate2,sentencepiece;print("source separation:",hasattr(sherpa_onnx,"OfflineSourceSeparation"));print("diarization:",hasattr(sherpa_onnx,"OfflineSpeakerDiarization"));print("translation:",ctranslate2.__version__)'],{stdio:'inherit',windowsHide:true});if(check.status!==0)throw new Error('Falló la verificación del runtime.');
const lock=spawnSync(python,['-m','pip','freeze'],{encoding:'utf8',windowsHide:true});await fs.writeFile(path.join(root,'tools','python','requirements-lock.txt'),lock.stdout);
