# FitQuest AI — Pose Rhythm

FitQuest AI is a browser-based rhythm fitness game. The player uses a webcam to perform body poses in time with music. The current game mode is **Pose Rhythm**; the former runner-style game mode has been removed.

The gameplay pipeline uses **MediaPipe Pose Landmarker** to detect and smooth 33 body landmarks, then a **1D CNN** to classify a 30-frame sequence of pose features. The CNN is the pose classifier used by Pose Rhythm. The game does not use the old geometry-based pose scoring as a fallback when CNN inference is unavailable.

## How to play

1. Open the game over `https://` or `localhost`, allow camera access, and stand far enough back for your full body to fit in the frame.
2. Optionally choose **ทดสอบท่าทางทั้งหมด** in the main menu to view the live CNN probabilities for all eight model classes. This is a diagnostic screen; it does not change the model or gameplay confidence threshold.
3. Choose one of the built-in tracks or add a YouTube video. For YouTube, tap eight times to estimate BPM and beat offset, or analyze a matching audio file from your device to build a variable-tempo beat timeline. The companion audio is processed locally and is not uploaded.
4. Follow the count-in. The song clock and pose judging start together after the count-in.
5. Perform the current target. The song keeps playing if you do not perform it; the current target remains active and later targets wait in sequence.

### Current gameplay targets

Pose Rhythm uses the existing eight-class CNN model:

| Game target | CNN class |
|---|---|
| Arms up | `arm_raise` |
| Left arm up | `left_arm_up` |
| Right arm up | `right_arm_up` |
| Squat | `squat` |
| Left knee up | `knee_left` |
| Right knee up | `knee_right` |
| Jumping jacks | `jumping_jack` |

The model also includes `standing` as a background/reference class. It is not a playable target.

### Timing and feedback

- The timing bands are fixed at **PERFECT ±300 ms**, **GREAT ±600 ms**, and **GOOD ±900 ms**.
- A pose target does not expire into MISS when the player is late. If the player does not perform it, it remains the current target; the music does not pause.
- Hold notes require the player to maintain the recognized pose for the note duration.
- Jumping jacks are treated as a motion target and judged using the CNN's `jumping_jack` probability over the required duration.

## Getting started

Install the JavaScript dependencies and start the Vite development server:

```bash
npm install
npm run dev
```

The webcam requires a secure context: use `localhost` for local development or deploy over HTTPS.

### Useful commands

```bash
npm run dev                    # start the development server
npm run build                  # TypeScript project build + Vite production build
npm run lint                   # run Oxlint
npm run check                  # TypeScript checks + Oxlint
npm run verify:pose-rhythm     # beatmap, timing, scoring and rhythm rules
npm run verify:pose-runtime    # GPU preference and CPU fallback behavior
npm run verify:song-flow       # YouTube selection, persistence and playback clock
npm run verify:youtube-beats   # audio beat analysis and timeline behavior
npm run verify:player-progress # local progress, XP, goals and achievements
npm run verify-cnn-parity      # active 8-class CNN runtime and feature contract
npm run validate               # run the complete validation pipeline and production build
```

## Project structure

- `src/ai/` — camera management, MediaPipe pose detection, landmark features, 1D-CNN inference, and the jumping-jack tracker
- `src/game/scenes/` — Phaser game scenes, including Pose Rhythm and results
- `src/game/rhythm/` — beatmap generation, timing judgement, audio clock, YouTube beat analysis, and pose icons
- `src/ui/` — React menus, song selection, live CNN test, gameplay HUD, settings, and result UI
- `ml/` — dataset preparation, 1D-CNN training, evaluation, and model-export scripts
- `scripts/` — automated verification scripts

Player progress, recent sessions, weekly goals, and achievements are stored in the current browser's local storage. This repository does not configure an account service, cloud-save API, or online leaderboard.

## Pose detection and model

MediaPipe Pose Landmarker runs in the browser and supplies 33 landmarks. The 1D CNN consumes a sliding window of **30 frames** and predicts eight classes:

`arm_raise`, `jumping_jack`, `knee_left`, `knee_right`, `left_arm_up`, `right_arm_up`, `squat`, and `standing`.

The active browser model is:

`public/assets/models/pose-8class/model.json`

The feature extraction implementation in `ml/scripts/features.py` must remain consistent with its TypeScript counterpart, `src/ai/poseFeatures.ts`. Run `npm run verify-cnn-parity` after changing the feature contract or model.

The MediaPipe WASM runtime and `pose_landmarker_lite.task` are fetched from their configured CDN URLs on first use. To self-host them, place the required files under `public/assets/models` and set `VITE_POSE_WASM_PATH` and `VITE_POSE_MODEL_PATH`.

## Camera and privacy

- Camera access requires `https://` or `localhost`.
- Pose detection and CNN inference run in the browser.
- The webcam stream is not uploaded by this application.
- YouTube playback is provided by the YouTube player. Optional companion-audio analysis is performed locally in the browser.


## Dataset sources and attribution

The active `combined-real-8class` training set is assembled from these sources:

- **Physical Exercise Recognition** — [Kaggle dataset by Muhannad Tuameh](https://www.kaggle.com/datasets/muhannadtuameh/exercise-recognition). The project uses its `jumping_jack` and `squat` sequences for the combined pose dataset. The original exercise-class model asset also originates from this dataset. The project's earlier ML notes identify the license as **CC BY-NC-SA 4.0**; verify the dataset page and license terms before redistribution or commercial use.
- **WLU Rehabilitation Posture** — [Kaggle dataset by Sulaiman Muhammed](https://www.kaggle.com/datasets/sulaimanmuhammed/wlu-rehabilitation-posture?resource=download). The combined dataset builder uses the `Arm Raise Correct/` and `Arm Raise Incorrect/` video folders to create `arm_raise` examples. Confirm the source dataset's current license and attribution requirements before redistributing the videos or derived data.
- **Self-Data** — participant-recorded pose sequences supplied in the local `Self-Data/` folder. This is locally provided training data, not a public download link; retain the contributor consent and usage terms associated with those recordings.

The active builder records source counts and processing details in `ml/data/combined-real-8class/dataset_info.json`. Keep these source citations with the dataset documentation whenever the dataset is copied or redistributed. Synthetic standing-pose samples from earlier experiments are not part of the current real-only combined dataset.

## Training the 8-class model

The active model is trained from the real-only combined dataset, not the older synthetic standing-pose demonstration dataset. The dataset builder combines labeled sequences from `Self-Data/`, the `jumping_jack` and `squat` sequences in `Physical Exercise Recognition/`, and the videos in `Arm Raise Correct/` and `Arm Raise Incorrect/`.

See [ML documentation](./ml/README.md) for dataset preparation, training, evaluation, and export instructions. The training workflow is also available at `.github/workflows/train-combined-8class.yml`.

Training data and source videos may have separate licensing and attribution requirements. Check the terms for each source before redistributing data, trained weights, or using them commercially.
