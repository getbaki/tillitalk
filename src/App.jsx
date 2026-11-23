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
