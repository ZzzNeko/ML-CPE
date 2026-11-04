# Phase 6 — Game Integration

Phase 6 connects the live MediaPipe pose stream to gameplay.

## Runtime flow

`Webcam -> MediaPipe Pose -> smoothed 33 landmarks -> ExerciseRecognizer -> GameEvents -> Player/Score`

The browser currently uses `src/ai/ExerciseRecognizer.ts`, a conservative landmark-based runtime classifier. The Phase 5 scikit-learn `.pkl` artifact is kept for offline evaluation because a Python pickle cannot execute in the browser. A future ONNX/browser-exported model can replace the recognizer without changing the event contract.

## MVP controls

- Arms Up: jump / collect high items + score rep
- High Knees: jump / dodge + score rep
- Side Step: move left/right based on body shift + score rep
- Standing: neutral / no action

Predictions need stable frames and confidence >= 0.70 before they can drive gameplay. Actions have a short cooldown to prevent a single pose from farming unlimited score.

## Test checklist

1. Start camera and pass calibration.
2. Start game.
3. Confirm the `AI Move` HUD changes when performing an MVP pose.
4. Arms Up / High Knees should trigger a jump and score once per action window.
5. Side Step should move the player laterally.
6. Keyboard controls remain available as a development fallback.
7. If the camera disappears, the existing camera error banner remains visible.
