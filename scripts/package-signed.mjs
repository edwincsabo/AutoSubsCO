import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build,Platform,Arch} from 'electron-builder';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),certificate=process.env.WIN_CSC_LINK??process.env.CSC_LINK;
if(!certificate||!path.isAbsolute(certificate))throw new Error('Configura CSC_LINK con la ruta absoluta de un certificado de firma de código .pfx o .p12 autorizado. No guardes el certificado ni su contraseña en el proyecto.');
if(!/\.(pfx|p12)$/i.test(certificate))throw new Error('El certificado debe ser .pfx o .p12.');await fs.access(certificate);process.env.CSC_LINK=certificate;
// La contraseña, si hace falta, se toma de CSC_KEY_PASSWORD o WIN_CSC_KEY_PASSWORD.
// forceCodeSigning evita producir por error otra entrega sin firma.
await build({projectDir:root,targets:Platform.WINDOWS.createTarget('portable',Arch.x64),config:{forceCodeSigning:true,win:{signExecutable:true,signExts:['.exe','.dll','.pyd']}}});
