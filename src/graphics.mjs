// Datos compartidos por el editor, el visor y el render; no depende de Electron.
export const isGraphic=m=>['image','title'].includes(m?.type);
export const STILL_DURATION=604800;
export const TITLE_DEFAULTS=Object.freeze({text:'Tu título',font:'Arial',fontSize:72,bold:true,color:'#ffffff',align:'center',background:false,backgroundColor:'#172033',outlineWidth:0,outlineColor:'#111827'});
export function validateTitle(input){
 const t={...TITLE_DEFAULTS,...input};
 if(typeof t.text!=='string'||!t.text.trim()||t.text.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(t.text))throw Error('Escribe un título de 1 a 500 caracteres.');
 if(!['Arial','Calibri','Verdana','Georgia','Impact'].includes(t.font)||!['left','center','right'].includes(t.align))throw Error('Estilo de título no permitido.');
 if(!Number.isFinite(t.fontSize)||t.fontSize<24||t.fontSize>180||!Number.isFinite(t.outlineWidth)||t.outlineWidth<0||t.outlineWidth>8)throw Error('Tamaño o contorno del título fuera de rango.');
 for(const k of ['color','backgroundColor','outlineColor'])if(!/^#[\da-f]{6}$/i.test(t[k]))throw Error('Color de título inválido.');
 if(typeof t.bold!=='boolean'||typeof t.background!=='boolean')throw Error('Apariencia de título inválida.');
 return Object.fromEntries(Object.keys(TITLE_DEFAULTS).map(k=>[k,t[k]]));
}
export function validateGraphicAsset(m){
 if(m.type!==undefined&&!['image','title'].includes(m.type))throw Error('Tipo de recurso gráfico inválido.');
 if(!isGraphic(m))return;
 if(!m.hasVideo||m.hasAudio||m.width<1||m.height<1||m.width*m.height>40000000||m.duration!==STILL_DURATION)throw Error('Recurso gráfico inválido.');
 if(m.type==='title'){if(!m.title||typeof m.title!=='object'||Array.isArray(m.title))throw Error('Falta el contenido del título.');m.title=validateTitle(m.title);}
}
export function validateGraphicClip(c,m){
 if(c.graphicFade!==undefined){if(!isGraphic(m))throw Error('El fundido gráfico requiere una imagen o título.');for(const k of ['in','out'])if(!Number.isFinite(c.graphicFade[k])||c.graphicFade[k]<0||c.graphicFade[k]>3)throw Error('Fundido fuera de rango (0 a 3 segundos).');}
}
export function graphicFadeExpression(c,clock='t'){
 const duration=c.sourceOut-c.sourceIn,a=Math.min(c.graphicFade?.in??0,duration/2),b=Math.min(c.graphicFade?.out??0,duration/2);
 return `${a?`min(1,max(0,(${clock})/${a}))`:'1'}*${b?`min(1,max(0,(${duration}-(${clock}))/${b}))`:'1'}`;
}
export function graphicOpacity(c,time){const d=c.sourceOut-c.sourceIn,a=Math.min(c.graphicFade?.in??0,d/2),b=Math.min(c.graphicFade?.out??0,d/2);return(a?Math.min(1,Math.max(0,time/a)):1)*(b?Math.min(1,Math.max(0,(d-time)/b)):1);}
