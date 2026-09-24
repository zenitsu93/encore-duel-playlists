import {DEMO,token,questions,shuffle,points,matchesAnswer,balancedDeck,mergeTracks} from './game.mjs';
import {SAVED} from './playlists.mjs';
export const defaults={mode:'both',rounds:8,seconds:20,input:'qcm',listening:'classic',balanced:true,bonus:true,teams:false,jokers:true};
export const reactions=['😂','🔥','👏','😭','Je la connaissais !'];
export function createRoom(code){return {code,phase:'lobby',players:[],clients:new Map(),tracks:DEMO.map(t=>({...t,owners:[]})),playlists:[],settings:{...defaults},history:[],reactions:[],touched:Date.now()};}
// Avatars « Big Smile » (Ashley Seo, CC BY 4.0, via DiceBear), servis depuis public/avatars/<id>.svg.
export const AVATARS=['zoe','kofi','aya','omar','awa','mariam','yann','chloe','ines','sami','fatou','theo','moussa','rose','idriss','emma','mila','sara'];
const takenAvatars=(r,except)=>r.players.filter(x=>!x.left&&x!==except).map(x=>x.avatar);
export function addPlayer(r,name){const free=AVATARS.filter(a=>!takenAvatars(r).includes(a)),p={id:token(),token:token(),name,avatar:shuffle(free)[0]||AVATARS[0],score:0,ready:false,team:r.players.length%2?'purple':'lime',jokers:{fifty:false,time:false},offlineAt:null};r.players.push(p);r.host??=p.id;return p;}
export function setAvatar(r,p,avatar){if(!AVATARS.includes(avatar))fail('Avatar inconnu.');if(takenAvatars(r,p).includes(avatar))fail('Cet avatar est déjà pris.');p.avatar=avatar;}
export function online(r,p){return [...r.clients.values()].some(c=>c.playerId===p.id);}
export function teamScores(r){return ['lime','purple'].map(id=>({id,name:id==='lime'?'Équipe Or':'Équipe Ciel',score:r.players.filter(p=>p.team===id).reduce((s,p)=>s+p.score,0)}));}
export function publicState(r,p){
  const q=r.round,revealed=['reveal','finished'].includes(r.phase),answer=q?.answers[p.id];
  return {code:r.code,phase:r.phase,host:r.host,me:p.id,settings:r.settings,serverNow:Date.now(),
    avatars:AVATARS,players:r.players.map(x=>({id:x.id,name:x.name,avatar:x.avatar,score:x.score,ready:x.ready,team:x.team,left:!!x.left,online:online(r,x),answered:!!q?.answers[x.id]})),
    teams:teamScores(r),jokers:p.jokers,playlists:r.playlists,saved:SAVED,reactions:r.reactions,
    tracks:r.phase==='lobby'?r.tracks.map(({id,title,artist,demo,owners,curator})=>({id,title,artist,demo,owners,curator})):[],
    history:r.phase==='finished'?r.history.map(h=>({...h,results:h.results.filter(x=>x.id===p.id)})):[],
    round:q?{id:q.id,number:Math.min(r.index+1,r.deck.length),total:r.deck.length,startsAt:q.startsAt,endsAt:q.endsAt,deadline:q.endsAt+(q.extra[p.id]||0),
      audio:q.track.demo?{notes:q.track.notes}:{url:q.track.url},stage:r.settings.listening==='progressive'?[{at:0,length:2},{at:7,length:5},{at:17,length:10}]:null,
      questions:q.questions.map(x=>({field:x.field,options:r.settings.input==='qcm'?x.options.filter(o=>!q.hidden[p.id]?.includes(o.id)):[],...(revealed?{correct:x.correct,label:q.track[x.field]}:{})})),
      bonus:q.bonus?{options:q.bonus.options,...(revealed?{correct:q.track.owners}:{})}:null,
      selection:answer?.selection,bonusSelection:answer?.bonus,canAnswer:q.participants.includes(p.id),
      ...(revealed?{track:{title:q.track.title,artist:q.track.artist},results:q.results,canceled:q.canceled,reason:q.reason}:{})}:null};
}
export function broadcast(r){for(const c of r.clients.values()){const p=r.players.find(p=>p.token===c.token);if(p)c.res.write(`data: ${JSON.stringify(publicState(r,p))}\n\n`);}}
const fail=m=>{throw Error(m)};
function scheduleEnd(r){clearTimeout(r.timer);r.timer=setTimeout(()=>reveal(r),Math.max(0,r.round.endsAt+Math.max(0,...Object.values(r.round.extra))-Date.now()));}
export function reveal(r,canceled=false,reason=''){
  if(!['loading','countdown','playing'].includes(r.phase))return;clearTimeout(r.timer);r.phase='reveal';const q=r.round;q.canceled=canceled;q.reason=reason;
  q.results=r.players.map(p=>{
    const a=q.answers[p.id],flags=q.questions.map(x=>r.settings.input==='text'?matchesAnswer(a?.selection[x.field],q.track[x.field]):a?.selection[x.field]===x.correct);
    const correct=flags.filter(Boolean).length;
    const base=r.settings.listening==='progressive'?(a?.elapsed<7000?150:a?.elapsed<17000?125:100):null;
    let earned=canceled?0:flags.reduce((sum,ok)=>sum+(base===null?points(ok,a?.elapsed??1e9,(q.endsAt-q.startsAt),flags.length):ok?Math.round(base/flags.length):0),0);
    const bonusCorrect=!!q.bonus&&q.track.owners.includes(a?.bonus);if(bonusCorrect&&!canceled)earned+=25;
    if(canceled){if(q.usedFifty.includes(p.id))p.jokers.fifty=false;if(q.extra[p.id])p.jokers.time=false;}
    p.score+=earned;return {id:p.id,earned,correct: canceled?0:correct,total:flags.length,bonusCorrect:!canceled&&bonusCorrect,elapsed:a?.elapsed??null};
  });
  r.history.push({number:r.index+1,title:q.track.title,artist:q.track.artist,canceled,reason,results:q.results});
  broadcast(r);r.timer=setTimeout(()=>nextRound(r),5000);
}
function beginCountdown(r){clearTimeout(r.timer);r.phase='countdown';r.round.startsAt=Date.now()+3500;r.round.endsAt=r.round.startsAt+(r.settings.listening==='progressive'?30:r.settings.seconds)*1000;broadcast(r);r.timer=setTimeout(()=>{r.phase='playing';broadcast(r);scheduleEnd(r);},3500);}
export function nextRound(r){
  clearTimeout(r.timer);r.index++;r.reactions=[];
  if(r.index>=r.deck.length){r.phase='finished';broadcast(r);return;}
  const track=r.deck[r.index],participants=r.players.filter(p=>!p.left&&online(r,p)).map(p=>p.id);
  const qs=r.settings.input==='qcm'?questions(track,r.tracks,r.settings.mode):(r.settings.mode==='both'?['title','artist']:[r.settings.mode]).map(field=>({field,options:[],correct:null}));
  const owners=r.players.filter(p=>r.tracks.some(t=>t.owners?.includes(p.id)));
  r.round={id:token(),track,questions:qs,answers:{},participants,loaded:[],hidden:{},extra:{},usedFifty:[],startsAt:0,endsAt:0,bonus:r.settings.bonus&&track.owners?.length&&owners.length>1?{options:owners.map(p=>({id:p.id,label:p.name}))}:null};
  r.phase='loading';broadcast(r);
  if(!participants.length){reveal(r,true,'Aucun joueur connecté.');return;}
  r.timer=setTimeout(()=>reveal(r,true,'Un extrait n’a pas chargé à temps sur tous les appareils.'),15000);
}
export function readyAudio(r,p,b){
  const q=r.round;if(!q||b.roundId!==q.id)return;
  if(b.ok===false&&['loading','countdown','playing'].includes(r.phase)&&q.participants.includes(p.id)){reveal(r,true,'Lecture impossible sur un appareil : manche annulée pour tous.');return;}
  if(r.phase!=='loading'||!q.participants.includes(p.id))return;
  if(!q.loaded.includes(p.id))q.loaded.push(p.id);if(q.participants.every(id=>q.loaded.includes(id)))beginCountdown(r);
}
// Chaque morceau garde la trace de ses apports « joueur|source » pour pouvoir retirer une playlist sans toucher aux autres.
export function addTracks(r,tracks,p,source='manual'){
  const incoming=tracks.map(t=>({...t,owners:[p.id],from:[p.id+'|'+source]}));const merged=mergeTracks([...r.tracks.filter(t=>!t.demo),...incoming]);if(merged.length>1000)fail('Maximum 1 000 morceaux par salon.');r.tracks=merged;r.players.forEach(p=>p.ready=false);
}
export function removePlaylist(r,p,id){
  const pl=r.playlists.find(x=>x.id===id&&x.owner===p.id);if(!pl)fail('Playlist introuvable.');const key=p.id+'|'+pl.source;
  r.tracks=r.tracks.map(t=>t.from?.includes(key)?{...t,from:t.from.filter(k=>k!==key)}:t).filter(t=>t.demo||!t.from||t.from.length).map(t=>t.from?{...t,owners:[...new Set(t.from.map(k=>k.split('|')[0]))]}:t);
  if(!r.tracks.length)r.tracks=DEMO.map(t=>({...t,owners:[]}));
  r.playlists=r.playlists.filter(x=>x!==pl);r.players.forEach(x=>x.ready=false);
}
export function start(r){
  const active=r.players.filter(p=>!p.left&&online(r,p));if(active.length<2)fail('Invite au moins deux joueurs connectés.');if(active.some(p=>!p.ready))fail('Tous les joueurs connectés doivent être prêts.');
  if(r.settings.teams){const a=active.filter(p=>p.team==='lime').length,b=active.length-a;if(!a||a!==b)fail('Les deux équipes doivent avoir le même nombre de joueurs.');}
  r.players=r.players.filter(p=>!p.left);if(r.settings.input==='qcm')questions(r.tracks[0]||fail('Ajoute des morceaux.'),r.tracks,r.settings.mode);
  r.deck=balancedDeck(r.tracks,r.settings.rounds,r.settings.balanced);if(!r.deck.length)fail('Ajoute des morceaux.');
  r.players.forEach(p=>{p.score=0;p.jokers={fifty:false,time:false};});r.history=[];r.index=-1;nextRound(r);
}
export function answer(r,p,b){
  const q=r.round,now=Date.now();if(r.phase!=='playing'||b.roundId!==q.id||now<q.startsAt||now>=q.endsAt+(q.extra[p.id]||0))fail('Cette manche est terminée.');
  if(!q.participants.includes(p.id))fail('Tu participeras à la prochaine manche.');if(q.answers[p.id])fail('Réponse déjà validée.');
  const selection={};for(const x of q.questions){const value=b.selection?.[x.field];if(r.settings.input==='qcm'){if(!x.options.some(o=>o.id===value)||q.hidden[p.id]?.includes(value))fail('Choisis une réponse à chaque question.');}else if(typeof value!=='string'||!value.trim()||value.length>150)fail('Écris une réponse à chaque question.');selection[x.field]=value;}
  const bonus=q.bonus?.options.some(o=>o.id===b.bonus)?b.bonus:null;q.answers[p.id]={selection,bonus,elapsed:now-q.startsAt};
  if(q.participants.every(id=>q.answers[id]||!r.players.some(p=>p.id===id&&online(r,p))))reveal(r);
}
export function joker(r,p,b){
  const q=r.round;if(!r.settings.jokers||r.phase!=='playing'||b.roundId!==q.id||!q.participants.includes(p.id)||q.answers[p.id]||Date.now()>=q.endsAt+(q.extra[p.id]||0))fail('Joker indisponible.');
  if(b.kind==='fifty'){
    if(p.jokers.fifty||r.settings.input!=='qcm')fail('50/50 indisponible.');p.jokers.fifty=true;q.usedFifty.push(p.id);q.hidden[p.id]=q.questions.flatMap(x=>shuffle(x.options.filter(o=>o.id!==x.correct)).slice(0,2).map(o=>o.id));
  }else if(b.kind==='time'){if(p.jokers.time)fail('Joker temps déjà utilisé.');p.jokers.time=true;q.extra[p.id]=5000;scheduleEnd(r);}else fail('Joker inconnu.');
}
export function transferHost(r){const next=r.players.find(p=>!p.left&&online(r,p));if(next)r.host=next.id;}
export function disconnected(r,p){
  p.offlineAt=Date.now();clearTimeout(p.disconnectTimer);p.disconnectTimer=setTimeout(()=>{if(!online(r,p)&&r.host===p.id){transferHost(r);broadcast(r);}},15000);
}
