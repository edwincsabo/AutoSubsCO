import {curveTarget,drawAudioCurve} from './audio-curves.js';
import {isMainVideo} from '../src/motion.mjs';
import {displayCue} from '../src/caption-view.mjs';
import {expandSelection,mainGaps} from '../src/selection.mjs';
const $=id=>document.getElementById(id),end=c=>c.timelineStart+c.sourceOut-c.sourceIn;
const stamp=n=>{n=Math.max(0,n);return `${String(Math.floor(n/60)).padStart(2,'0')}:${(n%60).toFixed(1).padStart(4,'0')}`;};
export function mountTimeline(E){
 const layerWrap=document.createElement('div');layerWrap.id='video-layer-tracks';$('video-track').after(layerWrap);let gesture=null,rowMap=new Map(),ghosts=[];
 const width=()=>Math.min(24000,Math.max(1,$('tracks-scroll').clientWidth)*Number($('zoom').value));
 const duration=()=>Math.max(0,...(E.project()?.timeline.clips??[]).map(end));
 const at=e=>Math.max(0,(e.clientX-$('tracks-content').getBoundingClientRect().left)/width()*duration());
 const selectedIds=()=>new Set(E.selection().clipIds??[]);
 function setup(canvas,height){const w=width(),scale=Math.min(1.5,devicePixelRatio||1);canvas.width=Math.round(w*scale);canvas.height=Math.round(height*scale);canvas.style.width=w+'px';canvas.style.height=height+'px';const ctx=canvas.getContext('2d');ctx.scale(scale,scale);return ctx;}
 function label(parent,text){const node=document.createElement('span');node.textContent=text;node.title=text;parent.append(node);}
 function paintSelection(){const ids=selectedIds();for(const b of document.querySelectorAll('[data-timeline-clip]')){b.classList.toggle('selected',ids.has(b.dataset.timelineClip));b.classList.toggle('active-clip',E.selection().clip?.id===b.dataset.timelineClip);b.setAttribute('aria-pressed',String(ids.has(b.dataset.timelineClip)));}}
 function clearGhosts(){ghosts.forEach(g=>g.remove());ghosts=[];}
 function begin(e,c,target){
  if(e.button!==0||E.busy())return;E.pause();e.stopPropagation();e.preventDefault();
  const modifier=e.ctrlKey||e.metaKey||e.shiftKey;E.selectClip(c.id,false,false,{toggle:e.ctrlKey||e.metaKey,range:e.shiftKey,preserve:!modifier});paintSelection();if(modifier)return;
  const d=duration(),w=width(),t=(e.clientX-$('tracks-content').getBoundingClientRect().left)/w*d,edge=Math.min(7,(end(c)-c.timelineStart)/d*w/4)/w*d,mode=t-c.timelineStart<edge?'left':end(c)-t<edge?'right':'move';
  const ids=mode==='move'?E.selection().clipIds:expandSelection(E.project(),[c.id],{groups:false});
  gesture={id:c.id,ids,originals:E.project().timeline.clips.filter(x=>ids.includes(x.id)).map(x=>structuredClone(x)),clientX:e.clientX,duration:d,width:w,mode,delta:0,moved:false};
  target.setPointerCapture(e.pointerId);
 }
 function snapped(delta){
  const g=gesture,p=E.project(),fps=p.sequence.fps,frame=Math.round(delta*fps)/fps;if(!E.state().settings.snap)return frame;
  const c=g.originals.find(c=>c.id===g.id),edge=g.mode==='right'?end(c):c.timelineStart,value=edge+frame,threshold=Math.min(.2,8*g.duration/g.width),candidates=[0,E.position(),...p.timeline.clips.filter(c=>!g.ids.includes(c.id)).flatMap(c=>[c.timelineStart,end(c)]),...p.cues.flatMap(q=>[q.start,q.end])];let best=frame,distance=threshold;for(const target of candidates){const diff=Math.abs(target-value);if(diff<distance){distance=diff;best=target-edge;}}return Math.round(best*fps)/fps;
 }
 function move(e){
  if(!gesture)return;const g=gesture;g.moved||=Math.abs(e.clientX-g.clientX)>3;if(!g.moved)return;let delta=snapped((e.clientX-g.clientX)/g.width*g.duration);
  if(g.mode==='move')delta=Math.max(-Math.min(...g.originals.map(c=>c.timelineStart)),delta);
  else if(g.mode==='left')delta=Math.max(...g.originals.map(c=>-c.sourceIn),Math.min(Math.min(...g.originals.map(c=>c.sourceOut-c.sourceIn-.05)),delta));
  else delta=Math.min(...g.originals.map(c=>E.project().assets.find(m=>m.id===c.mediaId).duration-c.sourceOut),Math.max(Math.max(...g.originals.map(c=>c.sourceIn+.05-c.sourceOut)),delta));
  g.delta=delta;clearGhosts();for(const c of g.originals){const row=rowMap.get(c.trackId);if(!row)continue;const box=document.createElement('span');box.className='timeline-gesture-preview';const start=c.timelineStart+(g.mode==='move'||g.mode==='left'&&!E.state().settings.ripple?delta:0),length=c.sourceOut-c.sourceIn+(g.mode==='right'?delta:g.mode==='left'?-delta:0);box.style.left=start/g.duration*g.width+'px';box.style.width=Math.max(3,length/g.duration*g.width)+'px';box.textContent=(delta>=0?'+':'')+delta.toFixed(3)+' s';row.append(box);ghosts.push(box);}
 }
 async function finish(){if(!gesture)return;const g=gesture;gesture=null;clearGhosts();if(!g.moved||Math.abs(g.delta)<.00001){if(!g.moved)E.selectClip(g.id,false,false);const c=E.project().timeline.clips.find(c=>c.id===g.id);if(c)E.seek(c.timelineStart);draw();return;}E.pause();await E.action(()=>E.api.precision(g.mode==='move'?'move':'trim',g.ids,g.mode==='move'?{delta:g.delta}:{id:g.id,edge:g.mode,delta:g.delta,ripple:!!E.state().settings.ripple}));draw();}
 function cancel(){gesture=null;clearGhosts();draw();}
 function clipButton(row,c,px){
  const p=E.project(),m=p.assets.find(m=>m.id===c.mediaId),group=p.timeline.groups.find(g=>g.clipIds.includes(c.id)),link=p.timeline.links.find(l=>l.clipIds.includes(c.id)),b=document.createElement('button');
  b.className='timeline-clip'+(c.kind==='audio'?' audio-timeline-clip':'')+(group?' grouped':'')+(link?' linked':'');b.dataset.timelineClip=c.id;b.style.left=c.timelineStart*px+'px';b.style.width=Math.max(5,(c.sourceOut-c.sourceIn)*px-2)+'px';b.textContent=m.name;b.title=[m.name,group?.name,link?'Audio y video vinculados':null,c.audioDetached?'Audio en pista independiente':null].filter(Boolean).join(' · ');b.setAttribute('aria-label',b.title);
  b.onpointerdown=e=>begin(e,c,b);b.onpointermove=move;b.onpointerup=finish;b.onpointercancel=cancel;b.onclick=e=>e.stopPropagation();row.append(b);
 }
 function wave(ctx,c,px){const p=E.project(),m=p.assets.find(m=>m.id===c.mediaId),x=c.timelineStart*px,w=(c.sourceOut-c.sourceIn)*px,peaks=E.waveformFor(m.id);for(let i=0;i<w;i+=Math.max(2,width()/1600)){const source=c.sourceIn+i/px,index=Math.min(peaks.length-1,Math.floor(source/m.duration*peaks.length)),masked=(c.audioMasks??[]).some(r=>source>=r.start&&source<r.end),h=Math.max(1,(peaks[index]??0)*28*Math.min(1,c.volume));ctx.fillStyle=c.muted||masked||c.audioDetached?'#465367':c.kind==='audio'?'#75a7d0':'#6bb59d';ctx.fillRect(x+i,21-h/2,1,h);}}
 function draw(){
  if(gesture||document.querySelector('.audio-automation-lane[data-dragging]'))return;document.querySelectorAll('.audio-automation-lane').forEach(n=>n.remove());const p=E.project(),w=width(),curve=curveTarget(E),curveTrack=curve?.kind==='video'?'audio-1':curve?.trackId;$('tracks-content').style.width=w+'px';layerWrap.replaceChildren();$('extra-audio-tracks').replaceChildren();$('video-track').replaceChildren();rowMap=new Map([['video-1',$('video-track')],['audio-1',$('waveform').parentElement]]);
  const videoTracks=p?p.timeline.tracks.filter(t=>t.kind==='video'&&t.id!=='video-1'&&p.timeline.clips.some(c=>c.trackId===t.id)).sort((a,b)=>Number(a.id.split('-')[1])-Number(b.id.split('-')[1])):[],audioTracks=p?p.timeline.tracks.filter(t=>t.kind==='audio'&&t.id!=='audio-1'&&(t.id==='audio-2'||p.timeline.clips.some(c=>c.trackId===t.id))):[{id:'audio-2',name:'Audio adicional'}];
  for(const t of videoTracks){const row=document.createElement('div');row.className='video-track layer-track';row.dataset.track=t.id;layerWrap.append(row);rowMap.set(t.id,row);}
  const heads=document.querySelector('.track-labels');heads.replaceChildren();const inner=document.createElement('div');inner.className='labels-inner';inner.append(document.createElement('div'));label(inner,'V1 Montaje');for(const t of videoTracks)label(inner,t.name);label(inner,'A1 Audio de video');for(const t of audioTracks)label(inner,t.name);label(inner,'S1 Subtítulos');heads.append(inner);if(curve){const head=document.createElement('span');head.className='audio-automation-label';head.textContent='Volumen · 0–200%';const index=curveTrack==='audio-1'?videoTracks.length+2:videoTracks.length+3+audioTracks.findIndex(t=>t.id===curveTrack);inner.children[index]?.after(head);}inner.style.transform='translateY(-'+$('tracks-scroll').scrollTop+'px)';
  const ruler=setup($('ruler'),26),original=setup($('waveform'),43),captions=setup($('caption-track'),43),audioCtx=new Map();
  for(let i=0;i<audioTracks.length;i++){const t=audioTracks[i],row=document.createElement('div');row.className='audio-track';row.dataset.track=t.id;const canvas=document.createElement('canvas');canvas.id=i?'studio-audio-'+i:'extra-audio';row.append(canvas);$('extra-audio-tracks').append(row);rowMap.set(t.id,row);audioCtx.set(t.id,setup(canvas,43));}
  $('waveform').parentElement.querySelectorAll('.timeline-clip').forEach(b=>b.remove());$('waveform').onpointerdown=e=>{if(!p)return;const t=at(e),c=p.timeline.clips.filter(c=>c.kind==='audio'&&c.trackId==='audio-1'||c.kind==='video'&&!c.audioDetached).toReversed().find(c=>t>=c.timelineStart&&t<end(c));if(c)begin(e,c,$('waveform'));else E.seek(t);};$('waveform').onpointermove=move;$('waveform').onpointerup=finish;$('waveform').onpointercancel=cancel;
  $('tracks-content').style.height=(26+44*(3+videoTracks.length+audioTracks.length)+(curve?88:0))+'px';if(!p)return;const d=duration(),px=w/d,step=[.1,.25,.5,1,2,5,10,15,30,60,120,300,600,1800,3600,21600,86400].find(s=>s*px>=72)??86400;ruler.font='9px Segoe UI';ruler.fillStyle='#7587a5';for(let t=0;t<d;t+=step){ruler.fillText(stamp(t),t*px+4,15);ruler.fillRect(t*px,22,1,4);}
  for(const gap of mainGaps(p)){const b=document.createElement('button');b.className='timeline-gap';b.style.left=gap.start*px+'px';b.style.width=(gap.end-gap.start)*px+'px';b.textContent=(gap.end-gap.start).toFixed(2)+' s';b.title='Hueco de V1. El control Cerrar huecos elimina este tiempo en todas las pistas.';b.onclick=e=>{e.stopPropagation();E.seek(gap.start);};$('video-track').append(b);}
  for(const c of p.timeline.clips){const row=rowMap.get(c.trackId),m=p.assets.find(m=>m.id===c.mediaId);if(row)clipButton(row,c,px);if(m.hasAudio){const ctx=c.kind==='video'||c.trackId==='audio-1'?original:audioCtx.get(c.trackId);if(ctx)wave(ctx,c,px);}}
  const issues=new Set(E.state().review.map(v=>v.cueId));captions.font='10px Segoe UI';for(const c of p.cues){const x=c.start*px,width=Math.max(3,(c.end-c.start)*px-2);captions.fillStyle=c.id===E.selection().cue?.id?'#9b7bc5':issues.has(c.id)?'#71583e':'#584374';captions.fillRect(x,6,width,30);if(width>25){captions.save();captions.beginPath();captions.rect(x+4,6,width-8,30);captions.clip();captions.fillStyle='#e9def8';captions.fillText(displayCue(c,p).text.replaceAll('\n',' '),x+6,25);captions.restore();}}
  $('selection-range').style.left=p.exportRange.start*px+'px';$('selection-range').style.width=(p.exportRange.end-p.exportRange.start)*px+'px';$('playhead').style.left=E.position()*px+'px';if(curve&&rowMap.has(curveTrack))drawAudioCurve(E,curve,rowMap.get(curveTrack),w,d);paintSelection();markers();
 }
 function markers(){const p=E.project();if(!p||gesture)return;document.querySelectorAll('.studio-keyframe-marker,.studio-transition-marker').forEach(e=>e.remove());const px=width()/duration(),c=E.selection().clip;if(c?.kind==='video')for(const k of c.keyframes){const local=k.time-(c.animationOffset??0);if(local<0||local>c.sourceOut-c.sourceIn)continue;const mark=document.createElement('span');mark.className='studio-keyframe-marker';mark.style.left=(c.timelineStart+local)*px+'px';mark.title='Fotograma clave '+stamp(local);rowMap.get(c.trackId)?.append(mark);}const main=p.timeline.clips.filter(isMainVideo).sort((a,b)=>a.timelineStart-b.timelineStart);for(const c of main.slice(1)){if(c.transitionIn.type==='none')continue;const mark=document.createElement('span');mark.className='studio-transition-marker';mark.style.left=c.timelineStart*px+'px';mark.style.width=c.transitionIn.duration*px+'px';rowMap.get('video-1')?.append(mark);}}
 return{draw,markers};
}
