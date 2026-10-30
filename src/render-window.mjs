import {clipEnd} from './project.mjs';
export function renderWindow(p,range){
 // Con transiciones se conserva el reloj completo para respetar ambos extremos del solapamiento.
 if(p.timeline.clips.some(c=>c.transitionIn?.type!=='none'))return{project:p,range,optimized:false};
 const n={...p,timeline:{...p.timeline,clips:[]}},fadeInfo=new Map();
 for(const c of p.timeline.clips){if(c.timelineStart>=range.end||clipEnd(c)<=range.start)continue;const left=Math.max(0,range.start-c.timelineStart),right=Math.max(0,clipEnd(c)-range.end);const row={...c,sourceIn:c.sourceIn+left,sourceOut:c.sourceOut-right,timelineStart:Math.max(0,c.timelineStart-range.start),animationOffset:(c.animationOffset??0)+left};fadeInfo.set(c.id,{offset:left,duration:c.sourceOut-c.sourceIn});n.timeline.clips.push(row);}
 return{project:n,range:{start:0,end:range.end-range.start},optimized:true,fadeInfo};
}
