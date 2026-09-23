import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomInt} from 'node:crypto';
import {DEMO,token} from './game.mjs';
import {importSpotify} from './spotify-import.mjs';
import {createRoom,addPlayer,online,publicState,broadcast,readyAudio,addTracks,start,answer,joker,transferHost,disconnected,reactions} from './engine.mjs';
const rooms=new Map(),port=Number(process.env.PORT||4317);
const fail=m=>{throw Error(m)};
const member=(r,key)=>r.players.find(p=>p.token===key&&!p.left)||fail('Session expirée. Rejoins le salon.');
const roomFor=code=>rooms.get(code)||fail('Ce salon est introuvable.');
async function body(req){let data='';for await(const c of req){data+=c;if(data.length>250000)fail('Import trop volumineux.');}return JSON.parse(data||'{}');}
function cleanTrack(t){
  if(typeof t.title!=='string'||typeof t.artist!=='string'||!t.title.trim()||!t.artist.trim())fail('Titre et artiste requis.');
  const u=new URL(t.url);if(!['http:','https:'].includes(u.protocol))fail('Lien audio HTTP ou HTTPS requis.');
  return {id:token(),title:t.title.trim().slice(0,150),artist:t.artist.trim().slice(0,150),url:u.href};
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
    if(req.method==='GET'&&url.pathname==='/api/events'){
      const r=roomFor(url.searchParams.get('code')),key=url.searchParams.get('token'),p=member(r,key),id=token();
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
      r.clients.set(id,{res,token:key,playerId:p.id});p.offlineAt=null;clearTimeout(p.disconnectTimer);r.touched=Date.now();
      const currentHost=r.players.find(x=>x.id===r.host&&!x.left);
      if(!currentHost||(!online(r,currentHost)&&currentHost.offlineAt&&Date.now()-currentHost.offlineAt>=15000))transferHost(r);
      broadcast(r);const heartbeat=setInterval(()=>res.write(': ping\n\n'),20000);
      req.on('close',()=>{clearInterval(heartbeat);r.clients.delete(id);if(!online(r,p))disconnected(r,p);broadcast(r);});return;
    }
    if(req.method==='POST'&&url.pathname.startsWith('/api/')){
      if(req.headers.origin&&!['http://','https://'].some(s=>req.headers.origin===s+req.headers.host))fail('Origine refusée.');
      const b=await body(req),action=url.pathname.slice(5);
      if(action==='create'||action==='join'){
        const name=String(b.name||'').trim().slice(0,24);if(!name)fail('Choisis un pseudo.');let r;
        if(action==='create'){
          if(rooms.size>=200)fail('Le serveur est plein.');let code;const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';do{code=Array.from({length:6},()=>chars[randomInt(chars.length)]).join('');}while(rooms.has(code));r=createRoom(code);rooms.set(code,r);
        }else{r=roomFor(String(b.code||'').toUpperCase());if(r.phase!=='lobby')fail('La partie a déjà commencé. Utilise ton lien de retour si tu étais déjà joueur.');if(r.players.filter(p=>!p.left).length>=12)fail('Le salon est complet.');}
        const p=addPlayer(r,name);r.touched=Date.now();broadcast(r);send(200,{code:r.code,token:p.token});return;
      }
      const r=roomFor(b.code),p=member(r,b.token);r.touched=Date.now();
      const host=()=>{if(p.id!==r.host)fail('Seul le créateur peut faire cela.');};
      const lobby=()=>{if(r.phase!=='lobby')fail('Attends la fin de la partie.');};
      let result={ok:true};
      if(action==='state'){send(200,publicState(r,p));return;}
      if(action==='settings'){
        host();lobby();const s={...r.settings,...b.settings};
        // Accept legacy fields for older saved clients and integration scripts.
        for(const key of ['mode','rounds','seconds'])if(b[key]!==undefined)s[key]=b[key];
        if(!['title','artist','both'].includes(s.mode)||!['qcm','text'].includes(s.input)||!['classic','progressive'].includes(s.listening))fail('Mode invalide.');
        r.settings={mode:s.mode,input:s.input,listening:s.listening,rounds:Math.max(1,Math.min(30,Math.floor(Number(s.rounds)||8))),seconds:Math.max(10,Math.min(30,Math.floor(Number(s.seconds)||20))),balanced:!!s.balanced,bonus:!!s.bonus,teams:!!s.teams,jokers:!!s.jokers};r.players.forEach(p=>p.ready=false);
      }else if(action==='ready'){lobby();p.ready=!!b.ready;}
      else if(action==='team'){lobby();if(!['lime','purple'].includes(b.team))fail('Équipe inconnue.');p.team=b.team;p.ready=false;}
      else if(action==='transfer'){host();const target=r.players.find(x=>x.id===b.playerId&&!x.left&&online(r,x));if(!target)fail('Choisis un joueur connecté.');r.host=target.id;}
      else if(action==='leave'){
        p.left=true;p.ready=false;for(const [id,c]of r.clients)if(c.playerId===p.id){c.res.end();r.clients.delete(id);}if(r.host===p.id)transferHost(r);
      }else if(action==='tracks'){
        lobby();if(!Array.isArray(b.tracks)||!b.tracks.length||b.tracks.length>100)fail('Ajoute entre 1 et 100 morceaux.');addTracks(r,b.tracks.map(cleanTrack),p);
      }else if(action==='playlist'){
        lobby();if(p.importing)fail('Un import est déjà en cours.');if(p.lastImport&&Date.now()-p.lastImport<5000)fail('Patiente quelques secondes avant un nouvel import.');p.importing=true;p.lastImport=Date.now();
        try{
          let data;
          if(b.saved){const saved=JSON.parse(await readFile(new URL('./public/playlists/karaoke.json',import.meta.url),'utf8'));data={name:saved.name,source:saved.source,exposed:saved.exposedCount,available:saved.playableCount,tracks:saved.tracks.filter(t=>t.url).map(cleanTrack)};}
          else data=await importSpotify(b.url);
          lobby();if(p.left)fail('Tu as quitté le salon.');addTracks(r,data.tracks,p);
          r.playlists=r.playlists.filter(x=>!(x.owner===p.id&&x.source===data.source));r.playlists.push({id:token(),owner:p.id,name:data.name,source:data.source,exposed:data.exposed,available:data.available});
          result={ok:true,name:data.name,exposed:data.exposed,available:data.available,complete:false};
        }catch(err){if(err.name==='TimeoutError'||err.message==='fetch failed')throw Error('Spotify est injoignable. Réessaie ou utilise la playlist sauvegardée.');throw err;}finally{p.importing=false;}
      }else if(action==='demo'){host();lobby();r.tracks=DEMO.map(t=>({...t,owners:[]}));r.playlists=[];r.players.forEach(p=>p.ready=false);}
      else if(action==='start'){host();lobby();if(r.players.some(p=>p.importing))fail('Attends la fin des imports.');start(r);}
      else if(action==='audio-ready'){readyAudio(r,p,b);}
      else if(action==='audio-error'){readyAudio(r,p,{...b,ok:false});}
      else if(action==='answer'){answer(r,p,b);}
      else if(action==='joker'){joker(r,p,b);}
      else if(action==='reaction'){
        if(!['reveal','finished'].includes(r.phase)||!reactions.includes(b.reaction))fail('Réaction indisponible.');if(Date.now()-(p.lastReaction||0)<1500)fail('Doucement sur les réactions !');p.lastReaction=Date.now();r.reactions.push({id:token(),name:p.name,text:b.reaction});r.reactions=r.reactions.slice(-8);
      }else if(action==='restart'){host();if(r.phase!=='finished')fail('La partie n’est pas terminée.');r.phase='lobby';r.round=null;r.history=[];r.reactions=[];r.players=r.players.filter(p=>!p.left);r.players.forEach(p=>{p.score=0;p.ready=false;});}
      else fail('Action inconnue.');
      broadcast(r);send(200,result);return;
    }
    if(['GET','HEAD'].includes(req.method)){
      const paths={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/features.css':'features.css','/favicon.svg':'favicon.svg','/guide':'guide.html','/spotify':'spotify.html','/spotify.js':'spotify.js','/spotify-url.js':'spotify-url.js','/playlists/karaoke.json':'playlists/karaoke.json'};
      if(paths[url.pathname]){const file=paths[url.pathname],data=await readFile(fileURLToPath(new URL(`./public/${file}`,import.meta.url)));res.writeHead(200,{'Content-Type':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.json')?'application/json; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);return;}
    }send(404,{error:'Introuvable'});
  }catch(e){if(!res.headersSent)send(400,{error:e.message==='Invalid URL'?'Lien invalide.':e.message});else res.end();}
});
setInterval(()=>{for(const [code,r]of rooms)if(!r.clients.size&&Date.now()-r.touched>2*3600000){clearTimeout(r.timer);r.players.forEach(p=>clearTimeout(p.disconnectTimer));rooms.delete(code);}},60000).unref();
server.listen(port,'0.0.0.0',()=>console.log(`Encore : http://localhost:${port}`));
