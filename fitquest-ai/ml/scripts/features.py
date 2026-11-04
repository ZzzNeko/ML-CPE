"""Feature engineering shared by the Phase 5 trainers.

Input: 33 MediaPipe Pose Landmarker points in normalized image coordinates.
Output: translation/scale normalized 2D coordinates + joint angles and ratios.
MediaPipe image-space z is omitted because it varies with camera framing and is
not reliable enough to distinguish these front-facing exercise classes.
"""
from __future__ import annotations

import math
import numpy as np

# MediaPipe Pose Landmarker indices.
NOSE = 0
L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANKLE, R_ANKLE = 27, 28

JOINTS = [
    (L_SHOULDER, L_ELBOW, L_WRIST), (R_SHOULDER, R_ELBOW, R_WRIST),
    (L_HIP, L_KNEE, L_ANKLE), (R_HIP, R_KNEE, R_ANKLE),
    (L_ELBOW, L_SHOULDER, L_HIP), (R_ELBOW, R_SHOULDER, R_HIP),
    (L_SHOULDER, L_HIP, L_KNEE), (R_SHOULDER, R_HIP, R_KNEE),
]


def _p(points, i):
    p = points[i]
    return np.asarray([p["x"], p["y"], p["z"]], dtype=np.float32)


def _angle(a, b, c):
    u, v = a - b, c - b
    den = np.linalg.norm(u) * np.linalg.norm(v)
    if den < 1e-8:
        return 0.0
    cosine = float(np.clip(np.dot(u, v) / den, -1.0, 1.0))
    return math.acos(cosine) / math.pi


def extract_features(points):
    if len(points) != 33:
        raise ValueError(f"Expected 33 landmarks, got {len(points)}")
    xyz = np.stack([_p(points, i) for i in range(33)])
    xyz[:, 2] = 0.0
    center = (xyz[L_HIP] + xyz[R_HIP]) / 2.0
    shoulder_width = np.linalg.norm(xyz[L_SHOULDER] - xyz[R_SHOULDER])
    torso = np.linalg.norm(((xyz[L_SHOULDER] + xyz[R_SHOULDER]) / 2) - center)
    scale = max(float(shoulder_width), float(torso), 1e-4)
    normalized = (xyz - center) / scale

    # Keep the most informative body coordinates while removing camera translation/scale.
    coords = normalized[[L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW,
                         L_WRIST, R_WRIST, L_HIP, R_HIP, L_KNEE, R_KNEE,
                         L_ANKLE, R_ANKLE]].reshape(-1)
    angles = np.asarray([_angle(xyz[a], xyz[b], xyz[c]) for a, b, c in JOINTS], dtype=np.float32)

    def dist(i, j):
        return float(np.linalg.norm(normalized[i] - normalized[j]))

    ratios = np.asarray([
        dist(L_WRIST, R_WRIST),
        dist(L_ANKLE, R_ANKLE),
        dist(L_WRIST, L_HIP), dist(R_WRIST, R_HIP),
        dist(L_KNEE, L_HIP), dist(R_KNEE, R_HIP),
        dist(L_ANKLE, L_HIP), dist(R_ANKLE, R_HIP),
    ], dtype=np.float32)
    return np.concatenate([coords, angles, ratios]).astype(np.float32)


def feature_names():
    names = []
    selected = [L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW,
                L_WRIST, R_WRIST, L_HIP, R_HIP, L_KNEE, R_KNEE,
                L_ANKLE, R_ANKLE]
    labels = {L_SHOULDER:'l_shoulder', R_SHOULDER:'r_shoulder', L_ELBOW:'l_elbow', R_ELBOW:'r_elbow',
              L_WRIST:'l_wrist', R_WRIST:'r_wrist', L_HIP:'l_hip', R_HIP:'r_hip',
              L_KNEE:'l_knee', R_KNEE:'r_knee', L_ANKLE:'l_ankle', R_ANKLE:'r_ankle'}
    for i in selected:
        names += [f'{labels[i]}_x', f'{labels[i]}_y', f'{labels[i]}_z']
    names += [f'angle_{i}' for i in range(len(JOINTS))]
    names += ['wrist_gap', 'ankle_gap', 'l_wrist_hip', 'r_wrist_hip', 'l_knee_hip', 'r_knee_hip', 'l_ankle_hip', 'r_ankle_hip']
    return names


def extract_features_batch(xyz):
    """Vectorised extract_features.

    xyz: (N, 33, 3) float array of landmarks -> (N, 52) float32 features.
    Numerically identical (to float32 round-off) to calling extract_features()
    on every frame, but ~100x faster. The TS port in src/ai/poseFeatures.ts
    still matches extract_features(), so the parity check stays valid.
    """
    xyz = np.asarray(xyz, dtype=np.float32).copy()
    xyz[:, :, 2] = 0.0
    n = xyz.shape[0]
    center = (xyz[:, L_HIP] + xyz[:, R_HIP]) / 2.0
    shoulder_width = np.linalg.norm(xyz[:, L_SHOULDER] - xyz[:, R_SHOULDER], axis=1)
    torso = np.linalg.norm((xyz[:, L_SHOULDER] + xyz[:, R_SHOULDER]) / 2 - center, axis=1)
    scale = np.maximum(np.maximum(shoulder_width, torso), 1e-4)
    normalized = (xyz - center[:, None, :]) / scale[:, None, None]

    sel = [L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW, L_WRIST, R_WRIST,
           L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANKLE, R_ANKLE]
    coords = normalized[:, sel].reshape(n, -1)

    angles = np.zeros((n, len(JOINTS)), dtype=np.float32)
    for k, (a, b, c) in enumerate(JOINTS):
        u, v = xyz[:, a] - xyz[:, b], xyz[:, c] - xyz[:, b]
        den = np.linalg.norm(u, axis=1) * np.linalg.norm(v, axis=1)
        cosine = np.clip((u * v).sum(1) / np.maximum(den, 1e-30), -1.0, 1.0)
        angles[:, k] = np.where(den < 1e-8, 0.0, np.arccos(cosine) / np.pi)

    def dist(i, j):
        return np.linalg.norm(normalized[:, i] - normalized[:, j], axis=1)

    ratios = np.stack([
        dist(L_WRIST, R_WRIST), dist(L_ANKLE, R_ANKLE),
        dist(L_WRIST, L_HIP), dist(R_WRIST, R_HIP),
        dist(L_KNEE, L_HIP), dist(R_KNEE, R_HIP),
        dist(L_ANKLE, L_HIP), dist(R_ANKLE, R_HIP),
    ], axis=1)
    return np.concatenate([coords, angles, ratios], axis=1).astype(np.float32)
