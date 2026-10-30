import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateProject,assetFor,clipEnd,durationOf,videoClips} from './project.mjs';
import {expandSelection} from './selection.mjs';
import {isGraphic} from './graphics.mjs';
import {run} from './process.mjs';
import {probe,preparePreview} from './media.mjs';
import {insertTimelineSpace,cutTimelineRanges} from './precision.mjs';
import {evaluateTransform} from './motion.mjs';
import {createAudioPlan,mixExpression,roleOf} from './audio-mix.mjs';
import {audioEnabled,assertUnlockedChanges} from './track-state.mjs';
export function speedPlan(project,id,speed){
 const p=validateProject(project),c=p.timeline.clips.find(c=>c.id===id);if(!c||isGraphic(assetFor(p,c))||!Number.isFinite(speed)||speed<.25||speed>4)throw Error('Selecciona video o audio y una velocidad entre 0,25× y 4×.');
 if(Math.abs(speed-(c.timeEffect?.effectiveSpeed??1))<.000001)throw Error('El clip ya tiene esa velocidad.');
 const main=videoClips(p),next=main[main.findIndex(x=>x.id===id)+1];if(c.transitionIn.type!=='none'||c.trackId==='video-1'&&next?.transitionIn.type!=='none'&&next)throw Error('Retira las transiciones contiguas antes de cambiar la velocidad.');
 const ids=new Set(expandSelection(p,[id],{groups:false}));for(const a of p.timeline.clips)if(a.audioAnchor&&ids.has(a.audioAnchor.clipId))ids.add(a.id);
 const members=p.timeline.clips.filter(c=>ids.has(c.id));if(members.some(a=>a.timelineStart<c.timelineStart-.025||clipEnd(a)>clipEnd(c)+.025))throw Error('El audio vinculado debe estar dentro del tramo elegido. Ajusta sus límites o desvincúlalo.');
 const requestedSpeed=speed;speed/=c.timeEffect?.effectiveSpeed??1;const length=(c.sourceOut-c.sourceIn)/speed;if(length<.05)throw Error('El resultado sería demasiado corto.');
 return{project:p,clip:c,members,ids,speed,requestedSpeed,length,delta:length-(c.sourceOut-c.sourceIn)};
}
export function applySpeed(project,plan,medias){
 const p=validateProject(project),{clip:base,members,ids,speed,length,delta}=plan;let n=base.trackId==='video-1'?(delta>0?insertTimelineSpace(p,clipEnd(base),delta):delta<0?cutTimelineRanges(p,[{start:clipEnd(base)+delta,end:clipEnd(base)}]):p):structuredClone(p);
 const originCues=new Set(p.cues.filter(q=>ids.has(q.clipId)).map(q=>q.id));n.cues=n.cues.filter(q=>!originCues.has(q.id)&&!ids.has(q.clipId));n.timeline.clips=n.timeline.clips.filter(c=>!ids.has(c.id));
 for(let i=0;i<members.length;i++){
  const old=members[i],m=medias[i],d=(old.sourceOut-old.sourceIn)/speed,c={...structuredClone(old),mediaId:m.id,sourceIn:0,sourceOut:d,timelineStart:base.timelineStart+(old.timelineStart-base.timelineStart)/speed,animationOffset:0,transform:evaluateTransform(old,0),keyframes:old.keyframes.filter(k=>k.time>=(old.animationOffset??0)).map(k=>({...k,time:(k.time-(old.animationOffset??0))/speed})),volume:old.volume,muted:old.muted,audioMasks:[],audioMix:{role:roleOf(old)},timeEffect:{kind:'speed',factor:speed,effectiveSpeed:(old.timeEffect?.effectiveSpeed??1)*speed,sourceMediaId:old.mediaId}};
  if(old.audioAnchor&&ids.has(old.audioAnchor.clipId)){const parent=members.find(p=>p.id===old.audioAnchor.clipId);c.audioAnchor={clipId:parent.id,sourceStart:(old.timelineStart-parent.timelineStart)/speed};}else delete c.audioAnchor;delete c.separationId;delete c.analysisParentClipId;n.assets.push(m);n.timeline.clips.push(c);
 }
 for(const q of p.cues.filter(q=>ids.has(q.clipId))){const row={...q,start:base.timelineStart+(q.start-base.timelineStart)/speed,end:base.timelineStart+(q.end-base.timelineStart)/speed,words:(q.words??[]).map(w=>({...w,start:base.timelineStart+(w.start-base.timelineStart)/speed,end:base.timelineStart+(w.end-base.timelineStart)/speed})),timing:'retimed-linear'};delete row.alignment;n.cues.push(row);}
 const existing=new Set(n.timeline.clips.map(c=>c.id));for(const k of ['groups','links']){const rows=new Map(n.timeline[k].map(r=>[r.id,r]));for(const r of p.timeline[k]){const old=rows.get(r.id);rows.set(r.id,{...r,clipIds:[...new Set([...(old?.clipIds??[]),...r.clipIds])].filter(id=>existing.has(id))});}n.timeline[k]=[...rows.values()].filter(r=>r.clipIds.length>=2);}
 n.separations=n.separations.filter(r=>!ids.has(r.clipId));n.diarization=null;n.exportRange={start:0,end:durationOf(n)};n=validateProject(n);assertUnlockedChanges(p,n);return n;
}
const tempo=speed=>{const filters=[];while(speed>2){filters.push('atempo=2');speed/=2;}while(speed<.5){filters.push('atempo=0.5');speed/=.5;}filters.push('atempo='+speed);return filters.join(',');};
export async function prepareSpeed(project,options,{tools,folder,signal,progress=()=>{}}){
 const plan=speedPlan(project,options.id,Number(options.speed)),p=plan.project,medias=[],audioPlan=createAudioPlan(p);await fs.mkdir(folder,{recursive:true});
 // Comprobar geometría y bloqueos antes del procesamiento utilizando descriptores provisionales.
 applySpeed(p,plan,plan.members.map(c=>({...assetFor(p,c),id:randomUUID(),duration:Math.max(.05,(c.sourceOut-c.sourceIn)/plan.speed)})));
 try{for(const [i,c]of plan.members.entries()){
  const m=assetFor(p,c),dest=path.join(folder,`speed-${i}.${m.hasVideo&&c.kind==='video'?'mkv':'wav'}`),audio=m.hasAudio&&!c.audioDetached,filter=[];
  if(m.hasVideo&&c.kind==='video')filter.push(`[0:v]setpts=(PTS-STARTPTS)/${plan.speed},fps=${p.sequence.fps},tpad=stop_mode=clone:stop_duration=0.1[v]`);
  if(audio){let expr=mixExpression({...c,volume:1,muted:false},audioPlan);for(const mask of c.audioMasks??[])expr+=`*(1-gte(t,${mask.start-c.sourceIn})*lt(t,${mask.end-c.sourceIn}))`;filter.push(`[0:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,aeval=exprs='val(0)*(${expr})|val(1)*(${expr})',${tempo(plan.speed)},apad=whole_dur=${(c.sourceOut-c.sourceIn)/plan.speed},atrim=duration=${(c.sourceOut-c.sourceIn)/plan.speed}[a]`);}
  if(!filter.length)throw Error('El tramo no contiene imagen ni audio para procesar.');
  const args=['-hide_banner','-nostdin','-y','-loglevel','error','-threads','2','-ss',String(c.sourceIn),'-t',String(c.sourceOut-c.sourceIn),'-i',m.path,'-filter_complex_threads','2','-filter_complex',filter.join(';')];if(m.hasVideo&&c.kind==='video')args.push('-map','[v]','-c:v','ffv1','-level','3','-threads','2');if(audio)args.push('-map','[a]','-c:a','pcm_f32le');if(c.kind==='audio'||!m.hasVideo)args.push('-rf64','auto');args.push('-t',String((c.sourceOut-c.sourceIn)/plan.speed),'-progress','pipe:1','-nostats',dest);
  progress({stage:'time',message:`Preparando velocidad · ${i+1}/${plan.members.length}`,percent:i/plan.members.length*100});let tail='';await run(tools.ffmpeg,args,{signal,onStdout:data=>{tail=(tail+data).slice(-4000);const times=[...tail.matchAll(/out_time_us=(\d+)/g)];if(times.length)progress({stage:'time',message:`Preparando velocidad · ${i+1}/${plan.members.length}`,percent:(i+.8*Math.min(1,Number(times.at(-1)[1])/1e6/((c.sourceOut-c.sourceIn)/plan.speed)))/plan.members.length*100});}});const media=await probe(dest,tools,signal);media.name=(m.derivation?.sourceName??m.name)+' · '+plan.requestedSpeed+'×';media.derivation={kind:'speed',sourceName:m.derivation?.sourceName??m.name,sourceMediaId:m.id,sourceIn:c.sourceIn,sourceOut:c.sourceOut,factor:plan.speed};media.previewPath=await preparePreview(media,tools,path.join(folder,'preview'),{signal,progress:p=>progress({...p,percent:Number.isFinite(p.percent)?(i+.8+.2*p.percent/100)/plan.members.length*100:null})});medias.push(media);
 }
 return{project:applySpeed(p,plan,medias)};
 }catch(error){const owned=await fs.realpath(folder);for(let i=0;i<plan.members.length;i++)for(const ext of ['mkv','wav']){const file=await fs.realpath(path.join(folder,`speed-${i}.${ext}`)).catch(()=>null);if(file&&path.dirname(file)===owned)await fs.rm(file,{force:true}).catch(()=>{});}const preview=await fs.realpath(path.join(folder,'preview')).catch(()=>null);if(preview&&path.dirname(preview)===owned)await fs.rm(preview,{recursive:true,force:true}).catch(()=>{});throw error;}
}
export async function prepareFreeze(project,{id,time,duration=3},{tools,folder,signal}){
 const p=validateProject(project),c=p.timeline.clips.find(c=>c.id===id);if(!c||c.kind!=='video'||c.trackId!=='video-1'||time<c.timelineStart||time>=clipEnd(c)||!Number.isFinite(duration)||duration<.1||duration>30)throw Error('Elige un fotograma dentro de un video y una duración de 0,1 a 30 segundos.');
 const source=assetFor(p,c),dest=path.join(folder,'freeze.png');await fs.mkdir(folder,{recursive:true});await run(tools.ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-y','-ss',String(c.sourceIn+time-c.timelineStart),'-i',source.path,'-frames:v','1',dest],{signal});const media=await probe(dest,tools,signal);media.name='Fotograma · '+source.name;
 const n=insertTimelineSpace(p,time,duration);n.assets.push(media);n.timeline.clips.push({...structuredClone(c),id:randomUUID(),mediaId:media.id,trackId:'video-1',timelineStart:time,sourceIn:0,sourceOut:duration,volume:1,muted:true,audioMix:{role:'neutral'},audioMasks:[],keyframes:[],animationOffset:0,transform:evaluateTransform(c,time-c.timelineStart),transitionIn:{type:'none',duration:.5},audioDetached:false});const added=n.timeline.clips.at(-1);delete added.audioAnchor;delete added.timeEffect;delete added.separationId;n.exportRange={start:0,end:durationOf(n)};const result=validateProject(n);assertUnlockedChanges(p,result);return{project:result};
}
