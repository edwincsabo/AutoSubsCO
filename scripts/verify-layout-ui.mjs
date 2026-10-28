import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright-core';
import {evaluateTransform} from '../src/motion.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'test-results',process.env.AUTOSUBSCO_TEST_RUN??'v11'),workspace=path.join(out,'layout-ui-'+randomUUID());
await fs.mkdir(workspace,{recursive:true});
const userFile=path.join(root,'workspace-desarrollo','Prueba_AutoSubsCO_0_6.autosubsco.json');
const userBytes=await fs.readFile(userFile),hash=b=>createHash('sha256').update(b).digest('hex');
const fixture=JSON.parse(await fs.readFile(path.join(root,'test-results','v6','text-edit-source.autosubsco.json'),'utf8'));
const file=path.join(workspace,'layout.autosubsco.json');await fs.writeFile(file,JSON.stringify(fixture));
const userCopy=path.join(workspace,'vertical.autosubsco.json');await fs.writeFile(userCopy,userBytes);
const env={...process.env,AUTOSUBSCO_DATA:root,AUTOSUBSCO_WORKSPACE:workspace};delete env.ELECTRON_RUN_AS_NODE;
const launch=()=>electron.launch({executablePath:path.join(root,'node_modules','electron','dist','electron.exe'),args:[root],env,timeout:30000});
let app=await launch(),page;const errors=[],measurements=[];
const state=()=>page.evaluate(()=>window.autosubs.state());
async function until(fn){const deadline=Date.now()+15000;while(Date.now()<deadline){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('No se alcanzó el estado esperado.');}
async function mode(name){await page.locator(`[data-workspace="${name}"]`).click();}
async function stub(file){await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},file);}
async function open(file){await stub(file);await page.locator('#open-project').click();await until(async()=>!(await state()).busy&&(await state()).project?.name===JSON.parse(await fs.readFile(file,'utf8')).name);await page.waitForFunction(()=>!document.querySelector('#task-dialog').open&&document.querySelector('#video').readyState>=2);}
async function initialize(){page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.studio-ready');await page.waitForSelector('#model option',{state:'attached'});}
async function settle(){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function resize(w,h){await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),[w,h]);await settle();}
async function seek(time){const range=await page.locator('#ruler').boundingBox(),s=await state(),duration=Math.max(...s.project.timeline.clips.map(c=>c.timelineStart+c.sourceOut-c.sourceIn));await page.locator('#ruler').click({position:{x:range.width*time/duration,y:10}});await settle();}
async function geometry(label){
 const p=(await state()).project,s=await page.evaluate(()=>({time:document.querySelector('#current-time').textContent.split(':').reduce((a,n)=>a*60+Number(n),0),frame:{w:document.querySelector('#video-frame').clientWidth,h:document.querySelector('#video-frame').clientHeight},layers:[...document.querySelectorAll('.studio-video-layer')].filter(n=>n.style.display!=='none').map(n=>({id:n.dataset.clipId,w:parseFloat(n.style.width),h:parseFloat(n.style.height),x:parseFloat(n.style.left),y:parseFloat(n.style.top),opacity:parseFloat(n.style.opacity),current:n.currentTime,paused:n.paused})),caption:parseFloat(document.querySelector('#caption-overlay').style.fontSize)}));
 for(const layer of s.layers){const c=p.timeline.clips.find(c=>c.id===layer.id),m=p.assets.find(m=>m.id===c.mediaId),v=evaluateTransform(c,s.time-c.timelineStart);assert.ok(Math.abs(layer.w-s.frame.w*v.scale)<1.1,label+' ancho de capa');assert.ok(Math.abs(layer.h-(c.trackId==='video-1'?s.frame.h*v.scale:s.frame.w*v.scale*m.height/m.width))<1.1,label+' alto de capa');assert.ok(Math.abs(layer.x-s.frame.w*v.x/100)<1.1,label+' posición X');assert.ok(Math.abs(layer.y-s.frame.h*v.y/100)<1.1,label+' posición Y');}
 assert.ok(Math.abs(s.caption-p.style.fontSize*s.frame.h/p.sequence.height)<.1,label+' subtítulos');measurements.push({label,...s});return s;
}
async function layoutCheck(label){const m=await page.evaluate(()=>{const r=s=>{const a=document.querySelector(s).getBoundingClientRect();return{x:a.x,y:a.y,w:a.width,h:a.height,bottom:a.bottom};};return{width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,stage:r('#video-stage'),transport:r('.transport'),timeline:r('.timeline'),footer:r('.statusbar')};});assert.equal(m.scroll,m.width,label+' sin desbordamiento horizontal');assert.ok(m.stage.w>=300,label+' visor utilizable');assert.ok(m.transport.bottom<=m.timeline.y+1,label+' transporte accesible');assert.ok(m.footer.bottom<=m.height+1,label+' pie visible');return m;}
try{
 await initialize();await open(file);
 const original=JSON.stringify((await state()).project);await mode('text');
 assert.equal(await page.locator('.inspector').getAttribute('data-context'),'text-idle');assert.equal(await page.locator('#transform-section').isVisible(),false);
 await page.locator('.cue-row').first().click();assert.equal(await page.locator('#cue-editor').isVisible(),true);assert.equal(await page.locator('.cue-row[aria-pressed=true]').count(),1);
 await mode('montage');await page.locator('.clip-card').first().click();await page.locator('#transform-section').waitFor({state:'visible'});
 await mode('delivery');assert.equal(await page.locator('#delivery-summary').isVisible(),true);assert.equal(await page.locator('#precision-selection').isVisible(),false);assert.match(await page.locator('#delivery-duration').textContent(),/08\.000$/);
 await page.locator('#trim-in').fill('6');await page.locator('#trim-out').fill('8');await page.locator('#apply-trim').click();
 await until(async()=>(await state()).project.exportRange.start===6);assert.match(await page.locator('#delivery-duration').textContent(),/02\.000$/);assert.match(await page.locator('#delivery-range-note').textContent(),/solo el rango/);
 await page.locator('#undo').click();await until(async()=>JSON.stringify((await state()).project)===original);
 await page.locator('#delivery-review').click();assert.equal(await page.locator('#review-pane').isVisible(),true);
 await mode('montage');await page.locator('.clip-card').first().click();await seek(6.4);
 await page.evaluate(()=>{const descriptor=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');window.auditSeeks=0;Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{...descriptor,set(value){window.auditSeeks++;descriptor.set.call(this,value);}});});
 for(const size of [[1520,1000],[1180,820],[1366,768],[1000,680]]){const before=await page.evaluate(()=>({time:document.querySelector('#video').currentTime,seeks:window.auditSeeks}));await resize(...size);await geometry(size.join('x')+' pausa');await layoutCheck(size.join('x'));const after=await page.evaluate(()=>({time:document.querySelector('#video').currentTime,seeks:window.auditSeeks}));assert.equal(after.seeks,before.seeks,'Redimensionar no busca en los medios');assert.ok(Math.abs(after.time-before.time)<.001);}
 await resize(1366,768);await page.locator('#layout-button').click();await page.locator('[data-layout=balanced]').click();await page.locator('#layout-density').selectOption('comfortable');await page.locator('#layout-close').click();
 for(const id of ['library','inspector','timeline']){const grip=page.locator('.'+id+'-resizer');await grip.focus();const before=Number(await grip.getAttribute('aria-valuenow'));await page.keyboard.press(id==='library'?'ArrowRight':'ArrowUp');await settle();assert.ok(Number(await grip.getAttribute('aria-valuenow'))>=before);await geometry('separador por teclado '+id);}
 const grip=await page.locator('.timeline-resizer').boundingBox();await page.mouse.move(grip.x+100,grip.y+2);await page.mouse.down();await page.mouse.move(grip.x+100,grip.y-40,{steps:5});await page.mouse.up();await settle();await geometry('separador con puntero');
 await page.locator('#toggle-library').click();assert.equal(await page.locator('#workspace-library').isVisible(),false);await geometry('biblioteca plegada');await page.locator('#toggle-library').click();
 await page.locator('#toggle-inspector').click();assert.equal(await page.locator('#workspace-inspector').isVisible(),false);await geometry('inspector plegado');await page.locator('#toggle-inspector').click();
 await page.locator('#layout-button').click();await page.locator('[data-layout=viewer]').click();assert.equal(await page.locator('#layout-library').isChecked(),false);await page.locator('[data-layout=timeline]').click();await page.locator('#layout-density').selectOption('compact');await page.locator('#layout-close').click();await geometry('distribución de montaje');
 assert.equal(JSON.stringify((await state()).project),original,'La distribución no modifica el proyecto');
 await mode('audio');assert.equal(await page.locator('#transform-section').isVisible(),false);await page.locator('#mix-clip').selectOption(fixture.timeline.clips.find(c=>c.kind==='audio').id);assert.equal(await page.locator('#audio-mix-inspector').isVisible(),true);await page.locator('#mix-role').selectOption('neutral');await until(async()=>(await state()).project.timeline.clips.some(c=>c.id===fixture.timeline.clips.find(c=>c.kind==='audio').id&&c.audioMix.role==='neutral'));await page.locator('#undo').click();await until(async()=>JSON.stringify((await state()).project)===original);
 await mode('montage');await seek(.5);await page.locator('#play').click();await until(async()=>!(await page.locator('#video').evaluate(v=>v.paused)));const t=await page.locator('#video').evaluate(v=>v.currentTime);await resize(1180,820);await geometry('redimensionar durante reproducción');await until(async()=>await page.locator('#video').evaluate((v,t)=>v.currentTime>t+.15,t));await page.locator('#play').click();
 const prefs=await page.evaluate(()=>localStorage.getItem('autosubs-layout-v1'));await app.close();app=await launch();await initialize();assert.equal(await page.evaluate(()=>localStorage.getItem('autosubs-layout-v1')),prefs,'Preferencias conservadas al reiniciar');
 await open(userCopy);await mode('delivery');
 for(const zoom of [1,1.25,1.5]){await app.evaluate(({BrowserWindow},z)=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z),zoom);await resize(1366,768);await settle();await geometry('vertical escala '+zoom);await layoutCheck('escala '+zoom);}
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));await resize(1366,768);
 await page.locator('#layout-button').click();await page.locator('#layout-reset').click();assert.equal(await page.locator('#layout-density').inputValue(),'comfortable');await page.locator('#layout-close').click();await settle();await geometry('restablecer');
 await page.screenshot({path:path.join(out,'layout-01-entrega.png')});await mode('text');await page.locator('[data-text-tool=list]').click();await page.locator('.cue-row').first().click();await page.screenshot({path:path.join(out,'layout-02-subtitulos.png')});
 await page.locator('[data-text-tool=cut]').click();assert.equal(await page.locator('#text-cut-review').isVisible(),true);await page.screenshot({path:path.join(out,'layout-03-cortes.png')});
 assert.equal(hash(await fs.readFile(userFile)),hash(userBytes));assert.deepEqual(errors,[]);
 const report={passed:true,development:true,appVersion:(await state()).version,errors,sourceProjectUnchanged:true,contextualInspector:true,clipAndCueSelection:true,deliverySummary:true,pauseResizeWithoutSeeking:true,playbackResize:true,layerGeometry:true,captionGeometry:true,keyboardAndPointerSeparators:true,collapsiblePanels:true,densityPresets:true,persistentPreferences:true,resetView:true,zoomFactors:[1,1.25,1.5],projectUnchangedByLayout:true,measurements};
 await fs.writeFile(path.join(out,'layout-ui-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,measurements:measurements.length},null,2));
}catch(e){if(page){await page.screenshot({path:path.join(out,'layout-error.png')}).catch(()=>{});console.error(await page.evaluate(()=>({toast:document.querySelector('#toast')?.textContent,context:document.querySelector('.inspector')?.dataset.context,errors:document.body.textContent.slice(-500)})).catch(()=>({})));}console.error(errors);throw e;
}finally{await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});}).catch(()=>{});await app.close().catch(()=>{});}
