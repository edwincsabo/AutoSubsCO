"""Herramientas de estudio locales de AutoSubsCO. Nunca descargan modelos."""
import argparse,json,os,pathlib,re,sys,time,wave
sys.dont_write_bytecode=True
os.environ['HF_HUB_OFFLINE']='1'
import numpy as np
def emit(p): print(json.dumps(p,ensure_ascii=False),flush=True)
def read_wav(file):
    with wave.open(file,'rb') as w:
        if w.getsampwidth()!=2: raise ValueError('Se requiere PCM de 16 bits')
        rate=w.getframerate();channels=w.getnchannels();data=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float32).reshape(-1,channels).T/32768
    return np.ascontiguousarray(data),rate
def write_wav(file,data,rate):
    if not np.all(np.isfinite(data)): raise ValueError('El motor produjo audio no finito')
    values=np.ascontiguousarray(np.clip(data.T,-1,1)*32767,dtype='<i2')
    with wave.open(file,'wb') as w:w.setnchannels(data.shape[0]);w.setsampwidth(2);w.setframerate(rate);w.writeframes(values.tobytes())
def separate(args):
    import sherpa_onnx as sh
    base=pathlib.Path(args.model)
    config=sh.OfflineSourceSeparationConfig(model=sh.OfflineSourceSeparationModelConfig(spleeter=sh.OfflineSourceSeparationSpleeterModelConfig(vocals=str(base/'vocals.fp16.onnx'),accompaniment=str(base/'accompaniment.fp16.onnx')),num_threads=4,provider='cpu',debug=False))
    if not config.validate(): raise ValueError('Modelo de separación incompleto')
    model=sh.OfflineSourceSeparation(config);samples,rate=read_wav(args.audio)
    if rate!=44100 or samples.shape[0]!=2: raise ValueError('La separación requiere estéreo a 44,1 kHz')
    target=pathlib.Path(args.output);target.mkdir(parents=True,exist_ok=True)
    # Ventanas con solapamiento y fundido para limitar memoria sin eliminar tiempo.
    length=samples.shape[1];chunk=20*rate;overlap=rate;step=chunk-overlap
    vocals=np.zeros_like(samples);music=np.zeros_like(samples);weight=np.zeros(length,dtype=np.float32)
    for at in range(0,length,step):
        end=min(length,at+chunk);batch=np.ascontiguousarray(samples[:,at:end]);out=model.process(sample_rate=rate,samples=batch)
        if out.sample_rate!=rate or len(out.stems)!=2: raise ValueError('Salida de separación no compatible')
        n=end-at;v=np.asarray(out.stems[0].data)[:,:n];m=np.asarray(out.stems[1].data)[:,:n]
        if v.shape[1]<n:v=np.pad(v,((0,0),(0,n-v.shape[1])))
        if m.shape[1]<n:m=np.pad(m,((0,0),(0,n-m.shape[1])))
        fade=np.ones(n,dtype=np.float32);edge=min(overlap,n)
        if at:fade[:edge]=np.linspace(0,1,edge,dtype=np.float32)
        if end<length:fade[-edge:]=np.linspace(1,0,edge,dtype=np.float32)
        vocals[:,at:end]+=v*fade;music[:,at:end]+=m*fade;weight[at:end]+=fade
        emit({'progress':min(98,end/length*100),'message':'Separando voz y acompañamiento'})
        if end==length:break
    vocals/=np.maximum(weight,1e-6);music/=np.maximum(weight,1e-6)
    # Como la escritura PCM del ejemplo upstream, se limitan los picos al escribir.
    # Normalizar toda la pista por un pico aislado de reconstrucción oculta la voz.
    limited=int(np.count_nonzero(np.abs(vocals)>1)+np.count_nonzero(np.abs(music)>1))
    write_wav(str(target/'vocals.wav'),vocals,rate);write_wav(str(target/'music.wav'),music,rate)
    return {'samples':length,'sampleRate':rate,'gain':1.0,'limitedSamples':limited,'method':'Spleeter 2 stems fp16 / CPU','files':['vocals.wav','music.wav']}
def speakers(args):
    import sherpa_onnx as sh
    base=pathlib.Path(args.model);samples,rate=read_wav(args.audio)
    if rate!=16000:raise ValueError('Se requiere audio mono a 16 kHz')
    config=sh.OfflineSpeakerDiarizationConfig(segmentation=sh.OfflineSpeakerSegmentationModelConfig(pyannote=sh.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(base/'segmentation'/'model.onnx'),window_shift_ratio=.1),num_threads=4,provider='cpu'),embedding=sh.SpeakerEmbeddingExtractorConfig(model=str(base/'embedding.onnx'),num_threads=4,provider='cpu'),clustering=sh.FastClusteringConfig(num_clusters=args.speakers if args.speakers>0 else -1,threshold=.5),min_duration_on=.25,min_duration_off=.4)
    if not config.validate():raise ValueError('Modelos de hablantes incompletos')
    model=sh.OfflineSpeakerDiarization(config)
    result=model.process(np.ascontiguousarray(samples[0]),callback=lambda done,total:(emit({'progress':min(98,done/max(1,total)*100),'message':'Analizando turnos de voz'}) or 0)).sort_by_start_time()
    return {'segments':[{'start':float(r.start),'end':float(r.end),'speaker':int(r.speaker)} for r in result],'method':'Pyannote segmentation 3.0 + WeSpeaker ResNet34-LM / CPU'}
class Tokenizer:
    def __init__(self,folder):
        self.base=pathlib.Path(folder);self.meta=json.loads((self.base/'metadata.json').read_text(encoding='utf-8'))
        if (self.base/'sentencepiece.model').exists():
            import sentencepiece
            self.spm=sentencepiece.SentencePieceProcessor(model_file=str(self.base/'sentencepiece.model'));self.bpe=None
        else:
            from sacremoses import MosesTokenizer,MosesDetokenizer,MosesPunctNormalizer
            from subword_nmt.apply_bpe import BPE
            self.spm=None;self.tokenizer=MosesTokenizer(lang=self.meta['from_code']);self.detokenizer=MosesDetokenizer(lang=self.meta['to_code']);self.normalizer=MosesPunctNormalizer(lang=self.meta['from_code'])
            with open(self.base/'bpe.model',encoding='utf-8') as f:self.bpe=BPE(f)
    def encode(self,text):
        if self.spm:return self.spm.encode(text,out_type=str)
        return self.bpe.segment_tokens(' '.join(self.tokenizer.tokenize(self.normalizer.normalize(text))).strip().split(' '))
    def decode(self,tokens):
        if self.spm:return self.spm.decode_pieces(tokens).replace('▁',' ').replace('_',' ')
        return self.detokenizer.detokenize(' '.join(tokens).replace('@@ ','').split(' '))
def translate(args):
    import ctranslate2
    payload=json.loads(pathlib.Path(args.input).read_text(encoding='utf-8'));rows=payload['rows'];routes=payload['route'];values=[r['text'] for r in rows];chunked=False
    for route_index,folder in enumerate(routes):
        tokenizer=Tokenizer(folder);model=ctranslate2.Translator(str(pathlib.Path(folder)/'model'),device='cpu',compute_type='int8',inter_threads=1,intra_threads=4)
        next_values=[]
        for i,text in enumerate(values):
            tokens=tokenizer.encode(re.sub(r'\s+',' ',text).strip());pieces=[tokens[n:n+128] for n in range(0,len(tokens),128)] or [[]];chunked|=len(pieces)>1
            outputs=model.translate_batch(pieces,beam_size=4,max_input_length=256,max_decoding_length=256)
            next_values.append(' '.join(tokenizer.decode(o.hypotheses[0]) for o in outputs).strip())
            emit({'progress':min(98,((route_index+(i+1)/max(1,len(rows)))/len(routes))*100),'message':'Traduciendo subtítulos localmente'})
        values=next_values;del model
    return {'rows':[{'id':r['id'],'text':value,'sourceText':r['text']} for r,value in zip(rows,values)],'chunked':chunked,'method':'CTranslate2 int8 / CPU','routeCount':len(routes)}
def main():
    p=argparse.ArgumentParser();p.add_argument('action',choices=['separate','speakers','translate']);p.add_argument('--model');p.add_argument('--audio');p.add_argument('--input');p.add_argument('--output',required=True);p.add_argument('--speakers',type=int,default=0);a=p.parse_args();start=time.monotonic()
    result=separate(a) if a.action=='separate' else speakers(a) if a.action=='speakers' else translate(a);result['elapsedSeconds']=time.monotonic()-start
    file=pathlib.Path(a.output)/'result.json' if a.action=='separate' else pathlib.Path(a.output);file.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
if __name__=='__main__':
    try:main()
    except Exception as error:print(json.dumps({'error':str(error)},ensure_ascii=False),file=sys.stderr);sys.exit(1)
