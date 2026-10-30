# AutoSubsCO 0.12 — Base de edición y trabajos

La actualización incorpora las seis áreas aprobadas: montaje, trabajos en segundo plano, rendimiento, encuadre, entrega y tiempo. Mantiene Medios / Montaje / Audio / Subtítulos / Entrega y el inspector contextual. El proyecto pasa al esquema 7; los esquemas 1 a 6 se migran al abrir. Guardar como permite conservar un archivo independiente para la versión anterior.

## Montaje

Fuera de los campos de texto, **Ctrl+C** copia clips, **Ctrl+V** pega en el cabezal y **Ctrl+D** duplica después de la selección. Las acciones también están en **Más acciones** y en el menú contextual de la línea de tiempo. El portapapeles es interno a la aplicación y dura durante la sesión.

Se conservan grupos, vínculos de audio, voces, traducciones y marcas por palabra. Los elementos nuevos tienen identidades independientes. También se copian las pistas de separación ancladas al clip; las separaciones completas conservan controles independientes. Es posible copiar entre proyectos abiertos sucesivamente en la misma sesión.

Pegar una selección con V1 inserta su duración y desplaza las otras pistas; una selección de capas/audio se superpone sin desplazar V1. Cada aplicación constituye un paso de Deshacer. Se rechazan operaciones que superen límites o produzcan una secuencia inválida.

Las cabeceras ofrecen **B** (bloqueo), **V** (ocultar imagen/texto), **M** (silencio) y **S** (solo). Los botones tienen nombre y estado accesibles. Bloquear impide cambiar los clips de esa pista, incluso mediante grupos o desplazamientos globales. V oculta la imagen, conservando el audio: A1 controla el audio original de los videos. Silencio y solo se reflejan en escucha y exportación.

## Trabajos

**Trabajos**, en la barra inferior, abre el panel de cola. Transcribir, comparar modelos, exportar MP4/WAV, cambiar velocidad y congelar un fotograma se procesan en segundo plano. Se puede continuar editando, guardar, crear títulos e importar o abrir proyectos. Algunas operaciones intensivas de estudio continúan en el flujo modal y esperan a que no haya otro proceso intensivo activo.

Cada trabajo conserva una instantánea del proyecto y sus ajustes. Se verifica la versión de los medios antes y después de procesar y se compara la huella del proyecto antes de aplicar. Los resultados nunca sustituyen automáticamente correcciones posteriores.

- **Aplicar al proyecto** incorpora el resultado si continúa vigente, como una edición deshacible.
- **Abrir como copia** permite revisar un proyecto resultado sin reemplazar el archivo de origen; la sesión actual utiliza la confirmación normal de guardar/descartar.
- Las comparaciones se revisan antes de elegir un resultado.
- Las exportaciones utilizan el estado con el que se enviaron y ofrecen abrir su carpeta.

Hay progreso por etapa, tiempo transcurrido, cancelar y reintentar. La cola persiste entre sesiones. Un proceso interrumpido se reinicia al reintentar: no continúa desde un punto interno de la inferencia. Los trabajos que estaban esperando se conservan. CPU es predeterminada y las opciones GPU existentes se capturan por trabajo.

En esta primera versión, cualquier cambio del proyecto invalida la aplicación directa de una propuesta de análisis; no se fusionan regiones automáticamente. Limpiar lista retira registros terminados, conservando archivos que puedan estar referenciados por proyectos o versiones. Se admiten veinte trabajos pendientes y cien registros.

## Rendimiento

El render sin transiciones limita entradas a los clips que cruzan el rango y busca directamente en sus fuentes. Las escenas con transiciones conservan el reloj completo para respetar solapamientos y fundidos. El render de una selección de diez segundos ya no necesita procesar toda la duración anterior cuando se aplica la optimización.

Los canvas de la línea de tiempo tienen el ancho de la región visible y los clips fuera de ella no generan botones. Las formas de onda y miniaturas utilizan caché por archivo y fecha de modificación, reutilizable entre proyectos; el índice en memoria se limita a 128 entradas.

El historial conserva hasta sesenta estados dentro de un presupuesto estimado de 32 MiB. Puede conservar menos estados en proyectos grandes. Este presupuesto no limita toda la RAM del proceso. El worker ONNX lee el WAV en ventanas de hasta veinte segundos; no carga el audio completo de un video largo en una sola matriz. Whisper conserva su flujo existente.

Se midieron proyectos sintéticos de 10/30/60 minutos con cien clips. Fuente de 160 × 90 a 1 FPS y salida a 30 FPS; no son medidas representativas de video 4K. Los informes detallados están en test-results/v12. Se mantiene el límite de cien clips antes de ampliar la escala con grabaciones reales.

## Encuadre

Selecciona un clip visual y abre **Encuadre** en el inspector. **Ajustar** conserva la región completa; **Rellenar** cubre el lienzo. Los cuatro márgenes recortan porcentajes de la fuente y se aplican de forma deshacible.

**Recortar visualmente** muestra el fotograma con esquinas arrastrables. Las flechas ajustan la esquina enfocada y Mayús aumenta el paso. Cancelar conserva el proyecto. Las guías de tercios y zona segura son una ayuda del visor y no se exportan.

Visor y FFmpeg comparten geometría de región, proporción y adaptación. El recorte mantiene al menos un 5 % de la imagen. Los archivos originales se conservan.

## Entrega

Hay perfiles de formato original, horizontal, vertical y cuadrado, tres calidades MP4 y hasta veinte perfiles propios. Se pueden guardar, aplicar y eliminar. WAV exporta PCM de 24 bits estéreo a 48 kHz.

**Exportación por lote** guarda hasta veinte rangos nombrados del proyecto. Selecciona rangos y MP4/WAV para crear una salida por combinación en una carpeta elegida. Se comprueba la capacidad de la cola antes del lote y se generan nombres alternativos cuando un archivo ya existe. Los originales están protegidos como destinos.

**Preparar AutoSubsCO.cmd** concentra la preparación de dependencias que falten. Requiere Node.js 24 y puede necesitar descargas; `node scripts/prepare-app.mjs --check` solo comprueba. FFmpeg puede proporcionarse manualmente o configurarse en Equipo. No se cambian controladores ni protecciones de Windows.

La entrega se valida tanto en fuentes como en carpeta portátil. El ZIP incluye los runtimes; un arranque limpio comprueba que no necesita Node/Python globales y que no descarga modelos automáticamente. Iniciar AutoSubsCO.cmd abre la carpeta portátil reutilizando los datos existentes. La distribución de un instalador firmado sigue siendo independiente y no se certifican todos los equipos.

## Tiempo

**Velocidad y fotograma** ofrece 0,25× a 4× respecto del factor original del clip. Se prepara un resultado en Trabajos y se aplica explícitamente. Un valor igual al actual no crea otra copia.

El cambio utiliza medios de trabajo sin compresión con pérdida de imagen y audio PCM flotante. Consolida el sonido actual del tramo en la copia; los ajustes de mezcla anteriores se recuperan con Deshacer. Puede requerir bastante almacenamiento. El audio independiente se prepara como WAV compatible con el visor. Se conservan originales y procedencia; los tiempos de subtítulos y sus palabras se ajustan por el factor, sin atribuirles una alineación acústica nueva.

Se incluyen audio vinculado y pistas ancladas dentro del clip. En V1 se desplaza el resto del montaje; en capas se modifica el tramo sin desplazar V1. Los vínculos que salgan del intervalo deben ajustarse o desvincularse. Hay que retirar transiciones contiguas antes de cambiar velocidad. Una cancelación retira los archivos de trabajo incompletos de esa preparación.

**Insertar fotograma del cabezal** funciona en V1: inserta una imagen de 0,1 a 30 segundos, sin voz, y desplaza todas las pistas conservando el material restante. No elimina el tramo original. Es deshacible.

## Diseño y límites

Se aplicó la revisión UX/UI al diseño existente: acciones de clips en la línea de tiempo, estados en cabeceras, propiedades en inspector, entrega a la izquierda y trabajos en un panel plegable. No se añadió otro espacio de navegación. Se inspeccionaron capturas reales y se comprobaron tamaños y zoom de contenido 100/125/150 %. No se afirma conformidad integral de accesibilidad.

Se mantienen las licencias y las preferencias CPU/GPU. No se modifica la muestra privada del usuario ni se actualiza GitHub automáticamente. Quedan pendientes HDR, FPS racionales, fusión de propuestas por regiones, limpieza segura de derivados, color y validación de proyectos grandes con grabaciones reales.

Siguiente mejora multimedia: **color básico por clip**, con exposición, contraste, saturación y temperatura, comparación antes/después y controles equivalentes en visor y exportación.
