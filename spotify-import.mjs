import {spotifyPlaylist} from './public/spotify-url.js';
import {token} from './game.mjs';
const cache=new Map();
export function parseSpotifyPage(html,source){
  const match=html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if(!match)throw Error('Spotify ne fournit pas de liste exploitable pour cette playlist.');
  const entity=JSON.parse(match[1])?.props?.pageProps?.state?.data?.entity;
  if(!Array.isArray(entity?.trackList))throw Error('Playlist inaccessible ou privée.');
  const exposed=entity.trackList.filter(t=>t.entityType==='track');
  const tracks=exposed.filter(t=>t.title&&t.subtitle&&/^https:\/\/[^/]*scdn\.co\//.test(t.audioPreview?.url||'')).map(t=>({id:token(),title:t.title,artist:t.subtitle,url:t.audioPreview.url,spotifyUri:t.uri,owners:[]}));
  if(!tracks.length)throw Error('Aucun extrait jouable exposé par cette playlist.');
  return {name:entity.title||'Playlist Spotify',source,exposed:exposed.length,available:tracks.length,complete:false,tracks};
}
export async function importSpotify(value){
  const playlist=spotifyPlaylist(value),saved=cache.get(playlist.id);
  if(saved&&Date.now()-saved.at<300000)return structuredClone(saved.data);
  const response=await fetch(`https://open.spotify.com/embed/playlist/${playlist.id}`,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{'Accept':'text/html'}});
  if(!response.ok)throw Error(`Spotify ne répond pas à cet import (${response.status}).`);
  let html='';const decoder=new TextDecoder();for await(const chunk of response.body){html+=decoder.decode(chunk,{stream:true});if(html.length>3_000_000)throw Error('Page Spotify trop volumineuse.');}html+=decoder.decode();
  const data=parseSpotifyPage(html,playlist.url);cache.set(playlist.id,{at:Date.now(),data});if(cache.size>100)cache.delete(cache.keys().next().value);return structuredClone(data);
}
