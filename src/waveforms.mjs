import {waveform} from './media.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {run} from './process.mjs';
import {atomicJson} from './history.mjs';
export class WaveformPool{
 constructor(tools,folder){this.tools=tools;this.folder=folder;this.active=0;this.waiters=[];this.cache=new Map();this.controllers=new Set();}
 async acquire(){if(this.active<2){this.active++;return;}await new Promise(resolve=>this.waiters.push(resolve));}
 release(){const next=this.waiters.shift();if(next)next();else this.active--;}
 clear(){for(const controller of this.controllers)controller.abort();this.cache.clear();}
 hit(key){const p=this.cache.get(key);if(p){this.cache.delete(key);this.cache.set(key,p);}return p;}
 remember(key,promise){this.cache.set(key,promise);while(this.cache.size>128)this.cache.delete(this.cache.keys().next().value);promise.catch(()=>{if(this.cache.get(key)===promise)this.cache.delete(key);});return promise;}
 async key(media,kind){const stat=await fs.stat(media.path);return createHash('sha256').update(`${kind}:v2:${path.resolve(media.path).toLowerCase()}:${stat.size}:${stat.mtimeMs}`).digest('hex');}
 async get(projectId,media){if(!this.tools.ffmpeg)return[];const key=await this.key(media,'wave'),hit=this.hit(key);if(hit)return hit;const controller=new AbortController();this.controllers.add(controller);
  const promise=(async()=>{await this.acquire();try{if(controller.signal.aborted)throw Error('Análisis de audio cancelado.');const file=path.join(this.folder,key+'.json');try{const peaks=JSON.parse(await fs.readFile(file,'utf8'));if(Array.isArray(peaks)&&peaks.length<=900&&peaks.every(p=>Number.isFinite(p)&&p>=0&&p<=1))return peaks;}catch{}
   const peaks=await waveform(media.path,this.tools,this.folder,controller.signal);await atomicJson(file,peaks);return peaks;
  }finally{this.controllers.delete(controller);this.release();}})();return this.remember(key,promise);
 }
 async thumbnail(projectId,media){const key=await this.key(media,'thumb'),hit=this.hit(key);if(hit)return hit;const controller=new AbortController();this.controllers.add(controller);
  const promise=(async()=>{await this.acquire();try{if(controller.signal.aborted)throw Error('Miniatura cancelada.');const folder=path.join(path.dirname(this.folder),'thumbnails'),file=path.join(folder,key+'.jpg');await fs.mkdir(folder,{recursive:true});if(!await fs.stat(file).catch(()=>null))await run(this.tools.ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-y','-threads','2','-ss',String(Math.min(1,media.duration/3)),'-i',media.previewPath??media.path,'-frames:v','1','-vf','scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2','-q:v','4',file],{signal:controller.signal});return file;
  }finally{this.controllers.delete(controller);this.release();}})();return this.remember(key,promise);
 }
}
