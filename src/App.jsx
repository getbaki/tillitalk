import { supabase } from './supabase';
import './TilliTalkFun.css';
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

function say(text, language = 'en', volume = 1) {
  if (!('speechSynthesis' in window)) return;

  const speechLanguages = {
    en: 'en-GB',
    nl: 'nl-NL',
    fr: 'fr-FR',
    es: 'es-ES',
    de: 'de-DE',
    pt: 'pt-BR',
    ar: 'ar-SA',
    sw: 'sw-KE',
    ig: 'ig-NG',
    yo: 'yo-NG',
    ha: 'ha-NG',
    zh: 'zh-CN',
    ru: 'ru-RU'
  };

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = speechLanguages[language] || 'en-GB';
  utterance.rate = 0.85;
  utterance.volume = Math.max(0, Math.min(1, volume));

  window.speechSynthesis.speak(utterance);
}


const correctMessages = [
  '🌟 Wonderful!',
  '👏 Good job!',
  '🎉 You did it!',
  "💛 You're doing so well!",
  '⭐ Fantastic!',
  '🦊 Clever thinking!',
  '✨ Brilliant!',
  '🥳 Amazing work!',
  '🌈 Keep shining!'
];

const tryAgainMessages = [
  "💛 Don't worry, you'll get it!",
  '🌈 Good try! Have another go.',
  '🦊 Keep going! You can do it!',
  "🌟 You're learning! Try again.",
  '💪 Take your time. You can do this!',
  '💕 Every try helps you learn!'
];


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
  const [dragActive,setDragActive]=useState(false);
  const [selectedMedia,setSelectedMedia]=useState(null);
  const [mediaPreview,setMediaPreview]=useState('');
  const [cloudQuestions,setCloudQuestions]=useState([]);
  const [lessonLanguage,setLessonLanguage]=useState('en');
  const [learnerLanguage,setLearnerLanguage]=useState('en');
  const [voiceMuted, setVoiceMuted] = useState(() => localStorage.getItem('tillitalk-voice-muted') === 'true');
  const [voiceVolume, setVoiceVolume] = useState(() => {
    const saved = Number(localStorage.getItem('tillitalk-voice-volume'));
    return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 1;
  });
  function speak(text, language = learnerLanguage) {
    if (!voiceMuted && voiceVolume > 0) say(text, language, voiceVolume);
  }
  function toggleMute() {
    setVoiceMuted(previous => {
      if (!previous) window.speechSynthesis?.cancel();
      return !previous;
    });
  }
  useEffect(() => { localStorage.setItem('tillitalk-voice-muted', String(voiceMuted)); }, [voiceMuted]);
  useEffect(() => { localStorage.setItem('tillitalk-voice-volume', String(voiceVolume)); }, [voiceVolume]);
  const [lessonMode,setLessonMode]=useState('helper');
  const [helperLanguage,setHelperLanguage]=useState('en');
  const [lessonBusy,setLessonBusy]=useState(false);
  const [lessonMessage,setLessonMessage]=useState('');
  const [publishedLessons,setPublishedLessons]=useState([]);
  const [publicLoading,setPublicLoading]=useState(false);
  const [publicError,setPublicError]=useState('');
  
const languages = [
  ['en', 'English'],
  ['nl', 'Dutch'],
  ['fr', 'French'],
  ['es', 'Spanish'],
  ['de', 'German'],
  ['pt', 'Portuguese'],
  ['ar', 'Arabic'],
  ['sw', 'Swahili'],
  ['ig', 'Igbo'],
  ['yo', 'Yoruba'],
  ['ha', 'Hausa'],
  ['zh', 'Mandarin Chinese (Pinyin)'],
  ['ru', 'Russian']
];

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
  
  const [correctCount, setCorrectCount] = useState(0);
  const [celebration, setCelebration] = useState('');
  
useEffect(() => {
  if (!celebration) return;

  const timer = setTimeout(() => {
    setCelebration('');
  }, celebration === 'band' ? 6700 : 5000);

  return () => clearTimeout(timer);
}, [celebration]);

  const all=useMemo(()=>[...sample,...library,...publishedLessons], [library,publishedLessons]);
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
  async function openCloudEditor(item){
    setSelectedMedia(item);setCloudQuestions([]);setMediaPreview('');setLessonMessage('Loading lesson…');setPage('cloud-edit');
    const [{data:questions,error:questionError},{data:preview,error:previewError}]=await Promise.all([
      supabase.from('questions').select('id,question_text,correct_answer,distractors,tense,category,presentation_mode,is_published,language').eq('media_id',item.id).order('created_at'),
      supabase.storage.from('lesson-media').createSignedUrl(item.storage_path,3600)
    ]);
    if(questionError)setLessonMessage('Cannot load questions: '+questionError.message);
    else {setCloudQuestions(questions||[]);setLessonMessage('');}
    if(previewError)setLessonMessage('Cannot preview media: '+previewError.message);
    else setMediaPreview(preview?.signedUrl||'');
  }
  function blankCloudQuestion(){return {id:'new-'+id(),question_text:'',correct_answer:'',distractors:[],tense:'present_continuous',category:'what',presentation_mode:'visible',is_published:false,language:lessonLanguage};}
  function changeCloudQuestion(qid,field,value){setCloudQuestions(old=>old.map(q=>q.id===qid?{...q,[field]:value}:q));}
  async function saveCloudQuestions(){
    if(!selectedMedia||lessonBusy)return;
    if(cloudQuestions.some(q=>!q.question_text.trim()||!q.correct_answer.trim())){setLessonMessage('Please fill in every question and answer, or remove empty questions.');return;}
    setLessonBusy(true);setLessonMessage('Saving questions…');
    try{
      const existing=cloudQuestions.filter(q=>!q.id.startsWith('new-'));
      const added=cloudQuestions.filter(q=>q.id.startsWith('new-'));
      const toRecord=q=>({media_id:selectedMedia.id,question_text:q.question_text.trim(),correct_answer:q.correct_answer.trim(),distractors:Array.isArray(q.distractors)?q.distractors:q.distractors.split(',').map(x=>x.trim()).filter(Boolean),tense:q.tense,category:q.category,presentation_mode:q.presentation_mode,language:q.language,is_published:!!q.is_published});
      for(const q of existing){const {error}=await supabase.from('questions').update(toRecord(q)).eq('id',q.id);if(error)throw error;}
      if(added.length){const {error}=await supabase.from('questions').insert(added.map(toRecord));if(error)throw error;}
      const {data,error}=await supabase.from('questions').select('id,question_text,correct_answer,distractors,tense,category,presentation_mode,is_published,language').eq('media_id',selectedMedia.id).order('created_at');
      if(error)throw error;setCloudQuestions(data||[]);setLessonMessage('Questions saved.');
    }catch(e){setLessonMessage('Could not save: '+e.message);}finally{setLessonBusy(false);}
  }
  async function deleteCloudQuestion(question){
    if(lessonBusy || !selectedMedia) return;
    if(!window.confirm(`Delete this question permanently?\n\n${question.question_text || '(New question)'}`)) return;
    if(question.id.startsWith('new-')){
      setCloudQuestions(old=>old.filter(q=>q.id!==question.id));
      setLessonMessage('Unsaved question removed.');
      return;
    }
    setLessonBusy(true);
    setLessonMessage('Deleting question…');
    try{
      const {data,error}=await supabase.from('questions').delete().eq('id',question.id).eq('media_id',selectedMedia.id).select('id');
      if(error)throw error;
      if(!data?.length)throw new Error('The question was not deleted. Check administrator permissions.');
      setCloudQuestions(old=>old.filter(q=>q.id!==question.id));
      setLessonMessage('Question deleted permanently.');
    }catch(e){setLessonMessage('Could not delete question: '+(e.message||String(e)));}
    finally{setLessonBusy(false);}
  }
  async function deleteCloudMedia(item){
    if(lessonBusy || uploading) return;
    if(!window.confirm(`Permanently delete “${item.title}” and ALL its questions? This cannot be undone.`))return;
    setLessonBusy(true);
    setAdminMessage('Deleting picture/video and its questions…');
    try{
      // Delete the database records before removing the stored file.
      const {error:questionError}=await supabase.from('questions').delete().eq('media_id',item.id);
      if(questionError)throw questionError;
      const {data:deleted,error:mediaError}=await supabase.from('media').delete().eq('id',item.id).select('id');
      if(mediaError)throw mediaError;
      if(!deleted?.length)throw new Error('The picture was not deleted. Check administrator permissions.');
      setCloudMedia(old=>old.filter(m=>m.id!==item.id));
      setPublishedLessons(old=>old.filter(m=>m.id!==item.id));
      if(selectedMedia?.id===item.id){setSelectedMedia(null);setCloudQuestions([]);setPage('admin');}
      const {error:storageError}=await supabase.storage.from('lesson-media').remove([item.storage_path]);
      setAdminMessage(storageError ? 'Picture and questions deleted from the library, but the stored file could not be removed: '+storageError.message : 'Picture/video and its questions deleted permanently.');
    }catch(e){setAdminMessage('Could not finish deletion: '+(e.message||String(e))+'. Some questions may already have been deleted.');}
    finally{setLessonBusy(false);}
  }
  async function generateCloudQuestions(){
    if(!selectedMedia||lessonBusy)return;
    if(selectedMedia.media_type==='video'){setLessonMessage('AI analysis of videos is not available yet. You can still add questions manually.');return;}
    setLessonBusy(true);setLessonMessage('AI is examining the picture. This may take a moment…');
    try{
      const {data,error}=await supabase.functions.invoke('generate-questions',{body:{media_id:selectedMedia.id,language:lessonLanguage}});
      if(error)throw new Error(data?.error||error.message);
      if(data?.error)throw new Error(data.error);
      if(!Array.isArray(data?.questions)||!data.questions.length)throw new Error('No questions returned.');
      const suggestions=data.questions.map(q=>({...blankCloudQuestion(),question_text:q.question_text||'',correct_answer:q.correct_answer||'',distractors:Array.isArray(q.distractors)?q.distractors:[],tense:q.tense||'present_continuous',category:q.category||'what',presentation_mode:q.presentation_mode||'visible',language:lessonLanguage}));
      setCloudQuestions(old=>[...old,...suggestions]);setLessonMessage(`${suggestions.length} AI suggestions added. Review and save them before publishing.`);
    }catch(e){setLessonMessage('AI generation unavailable: '+e.message+' Check the Edge Function setup instructions.');}
    finally{setLessonBusy(false);}
  }
  async function publishCloudLesson(){
    if(!selectedMedia||lessonBusy)return;
    if(cloudQuestions.some(q=>q.id.startsWith('new-'))){setLessonMessage('Save your questions before publishing.');return;}
    const approved=cloudQuestions.filter(q=>q.is_published);
    if(!approved.length){setLessonMessage('Tick at least one approved question before publishing.');return;}
    setLessonBusy(true);
    const {error}=await supabase.from('media').update({is_published:true}).eq('id',selectedMedia.id);
    if(error)setLessonMessage('Could not publish: '+error.message);
    else{setSelectedMedia(m=>({...m,is_published:true}));setCloudMedia(old=>old.map(m=>m.id===selectedMedia.id?{...m,is_published:true}:m));setLessonMessage('Lesson published! Approved questions can now be used by learners.');}
    setLessonBusy(false);
  }
  async function loadPublishedLessons(){
    setPublicLoading(true);
    setPublicError('');
    const {data:media,error:mediaError}=await supabase.from('media').select('id,title,media_type,storage_path').eq('is_published',true);
    if(mediaError){setPublicError('Could not load published lessons: '+mediaError.message);setPublicLoading(false);return [];}
    const {data:questions,error:questionError}=await supabase.from('questions').select('id,media_id,question_text,correct_answer,distractors,language').eq('is_published',true);
    if(questionError){setPublicError('Could not load published questions: '+questionError.message);setPublicLoading(false);return [];}
    let missingMediaAccess=false;
    const withUrls=await Promise.all((media||[]).map(async m=>{
      // Public media is served only after the server confirms that it is published.
     
try {
  const url = new URL(
    import.meta.env.VITE_SUPABASE_URL + '/functions/v1/smart-worker'
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    },
    body: JSON.stringify({ media_id: m.id })
  });

        if(!response.ok){missingMediaAccess=true;return null;}const payload=await response.json();
        return {id:m.id,title:m.title,type:m.media_type,url:payload.url,questions:(questions||[]).filter(q=>q.media_id===m.id&&q.language===learnerLanguage).map(q=>({id:q.id,question:q.question_text,answer:q.correct_answer,distractors:(q.distractors||[]).join(', ')}))};
      }catch{missingMediaAccess=true;return null;}
    }));
    const lessons=withUrls.filter(Boolean);
    if(missingMediaAccess)setPublicError('Some published pictures could not be opened. The secure published-media Edge Function may need to be deployed or checked.');
    setPublishedLessons(lessons);setPublicLoading(false);return lessons;
  }
  useEffect(()=>{
    if(page==='library')loadPublishedLessons();
  },[page,learnerLanguage]);
  async function signIn(e){
    e.preventDefault();setAdminMessage('Signing in…');
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    setPassword('');
    setAdminMessage(error?'Sign-in failed: '+error.message:'Signed in. Checking administrator access…');
  }
  async function signOut(){await supabase.auth.signOut();setAdminMessage('Signed out.');}
  function selectUploadFiles(files){
    if(uploading)return;
    const accepted=Array.from(files||[]).filter(f=>f.type.startsWith('image/')||f.type.startsWith('video/')||/\.(gif|png|jpe?g|webp|bmp|avif|mp4|webm|mov|m4v)$/i.test(f.name));
    setUploadFiles(old=>{
      const seen=new Set(old.map(f=>`${f.name}:${f.size}:${f.lastModified}`));
      return [...old,...accepted.filter(f=>!seen.has(`${f.name}:${f.size}:${f.lastModified}`))];
    });
    setUploadStatus([]);
    setAdminMessage(accepted.length===0?'No supported pictures or videos found.':'');
  }
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
  async function start(){const lessons=await loadPublishedLessons()||[];const p=makePlan([...sample,...library,...lessons]);setPlan(p);setStep(0);setPicked([]);setChecked(false);setWordOrder([]);setPage('play');}
  useEffect(()=>{if(!current)return;const words=current.question.answer.trim().split(/\s+/).filter(Boolean).map((word,i)=>({id:`a${i}`,word}));const extra=current.question.distractors.split(',').map(x=>x.trim()).filter(Boolean).map((word,i)=>({id:`e${i}`,word}));setWordOrder(shuffle([...words,...extra]));},[step,plan]);
  
useEffect(() => {
  if (page !== 'play' || !current) return;

  const timer = setTimeout(() => {
    speak(current.question.question, learnerLanguage);
  }, 400);

  return () => {
    clearTimeout(timer);
    window.speechSynthesis?.cancel();
  };
}, [page, step, plan, learnerLanguage]);

  function openEditor(item){setEditing(item?.id||null);setDraft(item?{...item,questions:item.questions.map(q=>({...q}))}:{id:id(),title:'',type:'image',questions:[newQuestion()]});setFile(null);setError('');setPage('edit');}
  function updateQuestion(qid,field,value){setDraft(d=>({...d,questions:d.questions.map(q=>q.id===qid?{...q,[field]:value}:q)}));}
  async function save(){if(!draft.title.trim()){setError('Please give this picture or video a title.');return;}if(!draft.questions.length||draft.questions.some(q=>!q.question.trim()||!q.answer.trim())){setError('Every question needs both a question and a correct answer.');return;}if(!editing&&!file){setError('Please choose a picture or video.');return;}try{if(file)await dbPut(draft.id,file);const entry={id:draft.id,title:draft.title.trim(),type:file?(file.type.startsWith('video/')?'video':'image'):draft.type,questions:draft.questions,url:undefined};setLibrary(old=>[...old.filter(x=>x.id!==entry.id),entry]);setPage('library');setError('');}catch(e){setError('Could not save this file. Your browser storage may be full. Try a smaller video.');}}
  async function remove(item){if(!window.confirm(`Delete “${item.title}” and all its questions?`))return;try{await dbDelete(item.id);}catch{}setLibrary(x=>x.filter(y=>y.id!==item.id));}
  const count=all.reduce((sum,x)=>sum+x.questions.length,0);
 
return <div className="app">
  {page === 'play' && celebration === 'streamers' && (
    <div className="streamer-celebration" aria-label="Celebration!" role="status">
      <span>🎊</span>
      <span>🎉</span>
      <span>✨</span>
      <span>🎊</span>
      <span>🎉</span>
      <strong>Hooray! You're a star!</strong>
    </div>
  )}

 
{page === 'play' && celebration === 'band' && (
  <div className="animal-band" role="status" aria-label="Animal marching band celebration"
    style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.78)', padding: '12px' }}>
    <video
      className="animal-band-video"
      src="/animal-band.mp4"
      autoPlay
      muted
      playsInline
      preload="auto"
      style={{ display: 'block', width: '100%', maxWidth: '900px', maxHeight: '90vh', objectFit: 'contain', borderRadius: '18px' }}
    />
  </div>
)}


  
    <header className="topbar">
  <button className="brand" onClick={()=>setPage('home')}>
    <img
      src="/tillitalk-logo.png"
      alt="TilliTalk"
      style={{height:'64px',width:'auto',maxWidth:'100%',objectFit:'contain'}}
    />
  </button>
  <nav>
    <button onClick={()=>setPage('home')}>Home</button>
    <button onClick={()=>setPage('library')}>Demo library</button>
    <button onClick={()=>setPage('admin')}>Admin</button>
  </nav>
</header>
    <main>
      {page==='home'&&<section className="hero"><div className="hero-emoji">🐶 💬 🌟</div><h1>Let's talk!</h1><p>Look, listen, and make sentences with words.</p><div className="language-picker"><label>Learning language <select value={learnerLanguage} onChange={e=>setLearnerLanguage(e.target.value)}>{languages.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label></div><button className="primary big" disabled={publicLoading} onClick={start}>{publicLoading?'Loading lessons…':'▶ Start learning'}</button><p className="muted">{all.length} pictures & videos · {count} questions</p><div className="hint">Questions switch pictures after 1–2 turns, then revisit earlier pictures.</div></section>}
      {page === 'play' && (
        <section className="play-area">
          <div aria-label="Voice controls" style={{display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap',justifyContent:'flex-end',padding:'8px 0 16px'}}>
            <button type="button" onClick={toggleMute} aria-label={voiceMuted ? 'Unmute voice' : 'Mute voice'} aria-pressed={voiceMuted} style={{padding:'9px 14px',borderRadius:'12px'}}>
              {voiceMuted ? '🔇 Unmute' : '🔊 Mute'}
            </button>
            <label htmlFor="voice-volume" style={{display:'flex',alignItems:'center',gap:'9px'}}>
              Volume
              <input id="voice-volume" type="range" min="0" max="100" step="5" value={Math.round(voiceVolume * 100)} onChange={e => {
                const next = Number(e.target.value) / 100;
                setVoiceVolume(next);
                if (next === 0) window.speechSynthesis?.cancel();
              }} aria-label="Voice volume" style={{width:'110px'}} />
              <span style={{minWidth:'40px'}}>{Math.round(voiceVolume * 100)}%</span>
            </label>
          </div>
          {!current ? (
            <div className="hero">
              <h1>🎉 Amazing work!</h1>
              <p>You finished this round.</p>
              <button className="primary" onClick={start}>Play again</button>
              <button onClick={() => setPage('home')}>Home</button>
            </div>
          ) : (
            <>
              <div className="progress">
                <span>Question {step + 1} of {plan.length}</span>
                <div className="progress-track">
                  <div style={{ width: `${(step / plan.length) * 100}%` }} />
                </div>
              </div>
              <div className="play-card">
                <Media item={currentItem} src={srcFor(currentItem)} />
                <div className="question-line">
                  <h2>{current.question.question}</h2>
                  <button aria-label="Hear question" className="sound" onClick={() => speak(current.question.question, learnerLanguage)}>🔊</button>
                </div>
                <p className="muted">Tap the words in the right order.</p>
                <div className="answer-zone">
                  {picked.length ? picked.map(x => (
                    <button key={x.id} className="word selected" onClick={() => {
                      setPicked(p => p.filter(w => w.id !== x.id));
                      setChecked(false);
                    }}>{x.word}</button>
                  )) : <span className="muted">Your sentence goes here…</span>}
                </div>
                <div className="word-bank">
                  {wordOrder.filter(x => !picked.some(p => p.id === x.id)).map(x => (
                    <button key={x.id} className="word" onClick={() => {
                      setPicked(p => [...p, x]);
                      setChecked(false);
                      speak(x.word, learnerLanguage);
                    }}>{x.word}</button>
                  ))}
                </div>
                {checked && (
                  <div role="status" className={'feedback ' + (correct ? 'good' : 'try')}>
                    {correct
                      ? correctMessages[step % correctMessages.length]
                      : tryAgainMessages[step % tryAgainMessages.length]}
                  </div>
                )}
                <div className="actions">
                  <button onClick={() => { setPicked([]); setChecked(false); }}>Clear</button>
                  {correct ? (
                    <button className="primary" onClick={() => {
                      window.speechSynthesis?.cancel();
                      setStep(s => s + 1);
                      setPicked([]);
                      setChecked(false);
                    }}>Next ➜</button>
                  ) : (
                    <button className="primary" disabled={!picked.length} onClick={() => {
                      const isCorrect = picked.length === answerWords.length &&
                        picked.every((x, i) => x.word === answerWords[i]);
                      setChecked(true);
                      if (isCorrect) {
                        const nextCount = correctCount + 1;
                        setCorrectCount(nextCount);
                        if (nextCount % 9 === 0) setCelebration('band');
                        else if (nextCount % 3 === 0) setCelebration('streamers');
                        speak(current.question.answer, learnerLanguage);
                      }
                    }}>Check answer</button>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      )}
      {page==='library'&&<section className="parent"><div className="heading-row"><div><h1>Learning library</h1><p className="muted">Sample lessons and published TilliTalk lessons. Private drafts stay in the administrator dashboard.</p><div className="language-picker"><label>Learning language <select value={learnerLanguage} onChange={e=>setLearnerLanguage(e.target.value)}>{languages.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label></div>{publicLoading&&<p role="status">Loading published lessons…</p>}{publicError&&<p role="alert" className="warning">{publicError}</p>}</div></div><div className="library-grid">{all.map(item=><article className="media-card" key={item.id}><Media item={item} src={srcFor(item)}/><div className="card-info"><h3>{item.title}</h3><p className="muted">{item.questions.length} questions · {item.type}</p></div></article>)}</div></section>}
       {page==='admin'&&<section className="parent"><h1>🔒 TilliTalk administrator</h1>
         {!session?<form className="admin-panel" onSubmit={signIn}><h2>Sign in</h2><p className="muted">Use the administrator account you created in Supabase.</p><label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" type="submit">Sign in</button></form>:
         <><div className="heading-row"><p className="muted">Signed in as {session.user.email}</p><button onClick={signOut}>Sign out</button></div>
           {adminChecking?<p>Checking administrator access…</p>:!adminAllowed?<div className="warning">This account is not on the TilliTalk administrator list. Sign in with the account you registered in Supabase.</div>:
           <><div className="admin-panel"><h2>Bulk upload pictures, GIFs and videos</h2><p className="muted">Choose multiple files together. Each file is saved as a private draft. Nothing is published automatically.</p><div className={'upload-dropzone'+(dragActive?' is-dragging':'')+(uploading?' is-disabled':'')}
             onDragEnter={e=>{e.preventDefault();e.stopPropagation();if(!uploading)setDragActive(true);}}
             onDragOver={e=>{e.preventDefault();e.stopPropagation();if(!uploading)setDragActive(true);}}
             onDragLeave={e=>{e.preventDefault();e.stopPropagation();if(!e.currentTarget.contains(e.relatedTarget))setDragActive(false);}}
             onDrop={e=>{e.preventDefault();e.stopPropagation();setDragActive(false);selectUploadFiles(e.dataTransfer.files);}}>
             <div className="upload-dropzone-icon" aria-hidden="true">📂</div>
             <strong>Drag pictures, GIFs or videos here</strong>
             <span>or choose files from your computer</span>
             <label className="upload-choose-button">Choose files<input type="file" accept="image/*,video/*,.mov,.m4v" multiple disabled={uploading} onChange={e=>{selectUploadFiles(e.target.files);e.target.value='';}}/></label>
           </div><p>{uploadFiles.length} files selected {uploadFiles.length>0&&<button type="button" disabled={uploading} onClick={()=>{setUploadFiles([]);setUploadStatus([]);}}>Clear selection</button>}</p><button className="primary" disabled={!uploadFiles.length||uploading} onClick={uploadAll}>{uploading?'Uploading…':`Upload ${uploadFiles.length} files`}</button><p className="muted">Upload files up to 50 MB each. Your Supabase project may have a lower storage upload limit. Keep this tab open until uploads finish.</p></div>
           {!!uploadStatus.length&&<div className="admin-panel"><h2>Upload results</h2><ul className="upload-results">{uploadStatus.map((x,i)=><li key={i}><span>{x.name}</span><span>{x.status}</span></li>)}</ul></div>}
           <div className="admin-panel"><h2>Master library — {cloudMedia.length} items</h2><p className="muted">Draft media is stored in Supabase, but it will not appear in the children's game until we add questions and publish it.</p><ul className="upload-results">{cloudMedia.map(x=><li key={x.id}><button className="library-open" onClick={()=>openCloudEditor(x)}>{x.title} <span className="muted">— Edit lesson →</span></button><span>{x.is_published?'Published':'Draft'}</span><button type="button" className="danger" disabled={lessonBusy||uploading} onClick={()=>deleteCloudMedia(x)} aria-label={`Delete ${x.title} and all its questions`}>🗑 Delete</button></li>)}</ul></div></>}
         </>}
         {adminMessage&&<p role="status" className="hint">{adminMessage}</p>}
       </section>}
      {page==='cloud-edit'&&selectedMedia&&<section className="parent lesson-editor">
        <div className="heading-row"><div><h1>✏️ Lesson editor</h1><p className="muted">Review AI suggestions, save, then publish approved questions.</p></div><button onClick={()=>setPage('admin')}>← Back to admin</button></div>
        <div className="admin-panel"><h2>{selectedMedia.title}</h2>
          {mediaPreview?<Media item={{title:selectedMedia.title,type:selectedMedia.media_type}} src={mediaPreview}/>:<p>Loading private media preview…</p>}
          <p className="muted">Status: {selectedMedia.is_published?'Published':'Private draft'}</p>
          <div className="heading-row"><label>Language for questions <select value={lessonLanguage} onChange={e=>setLessonLanguage(e.target.value)}>{languages.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
          <button className="primary" disabled={lessonBusy} onClick={generateCloudQuestions}>✨ Generate 8 questions with AI</button></div>
          <p className="muted">AI works with images after the secure Supabase Edge Function is installed. Videos need a later update. Review every suggestion.</p>
        </div>
        <div className="admin-panel"><div className="heading-row"><h2>Questions ({cloudQuestions.length})</h2><button disabled={lessonBusy} onClick={()=>setCloudQuestions(old=>[...old,blankCloudQuestion()])}>+ Add question</button></div>
          {cloudQuestions.map((q,i)=><div className="question-editor" key={q.id}>
            <div className="heading-row"><h3>Question {i+1} · {languages.find(x=>x[0]===q.language)?.[1]||q.language}</h3><label className="approve-toggle"><input type="checkbox" checked={!!q.is_published} onChange={e=>changeCloudQuestion(q.id,'is_published',e.target.checked)}/> Approved for learners</label></div>
            <label>Question<input value={q.question_text} onChange={e=>changeCloudQuestion(q.id,'question_text',e.target.value)}/></label>
            <label>Correct answer<input value={q.correct_answer} onChange={e=>changeCloudQuestion(q.id,'correct_answer',e.target.value)}/></label>
            <label>Extra wrong words (comma-separated)<input value={Array.isArray(q.distractors)?q.distractors.join(', '):q.distractors} onChange={e=>changeCloudQuestion(q.id,'distractors',e.target.value)}/></label>
            <div className="lesson-fields"><label>Grammar level<select value={q.tense} onChange={e=>changeCloudQuestion(q.id,'tense',e.target.value)}><option value="present_continuous">Present / current action</option><option value="past_continuous">Past continuous</option><option value="simple_past">Past</option><option value="future_will">Future</option><option value="future_going_to">Prediction</option></select></label>
            <label>Question type<select value={q.category} onChange={e=>changeCloudQuestion(q.id,'category',e.target.value)}>{['who','what','where','which','why','yes_no','when','how'].map(c=><option key={c} value={c}>{c}</option>)}</select></label>
            <label>Media display<select value={q.presentation_mode} onChange={e=>changeCloudQuestion(q.id,'presentation_mode',e.target.value)}><option value="visible">Keep visible</option><option value="hide_after_view">Hide after viewing</option><option value="pause_before_end">Pause before ending</option></select></label></div>
            <button type="button" className="danger" disabled={lessonBusy} onClick={()=>deleteCloudQuestion(q)}>🗑 Delete question</button>
          </div>)}
          {lessonMessage&&<p role="status" className="hint">{lessonMessage}</p>}
          <div className="actions"><button className="primary" disabled={lessonBusy} onClick={saveCloudQuestions}>{lessonBusy?'Working…':'Save questions'}</button><button disabled={lessonBusy} onClick={publishCloudLesson}>Publish approved lesson</button></div>
        </div>
      </section>}
{page==='edit'&&draft&&<section className="parent editor"><div className="heading-row"><h1>{editing?'Edit media':'Add picture or video'}</h1><button onClick={()=>setPage('library')}>← Back</button></div><label>Title<input value={draft.title} placeholder="e.g. Brown dog running" onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label><label>{editing?'Replace picture/video (optional)':'Picture or video'}<input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={e=>{const f=e.target.files?.[0];setFile(f||null);setError('');}}/></label>{file&&<p className="muted">Selected: {file.name} ({(file.size/1024/1024).toFixed(1)} MB). Large videos may exceed browser storage limits.</p>}<div className="heading-row"><h2>Questions and answers</h2><button onClick={()=>setDraft(d=>({...d,questions:[...d.questions,newQuestion()]}))}>+ Add question</button></div>{draft.questions.map((q,i)=><div className="question-editor" key={q.id}><div className="heading-row"><h3>Question {i+1}</h3><button className="danger" onClick={()=>setDraft(d=>({...d,questions:d.questions.filter(x=>x.id!==q.id)}))}>Remove</button></div><label>Question<input value={q.question} placeholder="Who is running?" onChange={e=>updateQuestion(q.id,'question',e.target.value)}/></label><label>Correct answer<input value={q.answer} placeholder="The dog" onChange={e=>updateQuestion(q.id,'answer',e.target.value)}/></label><label>Extra wrong words (separate with commas)<input value={q.distractors} placeholder="cat, man, sleeping" onChange={e=>updateQuestion(q.id,'distractors',e.target.value)}/></label></div>)}{error&&<p className="error" role="alert">{error}</p>}<div className="actions"><button onClick={()=>setPage('library')}>Cancel</button><button className="primary" onClick={save}>Save to library</button></div></section>}
    </main><footer>Made with care for little learners 💛</footer>
  </div>;
}