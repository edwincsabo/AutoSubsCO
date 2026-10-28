export function timedChunks(cue){
 const normalize=s=>s.replace(/\s+/g,' ').trim();
 if(!cue.words?.length||normalize(cue.words.map(w=>w.text).join(' '))!==normalize(cue.text))return[{text:cue.text,wordIndex:null}];
 let cursor=0;const chunks=[];
 for(let i=0;i<cue.words.length;i++){
  const word=cue.words[i],parts=word.text.trim().split(/\s+/);let start=-1,finish=cursor;
  for(const part of parts){const at=cue.text.indexOf(part,finish);if(at<0)return[{text:cue.text,wordIndex:null}];if(start<0)start=at;finish=at+part.length;}
  if(start>cursor)chunks.push({text:cue.text.slice(cursor,start),wordIndex:null});
  chunks.push({text:cue.text.slice(start,finish),wordIndex:i,start:word.start,end:word.end});cursor=finish;
 }
 if(cursor<cue.text.length)chunks.push({text:cue.text.slice(cursor),wordIndex:null});return chunks;
}
