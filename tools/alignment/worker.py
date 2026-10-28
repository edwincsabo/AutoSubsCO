"""Inferencia local de alineación: ONNX + NumPy, CPU y DirectML opcional."""
import argparse
import gc
import json
import os
import pathlib
import sys
import time
import wave
sys.dont_write_bytecode = True
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
os.environ['HF_HUB_OFFLINE'] = '1'
import numpy as np
import onnxruntime as ort
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from ctc import align


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def load_audio(file):
    with wave.open(file, 'rb') as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2 or wav.getframerate() != 16000 or wav.getnframes() > 125 * 16000:
            raise ValueError('Se requiere PCM16 mono a 16 kHz, hasta 125 segundos.')
        return np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768


def geometry(config):
    stride, receptive = 1, 1
    for kernel, step in zip(config['conv_kernel'], config['conv_stride']):
        receptive += (kernel - 1) * stride
        stride *= step
    return stride, receptive


def run(args, request, provider):
    base = pathlib.Path(args.model)
    config = json.loads((base / 'config.json').read_text('utf-8'))
    preprocessor = json.loads((base / 'preprocessor_config.json').read_text('utf-8'))
    vocab = json.loads((base / 'vocab.json').read_text('utf-8'))
    if config.get('model_type') != 'wav2vec2' or preprocessor.get('sampling_rate') != 16000 or '|' not in vocab:
        raise ValueError('Configuración de alineación no compatible.')
    options = ort.SessionOptions()
    options.intra_op_num_threads = max(1, min(4, (os.cpu_count() or 4) - 2))
    options.inter_op_num_threads = 1
    options.enable_mem_pattern = False
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.log_severity_level = 3
    providers = [provider, 'CPUExecutionProvider'] if provider != 'CPUExecutionProvider' else [provider]
    emit({'stage': 'model', 'message': 'Cargando el alineador local', 'percent': None, 'provider': provider})
    session = ort.InferenceSession(str(base / 'model.onnx'), sess_options=options, providers=providers)
    samples = load_audio(args.audio)
    stride, receptive = geometry(config)
    results = []
    origin = float(request['audioStart'])
    for index, row in enumerate(request['cues']):
        start, end = float(row['start']), float(row['end'])
        words = row['words']
        if not isinstance(words, list) or not words or any(not isinstance(w, str) or len(w) > 1200 for w in words) or end <= start or end - start > 20.001 or start < origin - .001:
            raise ValueError('Subtítulo fuera del alcance permitido.')
        at = max(0, int(round((start - origin - .2) * 16000)))
        finish = min(len(samples), int(round((end - origin + .2) * 16000)))
        audio = np.ascontiguousarray(samples[at:finish])
        if len(audio) < receptive or np.sqrt(np.mean(audio ** 2)) < .002:
            value = {'status': 'no_audio', 'reason': 'No hay suficiente audio audible en este fragmento.'}
        else:
            if preprocessor.get('do_normalize'):
                audio = (audio - audio.mean()) / np.sqrt(audio.var() + 1e-7)
            feeds = {}
            for entry in session.get_inputs():
                if entry.name == 'input_values':
                    feeds[entry.name] = audio[None].astype(np.float32)
                elif entry.name == 'attention_mask':
                    feeds[entry.name] = np.ones((1, len(audio)), dtype=np.int64 if entry.type == 'tensor(int64)' else np.int32)
                else:
                    raise ValueError('Entrada ONNX no compatible: ' + entry.name)
            logits = session.run(None, feeds)[0]
            if logits.ndim != 3 or logits.shape[0] != 1 or logits.shape[2] != len(vocab):
                raise ValueError('Salida ONNX no compatible.')
            value = align(logits[0], words, vocab, config['pad_token_id'], stride, receptive, 16000, origin + at / 16000, start, end)
        results.append({'cueId': row['id'], **value})
        emit({'stage': 'align', 'message': f'Alineando subtítulo {index + 1} de {len(request["cues"])}', 'percent': (index + 1) / len(request['cues']) * 100, 'provider': provider})
    return results


def main():
    parser = argparse.ArgumentParser()
    for name in ['model', 'audio', 'request', 'output']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--acceleration', choices=['cpu', 'gpu'], default='cpu')
    args = parser.parse_args()
    request_file = pathlib.Path(args.request)
    if request_file.stat().st_size > 2e6:
        raise ValueError('Solicitud demasiado grande.')
    request = json.loads(request_file.read_text('utf-8'))
    if not 1 <= len(request['cues']) <= 25:
        raise ValueError('Se admiten hasta 25 subtítulos por propuesta.')
    began = time.monotonic()
    provider = 'DmlExecutionProvider' if args.acceleration == 'gpu' and 'DmlExecutionProvider' in ort.get_available_providers() else 'CPUExecutionProvider'
    fallback = 'DirectML no está disponible; se usó CPU.' if args.acceleration == 'gpu' and provider == 'CPUExecutionProvider' else None
    try:
        results = run(args, request, provider)
    except Exception as error:
        if provider == 'CPUExecutionProvider':
            raise
        fallback = str(error)[:800]
        emit({'stage': 'fallback', 'message': 'La GPU no pudo alinear; continuamos por CPU', 'percent': None})
        error.__traceback__ = None
        gc.collect()
        provider = 'CPUExecutionProvider'
        results = run(args, request, provider)
    output = {'engine': 'wav2vec2-ctc-viterbi', 'provider': provider, 'fallback': fallback, 'elapsedSeconds': time.monotonic() - began, 'results': results}
    pathlib.Path(args.output).write_text(json.dumps(output, ensure_ascii=False, allow_nan=False), encoding='utf-8')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
