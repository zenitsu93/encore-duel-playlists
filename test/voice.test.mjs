import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {voiceState,voiceSignal} from '../voice.mjs';

test('voice signaling only reaches the intended active room member',()=>{
  const a={id:'a'},b={id:'b'},c={id:'c'},out=[];
  const r={players:[a,b,c],clients:new Map([a,b,c].map(p=>[p.id,{playerId:p.id,res:{write:s=>out.push([p.id,s])}}]))};
  voiceState(r,a,{active:true,voiceId:'session-a'});voiceState(r,b,{active:true,voiceId:'session-b'});
  const signal={to:'b',voiceId:'session-a',targetVoiceId:'session-b',signal:{type:'offer',sdp:'test'}};
  voiceSignal(r,a,signal);assert.equal(out.length,1);assert.equal(out[0][0],'b');assert(out[0][1].includes('event: voice'));
  assert.throws(()=>voiceSignal(r,c,signal));assert.throws(()=>voiceSignal(r,a,{...signal,to:'outsider'}));assert.throws(()=>voiceSignal(r,a,{...signal,targetVoiceId:'old'}));
  assert.throws(()=>voiceSignal(r,a,{...signal,signal:{type:'offer',sdp:'x'.repeat(21000)}}));
  voiceState(r,b,{active:false,voiceId:'old-session'});assert(b.voice);
  voiceState(r,b,{active:false,voiceId:'session-b'});assert.equal(b.voice,null);assert.throws(()=>voiceSignal(r,a,signal));
});

function client(me='a'){
  const tracks=[],audios=[],pcs=[],calls=[];let micCalls=0;
  class PC {
    constructor(){this.connectionState='new';this.candidates=[];this.transceivers=[];pcs.push(this);}
    addTransceiver(kind,{direction}={direction:'sendrecv'}){const transceiver={mid:null,direction,receiver:{track:{kind}},sender:{replaceTrack:async t=>{transceiver.sender.track=t;this.track=t;}}};this.transceivers.push(transceiver);return transceiver;}
    getTransceivers(){return this.transceivers;}
    async createOffer(){this.transceivers.forEach((t,i)=>t.mid=String(i));return {type:'offer',sdp:'offer'};}
    async createAnswer(){this.transceivers.filter(t=>t.mid!==null).forEach(t=>t.currentDirection=t.direction);return {type:'answer',sdp:'answer'};}
    async setLocalDescription(d){this.localDescription=d;}
    async setRemoteDescription(d){this.remoteDescription=d;if(d.type==='offer'&&!this.transceivers.some(t=>t.mid==='0')){const t=this.addTransceiver('audio',{direction:'recvonly'});t.mid='0';}}
    async addIceCandidate(c){this.candidates.push(c);}
    close(){this.closed=true;}
  }
  const context=vm.createContext({console,crypto:{randomUUID:()=> 'local-session'},setTimeout:()=>1,clearTimeout(){},RTCPeerConnection:PC,MediaStream:class{},navigator:{mediaDevices:{getUserMedia:async()=>{micCalls++;const t={enabled:true,stop(){this.stopped=true;}};tracks.push(t);return {getTracks:()=>[t],getAudioTracks:()=>[t]};}}},document:{body:{append(){}},createElement(){const a={setAttribute(){},play:()=>Promise.resolve(),pause(){this.paused=true;},remove(){this.removed=true;}};audios.push(a);return a;}}});
  vm.runInContext(readFileSync(new URL('../public/voice.js',import.meta.url),'utf8'),context);
  const voice=new context.VoiceChat(async(action,b)=>{calls.push([action,b]);return {iceServers:[]};},()=>{},()=>{});
  const room={me,players:[{id:me},{id:'b',online:true,voice:{id:'remote-session',muted:true}}]};voice.sync(room);
  return {voice,room,tracks,audios,pcs,calls,context,micCalls:()=>micCalls};
}
test('listen first, opt-in microphone, independent peer mute and cleanup',async()=>{
  const c=client();await c.voice.join();await c.voice.peers.get('b').queue;
  assert.equal(c.micCalls(),0);assert.equal(c.voice.muted,true);assert(c.calls.some(([a,b])=>a==='voice-signal'&&b.signal.type==='offer'));
  await c.voice.microphone();assert.equal(c.micCalls(),1);assert.equal(c.tracks[0].enabled,true);assert.equal(c.pcs[0].track,c.tracks[0]);
  c.voice.togglePeer('b');assert.equal(c.audios[0].muted,true);assert.equal(c.tracks[0].enabled,true);
  await c.voice.microphone();assert.equal(c.tracks[0].enabled,false);c.voice.togglePeer('b');assert.equal(c.audios[0].muted,false);
  await c.voice.leave();assert(c.tracks[0].stopped);assert(c.pcs[0].closed);assert(c.audios[0].removed);assert.equal(c.voice.peers.size,0);
});
test('ICE waits for SDP; obsolete sessions are ignored; departures close peers',async()=>{
  const c=client();await c.voice.join();const p=c.voice.peers.get('b');await p.queue;
  const event={from:'b',voiceId:'remote-session',targetVoiceId:c.voice.id};
  await c.voice.receive({...event,signal:{type:'candidate',candidate:{candidate:'ice'}}});assert.equal(p.candidates.length,1);assert.equal(c.pcs[0].candidates.length,0);
  await c.voice.receive({...event,signal:{type:'answer',sdp:'remote'}});assert.equal(c.pcs[0].candidates.length,1);
  await c.voice.receive({...event,targetVoiceId:'old',signal:{type:'answer',sdp:'bad'}});assert.equal(c.pcs[0].remoteDescription.sdp,'remote');
  c.voice.sync({...c.room,players:[{id:'a'}]});assert(c.pcs[0].closed);assert.equal(c.voice.peers.size,0);c.voice.stop();
});
test('denied microphone leaves listening available and mute enabled',async()=>{
  const c=client();await c.voice.join();
  c.context.navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(Error('denied'),{name:'NotAllowedError'});};
  await assert.rejects(()=>c.voice.microphone(),/Micro refusé/);assert.equal(c.voice.active,true);assert.equal(c.voice.muted,true);assert.equal(c.voice.busy,false);c.voice.stop();
});
test('a microphone granted after leaving is immediately stopped',async()=>{
  const c=client();await c.voice.join();let grant;
  c.context.navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>grant=resolve);
  const pending=c.voice.microphone();await c.voice.leave();const track={stop(){this.stopped=true;}};
  grant({getTracks:()=>[track]});await pending;assert.equal(track.stopped,true);assert.equal(c.voice.stream,null);assert.equal(c.voice.active,false);
});
test('mobile output is unlocked before network and remote tracks use an independent audio graph',async()=>{
  const c=client(),order=[],outputs=[];const api=c.voice.api;c.voice.api=async(...args)=>{order.push('network');return api(...args);};
  c.context.AudioContext=class{
    constructor(){this.state='suspended';this.destination={};outputs.push(this);}
    resume(){order.push('resume');this.state='running';return Promise.resolve();}
    close(){this.state='closed';return Promise.resolve();}
    createMediaStreamSource(){return {connect(){},disconnect(){this.disconnected=true;}};}
    createGain(){return {gain:{value:1},connect(){},disconnect(){this.disconnected=true;}};}
  };
  await c.voice.join();assert.equal(order[0],'resume');const p=c.voice.peers.get('b');
  p.pc.ontrack({track:{kind:'audio'}});assert(p.source);assert.equal(p.blocked,false);assert.equal(p.audio.srcObject,undefined,'no duplicate native playback');
  c.voice.togglePeer('b');assert.equal(p.gain.gain.value,0);c.voice.togglePeer('b');assert.equal(p.gain.gain.value,1);
  outputs[0].state='suspended';c.voice.play(p);assert.equal(p.blocked,true);c.voice.listen();await Promise.resolve();assert.equal(p.blocked,false);
  await c.voice.leave();assert.equal(outputs[0].state,'closed');assert(p.source.disconnected);assert(p.gain.disconnected);
});
for(const microphoneFirst of [true,false])test(`answering participant transmits on negotiated audio, mic ${microphoneFirst?'before':'after'} offer`,async()=>{
  const c=client('z');await c.voice.join();const peer=c.voice.peers.get('b');await peer.queue;
  if(microphoneFirst)await c.voice.microphone();
  await c.voice.receive({from:'b',voiceId:'remote-session',targetVoiceId:c.voice.id,signal:{type:'offer',sdp:'offer'}});
  if(!microphoneFirst)await c.voice.microphone();
  const negotiated=peer.pc.getTransceivers().find(t=>t.mid==='0');
  assert.equal(peer.sender,negotiated.sender,'microphone must use the sender negotiated by the incoming offer');
  assert.equal(negotiated.sender.track,c.tracks[0]);assert.equal(negotiated.currentDirection,'sendrecv');assert(c.tracks[0].enabled);
  assert.equal(peer.pc.getTransceivers().length,1,'no unused local audio transceiver');
  await c.voice.microphone();assert.equal(negotiated.sender.track.enabled,false);await c.voice.microphone();assert.equal(negotiated.sender.track.enabled,true);
  c.voice.stop();
});
