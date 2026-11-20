import { supabase } from './supabase';
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
  const [session,setSession]=useState(null);
  const [adminAllowed,setAdminAllowed]=useState(false);
  const [adminChecking,setAdminChecking]=useState(true);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [adminMessage,setAdminMessage]=useState('');
  const [cloudMedia,setCloudMedia]=useState([]);
  const [uploadFiles,setUploadFiles]=useState([]);
  const [uploadStatus,setUploadStatus]=useState([]);
  const [uploading,setUploading]=useState(false);
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
  useEffect(()=>{
    let mounted=true;
    async function applySession(nextSession){
      if(!mounted)return;
      setSession(nextSession);
      setAdminAllowed(false);
      setAdminChecking(!!nextSession);
      if(!nextSession){setCloudMedia([]);return;}
      const {data,error}=await supabase.from('app_admins').select('user_id').eq('user_id',nextSession.user.id).maybeSingle();
      if(!mounted)return;
      setAdminAllowed(!error && !!data);
      setAdminChecking(false);
      if(error)setAdminMessage('Could not check administrator access: '+error.message);
    }
    supabase.auth.getSession().then(({data})=>applySession(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,nextSession)=>{
      // Defer Supabase queries until after the auth event callback returns.
      setTimeout(()=>applySession(nextSession),0);
    });
    return()=>{mounted=false;subscription.unsubscribe();};
  },[]);
  useEffect(()=>{
    if(!adminAllowed)return;
    let cancelled=false;
    supabase.from('media').select('id,title,media_type,storage_path,is_published,created_at')
      .order('created_at',{ascending:false}).then(({data,error})=>{
        if(cancelled)return;
        if(error)setAdminMessage('Could not load library: '+error.message);
        else setCloudMedia(data||[]);
      });
    return()=>{cancelled=true;};
  },[adminAllowed]);
  async function signIn(e){
    e.preventDefault();setAdminMessage('Signing in…');
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    setPassword('');
    setAdminMessage(error?'Sign-in failed: '+error.message:'Signed in. Checking administrator access…');
  }
  async function signOut(){await supabase.auth.signOut();setAdminMessage('Signed out.');}
  async function uploadAll(){
    if(!adminAllowed||uploading||!uploadFiles.length)return;
    setUploading(true);setAdminMessage('Uploading files. Keep this tab open.');
    const statuses=uploadFiles.map(f=>({name:f.name,status:'Waiting'}));
    setUploadStatus([...statuses]);let successes=0;
    for(let i=0;i<uploadFiles.length;i++){
      const file=uploadFiles[i];
      statuses[i]={name:file.name,status:'Uploading…'};setUploadStatus([...statuses]);
      try{
        if(!file.type.startsWith('image/')&&!file.type.startsWith('video/'))throw new Error('Only images and videos are supported');
        if(file.size>50*1024*1024)throw new Error('File exceeds the 50 MB uploader limit');
        const ext=(file.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,10);
        const path=`library/${crypto.randomUUID()}.${ext||'bin'}`;
        const {error:storageError}=await supabase.storage.from('lesson-media').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
        if(storageError)throw storageError;
        const title=file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim()||'Untitled media';
        const {data,error:dbError}=await supabase.from('media').insert({title,media_type:file.type.startsWith('video/')?'video':'image',storage_path:path,is_published:false,owner_id:null}).select('id,title,media_type,storage_path,is_published,created_at').single();
        if(dbError){await supabase.storage.from('lesson-media').remove([path]);throw dbError;}
        setCloudMedia(prev=>[data,...prev]);successes++;
        statuses[i]={name:file.name,status:'Uploaded as draft'};
      }catch(err){statuses[i]={name:file.name,status:'Failed: '+(err.message||String(err))};}
      setUploadStatus([...statuses]);
    }
    setUploading(false);setUploadFiles([]);
    setAdminMessage(`${successes} of ${statuses.length} files uploaded. Drafts are private and not yet visible in the learning game.`);
  }
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
    <header className="topbar"><button className="brand" onClick={()=>setPage('home')}>🌈 TilliTalk</button><nav><button onClick={()=>setPage('home')}>Home</button><button onClick={()=>setPage('library')}>Demo library</button><button onClick={()=>setPage('admin')}>Admin</button></nav></header>
    <main>
      {page==='home'&&<section className="hero"><div className="hero-emoji">🐶 💬 🌟</div><h1>Let's talk!</h1><p>Look, listen, and make sentences with words.</p><button className="primary big" onClick={start}>▶ Start learning</button><p className="muted">{all.length} pictures & videos · {count} questions</p><div className="hint">Questions switch pictures after 1–2 turns, then revisit earlier pictures.</div></section>}
      {page==='play'&&<section className="play-area">{!current?<div className="hero"><h1>🎉 Amazing work!</h1><p>You finished this round.</p><button className="primary" onClick={start}>Play again</button><button onClick={()=>setPage('home')}>Home</button></div>:<><div className="progress"><span>Question {step+1} of {plan.length}</span><div className="progress-track"><div style={{width:`${(step/plan.length)*100}%`}}/></div></div><div className="play-card"><Media item={currentItem} src={srcFor(currentItem)}/><div className="question-line"><h2>{current.question.question}</h2><button aria-label="Hear question" className="sound" onClick={()=>say(current.question.question)}>🔊</button></div><p className="muted">Tap the words in the right order.</p><div className="answer-zone">{picked.length?picked.map(x=><button key={x.id} className="word selected" onClick={()=>{setPicked(p=>p.filter(w=>w.id!==x.id));setChecked(false);}}>{x.word}</button>):<span className="muted">Your sentence goes here…</span>}</div><div className="word-bank">{wordOrder.filter(x=>!picked.some(p=>p.id===x.id)).map(x=><button key={x.id} className="word" onClick={()=>{setPicked(p=>[...p,x]);setChecked(false);say(x.word);}}>{x.word}</button>)}</div>{checked&&<div role="status" className={'feedback '+(correct?'good':'try')}>{correct?'🌟 Well done!':'💛 Good try! Tap the words to change your answer.'}</div>}<div className="actions"><button onClick={()=>{setPicked([]);setChecked(false);}}>Clear</button>{correct?<button className="primary" onClick={()=>{say(current.question.answer);setStep(s=>s+1);setPicked([]);setChecked(false);}}>Next ➜</button>:<button className="primary" disabled={!picked.length} onClick={()=>{setChecked(true);if(picked.length===answerWords.length&&picked.every((x,i)=>x.word===answerWords[i]))say(current.question.answer);}}>Check answer</button>}</div></div></>}</section>}
             {page==='library'&&<section className="parent"><div className="heading-row"><div><h1>Demo library</h1><p className="muted">These are sample lessons and any lessons previously saved in this browser. New uploads go into the private administrator dashboard.</p></div></div><div className="library-grid">{all.map(item=><article className="media-card" key={item.id}><Media item={item} src={srcFor(item)}/><div className="card-info"><h3>{item.title}</h3><p className="muted">{item.questions.length} questions · {item.type}</p></div></article>)}</div></section>}
       {page==='admin'&&<section className="parent"><h1>🔒 TilliTalk administrator</h1>
         {!session?<form className="admin-panel" onSubmit={signIn}><h2>Sign in</h2><p className="muted">Use the administrator account you created in Supabase.</p><label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" type="submit">Sign in</button></form>:
         <><div className="heading-row"><p className="muted">Signed in as {session.user.email}</p><button onClick={signOut}>Sign out</button></div>
           {adminChecking?<p>Checking administrator access…</p>:!adminAllowed?<div className="warning">This account is not on the TilliTalk administrator list. Sign in with the account you registered in Supabase.</div>:
           <><div className="admin-panel"><h2>Bulk upload pictures, GIFs and videos</h2><p className="muted">Choose multiple files together. Each file is saved as a private draft. Nothing is published automatically.</p><input type="file" accept="image/*,video/*" multiple disabled={uploading} onChange={e=>{setUploadFiles(Array.from(e.target.files||[]));setUploadStatus([]);}}/><p>{uploadFiles.length} files selected</p><button className="primary" disabled={!uploadFiles.length||uploading} onClick={uploadAll}>{uploading?'Uploading…':`Upload ${uploadFiles.length} files`}</button><p className="muted">Upload files up to 50 MB each. Your Supabase project may have a lower storage upload limit. Keep this tab open until uploads finish.</p></div>
           {!!uploadStatus.length&&<div className="admin-panel"><h2>Upload results</h2><ul className="upload-results">{uploadStatus.map((x,i)=><li key={i}><span>{x.name}</span><span>{x.status}</span></li>)}</ul></div>}
           <div className="admin-panel"><h2>Master library — {cloudMedia.length} items</h2><p className="muted">Draft media is stored in Supabase, but it will not appear in the children's game until we add questions and publish it.</p><ul className="upload-results">{cloudMedia.map(x=><li key={x.id}><span>{x.title}</span><span>{x.is_published?'Published':'Draft'}</span></li>)}</ul></div></>}
         </>}
         {adminMessage&&<p role="status" className="hint">{adminMessage}</p>}
       </section>}
{page==='edit'&&draft&&<section className="parent editor"><div className="heading-row"><h1>{editing?'Edit media':'Add picture or video'}</h1><button onClick={()=>setPage('library')}>← Back</button></div><label>Title<input value={draft.title} placeholder="e.g. Brown dog running" onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label><label>{editing?'Replace picture/video (optional)':'Picture or video'}<input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={e=>{const f=e.target.files?.[0];setFile(f||null);setError('');}}/></label>{file&&<p className="muted">Selected: {file.name} ({(file.size/1024/1024).toFixed(1)} MB). Large videos may exceed browser storage limits.</p>}<div className="heading-row"><h2>Questions and answers</h2><button onClick={()=>setDraft(d=>({...d,questions:[...d.questions,newQuestion()]}))}>+ Add question</button></div>{draft.questions.map((q,i)=><div className="question-editor" key={q.id}><div className="heading-row"><h3>Question {i+1}</h3><button className="danger" onClick={()=>setDraft(d=>({...d,questions:d.questions.filter(x=>x.id!==q.id)}))}>Remove</button></div><label>Question<input value={q.question} placeholder="Who is running?" onChange={e=>updateQuestion(q.id,'question',e.target.value)}/></label><label>Correct answer<input value={q.answer} placeholder="The dog" onChange={e=>updateQuestion(q.id,'answer',e.target.value)}/></label><label>Extra wrong words (separate with commas)<input value={q.distractors} placeholder="cat, man, sleeping" onChange={e=>updateQuestion(q.id,'distractors',e.target.value)}/></label></div>)}{error&&<p className="error" role="alert">{error}</p>}<div className="actions"><button onClick={()=>setPage('library')}>Cancel</button><button className="primary" onClick={save}>Save to library</button></div></section>}
    </main><footer>Made with care for little learners 💛</footer>
  </div>;
}