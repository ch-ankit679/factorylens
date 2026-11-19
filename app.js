(() => {
  'use strict';

  const DATA = window.FACTORYLENS_DEMO_DATA;
  if (!DATA) {
    document.body.innerHTML = '<main style="padding:30px;color:#fff;background:#101820;font-family:Arial">FactoryLens demo data could not be loaded. Check assets/data/demo-data.js.</main>';
    return;
  }
  const $ = (id) => document.getElementById(id);
  const mainEvents = DATA.inspection.events || [];
  const models = DATA.models || [];
  let activeMainEventId = mainEvents[0]?.id || null;
  let expandedMainEventId = null;
  let activeModelId = models[0]?.model_id || null;
  let activeModelEventId = null;
  let activeScoreModelId = DATA.comparison.ranked_model_ids[0];
  let hasCustomUpload = false;
  let currentObjectUrl = null;
  let compareSequenceActive = false;
  let compareSequenceIndex = 0;
  let compareSequenceIds = [];
  let modelComparisonLoading = false;
  let modelComparisonLoaded = false;
  let modelComparisonTimers = [];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const formatTime = (seconds) => {
    const value = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(value / 60);
    const secondsPart = Math.floor(value % 60);
    return `${String(minutes).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}`;
  };
  const modelById = (id) => models.find((item) => item.model_id === id);
  const scoreById = (id) => DATA.comparison.scores[id];

  let toastTimer = null;
  function toast(message, error = false) {
    const node = $('toast');
    node.textContent = message;
    node.className = `toast show${error ? ' error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.className = 'toast'; }, 3800);
  }

  function setPage(page) {
    document.querySelectorAll('.page').forEach((node) => node.classList.toggle('active', node.id === `page-${page}`));
    document.querySelectorAll('.nav-item[data-page]').forEach((node) => node.classList.toggle('active', node.dataset.page === page));
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'events') renderEventHistory();
  }

  function setSidebarOpen(open) {
    const shell = document.querySelector('.app-shell');
    const toggle = $('sidebar-toggle');
    const backdrop = $('sidebar-backdrop');
    shell.classList.toggle('sidebar-open', Boolean(open));
    toggle.setAttribute('aria-expanded', String(Boolean(open)));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    backdrop.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('navigation-open', Boolean(open));
  }

  $('sidebar-toggle').addEventListener('click', () => {
    setSidebarOpen($('sidebar-toggle').getAttribute('aria-expanded') !== 'true');
  });
  $('sidebar-backdrop').addEventListener('click', () => setSidebarOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setSidebarOpen(false);
  });
  $('workspace-sidebar').querySelector('.brand-lockup').addEventListener('click', (event) => {
    event.preventDefault();
    setPage('video');
  });

  document.querySelectorAll('.nav-item[data-page], button[data-page]').forEach((button) => {
    button.addEventListener('click', () => setPage(button.dataset.page));
  });
  document.querySelectorAll('[data-scroll]').forEach((button) => {
    button.addEventListener('click', async () => {
      setSidebarOpen(false);
      if (button.dataset.scroll === 'comparison-section' && $('comparison-section').classList.contains('hidden')) {
        openComparison();
        return;
      }
      if (button.dataset.scroll === 'heatmap-section') {
        if ($('inspection-results').classList.contains('hidden')) {
          toast('Run the saved inspection replay to open its activity heatmaps.', true);
          return;
        }
        $('heatmap-section').open = true;
      }
      document.getElementById(button.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  function loadSourceVideo() {
    const player = $('source-player');
    player.src = DATA.source_video.url;
    player.poster = DATA.source_video.poster;
    player.load();
    $('selected-source').textContent = `${DATA.source_video.filename} · ${DATA.source_video.duration_seconds.toFixed(2)} seconds`;
    $('source-status').textContent = 'READY';
  }

  $('sample-select').addEventListener('change', () => {
    hasCustomUpload = false;
    $('video-file').value = '';
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    loadSourceVideo();
  });

  $('video-file').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    hasCustomUpload = true;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(file);
    const player = $('source-player');
    player.src = currentObjectUrl;
    player.poster = '';
    player.load();
    $('selected-source').textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`;
    $('source-status').textContent = 'PREVIEW ONLY';
    $('source-foot-message').textContent = 'Custom video loaded for browser preview. Saved AI results only match the included factory clip.';
  });

  function observationContentMarkup(event) {
    const selected = event.id === activeMainEventId;
    return `<div class="event-observation-content${selected ? ' active' : ''}" data-observation-card="${escapeHtml(event.id)}">
      <div class="eyebrow observation-eyebrow">WHAT WAS OBSERVED · AI OBSERVATION</div>
      <div class="observation-card-top"><span>${escapeHtml(event.issue_type)}</span><span class="severity-pill ${escapeHtml(event.severity)}">${escapeHtml(event.severity)} priority</span></div>
      <h4>${escapeHtml(event.title)}</h4>
      <div class="selected-playing">▶ SELECTED EVENT · PLAYING IN VIDEO</div>
      <div class="observation-block"><b>What is visible</b><p>${escapeHtml(event.visible_evidence)}</p></div>
      <div class="observation-block"><b>Why it may matter</b><p>${escapeHtml(event.why_it_matters)}</p></div>
      <div class="observation-action"><b>Suggested follow-up</b><p>${escapeHtml(event.recommended_follow_up)}</p></div>
      <div class="observation-meta"><span>${escapeHtml(event.confidence)} model confidence</span><span>AI-generated observation</span></div>
      <div class="observation-footnote">This is a visible-video observation, not a confirmed fault, diagnosis or compliance determination.</div>
    </div>`;
  }

  function eventTimelineMarkup(event) {
    const selected = event.id === activeMainEventId;
    const expanded = event.id === expandedMainEventId;
    const endLabel = `${formatTime(event.context_start)}–${formatTime(event.context_end)}`;
    return `<article class="event-accordion${expanded ? ' expanded' : ''}" data-event-accordion="${escapeHtml(event.id)}">
      <button type="button" class="event-timeline-item severity-${escapeHtml(event.severity)}${selected ? ' active' : ''}" data-main-event="${escapeHtml(event.id)}" aria-expanded="${expanded}" aria-controls="event-observation-${escapeHtml(event.id)}" title="Review ${endLabel} context">
        <span class="event-time">${escapeHtml(event.timestamp_label)}</span>
        <span class="event-timeline-copy"><b>${escapeHtml(event.title)}</b><small>${escapeHtml(event.issue_type)} · ${endLabel}</small></span>
        <span class="event-severity-dot"></span>
        <span class="event-expand-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="event-observation-panel${expanded ? '' : ' hidden'}" id="event-observation-${escapeHtml(event.id)}">${observationContentMarkup(event)}</div>
    </article>`;
  }

  function updateMainEventAccordionUI() {
    $('event-timeline').querySelectorAll('[data-event-accordion]').forEach((item) => {
      const id = item.dataset.eventAccordion;
      const expanded = id === expandedMainEventId;
      const button = item.querySelector('[data-main-event]');
      const panel = item.querySelector('.event-observation-panel');
      const observation = item.querySelector('[data-observation-card]');
      item.classList.toggle('expanded', expanded);
      button.setAttribute('aria-expanded', String(expanded));
      button.classList.toggle('active', id === activeMainEventId);
      panel.classList.toggle('hidden', !expanded);
      observation.classList.toggle('active', id === activeMainEventId);
    });
  }

  function renderMainEvents() {
    $('event-count-label').textContent = `${mainEvents.length} events`;
    $('event-timeline').innerHTML = mainEvents.map(eventTimelineMarkup).join('');
    $('event-timeline').querySelectorAll('[data-main-event]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.mainEvent;
        expandedMainEventId = expandedMainEventId === id ? null : id;
        selectMainEvent(id, true, { expand: false });
        updateMainEventAccordionUI();
      });
    });
    updateMainEventAccordionUI();
    renderHeatmap();
  }

  function selectMainEvent(eventId, play, options = {}) {
    const event = mainEvents.find((item) => item.id === eventId);
    if (!event) return;
    activeMainEventId = event.id;
    if (options.expand !== false) expandedMainEventId = event.id;
    updateMainEventAccordionUI();
    $('active-main-caption').textContent = `${event.title} · ${formatTime(event.context_start)}–${formatTime(event.context_end)} CONTEXT`;
    const player = $('annotated-player');
    const seek = () => {
      player.currentTime = Math.min(Number(event.timestamp_seconds), Number.isFinite(player.duration) ? player.duration : Number(event.timestamp_seconds));
      if (play) player.play().catch(() => {});
    };
    if (player.readyState >= 1) seek();
    else player.addEventListener('loadedmetadata', seek, { once: true });
  }

  function renderHeatmap() {
    const trackNodes = DATA.inspection.heatmap.tracks.map((track) => {
      const cells = Array.from({ length: 25 }, (_, index) => {
        const active = track.times.includes(index);
        return `<button type="button" class="heat-cell${active ? ' active' : ''}" data-heat-time="${index}" aria-label="Jump to ${formatTime(index)}" title="${track.label} · ${formatTime(index)}"> </button>`;
      }).join('');
      return `<div class="heatmap-track"><div class="heatmap-track-label">${escapeHtml(track.label)}</div><div class="heatmap-cells">${cells}</div></div>`;
    }).join('');
    $('temporal-heatmap').innerHTML = `<div class="heatmap-ruler"><span></span><div class="ruler-labels"><span>0s</span><span>5s</span><span>10s</span><span>15s</span><span>20s</span><span>25s</span></div></div>${trackNodes}`;
    const heatmap = $('spatial-heatmap');
    heatmap.querySelectorAll('.spatial-dot').forEach((node) => node.remove());
    DATA.inspection.heatmap.spatial_points.forEach((point, index) => {
      const dot = document.createElement('span');
      dot.className = 'spatial-dot';
      dot.style.left = `${point.x * 100}%`;
      dot.style.top = `${point.y * 100}%`;
      dot.title = `Matched YOLO subject ${index + 1} · approximate plotted location`;
      heatmap.appendChild(dot);
    });
    $('spatial-heatmap-note').textContent = DATA.inspection.heatmap.spatial_note;
    $('temporal-heatmap').querySelectorAll('[data-heat-time]').forEach((button) => {
      button.addEventListener('click', () => {
        const time = Number(button.dataset.heatTime);
        const matching = mainEvents.find((event) => time >= event.context_start && time <= event.context_end);
        if (matching) selectMainEvent(matching.id, true);
        else {
          const player = $('annotated-player');
          player.currentTime = Math.min(time, player.duration || time);
          player.play().catch(() => {});
        }
      });
    });
  }

  function finishInspection() {
    $('analysis-progress-wrap').classList.add('hidden');
    $('inspection-results').classList.remove('hidden');
    $('source-status').textContent = 'COMPLETED';
    $('source-foot-message').textContent = 'Inspection replay completed. Six timestamped observations are ready for review.';
    $('analysis-summary').textContent = DATA.inspection.analysis_summary;
    const player = $('annotated-player');
    player.src = DATA.inspection.output_url;
    player.poster = DATA.inspection.poster;
    player.load();
    renderMainEvents();
    $('result-metrics').innerHTML = [
      ['Clip reviewed', `${DATA.inspection.duration_seconds}s`],
      ['AI issue findings', DATA.inspection.event_count],
      ['Findings linked to YOLO', `${DATA.inspection.heatmap.matched_findings}/${DATA.inspection.heatmap.total_findings}`]
    ].map(([label, value]) => `<div class="result-metric"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`).join('');
    selectMainEvent(activeMainEventId, false, { expand: false });
    $('inspection-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Recorded inspection results are ready.');
    renderEventHistory();
  }

  $('analyse-video-btn').addEventListener('click', () => {
    if (hasCustomUpload) {
      toast('This Pages build can preview new uploads, but the saved AI results are tied to the included factory video.', true);
      return;
    }
    modelComparisonTimers.forEach((timer) => clearTimeout(timer));
    modelComparisonTimers = [];
    modelComparisonLoading = false;
    modelComparisonLoaded = false;
    $('model-compare-progress').classList.add('hidden');
    $('model-compare-progress-bar').style.width = '0%';
    $('model-compare-progress-percent').textContent = '0%';
    $('model-compare-progress-label').textContent = 'Comparing selected models…';
    $('open-comparison').disabled = false;
    $('open-comparison').innerHTML = 'Compare selected AI reviewers <span>→</span>';
    renderCompareModelChoices();
    const button = $('analyse-video-btn');
    button.disabled = true;
    $('analysis-progress-wrap').classList.remove('hidden');
    $('inspection-results').classList.add('hidden');
    $('comparison-section').classList.add('hidden');
    $('source-status').textContent = 'ANALYSING';
    $('source-foot-message').textContent = 'Replaying the saved FactoryLens inspection result.';
    const steps = [
      [12, 'Preparing source video…'],
      [34, 'Sampling video frames and organising YOLO subject context…'],
      [63, 'Reviewing AI observations and matching evidence windows…'],
      [86, 'Compiling timestamped findings and heatmaps…'],
      [100, 'Inspection complete.']
    ];
    let index = 0;
    $('progress-bar').style.width = '0%';
    $('progress-percent').textContent = '0%';
    $('progress-label').textContent = 'Starting recorded inspection…';
    const advance = () => {
      const [percent, label] = steps[index];
      $('progress-bar').style.width = `${percent}%`;
      $('progress-percent').textContent = `${percent}%`;
      $('progress-label').textContent = label;
      index += 1;
      if (index < steps.length) setTimeout(advance, 680);
      else setTimeout(() => {
        button.disabled = false;
        finishInspection();
      }, 450);
    };
    setTimeout(advance, 280);
  });

  function subjectLinkMarkup(link) {
    const unmatched = link.status !== 'linked';
    const detail = link.detail || (link.confidence != null ? `${link.class} · ${Number(link.confidence).toFixed(1)}% detector confidence` : 'No matching YOLO subject was found at the finding timestamp.');
    return `<div class="subject-link-box${unmatched ? ' unmatched' : ''}"><b>${escapeHtml(link.label || (unmatched ? 'NO YOLO BOX ASSIGNED' : 'YOLO SUBJECT LINKED'))}</b><span>${escapeHtml(detail)}</span></div>`;
  }

  function modelObservationMarkup(event) {
    const selected = event.id === activeModelEventId;
    const correlation = event.corroboration || {};
    return `<article class="model-finding-card${selected ? ' active' : ''}" data-model-observation="${escapeHtml(event.id)}">
      <div class="model-finding-head"><button type="button" class="model-finding-time" data-model-seek="${escapeHtml(event.id)}">${escapeHtml(event.timestamp_label)} ▸</button><span class="model-finding-title">${escapeHtml(event.title)}</span><span class="model-severity">${escapeHtml(event.severity)}</span></div>
      <p class="model-finding-description">${escapeHtml(event.visible_evidence)}</p>
      ${subjectLinkMarkup(event.subject_link || { status: 'unmatched', label: 'NO YOLO BOX ASSIGNED', detail: 'No matching YOLO subject was recorded.' })}
      <div class="model-corroboration${correlation.status === 'corroborated' ? '' : ' not'}">Cross-model agreement <strong>${escapeHtml(correlation.label || 'Not corroborated')}</strong>${correlation.also_reported_by ? `<span> · Also reported by ${escapeHtml(correlation.also_reported_by)}</span>` : ''}</div>
      <button type="button" class="inspect-evidence-link" data-model-seek="${escapeHtml(event.id)}">Inspect video evidence →</button>
    </article>`;
  }

  function modelEventCardMarkup(event) {
    const selected = event.id === activeModelEventId;
    return `<button type="button" class="model-event-card${selected ? ' active' : ''}" data-model-card="${escapeHtml(event.id)}">
      <span class="model-event-time">${escapeHtml(event.timestamp_label)}</span><b>${escapeHtml(event.title)}</b><small>${escapeHtml(event.issue_type)}</small>
    </button>`;
  }

  function selectModelEvent(eventId, play = true) {
    const model = modelById(activeModelId);
    const event = model?.observations.find((item) => item.id === eventId);
    if (!event) return;
    activeModelEventId = event.id;
    $('active-model-caption').textContent = `${event.title} · ${formatTime(event.context_start)}–${formatTime(event.context_end)} CONTEXT`;
    $('model-event-cards').querySelectorAll('[data-model-card]').forEach((node) => node.classList.toggle('active', node.dataset.modelCard === event.id));
    $('active-model-observations').querySelectorAll('[data-model-observation]').forEach((node) => node.classList.toggle('active', node.dataset.modelObservation === event.id));
    const player = $('model-review-player');
    const seek = () => {
      player.currentTime = Math.min(Number(event.timestamp_seconds), Number.isFinite(player.duration) ? player.duration : Number(event.timestamp_seconds));
      if (play) player.play().catch(() => {});
    };
    if (player.readyState >= 1) seek();
    else player.addEventListener('loadedmetadata', seek, { once: true });
  }

  let autoplayAfterMetadata = false;
  function selectModel(modelId, options = {}) {
    const model = modelById(modelId);
    if (!model) return;
    if (!options.fromSequence && compareSequenceActive) {
      compareSequenceActive = false;
      $('play-all-model-reviews').textContent = '▶ Play all model videos';
    }
    activeModelId = modelId;
    activeModelEventId = model.observations[0]?.id || null;
    $('model-tabs').querySelectorAll('[data-model-tab]').forEach((button) => button.classList.toggle('active', button.dataset.modelTab === modelId));
    $('active-model-name').textContent = model.name;
    $('active-model-provider').textContent = `${model.provider_name} · Review complete`;
    $('active-model-summary').textContent = model.summary;
    $('active-model-observations').innerHTML = model.observations.map(modelObservationMarkup).join('');
    $('model-event-cards').innerHTML = model.observations.map(modelEventCardMarkup).join('');
    $('active-model-observations').querySelectorAll('[data-model-seek]').forEach((button) => button.addEventListener('click', () => selectModelEvent(button.dataset.modelSeek, true)));
    $('model-event-cards').querySelectorAll('[data-model-card]').forEach((button) => button.addEventListener('click', () => selectModelEvent(button.dataset.modelCard, true)));
    const player = $('model-review-player');
    $('model-playback-message').classList.add('hidden');
    const needsSourceChange = player.dataset.currentModel !== modelId;
    player.onloadedmetadata = () => {
      if (autoplayAfterMetadata) {
        autoplayAfterMetadata = false;
        player.currentTime = 0;
        player.play().catch(() => {
          $('model-playback-message').textContent = 'The selected model video is ready. Press Play on the video to start playback.';
          $('model-playback-message').classList.remove('hidden');
        });
      }
    };
    if (needsSourceChange) {
      player.pause();
      player.dataset.currentModel = modelId;
      autoplayAfterMetadata = Boolean(options.autoplay);
      player.src = model.video_url;
      player.poster = model.poster;
      player.load();
    } else if (options.reset !== false) {
      player.currentTime = 0;
      if (options.autoplay) player.play().catch(() => {});
    }
    if (model.observations.length) {
      $('active-model-caption').textContent = `${model.observations[0].title} · ${formatTime(model.observations[0].context_start)}–${formatTime(model.observations[0].context_end)} CONTEXT`;
    }
  }

  function renderModelTabs() {
    $('model-tabs').innerHTML = models.map((model) => `<button type="button" class="model-tab${model.model_id === activeModelId ? ' active' : ''}" data-model-tab="${escapeHtml(model.model_id)}">
      <span class="model-status-dot"></span><span class="model-tab-copy"><b>${escapeHtml(model.name)}</b><small>${model.findings_count} findings detected</small></span><span class="model-tab-arrow">›</span>
    </button>`).join('');
    $('model-tabs').querySelectorAll('[data-model-tab]').forEach((button) => button.addEventListener('click', () => selectModel(button.dataset.modelTab, { reset: true })));
  }

  function scoreValueCell(modelId, key) {
    const score = scoreById(modelId);
    const value = score[key];
    if (key === 'overall') return `${score.score.toFixed(1)} / 100`;
    if (key === 'findings') return `${score.findings_reported} findings`;
    if (key === 'yolo' || key === 'corroboration' || key === 'structure') return `${value.numerator}/${value.denominator} · ${value.percent.toFixed(1)}%`;
    if (key === 'speed') return `${value.latency_seconds.toFixed(2)}s`;
    if (key === 'tokens') return `${value.total.toLocaleString('en-US')} total`;
    if (key === 'cost') return `$${value.usd.toFixed(6)}`;
    return '—';
  }

  function renderScoreTable() {
    const ids = DATA.comparison.ranked_model_ids;
    const headers = ids.map((id) => `<th class="${id === activeScoreModelId ? 'active-score-col' : ''}"><button type="button" class="score-model-heading" data-score-heading="${escapeHtml(id)}">${escapeHtml(modelById(id).name)}</button></th>`).join('');
    const rows = [
      ['overall', 'Overall comparative score'],
      ['findings', 'Findings reported'],
      ['yolo', 'YOLO subject alignment'],
      ['corroboration', 'Cross-model corroboration'],
      ['structure', 'Structured output completeness'],
      ['speed', 'Response latency'],
      ['tokens', 'Token usage'],
      ['cost', 'Provider-reported cost']
    ];
    $('score-table').innerHTML = `<thead><tr><th>Measured criterion</th>${headers}</tr></thead><tbody>${rows.map(([key, label]) => `<tr><td><button type="button" class="score-criterion-label" data-score-criterion-label="${key}">${escapeHtml(label)}</button></td>${ids.map((id) => `<td class="${id === activeScoreModelId ? 'active-score-col' : ''}"><button type="button" class="score-evidence-trigger" data-score-proof-model="${escapeHtml(id)}" data-score-proof-criterion="${key}" aria-label="Show ${escapeHtml(label)} evidence for ${escapeHtml(modelById(id).name)}">${escapeHtml(scoreValueCell(id, key))}</button></td>`).join('')}</tr>`).join('')}</tbody>`;
    $('score-table').querySelectorAll('[data-score-heading]').forEach((button) => button.addEventListener('click', () => renderScoreEvidence(button.dataset.scoreHeading, 'overall')));
    $('score-table').querySelectorAll('[data-score-proof-model]').forEach((button) => button.addEventListener('click', () => renderScoreEvidence(button.dataset.scoreProofModel, button.dataset.scoreProofCriterion)));
    $('score-table').querySelectorAll('[data-score-criterion-label]').forEach((button) => button.addEventListener('click', () => renderScoreEvidence(activeScoreModelId, button.dataset.scoreCriterionLabel)));
  }

  function proofFindingRow(modelId, event, status, detail) {
    return `<div class="score-proof-finding">
      <div class="score-proof-finding-main"><span class="score-proof-time">${escapeHtml(event.timestamp_label)}</span><div><b>${escapeHtml(event.title)}</b><small>${escapeHtml(event.issue_type)} · ${escapeHtml(event.severity)} priority</small><p>${escapeHtml(event.visible_evidence)}</p></div></div>
      <div class="score-proof-finding-status">${escapeHtml(status)}<small>${escapeHtml(detail)}</small></div>
      <button type="button" class="score-proof-open" data-proof-model="${escapeHtml(modelId)}" data-proof-event="${escapeHtml(event.id)}">Review finding in annotated video →</button>
    </div>`;
  }

  function renderScoreEvidence(modelId, criterionKey) {
    const score = scoreById(modelId);
    const model = modelById(modelId);
    if (!score || !model) return;
    activeScoreModelId = modelId;
    $('scorecard-rankings').querySelectorAll('[data-score-model]').forEach((button) => button.classList.toggle('active', button.dataset.scoreModel === modelId));
    renderScoreTable();

    const weights = DATA.comparison.weights;
    const criterion = weights.find((item) => item.key === criterionKey);
    const labelMap = {
      overall: 'Overall comparative score', findings: 'Findings reported',
      yolo: 'YOLO subject alignment', corroboration: 'Cross-model corroboration',
      structure: 'Structured output completeness', speed: 'Response latency',
      tokens: 'Token usage', cost: 'Provider-reported cost'
    };
    const label = labelMap[criterionKey] || criterion?.label || 'Score evidence';
    const observations = model.observations || [];
    const peerScores = DATA.comparison.ranked_model_ids.map((id) => ({ model: modelById(id), score: scoreById(id) }));
    let summary = '';
    let evidence = '';

    if (criterionKey === 'overall') {
      const componentRows = weights.map((item) => {
        const metric = score[item.key];
        return `<div class="score-evidence-component"><div><b>${escapeHtml(item.label)}</b><span>${Number(metric.points).toFixed(1)} / ${item.weight} pts</span></div><div class="score-bar"><i style="width:${Math.max(0, Math.min(100, Number(metric.percent)))}%"></i></div><small>${Number(metric.percent).toFixed(1)}% measured value × ${item.weight}% weight · ${escapeHtml(item.description)}</small></div>`;
      }).join('');
      summary = `The recorded total is ${score.score.toFixed(1)} / 100, calculated by adding the weighted points from each enabled criterion. ${score.rank} is a relative rank within this recorded run, not a ground-truth accuracy label.`;
      evidence = `<div class="score-evidence-components">${componentRows}</div><div class="score-proof-callout">Calculation: ${weights.map((item) => `${Number(score[item.key].points).toFixed(1)}`).join(' + ')} = <b>${score.score.toFixed(1)} points</b>. The individual criterion cells below can be opened to inspect their underlying records.</div>`;
    } else if (criterionKey === 'findings') {
      summary = `The report contains ${score.findings_reported} structured observation record(s) for ${model.name}. The count is the number of entries in this model's saved observations array.`;
      evidence = `<div class="score-proof-list">${observations.map((event) => proofFindingRow(modelId, event, 'REPORTED FINDING', `${event.timestamp_label} · record ${event.id}`)).join('')}</div>`;
    } else if (criterionKey === 'yolo') {
      const eligible = observations.filter((event) => event.subject_link?.status !== 'not_applicable');
      const excluded = observations.filter((event) => event.subject_link?.status === 'not_applicable');
      summary = `${score.yolo.numerator} of ${score.yolo.denominator} eligible subject-related findings were linked to a matching YOLO subject (${score.yolo.percent.toFixed(1)}%). Findings marked not applicable are excluded because their condition is not an object class recognised by the current detector.`;
      evidence = `<div class="score-proof-list">${eligible.map((event) => {
        const linked = event.subject_link?.status === 'linked';
        return proofFindingRow(modelId, event, linked ? 'YOLO LINKED' : 'NO MATCH', event.subject_link?.detail || event.subject_link?.label || 'No matching subject was recorded.');
      }).join('')}${excluded.map((event) => proofFindingRow(modelId, event, 'EXCLUDED · NOT APPLICABLE', event.subject_link?.detail || 'Not an eligible object-class subject for YOLO matching.')).join('')}</div>`;
    } else if (criterionKey === 'corroboration') {
      summary = `${score.corroboration.numerator} of ${score.corroboration.denominator} reported findings were also reported by another selected model within the configured time tolerance (${score.corroboration.percent.toFixed(1)}%). Agreement indicates consistency, not truth.`;
      evidence = `<div class="score-proof-list">${observations.map((event) => {
        const corroborated = event.corroboration?.status === 'corroborated';
        const partner = event.corroboration?.also_reported_by ? `Also reported by ${event.corroboration.also_reported_by}.` : (event.corroboration?.label || 'No matching report recorded.');
        return proofFindingRow(modelId, event, corroborated ? 'CORROBORATED' : 'NOT CORROBORATED', partner);
      }).join('')}</div>`;
    } else if (criterionKey === 'structure') {
      const checks = observations.map((event) => ({
        event,
        title: Boolean(event.title && event.title.trim()),
        category: Boolean(event.issue_type && event.issue_type.trim()),
        timestamp: Number.isFinite(Number(event.timestamp_seconds)) && Boolean(event.timestamp_label)
      }));
      summary = `${score.structure.numerator} of ${score.structure.denominator} findings passed the saved structured-output checks for a non-empty title, issue category and timestamp (${score.structure.percent.toFixed(1)}%).`;
      evidence = `<div class="score-proof-list">${checks.map(({event,title,category,timestamp}) => proofFindingRow(modelId, event, title && category && timestamp ? 'COMPLETE' : 'INCOMPLETE', `Title ${title ? '✓' : '✕'} · Issue category ${category ? '✓' : '✕'} · Timestamp ${timestamp ? '✓' : '✕'}`)).join('')}</div>`;
    } else if (criterionKey === 'speed') {
      const fastest = Math.min(...peerScores.map((item) => Number(item.score.speed.latency_seconds)));
      summary = `The recorded response latency was ${score.speed.latency_seconds.toFixed(2)} seconds. The fastest completed model in this comparison (${fastest.toFixed(2)} seconds) receives the full response-speed score; other models are scaled relative to that run.`;
      evidence = `<div class="score-proof-metrics">${peerScores.map((item) => `<div><b>${escapeHtml(item.model.name)}</b><span>${item.score.speed.latency_seconds.toFixed(2)} s</span><small>${item.score.speed.percent.toFixed(1)}% normalized · ${item.score.speed.points.toFixed(1)} weighted points</small></div>`).join('')}</div><div class="score-proof-callout">Selected model: <b>${score.speed.latency_seconds.toFixed(2)} seconds</b> · ${score.speed.percent.toFixed(1)}% normalized · ${score.speed.points.toFixed(1)} weighted points (${criterion?.weight ?? 12}% weight).</div>`;
    } else if (criterionKey === 'tokens') {
      const minimum = Math.min(...peerScores.map((item) => Number(item.score.tokens.total)));
      summary = `The recorded usage was ${score.tokens.total.toLocaleString('en-US')} tokens (${score.tokens.input.toLocaleString('en-US')} input + ${score.tokens.output.toLocaleString('en-US')} output). The lowest total token count in this run (${minimum.toLocaleString('en-US')}) receives the full token-efficiency score.`;
      evidence = `<div class="score-proof-metrics">${peerScores.map((item) => `<div><b>${escapeHtml(item.model.name)}</b><span>${item.score.tokens.total.toLocaleString('en-US')} tokens</span><small>${item.score.tokens.input.toLocaleString('en-US')} input + ${item.score.tokens.output.toLocaleString('en-US')} output · ${item.score.tokens.percent.toFixed(1)}% normalized</small></div>`).join('')}</div><div class="score-proof-callout">Selected model: <b>${score.tokens.total.toLocaleString('en-US')} tokens</b> · ${score.tokens.percent.toFixed(1)}% normalized · ${score.tokens.points.toFixed(1)} weighted points (${criterion?.weight ?? 8}% weight).</div>`;
    } else if (criterionKey === 'cost') {
      const allCosts = peerScores.map((item) => item.score.cost.usd);
      const equal = allCosts.every((value) => Number(value) === Number(allCosts[0]));
      summary = `The supplied comparison report records ${`$${score.cost.usd.toFixed(6)} USD`} for this model. ${equal ? 'All three models have the same recorded cost value, so this criterion does not distinguish their relative ranking in this saved run.' : 'The scores are normalized against the costs recorded for the other selected models.'}`;
      evidence = `<div class="score-proof-metrics">${peerScores.map((item) => `<div><b>${escapeHtml(item.model.name)}</b><span>$${item.score.cost.usd.toFixed(6)} USD</span><small>${item.score.cost.percent.toFixed(1)}% normalized · ${item.score.cost.points.toFixed(1)} weighted points</small></div>`).join('')}</div><div class="score-proof-callout">Cost values are reproduced from the bundled comparison JSON. The static repository does not include raw provider billing receipts or API usage logs to independently verify these amounts.</div>`;
    }

    $('score-detail-panel').innerHTML = `<div class="score-detail-head"><div><b>${escapeHtml(label)} · ${escapeHtml(model.name)}</b><small>${escapeHtml(score.rank)} relative rank</small></div><span>${criterionKey === 'overall' ? `${score.score.toFixed(1)} / 100` : escapeHtml(scoreValueCell(modelId, criterionKey))}</span></div>
      <p class="score-evidence-summary">${escapeHtml(summary)}</p>${evidence}
      <div class="score-evidence-source-note">Evidence basis: bundled model observation records and the saved comparison report. Timestamp links open the corresponding recorded annotated model video. Raw provider request/response logs are not included in this GitHub Pages demo.</div>`;
  }

  function renderScorecard() {
    const ids = DATA.comparison.ranked_model_ids;
    $('scorecard-rankings').innerHTML = ids.map((id) => {
      const model = modelById(id), score = scoreById(id);
      const tone = score.rank === 'BEST' ? 'best' : score.rank === 'BETTER' ? 'better' : 'good';
      return `<button type="button" class="rank-card ${tone}${id === activeScoreModelId ? ' active' : ''}" data-score-model="${escapeHtml(id)}">
        <span class="rank-text"><span class="rank-label">${escapeHtml(score.rank)}</span><b>${escapeHtml(model.name)}</b><small>YOLO linked ${score.yolo.numerator} of ${score.yolo.denominator} eligible AI subjects (${score.yolo.percent.toFixed(1)}%).</small></span>
        <span class="rank-score">${score.score.toFixed(1)}<small> /100</small></span>
      </button>`;
    }).join('');
    $('scorecard-rankings').querySelectorAll('[data-score-model]').forEach((button) => button.addEventListener('click', () => renderScoreEvidence(button.dataset.scoreModel, 'overall')));
    $('score-method-note').textContent = `How ranking is calculated: YOLO subject alignment 35%, cross-model corroboration 25%, structured output completeness 12%, response speed 12%, token efficiency 8%, and provider-reported cost efficiency 8% only when actual cost is available for every completed model. If a criterion is unavailable for any completed model, it is excluded for all and the remaining weights are rebalanced. Cost values reproduce the bundled run report. The score is a relative run comparison, not ground-truth accuracy.`;
    renderScoreTable();
    renderScoreEvidence(activeScoreModelId, 'overall');
  }

  function renderTechnicalRows() {
    $('technical-model-list').innerHTML = DATA.comparison.ranked_model_ids.map((id) => {
      const model = modelById(id), score = scoreById(id);
      return `<div class="technical-model-row"><b>${escapeHtml(model.name)}</b><span>${score.speed.latency_seconds.toFixed(2)}s · ${score.tokens.input} input · ${score.tokens.output} output · $${score.cost.usd.toFixed(6)}</span></div>`;
    }).join('');
  }

  function renderAgreement() {
    $('agreement-chips').innerHTML = DATA.comparison.shared_findings.map((item) => `<span class="agreement-chip">${escapeHtml(item.label)} · ${formatTime(item.timestamp_seconds)}</span>`).join('');
  }

  function renderCompareModelChoices() {
    $('compare-model-options').innerHTML = models.map((model) => `<div class="compare-model-option" data-compare-option="${escapeHtml(model.model_id)}">
      <span class="compare-option-check" aria-hidden="true">✓</span>
      <span class="compare-option-copy"><b>${escapeHtml(model.name)}</b><small>${escapeHtml(model.provider_name)} · Text + image frames</small></span>
      <span class="compare-option-meta"><b>FREE</b><small data-compare-option-state>SELECTED</small></span>
    </div>`).join('');
  }

  function setCompareProgress(percent, message, activeModelIndex = -1) {
    $('model-compare-progress').classList.remove('hidden');
    $('model-compare-progress-label').textContent = message;
    $('model-compare-progress-percent').textContent = `${percent}%`;
    $('model-compare-progress-bar').style.width = `${percent}%`;
    $('compare-model-options').querySelectorAll('[data-compare-option]').forEach((card, index) => {
      const state = card.querySelector('[data-compare-option-state]');
      card.classList.toggle('processing', index === activeModelIndex);
      card.classList.toggle('complete', activeModelIndex >= 0 && index < activeModelIndex);
      if (percent === 100) {
        card.classList.remove('processing');
        card.classList.add('complete');
        state.textContent = 'READY';
      } else if (index === activeModelIndex) {
        state.textContent = 'LOADING';
      } else if (activeModelIndex >= 0 && index < activeModelIndex) {
        state.textContent = 'READY';
      } else {
        state.textContent = 'SELECTED';
      }
    });
  }

  function showComparisonResults() {
    $('comparison-section').classList.remove('hidden');
    renderModelTabs();
    renderScorecard();
    renderTechnicalRows();
    renderAgreement();
    selectModel(activeModelId, { reset: false });
    $('comparison-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openComparison() {
    if ($('inspection-results').classList.contains('hidden')) {
      toast('Complete the recorded inspection replay before opening model comparison.', true);
      return;
    }
    if (modelComparisonLoaded) {
      showComparisonResults();
      return;
    }
    if (modelComparisonLoading) return;

    modelComparisonLoading = true;
    $('model-comparison-launcher').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('open-comparison').disabled = true;
    $('open-comparison').textContent = 'Comparing selected models…';
    setCompareProgress(0, 'Comparing selected models…');

    // This is a timed loading replay for the saved outputs. No live model request is made.
    const progressStages = models.map((model, index) => ({
      percent: [37, 62, 100][index] ?? Math.round(((index + 1) / models.length) * 100),
      activeIndex: index,
      message: `Rendering ${model.name} annotated video (${index + 1}/${models.length})…`,
      delay: 1450
    }));
    let stageIndex = 0;
    const runNextStage = () => {
      if (stageIndex >= progressStages.length) {
        modelComparisonLoading = false;
        modelComparisonLoaded = true;
        $('open-comparison').disabled = false;
        $('open-comparison').innerHTML = 'Open visual model comparison <span>→</span>';
        setCompareProgress(100, 'All three saved model reviews are ready.');
        const timer = setTimeout(showComparisonResults, 500);
        modelComparisonTimers.push(timer);
        return;
      }
      const stage = progressStages[stageIndex];
      setCompareProgress(stage.percent, stage.message, stage.activeIndex);
      stageIndex += 1;
      const timer = setTimeout(runNextStage, stage.delay);
      modelComparisonTimers.push(timer);
    };
    const initialTimer = setTimeout(runNextStage, 650);
    modelComparisonTimers.push(initialTimer);
  }
  $('open-comparison').addEventListener('click', openComparison);

  function startModelSequence() {
    if (!models.length) return;
    compareSequenceIds = models.map((model) => model.model_id);
    compareSequenceIndex = 0;
    compareSequenceActive = true;
    $('play-all-model-reviews').textContent = 'Ⅱ Stop model sequence';
    selectModel(compareSequenceIds[0], { reset: true, autoplay: true, fromSequence: true });
  }

  $('score-detail-panel').addEventListener('click', (event) => {
    const button = event.target.closest('[data-proof-model][data-proof-event]');
    if (!button) return;
    const modelId = button.dataset.proofModel;
    const eventId = button.dataset.proofEvent;
    selectModel(modelId, { reset: false });
    $('comparison-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => selectModelEvent(eventId, true), 180);
  });

  $('play-all-model-reviews').addEventListener('click', () => {
    if (compareSequenceActive) {
      compareSequenceActive = false;
      $('model-review-player').pause();
      $('play-all-model-reviews').textContent = '▶ Play all model videos';
      return;
    }
    startModelSequence();
  });

  $('model-review-player').addEventListener('ended', () => {
    if (!compareSequenceActive) return;
    compareSequenceIndex += 1;
    if (compareSequenceIndex >= compareSequenceIds.length) {
      compareSequenceActive = false;
      $('play-all-model-reviews').textContent = '↻ Replay all model videos';
      return;
    }
    selectModel(compareSequenceIds[compareSequenceIndex], { reset: true, autoplay: true, fromSequence: true });
  });

  $('model-review-player').addEventListener('error', () => {
    if (!$('comparison-section').classList.contains('hidden')) {
      $('model-playback-message').textContent = 'This model video could not be loaded. The saved finding details remain available.';
      $('model-playback-message').classList.remove('hidden');
    }
    compareSequenceActive = false;
  });

  function renderEventHistory() {
    $('event-history-list').innerHTML = mainEvents.map((event) => `<div class="event-history-row"><span class="event-time">${escapeHtml(event.timestamp_label)}</span><div><b>${escapeHtml(event.title)}</b><small>${escapeHtml(event.issue_type)} · ${escapeHtml(event.severity)} priority</small></div><button class="btn btn-secondary" type="button" data-history-event="${escapeHtml(event.id)}">Review</button></div>`).join('');
    $('event-history-list').querySelectorAll('[data-history-event]').forEach((button) => {
      button.addEventListener('click', () => {
        setPage('video');
        if ($('inspection-results').classList.contains('hidden')) finishInspection();
        setTimeout(() => selectMainEvent(button.dataset.historyEvent, true), 120);
      });
    });
  }

  // Initialise the saved source clip. No backend/API key or server connection is used.
  loadSourceVideo();
  renderCompareModelChoices();
  $('active-main-caption').textContent = 'Select an event to inspect its evidence window.';
  renderEventHistory();
})();
