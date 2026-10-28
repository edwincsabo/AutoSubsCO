# Preparación en Windows x64

Node.js 24 se utiliza para desarrollo; la inferencia usa un Python privado dentro del proyecto. Estos comandos no instalan Python globalmente ni cambian la seguridad de Windows.

## Dependencias

Desde la carpeta del repositorio:

```powershell
npm ci
npm run setup
node scripts/setup-onnx.mjs
node scripts/setup-studio.mjs
```

`npm ci` instala las versiones del archivo de bloqueo. Si la descarga de Electron no se completó, ejecuta `node node_modules/electron/install.js`.

`setup` descarga whisper.cpp CPU y Silero VAD; también intenta aprovechar una copia local de FFmpeg si existe. Puedes proporcionar tus ejecutables sin instalar AutoSubs. `setup-onnx` prepara Python 3.12.10, NumPy y ONNX Runtime DirectML; `setup-studio` añade separación y traducción al runtime privado. DirectML no obliga a utilizar GPU.

## FFmpeg y FFprobe

Obtén una distribución compatible desde los enlaces de [FFmpeg](https://ffmpeg.org/download.html#build-windows). El desarrollo local se verificó con una distribución essentials de [Gyan](https://www.gyan.dev/ffmpeg/builds/) con libass y libx264.

Coloca `ffmpeg.exe` y `ffprobe.exe` en `tools/ffmpeg/` y conserva sus archivos de licencia y procedencia. También puedes elegir rutas desde **Equipo** en la aplicación, o configurar las variables `AUTOSUBSCO_FFMPEG` y `AUTOSUBSCO_FFPROBE` antes del arranque.

Los componentes GPL conservan sus condiciones de distribución, incluido el código fuente correspondiente cuando sus términos lo exijan. La licencia del proyecto no cambia esos derechos y obligaciones.

## Modelos y arranque

```powershell
node scripts/download-model.mjs small
npm start
```

La aplicación permite descargar otros modelos. Separación, hablantes, traducción y realineación muestran las acciones para preparar sus recursos cuando falten. La descarga es explícita; la inferencia posterior es local.

`Probar AutoSubsCO.cmd` utiliza `workspace-desarrollo/`; `npm start` usa `workspace/` por defecto. Son perfiles y carpetas de trabajo diferentes. Ambos conservan los archivos importados.

## Datos locales

Proyectos, medios, modelos, runtimes, cachés, claves y certificados están excluidos del control de versiones. **Entrega → Empaquetar proyecto y medios** permite transportar un proyecto; los modelos y el runtime se preparan aparte en el destino.

El repositorio no necesita claves de servicios en la nube para transcribir. No subas tus proyectos, videos ni certificados al publicar cambios.
