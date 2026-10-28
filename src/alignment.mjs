import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validateProject,durationOf} from './project.mjs';
import {sequenceAudio} from './sequence.mjs';
import {audioForRecognition} from './studio-project.mjs';
import {verifyResource,STUDIO_RESOURCES} from './studio-resources.mjs';
import {run} from './process.mjs';
import {alignmentCanonical,alignmentWords} from './alignment-data.mjs';
import {reliableWords} from './text-cut-model.mjs';

const fingerprint=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
export function alignmentSelection(project,options={}){
 const p=validateProject(project);
 if(!['cue','range'].includes(options.scope)||options.language!=='es'||!['cpu','gpu'].includes(options.acceleration??'cpu'))throw Error('Opciones de alineación no válidas.');
 let selected,skipped=[];
 if(options.scope==='cue'){
  const cue=p.cues.find(c=>c.id===options.cueId);if(!cue)throw Error('Selecciona un subtítulo del texto original.');selected=[cue];
 }else{
  const range=p.exportRange;if(range.end-range.start>120)throw Error('Realinea hasta dos minutos por propuesta. Reduce el rango.');
  const intersecting=p.cues.filter(c=>c.end>range.start&&c.start<range.end);
  if(intersecting.length>25)throw Error('Se admiten hasta 25 subtítulos por propuesta. Reduce el rango.');
  selected=intersecting.filter(c=>c.start>=range.start-.001&&c.end<=range.end+.001);
  skipped=intersecting.filter(c=>!selected.includes(c)).map(c=>({cueId:c.id,text:c.text,start:c.start,end:c.end,status:'review',reason:'El subtítulo cruza un límite del rango. Amplía la selección para incluirlo completo.',words:[]}));
 }
 if(!selected.length)throw Error('No hay subtítulos completos para realinear dentro de la selección.');
 if(selected.length>25)throw Error('Se admiten hasta 25 subtítulos por propuesta. Reduce el rango.');
 const rows=[];
 for(const c of selected){const words=alignmentWords(c.text),reason=c.end-c.start>20?'El subtítulo supera 20 segundos. Divídelo o ajusta sus tiempos.':!words.length?'No hay palabras que se puedan alinear.':alignmentCanonical(words.join(' '))!==alignmentCanonical(c.text)?'La estructura de este texto requiere revisión.':words.join('').length>1200?'El texto es demasiado largo para realinear este subtítulo.':null;
  if(reason)skipped.push({cueId:c.id,text:c.text,start:c.start,end:c.end,status:'review',reason,words:[]});else rows.push({id:c.id,start:c.start,end:c.end,words});
 }
 if(!rows.length)throw Error(skipped[0]?.reason??'No hay texto disponible para realinear.');
 const audioStart=Math.max(0,Math.min(...rows.map(c=>c.start))-.2),audioEnd=Math.min(durationOf(p),Math.max(...rows.map(c=>c.end))+.2);
 if(audioEnd-audioStart>120.401)throw Error('Los subtítulos superan el alcance de dos minutos por propuesta.');
 return {rows,skipped,audioStart,audioEnd};
}

export function alignmentPlan(project,options,selection,output,revision=0){
 const p=validateProject(project),resource=STUDIO_RESOURCES.find(r=>r.id==='alignment-es');
 if(output.engine!=='wav2vec2-ctc-viterbi'||!['CPUExecutionProvider','DmlExecutionProvider'].includes(output.provider)||!Array.isArray(output.results)||output.results.length!==selection.rows.length)throw Error('El alineador devolvió un resultado no válido.');
 const ids=new Set(),rows=[...selection.skipped];
 for(const row of output.results){
  const requested=selection.rows.find(c=>c.id===row.cueId),cue=p.cues.find(c=>c.id===row.cueId);
  if(!requested||!cue||ids.has(row.cueId)||!['aligned','review','unsupported','no_audio'].includes(row.status))throw Error('El resultado no corresponde a la selección.');ids.add(row.cueId);
  if(row.status==='aligned'){
   if(!Array.isArray(row.words)||row.words.length!==requested.words.length||row.words.some((w,i)=>w.text!==requested.words[i]||!Number.isFinite(w.confidence)||w.confidence<0||w.confidence>1)||!reliableWords({...cue,words:row.words}))throw Error('El alineador devolvió palabras o tiempos incompletos.');
   for(const name of ['scoreMean','scoreMinWord','agreement'])if(!Number.isFinite(row[name])||row[name]<0||row[name]>1)throw Error('Los indicadores de alineación no son válidos.');
   if(row.scoreMean<.35||row.scoreMinWord<.08||row.agreement<.65)throw Error('La propuesta no supera los criterios de coincidencia acústica.');
   if(Math.abs(Math.min(...row.words.map(w=>w.confidence))-row.scoreMinWord)>1e-6)throw Error('Los indicadores no corresponden a las palabras propuestas.');
  }
  rows.push({cueId:cue.id,text:cue.text,start:cue.start,end:cue.end,status:row.status,reason:row.status==='aligned'?null:String(row.reason??'Revisa el texto y el audio.').slice(0,400),words:row.status==='aligned'?row.words.map(w=>({text:w.text,start:w.start,end:w.end,confidence:w.confidence})):[],scoreMean:row.scoreMean??null,scoreMinWord:row.scoreMinWord??null,agreement:row.agreement??null});
 }
 rows.sort((a,b)=>a.start-b.start);
 return {id:randomUUID(),projectId:p.id,fingerprint:fingerprint(project),revision,rows,modelRevision:resource.revision,provider:output.provider,fallback:output.fallback?String(output.fallback).slice(0,800):null,requestedAcceleration:options.acceleration??'cpu',elapsedSeconds:Number.isFinite(output.elapsedSeconds)?output.elapsedSeconds:null,preferVocals:!!options.preferVocals};
}
export function publicAlignment(plan){if(!plan)return null;const {projectId,fingerprint,...data}=plan;return {...data,eligibleCount:plan.rows.filter(r=>r.status==='aligned').length,reviewCount:plan.rows.filter(r=>r.status!=='aligned').length};}
export function applyAlignment(project,plan,id,ids){
 if(!plan||plan.id!==id||plan.projectId!==project.id||plan.fingerprint!==fingerprint(project))throw Error('El proyecto cambió después de preparar la alineación. Genera otra propuesta.');
 if(!Array.isArray(ids)||!ids.length||ids.length>25||new Set(ids).size!==ids.length||ids.some(id=>!plan.rows.some(r=>r.cueId===id&&r.status==='aligned')))throw Error('Elige subtítulos con una propuesta de alineación disponible.');
 const p=validateProject(project),selected=new Set(ids);
 for(const cue of p.cues){if(!selected.has(cue.id))continue;const row=plan.rows.find(r=>r.cueId===cue.id);cue.words=structuredClone(row.words);cue.alignment={method:'wav2vec2-ctc-viterbi',modelId:'alignment-es',modelRevision:plan.modelRevision,language:'es',provider:plan.provider,requestedAcceleration:plan.requestedAcceleration,sourceText:cue.text,scoreMean:row.scoreMean,scoreMinWord:row.scoreMinWord,agreement:row.agreement,acceptedAt:new Date().toISOString()};delete cue.textCutReview;delete cue.alignmentPending;}
 return validateProject(p);
}

export async function prepareAlignment(project,options,{tools,modelRoot,jobsRoot,signal,progress=()=>{},revision=0}={}){
 const selection=alignmentSelection(project,options);
 if(!tools.python||!tools.alignmentWorker)throw Error('Falta el runtime local de alineación.');
 progress({stage:'verify',message:'Verificando el alineador en español',percent:null});
 const model=await verifyResource(modelRoot,'alignment-es',signal),job=path.join(jobsRoot,randomUUID());await fs.mkdir(job,{recursive:true});
 const wav=path.join(job,'audio.wav'),request=path.join(job,'alignment-request.json'),result=path.join(job,'alignment-result.json');
 let log='';
 try{
  progress({stage:'audio',message:'Preparando audio para realinear el texto',percent:null});
  await sequenceAudio(audioForRecognition(validateProject(project),!!options.preferVocals),wav,{tools,range:{start:selection.audioStart,end:selection.audioEnd},signal});
  await fs.writeFile(request,JSON.stringify({audioStart:selection.audioStart,cues:selection.rows}));
  let pending='';
  await run(tools.python,[tools.alignmentWorker,'--model',model,'--audio',wav,'--request',request,'--output',result,'--acceleration',options.acceleration??'cpu'],{signal,onStdout:chunk=>{pending+=chunk;const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines)try{progress(JSON.parse(line));}catch{}},onStderr:chunk=>{log=(log+chunk).slice(-2e6);}});
  if(signal?.aborted)throw Error('Operación cancelada.');
  const output=JSON.parse(await fs.readFile(result,'utf8')),plan=alignmentPlan(project,options,selection,output,revision);
  await fs.writeFile(path.join(job,'proposal.json'),JSON.stringify(publicAlignment(plan),null,2));return plan;
 }finally{await fs.rm(wav,{force:true}).catch(()=>{});await fs.writeFile(path.join(job,'alignment.log'),log).catch(()=>{});}
}
