"""Shared helpers: PokemonData -> Ultralytics classification dataset, weights lookup.

Dataset: https://www.kaggle.com/datasets/lantian773030/pokemonclassification
Layout : PokemonData/<PokemonName>/<image>.jpg   (150 classes, no bounding boxes)

PokemonData has no box annotations, so YOLOv8 is used in *classification* mode
(yolov8n-cls). Ultralytics expects  dataset/{train,val,test}/<class>/<image>,
which prepare_dataset() builds from PokemonData (70 / 15 / 15 % per class, seed 42).
"""
from pathlib import Path
import os
import random
import shutil

ROOT = Path(__file__).resolve().parent
DATA_NAME = "PokemonData"
DATASET = ROOT / "dataset"          # generated split used by YOLO
RUNS = ROOT / "runs"
RUN_NAME = "pokemon"
IMG_EXTS = {".jpg", ".jpeg", ".png"}
IMGSZ = 224
TRAIN_RATIO, VAL_RATIO, SEED = 0.70, 0.15, 42


def find_source():
    """Return the PokemonData folder (also accepts PokemonData/PokemonData)."""
    for cand in (ROOT / DATA_NAME / DATA_NAME, ROOT / DATA_NAME):
        if cand.is_dir() and any(p.is_dir() for p in cand.iterdir()):
            return cand
    raise FileNotFoundError(
        f"Dataset folder not found: {ROOT / DATA_NAME}\n"
        "Download https://www.kaggle.com/datasets/lantian773030/pokemonclassification "
        f"and extract it so that the folder '{DATA_NAME}' sits next to README.md."
    )


def pick_device():
    """GPU 0 if CUDA is available, otherwise CPU."""
    try:
        import torch
        return 0 if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


def _link_or_copy(src, dst):
    try:
        os.link(src, dst)          # no extra disk space when possible
    except OSError:
        shutil.copy2(src, dst)


def prepare_dataset(force=False):
    """Build dataset/{train,val,test}/<class>/ from PokemonData (once)."""
    marker = DATASET / ".prepared"
    if marker.exists() and not force:
        return DATASET
    if force and DATASET.exists():
        shutil.rmtree(DATASET)

    src = find_source()
    classes = sorted(d for d in src.iterdir() if d.is_dir())
    counts = {"train": 0, "val": 0, "test": 0}
    for cdir in classes:
        files = sorted(p for p in cdir.iterdir() if p.suffix.lower() in IMG_EXTS)
        random.Random(f"{SEED}-{cdir.name}").shuffle(files)
        n = len(files)
        n_train, n_val = int(n * TRAIN_RATIO), int(n * VAL_RATIO)
        if n >= 3:
            n_val = max(1, n_val)
            n_train = min(n_train, n - n_val - 1)
        parts = {"train": files[:n_train],
                 "val": files[n_train:n_train + n_val],
                 "test": files[n_train + n_val:]}
        for split, items in parts.items():
            out = DATASET / split / cdir.name
            out.mkdir(parents=True, exist_ok=True)
            for f in items:
                dst = out / f.name
                if not dst.exists():
                    _link_or_copy(f, dst)
                counts[split] += 1
    marker.write_text("ok", encoding="utf-8")
    print(f"Prepared {DATASET}: {len(classes)} classes | "
          f"train {counts['train']} | val {counts['val']} | test {counts['test']}")
    return DATASET


def find_weights():
    """Path to the trained best.pt."""
    cands = [RUNS / RUN_NAME / "weights" / "best.pt"]
    cands += sorted(RUNS.glob(f"**/{RUN_NAME}/weights/best.pt"))
    for c in cands:
        if c.exists():
            return c
    raise FileNotFoundError(f"Model not found: {cands[0]}  (run train.py first)")
