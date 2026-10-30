# AutoSubsCO

Editor local para **Windows x64** con montaje multimedia, imágenes, logos, títulos, mezcla de audio y subtítulos automáticos. Versión de desarrollo: **0.12.0**.

**Uso personal y no comercial.** Puedes utilizar y modificar el código bajo [PolyForm Noncommercial 1.0.0](LICENSE). Consulta el [resumen en español](USO_NO_COMERCIAL.md) y los [avisos de terceros](THIRD_PARTY_NOTICES.md).

![Montaje con imágenes y títulos](docs/images/editor.png)

## Funcionalidades

- **Medios:** biblioteca de video/audio, imágenes PNG/JPEG, logos transparentes y títulos independientes.
- **Montaje:** múltiples capas, selección y agrupación, cortes, recorte, audio vinculado, transiciones, transformación, fotogramas clave y fundidos de gráficos.
- **Audio:** volumen, curvas y fundidos, separación de voz/música, agrupación estimada de hablantes y atenuación de música durante la voz.
- **Subtítulos:** reconocimiento local, comparación de motores, edición, traducción, realineación del español, buscar/reemplazar y cortes de video desde el texto.
- **Entrega:** MP4 H.264/AAC, WAV de 24 bits, perfiles, lotes por rangos, SRT/VTT/ASS y proyectos transportables con medios relativos.
- **Proyectos:** recientes, Guardar como, versiones, recuperación y Deshacer/Rehacer. El esquema actual es 7 y admite migración de los esquemas 1 a 6.

El visor, el inspector contextual y la línea de tiempo conservan su posición al cambiar de tarea. Los paneles se pueden ajustar y plegar.

La inferencia y el render se ejecutan en el equipo. La preparación inicial descarga herramientas y modelos elegidos. **CPU es la opción predeterminada; GPU es opcional**, con respaldo CPU en los procesos que la admiten.

## Ejecutar la carpeta portátil

El repositorio publica fuentes; el ZIP portátil no se adjunta a esta actualización. Si dispones de `AutoSubsCO-0.12.0-Windows.zip`, extráelo completo y abre `AutoSubsCO.exe` dentro de la carpeta. No necesita Node.js ni Python globales. Los modelos se descargan explícitamente desde la app; no se incluyen en el ZIP. La carpeta necesita permiso de escritura para sus datos.

`Iniciar AutoSubsCO.cmd` utiliza la carpeta portátil 0.12 si existe en `release/`; en caso contrario abre las fuentes mediante `Probar AutoSubsCO.cmd`. Ambos lanzadores reutilizan los modelos de la raíz y el perfil `workspace-desarrollo/`.

## Preparar y ejecutar

Requiere Windows x64, Node.js 24 y npm. El repositorio publica fuentes y workers propios; los runtimes y los pesos se preparan por separado.

```powershell
git clone https://github.com/edwincsabo/AutoSubsCO.git
cd AutoSubsCO
npm ci
npm run setup
node scripts/setup-onnx.mjs
node scripts/setup-studio.mjs
```

Coloca `ffmpeg.exe` y `ffprobe.exe` en `tools/ffmpeg/` junto con sus avisos de licencia. La [guía de instalación](docs/INSTALACION.md) explica las alternativas de configuración y preparación.

```powershell
node scripts/download-model.mjs small
npm start
```

En Windows puedes usar `Preparar AutoSubsCO.cmd` para reunir los pasos de preparación de lo que falte. Después utiliza `Probar AutoSubsCO.cmd`. Los recursos adicionales se descargan explícitamente desde la herramienta correspondiente. No necesitas instalar otra aplicación AutoSubs.

## Novedades 0.12

- Copiar, pegar y duplicar clips con vínculos y subtítulos; bloqueo, visibilidad, silencio y solo por pista.
- Trabajos en segundo plano para transcribir, comparar, exportar y preparar cambios de tiempo, con revisión de resultados y protección de correcciones.
- Recorte visual, ajustar/rellenar y guías de encuadre.
- Velocidad de 0,25× a 4×, audio vinculado y fotogramas congelados insertados en V1.
- Perfiles propios, calidad MP4, audio WAV de 24 bits y exportación de rangos por lote.
- Render por región, canvas visibles, caché de formas de onda/miniaturas, historial por memoria y lectura ONNX por ventanas.

Guía: [MEJORAS_0_12.md](docs/MEJORAS_0_12.md). Evidencia y límites: [VERIFICACION_0_12.md](docs/VERIFICACION_0_12.md).

## Primer montaje

1. Importa tu video o audio desde **Medios**, o comienza con una imagen.
2. En **Imagen y texto**, importa una foto, coloca un logo o crea un título.
3. Selecciona el elemento en **Montaje** para cambiar duración, posición, opacidad y animación.
4. Si necesitas subtítulos, elige modelo, idioma y rango en **Subtítulos → Transcribir**. Revisa el texto y sus tiempos.
5. Guarda y exporta el rango desde **Entrega**. **Empaquetar proyecto y medios** prepara una carpeta transportable.

## Modelos locales

| Herramienta | Opciones |
|---|---|
| Transcripción | Whisper Base, Small y Large v3 Turbo; Orukeet y Parakeet v3 ONNX INT8 |
| Realineación | Wav2Vec2 CTC español ONNX INT8 |
| Separación | Spleeter ONNX, voz y música |
| Turnos de voz | Pyannote / WeSpeaker ONNX |
| Traducción | Argos/OPUS mediante CTranslate2; español, inglés, portugués y francés |

Los catálogos de `src/` fijan procedencia, revisiones, tamaños y SHA-256. Cada modelo mantiene sus términos. La RAM indicada es orientativa; los resultados de reconocimiento, traducción, separación y alineación requieren revisión.

## Desarrollo y pruebas

```powershell
npm test
npm run test:graphics
npm run test:alignment-core
```

La base actual tiene **150 pruebas de dominio**. La validación de 0.12 incluye recorridos de interfaz, render real y proyectos sintéticos de 10/30/60 minutos; consulta la verificación de la versión. Los resultados de sesiones privadas y sus medios no se publican.

La prueba de gráficos genera sus medios y usa un perfil aislado; requiere Electron, FFmpeg y FFprobe. El núcleo de alineación requiere Python. Otros recorridos necesitan modelos y fixtures: consulta [PRUEBAS.md](docs/PRUEBAS.md).

```powershell
npm run package
```

El empaquetado genera un portátil en `release/`. Los binarios producidos requieren validación propia y, cuando corresponda, firma. La entrega local también incluye una carpeta portátil 0.12 validada en este equipo, con runtimes y ZIP. No se ha preparado un instalador firmado del proyecto. La distribución de dependencias debe conservar las licencias y obligaciones de cada componente.

## Alcance actual

Hasta 100 clips, 100 recursos y ocho capas de video. Imágenes PNG/JPEG estáticas; títulos de hasta 500 caracteres. Exportación a 24/25/30/50/60 FPS. La realineación actual es para español. Los proyectos extensos y otras combinaciones de hardware requieren medición específica.

Próxima mejora multimedia propuesta: color básico por clip con comparación antes/después. Quedan también FPS racionales, HDR, limpieza segura de derivados y fusión de propuestas por regiones.

## Licencia y procedencia

El código original se ofrece bajo **PolyForm Noncommercial License 1.0.0**: uso, modificación y distribución según sus condiciones para fines no comerciales. El uso comercial requiere autorización independiente del titular. Conserva [LICENSE](LICENSE) y [NOTICE](NOTICE) al compartir copias.

La licencia no sustituye las de FFmpeg, Electron, los paquetes Python ni los pesos de modelos. Consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) y `licenses/`.

AutoSubsCO es una implementación propia. [AutoSubs](https://github.com/tmoroney/auto-subs) fue una referencia de comportamiento; no se incorpora su implementación.
