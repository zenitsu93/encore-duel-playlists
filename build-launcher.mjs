import {mkdir,copyFile,writeFile} from 'node:fs/promises';
const server=new URL(process.env.ENCORE_SERVER_URL||'');
if(!['https:','http:'].includes(server.protocol)||server.username||server.password||server.pathname!=='/'||server.search||server.hash)throw Error('ENCORE_SERVER_URL doit être une origine HTTP(S), sans chemin ni identifiants.');
await mkdir('dist-launcher',{recursive:true});
for(const file of ['index.html','waiting.css','waiting.js'])await copyFile(`launcher/${file}`,`dist-launcher/${file}`);
for(const file of ['style.css','favicon.svg'])await copyFile(`public/${file}`,`dist-launcher/${file}`);
await writeFile('dist-launcher/config.js',`window.ENCORE_SERVER = ${JSON.stringify(server.origin)};\n`);
console.log('Page de démarrage générée dans dist-launcher/');
