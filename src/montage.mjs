import {randomUUID} from 'node:crypto';
import {validateProject,clipEnd,durationOf} from './project.mjs';
import {expandSelection} from './selection.mjs';
import {insertTimelineSpace} from './precision.mjs';
import {assertUnlockedChanges} from './track-state.mjs';
export function copyClips(project,ids){
 const p=validateProject(project),set=new Set(expandSelection(p,ids));for(const c of p.timeline.clips)if(c.audioAnchor&&set.has(c.audioAnchor.clipId))set.add(c.id);const clips=p.timeline.clips.filter(c=>set.has(c.id));if(!clips.length)throw Error('Selecciona clips para copiar.');
 const mediaIds=new Set(clips.map(c=>c.mediaId));let more=true;while(more){more=false;for(const m of p.assets)if(mediaIds.has(m.id)&&m.derivation?.sourceMediaId&&!mediaIds.has(m.derivation.sourceMediaId)){mediaIds.add(m.derivation.sourceMediaId);more=true;}}
 const start=Math.min(...clips.map(c=>c.timelineStart)),end=Math.max(...clips.map(clipEnd)),cues=p.cues.filter(q=>set.has(q.clipId));
 return structuredClone({schema:'autosubsco.clipboard',version:1,projectId:p.id,start,end,clips,cues,assets:p.assets.filter(m=>mediaIds.has(m.id)),speakers:p.speakers.filter(s=>cues.some(q=>q.speakerId===s.id)),separations:p.separations.filter(r=>set.has(r.clipId)),tracks:p.timeline.tracks.filter(t=>clips.some(c=>c.trackId===t.id)),groups:p.timeline.groups.filter(g=>g.clipIds.every(id=>set.has(id))),links:p.timeline.links.filter(g=>g.clipIds.every(id=>set.has(id)))});
}
export function pasteClips(project,clipboard,position){
 const p=validateProject(project),cb=structuredClone(clipboard);if(cb?.schema!=='autosubsco.clipboard'||cb.version!==1||!cb.clips?.length||!Number.isFinite(position)||position<0||!Number.isFinite(cb.end-cb.start)||cb.end<=cb.start)throw Error('No hay clips válidos para pegar.');
 const at=Math.round(position*p.sequence.fps)/p.sequence.fps,span=cb.end-cb.start,hasMain=cb.clips.some(c=>c.trackId==='video-1'),n=hasMain&&at<durationOf(p)-.00001?insertTimelineSpace(p,at,span):structuredClone(p),delta=at-cb.start,map=new Map(cb.clips.map(c=>[c.id,randomUUID()])),activity=new Map(),separation=new Map((cb.separations??[]).map(r=>[r.id,randomUUID()])),speakers=new Map();
 for(const m of cb.assets){const old=n.assets.find(a=>a.id===m.id);if(old&&old.path!==m.path)throw Error('El recurso copiado tiene otra identidad en este proyecto.');if(!old)n.assets.push(m);}
 for(const t of cb.tracks)if(!n.timeline.tracks.some(x=>x.id===t.id))n.timeline.tracks.push({...t,locked:false,muted:false,hidden:false,solo:false});
 for(const c of cb.clips)if(c.audioMix?.activity)activity.set(c.audioMix.activity.id,randomUUID());
 for(const voice of cb.speakers??[]){const old=n.speakers.find(s=>s.id===voice.id);const id=old&&JSON.stringify(old)!==JSON.stringify(voice)?randomUUID():voice.id;speakers.set(voice.id,id);if(!n.speakers.some(s=>s.id===id))n.speakers.push({...voice,id});}
 const newIds=[];for(const source of cb.clips){const c=structuredClone(source),old=c.id;c.id=map.get(old);newIds.push(c.id);c.timelineStart+=delta;
  if(c.audioAnchor){if(map.has(c.audioAnchor.clipId))c.audioAnchor.clipId=map.get(c.audioAnchor.clipId);else delete c.audioAnchor;}
  if(c.extractedFromId)c.extractedFromId=map.get(c.extractedFromId)??null;
  if(c.separationId&&separation.has(c.separationId))c.separationId=separation.get(c.separationId);else delete c.separationId;for(const mask of c.audioMasks??[])if(separation.has(mask.id))mask.id=separation.get(mask.id);delete c.analysisParentClipId;
  if(c.audioMix?.activity)c.audioMix.activity.id=activity.get(c.audioMix.activity.id);
  if(c.audioMix?.ducking)c.audioMix.ducking.sourceIds=c.audioMix.ducking.sourceIds.map(id=>activity.get(id)??id);
  if(c.trackId==='video-1'&&!cb.clips.some(x=>x.trackId==='video-1'&&x.id!==old&&Math.abs(clipEnd(x)-(source.timelineStart+(source.transitionIn?.type!=='none'?source.transitionIn.duration:0)))<.025))c.transitionIn={type:'none',duration:.5};
  n.timeline.clips.push(c);
 }
 for(const q of cb.cues)n.cues.push({...q,id:randomUUID(),clipId:map.get(q.clipId),speakerId:speakers.get(q.speakerId)??q.speakerId,start:q.start+delta,end:q.end+delta,words:(q.words??[]).map(w=>({...w,start:w.start+delta,end:w.end+delta}))});
 for(const key of ['groups','links'])for(const r of cb[key])n.timeline[key].push({...r,id:randomUUID(),clipIds:r.clipIds.map(id=>map.get(id))});
 for(const r of cb.separations??[])n.separations.push({...r,id:separation.get(r.id),clipId:map.get(r.clipId),range:{start:r.range.start+delta,end:r.range.end+delta}});
 n.diarization=null;n.exportRange={start:0,end:durationOf(n)};const result=validateProject(n);assertUnlockedChanges(p,result);return{project:result,ids:newIds};
}
export function setTrack(project,id,patch){const n=validateProject(project),t=n.timeline.tracks.find(t=>t.id===id);if(!t)throw Error('Pista no encontrada.');for(const k of ['locked','hidden','muted','solo'])if(Object.hasOwn(patch,k)){if(typeof patch[k]!=='boolean')throw Error('Estado de pista inválido.');if(['muted','solo'].includes(k)&&t.kind!=='audio'||k==='hidden'&&t.kind==='audio')throw Error('Control no disponible para esta pista.');t[k]=patch[k];}return validateProject(n);}
