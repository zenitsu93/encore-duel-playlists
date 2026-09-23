import test from 'node:test';
import assert from 'node:assert/strict';
import {spotifyPlaylist} from '../public/spotify-url.js';
const id='37i9dQZF1DXcBWIGoYBM5M';
test('normalise URL partagée, URL localisée, embed et URI Spotify',()=>{
  for(const value of [`https://open.spotify.com/playlist/${id}?si=abc`,`https://open.spotify.com/intl-fr/playlist/${id}`,`https://open.spotify.com/embed/playlist/${id}`,`spotify:playlist:${id}`]){
    assert.deepEqual(spotifyPlaylist(value),{id,uri:`spotify:playlist:${id}`,url:`https://open.spotify.com/playlist/${id}`});
  }
});
test('refuse les liens étrangers, pistes, identifiants incorrects et faux domaines',()=>{
  for(const value of ['javascript:alert(1)',`https://open.spotify.com.evil.test/playlist/${id}`,`https://open.spotify.com@evil.test/playlist/${id}`,`http://open.spotify.com/playlist/${id}`,`https://open.spotify.com/track/${id}`,`https://open.spotify.com/playlist/${id}/extra`,'https://open.spotify.com/playlist/abc','<iframe>'])assert.throws(()=>spotifyPlaylist(value));
});
