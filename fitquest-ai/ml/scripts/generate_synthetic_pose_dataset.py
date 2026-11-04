"""Generate clearly synthetic MediaPipe-style sequences for standing pose demos.

These samples are useful for exercising the training pipeline, not for estimating
real-world accuracy. Replace them with camera-recorded landmarks before deployment.
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np


NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner",
    "right_eye", "right_eye_outer", "left_ear", "right_ear", "mouth_left",
    "mouth_right", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_pinky_1", "right_pinky_1", "left_index_1",
    "right_index_1", "left_thumb_2", "right_thumb_2", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel",
    "right_heel", "left_foot_index", "right_foot_index",
]

POSES = ("standing", "left_arm_up", "right_arm_up", "knee_left", "knee_right")


def make_pose(label: str) -> np.ndarray:
    points = np.zeros((33, 3), dtype=np.float32)

    def put(index: int, x: float, y: float, z: float = 0.0) -> None:
        points[index] = (x, y, z)

    put(0, 0.50, 0.16)
    for index, x, y in (
        (1, 0.515, 0.145), (2, 0.520, 0.145), (3, 0.525, 0.148),
        (4, 0.485, 0.145), (5, 0.480, 0.145), (6, 0.475, 0.148),
        (7, 0.545, 0.175), (8, 0.455, 0.175),
        (9, 0.515, 0.190), (10, 0.485, 0.190),
    ):
        put(index, x, y)

    put(11, 0.58, 0.32)
    put(12, 0.42, 0.32)
    put(13, 0.63, 0.45)
    put(14, 0.37, 0.45)
    put(15, 0.65, 0.59)
    put(16, 0.35, 0.59)

    if label == "left_arm_up":
        put(13, 0.61, 0.17)
        put(15, 0.63, 0.035)
    elif label == "right_arm_up":
        put(14, 0.39, 0.17)
        put(16, 0.37, 0.035)
    for index, x, y in (
        (17, 0.66, 0.60), (18, 0.34, 0.60),
        (19, 0.65, 0.61), (20, 0.35, 0.61),
        (21, 0.64, 0.60), (22, 0.36, 0.60),
    ):
        put(index, x, y)

    put(23, 0.55, 0.54)
    put(24, 0.45, 0.54)
    put(25, 0.55, 0.76)
    put(26, 0.45, 0.76)
    put(27, 0.55, 0.97)
    put(28, 0.45, 0.97)
    put(29, 0.56, 0.98)
    put(30, 0.44, 0.98)
    put(31, 0.57, 1.00)
    put(32, 0.43, 1.00)

    if label == "knee_left":
        put(25, 0.64, 0.56)
        put(27, 0.66, 0.73)
    elif label == "knee_right":
        put(26, 0.36, 0.56)
        put(28, 0.34, 0.73)

    return points


def make_sequence(label: str, frames: int, rng: np.random.Generator) -> np.ndarray:
    points = make_pose(label)
    scale = rng.uniform(0.88, 1.12)
    center = points[[23, 24]].mean(axis=0)
    points = (points - center) * scale + center
    points[:, 0] += rng.uniform(-0.06, 0.06)
    points[:, 1] += rng.uniform(-0.025, 0.025)
    points[:, 2] += rng.uniform(-0.035, 0.035)

    sequence = np.repeat(points[None, :, :], frames, axis=0)
    phase = rng.uniform(0, 2 * np.pi)
    breath = np.sin(np.linspace(0, 2 * np.pi, frames, dtype=np.float32) + phase) * 0.002
    sequence[:, :, 1] += breath[:, None]
    sequence += rng.normal(0, 0.0025, sequence.shape).astype(np.float32)
    return np.clip(sequence, -0.2, 1.2)


def write_dataset(output: Path, samples_per_class: int, frames: int, seed: int) -> None:
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"Output directory is not empty: {output}")
    output.mkdir(parents=True, exist_ok=True)

    rng = np.random.default_rng(seed)
    landmark_columns = [f"{axis}_{name}" for name in NAMES for axis in ("x", "y", "z")]
    with (output / "landmarks.csv").open("w", newline="", encoding="utf-8") as landmarks_file, \
            (output / "labels.csv").open("w", newline="", encoding="utf-8") as labels_file:
        landmarks_writer = csv.writer(landmarks_file)
        labels_writer = csv.writer(labels_file)
        landmarks_writer.writerow(["vid_id", "frame_order", *landmark_columns])
        labels_writer.writerow(["vid_id", "class"])

        for label in POSES:
            for sample in range(samples_per_class):
                video_id = f"{label}_{sample:04d}"
                labels_writer.writerow([video_id, label])
                sequence = make_sequence(label, frames, rng)
                for frame_order, points in enumerate(sequence):
                    landmarks_writer.writerow([video_id, frame_order, *points.reshape(-1).tolist()])

    metadata = {
        "synthetic": True,
        "purpose": "training-pipeline demonstration only",
        "warning": "Not real camera data; do not use its metrics as real-world accuracy.",
        "classes": list(POSES),
        "samples_per_class": samples_per_class,
        "frames_per_sample": frames,
        "seed": seed,
    }
    (output / "dataset_info.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("ml/data/synthetic-standing-poses"))
    parser.add_argument("--samples-per-class", type=int, default=100)
    parser.add_argument("--frames", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.samples_per_class < 5:
        parser.error("samples-per-class must be at least 5 for train/validation/test splits")
    if args.frames < 30:
        parser.error("frames must be at least 30 for the existing CNN window size")
    try:
        write_dataset(args.output, args.samples_per_class, args.frames, args.seed)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(f"Generated synthetic dataset: {args.output.resolve()}")
    print(f"Classes: {', '.join(POSES)}")
    print(f"Sequences: {len(POSES) * args.samples_per_class} x {args.frames} frames")
    print("Warning: synthetic data is for pipeline demos, not real-world model evaluation.")


if __name__ == "__main__":
    main()
