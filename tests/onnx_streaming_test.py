import contextlib, importlib.util, io, pathlib, types, unittest
from unittest.mock import patch
import numpy as np

worker_path=pathlib.Path(__file__).resolve().parent.parent/'tools'/'onnx'/'worker.py'
spec=importlib.util.spec_from_file_location('autosubs_stream_worker',worker_path)
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)

class Wav:
    def __init__(self,seconds=3600,channels=1):self.total=seconds*16000;self.pos=0;self.reads=[];self.channels=channels
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def getsampwidth(self):return 2
    def getnchannels(self):return self.channels
    def getframerate(self):return 16000
    def getnframes(self):return self.total
    def setpos(self,at):self.pos=at
    def readframes(self,n):n=min(n,self.total-self.pos);self.reads.append(n);self.pos+=n;return np.ones(n,dtype='<i2').tobytes()

class Model:
    def __init__(self):self.windows=[]
    def with_timestamps(self):return self
    def recognize(self,samples,sample_rate):self.windows.append(len(samples));return types.SimpleNamespace(text='hola',tokens=['hola'],timestamps=[0.0],logprobs=[])

class StreamingTests(unittest.TestCase):
    def test_one_hour_is_read_in_bounded_windows_and_preserves_clock(self):
        wav=Wav();model=Model();args=types.SimpleNamespace(model='fake',audio='fake')
        with patch.object(worker.wave,'open',return_value=wav),patch.object(worker.onnx_asr,'load_model',return_value=model),contextlib.redirect_stdout(io.StringIO()):
            result=worker.recognize(args,'CPUExecutionProvider')
        self.assertGreater(len(result),100);self.assertLessEqual(max(wav.reads),320000);self.assertLessEqual(max(model.windows),320000)
        self.assertEqual(result[0]['start'],0);self.assertEqual(result[-1]['end'],3600)
        for before,after in zip(result,result[1:]):self.assertEqual(before['end'],after['start'])
    def test_rejects_wrong_audio_format(self):
        with patch.object(worker.wave,'open',return_value=Wav(channels=2)),patch.object(worker.onnx_asr,'load_model',return_value=Model()):
            with self.assertRaises(ValueError):worker.recognize(types.SimpleNamespace(model='fake',audio='fake'),'CPUExecutionProvider')

if __name__=='__main__':unittest.main()
