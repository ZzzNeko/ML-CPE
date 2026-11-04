# Phase 10 — Testing & Deployment

Phase 10 makes the Phase 9 game ready for real browser testing and static hosting.

## Implemented

- Added a production validation script: `npm run verify:deployment`.
- Added a combined pre-deploy command: `npm run validate`.
- Added Vercel SPA routing and long-lived asset caching in `vercel.json`.
- Added Netlify build, SPA fallback routing, and asset caching in `netlify.toml`.
- Added `.env.example` for optional self-hosting of the MediaPipe WASM runtime and pose model.
- Kept webcam/pose processing client-side; no camera upload endpoint was introduced.
- Documented a cross-browser, camera, lighting, FPS, and permission test matrix below.

## Validation commands

Run from the project root:

```bash
npm install
npm run check
npm run build
npm run verify:deployment
```

Or run everything with:

```bash
npm run validate
```

`verify:deployment` checks that Vite produced `dist/index.html`, the favicon, the React root, and the expected asset structure.

## Browser test matrix

Test the deployed HTTPS URL, not only localhost.

| Area | Chrome | Edge | Webcam A/B | Bright room | Dim room |
|---|---|---|---|---|---|
| Camera permission | [ ] | [ ] | [ ] | [ ] | [ ] |
| Camera preview | [ ] | [ ] | [ ] | [ ] | [ ] |
| Pose landmarks | [ ] | [ ] | [ ] | [ ] | [ ] |
| Calibration | [ ] | [ ] | [ ] | [ ] | [ ] |
| Gameplay controls | [ ] | [ ] | [ ] | [ ] | [ ] |
| Result screen | [ ] | [ ] | [ ] | [ ] | [ ] |
| Camera stop/release | [ ] | [ ] | [ ] | [ ] | [ ] |

Also test at least one laptop and one lower-performance device when available.

## Acceptance targets

- Camera permission is understandable and recoverable after denial.
- Camera can be started, stopped, and switched without leaving an active stream.
- Player can test all CNN pose classes with the whole body visible.
- Gameplay remains usable when pose processing is around the configured 15–30 FPS budget.
- Low detection FPS is surfaced by the existing pose UI warning.
- The game still provides the documented keyboard fallback for development.
- Reloading the deployed page does not produce a blank screen on a deep URL.
- HTTPS is used for the production URL because webcam access requires a secure context.

## Camera/privacy verification

Before release, confirm in browser DevTools that the application has no request that uploads webcam frames. The intended flow is local:

`Webcam → MediaPipe Pose → exercise recognition → Phaser`

The design requires permission messaging, camera release, and local-first processing. Do not add analytics or server-side video capture without updating the privacy notice and user consent flow.

## Deployment — Vercel

1. Push the project to Git.
2. Import the repository into Vercel.
3. Use the detected Vite settings, or explicitly set:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Deploy.
5. Open the HTTPS deployment and perform the browser test matrix.

`vercel.json` already supplies SPA fallback routing and immutable caching for Vite assets.

## Deployment — Netlify

1. Create a new site from the repository.
2. Set the build command to `npm run build`.
3. Set publish directory to `dist`.
4. Deploy.
5. Open the HTTPS deployment and perform the browser test matrix.

`netlify.toml` already contains the build, SPA fallback, and asset cache configuration.

## Optional self-hosted MediaPipe assets

The default configuration continues to use the MediaPipe CDN. For a deployment that should serve the model assets itself, place the WASM runtime under:

```text
public/assets/models/wasm/
```

and the pose model at:

```text
public/assets/models/pose_landmarker_lite.task
```

Then configure:

```text
VITE_POSE_WASM_PATH=/assets/models/wasm
VITE_POSE_MODEL_PATH=/assets/models/pose_landmarker_lite.task
```

Do not commit model files unless their redistribution/license terms have been verified.

## Phase 10 completion

The source is deployment-configured, but physical device/browser testing must be performed against the deployed site. The checklist above is intentionally left as a real-world test record rather than claiming tests that were not run on those devices.
