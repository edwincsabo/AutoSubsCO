import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {extractFile} from '@electron/asar';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),archive=path.join(root,'release','win-unpacked','resources','app.asar'),files=[];
async function walk(dir){for(const e of await fs.readdir(path.join(root,dir),{withFileTypes:true})){if(e.isDirectory())await walk(path.join(dir,e.name));else files.push(path.join(dir,e.name));}}
for(const d of ['src','ui','electron','docs','licenses'])await walk(d);files.push('README.md','THIRD_PARTY_NOTICES.md');
for(const file of files){const original=await fs.readFile(path.join(root,file)),packed=extractFile(archive,file.replaceAll('\\','/'));if(!original.equals(packed))throw Error('El paquete difiere del archivo: '+file);}
const originalPackage=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')),packedPackage=JSON.parse(extractFile(archive,'package.json').toString('utf8'));for(const key of ['name','version','main'])if(originalPackage[key]!==packedPackage[key])throw Error('Metadato distinto: '+key);
for(const file of ['studio/worker.py','studio/extract_resource.py','python/python312.zip']){const original=await fs.readFile(path.join(root,'tools',file)),packed=await fs.readFile(path.join(root,'release','win-unpacked','resources','tools',file));if(!original.equals(packed))throw Error('El runtime difiere del archivo: '+file);}
const report={passed:true,sourceFilesMatchArchive:files.length,packageMetadataMatches:true,version:packedPackage.version,studioWorkerMatches:true,pythonStandardLibraryPresent:true,appAsarSha256:createHash('sha256').update(await fs.readFile(archive)).digest('hex')};await fs.writeFile(path.join(root,'test-results','v6','bundle-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
