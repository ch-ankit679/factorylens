# Asset inventory

## Original industrial operations clip

| Asset | Role | Duration |
|---|---|---:|
| `assets/videos/factory-input.mp4` | Source factory footage | 60.24 sec |
| `assets/videos/main-annotated.mp4` | Main inspection result | 25 sec |
| `assets/videos/nemotron-3-5-super-vl.mp4` | Nemotron 3.5 Super VL annotated result | 25 sec |
| `assets/videos/nemotron-3-nano-omni.mp4` | Nemotron 3 Nano Omni 30B A3B annotated result | 25 sec |
| `assets/videos/ling-3-2-flash.mp4` | Ling 3.2 Flash annotated result | 25 sec |
| `assets/data/demo-data.js` / `demo-data.json` | Browser replay data | — |
| `assets/data/inspection-report.json` | Inspection report | — |
| `assets/data/model-comparison-report.json` | Model-comparison report | — |

## Factory floor with marked pedestrian walkway

| Asset | Role | Duration |
|---|---|---:|
| `assets/videos/factory-walkway-input.mp4` | Second source video | 14.98 sec |
| `assets/videos/walkway-main-annotated.mp4` | Main six-event inspection result | 14.98 sec |
| `assets/videos/walkway-nemotron-3-5-super-vl.mp4` | Nemotron 3.5 Super VL annotated result | 14.98 sec |
| `assets/videos/walkway-nemotron-3-nano-omni.mp4` | Nemotron 3 Nano Omni 30B A3B annotated result | 14.98 sec |
| `assets/data/walkway-demo-data.js` / `walkway-demo-data.json` | Browser replay data | — |
| `assets/data/walkway-inspection-report.json` | Second clip inspection report | — |
| `assets/data/walkway-model-comparison-report.json` | Second clip model-comparison report, including Ling reconstruction caveat | — |

The second clip's supplied Ling-named annotated MP4 is byte-for-byte identical to the main annotated MP4. It is not published as a separate media asset or treated as proof of a completed Ling inference. Ling's second-run request returned HTTP 429; its findings and scorecard values are reconstructed and labelled accordingly.

All published MP4s are browser-compatible H.264 at 1280×720 with fast-start metadata. Poster images accompany the videos. The screen recordings were used as reference material and are not published in the site bundle.
