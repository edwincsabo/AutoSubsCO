import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,validateProject} from '../src/project.mjs';
import {alignmentCanonical,alignmentWords} from '../src/alignment-data.mjs';
import {alignmentSelection,alignmentPlan,applyAlignment,publicAlignment} from '../src/alignment.mjs';
import {ProjectHistory} from '../src/history.mjs';
import {reliableWords} from '../src/text-cut-model.mjs';
const base=()=>{const p=createProject({id:'m',path:'C:/muestra.wav',name:'muestra.wav',duration:30,width:0,height:0,hasAudio:true,hasVideo:false,size:100});p.cues=[{id:'a',start:1,end:3,text:'Hola, Colombia.',words:[],translations:{en:{text:'Hello Colombia.',sourceText:'Hola, Colombia.'}}},{id:'b',start:5,end:7,text:'Otra frase',words:[]}];p.exportRange={start:0,end:10};return p;};
const options={scope:'range',language:'es',acceleration:'cpu'};
function result(p){return {engine:'wav2vec2-ctc-viterbi',provider:'CPUExecutionProvider',elapsedSeconds:1,results:p.cues.map(c=>({cueId:c.id,status:'aligned',scoreMean:.9,scoreMinWord:.9,agreement:.95,words:alignmentWords(c.text).map((text,i)=>({text,start:c.start+.1+i*.5,end:c.start+.4+i*.5,confidence:.9}))}))};}

test('la normalización conserva texto, puntuación, saltos, tildes y ñ en los grupos originales',()=>{
 const text='¿ Hola,\nColombia !  Año\u00a0dos.';const words=alignmentWords(text);assert.deepEqual(words,['¿ Hola,','Colombia !','Año','dos.']);assert.equal(alignmentCanonical(words.join(' ')),alignmentCanonical(text));assert.deepEqual(alignmentWords('...'),[]);
});
test('alinear un subtítulo completo es independiente del rango y el rango omite los parciales',()=>{
 const p=base();p.exportRange={start:2,end:8};const single=alignmentSelection(p,{scope:'cue',cueId:'a',language:'es'});assert.equal(single.rows[0].start,1);const range=alignmentSelection(p,options);assert.equal(range.rows.length,1);assert.equal(range.rows[0].id,'b');assert.equal(range.skipped[0].cueId,'a');
});
test('valida idioma, selección, duración y número de subtítulos antes de procesar',()=>{
 const p=base();assert.throws(()=>alignmentSelection(p,{...options,language:'en'}),/Opciones/);assert.throws(()=>alignmentSelection(p,{scope:'cue',cueId:'desaparecido',language:'es'}),/Selecciona/);p.cues[0].end=25;assert.throws(()=>alignmentSelection(p,{scope:'cue',cueId:'a',language:'es'}),/20 segundos/);p.cues=Array.from({length:26},(_,i)=>({id:String(i),start:i/10,end:i/10+.05,text:'a',words:[]}));assert.throws(()=>alignmentSelection(p,options),/25 subtítulos/);
});
test('la propuesta y su resumen no modifican el proyecto ni publican su huella interna',()=>{
 const p=base(),before=JSON.stringify(p),plan=alignmentPlan(p,options,alignmentSelection(p,options),result(p),4),shown=publicAlignment(plan);assert.equal(JSON.stringify(p),before);assert.equal(shown.eligibleCount,2);assert.equal(shown.revision,4);assert.equal(shown.fingerprint,undefined);assert.equal(shown.projectId,undefined);
});
test('aplicar solo los subtítulos elegidos conserva texto, límites, traducciones, montaje y el resto',()=>{
 const p=base(),plan=alignmentPlan(p,options,alignmentSelection(p,options),result(p)),next=applyAlignment(p,plan,plan.id,['a']);assert.equal(next.cues[0].text,p.cues[0].text);assert.equal(next.cues[0].start,1);assert.equal(next.cues[0].end,3);assert.deepEqual(next.cues[0].translations,p.cues[0].translations);assert.deepEqual(next.cues[1],p.cues[1]);assert.deepEqual(next.timeline,p.timeline);assert.ok(reliableWords(next.cues[0]));assert.equal(next.cues[0].alignment.modelId,'alignment-es');assert.deepEqual(p.cues[0].words,[]);
});
test('rechaza resultados ajenos, duplicados, palabras diferentes e intervalos que se solapan',()=>{
 const p=base(),selection=alignmentSelection(p,options);let r=result(p);r.results[0].cueId='otro';assert.throws(()=>alignmentPlan(p,options,selection,r),/selección/);r=result(p);r.results[1].cueId='a';assert.throws(()=>alignmentPlan(p,options,selection,r),/selección/);r=result(p);r.results[0].words[0].text='Sustitución';assert.throws(()=>alignmentPlan(p,options,selection,r),/palabras/);r=result(p);r.results[0].words[1].start=1.2;assert.throws(()=>alignmentPlan(p,options,selection,r),/palabras/);
});
test('se rechazan tiempos no finitos e indicadores incompatibles con las palabras',()=>{
 const p=base(),selection=alignmentSelection(p,options);let r=result(p);r.results[0].words[0].start=NaN;assert.throws(()=>alignmentPlan(p,options,selection,r),/tiempos/);r=result(p);r.results[0].scoreMinWord=.5;assert.throws(()=>alignmentPlan(p,options,selection,r),/indicadores/);r=result(p);r.results[0].scoreMean=.1;assert.throws(()=>alignmentPlan(p,options,selection,r),/criterios/);
});
test('los fragmentos sin coincidencia permanecen intactos y no se pueden forzar al aplicar',()=>{
 const p=base(),r=result(p);r.results[1]={cueId:'b',status:'review',reason:'Baja coincidencia',words:[]};const plan=alignmentPlan(p,options,alignmentSelection(p,options),r);assert.equal(publicAlignment(plan).reviewCount,1);assert.throws(()=>applyAlignment(p,plan,plan.id,['b']),/propuesta/);const next=applyAlignment(p,plan,plan.id,['a']);assert.deepEqual(next.cues[1],p.cues[1]);
});
test('cualquier cambio del proyecto invalida la aplicación de una propuesta anterior',()=>{
 const p=base(),plan=alignmentPlan(p,options,alignmentSelection(p,options),result(p));assert.throws(()=>applyAlignment({...p,name:'Cambiado'},plan,plan.id,['a']),/cambió/);assert.throws(()=>applyAlignment(p,plan,'otro',['a']),/cambió/);assert.throws(()=>applyAlignment(p,plan,plan.id,[]),/Elige/);assert.throws(()=>applyAlignment(p,plan,plan.id,['a','a']),/Elige/);
});
test('la alineación completa se deshace y rehace en un paso con su procedencia',()=>{
 const p=base(),plan=alignmentPlan(p,options,alignmentSelection(p,options),result(p)),next=applyAlignment(p,plan,plan.id,['a','b']),h=new ProjectHistory();h.push(p,next,{label:'Realinear'});assert.deepEqual(h.undo(next),p);assert.deepEqual(h.redo(p),next);const invalid=structuredClone(next);invalid.cues[0].alignment.scoreMean=NaN;assert.throws(()=>validateProject(invalid),/Indicador/);
});
test('se conserva el proveedor real y la solicitud de GPU cuando se utiliza respaldo CPU',()=>{
 const p=base(),o={...options,acceleration:'gpu'},r={...result(p),fallback:'GPU no disponible'};const plan=alignmentPlan(p,o,alignmentSelection(p,o),r),next=applyAlignment(p,plan,plan.id,['a']);assert.equal(plan.fallback,'GPU no disponible');assert.equal(next.cues[0].alignment.provider,'CPUExecutionProvider');assert.equal(next.cues[0].alignment.requestedAcceleration,'gpu');
});
