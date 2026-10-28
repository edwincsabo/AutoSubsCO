"""AutoSubsCO: ejecución local aislada de Orukeet/Parakeet. Sin descargas implícitas."""
import argparse, json, os, sys, time, wave
os.environ['HF_HUB_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
import numpy as np
import onnxruntime as ort
import onnx_asr

def emit(value):
    print(json.dumps(value,ensure_ascii=False),flush=True)

def recognize(args, provider):
    options=ort.SessionOptions()
    options.intra_op_num_threads=max(1,min(8,(os.cpu_count() or 4)-2))
    options.inter_op_num_threads=1
    options.enable_mem_pattern=False
    options.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL
    options.log_severity_level=3
    providers=[provider,'CPUExecutionProvider'] if provider!='CPUExecutionProvider' else ['CPUExecutionProvider']
    model=onnx_asr.load_model('nemo-conformer-tdt',path=args.model,quantization='int8',sess_options=options,providers=providers,
        preprocessor_config={'providers':['CPUExecutionProvider']},resampler_config={'providers':['CPUExecutionProvider']}).with_timestamps()
    with wave.open(args.audio,'rb') as wav:
        if wav.getsampwidth()!=2 or wav.getnchannels()!=1 or wav.getframerate()!=16000: raise ValueError('Se requiere PCM16 mono 16 kHz.')
        samples=np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2').astype(np.float32)/32768.0
    results=[]; at=0
    while at<len(samples):
        target=min(len(samples),at+20*16000)
        if target<len(samples):
            # Corte entre 17 y 20 s en una ventana de baja energía; no se elimina tiempo.
            windows=[(float(np.mean(samples[j:j+800]**2)),j+400) for j in range(at+17*16000,target-800,800)]
            end=min(windows)[1] if windows else target
        else: end=target
        result=model.recognize(samples[at:end],sample_rate=16000)
        tokens=result.tokens or []; timestamps=result.timestamps or []
        results.append({'text':result.text,'start':at/16000,'end':end/16000,'tokens':tokens,'timestamps':[float(t)+at/16000 for t in timestamps],'logprobs':result.logprobs})
        at=end;emit({'progress':min(99,at/len(samples)*100),'provider':provider})
    return results

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--probe',action='store_true');parser.add_argument('--model');parser.add_argument('--audio');parser.add_argument('--output');parser.add_argument('--acceleration',choices=['cpu','gpu'],default='cpu');args=parser.parse_args()
    if args.probe: emit({'providers':ort.get_available_providers(),'python':sys.version.split()[0]});return
    provider='DmlExecutionProvider' if args.acceleration=='gpu' and 'DmlExecutionProvider' in ort.get_available_providers() else 'CPUExecutionProvider'
    began=time.monotonic();fallback=None
    try: results=recognize(args,provider)
    except Exception as error:
        if provider=='CPUExecutionProvider': raise
        fallback=str(error)[:800];emit({'fallback':fallback,'provider':'CPUExecutionProvider'});provider='CPUExecutionProvider';results=recognize(args,provider)
    with open(args.output,'w',encoding='utf-8') as f: json.dump({'segments':results,'provider':provider,'fallback':fallback,'elapsedSeconds':time.monotonic()-began},f,ensure_ascii=False)

if __name__=='__main__':
    try: main()
    except Exception as error: print(json.dumps({'error':str(error)},ensure_ascii=False),file=sys.stderr);sys.exit(1)
