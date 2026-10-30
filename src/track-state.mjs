export const trackFor=(p,id)=>p?.timeline?.tracks.find(t=>t.id===id);
export const visualEnabled=(p,c)=>!trackFor(p,c.trackId)?.hidden;
export const captionsEnabled=p=>!trackFor(p,'captions-1')?.hidden;
export function audioEnabled(p,c){
 const id=c.kind==='video'?'audio-1':c.trackId,t=trackFor(p,id);
 return !t?.muted&&(!p.timeline.tracks.some(t=>t.kind==='audio'&&t.solo)||!!t?.solo);
}
export function validateTracks(p){const ids=new Set();for(const t of p.timeline.tracks){if(!t||typeof t.id!=='string'||ids.has(t.id)||!['video','audio','captions'].includes(t.kind)||typeof t.name!=='string'||t.name.length>80)throw Error('Pista inválida.');ids.add(t.id);for(const k of ['locked','hidden','muted','solo']){t[k]??=false;if(typeof t[k]!=='boolean')throw Error('Estado de pista inválido.');}}}
export function assertUnlockedChanges(before,next){
 if(!before||before.id!==next.id)return;
 for(const t of before.timeline.tracks.filter(t=>t.locked)){
  if(t.kind==='captions'){if(JSON.stringify(before.cues)!==JSON.stringify(next.cues))throw Error('La pista de subtítulos está bloqueada.');continue;}
  const rows=p=>p.timeline.clips.filter(c=>c.trackId===t.id||t.id==='audio-1'&&c.kind==='video'&&!c.audioDetached&&p.assets.find(m=>m.id===c.mediaId)?.hasAudio).map(c=>t.id==='audio-1'?{id:c.id,mediaId:c.mediaId,sourceIn:c.sourceIn,sourceOut:c.sourceOut,timelineStart:c.timelineStart,volume:c.volume,muted:c.muted,audioMix:c.audioMix,audioDetached:c.audioDetached}:c);
  if(JSON.stringify(rows(before))!==JSON.stringify(rows(next)))throw Error(`La pista ${t.name} está bloqueada. Desbloquéala para modificarla.`);
 }
}
