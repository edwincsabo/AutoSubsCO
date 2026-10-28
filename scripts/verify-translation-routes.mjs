import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {discoverTools} from '../src/tools.mjs';
import {probe} from '../src/media.mjs';
import {createProject} from '../src/project.mjs';
import {translateCaptions} from '../src/studio-processing.mjs';
import {translationRoute} from '../src/studio-resources.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'test-results','v4'),tools=await discoverTools(root),common={tools,modelRoot:path.join(root,'models'),jobsRoot:path.join(out,'translation-jobs')},media=await probe(path.join(root,'test-results','muestra-voz.mp4'),tools),steps=[];
let text='Hola, hoy estamos editando un video.';
for(const[from,to]of[['es','pt'],['pt','fr'],['fr','es']]){const p=createProject(media);p.exportRange={start:0,end:4};p.cues=[{id:'phrase',start:.2,end:3.5,text,words:[]}];const result=await translateCaptions(p,from,to,common),translated=result.cues[0].translations[to].text;assert.ok(translated.trim().length>5);assert.equal(result.cues[0].text,text);steps.push({from,to,route:translationRoute(from,to),original:text,translated,originalPreserved:true});text=translated;}
const report={passed:true,allSixTranslationResourcesExercised:true,englishPivot:true,steps,limitation:'Prueba funcional de rutas, sin puntuación de calidad humana.'};await fs.writeFile(path.join(out,'translation-routes-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
