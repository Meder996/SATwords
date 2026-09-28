async function request(path, body) {
  const res = await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'AI service unavailable. Please try again later.');
  return data;
}
export const getInsight = word => request('insight',{word:word.term,definition:word.definition});
export const getPassage = words => request('passage',{words:words.map(w=>({word:w.term,definition:w.definition}))});
export async function playPronunciation(text) {
  try {
    const data = await request('tts',{text});
    const raw=atob(data.audio); const bytes=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    let blob;
    if (data.mimeType?.includes('audio/L16')) {
      const rate=Number(data.mimeType.match(/rate=(\d+)/)?.[1] || 24000);
      const header=new ArrayBuffer(44);const view=new DataView(header);const label=(offset,s)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i));};
      label(0,'RIFF');view.setUint32(4,36+bytes.length,true);label(8,'WAVE');label(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,bytes.length,true);
      blob=new Blob([header,bytes],{type:'audio/wav'});
    } else blob=new Blob([bytes],{type:data.mimeType || 'audio/wav'});
    const url=URL.createObjectURL(blob);const audio=new Audio(url);audio.onended=()=>URL.revokeObjectURL(url);await audio.play();
  } catch {
    if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); const utterance=new SpeechSynthesisUtterance(text);utterance.rate=.85;window.speechSynthesis.speak(utterance); }
  }
}
