import os from 'node:os';
import {run} from './process.mjs';
export async function detectHardware(tools){const result={ramMb:Math.round(os.totalmem()/1048576),cpuThreads:os.availableParallelism(),providers:[],gpus:[],videoEncoder:null,whisperGpu:!!tools.whisperGpu};
 try{const r=await run('nvidia-smi.exe',['--query-gpu=name,memory.total','--format=csv,noheader']);result.gpus=r.stdout.trim().split('\n').filter(Boolean);}catch{}
 if(tools.python&&tools.onnxWorker)try{const r=await run(tools.python,[tools.onnxWorker,'--probe']);result.providers=JSON.parse(r.stdout.trim()).providers;}catch{}
 if(tools.ffmpeg)for(const encoder of ['h264_nvenc','h264_amf','h264_qsv']){try{await run(tools.ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-f','lavfi','-i','color=s=128x128:r=25','-frames:v','2','-c:v',encoder,'-f','null','-']);result.videoEncoder=encoder;break;}catch{}}
 return result;}
export function acceleration(value){if(!['cpu','gpu'].includes(value??'cpu'))throw new Error('Elige CPU o GPU opcional.');return value??'cpu';}
