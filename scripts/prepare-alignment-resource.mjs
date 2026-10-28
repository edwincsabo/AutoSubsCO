import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {downloadResource} from '../src/studio-resources.mjs';
import {discoverTools} from '../src/tools.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo='XDcobra/wav2vec2-large-xlsr-53-spanish-ONNX',revision='ce8c6ded2261a6dd5b902cbbcd46d330f7e92c37';
const base=`https://huggingface.co/${repo}/resolve/${revision}/`;
if(process.argv.includes('--catalog')){
 const parts=[],files=[];
 const weight={remote:'onnx/model_int8.onnx',dest:'model.onnx',size:355016210,sha256:'1eb8a34dd7373b48b57c924db5c5a54c3bbf58f5cc8e9cf2631820e01e393244'};
 for(const item of [weight,...['vocab.json','config.json','preprocessor_config.json','tokenizer_config.json','LICENSE'].map(name=>({remote:name,dest:name}))]){
  if(!item.sha256){const r=await fetch(base+item.remote);if(!r.ok)throw Error('HTTP '+r.status);const bytes=Buffer.from(await r.arrayBuffer());item.size=bytes.length;item.sha256=createHash('sha256').update(bytes).digest('hex');if(item.dest==='LICENSE')await fs.writeFile(path.join(root,'licenses','wav2vec2-spanish-onnx.txt'),bytes);}
  parts.push({url:base+item.remote,kind:'file',folder:'',dest:item.dest,size:item.size,sha256:item.sha256});files.push({path:item.dest,size:item.size,sha256:item.sha256});
 }
 const catalog=JSON.parse(await fs.readFile(path.join(root,'src','studio-resources.json'),'utf8'));
 const resource={id:'alignment-es',name:'Alineación de texto en español',license:'Apache-2.0 — modelo Jonatas Grosman y exportación ONNX XDcobra',source:`https://huggingface.co/${repo}`,revision,language:'es',engine:'wav2vec2-ctc-int8',parts,files,size:files.reduce((n,f)=>n+f.size,0),archiveVerification:'Revisión inmutable, SHA-256 LFS del peso y SHA-256 de los archivos de configuración'};
 await fs.writeFile(path.join(root,'src','studio-resources.json'),JSON.stringify([...catalog.filter(r=>r.id!==resource.id),resource],null,2));
 console.log(JSON.stringify({catalog:true,resource:resource.id,bytes:resource.size,revision}));
}else{
 let last=-10;await downloadResource(path.join(root,'models'),'alignment-es',{tools:await discoverTools(root),progress:p=>{if(p.percent===100||p.percent-last>=10){last=p.percent;console.log(JSON.stringify(p));}}});
 const folder=path.join(root,'models','resources','alignment-es');for(const name of ['config.json','preprocessor_config.json','tokenizer_config.json','vocab.json'])console.log(name+' '+await fs.readFile(path.join(folder,name),'utf8'));
}
