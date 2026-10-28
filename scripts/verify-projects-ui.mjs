import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {_electron as electron} from 'playwright-core';
import {projectForSave} from '../src/project-package.mjs';
import {ProjectLibrary,readProjectDocument} from '../src/project-library.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'test-results',process.env.AUTOSUBSCO_TEST_RUN??'v11'),workspace=path.join(out,'projects-ui-'+randomUUID());
const originalFile=path.join(workspace,'Proyecto original á','Entrevista principal.autosubsco.json'),copyFile=path.join(workspace,'Otra carpeta','Entrevista alternativa.autosubsco.json'),movedFile=path.join(path.dirname(originalFile),'Entrevista reubicada.autosubsco.json');
await fs.mkdir(path.join(path.dirname(originalFile),'media'),{recursive:true});
const project=JSON.parse(await fs.readFile(path.join(root,'test-results','v6','text-edit-source.autosubsco.json'),'utf8'));
project.name='Entrevista principal';
for(const m of project.assets){const dest=path.join(path.dirname(originalFile),'media',path.basename(m.path));await fs.copyFile(m.path,dest);m.path=dest;delete m.previewPath;}project.media=project.assets.find(m=>m.id===project.media.id);
await fs.writeFile(originalFile,JSON.stringify(projectForSave(project,originalFile),null,2));
await fs.mkdir(path.join(workspace,'recovery'),{recursive:true});
await fs.writeFile(path.join(workspace,'recovery','current.json'),JSON.stringify({project,projectFile:originalFile,dirty:false,savedAt:new Date().toISOString()}));
const library=new ProjectLibrary(workspace),hash=b=>createHash('sha256').update(b).digest('hex');
const env={...process.env,AUTOSUBSCO_DATA:root,AUTOSUBSCO_WORKSPACE:workspace};delete env.ELECTRON_RUN_AS_NODE;
const launch=()=>electron.launch({executablePath:path.join(root,'node_modules','electron','dist','electron.exe'),args:[root],env,timeout:30000});
let app=await launch(),page;const errors=[];
const state=()=>page.evaluate(()=>window.autosubs.state());
async function until(fn){const limit=Date.now()+15000;while(Date.now()<limit){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('No se alcanzó el estado de proyectos esperado.');}
async function initialize(){
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.studio-ready');await page.waitForSelector('#model option',{state:'attached'});
 await app.evaluate(({dialog},args)=>{
  globalThis.projectUi={file:args.original,save:args.copy,answer:1,cancelOpen:false,cancelSave:false,cancelMedia:false};
  dialog.showOpenDialog=async(...items)=>{const options=items.at(-1),p=globalThis.projectUi;if(p.cancelOpen||p.cancelMedia&&options.title.startsWith('Localizar ')&&!options.title.startsWith('Localizar proyecto:'))return {canceled:true,filePaths:[]};return {canceled:false,filePaths:[p.file]};};
  dialog.showSaveDialog=async()=>globalThis.projectUi.cancelSave?{canceled:true}:{canceled:false,filePath:globalThis.projectUi.save};
  dialog.showMessageBox=async()=>({response:globalThis.projectUi.answer});
 },{original:originalFile,copy:copyFile});
}
async function settings(values){await app.evaluate((_,values)=>Object.assign(globalThis.projectUi,values),values);}
async function idle(){await page.waitForFunction(()=>!document.querySelector('#task-dialog').open&&!document.querySelector('#open-project').disabled);await until(async()=>!(await state()).busy);}
async function mode(name){await page.locator(`[data-workspace="${name}"]`).click();}
async function changeText(text){await mode('text');await page.locator('[data-text-tool=list]').click();await page.locator('.cue-row').first().click();await page.locator('#cue-text').fill(text);await until(async()=>(await state()).project.cues[0].text===text);}
async function save(){await page.locator('#save-project').click();await until(async()=>!(await state()).dirty);}
async function home(){await page.locator('#project-home-button').click();await page.waitForSelector('.shell.home-open');}
async function menu(action){await page.locator('#project-menu>summary').click();await page.locator('#'+action).click();}
async function versions(){await menu('project-versions');await page.waitForSelector('#project-versions-dialog[open]');}
async function versionFor(text){const rows=await page.evaluate(()=>window.autosubs.projectVersions());for(const row of rows){if(!row.available)continue;const v=await library.readVersion((await state()).project.id,row.id,(await state()).projectFile);if(v.project.cues[0]?.text===text)return row;}throw Error('Versión de prueba no encontrada: '+text);}
async function inspect(id){await page.locator(`[data-version-id="${id}"]`).click();await page.waitForFunction(()=>!document.querySelector('#version-restore').disabled);}
async function crash(){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});app=await launch();await initialize();}
try{
 await initialize();await page.waitForSelector('.shell.home-open');assert.equal(await page.locator('#home-current-name').textContent(),'Todavía no hay un proyecto abierto');
 assert.ok((await state()).recentProjects.some(r=>r.path===originalFile),'Se incorpora el último proyecto de la versión anterior');
 await page.locator('#home-open').click();await idle();assert.equal((await state()).projectFile,originalFile);assert.equal(await page.locator('#project-home').isVisible(),false);
 await changeText('Primera corrección guardada');await save();const firstSaved=await fs.readFile(originalFile);
 await changeText('Segunda corrección guardada');await save();const secondSaved=await fs.readFile(originalFile);
 await changeText('Cambio aún sin guardar');const unsaved=JSON.stringify((await state()).project);
 await home();const whileHome=JSON.stringify((await state()).project);await page.keyboard.press('Delete');assert.equal(JSON.stringify((await state()).project),whileHome);await page.locator('#home-continue').click();
 await versions();const selected=await versionFor('Primera corrección guardada');await inspect(selected.id);
 assert.equal(hash(await fs.readFile(originalFile)),hash(secondSaved));assert.equal(JSON.stringify((await state()).project),unsaved);await page.screenshot({path:path.join(out,'projects-01-versiones.png')});
 for(const zoom of [1.25,1.5]){await app.evaluate(({BrowserWindow},z)=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1180,720);w.webContents.setZoomFactor(z);},zoom);await page.locator('#version-restore').scrollIntoViewIfNeeded();const box=await page.locator('#version-restore').boundingBox();assert.ok(box.y+box.height<=await page.evaluate(()=>innerHeight)+1,'Recuperación accesible al ampliar la interfaz');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setZoomFactor(1);w.setContentSize(1520,1000);});
 const staleToken=await page.evaluate(async id=>(await window.autosubs.previewVersion(id)).token,selected.id);await page.locator('#versions-close').click();await changeText('Edición posterior a revisar versión');
 const staleError=await page.evaluate(async token=>{try{await window.autosubs.restoreVersion(token);return null;}catch(e){return e.message;}},staleToken);assert.match(staleError,/cambió/);
 await changeText('Cambio aún sin guardar');
 const fingerprintToken=await page.evaluate(async id=>(await window.autosubs.previewVersion(id)).token,selected.id),versionFile=path.join(library.versionFolder(project.id),selected.id),versionBytes=await fs.readFile(versionFile);
 await fs.writeFile(versionFile,Buffer.concat([versionBytes,Buffer.from('\n')]));
 const changedError=await page.evaluate(async token=>{try{await window.autosubs.restoreVersion(token);return null;}catch(e){return e.message;}},fingerprintToken);assert.match(changedError,/versión cambió/);await fs.writeFile(versionFile,versionBytes);
 const beforeRestore=JSON.stringify((await state()).project);await versions();await inspect(selected.id);await page.locator('#version-restore').click();await idle();await until(async()=>(await state()).project.cues[0].text==='Primera corrección guardada');
 assert.equal((await state()).dirty,true);assert.equal(hash(await fs.readFile(originalFile)),hash(secondSaved));assert.ok(await versionFor('Cambio aún sin guardar'));
 await page.locator('#undo').click();await until(async()=>JSON.stringify((await state()).project)===beforeRestore);await page.locator('#redo').click();await until(async()=>(await state()).project.cues[0].text==='Primera corrección guardada');await save();
 assert.equal((await readProjectDocument(originalFile)).project.cues[0].text,'Primera corrección guardada');
 const sourceBeforeCopy=await fs.readFile(originalFile);await changeText('Texto de la copia independiente');await settings({save:copyFile});await page.keyboard.press('Control+Shift+s');
 await until(async()=>(await state()).projectFile===copyFile);assert.notEqual((await state()).project.id,project.id);assert.equal((await state()).project.name,'Entrevista alternativa');assert.equal((await state()).history.canUndo,false);assert.equal(hash(await fs.readFile(originalFile)),hash(sourceBeforeCopy));
 assert.equal((await readProjectDocument(copyFile)).project.assets[0].path,project.assets[0].path);
 await settings({save:copyFile});const beforeSelf=JSON.stringify((await state()).project);await menu('save-project-as');await until(async()=>await page.locator('#toast').textContent().then(t=>/otro nombre/.test(t)));assert.equal(JSON.stringify((await state()).project),beforeSelf);
 await settings({save:originalFile});await menu('save-project-as');await until(async()=>await page.locator('#toast').textContent().then(t=>/ya existe/.test(t)));assert.equal(hash(await fs.readFile(originalFile)),hash(sourceBeforeCopy));
 await changeText('No perder al cancelar');await settings({cancelSave:true});await menu('save-project-as');await idle();assert.equal((await state()).projectFile,copyFile);assert.equal((await state()).dirty,true);
 await settings({cancelSave:false,cancelOpen:true});await page.locator('#open-project').click();await idle();assert.equal((await state()).dirty,true);assert.equal((await state()).project.cues[0].text,'No perder al cancelar');assert.equal(JSON.parse(await fs.readFile(path.join(workspace,'recovery','current.json'),'utf8')).dirty,true);
 await settings({cancelOpen:false});await save();
 const bad=structuredClone((await state()).project);bad.assets[0].path=path.join(workspace,'medio-no-encontrado.mp4');const badId=await library.capture(bad,{sourceFile:copyFile,reason:'Muestra con medio ausente'}),beforeBad=JSON.stringify((await state()).project);
 const versionCount=(await page.evaluate(()=>window.autosubs.projectVersions())).length;await versions();await inspect(badId);await settings({cancelMedia:true});await page.locator('#version-restore').click();await idle();await page.waitForSelector('#project-versions-dialog[open]');assert.equal(JSON.stringify((await state()).project),beforeBad);assert.equal((await page.evaluate(()=>window.autosubs.projectVersions())).length,versionCount);await page.locator('#versions-close').click();await settings({cancelMedia:false});
 await fs.rename(originalFile,movedFile);await home();let s=await state();const old=s.recentProjects.find(r=>r.projectId===project.id);assert.equal(old.available,false);await settings({file:movedFile});await page.locator(`[data-recent-id="${old.id}"]`).getByRole('button',{name:'Localizar',exact:true}).click();await idle();assert.equal((await state()).projectFile,movedFile);assert.equal(hash(await fs.readFile(movedFile)),hash(sourceBeforeCopy));
 await home();await page.locator('#recent-search').fill('alternativa');assert.equal(await page.locator('.recent-project').count(),1);await page.locator('#recent-search').fill('ningún proyecto coincide');assert.equal(await page.locator('.recent-project').count(),0);await page.locator('#recent-search').fill('');
 const copy=(await state()).recentProjects.find(r=>r.path===copyFile);await page.locator(`[data-recent-id="${copy.id}"]`).getByRole('button',{name:/Quitar de recientes/}).click();await until(async()=>!(await state()).recentProjects.some(r=>r.id===copy.id));await fs.access(copyFile);await page.locator('#home-continue').click();
 await changeText('Sesión interrumpida recuperable');const diskBeforeCrash=await fs.readFile(movedFile);await crash();await page.waitForSelector('#home-recovery:not(.hidden)');assert.ok((await state()).recentProjects.some(r=>r.path===movedFile));await page.locator('#home-restore').click();await idle();assert.equal((await state()).project.cues[0].text,'Sesión interrumpida recuperable');assert.equal((await state()).dirty,true);assert.equal(hash(await fs.readFile(movedFile)),hash(diskBeforeCrash));
 await crash();await page.waitForSelector('#home-recovery:not(.hidden)');await settings({file:copyFile});await page.locator('#home-open').click();await idle();assert.equal((await state()).projectFile,copyFile);const preserved=(await state()).recentProjects.find(r=>r.kind==='recovery');assert.ok(preserved);assert.equal((await readProjectDocument(preserved.path)).project.cues[0].text,'Sesión interrumpida recuperable');
 await home();await page.locator(`[data-recent-id="${preserved.id}"] .recent-open`).click();await idle();assert.equal((await state()).project.cues[0].text,'Sesión interrumpida recuperable');await home();
 for(const zoom of [1,1.25,1.5]){await app.evaluate(({BrowserWindow},z)=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1366,768);w.webContents.setZoomFactor(z);},zoom);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));await page.screenshot({path:path.join(out,'projects-02-inicio.png')});
 assert.deepEqual(errors,[]);const report={passed:true,development:true,appVersion:(await state()).version,home:true,recentOpenAndRestart:true,search:true,removeKeepsFile:true,relocateMissingProject:true,saveAsIndependentIdentity:true,saveAsPreservesSource:true,saveAsAcrossFoldersResolvesMedia:true,cancelSaveAsKeepsDraft:true,cancelOpenKeepsDirtyRecovery:true,sourceOverwriteRejected:true,existingDestinationRejected:true,versionPreviewNonDestructive:true,versionRestoreUndoRedo:true,versionRestoreRequiresSave:true,beforeRestoreDraftPreserved:true,staleReviewRejected:true,changedSnapshotRejected:true,cancelMissingMediaKeepsProject:true,crashRecovery:true,pendingRecoveryArchivedBeforeSwitch:true,homeKeyboardDoesNotEditClips:true,zoomFactors:[1,1.25,1.5],errors};await fs.writeFile(path.join(out,'projects-ui-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){if(page){await page.screenshot({path:path.join(out,'projects-error.png')}).catch(()=>{});console.error(await page.evaluate(()=>({toast:document.querySelector('#toast')?.textContent,home:document.body.classList.contains('home-open'),dialog:document.querySelector('#project-versions-dialog')?.open,detail:document.querySelector('#version-details')?.textContent})).catch(()=>({})));}console.error(errors);throw e;
}finally{await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});}).catch(()=>{});await app.close().catch(()=>{});}
