# Phase 9 — UI และ Result

## Implemented

- Added a dedicated React Result screen over the Phaser canvas.
- Result screen shows:
  - Total score
  - Total reps
  - Recognition accuracy
  - Play time
  - Completed missions
- Added `Play Again` and `Main Menu` actions.
- Added a Settings panel accessible from the main application header.
- Settings are persisted in browser local storage:
  - Difficulty selection
  - Show/hide in-game camera preview
  - Reduced interface motion
- Added Result/Game event contracts so React and Phaser remain loosely coupled.
- Fixed the Phase 8 build/runtime integration so validated repetitions flow through `GameController` instead of duplicating the rep-counter logic in `PlayScene`.
- Result data is produced when the timer reaches zero and includes session score, reps, accuracy, play time, and mission completion count.

## Accuracy

For the gameplay result screen, accuracy is the percentage of pose-recognition frames whose confidence meets the gameplay threshold (`>= 0.70`) during the session. This is a session recognition-confidence indicator, not the ML test-set Accuracy/Precision/Recall/F1 metrics from Phase 5.

## Flow

`Menu → Calibration → Play → Result → Play Again / Main Menu`

## Validation

TypeScript compilation was checked with:

```bat
npx tsc -b
```

The TypeScript build passes. A full Vite production build depends on the local `node_modules` native Rolldown optional binding being installed correctly; the provided archive's dependency installation is missing that native binding.
