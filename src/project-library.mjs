import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {atomicJson} from './history.mjs';
import {validateProject,durationOf} from './project.mjs';
import {projectForSave} from './project-package.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=file=>process.platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file);
const versionName=/^\d{13}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json$/i;
export const projectSummary=p=>({name:p.name,projectId:p.id,duration:durationOf(p),clips:p.timeline.clips.length,cues:p.cues.length,assets:p.assets.length,width:p.sequence.width,height:p.sequence.height,fps:p.sequence.fps});
export function resolveProjectPaths(input,base){
 const p=validateProject(input);
 for(const m of p.assets){
  if(!path.isAbsolute(m.path)){const file=path.resolve(base,m.path),relative=path.relative(path.resolve(base),file);if(relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('La ruta relativa sale del proyecto.');m.path=file;}
  delete m.previewPath;
 }
 p.media=p.assets.find(m=>m.id===p.media.id)??p.assets[0];return p;
}
export async function readProjectDocument(file){
 const stat=await fs.stat(file);if(!stat.isFile()||stat.size>64e6)throw Error('El proyecto no es un archivo válido de hasta 64 MB.');
 const bytes=await fs.readFile(file),raw=JSON.parse(bytes.toString('utf8'));
 return {raw,project:resolveProjectPaths(raw,path.dirname(file)),hash:digest(bytes),modifiedAt:stat.mtime.toISOString()};
}
export async function sameProjectFile(a,b){
 if(!a||!b)return false;
 const real=async f=>canonical(await fs.realpath(f).catch(()=>path.resolve(f)));
 return await real(a)===await real(b);
}
export function copyProject(project,file){
 const p=validateProject(project);p.id=randomUUID();p.createdAt=new Date().toISOString();
 p.name=path.basename(file).replace(/(?:\.autosubsco)?\.json$/i,'').trim().slice(0,255)||p.name;
 return p;
}

export class ProjectLibrary{
 constructor(workspace){this.workspace=path.resolve(workspace);this.indexFile=path.join(this.workspace,'recent-projects.json');this.rows=null;this.warning=null;}
 async load(){
  if(this.rows)return this.rows;
  try{
   const stat=await fs.stat(this.indexFile);if(stat.size>1e6)throw Error('Índice demasiado grande.');
   const index=JSON.parse(await fs.readFile(this.indexFile,'utf8'));if(index.schema!=='autosubsco.recents'||index.version!==1||!Array.isArray(index.projects))throw Error('Índice incompatible.');
   this.rows=index.projects.filter(r=>typeof r.path==='string'&&path.isAbsolute(r.path)&&r.path.length<4096&&typeof r.id==='string'&&/^[a-f0-9]{32}$/.test(r.id)&&typeof r.projectId==='string'&&typeof r.name==='string'&&r.name.length<=255&&Number.isFinite(Date.parse(r.lastUsedAt))).slice(0,20);
  }catch(e){this.rows=[];if(e.code!=='ENOENT')this.warning='No se pudo leer la lista anterior de proyectos recientes.';}
  return this.rows;
 }
 async persist(rows){await atomicJson(this.indexFile,{schema:'autosubsco.recents',version:1,projects:rows});this.rows=rows;this.warning=null;}
 async remember(file,project,options={}){
  const rows=await this.load(),real=await fs.realpath(file),stat=await fs.stat(real),id=digest(canonical(real)).slice(0,32);
  const kind=options.kind==='recovery'?'recovery':rows.find(r=>r.id===id)?.kind??'project';
  const entry={...projectSummary(project),id,path:real,kind,lastUsedAt:new Date().toISOString(),modifiedAt:stat.mtime.toISOString()};
  await this.persist([entry,...rows.filter(r=>r.id!==id&&canonical(r.path)!==canonical(real))].slice(0,20));return entry;
 }
 async recent(id){const row=(await this.load()).find(r=>r.id===id);if(!row)throw Error('El proyecto ya no está en recientes. Usa Abrir proyecto.');return structuredClone(row);}
 async forget(id){await this.persist((await this.load()).filter(r=>r.id!==id));}
 async listRecents(){return Promise.all((await this.load()).map(async r=>({...r,available:await fs.stat(r.path).then(s=>s.isFile()).catch(()=>false)})));}
 versionFolder(projectId){return path.join(this.workspace,'versions',digest(projectId).slice(0,20));}
 async capture(project,{sourceFile=null,reason='Guardado anterior',modifiedAt=null}={}){
  const p=resolveProjectPaths(project,sourceFile?path.dirname(sourceFile):this.workspace),folder=this.versionFolder(p.id),id=Date.now()+'-'+randomUUID()+'.json';
  const envelope={schema:'autosubsco.project-version',version:1,capturedAt:new Date().toISOString(),sourceFile,modifiedAt,reason,project:p};
  await atomicJson(path.join(folder,id),envelope);return id;
 }
 async readVersion(projectId,id,currentFile=null){
  if(typeof id!=='string'||!versionName.test(id))throw Error('Identificador de versión no válido.');
  const file=path.join(this.versionFolder(projectId),id),stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64e6)throw Error('La versión no es un archivo válido de hasta 64 MB.');
  const realFolder=await fs.realpath(this.versionFolder(projectId)),realFile=await fs.realpath(file);
  if(path.dirname(realFile)!==realFolder)throw Error('La versión está fuera de su carpeta.');
  const bytes=await fs.readFile(realFile),data=JSON.parse(bytes.toString('utf8')),wrapped=data.schema==='autosubsco.project-version';
  if(wrapped&&(data.version!==1||typeof data.reason!=='string'||data.reason.length>200||data.sourceFile!==null&&(typeof data.sourceFile!=='string'||!path.isAbsolute(data.sourceFile))))throw Error('Formato de versión no compatible.');
  const sourceFile=wrapped?data.sourceFile:currentFile,raw=wrapped?data.project:data;
  const relative=raw.assets?.some(m=>!path.isAbsolute(m.path));
  if(relative&&!sourceFile)throw Error('Falta la ubicación original para resolver los medios de esta versión.');
  const project=resolveProjectPaths(raw,sourceFile?path.dirname(sourceFile):this.workspace);
  if(project.id!==projectId)throw Error('La versión pertenece a otro proyecto.');
  return {id,hash:digest(bytes),project,summary:projectSummary(project),sourceFile,capturedAt:wrapped?data.capturedAt:stat.mtime.toISOString(),modifiedAt:wrapped?data.modifiedAt:null,reason:wrapped?data.reason:'Guardado anterior · versión antigua',legacy:!wrapped,relativeBaseAssumed:!wrapped&&relative};
 }
 async listVersions(projectId,currentFile=null){
  const folder=this.versionFolder(projectId),files=await fs.readdir(folder).catch(e=>{if(e.code==='ENOENT')return[];throw e;});
  const names=files.filter(f=>versionName.test(f)).sort().reverse().slice(0,30),result=[];
  for(const id of names){try{const v=await this.readVersion(projectId,id,currentFile);const {project,hash,...item}=v;result.push({...item,available:true});}catch(e){result.push({id,available:false,reason:'No se puede leer esta versión',error:String(e.message).slice(0,300)});}}
  return result;
 }
 async save(project,file,{expectedHash=null,newFile=false}={}){
  const p=validateProject(project);let previous;
  try{previous=await readProjectDocument(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(newFile&&previous)throw Error('Ese archivo ya existe. Elige un nombre nuevo para conservar las dos copias.');
  if(previous){
   if(!expectedHash||previous.hash!==expectedHash)throw Error('El archivo cambió fuera de esta sesión o ya existe. Usa Guardar como con un nombre nuevo para conservar tus cambios.');
   if(previous.project.id!==p.id)throw Error('El archivo pertenece a otro proyecto. Usa Guardar como.');
   await this.capture(previous.project,{sourceFile:path.resolve(file),reason:'Antes de guardar',modifiedAt:previous.modifiedAt});
  }else if(expectedHash)throw Error('El archivo guardado ya no está en su ubicación. Usa Guardar como.');
  const value=projectForSave(p,file),bytes=Buffer.from(JSON.stringify(value,null,2));
  if(!previous){
   await fs.mkdir(path.dirname(file),{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';
   try{await fs.writeFile(temporary,bytes,{flag:'wx'});await fs.copyFile(temporary,file,fs.constants.COPYFILE_EXCL);}finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
  }else{
   if((await readProjectDocument(file)).hash!==expectedHash)throw Error('El archivo cambió durante el guardado. Usa Guardar como.');
   await atomicJson(file,value);
  }
  return {file:path.resolve(file),hash:digest(bytes)};
 }
}
