# Phase 7 — Rep Counter

Phase 7 adds an exercise-specific repetition state machine between pose recognition and scoring.

## State rules

- **Arms Up:** neutral -> arms up = one rep; holding arms up does not repeatedly score.
- **High Knees:** alternating detected knee sides produce reps; the same side held does not repeatedly score.
- **Side Step:** alternating left/right movement produces reps; holding one side does not repeatedly score.
- Low-confidence predictions (< 0.70) do not count.
- A short 350 ms minimum rep gap rejects duplicate detections caused by frame noise.
- `standing` returns the state machines to recovery/neutral.

## Runtime flow

`Webcam -> MediaPipe -> smoothed landmarks -> ExerciseRecognizer -> RepCounter -> Score/Combo -> Phaser`

## Feedback

Every accepted rep emits `REP_FEEDBACK`, which the React overlay displays with the rep number and movement direction.

## Acceptance checklist

1. Holding Arms Up for several seconds counts once until the player recovers.
2. Repeating High Knees alternately increments reps without frame-by-frame farming.
3. Repeating Side Steps alternately increments reps.
4. Confidence below 0.70 produces no rep.
5. Each accepted rep increments score and combo once.
6. Feedback overlay appears for accepted reps.
