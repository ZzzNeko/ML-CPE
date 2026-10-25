from pathlib import Path
import argparse
import sys

import numpy as np
import tensorflow as tf
from sklearn.metrics import accuracy_score, classification_report

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import pokemon_data as pdata  # noqa: E402

OUT = Path(__file__).resolve().parent / "outputs"
MODEL_PATH = OUT / "model.keras"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=0,
                   help="Max images per class (0 = all)")
    p.add_argument("--split", choices=["train", "val", "test"], default="test")
    p.add_argument("--batch", type=int, default=32)
    args = p.parse_args()

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

    names = pdata.load_class_names(OUT)
    print("Loading dataset split:", args.split)
    x, y, _ = pdata.load_split(args.split, args.limit)
    print("Total images:", len(y))

    model = tf.keras.models.load_model(MODEL_PATH)
    probs = model.predict(x.astype(np.float32), batch_size=args.batch, verbose=1)
    y_pred = probs.argmax(axis=1)

    top5 = float(np.mean([t in row for t, row in zip(y, np.argsort(probs, axis=1)[:, -5:])]))

    print("\nEvaluation Results")
    print(f"Accuracy      : {accuracy_score(y, y_pred):.4f}")
    print(f"Top-5 accuracy: {top5:.4f}")
    print("\nClassification Report:")
    present = sorted(set(y.tolist()) | set(y_pred.tolist()))
    print(classification_report(
        y, y_pred, labels=present,
        target_names=[names[i] for i in present], zero_division=0))


if __name__ == "__main__":
    main()
