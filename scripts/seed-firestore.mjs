// Optional one-time seed; run with GOOGLE_APPLICATION_CREDENTIALS set to an Admin service account.
// Usage: npm run seed:firestore -- your-app-id
import { readFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const appId=process.argv[2];
if(!appId){console.error('Usage: npm run seed:firestore -- your-app-id');process.exit(1);}
initializeApp({credential:applicationDefault()});
const db=getFirestore();
const words=JSON.parse(readFileSync(new URL('../src/data/words.json',import.meta.url),'utf8'));
for(let i=0;i<words.length;i+=400){const batch=db.batch();for(const word of words.slice(i,i+400))batch.set(db.doc(`artifacts/${appId}/public/data/sat_words/${word.id}`),word);await batch.commit();console.log(`Seeded ${Math.min(i+400,words.length)}/${words.length}`);}
console.log('Done.');
