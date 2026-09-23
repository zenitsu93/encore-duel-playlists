import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function client(){
  const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{},setAttribute(){},focus(){},setSelectionRange(){}});return elements.get(id);};
  const storage=()=>({getItem(){return null;},setItem(){},removeItem(){}});
  const context=vm.createContext({document:{querySelector:element,activeElement:null,addEventListener(){}},sessionStorage:storage(),localStorage:storage(),location:{search:'',origin:'http://localhost:4317'},history:{replaceState(){}},URLSearchParams,URL,console,setInterval(){},setTimeout(){},clearTimeout(){},window:{},navigator:{}});
  vm.runInContext(source,context);return {context,element,run:code=>vm.runInContext(code,context)};
}
const state={code:'TEST42',host:'a',me:'a',phase:'lobby',players:[{id:'a',name:'Alice',score:0,ready:true,online:true,team:'lime'},{id:'b',name:'Bob',score:0,ready:true,online:true,team:'purple'}],tracks:[{id:'1',title:'<script>bad</script>',artist:'Artiste',owners:['a']}],settings:{mode:'both',input:'qcm',listening:'progressive',seconds:20,rounds:8,teams:true,jokers:true,balanced:true,bonus:true},playlists:[],jokers:{fifty:false,time:false},teams:[{id:'lime',name:'Or',score:0},{id:'purple',name:'Ciel',score:0}],reactions:[],history:[]};
test('client : accueil, salon, variantes, rendu texte échappé',()=>{
  const c=client();assert(c.element('#app').innerHTML.includes('Comment jouer'));c.run(`state=${JSON.stringify(state)}; render();`);
  const html=c.element('#app').innerHTML;assert(html.includes('playlist-form'));assert(html.includes('data-setting="listening"'));assert(html.includes('Mon équipe'));assert(html.includes('&lt;script&gt;bad&lt;/script&gt;'));assert(!html.includes('<script>bad'));
});
test('client : réponse écrite, bonus, jokers et récapitulatif',()=>{
  const c=client(),s=structuredClone(state);s.phase='playing';s.settings.input='text';s.round={id:'r',number:1,total:1,startsAt:Date.now(),endsAt:Date.now()+30000,deadline:Date.now()+30000,canAnswer:true,questions:[{field:'title',options:[]}],bonus:{options:[{id:'a',label:'Alice'}]},stage:[{at:0,length:2}]};
  c.run(`state=${JSON.stringify(s)}; render();`);assert(c.element('#app').innerHTML.includes('data-text-field="title"'));assert(c.element('#app').innerHTML.includes('data-joker="time"'));assert(!c.element('#app').innerHTML.includes('data-joker="fifty"'));assert(c.element('#app').innerHTML.includes('Qui a ajouté ce son'));
  s.phase='finished';s.history=[{number:1,title:'Titre',artist:'Artiste',canceled:false,results:[{id:'a',correct:1,total:1,earned:150,elapsed:1200}]}];
  c.run(`state=${JSON.stringify(s)}; render();`);assert(c.element('#app').innerHTML.includes('100%'));assert(c.element('#app').innerHTML.includes('1.2 s'));assert(c.element('#app').innerHTML.includes('data-action="download"'));
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
