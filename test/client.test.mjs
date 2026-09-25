import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function client(){
  const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{},setAttribute(){},focus(){},setSelectionRange(){}});return elements.get(id);};
  const storage=()=>({getItem(){return null;},setItem(){},removeItem(){}}),handlers={};
  const context=vm.createContext({document:{querySelector:element,activeElement:null,addEventListener(type,fn){(handlers[type]??=[]).push(fn);}},sessionStorage:storage(),localStorage:storage(),location:{search:'',origin:'http://localhost:4317'},history:{replaceState(){}},URLSearchParams,URL,console,setInterval(){},setTimeout(){},clearTimeout(){},window:{},navigator:{}});
  vm.runInContext(source,context);
  const click=async dataset=>{for(const fn of handlers.click||[])await fn({target:{closest:()=>({dataset})}});};
  return {context,element,click,run:code=>vm.runInContext(code,context)};
}
const state={code:'TEST42',host:'a',me:'a',phase:'lobby',players:[{id:'a',name:'Alice',score:0,ready:true,online:true,team:'lime'},{id:'b',name:'Bob',score:0,ready:true,online:true,team:'purple'}],tracks:[{id:'1',title:'<script>bad</script>',artist:'Artiste',owners:['a']}],settings:{mode:'both',input:'qcm',listening:'progressive',seconds:20,rounds:8,teams:true,jokers:true,balanced:true,bonus:true},playlists:[],jokers:{fifty:false,time:false},teams:[{id:'lime',name:'Or',score:0},{id:'purple',name:'Ciel',score:0}],reactions:[],history:[]};
test('client : accueil, salon, variantes, rendu texte échappé',()=>{
  const c=client();assert(c.element('#app').innerHTML.includes('Comment jouer'));c.run(`state=${JSON.stringify(state)}; render();`);
  const html=c.element('#app').innerHTML;assert(html.includes('playlist-form'));assert(html.includes('data-setting="listening"'));assert(html.includes('Mon équipe'));assert(html.includes('&lt;script&gt;bad&lt;/script&gt;'));assert(!html.includes('<script>bad'));
});
test('client : un clic sur une sélection toute prête l’importe',async()=>{
  const c=client(),s={...structuredClone(state),saved:[{id:'faso-vibes',name:'Faso Vibes 🇧🇫'}]};
  c.run(`state=${JSON.stringify(s)}; render(); var calls=[]; api=async(action,data)=>{calls.push([action,data]);return {name:'Faso Vibes 🇧🇫',available:59,exposed:61};};`);
  assert(c.element('#app').innerHTML.includes('data-saved="faso-vibes"'));
  await c.click({saved:'faso-vibes'});
  assert.deepEqual(JSON.parse(c.run('JSON.stringify(calls)')),[['playlist',{saved:'faso-vibes'}]]);
});
test('invité : avatar et prêt, playlist visible sans commande de modification',()=>{
  const c=client(),s={...structuredClone(state),me:'b',avatars:['zoe'],playlists:[{name:'Soirée entre amis',owner:'a'}]};
  c.run(`state=${JSON.stringify(s)};render();`);const html=c.element('#app').innerHTML;
  assert(html.includes('data-avatar="zoe"'));assert(html.includes('data-action="ready"'));assert(html.includes('Soirée entre amis'));assert(!html.includes('social-launcher'));
  for(const control of ['playlist-form','data-saved=','data-remove-playlist=','data-setting=','id="team"'])assert(!html.includes(control),control);
  c.run("state.host='b';render();");assert(c.element('#app').innerHTML.includes('playlist-form'));
});
test('prêt : double clic et clic tardif ne peuvent pas annuler le statut',async()=>{
  const c=client(),s=structuredClone(state);s.players[0].ready=false;
  c.run(`state=${JSON.stringify(s)};var readyCalls=[];var releaseUnlock;unlock=()=>new Promise(resolve=>releaseUnlock=resolve);api=async(action,data)=>{readyCalls.push([action,data]);state.players[0].ready=true;};render();`);
  const first=c.click({action:'ready'});await c.click({action:'ready'});c.run('releaseUnlock();');await first;await c.click({action:'ready'});
  assert.deepEqual(JSON.parse(c.run('JSON.stringify(readyCalls)')),[['ready',{ready:true}]]);
  assert(c.element('#app').innerHTML.includes('data-action="ready" disabled'));
  assert(c.run('micIcon(false)').includes('class="mic-icon"'));assert(!c.element('#app').innerHTML.includes('Prêt ! Annuler'));
});
test('client : réponse écrite, bonus, jokers et récapitulatif',()=>{
  const c=client(),s=structuredClone(state);s.phase='playing';s.settings.input='text';s.round={id:'r',number:1,total:1,startsAt:Date.now(),endsAt:Date.now()+30000,deadline:Date.now()+30000,canAnswer:true,questions:[{field:'title',options:[]}],bonus:{options:[{id:'a',label:'Alice'}]},stage:[{at:0,length:2}]};
  c.run(`state=${JSON.stringify(s)}; render();`);assert(c.element('#app').innerHTML.includes('data-text-field="title"'));assert(c.element('#app').innerHTML.includes('data-joker="time"'));assert(!c.element('#app').innerHTML.includes('data-joker="fifty"'));assert(c.element('#app').innerHTML.includes('Qui a ajouté ce son'));
  s.phase='finished';s.history=[{number:1,title:'Titre',artist:'Artiste',canceled:false,results:[{id:'a',correct:1,total:1,earned:150,elapsed:1200}]}];
  c.run(`state=${JSON.stringify(s)}; render();`);assert(c.element('#app').innerHTML.includes('100&nbsp;%'));assert(c.element('#app').innerHTML.includes('1,2 s'));assert(c.element('#app').innerHTML.includes('data-action="download"'));
});
test('audio : un refus autoplay reste local et le clic relance la manche courante',async()=>{
  const c=client();
  c.run(`state={phase:'playing',round:{id:'r',canAnswer:true,audio:{url:'https://example.com/a.mp3'},startsAt:Date.now()-1000,endsAt:Date.now()+19000,deadline:Date.now()+19000}};
    let reports=[];api=async(action)=>reports.push(action);
    audio={currentTime:0,pause(){},play(){return Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));}};`);
  await c.run(`playClip(state.round,'r',19,1)`);
  assert.equal(c.run('needsTap'),true);assert.equal(c.run('reports.length'),0);
  assert(c.element('[data-action="audio"]').textContent.includes('Écouter cette manche'));
  c.run('let plays=0;audio.play=()=>{plays++;return Promise.resolve();};retryAudio();');
  await Promise.resolve();assert.equal(c.run('plays'),1);assert.equal(c.run('needsTap'),false);assert.equal(c.run('reports.length'),0);
});
test('audio : une erreur tardive de l’ancien morceau ne touche pas le suivant',async()=>{
  const c=client();c.run(`state={phase:'playing',round:{id:'old',audio:{url:'https://example.com/a.mp3'}}};let reports=[];api=async(action)=>reports.push(action);let rejectPlay;audio={currentTime:0,pause(){},play(){return new Promise((resolve,reject)=>rejectPlay=reject);}};`);
  const pending=c.run(`playClip(state.round,'old',10,0)`);
  c.run(`loadTask++;state.round.id='new';rejectPlay(new Error('ancienne erreur'));`);
  await pending;assert.equal(c.run('reports.length'),0);
});
test('audio : changer de manche conserve le lecteur sans charger une source vide',()=>{
  const c=client();c.run(`let emptied=0;player={pause(){},removeAttribute(){emptied++;},load(){emptied++;}};audio=player;resetAudio();`);
  assert.equal(c.run('emptied'),0);assert.equal(c.run('mediaPlayer()===player'),true);
});

test('chat escaped, drafts preserved, upload first',()=>{
 const c=client(),s=structuredClone(state);s.messages=[{name:'<b>Alice</b>',text:'<script>alert(1)</script>'}];s.meetUrl='https://meet.google.com/abc-defg-hij';
 c.run(`state=${JSON.stringify(s)};render();`);assert(c.element('#app').innerHTML.indexOf('playlist-form')<c.element('#app').innerHTML.indexOf('Les joueurs'));
 c.run(`state.phase='finished';render();completeFinale();socialOpen=true;chatDraft='message en cours';render();`);const html=c.element('#app').innerHTML;
 assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert(html.includes('value="message en cours"'));assert(!html.includes('social-launcher'));assert(html.includes('Rejoindre le vocal'));assert(!html.includes('meet-form'));
});
test('audio keeps playing after answer until personal deadline',()=>{
 const c=client();c.run(`let pauses=0;audio={pause(){pauses++;}};state={phase:'playing',round:{id:'r',canAnswer:true,selection:{title:'a'},startsAt:Date.now()-1000,endsAt:Date.now()+10000,deadline:Date.now()+15000}};playKey='r:'+state.round.deadline;tick();`);assert.equal(c.run('pauses'),0);
 c.run('state.round.deadline=Date.now()-1;tick();');assert.equal(c.run('pauses'),1);
});
test('music fades during the last 800ms without pausing early or changing user volume',()=>{
 const c=client();c.run(`var pauses=0;audio={volume:1,pause(){pauses++;}};volume=.6;clipFade={endsAt:Date.now()+400,duration:800};updateMusicVolume();`);
 assert(c.run('audio.volume')>.25&&c.run('audio.volume')<=.31);assert.equal(c.run('volume'),.6);assert.equal(c.run('pauses'),0);
 c.run('clipFade.endsAt=Date.now()-1;updateMusicVolume();');assert.equal(c.run('audio.volume'),0);
 c.run('stopSound();clipFade=null;updateMusicVolume();');assert.equal(c.run('audio.volume'),.6);
});
test('decoded audio fade reaches zero at the exact clip end',()=>{
 const c=client();c.run(`var automation=[];ctx={currentTime:10,destination:{},createGain(){return {gain:{value:0,setValueAtTime(v,t){automation.push([v,t]);},linearRampToValueAtTime(v,t){automation.push([v,t]);}},connect(){}};}};clipGains(2);`);
 assert.deepEqual(JSON.parse(c.run('JSON.stringify(automation)')),[[1,10],[1,11],[0,12]]);
});
test('finale : annonce puis invitation, chat ouvert seulement au clic et fermé à la revanche',async()=>{
 const c=client();c.run(`state=${JSON.stringify(state)};render();`);assert(!c.element('#app').innerHTML.includes('id="social-widget"'));
 c.run("var scheduled=[];setTimeout=(fn,ms)=>{scheduled.push({fn,ms});return 1;};state.phase='finished';render();");
 assert(c.element('#app').innerHTML.includes('winner-reveal'));assert(!c.element('#app').innerHTML.includes('id="social-widget"'));assert.equal(c.run('scheduled[0].ms'),3600);
 c.run('render();');assert.equal(c.run('scheduled.length'),1,'incoming state does not restart the finale');
 c.run('scheduled[0].fn();');assert(!c.element('#app').innerHTML.includes('winner-reveal'));assert(c.element('#app').innerHTML.includes('afterparty-invite'));assert(!c.element('#app').innerHTML.includes('id="chat-form"'));
 await c.click({action:'social-toggle'});assert(c.element('#app').innerHTML.includes('id="chat-form"'));assert(c.element('#app').innerHTML.includes('data-action="voice-join"'));
 await c.click({action:'social-toggle'});assert(!c.element('#app').innerHTML.includes('id="chat-form"'));
 c.run("state.phase='lobby';render();");assert(!c.element('#app').innerHTML.includes('id="social-widget"'));assert.equal(c.run('socialOpen'),false);
 c.run("state.phase='finished';render();");assert(c.element('#app').innerHTML.includes('winner-reveal'));
 await c.click({action:'finale-skip'});assert(c.element('#app').innerHTML.includes('afterparty-invite'));
});
test('décompte : trois bips et départ distinct, sans répétition ni coupure de musique',()=>{
 const c=client();c.run(`var tones=[],pauses=0;audio={pause(){pauses++;}};ctx={state:'running',currentTime:0,destination:{},createOscillator(){const o={frequency:{value:0},connect(){},disconnect(){},start(){tones.push(this.frequency.value);},stop(){}};return o;},createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}};var round={id:'count',canAnswer:true,startsAt:4000};`);
 for(const now of [1000,1100,2000,2100,3000,3100,4000,4100,5000])c.run(`countdownSound(round,${now});`);
 assert.deepEqual(JSON.parse(c.run('JSON.stringify(tones)')),[698.46,698.46,698.46,1046.5]);assert.equal(c.run('pauses'),0);
 c.run("volume=0;round.id='silent';countdownSound(round,1000);");assert.equal(c.run('tones.length'),4);
 c.run("volume=.35;ctx.state='suspended';round.id='blocked';countdownSound(round,1000);");assert.equal(c.run('tones.length'),4);
 c.run('stopCountdownSound();');assert.equal(c.run('countdownNodes.length'),0);
});
