import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateProject} from './project.mjs';
export async function atomicJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(value,null,2));await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}}
export class ProjectHistory{
 constructor(){this.past=[];this.future=[];this.lastGroup=null;this.lastAt=0;}
 reset(){this.past=[];this.future=[];this.lastGroup=null;}
 push(current,next,{group=null,label='Edición'}={}){const valid=validateProject(next);if(current&&JSON.stringify(current)!==JSON.stringify(valid)){if(!group||group!==this.lastGroup||Date.now()-this.lastAt>1500){this.past.push({project:structuredClone(current),label});if(this.past.length>60)this.past.shift();}this.future=[];this.lastGroup=group;this.lastAt=Date.now();}return valid;}
 undo(current){const v=this.past.pop();if(!v)return current;this.future.push({project:structuredClone(current),label:v.label});this.lastGroup=null;return validateProject(v.project);}
 redo(current){const v=this.future.pop();if(!v)return current;this.past.push({project:structuredClone(current),label:v.label});this.lastGroup=null;return validateProject(v.project);}
 state(){return{canUndo:!!this.past.length,canRedo:!!this.future.length,undoLabel:this.past.at(-1)?.label??null,redoLabel:this.future.at(-1)?.label??null};}
}
