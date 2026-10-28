import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {discoverTools} from '../src/tools.mjs';
import {run} from '../src/process.mjs';
import {probe} from '../src/media.mjs';
import {createProject,addMedia,editClip,validateProject,durationOf} from '../src/project.mjs';
import {addKeyframe,setVisual} from '../src/studio-project.mjs';
import {exportSequence} from '../src/sequence.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'test-results','v6'),tools=await discoverTools(root);await fs.mkdir(out,{recursive:true});
for(const[color,name]of[['red','red'],['blue','blue'],['lime','green']])await run(tools.ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-y','-f','lavfi','-i',`color=c=${color}:s=320x180:r=30:d=2`,'-c:v','libx264','-pix_fmt','yuv420p',path.join(out,name+'.mp4')]);
let p=createProject(await probe(path.join(out,'red.mp4'),tools));p=addMedia(p,await probe(path.join(out,'blue.mp4'),tools));const second=p.timeline.clips[1];p=editClip(p,second.id,{transitionIn:{type:'fade',duration:.5}});assert.equal(durationOf(p),3.5);p=addMedia(p,await probe(path.join(out,'green.mp4'),tools),{layer:true});const overlay=p.timeline.clips.at(-1);p=setVisual(p,overlay.id,{transform:{...overlay.transform,x:60,y:10,scale:.25,rotation:0,opacity:1}});p=addKeyframe(p,overlay.id,0,{x:60});p=addKeyframe(p,overlay.id,2,{x:10});
const dest=path.join(out,'composition.mp4');await exportSequence(p,dest,{tools,jobsRoot:path.join(out,'jobs')});const info=await probe(dest,tools);assert.ok(Math.abs(info.duration-3.5)<.08);
async function pixel(time,x,y){const file=path.join(out,`pixel-${time}-${x}-${y}.rgb`);await run(tools.ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-y','-ss',String(time),'-i',dest,'-vf',`format=rgb24,crop=1:1:${x}:${y}`,'-frames:v','1','-f','rawvideo',file]);return[...await fs.readFile(file)];}
const before=await pixel(.5,10,160),during=await pixel(1.75,10,160),after=await pixel(3,10,160),layer=await pixel(.5,170,35);assert.ok(before[0]>180&&before[2]<40);assert.ok(during[0]>40&&during[2]>40);assert.ok(after[2]>180&&after[0]<40);assert.ok(layer[1]>150&&layer[0]<80);
await run(tools.ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-y','-ss','0.5','-i',dest,'-frames:v','1',path.join(out,'composition.png')]);await fs.writeFile(path.join(out,'composition.autosubsco.json'),JSON.stringify(p,null,2));
const report={passed:true,layer:true,keyframePosition:true,crossfade:true,duration:info.duration,dimensions:[info.width,info.height],pixels:{before,during,after,layer}};await fs.writeFile(path.join(out,'render-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
