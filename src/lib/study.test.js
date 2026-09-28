import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewWord, getQueue, statsFor, awardReview, initialState, DAY, localDay } from './study.js';
const w = [{id:'a'},{id:'b'},{id:'c'}];
test('good follows SM-2 first and second intervals', () => { const first=reviewWord({},3,0); assert.equal(first.interval,1); const second=reviewWord(first,3,DAY); assert.equal(second.interval,6); assert.equal(second.masteryLevel,2); });
test('again resets repetition and queues immediately', () => { const state=reviewWord(reviewWord({},4,0),1,100); assert.equal(state.interval,0); assert.equal(state.repetitions,0); assert.equal(state.nextReviewDate,100); assert.equal(state.totalIncorrect,1); });
test('ease factor has lower bound', () => { let state={easeFactor:1.3}; for(let i=0;i<10;i++) state=reviewWord(state,2); assert.equal(state.easeFactor,1.3); });
test('queue prioritizes due over new and skips future', () => { assert.deepEqual(getQueue(w,{a:{nextReviewDate:0},b:{nextReviewDate:DAY*10}},2,DAY).map(x=>x.id),['a','c']); });
test('awards review and computes streak', () => { const now=new Date(2026,8,28,12).getTime(); const state=awardReview(initialState,'a',3,now); assert.equal(state.xp,10); assert.equal(state.activity[localDay(new Date(now))],1); assert.equal(statsFor(state,w,now).streak,1); });
