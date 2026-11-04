# Phase 8 — Game Integration

Phase 8 connects validated exercise repetitions to the actual Phaser gameplay loop.

## Implemented
- `GameController` is the bridge between AI predictions and gameplay.
- Validated reps drive player actions:
  - Arms Up / High Knees → jump/reach action
  - Side Step → left/right movement
  - Standing → stop movement
- Rep validation from Phase 7 controls score and combo; holding a pose does not farm reps.
- Three live missions track exercise-specific progress:
  - ยกแขน 3 ครั้ง
  - ยกเข่าสลับ 5 ครั้ง
  - ก้าวซ้าย/ขวา 4 ครั้ง
- Completing a mission grants +25 bonus points and emits mission feedback.
- Collectibles give their own point value on collision instead of incorrectly counting as exercise reps.
- Obstacles remain active during the session and reset combo on collision.
- React Mission Board displays progress and completion feedback.
- Keyboard controls remain as a development fallback.

## Runtime flow

`Webcam → MediaPipe Pose → Exercise Recognizer → Rep Counter → GameController → Player / Mission / Score / Combo → Phaser`

## Validation

Run:

```bat
npm install
npm run build
```

Then:

```bat
npm run dev
```
