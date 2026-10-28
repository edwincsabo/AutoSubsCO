import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createProject} from '../src/project.mjs';
import {atomicJson} from '../src/history.mjs';
import {ProjectLibrary,copyProject,readProjectDocument,resolveProjectPaths,sameProjectFile} from '../src/project-library.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'test-results','v8');
await fs.mkdir(out,{recursive:true});
async function fixture(){
 const dir=await fs.mkdtemp(path.join(out,'library-unit-')),media=path.join(dir,"Medios de prueba á's",'voz.wav');await fs.mkdir(path.dirname(media));await fs.writeFile(media,'medio original');
 const p=createProject({id:'m',path:media,name:'voz.wav',duration:10,width:0,height:0,hasVideo:false,hasAudio:true,size:14});
 p.cues=[{id:'c',clipId:p.timeline.clips[0].id,start:1,end:2,text:'Hola Colombia',words:[{text:'Hola',start:1,end:1.5},{text:'Colombia',start:1.5,end:2}]}];
 const file=path.join(dir,'original.autosubsco.json'),library=new ProjectLibrary(path.join(dir,'workspace'));return {dir,media,p,file,library};
}
test('el guardado inicial conserva rutas relativas y devuelve una huella del archivo real',async()=>{
 const f=await fixture(),r=await f.library.save(f.p,f.file,{newFile:true}),raw=JSON.parse(await fs.readFile(f.file,'utf8')),loaded=await readProjectDocument(f.file);
 assert.equal(path.isAbsolute(raw.assets[0].path),false);assert.equal(loaded.project.assets[0].path,f.media);assert.equal(loaded.hash,r.hash);assert.equal(f.p.assets[0].path,f.media);
});
test('Guardar como crea una identidad independiente, conserva original y resuelve medios desde otra carpeta',async()=>{
 const f=await fixture();await f.library.save(f.p,f.file,{newFile:true});const before=await fs.readFile(f.file),target=path.join(f.dir,'otra carpeta','Copia de entrevista.autosubsco.json'),copy=copyProject(f.p,target);
 await f.library.save(copy,target,{newFile:true});assert.notEqual(copy.id,f.p.id);assert.equal(copy.name,'Copia de entrevista');assert.deepEqual(copy.timeline,f.p.timeline);assert.deepEqual(await fs.readFile(f.file),before);assert.equal((await readProjectDocument(target)).project.assets[0].path,f.media);
});
test('una copia no reemplaza un archivo existente',async()=>{
 const f=await fixture();await f.library.save(f.p,f.file,{newFile:true});const before=await fs.readFile(f.file);await assert.rejects(f.library.save(copyProject(f.p,f.file),f.file,{newFile:true}),/ya existe/);assert.deepEqual(await fs.readFile(f.file),before);
});
test('guardar cambios conserva el guardado anterior con medios absolutos y ubicación de origen',async()=>{
 const f=await fixture(),first=await f.library.save(f.p,f.file,{newFile:true}),next={...f.p,name:'Segunda edición'};await f.library.save(next,f.file,{expectedHash:first.hash});
 const rows=await f.library.listVersions(f.p.id,f.file);assert.equal(rows.length,1);const v=await f.library.readVersion(f.p.id,rows[0].id);assert.equal(v.project.name,f.p.name);assert.equal(v.sourceFile,f.file);assert.equal(v.project.assets[0].path,f.media);assert.equal(v.reason,'Antes de guardar');
});
test('se rechaza sobrescribir un cambio externo y no se altera su contenido',async()=>{
 const f=await fixture(),first=await f.library.save(f.p,f.file,{newFile:true});await atomicJson(f.file,{...f.p,name:'Cambio fuera del editor'});const before=await fs.readFile(f.file);await assert.rejects(f.library.save(f.p,f.file,{expectedHash:first.hash}),/cambió fuera/);assert.deepEqual(await fs.readFile(f.file),before);assert.equal((await f.library.listVersions(f.p.id,f.file)).length,0);
});
test('un destino existente ajeno y un archivo desaparecido exigen elegir otra ubicación',async()=>{
 const f=await fixture(),r=await f.library.save(f.p,f.file,{newFile:true});await assert.rejects(f.library.save({...f.p,id:randomUUID()},f.file,{expectedHash:r.hash}),/otro proyecto/);await fs.unlink(f.file);await assert.rejects(f.library.save(f.p,f.file,{expectedHash:r.hash}),/ya no está/);
});
test('recientes se conservan tras reiniciar, se deduplican y quitar no elimina el proyecto',async()=>{
 const f=await fixture();await f.library.save(f.p,f.file,{newFile:true});await f.library.remember(f.file,f.p);await f.library.remember(f.file,{...f.p,name:'Nombre actualizado'});
 const second=new ProjectLibrary(f.library.workspace),rows=await second.listRecents();assert.equal(rows.length,1);assert.equal(rows[0].name,'Nombre actualizado');assert.equal(rows[0].available,true);await second.forget(rows[0].id);assert.equal((await second.listRecents()).length,0);await fs.access(f.file);
});
test('los recientes ausentes se muestran sin borrarlos y se limita el índice a veinte entradas',async()=>{
 const f=await fixture();for(let i=0;i<22;i++){const file=path.join(f.dir,`p${i}.json`);await atomicJson(file,f.p);await f.library.remember(file,{...f.p,name:'Proyecto '+i});}
 const rows=await f.library.listRecents();assert.equal(rows.length,20);assert.equal(rows[0].name,'Proyecto 21');await fs.rename(rows[0].path,rows[0].path+'.movido');assert.equal((await f.library.listRecents())[0].available,false);
});
test('un índice dañado no impide abrir la aplicación y puede reconstruirse al guardar',async()=>{
 const f=await fixture();await fs.mkdir(f.library.workspace,{recursive:true});await fs.writeFile(f.library.indexFile,'{dañado');assert.deepEqual(await f.library.listRecents(),[]);assert.ok(f.library.warning);await f.library.save(f.p,f.file,{newFile:true});await f.library.remember(f.file,f.p);assert.equal((await f.library.listRecents()).length,1);assert.equal(f.library.warning,null);
});
test('las versiones anteriores a 0.8 recuperan rutas relativas desde el proyecto original',async()=>{
 const f=await fixture();await f.library.save(f.p,f.file,{newFile:true});const folder=f.library.versionFolder(f.p.id);await fs.mkdir(folder,{recursive:true});const id=Date.now()+'-'+randomUUID()+'.json';await fs.copyFile(f.file,path.join(folder,id));const v=await f.library.readVersion(f.p.id,id,f.file);assert.equal(v.legacy,true);assert.equal(v.relativeBaseAssumed,true);assert.equal(v.project.assets[0].path,f.media);
});
test('las versiones dañadas quedan identificadas y las demás se pueden seguir revisando',async()=>{
 const f=await fixture();await f.library.capture(f.p,{sourceFile:f.file});const id=Date.now()+'-'+randomUUID()+'.json';await fs.writeFile(path.join(f.library.versionFolder(f.p.id),id),'dañado');const rows=await f.library.listVersions(f.p.id,f.file);assert.equal(rows.length,2);assert.equal(rows.filter(r=>r.available).length,1);assert.equal(rows.filter(r=>!r.available).length,1);
});
test('los identificadores de versión no permiten rutas arbitrarias ni recuperar otro proyecto',async()=>{
 const f=await fixture();await assert.rejects(f.library.readVersion(f.p.id,'../config.json',f.file),/Identificador/);await fs.mkdir(f.library.versionFolder(f.p.id),{recursive:true});const id=Date.now()+'-'+randomUUID()+'.json';await atomicJson(path.join(f.library.versionFolder(f.p.id),id),{...f.p,id:'otro'});await assert.rejects(f.library.readVersion(f.p.id,id,f.file),/otro proyecto/);
});
test('las rutas relativas que salen de la carpeta del proyecto son rechazadas',async()=>{
 const f=await fixture();f.p.assets[0].path='../fuera.wav';assert.throws(()=>resolveProjectPaths(f.p,f.dir),/sale del proyecto/);assert.equal(await sameProjectFile(f.file,path.join(f.dir,'.','original.autosubsco.json')),true);
});
test('la copia previa a recuperar conserva cambios sin guardar para una recuperación posterior',async()=>{
 const f=await fixture(),draft={...f.p,name:'Cambio sin guardar'};const id=await f.library.capture(draft,{sourceFile:f.file,reason:'Antes de recuperar una versión'});const v=await f.library.readVersion(f.p.id,id);assert.equal(v.project.name,'Cambio sin guardar');assert.equal(v.reason,'Antes de recuperar una versión');assert.equal(v.project.assets[0].path,f.media);
});
test('si no se puede conservar la versión anterior, el guardado deja intacto el proyecto existente',async()=>{
 const f=await fixture(),saved=await f.library.save(f.p,f.file,{newFile:true}),before=await fs.readFile(f.file),folder=f.library.versionFolder(f.p.id);
 await fs.mkdir(path.dirname(folder),{recursive:true});await fs.writeFile(folder,'Carpeta de versiones bloqueada por la muestra');
 await assert.rejects(f.library.save({...f.p,name:'No debe reemplazar el original'},f.file,{expectedHash:saved.hash}));
 assert.deepEqual(await fs.readFile(f.file),before);
});
