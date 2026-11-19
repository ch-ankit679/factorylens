(() => {
  'use strict';

  const DATA = window.FACTORYLENS_DEMO_DATA;
  if (!DATA) {
    document.body.innerHTML = '<main style="padding:30px;color:#fff;background:#101820;font-family:Arial">FactoryLens demo data could not be loaded. Check assets/data/demo-data.js.</main>';
    return;
  }
  const $ = (id) => document.getElementById(id);
  let CURRENT_DATA = DATA;
  const DATASETS = {
    'factory-materials': DATA,
    'factory-walkway': window.FACTORYLENS_SECOND_DEMO_DATA || null
  };
  let mainEvents = CURRENT_DATA.inspection.events || [];
  let models = CURRENT_DATA.models || [];
  let activeMainEventId = mainEvents[0]?.id || null;
  let expandedMainEventId = null;
  let activeModelId = models[0]?.model_id || null;
  let activeModelEventId = null;
  let expandedModelEventId = null;
  let activeScoreModelId = CURRENT_DATA.comparison.ranked_model_ids[0];
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
  const scoreById = (id) => CURRENT_DATA.comparison.scores[id];

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
    player.pause();
    player.src = CURRENT_DATA.source_video.url;
    player.poster = CURRENT_DATA.source_video.poster;
    player.load();
    $('selected-source').textContent = `${CURRENT_DATA.source_video.filename} · ${CURRENT_DATA.source_video.duration_seconds.toFixed(2)} seconds`;
    $('source-status').textContent = 'READY';
    $('source-foot-message').textContent = 'Waiting for a video inspection.';
  }

  function resetRecordedResults() {
    modelComparisonTimers.forEach((timer) => clearTimeout(timer));
    modelComparisonTimers = [];
    modelComparisonLoading = false;
    modelComparisonLoaded = false;
    compareSequenceActive = false;
    compareSequenceIndex = 0;
    compareSequenceIds = [];
    $('inspection-results').classList.add('hidden');
    $('comparison-section').classList.add('hidden');
    $('analysis-progress-wrap').classList.add('hidden');
    $('model-compare-progress').classList.add('hidden');
    $('model-compare-progress-bar').style.width = '0%';
    $('model-compare-progress-percent').textContent = '0%';
    $('model-compare-progress-label').textContent = 'Comparing selected models…';
    $('open-comparison').disabled = false;
    $('open-comparison').innerHTML = 'Compare selected AI reviewers <span>→</span>';
    $('analyse-video-btn').disabled = false;
    $('play-all-model-reviews').textContent = '▶ Play all model videos';
    $('annotated-player').pause();
    $('annotated-player').removeAttribute('src');
    $('annotated-player').load();
    $('model-review-player').pause();
    $('model-review-player').removeAttribute('src');
    $('model-review-player').removeAttribute('data-current-model');
    $('model-review-player').load();
    const dialog = $('score-evidence-dialog');
    if (dialog?.open) dialog.close();
  }

  function switchDataset(datasetId) {
    const next = DATASETS[datasetId];
    if (!next) {
      toast('The second recorded video data file could not be loaded.', true);
      return;
    }
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    hasCustomUpload = false;
    $('video-file').value = '';
    resetRecordedResults();
    CURRENT_DATA = next;
    mainEvents = CURRENT_DATA.inspection.events || [];
    models = CURRENT_DATA.models || [];
    activeMainEventId = mainEvents[0]?.id || null;
    expandedMainEventId = null;
    activeModelId = models[0]?.model_id || null;
    activeModelEventId = null;
    expandedModelEventId = null;
    activeScoreModelId = CURRENT_DATA.comparison.ranked_model_ids[0];
    loadSourceVideo();
    renderCompareModelChoices();
    renderEventHistory();
    $('sample-select').value = datasetId;
    $('active-main-caption').textContent = 'Select an event to inspect its evidence window.';
    $('active-model-caption').textContent = 'Select a finding to play its surrounding evidence window.';
    $('event-timeline').innerHTML = '';
    $('model-tabs').innerHTML = '';
    $('scorecard-rankings').innerHTML = '';
    $('score-table').innerHTML = '';
    $('agreement-chips').innerHTML = '';
    toast(`Loaded ${CURRENT_DATA.source_video.title}.`);
  }

  $('sample-select').addEventListener('change', () => switchDataset($('sample-select').value));

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
    const duration = Math.max(1, Math.ceil(CURRENT_DATA.inspection.heatmap.duration_seconds));
    const trackNodes = CURRENT_DATA.inspection.heatmap.tracks.map((track) => {
      const cells = Array.from({ length: duration }, (_, index) => {
        const active = track.times.includes(index);
        return `<button type="button" class="heat-cell${active ? ' active' : ''}" data-heat-time="${index}" aria-label="Jump to ${formatTime(index)}" title="${track.label} · ${formatTime(index)}"> </button>`;
      }).join('');
      return `<div class="heatmap-track"><div class="heatmap-track-label">${escapeHtml(track.label)}</div><div class="heatmap-cells">${cells}</div></div>`;
    }).join('');
    const rulerValues = [0, Math.round(duration * 0.25), Math.round(duration * 0.5), Math.round(duration * 0.75), duration];
    const ruler = [...new Set(rulerValues)].map((value) => `<span>${value}s</span>`).join('');
    $('temporal-heatmap').innerHTML = `<div class="heatmap-ruler"><span></span><div class="ruler-labels">${ruler}</div></div>${trackNodes}`;
    const heatmap = $('spatial-heatmap');
    heatmap.querySelectorAll('.spatial-dot').forEach((node) => node.remove());
    CURRENT_DATA.inspection.heatmap.spatial_points.forEach((point, index) => {
      const dot = document.createElement('span');
      dot.className = 'spatial-dot';
      dot.style.left = `${point.x * 100}%`;
      dot.style.top = `${point.y * 100}%`;
      dot.title = `Matched YOLO subject ${index + 1} · approximate plotted location`;
      heatmap.appendChild(dot);
    });
    $('spatial-heatmap-note').textContent = CURRENT_DATA.inspection.heatmap.spatial_note;
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
    $('source-foot-message').textContent = `Inspection completed. ${CURRENT_DATA.inspection.event_count} timestamped observations are ready for review.`;
    $('analysis-summary').textContent = CURRENT_DATA.inspection.analysis_summary;
    const player = $('annotated-player');
    player.src = CURRENT_DATA.inspection.output_url;
    player.poster = CURRENT_DATA.inspection.poster;
    player.load();
    renderMainEvents();
    $('result-metrics').innerHTML = [
      ['Clip reviewed', `${CURRENT_DATA.inspection.duration_seconds.toFixed(2)}s`],
      ['AI issue findings', CURRENT_DATA.inspection.event_count],
      ['Findings linked to YOLO', `${CURRENT_DATA.inspection.heatmap.matched_findings}/${CURRENT_DATA.inspection.heatmap.total_findings}`]
    ].map(([label, value]) => `<div class="result-metric"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`).join('');
    $('event-history-count').textContent = `${mainEvents.length} EVENTS`;
    $('heatmap-footnote').textContent = `${CURRENT_DATA.inspection.heatmap.matched_findings}/${CURRENT_DATA.inspection.heatmap.total_findings} AI findings linked to YOLO · ${CURRENT_DATA.inspection.heatmap.matched_subject_boxes} matched subject boxes. Plotted locations are approximate where noted; heat intensity is a visual summary, not a calibrated risk score.`;
    const datasetSlug = CURRENT_DATA.metadata.dataset_id || 'factory-materials';
    $('main-inspection-report-link').href = datasetSlug === 'factory-walkway' ? 'assets/data/walkway-inspection-report.json' : 'assets/data/inspection-report.json';
    $('main-inspection-report-link').download = `factorylens-${datasetSlug}-inspection-report.json`;
    $('main-annotated-download-link').href = CURRENT_DATA.inspection.output_url;
    $('comparison-report-link').href = datasetSlug === 'factory-walkway' ? 'assets/data/walkway-model-comparison-report.json' : 'assets/data/model-comparison-report.json';
    $('comparison-report-link').download = `factorylens-${datasetSlug}-model-comparison-report.json`;
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
    const expanded = event.id === expandedModelEventId;
    const correlation = event.corroboration || {};
    const endLabel = `${formatTime(event.context_start)}–${formatTime(event.context_end)}`;
    const subjectLink = event.subject_link || {
      status: 'unmatched',
      label: 'NO YOLO BOX ASSIGNED',
      detail: 'No matching YOLO subject was recorded.'
    };
    const corroborationClass = correlation.status === 'corroborated' ? '' : ' not';

    return `<article class="model-event-accordion${expanded ? ' expanded' : ''}${selected ? ' selected' : ''}" data-model-event-accordion="${escapeHtml(event.id)}">
      <button type="button" class="model-event-accordion-trigger${selected ? ' active' : ''}" data-model-event-toggle="${escapeHtml(event.id)}" aria-expanded="${expanded}" aria-controls="model-observation-${escapeHtml(event.id)}" title="Play and expand ${endLabel} event">
        <span class="model-event-time">${escapeHtml(event.timestamp_label)}</span>
        <span class="model-event-trigger-copy"><b>${escapeHtml(event.title)}</b><small>${escapeHtml(event.issue_type)} · ${endLabel} context</small></span>
        <span class="model-event-severity severity-${escapeHtml(event.severity)}">${escapeHtml(event.severity)}</span>
        <span class="model-event-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="model-event-observation-panel${expanded ? '' : ' hidden'}" id="model-observation-${escapeHtml(event.id)}">
        <div class="model-event-observation${selected ? ' active' : ''}" data-model-observation="${escapeHtml(event.id)}">
          <div class="eyebrow model-observation-eyebrow">WHAT WAS OBSERVED · MODEL OBSERVATION</div>
          <div class="model-observation-type"><span>${escapeHtml(event.issue_type)}</span><span class="severity-pill ${escapeHtml(event.severity)}">${escapeHtml(event.severity)} priority</span></div>
          <h4>${escapeHtml(event.title)}</h4>
          <div class="selected-playing">▶ SELECTED EVENT · PLAYING IN VIDEO</div>
          <div class="model-observation-block"><b>What is visible</b><p>${escapeHtml(event.visible_evidence)}</p></div>
          ${subjectLinkMarkup(subjectLink)}
          <div class="model-corroboration${corroborationClass}">Cross-model agreement <strong>${escapeHtml(correlation.label || 'Not corroborated')}</strong>${correlation.also_reported_by ? `<span> · Also reported by ${escapeHtml(correlation.also_reported_by)}</span>` : ''}</div>
          <div class="model-observation-footer"><span>AI-generated observation · Review candidate, not a confirmed fault</span><button type="button" class="inspect-evidence-link" data-model-seek="${escapeHtml(event.id)}">Inspect video evidence →</button></div>
        </div>
      </div>
    </article>`;
  }

  function updateModelEventAccordionUI() {
    $('model-event-cards').querySelectorAll('[data-model-event-accordion]').forEach((item) => {
      const id = item.dataset.modelEventAccordion;
      const expanded = id === expandedModelEventId;
      const selected = id === activeModelEventId;
      const trigger = item.querySelector('[data-model-event-toggle]');
      const panel = item.querySelector('.model-event-observation-panel');
      const observation = item.querySelector('[data-model-observation]');
      item.classList.toggle('expanded', expanded);
      item.classList.toggle('selected', selected);
      trigger.classList.toggle('active', selected);
      trigger.setAttribute('aria-expanded', String(expanded));
      panel.classList.toggle('hidden', !expanded);
      observation.classList.toggle('active', selected);
    });
  }

  function renderModelEventTimeline(model) {
    const timeline = $('model-event-cards');
    const count = $('selected-model-event-count');
    if (count) count.textContent = `${model.observations.length} EVENT${model.observations.length === 1 ? '' : 'S'}`;
    if (!model.observations.length) {
      timeline.innerHTML = '<div class="model-event-empty">No timestamped observations were recorded for this model.</div>';
      return;
    }
    timeline.innerHTML = model.observations.map(modelObservationMarkup).join('');
    timeline.querySelectorAll('[data-model-event-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const eventId = button.dataset.modelEventToggle;
        expandedModelEventId = expandedModelEventId === eventId ? null : eventId;
        selectModelEvent(eventId, true, { expand: false });
        updateModelEventAccordionUI();
      });
    });
    timeline.querySelectorAll('[data-model-seek]').forEach((button) => {
      button.addEventListener('click', () => {
        const eventId = button.dataset.modelSeek;
        expandedModelEventId = eventId;
        selectModelEvent(eventId, true, { expand: false });
        updateModelEventAccordionUI();
      });
    });
    updateModelEventAccordionUI();
  }

  function selectModelEvent(eventId, play = true, options = {}) {
    const model = modelById(activeModelId);
    const event = model?.observations.find((item) => item.id === eventId);
    if (!event) return;
    activeModelEventId = event.id;
    if (options.expand !== false) expandedModelEventId = event.id;
    updateModelEventAccordionUI();
    $('active-model-caption').textContent = `${event.title} · ${formatTime(event.context_start)}–${formatTime(event.context_end)} CONTEXT`;
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
    expandedModelEventId = null;
    $('model-tabs').querySelectorAll('[data-model-tab]').forEach((button) => button.classList.toggle('active', button.dataset.modelTab === modelId));
    $('active-model-name').textContent = model.name;
    $('active-model-provider').textContent = model.status_label || `${model.provider_name} · Review complete`;
    $('active-model-summary').textContent = model.summary;
    renderModelEventTimeline(model);
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
    const ids = CURRENT_DATA.comparison.ranked_model_ids;
    const headers = ids.map((id) => `<th class="${id === activeScoreModelId ? 'active-score-col' : ''}"><button type="button" class="score-model-heading" data-score-heading="${escapeHtml(id)}" aria-haspopup="dialog" aria-controls="score-evidence-dialog">${escapeHtml(modelById(id).name)}</button></th>`).join('');
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
    $('score-table').innerHTML = `<thead><tr><th>Comparison criterion</th>${headers}</tr></thead><tbody>${rows.map(([key, label]) => `<tr><td><button type="button" class="score-criterion-label" data-score-criterion-label="${key}" aria-haspopup="dialog" aria-controls="score-evidence-dialog">${escapeHtml(label)}</button></td>${ids.map((id) => `<td class="${id === activeScoreModelId ? 'active-score-col' : ''}"><button type="button" class="score-evidence-trigger" data-score-proof-model="${escapeHtml(id)}" data-score-proof-criterion="${key}" aria-haspopup="dialog" aria-controls="score-evidence-dialog" aria-label="Show ${escapeHtml(label)} evidence for ${escapeHtml(modelById(id).name)}">${escapeHtml(scoreValueCell(id, key))}</button></td>`).join('')}</tr>`).join('')}</tbody>`;
    $('score-table').querySelectorAll('[data-score-heading]').forEach((button) => button.addEventListener('click', () => renderScoreEvidence(button.dataset.scoreHeading, 'overall')));
    $('score-table').querySelectorAll('[data-score-proof-model]').forEach((button) => button.addEventListener('click', () => renderScoreEvidence(button.dataset.scoreProofModel, button.dataset.scoreProofCriterion)));
    $('score-table').querySelectorAll('[data-score-criterion-label]').forEach((button) => button.addEventListener('click', () => renderScoreEvidence(activeScoreModelId, button.dataset.scoreCriterionLabel)));
  }

  function proofFindingRow(modelId, event, status, detail) {
    const subject = event.subject_link || {};
    const corroboration = event.corroboration || {};
    const partnerModel = corroboration.also_reported_by ? models.find((item) => item.name === corroboration.also_reported_by) : null;
    const partnerMatches = partnerModel ? (partnerModel.observations || []).filter((candidate) => candidate.issue_type === event.issue_type && Math.abs(Number(candidate.timestamp_seconds) - Number(event.timestamp_seconds)) <= 5) : [];
    const partnerEvidence = partnerMatches.length ? `Saved peer record within the ±5-second comparison window: ${partnerMatches.map((candidate) => `${candidate.title} [${candidate.id}] at ${candidate.timestamp_label} (Δ${Math.abs(Number(candidate.timestamp_seconds) - Number(event.timestamp_seconds)).toFixed(1)}s)`).join('; ')}.` : (corroboration.also_reported_by ? 'The report names a corroborating model, but no same-category peer record falls within the ±5-second window in this local copy.' : 'No corroborating model record is named.');
    const subjectValue = subject.status === 'linked'
      ? `${subject.class || 'Object'} linked${Number.isFinite(Number(subject.confidence)) ? ` · ${Number(subject.confidence).toFixed(1)}% detector confidence` : ''}`
      : subject.status === 'not_applicable' ? 'Not applicable to object detector' : 'No matching subject box recorded';
    const corroborationValue = corroboration.status === 'corroborated'
      ? `Also reported by ${corroboration.also_reported_by || 'another selected model'}`
      : 'No corroborating model recorded';
    return `<article class="score-proof-finding">
      <div class="score-proof-finding-top">
        <div class="score-proof-record-meta"><span class="score-proof-time">${escapeHtml(event.timestamp_label)}</span><code>${escapeHtml(event.id)}</code><span class="score-proof-context-window">Window ${escapeHtml(formatTime(event.context_start))}–${escapeHtml(formatTime(event.context_end))}</span></div>
        <span class="score-proof-severity severity-${escapeHtml(String(event.severity || 'unknown').toLowerCase())}">${escapeHtml(String(event.severity || 'UNSPECIFIED').toUpperCase())} PRIORITY</span>
      </div>
      <h4>${escapeHtml(event.title)}</h4>
      <div class="score-proof-record-grid">
        <div><small>Issue category</small><b>${escapeHtml(event.issue_type || 'Not supplied')}</b></div>
        <div><small>AI ↔ YOLO association</small><b>${escapeHtml(subjectValue)}</b><p>${escapeHtml(subject.detail || subject.label || 'No detector association detail was recorded.')}</p></div>
        <div><small>Cross-model check</small><b>${escapeHtml(corroborationValue)}</b><p>${escapeHtml(partnerEvidence)}</p></div>
      </div>
      <div class="score-proof-observation"><span>OBSERVATION RECORDED AT ${escapeHtml(event.timestamp_label)}</span><p>${escapeHtml(event.visible_evidence || 'No visible-evidence text was supplied in the saved record.')}</p></div>
      <div class="score-proof-decision"><b>How this record affects the selected criterion</b><span class="score-proof-finding-status">${escapeHtml(status)}</span><p>${escapeHtml(detail)}</p></div>
      <button type="button" class="score-proof-open" data-proof-model="${escapeHtml(modelId)}" data-proof-event="${escapeHtml(event.id)}">Open this timestamp in the annotated model video <span aria-hidden="true">→</span></button>
    </article>`;
  }

  function scoreEvidenceComparisonTable(peerScores, criterionKey, valueFormatter, baselineText) {
    return `<div class="score-proof-comparison-wrap">
      <div class="score-proof-section-heading"><b>Run comparison</b><span>Saved comparison values</span></div>
      <table class="score-proof-comparison-table"><thead><tr><th>Model</th><th>Value</th><th>Normalized</th><th>Weighted points</th></tr></thead><tbody>
        ${peerScores.map(({model,score}) => `<tr><td>${escapeHtml(model.name)}</td><td>${escapeHtml(valueFormatter(score))}</td><td>${Number(score[criterionKey].percent).toFixed(1)}%</td><td>${Number(score[criterionKey].points).toFixed(1)}</td></tr>`).join('')}
      </tbody></table>
      <p class="score-proof-baseline">${escapeHtml(baselineText)}</p>
    </div>`;
  }

  function renderScoreEvidence(modelId, criterionKey, options = {}) {
    const score = scoreById(modelId);
    const model = modelById(modelId);
    if (!score || !model) return;
    activeScoreModelId = modelId;
    $('scorecard-rankings').querySelectorAll('[data-score-model]').forEach((button) => button.classList.toggle('active', button.dataset.scoreModel === modelId));
    $('score-table').querySelectorAll('[data-score-heading]').forEach((button) => {
      const cell = button.closest('th');
      if (cell) cell.classList.toggle('active-score-col', button.dataset.scoreHeading === modelId);
    });
    $('score-table').querySelectorAll('[data-score-proof-model]').forEach((button) => {
      const cell = button.closest('td');
      if (cell) cell.classList.toggle('active-score-col', button.dataset.scoreProofModel === modelId);
    });

    const weights = CURRENT_DATA.comparison.weights;
    const criterion = weights.find((item) => item.key === criterionKey);
    const labelMap = {
      overall: 'Overall comparative score', findings: 'Findings reported',
      yolo: 'YOLO subject alignment', corroboration: 'Cross-model corroboration',
      structure: 'Structured output completeness', speed: 'Response latency',
      tokens: 'Token usage', cost: 'Provider-reported cost'
    };
    const label = labelMap[criterionKey] || criterion?.label || 'Score evidence';
    const observations = model.observations || [];
    const evidenceReportFile = CURRENT_DATA.metadata.dataset_id === 'factory-walkway' ? 'walkway-model-comparison-report.json' : 'model-comparison-report.json';
    const evidenceSourceLabel = 'saved comparison report';
    const peerScores = CURRENT_DATA.comparison.ranked_model_ids.map((id) => ({ model: modelById(id), score: scoreById(id) }));
    const dialog = $('score-evidence-dialog');
    let summary = '';
    let evidence = '';
    let method = '';
    let valueText = criterionKey === 'overall' ? `${score.score.toFixed(1)} / 100` : scoreValueCell(modelId, criterionKey);
    let metaText = criterion ? `${criterion.weight}% score weight · ${Number(score[criterionKey].percent).toFixed(1)}% normalized · ${Number(score[criterionKey].points).toFixed(1)} weighted points` : 'Context metric · not included in the weighted total';

    if (criterionKey === 'overall') {
      const componentRows = weights.map((item) => {
        const metric = score[item.key];
        return `<div class="score-evidence-component"><div><b>${escapeHtml(item.label)}</b><span>${Number(metric.points).toFixed(1)} / ${item.weight} pts</span></div><div class="score-bar"><i style="width:${Math.max(0, Math.min(100, Number(metric.percent)))}%"></i></div><small>${Number(metric.percent).toFixed(1)}% normalized score × ${item.weight}% weight = ${Number(metric.points).toFixed(1)} contribution</small></div>`;
      }).join('');
      const sum = weights.reduce((total, item) => total + Number(score[item.key].points), 0);
      summary = `The ${evidenceSourceLabel} assigns ${score.score.toFixed(1)} / 100 to ${model.name}. The total is the sum of the six weighted criterion contributions below (${sum.toFixed(1)} when recalculated from the displayed values). ${score.rank} is a relative position among these three comparison entries; it is not a verified safety-accuracy grade.`;
      evidence = `<div class="score-evidence-components">${componentRows}</div>
        <div class="score-proof-callout"><b>Reproducible total</b><br>${weights.map((item) => `${Number(score[item.key].points).toFixed(1)}`).join(' + ')} = <strong>${sum.toFixed(1)} points</strong>. The ${evidenceSourceLabel} stores ${score.score.toFixed(1)}. Any 0.1-point difference can arise from the report's rounded component values; the bundled report is the source of record.</div>
        <div class="score-proof-comparison-wrap"><div class="score-proof-section-heading"><b>Relative ranking in this comparison</b><span>Not ground-truth accuracy</span></div><div class="score-proof-rank-list">${peerScores.map(({model:peer,score:peerScore},index)=>`<div class="score-proof-rank-row"><span>${index+1}</span><b>${escapeHtml(peer.name)}</b><strong>${peerScore.score.toFixed(1)} / 100</strong><small>${escapeHtml(peerScore.rank)}</small></div>`).join('')}</div></div>
        <div class="score-proof-callout score-proof-caveat"><b>Interpretation</b><br>Findings reported is shown as a contextual count in the table; it is not one of the six weighted criteria. More findings do not automatically mean better detection. Cross-model agreement measures consistency, not truth.</div>`;
      method = 'The comparison uses YOLO alignment (35%), cross-model corroboration (25%), structured output completeness (12%), response speed (12%), token efficiency (8%) and cost efficiency (8%). The displayed points follow the saved comparison values; the score is comparative and depends on these chosen weights.';
      metaText = `${score.rank} relative run rank · six weighted components · 100-point scale`;
    } else if (criterionKey === 'findings') {
      summary = `${model.name} has ${score.findings_reported} observation record(s), and the observations array contains ${observations.length} record(s). This is a volume/context measure only; it does not add points to the weighted score and should not be interpreted as a detection-quality grade.`;
      evidence = `<div class="score-proof-callout"><b>Counting rule</b><br>One row below equals one observation object in the bundled model-comparison JSON. Multiple findings may share a timestamp because they describe separate observations from the same video moment.</div><div class="score-proof-list">${observations.map((event) => proofFindingRow(modelId, event, 'COUNTED · 1 RECORD', `This observation object contributes one to the displayed finding count. Record ID: ${event.id}.`)).join('')}</div>`;
      method = 'The count is read directly from the saved observations array. It is not weighted into the overall comparison score because raw finding quantity alone does not indicate correctness or completeness.';
      metaText = 'Context metric · excluded from weighted total';
    } else if (criterionKey === 'yolo') {
      const eligible = observations.filter((event) => event.subject_link?.status !== 'not_applicable');
      const excluded = observations.filter((event) => event.subject_link?.status === 'not_applicable');
      const linked = eligible.filter((event) => event.subject_link?.status === 'linked');
      const unmatched = eligible.filter((event) => event.subject_link?.status !== 'linked');
      summary = `${score.yolo.numerator} of ${score.yolo.denominator} eligible findings have a saved YOLO subject association (${score.yolo.percent.toFixed(1)}%). ${linked.length} linked record(s) and ${unmatched.length} eligible record(s) without a matching box are listed below. ${excluded.length} condition record(s) marked not applicable are shown separately and excluded from the denominator.`;
      evidence = `<div class="score-proof-callout"><b>Decision rule</b><br>Count a finding as aligned only when the saved record has subject_link.status = <code>linked</code>. A finding tagged <code>unmatched</code> is not credited with a box. A non-object condition tagged <code>not_applicable</code> is excluded from the eligible denominator. The saved report gives ${score.yolo.numerator} ÷ ${score.yolo.denominator} = ${score.yolo.percent.toFixed(1)}%.</div>
        <div class="score-proof-metric-strip"><div><small>Linked</small><b>${linked.length}</b></div><div><small>Eligible, not matched</small><b>${unmatched.length}</b></div><div><small>Not applicable</small><b>${excluded.length}</b></div></div>
        <div class="score-proof-section-heading"><b>Eligible subject findings</b><span>${eligible.length} records</span></div><div class="score-proof-list">${eligible.map((event) => {
          const isLinked = event.subject_link?.status === 'linked';
          const matchDetail = isLinked ? `${event.subject_link.class || 'Subject'} match recorded${Number.isFinite(Number(event.subject_link.confidence)) ? ` at ${Number(event.subject_link.confidence).toFixed(1)}% detector confidence` : ''}.` : (event.subject_link?.detail || 'No matching YOLO subject was saved for this event timestamp.');
          return proofFindingRow(modelId, event, isLinked ? 'CREDITED · LINKED' : 'NOT CREDITED · NO MATCH', matchDetail);
        }).join('')}</div>${excluded.length ? `<div class="score-proof-section-heading"><b>Excluded from denominator</b><span>${excluded.length} record</span></div><div class="score-proof-list">${excluded.map((event) => proofFindingRow(modelId, event, 'EXCLUDED · NOT APPLICABLE', event.subject_link?.detail || 'This condition is not represented as an eligible YOLO object class in the saved report.')).join('')}</div>` : ''}`;
      method = 'This criterion evaluates subject association in the saved comparison output. Detector confidence is reported only where the record contains it; a confidence value does not prove that the downstream hazard interpretation is correct. The static demo does not expose raw frame-level YOLO tensors or detector logs.';
    } else if (criterionKey === 'corroboration') {
      const corroborated = observations.filter((event) => event.corroboration?.status === 'corroborated');
      const notCorroborated = observations.filter((event) => event.corroboration?.status !== 'corroborated');
      summary = `${score.corroboration.numerator} of ${score.corroboration.denominator} findings are marked corroborated in the saved report (${score.corroboration.percent.toFixed(1)}%). The comparison records ${corroborated.length} corroborated observation(s) and ${notCorroborated.length} without a corroborating model for this selected model.`;
      evidence = `<div class="score-proof-callout"><b>Decision rule</b><br>A finding is credited when its saved corroboration.status is <code>corroborated</code>. The record must also name the other model where that detail is available. The report's score is ${score.corroboration.numerator} ÷ ${score.corroboration.denominator} = ${score.corroboration.percent.toFixed(1)}%. This is evidence of agreement, not independent validation.</div>
        <div class="score-proof-section-heading"><b>Corroborated records</b><span>${corroborated.length} records</span></div><div class="score-proof-list">${corroborated.map((event) => proofFindingRow(modelId, event, 'CREDITED · CORROBORATED', `The saved record names ${event.corroboration?.also_reported_by || 'another selected model'} as also reporting this finding at approximately ${event.timestamp_label}.`)).join('') || '<p class="score-proof-empty">No findings in this model were marked as corroborated.</p>'}</div>
        <div class="score-proof-section-heading"><b>Not corroborated</b><span>${notCorroborated.length} records</span></div><div class="score-proof-list">${notCorroborated.map((event) => proofFindingRow(modelId, event, 'NOT CREDITED · NO MATCH', 'No supporting cross-model match is recorded for this observation in the saved report.')).join('') || '<p class="score-proof-empty">All saved findings have a corroboration record.</p>'}</div>`;
      method = 'The result is based on the corroboration flags and partner model names stored with each observation. The static report does not include the underlying prompt/response transcript or the full matching algorithm trace, so this should be treated as a recorded comparison signal rather than proof of truth.';
    } else if (criterionKey === 'structure') {
      const checks = observations.map((event) => ({
        event,
        title: Boolean(event.title && event.title.trim()),
        category: Boolean(event.issue_type && event.issue_type.trim()),
        timestamp: Number.isFinite(Number(event.timestamp_seconds)) && Boolean(event.timestamp_label)
      }));
      const passed = checks.filter((item) => item.title && item.category && item.timestamp);
      summary = `${score.structure.numerator} of ${score.structure.denominator} findings passed the saved structural checks (${score.structure.percent.toFixed(1)}%). The checks require a non-empty title, issue category and timestamp. This measures whether the observation is reviewable in the interface, not whether the interpretation is correct.`;
      evidence = `<div class="score-proof-callout"><b>Validation rule</b><br>For each observation, test: (1) title contains text; (2) issue_type contains text; (3) timestamp_seconds is numeric and timestamp_label is present. A record passes only when all three checks pass. Saved result: ${passed.length} ÷ ${checks.length} = ${score.structure.percent.toFixed(1)}%.</div>
        <div class="score-proof-list">${checks.map(({event,title,category,timestamp}) => proofFindingRow(modelId, event, title && category && timestamp ? 'PASSED · 3 OF 3 CHECKS' : 'FAILED · INCOMPLETE', `Title: ${title ? 'PASS' : 'FAIL'} · Issue category: ${category ? 'PASS' : 'FAIL'} · Timestamp: ${timestamp ? 'PASS' : 'FAIL'}. This record ${title && category && timestamp ? 'meets' : 'does not meet'} the saved structural completeness rule.`)).join('')}</div>`;
      method = 'The checks are recomputed from the actual observation objects in the bundled JSON at page load. A passing record can still contain an incorrect or incomplete visual interpretation; this score only checks the presence of the required fields.';
    } else if (criterionKey === 'speed') {
      const fastest = Math.min(...peerScores.map((item) => Number(item.score.speed.latency_seconds)));
      const fastestModel = peerScores.find((item) => Number(item.score.speed.latency_seconds) === fastest)?.model.name || 'fastest model';
      summary = `The response latency listed for ${model.name} is ${score.speed.latency_seconds.toFixed(2)} seconds. ${fastestModel} is the fastest comparison entry at ${fastest.toFixed(2)} seconds. The saved normalization is fastest latency ÷ this model's latency × 100, giving ${score.speed.percent.toFixed(1)}% and ${score.speed.points.toFixed(1)} weighted points.`;
      evidence = `${scoreEvidenceComparisonTable(peerScores, 'speed', (item) => `${item.speed.latency_seconds.toFixed(2)} s`, `Normalization baseline: ${fastest.toFixed(2)} s (fastest completed model). For this model: ${fastest.toFixed(2)} ÷ ${score.speed.latency_seconds.toFixed(2)} × 100 = ${score.speed.percent.toFixed(1)}%; then × ${criterion.weight}% weight = ${score.speed.points.toFixed(1)} points.`)}
        <div class="score-proof-callout">Latency is shown as a comparison value from this saved replay. No repeated-run distribution is included, so the ranking should not be treated as a benchmark confidence interval.</div>`;
      method = 'Lower latency receives a higher normalized score. The score is sensitive to the conditions of this one recorded run, including provider queueing, network conditions and prompt size.';
    } else if (criterionKey === 'tokens') {
      const minimum = Math.min(...peerScores.map((item) => Number(item.score.tokens.total)));
      const lowestModel = peerScores.find((item) => Number(item.score.tokens.total) === minimum)?.model.name || 'lowest-token model';
      summary = `${model.name} used ${score.tokens.total.toLocaleString('en-US')} tokens: ${score.tokens.input.toLocaleString('en-US')} input + ${score.tokens.output.toLocaleString('en-US')} output. ${lowestModel} is the minimum-token baseline at ${minimum.toLocaleString('en-US')}. Normalization is minimum total ÷ this model's total × 100, producing ${score.tokens.percent.toFixed(1)}% and ${score.tokens.points.toFixed(1)} weighted points.`;
      evidence = `${scoreEvidenceComparisonTable(peerScores, 'tokens', (item) => `${item.tokens.total.toLocaleString('en-US')} (${item.tokens.input.toLocaleString('en-US')} in + ${item.tokens.output.toLocaleString('en-US')} out)`, `Normalization baseline: ${minimum.toLocaleString('en-US')} tokens. For this model: ${minimum.toLocaleString('en-US')} ÷ ${score.tokens.total.toLocaleString('en-US')} × 100 = ${score.tokens.percent.toFixed(1)}%; then × ${criterion.weight}% weight = ${score.tokens.points.toFixed(1)} points.`)}
        <div class="score-proof-callout">Token counts are reproduced from the saved comparison report. They are not a measure of answer quality; prompt length, image/frame payload handling and provider token accounting can affect comparability.</div>`;
      method = 'Lower total token usage receives a higher normalized score. Input and output counts are shown separately so the total can be checked by addition.';
    } else if (criterionKey === 'cost') {
      const allCosts = peerScores.map((item) => Number(item.score.cost.usd));
      const equal = allCosts.every((value) => value === allCosts[0]);
      const allZero = allCosts.every((value) => value === 0);
      summary = `The comparison report shows $${score.cost.usd.toFixed(6)} USD for ${model.name}. ${equal ? 'All selected models have the same numeric value, so this criterion does not separate their ranking in this run.' : 'The values are normalized against the other selected models.'} ${allZero ? 'All three values are zero in the saved comparison. Billing receipts are not included in this demo.' : ''}`;
      evidence = `<div class="score-proof-metrics">${peerScores.map((item) => `<div><b>${escapeHtml(item.model.name)}</b><span>$${item.score.cost.usd.toFixed(6)} USD</span><small>${item.score.cost.percent.toFixed(1)}% normalized · ${item.score.cost.points.toFixed(1)} weighted points</small></div>`).join('')}</div>
        <div class="score-proof-callout"><b>Contribution to the total</b><br>${score.cost.percent.toFixed(1)}% normalized × ${criterion.weight}% weight = ${score.cost.points.toFixed(1)} points. ${equal ? 'Because the values are equal, every model receives the same contribution.' : 'The values differ across models and affect the relative total.'}</div>
        <div class="score-proof-callout score-proof-caveat"><b>Verification limit</b><br>Provider billing receipts, invoice exports and raw usage-cost response fields are not included. The displayed values cannot be independently audited as billed cost from this repository.</div>`;
      method = 'Cost efficiency is compared using the numeric values in the saved comparison report. The displayed amount should be treated as demo report data, not an independently audited invoice.';
    }

    $('score-evidence-dialog-title').textContent = `${label} · ${model.name}`;
    $('score-evidence-dialog-subtitle').textContent = `${score.rank} relative rank · Value: ${valueText} · ${metaText}`;
    $('score-evidence-dialog-content').innerHTML = `<div class="score-evidence-summary">${escapeHtml(summary)}</div>
      <div class="score-proof-method"><span class="eyebrow">SCORING METHOD & INTERPRETATION</span><p>${escapeHtml(method)}</p></div>
      ${evidence}
      <div class="score-evidence-source-note"><b>Evidence source:</b> values and observation records are included in <code>assets/data/${evidenceReportFile}</code> in this repository. The modal presents the scoring arithmetic and supporting records bundled with this static replay. Raw provider request logs, invoice receipts, original frame-level detector outputs and repeated benchmark runs are not included.</div>`;
    if (options.open !== false && dialog && !dialog.open) dialog.showModal();
  }

  function renderScorecard() {
    const ids = CURRENT_DATA.comparison.ranked_model_ids;
    $('scorecard-rankings').innerHTML = ids.map((id) => {
      const model = modelById(id), score = scoreById(id);
      const tone = score.rank.includes('BEST') ? 'best' : score.rank.includes('BETTER') ? 'better' : 'good';
      return `<button type="button" class="rank-card ${tone}${id === activeScoreModelId ? ' active' : ''}" data-score-model="${escapeHtml(id)}" aria-haspopup="dialog" aria-controls="score-evidence-dialog">
        <span class="rank-text"><span class="rank-label">${escapeHtml(score.rank)}</span><b>${escapeHtml(model.name)}</b><small>YOLO linked ${score.yolo.numerator} of ${score.yolo.denominator} eligible AI subjects (${score.yolo.percent.toFixed(1)}%).</small></span>
        <span class="rank-score">${score.score.toFixed(1)}<small> /100</small></span>
      </button>`;
    }).join('');
    $('scorecard-rankings').querySelectorAll('[data-score-model]').forEach((button) => button.addEventListener('click', () => renderScoreEvidence(button.dataset.scoreModel, 'overall')));
    $('score-method-note').textContent = `${CURRENT_DATA.comparison.method_note} Scoring weights: YOLO subject alignment 35%, cross-model corroboration 25%, structured output completeness 12%, response speed 12%, token efficiency 8%, and cost efficiency 8%. Cost values are report values, not independently audited billing receipts.`;
    renderScoreTable();
    renderScoreEvidence(activeScoreModelId, 'overall', { open: false });
  }

  function renderTechnicalRows() {
    $('technical-model-list').innerHTML = CURRENT_DATA.comparison.ranked_model_ids.map((id) => {
      const model = modelById(id), score = scoreById(id);
      return `<div class="technical-model-row"><b>${escapeHtml(model.name)}${model.status === 'reconstructed' ? ' · REPLAY' : ''}</b><span>${score.speed.latency_seconds.toFixed(2)}s · ${score.tokens.input} input · ${score.tokens.output} output · $${score.cost.usd.toFixed(6)}</span></div>`;
    }).join('');
  }

  function renderAgreement() {
    $('agreement-chips').innerHTML = CURRENT_DATA.comparison.shared_findings.map((item) => `<span class="agreement-chip">${escapeHtml(item.label)} · ${formatTime(item.timestamp_seconds)}</span>`).join('');
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

  $('score-evidence-dialog-close').addEventListener('click', () => $('score-evidence-dialog').close());
  $('score-evidence-dialog-footer-close').addEventListener('click', () => $('score-evidence-dialog').close());
  $('score-evidence-dialog').addEventListener('click', (event) => {
    if (event.target === $('score-evidence-dialog')) $('score-evidence-dialog').close();
  });
  $('score-evidence-dialog-content').addEventListener('click', (event) => {
    const button = event.target.closest('[data-proof-model][data-proof-event]');
    if (!button) return;
    const modelId = button.dataset.proofModel;
    const eventId = button.dataset.proofEvent;
    $('score-evidence-dialog').close();
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
    $('event-history-count').textContent = `${mainEvents.length} EVENTS`;
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
