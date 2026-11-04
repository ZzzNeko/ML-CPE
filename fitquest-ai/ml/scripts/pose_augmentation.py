"""Conservative, label-preserving augmentation for real MediaPipe Pose windows."""
from __future__ import annotations
import numpy as np

LEFT_SHOULDER, RIGHT_SHOULDER = 11, 12
LEFT_HIP, RIGHT_HIP = 23, 24


def augment_pose_window(sequence, rng, rotation_degrees=4.0,
                        scale_range=(0.97, 1.03), landmark_noise=0.0025,
                        frame_noise=0.0015):
    """Create a mild variation of one real (T, 33, 3) landmark window."""
    source = np.asarray(sequence, dtype=np.float32)
    if source.ndim != 3 or source.shape[1:] != (33, 3):
        raise ValueError(f"Expected (T, 33, 3) landmarks, got {source.shape}")
    if source.shape[0] < 2 or not np.isfinite(source).all():
        raise ValueError("Pose window must have >=2 finite frames")
    if rotation_degrees < 0 or landmark_noise < 0 or frame_noise < 0:
        raise ValueError("Rotation and noise magnitudes must be non-negative")
    if scale_range[0] <= 0 or scale_range[0] > scale_range[1]:
        raise ValueError("scale_range must be positive and ordered")

    result = source.copy()
    center = (result[:, LEFT_HIP] + result[:, RIGHT_HIP]) * 0.5
    shoulder_mid = (result[:, LEFT_SHOULDER] + result[:, RIGHT_SHOULDER]) * 0.5
    body_scale = np.maximum(
        np.linalg.norm(result[:, LEFT_SHOULDER] - result[:, RIGHT_SHOULDER], axis=1),
        np.linalg.norm(shoulder_mid - center, axis=1),
    )
    reference_scale = max(float(np.median(body_scale)), 1e-4)

    angle = np.deg2rad(rng.uniform(-rotation_degrees, rotation_degrees))
    cos_a, sin_a = np.cos(angle), np.sin(angle)
    rotation = np.asarray([[cos_a, -sin_a], [sin_a, cos_a]], dtype=np.float32)
    sx, sy = rng.uniform(*scale_range, size=2).astype(np.float32)
    transform = rotation @ np.asarray([[sx, 0.0], [0.0, sy]], dtype=np.float32)
    xy = result[:, :, :2] - center[:, None, :2]
    result[:, :, :2] = xy @ transform.T + center[:, None, :2]

    # Smooth frame-level drift plus small detector localization noise.
    t = source.shape[0]
    drift = rng.normal(0.0, frame_noise * reference_scale, (t, 1, 2)).astype(np.float32)
    if t >= 3:
        drift[:, 0, :] = (
            np.roll(drift[:, 0, :], 1, axis=0) + 2.0 * drift[:, 0, :]
            + np.roll(drift[:, 0, :], -1, axis=0)
        ) / 4.0
        drift[0, 0, :] = rng.normal(0.0, frame_noise * reference_scale, 2)
        drift[-1, 0, :] = rng.normal(0.0, frame_noise * reference_scale, 2)
    result[:, :, :2] += drift
    result[:, :, :2] += rng.normal(
        0.0, landmark_noise * reference_scale, (t, 33, 2)
    ).astype(np.float32)
    if not np.isfinite(result).all():
        raise RuntimeError("Augmentation produced non-finite coordinates")
    return result.astype(np.float32, copy=False)


def augment_training_windows(windows, labels, train_mask, classes, factor=2,
                             min_class_windows=200,
                             target_classes=("standing", "right_arm_up",
                                             "left_arm_up", "knee_left", "knee_right"),
                             seed=42):
    """Generate variants only from selected underrepresented training windows."""
    if factor < 0 or min_class_windows < 1:
        raise ValueError("factor must be >= 0 and min_class_windows >= 1")
    windows = np.asarray(windows, dtype=np.float32)
    labels = np.asarray(labels)
    train_mask = np.asarray(train_mask, dtype=bool)
    if len(windows) != len(labels) or len(labels) != len(train_mask):
        raise ValueError("windows, labels and train_mask must have equal lengths")

    rng = np.random.default_rng(seed)
    generated, generated_labels = [], []
    # Report every known class, including classes intentionally excluded from augmentation.
    counts = {class_name: 0 for class_name in classes}
    for class_name in target_classes:
        if class_name not in classes:
            counts[class_name] = 0
            continue
        indices = np.flatnonzero(train_mask & (labels == class_name))
        if len(indices) == 0 or len(indices) >= min_class_windows or factor == 0:
            counts[class_name] = 0
            continue
        for index in indices:
            for _ in range(factor):
                generated.append(augment_pose_window(windows[index], rng))
                generated_labels.append(class_name)
        counts[class_name] = len(indices) * factor

    if not generated:
        return (np.empty((0, *windows.shape[1:]), dtype=np.float32),
                np.empty((0,), dtype=labels.dtype), counts)
    return (np.stack(generated).astype(np.float32),
            np.asarray(generated_labels, dtype=labels.dtype), counts)
