// Selección compartida por la interfaz y las operaciones de edición.
export function expandSelection(p,ids,{groups=true,links=true}={}){
 const valid=new Set((p?.timeline.clips??[]).map(c=>c.id)),selected=new Set((ids??[]).filter(id=>valid.has(id)));
 const sets=[...(groups?p?.timeline.groups??[]:[]),...(links?p?.timeline.links??[]:[])];
 let changed=true;while(changed){changed=false;for(const set of sets)if(set.clipIds.some(id=>selected.has(id)))for(const id of set.clipIds)if(valid.has(id)&&!selected.has(id)){selected.add(id);changed=true;}}
 return [...selected];
}
export function mainGaps(p){const clips=(p?.timeline.clips??[]).filter(c=>c.kind==='video'&&c.trackId==='video-1').sort((a,b)=>a.timelineStart-b.timelineStart),gaps=[];let cursor=0;for(const c of clips){if(c.timelineStart-cursor>=.5/(p?.sequence.fps??30))gaps.push({start:cursor,end:c.timelineStart});cursor=Math.max(cursor,c.timelineStart+c.sourceOut-c.sourceIn);}return gaps;}
export function transitionSource(p,c){if(c.kind==='video'&&c.trackId==='video-1')return c;const link=p.timeline.links?.find(l=>l.clipIds.includes(c.id));const video=link&&p.timeline.clips.find(v=>link.clipIds.includes(v.id)&&v.kind==='video'&&v.trackId==='video-1');return video&&Math.abs(video.timelineStart-c.timelineStart)<.025&&Math.abs((video.sourceOut-video.sourceIn)-(c.sourceOut-c.sourceIn))<.025?video:null;}
export function validateSelectionData(p){
 const valid=new Set(p.timeline.clips.map(c=>c.id));p.timeline.groups??=[];p.timeline.links??=[];
 for(const key of ['groups','links']){if(!Array.isArray(p.timeline[key])||p.timeline[key].length>100)throw new Error('Relaciones de clips inválidas.');const used=new Set(),ids=new Set();for(const item of p.timeline[key]){if(typeof item.id!=='string'||!item.id||ids.has(item.id)||!Array.isArray(item.clipIds)||item.clipIds.length<2||new Set(item.clipIds).size!==item.clipIds.length||item.clipIds.some(id=>!valid.has(id)||used.has(id)))throw new Error('Grupo o vínculo inválido.');ids.add(item.id);item.clipIds.forEach(id=>used.add(id));if(key==='groups'&&(typeof item.name!=='string'||!item.name.trim()||item.name.length>80))throw new Error('Nombre de grupo inválido.');if(key==='links'){const clips=item.clipIds.map(id=>p.timeline.clips.find(c=>c.id===id));if(clips.filter(c=>c.kind==='video').length!==1||!clips.some(c=>c.kind==='audio'))throw new Error('Un vínculo necesita un video y al menos un audio.');}}}
 for(const c of p.timeline.clips)if(c.audioDetached!==undefined&&typeof c.audioDetached!=='boolean')throw new Error('Estado del audio original inválido.');
}
