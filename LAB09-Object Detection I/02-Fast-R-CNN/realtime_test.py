from pathlib import Path
import argparse
import sys

import cv2
import tensorflow as tf

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import pokemon_data as pdata  # noqa: E402

OUT = Path(__file__).resolve().parent / "outputs"
MODEL_PATH = OUT / "model.keras"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--camera", type=int, default=0)
    p.add_argument("--threshold", type=float, default=0.5)
    p.add_argument("--regions", type=int, default=25, help="Smaller is faster on CPU")
    args = p.parse_args()

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")
    names = pdata.load_class_names(OUT)
    model = tf.keras.models.load_model(MODEL_PATH)

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera {args.camera}")

    print("Press Q to quit. Sliding-window region classification demo "
          "(Fast R-CNN style), not a real region-proposal detector.")
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            dets = pdata.detect_regions(model, frame, names, args.threshold, args.regions)
            cv2.imshow("Fast R-CNN Pokemon region classifier (Q to quit)",
                       pdata.draw(frame, dets))
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
