export const alignmentCanonical=text=>text.replace(/\s+/gu,' ').trim();
export function alignmentWords(text){
 const result=[];let prefix=[];
 for(const part of text.match(/\S+/gu)??[]){
  if(/[\p{L}\p{N}]/u.test(part)){result.push([...prefix,part].join(' '));prefix=[];}
  else if(result.length)result[result.length-1]+=' '+part;
  else prefix.push(part);
 }
 return result;
}
export function validateAlignmentEvidence(cue){
 const a=cue.alignment;if(a===undefined)return;
 if(!a||a.method!=='wav2vec2-ctc-viterbi'||a.modelId!=='alignment-es'||a.language!=='es'||typeof a.modelRevision!=='string'||!/^[a-f0-9]{40}$/i.test(a.modelRevision)||typeof a.sourceText!=='string'||a.sourceText.length>4000||typeof a.acceptedAt!=='string'||!Number.isFinite(Date.parse(a.acceptedAt))||!['CPUExecutionProvider','DmlExecutionProvider'].includes(a.provider)||!['cpu','gpu'].includes(a.requestedAcceleration))throw Error('Datos de alineación no válidos.');
 for(const name of ['scoreMean','scoreMinWord','agreement'])if(!Number.isFinite(a[name])||a[name]<0||a[name]>1)throw Error('Indicador de alineación fuera de rango.');
}
