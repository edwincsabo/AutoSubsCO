import {displayCue} from '../src/caption-view.mjs';
import {reliableWords} from '../src/text-cut-model.mjs';
const $=id=>document.getElementById(id);
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const stamp=time=>{const n=Math.max(0,time||0);return String(Math.floor(n/60)).padStart(2,'0')+':'+(n%60).toFixed(3).padStart(6,'0');};

export function mountAlignment(E,{workspace,textTool}){
 let proposal=null,chosen=new Set(),selectedId=null,audition=null,starting=false,run=0,lastRevision=null,preparing=false,lastCue=null;
 const section=node('details','property-section alignment-section');section.id='alignment-section';
 section.innerHTML='<summary>Sincronización por palabra <span id="alignment-state"></span></summary><p id="alignment-note" class="field-note"></p><div id="alignment-words-slot"></div><button id="alignment-cue" class="button outlined full">Realinear este subtítulo</button><button id="alignment-last" class="text-button hidden">Revisar propuesta preparada</button><details class="alignment-options"><summary>Ajustes de alineación</summary><p id="alignment-resource" class="field-note"></p><button id="alignment-download" class="text-button hidden">Preparar alineador local</button><label>Procesamiento<select id="alignment-acceleration"><option value="cpu">CPU · compatible</option><option value="gpu">GPU opcional · respaldo CPU</option></select></label><label class="check-label"><input id="alignment-vocals" type="checkbox"> Preferir voz separada</label><p class="field-note">Español. Hasta 20 segundos por subtítulo; las propuestas necesitan revisión.</p></details>';
 $('cue-editor').append(section);$('alignment-words-slot').append($('word-timings'));
 const range=node('section','alignment-range');range.innerHTML='<button id="alignment-range" class="button outlined full">Realinear el texto del rango</button><p class="field-note">Texto original en español. Hasta 25 subtítulos completos y dos minutos por propuesta.</p><button id="alignment-range-download" class="text-button hidden">Preparar alineador español · 355 MB</button><button id="alignment-range-review" class="text-button hidden">Revisar alineación preparada</button>';
 $('text-transcribe-panel').append(range);
 const dialog=node('dialog','modal alignment-dialog');dialog.id='alignment-dialog';dialog.setAttribute('aria-labelledby','alignment-title');
 dialog.innerHTML='<div class="modal-heading"><div><span class="eyebrow">SINCRONIZACIÓN DEL ORIGINAL</span><h2 id="alignment-title">Revisar alineación</h2></div><button id="alignment-close" class="icon-button" aria-label="Cerrar revisión de alineación">×</button></div><p id="alignment-summary" class="alignment-summary"></p><div class="alignment-review-body"><section id="alignment-results" class="alignment-results" aria-label="Subtítulos de la propuesta"></section><section id="alignment-detail" class="alignment-detail"></section></div><p class="alignment-guidance">Escucha las marcas antes de aplicarlas. El texto, los tiempos del subtítulo y las traducciones se conservan.</p><div class="alignment-footer"><button id="alignment-cancel" class="text-button">Descartar propuesta</button><button id="alignment-apply" class="button primary">Aplicar alineación</button></div>';
 document.body.append(dialog);
 const banner=node('div','alignment-preview-banner hidden');banner.id='alignment-preview-banner';banner.innerHTML='<span>Escuchando el texto original con la alineación propuesta</span><button id="alignment-return" class="text-button">Volver a revisión</button>';
 document.querySelector('.preview-panel').append(banner);
 const cue=()=>E.selection().kind==='cue'?E.selection().cue:null;
 const revision=()=>E.state().textCutRevision;
 const original=()=>!E.project()||(E.project().captionView?.language??'original')==='original';
 function stopPreview(returnToReview=false){run++;starting=false;const active=!!audition;audition=null;banner.classList.add('hidden');if(active){E.setTextPreview(false);E.pause();E.seek(E.position());}if(returnToReview&&proposal&&workspace()==='text'&&!document.body.classList.contains('home-open')&&!document.querySelector('dialog[open]'))showReview();}
 function invalidate(){const id=proposal?.id;proposal=null;dialog.dataset.planId='';chosen.clear();selectedId=null;stopPreview(false);if(dialog.open)dialog.close();if(id)E.api.discardAlignment(id).catch(()=>{});$('alignment-last').classList.add('hidden');$('alignment-range-review').classList.add('hidden');updateControls();}
 function updateControls(){
  const q=cue(),p=E.project(),r=E.state().resources?.find(r=>r.id==='alignment-es'),valid=q&&reliableWords(q),ready=!!r?.installed;
  section.classList.toggle('hidden',workspace()!=='text'||textTool()==='cut');
  $('alignment-state').textContent=valid?q.words.length+' palabras':'Sin tiempos';
  $('alignment-note').textContent=!original()?'Cambia Texto mostrado a Original para realinear.':valid?'Alineación en español. Selecciona una palabra para escuchar su posición o genera otra propuesta.':'Realinea el texto original corregido en español para obtener una propuesta de tiempos por palabra.';
  if(original()&&!ready)$('alignment-note').textContent='Prepara el alineador local desde Ajustes de alineación. Descarga aproximada: 355 MB.';
  $('alignment-cue').disabled=!q||!original()||!ready||E.busy()||preparing;
  $('alignment-range').disabled=!p?.cues.length||!original()||!ready||E.busy()||preparing;
  $('alignment-resource').textContent=ready?'Alineador español disponible localmente.':`Alineador español · ${Math.round((r?.size??355032883)/1e6)} MB de descarga.`;
  $('alignment-download').classList.toggle('hidden',ready);$('alignment-download').disabled=E.busy();
  $('alignment-range-download').classList.toggle('hidden',ready);$('alignment-range-download').disabled=E.busy();
  $('alignment-acceleration').value=E.state().settings.alignmentAcceleration??'cpu';$('alignment-acceleration').disabled=E.busy();
  $('alignment-vocals').checked=!!E.state().settings.preferVocals;$('alignment-vocals').disabled=E.busy()||!p?.separations.length;
  $('alignment-last').classList.toggle('hidden',!proposal);$('alignment-range-review').classList.toggle('hidden',!proposal);
 }
 async function prepare(scope){
  if(preparing||E.busy()||!E.project())return;
  invalidate();preparing=true;updateControls();
  const result=await E.task(()=>E.api.prepareAlignment({scope,cueId:cue()?.id,language:'es',acceleration:$('alignment-acceleration').value,preferVocals:$('alignment-vocals').checked}),'Preparando alineación del texto');
  preparing=false;
  if(result?.id){proposal=result;lastRevision=result.revision;chosen=new Set(result.rows.filter(r=>r.status==='aligned').map(r=>r.cueId));selectedId=result.rows.find(r=>r.status==='aligned')?.cueId??result.rows[0]?.cueId;showReview();}
  updateControls();
 }
 function updateApply(){const count=chosen.size;$('alignment-apply').disabled=!count||E.busy();$('alignment-apply').textContent=count?'Aplicar a '+count+(count===1?' subtítulo':' subtítulos'):'Sin propuestas para aplicar';}
 function showReview(){
  if(!proposal||proposal.revision!==revision()){invalidate();return;}
  dialog.dataset.planId=proposal.id;
  const host=$('alignment-results');host.replaceChildren();
  const provider=proposal.provider==='CPUExecutionProvider'?'CPU':'GPU opcional / CPU';
  $('alignment-summary').textContent=proposal.eligibleCount+' con propuesta · '+proposal.reviewCount+' para revisar · Español · '+provider+(proposal.fallback?' · se utilizó el respaldo CPU':'');
  for(const row of proposal.rows){
   const item=node('article','alignment-result');item.dataset.alignmentCue=row.cueId;
   const label=node('label','check-label'),check=document.createElement('input');check.type='checkbox';check.checked=chosen.has(row.cueId);check.disabled=row.status!=='aligned';check.setAttribute('aria-label','Aplicar al subtítulo: '+row.text.slice(0,80));check.onchange=()=>{if(check.checked)chosen.add(row.cueId);else chosen.delete(row.cueId);updateApply();};label.append(check,node('span',null,row.status==='aligned'?'Propuesta disponible':'Revisar texto/audio'));
   const button=node('button','alignment-result-open');button.setAttribute('aria-pressed',String(selectedId===row.cueId));button.append(node('small',null,stamp(row.start)+' — '+stamp(row.end)),node('span',null,row.text));button.onclick=()=>{selectedId=row.cueId;showReview();};item.append(label,button);host.append(item);
  }
  renderDetail();updateApply();if(!dialog.open)dialog.showModal();
 }
 function renderDetail(){
  const row=proposal?.rows.find(r=>r.cueId===selectedId),host=$('alignment-detail');host.replaceChildren();if(!row)return;
  host.append(node('span','eyebrow',row.status==='aligned'?'PROPUESTA DE TIEMPOS':'REVISIÓN NECESARIA'),node('p','alignment-original',row.text));
  if(row.reason)host.append(node('p','alignment-warning',row.reason));
  const listen=node('button','button outlined full',row.status==='aligned'?'Escuchar con estas marcas':'Escuchar el fragmento original');listen.id='alignment-listen';listen.onclick=()=>listenRow(row);host.append(listen);
  if(row.words.length){const words=node('div','alignment-proposed-words');words.id='alignment-proposed-words';for(const w of row.words){const b=node('button','alignment-proposed-word');b.append(node('span',null,w.text),node('small',null,stamp(w.start)+' — '+stamp(w.end)));b.title='Escuchar esta palabra con contexto';b.onclick=()=>listenRow(row,{start:Math.max(row.start,w.start-.1),end:Math.min(row.end,w.end+.2)});words.append(b);}host.append(words,node('p','field-note','Las marcas son estimaciones del audio. No son una medida de exactitud del texto.'));}
 }
 async function listenRow(row,interval={start:row.start,end:row.end}){
  if(!proposal||proposal.revision!==revision())return;
  stopPreview(false);dialog.close();E.pause();E.setTextPreview(true);E.seek(interval.start);
  audition={row,end:interval.end};starting=true;const current=++run;banner.classList.remove('hidden');
  try{await E.play();if(run!==current)return;starting=false;}catch(e){E.toast(e.message,true);stopPreview(true);}
 }
 function tick(){if(starting||!audition)return;if(E.position()>=audition.end-.004){E.seek(audition.end);stopPreview(true);}else if(!E.isPlaying())stopPreview(false);}
 function render(){
  if(proposal&&lastRevision!==revision())invalidate();
  if(audition&&(workspace()!=='text'||textTool()==='cut'||document.body.classList.contains('home-open')))stopPreview(false);
  if(lastCue!==cue()?.id){lastCue=cue()?.id;if(dialog.open&&!proposal)dialog.close();}
  updateControls();
 }
 $('alignment-cue').onclick=()=>prepare('cue');$('alignment-range').onclick=()=>prepare('range');
 $('alignment-acceleration').onchange=()=>E.action(()=>E.api.settings({alignmentAcceleration:$('alignment-acceleration').value}));
 $('alignment-vocals').onchange=()=>E.action(()=>E.api.settings({preferVocals:$('alignment-vocals').checked}));
 $('alignment-download').onclick=()=>E.task(()=>E.api.downloadResource('alignment-es'),'Preparando alineador español');
 $('alignment-range-download').onclick=$('alignment-download').onclick;
 $('alignment-last').onclick=showReview;$('alignment-range-review').onclick=showReview;
 $('alignment-close').onclick=()=>dialog.close();$('alignment-cancel').onclick=invalidate;$('alignment-return').onclick=()=>stopPreview(true);
 $('alignment-apply').onclick=async()=>{if(!proposal||!chosen.size)return;stopPreview(false);const id=proposal.id,ids=[...chosen];dialog.close();const result=await E.action(()=>E.api.applyAlignment(id,ids));invalidate();if(result?.models){E.renderEditor();E.toast('Alineación aplicada. Puedes deshacerla en un solo paso.');}};
 return {render,invalidate,tick,previewFrame:time=>{if(!audition||!proposal||audition.row.status!=='aligned')return undefined;return {time,forceKaraoke:true,cues:E.project().cues.filter(c=>c.start<=time&&c.end>time).map(c=>{const shown=displayCue(c,E.project());return c.id===audition.row.cueId?{...shown,text:c.text,words:audition.row.words}:shown;})};}};
}
