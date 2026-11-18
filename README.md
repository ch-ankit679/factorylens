# FACTORYLENS — GitHub Pages Demo

This repository is a static, browser-based replay of the latest FactoryLens interface shown in the two supplied screen recordings. It includes the 60-second factory source video, the main annotated inspection output, and the three latest model-specific annotated outputs.

## Included workflow

1. Open **Video inspection**. The supplied 60-second factory source clip is preloaded.
2. Select **Inspect video**. The page shows a short replay progress sequence and then loads the recorded 25-second main annotated output.
3. Use the six-item event timeline or the observation cards to seek to an event timestamp. The selected event is highlighted, and the page remains in place while the video seeks.
4. Open **Visual model comparison** and start **Compare selected AI reviewers**. The page displays the three-model loading progress (including each model being rendered) before opening the saved comparison results.
5. Select **Play all model videos** to play the three model-specific clips in sequence.
6. Review the event cards, YOLO subject association status, cross-model corroboration, heatmaps, scorecard, technical metrics, and downloadable JSON reports.

## Files

- `index.html`, `styles.css`, `app.js` — responsive front end and replay interactions.
- `assets/data/demo-data.json` — human-readable data for the replay.
- `assets/data/demo-data.js` — browser-loaded version of the same data.
- `assets/data/inspection-report.json` — downloadable inspection report.
- `assets/data/model-comparison-report.json` — downloadable multi-model comparison report.
- `assets/videos/factory-input.mp4` — 60.24-second source video.
- `assets/videos/main-annotated.mp4` — main 25-second annotated inspection output.
- `assets/videos/nemotron-3-5-super-vl.mp4` — Nemotron 3.5 Super VL output.
- `assets/videos/nemotron-3-nano-omni.mp4` — Nemotron 3 Nano Omni 30B A3B output.
- `assets/videos/ling-3-2-flash.mp4` — Ling 3.2 Flash output.

## Deploy to GitHub Pages

1. Create a GitHub repository and upload the **contents** of this folder to its `main` branch. Do not upload the parent ZIP as a single file.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. The included `.github/workflows/deploy-pages.yml` deploys the site after each push to `main`.
5. When the workflow succeeds, open the Pages URL displayed in the repository's Pages settings or in the workflow deployment summary.

No Python runtime, API key, server, database, or external model provider is needed to publish or view this replay. The model-comparison progress is a timed loading replay of the precomputed outputs, not a live inference run.

## Important capability boundary

GitHub Pages serves static files only. It cannot run the original FastAPI backend, YOLO/OpenCV inference, or OpenRouter model requests. This demo therefore reproduces the recorded interface and interactions using the supplied, precomputed MP4 outputs and recorded report values. It does **not** analyse arbitrary newly uploaded videos. An additional upload can be previewed in the browser, but the saved inspection results remain tied to the included factory source clip.

The original source recording did not include the backend's raw JSON response payloads. The report values and event descriptions have been transcribed from the visible screen recordings and annotated clips. The scorecard uses the values visible in the latest recording. Heatmap subject coordinates are approximate visual reconstructions because exact coordinates were not supplied.

## Model comparison scorecard

The recorded comparison shows:

| Relative result | Model | Score |
|---|---|---:|
| BEST | Ling 3.2 Flash | 64.7 / 100 |
| BETTER | Nemotron 3 Nano Omni 30B A3B | 62.5 / 100 |
| GOOD | Nemotron 3.5 Super VL | 40.0 / 100 |

The score uses the recorded weights: YOLO subject alignment 35%, cross-model corroboration 25%, structured output completeness 12%, response speed 12%, token efficiency 8%, and provider-reported cost efficiency 8% when cost is available for every completed model. These are relative run rankings, not ground-truth accuracy scores. Model agreement is a consistency signal, not proof that an observation is true.

## Safety note

FactoryLens observations are AI-assisted visual review candidates. They are not certified safety findings, fault diagnoses, or compliance determinations. A qualified site person must verify the original footage and site conditions.
