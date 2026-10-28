import {randomUUID} from 'node:crypto';
import {validateProject,createProject,addMedia,durationOf,assetFor} from './project.mjs';
import {isGraphic} from './graphics.mjs';
import {editPrecisionClip,moveSelection} from './precision.mjs';
export function insertGraphic(project,media,{position=0,duration=5,role='image'}={}){
 if(!isGraphic(media))throw Error('Selecciona un recurso gráfico.');
 if(!Number.isFinite(position)||position<0||!Number.isFinite(duration)||duration<.05||duration>3600)throw Error('Posición o duración gráfica inválida (hasta una hora por inserción).');
 const hadProject=!!project,n=hadProject?addMedia(project,media,{layer:true}):createProject(media),c=hadProject?n.timeline.clips.at(-1):n.timeline.clips[0];
 c.timelineStart=hadProject?position:0;c.sourceOut=duration;c.graphicFade={in:0,out:0};
 c.transform=role==='logo'&&hadProject?{x:76,y:5,scale:.18,rotation:0,opacity:1}:media.type==='title'&&hadProject?{x:10,y:12,scale:.8,rotation:0,opacity:1}:{x:0,y:0,scale:1,rotation:0,opacity:1};
 if(!hadProject&&media.type==='title')n.sequence={preset:'horizontal',width:1920,height:1080,fps:30};
 n.exportRange={start:0,end:durationOf(n)};return validateProject(n);
}
export function editGraphic(project,id,{position,duration,fadeIn,fadeOut}){
 const c=project.timeline.clips.find(c=>c.id===id);if(!c||!isGraphic(assetFor(project,c)))throw Error('Selecciona una imagen o título.');
 if(!Number.isFinite(position)||!Number.isFinite(duration)||position<0||duration<.05||duration>3600)throw Error('Posición o duración gráfica inválida.');
 if(c.trackId==='video-1'&&Math.abs(position-c.timelineStart)>.00001)throw Error('Mueve los elementos de V1 con las herramientas de montaje.');
 let n=editPrecisionClip(project,id,{sourceOut:c.sourceIn+duration});
 if(Math.abs(position-c.timelineStart)>.00001)n=moveSelection(n,[id],position-c.timelineStart);
 n.timeline.clips.find(c=>c.id===id).graphicFade={in:fadeIn,out:fadeOut};return validateProject(n);
}
export function replaceTitle(project,id,media){
 const n=validateProject(project),c=n.timeline.clips.find(c=>c.id===id);if(!c||assetFor(n,c)?.type!=='title'||media.type!=='title')throw Error('Selecciona un título.');
 // Cada edición crea un recurso inmutable: deshacer y otras copias conservan su contenido.
 const previous=c.mediaId,next={...media,id:media.id??randomUUID()};c.mediaId=next.id;
 // El historial conserva el documento anterior y su PNG. No acumular variantes sin uso en la biblioteca actual.
 if(!n.timeline.clips.some(c=>c.mediaId===previous))n.assets=n.assets.filter(m=>m.id!==previous);
 n.assets.push(next);return validateProject(n);
}
