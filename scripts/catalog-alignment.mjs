import fs from 'node:fs/promises';
const repos=['onnx-community/wav2vec2-large-xlsr-53-spanish','Xenova/wav2vec2-large-xlsr-53-spanish','XDcobra/wav2vec2-large-xlsr-53-spanish-ONNX'];
for(const repo of repos){
 try{
  const r=await fetch('https://huggingface.co/api/models/'+repo+'?blobs=true',{signal:AbortSignal.timeout(20000)});
  if(!r.ok){console.log(JSON.stringify({repo,status:r.status}));continue;}
  const m=await r.json();
  const files=(m.siblings??[]).filter(f=>/int8|quantized|vocab.json|config.json|LICENSE|README/.test(f.rfilename));
  const metadata={repo,revision:m.sha,license:m.cardData?.license,files};
  await fs.mkdir('evidence',{recursive:true});await fs.writeFile('evidence/alignment-model-catalog.json',JSON.stringify(metadata,null,2));
  console.log(JSON.stringify(metadata));
 }catch(e){console.log(JSON.stringify({repo,error:e.message}));}
}
