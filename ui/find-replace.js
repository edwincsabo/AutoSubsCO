import {CAPTION_LANGUAGES} from '../src/caption-view.mjs';
import {evaluateReplacement,replaceSegments} from '../src/find-replace-model.mjs';
const $=id=>document.getElementById(id),PAGE=25;
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const stamp=time=>String(Math.floor(time/60)).padStart(2,'0')+':'+(time%60).toFixed(3).padStart(6,'0');
const count=(value,one,many)=>value+' '+(value===1?one:many);

export function mountFindReplace(E,{openWorkspace,setTextTool}){
 let plan=null,selected=new Set(),active=null,page=0,request=0,pending=false,applying=false,canApply=false,lastProject=null,lastRevision=null;
 const group=node('div','search-replace-tools'),search=$('search-cues');search.before(group);group.append(search);
 const openButton=node('button','button outlined','Reemplazar');openButton.id='find-replace-open';openButton.title='Buscar y reemplazar subtítulos (Ctrl+H)';openButton.setAttribute('aria-haspopup','dialog');group.append(openButton);
 const dialog=node('dialog','modal replace-dialog');dialog.id='find-replace-dialog';dialog.setAttribute('aria-labelledby','replace-title');
 dialog.innerHTML='<div class="modal-heading"><div><span class="eyebrow">CORRECCIÓN DE SUBTÍTULOS</span><h2 id="replace-title">Buscar y reemplazar</h2></div><button id="replace-close" class="icon-button" aria-label="Cerrar buscar y reemplazar">×</button></div><div class="replace-form"><div class="replace-fields"><label>Buscar<input id="replace-query" type="search" maxlength="200" placeholder="Palabra o frase…"></label><label>Reemplazar por<textarea id="replace-value" rows="2" maxlength="1000" placeholder="Texto nuevo; vacío para quitar la coincidencia"></textarea></label></div><div class="replace-targets"><label>Texto que se modifica<select id="replace-language"></select></label><label>Alcance<select id="replace-scope"><option value="range">Rango marcado</option><option value="project">Todo el proyecto</option></select></label></div><details class="replace-options"><summary>Opciones de búsqueda</summary><div><label class="check-label"><input id="replace-case" type="checkbox"> Distinguir mayúsculas</label><label class="check-label"><input id="replace-whole" type="checkbox"> Palabra completa</label><label class="check-label"><input id="replace-accents" type="checkbox"> Ignorar tildes (ñ conserva su diferencia con n)</label><label class="check-label"><input id="replace-spaces" type="checkbox" checked> Tratar saltos y espacios consecutivos como un espacio</label></div></details><p class="replace-scope-note">El rango incluye subtítulos completos. La búsqueda usa texto literal y no modifica etiquetas de voz.</p></div><div class="replace-status"><p id="replace-feedback" role="status">Prepara los cambios para revisarlos antes de aplicar.</p><div class="replace-selection"><button id="replace-select-all" class="text-button" disabled>Todas</button><button id="replace-select-none" class="text-button" disabled>Ninguna</button></div></div><div class="replace-review"><section class="replace-list-panel"><div id="replace-results" class="replace-results" aria-label="Subtítulos con coincidencias"></div><div id="replace-pagination" class="replace-pagination hidden"><button id="replace-prev" class="text-button">Anterior</button><span id="replace-page"></span><button id="replace-next" class="text-button">Siguiente</button></div></section><section id="replace-detail" class="replace-detail" aria-live="polite"></section></div><div class="replace-footer"><button id="replace-discard" class="text-button" disabled>Descartar propuesta</button><div><button id="replace-prepare" class="button outlined">Preparar cambios</button><button id="replace-apply" class="button primary" disabled>Aplicar cambios</button></div></div>';
 document.body.append(dialog);
 const fields=['replace-query','replace-value','replace-language','replace-scope','replace-case','replace-whole','replace-accents','replace-spaces'];
 function options(){return {query:$('replace-query').value,replacement:$('replace-value').value,language:$('replace-language').value,scope:$('replace-scope').value,caseSensitive:$('replace-case').checked,wholeWord:$('replace-whole').checked,ignoreAccents:$('replace-accents').checked,flexibleWhitespace:$('replace-spaces').checked};}
 function languages(reset=false){
  const p=E.project(),previous=$('replace-language').value,view=p?.captionView?.language??'original',codes=Object.keys(CAPTION_LANGUAGES).filter(code=>code==='original'||code===view||code===previous||p?.cues.some(c=>c.translations?.[code]));
  $('replace-language').replaceChildren(...codes.map(code=>new Option(CAPTION_LANGUAGES[code],code)));$('replace-language').value=reset?view:codes.includes(previous)?previous:view;
 }
 function controls(){
  const locked=pending||applying||E.busy(),has=!!E.project()?.cues.length;
  openButton.disabled=!has||locked;openButton.textContent=plan?'Revisar':'Reemplazar';
  $('replace-prepare').disabled=!has||locked||!$('replace-query').value.trim();$('replace-prepare').textContent=pending?'Buscando…':'Preparar cambios';
  for(const id of ['replace-select-all','replace-select-none','replace-discard'])$(id).disabled=!plan||locked;
  $('replace-apply').disabled=!canApply||locked;
 }
 function clear(close=false){
  request++;const id=plan?.id;plan=null;canApply=false;selected.clear();active=null;page=0;dialog.dataset.planId='';
  if(id)E.api.discardFindReplace(id).catch(()=>{});
  $('replace-results').replaceChildren();$('replace-detail').replaceChildren(node('p','replace-empty','Aquí verás el texto anterior, el resultado y sus avisos.'));
  $('replace-feedback').textContent='Prepara los cambios para revisarlos antes de aplicar.';$('replace-feedback').classList.remove('error');$('replace-pagination').classList.add('hidden');$('replace-apply').disabled=true;
  if(close&&dialog.open)dialog.close();controls();
 }
 async function open(){
  if(E.busy()||pending||applying)return;
  if(dialog.open){$('replace-query').focus();$('replace-query').select();return;}
  if(!E.project()?.cues.length){E.toast('Genera o importa subtítulos para buscar y reemplazar.');return;}
  const editor=$('cue-text'),selection=document.activeElement===editor&&editor.selectionEnd>editor.selectionStart?editor.value.slice(editor.selectionStart,editor.selectionEnd).replace(/\s+/gu,' '):'';
  E.pause();try{await E.flush();}catch(e){E.toast(e.message,true);return;}
  openWorkspace('text');setTextTool('list');
  if(selection){clear();$('replace-query').value=selection;languages(true);}else languages(!plan);
  if(!dialog.open)dialog.showModal();$('replace-query').focus();$('replace-query').select();controls();
 }
 async function prepare(){
  if(pending||applying||E.busy())return;
  clear();pending=true;const serial=++request;controls();
  try{
   await E.flush();const result=await E.api.prepareFindReplace(options());
   if(serial!==request){E.api.discardFindReplace(result.id).catch(()=>{});return;}
   plan=result;lastRevision=result.revision;selected=new Set(result.rows.flatMap(row=>row.matches.map(hit=>hit.id)));active=result.rows[0]?.cueId??null;dialog.dataset.planId=result.id;page=0;review();
  }catch(e){if(serial===request){$('replace-feedback').textContent=e.message;$('replace-feedback').classList.add('error');}}
  finally{pending=false;controls();}
 }
 function evaluations(){const cueMap=new Map((E.project()?.cues??[]).map(c=>[c.id,c]));return plan.rows.map(row=>({row,result:evaluateReplacement(cueMap.get(row.cueId),plan.options.language,row,plan.options.replacement,selected)}));}
 function review(focus=null){
  if(!plan)return;const data=evaluations(),changes=data.reduce((n,x)=>n+x.result.count,0),changedCues=data.filter(x=>x.result.changed),blocked=changedCues.filter(x=>x.result.invalid),retired=changedCues.filter(x=>x.result.timingEffect==='clear').length,translations=changedCues.reduce((n,x)=>n+(x.result.translationReviewCount??0),0);
  let message=count(plan.foundCount,'coincidencia','coincidencias')+' · '+count(changes,'cambio seleccionado','cambios seleccionados')+' en '+count(changedCues.length,'subtítulo','subtítulos')+'.';
  if(plan.unchangedCount)message+=' '+count(plan.unchangedCount,'coincidencia ya tiene','coincidencias ya tienen')+' el texto del reemplazo.';
  if(plan.partialCount)message+=' '+count(plan.partialCount,'subtítulo parcial queda','subtítulos parciales quedan')+' fuera del rango.';
  if(plan.missingTranslationCount)message+=' '+count(plan.missingTranslationCount,'subtítulo sin traducción se omite','subtítulos sin traducción se omiten')+' en este idioma.';
  if(retired)message+=' '+count(retired,'subtítulo quedará','subtítulos quedarán')+' sin marcas por palabra.';
  if(translations)message+=' '+count(translations,'traducción necesitará','traducciones necesitarán')+' revisión.';
  if(blocked.length)message+=' Hay '+count(blocked.length,'resultado','resultados')+' que debes ajustar o desmarcar.';
  $('replace-feedback').textContent=message;$('replace-feedback').classList.toggle('error',!!blocked.length);
  canApply=!!changes&&!blocked.length;$('replace-apply').textContent=changes?'Aplicar '+changes+(changes===1?' cambio':' cambios'):'Sin cambios seleccionados';
  const pages=Math.max(1,Math.ceil(plan.rows.length/PAGE));page=Math.max(0,Math.min(page,pages-1));const host=$('replace-results');host.replaceChildren();
  for(const {row,result}of data.slice(page*PAGE,(page+1)*PAGE)){
   const item=node('article','replace-result'+(result.invalid?' invalid':''));item.dataset.replaceCue=row.cueId;
   const label=node('label','check-label'),check=document.createElement('input');check.type='checkbox';check.checked=result.count===row.matches.length;check.indeterminate=result.count>0&&result.count<row.matches.length;check.setAttribute('aria-label','Incluir subtítulo '+(row.index+1));check.onchange=()=>{for(const hit of row.matches){if(check.checked)selected.add(hit.id);else selected.delete(hit.id);}review({cue:row.cueId});};label.append(check,node('span',null,'Subtítulo '+(row.index+1)+' · '+result.count+'/'+row.matches.length));
   const button=node('button','replace-result-open');button.setAttribute('aria-pressed',String(active===row.cueId));button.append(node('small',null,stamp(row.start)+' — '+stamp(row.end)),node('span',null,row.before));button.onclick=()=>{active=row.cueId;review();};item.append(label,button);host.append(item);
  }
  if(!plan.rows.length)host.append(node('p','replace-empty',plan.foundCount?'Las coincidencias ya tienen el texto del reemplazo.':'No se encontraron coincidencias con estas opciones.'));
  $('replace-pagination').classList.toggle('hidden',pages===1);$('replace-page').textContent=(page+1)+' / '+pages;$('replace-prev').disabled=page===0;$('replace-next').disabled=page===pages-1;
  detail(data.find(x=>x.row.cueId===active));controls();
  if(focus?.hit)document.querySelector('[data-replace-hit="'+focus.hit+'"]')?.focus({preventScroll:true});
  if(focus?.cue)host.querySelector('[data-replace-cue="'+CSS.escape(focus.cue)+'"] input')?.focus({preventScroll:true});
 }
 function detail(data){
  const host=$('replace-detail');host.replaceChildren();if(!data){host.append(node('p','replace-empty','Cambia la búsqueda o el reemplazo para preparar otra propuesta.'));return;}
  const {row,result}=data,heading=node('div','replace-detail-heading');heading.append(node('h3',null,'Subtítulo '+(row.index+1)));const go=node('button','text-button','Ir al subtítulo');go.onclick=()=>{dialog.close();$('search-cues').value='';E.renderCues();E.selectCue(row.cueId,true);};heading.append(go);host.append(heading);
  host.append(node('span','replace-caption','ANTES · pulsa una coincidencia para incluirla o excluirla'));
  const before=node('p','replace-before');let at=0;
  for(const hit of row.matches){if(hit.start>at)before.append(document.createTextNode(row.before.slice(at,hit.start)));const button=node('button','replace-hit',hit.text);button.dataset.replaceHit=hit.id;button.setAttribute('aria-pressed',String(selected.has(hit.id)));button.title=selected.has(hit.id)?'Excluir esta coincidencia':'Incluir esta coincidencia';button.onclick=()=>{if(selected.has(hit.id))selected.delete(hit.id);else selected.add(hit.id);review({hit:hit.id});};before.append(button);at=hit.end;}
  before.append(document.createTextNode(row.before.slice(at)));host.append(before,node('span','replace-caption','DESPUÉS'));
  const after=node('p','replace-after');
  if(result.after===null)after.textContent=result.preview;
  else for(const part of replaceSegments(row.before,row.matches,plan.options.replacement,selected)){if(part.changed){const span=node('span',part.text?'replace-insert':'replace-deletion',part.text);if(!part.text)span.title='Texto eliminado';after.append(span);}else after.append(document.createTextNode(part.text));}
  host.append(after);
  const notes=node('div','replace-impact');
  if(result.invalid)notes.append(node('p','replace-warning',result.invalid));
  else if(!result.count)notes.append(node('p',null,'Este subtítulo no se modificará.'));
  else if(plan.options.language!=='original')notes.append(node('p',null,'Se modifica solo la traducción. El original y sus marcas se conservan.'));
  else if(result.timingEffect==='preserve')notes.append(node('p',null,'Se conservan '+result.preservedWords+' marcas por palabra: la correspondencia del texto sigue siendo válida.'));
  else if(result.timingEffect==='clear')notes.append(node('p','replace-warning','Se retirarán '+result.lostWords+' marcas por palabra. Podrás realinear el original después de corregirlo.'));
  else notes.append(node('p',null,'El subtítulo no tenía marcas fiables para conservar. Sus límites se mantienen.'));
  if(result.translationReviewCount)notes.append(node('p',null,result.translationReviewCount+(result.translationReviewCount===1?' traducción queda pendiente de revisión.':' traducciones quedan pendientes de revisión.')));
  notes.append(node('p','replace-preservation','Los tiempos del subtítulo, los clips y los archivos fuente se conservan.'));host.append(notes);
 }
 async function apply(){
  if(!plan||!selected.size||!canApply||applying)return;const id=plan.id,ids=[...selected],count=ids.length;applying=true;
  const locked=[...dialog.querySelectorAll('button,input,textarea,select')].map(element=>({element,disabled:element.disabled}));for(const {element}of locked)element.disabled=true;
  dialog.setAttribute('aria-busy','true');$('replace-feedback').textContent='Aplicando '+count+' cambios…';
  const result=await E.action(()=>E.api.applyFindReplace(id,ids));clear(true);for(const {element,disabled}of locked)element.disabled=disabled;dialog.removeAttribute('aria-busy');applying=false;controls();
  if(result?.models)E.toast('Se aplicaron '+count+(count===1?' cambio.':' cambios.')+' Puedes deshacer la operación completa.');
 }
 function render(){
  const id=E.project()?.id;if(id!==lastProject){lastProject=id;clear(true);languages(true);$('replace-scope').value='range';}
  if(plan&&lastRevision!==E.state().textCutRevision)clear(true);controls();
 }
 for(const id of fields)$(id).addEventListener(id==='replace-query'||id==='replace-value'?'input':'change',()=>{clear();controls();});
 $('replace-query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();prepare();}});
 $('replace-select-all').onclick=()=>{selected=new Set(plan.rows.flatMap(row=>row.matches.map(hit=>hit.id)));review();};$('replace-select-none').onclick=()=>{selected.clear();review();};
 $('replace-prev').onclick=()=>{page--;review();};$('replace-next').onclick=()=>{page++;review();};
 $('replace-prepare').onclick=prepare;$('replace-apply').onclick=apply;$('replace-close').onclick=()=>dialog.close();$('replace-discard').onclick=()=>clear();openButton.onclick=open;
 dialog.addEventListener('cancel',e=>{if(applying)e.preventDefault();});
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.code==='KeyH'&&!E.busy()&&(!document.querySelector('dialog[open]')||dialog.open)){e.preventDefault();e.stopImmediatePropagation();open();}},true);
 clear();return {open,render,invalidate:()=>clear(true)};
}
