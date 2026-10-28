import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {discoverTools} from '../src/tools.mjs';
import {run} from '../src/process.mjs';
import {probe} from '../src/media.mjs';
import {createProject,addMedia,editClip} from '../src/project.mjs';
import {addKeyframe,setVisual} from '../src/studio-project.mjs';
import {exportSequence} from '../src/sequence.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'test-results','v6'),tools=await discoverTools(root);await fs.mkdir(out,{recursive:true});
const red=await probe(path.join(out,'red.mp4'),tools),blue=await probe(path.join(out,'blue.mp4'),tools),green=await probe(path.join(out,'green.mp4'),tools);
let serial=0;
async function pixel(video,time,x,y){const file=path.join(out,`motion-pixel-${serial++}.rgb`);await run(tools.ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-y','-ss',String(time),'-i',video,'-vf',`format=rgb24,crop=1:1:${x}:${y}`,'-frames:v','1','-f','rawvideo',file]);return[...await fs.readFile(file)];}
let p=createProject(red);p=addMedia(p,green,{layer:true});const layer=p.timeline.clips.at(-1);p=setVisual(p,layer.id,{transform:{x:20,y:20,scale:.25,rotation:0,opacity:0}});p=addKeyframe(p,layer.id,0,{x:20,y:20,scale:.25,rotation:0,opacity:0});p=addKeyframe(p,layer.id,1,{x:40,y:20,scale:.5,rotation:90,opacity:1});
const animated=path.join(out,'motion-properties.mp4');await exportSequence(p,animated,{tools,jobsRoot:path.join(out,'jobs')});const halfway=await pixel(animated,.5,156,70),rotated=await pixel(animated,1.5,208,140),outside=await pixel(animated,1.5,140,80);assert.ok(halfway[0]>60&&halfway[1]>60,JSON.stringify({halfway}));assert.ok(rotated[1]>180&&rotated[0]<50,JSON.stringify({rotated}));assert.ok(outside[0]>180&&outside[1]<50,JSON.stringify({outside}));
const transitions={};
for(const type of ['wipeleft','slideright']){let sequence=addMedia(createProject(red),blue);sequence=editClip(sequence,sequence.timeline.clips[1].id,{transitionIn:{type,duration:.5}});const file=path.join(out,`transition-${type}.mp4`);await exportSequence(sequence,file,{tools,jobsRoot:path.join(out,'jobs')});const left=await pixel(file,1.75,40,90),right=await pixel(file,1.75,280,90),after=await pixel(file,2.2,160,90);assert.ok(left[2]>180&&left[0]<40,JSON.stringify({type,left}));assert.ok(right[0]>180&&right[2]<40,JSON.stringify({type,right}));assert.ok(after[2]>180&&after[0]<40);transitions[type]={left,right,after};}
const report={passed:true,animatedScale:true,animatedRotation:true,animatedOpacity:true,animatedPosition:true,halfway,rotated,outside,transitions};await fs.writeFile(path.join(out,'motion-render-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
