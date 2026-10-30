import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateProject} from './project.mjs';
export async function atomicJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(value,null,2));await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}}
export class ProjectHistory{
 constructor({maxBytes=32*1024*1024}={}){this.maxBytes=maxBytes;this.past=[];this.future=[];this.lastGroup=null;this.lastAt=0;}
 reset(){this.past=[];this.future=[];this.lastGroup=null;}
 push(current,next,{group=null,label='Edición'}={}){const valid=validateProject(next);if(current&&JSON.stringify(current)!==JSON.stringify(valid)){this.future=[];if(!group||group!==this.lastGroup||Date.now()-this.lastAt>1500){this.past.push({project:structuredClone(current),label,bytes:JSON.stringify(current).length*2});this.trim();}this.future=[];this.lastGroup=group;this.lastAt=Date.now();}return valid;}
 undo(current){const v=this.past.pop();if(!v)return current;this.future.push({project:structuredClone(current),label:v.label,bytes:JSON.stringify(current).length*2});this.lastGroup=null;this.trim();return validateProject(v.project);}
 redo(current){const v=this.future.pop();if(!v)return current;this.past.push({project:structuredClone(current),label:v.label,bytes:JSON.stringify(current).length*2});this.lastGroup=null;return validateProject(v.project);}
 size(){return [...this.past,...this.future].reduce((n,r)=>n+(r.bytes??JSON.stringify(r.project).length*2),0);}
 trim(){while(this.past.length+this.future.length>1&&(this.past.length+this.future.length>60||this.size()>this.maxBytes)){if(this.past.length)this.past.shift();else this.future.shift();}}
 state(){return{memoryBytes:this.size(),limitBytes:this.maxBytes,canUndo:!!this.past.length,canRedo:!!this.future.length,undoLabel:this.past.at(-1)?.label??null,redoLabel:this.future.at(-1)?.label??null};}
}
