import {waveform} from './media.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {run} from './process.mjs';
export class WaveformPool{
 constructor(tools,folder){this.tools=tools;this.folder=folder;this.active=0;this.waiters=[];this.cache=new Map();this.controllers=new Set();}
 async acquire(){if(this.active<2){this.active++;return;}await new Promise(resolve=>this.waiters.push(resolve));}
 release(){const next=this.waiters.shift();if(next)next();else this.active--;}
 clear(){for(const controller of this.controllers)controller.abort();this.cache.clear();}
 get(projectId,media){const key=`${projectId}:${media.id}:${media.path}:${media.size}`;if(this.cache.has(key))return this.cache.get(key);const controller=new AbortController();this.controllers.add(controller);const promise=(async()=>{await this.acquire();try{if(controller.signal.aborted)throw new Error('Análisis de audio cancelado.');return await waveform(media.path,this.tools,this.folder,controller.signal);}finally{this.controllers.delete(controller);this.release();}})();this.cache.set(key,promise);promise.catch(()=>{if(this.cache.get(key)===promise)this.cache.delete(key);});return promise;}
 thumbnail(projectId,media){const key=`thumb:${projectId}:${media.id}:${media.path}:${media.size}`;if(this.cache.has(key))return this.cache.get(key);const controller=new AbortController();this.controllers.add(controller);const promise=(async()=>{await this.acquire();try{if(controller.signal.aborted)throw new Error('Miniatura cancelada.');const folder=path.join(path.dirname(this.folder),'thumbnails'),file=path.join(folder,createHash('sha256').update(key).digest('hex')+'.jpg');await fs.mkdir(folder,{recursive:true});if(!await fs.stat(file).catch(()=>null))await run(this.tools.ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-y','-threads','2','-ss',String(Math.min(1,media.duration/3)),'-i',media.previewPath??media.path,'-frames:v','1','-vf','scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2','-q:v','4',file],{signal:controller.signal});return file;}finally{this.controllers.delete(controller);this.release();}})();this.cache.set(key,promise);promise.catch(()=>{if(this.cache.get(key)===promise)this.cache.delete(key);});return promise;}
}
