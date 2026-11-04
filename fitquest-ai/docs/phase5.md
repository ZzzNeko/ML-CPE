# Phase 5 — Model Training & Evaluation

## Kaggle dataset

The downloaded `Physical Exercise Recognition` folder is expected to contain:

- `landmarks.csv`
- `labels.csv`
- `angles.csv`
- `calculated_3d_distances.csv`
- `xyz_distances.csv`

For training, the adapter intentionally uses **only `landmarks.csv` + `labels.csv`**. The other CSVs are derived features and are not fed directly into the same feature pipeline as the game's MediaPipe landmarks.

Run from the project root:

```bat
python ml/scripts/train.py --kaggle "Physical Exercise Recognition" --out-dir ml/models
```

Or validate/export first:

```bat
python ml/scripts/prepare_kaggle.py "Physical Exercise Recognition" --out data/kaggle-physical-exercise.json
```

Then:

```bat
python ml/scripts/train.py data/kaggle-physical-exercise.json --out-dir ml/models
```

The Kaggle dataset contains posture-state labels such as `jumping_jacks_up` / `down`; the adapter collapses those to the exercise label `jumping_jack`.

Phase 4 browser-side dataset collection is intentionally skipped. Kaggle/prepared pose data is the training source for Phase 5, while the MVP game-specific classes `arms_up`, `high_knees`, and `side_step` continue to use the deterministic landmark recognizer until a dedicated trained classifier is supplied.
