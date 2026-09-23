import {readFile,writeFile,mkdir} from 'node:fs/promises';
const html=await readFile(process.argv[2]||'playlist-page.html','utf8');
const match=html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if(!match)throw Error('La page ne contient pas les données publiques attendues.');
const entity=JSON.parse(match[1])?.props?.pageProps?.state?.data?.entity;
if(entity?.type!=='playlist'||!Array.isArray(entity.trackList))throw Error('Playlist publique introuvable.');
const tracks=entity.trackList.filter(t=>t.entityType==='track').map(t=>({
  title:t.title,artist:t.subtitle,spotifyUri:t.uri,
  url:t.audioPreview?.url||null
}));
const playable=tracks.filter(t=>{
  try{return t.title&&t.artist&&new URL(t.url).protocol==='https:';}catch{return false;}
});
const snapshot={name:entity.title,source:`https://open.spotify.com/playlist/${entity.id}`,retrievedAt:new Date().toISOString(),exposedCount:tracks.length,playableCount:playable.length,complete:false,tracks};
await mkdir('public/playlists',{recursive:true});
await writeFile('public/playlists/karaoke.json',JSON.stringify(snapshot,null,2)+'\n');
const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
await writeFile('playlist-karaoke.csv','\uFEFF'+[['Titre','Artiste','Spotify URI'],...tracks.map(t=>[t.title,t.artist,t.spotifyUri])].map(r=>r.map(cell).join(',')).join('\r\n'));
console.log(JSON.stringify({name:snapshot.name,exposed:snapshot.exposedCount,withPreview:snapshot.playableCount,complete:false}));
