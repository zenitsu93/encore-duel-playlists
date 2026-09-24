import {readFile} from 'node:fs/promises';

export function parseIceServers(value){
  let servers;try{servers=JSON.parse(value);}catch{throw Error('Configuration vocale : JSON invalide.');}
  if(!Array.isArray(servers)||!servers.length||servers.length>20)throw Error('Configuration vocale : liste de serveurs ICE invalide.');
  return servers.map(server=>{
    const urls=Array.isArray(server?.urls)?server.urls:[server?.urls];
    if(!urls.length||urls.some(url=>typeof url!=='string'||! /^(stun|stuns|turn|turns):[^\s]+$/.test(url)))throw Error('Configuration vocale : adresse ICE invalide.');
    const turn=urls.some(url=>/^turns?:/.test(url));
    if(turn&&(typeof server.username!=='string'||!server.username||typeof server.credential!=='string'||!server.credential))throw Error('Configuration vocale : identifiants TURN manquants.');
    return {urls:server.urls,...(turn?{username:server.username,credential:server.credential}:{})};
  });
}

export async function voiceIceServers(){
  if(process.env.VOICE_ICE_SERVERS)return parseIceServers(process.env.VOICE_ICE_SERVERS);
  let value;try{value=await readFile(new URL('./voice-ice.local.json',import.meta.url),'utf8');}catch(error){if(error.code==='ENOENT')return [{urls:'stun:stun.l.google.com:19302'}];throw Error('Configuration vocale locale inaccessible.');}
  return parseIceServers(value);
}
