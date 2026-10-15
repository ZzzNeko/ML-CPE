import argparse
import json
import os

import numpy as np
import pandas as pd
from tensorflow import keras

from data_loader import load_data
from preprocessing import to_features, standardize
from split_data import split_dataset
from vgg_model import build_model
from evaluate import (plot_history, plot_epoch_comparison, plot_predictions,
                      report)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ---- DCNN configurations to compare -------------------------------------
# blocks = list of (filters, number of conv layers in the block)
CONFIGS = {
    "A: 2 blocks / 2 conv / 128 neurons":
        dict(blocks=[(32, 1), (64, 1)], dense=128),
    "B: 3 blocks / 6 conv / 256 neurons":
        dict(blocks=[(32, 2), (64, 2), (128, 2)], dense=256),
    "C: 3 blocks / 6 conv / 512 neurons":
        dict(blocks=[(32, 2), (64, 2), (128, 2)], dense=512),
    "D: 4 blocks / 10 conv / 256 neurons":
        dict(blocks=[(32, 2), (64, 2), (128, 3), (256, 3)], dense=256),
}


class CheckpointEval(keras.callbacks.Callback):
    """Record train/val/test accuracy at chosen epoch counts.

    There is no early stopping and the learning rate is constant, so the model
    after epoch N of one long run is identical to a model trained for exactly
    N epochs. One run therefore gives the whole epochs comparison.
    """

    def __init__(self, X_test, y_test, checkpoints):
        super().__init__()
        self.X_test, self.y_test = X_test, y_test
        self.checkpoints = set(checkpoints)
        self.rows = []

    def on_epoch_end(self, epoch, logs=None):
        n = epoch + 1
        if n in self.checkpoints:
            _, test_acc = self.model.evaluate(self.X_test, self.y_test, verbose=0)
            self.rows.append(dict(epochs=n,
                                  train_acc=logs["accuracy"],
                                  val_acc=logs["val_accuracy"],
                                  test_acc=test_acc))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(BASE_DIR, "..", "PokemonData"))
    ap.add_argument("--img-size", type=int, default=64)
    ap.add_argument("--checkpoints", type=int, nargs="+", default=[5, 10, 20, 30])
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--max-per-class", type=int, default=None)
    ap.add_argument("--out", default=os.path.join(BASE_DIR, "outputs"))
    args = ap.parse_args()

    max_epochs = max(args.checkpoints)
    os.makedirs(args.out, exist_ok=True)
    keras.utils.set_random_seed(42)

    # 1. Load -----------------------------------------------------------
    print("\n[1] Loading dataset")
    images, labels, classes = load_data(args.data, args.img_size, args.max_per_class)
    X = to_features(images)
    with open(f"{args.out}/classes.json", "w") as f:
        json.dump(classes, f)

    # 2. Split (60 / 20 / 20, stratified) ---------------------------------
    print("\n[2] Splitting dataset")
    X_tr, X_va, X_te, y_tr, y_va, y_te = split_dataset(X, labels, 0.2, 0.2)
    print(f"train {len(X_tr)} | val {len(X_va)} | test {len(X_te)}")
    X_te_raw = X_te.copy()                      # un-standardized, for plotting

    # 3. Standardize (statistics from the training set only) ------------
    print("\n[3] Standardizing")
    X_tr, X_va, X_te, mean, std = standardize(X_tr, X_va, X_te)
    print("channel mean:", mean.round(1), "std:", std.round(1))

    # 4. Train every configuration -----------------------------------------
    rows, histories, models = [], {}, {}
    for name, cfg in CONFIGS.items():
        print(f"\n[4] {name}")
        model = build_model(X_tr.shape[1:], len(classes), cfg["blocks"], cfg["dense"])
        print(f"parameters: {model.count_params():,}")
        ckpt = CheckpointEval(X_te, y_te, args.checkpoints)
        hist = model.fit(X_tr, y_tr, validation_data=(X_va, y_va),
                         epochs=max_epochs, batch_size=args.batch_size,
                         callbacks=[ckpt], verbose=2)
        for r in ckpt.rows:
            rows.append(dict(config=name, params=model.count_params(), **r))
        histories[name] = {k: [float(v) for v in vs] for k, vs in hist.history.items()}
        models[name] = model
        tag = name.split(":")[0]
        plot_history(histories[name], name, f"{args.out}/history_{tag}.png")

    # 5. Results tables / plots ----------------------------------------------
    df = pd.DataFrame(rows)
    df.to_csv(f"{args.out}/results.csv", index=False)
    with open(f"{args.out}/histories.json", "w") as f:
        json.dump(histories, f)
    plot_epoch_comparison(df, f"{args.out}/accuracy_vs_epochs.png")

    pd.set_option("display.width", 200)
    print("\n=========== Accuracy per configuration and epoch count ===========")
    print((df.pivot(index="config", columns="epochs", values="test_acc") * 100)
          .round(2).to_string())

    # 6. Predictions with the best model (chosen on VALIDATION accuracy) --
    final = df[df.epochs == max_epochs].sort_values("val_acc", ascending=False)
    best = final.iloc[0]["config"]
    print(f"\nBest configuration (by validation accuracy): {best}")
    probs = models[best].predict(X_te, verbose=0)
    pred = probs.argmax(axis=1)
    conf = probs.max(axis=1)
    top3 = np.argsort(-probs, axis=1)[:, :3]

    pd.DataFrame({
        "true": [classes[i] for i in y_te],
        "predicted": [classes[i] for i in pred],
        "confidence": conf.round(4),
        "top3": ["; ".join(classes[j] for j in row) for row in top3],
        "correct": pred == y_te,
    }).to_csv(f"{args.out}/predictions.csv", index=False)

    acc = report(y_te, pred, classes, f"{args.out}/classification_report.txt")
    top3_acc = float(np.mean([y in row for y, row in zip(y_te, top3)]))
    print(f"Test accuracy (best model): {acc*100:.2f}%  | top-3 accuracy: {top3_acc*100:.2f}%")
    plot_predictions(X_te_raw, y_te, pred, conf, classes,
                     f"{args.out}/prediction_sample.png")
    models[best].save(f"{args.out}/best_model.keras")
    print(f"\nAll outputs saved to {os.path.abspath(args.out)}")


if __name__ == "__main__":
    main()
