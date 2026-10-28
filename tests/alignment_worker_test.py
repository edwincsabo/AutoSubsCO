import contextlib
import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools' / 'alignment'))
import ctc
import worker


class AlignmentCore(unittest.TestCase):
    def test_repeated_characters_require_a_blank(self):
        values = np.array([[.01, .99], [.99, .01], [.01, .99]], dtype=np.float32)
        path = ctc.viterbi(np.log(values), [1, 1], 0)
        self.assertEqual(path.tolist(), [1, 2, 3])
        self.assertIsNone(ctc.viterbi(np.log(values[:2]), [1, 1], 0))

    def test_leading_and_trailing_silence_stay_blank(self):
        values = np.array([[.99, .01], [.99, .01], [.01, .99], [.99, .01], [.99, .01]], dtype=np.float32)
        path = ctc.viterbi(np.log(values), [1], 0)
        self.assertEqual(np.flatnonzero(path == 1).tolist(), [2])

    def test_softmax_is_stable_and_rejects_nonfinite(self):
        p = ctc.log_softmax(np.array([[10000., 10001.]]))
        self.assertAlmostEqual(float(np.exp(p).sum()), 1., places=6)
        with self.assertRaises(ValueError):
            ctc.log_softmax(np.array([[np.nan, 1.]]))

    def test_numbers_are_not_given_artificial_times(self):
        r = ctc.align(np.zeros((10, 3)), ['2026'], {'<pad>': 0, '|': 1, 'a': 2}, 0, 320, 400, 16000, 0, 0, 1)
        self.assertEqual(r['status'], 'unsupported')
        self.assertNotIn('words', r)

    def test_diacritics_and_enye_are_preserved(self):
        self.assertEqual(ctc.normalized_word('¿AÑO, canción!'), 'añocanción')
        self.assertNotEqual(ctc.normalized_word('año'), ctc.normalized_word('ano'))

    def test_derived_frame_geometry(self):
        self.assertEqual(worker.geometry({'conv_kernel': [10, 3, 3, 3, 3, 2, 2], 'conv_stride': [5, 2, 2, 2, 2, 2, 2]}), (320, 400))

    def routing(self, available, side_effect):
        out = ROOT / 'test-results' / 'v9'
        out.mkdir(parents=True, exist_ok=True)
        folder = pathlib.Path(tempfile.mkdtemp(prefix='alignment-core-', dir=out))
        request = folder / 'request.json'
        output = folder / 'output.json'
        request.write_text(json.dumps({'cues': [{'id': 'a'}]}), encoding='utf-8')
        argv = ['worker.py', '--model', str(folder), '--audio', 'unused.wav', '--request', str(request), '--output', str(output), '--acceleration', 'gpu']
        with mock.patch.object(sys, 'argv', argv), mock.patch.object(worker.ort, 'get_available_providers', return_value=available), mock.patch.object(worker, 'run', side_effect=side_effect) as run, contextlib.redirect_stdout(io.StringIO()):
            worker.main()
            return json.loads(output.read_text('utf-8')), run.call_args_list

    def test_gpu_absent_routes_to_cpu(self):
        output, calls = self.routing(['CPUExecutionProvider'], [[]])
        self.assertEqual(output['provider'], 'CPUExecutionProvider')
        self.assertTrue(output['fallback'])
        self.assertEqual(calls[0].args[-1], 'CPUExecutionProvider')

    def test_failed_gpu_retries_cpu(self):
        output, calls = self.routing(['DmlExecutionProvider', 'CPUExecutionProvider'], [RuntimeError('GPU de prueba falló'), []])
        self.assertEqual(output['provider'], 'CPUExecutionProvider')
        self.assertEqual(len(calls), 2)
        self.assertEqual([c.args[-1] for c in calls], ['DmlExecutionProvider', 'CPUExecutionProvider'])


if __name__ == '__main__':
    unittest.main()
