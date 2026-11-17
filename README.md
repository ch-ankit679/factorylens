# FACTORYLENS — Interactive Static Demo

This GitHub Pages package reproduces the supplied FactoryLens V1.3 inspection experience using the original project's HTML/CSS layout and the supplied recorded video assets.

## What works in this static demo

- Prepared input video preview and replay.
- Simulated inspection progress followed by the saved main annotated MP4 and recorded observations.
- Timestamp buttons that seek the annotated video.
- Temporal and spatial heatmap visualization from the recorded dashboard.
- Three model tabs, each playing its own model-specific annotated MP4.
- Sequential playback of the three model videos.
- Event register populated from the recorded observations.
- Downloadable JSON summaries.
- Camera preview only (no live inference).

## What it does not do

This is a precomputed replay, not a live copy of the backend. It does not run Python, FastAPI, YOLO, OpenCV, OpenRouter, motion analysis, vibration analysis, or new video inference. Selecting **Replay saved inspection** and **Compare selected AI reviewers** replays the prepared outputs included in `assets/videos/`.

## Deploy to GitHub Pages

1. Create a **public** GitHub repository named `factorylens-demo` (public repository required for GitHub Free Pages).
2. Extract this package and push all its contents to the repository's `main` branch.
3. Open repository **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
4. The workflow `.github/workflows/deploy-pages.yml` copies only `index.html`, `styles.css`, `app.js` and `assets/` into the Pages artifact, then publishes it automatically.
5. Open `https://YOUR_USERNAME.github.io/factorylens-demo/` after the Actions workflow succeeds.

No Render, backend, secrets, API key, or paid hosting is required for this static demo.

## Media assets

The 60-second input and four 25-second annotated outputs were re-encoded to H.264 1280×720 with fast-start metadata for browser playback and smaller GitHub Pages downloads. The 7m20 screen recording was used as the visual/result reference and is not bundled into the public site to avoid duplicating a large screen-capture file.

## Report provenance

The uploaded ZIP contained MP4 videos and the screen recording, but not the original JSON report files. The JSON summaries under `assets/data/` are reconstructed only from the visible text/results in those supplied assets. Provider latency, token counts, exact detector frame counts and other unshown fields are intentionally omitted.

## Safety note

FactoryLens observations are AI-assisted visual review candidates. They are not certified safety findings, fault diagnoses, or compliance determinations. A qualified site person must verify the original footage and site conditions.
