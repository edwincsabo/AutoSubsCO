# Pruebas y alcance

`npm test` usa `node:test`, sin descargar modelos ni utilizar medios privados. En 0.12 pasan 150 pruebas de dominio.

## Gráficos

`npm run test:graphics` necesita Windows, Electron, FFmpeg y FFprobe preparados. Genera video, PNG transparente y JPEG, y abre un perfil aislado en `test-results/v12/`. Comprueba títulos, cancelación, deshacer/rehacer, guardado, transporte, zoom y render por CPU. Los píxeles exportados verifican transparencia y fundidos.

No utiliza videos privados. Si existe la muestra de desarrollo local, también comprueba que permanezca intacta; su presencia no es necesaria para el recorrido público.

## Alineación

`npm run test:alignment-core` valida el núcleo CTC con señales controladas usando el Python privado. La inferencia real necesita el recurso `alignment-es`.

`scripts/create-alignment-fixture.ps1` puede generar voz española si Windows dispone de Microsoft Helena; esa voz no se redistribuye. `test:alignment-media` genera fixtures en `test-results/v9/`, que utilizan los recorridos de realineación y buscar/reemplazar.

## Otros recorridos

Las pruebas de estudio, audio, precisión, cortes y proyectos utilizan fixtures generados por los scripts de medios de `scripts/` y, en algunos casos, modelos instalados. Los recorridos históricos pueden necesitar muestras externas que no forman parte del repositorio. Instalar dependencias no prepara todos esos datos de prueba.

Los perfiles y salidas se conservan en `test-results/`, separados de la sesión habitual. `AUTOSUBSCO_TEST_RUN` permite cambiar la carpeta de salida de varios recorridos; consulta los prerrequisitos de cada script.

La aprobación local no certifica todos los códecs, idiomas, GPU, escalados físicos o proyectos de varias horas. La interfaz y el render se verifican por separado.

## Montaje, cola y rendimiento 0.12

`test:workbench-media` genera los fixtures controlados y verifica render, velocidad, audio y congelado. Después, `test:workbench` recorre la interfaz con perfil aislado. `test:background` necesita los modelos Base y Parakeet y la muestra sintética usada por los recorridos históricos.

`test:long` genera y exporta proyectos sintéticos de 10/30/60 minutos a baja resolución; `test:long-ui` verifica la virtualización con el proyecto generado de una hora. No extrapolar estas medidas a 4K real. `test:streaming` comprueba ventanas del lector ONNX sin ejecutar inferencia ni crear un WAV de una hora en RAM.
