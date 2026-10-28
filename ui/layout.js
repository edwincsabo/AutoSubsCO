const STORAGE = 'autosubs-layout-v1';
const DEFAULTS = {library:280,inspector:350,timeline:280,density:'comfortable',libraryOpen:true,inspectorOpen:true,preferred:'inspector'};
const limits = {library:[240,420],inspector:[300,500],timeline:[210,520]};
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));

export function mountLayout({shell,onResize}) {
 const $ = id => document.getElementById(id);
 let saved;
 try { saved = JSON.parse(localStorage.getItem(STORAGE)); } catch {}
 const prefs = {...DEFAULTS};
 for (const id of Object.keys(limits)) {
  const value = Number(saved?.[id] ?? localStorage.getItem('autosubs-panel-'+id));
  if (Number.isFinite(value) && value > 0) prefs[id] = clamp(value,...limits[id]);
 }
 if (['comfortable','compact'].includes(saved?.density)) prefs.density = saved.density;
 for (const id of ['libraryOpen','inspectorOpen']) if (typeof saved?.[id] === 'boolean') prefs[id] = saved[id];
 if (['library','inspector'].includes(saved?.preferred)) prefs.preferred = saved.preferred;
 const panelHeading = document.querySelector('.panel-heading');
 const toggles = document.createElement('div');toggles.className = 'panel-toggles';
 for (const [id,label] of [['library','Biblioteca'],['inspector','Inspector']]) {
  const b = document.createElement('button');b.id='toggle-'+id;b.className='panel-toggle';b.textContent=label;
  b.setAttribute('aria-controls',id==='library'?'workspace-library':'workspace-inspector');
  b.onclick=()=>{prefs[id+'Open']=!effective[id];prefs.preferred=id;persist();apply();};toggles.append(b);
 }
 panelHeading.insertBefore(toggles,panelHeading.querySelector('.preview-tags'));
 document.querySelector('.sidebar').id='workspace-library';document.querySelector('.inspector').id='workspace-inspector';
 const button=document.createElement('button');button.id='layout-button';button.className='button subtle';button.textContent='Vista';
 button.setAttribute('aria-haspopup','dialog');button.title='Distribución y tamaño de texto';
 $('command-search').after(button);
 const dialog=document.createElement('dialog');dialog.id='layout-dialog';dialog.className='modal layout-dialog';
 dialog.setAttribute('aria-labelledby','layout-title');
 dialog.innerHTML='<div class="modal-heading"><h2 id="layout-title">Distribución de la interfaz</h2><button id="layout-close" class="icon-button" aria-label="Cerrar opciones de vista">×</button></div><p class="field-note">Ajusta tu espacio de edición. Estas preferencias se guardan en este equipo.</p><label>Tamaño de controles y texto<select id="layout-density"><option value="comfortable">Cómodo</option><option value="compact">Compacto</option></select></label><div class="layout-visibility"><label class="check-label"><input id="layout-library" type="checkbox"> Mostrar biblioteca</label><label class="check-label"><input id="layout-inspector" type="checkbox"> Mostrar inspector</label></div><div class="section-label spaced">DISTRIBUCIONES</div><div class="layout-presets"><button data-layout="balanced" class="button outlined">Equilibrada</button><button data-layout="viewer" class="button outlined">Más visor</button><button data-layout="timeline" class="button outlined">Más línea de tiempo</button></div><p id="layout-note" class="field-note"></p><p class="field-note">Arrastra los separadores o enfócalos con Tab y usa las flechas. Mayús mueve más; Inicio y Fin eligen los límites. Doble clic restablece ese panel.</p><button id="layout-reset" class="text-button">Restablecer toda la vista</button>';
 document.body.append(dialog);button.onclick=()=>{updateControls();dialog.showModal();};$('layout-close').onclick=()=>dialog.close();
 $('layout-density').onchange=()=>{prefs.density=$('layout-density').value;persist();apply();};
 for(const id of ['library','inspector'])$('layout-'+id).onchange=()=>{prefs[id+'Open']=$('layout-'+id).checked;prefs.preferred=id;persist();apply();};
 for(const b of dialog.querySelectorAll('[data-layout]'))b.onclick=()=>{
  Object.assign(prefs,{library:DEFAULTS.library,inspector:DEFAULTS.inspector,libraryOpen:true,inspectorOpen:true});
  if(b.dataset.layout==='viewer')Object.assign(prefs,{libraryOpen:false,inspectorOpen:false,timeline:210});
  else prefs.timeline=b.dataset.layout==='timeline'?Math.round(innerHeight*.44):DEFAULTS.timeline;
  persist();apply();
 };
 $('layout-reset').onclick=()=>{Object.assign(prefs,DEFAULTS);persist();apply();};
 let effective={library:true,inspector:true},pending=0;
 function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(prefs));}catch{}}
 function updateControls(){
  $('layout-density').value=prefs.density;
  for(const id of ['library','inspector']){
   $('layout-'+id).checked=prefs[id+'Open'];
   $('toggle-'+id).setAttribute('aria-pressed',String(effective[id]));
   $('toggle-'+id).title=(effective[id]?'Ocultar ':'Mostrar ')+(id==='library'?'biblioteca':'inspector');
  }
  $('layout-note').textContent=(prefs.libraryOpen&&!effective.library||prefs.inspectorOpen&&!effective.inspector)
   ?'Un panel se plegó para conservar espacio en el visor. Puedes alternarlo desde su botón.'
   :'Los tamaños se adaptan a la ventana sin perder tu distribución guardada.';
 }
 function apply(){
  const available=innerWidth-68,viewerMinimum=380;
  let library=prefs.library,inspector=prefs.inspector;
  effective={library:prefs.libraryOpen,inspector:prefs.inspectorOpen};
  if(effective.library&&effective.inspector&&available-viewerMinimum<limits.library[0]+limits.inspector[0])effective[prefs.preferred==='library'?'inspector':'library']=false;
  let excess=(effective.library?library:0)+(effective.inspector?inspector:0)+viewerMinimum-available;
  if(excess>0&&effective.library){const shrink=Math.min(excess,library-limits.library[0]);library-=shrink;excess-=shrink;}
  if(excess>0&&effective.inspector)inspector=Math.max(limits.inspector[0],inspector-excess);
  const timeline=clamp(prefs.timeline,limits.timeline[0],Math.max(limits.timeline[0],Math.min(limits.timeline[1],innerHeight-350)));
  const sizes={library,inspector,timeline};
  shell.dataset.density=prefs.density;
  for(const id of ['library','inspector'])shell.classList.toggle(id+'-collapsed',!effective[id]);
  for(const[id,value]of Object.entries(sizes)){
   shell.style.setProperty('--'+id+'-size',value+'px');
   const grip=document.querySelector('.'+id+'-resizer');
   grip.setAttribute('aria-valuenow',String(Math.round(value)));grip.setAttribute('aria-valuemax',String(id==='timeline'?Math.max(210,Math.min(520,innerHeight-350)):limits[id][1]));
   grip.setAttribute('aria-valuetext',Math.round(value)+' píxeles');
  }
  updateControls();
  cancelAnimationFrame(pending);pending=requestAnimationFrame(onResize);
 }
 for(const[id,label]of [['library','Ancho de biblioteca'],['inspector','Ancho del inspector'],['timeline','Altura de línea de tiempo']]){
  const grip=document.createElement('div');grip.className='panel-resizer '+id+'-resizer';grip.tabIndex=0;
  grip.setAttribute('role','separator');grip.setAttribute('aria-label',label);grip.setAttribute('aria-orientation',id==='timeline'?'horizontal':'vertical');
  grip.setAttribute('aria-valuemin',String(limits[id][0]));
  grip.onkeydown=e=>{
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
   e.preventDefault();e.stopPropagation();
   const max=id==='timeline'?Math.max(210,Math.min(520,innerHeight-350)):limits[id][1];
   const start=Number(grip.getAttribute('aria-valuenow')),direction=id==='library'?(e.key==='ArrowRight'?1:-1):(e.key==='ArrowLeft'||e.key==='ArrowUp'?1:-1);
   prefs[id]=e.key==='Home'?limits[id][0]:e.key==='End'?max:clamp(start+direction*(e.shiftKey?30:10),limits[id][0],max);
   persist();apply();
  };
  grip.onpointerdown=e=>{
   if(e.button!==0)return;e.preventDefault();grip.focus();grip.setPointerCapture(e.pointerId);
   const origin=id==='timeline'?e.clientY:e.clientX,start=Number(grip.getAttribute('aria-valuenow')),before=prefs[id];
   grip.onpointermove=event=>{const delta=id==='timeline'?origin-event.clientY:id==='inspector'?origin-event.clientX:event.clientX-origin;prefs[id]=clamp(start+delta,...limits[id]);apply();};
   const finish=cancel=>{if(cancel)prefs[id]=before;else persist();grip.onpointermove=null;grip.onpointerup=null;grip.onpointercancel=null;apply();};
   grip.onpointerup=()=>finish(false);grip.onpointercancel=()=>finish(true);
  };
  grip.ondblclick=()=>{prefs[id]=DEFAULTS[id];persist();apply();};shell.append(grip);
 }
 window.addEventListener('resize',apply);apply();return {apply,open:()=>button.click()};
}
