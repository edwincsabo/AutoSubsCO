import {createHash,randomUUID} from 'node:crypto';
import {validateProject} from './project.mjs';
import {replaceOptions,literalMatches,evaluateReplacement,REPLACE_LIMITS} from './find-replace-model.mjs';
const fingerprint=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const canonical=text=>text.replace(/\s+/gu,' ').trim();

export function prepareFindReplace(project,input,revision=0){
 const p=validateProject(project),options=replaceOptions(input),rows=[];let partialCount=0,missingTranslationCount=0,foundCount=0,unchangedCount=0,scanned=0;
 const candidates=[];
 for(let index=0;index<p.cues.length;index++){
  const cue=p.cues[index];if(options.scope==='range'){
   if(cue.end<=p.exportRange.start||cue.start>=p.exportRange.end)continue;
   if(cue.start<p.exportRange.start-.001||cue.end>p.exportRange.end+.001){partialCount++;continue;}
  }
  if(options.language!=='original'&&!cue.translations?.[options.language]){missingTranslationCount++;continue;}
  const text=options.language==='original'?cue.text:cue.translations[options.language].text;scanned+=text.length;candidates.push({cue,index,text});
 }
 if(scanned>REPLACE_LIMITS.characters)throw Error('La selección supera dos millones de caracteres. Reduce el rango para buscar y reemplazar.');
 let nextId=0;
 for(const {cue,index,text}of candidates){
  const matches=literalMatches(text,options);foundCount+=matches.length;if(foundCount>REPLACE_LIMITS.matches)throw Error('Hay más de 2000 coincidencias. Reduce el rango o precisa la búsqueda.');
  const changes=matches.filter(hit=>{if(hit.text===options.replacement){unchangedCount++;return false;}return true;}).map(hit=>({id:'match-'+nextId++,...hit}));
  if(changes.length)rows.push({cueId:cue.id,index,start:cue.start,end:cue.end,before:text,matches:changes});
 }
 return {id:randomUUID(),projectId:p.id,fingerprint:fingerprint(project),revision,options,rows,foundCount,unchangedCount,changeCount:nextId,partialCount,missingTranslationCount,searchedCues:candidates.length};
}
export function publicFindReplace(plan){if(!plan)return null;const {projectId,fingerprint,...data}=plan;return data;}
export function applyFindReplace(project,plan,id,ids){
 if(!plan||plan.id!==id||plan.projectId!==project.id||plan.fingerprint!==fingerprint(project))throw Error('El proyecto cambió después de preparar los reemplazos. Revisa otra propuesta.');
 const allowed=new Set(plan.rows.flatMap(row=>row.matches.map(hit=>hit.id)));
 if(!Array.isArray(ids)||!ids.length||ids.length>REPLACE_LIMITS.matches||new Set(ids).size!==ids.length||ids.some(value=>typeof value!=='string'||!allowed.has(value)))throw Error('Selecciona coincidencias de la propuesta para aplicar.');
 const selected=new Set(ids),p=validateProject(project),cueMap=new Map(p.cues.map(c=>[c.id,c])),now=new Date().toISOString();
 for(const row of plan.rows){
  const cue=cueMap.get(row.cueId),language=plan.options.language;
  const evaluation=evaluateReplacement(cue,language,row,plan.options.replacement,selected);if(!evaluation.count)continue;
  if(evaluation.invalid)throw Error('Subtítulo '+(row.index+1)+': '+evaluation.invalid);
  if(language==='original'){
   cue.text=evaluation.after;
   if(evaluation.timingEffect==='preserve')cue.words=evaluation.words;
   else{cue.words=[];delete cue.alignment;}
   if(evaluation.alignmentPending)cue.alignmentPending=true;
   for(const item of Object.values(cue.translations??{}))item.stale=canonical(item.sourceText)!==canonical(cue.text);
  }else{
   const translation=cue.translations[language];translation.text=evaluation.after;translation.editedAt=now;translation.editMethod='Buscar y reemplazar';
  }
 }
 return validateProject(p);
}
