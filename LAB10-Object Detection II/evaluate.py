from ultralytics import YOLO

import common


def main():
    # Load trained model
    weights = common.find_weights()
    model = YOLO(str(weights))

    # Evaluate on test split
    dataset = common.prepare_dataset()
    metrics = model.val(
        data=str(dataset),
        split="test",
        imgsz=common.IMGSZ,
        batch=32,
        device=common.pick_device(),
        workers=0,
        plots=True,
        project=str(common.RUNS),
        name="evaluation",
        exist_ok=True,
    )

    # Display evaluation results
    print("\n===== Evaluation Results =====")
    print(f"Top-1 Accuracy: {metrics.top1:.4f}")
    print(f"Top-5 Accuracy: {metrics.top5:.4f}")


if __name__ == "__main__":
    main()
