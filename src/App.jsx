import { useEffect, useState } from 'react';

const starterLessons = [
  {
    id: 'dog',
    title: 'The running dog',
    image: 'https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=crop&w=1000&q=85',
    questions: [
      { question: 'Who is running?', answer: 'The dog is running', choices: ['The', 'dog', 'is', 'running', 'cat', 'sleeping'] },
      { question: 'What is the dog doing?', answer: 'The dog is running', choices: ['The', 'dog', 'is', 'running', 'eating', 'car'] }
    ]
  },
  {
    id: 'car',
    title: 'Washing the car',
    image: '',
    questions: [
      { question: 'Who is washing the car?', answer: 'A man', choices: ['A', 'man', 'dog', 'woman'] },
      { question: 'What is he doing?', answer: 'He is washing the car', choices: ['He', 'is', 'washing', 'the', 'car', 'running', 'she'] }
    ]
  }
];

const storageKey = 'tillitalk-custom-lessons-v1';
function readCustomLessons() {
  try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); }
  catch { return []; }
}
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function App() {
  const [customLessons, setCustomLessons] = useState(readCustomLessons);
  const [mode, setMode] = useState('home');
  const [lessonId, setLessonId] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [picked, setPicked] = useState([]);
  const [result, setResult] = useState(null);
  const [options, setOptions] = useState([]);
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [extraWords, setExtraWords] = useState('');
  const [media, setMedia] = useState(null);
  const [notice, setNotice] = useState('');
  const lessons = [...starterLessons, ...customLessons];
  const lesson = lessons.find(l => l.id === lessonId);
  const current = lesson?.questions[questionIndex];

  useEffect(() => {
    if (current) {
      setOptions(shuffle(current.choices.map((word, id) => ({ word, id }))));
      setPicked([]);
      setResult(null);
    }
  }, [lessonId, questionIndex, current]);

  function startLesson(id) { setLessonId(id); setQuestionIndex(0); setMode('learn'); }
  function addLesson(event) {
    event.preventDefault();
    const cleanAnswer = answer.trim().replace(/\s+/g, ' ');
    const words = cleanAnswer.split(' ');
    if (!title.trim() || !question.trim() || !cleanAnswer) return;
    if (media?.size > 2_000_000) { setNotice('Please use a picture smaller than 2 MB for this demo. Video uploads will come with cloud storage.'); return; }
    const save = image => {
      const next = [...customLessons, {
        id: crypto.randomUUID(), title: title.trim(), image,
        questions: [{ question: question.trim(), answer: cleanAnswer, choices: [...words, ...extraWords.trim().split(/\s+/).filter(Boolean)] }]
      }];
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
        setCustomLessons(next);
        setTitle(''); setQuestion(''); setAnswer(''); setExtraWords(''); setMedia(null);
        setNotice('Lesson saved on this device!');
      } catch { setNotice('Not enough browser storage. Try a smaller image.'); }
    };
    if (media) {
      const reader = new FileReader();
      reader.onload = () => save(reader.result);
      reader.readAsDataURL(media);
    } else save('');
  }

  const answerWords = current?.answer.trim().split(/\s+/) || [];
  const isCorrect = picked.length === answerWords.length && picked.every((item, i) => item.word === answerWords[i]);
  const completed = lesson && questionIndex === lesson.questions.length - 1;

  return (
    <div className="page">
      <header><button className="brand" onClick={() => setMode('home')}>🌈 TilliTalk</button><span>Little words, big adventures!</span></header>
      <main>
        {mode === 'home' && <>
          <section className="hero"><div className="hero-icon">🦋</div><h1>Let's talk English!</h1><p>Look, listen, and make a sentence.</p><button className="primary" onClick={() => startLesson(lessons[0].id)}>Let's play! ✨</button></section>
          <h2>Choose a lesson</h2>
          <div className="lesson-grid">{lessons.map(l => <button className="lesson-card" key={l.id} onClick={() => startLesson(l.id)}><div className="lesson-thumb">{l.image ? <img src={l.image} alt="Lesson scene" /> : <span>🖼️</span>}</div><strong>{l.title}</strong><small>{l.questions.length} question{l.questions.length !== 1 ? 's' : ''}</small></button>)}</div>
          <button className="secondary parent-link" onClick={() => { setNotice(''); setMode('parent'); }}>⚙️ Parent area</button>
        </>}
        {mode === 'learn' && current && <section className="game">
          <div className="game-top"><button className="back" onClick={() => setMode('home')}>← Lessons</button><span>Question {questionIndex + 1} of {lesson.questions.length}</span></div>
          <div className="progress"><div style={{ width: `${((questionIndex + 1) / lesson.questions.length) * 100}%` }} /></div>
          <div className="scene">{lesson.image ? <img src={lesson.image} alt={lesson.title} /> : <span className="scene-placeholder">🚗 🧽 💦</span>}</div>
          <div className="question-line"><h1>{current.question}</h1><button className="sound" aria-label="Read question aloud" onClick={() => speak(current.question)}>🔊</button></div>
          <p className="hint">Tap the words in the right order.</p>
          <div className="answer-box" aria-label="Your answer">{picked.length === 0 && <span className="placeholder">Your sentence goes here...</span>}{picked.map((item, index) => <button className="word selected" key={item.id} onClick={() => { setPicked(picked.filter((_, i) => i !== index)); setResult(null); }}>{item.word}</button>)}</div>
          <div className="word-bank">{options.filter(item => !picked.some(p => p.id === item.id)).map(item => <button className="word" key={item.id} onClick={() => { setPicked([...picked, item]); setResult(null); speak(item.word); }}>{item.word}</button>)}</div>
          {result && <div className={`feedback ${result === 'correct' ? 'success' : ''}`}>{result === 'correct' ? '⭐ Wonderful! You did it!' : 'Almost! Try a different word order.'}</div>}
          <div className="actions"><button className="secondary" onClick={() => { setPicked([]); setResult(null); }}>Start over</button>{result === 'correct' ? <button className="primary" onClick={() => completed ? setMode('finished') : setQuestionIndex(questionIndex + 1)}>{completed ? 'Finish! 🎉' : 'Next question →'}</button> : <button className="primary" disabled={!picked.length} onClick={() => { setResult(isCorrect ? 'correct' : 'try'); if (isCorrect) speak(current.answer); }}>Check answer ✓</button>}</div>
        </section>}
        {mode === 'finished' && <section className="hero"><div className="hero-icon">🏆</div><h1>Great job!</h1><p>You finished the lesson!</p><button className="primary" onClick={() => setMode('home')}>Choose another lesson</button></section>}
        {mode === 'parent' && <section className="parent"><button className="back" onClick={() => setMode('home')}>← Back to lessons</button><h1>Parent area</h1><p>Add a picture and a question for your child to practice.</p><div className="warning">Prototype only: this area is not password protected. Custom lessons are stored in this browser, not shared across devices. Please don't upload private family photos yet.</div><form onSubmit={addLesson}><label>Lesson title<input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Feeding the ducks" required /></label><label>Picture (optional, under 2 MB)<input type="file" accept="image/*" onChange={e => setMedia(e.target.files?.[0] || null)} /></label><label>Question<input value={question} onChange={e => setQuestion(e.target.value)} placeholder="What is the girl doing?" required /></label><label>Correct answer<input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="She is feeding the ducks" required /></label><label>Extra wrong words (separated by spaces)<input value={extraWords} onChange={e => setExtraWords(e.target.value)} placeholder="running dog he" /></label><button className="primary" type="submit">Save lesson</button></form>{notice && <p role="status" className="notice">{notice}</p>}<p className="smallprint">Coming next: secure login, cloud media uploads, videos, AI-generated questions, and progress tracking.</p></section>}
      </main><footer>Made with care 💛 TilliTalk</footer>
    </div>
  );
}
