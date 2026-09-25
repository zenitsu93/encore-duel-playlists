// Optional network diagnostic: npm install --no-save --package-lock=false --ignore-scripts @roamhq/wrtc
// node test/voice-real.mjs                 (local WebRTC)
// node test/voice-real.mjs --relay         (actual TURN credentials, synthetic audio only)
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import wrtc from '@roamhq/wrtc';
import {voiceIceServers} from '../ice-config.mjs';
const relay=process.argv.includes('--relay'),server=process.argv.find(x=>x.startsWith('--server='))?.slice(9),iceServers=relay&&!server?await voiceIceServers():[];
const sessions=[],controllers=[],readers=[];
async function api(action,data){const response=await fetch(`${server}/api/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`HTTP ${response.status}: ${action}`);return response.json();}
const script=readFileSync(new URL('../public/voice.js',import.meta.url),'utf8');
const members=[{id:'a',name:'Host',online:true},{id:'b',name:'Guest',online:true}];
if(server){sessions.push(await api('create',{name:'Diagnostic host'}));sessions.push(await api('join',{code:sessions[0].code,name:'Diagnostic guest'}));const state=await api('state',sessions[0]);members.splice(0,2,...state.players);}
const clients=new Map(),sinks=[],sources=[],tracks=[],errors=[];
function broadcast(){if(!server)for(const [me,c] of clients)c.voice.sync(structuredClone({me,host:members[0].id,players:members}));}
for(const member of members){
  const c={nonzero:0};clients.set(member.id,c);
  const audioSource=new wrtc.nonstandard.RTCAudioSource();sources.push(audioSource);
  const context=vm.createContext({console,crypto:{randomUUID},setTimeout,clearTimeout,MediaStream:wrtc.MediaStream,RTCPeerConnection:class extends wrtc.RTCPeerConnection{constructor(config){super({...config,...(relay?{iceTransportPolicy:'relay'}:{})});}},navigator:{mediaDevices:{getUserMedia:async()=>{const track=audioSource.createTrack();tracks.push(track);return new wrtc.MediaStream([track]);}}},document:{body:{append(){}},createElement(){return {setAttribute(){},set srcObject(stream){if(stream){const sink=new wrtc.nonstandard.RTCAudioSink(stream.getAudioTracks()[0]);sink.ondata=({samples})=>{if(samples.some(s=>Math.abs(s)>20))c.nonzero++;};sinks.push(sink);}},play:()=>Promise.resolve(),pause(){},remove(){}};}}});
  vm.runInContext(script,context);
  c.voice=new context.VoiceChat(async(action,data)=>{
    if(server)return api(action,{...sessions[members.indexOf(member)],...data});
    if(action==='voice-config')return {iceServers};
    if(action==='voice-state'){member.voice=data.active?{id:data.voiceId,muted:data.muted}:null;broadcast();return {};}
    if(action==='voice-signal'){const target=clients.get(data.to);queueMicrotask(()=>{target.voice.receive({from:member.id,voiceId:data.voiceId,targetVoiceId:data.targetVoiceId,signal:structuredClone(data.signal)})?.catch(e=>errors.push(e.name));});return {};}
  },()=>{},()=>{});
}
broadcast();let pump;
try{
  if(server)for(const [index,member] of members.entries()){
    const c=clients.get(member.id),s=sessions[index],controller=new AbortController();controllers.push(controller);
    const response=await fetch(`${server}/api/events?code=${s.code}&token=${s.token}`,{signal:controller.signal});
    readers.push((async()=>{let buffer='';try{for await(const chunk of response.body){buffer+=new TextDecoder().decode(chunk);let end;while((end=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,end);buffer=buffer.slice(end+2);if(event.startsWith('event: voice\n'))c.voice.receive(JSON.parse(event.split('data: ')[1]));else if(event.startsWith('data: '))c.voice.sync(JSON.parse(event.slice(6)));}}}catch(e){if(e.name!=='AbortError')errors.push(e.name);}})());
  }
  const first=clients.get(members[0].id),second=clients.get(members[1].id);
  await first.voice.join();await second.voice.join();
  await first.voice.microphone();await second.voice.microphone();
  const samples=Int16Array.from({length:480},(_,i)=>Math.round(Math.sin(i*2*Math.PI*440/48000)*3000));
  pump=setInterval(()=>{for(const source of sources)source.onData({samples,sampleRate:48000,bitsPerSample:16,channelCount:1,numberOfFrames:480});},10);
  const deadline=Date.now()+(relay?25000:10000);
  while(Date.now()<deadline&&![...clients.values()].every(c=>c.nonzero>=10))await new Promise(r=>setTimeout(r,100));
  const result=[...clients].map(([id,c],index)=>({participant:index===0?'host':'guest',receivedAudioFrames:c.nonzero,peers:[...c.voice.peers.values()].map(p=>({connection:p.pc.connectionState,ice:p.pc.iceConnectionState,directions:p.pc.getTransceivers().map(t=>t.currentDirection),status:p.status}))}));
  console.log(JSON.stringify({mode:relay?'TURN relay':'direct',result,errors}));
  assert([...clients.values()].every(c=>c.nonzero>=10),'Both participants must receive non-silent synthetic audio');
}catch(e){console.error('Audio diagnostic failed:',e.code||e.name);process.exitCode=1;}
finally{clearInterval(pump);for(const c of clients.values())c.voice.stop();for(const sink of sinks)sink.stop();for(const track of tracks)track.stop();for(const controller of controllers)controller.abort();await Promise.all(readers);if(server)for(const session of sessions)await api('leave',session).catch(()=>{});}
// Native WebRTC can keep worker threads alive after all connections are closed.
setTimeout(()=>process.exit(process.exitCode||0),200);
