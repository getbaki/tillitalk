    const withUrls=await Promise.all((media||[]).map(async m=>{
      // Public media is served only after the server confirms that it is published.
      try{const url=new URL(import.meta.env.VITE_SUPABASE_URL+'/functions/v1/published-media');url.searchParams.set('media_id',m.id);
        const response=await fetch(url,{headers:{apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}});
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
  function openEditor(item){setEditing(item?.id||null);setDraft(item?{...item,questions:item.questions.map(q=>({...q}))}:{id:id(),title:'',type:'image',questions:[newQuestion()]});setFile(null);setError('');setPage('edit');}
  function updateQuestion(qid,field,value){setDraft(d=>({...d,questions:d.questions.map(q=>q.id===qid?{...q,[field]:value}:q)}));}
  async function save(){if(!draft.title.trim()){setError('Please give this picture or video a title.');return;}if(!draft.questions.length||draft.questions.some(q=>!q.question.trim()||!q.answer.trim())){setError('Every question needs both a question and a correct answer.');return;}if(!editing&&!file){setError('Please choose a picture or video.');return;}try{if(file)await dbPut(draft.id,file);const entry={id:draft.id,title:draft.title.trim(),type:file?(file.type.startsWith('video/')?'video':'image'):draft.type,questions:draft.questions,url:undefined};setLibrary(old=>[...old.filter(x=>x.id!==entry.id),entry]);setPage('library');setError('');}catch(e){setError('Could not save this file. Your browser storage may be full. Try a smaller video.');}}
  async function remove(item){if(!window.confirm(`Delete “${item.title}” and all its questions?`))return;try{await dbDelete(item.id);}catch{}setLibrary(x=>x.filter(y=>y.id!==item.id));}
  const count=all.reduce((sum,x)=>sum+x.questions.length,0);
  return <div className="app">
    <header className="topbar"><button className="brand" onClick={()=>setPage('home')}>🌈 TilliTalk</button><nav><button onClick={()=>setPage('home')}>Home</button><button onClick={()=>setPage('library')}>Demo library</button><button onClick={()=>setPage('admin')}>Admin</button></nav></header>
    <main>
      {page==='home'&&<section className="hero"><div className="hero-emoji">🐶 💬 🌟</div><h1>Let's talk!</h1><p>Look, listen, and make sentences with words.</p><div className="language-picker"><label>Learning language <select value={learnerLanguage} onChange={e=>setLearnerLanguage(e.target.value)}>{languages.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label></div><button className="primary big" disabled={publicLoading} onClick={start}>{publicLoading?'Loading lessons…':'▶ Start learning'}</button><p className="muted">{all.length} pictures & videos · {count} questions</p><div className="hint">Questions switch pictures after 1–2 turns, then revisit earlier pictures.</div></section>}
      {page==='play'&&<section className="play-area">{!current?<div className="hero"><h1>🎉 Amazing work!</h1><p>You finished this round.</p><button className="primary" onClick={start}>Play again</button><button onClick={()=>setPage('home')}>Home</button></div>:<><div className="progress"><span>Question {step+1} of {plan.length}</span><div className="progress-track"><div style={{width:`${(step/plan.length)*100}%`}}/></div></div><div className="play-card"><Media item={currentItem} src={srcFor(currentItem)}/><div className="question-line"><h2>{current.question.question}</h2><button aria-label="Hear question" className="sound" onClick={()=>say(current.question.question)}>🔊</button></div><p className="muted">Tap the words in the right order.</p><div className="answer-zone">{picked.length?picked.map(x=><button key={x.id} className="word selected" onClick={()=>{setPicked(p=>p.filter(w=>w.id!==x.id));setChecked(false);}}>{x.word}</button>):<span className="muted">Your sentence goes here…</span>}</div><div className="word-bank">{wordOrder.filter(x=>!picked.some(p=>p.id===x.id)).map(x=><button key={x.id} className="word" onClick={()=>{setPicked(p=>[...p,x]);setChecked(false);say(x.word);}}>{x.word}</button>)}</div>{checked&&<div role="status" className={'feedback '+(correct?'good':'try')}>{correct?'🌟 Well done!':'💛 Good try! Tap the words to change your answer.'}</div>}<div className="actions"><button onClick={()=>{setPicked([]);setChecked(false);}}>Clear</button>{correct?<button className="primary" onClick={()=>{say(current.question.answer);setStep(s=>s+1);setPicked([]);setChecked(false);}}>Next ➜</button>:<button className="primary" disabled={!picked.length} onClick={()=>{setChecked(true);if(picked.length===answerWords.length&&picked.every((x,i)=>x.word===answerWords[i]))say(current.question.answer);}}>Check answer</button>}</div></div></>}</section>}
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
           <div className="admin-panel"><h2>Master library — {cloudMedia.length} items</h2><p className="muted">Draft media is stored in Supabase, but it will not appear in the children's game until we add questions and publish it.</p><ul className="upload-results">{cloudMedia.map(x=><li key={x.id}><button className="library-open" onClick={()=>openCloudEditor(x)}>{x.title} <span className="muted">— Edit lesson →</span></button><span>{x.is_published?'Published':'Draft'}</span></li>)}</ul></div></>}
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
            {q.id.startsWith('new-')&&<button className="danger" onClick={()=>setCloudQuestions(old=>old.filter(x=>x.id!==q.id))}>Remove suggestion</button>}
          </div>)}
          {lessonMessage&&<p role="status" className="hint">{lessonMessage}</p>}
          <div className="actions"><button className="primary" disabled={lessonBusy} onClick={saveCloudQuestions}>{lessonBusy?'Working…':'Save questions'}</button><button disabled={lessonBusy} onClick={publishCloudLesson}>Publish approved lesson</button></div>
        </div>
      </section>}
{page==='edit'&&draft&&<section className="parent editor"><div className="heading-row"><h1>{editing?'Edit media':'Add picture or video'}</h1><button onClick={()=>setPage('library')}>← Back</button></div><label>Title<input value={draft.title} placeholder="e.g. Brown dog running" onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label><label>{editing?'Replace picture/video (optional)':'Picture or video'}<input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={e=>{const f=e.target.files?.[0];setFile(f||null);setError('');}}/></label>{file&&<p className="muted">Selected: {file.name} ({(file.size/1024/1024).toFixed(1)} MB). Large videos may exceed browser storage limits.</p>}<div className="heading-row"><h2>Questions and answers</h2><button onClick={()=>setDraft(d=>({...d,questions:[...d.questions,newQuestion()]}))}>+ Add question</button></div>{draft.questions.map((q,i)=><div className="question-editor" key={q.id}><div className="heading-row"><h3>Question {i+1}</h3><button className="danger" onClick={()=>setDraft(d=>({...d,questions:d.questions.filter(x=>x.id!==q.id)}))}>Remove</button></div><label>Question<input value={q.question} placeholder="Who is running?" onChange={e=>updateQuestion(q.id,'question',e.target.value)}/></label><label>Correct answer<input value={q.answer} placeholder="The dog" onChange={e=>updateQuestion(q.id,'answer',e.target.value)}/></label><label>Extra wrong words (separate with commas)<input value={q.distractors} placeholder="cat, man, sleeping" onChange={e=>updateQuestion(q.id,'distractors',e.target.value)}/></label></div>)}{error&&<p className="error" role="alert">{error}</p>}<div className="actions"><button onClick={()=>setPage('library')}>Cancel</button><button className="primary" onClick={save}>Save to library</button></div></section>}
    </main><footer>Made with care for little learners 💛</footer>
  </div>;
}
