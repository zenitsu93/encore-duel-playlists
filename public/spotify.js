import {spotifyPlaylist} from './spotify-url.js';
const $=id=>document.getElementById(`spotify-${id}`);
const sharedPlaylist=new URLSearchParams(location.search).get('playlist');
if(sharedPlaylist){try{$('url').value=spotifyPlaylist(sharedPlaylist).url;}catch{$('message').textContent='Le lien transmis est invalide. Colle une playlist Spotify publique.';}}
let sdkPromise,controller,revision=0;
function log(message){const li=document.createElement('li');li.textContent=`${new Date().toLocaleTimeString('fr-FR')} · ${message}`;$('log').prepend(li);while($('log').children.length>8)$('log').lastElementChild.remove();}
function seconds(value){return Number.isFinite(value)?`${(value/1000).toFixed(1)} s`:'—';}
function sdk(){
  if(sdkPromise)return sdkPromise;
  sdkPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://open.spotify.com/embed/iframe-api/v1';script.async=true;
    const fail=()=>{clearTimeout(timeout);script.remove();sdkPromise=null;reject(Error('Spotify ne répond pas. Vérifie ta connexion et les éventuels bloqueurs de contenu.'));};
    const timeout=setTimeout(fail,15000);
    window.onSpotifyIframeApiReady=api=>{clearTimeout(timeout);resolve(api);};
    script.onerror=fail;document.head.append(script);
  });return sdkPromise;
}
function controls(enabled){$('play').disabled=!enabled;$('pause').disabled=!enabled;}
$('form').addEventListener('submit',async e=>{
  e.preventDefault();let playlist;
  try{playlist=spotifyPlaylist($('url').value);}catch(err){$('message').textContent=err.message;return;}
  const version=++revision;$('load').disabled=true;controls(false);
  controller?.destroy();controller=null;$('player').replaceChildren();$('log').replaceChildren();
  $('status').textContent='Chargement';$('track').textContent='—';$('position').textContent='—';$('duration').textContent='—';
  $('message').textContent='Chargement du lecteur officiel Spotify…';$('open').href=playlist.url;$('open').hidden=false;
  let readyTimer;
  try{
    const api=await sdk();if(version!==revision)return;
    const mount=document.createElement('div');$('player').append(mount);
    readyTimer=setTimeout(()=>{if(version===revision){$('message').textContent='Le lecteur tarde à répondre. Essaie son bouton de lecture ou ouvre la playlist dans Spotify.';$('load').disabled=false;}},15000);
    api.createController(mount,{uri:playlist.uri,width:'100%',height:352},embed=>{
      if(version!==revision){embed.destroy();return;}controller=embed;
      embed.addListener('ready',()=>{
        if(version!==revision)return;clearTimeout(readyTimer);controls(true);$('load').disabled=false;
        $('status').textContent='Prêt';$('message').textContent='Lecteur prêt. Lance un morceau pour observer les événements.';log('Lecteur prêt.');
      });
      embed.addListener('playback_started',event=>{
        if(version!==revision)return;const uri=event.data?.playingURI;
        $('status').textContent='Lecture';$('track').textContent=uri||'Non communiqué';log(`Lecture démarrée${uri?' : '+uri:''}.`);
      });
      embed.addListener('playback_update',event=>{
        if(version!==revision)return;const data=event.data||{};
        $('status').textContent=data.isBuffering?'Chargement':data.isPaused?'En pause':'Lecture';
        $('position').textContent=seconds(data.position);$('duration').textContent=seconds(data.duration);
        if(data.playingURI)$('track').textContent=data.playingURI;
      });
    });
  }catch(err){clearTimeout(readyTimer);$('message').textContent=err.message;$('status').textContent='Indisponible';$('load').disabled=false;}
});
$('play').addEventListener('click',()=>{try{controller?.play();log('Demande de lecture envoyée.');}catch(err){$('message').textContent=err.message;}});
$('pause').addEventListener('click',()=>{try{controller?.pause();log('Demande de pause envoyée.');}catch(err){$('message').textContent=err.message;}});
window.addEventListener('pagehide',()=>controller?.destroy());
