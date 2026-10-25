import argparse
from pathlib import Path
import random

import cv2
from ultralytics import YOLO

import common


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--image", default=None, help="Path to your own image (default: 5 random test images)")
    p.add_argument("--num", type=int, default=5)
    p.add_argument("--no-show", action="store_true", help="Do not open a window")
    args = p.parse_args()

    model = YOLO(str(common.find_weights()))

    if args.image:
        selected = [(Path(args.image), None)]
    else:
        test_dir = common.prepare_dataset() / "test"
        images = [(f, f.parent.name) for f in test_dir.glob("*/*")
                  if f.suffix.lower() in common.IMG_EXTS]
        if not images:
            raise RuntimeError("No test images found")
        selected = random.sample(images, min(args.num, len(images)))

    out_dir = common.RUNS / "image_test"
    out_dir.mkdir(parents=True, exist_ok=True)

    for image, truth in selected:
        result = model.predict(source=str(image), imgsz=common.IMGSZ,
                               device=common.pick_device(), verbose=False)[0]
        probs = result.probs

        print(f"\nImage: {image.name}" + (f"  (truth: {truth})" if truth else ""))
        for cid, conf in zip(probs.top5, probs.top5conf.tolist()):
            print(f"  {model.names[cid]}: {conf:.2f}")

        # Draw top-5 predictions on the image and save it
        annotated = result.plot()
        cv2.imwrite(str(out_dir / f"{image.parent.name}_{image.stem}.jpg"), annotated)

        if not args.no_show:
            cv2.imshow("YOLO Pokemon Classification", annotated)
            # Press any key for next image, Q to quit
            if cv2.waitKey(0) & 0xFF == ord("q"):
                break

    cv2.destroyAllWindows()
    print(f"\nImage testing completed! Results saved to {out_dir}")


if __name__ == "__main__":
    main()
