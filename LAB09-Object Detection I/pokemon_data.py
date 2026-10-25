"""Shared helpers for the PokemonData dataset.

Dataset: https://www.kaggle.com/datasets/lantian773030/pokemonclassification
Layout : PokemonData/<PokemonName>/<image>.jpg   (150 classes, no bounding boxes)

Because the dataset has no box annotations, every image is treated as ONE region
(the whole image) and the models classify that region. Train/val/test splits are
created here, per class, with a fixed seed so every script sees the same split.
"""
from pathlib import Path
import json
import random

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent
DATA_NAME = "PokemonData"
IMG_SIZE = 96
IMG_EXTS = (".jpg", ".jpeg", ".png")
TRAIN_RATIO = 0.70
VAL_RATIO = 0.15  # the remainder (15%) is the test split
SEED = 42


# ----------------------------------------------------------------- dataset
def find_data_dir():
    """Return <project>/PokemonData (also accepts PokemonData/PokemonData)."""
    for cand in (ROOT / DATA_NAME / DATA_NAME, ROOT / DATA_NAME):
        if cand.is_dir() and any(p.is_dir() for p in cand.iterdir()):
            return cand
    raise FileNotFoundError(
        f"Dataset folder not found: {ROOT / DATA_NAME}\n"
        "Download https://www.kaggle.com/datasets/lantian773030/pokemonclassification "
        f"and extract it so that the folder '{DATA_NAME}' sits next to README.md."
    )


def _images_in(folder):
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in IMG_EXTS)


def list_classes(data_dir=None):
    data_dir = data_dir or find_data_dir()
    return sorted(d.name for d in data_dir.iterdir() if d.is_dir() and _images_in(d))


def split_files(split, limit=0, data_dir=None):
    """List of (image_path, class_index) for split in {'train','val','test'}.

    limit = max images PER CLASS inside that split (0 = all).
    """
    if split not in ("train", "val", "test"):
        raise ValueError("split must be train, val or test")
    data_dir = data_dir or find_data_dir()
    items = []
    for idx, name in enumerate(list_classes(data_dir)):
        files = _images_in(data_dir / name)
        random.Random(f"{SEED}-{name}").shuffle(files)
        n = len(files)
        n_train, n_val = int(n * TRAIN_RATIO), int(n * VAL_RATIO)
        if n >= 3:
            n_val = max(1, n_val)
            n_train = min(n_train, n - n_val - 1)
        parts = {
            "train": files[:n_train],
            "val": files[n_train:n_train + n_val],
            "test": files[n_train + n_val:],
        }
        chosen = parts[split][:limit] if limit > 0 else parts[split]
        items += [(p, idx) for p in chosen]
    return items


def read_image(path):
    """cv2.imread that also works with non-ASCII paths. Returns BGR or None."""
    try:
        data = np.fromfile(str(path), dtype=np.uint8)
        return cv2.imdecode(data, cv2.IMREAD_COLOR)
    except Exception:
        return None


def preprocess(bgr):
    """BGR image/crop -> RGB uint8 (IMG_SIZE x IMG_SIZE). The model rescales /255."""
    return cv2.cvtColor(cv2.resize(bgr, (IMG_SIZE, IMG_SIZE)), cv2.COLOR_BGR2RGB)


def load_split(split, limit=0):
    """Return x (uint8, N x H x W x 3), y (int32) and the list of image paths."""
    xs, ys, paths = [], [], []
    for path, cls in split_files(split, limit):
        img = read_image(path)
        if img is None:
            continue
        xs.append(preprocess(img))
        ys.append(cls)
        paths.append(path)
    if not xs:
        raise RuntimeError(f"No images found for split '{split}' in {find_data_dir()}")
    return np.asarray(xs, np.uint8), np.asarray(ys, np.int32), paths


# ------------------------------------------------------------- class names
def save_class_names(out_dir, names):
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    (Path(out_dir) / "classes.json").write_text(
        json.dumps(names, indent=2, ensure_ascii=False), encoding="utf-8")


def load_class_names(out_dir):
    f = Path(out_dir) / "classes.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    return list_classes()


# ----------------------------------- sliding-window region demo (webcam use)
def propose_regions(frame, max_regions=25):
    """Whole frame first, then a coarse grid of windows at 3 scales."""
    h, w = frame.shape[:2]
    boxes = [(0, 0, w, h)]
    for scale, (rows, cols) in ((0.7, (2, 3)), (0.5, (3, 4)), (0.35, (3, 4))):
        bw, bh = int(w * scale), int(h * scale)
        for cy in np.linspace(bh / 2, h - bh / 2, rows):
            for cx in np.linspace(bw / 2, w - bw / 2, cols):
                x1, y1 = int(cx - bw / 2), int(cy - bh / 2)
                boxes.append((x1, y1, x1 + bw, y1 + bh))
    return boxes[:max(1, max_regions)]


def detect_regions(model, frame, class_names, threshold=0.5, max_regions=25):
    """Classify each proposed region; keep confident ones and apply NMS."""
    boxes = propose_regions(frame, max_regions)
    crops = np.asarray([preprocess(frame[y1:y2, x1:x2]) for x1, y1, x2, y2 in boxes],
                       np.float32)
    probs = model.predict(crops, verbose=0)
    cls, conf = probs.argmax(axis=1), probs.max(axis=1)
    keep = [i for i in range(len(boxes)) if conf[i] >= threshold]
    if not keep:
        return []
    rects = [[boxes[i][0], boxes[i][1], boxes[i][2] - boxes[i][0],
              boxes[i][3] - boxes[i][1]] for i in keep]
    scores = [float(conf[i]) for i in keep]
    picked = np.array(cv2.dnn.NMSBoxes(rects, scores, 0.0, 0.4)).flatten()
    return [(boxes[keep[j]], class_names[cls[keep[j]]], scores[j]) for j in picked]


def draw(frame, detections, color=(0, 255, 0)):
    for (x1, y1, x2, y2), name, score in detections:
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(frame, f"{name} {score:.2f}", (x1 + 4, max(20, y1 + 20)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
    return frame
