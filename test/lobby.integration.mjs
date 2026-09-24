import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:4317';
async function api(action,data){const res=await fetch(`${base}/api/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const body=await res.json();assert.equal(res.status,200,JSON.stringify(body));return body;}
const host=await api('create',{name:'Host ready'}),guest=await api('join',{code:host.code,name:'Guest ready'}),connections=[];
try{
  for(const s of [host,guest]){const controller=new AbortController();connections.push(controller);const response=await fetch(`${base}/api/events?code=${s.code}&token=${s.token}`,{signal:controller.signal});void (async()=>{try{for await(const chunk of response.body){}}catch{}})();}
  await api('settings',{...host,settings:{mode:'title'}});
  for(const s of [host,guest])await api('ready',{...s,ready:true});
  // A delayed or duplicate click must never undo readiness.
  await api('ready',{...host,ready:true});await api('ready',{...host,ready:false});
  await api('settings',{...host,settings:{mode:'artist'}});
  const state=await api('state',host);assert.equal(state.settings.mode,'artist');assert(state.players.every(p=>p.ready));
  await api('start',host);assert.equal((await api('state',host)).phase,'loading');
  console.log('OK: ready remains set, title -> artist -> start succeeds without another ready click.');
}finally{for(const controller of connections)controller.abort();}
