import {croppedAspect} from './viewport.mjs';
import {visualEnabled} from './track-state.mjs';
import {isGraphic,graphicFadeExpression} from './graphics.mjs';
import {assetFor,clipEnd,durationOf,videoClips} from './project.mjs';
import {isMainVideo,motionExpression,propertyFrames,TRANSFORM_DEFAULTS} from './motion.mjs';
const animated=(c,p)=>propertyFrames(c,p).some(k=>k.value!==(c.transform?.[p]??TRANSFORM_DEFAULTS[p]));
const q=s=>`'${s}'`;
export function compositionGraph(p,{seeked=false,sceneDuration=null,fadeInfo=new Map()}={}){
 const lines=[],{width:W,height:H,fps}=p.sequence,duration=sceneDuration??durationOf(p),main=videoClips(p),overlays=p.timeline.clips.filter(c=>c.kind==='video'&&!isMainVideo(c)).sort((a,b)=>Number(a.trackId.split('-')[1])-Number(b.trackId.split('-')[1])||a.timelineStart-b.timelineStart),ordered=[...main,...overlays].filter(c=>visualEnabled(p,c));
 lines.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${duration},settb=AVTB[vscene0]`);let previous='vscene0';
 ordered.forEach((c,order)=>{
  const i=p.timeline.clips.indexOf(c),m=assetFor(p,c),primary=isMainVideo(c),incoming=primary&&main.indexOf(c)>0&&c.transitionIn.type!=='none',local='t',globalClock=`(t-${c.timelineStart})`,scale=motionExpression(c,'scale',local),globalScale=motionExpression(c,'scale',globalClock),w=`max(2,trunc(${W}*(${scale})/2)*2)`,h=primary?`max(2,trunc(${H}*(${scale})/2)*2)`:`max(2,trunc(${W}*(${scale})*${croppedAspect(m,c)}/2)*2)`,gw=`max(2,trunc(${W}*(${globalScale})/2)*2)`,gh=primary?`max(2,trunc(${H}*(${globalScale})/2)*2)`:`max(2,trunc(${W}*(${globalScale})*${croppedAspect(m,c)}/2)*2)`,hasTransform=Object.keys(TRANSFORM_DEFAULTS).some(k=>animated(c,k)||(c.transform[k]??TRANSFORM_DEFAULTS[k])!==TRANSFORM_DEFAULTS[k]);
  let source=`[${i}:v:0]trim=start=${isGraphic(m)||seeked?0:c.sourceIn}:end=${isGraphic(m)||seeked?c.sourceOut-c.sourceIn:c.sourceOut},setpts=PTS-STARTPTS,fps=${fps}`;
  const crop=c.viewport;if(crop&&(crop.left||crop.top||crop.right||crop.bottom))source+=`,crop=w='max(2,trunc(iw*${1-(crop.left+crop.right)/100}/2)*2)':h='max(2,trunc(ih*${1-(crop.top+crop.bottom)/100}/2)*2)':x='iw*${crop.left/100}':y='ih*${crop.top/100}'`;
  if(primary&&crop?.fit==='cover')source+=`,scale=${W}:${H}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${W}:${H},setsar=1`;
  else if(primary)source+=`,scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
  if(!primary||hasTransform)source+=`,scale=w=${q(w)}:h=${q(h)}:eval=frame,setsar=1`;
  const needsAlpha=!primary||hasTransform||incoming; if(needsAlpha)source+=',format=rgba';
  const rotate=animated(c,'rotation')||c.transform.rotation!==0,fixedCanvas=rotate||animated(c,'scale');let boxW=null,boxH=null;
  if(fixedCanvas){const maxScale=Math.max(c.transform.scale,...c.keyframes.filter(k=>k.scale!==undefined).map(k=>k.scale)),maxW=Math.max(2,Math.trunc(W*maxScale/2)*2),maxH=Math.max(2,Math.trunc((primary?H*maxScale:W*maxScale*croppedAspect(m,c))/2)*2);boxW=rotate?Math.ceil(Math.hypot(maxW,maxH)/2)*2:maxW;boxH=rotate?boxW:maxH;if(boxW>8192||boxH>8192)throw new Error('La escala y el giro producen una capa demasiado grande. Reduce la escala o resolución.');source+=`,pad=w=${boxW}:h=${boxH}:x=(ow-iw)/2:y=(oh-ih)/2:color=black@0:eval=frame`;}

  const opacity=`(${motionExpression(c,'opacity','T')})*(${graphicFadeExpression({...c,sourceOut:c.sourceIn+(fadeInfo.get(c.id)?.duration??(c.sourceOut-c.sourceIn))},`(T+${fadeInfo.get(c.id)?.offset??0})`)})`,wipe=incoming&&c.transitionIn.type==='wipeleft';
  const localWidth=`(${motionExpression(c,'scale','T')})*${W}`,wipeEdge=boxW?`(${boxW}-(${localWidth}))/2+(${localWidth})*min(1,T/${c.transitionIn.duration})`:`W*min(1,T/${c.transitionIn.duration})`;
  if(animated(c,'opacity')||wipe||c.graphicFade?.in||c.graphicFade?.out){const alpha=`alpha(X,Y)*(${opacity})${wipe?`*lte(X,${wipeEdge})`:''}`;source+=`,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a=${q(alpha)}`;}else if(c.transform.opacity!==1)source+=`,colorchannelmixer=aa=${c.transform.opacity}`;
  if(incoming&&['fade','dissolve'].includes(c.transitionIn.type))source+=`,fade=t=in:st=0:d=${c.transitionIn.duration}:alpha=1`;
  if(rotate)source+=`,rotate=angle=${q(`(${motionExpression(c,'rotation')})*PI/180`)}:ow=iw:oh=ih:c=none`;
  source+=`,settb=AVTB,setpts=PTS+${c.timelineStart}/TB[vclip${order}]`;lines.push(source);
  let x=`${W}*(${motionExpression(c,'x',globalClock)})/100`,y=`${H}*(${motionExpression(c,'y',globalClock)})/100`;
  if(boxW){x+=`-(${boxW}-(${gw}))/2`;y+=`-(${boxH}-(${gh}))/2`;}
  if(incoming&&c.transitionIn.type==='slideright')x+=`-${W}*(1-min(1,max(0,${globalClock}/${c.transitionIn.duration})))`;
  const label=`vscene${order+1}`;lines.push(`[${previous}][vclip${order}]overlay=x=${q(x)}:y=${q(y)}:enable=${q(`gte(t,${c.timelineStart})*lt(t,${clipEnd(c)})`)}:eof_action=repeat:repeatlast=1:format=yuv420[${label}]`);previous=label;
 });
 return{lines,output:previous};
}
