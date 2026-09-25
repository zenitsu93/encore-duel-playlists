// Kept outside #app: remote audio must survive game re-renders.
class VoiceChat {
  constructor(api,refresh,notify){Object.assign(this,{api,refresh,notify,peers:new Map(),mutedPeers:new Set(),active:false,busy:false,muted:true,id:null,stream:null,room:null,iceServers:[]});}
  async join(){
    if(this.busy||this.active)return;
    if(!globalThis.RTCPeerConnection)throw Error('Le vocal nécessite un navigateur compatible et une connexion HTTPS.');
    this.busy=true;this.confirmed=false;this.id=crypto.randomUUID();const generation=this.id;this.refresh();
    try{const config=await this.api('voice-config');if(this.id!==generation)return;this.iceServers=config.iceServers;this.active=true;
      await this.api('voice-state',{active:true,muted:true,voiceId:this.id});this.sync(this.room);
    }catch(e){this.stop();throw e;}finally{this.busy=false;this.refresh();}
  }
  stop(){this.active=false;this.id=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.muted=true;for(const id of [...this.peers.keys()])this.drop(id);this.refresh();}
  async leave(){const id=this.id;this.stop();if(id)await this.api('voice-state',{active:false,voiceId:id});}
  drop(id){const peer=this.peers.get(id);if(!peer)return;this.peers.delete(id);clearTimeout(peer.timer);peer.pc.close();peer.audio.pause();peer.audio.srcObject=null;peer.audio.remove();}
  async microphone(){
    if(!this.active||this.busy)return;this.busy=true;this.refresh();const generation=this.id;
    try{
      if(!this.stream){
        if(!navigator.mediaDevices?.getUserMedia)throw Error('Le micro nécessite HTTPS (ou localhost).');
        const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
        if(!this.active||this.id!==generation){stream.getTracks().forEach(t=>t.stop());return;}
        this.stream=stream;const track=stream.getAudioTracks()[0];track.enabled=false;
        track.onended=()=>{if(this.stream===stream){this.stream=null;this.muted=true;this.api('voice-state',{active:true,muted:true,voiceId:this.id}).catch(()=>{});this.refresh();}};
        await Promise.all([...this.peers.values()].filter(p=>p.sender).map(p=>p.sender.replaceTrack(track)));
      }
      if(this.id!==generation)return;
      this.muted=!this.muted;this.stream.getAudioTracks().forEach(t=>t.enabled=!this.muted);
      await this.api('voice-state',{active:true,muted:this.muted,voiceId:this.id});
    }catch(e){this.muted=true;this.stream?.getAudioTracks().forEach(t=>t.enabled=false);throw Error(e.name==='NotAllowedError'?'Micro refusé. Autorise-le dans les réglages du navigateur, puis réessaie.':e.message);}
    finally{this.busy=false;this.refresh();}
  }
  togglePeer(id){if(this.mutedPeers.has(id))this.mutedPeers.delete(id);else this.mutedPeers.add(id);const p=this.peers.get(id);if(p){p.audio.muted=this.mutedPeers.has(id);if(!p.audio.muted)this.play(p);}this.refresh();}
  play(p){p.audio.play().then(()=>{p.blocked=false;this.refresh();},()=>{p.blocked=true;this.refresh();});}
  listen(){for(const p of this.peers.values())this.play(p);}
  sync(room){
    this.room=room;if(!this.active||!room)return;
    const me=room.players.find(p=>p.id===room.me);
    if(this.confirmed&&me?.voice?.id!==this.id){this.stop();return;}
    if(me?.voice?.id===this.id)this.confirmed=true;
    const others=room.players.filter(p=>p.id!==room.me&&p.online&&!p.left&&p.voice);
    for(const [id,p] of this.peers)if(!others.some(x=>x.id===id&&x.voice.id===p.voiceId))this.drop(id);
    for(const p of others){if(this.peers.has(p.id))continue;const peer=this.peer(p.id,p.voice.id);
      if(room.me<p.id)this.enqueue(peer,async()=>{await peer.pc.setLocalDescription(await peer.pc.createOffer());await this.send(peer,{type:'offer',sdp:peer.pc.localDescription.sdp});});
    }
  }
  peer(id,voiceId){
    const pc=new RTCPeerConnection({iceServers:this.iceServers}),audio=document.createElement('audio');audio.autoplay=true;audio.setAttribute('playsinline','');audio.muted=this.mutedPeers.has(id);audio.hidden=true;document.body.append(audio);
    // Only the offerer creates a transceiver. The answerer must use the one
    // created by setRemoteDescription, or its microphone is never negotiated.
    const sender=this.room.me<id?pc.addTransceiver('audio',{direction:'sendrecv'}).sender:null;
    const p={id,voiceId,pc,audio,sender,queue:Promise.resolve(),candidates:[],status:'Connexion…',localId:this.id};this.peers.set(id,p);
    if(this.stream&&sender)p.queue=sender.replaceTrack(this.stream.getAudioTracks()[0]);
    pc.onicecandidate=e=>{if(e.candidate)this.send(p,{type:'candidate',candidate:e.candidate.toJSON()}).catch(()=>{});};
    pc.ontrack=e=>{audio.srcObject=new MediaStream([e.track]);this.play(p);};
    pc.onconnectionstatechange=()=>{if(this.peers.get(id)!==p)return;p.status=pc.connectionState==='connected'?'En vocal':pc.connectionState==='failed'?'Connexion impossible. Quitte puis rejoins le vocal.':pc.connectionState==='disconnected'?'Reconnexion…':'Connexion…';this.refresh();};
    p.timer=setTimeout(()=>{if(pc.connectionState!=='connected'){p.status='Connexion impossible. Quitte puis rejoins le vocal.';this.refresh();}},20000);
    return p;
  }
  enqueue(p,task){p.queue=p.queue.then(()=>{if(this.active&&this.peers.get(p.id)===p)return task();}).catch(()=>{if(this.peers.get(p.id)===p){p.status='Connexion impossible. Quitte puis rejoins le vocal.';this.refresh();}});return p.queue;}
  send(p,signal){if(!this.active||this.peers.get(p.id)!==p)return Promise.resolve();return this.api('voice-signal',{voiceId:p.localId,targetVoiceId:p.voiceId,to:p.id,signal});}
  receive(data){
    if(!this.active||data.targetVoiceId!==this.id)return;
    const member=this.room?.players.find(p=>p.id===data.from&&p.voice?.id===data.voiceId&&!p.left);if(!member)return;
    const p=this.peers.get(data.from)||this.peer(data.from,data.voiceId);if(p.voiceId!==data.voiceId)return;
    return this.enqueue(p,async()=>{const s=data.signal;
      if(s.type==='candidate'){if(p.pc.remoteDescription)await p.pc.addIceCandidate(s.candidate);else p.candidates.push(s.candidate);return;}
      if(s.type==='offer'&&this.room.me<data.from)return;
      await p.pc.setRemoteDescription({type:s.type,sdp:s.sdp});
      if(s.type==='offer'){
        const transceiver=p.pc.getTransceivers().find(t=>t.mid!==null&&t.receiver.track.kind==='audio');
        if(!transceiver)throw Error('Piste vocale absente.');
        transceiver.direction='sendrecv';p.sender=transceiver.sender;
        await p.sender.replaceTrack(this.stream?.getAudioTracks()[0]||null);
      }
      for(const c of p.candidates)await p.pc.addIceCandidate(c);p.candidates=[];
      if(s.type==='offer'){await p.pc.setLocalDescription(await p.pc.createAnswer());await this.send(p,{type:'answer',sdp:p.pc.localDescription.sdp});}
    });
  }
}
globalThis.VoiceChat=VoiceChat;
