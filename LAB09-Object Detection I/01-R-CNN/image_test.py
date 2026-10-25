from pathlib import Path
import argparse
import random
import sys

import cv2
import numpy as np
import tensorflow as tf

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import pokemon_data as pdata  # noqa: E402

OUT = Path(__file__).resolve().parent / "outputs"
MODEL_PATH = OUT / "model.keras"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--image", type=str, default=None,
                   help="Path to any image (default: random image from --split)")
    p.add_argument("--split", choices=["train", "val", "test"], default="test")
    args = p.parse_args()

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")
    names = pdata.load_class_names(OUT)

    truth = None
    if args.image:
        image_path = Path(args.image)
    else:
        image_path, cls = random.choice(pdata.split_files(args.split))
        truth = names[cls]

    image = pdata.read_image(image_path)
    if image is None:
        raise FileNotFoundError(str(image_path))

    model = tf.keras.models.load_model(MODEL_PATH)
    probs = model.predict(
        np.asarray([pdata.preprocess(image)], np.float32), verbose=0)[0]
    top = np.argsort(probs)[::-1][:3]

    # The whole image is the single region (PokemonData has no bounding boxes).
    h, w = image.shape[:2]
    cv2.rectangle(image, (0, 0), (w - 1, h - 1), (0, 255, 0), 3)
    lines = [f"{names[i]} {probs[i]:.2f}" for i in top]
    if truth:
        lines.append(f"truth: {truth}")
    for k, text in enumerate(lines):
        cv2.putText(image, text, (8, 24 + 24 * k), cv2.FONT_HERSHEY_SIMPLEX,
                    0.65, (0, 255, 0), 2)

    OUT.mkdir(parents=True, exist_ok=True)
    save_path = OUT / "image_result.jpg"
    cv2.imwrite(str(save_path), image)

    print("Input     :", image_path)
    print("Prediction:", ", ".join(lines[:3]))
    if truth:
        print("Truth     :", truth)
    print("Saved     :", save_path)


if __name__ == "__main__":
    main()
