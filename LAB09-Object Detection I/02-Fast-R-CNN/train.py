from pathlib import Path
import argparse
import sys

import tensorflow as tf

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import pokemon_data as pdata  # noqa: E402

OUT = Path(__file__).resolve().parent / "outputs"
OUT.mkdir(parents=True, exist_ok=True)
MODEL_PATH = OUT / "model.keras"


def make_model(num_classes):
    """Fast R-CNN style: shared conv features + fixed-size ROI pooling + FC head."""
    L = tf.keras.layers
    model = tf.keras.Sequential([
        L.Input(shape=(pdata.IMG_SIZE, pdata.IMG_SIZE, 3)),
        L.Rescaling(1.0 / 255),
        L.RandomFlip("horizontal"),
        L.RandomRotation(0.05),
        L.RandomZoom(0.1),
        L.Conv2D(32, 3, padding="same", activation="relu"),
        L.MaxPooling2D(),
        L.Conv2D(64, 3, padding="same", activation="relu"),
        L.MaxPooling2D(),
        L.Conv2D(128, 3, padding="same", activation="relu"),
        # Fixed-size ROI feature pooling (educational approximation): 24x24 -> 6x6
        L.MaxPooling2D(pool_size=4),
        L.Flatten(),
        L.Dense(256, activation="relu"),
        L.Dropout(0.3),
        L.Dense(num_classes, activation="softmax"),
    ], name="Fast_RCNN_region_classifier")
    model.compile(
        optimizer="adam",
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=0,
                   help="Max images per class per split (0 = all)")
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch", type=int, default=32)
    args = p.parse_args()

    names = pdata.list_classes()
    x_train, y_train, _ = pdata.load_split("train", args.limit)
    x_val, y_val, _ = pdata.load_split("val", args.limit)
    print(f"Classes: {len(names)} | train: {len(y_train)} | val: {len(y_val)}")

    model = make_model(len(names))
    model.fit(
        x_train, y_train,
        validation_data=(x_val, y_val),
        epochs=args.epochs,
        batch_size=args.batch,
        shuffle=True,
        callbacks=[tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy", patience=6, restore_best_weights=True)],
    )

    model.save(MODEL_PATH)
    pdata.save_class_names(OUT, names)
    print("Saved:", MODEL_PATH)


if __name__ == "__main__":
    main()
