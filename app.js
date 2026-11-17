const $ = (id) => document.getElementById(id);
let sampleVideos = [], cameraStream = null, cameraTimer = null, cameraFacing = 'environment';
let cameraFrameCount = 0, lastLiveDetections = [], currentObjectUrl = null, freeVisionModels = [];
let currentBenchmarkJob = null, activeBenchmarkModelId = null;
let comparisonSequence = { active: false, modelIds: [], index: 0 };

function toast(message, isError=false) {
  const el=$('toast'); el.textContent=message; el.className=`toast show${isError?' error':''}`;
  clearTimeout(toast._timer); toast._timer=setTimeout(()=>el.className='toast',4200);
}
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const DEMO_DATA = window.FACTORYLENS_DEMO_DATA;
const DEMO_STATE = { inspectionPolls: 0, benchmarkPolls: 0, selectedModels: DEMO_DATA.models.map(m => m.model_id) };
const cloneDemo = value => JSON.parse(JSON.stringify(value));

async function api(url, options={}) {
  const method = (options.method || 'GET').toUpperCase();
  const path = String(url).split('?')[0];
  await new Promise(resolve => setTimeout(resolve, 90));

  if (path === '/api/health') return {status:'online', app_version:'1.3.0', issue_level_ai_ready:true, mode:'static-demo'};
  if (path === '/api/videos') {
    const s = DEMO_DATA.source_video;
    return {items:[{filename:s.filename,title:s.title,display_name:s.title,downloaded:true,size_mb:15.8,url:s.url}],count:1,catalog_count:1,missing_count:0};
  }
  if (path === '/api/dashboard-summary') return cloneDemo(DEMO_DATA.dashboard);
  if (path === '/api/ai-models') return {models:DEMO_DATA.models.map(m=>({id:m.model_id,name:m.name,provider:m.provider_name,input:'Text + image frames',role:'Saved comparison result',free:true})),free_only:true,note:'Saved comparison outputs; no live model requests.'};

  if (path === '/api/analyze-video' && method === 'POST') {
    DEMO_STATE.inspectionPolls = 0;
    return {job_id:'demo-inspection-001',status:'queued',source_name:DEMO_DATA.source_video.title,note:'Preparing the inspection…'};
  }
  if (path === '/api/jobs/demo-inspection-001') {
    DEMO_STATE.inspectionPolls += 1;
    const progress = [22,48,76][DEMO_STATE.inspectionPolls-1] || 100;
    if (DEMO_STATE.inspectionPolls < 4) return {job_id:'demo-inspection-001',status:'running',progress,message:['Preparing source video…','Reviewing visual evidence…','Compiling timestamped observations…'][DEMO_STATE.inspectionPolls-1] || 'Finishing replay…'};
    const result = cloneDemo(DEMO_DATA.inspection);
    result.progress = 100;
    result.message = 'Inspection complete.';
    return result;
  }
  if (path === '/api/model-benchmark' && method === 'POST') {
    DEMO_STATE.benchmarkPolls = 0;
    const body = options.body;
    let ids = DEMO_DATA.models.map(m=>m.model_id);
    if (body && typeof body.get === 'function') {
      const raw = body.get('model_ids');
      if (raw) ids = String(raw).split(',').map(s=>s.trim()).filter(Boolean);
    }
    DEMO_STATE.selectedModels = ids;
    return {job_id:'demo-benchmark-001',status:'queued',selected_models:ids,note:'Preparing the three saved model-review videos…'};
  }
  if (path === '/api/model-benchmark/demo-benchmark-001') {
    DEMO_STATE.benchmarkPolls += 1;
    const progress = [18,42,71][DEMO_STATE.benchmarkPolls-1] || 100;
    if (DEMO_STATE.benchmarkPolls < 4) return {job_id:'demo-benchmark-001',status:'running',progress,message:['Preparing comparison footage…','Organising model findings…','Synchronising timestamps and YOLO context…'][DEMO_STATE.benchmarkPolls-1] || 'Finishing model comparison replay…'};
    const results = DEMO_DATA.models.filter(m=>DEMO_STATE.selectedModels.includes(m.model_id)).map(cloneDemo);
    return {job_id:'demo-benchmark-001',status:'completed',progress:100,source_name:DEMO_DATA.source_video.title,results,video_url:results[0]?.video_url || null,model_videos:results.map(m=>({model_id:m.model_id,url:m.video_url})),model_video_count:results.length,playback_error:null,yolo_available:true,yolo_samples:cloneDemo(DEMO_DATA.yolo_samples),yolo_message:DEMO_DATA.yolo_message,agreement:cloneDemo(DEMO_DATA.agreement),embedded_annotations:true};
  }
  if (path === '/api/events') {
    return {items:DEMO_DATA.inspection.events.map(event=>({timestamp_seconds:event.timestamp_seconds,source_name:DEMO_DATA.source_video.title,label:event.title,details:{description:event.visible_evidence,why_it_matters:event.why_it_matters,confidence:event.confidence,issue_type:event.issue_type}}))};
  }
  if (path === '/api/motion-analysis' || path === '/api/sensor-analysis' || path === '/api/live-detect') {
    throw new Error('This analysis is unavailable for the current session.');
  }
  throw new Error(`No response is configured for ${path}.`);
}
function showPage(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${page}`));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  const names={overview:'Inspection overview',video:'Video inspection',live:'Live camera',motion:'Motion analysis',sensors:'Sensor analysis',events:'Event history',guide:'How FactoryLens works'};
  $('page-title').textContent=names[page]||'FACTORYLENS'; $('page-breadcrumb').textContent=page.toUpperCase();
  window.scrollTo({top:0,behavior:'smooth'}); if(page==='events')loadEvents(); if(page==='overview')refreshDashboard();
}
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.go)));

async function loadVideos() {
  try {
    const d=await api('/api/videos'); sampleVideos=d.items||[];
    const options=sampleVideos.map(v=>`<option value="${escapeHtml(v.filename)}">${escapeHtml(v.title||v.display_name||v.filename)} · ${v.size_mb} MB</option>`).join('');
    $('sample-select').innerHTML='<option value="">Select an available factory video…</option>'+(options||'');
    $('motion-sample').innerHTML='<option value="">Select an available factory video…</option>'+(options||'');
    if(sampleVideos[0]){$('sample-select').value=sampleVideos[0].filename;$('motion-sample').value=sampleVideos[0].filename;$('sample-select').dispatchEvent(new Event('change'));}
    $('library-count').textContent=`${d.count} / ${d.catalog_count} READY`;
    $('overview-videos').innerHTML=sampleVideos.length?sampleVideos.slice(0,6).map(v=>`<div class="video-mini"><div class="video-thumb">▷</div><div><b>${escapeHtml(v.title||v.display_name)}</b><small>${escapeHtml(v.platform||'Video source')} · ${v.size_mb} MB</small></div><span class="video-duration">VIDEO</span></div>`).join(''):`<div class="empty-state compact">No sample videos downloaded. Run <code>python scripts/download_sample_videos.py</code> in VS Code.</div>`;
    $('metric-videos').textContent=d.count;
    if(d.count<d.catalog_count) $('video-library-note')?.replaceChildren(document.createTextNode(`${d.count} of ${d.catalog_count} sample clips downloaded. Run the downloader again to retry missing clips.`));
  } catch(e){toast(`Could not load video library: ${e.message}`,true);}
}
async function refreshDashboard(){
  try{const d=await api('/api/dashboard-summary');
    $('metric-inspections').textContent=d.inspections_in_session??0;
    $('metric-frames').textContent=d.detections_reviewed??0;
    $('metric-findings').textContent=d.issue_findings??0;
    $('metric-videos').textContent=d.sample_video_count??0;
    $('last-refresh').textContent=`Updated ${new Date().toLocaleTimeString()}`;
  }catch(e){console.warn(e);}
}
async function boot(){
  $('sidebar-status').textContent='READY';
  $('sidebar-status').style.color='var(--green)';
  $('model-status-title').textContent='Inspection workspace ready';
  $('model-status-copy').textContent='Select a factory clip to review timestamped observations and annotated footage.';
  $('model-status-card').classList.add('model-ready');
  $('model-note').textContent='Review timestamped observations, annotated footage and supporting context.';
  $('last-refresh').textContent='Prepared result dataset';
  $('live-hint').textContent='Camera preview is ready. Start the camera to view the live feed.';
  $('sensor-note').textContent='Upload a vibration CSV to review the recorded condition-monitoring measurements.';
  $('motion-summary').textContent='Motion profile and event details are displayed here after a video review.';
  const upload = $('video-file'); if (upload) upload.disabled = true;
  const conf = $('confidence'); if (conf) conf.disabled = true;
  const duration = $('duration'); if (duration) duration.disabled = true;
  const motionFile = $('motion-file'); if (motionFile) motionFile.disabled = true;
  const sensorFile = $('sensor-file'); if (sensorFile) sensorFile.disabled = true;
  const motionButton = $('run-motion'); if (motionButton) motionButton.disabled = true;
  const sensorButton = $('analyse-sensor'); if (sensorButton) sensorButton.disabled = true;
  await loadVideos();
  await loadFreeVisionModels();
  await refreshDashboard();
}

async function loadFreeVisionModels(){
  const host=$('benchmark-model-options');
  if(!host)return;
  try{
    const data=await api('/api/ai-models');
    freeVisionModels=data.models||[];
    host.innerHTML=freeVisionModels.map((model,index)=>`
      <label class="benchmark-model-card">
        <input type="checkbox" data-model-id="${escapeHtml(model.id)}" checked>
        <span class="benchmark-model-check"></span>
        <span class="benchmark-model-copy"><b>${escapeHtml(model.name)}</b><small>${escapeHtml(model.provider)} · ${escapeHtml(model.input)}</small><em>${escapeHtml(model.role)}</em></span>
        <span class="free-tag">FREE</span>
      </label>`).join('');
    if(!freeVisionModels.length)host.textContent='No free vision models are currently configured.';
  }catch(error){host.innerHTML=`<div class="inline-error">Could not load free model catalog: ${escapeHtml(error.message)}</div>`;}
}

function selectedBenchmarkModels(){
  return [...document.querySelectorAll('#benchmark-model-options input[data-model-id]:checked')].map(input=>input.dataset.modelId);
}

async function runModelBenchmark(){
  const file=$('video-file').files[0],sample=$('sample-select').value;
  if(!file&&!sample)return toast('Select or upload the factory video first.',true);
  const selected=selectedBenchmarkModels();
  if(!selected.length)return toast('Select at least one free vision model.',true);
  const fd=new FormData();
  if(file)fd.append('file',file);else fd.append('sample_filename',sample);
  $('benchmark-duration').value=$('duration').value;
  fd.append('max_seconds',$('duration').value);
  fd.append('model_ids',selected.join(','));
  const button=$('run-model-benchmark');
  button.disabled=true;
  $('benchmark-progress-wrap').classList.remove('hidden');
  $('benchmark-results').classList.add('hidden');
  comparisonSequence.active=false;
  $('benchmark-progress-label').textContent='Preparing the shared frame sample…';
  $('benchmark-progress-bar').style.width='2%';
  $('benchmark-progress-percent').textContent='2%';
  try{
    const started=await api('/api/model-benchmark',{method:'POST',body:fd});
    await pollModelBenchmark(started.job_id);
  }catch(error){
    toast(error.message,true);
    $('benchmark-progress-label').textContent=`Comparison unavailable: ${error.message}`;
  }finally{button.disabled=false;}
}

async function pollModelBenchmark(jobId){
  for(let attempt=0;attempt<600;attempt++){
    const job=await api(`/api/model-benchmark/${jobId}`);
    const progress=Number(job.progress||0);
    $('benchmark-progress-bar').style.width=`${progress}%`;
    $('benchmark-progress-percent').textContent=`${progress}%`;
    $('benchmark-progress-label').textContent=job.message||'Comparing selected models…';
    if(job.status==='failed')throw new Error(job.error||'Model comparison failed.');
    if(job.status==='completed'){
      renderBenchmarkResults(job);
      return;
    }
    await new Promise(resolve=>setTimeout(resolve,1200));
  }
  throw new Error('Model comparison timed out. Check logs/factorylens.log.');
}

function formatVideoTime(seconds){
  const value=Math.max(0,Number(seconds)||0),minutes=Math.floor(value/60),secs=Math.floor(value%60);
  return `${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}
function seekPlayer(playerId,seconds){
  const player=$(playerId);if(!player)return;
  if(playerId==='model-review-player'&&comparisonSequence.active){comparisonSequence.active=false;const sequenceButton=$('play-all-model-reviews');if(sequenceButton)sequenceButton.textContent='↻ Replay AI comparison';}
  const target=Math.max(0,Number(seconds)||0);
  const seek=()=>{player.currentTime=Math.min(target,Number.isFinite(player.duration)?player.duration:target);player.play().catch(()=>{});};
  if(player.readyState>=1)seek();else player.addEventListener('loadedmetadata',seek,{once:true});
  player.scrollIntoView({behavior:'smooth',block:'center'});
}
function renderEventTimeline(events,playerId='annotated-player'){
  const host=$('event-timeline');if(!host)return;
  $('event-count-label').textContent=`${events.length} ${events.length===1?'event':'events'}`;
  if(!events.length){host.innerHTML='<div class="empty-state">No visible issue events were returned for the sampled frames.</div>';return;}
  host.innerHTML=events.slice().sort((a,b)=>Number(a.timestamp_seconds||0)-Number(b.timestamp_seconds||0)).map((event,index)=>{
    const time=Number(event.timestamp_seconds||0),severity=String(event.severity||'uncertain').toLowerCase();
    return `<button class="event-timeline-item severity-${escapeHtml(severity)}" data-player-id="${playerId}" data-event-time="${time}" title="Jump to ${formatVideoTime(time)}"><span class="event-time">${formatVideoTime(time)}</span><span class="event-timeline-copy"><b>${escapeHtml(event.title||event.label||'Visible event')}</b><small>${escapeHtml(String(event.issue_type||'observation').replaceAll('_',' '))}</small></span><span class="event-severity-dot"></span></button>`;
  }).join('');
  host.querySelectorAll('[data-event-time]').forEach(button=>button.addEventListener('click',()=>seekPlayer(button.dataset.playerId,button.dataset.eventTime)));
}
function modelFindingMarkup(event){
  const severity=String(event.severity||'uncertain').toLowerCase();
  const time=Number(event.timestamp_seconds||0);
  return `<article class="model-finding-row">
    <button class="model-finding-time" data-model-event-time="${time}" title="Play from ${formatVideoTime(time)}">${formatVideoTime(time)} <span>▶</span></button>
    <div class="model-finding-copy"><div class="model-finding-heading"><b>${escapeHtml(event.title||event.label||'Visible condition')}</b><span class="severity-pill ${escapeHtml(severity)}">${escapeHtml(severity)}</span></div>
    <p>${escapeHtml(event.visible_evidence||event.description||'Review the video around this timestamp.')}</p>
    <small>${escapeHtml(event.why_it_matters||'Flagged for human review.')}</small></div>
  </article>`;
}
function renderBenchmarkResults(job){
  currentBenchmarkJob=job;
  const host=$('benchmark-results'),results=job.results||[];
  const completed=results.filter(item=>item.status==='completed');
  if(!results.length){host.innerHTML='<div class="empty-state">No model results were returned.</div>';host.classList.remove('hidden');return;}
  const tabs=results.map(item=>`<button class="model-review-tab ${item.status==='completed'?'':'unavailable'}" data-review-model="${escapeHtml(item.model_id)}" ${item.status!=='completed'?'disabled':''}>
    <span class="model-review-status ${item.status==='completed'?'ready':'failed'}"></span><span><b>${escapeHtml(item.name)}</b><small>${item.status==='completed'?(Number(item.findings_count||0)>0?'Findings detected':'No findings reported'):'Unavailable'}</small></span><span class="model-review-arrow">›</span>
  </button>`).join('');
  const technical=results.map(item=>`<div class="technical-model-row"><b>${escapeHtml(item.name)}</b><span>${item.status==='completed'?(item.latency_ms!=null?`${(Number(item.latency_ms)/1000).toFixed(1)}s · ${item.input_tokens??'—'} input tokens · ${item.output_tokens??'—'} output tokens`:'Latency and token counts were not included in the supplied assets.'):`Unavailable: ${escapeHtml(item.error||'Provider error')}`}</span></div>`).join('');
  host.innerHTML=`<div class="visual-comparison-header"><div><div class="eyebrow">VISUAL MODEL COMPARISON</div><h4>One video. Different AI interpretations.</h4><p>Switch between each model to see its interpretation over the same footage. YOLO remains the shared visual reference.</p></div><span class="comparison-ready-pill">VISUAL REVIEW</span></div>
    <div class="model-review-tabs" id="model-review-tabs">${tabs}</div>
    <div class="model-comparison-stage">
      <div class="model-video-column">
        <div class="model-video-frame" id="model-video-frame">
          <video id="model-review-player" controls muted playsinline preload="metadata"></video>
          <canvas id="model-review-overlay" aria-hidden="true"></canvas>
          <div class="model-overlay-legend"><span><i class="legend-dot ai-dot"></i>Model annotations</span><span><i class="legend-dot yolo-dot"></i>YOLO context embedded in MP4</span></div>
        </div>
        <div class="model-playback-message hidden" id="model-playback-message" role="status"></div>
        <div class="comparison-play-controls"><button class="btn btn-primary btn-small" id="play-all-model-reviews" ${completed.length===0?'disabled':''}>▶ Play all AI reviews</button><span class="muted small">Each model tab plays its own supplied annotated MP4. Findings and YOLO context are already embedded in that video.</span></div>
        <div class="timeline-section compare-timeline-section"><div class="timeline-heading"><div><b>Events in this AI review</b><small>Choose a timestamp to play from that moment.</small></div></div><div id="benchmark-event-timeline" class="event-timeline model-event-timeline"><div class="empty-state">Select a reviewer.</div></div></div>
        <div class="yolo-context-strip" id="benchmark-yolo-context"></div>
      </div>
      <aside class="model-review-sidebar">
        <div class="model-review-detail-head"><div class="eyebrow">CURRENT REVIEWER</div><h3 id="active-review-model-name">Select a model</h3><span class="model-provider-label" id="active-review-provider"></span></div>
        <p id="active-review-summary" class="model-review-summary">The selected model's video interpretation will appear here.</p>
        <div class="model-review-observations" id="active-review-observations"></div>
        <div class="yolo-reference-card"><div class="yolo-reference-icon">◎</div><div><b>YOLO reference is shared</b><p id="yolo-reference-message">Teal boxes show locally detected people and common objects on sampled frames. These are context, not hazard labels.</p></div></div>
      </aside>
    </div>
    <div class="model-agreement-visual"><div><div class="eyebrow">CROSS-MODEL OVERLAP</div><b>Where reviewers noticed similar things</b><p>Agreement helps you find moments worth a closer human review; it does not prove that a finding is correct.</p></div><div class="agreement-visual-chips">${(job.agreement?.shared_findings||[]).map(item=>`<span class="agreement-visual-chip">${escapeHtml(String(item.issue_type||'observation').replaceAll('_',' '))} · ${formatVideoTime(item.timestamp_seconds)}</span>`).join('')||'<span class="muted small">No overlapping findings were reported.</span>'}</div></div>
    <details class="comparison-technical-details"><summary>Show technical performance details</summary><div class="technical-model-list">${technical}</div><a class="btn btn-secondary btn-small" href="assets/data/model-comparison-report.json" download="factorylens-model-comparison-report.json">Download comparison report</a></details>`;
  host.classList.remove('hidden');
  host.querySelectorAll('[data-review-model]').forEach(button=>button.addEventListener('click',()=>selectBenchmarkModel(button.dataset.reviewModel,true,false,true)));
  const player=$('model-review-player');
  const playbackMessage=$('model-playback-message');
  player.muted=true;
  player.playsInline=true;
  player.addEventListener('timeupdate',drawModelComparisonOverlay);
  player.addEventListener('loadedmetadata',drawModelComparisonOverlay);
  player.addEventListener('loadeddata',drawModelComparisonOverlay);
  player.addEventListener('seeked',drawModelComparisonOverlay);
  player.addEventListener('ended',advanceModelReviewSequence);
  player.addEventListener('error',()=>{
    const code=player.error?.code;
    const detail=code?` (media error ${code})`:'';
    playbackMessage.textContent=`The comparison video could not be played${detail}. The AI findings are still available. Check that the generated MP4 exists and is H.264 encoded, then rerun Compare.`;
    playbackMessage.classList.remove('hidden');
    $('play-all-model-reviews').disabled=true;
    comparisonSequence.active=false;
  },{once:true});
  if(job.video_url){
    player.src=`${job.video_url}${job.video_url.includes('?')?'&':'?'}v=${Date.now()}`;
    player.load();
    playbackMessage.classList.add('hidden');playbackMessage.textContent='';
  }else{
    player.removeAttribute('src');player.load();
    playbackMessage.textContent=job.playback_error||'The AI reviews finished, but FactoryLens did not receive a browser-playable comparison video. The findings remain available below.';
    playbackMessage.classList.remove('hidden');
    $('play-all-model-reviews').disabled=true;
  }
  $('play-all-model-reviews').addEventListener('click',playAllModelReviews);
  $('benchmark-progress-label').textContent='Comparison finished.';
  if(job.video_url&&completed.length){const first=completed[0];selectBenchmarkModel(first.model_id,false,true,false);}
  else if(job.video_url&&!completed.length){
    playbackMessage.textContent='The comparison video is ready, but none of the selected AI providers returned a usable review. You can still inspect the shared YOLO context.';
    playbackMessage.classList.remove('hidden');
  }
  toast(job.video_url?'AI comparison is ready.':'AI findings are ready, but comparison playback is unavailable.');
  host.scrollIntoView({behavior:'smooth',block:'start'});
}
function selectBenchmarkModel(modelId,resetTime=true,fromSequence=false,playAfterSelect=false){
  if(!currentBenchmarkJob)return;
  if(!fromSequence&&comparisonSequence.active){comparisonSequence.active=false;const sequenceButton=$('play-all-model-reviews');if(sequenceButton)sequenceButton.textContent='↻ Replay AI comparison';}
  const model=(currentBenchmarkJob.results||[]).find(item=>item.model_id===modelId);
  if(!model||model.status!=='completed')return;
  activeBenchmarkModelId=modelId;
  document.querySelectorAll('[data-review-model]').forEach(button=>button.classList.toggle('active',button.dataset.reviewModel===modelId));
  $('active-review-model-name').textContent=model.name;
  $('active-review-provider').textContent=`${model.provider_name||'OpenRouter'} · Saved review`;
  $('active-review-summary').textContent=model.summary||'Recorded model-specific findings from the supplied annotated output.';
  const observations=model.observations||[];
  $('active-review-observations').innerHTML=observations.length?observations.map(modelFindingMarkup).join(''):'<div class="model-no-findings"><b>No findings were present in this supplied model output.</b><p>This does not certify that the video is safe. Review the original footage and the YOLO context.</p></div>';
  $('active-review-observations').querySelectorAll('[data-model-event-time]').forEach(button=>button.addEventListener('click',()=>seekPlayer('model-review-player',button.dataset.modelEventTime)));
  renderModelEventTimeline(observations);
  const player=$('model-review-player');
  const source=model.video_url||currentBenchmarkJob.video_url;
  $('model-review-overlay').style.display='none';
  const startPlayback=()=>{
    if(resetTime){try{player.currentTime=0;}catch(_error){}}
    if(playAfterSelect){
      const result=player.play();
      if(result&&typeof result.catch==='function')result.catch(()=>{
        const message=$('model-playback-message');
        if(message){message.textContent='The selected model video is ready. Press Play on the video to start playback.';message.classList.remove('hidden');}
      });
    }
  };
  if(source && player.dataset.modelSource!==source){
    player.pause();
    if(resetTime||playAfterSelect)player.addEventListener('loadedmetadata',startPlayback,{once:true});
    player.dataset.modelSource=source;player.src=source;player.load();
  }else startPlayback();
  renderYoloContext(currentBenchmarkJob.yolo_samples||[]);
  $('yolo-reference-message').textContent=currentBenchmarkJob.yolo_message||'The saved MP4 includes the shared YOLO object context. These boxes are not hazard labels.';
  drawModelComparisonOverlay();
}
function renderModelEventTimeline(observations){
  const host=$('benchmark-event-timeline');if(!host)return;
  const items=(observations||[]).slice().sort((a,b)=>Number(a.timestamp_seconds||0)-Number(b.timestamp_seconds||0));
  if(!items.length){host.innerHTML='<div class="empty-state">This reviewer did not return timestamped issue observations.</div>';return;}
  host.innerHTML=items.map((event,index)=>{
    const time=Number(event.timestamp_seconds||0),severity=String(event.severity||'uncertain').toLowerCase();
    return `<button class="event-timeline-item model-event-timeline-item severity-${escapeHtml(severity)}" data-model-timeline-time="${time}" title="Play from ${formatVideoTime(time)}"><span class="event-time">${formatVideoTime(time)}</span><span class="event-timeline-copy"><b>${escapeHtml(event.title||event.label||`Event ${index+1}`)}</b><small>${escapeHtml(String(event.issue_type||'observation').replaceAll('_',' '))}</small></span><span class="event-severity-dot"></span></button>`;
  }).join('');
  host.querySelectorAll('[data-model-timeline-time]').forEach(button=>button.addEventListener('click',()=>seekPlayer('model-review-player',button.dataset.modelTimelineTime)));
  updateModelEventTimeline(Number($('model-review-player')?.currentTime||0));
}
function updateModelEventTimeline(currentTime){
  const host=$('benchmark-event-timeline');if(!host)return;
  host.querySelectorAll('[data-model-timeline-time]').forEach(button=>{
    const start=Number(button.dataset.modelTimelineTime||0);
    const selected=(currentBenchmarkJob?.results||[]).find(item=>item.model_id===activeBenchmarkModelId);
    const finding=(selected?.observations||[]).find(item=>Math.abs(Number(item.timestamp_seconds||0)-start)<0.01);
    const duration=Number(finding?.display_duration_seconds||2.8);
    button.classList.toggle('is-current',currentTime>=start-.25&&currentTime<=start+duration);
  });
}

function renderYoloContext(samples){
  const host=$('benchmark-yolo-context');
  const visible=(samples||[]).filter(item=>(item.detections||[]).length);
  if(!visible.length){host.innerHTML='<div class="yolo-empty">YOLO did not return object boxes for its sampled frames. The AI review remains available.</div>';return;}
  const labels={};visible.forEach(item=>(item.detections||[]).forEach(det=>{labels[det.label]=(labels[det.label]||0)+1;}));
  const chips=visible.map(item=>`<button class="yolo-time-chip" data-yolo-time="${Number(item.timestamp_seconds||0)}"><b>${formatVideoTime(item.timestamp_seconds)}</b><span>${escapeHtml([...new Set((item.detections||[]).map(d=>d.label))].join(' · '))}</span></button>`).join('');
  host.innerHTML=`<div class="yolo-context-heading"><b>YOLO object context</b><small>Teal boxes · ${visible.length} sampled moments</small></div><div class="yolo-time-chips">${chips}</div>`;
  host.querySelectorAll('[data-yolo-time]').forEach(button=>button.addEventListener('click',()=>seekPlayer('model-review-player',button.dataset.yoloTime)));
}
function activeModelEventsAtTime(model, currentTime){
  const priority={high:0,medium:1,low:2,uncertain:3};
  return (model?.observations||[]).filter(event=>{
    const stamp=Number(event.timestamp_seconds);
    const display=Math.max(0,Number(event.display_duration_seconds??2.8));
    return Number.isFinite(stamp)&&Number.isFinite(display)&&currentTime>=stamp&&currentTime<=stamp+display;
  }).sort((a,b)=>{
    const pa=priority[String(a.severity||'uncertain').toLowerCase()]??4;
    const pb=priority[String(b.severity||'uncertain').toLowerCase()]??4;
    return pa-pb||Number(a.timestamp_seconds||0)-Number(b.timestamp_seconds||0);
  });
}
function wrapCanvasBannerText(ctx,text,maxWidth,maxLines=2){
  const words=String(text||'VISIBLE CONDITION').trim().split(/\s+/).filter(Boolean);
  const lines=[];let line='';
  for(const word of words){
    const candidate=line?`${line} ${word}`:word;
    if(line&&ctx.measureText(candidate).width>maxWidth){
      lines.push(line);line=word;
      if(lines.length===maxLines-1)break;
    }else line=candidate;
  }
  if(line&&lines.length<maxLines)lines.push(line);
  const used=lines.join(' ').length;
  if(used<String(text||'').trim().length&&lines.length){
    let last=lines[lines.length-1];
    while(last.length&&ctx.measureText(`${last}…`).width>maxWidth)last=last.slice(0,-1);
    lines[lines.length-1]=`${last.trimEnd()}…`;
  }
  return lines.length?lines:['VISIBLE CONDITION'];
}
function drawModelEventBanner(ctx,events,imageRect,dpr){
  if(!events.length)return;
  const severityColor={high:'#ef5350',medium:'#f0a23b',low:'#22b89a',uncertain:'#d49a55'};
  const padX=12*dpr,padY=9*dpr;
  const x=imageRect.x+9*dpr,y=imageRect.y+9*dpr;
  const width=Math.max(80,imageRect.width-18*dpr);
  let titleFont=Math.max(10*dpr,Math.min(16*dpr,imageRect.width/78));
  const layoutFor=font=>{
    const metaFont=Math.max(7.4*dpr,font*.60);
    const headerFont=Math.max(8*dpr,font*.72);
    const titleLineH=font*1.18,metaLineH=metaFont*1.35;
    const rowGap=Math.max(4*dpr,font*.30);
    const maxTextW=width-padX*2-20*dpr;
    ctx.font=`700 ${font}px Arial`;
    const rows=events.map(event=>({
      event,
      lines:wrapCanvasBannerText(ctx,event.title||event.label||'Visible condition',maxTextW,2),
    }));
    const headerH=events.length>1?headerFont*1.7+4*dpr:0;
    const rowHeights=rows.map(row=>row.lines.length*titleLineH+metaLineH+rowGap);
    return {metaFont,headerFont,titleLineH,metaLineH,rowGap,rows,rowHeights,headerH,height:padY*2+headerH+rowHeights.reduce((a,b)=>a+b,0)};
  };
  let layout=layoutFor(titleFont);
  const maxHeight=Math.max(48*dpr,imageRect.height*.44);
  if(layout.height>maxHeight){
    titleFont=Math.max(8.6*dpr,titleFont*(maxHeight/layout.height));
    layout=layoutFor(titleFont);
  }
  const panelHeight=Math.min(imageRect.height-12*dpr,layout.height);
  if(panelHeight<=0)return;

  // Match the primary annotated video: a dark translucent panel, not an opaque card.
  ctx.save();
  ctx.fillStyle='rgba(7, 13, 18, 0.66)';
  ctx.fillRect(x,y,width,panelHeight);
  ctx.strokeStyle='rgba(235,245,247,0.18)';
  ctx.lineWidth=Math.max(1,dpr);
  ctx.strokeRect(x+.5*dpr,y+.5*dpr,width-dpr,panelHeight-dpr);
  const primary=String(events[0].severity||'uncertain').toLowerCase();
  ctx.fillStyle=severityColor[primary]||severityColor.uncertain;
  ctx.fillRect(x,y,Math.max(5*dpr,Math.round(width*.008)),panelHeight);

  let cursorY=y+padY+titleFont*.83;
  if(events.length>1){
    ctx.font=`700 ${layout.headerFont}px Arial`;
    ctx.fillStyle='rgba(211,225,229,0.88)';
    ctx.fillText(`${events.length} SIMULTANEOUS EVENTS`,x+padX+7*dpr,cursorY);
    cursorY+=layout.headerH;
  }
  layout.rows.forEach((row,index)=>{
    const event=row.event;
    const sev=String(event.severity||'uncertain').toLowerCase();
    const accent=severityColor[sev]||severityColor.uncertain;
    const markerX=x+padX+3*dpr;
    ctx.fillStyle=accent;
    ctx.beginPath();ctx.arc(markerX,cursorY-titleFont*.27,Math.max(2*dpr,titleFont*.17),0,Math.PI*2);ctx.fill();

    ctx.font=`700 ${titleFont}px Arial`;
    ctx.fillStyle='#ffffff';
    const textX=x+padX+13*dpr;
    row.lines.forEach(line=>{ctx.fillText(line,textX,cursorY);cursorY+=layout.titleLineH;});

    const stamp=Number(event.timestamp_seconds||0);
    const time=event.timestamp_label||formatVideoTime(stamp);
    const priority=String(event.severity||'uncertain').toUpperCase();
    const confidence=String(event.confidence||'low').toUpperCase();
    ctx.font=`600 ${layout.metaFont}px Arial`;
    ctx.fillStyle='rgba(223,233,236,0.88)';
    ctx.fillText(`${time}  |  ${priority} PRIORITY  |  ${confidence} CONFIDENCE`,textX,cursorY-1*dpr);
    cursorY+=layout.metaLineH+layout.rowGap;
    if(index<layout.rows.length-1){
      const dividerY=cursorY-layout.rowGap*.55;
      ctx.strokeStyle='rgba(220,232,235,0.13)';ctx.lineWidth=Math.max(1,dpr);
      ctx.beginPath();ctx.moveTo(textX,dividerY);ctx.lineTo(x+width-padX,dividerY);ctx.stroke();
    }
  });
  ctx.restore();
}
function drawModelComparisonOverlay(){
  const player=$('model-review-player'),canvas=$('model-review-overlay');
  if(player)updateModelEventTimeline(Number(player.currentTime||0));
  if(!player||!canvas||!currentBenchmarkJob||!player.videoWidth)return;
  if(currentBenchmarkJob.embedded_annotations){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);return;}
  const rect=player.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  const cssWidth=rect.width,cssHeight=rect.height;
  if(!cssWidth||!cssHeight)return;
  canvas.width=Math.max(1,Math.round(cssWidth*dpr));canvas.height=Math.max(1,Math.round(cssHeight*dpr));
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  const scale=Math.min(canvas.width/player.videoWidth,canvas.height/player.videoHeight);
  const renderedWidth=player.videoWidth*scale,renderedHeight=player.videoHeight*scale;
  const offsetX=(canvas.width-renderedWidth)/2,offsetY=(canvas.height-renderedHeight)/2;
  const imageRect={x:offsetX,y:offsetY,width:renderedWidth,height:renderedHeight};
  const currentTime=Number(player.currentTime||0);
  const drawBox=(bbox,label,color,confidence)=>{
    if(!Array.isArray(bbox)||bbox.length!==4)return;
    const values=bbox.map(Number);if(!values.every(Number.isFinite))return;
    const [x1,y1,x2,y2]=values;
    const x=offsetX+x1*player.videoWidth*scale,y=offsetY+y1*player.videoHeight*scale;
    const w=(x2-x1)*player.videoWidth*scale,h=(y2-y1)*player.videoHeight*scale;if(w<=0||h<=0)return;
    ctx.lineWidth=2.5*dpr;ctx.strokeStyle=color;ctx.strokeRect(x,y,w,h);
    const text=`${label}${Number.isFinite(Number(confidence))?` ${Math.round(Number(confidence)*100)}%`:''}`;
    ctx.font=`600 ${12*dpr}px Arial`;const tw=ctx.measureText(text).width+14*dpr;const ty=Math.max(offsetY,y-25*dpr);
    ctx.fillStyle=color;ctx.fillRect(x,ty,tw,22*dpr);ctx.fillStyle='#081317';ctx.fillText(text,x+7*dpr,ty+15*dpr);
  };

  // YOLO remains a shared object-context layer for every model review.
  const samples=currentBenchmarkJob.yolo_samples||[];
  let nearest=null,nearestGap=Infinity;
  samples.forEach(sample=>{const gap=Math.abs(Number(sample.timestamp_seconds||0)-currentTime);if(gap<nearestGap){nearestGap=gap;nearest=sample;}});
  if(nearest&&nearestGap<=1.05){
    (nearest.detections||[]).forEach(det=>drawBox(det.bbox_norm,`YOLO · ${String(det.label||'OBJECT').toUpperCase()}`,'#38d6b0',det.confidence));
  }

  const activeModel=(currentBenchmarkJob.results||[]).find(item=>item.model_id===activeBenchmarkModelId);
  const activeEvents=activeModelEventsAtTime(activeModel,currentTime);
  // Draw every active issue box from the selected model, including overlapping events.
  activeEvents.forEach(event=>{
    const confidence=String(event.confidence||'low').toLowerCase();
    drawBox(event.bbox,`AI · ${String(event.issue_type||'ISSUE').replaceAll('_',' ').toUpperCase()}`,'#ff765f',confidence==='high'?.9:confidence==='medium'?.7:.5);
  });
  // Match the primary annotated video: show all concurrent issue titles and metadata.
  drawModelEventBanner(ctx,activeEvents,imageRect,dpr);
}
async function startModelReviewSequence(userInitiated=false){
  const ids=(currentBenchmarkJob?.results||[]).filter(item=>item.status==='completed').map(item=>item.model_id);
  const player=$('model-review-player'),button=$('play-all-model-reviews'),message=$('model-playback-message');
  if(!ids.length||!currentBenchmarkJob?.video_url||!player)return;
  comparisonSequence={active:true,modelIds:ids,index:0};
  selectBenchmarkModel(ids[0],false,true,false);
  button.textContent=userInitiated?'Starting comparison…':'Preparing comparison…';
  try{
    // Call play immediately instead of waiting for canplay. Waiting for a later
    // canplay event can discard the browser's transient user-activation grant.
    player.pause();
    if(player.readyState>=1)player.currentTime=0;
    await player.play();
    button.textContent=`Playing 1 of ${ids.length} · ${currentBenchmarkJob.results.find(x=>x.model_id===ids[0])?.name||'AI review'}`;
    if(message){message.textContent='Comparison playback: the same clip is shown once for each selected AI model. Coral boxes are that model’s issue observations; teal boxes are the shared YOLO object context.';message.classList.remove('hidden');}
  }catch(error){
    comparisonSequence.active=false;
    button.textContent='▶ Play all AI reviews';
    if(message){message.textContent=userInitiated?'The video is ready. Press Play on the video itself to begin.':'Comparison is ready. Your browser blocked automatic playback—press “Play all AI reviews” to start.';message.classList.remove('hidden');}
  }
}
function playAllModelReviews(){startModelReviewSequence(true);}
async function advanceModelReviewSequence(){
  if(!comparisonSequence.active)return;
  comparisonSequence.index+=1;
  if(comparisonSequence.index>=comparisonSequence.modelIds.length){
    comparisonSequence.active=false;
    $('play-all-model-reviews').textContent='↻ Replay AI comparison';
    const message=$('model-playback-message');
    if(message){message.textContent='All supplied model-specific annotated videos have played. Choose a reviewer or replay the comparison.';message.classList.remove('hidden');}
    return;
  }
  const nextId=comparisonSequence.modelIds[comparisonSequence.index];
  selectBenchmarkModel(nextId,false,true,false);
  const player=$('model-review-player'),button=$('play-all-model-reviews');
  const playNext=async()=>{
    try{player.currentTime=0;await player.play();button.textContent=`Playing ${comparisonSequence.index+1} of ${comparisonSequence.modelIds.length} · ${currentBenchmarkJob.results.find(x=>x.model_id===nextId)?.name||'AI review'}`;}
    catch(error){comparisonSequence.active=false;button.textContent='▶ Play all AI reviews';const message=$('model-playback-message');if(message){message.textContent='The next model is selected. Press Play on the video to continue.';message.classList.remove('hidden');}}
  };
  if(player.readyState>=1)await playNext();else player.addEventListener('loadedmetadata',playNext,{once:true});
}

function renderHeatmaps(data){
  const temporal=$('temporal-heatmap');
  const canvas=$('spatial-heatmap');
  if(!temporal||!canvas)return;
  if(!data){temporal.innerHTML='<div class="empty-state">No heatmap data was returned for this inspection.</div>';return;}
  const bins=data.bins||[];
  const tracks=data.issue_tracks||[];
  const objectTracks=data.object_tracks||[];
  if(!tracks.length&&!objectTracks.length){
    temporal.innerHTML='<div class="empty-state">No AI issue observations or YOLO object detections were recorded for this clip.</div>';
  }else{
    const tickEvery=Math.max(1,Math.ceil(bins.length/8));
    const ticks=bins.filter((bin,index)=>index%tickEvery===0).map(bin=>`<span>${Number(bin.start_seconds).toFixed(0)}s</span>`).join('');
    const buildRows=(items,kind)=>items.map(track=>{
      const maxValue=Math.max(1,...(track.values||[]));
      const cells=(track.values||[]).map((count,index)=>{
        const bin=bins[index]||{};const intensity=count/maxValue;
        const alpha=count?(.15+intensity*.78):.035;
        const time=Number(bin.start_seconds||0);
        const activity=kind==='context'?'object detections':'AI issue observations';
        return `<button class="heat-cell ${kind==='context'?'context ':''}${count?'active':''}" data-heat-time="${time}" style="--heat-alpha:${alpha.toFixed(3)}" title="${escapeHtml(track.label)} · ${Number(bin.start_seconds||0).toFixed(1)}–${Number(bin.end_seconds||0).toFixed(1)}s · ${count} ${activity}"><span>${count||''}</span></button>`;
      }).join('');
      return `<div class="heatmap-row"><div class="heatmap-row-label" title="${escapeHtml(track.label)}">${escapeHtml(track.label)}</div><div class="heatmap-row-cells">${cells}</div></div>`;
    }).join('');
    temporal.innerHTML=`<div class="heatmap-time-ruler">${ticks}</div>`+
      (tracks.length?`<div class="heatmap-track-label issue-track-label">AI ISSUE OBSERVATIONS</div>${buildRows(tracks,'issue')}`:'')+
      (objectTracks.length?`<div class="heatmap-track-label context-track-label">YOLO OBJECT CONTEXT · NOT HAZARDS BY ITSELF</div>${buildRows(objectTracks,'context')}`:'');
    temporal.querySelectorAll('[data-heat-time]').forEach(button=>button.addEventListener('click',()=>{
      const player=$('annotated-player');
      if(player){player.currentTime=Number(button.dataset.heatTime);player.play().catch(()=>{});}
    }));
  }
  drawSpatialHeatmap(canvas,data);
  const note=$('spatial-heatmap-note');
  const issueCount=(data.issue_points||[]).length,objectCount=Number(data.object_box_count??(data.object_points||[]).length);
  note.textContent=`AI issue boxes: ${issueCount}. YOLO object boxes: ${objectCount}. ${issueCount?'Red/orange = AI issue locations.':'No model-provided AI issue boxes; spatial hazard locations cannot be inferred.'} Teal dots are approximate positions reconstructed from the recorded spatial plot.`;
}

function drawSpatialHeatmap(canvas,data){
  const ctx=canvas.getContext('2d');const w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b141a';ctx.fillRect(0,0,w,h);
  const rows=data.spatial_issue_grid||[],objectRows=data.spatial_object_grid||[];
  const rowCount=rows.length||8,colCount=rows[0]?.length||12;
  const cellW=w/colCount,cellH=h/rowCount;
  ctx.strokeStyle='rgba(133,159,169,.16)';ctx.lineWidth=1;
  for(let c=0;c<=colCount;c++){ctx.beginPath();ctx.moveTo(c*cellW,0);ctx.lineTo(c*cellW,h);ctx.stroke();}
  for(let r=0;r<=rowCount;r++){ctx.beginPath();ctx.moveTo(0,r*cellH);ctx.lineTo(w,r*cellH);ctx.stroke();}
  rows.forEach((row,r)=>row.forEach((value,c)=>{
    const intensity=Number(value||0);if(intensity<=0)return;
    ctx.fillStyle=`rgba(245,91,76,${.08+intensity*.58})`;
    ctx.fillRect(c*cellW+1,r*cellH+1,cellW-2,cellH-2);
  }));
  (data.object_points||[]).forEach(point=>{
    const x=Number(point.x)*w,y=Number(point.y)*h;
    ctx.beginPath();ctx.fillStyle='rgba(79,211,177,.78)';ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();
  });
  ctx.fillStyle='rgba(226,236,238,.72)';ctx.font='12px monospace';ctx.fillText('TOP OF FRAME',12,18);
}

$('run-model-benchmark').addEventListener('click',runModelBenchmark);

$('confidence').addEventListener('input',e=>$('confidence-value').textContent=Number(e.target.value).toFixed(2));
$('sample-select').addEventListener('change',e=>{
  const file=e.target.value; $('video-file').value=''; $('selected-source').textContent='No custom file selected';
  if(!file)return; const v=sampleVideos.find(x=>x.filename===file); $('preview-title').textContent=v?.title||file;
  $('source-player').src=v?.url||DEMO_DATA.source_video.url; $('source-player').classList.remove('hidden'); $('video-placeholder').classList.add('hidden'); $('source-player').load();
});
$('video-file').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;$('sample-select').value='';$('analysis-result').classList.add('hidden');$('benchmark-panel').classList.add('hidden');$('selected-source').textContent=`${f.name} · ${(f.size/1048576).toFixed(1)} MB`;$('preview-title').textContent=f.name;
  if(currentObjectUrl)URL.revokeObjectURL(currentObjectUrl);currentObjectUrl=URL.createObjectURL(f);$('source-player').src=currentObjectUrl;$('source-player').classList.remove('hidden');$('video-placeholder').classList.add('hidden');$('source-player').load();
});

async function analyseSelectedVideo(){
  const file=$('video-file').files[0],sample=$('sample-select').value;if(!file&&!sample)return toast('Select a downloaded factory video or upload one first.',true);
  const fd=new FormData();if(file)fd.append('file',file);else fd.append('sample_filename',sample);
  fd.append('confidence',$('confidence').value);fd.append('max_seconds',$('duration').value);
  $('analyse-video-btn').disabled=true;$('analysis-progress-wrap').classList.remove('hidden');$('analysis-result').classList.add('hidden');$('benchmark-panel').classList.add('hidden');$('empty-analysis').classList.add('hidden');
  $('preview-status').textContent='ANALYSING';$('progress-label').textContent='Starting automated video review…';$('progress-bar').style.width='2%';$('progress-percent').textContent='2%';
  try{const started=await api('/api/analyze-video',{method:'POST',body:fd});$('progress-label').textContent=started.note||'Processing video…';await pollJob(started.job_id);}
  catch(e){toast(e.message,true);$('preview-status').textContent='ERROR';$('empty-analysis').classList.remove('hidden');$('empty-analysis').innerHTML=`<div class="empty-icon">!</div><b>Analysis could not complete</b><span>${escapeHtml(e.message)}</span>`;}
  finally{$('analyse-video-btn').disabled=false;}
}
async function pollJob(jobId){
  for(let i=0;i<900;i++){
    const j=await api(`/api/jobs/${jobId}`);const p=Number(j.progress||0);
    $('progress-bar').style.width=`${p}%`;$('progress-percent').textContent=`${p}%`;$('progress-label').textContent=j.message||`${j.status.replaceAll('_',' ')} · ${j.frames_processed||0} frames processed`;
    if(j.status==='failed')throw new Error(j.error||'Video analysis failed');
    if(j.status==='completed'){showAnalysisResult(j);return;}
    await new Promise(r=>setTimeout(r,900));
  }
  throw new Error('Video analysis is taking longer than expected. Check logs/factorylens.log and the VS Code terminal.');
}
function renderObservationCard(e){
  const severity=String(e.severity||'uncertain').toLowerCase();
  return `<article class="observation-card issue-card severity-${escapeHtml(severity)}">
    <div class="observation-card-top"><span class="issue-type">${escapeHtml(String(e.issue_type||'visual_observation').replaceAll('_',' '))}</span><span class="severity-pill ${escapeHtml(severity)}">${escapeHtml(severity)} priority</span></div>
    <h4>${escapeHtml(e.title||e.label||'Visible condition for review')}</h4>
    <button type="button" class="issue-timestamp event-jump-button" data-annotated-time="${Number(e.timestamp_seconds||0)}">▶ ${escapeHtml(e.timestamp_label||formatVideoTime(e.timestamp_seconds))} · Play this moment</button>
    <div class="observation-block"><b>What is visible</b><p>${escapeHtml(e.visible_evidence||e.description||'See the annotated frame for the visual evidence.')}</p></div>
    <div class="observation-block"><b>Why it may matter</b><p>${escapeHtml(e.why_it_matters||'This visual condition may merit inspection by site personnel.')}</p></div>
    <div class="observation-action"><b>Suggested follow-up</b><p>${escapeHtml(e.recommended_follow_up||'Have a qualified person review the original footage and the equipment in accordance with site procedures.')}</p></div>
    <div class="observation-meta"><span>${escapeHtml(e.confidence||'low')} model confidence</span><span>AI-generated observation</span></div>
    <div class="observation-footnote">This is a visible-video observation, not a confirmed fault, diagnosis or compliance determination.</div>
  </article>`;
}
function showAnalysisResult(j){
  $('preview-status').textContent='COMPLETED';$('analysis-progress-wrap').classList.add('hidden');$('analysis-result').classList.remove('hidden');$('empty-analysis').classList.add('hidden');
  $('annotated-player').src=`${j.output_url}?t=${Date.now()}`;$('annotated-player').load();$('download-annotated').href=j.output_url;$('download-annotated').download='factorylens-main-annotated.mp4';$('download-report').href='assets/data/inspection-report.json';$('download-report').download='factorylens-inspection-report.json';
  $('analysis-provider').textContent='OpenRouter multimodal review + YOLO26n';
  $('analysis-summary').textContent=j.analysis_summary||'Saved FactoryLens inspection result.';
  $('result-metrics').innerHTML=[['Clip reviewed',`${Number(j.duration_seconds||25)} sec`],['AI issue findings',j.event_count],['YOLO sampled moments',j.heatmap?.object_sample_count??18],['YOLO object boxes',j.heatmap?.object_box_count??49]].map(([a,b])=>`<div class="result-metric"><b>${b??'—'}</b><span>${a}</span></div>`).join('');
  const warnings=j.warnings||[];$('analysis-warnings').classList.toggle('hidden',!warnings.length);$('analysis-warnings').innerHTML=warnings.map(w=>`<div>ⓘ ${escapeHtml(w)}</div>`).join('');
  const events=j.events||[];
  renderEventTimeline(events,'annotated-player');
  $('event-explanations').innerHTML=events.length?events.map(renderObservationCard).join(''):`<div class="no-observations"><b>No specific visible issue was returned.</b><p>This is not proof that the workplace or machine is safe. Short events may be missed between sampled frames.</p></div>`;
  $('event-explanations').querySelectorAll('[data-annotated-time]').forEach(button=>button.addEventListener('click',()=>seekPlayer('annotated-player',button.dataset.annotatedTime)));
  $('benchmark-panel').classList.remove('hidden');
  renderHeatmaps(j.heatmap||null);
  toast('Inspection video and clickable event timeline are ready.');refreshDashboard();
}
$('analyse-video-btn').addEventListener('click',analyseSelectedVideo);

// Live camera: local COCO object detections only. Issue-level video understanding runs on uploaded clips.
function fitCanvas(){const v=$('live-video'),c=$('live-canvas');if(!v.videoWidth)return;const r=v.getBoundingClientRect(),dpr=window.devicePixelRatio||1;c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);c.style.width=`${r.width}px`;c.style.height=`${r.height}px`;}
async function startCamera(){
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:cameraFacing,width:{ideal:1280},height:{ideal:720}},audio:false});
    $('live-video').srcObject=cameraStream;$('live-placeholder').classList.add('hidden');
    $('camera-status').textContent='CAMERA PREVIEW';$('camera-status').classList.add('success');
    $('start-camera').disabled=true;$('stop-camera').disabled=false;
    $('live-hint').textContent='Camera preview active.';
    toast('Camera preview started. Live detection requires the full FactoryLens backend.');
  }catch(e){$('live-error').textContent=`Camera error: ${e.message}. Use HTTPS and allow camera permission.`;$('live-error').classList.remove('hidden');toast('Could not start camera.',true);}
}
function stopCamera(){if(cameraTimer)clearInterval(cameraTimer);cameraTimer=null;if(cameraStream)cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;$('live-video').srcObject=null;$('camera-status').textContent='CAMERA OFF';$('camera-status').classList.remove('success');$('start-camera').disabled=false;$('stop-camera').disabled=true;const c=$('live-canvas').getContext('2d');c.clearRect(0,0,$('live-canvas').width,$('live-canvas').height);$('live-placeholder').classList.remove('hidden');}
async function captureLiveFrame(){
  const v=$('live-video');if(!v.videoWidth)return;const tmp=document.createElement('canvas'),scale=Math.min(1,720/v.videoWidth);tmp.width=Math.round(v.videoWidth*scale);tmp.height=Math.round(v.videoHeight*scale);tmp.getContext('2d').drawImage(v,0,0,tmp.width,tmp.height);const blob=await new Promise(r=>tmp.toBlob(r,'image/jpeg',.76));if(!blob)return;
  const fd=new FormData();fd.append('file',blob,'camera.jpg');try{const d=await api('/api/live-detect',{method:'POST',body:fd});lastLiveDetections=d.detections;cameraFrameCount++;$('live-frames').textContent=cameraFrameCount;$('live-people').textContent=d.detections.filter(x=>x.label==='person').length;$('live-vehicles').textContent=d.detections.filter(x=>['car','truck','bus','motorcycle','bicycle'].includes(x.label)).length;drawLiveOverlay(d.detections);}
  catch(e){$('live-error').textContent=e.message;$('live-error').classList.remove('hidden');}
}
function drawLiveOverlay(detections){
  const v=$('live-video'),c=$('live-canvas'),ctx=c.getContext('2d');if(!v.videoWidth)return;fitCanvas();const dpr=window.devicePixelRatio||1,cw=c.width,ch=c.height,vw=v.videoWidth,vh=v.videoHeight,sc=Math.min(cw/vw,ch/vh),ox=(cw-vw*sc)/2,oy=(ch-vh*sc)/2;ctx.clearRect(0,0,cw,ch);ctx.lineWidth=2*dpr;ctx.font=`bold ${13*dpr}px Arial`;
  detections.forEach(d=>{const [x1,y1,x2,y2]=d.bbox,x=ox+x1*sc,y=oy+y1*sc,w=(x2-x1)*sc,h=(y2-y1)*sc,col=d.label==='person'?'#4fe0a5':'#ffca6c';ctx.strokeStyle=col;ctx.strokeRect(x,y,w,h);const text=`${d.label.toUpperCase()} ${Math.round(d.confidence*100)}%`;const tw=ctx.measureText(text).width+16*dpr;ctx.fillStyle=col;ctx.fillRect(x,Math.max(0,y-28*dpr),tw,27*dpr);ctx.fillStyle='#071216';ctx.fillText(text,x+8*dpr,Math.max(17*dpr,y-9*dpr));});
}
$('start-camera').addEventListener('click',startCamera);$('stop-camera').addEventListener('click',stopCamera);
$('switch-camera').addEventListener('click',async()=>{cameraFacing=cameraFacing==='environment'?'user':'environment';if(cameraStream){stopCamera();await startCamera();}});
window.addEventListener('resize',()=>{if(cameraStream)drawLiveOverlay(lastLiveDetections);drawModelComparisonOverlay();});

$('motion-file').addEventListener('change',e=>{if($('motion-file-label'))$('motion-file-label').textContent=e.target.files[0]?.name||'No custom file selected';});
$('run-motion').addEventListener('click',async()=>{
  return toast('Motion analysis is unavailable for the selected session.');
  const file=$('motion-file').files[0],sample=$('motion-sample').value;if(!file&&!sample)return toast('Select a factory video first.',true);
  const fd=new FormData();if(file)fd.append('file',file);else fd.append('sample_filename',sample);fd.append('max_seconds','30');$('run-motion').disabled=true;$('motion-label').textContent='ANALYSING';
  try{const d=await api('/api/motion-analysis',{method:'POST',body:fd});drawLineChart($('motion-chart'),d.times,d.samples,'#e3a54e');$('motion-summary').textContent=`Baseline median motion: ${d.baseline_median}. Candidate deviations: ${d.events.length}. ${d.summary}`;$('motion-label').textContent='ANALYSIS READY';$('motion-events').innerHTML=d.events.length?d.events.map(e=>`<div class="event-row"><span>Motion deviation candidate at <b>${e.time_seconds}s</b></span><span>Score ${e.score}</span></div>`).join(''):'<div class="muted small">No candidate deviation exceeded the analysis threshold in this sample window.</div>';toast('Motion screening completed.');}
  catch(e){$('motion-summary').textContent=e.message;$('motion-label').textContent='ERROR';toast(e.message,true);}finally{$('run-motion').disabled=false;}
});
function drawLineChart(canvas,xs,ys,color){const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.strokeStyle='#293a41';ctx.lineWidth=1;for(let i=1;i<=4;i++){const y=i*h/5;ctx.beginPath();ctx.moveTo(45,y);ctx.lineTo(w-15,y);ctx.stroke();}if(!ys?.length)return;const min=Math.min(...ys),max=Math.max(...ys),range=Math.max(1e-6,max-min);ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ys.forEach((v,i)=>{const x=45+i*(w-65)/Math.max(1,ys.length-1),y=h-25-(v-min)/range*(h-55);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();ctx.fillStyle='#91a1a8';ctx.font='15px monospace';ctx.fillText(`min ${min.toFixed(2)}    max ${max.toFixed(2)}`,48,22);}

$('sensor-file').addEventListener('change',e=>$('sensor-file-label').textContent=e.target.files[0]?.name||'No sensor CSV selected');
$('analyse-sensor').addEventListener('click',async()=>{return toast('No sensor CSV or saved sensor report was included in this demo.');const file=$('sensor-file').files[0];if(!file)return toast('Upload an actual sensor CSV first.',true);const fd=new FormData();fd.append('file',file);$('analyse-sensor').disabled=true;try{const d=await api('/api/sensor-analysis',{method:'POST',body:fd});$('sensor-empty').classList.add('hidden');$('sensor-metrics').classList.remove('hidden');$('sensor-metrics').innerHTML=[['Samples',d.samples],['RMS',d.rms],['Peak amplitude',d.peak_amplitude],['Crest factor',d.crest_factor],['Mean',d.mean],['Top FFT bin',d.dominant_frequency_bins[0]?.bin??'—']].map(([k,v])=>`<div class="sensor-metric"><b>${v}</b><span>${k}</span></div>`).join('');drawLineChart($('sensor-chart'),[],d.series,'#73d1c1');$('sensor-note').textContent=d.note;toast('Sensor CSV analysed.');}catch(e){toast(e.message,true);}finally{$('analyse-sensor').disabled=false;}});

async function loadEvents(){
  try{const d=await api('/api/events');$('events-body').innerHTML=d.items.length?d.items.map(e=>{const x=e.details||{};return `<tr><td>${Number(e.timestamp_seconds||0).toFixed(1)} sec</td><td>${escapeHtml(e.source_name)}</td><td><b>${escapeHtml(e.label)}</b><small class="table-subtext">${escapeHtml(x.description||x.visible_evidence||'Visual finding')}</small></td><td><small class="table-subtext">${escapeHtml(x.why_it_matters||'Requires human review')}</small></td><td>${escapeHtml(x.confidence||'—')}</td><td><span class="table-badge">Requires review</span></td></tr>`;}).join(''):'<tr><td colspan="6" class="table-empty">No AI observations saved yet. Run an automated video review first.</td></tr>';}
  catch(e){toast(e.message,true);}
}
$('refresh-events').addEventListener('click',loadEvents);
boot();
