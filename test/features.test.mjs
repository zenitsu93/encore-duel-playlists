import test from 'node:test';
import assert from 'node:assert/strict';
import {DEMO,matchesAnswer,mergeTracks,balancedDeck} from '../game.mjs';
import {createRoom,addPlayer,start,readyAudio,answer,joker,reveal,publicState,transferHost,disconnected,teamScores} from '../engine.mjs';
import {parseSpotifyPage} from '../spotify-import.mjs';
function fixture(t,settings={}){
  const r=createRoom('TEST42'),a=addPlayer(r,'Alice'),b=addPlayer(r,'Bob');
  for(const p of [a,b]){p.ready=true;r.clients.set(p.id,{token:p.token,playerId:p.id,res:{write(){}}});}
  Object.assign(r.settings,settings);t.after(()=>{clearTimeout(r.timer);r.players.forEach(p=>clearTimeout(p.disconnectTimer));});return {r,a,b};
}
function playing(r){clearTimeout(r.timer);r.phase='playing';r.round.startsAt=Date.now()-1000;r.round.endsAt=Date.now()+19000;}
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
  answer(r,b,{roundId:r.round.id,selection:{title:'incorrect'}});assert.equal(r.phase,'reveal');assert.equal(a.score,125);assert.equal(b.score,0);assert.equal(r.history.length,1);
  r.phase='finished';assert.equal(publicState(r,a).history[0].results.length,1);assert.equal(publicState(r,a).history[0].results[0].id,a.id);
});
test('bonus : tous les contributeurs du morceau sont acceptés',t=>{
  const {r,a,b}=fixture(t,{mode:'title'});r.tracks=r.tracks.map(x=>({...x,owners:[a.id,b.id]}));start(r);playing(r);
  const selection={title:r.round.questions[0].correct};answer(r,a,{roundId:r.round.id,selection,bonus:a.id});answer(r,b,{roundId:r.round.id,selection,bonus:b.id});assert(r.round.results.every(x=>x.bonusCorrect));assert(a.score>150);
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
