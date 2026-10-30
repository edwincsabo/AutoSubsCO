"""Archiva la carpeta portátil local ya verificada; no publica ni modifica sus datos."""
import hashlib,json,pathlib,zipfile
root=pathlib.Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
release=(root/'release').resolve();folder=(release/f'AutoSubsCO-{version}-Windows').resolve()
if folder.parent!=release or not folder.is_dir() or folder.is_symlink():raise ValueError('Carpeta de entrega inválida')
for name in ['models','workspace','workspace-desarrollo','app-profile']:
    if (folder/name).exists():raise ValueError('El paquete no debe contener datos de trabajo')
target=release/f'AutoSubsCO-{version}-Windows.zip'
count=0;total=0
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,strict_timestamps=False) as archive:
    for file in sorted(folder.rglob('*')):
        if file.is_symlink():raise ValueError('No se archivan enlaces')
        if not file.is_file():continue
        before=file.stat();archive.write(file,folder.name+'/'+file.relative_to(folder).as_posix());after=file.stat()
        if before.st_size!=after.st_size or before.st_mtime_ns!=after.st_mtime_ns:raise ValueError('Un archivo cambió durante el archivo')
        count+=1;total+=before.st_size
with zipfile.ZipFile(target) as archive:
    if archive.testzip() is not None:raise ValueError('El ZIP no superó la comprobación CRC')
report={'passed':True,'version':version,'folder':folder.relative_to(root).as_posix(),'file':target.relative_to(root).as_posix(),'files':count,'uncompressedBytes':total,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'archiveIntegrity':True,'modelsIncluded':False,'userDataIncluded':False}
(root/'test-results'/f'v{version.split(".")[1]}'/'portable-package-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report))
