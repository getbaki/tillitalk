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

function say(text, language = 'en') {
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
