import test from 'node:test';
import assert from 'node:assert/strict';
import {DEMO,matchesAnswer,mergeTracks,balancedDeck} from '../game.mjs';
import {createRoom,addPlayer,start,readyAudio,answer,joker,reveal,publicState,transferHost,disconnected,teamScores,setAvatar,AVATARS,addTracks,removePlaylist,chat,setMeet} from '../engine.mjs';
import {parseSpotifyPage} from '../spotify-import.mjs';
function fixture(t,settings={}){
  const r=createRoom('TEST42'),a=addPlayer(r,'Alice'),b=addPlayer(r,'Bob');
  for(const p of [a,b]){p.ready=true;r.clients.set(p.id,{token:p.token,playerId:p.id,res:{write(){}}});}
  Object.assign(r.settings,settings);t.after(()=>{clearTimeout(r.timer);r.players.forEach(p=>clearTimeout(p.disconnectTimer));});return {r,a,b};
}
function playing(r){clearTimeout(r.timer);r.phase='playing';r.round.startsAt=Date.now()-1000;r.round.endsAt=Date.now()+19000;}
test('retirer une playlist garde les morceaux apportés par ailleurs',t=>{
  const {r,a,b}=fixture(t),track=(title,artist='X')=>({id:title,title,artist,url:'https://p.scdn.co/'+title});
  const add=(p,source,tracks)=>{addTracks(r,tracks,p,source);const pl={id:source+p.id,owner:p.id,source};r.playlists.push(pl);return pl;};
  const karaoke=add(a,'karaoke',[track('Commun'),track('Seul A')]),faso=add(a,'faso',[track('Commun'),track('Faso')]);add(b,'bob',[track('Seul A')]);
  assert.throws(()=>removePlaylist(r,b,karaoke.id),/introuvable/,'on ne retire que ses propres playlists');
  removePlaylist(r,a,karaoke.id);
  const titles=r.tracks.map(x=>x.title).sort();assert.deepEqual(titles,['Commun','Faso','Seul A']);
  assert.deepEqual(r.tracks.find(x=>x.title==='Seul A').owners,[b.id],'le morceau reste à Bob seul');
  assert.deepEqual(r.tracks.find(x=>x.title==='Commun').owners,[a.id],'encore apporté par l’autre playlist d’Alice');
  assert.equal(r.playlists.length,2);
  removePlaylist(r,a,faso.id);removePlaylist(r,b,'bob'+b.id);
  assert(r.tracks.length&&r.tracks.every(x=>x.demo),'la démo revient quand tout est retiré');
});
test('avatars : distincts à l’arrivée, modifiables, jamais en double',t=>{
  const {r,a,b}=fixture(t);
  const others=Array.from({length:10},(_,i)=>addPlayer(r,'J'+i)),all=[a,b,...others];
  assert.equal(new Set(all.map(p=>p.avatar)).size,12);assert(all.every(p=>AVATARS.includes(p.avatar)));
  const free=AVATARS.find(x=>!all.some(p=>p.avatar===x));setAvatar(r,a,free);assert.equal(a.avatar,free);
  assert.throws(()=>setAvatar(r,a,b.avatar),/déjà pris/);assert.throws(()=>setAvatar(r,a,'<b>'),/inconnu/);
  b.left=true;setAvatar(r,a,b.avatar);assert.equal(a.avatar,b.avatar,'l’avatar d’un joueur parti se libère');
  assert.equal(publicState(r,a).players.find(p=>p.id===a.id).avatar,a.avatar);
});
test('réponse libre : accents, ponctuation et fautes limitées, pas de fragments',()=>{
  assert(matchesAnswer('ED SHEERAN','Ed Sheeran'));assert(matchesAnswer('ete!','Été'));assert(matchesAnswer('Photograh','Photograph'));assert(!matchesAnswer('Ed','Ed Sheeran'));assert(!matchesAnswer('Mer','Mère'));assert(!matchesAnswer('','Perfect'));
});
test('fusion des contributions et tirage équilibré sans doublon',()=>{
  const tracks=DEMO.map((x,i)=>({...x,owners:[i<4?'a':'b']}));
  const merged=mergeTracks([...tracks,{...tracks[0],owners:['b']}]);assert.equal(merged.length,8);assert.deepEqual(merged[0].owners,['a','b']);
  for(let i=0;i<50;i++){const deck=balancedDeck(tracks,6);assert.equal(deck.length,6);assert.equal(deck.filter(t=>t.owners.includes('a')).length,3);assert.equal(new Set(deck.map(t=>t.id)).size,6);}
});
test('préchargement : attend les deux appareils, puis compte à rebours',t=>{
  const {r,a,b}=fixture(t);start(r);assert.equal(r.phase,'loading');readyAudio(r,a,{roundId:r.round.id,ok:true});assert.equal(r.phase,'loading');readyAudio(r,b,{roundId:r.round.id,ok:true});assert.equal(r.phase,'countdown');assert(r.round.startsAt>Date.now());assert.throws(()=>answer(r,a,{roundId:r.round.id,selection:{}}));
});
test('50/50 privé, +5 secondes personnel, une utilisation par partie',t=>{
  const {r,a,b}=fixture(t);start(r);playing(r);joker(r,a,{roundId:r.round.id,kind:'fifty'});
  assert(publicState(r,a).round.questions.every(q=>q.options.length===2));assert(publicState(r,b).round.questions.every(q=>q.options.length===4));
  for(const q of r.round.questions)assert(publicState(r,a).round.questions.find(x=>x.field===q.field).options.some(o=>o.id===q.correct));
  assert.throws(()=>joker(r,a,{roundId:r.round.id,kind:'fifty'}));joker(r,a,{roundId:r.round.id,kind:'time'});
  assert.equal(publicState(r,a).round.deadline,publicState(r,b).round.deadline+5000);assert.throws(()=>joker(r,a,{roundId:r.round.id,kind:'time'}));
});
test('progressif et réponse écrite : barème et historique individuel',t=>{
  const {r,a,b}=fixture(t,{input:'text',listening:'progressive',mode:'title'});start(r);playing(r);r.round.startsAt=Date.now()-8000;
  answer(r,a,{roundId:r.round.id,selection:{title:r.round.track.title}});assert.throws(()=>answer(r,a,{roundId:r.round.id,selection:{title:'autre'}}));
  answer(r,b,{roundId:r.round.id,selection:{title:'incorrect'}});assert.equal(r.phase,'playing');reveal(r);assert.equal(a.score,125);assert.equal(b.score,0);assert.equal(r.history.length,1);
  r.phase='finished';assert.equal(publicState(r,a).history[0].results.length,1);assert.equal(publicState(r,a).history[0].results[0].id,a.id);
});
test('bonus : tous les contributeurs du morceau sont acceptés',t=>{
  const {r,a,b}=fixture(t,{mode:'title'});r.tracks=r.tracks.map(x=>({...x,owners:[a.id,b.id]}));start(r);playing(r);
  const selection={title:r.round.questions[0].correct};answer(r,a,{roundId:r.round.id,selection,bonus:a.id});answer(r,b,{roundId:r.round.id,selection,bonus:b.id});reveal(r);assert(r.round.results.every(x=>x.bonusCorrect));assert(a.score>150);
});
test('erreur audio annule les points et rend les jokers',t=>{
  const {r,a}=fixture(t);start(r);playing(r);joker(r,a,{roundId:r.round.id,kind:'fifty'});joker(r,a,{roundId:r.round.id,kind:'time'});readyAudio(r,a,{roundId:r.round.id,ok:false});assert.equal(r.phase,'reveal');assert(r.round.canceled);assert.equal(a.score,0);assert.deepEqual(a.jokers,{fifty:false,time:false});
});
test('événements audio et réponses de manches anciennes ignorés ou refusés',t=>{
  const {r,a}=fixture(t);start(r);playing(r);readyAudio(r,a,{roundId:'ancienne',ok:false});assert.equal(r.phase,'playing');assert.throws(()=>answer(r,a,{roundId:'ancienne',selection:{}}));
});
test('équipes égales et total des points',t=>{
  const {r,a,b}=fixture(t,{teams:true});b.team=a.team;assert.throws(()=>start(r),/équipes/);b.team='purple';start(r);a.score=120;b.score=80;assert.deepEqual(teamScores(r).map(x=>x.score),[120,80]);
});
test('transfert automatique après délai de déconnexion',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const {r,a,b}=fixture(t);r.clients.delete(a.id);disconnected(r,a);assert.equal(r.host,a.id);t.mock.timers.tick(15000);assert.equal(r.host,b.id);
});
test('analyse de page publique : ignore les morceaux sans extrait',()=>{
  const entity={title:'Ma sélection',trackList:[{entityType:'track',title:'Titre',subtitle:'Artiste',uri:'spotify:track:test',audioPreview:{url:'https://p.scdn.co/mp3-preview/test'}},{entityType:'track',title:'Sans extrait',subtitle:'Autre'}]};
  const html='<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{state:{data:{entity}}}}})+'</script>';
  const result=parseSpotifyPage(html,'https://open.spotify.com/playlist/test');assert.equal(result.exposed,2);assert.equal(result.available,1);assert.equal(result.complete,false);assert.throws(()=>parseSpotifyPage('<html>Erreur</html>','test'));
});

test('chat borné et lien visio réservé au créateur',t=>{
 const {r,a,b}=fixture(t);chat(r,a,' Salut ! ');assert.equal(publicState(r,b).messages[0].text,'Salut !');assert.throws(()=>chat(r,a,'encore'));assert.throws(()=>chat(r,b,' '.repeat(5)));assert.throws(()=>chat(r,b,'x'.repeat(501)));
 assert.throws(()=>setMeet(r,b,'https://meet.google.com/abc-defg-hij'));assert.throws(()=>setMeet(r,a,'javascript:alert(1)'));setMeet(r,a,'https://meet.google.com/abc-defg-hij');assert.equal(publicState(r,b).meetUrl,r.meetUrl);setMeet(r,a,'');assert.equal(r.meetUrl,'');
});
test('toutes les réponses attendent la fin du chrono',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {r,a,b}=fixture(t);start(r);readyAudio(r,a,{roundId:r.round.id,ok:true});readyAudio(r,b,{roundId:r.round.id,ok:true});t.mock.timers.tick(3500);r.round.startsAt=Date.now()-100;
 const selection=Object.fromEntries(r.round.questions.map(q=>[q.field,q.correct]));answer(r,a,{roundId:r.round.id,selection});answer(r,b,{roundId:r.round.id,selection});assert.equal(r.phase,'playing');assert.equal(r.history.length,0);t.mock.timers.tick(24000);assert.equal(r.phase,'reveal');assert.equal(r.history.length,1);
});
