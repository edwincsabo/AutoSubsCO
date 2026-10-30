import {randomUUID} from 'node:crypto';
import {validateProject,durationOf,setPreset} from './project.mjs';
export const EXPORT_PROFILES=Object.freeze([
 {id:'source',name:'Formato del proyecto · equilibrado',preset:null,fps:null,quality:'balanced'},
 {id:'vertical',name:'Vertical 1080 × 1920',preset:'vertical',fps:30,quality:'balanced'},
 {id:'horizontal',name:'Horizontal 1920 × 1080',preset:'horizontal',fps:30,quality:'high'},
 {id:'square',name:'Cuadrado 1080 × 1080',preset:'square',fps:30,quality:'balanced'}
]);
export const QUALITY={draft:{crf:28,audio:'128k',label:'Borrador'},balanced:{crf:20,audio:'192k',label:'Equilibrada'},high:{crf:16,audio:'256k',label:'Alta'}};
export function validateProfile(p){if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||!Object.hasOwn(QUALITY,p.quality)||p.preset!==null&&!['source','vertical','horizontal','square'].includes(p.preset)||p.fps!==null&&![24,25,30,50,60].includes(p.fps))throw Error('Perfil de exportación inválido.');return{id:typeof p.id==='string'?p.id:randomUUID(),name:p.name.trim(),preset:p.preset,fps:p.fps,quality:p.quality};}
export function applyProfile(project,profile){const p=validateProfile(profile);return p.preset?setPreset(project,p.preset,p.fps??project.sequence.fps):validateProject(project);}
export function validateDeliveryRanges(p){p.deliveryRanges??=[];if(!Array.isArray(p.deliveryRanges)||p.deliveryRanges.length>20)throw Error('Se admiten veinte rangos guardados.');const ids=new Set();for(const r of p.deliveryRanges){if(typeof r.id!=='string'||ids.has(r.id)||typeof r.name!=='string'||!r.name.trim()||r.name.length>80||!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.start<0||r.end-r.start<.05||r.end>durationOf(p)+.025)throw Error('Rango de entrega inválido. Ajusta sus límites.');ids.add(r.id);}}
export function saveDeliveryRange(project,name){const n=validateProject(project);n.deliveryRanges.push({id:randomUUID(),name,start:n.exportRange.start,end:n.exportRange.end});return validateProject(n);}
