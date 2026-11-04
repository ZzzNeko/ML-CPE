"""Combine real exercise data with explicitly synthetic standing-pose sequences."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path

import cv2
import numpy as np

from generate_synthetic_pose_dataset import NAMES as LANDMARK_NAMES


EXERCISE_CLASSES = {"jumping_jack", "squat"}
ARM_RAISE_FOLDERS = ("Arm Raise Correct", "Arm Raise Incorrect")
AXES = ("x", "y", "z")
REFERENCE_IMAGE_VISIBLE_LABELS = {
    "ยกเข่าขวา": "knee_right",
    "ยกเข่าซ้าย": "knee_left",
    "ยกเเขนขวา": "right_arm_up",
    "ยกเเขนซ้าย": "left_arm_up",
    "ยืนตรง": "standing",
}
SELFIE_SIDE_LABELS = {
    "knee_left": "knee_right",
    "knee_right": "knee_left",
    "left_arm_up": "right_arm_up",
    "right_arm_up": "left_arm_up",
}


def csv_header() -> list[str]:
    return ["vid_id", "frame_order", *[
        f"{axis}_{name}" for name in LANDMARK_NAMES for axis in AXES
    ]]


def copy_exercise_sequences(source: Path, landmarks_writer, labels_writer) -> dict[str, int]:
    with (source / "labels.csv").open(newline="", encoding="utf-8-sig") as file:
        labels = list(csv.DictReader(file))
    selected = {
        str(row["vid_id"]): str(row["class"]).strip().lower()
        for row in labels
        if str(row.get("class", "")).strip().lower() in EXERCISE_CLASSES
    }

    counts = {name: 0 for name in EXERCISE_CLASSES}
    labeled_videos: set[str] = set()
    with (source / "landmarks.csv").open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        required = set(csv_header())
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"{source / 'landmarks.csv'} is missing required landmark columns")
        for row in reader:
            source_id = str(row["vid_id"])
            label = selected.get(source_id)
            if label is None:
                continue
            video_id = f"physical_{source_id}"
            if video_id not in labeled_videos:
                labels_writer.writerow([video_id, label])
                labeled_videos.add(video_id)
            landmarks_writer.writerow([video_id, row["frame_order"], *[
                row[column] for column in csv_header()[2:]
            ]])
            counts[label] += 1

    # The first-frame label was emitted above; no separate video list is needed.
    return counts


def extract_arm_raise_video(
    video_path: Path,
    pose_detector,
    image_format,
    target_fps: float,
    image_factory,
) -> list[list[float]]:
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise OSError(f"Could not open video: {video_path}")

    source_fps = capture.get(cv2.CAP_PROP_FPS)
    if not math.isfinite(source_fps) or source_fps <= 0:
        capture.release()
        raise ValueError(f"Video has invalid FPS metadata: {video_path}")
    sample_every = max(1, round(source_fps / target_fps))
    rows: list[list[float]] = []
    frame_index = 0
    last_timestamp_ms = -1
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if frame_index % sample_every == 0:
                timestamp_ms = max(last_timestamp_ms + 1, round(frame_index * 1000 / source_fps))
                last_timestamp_ms = timestamp_ms
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                image = image_factory(image_format=image_format, data=rgb)
                result = pose_detector.detect_for_video(image, timestamp_ms)
                if result.pose_landmarks:
                    landmarks = result.pose_landmarks[0]
                    if len(landmarks) != len(LANDMARK_NAMES):
                        raise ValueError(f"Expected 33 landmarks in {video_path}")
                    rows.append([
                        coordinate
                        for point in landmarks
                        for coordinate in (point.x, point.y, point.z)
                    ])
            frame_index += 1
    finally:
        capture.release()
    return rows


def copy_arm_raise_videos(
    root: Path,
    landmarks_writer,
    labels_writer,
    pose_model: Path,
    target_fps: float,
    window: int,
) -> dict[str, int]:
    try:
        import mediapipe as mp
    except ImportError as error:
        raise RuntimeError("Install dependencies with: python -m pip install -r ml/requirements.txt") from error

    if not pose_model.is_file():
        raise FileNotFoundError(f"Pose Landmarker model not found: {pose_model}")

    base_options = mp.tasks.BaseOptions(model_asset_path=str(pose_model.resolve()))
    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_poses=1,
    )
    counts = {"arm_raise": 0}
    video_number = 0
    for folder in ARM_RAISE_FOLDERS:
        folder_path = root / folder
        if not folder_path.is_dir():
            raise FileNotFoundError(f"Expected Arm Raise folder: {folder_path}")
        for video_path in sorted(folder_path.glob("*.mp4")):
            video_id = f"arm_raise_{video_number:04d}"
            with mp.tasks.vision.PoseLandmarker.create_from_options(options) as detector:
                frames = extract_arm_raise_video(
                    video_path,
                    detector,
                    mp.ImageFormat.SRGB,
                    target_fps,
                    mp.Image,
                )
            if len(frames) < window:
                print(f"Skipping {video_path}: only {len(frames)} pose frames")
                continue
            labels_writer.writerow([video_id, "arm_raise"])
            for frame_order, frame in enumerate(frames):
                landmarks_writer.writerow([video_id, frame_order, *frame])
            counts["arm_raise"] += len(frames)
            video_number += 1
            print(f"Processed {video_path.name}: {len(frames)} pose frames")
    return counts


def copy_synthetic_dataset(source: Path, landmarks_writer, labels_writer) -> dict[str, int]:
    with (source / "labels.csv").open(newline="", encoding="utf-8-sig") as file:
        labels = list(csv.DictReader(file))
    labels_by_id = {row["vid_id"]: row["class"] for row in labels}
    with (source / "landmarks.csv").open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        if reader.fieldnames != csv_header():
            raise ValueError(f"Synthetic landmark schema is incompatible: {source}")
        for row in reader:
            video_id = f"synthetic_{row['vid_id']}"
            if row["frame_order"] == "0":
                labels_writer.writerow([video_id, labels_by_id[row["vid_id"]]])
            landmarks_writer.writerow([video_id, row["frame_order"], *[
                row[column] for column in csv_header()[2:]
            ]])
    return {
        label: sum(row["class"] == label for row in labels)
        for label in sorted({row["class"] for row in labels})
    }


def copy_reference_images(
    root: Path,
    landmarks_writer,
    labels_writer,
    pose_model: Path,
    window: int,
    augmentation_count: int,
    seed: int,
) -> dict[str, int]:
    try:
        import mediapipe as mp
    except ImportError as error:
        raise RuntimeError("Install dependencies with: python -m pip install -r ml/requirements.txt") from error

    if not root.is_dir():
        raise FileNotFoundError(f"Reference image folder not found: {root}")
    if not pose_model.is_file():
        raise FileNotFoundError(f"Pose Landmarker model not found: {pose_model}")

    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(pose_model.resolve())),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_poses=1,
    )
    rng = np.random.default_rng(seed)
    counts: dict[str, int] = {}
    image_paths = sorted(
        path for path in root.iterdir()
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".jfif", ".png"}
    )
    if not image_paths:
        raise ValueError(f"No supported reference images found in {root}")

    with mp.tasks.vision.PoseLandmarker.create_from_options(options) as detector:
        for image_path in image_paths:
            visible_label = REFERENCE_IMAGE_VISIBLE_LABELS.get(image_path.stem)
            if visible_label is None:
                raise ValueError(f"No reference-image label configured for {image_path.name}")
            label = SELFIE_SIDE_LABELS.get(visible_label, visible_label)

            bgr = cv2.imdecode(np.fromfile(str(image_path), dtype=np.uint8), cv2.IMREAD_COLOR)
            if bgr is None:
                raise ValueError(f"Could not decode reference image: {image_path}")
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            result = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
            if not result.pose_landmarks:
                raise ValueError(f"No pose detected in reference image: {image_path}")

            source_points = np.asarray([
                (point.x, point.y, point.z) for point in result.pose_landmarks[0]
            ], dtype=np.float32)
            image_key = hashlib.sha1(image_path.name.encode("utf-8")).hexdigest()[:8]
            for variant in range(augmentation_count):
                points = source_points.copy()
                center = points[[23, 24], :].mean(axis=0)
                scale = rng.uniform(0.94, 1.06)
                points = (points - center) * scale + center
                points[:, 0] += rng.uniform(-0.025, 0.025)
                points[:, 1] += rng.uniform(-0.02, 0.02)
                points[:, :2] += rng.normal(0, 0.002, (len(points), 2)).astype(np.float32)

                video_id = f"reference_{label}_{image_key}_{variant:03d}"
                labels_writer.writerow([video_id, label])
                sequence = np.repeat(points[None, :, :], window, axis=0)
                sequence += rng.normal(0, 0.0015, sequence.shape).astype(np.float32)
                for frame_order, frame in enumerate(sequence):
                    landmarks_writer.writerow([video_id, frame_order, *frame.reshape(-1).tolist()])
                counts[label] = counts.get(label, 0) + 1

    return counts


def build_dataset(
    physical: Path,
    blurred: Path,
    synthetic: Path,
    output: Path,
    pose_model: Path,
    target_fps: float,
    window: int,
    reference_images: Path | None,
    reference_augmentation_count: int,
    seed: int,
) -> None:
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"Output directory is not empty: {output}")
    output.mkdir(parents=True, exist_ok=True)

    totals: dict[str, int] = {}
    with (output / "landmarks.csv").open("w", newline="", encoding="utf-8") as landmarks_file, \
            (output / "labels.csv").open("w", newline="", encoding="utf-8") as labels_file:
        landmarks_writer = csv.writer(landmarks_file)
        labels_writer = csv.writer(labels_file)
        landmarks_writer.writerow(csv_header())
        labels_writer.writerow(["vid_id", "class"])
        totals["physical_frames"] = copy_exercise_sequences(
            physical, landmarks_writer, labels_writer,
        )
        totals["arm_raise_frames"] = copy_arm_raise_videos(
            blurred, landmarks_writer, labels_writer, pose_model, target_fps, window,
        )
        totals["synthetic_sequences"] = copy_synthetic_dataset(
            synthetic, landmarks_writer, labels_writer,
        )
        if reference_images is not None:
            totals["reference_image_sequences"] = copy_reference_images(
                reference_images, landmarks_writer, labels_writer, pose_model,
                window, reference_augmentation_count, seed,
            )

    metadata = {
        "synthetic_data_included": True,
        "warning": "Synthetic pose samples are pipeline demos and do not measure real-world accuracy.",
        "real_sources": {
            "jumping_jack_and_squat": str(physical),
            "arm_raise_videos": str(blurred),
        },
        "synthetic_source": str(synthetic),
        "reference_image_source": str(reference_images) if reference_images else None,
        "reference_image_labels_use": "left/right as seen in the game's mirrored selfie preview",
        "reference_image_augmentation_count": reference_augmentation_count,
        "arm_raise_label": "Correct and Incorrect source videos are grouped as arm_raise movement examples.",
        "arm_raise_target_fps": target_fps,
        "window_frames": window,
        "source_counts": totals,
    }
    (output / "dataset_info.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--physical", type=Path, default=Path("Physical Exercise Recognition"))
    parser.add_argument("--blurred", type=Path, default=Path("Blurred"))
    parser.add_argument("--synthetic", type=Path, default=Path("ml/data/synthetic-standing-poses"))
    parser.add_argument("--output", type=Path, default=Path("ml/data/combined-standing-movement"))
    parser.add_argument("--pose-model", type=Path, default=Path("ml/models/pose_landmarker_lite.task"))
    parser.add_argument("--target-fps", type=float, default=10)
    parser.add_argument("--window", type=int, default=30)
    parser.add_argument("--reference-images", type=Path)
    parser.add_argument("--reference-augmentation-count", type=int, default=12)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.target_fps <= 0 or args.window < 1 or args.reference_augmentation_count < 1:
        parser.error("target-fps, window, and reference-augmentation-count must be positive")
    try:
        build_dataset(
            args.physical, args.blurred, args.synthetic, args.output,
            args.pose_model, args.target_fps, args.window, args.reference_images,
            args.reference_augmentation_count, args.seed,
        )
    except (OSError, ValueError, RuntimeError) as error:
        parser.error(str(error))
    print(f"Combined dataset created: {args.output.resolve()}")
    print("Classes are recorded in labels.csv; check dataset_info.json for source details.")


if __name__ == "__main__":
    main()
