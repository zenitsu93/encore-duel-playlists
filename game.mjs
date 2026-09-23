import { randomInt, randomBytes } from 'node:crypto';

export const DEMO = [
  { title: 'Néon', artist: 'Satellite', notes: [261.63,329.63,392,523.25] },
  { title: 'Minuit', artist: 'Lune rouge', notes: [440,349.23,293.66,349.23] },
  { title: 'La vague', artist: 'Marée haute', notes: [329.63,392,440,392,329.63,293.66] },
  { title: 'Décollage', artist: 'Cosmos', notes: [261.63,293.66,329.63,392,523.25,659.25] },
  { title: 'Échos', artist: 'Satellite', notes: [523.25,392,329.63,261.63] },
  { title: 'Velours', artist: 'Lune rouge', notes: [293.66,349.23,440,349.23,293.66,261.63] },
  { title: 'Soleil bleu', artist: 'Marée haute', notes: [392,440,392,329.63,261.63] },
  { title: 'Orbite', artist: 'Cosmos', notes: [659.25,523.25,392,523.25] }
].map((s,i)=>({...s,id:`demo-${i}`, demo:true}));
export const token = () => randomBytes(18).toString('hex');
export const normalize = s => s.normalize('NFKC').trim().toLocaleLowerCase('fr');
export function shuffle(a) {
  a=[...a]; for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];} return a;
}
export function dedupe(tracks) {
  return [...new Map(tracks.map(t=>[normalize(t.artist)+'|'+normalize(t.title),t])).values()];
}
export function questions(track, pool, mode) {
  return (mode==='both'?['title','artist']:[mode]).map(field=>{
    const distinct=[...new Map(pool.map(t=>[normalize(t[field]),t[field]])).values()];
    const wrong=shuffle(distinct.filter(v=>normalize(v)!==normalize(track[field]))).slice(0,3);
    if(wrong.length<3) throw new Error(`Il faut au moins 4 ${field==='title'?'titres':'artistes'} différents.`);
    const options=shuffle([track[field],...wrong]).map(label=>({id:token(),label}));
    return {field,options,correct:options.find(o=>o.label===track[field]).id};
  });
}
export function points(correct, elapsed, duration, count=1) {
  return correct ? Math.round((100+50*Math.max(0,1-elapsed/duration))/count) : 0;
}

export const answerKey=s=>String(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function matchesAnswer(value,expected){
  const a=answerKey(value),b=answerKey(expected);if(!a||!b)return false;if(a===b)return true;
  const limit=b.length>=9?2:b.length>=5?1:0;if(Math.abs(a.length-b.length)>limit||!limit)return false;
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}
  return row[b.length]<=limit;
}
export function mergeTracks(tracks){
  const map=new Map();for(const t of tracks){const key=normalize(t.artist)+'|'+normalize(t.title),old=map.get(key);map.set(key,old?{...old,owners:[...new Set([...(old.owners||[]),...(t.owners||[])])]}:{...t,owners:t.owners||[]});}return [...map.values()];
}
export function balancedDeck(tracks,count,balanced=true){
  if(!balanced)return shuffle(tracks).slice(0,count);
  const owners=shuffle([...new Set(tracks.flatMap(t=>t.owners||[]))]);if(!owners.length)return shuffle(tracks).slice(0,count);
  const available=shuffle(tracks),result=[];
  while(available.length&&result.length<count){let added=false;for(const owner of owners){const i=available.findIndex(t=>t.owners.includes(owner));if(i<0)continue;result.push(available.splice(i,1)[0]);added=true;if(result.length>=count)break;}if(!added)break;}
  return result.concat(available.slice(0,Math.max(0,count-result.length)));
}
