import test from 'node:test';
import assert from 'node:assert/strict';
import {DEMO,questions,points,dedupe} from '../game.mjs';
import './spotify.test.mjs';
import './features.test.mjs';
import './client.test.mjs';
import './voice.test.mjs';

test('QCM : quatre options distinctes et une bonne réponse par champ',()=>{
  for(let i=0;i<100;i++)for(const track of DEMO){
    const qs=questions(track,DEMO,'both');assert.equal(qs.length,2);
    for(const q of qs){assert.equal(q.options.length,4);assert.equal(new Set(q.options.map(o=>o.label)).size,4);assert.equal(q.options.find(o=>o.id===q.correct).label,track[q.field]);}
  }
});
test('refuse un catalogue sans assez d’artistes',()=>assert.throws(()=>questions(DEMO[0],DEMO.slice(0,2),'artist'),/4 artistes/));
test('barème : vitesse bornée, mauvaise réponse nulle, double mode équilibré',()=>{
  assert.equal(points(true,0,20000),150);assert.equal(points(true,20000,20000),100);assert.equal(points(true,30000,20000),100);assert.equal(points(false,1,20000),0);assert.equal(points(true,0,20000,2)*2,150);
});
test('déduplique titres et artistes sans distinguer casse et espaces',()=>assert.equal(dedupe([{title:' Bonjour ',artist:'MUSE'},{title:'bonjour',artist:'Muse'}]).length,1));
