"""Archiva fuentes y workers propios; excluye medios, modelos y runtimes."""
import hashlib,json,pathlib,re,zipfile
root=pathlib.Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
if not re.fullmatch(r'\d+\.\d+\.\d+',version):raise ValueError('Versión inválida')
target=root/'release'/f'AutoSubsCO-{version}-fuentes.zip'
items=['LICENSE','NOTICE','USO_NO_COMERCIAL.md','.gitignore','.gitattributes','src','ui','electron','tests','scripts','docs','licenses','tools/studio','tools/onnx','tools/alignment','package.json','package-lock.json','README.md','THIRD_PARTY_NOTICES.md','Iniciar AutoSubsCO.cmd','Probar AutoSubsCO.cmd','PRUEBA_LOCAL.md',f'ESTADO_{version.split(".")[0]}_{version.split(".")[1]}.md']
count=0
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for name in items:
        item=root/name
        for file in sorted(item.rglob('*')) if item.is_dir() else [item]:
            if not file.is_file() or file.is_symlink() or '__pycache__' in file.parts or file.suffix=='.pyc':continue
            archive.write(file,file.relative_to(root).as_posix());count+=1
with zipfile.ZipFile(target) as archive:
    if archive.testzip() is not None:raise ValueError('El archivo de fuentes no pasó la verificación')
    names=set(archive.namelist())
    if not {'tools/studio/worker.py','tools/onnx/worker.py','src/audio-mix.mjs','ui/audio-mixer.js','tools/alignment/worker.py','tools/alignment/ctc.py','src/alignment.mjs','ui/alignment.js','licenses/wav2vec2-spanish-onnx.txt','src/find-replace.mjs','src/find-replace-model.mjs','ui/find-replace.js','ui/find-replace.css','src/graphics.mjs','src/graphic-project.mjs','ui/graphics.js','ui/graphics.css','ui/title-raster.js','tests/graphics.test.mjs'}.issubset(names):raise ValueError('Faltan fuentes en el archivo')
report={'passed':True,'file':str(target),'files':count,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'workersIncluded':True,'archiveIntegrity':True}
(root/'test-results'/f'v{version.split(".")[1]}'/'source-package-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report))
