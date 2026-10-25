import argparse

import cv2
from ultralytics import YOLO

import common


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--camera", type=int, default=0)
    args = p.parse_args()

    model = YOLO(str(common.find_weights()))
    device = common.pick_device()

    # Open webcam
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open webcam (camera index {args.camera})")

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            # Classify the whole frame
            probs = model.predict(source=frame, imgsz=common.IMGSZ,
                                  device=device, verbose=False)[0].probs

            # Draw top-3 predictions
            for k, (cid, conf) in enumerate(zip(probs.top5[:3], probs.top5conf[:3].tolist())):
                cv2.putText(frame, f"{model.names[cid]} {conf:.2f}", (10, 30 + 30 * k),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9 - 0.2 * (k > 0),
                            (0, 255, 0), 2)

            cv2.imshow("Pokemon YOLO Real-time Classification (Q to quit)", frame)

            # Press Q to exit
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
