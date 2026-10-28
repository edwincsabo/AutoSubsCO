const $=id=>document.getElementById(id);
const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const date=value=>{try{return new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(value));}catch{return 'Fecha no disponible';}};
const duration=value=>{const s=Math.max(0,Math.round(value||0));return (s>=3600?Math.floor(s/3600)+':':'')+String(Math.floor(s/60)%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};

export function mountProjects(E){
 let visible=true,lastProject=undefined,lastFile=undefined,listKey=null,request=0,preview=null,savingCopy=false;
 const shell=document.querySelector('.shell'),rail=document.querySelector('.workspace-rail');
 const homeButton=make('button','home-navigation');homeButton.id='project-home-button';homeButton.title='Inicio y proyectos recientes';
 homeButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10H5V10m4 10v-7h6v7"/></svg><span>Inicio</span>';rail.prepend(homeButton);
 const saveGroup=make('div','project-save-controls'),save=$('save-project');save.before(saveGroup);saveGroup.append(save);
 const menu=make('details','project-menu');menu.id='project-menu';
 menu.innerHTML='<summary aria-label="Opciones del proyecto" title="Guardar como y versiones">▾</summary><div><button id="save-project-as">Guardar como… <kbd>Ctrl Mayús S</kbd></button><button id="project-versions">Versiones guardadas…</button><button id="project-menu-home">Inicio y recientes</button></div>';
 saveGroup.append(menu);
 menu.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();menu.open=false;menu.querySelector('summary').focus();}});
 document.addEventListener('pointerdown',e=>{if(menu.open&&!menu.contains(e.target))menu.open=false;});
 const home=make('section','project-home');home.id='project-home';home.setAttribute('aria-labelledby','project-home-title');
 home.innerHTML='<div class="home-heading"><div><span class="eyebrow">ESPACIO LOCAL</span><h2 id="project-home-title">Tus proyectos</h2><p>Continúa una edición o empieza con otro video.</p></div><div class="home-actions"><button id="home-new" class="button primary">Nuevo proyecto</button><button id="home-open" class="button outlined">Abrir proyecto</button></div></div><p id="home-notice" class="home-notice hidden" role="status"></p><section id="home-recovery" class="home-recovery hidden"><div><strong>Hay un autoguardado por recuperar</strong><p id="home-recovery-detail"></p></div><button id="home-restore" class="button outlined">Recuperar sesión</button></section><div class="home-columns"><section class="home-recents"><div class="home-recents-heading"><h3>Recientes <span id="recent-count"></span></h3><label class="recent-search-label"><span class="sr-only">Buscar proyectos recientes</span><input id="recent-search" type="search" placeholder="Buscar por nombre o carpeta…"></label></div><div id="recent-project-list"></div><p class="home-footnote">Se muestran hasta 20 proyectos. Quitar uno de esta lista conserva sus archivos.</p></section><aside class="home-current"><span class="eyebrow">PROYECTO ABIERTO</span><h3 id="home-current-name"></h3><p id="home-current-path"></p><span id="home-current-state"></span><button id="home-continue" class="button primary full">Volver al editor</button><div class="home-current-actions"><button id="home-save-as" class="button outlined full">Guardar como…</button><button id="home-versions" class="text-button">Ver versiones guardadas</button></div><p class="home-current-note">Guardar como crea una copia independiente con un nombre nuevo. Las versiones permiten recuperar un guardado anterior y deshacer la recuperación.</p></aside></div>';
 shell.append(home);
 const dialog=make('dialog','modal versions-dialog');dialog.id='project-versions-dialog';dialog.setAttribute('aria-labelledby','versions-title');
 dialog.innerHTML='<div class="modal-heading"><div><span class="eyebrow">HISTORIAL DEL PROYECTO</span><h2 id="versions-title">Versiones guardadas</h2></div><button id="versions-close" class="icon-button" aria-label="Cerrar versiones">×</button></div><p class="versions-intro">Revisa una versión antes de recuperarla. El proyecto actual se conserva y puedes deshacer el cambio.</p><div class="versions-body"><div id="versions-list" class="versions-list" aria-label="Versiones disponibles"></div><section id="version-details" class="version-details" aria-live="polite"></section></div><div class="versions-footer"><span>El archivo del proyecto se actualiza al pulsar Guardar.</span><button id="version-restore" class="button primary" disabled>Recuperar esta versión</button></div>';
 document.body.append(dialog);
 const hide=()=>{visible=false;applyVisibility();};
 async function show(){if(E.busy())return;E.pause();const result=await E.action(()=>E.api.state());if(result?.models){visible=true;render();}}
 function applyVisibility(){
  shell.classList.toggle('home-open',visible);document.body.classList.toggle('home-open',visible);home.classList.toggle('hidden',!visible);homeButton.classList.toggle('selected',visible);homeButton.setAttribute('aria-pressed',String(visible));
  for(const selector of ['.sidebar','.preview-panel','.inspector','.timeline','.panel-resizer'])for(const n of document.querySelectorAll(selector)){n.inert=visible;if(visible)n.setAttribute('aria-hidden','true');else n.removeAttribute('aria-hidden');}
 }
 async function openRecent(row,locate=false){menu.open=false;const result=await E.task(()=>locate?E.api.locateRecent(row.id):E.api.openRecent(row.id),locate?'Localizando proyecto':'Abriendo proyecto');if(result?.models)hide();}
 function renderRecents(){
  const rows=E.state().recentProjects??[],query=$('recent-search').value.toLocaleLowerCase('es').trim(),key=JSON.stringify(rows)+'|'+query+'|'+E.busy();
  $('recent-count').textContent=rows.length;if(key===listKey)return;listKey=key;
  const host=$('recent-project-list');host.replaceChildren();
  for(const row of rows.filter(r=>!query||(r.name+' '+r.path).toLocaleLowerCase('es').includes(query))){
   const card=make('article','recent-project');card.dataset.recentId=row.id;
   const open=make('button','recent-open');open.disabled=!row.available||E.busy();open.title=row.path;
   const mark=make('span','recent-mark',row.height>row.width?'Vertical':row.height===row.width?'Cuadrado':'Horizontal');mark.setAttribute('aria-hidden','true');
   const text=make('span','recent-description');text.append(make('strong',null,row.name),make('span','recent-path',row.path));
   text.append(make('small',null,row.available?`${duration(row.duration)} · ${row.cues??0} subtítulos · ${date(row.lastUsedAt)}`:'Archivo no encontrado. Localiza el proyecto para volver a abrirlo.'));
   if(row.kind==='recovery')text.append(make('small','recovery-label','Autoguardado conservado'));
   open.append(mark,text);open.onclick=()=>openRecent(row);
   const actions=make('div','recent-actions');
   if(!row.available){const locate=make('button','text-button','Localizar');locate.onclick=()=>openRecent(row,true);locate.disabled=E.busy();actions.append(locate);}
   const forget=make('button','text-button','Quitar');forget.title='Quitar de recientes sin borrar archivos';forget.setAttribute('aria-label','Quitar de recientes: '+row.name);forget.disabled=E.busy();forget.onclick=()=>E.action(()=>E.api.forgetRecent(row.id));actions.append(forget);
   card.append(open,actions);host.append(card);
  }
  if(!host.childElementCount)host.append(make('p','recent-empty',query?'No hay coincidencias. Prueba otro nombre o carpeta.':'Aquí aparecerán los proyectos que abras o guardes. Puedes empezar con Nuevo proyecto.'));
 }
 function render(){
  const p=E.project(),s=E.state();
  if(p?.id!==lastProject||s.projectFile!==lastFile){lastProject=p?.id;lastFile=s.projectFile;visible=!p;}
  applyVisibility();renderRecents();
  $('home-current-name').textContent=p?.name??'Todavía no hay un proyecto abierto';
  $('home-current-path').textContent=p?(s.projectFile??'Guarda el proyecto para elegir su ubicación.'):'Abre un proyecto reciente o importa un video.';
  $('home-current-path').title=s.projectFile??'';
  $('home-current-state').textContent=p?(s.dirty?'Cambios con autoguardado local':'Proyecto guardado'):'';
  for(const id of ['save-project-as','project-versions','home-save-as','home-versions','home-continue'])$(id).disabled=!p||E.busy();
  $('home-recovery').classList.toggle('hidden',!s.recovery||!!p);if(s.recovery)$('home-recovery-detail').textContent=s.recovery.name+' · '+date(s.recovery.savedAt);
  const notice=s.libraryWarning??s.managementNotice;$('home-notice').textContent=notice??'';$('home-notice').classList.toggle('hidden',!notice);
 }
 async function saveAs(){if(savingCopy)return;savingCopy=true;menu.open=false;try{const result=await E.action(()=>E.api.saveProjectAs());if(result?.models)E.toast('Copia guardada. Ahora estás trabajando en el nuevo proyecto.');}finally{savingCopy=false;}}
 function clearPreview(){request++;preview=null;$('version-restore').disabled=true;}
 async function inspect(row,button){
  const serial=++request;preview=null;$('version-restore').disabled=true;
  for(const b of $('versions-list').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b===button));
  const details=$('version-details');details.replaceChildren(make('p','field-note','Leyendo la versión…'));
  const result=await E.action(()=>E.api.previewVersion(row.id));if(serial!==request||!dialog.open)return;
  if(!result?.token){details.replaceChildren(make('p','field-note','No se pudo leer la versión. Selecciona otra o vuelve a abrir este panel.'));return;}
  preview=result;
  details.replaceChildren(make('span','eyebrow','VERSIÓN SELECCIONADA'),make('h3',null,result.summary.name));
  const list=make('dl');for(const [label,value]of [['Capturada',date(result.capturedAt)],['Contenido',`${result.summary.clips} clips · ${result.summary.cues} subtítulos`],['Duración',duration(result.summary.duration)],['Formato',`${result.summary.width} × ${result.summary.height} · ${result.summary.fps} FPS`]]){const line=make('div');line.append(make('dt',null,label),make('dd',null,value));list.append(line);}details.append(list);
  details.append(make('p','field-note',result.reason));
  if(result.textPreview?.length){const sample=make('section','version-sample');sample.append(make('h4',null,'Primeros subtítulos de esta versión'));for(const cue of result.textPreview){const line=make('p');line.append(make('small',null,duration(cue.start)+' — '+duration(cue.end)),make('span',null,cue.text));sample.append(line);}details.append(sample);}
  if(result.relativeBaseAssumed)details.append(make('p','version-warning','Esta versión antigua usa rutas relativas. Se intentarán resolver junto al proyecto abierto; si falta un medio podrás localizarlo.'));
  details.append(make('p','version-preservation','Se guardará una copia del estado actual antes de recuperar. La operación se puede deshacer.'));
  $('version-restore').disabled=E.busy();
 }
 async function versions(){
  menu.open=false;if(!E.project()||E.busy())return;E.pause();clearPreview();
  const rows=await E.action(()=>E.api.projectVersions());if(!Array.isArray(rows))return;
  const host=$('versions-list');host.replaceChildren();$('version-details').replaceChildren(make('p','field-note','Selecciona una versión para ver su contenido.'));
  for(const row of rows){const b=make('button','version-row');b.dataset.versionId=row.id;b.setAttribute('aria-pressed','false');b.disabled=!row.available;b.append(make('strong',null,row.available?date(row.capturedAt):row.reason),make('span',null,row.available?row.reason:row.error));if(row.available)b.append(make('small',null,`${row.summary.clips} clips · ${row.summary.cues} subtítulos · ${duration(row.summary.duration)}`));b.onclick=()=>inspect(row,b);host.append(b);}
  if(!rows.length)host.append(make('p','recent-empty','Aún no hay versiones. Al guardar sobre tu proyecto se conserva su guardado anterior.'));
  if(!dialog.open)dialog.showModal();
 }
 $('version-restore').onclick=async()=>{
  if(!preview)return;const token=preview.token;clearPreview();dialog.close();
  const result=await E.task(()=>E.api.restoreVersion(token),'Recuperando versión');
  if(result?.models){hide();E.toast('Versión recuperada. Revisa el resultado y pulsa Guardar para actualizar el archivo.');}else await versions();
 };
 $('versions-close').onclick=()=>dialog.close();dialog.addEventListener('close',clearPreview);
 homeButton.onclick=show;$('project-menu-home').onclick=()=>{menu.open=false;show();};
 $('save-project-as').onclick=saveAs;$('home-save-as').onclick=saveAs;$('project-versions').onclick=versions;$('home-versions').onclick=versions;
 $('home-continue').onclick=()=>{hide();homeButton.focus();};
 $('open-project').onclick=async()=>{const result=await E.task(()=>E.api.openProject(),'Abriendo proyecto');if(result?.models)hide();};
 $('home-open').onclick=()=>$('open-project').click();$('home-restore').onclick=()=>$('restore').click();
 $('home-new').onclick=async()=>{const result=await E.action(()=>E.api.newProject());if(result?.models)await E.task(()=>E.api.importMedia({append:false}),'Creando proyecto');};
 $('new-project').onclick=async()=>{const result=await E.action(()=>E.api.newProject());if(result?.models){visible=true;render();}};
 $('recent-search').oninput=renderRecents;
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.code==='KeyS'&&!E.busy()&&!document.querySelector('dialog[open]')){e.preventDefault();e.stopImmediatePropagation();saveAs();}},true);
 render();return {render,show,hide,versions,saveAs};
}
