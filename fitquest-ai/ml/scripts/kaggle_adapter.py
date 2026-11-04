"""Convert the Kaggle Physical Exercise Recognition dataset into FitQuest samples.

This dataset is distributed as several aligned CSV files, notably:
  - landmarks.csv: one row per sample, MediaPipe landmark coordinates
  - labels.csv: one label per sample (often labels such as jumping_jacks_up)
  - angles.csv / xyz_distances.csv / calculated_3d_distances.csv: derived features

The trainer intentionally uses only landmarks + labels so the feature pipeline is
compatible with the project MediaPipe landmark pipeline.
"""
from __future__ import annotations
import csv, re
from pathlib import Path


def _norm(s: str) -> str:
    return re.sub(r'[^a-z0-9]+', '_', str(s).strip().lower()).strip('_')


def find_label_column(fields: list[str]) -> str:
    preferred = ['label', 'exercise', 'class', 'activity', 'pose', 'target', 'y']
    by_norm = {_norm(f): f for f in fields}
    for p in preferred:
        if p in by_norm:
            return by_norm[p]
    for f in fields:
        n = _norm(f)
        if any(x in n for x in ['label', 'exercise', 'activity', 'class', 'pose']):
            return f
    # labels.csv from this Kaggle dataset is commonly a single-column CSV.
    if len(fields) == 1:
        return fields[0]
    raise ValueError(f'Could not find a label column. Columns: {fields[:20]}')


def _landmark_patterns(index: int, axis: str):
    return [
        rf'^landmark_?{index}_?{axis}$', rf'^lm_?{index}_?{axis}$',
        rf'^{index}_?{axis}$', rf'^{axis}_?{index}$',
        rf'^pose_?{index}_?{axis}$', rf'^keypoint_?{index}_?{axis}$',
    ]


def find_landmark_columns(fields: list[str]) -> list[dict[str, str | None]]:
    normalized = {_norm(f): f for f in fields}
    result = []
    for i in range(33):
        row = {}
        for axis in ('x', 'y', 'z', 'visibility'):
            match = None
            for pat in _landmark_patterns(i, axis):
                for n, original in normalized.items():
                    if re.match(pat, n):
                        match = original
                        break
                if match:
                    break
            row[axis] = match
        if not row['x'] or not row['y']:
            return []
        result.append(row)
    return result


def _float(value, default=0.0):
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def _numeric_values(row: dict[str, str], fields: list[str]) -> list[float]:
    """Return numeric fields in column order, excluding obvious row IDs."""
    vals = []
    for f in fields:
        n = _norm(f)
        if n in {'id', 'index', 'sample_id', 'row_id'}:
            continue
        try:
            vals.append(float(row[f]))
        except (ValueError, TypeError):
            continue
    return vals


def _landmarks_from_row_cached(row, schema, numeric_fields):
    if schema:
        return [
            {'x': _float(row[c['x']]), 'y': _float(row[c['y']]),
             'z': _float(row[c['z']], 0.0),
             'visibility': _float(row[c['visibility']], 1.0) if c['visibility'] else 1.0}
            for c in schema
        ]
    vals = []
    for f in numeric_fields:
        try:
            vals.append(float(row[f]))
        except (ValueError, TypeError):
            vals.append(0.0)
    if len(vals) < 99:
        raise ValueError(f'landmarks.csv row has only {len(vals)} numeric landmark values; need at least 99.')
    vals = vals[:99]
    return [
        {'x': vals[i*3], 'y': vals[i*3+1], 'z': vals[i*3+2], 'visibility': 1.0}
        for i in range(33)
    ]


def canonical_label(raw: str) -> str:
    s = _norm(raw)
    # This dataset labels posture states (e.g. jumping_jacks_up/down). Collapse
    # state suffixes to the exercise class where possible.
    s = re.sub(r'_(up|down|left|right|start|end)$', '', s)
    s = s.replace('jumping_jacks', 'jumping_jack')
    mapping = {
        'push_up': 'kaggle_push_up', 'pushup': 'kaggle_push_up',
        'pull_up': 'kaggle_pull_up', 'pullup': 'kaggle_pull_up',
        'sit_up': 'kaggle_sit_up', 'situp': 'kaggle_sit_up',
        'jumping_jack': 'jumping_jack',
        'squat': 'kaggle_squat', 'squats': 'kaggle_squat',
    }
    return mapping.get(s, f'kaggle_{s or "unknown"}')


def _split_for(index: int) -> str:
    # Deterministic sample split for this Kaggle bootstrap dataset.
    bucket = index % 20
    if bucket < 3:
        return 'test'
    if bucket < 6:
        return 'validation'
    return 'train'


def _candidate_group_columns(fields):
    preferred = [
        'video_id', 'videoid', 'video', 'video_name', 'filename', 'file_name',
        'clip_id', 'clip', 'sequence_id', 'sequence', 'seq_id', 'sequence_name',
        'record_id', 'record', 'sample_id', 'sample', 'source_id', 'source'
    ]
    norm = {_norm(f): f for f in fields}
    out = []
    for p in preferred:
        if p in norm and norm[p] not in out:
            out.append(norm[p])
    return out


def _choose_group_column(rows, fields, expected_count):
    """Find the frame/video grouping column in the time-series landmarks CSV."""
    for col in _candidate_group_columns(fields):
        vals = [str(r.get(col, '')).strip() for r in rows]
        uniq = list(dict.fromkeys(vals))
        if 1 < len(uniq) <= 1000 and (expected_count is None or len(uniq) == expected_count):
            return col, uniq
    # Fall back to any non-landmark, non-numeric-ish column with a plausible number of groups.
    excluded = set(sum(([c['x'], c['y'], c['z'], c['visibility']] for c in find_landmark_columns(fields)), []))
    excluded_norm = {_norm(x) for x in excluded if x}
    best = None
    for col in fields:
        if _norm(col) in excluded_norm:
            continue
        vals = [str(r.get(col, '')).strip() for r in rows]
        uniq = list(dict.fromkeys(vals))
        if 1 < len(uniq) <= 1000 and (expected_count is None or len(uniq) == expected_count):
            best = (col, uniq)
            break
    return best if best else (None, None)


def _label_rows(path):
    with path.open('r', encoding='utf-8-sig', newline='') as f:
        r = csv.DictReader(f)
        fields = r.fieldnames or []
        rows = list(r)
    label_col = find_label_column(fields)
    return fields, rows, label_col


def _label_key_column(fields, landmark_fields):
    lm_norm = {_norm(f): f for f in landmark_fields}
    preferred = ['video_id','videoid','video','video_name','filename','file_name','clip_id','clip',
                 'sequence_id','sequence','seq_id','sequence_name','record_id','record','sample_id','sample']
    for p in preferred:
        if p in lm_norm:
            for f in fields:
                if _norm(f) == p:
                    return f, lm_norm[p]
    return None, None


def read_aligned_kaggle_folder(path: Path, max_frames_per_group: int = 24) -> list[dict]:
    """Read the Kaggle time-series dataset efficiently.

    The dataset has many frames (83k+) but only ~448 video labels. We first scan
    only the grouping column, then make a second pass and keep at most
    ``max_frames_per_group`` evenly-spaced frames per video. This avoids creating
    tens of thousands of expensive feature vectors and makes SVM training practical.
    """
    import math
    landmarks_path = path / 'landmarks.csv'
    labels_path = path / 'labels.csv'
    if not landmarks_path.exists() or not labels_path.exists():
        raise ValueError(f'Expected landmarks.csv and labels.csv in {path}')

    print('[Phase 5] Reading labels.csv...', flush=True)
    y_fields, y_rows, label_col = _label_rows(labels_path)
    if not y_rows:
        raise ValueError('labels.csv is empty.')

    print('[Phase 5] Scanning landmarks.csv for video/sequence groups...', flush=True)
    with landmarks_path.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        lm_fields = reader.fieldnames or []
        candidate_cols = _candidate_group_columns(lm_fields)
        counts = {c: {} for c in candidate_cols}
        total_rows = 0
        sample_rows = []
        for row in reader:
            total_rows += 1
            if len(sample_rows) < 20:
                sample_rows.append(row)
            for c in candidate_cols:
                v = str(row.get(c, '')).strip()
                if v:
                    counts[c][v] = counts[c].get(v, 0) + 1

    if total_rows == 0:
        raise ValueError('landmarks.csv is empty.')

    # Prefer a column with exactly one value per label/video.
    group_col = None
    groups = None
    for c in candidate_cols:
        uniq = list(counts[c].keys())
        if len(uniq) == len(y_rows):
            group_col, groups = c, uniq
            break

    # Fallback: inspect other columns for a plausible sequence key.
    if group_col is None:
        excluded = {_norm(f) for f in (find_landmark_columns(lm_fields) or []) for f in [f.get('x'), f.get('y'), f.get('z'), f.get('visibility')] if f}
        for c in lm_fields:
            if _norm(c) in excluded or c in candidate_cols:
                continue
            vals = {}
            with landmarks_path.open('r', encoding='utf-8-sig', newline='') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    v = str(row.get(c, '')).strip()
                    if v:
                        vals[v] = vals.get(v, 0) + 1
            if len(vals) == len(y_rows):
                group_col, groups = c, list(vals.keys())
                counts[c] = vals
                break

    if group_col is None:
        raise ValueError(
            f'Could not find the video/sequence grouping column. Found {total_rows} landmark frames and {len(y_rows)} labels. '
            f'Landmark columns: {lm_fields[:30]}; label columns: {y_fields[:30]}'
        )

    # Shared key in labels.csv, if available; otherwise labels are in sequence order.
    label_key, lm_key = _label_key_column(y_fields, lm_fields)
    label_by_key = {}
    if label_key and lm_key == group_col:
        for row in y_rows:
            key = str(row.get(label_key, '')).strip()
            label = str(row.get(label_col, '')).strip()
            if key and label:
                label_by_key[key] = label
    if not label_by_key:
        label_by_key = {groups[i]: str(y_rows[i][label_col]).strip() for i in range(min(len(groups), len(y_rows)))}

    # Stable video-level split. No frame from a video crosses splits.
    group_to_split = {}
    for i, g in enumerate(groups):
        bucket = i % 20
        group_to_split[g] = 'test' if bucket < 3 else ('validation' if bucket < 6 else 'train')

    # Build evenly spaced frame indices for each video.
    targets = {}
    for g in groups:
        n = counts[group_col].get(g, 0)
        take = min(max_frames_per_group, n)
        if take <= 0:
            continue
        if take == n:
            targets[g] = None  # keep every frame
        elif take == 1:
            targets[g] = {0}
        else:
            targets[g] = {round(i * (n - 1) / (take - 1)) for i in range(take)}

    schema = find_landmark_columns(lm_fields)
    if schema:
        numeric_fields = None
    else:
        numeric_fields = [f for f in lm_fields if _norm(f) not in {'id','index','sample_id','row_id'}]

    print(f'[Phase 5] Found {total_rows:,} frames across {len(groups)} videos.')
    print(f'[Phase 5] Sampling up to {max_frames_per_group} frames/video -> about {sum(min(max_frames_per_group, counts[group_col][g]) for g in groups):,} frames.', flush=True)

    samples = []
    seen = {}
    with landmarks_path.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        for idx, lm_row in enumerate(reader):
            if idx and idx % 10000 == 0:
                print(f'[Phase 5] Processed {idx:,}/{total_rows:,} landmark rows...', flush=True)
            key = str(lm_row.get(group_col, '')).strip()
            label = label_by_key.get(key, '')
            if not label:
                continue
            pos = seen.get(key, 0)
            seen[key] = pos + 1
            wanted = targets.get(key)
            if wanted is not None and pos not in wanted:
                continue
            samples.append({
                'id': len(samples) + 1,
                'timestamp': idx,
                'participantId': f'kaggle-video-{key}',
                'sessionId': f'kaggle-video-{key}',
                'labelId': -1,
                'labelKey': canonical_label(label),
                'labelName': label,
                'split': group_to_split.get(key, 'train'),
                'landmarks': _landmarks_from_row_cached(lm_row, schema, numeric_fields),
                'source': 'kaggle-physical-exercise-recognition-time-series',
            })
    if not samples:
        raise ValueError('No frames could be mapped from landmarks.csv to labels.csv.')
    print(f'[Phase 5] Loaded {len(samples):,} sampled frames.', flush=True)
    return samples

def read_kaggle_csv(path: Path) -> list[dict]:
    """Read a standalone CSV only when it contains both labels and landmarks."""
    with path.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames or []
        rows = list(reader)
    label_col = find_label_column(fields)
    lm_possible = bool(find_landmark_columns(fields)) or any(len(_numeric_values(r, fields)) >= 99 for r in rows[:1])
    if not lm_possible:
        raise ValueError(
            f'{path.name} contains labels but not 33 landmarks. '
            'For this Kaggle dataset, pass the folder containing landmarks.csv and labels.csv.'
        )
    samples = []
    for idx, row in enumerate(rows):
        samples.append({
            'id': idx + 1,
            'timestamp': idx,
            'participantId': f'kaggle-row-{idx}',
            'sessionId': f'kaggle-session-{idx}',
            'labelId': -1,
            'labelKey': canonical_label(row[label_col]),
            'labelName': str(row[label_col]),
            'split': _split_for(idx),
            'landmarks': _landmarks_from_row(row, fields),
            'source': 'kaggle-physical-exercise-recognition',
        })
    return samples


def read_kaggle_path(path: Path, max_frames_per_group: int = 24) -> list[dict]:
    if path.is_dir():
        if (path / 'landmarks.csv').exists() and (path / 'labels.csv').exists():
            return read_aligned_kaggle_folder(path, max_frames_per_group=max_frames_per_group)
        csvs = sorted(path.glob('*.csv'))
        if not csvs:
            raise ValueError(f'No CSV files found in {path}')
        # Do not blindly concatenate derived feature CSVs. They are not label+landmark rows.
        candidates = [p for p in csvs if p.name.lower() not in {
            'angles.csv', 'calculated_3d_distances.csv', 'xyz_distances.csv', 'labels.csv'
        }]
        if len(candidates) == 1:
            return read_kaggle_csv(candidates[0])
        raise ValueError(
            f'Found multiple CSVs in {path}, but no aligned landmarks.csv + labels.csv pair. '
            'Pass the folder downloaded from Kaggle.'
        )
    return read_kaggle_csv(path)
