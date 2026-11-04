# Phase 13 — Pose Rhythm (Audition-style)

Do the pose on the beat. Poses replace button presses: a standing pose appears, the beat arrives, and the player has to be in that pose. Combo and score keep stacking.

Menu → **Pose Rhythm** (scene key `PoseRhythm`). The old touch-circle mode (`Rhythm`) is registered in `Game.ts` but still has no menu button.

## Song selection and synchronized start

The song picker offers five built-in rhythm presets and accepts YouTube watch,
short, embed, and Shorts links. YouTube entries use the IFrame Player API, which
does not expose raw audio to this app. For a beat-by-beat chart, the player
selects a matching audio file from their device; it is decoded locally and
analyzed in a Web Worker, and the audio itself is neither uploaded nor saved.
The player must confirm that the file is the same edit/version and starts at
the same point as the video. The analysis estimates tempo in overlapping
12-second windows stepped every 6 seconds, creates beat timestamps and
confidence values, and omits beats over quiet intervals. Low-confidence
analysis is rejected. Eight-tap tempo remains available as a fallback and its
offset can be adjusted in 25 ms steps. An analyzed timeline can also be nudged
by 25 ms steps to compensate for a small version/alignment difference.
The duration is read from the YouTube player.
Selection only prepares the track. The Play scene runs the count-in, keeps pose
judging disabled while the song clock is negative, then starts the YouTube
player and gameplay at zero. Generated tracks keep their synthesized backing;
YouTube tracks use the count-in clicks without the generated backing. The count-in follows the configured beat; GO! clears before the music clock
starts. The gameplay player has no seek/skip controls and the session ends on
the YouTube player's ended event or the selected track duration.

### YouTube rhythm analysis and chart generation
`youtubeBeatDetection.ts` extracts spectral-flux onset strength and windowed
energy from the user-selected audio. Autocorrelation estimates a local tempo;
the phase is aligned to nearby onset peaks to create absolute beat timestamps,
intervals, confidence, energy, and tempo/density segments. Since tempo analysis
is local to windows, tempo changes do not accumulate drift from extrapolating a
single BPM across the track. The YouTube player's current time remains the
gameplay clock; pause/resume and seek re-anchor against that clock, and replay
starts the chart again at zero. The chart is kept in memory for the current
video selection; after reloading the app, analyze the companion file again.

`buildPoseBeatmapFromTimeline()` schedules poses only on detected beats with
usable confidence, skips long gaps rather than filling silence, and spaces
Normal notes by roughly 7–9 beats with at least 3.1 seconds of recovery. Each
note has a separate cue timestamp (up to 2.3 seconds early) and judgement
timestamp. Existing early pose acquisition remains active: holding a correct
pose through the judgement beat scores, while an abandoned early pose does
not. Low-confidence beat analysis can use the existing tap-tempo fixed-grid
fallback. Detection is not a guarantee of musical downbeats for every
polyrhythmic or heavily syncopated track; preview and offset controls are
available before starting.

## Phase 1 — core loop (done)
- `src/ai/poseTargets.ts` — 6 standing poses (arms up, squat, left/right arm up, left/right knee up). Each has a 0–1 geometric match score (units of torso length, so camera distance doesn't matter) and a stick-figure icon. Rules and icons share one definition.
- `src/game/rhythm/poseBeatmap.ts` — seeded pose patterns with section-dependent spacing; repeated poses are avoided (no free hits by standing still). Easy 84 BPM / 3 poses, normal 100 BPM / 4, hard 120 BPM / 6.
- `src/game/scenes/PoseRhythmScene.ts` — pose card, approach ring + live match meter, next-pose preview, beat pulse, count-in, judging, combo, score.
- Reuses `RhythmAudio` (WebAudio synth, song clock) and the existing Result screen.

### Rules
- A pose counts when its score reaches its configured threshold for 3 consecutive pose frames.
- Windows around the beat: ±0.18s perfect / ±0.30 great / ±0.45 good. Holding the pose through the beat = perfect; the grade commits when the perfect window closes.
- Score = 300 / 150 / 50 × (1 + combo/100, capped at ×2). Miss resets combo.

### Tuning
Thresholds, windows, points: top of `PoseRhythmScene.ts` and `POSE_MATCH_THRESHOLD` in `poseTargets.ts`. Per-pose geometry: the `ramp(...)` ranges in `poseTargets.ts`. BPM / pose pool: `POSE_LEVELS`.

## Phase 2 — Audition feel (done)

### Files
- `src/game/rhythm/poseBeatmap.ts` — song builder: single poses, **chains**, **holds**, **motion moves**; per-difficulty length and beat timing
- `src/game/rhythm/poseJudge.ts` — pure rules (windows, grades, scoring, fever, chains, per-pose stats). No Phaser, so it is testable
- `src/game/rhythm/poseIconDraw.ts` — stick-figure drawing shared by the game
- `src/game/scenes/PoseRhythmScene.ts` — the lane, cursor, card, fever bar, judging
- `src/game/rhythm/youtubeSong.ts` — persisted track selection and YouTube playback clock
- `src/game/rhythm/youtubeBeatDetection.ts` — local audio spectral-flux and variable-tempo analysis
- `src/game/rhythm/youtubeBeatWorker.ts` — isolates analysis from gameplay/UI rendering
- `src/ui/YouTubeSongPanel.tsx` — song picker, companion audio analysis, tap-tempo fallback, and YouTube player lifecycle
- `src/ai/JumpingJackTracker.ts` — jumping-jack detection (CNN-only in the opt-in experiment; hybrid in normal play)
- `src/ui/CnnPoseTestPanel.tsx` — live CNN probabilities for every model class
- `src/ai/poseCalibration.ts` — legacy geometry thresholds used by normal play; there is no calibration screen in the menu
- `scripts/verify-pose-rhythm.mjs` — `npm run verify:pose-rhythm` (beatmap invariants + judge/score/fever/chain rules)
- `scripts/verify-song-flow.mjs` — `npm run verify:song-flow` (YouTube URL, persistence, and clock behavior)
- `scripts/verify-youtube-beats.mjs` — `npm run verify:youtube-beats` (synthetic constant/variable tempo, breaks, confidence, cue lead, density, pause, seek, and replay)
- `scripts/verify-pose-runtime.mjs` — `npm run verify:pose-runtime` (GPU preference and CPU fallback)
- `scripts/verify-player-progress.mjs` — `npm run verify:player-progress` (profile migration, XP, weekly goals and achievements)

### Audition lane
A bar along the bottom shows one **page** of 8 beats (two bars). Each note is an icon chip placed by its time; the gold **cursor sweeps left → right** and the page flips when it reaches the end. A dim strip underneath previews the next page, so a note on beat 1 of a page is never a surprise. Chips turn gold / grey / red as they are judged. The big card on the left is still the note you are on now; the queue on the right still shows the next three.

### Combo chains
2–4 poses on **consecutive beats** (easy: 2, normal: up to 3, hard: up to 4). Chain notes are linked on the lane and the card shows `CHAIN 2/3`. Finish a chain with no miss for a bonus of `100 × length` (doubled if every pose was PERFECT), multiplied by the current multiplier. One miss breaks the chain bonus (the other notes still score).
Because chain notes are close together their timing windows shrink with the gap (never below 60% of normal): at 120 BPM a chain note's windows are ±0.11 / ±0.18 / ±0.27 s.

### Fever
Filled by perfects: PERFECT +8%, GREAT +3%, GOOD 0, MISS −25%. At 100% **Fever** runs for 16 beats (the bar drains; it cannot refill while on): score multiplier `+1`. Multiplier = `1 + min(combo,100)/100 + (Fever ? 1 : 0)`, so ×1 … ×3. Fever shows a gold frame around the screen.

### Hold poses
A hold note has a bar on the lane. Hit it on the beat as usual, then **keep the pose for the whole bar** (a ring around the card fills; red where you dropped it). Final grade = timing grade, capped by how much of the hold you kept: ≥85% keeps it, ≥60% GREAT at most, ≥30% GOOD at most, below that MISS. Holds are worth ×1.5. Knee raises are never held. Easy/normal hold 2 beats, hard 3.

### Motion moves — jumping jacks
Normal and hard only. A motion note says **กระโดดตบ** and lasts 5 (normal) / 6 (hard) beats, with a beat of lead-in so you can start early. It is graded by the share of its span you were moving: ≥60% PERFECT, ≥40% GREAT, ≥20% GOOD, else MISS. Worth ×2. Never in the first four notes and never twice in a row.
In normal play, "moving" = the existing 1D CNN says `jumping_jack` (p ≥ 0.75) **and** the arms are actually swinging, **or** the geometric counter saw 2 jacks (arms up + feet wide ↔ arms down + feet together) in 3.2 s. The opt-in dev experiment (`VITE_CNN_EXPERIMENT=true`) instead requires the CNN alone at p ≥ 0.20. That threshold is a decision cutoff, not an accuracy claim. Detection lags about a second, so the first time it fires the player is credited for up to 0.8 s before it (once per move).

### CNN pose test
The main menu's **ทดสอบท่าทางทั้งหมด** button opens a live probability view for every class in the currently selected CNN model. Hold or perform a pose and compare its probability with the other classes. The view does not save personal thresholds or change gameplay; the percentages are model confidence, not real-world accuracy.

The detector prefers the GPU delegate and retries model creation on CPU if
GPU setup fails. A GPU runtime failure also triggers a CPU retry; the UI
indicates CPU mode and reports when both delegates fail. Arm and leg targets
consider joint angles and use world landmarks when they are visible. Scoring
requires three consecutive matched frames to reduce single-frame false hits.

### Longer songs
60 s → **90 s easy / 120 s normal / 150 s hard**. The backing track now changes with the song: a different chord progression every third four-bar section and a lead melody from bar 8. For quick testing set `VITE_POSE_SONG_SECONDS=30` in `.env.local`.

### Result screen
Per-pose accuracy bars (weakest first, so it is obvious what to practise), a "ควรฝึกเพิ่ม" hint for a pose under 70% that was asked at least twice, chains completed, and Fever count.

### Song tempo and pose timing
Heart-rate readings are display-only and never change game tempo. Built-in tracks use their selected track BPM; YouTube tracks use the BPM saved with that selection; when no track is selected, the chosen difficulty's BPM is used. The beatmap, timing windows, countdown clock, and beat feedback all use that same fixed BPM for the full round. YouTube BPM is entered in the song picker, so it should match the video's actual tempo.

The first pose target lands on beat 5, after one full measure establishes the song groove. Its pose cue appears one beat before that target, instead of appearing immediately when the song clock starts. Later targets stay on the beat grid, and the right-side pose frame fills toward each target and briefly flashes on the beat. Starting another round clears the previous YouTube ended state and resets its clock before the count-in, so a completed YouTube song can be replayed.

The song picker uses the main-menu glossy hover treatment on its buttons and selected track, with floating musical notes and sparkles. These animations are disabled when reduced motion is enabled.

### Song progression and player progress
Beatmap density and challenge odds follow deterministic intro, build, chorus,
break and final sections of the track. Eligible single poses in the song can
be marked as Perfect Challenges for an extra 150 points; chains, holds and
jumping-jack moves remain available as other challenge patterns. Player XP,
seven-day goals, achievements and the last 100 sessions are stored in the
browser. The statistics and achievement panels expose this local progress.
The repository has no authentication or backend service, so cloud saves and
an online leaderboard remain out of scope until those APIs are supplied.

### Tuning
Windows, points, fever gains, hold/motion grading: top of `poseJudge.ts`. Chain/hold/motion odds, lengths, BPM, pose pool, song length: `POSE_LEVELS` in `poseBeatmap.ts`. Lane layout and page size: `LANE`, `PAGE_BEATS` in `PoseRhythmScene.ts`. Calibration constants: `CALIBRATION` in `poseCalibration.ts`. Jumping-jack detection: constants at the top of `JumpingJackTracker.ts`, and `jackPhase` in `poseTargets.ts`.

### Validation and hardware verification
`npm run validate` runs TypeScript/lint, whole-song beatmap and judging
simulations, pose scoring/calibration checks, GPU/CPU fallback tests, YouTube
song-flow and player-progression tests, CNN golden-vector parity, production
build, and deployment-output checks. Browser smoke testing confirms the
statistics/achievement panels and built-in-song count-in/gameplay transition.
The camera was unavailable in the test browser, so real-device pose accuracy,
GPU failure recovery on specific hardware, and full YouTube playback still
need manual verification on supported devices.
