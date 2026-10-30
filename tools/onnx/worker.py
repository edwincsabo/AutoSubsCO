"""AutoSubsCO: ejecución local aislada de Orukeet/Parakeet. Sin descargas implícitas."""
import argparse, json, os, sys, time, wave, gc
os.environ['HF_HUB_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
sys.dont_write_bytecode=True
if hasattr(sys.stdout,'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr,'reconfigure'): sys.stderr.reconfigure(encoding='utf-8')
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
    results=[]; at=0
    with wave.open(args.audio,'rb') as wav:
        if wav.getsampwidth()!=2 or wav.getnchannels()!=1 or wav.getframerate()!=16000: raise ValueError('Se requiere PCM16 mono 16 kHz.')
        total=wav.getnframes()
        while at<total:
            # Leer solo la ventana actual. Un video largo no carga todo su WAV en RAM.
            wav.setpos(at)
            samples=np.frombuffer(wav.readframes(min(20*16000,total-at)),dtype='<i2').astype(np.float32)/32768.0
            end=len(samples)
            if at+end<total:
                windows=[(float(np.mean(samples[j:j+800]**2)),j+400) for j in range(17*16000,end-800,800)]
                if windows: end=min(windows)[1]
            result=model.recognize(samples[:end],sample_rate=16000)
            tokens=result.tokens or []; timestamps=result.timestamps or []
            results.append({'text':result.text,'start':at/16000,'end':(at+end)/16000,'tokens':tokens,'timestamps':[float(t)+at/16000 for t in timestamps],'logprobs':result.logprobs})
            at+=end;emit({'progress':min(99,at/total*100),'provider':provider})

    return results

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--probe',action='store_true');parser.add_argument('--model');parser.add_argument('--audio');parser.add_argument('--output');parser.add_argument('--acceleration',choices=['cpu','gpu'],default='cpu');args=parser.parse_args()
    if args.probe: emit({'providers':ort.get_available_providers(),'python':sys.version.split()[0]});return
    provider='DmlExecutionProvider' if args.acceleration=='gpu' and 'DmlExecutionProvider' in ort.get_available_providers() else 'CPUExecutionProvider'
    began=time.monotonic();fallback=None
    try: results=recognize(args,provider)
    except Exception as error:
        if provider=='CPUExecutionProvider': raise
        fallback=str(error)[:800];emit({'fallback':fallback,'provider':'CPUExecutionProvider'});provider='CPUExecutionProvider'
    if fallback is not None:
        # Liberar las referencias de la excepción/sesión fallida antes de crear otra.
        gc.collect();results=recognize(args,provider)
    with open(args.output,'w',encoding='utf-8') as f: json.dump({'segments':results,'provider':provider,'fallback':fallback,'elapsedSeconds':time.monotonic()-began},f,ensure_ascii=False)

if __name__=='__main__':
    try: main()
    except Exception as error: print(json.dumps({'error':str(error)},ensure_ascii=False),file=sys.stderr);sys.exit(1)
