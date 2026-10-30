# Verificación de AutoSubsCO 0.12

Verificación local de desarrollo con perfiles aislados. La muestra privada del usuario se conserva y no se utilizan sus perfiles de trabajo para las pruebas. Los informes están en `test-results/v12`.

## Pruebas de dominio y Python

**150 pruebas Node**: las 130 anteriores y veinte de montaje/trabajos. Verifican instantáneas del portapapeles, inserción y duplicación, grupos, vínculos, subtítulos, voces, separaciones, bloqueo, silencio/solo, encuadre, exportación por ventana, historial por memoria, velocidad absoluta, perfiles, rangos, persistencia, cancelación, reintento, interrupción y rechazo de medios modificados.

**Diez pruebas Python**: ocho del núcleo CTC existente y dos del lector ONNX por ventanas. Una hora de audio se simula con lecturas de no más de 320000 muestras; se comprueba continuidad temporal y rechazo de formatos inválidos. No se carga un WAV de una hora ni un modelo en esa prueba unitaria.

Se comprueba la sintaxis de los módulos JavaScript. Durante el desarrollo se detectó y corrigió un error al sanear nombres de lotes; las comprobaciones finales incluyen el arranque real posterior a esa corrección.

## Interfaz

Trece recorridos: los diez existentes (visor/distribución, proyectos, precisión, audio, editor, buscar/reemplazar, realineación, cortes por texto, estudio y gráficos) y tres nuevos:

- **Workbench:** atajos de clips, vínculos/cues, bloqueo que impide borrar, visibilidad y solo, recorte con puntero/teclado, cancelar sin cambios, guías, velocidad, reproducción real de su audio, congelado, propuesta desactualizada impedida, perfiles, WAV, lote MP4/WAV, rangos y cola tras reiniciar.
- **Background:** transcripción ONNX real por CPU, creación de un título y corrección de texto mientras trabaja el motor, resultado que conserva la corrección, apertura como copia y comparación en segundo plano. También comprueba que una comparación anterior no reemplace cambios posteriores.
- **Proyecto largo:** una hora, cien clips y 3600 subtítulos. Al ampliar a 32×, solo siete clips generan nodos en las regiones inicial/final; los canvas tienen el ancho visible. Se comprueba avance de reproducción y ausencia de errores JavaScript.

Los controles y paneles nuevos se prueban con zoom de contenido 100/125/150 %, sin desborde horizontal ni acciones del panel de trabajos fuera de la ventana. Se inspeccionan capturas reales de encuadre, trabajos y proyecto largo. El zoom de contenido no certifica todas las configuraciones físicas de DPI ni conformidad integral de accesibilidad.

## Medios reales generados para la prueba

`verify-workbench-media.mjs` genera una fuente de colores con audio. Comprueba velocidades 0,5× y 2×, sincronización del audio vinculado, ajuste de subtítulos, conservación de traducciones y duración final. Prepara medios de trabajo FFV1 y PCM flotante y verifica el resultado MP4 por CPU.

También valida inserción de un fotograma congelado, recorte mediante píxeles, WAV audible y silencio por pistas, exportación de un fragmento final con una sola entrada y conservación de la fuente. La cancelación tras preparar el primer miembro del conjunto retira los archivos de trabajo incompletos.

La verificación de caché demuestra reutilización de formas de onda y miniaturas con un nuevo pool y otro proyecto, sin volver a ejecutar FFmpeg. FFprobe confirma WAV `pcm_s24le`, estéreo, a 48000 Hz.

El recorrido nativo de animación comprueba por píxeles escala, giro, opacidad, posición y transiciones de barrido/deslizamiento después de modificar la composición y las búsquedas de entrada.

## Mediciones de duración

Fuente **sintética 160 × 90, 1 FPS**, exportación **30 FPS**, cien clips por proyecto y una cadena de subtítulos de control. Estas medidas no representan 4K real ni sirven para prometer un tiempo en otros equipos.

| Duración | Subtítulos | Validación del documento | Exportación completa | Últimos 10 s | Entradas del fragmento |
|---|---:|---:|---:|---:|---:|
| 10 min | 600 | 2,4 ms | 10,8 s | 0,14 s | 2 |
| 30 min | 1800 | 3,2 ms | 23,4 s | 0,13 s | 1 |
| 60 min | 3600 | 4,2 ms | 42,8 s | 0,15 s | 1 |

El historial de una hora conservó 45 estados y estimó 33397020 bytes, dentro del objetivo de 32 MiB. El RSS de Node creció más: el presupuesto del historial no representa toda la RAM ni garantiza un límite de proceso. El informe conserva ambas medidas. Se mantiene el límite de cien clips; no se amplía solo por estas pruebas sintéticas.

## Preparación y entrega

`prepare-app.mjs --check` confirma Electron, Whisper, VAD, Python, ONNX, separación, traducción y FFmpeg existentes. La comprobación no descarga componentes; la ruta de instalación completa en un equipo vacío requiere validación propia.

Se archivan fuentes y workers con licencia, avisos, icono, lanzadores y guías. El manifiesto de entrega registra hashes, informes y alcance. Se valida **Probar AutoSubsCO.cmd** y una carpeta portátil. Se repiten montaje completo y ASR/comparación con los runtimes empaquetados, y un arranque con datos vacíos y PATH sin Node/Python globales crea un título y exporta por CPU. El código de 75 archivos productivos del ASAR coincide byte por byte con las fuentes. El ZIP supera CRC y no contiene modelos ni perfiles de usuario. No se construye un instalador firmado ni se certifican otros equipos. El ejecutable raíz anterior permanece intacto.

No se cambia la seguridad de Windows, no se instalan controladores y no se actualiza GitHub automáticamente. Los nuevos renders y la inferencia descrita se verifican por CPU. Las rutas GPU siguen siendo opcionales; no se certifica su comportamiento en todos los equipos con estas pruebas.

Quedan para una siguiente etapa: grabaciones largas representativas, HDR/FPS racionales, más de cien clips, limpieza de derivados con comprobación de referencias y fusión de resultados por regiones.
