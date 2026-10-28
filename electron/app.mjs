import {app,BrowserWindow,ipcMain,dialog,protocol,Menu,shell,screen,nativeImage} from 'electron';
import fs from 'node:fs/promises';
import {createReadStream,mkdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createProject,validateProject,visibleCues,addMedia,editClip,reorderClip,removeClip,splitClip,setPreset,attachCues,replaceRange,durationOf} from '../src/project.mjs';
import {isGraphic,validateTitle} from '../src/graphics.mjs';
import {insertGraphic,editGraphic,replaceTitle} from '../src/graphic-project.mjs';
import {srt,vtt,ass,parseSrt} from '../src/subtitles.mjs';
import {discoverTools,exists} from '../src/tools.mjs';
import {listModels,downloadModel} from '../src/models.mjs';
import {probe,preparePreview,waveform} from '../src/media.mjs';
import {transcribeProject,compareModels} from '../src/asr.mjs';
import {exportSequence,sequenceAudio,protectDestination} from '../src/sequence.mjs';
import {detectHardware,acceleration} from '../src/hardware.mjs';
import {ProjectHistory,atomicJson} from '../src/history.mjs';
import {ProjectLibrary,readProjectDocument,resolveProjectPaths,copyProject,sameProjectFile} from '../src/project-library.mjs';
import {reviewStudio as reviewCues} from '../src/studio-review.mjs';
import {WaveformPool} from '../src/waveforms.mjs';
import {listResources,downloadResource} from '../src/studio-resources.mjs';
import {setVisual,addKeyframe,deleteKeyframe,stemMode,renameSpeaker,setCaptionView} from '../src/studio-project.mjs';
import {separateClip,analyzeSpeakers,translateCaptions} from '../src/studio-processing.mjs';
import {packageProject,projectForSave} from '../src/project-package.mjs';
import {editAudioMix,editVolumePoint} from '../src/audio-edit.mjs';
import {analyzeAndDuck} from '../src/audio-processing.mjs';
import {prepareTextCut,publicTextCut,applyTextCut} from '../src/text-cut.mjs';
import {displayCue} from '../src/caption-view.mjs';
import {prepareAlignment,publicAlignment,applyAlignment} from '../src/alignment.mjs';
import {prepareFindReplace,publicFindReplace,applyFindReplace} from '../src/find-replace.mjs';
import {precisionAction,reorderPrecision,editPrecisionClip,moveSelection,deleteSelection,splitSelection,transitionPrecision,layerPrecision} from '../src/precision.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataRoot=process.env.AUTOSUBSCO_DATA??(app.isPackaged?(process.env.PORTABLE_EXECUTABLE_DIR??path.dirname(app.getPath('exe'))):root);
const toolsRoot=app.isPackaged?process.resourcesPath:root,workspace=process.env.AUTOSUBSCO_WORKSPACE??path.join(dataRoot,'workspace'),modelRoot=path.join(dataRoot,'models'),jobsRoot=path.join(workspace,'jobs'),recoveryFile=path.join(workspace,'recovery','current.json');
for(const folder of ['app-profile','exports','logs','recovery'])mkdirSync(path.join(workspace,folder),{recursive:true});
app.setPath('userData',path.join(workspace,'app-profile'));app.setPath('sessionData',path.join(workspace,'app-profile'));app.setPath('logs',path.join(workspace,'logs'));
protocol.registerSchemesAsPrivileged([{scheme:'localmedia',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
const ui=path.join(root,'ui','index.html'),history=new ProjectHistory(),library=new ProjectLibrary(workspace),tokens=new Map(),urls=new Map();
let mutations=Promise.resolve(),lastPackage=null,lastOutput=null,textCutPlan=null,textCutRevision=0,versionReview=null,projectFileHash=null,managementNotice=null,alignmentProposal=null,findReplaceProposal=null;
let window,current=null,projectFile=null,dirty=false,task=null,taskProgress=null,comparison=null,tools={},wavePool=null,hardware={providers:[],gpus:[],videoEncoder:null},recovery=null;
let lastSession=null;
let config={};try{config=JSON.parse(readFileSync(path.join(workspace,'config.json'),'utf8'));}catch{}
config.settings={alignmentAcceleration:'cpu',acceleration:'cpu',renderAcceleration:'cpu',align:true,vad:true,snap:true,loop:false,preferVocals:false,ripple:false,...config.settings};
try{const record=JSON.parse(readFileSync(recoveryFile,'utf8'));lastSession=record;if(record.dirty)recovery=record;}catch{}
function progress(p){taskProgress=p;if(window&&!window.isDestroyed())window.webContents.send('progress',p);}
function assertIdle(){if(task)throw new Error('Hay una operación en curso. Espera o cancélala.');}
function assertProject(){if(!current)throw new Error('Abre o crea un proyecto primero.');}
function bindMedia(reset=false){if(reset){tokens.clear();urls.clear();wavePool?.clear();}for(const media of current?.assets??[]){if(!urls.has(media.id)){const token=randomUUID();tokens.set(token,media.previewPath??media.path);urls.set(media.id,`localmedia://asset/${token}`);}}}
async function autosave(){if(current){const record={project:current,projectFile,projectFileHash,dirty,savedAt:new Date().toISOString()};await atomicJson(recoveryFile,record);recovery=dirty?record:null;}}
function clearPreparedEdits(){textCutPlan=null;alignmentProposal=null;findReplaceProposal=null;}
async function commit(next,label='Edición',group=null){versionReview=null;clearPreparedEdits();textCutRevision++;current=history.push(current,next,{label,group});dirty=true;await autosave();bindMedia();return state();}
async function state(){const [models,resources,recentProjects]=await Promise.all([listModels(modelRoot),listResources(modelRoot),library.listRecents()]);return{recentProjects,managementNotice,libraryWarning:library.warning,project:current,textCutRevision,projectFile,dirty,models,resources,lastPackage,lastOutput,tools:Object.fromEntries(Object.entries(tools).map(([k,v])=>[k,!!v])),hardware,settings:config.settings,history:history.state(),review:current?reviewCues(current):[],recovery:recovery?{name:recovery.project.name,savedAt:recovery.savedAt}:null,comparison,mediaUrls:Object.fromEntries(urls),mediaUrl:current?urls.get(current.media.id):null,busy:!!task,progress:task?taskProgress:null,dataRoot,version:app.getVersion()};}
async function busy(fn){assertIdle();const controller=new AbortController();task=controller;try{return await fn(controller.signal);}finally{if(task===controller){task=null;taskProgress=null;}}}
const nameBase=()=>path.basename(current?.name??'proyecto').replace(/\.[^.]+$/,'').replace(/[<>:"/\\|?*]/g,'_');
async function rememberProject(file,project,options){try{await library.remember(file,project,options);}catch{library.warning='El proyecto está guardado, pero no se pudo actualizar la lista de recientes.';}}
async function archivePendingRecovery(){
 if(current||!recovery?.project)return;
 const p=resolveProjectPaths(recovery.project,recovery.projectFile?path.dirname(recovery.projectFile):workspace);
 const file=path.join(workspace,'recovery','Autoguardado-'+Date.now()+'-'+randomUUID()+'.autosubsco.json');
 await atomicJson(file,p);await rememberProject(file,p,{kind:'recovery'});
 managementNotice='El autoguardado anterior se conservó en Recientes para que puedas abrirlo después.';
}
async function saveProject(asCopy=false){
 assertProject();let file=asCopy?null:projectFile;
 if(!file){const r=await dialog.showSaveDialog(window,{title:asCopy?'Guardar proyecto como':'Guardar proyecto',defaultPath:asCopy&&projectFile?path.join(path.dirname(projectFile),nameBase()+'-copia.autosubsco.json'):path.join(workspace,nameBase()+(asCopy?'-copia':'')+'.autosubsco.json'),filters:[{name:'Proyecto AutoSubsCO',extensions:['autosubsco.json']}]});if(r.canceled)return null;file=r.filePath;}
 if(asCopy&&await sameProjectFile(file,projectFile))throw Error('Elige otro nombre para conservar el proyecto de origen. Para actualizarlo utiliza Guardar.');
 await protectDestination(current,file);
 const next=asCopy?copyProject(current,file):current;
 const saved=await library.save(next,file,{expectedHash:asCopy?null:projectFileHash,newFile:asCopy||!projectFile});
 current=next;projectFile=saved.file;projectFileHash=saved.hash;dirty=false;
 if(asCopy){history.reset();comparison=null;clearPreparedEdits();versionReview=null;textCutRevision++;bindMedia(true);}
 await autosave();await rememberProject(projectFile,current);return file;
}
async function confirmDiscard(){
 if(!dirty)return true;
 const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Guardar proyecto','Descartar cambios','Cancelar'],defaultId:0,cancelId:2,message:'Hay cambios sin guardar.',detail:'Puedes guardar el proyecto antes de continuar.'});
 if(answer.response===2)return false;if(answer.response===0)return!!await saveProject();return true;
}
async function installProject(project,{file=null,hash=null,changed=false,preserveRecovery=true}={}){
 if(preserveRecovery)await archivePendingRecovery();
 current=project;projectFile=file;projectFileHash=hash;dirty=changed;versionReview=null;textCutRevision++;clearPreparedEdits();history.reset();comparison=null;bindMedia(true);await autosave();
 if(file)await rememberProject(file,current);return state();
}
async function openProjectFile(file){
 const document=await readProjectDocument(file);
 const p=await busy(signal=>hydrate(document.project,signal,path.dirname(file)));
 return installProject(p,{file:path.resolve(file),hash:document.hash,changed:document.raw.version!==6});
}
async function hydrate(p,signal,projectBase=workspace){const result=resolveProjectPaths(p,projectBase);for(const media of result.assets){let file=media.path;if(!path.isAbsolute(file)){file=path.resolve(projectBase,file);const relative=path.relative(path.resolve(projectBase),file);if(relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('La ruta relativa sale del proyecto.');}if(!await exists(file)){const chosen=await dialog.showOpenDialog(window,{title:`Localizar ${media.name}`,properties:['openFile']});if(chosen.canceled)throw new Error('No se pudo localizar el archivo original.');file=chosen.filePaths[0];}const actual=await probe(file,tools,signal);if(Math.abs(actual.duration-media.duration)>.15||(media.size&&actual.size!==media.size))throw new Error(`El archivo ${media.name} cambió. Importa su nueva versión como otro medio.`);const id=media.id,name=media.name;Object.assign(media,actual,{id,name,type:media.type??actual.type});media.previewPath=await preparePreview(media,tools,path.join(workspace,'proxies'),{signal,progress});}result.media=result.assets.find(m=>m.id===result.media.id)??result.assets[0];return validateProject(result);}
function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{if(event.senderFrame?.url!==pathToFileURL(ui).href)return{ok:false,error:'Origen no permitido.'};try{let value;if(['state','cancel','waveform','thumbnail','close-ready'].includes(name))value=await fn(...args);else{const operation=mutations.then(()=>fn(...args));mutations=operation.catch(()=>{});value=await operation;}return{ok:true,value};}catch(error){return{ok:false,error:String(error.message??error).slice(0,3500)};}});}
async function start(){
 if(!await exists(library.indexFile)&&lastSession?.projectFile){try{const saved=await readProjectDocument(lastSession.projectFile);await rememberProject(lastSession.projectFile,saved.project);}catch{}}
 tools=await discoverTools(toolsRoot,config);wavePool=new WaveformPool(tools,path.join(workspace,'waveforms'));
 protocol.handle('localmedia',async request=>{const u=new URL(request.url),file=tokens.get(u.pathname.slice(1));if(u.hostname!=='asset'||!file)return new Response(null,{status:404});try{const stat=await fs.stat(file),type=({'.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.wav':'audio/wav','.mp3':'audio/mpeg','.m4a':'audio/mp4','.flac':'audio/flac','.ogg':'audio/ogg','.jpg':'image/jpeg','.png':'image/png','.jpeg':'image/jpeg'})[path.extname(file).toLowerCase()]??'application/octet-stream',headers={'Content-Type':type,'Accept-Ranges':'bytes','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'};let a=0,b=stat.size-1,status=200;const range=request.headers.get('range');if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||!m[1]&&!m[2])return new Response(null,{status:416});a=m[1]?Number(m[1]):Math.max(0,stat.size-Number(m[2]));b=m[1]&&m[2]?Math.min(Number(m[2]),stat.size-1):stat.size-1;if(a>b||a>=stat.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${stat.size}`}});status=206;headers['Content-Range']=`bytes ${a}-${b}/${stat.size}`;}headers['Content-Length']=String(b-a+1);if(request.method==='HEAD')return new Response(null,{status,headers});const stream=createReadStream(file,{start:a,end:b});request.signal.addEventListener('abort',()=>stream.destroy(),{once:true});return new Response(Readable.toWeb(stream),{status,headers});}catch{return new Response(null,{status:404});}});
 handle('state',async()=>{if(!task)await mutations;return state();});
 handle('new-project',async()=>{assertIdle();if(!await confirmDiscard())return null;await archivePendingRecovery();current=null;versionReview=null;projectFileHash=null;textCutRevision++;clearPreparedEdits();projectFile=null;dirty=false;recovery=null;comparison=null;history.reset();tokens.clear();urls.clear();wavePool?.clear();await fs.rm(recoveryFile,{force:true});return state();});
 handle('import-media',async(options={})=>{assertIdle();const append=options.append!==false&&!!current;if(!append&&!await confirmDiscard())return null;const answer=await dialog.showOpenDialog(window,{title:options.layer?'Agregar capa de video':options.audio?'Agregar audio independiente':'Importar videos o audio',properties:['openFile','multiSelections'],filters:[{name:'Video y audio',extensions:['mp4','mov','mkv','webm','avi','m4v','wav','mp3','m4a','ogg','flac']}]});if(answer.canceled)return null;let draft=append?structuredClone(current):null;await busy(async signal=>{for(const file of answer.filePaths){const media=await probe(file,tools,signal);if(options.audio&&!media.hasAudio)throw new Error('El archivo no tiene audio.');media.previewPath=await preparePreview(media,tools,path.join(workspace,'proxies'),{signal,progress});draft=draft?addMedia(draft,media,{audio:!!options.audio,layer:!!options.layer}):createProject(media);} });if(!append){await archivePendingRecovery();current=null;history.reset();projectFile=null;projectFileHash=null;versionReview=null;comparison=null;tokens.clear();urls.clear();}return commit(draft,'Importar medios');});

 handle('import-graphic',async(options={})=>{
  assertIdle();const answer=await dialog.showOpenDialog(window,{title:options.role==='logo'?'Colocar logo':'Importar imágenes',properties:['openFile','multiSelections'],filters:[{name:'Imágenes PNG y JPEG',extensions:['png','jpg','jpeg']}]});if(answer.canceled)return null;
  let draft=current?structuredClone(current):null;
  await busy(async signal=>{for(const file of answer.filePaths){
   if(!['.png','.jpg','.jpeg'].includes(path.extname(file).toLowerCase())||(await fs.stat(file)).size>40e6)throw Error('Utiliza una imagen PNG o JPEG de hasta 40 MB.');
   const image=nativeImage.createFromBuffer(await fs.readFile(file)),size=image.getSize();if(image.isEmpty()||size.width*size.height>40000000)throw Error('No se puede leer la imagen o supera los 40 megapíxeles.');
   const folder=path.join(workspace,'graphics');await fs.mkdir(folder,{recursive:true});const dest=path.join(folder,randomUUID()+'.png');await fs.writeFile(dest,image.toPNG());
   const media=await probe(dest,tools,signal);media.name=path.basename(file);draft=insertGraphic(draft,media,options);
  }});
  if(!current)await archivePendingRecovery();return commit(draft,'Agregar imágenes');
 });
 handle('title',async(id,value,png,options={})=>{
  assertIdle();if(options.projectId!==(current?.id??null)||options.revision!==textCutRevision)throw Error('El proyecto cambió mientras editabas el título. Cierra y vuelve a abrir el editor del título.');const title=validateTitle(value);
  if(typeof png!=='string'||png.length>12e6||!/^data:image\/png;base64,/.test(png))throw Error('La imagen del título no es válida.');
  const image=nativeImage.createFromDataURL(png),size=image.getSize();if(image.isEmpty()||size.width!==1000||size.height<80||size.height>2400)throw Error('Dimensiones del título no válidas.');
  if(id&&(!current||current.assets.find(m=>m.id===current.timeline.clips.find(c=>c.id===id)?.mediaId)?.type!=='title'))throw Error('El título ya no está disponible.');
  const next=await busy(async signal=>{const folder=path.join(workspace,'graphics');await fs.mkdir(folder,{recursive:true});const dest=path.join(folder,randomUUID()+'.png');await fs.writeFile(dest,image.toPNG());const media=await probe(dest,tools,signal);media.type='title';media.title=title;media.name=title.text.trim().replace(/\s+/g,' ').slice(0,60);return id?replaceTitle(current,id,media):insertGraphic(current,media,options);});
  if(!current)await archivePendingRecovery();return commit(next,id?'Editar título':'Crear título');
 });
 handle('graphic-edit',async(id,value)=>{assertIdle();assertProject();return commit(editGraphic(current,id,value),'Editar duración y fundidos');});
 handle('open-project',async()=>{assertIdle();if(!await confirmDiscard())return null;const answer=await dialog.showOpenDialog(window,{title:'Abrir proyecto',properties:['openFile'],filters:[{name:'Proyecto AutoSubsCO',extensions:['json']}]});if(answer.canceled)return null;return openProjectFile(answer.filePaths[0]);});
 handle('open-recent',async id=>{assertIdle();const row=await library.recent(id);if(!await confirmDiscard())return null;const result=await openProjectFile(row.path);if(row.kind==='recovery')managementNotice=null;return {...result,managementNotice};});
 handle('locate-recent',async id=>{assertIdle();const row=await library.recent(id);if(!await confirmDiscard())return null;const answer=await dialog.showOpenDialog(window,{title:'Localizar proyecto: '+row.name,properties:['openFile'],filters:[{name:'Proyecto AutoSubsCO',extensions:['json']}]});if(answer.canceled)return null;const document=await readProjectDocument(answer.filePaths[0]);if(document.project.id!==row.projectId)throw Error('El archivo elegido no corresponde a ese proyecto. Usa Abrir proyecto para abrir otro.');const p=await busy(signal=>hydrate(document.project,signal,path.dirname(answer.filePaths[0])));const result=await installProject(p,{file:path.resolve(answer.filePaths[0]),hash:document.hash,changed:document.raw.version!==6});await library.forget(id);await rememberProject(projectFile,current);return state();});
 handle('forget-recent',async id=>{assertIdle();await library.forget(id);return state();});
 handle('restore',async()=>{assertIdle();if(!recovery)return null;const record=recovery;if(!await confirmDiscard())return null;const p=await busy(signal=>hydrate(record.project,signal,record.projectFile?path.dirname(record.projectFile):workspace));let hash=record.projectFileHash??null;if(!hash&&record.projectFile)hash=await readProjectDocument(record.projectFile).then(d=>d.hash).catch(()=>null);return installProject(p,{file:record.projectFile??null,hash,changed:true,preserveRecovery:false});});
 handle('dismiss-recovery',async()=>{assertIdle();recovery=null;if(current)await autosave();else await fs.rm(recoveryFile,{force:true});return state();});
 handle('save-project',async()=>{assertIdle();const result=await saveProject();return result?state():null;});
 handle('save-project-as',async()=>{assertIdle();const result=await saveProject(true);return result?state():null;});
 handle('project-versions',async()=>{assertIdle();assertProject();return library.listVersions(current.id,projectFile);});
 handle('preview-version',async id=>{assertIdle();assertProject();const v=await library.readVersion(current.id,id,projectFile);versionReview={token:randomUUID(),versionId:id,hash:v.hash,projectId:current.id,revision:textCutRevision};const {project,hash,...details}=v;return {...details,textPreview:v.project.cues.slice(0,3).map(c=>({start:c.start,end:c.end,text:displayCue(c,v.project).text.slice(0,400)})),token:versionReview.token};});
 handle('restore-version',async token=>{assertIdle();assertProject();const plan=versionReview;if(!plan||plan.token!==token||plan.projectId!==current.id||plan.revision!==textCutRevision)throw Error('El proyecto cambió. Vuelve a revisar la versión antes de recuperarla.');const v=await library.readVersion(current.id,plan.versionId,projectFile);if(v.hash!==plan.hash)throw Error('La versión cambió desde que la revisaste. Selecciónala de nuevo.');const next=await busy(signal=>hydrate(v.project,signal,v.sourceFile?path.dirname(v.sourceFile):workspace));await library.capture(current,{sourceFile:projectFile,reason:'Antes de recuperar una versión'});return commit(next,'Recuperar versión guardada');});
 handle('edit',async patch=>{assertIdle();assertProject();const values=Object.fromEntries(['cues','style','format','exportRange','name'].filter(k=>Object.hasOwn(patch??{},k)).map(k=>[k,patch[k]]));if(values.cues)values.cues=attachCues(current,values.cues);return commit({...current,...values},patch?.label??'Editar subtítulos',patch?.group??'editor');});
 handle('undo',async()=>{assertIdle();assertProject();current=history.undo(current);versionReview=null;textCutRevision++;clearPreparedEdits();dirty=true;await autosave();bindMedia();return state();});
 handle('redo',async()=>{assertIdle();assertProject();current=history.redo(current);versionReview=null;textCutRevision++;clearPreparedEdits();dirty=true;await autosave();bindMedia();return state();});
 handle('audio-mix',async(id,value)=>{assertIdle();assertProject();return commit(editAudioMix(current,id,value),'Mezclar audio');});
 handle('audio-point',async(action,id,value)=>{assertIdle();assertProject();return commit(editVolumePoint(current,action,id,value),'Editar curva de volumen');});
 handle('auto-duck',async options=>{assertIdle();assertProject();const next=await busy(signal=>analyzeAndDuck(current,options,{tools,signal,progress}));return commit(next,'Atenuar música durante la voz');});
 handle('prepare-find-replace',async options=>{assertIdle();assertProject();findReplaceProposal=null;findReplaceProposal=prepareFindReplace(current,options,textCutRevision);return publicFindReplace(findReplaceProposal);});
 handle('discard-find-replace',async id=>{if(findReplaceProposal?.id===id)findReplaceProposal=null;return true;});
 handle('apply-find-replace',async(id,ids)=>{assertIdle();assertProject();return commit(applyFindReplace(current,findReplaceProposal,id,ids),'Buscar y reemplazar subtítulos');});
 handle('prepare-alignment',async options=>{assertIdle();assertProject();alignmentProposal=null;const resolved={...options,acceleration:options?.acceleration??config.settings.alignmentAcceleration};alignmentProposal=await busy(signal=>prepareAlignment(current,resolved,{tools,modelRoot,jobsRoot,signal,progress,revision:textCutRevision}));return publicAlignment(alignmentProposal);});
 handle('discard-alignment',async id=>{if(alignmentProposal?.id===id)alignmentProposal=null;return true;});
 handle('apply-alignment',async(id,cueIds)=>{assertIdle();assertProject();const next=applyAlignment(current,alignmentProposal,id,cueIds);return commit(next,'Realinear subtítulos con el audio');});
 handle('prepare-text-cut',async options=>{assertIdle();assertProject();textCutPlan=prepareTextCut(current,options,textCutRevision);return publicTextCut(textCutPlan);});
 handle('discard-text-cut',async id=>{if(textCutPlan?.id===id)textCutPlan=null;return true;});
 handle('apply-text-cut',async id=>{assertIdle();assertProject();const next=applyTextCut(current,textCutPlan,id);return commit(next,'Editar video desde la transcripción');});
 handle('precision',async(action,ids,value={})=>{assertIdle();assertProject();const labels={move:'Mover selección',trim:'Recortar clips',edit:'Editar clip',delete:'Eliminar selección',split:'Dividir selección',group:'Agrupar clips',ungroup:'Desagrupar clips',link:'Vincular audio y video',unlink:'Desvincular clips','extract-audio':'Extraer audio del video','restore-audio':'Restaurar audio original','close-gaps':'Cerrar huecos de V1'};return commit(precisionAction(current,action,ids,value),labels[action]??'Editar selección');});
 handle('clip-action',async(action,id,patch={})=>{assertIdle();assertProject();let next;const videos=videoClips(current),at=videos.findIndex(c=>c.id===id);if(action==='edit'){next=editPrecisionClip(current,id,patch,{ripple:config.settings.ripple});const c=next.timeline.clips.find(c=>c.id===id),old=current.timeline.clips.find(c=>c.id===id);if(patch.timelineStart!==undefined&&Math.abs(patch.timelineStart-old.timelineStart)>.00001)next=moveSelection(next,[id],patch.timelineStart-c.timelineStart);}else if(action==='split')next=splitSelection(current,[id],Number(patch.time));else if(action==='move-to')next=reorderPrecision(current,id,Number(patch.index));else if(action==='left'||action==='right'){const index=at+(action==='left'?-1:1);next=index<0||index>=videos.length?current:reorderPrecision(current,id,index);}else if(action==='remove')next=deleteSelection(current,[id],{ripple:config.settings.ripple});else throw new Error('Acción de clip inválida.');return commit(next,'Editar clip');});
 handle('sequence',async(preset,fps)=>{assertIdle();assertProject();return commit(setPreset(current,preset,fps),'Formato de salida');});
 handle('settings',async values=>{assertIdle();for(const k of ['acceleration','renderAcceleration','alignmentAcceleration'])if(Object.hasOwn(values,k))config.settings[k]=acceleration(values[k]);for(const k of ['align','vad','snap','loop','preferVocals','ripple','showAudioCurves'])if(Object.hasOwn(values,k))config.settings[k]=!!values[k];await atomicJson(path.join(workspace,'config.json'),config);return state();});
 handle('transcribe',async options=>{assertIdle();assertProject();const range=options?.full?{start:0,end:durationOf(current)}:current.exportRange;const next=await busy(signal=>transcribeProject(current,{tools,modelRoot,jobsRoot,...config.settings,model:options?.model,language:options?.language,range,signal,progress}));return commit(next,'Retranscribir selección');});
 handle('compare',async options=>{assertIdle();assertProject();comparison=await busy(signal=>compareModels(current,{tools,modelRoot,jobsRoot,...config.settings,models:options?.models,language:options?.language,reference:typeof options?.reference==='string'?options.reference.slice(0,20000):'',range:current.exportRange,signal,progress}));await atomicJson(path.join(workspace,'comparisons',comparison.id+'.json'),comparison);return state();});
 handle('apply-comparison',async index=>{assertIdle();assertProject();if(!comparison||comparison.projectId!==current.id||comparison.sequence!==JSON.stringify(current.timeline)||![0,1].includes(index))throw new Error('La secuencia cambió. Compara de nuevo antes de aplicar.');const selected=comparison.results[index];return commit({...replaceRange(current,selected.cues,comparison.range),transcription:selected.transcription,warnings:selected.warnings},'Aplicar comparación');});
 handle('download-model',async id=>{await busy(signal=>downloadModel(modelRoot,id,{signal,progress}));return state();});
 handle('cancel',()=>{task?.abort();return true;});
 handle('export-subtitles',async format=>{assertIdle();assertProject();if(!['srt','vtt','ass'].includes(format))throw new Error('Formato no permitido.');const cues=visibleCues(current).map(c=>displayCue(c,current));if(!cues.length)throw new Error('No hay subtítulos dentro del rango.');const answer=await dialog.showSaveDialog(window,{title:'Exportar subtítulos',defaultPath:path.join(workspace,'exports',nameBase()+'.'+format),filters:[{name:format.toUpperCase(),extensions:[format]}]});if(answer.canceled)return null;await protectDestination(current,answer.filePath);const data=format==='srt'?srt(cues):format==='vtt'?vtt(cues):ass(cues,current.style,current.sequence.width,current.sequence.height);await fs.writeFile(answer.filePath,data,'utf8');return answer.filePath;});
 handle('export-video',async mode=>{assertIdle();assertProject();const answer=await dialog.showSaveDialog(window,{title:'Exportar video',defaultPath:path.join(workspace,'exports',nameBase()+'-AutoSubsCO.mp4'),filters:[{name:'Video MP4',extensions:['mp4']}]});if(answer.canceled)return null;lastOutput=await busy(signal=>exportSequence(current,answer.filePath,{tools,jobsRoot,mode,signal,progress,acceleration:config.settings.renderAcceleration,hardware}));return lastOutput;});
 handle('import-subtitles',async()=>{assertIdle();assertProject();const answer=await dialog.showOpenDialog(window,{title:'Importar SRT de la secuencia completa',filters:[{name:'SubRip',extensions:['srt']}],properties:['openFile']});if(answer.canceled)return null;if((await fs.stat(answer.filePaths[0])).size>16e6)throw new Error('SRT demasiado grande.');return commit({...current,cues:attachCues(current,parseSrt(await fs.readFile(answer.filePaths[0],'utf8'),durationOf(current)))},'Importar subtítulos');});
 handle('configure-tool',async name=>{assertIdle();if(!['ffmpeg','ffprobe','whisper','whisperGpu'].includes(name))throw new Error('Herramienta no permitida.');const answer=await dialog.showOpenDialog(window,{title:`Elegir ${name}`,filters:[{name:'Ejecutable',extensions:['exe']}],properties:['openFile']});if(answer.canceled)return null;config[name]=answer.filePaths[0];await atomicJson(path.join(workspace,'config.json'),config);tools=await discoverTools(toolsRoot,config);hardware=await detectHardware(tools);return state();});
 handle('thumbnail',async id=>{assertProject();const media=current.assets.find(m=>m.id===id);if(!media?.hasVideo)return null;if(isGraphic(media))return urls.get(media.id);const file=await wavePool.thumbnail(current.id,media),token=randomUUID();tokens.set(token,file);return `localmedia://asset/${token}`;});
 handle('waveform',async id=>{assertProject();const media=current.assets.find(m=>m.id===id)??current.media;if(!media.hasAudio)return[];return wavePool.get(current.id,media);});
 handle('add-existing',async(id,options={})=>{assertIdle();assertProject();const media=current.assets.find(m=>m.id===id);if(!media)throw new Error('Medio no encontrado.');let next=addMedia(current,media,{audio:!!options.audio,layer:!!options.layer});if(options.layer&&Number.isFinite(options.position)){const c=next.timeline.clips.at(-1);c.timelineStart=Math.max(0,options.position);next.exportRange={start:0,end:durationOf(next)};}return commit(validateProject(next),'Agregar medio a la secuencia');});
 handle('visual',async(id,patch)=>{assertIdle();assertProject();const next=patch?.transitionIn?transitionPrecision(current,id,patch.transitionIn):patch?.trackId||patch?.timelineStart!==undefined?layerPrecision(current,id,patch):setVisual(current,id,{transform:patch?.transform,keyframes:patch?.keyframes});return commit(next,'Transformar clip');});
 handle('keyframe',async(action,id,value)=>{assertIdle();assertProject();const next=action==='upsert'?addKeyframe(current,id,Number(value.time),Object.fromEntries(['x','y','scale','rotation','opacity'].filter(k=>Object.hasOwn(value,k)).map(k=>[k,Number(value[k])])),value.easing??'linear'):action==='delete'?deleteKeyframe(current,id,value.id):null;if(!next)throw new Error('Acción de animación inválida.');return commit(next,'Editar fotograma clave');});
 handle('separate',async id=>{assertIdle();assertProject();const result=await busy(signal=>separateClip(current,id,{tools,modelRoot,jobsRoot,signal,progress}));return commit(result,'Separar voz y música');});
 handle('stem-mode',async(id,mode)=>{assertIdle();assertProject();return commit(stemMode(current,id,mode),'Cambiar escucha de pistas separadas');});
 handle('speakers',async options=>{assertIdle();assertProject();const result=await busy(signal=>analyzeSpeakers(current,{tools,modelRoot,jobsRoot,signal,progress,speakers:Number(options?.count??0),preferVocals:!!options?.preferVocals}));return commit(result,'Asignar turnos de voz');});
 handle('speaker-update',async(id,name,color)=>{assertIdle();assertProject();return commit(renameSpeaker(current,id,name,color),'Editar hablante');});
 handle('translate',async(from,to)=>{assertIdle();assertProject();const result=await busy(signal=>translateCaptions(current,from,to,{tools,modelRoot,jobsRoot,signal,progress}));return commit(result,'Traducir subtítulos');});
 handle('caption-view',async value=>{assertIdle();assertProject();return commit(setCaptionView(current,value.language,!!value.dual,!!value.speakerLabels),'Cambiar pista de subtítulos');});
 handle('download-resource',async id=>{await busy(signal=>downloadResource(modelRoot,id,{tools,signal,progress}));return state();});
 handle('package-project',async()=>{assertIdle();assertProject();const folder=path.join(workspace,'packages');await fs.mkdir(folder,{recursive:true});const chosen=await dialog.showOpenDialog(window,{title:'Empaquetar proyecto y medios',defaultPath:folder,properties:['openDirectory','createDirectory']});if(chosen.canceled)return null;lastPackage=await busy(signal=>packageProject(current,chosen.filePaths[0],{signal,progress}));return{...lastPackage,kind:'package'};});
 handle('open-package',async()=>{if(!lastPackage)throw new Error('Primero empaqueta un proyecto.');await shell.openPath(lastPackage.path);return true;});
 handle('reveal',async()=>{await shell.openPath(path.join(workspace,'exports'));return true;});
 const command=name=>window.webContents.send('command',name);
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Archivo',submenu:[{label:'Nuevo proyecto',accelerator:'CmdOrCtrl+N',click:()=>command('new')},{label:'Importar archivo',accelerator:'CmdOrCtrl+I',click:()=>command('import')},{label:'Abrir proyecto',accelerator:'CmdOrCtrl+O',click:()=>command('open')},{label:'Guardar',accelerator:'CmdOrCtrl+S',click:()=>command('save')},{label:'Guardar como…',accelerator:'CmdOrCtrl+Shift+S',click:()=>command('save-as')},{label:'Versiones guardadas…',click:()=>command('versions')},{label:'Inicio y proyectos recientes',click:()=>command('home')},{role:'quit',label:'Salir'}]},{label:'Edición',submenu:[{label:'Deshacer proyecto',accelerator:'CmdOrCtrl+Z',click:()=>command('undo')},{label:'Rehacer proyecto',accelerator:'CmdOrCtrl+Shift+Z',click:()=>command('redo')},{type:'separator'},{role:'cut',label:'Cortar texto'},{role:'copy',label:'Copiar'},{role:'paste',label:'Pegar'},{role:'selectAll',label:'Seleccionar todo'}]},{label:'Ver',submenu:[{role:'togglefullscreen',label:'Pantalla completa'},{role:'toggleDevTools',label:'Herramientas de desarrollo'}]}]));
 const area=screen.getPrimaryDisplay().workAreaSize;
 window=new BrowserWindow({width:Math.min(1520,area.width),height:Math.min(1040,area.height),minWidth:1000,minHeight:680,title:'AutoSubsCO',backgroundColor:'#111218',autoHideMenuBar:true,webPreferences:{preload:path.join(root,'electron','preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(e,url)=>{if(url!==pathToFileURL(ui).href)e.preventDefault();});window.webContents.session.setPermissionRequestHandler((_,__,cb)=>cb(false));window.webContents.session.setPermissionCheckHandler(()=>false);
 let closing=false,closeRequested=false;handle('close-ready',async error=>{if(!closeRequested)throw new Error('No hay solicitud de cierre.');try{if(error){dialog.showErrorBox('No se pudieron guardar los cambios',String(error));return false;}if(task){const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Continuar trabajando','Cancelar operación y salir'],defaultId:0,cancelId:0,message:'Hay una operación en curso.'});if(answer.response===0)return false;task.abort();while(task)await new Promise(r=>setTimeout(r,60));}await mutations;if(!await confirmDiscard())return false;dirty=false;await autosave();wavePool?.clear();closing=true;window.close();return true;}finally{closeRequested=false;}});
 window.on('close',e=>{if(closing)return;e.preventDefault();if(closeRequested)return;closeRequested=true;window.webContents.send('before-close');});await window.loadFile(ui);void detectHardware(tools).then(value=>{hardware=value;if(!window.isDestroyed())command('refresh');}).catch(()=>{});
 app.on('window-all-closed',()=>app.quit());
}
app.whenReady().then(start).catch(async e=>{await fs.writeFile(path.join(workspace,'logs','startup-error.txt'),String(e.stack??e)).catch(()=>{});dialog.showErrorBox('AutoSubsCO no pudo iniciar',String(e.message??e));app.quit();});
