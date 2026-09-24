// Signaling stays inside an authenticated game room. Media travels via WebRTC.
export function voiceState(r,p,b){
  if(typeof b.active!=='boolean')throw Error('État vocal invalide.');
  if(b.active&&![...r.clients.values()].some(c=>c.playerId===p.id))throw Error('Reconnecte-toi au salon.');
  if(b.active&&(typeof b.voiceId!=='string'||! /^[a-zA-Z0-9-]{8,80}$/.test(b.voiceId)))throw Error('Session vocale invalide.');
  if(!b.active&&b.voiceId!==p.voice?.id)return;
  p.voice=b.active?{id:b.voiceId,muted:b.muted!==false}:null;
}
export function voiceSignal(r,p,b){
  const target=r.players.find(x=>x.id===b.to&&!x.left);
  if(!p.voice||p.voice.id!==b.voiceId||!target?.voice||target.voice.id!==b.targetVoiceId)throw Error('Session vocale terminée.');
  const s=b.signal;
  if(!s||JSON.stringify(s).length>20000||!['offer','answer','candidate'].includes(s.type))throw Error('Signal vocal invalide.');
  if(s.type!=='candidate'&&typeof s.sdp!=='string')throw Error('Description vocale invalide.');
  if(s.type==='candidate'&&(!s.candidate||typeof s.candidate.candidate!=='string'))throw Error('Candidat vocal invalide.');
  const now=Date.now();if(!p.signalWindow||now-p.signalWindow.at>10000)p.signalWindow={at:now,count:0};
  if(++p.signalWindow.count>400)throw Error('Trop de signaux vocaux.');
  const event=JSON.stringify({from:p.id,voiceId:p.voice.id,targetVoiceId:target.voice.id,signal:s});
  for(const c of r.clients.values())if(c.playerId===target.id)c.res.write(`event: voice\ndata: ${event}\n\n`);
}
