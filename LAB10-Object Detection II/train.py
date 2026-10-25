import argparse
from pathlib import Path

from ultralytics import YOLO

import common


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--epochs", type=int, default=10)
    p.add_argument("--imgsz", type=int, default=common.IMGSZ)
    p.add_argument("--batch", type=int, default=32)
    p.add_argument("--model", default="yolov8n-cls.pt")
    args = p.parse_args()

    # Build dataset/{train,val,test} from PokemonData (skipped if already done)
    dataset = common.prepare_dataset()

    # Load pretrained YOLO classification model
    model = YOLO(args.model)

    # Train model
    model.train(
        data=str(dataset),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=common.pick_device(),
        workers=0,
        project=str(common.RUNS),
        name=common.RUN_NAME,
        exist_ok=True,
        save=True,
        plots=True,
    )

    # Output directory
    save_dir = Path(model.trainer.save_dir)

    print("Training completed!")
    print(f"Best Model: {save_dir / 'weights/best.pt'}")
    print(f"Last Model: {save_dir / 'weights/last.pt'}")
    print(f"Training CSV: {save_dir / 'results.csv'}")


if __name__ == "__main__":
    main()
