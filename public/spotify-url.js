export function spotifyPlaylist(value) {
  const input=String(value??'').trim();
  let id=input.match(/^spotify:playlist:([A-Za-z0-9]{22})$/)?.[1];
  if(!id){
    let url;try{url=new URL(input);}catch{throw Error('Colle un lien de playlist Spotify complet.');}
    if(url.protocol!=='https:'||url.hostname!=='open.spotify.com'||url.port||url.username||url.password)throw Error('Utilise un lien https://open.spotify.com/playlist/…');
    id=url.pathname.match(/^\/(?:intl-[a-zA-Z-]+\/)?(?:embed\/)?playlist\/([A-Za-z0-9]{22})\/?$/)?.[1];
  }
  if(!id)throw Error('Ce lien ne désigne pas une playlist Spotify.');
  return {id,uri:`spotify:playlist:${id}`,url:`https://open.spotify.com/playlist/${id}`};
}
