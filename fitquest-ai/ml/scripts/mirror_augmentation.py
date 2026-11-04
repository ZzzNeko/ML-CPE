"""Left/right label-aware mirroring for MediaPipe Pose training windows."""
from __future__ import annotations

import numpy as np

from pose_augmentation import augment_pose_window

MIRRORED_LABELS = {
    "left_arm_up": "right_arm_up",
    "right_arm_up": "left_arm_up",
    "knee_left": "knee_right",
    "knee_right": "knee_left",
}

# MediaPipe Pose 33: swap semantic left/right landmarks after reflecting x.
MIRROR = list(range(33))
for _left, _right in (
    [(1, 4), (2, 5), (3, 6)]
    + [(index, index + 1) for index in range(7, 32, 2)]
):
    MIRROR[_left], MIRROR[_right] = MIRROR[_right], MIRROR[_left]


def mirror_landmarks(sequence):
    """Horizontally reflect (..., 33, 3) landmarks and swap left/right IDs."""
    values = np.asarray(sequence, dtype=np.float32)
    if values.ndim < 2 or values.shape[-2:] != (33, 3):
        raise ValueError(f"Expected (..., 33, 3) landmarks, got {values.shape}")
    result = values[..., MIRROR, :].copy()
    result[..., 0] = 1.0 - result[..., 0]
    return result


def augment_mirrored_training_windows(
    windows,
    labels,
    train_mask,
    classes,
    factor=4,
    min_class_windows=200,
    target_classes=("standing", "right_arm_up", "left_arm_up", "knee_left", "knee_right"),
    seed=42,
):
    """Create varied mirrored samples for rare side-specific classes, from train rows only.

    The ordinary one-to-one mirror pass remains in train_cnn.py. This function
    adds mild geometric variants of the opposite-side class, relabelled after
    mirroring, to supplement a rare target without copying validation/test rows.
    """
    if factor < 0 or min_class_windows < 1:
        raise ValueError("factor must be >= 0 and min_class_windows >= 1")
    values = np.asarray(windows, dtype=np.float32)
    labels = np.asarray(labels)
    mask = np.asarray(train_mask, dtype=bool)
    if len(values) != len(labels) or len(labels) != len(mask):
        raise ValueError("windows, labels and train_mask must have equal lengths")
    if values.ndim != 4 or values.shape[2:] != (33, 3):
        raise ValueError(f"Expected (N, T, 33, 3) windows, got {values.shape}")

    rng = np.random.default_rng(seed)
    generated, generated_labels = [], []
    counts = {name: 0 for name in classes}
    for target in target_classes:
        if target not in classes:
            continue
        current_count = int(np.sum(mask & (labels == target)))
        source = MIRRORED_LABELS.get(target)
        if factor == 0 or current_count >= min_class_windows or source not in classes:
            continue
        source_indices = np.flatnonzero(mask & (labels == source))
        for index in source_indices:
            mirrored = mirror_landmarks(values[index])
            for _ in range(factor):
                generated.append(augment_pose_window(mirrored, rng))
                generated_labels.append(target)
        counts[target] = len(source_indices) * factor

    if not generated:
        return (
            np.empty((0, *values.shape[1:]), dtype=np.float32),
            np.empty((0,), dtype=labels.dtype),
            counts,
        )
    return np.stack(generated).astype(np.float32), np.asarray(generated_labels, dtype=labels.dtype), counts
