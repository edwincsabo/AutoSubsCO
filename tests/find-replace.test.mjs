import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,validateProject} from '../src/project.mjs';
import {replaceOptions,literalMatches,evaluateReplacement,REPLACE_LIMITS} from '../src/find-replace-model.mjs';
import {prepareFindReplace,publicFindReplace,applyFindReplace} from '../src/find-replace.mjs';
import {reviewStudio} from '../src/studio-review.mjs';
import {displayCue} from '../src/caption-view.mjs';
import {ProjectHistory} from '../src/history.mjs';
import {reliableWords} from '../src/text-cut-model.mjs';
const opts=(query,replacement,extra={})=>replaceOptions({query,replacement,...extra});
function base(){
 const p=createProject({id:'m',path:'C:/media.mp4',name:'media.mp4',duration:30,width:640,height:360,hasVideo:true,hasAudio:true,size:100});
 p.cues=[{id:'a',start:1,end:5,text:'Hola Colombia. Hola Colombia.',words:[{text:'Hola',start:1.1,end:1.4},{text:'Colombia.',start:1.5,end:2},{text:'Hola',start:3.1,end:3.4},{text:'Colombia.',start:3.5,end:4}]},{id:'b',start:6,end:8,text:'Hola año',words:[{text:'Hola',start:6.1,end:6.4},{text:'año',start:6.5,end:7}]},{id:'c',start:9,end:11,text:'Adiós Colombia',words:[{text:'Adiós',start:9.1,end:9.5},{text:'Colombia',start:10,end:10.5}]}];
 p.cues[0].alignment={method:'wav2vec2-ctc-viterbi',modelId:'alignment-es',modelRevision:'a'.repeat(40),language:'es',provider:'CPUExecutionProvider',requestedAcceleration:'cpu',sourceText:p.cues[0].text,scoreMean:.9,scoreMinWord:.8,agreement:.95,acceptedAt:'2026-10-27T10:00:00.000Z'};
 p.cues[0].translations={en:{text:'Hello Colombia. Hello Colombia.',sourceText:p.cues[0].text,from:'manual'},fr:{text:'Bonjour Colombie.',sourceText:p.cues[0].text,from:'manual'}};p.cues[1].translations={en:{text:'Hello year',sourceText:'Original anterior',from:'manual'}};return validateProject(p);
}
const all=plan=>plan.rows.flatMap(row=>row.matches.map(hit=>hit.id));

test('busca texto literal y no interpreta expresiones regulares ni plantillas de reemplazo',()=>{
 assert.equal(literalMatches('a.* [x] aaaaa',opts('a.*','x')).length,1);const p=base(),plan=prepareFindReplace(p,opts('Colombia','$& $1 \\n'));const next=applyFindReplace(p,plan,plan.id,all(plan));assert.ok(next.cues[0].text.includes('$& $1 \\n'));assert.ok(!next.cues[0].text.includes('Colombia'));
});
test('respeta mayúsculas, palabras completas y los límites Unicode de las palabras',()=>{
 const text='año años AÑO año_2 extraño';assert.equal(literalMatches(text,opts('año','x',{wholeWord:true})).length,2);assert.equal(literalMatches(text,opts('año','x',{wholeWord:true,caseSensitive:true})).length,1);assert.equal(literalMatches('café cafetera',opts('café','x',{wholeWord:true})).length,1);
});
test('ignorar tildes mantiene la diferencia entre n y ñ',()=>{
 assert.equal(literalMatches('canción cancion',opts('cancion','x',{ignoreAccents:true})).length,2);assert.equal(literalMatches('año ano',opts('ano','x',{ignoreAccents:true,wholeWord:true})).length,1);assert.equal(literalMatches('AÑO ANO',opts('ANO','x',{caseSensitive:true,ignoreAccents:true,wholeWord:true})).length,1);
});
test('normalización canónica y posiciones UTF-16 conservan tildes descompuestas y emojis',()=>{
 const text='👩‍👩‍👧‍👦 cancio\u0301n final',m=literalMatches(text,opts('CANCIÓN','tema'));assert.equal(m.length,1);assert.equal(text.slice(m[0].start,m[0].end),'cancio\u0301n');const p=base();p.cues=[{id:'a',start:0,end:2,text,words:[]}];const plan=prepareFindReplace(p,opts('canción','tema'));assert.equal(applyFindReplace(p,plan,plan.id,all(plan)).cues[0].text,'👩‍👩‍👧‍👦 tema final');
});
test('no divide un grafema al buscar una parte de una transformación de mayúsculas',()=>{
 assert.equal(literalMatches('İ',opts('i','x')).length,0);assert.equal(literalMatches('ß',opts('s','x')).length,0);assert.equal(literalMatches('ß',opts('ss','x')).length,1);
});
test('puede comparar frases entre líneas y permite desactivar esa normalización',()=>{
 const text='Hola\n  Colombia';assert.equal(literalMatches(text,opts('Hola Colombia','x')).length,1);assert.equal(literalMatches(text,opts('Hola Colombia','x',{flexibleWhitespace:false})).length,0);assert.equal(literalMatches('banana',opts('ana','x')).length,1);
});
test('el rango omite subtítulos parciales y conserva el contenido fuera de la selección',()=>{
 const p=base();p.exportRange={start:2,end:8};const plan=prepareFindReplace(p,opts('Hola','Buenas'));assert.equal(plan.partialCount,1);assert.equal(plan.rows.length,1);assert.equal(plan.rows[0].cueId,'b');const next=applyFindReplace(p,plan,plan.id,all(plan));assert.deepEqual(next.cues[0],p.cues[0]);assert.deepEqual(next.cues[2],p.cues[2]);assert.equal(next.cues[1].text,'Buenas año');
});
test('la preparación y el resumen público no modifican el proyecto ni exponen la huella interna',()=>{
 const p=base(),before=JSON.stringify(p),plan=prepareFindReplace(p,opts('Colombia','Bogotá'),8),shown=publicFindReplace(plan);assert.equal(JSON.stringify(p),before);assert.equal(shown.revision,8);assert.equal(shown.fingerprint,undefined);assert.equal(shown.projectId,undefined);assert.equal(shown.changeCount,3);
});
test('se pueden elegir coincidencias individuales sin reemplazo recursivo',()=>{
 const p=base(),plan=prepareFindReplace(p,opts('Hola','Hola Hola'));const next=applyFindReplace(p,plan,plan.id,[plan.rows[0].matches[0].id]);assert.equal(next.cues[0].text,'Hola Hola Colombia. Hola Colombia.');assert.deepEqual(next.cues[1],p.cues[1]);
});
test('mayúsculas y puntuación exteriores conservan marcas y procedencia cuando la correspondencia es verificable',()=>{
 const p=base(),plan=prepareFindReplace(p,opts('Hola','HOLA')),next=applyFindReplace(p,plan,plan.id,all(plan));assert.equal(next.cues[0].words[0].text,'HOLA');assert.equal(next.cues[0].words[0].start,p.cues[0].words[0].start);assert.deepEqual(next.cues[0].alignment,p.cues[0].alignment);assert.ok(reliableWords(next.cues[0]));const punctuation=prepareFindReplace(p,opts('.','!'));assert.equal(applyFindReplace(p,punctuation,punctuation.id,all(punctuation)).cues[0].words[1].text,'Colombia!');
});
test('un cambio léxico retira marcas, conserva traducciones y señala realineación y revisión',()=>{
 const p=base(),plan=prepareFindReplace(p,opts('Colombia','Bogotá')),next=applyFindReplace(p,plan,plan.id,all(plan));assert.equal(next.cues[0].words.length,0);assert.equal(next.cues[0].alignment,undefined);assert.equal(next.cues[0].alignmentPending,true);assert.equal(next.cues[0].translations.en.text,p.cues[0].translations.en.text);assert.equal(next.cues[0].translations.en.sourceText,p.cues[0].translations.en.sourceText);assert.deepEqual(next.timeline,p.timeline);assert.equal(next.cues[0].start,p.cues[0].start);assert.ok(reviewStudio(next).some(r=>r.kind==='alignment-pending'));assert.ok(reviewStudio(next).some(r=>r.kind==='translation-stale'&&r.cueId==='a'&&r.language==='en'));
});
test('un cambio de acento o puntuación interior no reutiliza marcas de otro texto',()=>{
 const p=base(),plan=prepareFindReplace(p,opts('año','ano')),next=applyFindReplace(p,plan,plan.id,all(plan));assert.equal(next.cues[1].words.length,0);assert.equal(next.cues[1].alignmentPending,true);p.cues[1].text="pa'l";p.cues[1].words=[{text:"pa'l",start:6,end:7}];const apostrophe=prepareFindReplace(p,opts("pa'l",'pal'));assert.equal(applyFindReplace(p,apostrophe,apostrophe.id,all(apostrophe)).cues[1].words.length,0);
});
test('editar una traducción conserva original, otras traducciones, tiempos y su estado pendiente anterior',()=>{
 const p=base(),plan=prepareFindReplace(p,opts('Hello','Hi',{language:'en'})),next=applyFindReplace(p,plan,plan.id,all(plan));assert.equal(next.cues[0].text,p.cues[0].text);assert.deepEqual(next.cues[0].words,p.cues[0].words);assert.deepEqual(next.cues[0].alignment,p.cues[0].alignment);assert.deepEqual(next.cues[0].translations.fr,p.cues[0].translations.fr);assert.equal(next.cues[1].translations.en.sourceText,'Original anterior');next.captionView.language='en';assert.equal(displayCue(next.cues[1],next).translationStale,true);
});
test('las traducciones ausentes se omiten y nunca se sustituye el original como respaldo',()=>{
 const p=base(),plan=prepareFindReplace(p,opts('Adiós','Bye',{language:'en'}));assert.equal(plan.missingTranslationCount,1);assert.equal(plan.foundCount,0);assert.equal(plan.rows.length,0);
});
test('no permite resultados vacíos y aplica todo o nada, con posibilidad de desmarcar el resultado inválido',()=>{
 const p=base();p.cues[0].text='Hola';p.cues[0].words=[p.cues[0].words[0]];const before=JSON.stringify(p),plan=prepareFindReplace(p,opts('Hola',''));assert.throws(()=>applyFindReplace(p,plan,plan.id,all(plan)),/vacío/);assert.equal(JSON.stringify(p),before);const next=applyFindReplace(p,plan,plan.id,plan.rows[1].matches.map(m=>m.id));assert.equal(next.cues[0].text,'Hola');assert.equal(next.cues[1].text,' año');
});
test('limita el resultado antes de construir textos grandes y una selección menor puede ser válida',()=>{
 const p=base();p.cues=[{id:'a',start:0,end:2,text:'a '.repeat(1000)+'a',words:[]}];const plan=prepareFindReplace(p,opts('a','Z'.repeat(10))),row=plan.rows[0],evaluation=evaluateReplacement(p.cues[0],'original',row,plan.options.replacement,new Set(all(plan)));assert.equal(evaluation.after,null);assert.ok(evaluation.preview.length<=2001);assert.match(evaluation.invalid,/4000/);const next=applyFindReplace(p,plan,plan.id,[row.matches[0].id]);assert.ok(next.cues[0].text.length<4000);
});
test('una propuesta antigua, ajena o una selección repetida no se aplica',()=>{
 const p=base(),plan=prepareFindReplace(p,opts('Hola','Buenas'));assert.throws(()=>applyFindReplace({...p,name:'Otro'},plan,plan.id,all(plan)),/cambió/);assert.throws(()=>applyFindReplace(p,plan,'otro',all(plan)),/cambió/);assert.throws(()=>applyFindReplace(p,plan,plan.id,['inventado']),/Selecciona/);assert.throws(()=>applyFindReplace(p,plan,plan.id,[all(plan)[0],all(plan)[0]]),/Selecciona/);
});
test('los cambios y sus marcas de revisión se deshacen y rehacen como una sola operación',()=>{
 const p=base(),plan=prepareFindReplace(p,opts('Colombia','Bogotá')),next=applyFindReplace(p,plan,plan.id,all(plan)),h=new ProjectHistory();h.push(p,next,{label:'Buscar y reemplazar'});assert.deepEqual(h.undo(next),p);assert.deepEqual(h.redo(p),next);const bad=structuredClone(next);bad.cues[0].alignmentPending='sí';assert.throws(()=>validateProject(bad),/alineación pendiente/);
});
test('no genera cambios cuando el reemplazo ya coincide y valida los límites de consulta y selección',()=>{
 const p=base(),plan=prepareFindReplace(p,opts('Hola','Hola'));assert.equal(plan.changeCount,0);assert.equal(plan.unchangedCount,3);assert.throws(()=>replaceOptions({query:' ',replacement:''}),/Elige/);assert.throws(()=>opts('a'.repeat(201),'b'),/200/);assert.throws(()=>opts('a','b'.repeat(1001)),/1000/);assert.throws(()=>opts('a','\u0000'),/control/);p.cues=[{id:'a',start:0,end:2,text:'a'.repeat(REPLACE_LIMITS.matches+1),words:[]}];assert.throws(()=>prepareFindReplace(p,opts('a','b')),/2000/);
});
test('el límite de texto se comprueba antes de normalizar una selección demasiado grande',()=>{
 const p=base();p.cues=Array.from({length:501},(_,i)=>({id:String(i),start:0,end:2,text:'a'.repeat(4000),words:[]}));assert.throws(()=>prepareFindReplace(p,opts('z','b')),/dos millones/);
});
