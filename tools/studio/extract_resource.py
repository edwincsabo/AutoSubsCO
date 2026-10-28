"""Extrae exclusivamente datos de modelos; rechaza rutas, enlaces y tamaños inesperados."""
import argparse, json, pathlib, shutil, stat, tarfile, zipfile
p=argparse.ArgumentParser();p.add_argument('archive');p.add_argument('target');p.add_argument('kind',choices=['spleeter','segmentation','translation']);a=p.parse_args()
target=pathlib.Path(a.target).resolve();target.mkdir(parents=True,exist_ok=True)
def relative(name):
    parts=pathlib.PurePosixPath(name.replace('\\','/')).parts
    if any(x in ('..','') or ':' in x or any(ord(c)<32 for c in x) for x in parts) or name.startswith(('/','\\')): raise ValueError('Ruta de archivo no permitida')
    if len(parts)>1: parts=parts[1:]
    return pathlib.Path(*parts) if parts else None
def selected(rel):
    if rel is None: return False
    name=rel.name.lower()
    if name.startswith(('license','copying','notice','readme')) or name=='metadata.json': return True
    if a.kind=='spleeter': return name.endswith('.onnx')
    if a.kind=='segmentation': return name=='model.onnx'
    return rel.parts[0]=='model' or name in ['sentencepiece.model','bpe.model']
total=0;written=[]
def copy(name,size,reader):
    global total
    rel=relative(name)
    if not selected(rel): return
    total+=size
    if total>2_000_000_000 or len(written)>20000: raise ValueError('El paquete supera los límites de extracción')
    dest=(target/rel).resolve()
    if target not in dest.parents: raise ValueError('El archivo sale del directorio del modelo')
    dest.parent.mkdir(parents=True,exist_ok=True)
    with reader as source,open(dest,'wb') as output: shutil.copyfileobj(source,output,1024*1024)
    written.append(str(rel).replace('\\','/'))
if zipfile.is_zipfile(a.archive):
    with zipfile.ZipFile(a.archive) as z:
        for item in z.infolist():
            if stat.S_ISLNK(item.external_attr>>16): raise ValueError('No se admiten enlaces en paquetes')
            if not item.is_dir(): copy(item.filename,item.file_size,z.open(item))
else:
    with tarfile.open(a.archive,'r:*') as t:
        for item in t:
            if item.issym() or item.islnk(): raise ValueError('No se admiten enlaces en paquetes')
            if item.isfile(): copy(item.name,item.size,t.extractfile(item))
print(json.dumps({'files':written,'bytes':total}))
