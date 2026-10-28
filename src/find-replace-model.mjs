import {alignmentWords} from './alignment-data.mjs';
import {reliableWords} from './text-cut-model.mjs';

const graphemes=new Intl.Segmenter('es',{granularity:'grapheme'});
const wordCharacter=/[\p{L}\p{M}\p{N}_]/u;
const canonical=text=>text.replace(/\s+/gu,' ').trim();
const speechWord=text=>text.normalize('NFKC').toLocaleLowerCase('es').replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu,'');
export const REPLACE_LIMITS=Object.freeze({matches:2000,characters:2_000_000,query:200,replacement:1000});

export function replaceOptions(input={}){
 const options={scope:'range',language:'original',caseSensitive:false,wholeWord:false,ignoreAccents:false,flexibleWhitespace:true,...input};
 if(!['range','project'].includes(options.scope)||!['original','es','en','pt','fr'].includes(options.language)||typeof options.query!=='string'||!options.query.trim()||options.query.length>REPLACE_LIMITS.query||typeof options.replacement!=='string'||options.replacement.length>REPLACE_LIMITS.replacement)throw Error('Elige un texto de búsqueda de hasta 200 caracteres y un reemplazo de hasta 1000.');
 for(const key of ['caseSensitive','wholeWord','ignoreAccents','flexibleWhitespace'])if(typeof options[key]!=='boolean')throw Error('Opciones de búsqueda no válidas.');
 for(const text of [options.query,options.replacement])if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text))throw Error('La búsqueda o el reemplazo contienen caracteres de control no admitidos.');
 options.query=options.query.replace(/\r\n?/gu,'\n');options.replacement=options.replacement.replace(/\r\n?/gu,'\n');
 return options;
}

function fold(value,options){
 let result=value.normalize('NFC');
 if(!options.caseSensitive)result=result.toLocaleUpperCase('es').toLocaleLowerCase('es');
 if(options.ignoreAccents)result=result.normalize('NFD').replace(/n\u0303/gu,'ñ').replace(/N\u0303/gu,'Ñ').replace(/\p{M}/gu,'').normalize('NFC');
 return result;
}
function searchMap(text,options){
 let value='';const starts=[],ends=[];
 for(const part of graphemes.segment(text)){
  const whitespace=options.flexibleWhitespace&&/^\s+$/u.test(part.segment),next=whitespace?' ':fold(part.segment,options),end=part.index+part.segment.length;
  if(whitespace&&value.endsWith(' ')){ends[ends.length-1]=end;continue;}
  value+=next;for(let i=0;i<next.length;i++){starts.push(part.index);ends.push(end);}
 }
 return {value,starts,ends};
}
function previousCharacter(text,at){const code=text.charCodeAt(at-1);return text.slice(code>=0xdc00&&code<=0xdfff?Math.max(0,at-2):Math.max(0,at-1),at);}
function nextCharacter(text,at){return at<text.length?String.fromCodePoint(text.codePointAt(at)):'';}
export function literalMatches(text,options){
 const source=searchMap(text,options),query=searchMap(options.query,options).value;if(!query.length)throw Error('El texto de búsqueda no tiene caracteres comparables.');
 const result=[];let from=0;
 const first=Array.from(query)[0],last=Array.from(query).at(-1);
 while(from<=source.value.length-query.length){
  const at=source.value.indexOf(query,from);if(at<0)break;const finish=at+query.length,start=source.starts[at],end=source.ends[finish-1];
  const completeStart=at===0||source.starts[at-1]!==start,completeEnd=finish===source.value.length||source.ends[finish]!==end;
  const boundary=!options.wholeWord||(!wordCharacter.test(first)||!wordCharacter.test(previousCharacter(text,start)))&&(!wordCharacter.test(last)||!wordCharacter.test(nextCharacter(text,end)));
  if(completeStart&&completeEnd&&boundary){result.push({start,end,text:text.slice(start,end)});if(result.length>REPLACE_LIMITS.matches)throw Error('Hay más de 2000 coincidencias. Reduce el rango o precisa la búsqueda.');from=finish;}
  else from=at+1;
 }
 return result;
}

export function replaceSegments(before,matches,replacement,selected){
 let at=0;const parts=[];
 for(const hit of matches){if(hit.start>at)parts.push({text:before.slice(at,hit.start),changed:false});parts.push({text:selected.has(hit.id)?replacement:before.slice(hit.start,hit.end),changed:selected.has(hit.id)});at=hit.end;}
 if(at<before.length)parts.push({text:before.slice(at),changed:false});return parts;
}
export function evaluateReplacement(cue,language,row,replacement,selected){
 const hits=row.matches.filter(hit=>selected.has(hit.id)),count=hits.length;
 if(!count)return {count:0,changed:false,invalid:null,after:row.before,preview:row.before,afterLength:row.before.length};
 const maximum=language==='original'?4000:10000,afterLength=row.before.length+hits.reduce((n,hit)=>n+replacement.length-(hit.end-hit.start),0);
 if(afterLength>maximum){let preview='';for(const part of replaceSegments(row.before,row.matches,replacement,selected)){if(preview.length>=2000)break;preview+=part.text.slice(0,2000-preview.length);}return {count,changed:true,invalid:`El resultado supera ${maximum} caracteres. Desmarca coincidencias o acorta el reemplazo.`,after:null,preview:preview+'…',afterLength};}
 const after=replaceSegments(row.before,row.matches,replacement,selected).map(p=>p.text).join('');
 if(!after.trim())return {count,changed:true,invalid:'El subtítulo quedaría vacío. Desmarca coincidencias o elimínalo desde Lista.',after,preview:after,afterLength};
 const hadWords=cue.words?.length??0,newWords=language==='original'?alignmentWords(after):[];
 const preserve=language==='original'&&reliableWords(cue)&&newWords.length===hadWords&&newWords.every((word,i)=>speechWord(word)===speechWord(cue.words[i].text));
 const words=preserve?cue.words.map((word,i)=>({...word,text:newWords[i]})):[];
 const timingEffect=language!=='original'?'unchanged':preserve?'preserve':hadWords||cue.alignment?'clear':'none';
 const pending=language==='original'&&(!!cue.alignmentPending||timingEffect==='clear');
 const translationReviewCount=language==='original'?Object.values(cue.translations??{}).filter(t=>canonical(t.sourceText)!==canonical(after)).length:canonical(cue.translations[language].sourceText)!==canonical(cue.text)?1:0;
 return {count,changed:after!==row.before,invalid:null,after,preview:after,afterLength,timingEffect,preservedWords:preserve?hadWords:0,lostWords:timingEffect==='clear'?hadWords:0,words,alignmentPending:pending,translationReviewCount};
}
