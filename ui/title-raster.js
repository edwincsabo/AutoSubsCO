import {validateTitle} from '../src/graphics.mjs';
export function titleRaster(input){
 const title=validateTitle(input),canvas=document.createElement('canvas');canvas.width=1000;let ctx=canvas.getContext('2d');
 const font=`${title.bold?'bold ':''}${title.fontSize}px "${title.font}"`,pad=40,available=920,lines=[];ctx.font=font;
 for(const paragraph of title.text.replaceAll('\r','').split('\n')){
  let line='';for(const word of paragraph.split(/\s+/u).filter(Boolean)){
   if(line&&ctx.measureText(line+' '+word).width>available){lines.push(line);line='';}
   for(const character of word){if(ctx.measureText(line+character).width>available){lines.push(line);line='';}line+=character;}
   line+=' ';
  }lines.push(line.trimEnd());
 }
 const leading=Math.ceil(title.fontSize*1.35);canvas.height=pad*2+Math.max(1,lines.length)*leading;
 if(canvas.height>2400)throw Error('El título ocupa demasiado espacio. Reduce el texto o el tamaño.');
 ctx=canvas.getContext('2d');ctx.font=font;ctx.textBaseline='middle';ctx.textAlign=title.align;ctx.lineJoin='round';
 if(title.background){ctx.fillStyle=title.backgroundColor;ctx.fillRect(0,0,canvas.width,canvas.height);}
 const x=title.align==='left'?pad:title.align==='right'?canvas.width-pad:canvas.width/2;
 lines.forEach((line,i)=>{const y=pad+leading*(i+.5);if(title.outlineWidth){ctx.strokeStyle=title.outlineColor;ctx.lineWidth=title.outlineWidth*2;ctx.strokeText(line,x,y);}ctx.fillStyle=title.color;ctx.fillText(line,x,y);});
 return {title,canvas,png:canvas.toDataURL('image/png')};
}
