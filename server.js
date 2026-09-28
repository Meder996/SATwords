import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
const app=express(); app.use(express.json({limit:'12kb'}));
// Read .env locally without injecting the private key into the browser bundle.
if (existsSync('.env')) for (const line of readFileSync('.env','utf8').split('\n')) { const match=line.match(/^([A-Z_]+)=(.*)$/); if(match && !process.env[match[1]])process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,''); }
const key=process.env.GEMINI_API_KEY;
// Basic per-IP throttle limits accidental or abusive use of a configured API key.
const requests=new Map();
app.use('/api',(req,res,next)=>{const now=Date.now(),ip=req.ip;const record=requests.get(ip)||{start:now,count:0};if(now-record.start>60000){record.start=now;record.count=0;}record.count++;requests.set(ip,record);res.set('Cache-Control','no-store');if(record.count>45)return res.status(429).json({error:'Too many AI requests. Please wait a minute.'});next();});
setInterval(()=>{const now=Date.now();for(const [ip,record] of requests)if(now-record.start>120000)requests.delete(ip);},120000).unref();
async function gemini(model,payload) {
  if (!key) { const error=new Error('AI features need a server-side Gemini API key. Add GEMINI_API_KEY to .env to enable them.'); error.status=503; throw error; }
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try { const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});const json=await response.json();if(!response.ok)throw new Error(json.error?.message || 'Gemini is unavailable.');return json; }
  finally { clearTimeout(timer); }
}
function parseText(json) { const text=json.candidates?.[0]?.content?.parts?.find(p=>p.text)?.text; if(!text)throw new Error('Gemini returned an empty response.');return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,'')); }
app.post('/api/insight',async(req,res)=>{ const {word,definition}=req.body; if(typeof word!=='string'||word.length>80||typeof definition!=='string'||definition.length>300)return res.status(400).json({error:'Invalid word.'});try {const json=await gemini('gemini-3-flash-preview',{contents:[{parts:[{text:`You are an expert Digital SAT verbal tutor. For the vocabulary word ${JSON.stringify(word)} meaning ${JSON.stringify(definition)}, write a memorable visual mnemonic, a practical SAT context tip, and an example contrasting incorrect versus correct usage. Be concise and factually precise.`}]}],generationConfig:{responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{mnemonic:{type:'STRING'},satContextTip:{type:'STRING'},correctVsIncorrect:{type:'STRING'}},required:['mnemonic','satContextTip','correctVsIncorrect']}}});res.json(parseText(json));}catch(e){res.status(e.status||502).json({error:e.message});} });
app.post('/api/passage',async(req,res)=>{const words=req.body.words;if(!Array.isArray(words)||words.length<1||words.length>5||words.some(w=>typeof w.word!=='string'||w.word.length>80||typeof w.definition!=='string'||w.definition.length>300))return res.status(400).json({error:'Choose up to five valid words.'});try {const json=await gemini('gemini-3-flash-preview',{contents:[{parts:[{text:`You are a Digital SAT reading tutor. Write an original 100-150 word academic passage using these words naturally: ${JSON.stringify(words)}. Write exactly two multiple-choice questions testing word meaning in this passage, each with four short answer choices, a zero-based correctIndex, and a short explanation. Avoid copyrighted passage text.`}]}],generationConfig:{responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{passage:{type:'STRING'},questions:{type:'ARRAY',items:{type:'OBJECT',properties:{question:{type:'STRING'},options:{type:'ARRAY',items:{type:'STRING'}},correctIndex:{type:'INTEGER'},explanation:{type:'STRING'}},required:['question','options','correctIndex','explanation']}}},required:['passage','questions']}}});res.json(parseText(json));}catch(e){res.status(e.status||502).json({error:e.message});} });
app.post('/api/tts',async(req,res)=>{const {text}=req.body;if(typeof text!=='string'||text.length<1||text.length>250)return res.status(400).json({error:'Invalid text.'});try {const json=await gemini('gemini-2.5-flash-preview-tts',{contents:[{parts:[{text:`Say clearly: ${text}`}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}}}}});const inline=json.candidates?.[0]?.content?.parts?.find(p=>p.inlineData)?.inlineData;if(!inline)throw new Error('Audio was unavailable.');res.json({audio:inline.data,mimeType:inline.mimeType});}catch(e){res.status(e.status||502).json({error:e.message});} });
if(existsSync('dist')) {app.use(express.static(resolve('dist')));app.get('*',(_,res)=>res.sendFile(resolve('dist/index.html')));}
// Export the same handler to Vercel Functions. Listen only when running this file directly.
export default app;
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  app.listen(Number(process.env.PORT)||3001,'0.0.0.0',()=>console.log(`API listening on ${Number(process.env.PORT)||3001}`));
}
