import { supabase } from './supabase';
import './TilliTalkFun.css';
import { useEffect, useMemo, useRef, useState } from 'react';

const DB_NAME = 'tillitalk-media-v2';
const STORE = 'media';
const LIBRARY_KEY = 'tillitalk-library-v2';
const sample = []; // Built-in demo lessons removed; only your lessons appear.

const OFFLINE_DB_NAME = 'tillitalk-offline-lessons-v1';
const OFFLINE_STORE = 'language-packs';
const BUNDLED_LESSONS_MANIFEST = '/lessons/manifest.json';

// A language pack contains approved question data and actual picture/video Blobs.
// Expiring Supabase signed URLs are deliberately NOT stored as offline media.
function openOfflineDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(OFFLINE_DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(OFFLINE_STORE);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function readOfflinePack(language){
  const db=await openOfflineDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(OFFLINE_STORE,'readonly');
    const request=tx.objectStore(OFFLINE_STORE).get(language);
    request.onsuccess=()=>resolve(request.result||null);
    request.onerror=()=>reject(request.error);
    tx.oncomplete=()=>db.close();
    tx.onabort=()=>db.close();
  });
}
async function writeOfflinePack(language,lessons){
  const db=await openOfflineDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(OFFLINE_STORE,'readwrite');
    tx.objectStore(OFFLINE_STORE).put({savedAt:Date.now(),lessons},language);
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
    tx.onabort=()=>{db.close();reject(tx.error||new Error('Offline save was cancelled'));};
  });
}


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
  // A gentle, clear pace for early language learners.
  utterance.rate = 0.72;
  utterance.pitch = 1.08;

  // Voice names vary by Android device and browser. Prefer a natural-sounding
  // female voice in the selected language, falling back to any matching voice.
  const voices = window.speechSynthesis.getVoices();
  const target = utterance.lang.toLowerCase();
  const base = target.split('-')[0];
  const candidates = voices.filter(v => v.lang.toLowerCase().split('-')[0] === base);
  const femaleHints = /female|woman|samantha|victoria|karen|moira|tessa|zira|aria|jenny|susan|ava|serena|sonia|natasha|google uk english female/i;
  const preferred = candidates.find(v => femaleHints.test(v.name) && v.lang.toLowerCase() === target)
    || candidates.find(v => femaleHints.test(v.name))
    || candidates.find(v => v.lang.toLowerCase() === target)
    || candidates[0];
  if (preferred) utterance.voice = preferred;
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
// Temporary daily timer test. Restore 60 and 5 after testing.
const DAILY_MINUTES = 2;
const WARNING_MINUTES = 0.5;
const DAILY_KEY = 'tillitalk-daily-learning-test-v1';
function localDay(){const d=new Date();return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;}
function dailyRecord(child){const r=readSaved(DAILY_KEY,{})[child];return r?.day===localDay()?r:{day:localDay(),used:0,extra:0};}
function saveDaily(child,r){const all=readSaved(DAILY_KEY,{});all[child]=r;localStorage.setItem(DAILY_KEY,JSON.stringify(all));}
function remainingDaily(r){return Math.max(0,DAILY_MINUTES*60000+r.extra-r.used);}
// Silent analogue countdown, driven by the existing daily allowance.
function DailyClock({remaining, allowance}){
  const fraction=Math.max(0,Math.min(1,remaining/Math.max(1,allowance)));
  const seconds=Math.ceil(remaining/1000);
  const label=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  const color=remaining<=WARNING_MINUTES*60000?'#e46d66':fraction<=0.25?'#efb94d':'#83c99a';
  return <div role="img" aria-label={`${Math.floor(seconds/60)} minutes ${seconds%60} seconds of learning time left today`} style={{display:'inline-flex',flexDirection:'column',alignItems:'center',flexShrink:0,lineHeight:1,gap:2,color:'#7952a3'}}>
    <svg aria-hidden="true" viewBox="0 0 100 100" style={{width:48,height:48,display:'block'}}>
      <circle cx="50" cy="50" r="46" fill="white" stroke="#7952a3" strokeWidth="3"/>
      <circle cx="50" cy="50" r="34" fill="none" stroke="#eee3fa" strokeWidth="12"/>
      <circle cx="50" cy="50" r="34" fill="none" stroke={color} strokeWidth="12" strokeDasharray={`${fraction*2*Math.PI*34} ${2*Math.PI*34}`} transform="rotate(-90 50 50)" style={{transition:'stroke-dasharray 0.4s linear'}}/>
      {Array.from({length:12},(_,i)=><line key={i} x1="50" y1="7" x2="50" y2={i%3===0?15:11} stroke="#7952a3" strokeWidth="2" transform={`rotate(${i*30} 50 50)`}/>)}
      <line x1="50" y1="50" x2="50" y2="22" stroke="#7952a3" strokeWidth="3" strokeLinecap="round" transform={`rotate(${fraction*360} 50 50)`}/>
      <circle cx="50" cy="50" r="4" fill="#7952a3"/>
    </svg>
    <span aria-hidden="true" style={{fontSize:11,fontWeight:700,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{label} left</span>
  </div>;
}
const PROFILES_KEY = 'tillitalk-child-profiles-v1';
const PROGRESS_KEY = 'tillitalk-child-progress-v1';
const AVATARS = ['🦊','🐻','🐰','🦁','🐼','🐸','🐨','🦋'];
function readSaved(key, fallback){try{const value=JSON.parse(localStorage.getItem(key));return value && typeof value==='object'?value:fallback;}catch{return fallback;}}
function questionKey(item){return `${item.mediaId}:${item.question.id || item.question.question + '|' + item.question.answer}`;}
function levelStats(plan, outcomes){
  const unique=new Set(plan.map(questionKey));
  const attempts=[...unique].filter(key=>outcomes[key]);
  const firstCorrect=attempts.filter(key=>outcomes[key]==='correct').length;
  return {total:unique.size,attempted:attempts.length,firstCorrect,percent:unique.size?Math.round(firstCorrect/unique.size*100):0};
}

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
  const [cloudCounts,setCloudCounts]=useState({});
  const [cloudPreviews,setCloudPreviews]=useState({});
  const [selectedForDelete,setSelectedForDelete]=useState([]);
  const [librarySearch,setLibrarySearch]=useState('');
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
    const raw = localStorage.getItem('tillitalk-voice-volume');
    const saved = raw === null ? 1 : Number(raw);
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
  const offlineObjectUrls=useRef([]);
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
  const [hintVisible,setHintVisible]=useState(false);
  const [profiles,setProfiles]=useState(()=>{const saved=readSaved(PROFILES_KEY,[]);return Array.isArray(saved)?saved:[];});
  const [activeChildId,setActiveChildId]=useState(()=>localStorage.getItem('tillitalk-active-child-v1')||'');
  const [newChildName,setNewChildName]=useState('');
  const [newChildAvatar,setNewChildAvatar]=useState('🦊');
  const [progress,setProgress]=useState(()=>readSaved(PROGRESS_KEY,{}));
  const [usedHint,setUsedHint]=useState(false);
  const [firstAttemptMade,setFirstAttemptMade]=useState(false);
  const [parentMilestone,setParentMilestone]=useState(false);
  const [parentGateAnswer,setParentGateAnswer]=useState('');
  const [parentGate,setParentGate]=useState(()=>({a:Math.floor(Math.random()*7)+7,b:Math.floor(Math.random()*7)+4}));
  const [parentUnlocked,setParentUnlocked]=useState(false);
  const activeChild=profiles.find(p=>p.id===activeChildId);
  const childProgress=progress[activeChildId]||{};
  const childOutcomes=childProgress[learnerLanguage]?.outcomes||{};
  useEffect(()=>{localStorage.setItem(PROFILES_KEY,JSON.stringify(profiles));},[profiles]);
  useEffect(()=>{localStorage.setItem(PROGRESS_KEY,JSON.stringify(progress));},[progress]);
  useEffect(()=>{localStorage.setItem('tillitalk-active-child-v1',activeChildId);},[activeChildId]);
  function addChild(){
    const name=newChildName.trim().slice(0,30);
    if(!name)return;
    const child={id:id(),name,avatar:newChildAvatar};
    setProfiles(old=>[...old,child]);setActiveChildId(child.id);setNewChildName('');
  }
  function recordOutcome(outcome){
    if(!activeChildId||!current)return;
    const key=questionKey(current);
    setProgress(old=>{
      const child=old[activeChildId]||{};
      const language=child[learnerLanguage]||{};
      if(language.outcomes?.[key])return old;
      return {...old,[activeChildId]:{...child,[learnerLanguage]:{...language,outcomes:{...language.outcomes,[key]:outcome}}}};
    });
  }
  function resetQuestionState(){setPicked([]);setChecked(false);setHintVisible(false);setUsedHint(false);setFirstAttemptMade(false);}
  function closeMilestone(){
    setProgress(old=>{
      const child=old[activeChildId]||{};const language=child[learnerLanguage]||{};
      return {...old,[activeChildId]:{...child,[learnerLanguage]:{...language,milestone85Seen:true}}};
    });
    setParentMilestone(false);setParentUnlocked(false);setParentGateAnswer('');
    setParentGate({a:Math.floor(Math.random()*7)+7,b:Math.floor(Math.random()*7)+4});
  }
  const [wordOrder,setWordOrder]=useState([]);
  
  const [correctCount, setCorrectCount] = useState(0);
  const [celebration, setCelebration] = useState('');
  useEffect(()=>{setCorrectCount(0);setCelebration('');},[activeChildId]);
  useEffect(()=>{if(page!=='play')setCelebration('');},[page]);
  
useEffect(() => {
  if (!celebration) return;

  const timer = setTimeout(() => {
    setCelebration('');
  }, celebration === 'fox' ? 32000 : celebration === 'band' ? 17000 : celebration === 'streamers' ? 8000 : 5000);

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
  useEffect(()=>{
    if(!adminAllowed || !cloudMedia.length){setCloudCounts({});setCloudPreviews({});return;}
    let cancelled=false;
    (async()=>{
      const ids=cloudMedia.map(m=>m.id);
      // Query only media_id; no sensitive question content is needed for counts.
      const {data,error}=await supabase.from('questions').select('media_id').in('media_id',ids);
      if(!cancelled && !error){
        const counts={}; for(const q of data||[])counts[q.media_id]=(counts[q.media_id]||0)+1;
        setCloudCounts(counts);
      }
      // Signed thumbnails are private and expire after one hour.
      const previews={};
      for(let i=0;i<cloudMedia.length;i+=15){
        const batch=cloudMedia.slice(i,i+15);
        await Promise.all(batch.map(async m=>{
          const {data}=await supabase.storage.from('lesson-media').createSignedUrl(m.storage_path,3600);
          if(data?.signedUrl)previews[m.id]=data.signedUrl;
        }));
        if(cancelled)return;
        setCloudPreviews({...previews});
      }
    })();
    return()=>{cancelled=true;};
  },[adminAllowed,cloudMedia]);

  async function deleteSelectedCloudMedia(){
    if(lessonBusy||uploading||!selectedForDelete.length)return;
    const targets=cloudMedia.filter(m=>selectedForDelete.includes(m.id));
    if(!window.confirm(`Permanently delete ${targets.length} selected picture(s)/video(s) and ALL their questions? This cannot be undone.`))return;
    setLessonBusy(true);
    let done=0;const failed=[];
    for(const item of targets){
      try{
        const {error:qe}=await supabase.from('questions').delete().eq('media_id',item.id);
        if(qe)throw qe;
        const {data,error:me}=await supabase.from('media').delete().eq('id',item.id).select('id');
        if(me)throw me;
        if(!data?.length)throw new Error('Deletion blocked by database permissions');
        done++;
        setCloudMedia(old=>old.filter(m=>m.id!==item.id));
        setPublishedLessons(old=>old.filter(m=>m.id!==item.id));
        setSelectedForDelete(old=>old.filter(x=>x!==item.id));
        const {error:se}=await supabase.storage.from('lesson-media').remove([item.storage_path]);
        if(se)failed.push(`${item.title}: database deleted but storage cleanup failed`);
      }catch(e){failed.push(`${item.title}: ${e.message||String(e)}`);}
    }
    setAdminMessage(`${done} of ${targets.length} selected items deleted.${failed.length?' Problems: '+failed.join('; '):''}`);
    setLessonBusy(false);
  }

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
      if(error)throw error;setCloudQuestions(data||[]);setCloudCounts(old=>({...old,[selectedMedia.id]:(data||[]).length}));setLessonMessage('Questions saved.');
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
      setCloudCounts(old=>({...old,[selectedMedia.id]:Math.max(0,(old[selectedMedia.id]||0)-1)}));
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
  // Revoke only the previous offline preview URLs. Session URLs are created
  // again when a new session starts; avoid retaining expired signed URLs.
  function showDownloadedLessons(downloaded){
    offlineObjectUrls.current.forEach(URL.revokeObjectURL);
    const urls=[];
    const ready=downloaded.map(item=>{
      const url=URL.createObjectURL(item.blob);
      urls.push(url);
      return {id:item.id,title:item.title,type:item.type,url,questions:item.questions};
    });
    offlineObjectUrls.current=urls;
    setPublishedLessons(ready);
    return ready;
  }
  // Bundled media and questions are shipped in public/lessons and copied into
  // the installed Android application by the Vite/Capacitor build.
  // An absent manifest means this is still the web/offline-cache edition.
  async function loadBundledLessons(language){
    const response=await fetch(BUNDLED_LESSONS_MANIFEST,{cache:'no-store'});
    if(response.status===404)return null;
    if(!response.ok)throw new Error('The bundled lesson manifest could not be opened');
    const manifest=await response.json();
    if(!Array.isArray(manifest.lessons))throw new Error('The bundled lesson manifest is invalid');
    const usable=manifest.lessons.map(item=>({
      ...item,
      questions:(item.questions||[]).filter(q=>q.language===language && q.question?.trim() && q.answer?.trim())
    })).filter(item=>item.questions.length);
    // All bundled media must be local assets, never signed or remote URLs.
    const downloaded=await Promise.all(usable.map(async item=>{
      if(typeof item.media!=='string' || !/^\/lessons\/media\/[a-zA-Z0-9._-]+$/.test(item.media))
        throw new Error('Invalid bundled media path');
      const mediaResponse=await fetch(item.media);
      if(!mediaResponse.ok)throw new Error('Missing bundled picture: '+item.title);
      return {id:item.id,title:item.title,type:item.type,questions:item.questions,
        blob:await mediaResponse.blob()};
    }));
    return downloaded;
  }
  async function loadPublishedLessons(){
    setPublicLoading(true);
    setPublicError('');
    try{
      // Prefer files already inside the app, including on first launch offline.
      // When bundled lessons exist, they are the Level 1 base; network sync is
      // a separate future step and must not remove these installed lessons.
      const bundled=await loadBundledLessons(learnerLanguage);
      if(bundled!==null){
        if(!bundled.length)setPublicError('No approved bundled questions for this language yet.');
        return showDownloadedLessons(bundled);
      }
      // Each language has its own complete, downloadable lesson pack.
      const language=learnerLanguage;
      if(!navigator.onLine)throw new Error('Offline');
      const {data:media,error:mediaError}=await supabase.from('media')
        .select('id,title,media_type,storage_path').eq('is_published',true);
      if(mediaError)throw mediaError;
      const {data:questions,error:questionError}=await supabase.from('questions')
        .select('id,media_id,question_text,correct_answer,distractors,language')
        .eq('is_published',true).eq('language',language);
      if(questionError)throw questionError;

      const usable=(media||[]).map(m=>({
        ...m,
        questions:(questions||[]).filter(q=>q.media_id===m.id).map(q=>({
          id:q.id,question:q.question_text,answer:q.correct_answer,
          distractors:(q.distractors||[]).join(', ')
        }))
      })).filter(m=>m.questions.some(q=>q.question?.trim()&&q.answer?.trim()));

      // Do not replace a previously saved pack with a partially downloaded pack.
      const downloaded=await Promise.all(usable.map(async m=>{
        const response=await fetch(import.meta.env.VITE_SUPABASE_URL+'/functions/v1/smart-worker',{
          method:'POST',
          headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
          body:JSON.stringify({media_id:m.id})
        });
        if(!response.ok)throw new Error('A published picture could not be accessed');
        const payload=await response.json();
        if(!payload?.url)throw new Error('Missing published picture link');
        const mediaResponse=await fetch(payload.url);
        if(!mediaResponse.ok)throw new Error('A published picture could not be downloaded');
        const blob=await mediaResponse.blob();
        return {id:m.id,title:m.title,type:m.media_type,questions:m.questions,blob};
      }));

      // Keep the new lessons playable even if the device has insufficient storage.
      try{
        await writeOfflinePack(language,downloaded);
      }catch(saveError){
        setPublicError('Lessons loaded, but the device could not save them for offline use. Free up storage and try again.');
      }
      return showDownloadedLessons(downloaded);
    }catch(error){
      try{
        const saved=await readOfflinePack(learnerLanguage);
        if(saved?.lessons?.length){
          setPublicError('Using downloaded lessons. Connect to Wi-Fi to check for new lessons.');
          return showDownloadedLessons(saved.lessons);
        }
        setPublishedLessons([]);
        setPublicError('No downloaded lessons are available yet. Connect to Wi-Fi and start learning once to download them.');
        return [];
      }catch{
        setPublishedLessons([]);
        setPublicError('Could not open downloaded lessons. Connect to Wi-Fi and try again.');
        return [];
      }
    }finally{
      setPublicLoading(false);
    }
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
  useEffect(() => { setHintVisible(false);setUsedHint(false);setFirstAttemptMade(false); }, [step, plan]);
  const [daily,setDaily]=useState(()=>dailyRecord(activeChildId));
  const [breakAnswer,setBreakAnswer]=useState('');
  const [breakGate,setBreakGate]=useState(()=>({a:12+Math.floor(Math.random()*8),b:7+Math.floor(Math.random()*8)}));
  const [breakUnlocked,setBreakUnlocked]=useState(false);
  const [showSound,setShowSound]=useState(false);
  const remaining=remainingDaily(dailyRecord(activeChildId));
  const dailyBlocked=!!activeChildId && remaining===0;
  useEffect(()=>{
    setDaily(dailyRecord(activeChildId));setBreakUnlocked(false);setBreakAnswer('');
    setBreakGate({a:12+Math.floor(Math.random()*8),b:7+Math.floor(Math.random()*8)});
  },[activeChildId]);
  useEffect(()=>{
    if(!activeChildId)return;
    let last=performance.now();
    let running=page==='play' && !!current && !parentMilestone && !document.hidden;
    function tick(){
      const now=performance.now();const elapsed=Math.max(0,now-last);last=now;
      const r=dailyRecord(activeChildId);
      if(running && remainingDaily(r)>0){r.used+=Math.min(elapsed,remainingDaily(r));saveDaily(activeChildId,r);}
      setDaily(r);
      running=page==='play' && !!current && !parentMilestone && !document.hidden;
    }
    const timer=setInterval(tick,1000);
    document.addEventListener('visibilitychange',tick);window.addEventListener('pagehide',tick);
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);window.removeEventListener('pagehide',tick);tick();};
  },[activeChildId,page,!!current,parentMilestone]);
  useEffect(()=>{
    if(dailyBlocked && page==='play'){window.speechSynthesis?.cancel();setCelebration('');setHintVisible(false);setPage('break');}
  },[dailyBlocked,page]);
  function allowExtra(){const r=dailyRecord(activeChildId);r.extra+=15*60000;saveDaily(activeChildId,r);setDaily(r);setBreakUnlocked(false);setBreakAnswer('');setBreakGate({a:12+Math.floor(Math.random()*8),b:7+Math.floor(Math.random()*8)});setPage('home');}
  const stats=levelStats(plan,childOutcomes);
  // Real mastery: every unique question attempted, with at least 85% correct on first attempt.
  // milestone85Seen is separate from the earlier 5% test flag, so testers can verify it.
  const masteryReached=stats.total>0 && stats.attempted===stats.total && stats.firstCorrect/stats.total>=0.85;
  useEffect(()=>{
    if(!activeChildId||!plan.length||parentMilestone||childProgress[learnerLanguage]?.milestone85Seen)return;
    if(masteryReached){
      setParentMilestone(true);setParentUnlocked(false);setParentGateAnswer('');
      window.speechSynthesis?.cancel();
    }
  },[activeChildId,plan,progress,learnerLanguage,parentMilestone]);
  useEffect(() => {
    if (!hintVisible) return;
    const timer = setTimeout(() => setHintVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [hintVisible, step, plan]);
  async function start(){if(!activeChildId){setPage('profiles');return;}if(remainingDaily(dailyRecord(activeChildId))===0){setPage('break');return;}const lessons=await loadPublishedLessons()||[];const p=makePlan([...sample,...library,...lessons]);setPlan(p);setStep(0);setPicked([]);setChecked(false);resetQuestionState();setWordOrder([]);setPage('play');}
  useEffect(()=>{if(!current)return;const words=current.question.answer.trim().split(/\s+/).filter(Boolean).map((word,i)=>({id:`a${i}`,word}));const extra=current.question.distractors.split(',').map(x=>x.trim()).filter(Boolean).map((word,i)=>({id:`e${i}`,word}));setWordOrder(shuffle([...words,...extra]));},[step,plan]);
  
useEffect(() => {
  if (page !== 'play' || !current || dailyBlocked || parentMilestone) return;

  const timer = setTimeout(() => {
    speak(current.question.question, learnerLanguage);
  }, 400);

  return () => {
    clearTimeout(timer);
    window.speechSynthesis?.cancel();
  };
}, [page, step, plan, learnerLanguage, dailyBlocked, parentMilestone]);

  function openEditor(item){setEditing(item?.id||null);setDraft(item?{...item,questions:item.questions.map(q=>({...q}))}:{id:id(),title:'',type:'image',questions:[newQuestion()]});setFile(null);setError('');setPage('edit');}
  function updateQuestion(qid,field,value){setDraft(d=>({...d,questions:d.questions.map(q=>q.id===qid?{...q,[field]:value}:q)}));}
  async function save(){if(!draft.title.trim()){setError('Please give this picture or video a title.');return;}if(!draft.questions.length||draft.questions.some(q=>!q.question.trim()||!q.answer.trim())){setError('Every question needs both a question and a correct answer.');return;}if(!editing&&!file){setError('Please choose a picture or video.');return;}try{if(file)await dbPut(draft.id,file);const entry={id:draft.id,title:draft.title.trim(),type:file?(file.type.startsWith('video/')?'video':'image'):draft.type,questions:draft.questions,url:undefined};setLibrary(old=>[...old.filter(x=>x.id!==entry.id),entry]);setPage('admin');setError('');}catch(e){setError('Could not save this file. Your browser storage may be full. Try a smaller video.');}}
  async function remove(item){if(!window.confirm(`Delete “${item.title}” and all its questions?`))return;try{await dbDelete(item.id);}catch{}setLibrary(x=>x.filter(y=>y.id!==item.id));}
  const count=all.reduce((sum,x)=>sum+x.questions.length,0);
 
return <div className="app">
  {page === 'play' && celebration === 'streamers-fallback' && (
    <div className="streamer-celebration" aria-label="Celebration!" role="status">
      <span>🎊</span>
      <span>🎉</span>
      <span>✨</span>
      <span>🎊</span>
      <span>🎉</span>
      <strong>Hooray! You're a star!</strong>
    </div>
  )}

 
{page === 'play' && (['band','fox','streamers'].includes(celebration)) && (
  <div role="status" aria-label={celebration === 'fox' ? 'Tilly dances for you!' : celebration === 'band' ? 'Hooray! The animal marching band!' : 'Hooray! You are a star!'} style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'auto',background:'transparent'}}>
    <video key={celebration} src={celebration === 'fox' ? '/TilliTalk-fox-transparent.webm' : celebration === 'band' ? '/TilliTalk-Parade-Transparent.webm' : '/TilliTalk-Streamers-Transparent.webm'} autoPlay muted playsInline onEnded={()=>setCelebration('')} onError={()=>setCelebration('streamers-fallback')} style={{width:celebration === 'fox' ? 'min(65vw, 480px)' : 'min(95vw, 960px)',maxHeight:'80vh',objectFit:'contain',pointerEvents:'none'}} />
    <button type="button" onClick={()=>setCelebration('')} style={{position:'absolute',right:16,bottom:16}}>Continue ➜</button>
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
 <span style={{background:"#eee3fa",color:"#7952a3",borderRadius:20,padding:"5px 10px",fontWeight:700,fontSize:14,whiteSpace:"nowrap"}}>Level 1</span>
 <nav>
  {activeChild && ['home','play','break'].includes(page) && <DailyClock remaining={remaining} allowance={DAILY_MINUTES*60000+dailyRecord(activeChildId).extra}/>}
  <button onClick={()=>setPage('home')}>Home</button>
  <button hidden onClick={()=>setPage('admin')}>Pictures & Admin</button>
</nav>
</header>
    <main>
      {page==='profiles'&&<section className="hero" style={{maxWidth:580,margin:'auto'}}>
        <h1>🦊 Who is learning today?</h1>
        <p>Choose your own animal and nickname. Everyone's progress stays separate on this device.</p>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'center',marginBottom:20}}>
          {profiles.map(child=><button key={child.id} type="button" className={child.id===activeChildId?'primary':''} onClick={()=>{setActiveChildId(child.id);setPage('home');}} style={{fontSize:18,padding:14}}>{child.avatar} {child.name}</button>)}
        </div>
        <h2>Add a child</h2>
        <label>Nickname <input maxLength={30} value={newChildName} onChange={e=>setNewChildName(e.target.value)} placeholder="First name or nickname" /></label>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center',margin:'14px 0'}}>
          {AVATARS.map(avatar=><button key={avatar} type="button" aria-label={`Choose ${avatar}`} aria-pressed={newChildAvatar===avatar} onClick={()=>setNewChildAvatar(avatar)} style={{fontSize:25,border:newChildAvatar===avatar?'3px solid #8a65b5':undefined}}>{avatar}</button>)}
        </div>
        <button className="primary" type="button" disabled={!newChildName.trim()} onClick={()=>{addChild();setPage('home');}}>Add child</button>
        <button type="button" onClick={()=>setPage('home')}>Back home</button>
      </section>}
      {page==='home'&&<section className="hero"><div className="hero-emoji">🐶 💬 🌟</div><h1>Let's talk!</h1><p>Look, listen, and make sentences with words.</p><div className="language-picker"><label>Learning language <select value={learnerLanguage} onChange={e=>setLearnerLanguage(e.target.value)}>{languages.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label></div><div style={{margin:'14px 0'}}><button type="button" onClick={()=>setPage('profiles')}>{activeChild?`${activeChild.avatar} ${activeChild.name} · Switch child`:'🐻 Choose or add a child'}</button></div><button className="primary big" disabled={publicLoading} onClick={start}>{publicLoading?'Loading lessons…':'▶ Start learning'}</button><p className="muted">{all.length} pictures & videos · {count} questions</p>{publicError&&<p className="hint" role="status">{publicError}</p>}<div className="hint">Questions switch pictures after 1–2 turns, then revisit earlier pictures.</div></section>}
      {page==='break'&&<section className="hero" style={{maxWidth:580,margin:'auto'}}>
        <div className="hero-emoji">🦊 🌙 ⭐</div><h1>Time for a little break!</h1>
        <p>Wonderful learning today! Rest your eyes and stretch your legs.</p><p>⭐ Your learning progress is saved.</p>
        {!dailyBlocked?<button className="primary" onClick={()=>setPage('home')}>Back to learning</button>:<>
          <p>Come back tomorrow, or ask a grown-up.</p>
          {!breakUnlocked?<form onSubmit={e=>{e.preventDefault();if(Number(breakAnswer)===breakGate.a+breakGate.b)setBreakUnlocked(true);else setBreakAnswer('');}}>
            <label>Grown-ups only 🔒 What is {breakGate.a} + {breakGate.b}?<input type="number" value={breakAnswer} onChange={e=>setBreakAnswer(e.target.value)}/></label><button type="submit">Continue</button>
          </form>:<button className="primary" onClick={allowExtra}>Allow 15 extra minutes</button>}
        </>}
        <button onClick={()=>{setBreakUnlocked(false);setBreakAnswer('');setPage('home');}}>Home</button>
      </section>}
      {page === 'play' && !dailyBlocked && (
        <section className="play-area">
          <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
            <button type="button" aria-label="Sound settings" aria-expanded={showSound} onClick={()=>setShowSound(v=>!v)}>{voiceMuted?'🔇':'🔊'}</button>
          </div>
          {showSound&&<div style={{display:'flex',gap:10,alignItems:'center',justifyContent:'flex-end',flexWrap:'wrap'}}>
            <button onClick={toggleMute}>{voiceMuted?'Unmute':'Mute'}</button>
            <label>Volume <input type="range" min="0" max="100" step="5" value={Math.round(voiceVolume*100)} onChange={e=>{const v=Number(e.target.value)/100;setVoiceVolume(v);if(!v)window.speechSynthesis?.cancel();}}/></label>
          </div>}
          {remaining>0&&remaining<=WARNING_MINUTES*60000&&<p className="hint" role="status">🌙 Almost time for a little break!</p>}
          {parentMilestone ? (
            <div className="hero" role="dialog" aria-modal="true" aria-label="Grown-up time">
              <h1>🌟 Wonderful learning!</h1>
              <h2>Please give the tablet to a grown-up.</h2>
              {!parentUnlocked ? <>
                <p>Grown-up check: What is {parentGate.a} + {parentGate.b}?</p>
                <input type="number" value={parentGateAnswer} onChange={e=>setParentGateAnswer(e.target.value)} aria-label="Grown-up check answer" />
                <button className="primary" onClick={()=>{if(Number(parentGateAnswer)===parentGate.a+parentGate.b)setParentUnlocked(true);else setParentGateAnswer('');}}>Continue</button>
              </> : <>
                <p>{activeChild?.name} has completed every Level 1 question and answered at least 85% correctly on the first try!</p>
                <p>Level 2 purchasing is not available yet. No payment will be taken. Level 1 can always be replayed.</p>
                <button className="primary" onClick={closeMilestone}>Not now — keep practising</button>
              </>}
            </div>
          ) : !current ? (
            <div className="hero">
              <h1>🎉 Amazing work!</h1>
              <p>You finished this round.</p>
              <button className="primary" onClick={start}>Play again</button>
              <button onClick={() => setPage('home')}>Home</button>
            </div>
          ) : (
            <>
              <div className="play-card">
                <Media item={currentItem} src={srcFor(currentItem)} />
                <div className="question-line">
                  <h2>{current.question.question}</h2>
                  <button aria-label="Hear question" className="sound" onClick={() => speak(current.question.question, learnerLanguage)}>🔊</button>
                </div>
                <div className="answer-zone" aria-label="Your answer" style={{minHeight:48}}>
                  {picked.length ? picked.map(x => (
                    <button key={x.id} className="word selected" onClick={() => {
                      setPicked(p => p.filter(w => w.id !== x.id));
                      setChecked(false);
                    }}>{x.word}</button>
                  )) : null}
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
                {hintVisible && !correct && (
                  <div className="hint" role="status" aria-live="polite">
                    💡 {current.question.answer}
                  </div>
                )}
                <div className="actions">
                  <button type="button" onClick={() => {setHintVisible(true);setUsedHint(true);}} disabled={correct}>💡 Hint</button>
                  <button type="button" onClick={() => {
                    window.speechSynthesis?.cancel();
                    recordOutcome('skip');
                    resetQuestionState();
                    setStep(s => s + 1);
                  }}>Skip ➜</button>
                  <button onClick={() => { setPicked([]); setChecked(false); }}>Clear</button>
                  {correct ? (
                    <button className="primary" onClick={() => {
                      window.speechSynthesis?.cancel();
                      setStep(s => s + 1);
                      resetQuestionState();
                    }}>Next ➜</button>
                  ) : (
                    <button className="primary" disabled={!picked.length} onClick={() => {
                      const isCorrect = picked.length === answerWords.length &&
                        picked.every((x, i) => x.word === answerWords[i]);
                      setChecked(true);
                      if (!firstAttemptMade) {recordOutcome(isCorrect && !usedHint ? 'correct' : usedHint ? 'hint' : 'wrong');setFirstAttemptMade(true);}
                      if (isCorrect) {
                        const nextCount = correctCount + 1;
                        setCorrectCount(nextCount);
                        if (nextCount % 27 === 0) setCelebration('fox');
                        else if (nextCount % 9 === 0) setCelebration('band');
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
           <div className="admin-panel">
             <div className="heading-row"><div><h2>🖼️ Your picture library — {cloudMedia.length} items</h2><p className="muted">See each picture, edit its questions, or select several to delete. Drafts stay private until published.</p></div></div>
             <div className="manage-toolbar">
               <input aria-label="Search pictures" placeholder="🔎 Search pictures by title…" value={librarySearch} onChange={e=>setLibrarySearch(e.target.value)}/>
               <button type="button" disabled={!cloudMedia.length||lessonBusy||uploading} onClick={()=>setSelectedForDelete(cloudMedia.filter(m=>m.title.toLowerCase().includes(librarySearch.toLowerCase())).map(m=>m.id))}>Select all shown</button>
               <button type="button" disabled={!selectedForDelete.length} onClick={()=>setSelectedForDelete([])}>Clear selection</button>
               <button type="button" className="danger" disabled={!selectedForDelete.length||lessonBusy||uploading} onClick={deleteSelectedCloudMedia}>🗑 Delete selected ({selectedForDelete.length})</button>
             </div>
             <div className="manage-grid">
               {cloudMedia.filter(m=>m.title.toLowerCase().includes(librarySearch.toLowerCase())).map(m=>(
                 <article key={m.id} className={'manage-card'+(selectedForDelete.includes(m.id)?' is-selected':'')}>
                   <div className="manage-thumb">
                     {cloudPreviews[m.id] ? (m.media_type==='video' ? <video src={cloudPreviews[m.id]} muted playsInline preload="metadata"/> : <img src={cloudPreviews[m.id]} alt={m.title} loading="lazy"/>) : <span>🖼️ Picture preview</span>}
                   </div>
                   <div className="manage-details"><strong>{m.title}</strong><p>{cloudCounts[m.id]??'…'} questions · {m.is_published?'✅ Published':'📝 Draft'}</p></div>
                   <div className="manage-actions">
                     <button type="button" className="primary" disabled={lessonBusy||uploading} onClick={()=>openCloudEditor(m)}>✏️ Edit / Generate Questions</button>
                     <label className="manage-select"><input type="checkbox" checked={selectedForDelete.includes(m.id)} onChange={e=>setSelectedForDelete(old=>e.target.checked?[...old,m.id]:old.filter(x=>x!==m.id))}/> Select to delete</label>
                   </div>
                 </article>
               ))}
             </div>
             {!cloudMedia.length&&<p className="muted">No uploaded pictures yet. Upload pictures above to get started.</p>}
           </div></>}
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
{page==='edit'&&draft&&<section className="parent editor"><div className="heading-row"><h1>{editing?'Edit media':'Add picture or video'}</h1><button onClick={()=>setPage('admin')}>← Back</button></div><label>Title<input value={draft.title} placeholder="e.g. Brown dog running" onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label><label>{editing?'Replace picture/video (optional)':'Picture or video'}<input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={e=>{const f=e.target.files?.[0];setFile(f||null);setError('');}}/></label>{file&&<p className="muted">Selected: {file.name} ({(file.size/1024/1024).toFixed(1)} MB). Large videos may exceed browser storage limits.</p>}<div className="heading-row"><h2>Questions and answers</h2><button onClick={()=>setDraft(d=>({...d,questions:[...d.questions,newQuestion()]}))}>+ Add question</button></div>{draft.questions.map((q,i)=><div className="question-editor" key={q.id}><div className="heading-row"><h3>Question {i+1}</h3><button className="danger" onClick={()=>setDraft(d=>({...d,questions:d.questions.filter(x=>x.id!==q.id)}))}>Remove</button></div><label>Question<input value={q.question} placeholder="Who is running?" onChange={e=>updateQuestion(q.id,'question',e.target.value)}/></label><label>Correct answer<input value={q.answer} placeholder="The dog" onChange={e=>updateQuestion(q.id,'answer',e.target.value)}/></label><label>Extra wrong words (separate with commas)<input value={q.distractors} placeholder="cat, man, sleeping" onChange={e=>updateQuestion(q.id,'distractors',e.target.value)}/></label></div>)}{error&&<p className="error" role="alert">{error}</p>}<div className="actions"><button onClick={()=>setPage('admin')}>Cancel</button><button className="primary" onClick={save}>Save to library</button></div></section>}
   </main>
<footer>
  <p>Made with care for little learners 💛</p>

  <p>
    <a href="/privacy.html">Privacy Policy</a>
    {' · '}
    <a href="/contact.html">Contact</a>
  </p>

  <p>© 2026 Tales by Moonlight. All rights reserved.</p>
</footer>
  </div>;
}