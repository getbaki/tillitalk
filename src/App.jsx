import { useEffect, useMemo, useState } from 'react';

const DB_NAME = 'tillitalk-media-v2';
const STORE = 'media';
const LIBRARY_KEY = 'tillitalk-library-v2';
const sample = [
  {id:'sample-dog',title:'A dog running',type:'image',url:'https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=crop&w=1200&q=85',questions:[
    {id:'d1',question:'Who is running?',answer:'The dog',distractors:'cat, man, car'},
    {id:'d2',question:'What is the dog doing?',answer:'The dog is running',distractors:'sleeping, eating, cat'},
    {id:'d3',question:'Is it a cat?',answer:'No it is a dog',distractors:'yes, cat, sleeping'}
  ]},
  {id:'sample-car',title:'Washing a car (sample questions)',type:'image',url:'',questions:[
    {id:'c1',question:'Who is washing the car?',answer:'A man',distractors:'woman, dog, boy'},
    {id:'c2',question:'What is he doing?',answer:'He is washing the car',distractors:'running, eating, dog'}
  ]}
];
function id(){return crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;}
function loadLibrary(){try{const x=JSON.parse(localStorage.getItem(LIBRARY_KEY));return Array.isArray(x)?x:[];}catch{return [];}}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function dbPut(key,file){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(file,key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
async function dbGet(key){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE);const req=tx.objectStore(STORE).get(key);req.onsuccess=()=>{db.close();resolve(req.result);};req.onerror=()=>{db.close();reject(req.error);};});}
async function dbDelete(key){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function say(text){if(!('speechSynthesis'in window))return;window.speechSynthesis.cancel();const s=new SpeechSynthesisUtterance(text);s.lang='en-GB';s.rate=.82;window.speechSynthesis.speak(s);}
function newQuestion(){return {id:id(),question:'',answer:'',distractors:''};}
function makePlan(items){const queues=shuffle(items.filter(x=>x.questions?.some(q=>q.question.trim()&&q.answer.trim()))).map(item=>({item,questions:shuffle(item.questions.filter(q=>q.question.trim()&&q.answer.trim()))}));const plan=[];while(queues.some(x=>x.questions.length)){for(const q of queues){const count=Math.min(q.questions.length,Math.random()<.5?1:2);for(let i=0;i<count;i++)plan.push({mediaId:q.item.id,question:q.questions.shift()});}}return plan;}
function Media({item,src}){if(!src)return <div className="media-placeholder">🖼️ Add a picture or video</div>;return item.type==='video'?<video key={src} src={src} controls playsInline preload="metadata" className="lesson-media"/>:<img className="lesson-media" src={src} alt={item.title}/>;}
export default function App(){
  const [library,setLibrary]=useState(loadLibrary);
  const [urls,setUrls]=useState({});
  const [page,setPage]=useState('home');
  const [editing,setEditing]=useState(null);
  const [draft,setDraft]=useState(null);
  const [file,setFile]=useState(null);
  const [error,setError]=useState('');
  const [plan,setPlan]=useState([]);
  const [step,setStep]=useState(0);
  const [picked,setPicked]=useState([]);
  const [checked,setChecked]=useState(false);
  const [wordOrder,setWordOrder]=useState([]);
  const all=useMemo(()=>[...sample,...library], [library]);
  useEffect(()=>{localStorage.setItem(LIBRARY_KEY,JSON.stringify(library));},[library]);
  useEffect(()=>{let active=true;const made=[];(async()=>{const map={};for(const item of library){try{const blob=await dbGet(item.id);if(blob){const url=URL.createObjectURL(blob);made.push(url);map[item.id]=url;}}catch{}}if(active)setUrls(map);else made.forEach(URL.revokeObjectURL);})();return()=>{active=false;made.forEach(URL.revokeObjectURL);};},[library]);
  const srcFor=item=>item.url||urls[item.id];
  const current=plan[step];const currentItem=all.find(x=>x.id===current?.mediaId);
  const answerWords=current?.question.answer.trim().split(/\s+/).filter(Boolean)||[];
  const correct=checked&&picked.length===answerWords.length&&picked.every((x,i)=>x.word===answerWords[i]);
  function start(){const p=makePlan(all);setPlan(p);setStep(0);setPicked([]);setChecked(false);setWordOrder([]);setPage('play');}
  useEffect(()=>{if(!current)return;const words=current.question.answer.trim().split(/\s+/).filter(Boolean).map((word,i)=>({id:`a${i}`,word}));const extra=current.question.distractors.split(',').map(x=>x.trim()).filter(Boolean).map((word,i)=>({id:`e${i}`,word}));setWordOrder(shuffle([...words,...extra]));},[step,plan]);
  function openEditor(item){setEditing(item?.id||null);setDraft(item?{...item,questions:item.questions.map(q=>({...q}))}:{id:id(),title:'',type:'image',questions:[newQuestion()]});setFile(null);setError('');setPage('edit');}
  function updateQuestion(qid,field,value){setDraft(d=>({...d,questions:d.questions.map(q=>q.id===qid?{...q,[field]:value}:q)}));}
  async function save(){if(!draft.title.trim()){setError('Please give this picture or video a title.');return;}if(!draft.questions.length||draft.questions.some(q=>!q.question.trim()||!q.answer.trim())){setError('Every question needs both a question and a correct answer.');return;}if(!editing&&!file){setError('Please choose a picture or video.');return;}try{if(file)await dbPut(draft.id,file);const entry={id:draft.id,title:draft.title.trim(),type:file?(file.type.startsWith('video/')?'video':'image'):draft.type,questions:draft.questions,url:undefined};setLibrary(old=>[...old.filter(x=>x.id!==entry.id),entry]);setPage('library');setError('');}catch(e){setError('Could not save this file. Your browser storage may be full. Try a smaller video.');}}
  async function remove(item){if(!window.confirm(`Delete “${item.title}” and all its questions?`))return;try{await dbDelete(item.id);}catch{}setLibrary(x=>x.filter(y=>y.id!==item.id));}
  const count=all.reduce((sum,x)=>sum+x.questions.length,0);
  return <div className="app">
    <header className="topbar"><button className="brand" onClick={()=>setPage('home')}>🌈 TilliTalk</button><nav><button onClick={()=>setPage('home')}>Home</button><button onClick={()=>setPage('library')}>Parent library</button></nav></header>
    <main>
      {page==='home'&&<section className="hero"><div className="hero-emoji">🐶 💬 🌟</div><h1>Let's talk!</h1><p>Look, listen, and make sentences with words.</p><button className="primary big" onClick={start}>▶ Start learning</button><p className="muted">{all.length} pictures & videos · {count} questions</p><div className="hint">Questions switch pictures after 1–2 turns, then revisit earlier pictures.</div></section>}
      {page==='play'&&<section className="play-area">{!current?<div className="hero"><h1>🎉 Amazing work!</h1><p>You finished this round.</p><button className="primary" onClick={start}>Play again</button><button onClick={()=>setPage('home')}>Home</button></div>:<><div className="progress"><span>Question {step+1} of {plan.length}</span><div className="progress-track"><div style={{width:`${(step/plan.length)*100}%`}}/></div></div><div className="play-card"><Media item={currentItem} src={srcFor(currentItem)}/><div className="question-line"><h2>{current.question.question}</h2><button aria-label="Hear question" className="sound" onClick={()=>say(current.question.question)}>🔊</button></div><p className="muted">Tap the words in the right order.</p><div className="answer-zone">{picked.length?picked.map(x=><button key={x.id} className="word selected" onClick={()=>{setPicked(p=>p.filter(w=>w.id!==x.id));setChecked(false);}}>{x.word}</button>):<span className="muted">Your sentence goes here…</span>}</div><div className="word-bank">{wordOrder.filter(x=>!picked.some(p=>p.id===x.id)).map(x=><button key={x.id} className="word" onClick={()=>{setPicked(p=>[...p,x]);setChecked(false);say(x.word);}}>{x.word}</button>)}</div>{checked&&<div role="status" className={'feedback '+(correct?'good':'try')}>{correct?'🌟 Well done!':'💛 Good try! Tap the words to change your answer.'}</div>}<div className="actions"><button onClick={()=>{setPicked([]);setChecked(false);}}>Clear</button>{correct?<button className="primary" onClick={()=>{say(current.question.answer);setStep(s=>s+1);setPicked([]);setChecked(false);}}>Next ➜</button>:<button className="primary" disabled={!picked.length} onClick={()=>{setChecked(true);if(picked.length===answerWords.length&&picked.every((x,i)=>x.word===answerWords[i]))say(current.question.answer);}}>Check answer</button>}</div></div></>}</section>}
      {page==='library'&&<section className="parent"><div className="heading-row"><div><h1>Parent media library</h1><p className="muted">One picture or video can have as many questions as you like.</p></div><button className="primary" onClick={()=>openEditor()}>+ Add media</button></div><div className="warning">🔒 Prototype storage: your uploads are saved only in this browser, not to GitHub or other devices. This parent area is not password-protected yet. Don't upload sensitive family media.</div><div className="library-grid">{all.map(item=><article className="media-card" key={item.id}><Media item={item} src={srcFor(item)}/><div className="card-info"><h3>{item.title}</h3><p className="muted">{item.questions.length} questions · {item.type}{item.url?' · demo':''}</p><div className="actions">{!item.id.startsWith('sample-')?<><button onClick={()=>openEditor(item)}>Edit</button><button className="danger" onClick={()=>remove(item)}>Delete</button></>:<span className="muted">Demo lesson (read-only)</span>}</div></div></article>)}</div></section>}
      {page==='edit'&&draft&&<section className="parent editor"><div className="heading-row"><h1>{editing?'Edit media':'Add picture or video'}</h1><button onClick={()=>setPage('library')}>← Back</button></div><label>Title<input value={draft.title} placeholder="e.g. Brown dog running" onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label><label>{editing?'Replace picture/video (optional)':'Picture or video'}<input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={e=>{const f=e.target.files?.[0];setFile(f||null);setError('');}}/></label>{file&&<p className="muted">Selected: {file.name} ({(file.size/1024/1024).toFixed(1)} MB). Large videos may exceed browser storage limits.</p>}<div className="heading-row"><h2>Questions and answers</h2><button onClick={()=>setDraft(d=>({...d,questions:[...d.questions,newQuestion()]}))}>+ Add question</button></div>{draft.questions.map((q,i)=><div className="question-editor" key={q.id}><div className="heading-row"><h3>Question {i+1}</h3><button className="danger" onClick={()=>setDraft(d=>({...d,questions:d.questions.filter(x=>x.id!==q.id)}))}>Remove</button></div><label>Question<input value={q.question} placeholder="Who is running?" onChange={e=>updateQuestion(q.id,'question',e.target.value)}/></label><label>Correct answer<input value={q.answer} placeholder="The dog" onChange={e=>updateQuestion(q.id,'answer',e.target.value)}/></label><label>Extra wrong words (separate with commas)<input value={q.distractors} placeholder="cat, man, sleeping" onChange={e=>updateQuestion(q.id,'distractors',e.target.value)}/></label></div>)}{error&&<p className="error" role="alert">{error}</p>}<div className="actions"><button onClick={()=>setPage('library')}>Cancel</button><button className="primary" onClick={save}>Save to library</button></div></section>}
    </main><footer>Made with care for little learners 💛</footer>
  </div>;
}
