import {audioEnabled} from './track-state.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {run} from './process.mjs';
import {MODELS,verifyModel,modelPath,VAD_MODEL} from './models.mjs';
import {exists} from './tools.mjs';
import {validateProject,durationOf,attachCues,replaceRange} from './project.mjs';
import {normalizeWhisper,formatCues} from './subtitles.mjs';
import {sequenceAudio} from './sequence.mjs';
import {acceleration as validateAcceleration} from './hardware.mjs';
import {wordErrorRate} from './review.mjs';
import {audioForRecognition,inheritSpeakers} from './studio-project.mjs';

const special=t=>/^\[_.*\]$/.test(t)||/^<\|.*\|>$/.test(t);
const canonical=s=>s.replace(/\s+/g,' ').trim();
function groupTokens(tokens,points,end){const words=[];for(let i=0;i<tokens.length;i++){const text=tokens[i],point=points[i];if(!text||special(text))continue;if(/^\s/.test(text)||!words.length)words.push({text:text.trim(),start:point,lastPoint:point});else{words.at(-1).text+=text;if(Number.isFinite(point)&&!/^[\p{P}\p{S}]+$/u.test(text))words.at(-1).lastPoint=point;}}if(!words.every(w=>Number.isFinite(w.start)&&w.start>=0))return[];for(let i=words.length-1;i>=0;i--){if(words[i+1]&&words[i+1].start<=words[i].start){words[i].text+=' '+words[i+1].text;words[i].lastPoint=Math.max(words[i].lastPoint,words[i+1].lastPoint);words.splice(i+1,1);}words[i].end=Math.min(end,words[i+1]?.start??words[i].lastPoint+.08);}return words.filter(w=>Number.isFinite(w.end)&&w.end>w.start);}
export function normalizeDtw(raw,offset,duration){
 const text=canonical(raw.transcription.map(s=>s.text).join(' ')),words=[];let complete=true;
 for(const segment of raw.transcription)for(const token of segment.tokens??[]){const piece=token.text;if(!piece||special(piece))continue;const a=Number(token.offsets?.from)/1000+offset,b=Number(token.offsets?.to)/1000+offset,anchor=token.t_dtw>=0?token.t_dtw/100+offset:null;if(/^\s/.test(piece)||!words.length){if(!Number.isFinite(a)||a<offset){complete=false;continue;}words.push({text:piece.trim(),start:a,end:Number.isFinite(b)?Math.max(a,b):a,anchor});}else{words.at(-1).text+=piece;if(!/^[\p{P}\p{S}]+$/u.test(piece)&&Number.isFinite(b))words.at(-1).end=Math.max(words.at(-1).end,b);}}
 if(!complete||canonical(words.map(w=>w.text).join(' '))!==text)return normalizeWhisper(raw,offset,duration,{useWordTimes:false});
 const clipped=words.filter(w=>w.start<duration).map((w,i)=>({...w,start:Math.max(offset,w.start),end:Math.min(duration,Math.max(w.end,w.anchor??w.start),words[i+1]?.start??duration)})).filter(w=>w.end>w.start);
 if(canonical(clipped.map(w=>w.text).join(' '))!==text)return normalizeWhisper(raw,offset,duration,{useWordTimes:false});
 return clipped.length?[{id:randomUUID(),start:clipped[0].start,end:clipped.at(-1).end,text,words:clipped,timing:'dtw-and-token-boundaries'}]:[];
}
export function normalizeOnnx(raw,offset,duration){return raw.segments.flatMap(s=>{if(!s.text.trim())return[];const words=groupTokens(s.tokens,s.timestamps,Math.min(s.end,duration-offset)).map(w=>({...w,start:w.start+offset,end:Math.min(w.end+offset,duration)})).filter(w=>w.end>w.start);const complete=words.length&&canonical(words.map(w=>w.text).join(' '))===canonical(s.text);return[{id:randomUUID(),start:complete?words[0].start:s.start+offset,end:complete?words.at(-1).end:Math.min(duration,s.end+offset),text:s.text.trim(),words:complete?words:[],timing:complete?'tdt-token-boundaries':'segment'}];});}
export async function recognizeRange(project,options){
 const totalBegan=Date.now();
 const p=validateProject(project),{tools,modelRoot,jobsRoot,signal,progress=()=>{}}=options,model=MODELS.find(m=>m.id===(options.model??'small'));if(!model)throw new Error('Modelo no permitido.');const range=options.range??p.exportRange,acceleration=validateAcceleration(options.acceleration),language=options.language??'es',align=options.align!==false;
 if(!Number.isFinite(range.start)||!Number.isFinite(range.end)||range.start<0||range.end>durationOf(p)+.01||range.end-range.start<.1)throw new Error('Rango de transcripción inválido.');
 if(!['es','auto','en','pt','fr','de','it'].includes(language))throw new Error('Idioma no permitido.');
 if(!p.timeline.clips.some(c=>audioEnabled(p,c)&&!c.muted&&c.volume>0&&p.assets.find(m=>m.id===c.mediaId)?.hasAudio))throw new Error('No hay audio audible en la secuencia.');
 progress({stage:'verify',message:`Verificando ${model.name}`,percent:null});const weights=await verifyModel(modelRoot,model.id,signal),job=path.join(jobsRoot,randomUUID());await fs.mkdir(job,{recursive:true});const wav=path.join(job,'audio.wav'),started=Date.now();let log='',engine,used='CPU',fallback=null,raw,cues;
 try{progress({stage:'audio',message:options.preferVocals?'Preparando audio con prioridad a la voz separada':'Preparando audio de la secuencia',percent:null});await sequenceAudio(audioForRecognition(p,options.preferVocals),wav,{tools,range,signal});const began=Date.now();
 if(model.engine==='onnx'){
  if(!tools.python||!tools.onnxWorker)throw new Error('Falta el runtime ONNX portátil. Ejecuta scripts/setup-onnx.mjs.');engine='onnx-asr 0.12.0';let lines='';await run(tools.python,[tools.onnxWorker,'--model',weights,'--audio',wav,'--output',path.join(job,'transcript.json'),'--acceleration',acceleration],{signal,onStdout:d=>{lines+=d;const chunks=lines.split(/\r?\n/);lines=chunks.pop();for(const text of chunks)try{const v=JSON.parse(text);progress({stage:v.fallback?'fallback':'transcribe',message:v.fallback?'GPU no compatible; continuamos por CPU':`Transcribiendo · ${model.name} · ${v.provider==='DmlExecutionProvider'?'DirectML':'CPU'}`,percent:v.progress??null});}catch{}},onStderr:d=>log=(log+d).slice(-2e6)});raw=JSON.parse(await fs.readFile(path.join(job,'transcript.json'),'utf8'));used=raw.provider;fallback=raw.fallback;cues=normalizeOnnx(raw,range.start,range.end);
 }else{
  if(!tools.whisper)throw new Error('Falta whisper.cpp.');engine='whisper.cpp b5454';const out=path.join(job,'transcript');const args=['-m',weights,'-f',wav,'-l',language,'-ojf','-of',out,'-pp','-ml',String(p.format.maxChars*p.format.maxLines),'-sow','-t',String(Math.max(1,Math.min(8,os.availableParallelism()-2)))];
  // DTW usa el audio completo del rango: no se mezclan tiempos comprimidos de VAD.
  if(align)args.push('-nfa','-dtw',({'large-v3-turbo':'large.v3.turbo'})[model.id]??model.id);else if(options.vad!==false&&await exists(modelPath(modelRoot,VAD_MODEL.id)))args.push('--vad','-vm',await verifyModel(modelRoot,VAD_MODEL.id,signal));
  async function execute(executable,gpu){let tail='';progress({stage:'transcribe',message:`Transcribiendo · ${model.name} · ${gpu?'GPU':'CPU'}`,percent:0});await run(executable,[...args,...(gpu?[]:['-ng'])],{signal,onStderr:d=>{log=(log+d).slice(-2e6);tail=(tail+d).slice(-4000);const m=[...tail.matchAll(/progress\s*=\s*(\d+)%/g)];if(m.length)progress({stage:'transcribe',message:`Transcribiendo · ${model.name} · ${gpu?'GPU':'CPU'}`,percent:Number(m.at(-1)[1])});}});}
  if(acceleration==='gpu'&&tools.whisperGpu){try{await execute(tools.whisperGpu,true);used='Whisper GPU';}catch(e){if(signal?.aborted)throw e;fallback=String(e.message).slice(-800);await execute(tools.whisper,false);}}else{if(acceleration==='gpu')fallback='Whisper GPU no está configurado; se utilizó CPU.';await execute(tools.whisper,false);}
  raw=JSON.parse(await fs.readFile(out+'.json','utf8'));cues=align?normalizeDtw(raw,range.start,range.end):normalizeWhisper(raw,range.start,range.end,{useWordTimes:false});
 }
 if(signal?.aborted)throw new Error('Operación cancelada.');cues=inheritSpeakers(p,attachCues(p,formatCues(cues,p.format)));const transcription={engine,model:model.id,requestedLanguage:language,language:raw.result?.language??language,provider:used,accelerationRequested:acceleration,fallback,align,alignment:model.engine==='onnx'?'TDT (marcas de emisión)':align?'Whisper DTW + límites de tokens':'Segmentos',elapsedSeconds:(Date.now()-began)/1000,totalSeconds:(Date.now()-totalBegan)/1000,range,createdAt:new Date().toISOString()};const result={cues,transcription,warnings:[...new Set(cues.flatMap(c=>c.formatWarnings??[]))]};await fs.writeFile(path.join(job,'result.json'),JSON.stringify(result,null,2));await fs.writeFile(path.join(job,'engine.log'),log);progress({stage:'done',message:`${cues.length} subtítulos generados`,percent:100});return result;
 }finally{await fs.rm(wav,{force:true}).catch(()=>{});}
}
export async function transcribeProject(p,options){const range=options.range??p.exportRange,result=await recognizeRange(p,{...options,range});return validateProject({...replaceRange(p,result.cues,range),transcription:result.transcription,warnings:result.warnings});}
export async function compareModels(p,options){const range=options.range??p.exportRange;if(range.end-range.start>90)throw new Error('La comparación admite fragmentos de hasta 90 segundos.');const models=options.models;if(!Array.isArray(models)||models.length!==2||models[0]===models[1])throw new Error('Elige dos modelos distintos.');const results=[];for(const model of models){const result=await recognizeRange(p,{...options,model,range}),text=result.cues.map(c=>c.text.replaceAll('\n',' ')).join(' ');results.push({...result,model,text,rtf:result.transcription.totalSeconds/(range.end-range.start),wer:options.reference?.trim()?wordErrorRate(options.reference,text):null});}const comparison={id:randomUUID(),projectId:p.id,sequence:JSON.stringify(p.timeline),range,reference:options.reference??'',results,createdAt:new Date().toISOString()};return comparison;}
