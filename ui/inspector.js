import {displayCue} from '../src/caption-view.mjs';
const clock = value => {const ms=Math.round(Math.max(0,value)*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;};
const names={original:'Original',es:'Español',en:'Inglés',pt:'Portugués',fr:'Francés'};

export function mountInspectorContext(E,{workspace,textTool,openWorkspace,setTextTool}){
 const $=id=>document.getElementById(id),right=document.querySelector('.inspector');
 const hint=document.createElement('section');hint.id='inspector-hint';hint.className='inspector-hint hidden';
 hint.innerHTML='<h3 id="inspector-hint-title"></h3><p id="inspector-hint-note"></p><button id="inspector-hint-action" class="button outlined"></button>';
 $('subtitles-pane').prepend(hint);
 const summary=document.createElement('section');summary.id='delivery-summary';summary.className='delivery-summary hidden';
 summary.innerHTML='<span class="section-label">RESUMEN DE SALIDA</span><dl><div><dt>Rango</dt><dd id="delivery-range"></dd></div><div><dt>Duración de salida</dt><dd id="delivery-duration"></dd></div><div><dt>Imagen</dt><dd id="delivery-image"></dd></div><div><dt>Subtítulos</dt><dd id="delivery-captions"></dd></div><div><dt>Procesamiento</dt><dd id="delivery-engine"></dd></div></dl><section class="delivery-checks"><h3>Antes de exportar</h3><p id="delivery-range-note"></p><p id="delivery-review-note"></p><button id="delivery-review" class="text-button">Revisar subtítulos</button></section><p class="field-note">El formato se ajusta a la izquierda. Cada botón de exportación permite elegir el destino.</p><button id="delivery-back" class="button outlined full">Volver al montaje</button>';
 right.append(summary);$('delivery-back').onclick=()=>openWorkspace('montage');
 $('delivery-review').onclick=()=>{openWorkspace('text');setTextTool('list');E.tab('review');};
 function render(){
  const p=E.project(),space=workspace(),selection=E.selection(),cue=selection.kind==='cue'?selection.cue:null,clip=selection.kind==='clip'?selection.clip:null;
  const media=p?.assets.find(m=>m.id===clip?.mediaId),audio=space==='audio',delivery=space==='delivery';
  const cut=space==='text'&&textTool()==='cut';
  const mode=delivery?'delivery':cut?'text-cut':space==='text'?(cue?'text-cue':'text-idle'):audio?(clip&&media?.hasAudio?'audio-clip':'audio-idle'):cue?'cue':clip?'clip':'idle';
  right.dataset.context=mode;summary.classList.toggle('hidden',!delivery);hint.classList.toggle('hidden',!['text-idle','audio-idle','idle'].includes(mode));
  if(cut)return;
  if(mode==='text-idle'){
   $('inspector-title').textContent='Propiedades del subtítulo';$('inspector-description').textContent='Selecciona texto para corregirlo o ajustar su estilo.';
   $('inspector-hint-title').textContent=p?.cues.length?'Selecciona un subtítulo':'Prepara tu transcripción';
   $('inspector-hint-note').textContent=p?.cues.length?'Haz clic en la lista de la izquierda o en la pista de texto. La selección de clips se conserva en Montaje.':'Genera subtítulos o importa un SRT desde las herramientas de la izquierda.';
   const b=$('inspector-hint-action');b.textContent=clip?'Editar clip en Montaje':'Ir a transcripción';b.disabled=E.busy();b.onclick=()=>clip?openWorkspace('montage'):setTextTool('transcribe');
  }else if(mode==='audio-clip'){
   $('inspector-title').textContent='Audio del clip';$('inspector-description').textContent=media.name;
  }else if(mode==='audio-idle'){
   $('inspector-title').textContent='Propiedades del audio';$('inspector-description').textContent='Selecciona un clip con audio para ajustar su mezcla.';
   $('inspector-hint-title').textContent='Elige una pista de audio';$('inspector-hint-note').textContent='Usa el selector de clip de la izquierda o una pista de la línea de tiempo.';
   const b=$('inspector-hint-action'),candidate=p?.timeline.clips.find(c=>p.assets.find(m=>m.id===c.mediaId)?.hasAudio&&!c.audioDetached);
   b.textContent='Seleccionar un clip con audio';b.disabled=!candidate||E.busy();b.onclick=()=>candidate&&E.selectClip(candidate.id,false);
  }else if(mode==='idle'){
   $('inspector-hint-title').textContent='Sin selección';$('inspector-hint-note').textContent='Selecciona un elemento en la biblioteca o en la línea de tiempo.';
   const b=$('inspector-hint-action');b.textContent='Abrir medios';b.disabled=E.busy();b.onclick=()=>openWorkspace('media');
  }
  if(!delivery)return;
  $('inspector-title').textContent='Entrega del proyecto';$('inspector-description').textContent=p?.name??'Abre un proyecto para preparar la salida.';
  if(!p){for(const id of ['range','duration','image','captions','engine'])$('delivery-'+id).textContent='—';$('delivery-range-note').textContent='Importa un medio para crear una secuencia.';$('delivery-review-note').textContent='';$('delivery-review').disabled=true;$('delivery-back').disabled=true;return;}
  $('delivery-back').disabled=false;
  const {start,end}=p.exportRange,total=Math.max(...p.timeline.clips.map(c=>c.timelineStart+c.sourceOut-c.sourceIn)),cues=p.cues.filter(c=>c.end>start&&c.start<end),ids=new Set(cues.map(c=>c.id));
  const issues=E.state().review.filter(i=>ids.has(i.cueId)),missing=cues.filter(c=>displayCue(c,p).translationMissing).length,lang=p.captionView?.language??'original';
  $('delivery-range').textContent=clock(start)+' — '+clock(end);$('delivery-duration').textContent=clock(end-start);
  $('delivery-image').textContent=`${p.sequence.width} × ${p.sequence.height} · ${p.sequence.fps} FPS`;
  $('delivery-captions').textContent=`${cues.length} · ${names[lang]??lang}${lang!=='original'&&p.captionView?.dual?' + original':''}`;
  $('delivery-engine').textContent=E.state().settings.renderAcceleration==='gpu'?(E.state().hardware.videoEncoder?'GPU opcional · respaldo CPU':'GPU no disponible · usará CPU'):'CPU · compatible';
  $('delivery-range-note').textContent=Math.abs(start)<.001&&Math.abs(end-total)<.025?'Se exportará la secuencia completa.':'Se exportará solo el rango marcado en la línea de tiempo.';
  $('delivery-review-note').textContent=!cues.length?'El video incluirá las capas y títulos del rango. No hay subtítulos en esta selección.':issues.length?`${issues.length} avisos en el rango.${missing?' '+missing+' subtítulos sin traducción; se mostrará su original.':''}`:'Sin avisos de subtítulos en el rango.';
  $('delivery-review').disabled=!cues.length||E.busy();
 }
 return {render};
}
