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
const state={code:'TEST42',host:'a',me:'a',phase:'lobby',players:[{id:'a',name:'Alice',score:0,ready:true,online:true,team:'lime'},{id:'b',name:'Bob',score:0,ready:true,online:true,team:'purple'}],tracks:[{id:'1',title:'<script>bad</script>',artist:'Artiste',owners:['a']}],settings:{mode:'both',input:'qcm',listening:'progressive',seconds:20,rounds:8,teams:true,jokers:true,balanced:true,bonus:true},playlists:[],jokers:{fifty:false,time:false},teams:[{id:'lime',name:'Citron',score:0},{id:'purple',name:'Violet',score:0}],reactions:[],history:[]};
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
