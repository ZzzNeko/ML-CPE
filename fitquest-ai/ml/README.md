# Machine Learning — 1D CNN Pose Classifier

This directory contains the data preparation and training pipeline for FitQuest AI's active **eight-class 1D CNN**.

The browser runtime uses MediaPipe Pose Landmarker to produce 33 landmarks per frame. The feature pipeline converts each frame into 52 pose features. The 1D CNN reads a sliding window of **30 frames** and predicts one of these classes:

```text
arm_raise
jumping_jack
knee_left
knee_right
left_arm_up
right_arm_up
squat
standing
```

The active model is `public/assets/models/pose-8class/model.json`. Pose Rhythm maps six static targets to the corresponding CNN classes; jumping jacks use the `jumping_jack` prediction as a motion target. `standing` is a reference/background class, not a playable target.


## Source datasets, links, and attribution

The current `combined-real-8class` builder uses the following source material:

| Source | Link / location | How it is used |
|---|---|---|
| Physical Exercise Recognition | [Kaggle — Muhannad Tuameh](https://www.kaggle.com/datasets/muhannadtuameh/exercise-recognition) | The builder selects the `jumping_jack` and `squat` sequences from the prepared `landmarks.csv` and `labels.csv`. |
| WLU Rehabilitation Posture | [Kaggle — Sulaiman Muhammed](https://www.kaggle.com/datasets/sulaimanmuhammed/wlu-rehabilitation-posture?resource=download) | Videos in `Arm Raise Correct/` and `Arm Raise Incorrect/` are processed with MediaPipe Pose Landmarker to create `arm_raise` sequences. |
| Self-Data | Local `Self-Data/` folder | Participant-recorded labeled pose sequences. This source is provided locally and does not have a public dataset URL in this repository. |

The project ML notes previously identify the Physical Exercise Recognition dataset license as **CC BY-NC-SA 4.0**. Check the original Kaggle dataset page and its current license before redistribution or commercial use. The WLU dataset's license and attribution requirements must also be confirmed from its original source. Do not assume that derived landmarks or trained weights are exempt from source dataset terms.

The dataset builder writes source counts and processing metadata to `ml/data/combined-real-8class/dataset_info.json`. Preserve this attribution section when sharing the combined dataset or its documentation.

## Dataset used by the active model

The current real-only dataset is built at:

`ml/data/combined-real-8class/`

It contains:

- `Self-Data/` — labeled participant recordings for the eight classes.
- `Physical Exercise Recognition/` — the `jumping_jack` and `squat` sequences from the prepared landmark dataset.
- `Arm Raise Correct/` and `Arm Raise Incorrect/` — source videos processed into `arm_raise` landmark sequences.

The dataset metadata is written to `ml/data/combined-real-8class/dataset_info.json`. The current builder sets `synthetic_data_included: false`. Dataset splitting uses participant groups for Self-Data when group IDs are supplied, and video IDs for the other sources.

### Expected input layout

Run commands from the repository root. Provide the source data in this layout (the builder options can override the default paths):

```text
Self-Data/
  landmarks.csv
  labels.csv
Physical Exercise Recognition/
  landmarks.csv
  labels.csv
Arm Raise Correct/
  *.mp4
Arm Raise Incorrect/
  *.mp4
ml/models/
  pose_landmarker_lite.task
```

The CSV files must use the 33-landmark schema expected by the builder. Self-Data labels must use the supported class names. See `ml/scripts/build_real_8class_dataset.py` for the exact accepted labels and conversion rules.

## Prepare the dataset

Install the Python dependencies:

```bash
python -m pip install -r ml/requirements.txt
```

Download the official MediaPipe Pose Landmarker Lite task model:

```bash
mkdir -p ml/models
```

On Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force ml/models | Out-Null
Invoke-WebRequest `
  -Uri "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task" `
  -OutFile "ml/models/pose_landmarker_lite.task"
```

Build the real-only dataset:

```bash
python ml/scripts/build_real_8class_dataset.py --pose-model ml/models/pose_landmarker_lite.task
```

Optional path overrides:

- `--self-data` — defaults to `Self-Data`
- `--physical` — defaults to `Physical Exercise Recognition`
- `--arm-root` — defaults to the repository root; expects the two Arm Raise folders beneath it
- `--output` — defaults to `ml/data/combined-real-8class`
- `--fps` — arm-raise video sampling rate; defaults to 10
- `--window` — minimum number of sampled frames per arm-raise clip; defaults to 30

## Train and export

Train the model and export the browser weights without changing the default training output directories:

```bash
python ml/scripts/train_cnn.py \
  --kaggle ml/data/combined-real-8class \
  --epochs 60 \
  --model-dir ml/models/experiments/combined-real-8class \
  --web-dir public/assets/models/pose-8class
```

The `--kaggle` option is the trainer's input-directory argument; it expects a directory containing `landmarks.csv` and `labels.csv`. It does not download data from Kaggle.

Useful options include:

- `--window 30` — temporal window length
- `--stride 5` — stride between training windows
- `--epochs 60` — maximum training epochs
- `--seed 42` — reproducible split and initialization
- `--learning-rate 0.001`
- `--batch-size 64`
- `--noise-std 0.03`
- `--no-pose-augmentation` — disable geometric pose augmentation
- `--no-export-web` — do not write the browser model

The trainer performs video/group-aware train, validation, and test splits, applies training-only augmentation, evaluates the test split, and writes metrics and plots. Use validation results for model selection; keep the test split for final evaluation.

## Outputs

With the command above, the main outputs are:

| File | Purpose |
|---|---|
| `ml/models/experiments/combined-real-8class/cnn1d.keras` | Trained Keras model |
| `ml/models/experiments/combined-real-8class/metrics.json` | Accuracy, macro-F1, per-class metrics, and confusion matrix |
| `ml/models/experiments/combined-real-8class/reports/` | Training curves and test evaluation plots |
| `ml/models/experiments/combined-real-8class/golden.json` | Reference data used by the CNN parity check |
| `public/assets/models/pose-8class/model.json` | Browser inference weights used by the game |

The exact output set is determined by `ml/scripts/train_cnn.py`.

## Verify the browser model

From the repository root:

```bash
npm run verify-cnn-parity
```

This checks the active eight-class model, 30-frame window, 52-feature contract, finite normalization values, and browser inference output. It is a runtime/feature smoke test; it is not a substitute for evaluating accuracy on a held-out real-camera test set.

The Python feature implementation in `ml/scripts/features.py` and TypeScript implementation in `src/ai/poseFeatures.ts` must stay in sync.

## Important notes

- Synthetic standing-pose data was used in earlier pipeline experiments. It is **not** included in the current `combined-real-8class` dataset.
- Synthetic samples must not be used to claim real-camera accuracy.
- The active browser model is the eight-class model under `public/assets/models/pose-8class/`, not the older five-class `public/assets/models/cnn/` model.
- Check the license and attribution terms of every source dataset and video before redistribution or commercial use.
