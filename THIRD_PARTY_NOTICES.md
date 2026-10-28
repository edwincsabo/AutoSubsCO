# Componentes y procedencia

AutoSubsCO es una implementación propia. El análisis de AutoSubs utiliza metadatos, catálogo declarativo y recursos de la instalación como evidencia; no incorpora la implementación de su aplicación. El repositorio de referencia [tmoroney/auto-subs](https://github.com/tmoroney/auto-subs) declara MIT.

## Runtime de escritorio y transcripción

| Componente | Versión/procedencia | Avisos conservados |
|---|---|---|
| Electron | 44.9.0, paquete oficial npm | MIT; Chromium y dependencias conservan sus avisos en el runtime |
| Python | 3.12.10 embebido | PSF, tools/python/LICENSE.txt |
| onnx-asr | 0.12.0 | MIT, paquete dist-info |
| ONNX Runtime DirectML | 1.24.4 | MIT y avisos del paquete dist-info |
| NumPy | 2.2.6 | BSD y avisos del paquete dist-info |
| whisper.cpp | Build oficial b5454 Windows x64 | MIT, licenses/whisper.cpp-MIT.txt |
| Whisper | Pesos GGML de ggerganov/whisper.cpp | MIT upstream, licenses/Whisper-MIT.txt |
| Silero VAD | GGML 5.1.2 | MIT upstream, licenses/Silero-MIT.txt |
| Orukeet | ONNX INT8, revisión fijada en src/onnx-catalog.json | CC BY-SA 4.0, avisos junto a los pesos |
| Parakeet v3 | ONNX INT8, revisión fijada en src/onnx-catalog.json | CC BY 4.0, avisos junto a los pesos |
| FFmpeg y FFprobe | Distribución Gyan 2026-03-18-git-106616f13d-essentials_build | --enable-gpl --enable-version3, libx264 y libass; tools/ffmpeg/BUILD-INFO.txt y COPYING.GPLv3 |
| Playwright y electron-builder | Herramientas de desarrollo | Avisos en los paquetes npm; no se cargan como dependencias de la app |

Fuentes: [Whisper](https://github.com/openai/whisper), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [Silero](https://github.com/snakers4/silero-vad), [onnx-asr](https://github.com/istupakov/onnx-asr), [ONNX Runtime](https://onnxruntime.ai/), [Orukeet](https://huggingface.co/oruk/orukeet), [Parakeet ONNX](https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx).

FFmpeg procede de [Gyan](https://www.gyan.dev/ffmpeg/builds/); [fuente correspondiente al commit observado](https://github.com/FFmpeg/FFmpeg/tree/106616f13d). Los avisos y obligaciones de distribución de cada componente se conservan según sus términos.

## Estudio local v0.3

| Componente | Uso | Procedencia y avisos |
|---|---|---|
| sherpa-onnx / sherpa-onnx-core 2.0.0 | Separación y diarización | [Código upstream](https://github.com/k2-fsa/sherpa-onnx); avisos del paquete Python |
| Spleeter 2 stems FP16 ONNX | Voz y acompañamiento | [Spleeter/Deezer](https://github.com/deezer/spleeter), MIT upstream; conversión distribuida por sherpa-onnx |
| Pyannote segmentation 3.0 ONNX | Segmentación de turnos de voz | Archivo LICENSE conservado en models/resources/speakers/segmentation |
| WeSpeaker ResNet34-LM ONNX | Agrupación de turnos | [Modelo distribuido por sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models); conservar términos de modelo y código upstream |
| CTranslate2 4.8.4 | Inferencia de traducción INT8 | [Código upstream](https://github.com/OpenNMT/CTranslate2); avisos del paquete Python |
| SentencePiece 0.2.2 | Tokenización | [Código upstream](https://github.com/google/sentencepiece); avisos del paquete Python |
| sacremoses 0.2.0 / subword-nmt 0.3.8 | Tokenización Moses/BPE | Avisos en sus paquetes Python |
| Paquetes Argos ES↔EN, PT↔EN y FR↔EN | Modelos de traducción OPUS | [Índice oficial](https://github.com/argosopentech/argospm-index); README de cada paquete conservado en models/resources/translation-* |

Los README de ES→EN, EN→PT, PT→EN, EN→FR y FR→EN conservan la atribución OPUS-MT y declaran CC BY 4.0 para el modelo original del que derivan. El paquete EN→ES 1.0 identifica los corpus OPUS utilizados y sus avisos Stanza; se conserva su README original. Los términos del código y de cada modelo se consideran por separado. No se atribuye una licencia única a todos los pesos de hablantes.

Los paquetes Python y sus dependencias incluyen sus directorios dist-info y licencias en tools/python/Lib/site-packages. Las versiones exactas quedan en tools/python/requirements-lock.txt. El catálogo src/studio-resources.json conserva URL, tamaños, SHA-256 y archivos esperados. Los hashes de archivos comprimidos se observaron en la primera adquisición HTTPS y se fijaron para verificar descargas posteriores; no se presentan como firmas del publicador.

Los modelos se distribuyen en models por separado del ejecutable y sus avisos deben acompañarlos. No se incluye un alineador MMS. El análisis histórico de ese componente del catálogo de AutoSubs está en docs/ANALISIS_AUTOSUBS.md.

## Alineación local v0.9

El modelo [wav2vec2-large-xlsr-53-spanish](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-spanish), de Jonatas Grosman, y su [exportación ONNX INT8 por XDcobra](https://huggingface.co/XDcobra/wav2vec2-large-xlsr-53-spanish-ONNX) se identifican como Apache-2.0. La revisión de exportación utilizada es ce8c6ded2261a6dd5b902cbbcd46d330f7e92c37. La licencia publicada se conserva íntegra en licenses/wav2vec2-spanish-onnx.txt y junto a los pesos en models/resources/alignment-es/LICENSE. Las URL inmutables, tamaños y huellas están en src/studio-resources.json.

La inferencia usa los paquetes NumPy y ONNX Runtime ya incluidos. El alineador CTC/Viterbi de tools/alignment es implementación del proyecto; no incorpora PyTorch/TorchAudio ni sus binarios. La voz Microsoft Helena se utilizó como herramienta instalada de Windows para generar una prueba local; no se redistribuye con AutoSubsCO ni es necesaria para realinear archivos del usuario.
