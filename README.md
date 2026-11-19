# FACTORYLENS — AI-Assisted Industrial Video Inspection

FactoryLens is an AI-assisted industrial video review prototype. It combines visual observations from vision-language models with object-localisation context to help reviewers examine factory footage, navigate timestamped events, and compare how different models interpret the same scene.

> **This repository contains the GitHub Pages showcase version of FactoryLens.** It is a static, browser-based replay of a recorded inspection and model-comparison run. It is not the live Python/FastAPI application and does not perform new AI inference.

<p align="center">
  <strong>Live demo:</strong> <code>https://&lt;ch-ankit679&gt;.github.io/&lt;factorylens&gt;/</code>
</p>

Replace the URL above with the repository's actual GitHub Pages address after deployment.

---

## Contents

- [Project overview](#project-overview)
- [What the demo includes](#what-the-demo-includes)
- [Recorded model comparison](#recorded-model-comparison)
- [How to use the demo](#how-to-use-the-demo)
- [Run locally](#run-locally)
- [Deploy to GitHub Pages](#deploy-to-github-pages)
- [Repository structure](#repository-structure)
- [Data and report provenance](#data-and-report-provenance)
- [Technical boundaries and limitations](#technical-boundaries-and-limitations)
- [Media attribution](#media-attribution)
- [Safety and responsible use](#safety-and-responsible-use)
- [License](#license)

## Project overview

FactoryLens is designed to make recorded industrial footage easier to review. The showcase recreates the latest demonstrated workflow:

1. Review the supplied factory source video.
2. Replay the saved inspection and its annotated output.
3. Navigate the six timestamped observations through the event timeline and finding cards.
4. Inspect the temporal and spatial activity visualisations.
5. Replay the saved comparison of three vision-language models.
6. Review each model's findings, YOLO subject-link status, cross-model corroboration, and scorecard.
7. Download the recorded inspection and model-comparison JSON reports.

The goal of the comparison is to show how the selected models differ on the same recorded footage. The comparison is an operational and consistency-oriented view; it is not a validated model-accuracy benchmark.

## What the demo includes

### Video inspection

- A preloaded factory source video (approximately 60 seconds).
- A recorded inspection replay with a progress indicator.
- The saved main annotated video output (25 seconds).
- Six timestamped observations with severity labels, visible evidence, and suggested follow-up.
- Event selection that seeks the annotated player to the relevant timestamp without moving the page away from the selected finding.

### Visual activity review

- A temporal heatmap showing where observations occur in the recorded clip.
- A spatial visualisation of the subject locations represented in the recorded run.
- Finding-to-YOLO subject association status, where available.
- Cross-model corroboration indicators to show findings also reported by another model.

### Three-model comparison

- A comparison loading sequence with a progress bar and per-model status.
- A separate saved annotated video for each model.
- Model tabs and finding cards for reviewing the individual outputs.
- Sequential playback of the three model videos.
- A comparison scorecard and downloadable JSON report.

### Included reviewers

- **NVIDIA Nemotron 3.5 Super VL**
- **NVIDIA Nemotron 3 Nano Omni 30B A3B**
- **InclusionAI Ling 3.2 Flash**

## Recorded model comparison

The supplied screen recording shows the following saved results:

| Relative ranking in this run | Model | Recorded findings | Score |
|---|---|---:|---:|
| BEST | InclusionAI Ling 3.2 Flash | 4 | 64.7 / 100 |
| BETTER | NVIDIA Nemotron 3 Nano Omni 30B A3B | 5 | 62.5 / 100 |
| GOOD | NVIDIA Nemotron 3.5 Super VL | 2 | 40.0 / 100 |

The scorecard's recorded weighting is:

| Criterion | Weight |
|---|---:|
| YOLO subject alignment | 35% |
| Cross-model corroboration | 25% |
| Structured output completeness | 12% |
| Response speed | 12% |
| Token efficiency | 8% |
| Provider-reported cost efficiency | 8%* |

\* Cost efficiency is included only when actual provider-reported cost is available for every completed model; otherwise the unavailable criterion is excluded consistently and the remaining weights are renormalised.

**Interpretation:** BEST, BETTER, and GOOD are relative labels for this recorded run. The scores are not precision, recall, F1, mAP, or proof of real-world accuracy. Cross-model agreement indicates consistency between model outputs; agreement does not prove that an observation is correct. A ground-truth-labelled dataset and a defined evaluation protocol would be required to measure detection accuracy.

## How to use the demo

1. Open the deployed GitHub Pages URL or run the site locally (instructions below).
2. In **Video inspection**, play the preloaded source footage.
3. Select **Inspect video** to replay the saved inspection sequence.
4. Use the event timeline or observation cards to jump to one of the six recorded findings.
5. Open **Visual model comparison** and select **Compare selected AI reviewers**.
6. Follow the comparison progress sequence until all three saved model runs are ready.
7. Select a model tab to view its annotated video and findings. Use **Play all model videos** to play the clips in sequence.
8. Review the scorecard, corroboration details, heatmaps, and technical summaries. Use the report links to download the JSON files.

The inspection and comparison progress indicators replay the supplied, precomputed results. They do not call an AI provider or run a new inspection.

## Run locally

The project has no build step, package installation, Python dependencies, or API configuration. Because the page loads local JSON and media assets, serve the folder over HTTP rather than opening `index.html` directly with a `file://` URL.

With Python installed, open a terminal in the repository root and run:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Stop the local server with `Ctrl+C`.

## Deploy to GitHub Pages

The repository includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml`.

1. Create a GitHub repository for the showcase.
2. Extract this project and upload the **contents of the `factorylens-final` folder** to the root of the repository. The root should contain `index.html`, `app.js`, `styles.css`, `assets/`, and `.github/`.
3. Push the files to the `main` branch.
4. In GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
5. Open the **Actions** tab and confirm that **Deploy FactoryLens demo to GitHub Pages** completes successfully.
6. Open **Settings → Pages** or the workflow deployment summary to find the published URL.
7. Replace the demo URL placeholder at the top of this README with the actual URL.

The workflow also supports manual deployment through **Actions → Deploy FactoryLens demo to GitHub Pages → Run workflow**.

No backend host, model API key, secrets, or database is required for this static showcase.

## Repository structure

```text
.
├── .github/
│   └── workflows/
│       └── deploy-pages.yml       # GitHub Pages deployment workflow
├── assets/
│   ├── data/
│   │   ├── demo-data.json         # Readable source data for the replay
│   │   ├── demo-data.js           # Browser-loaded replay data
│   │   ├── inspection-report.json # Downloadable inspection report
│   │   └── model-comparison-report.json
│   └── videos/
│       ├── factory-input.mp4
│       ├── main-annotated.mp4
│       ├── nemotron-3-5-super-vl.mp4
│       ├── nemotron-3-nano-omni.mp4
│       └── ling-3-2-flash.mp4
├── docs/
│   └── ASSET-INVENTORY.md         # Media inventory and durations
├── .gitignore
├── .nojekyll
├── app.js                         # Replay behaviour and UI interactions
├── index.html                     # Main application page
├── LICENSE                        # MIT License
├── README.md
└── styles.css                     # Responsive interface styling
```

The video folder also includes poster images used by the interface.

## Data and report provenance

The showcase was assembled from the latest supplied screen recordings, the factory input clip, the main annotated result, and the three model-specific annotated results.

- The source clip is approximately 60.24 seconds long.
- The main annotated inspection output is 25 seconds long and contains six recorded observations.
- Each of the three model-specific annotated outputs is 25 seconds long.
- Video assets are encoded as browser-compatible H.264 MP4 at 1280 × 720 with fast-start metadata.
- The original backend's raw JSON response payloads were not included with the supplied media. The visible findings, counts, scores, and report details were transcribed or reconstructed from the recordings and annotated outputs.
- Exact heatmap coordinates were not supplied; the spatial points are approximate visual reconstructions and should not be treated as measured locations.
- The screen recordings are reference material and are not included in the published site bundle.

The downloadable JSON files represent this recorded demo run. They are not a replacement for raw source responses from the original backend.

## Technical boundaries and limitations

GitHub Pages is static hosting. This repository does **not** contain or execute the original Python/FastAPI inference backend. In particular, the deployed page does not run:

- YOLO object detection or OpenCV video processing on new footage.
- OpenRouter requests or any other live vision-language model inference.
- New video analysis, model benchmarking, or server-side report generation.
- Motion analysis, vibration/sensor analysis, or database-backed event storage.

The included videos and JSON data are precomputed demo assets. A local video may be previewed in the browser where the interface allows it, but uploading another video does not generate new findings or annotated results. To analyse new footage, use the separately maintained full FactoryLens application with its backend and required model configuration.

## Media attribution

The source footage is titled **“Industrial factory operation with machinery and workers”**, credited to **Kharis Boachie** on Pexels:

- Source page: <https://www.pexels.com/video/industrial-factory-operation-with-machinery-and-workers-29064797/>
- License information: <https://www.pexels.com/license/>

Retain this attribution when redistributing the demo media, and review the source platform's current licence terms for your intended use. The MIT License for this repository's code does not override the licence terms of third-party media.

## Safety and responsible use

FactoryLens produces AI-assisted visual observations for review. It does not certify regulatory compliance, confirm an incident, diagnose hidden mechanical faults, or determine whether equipment is safe to operate. Ordinary RGB video cannot establish internal bearing or gearbox condition, electrical faults, actual component temperature, or other conditions that are not visible in the footage.

All observations should be checked against the original footage and actual site conditions by qualified safety, maintenance, or operations personnel. Do not use this demonstration as a machine safeguard, emergency-warning system, or substitute for formal inspections and established safety procedures.

## License

The project code and accompanying original materials in this repository are released under the [MIT License](LICENSE), unless a file or third-party asset states otherwise. Third-party video and media remain subject to their respective licences and terms.
