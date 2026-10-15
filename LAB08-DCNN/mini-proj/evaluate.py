import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import accuracy_score, classification_report


def plot_history(history, title, save_path):
    fig, axes = plt.subplots(1, 2, figsize=(11, 4))
    for ax, key, name in zip(axes, ["accuracy", "loss"], ["Accuracy", "Loss"]):
        ax.plot(history[key], label="train")
        ax.plot(history["val_" + key], label="validation")
        ax.set_xlabel("Epoch"); ax.set_ylabel(name)
        ax.set_title(f"{title} - {name}"); ax.legend()
    fig.tight_layout()
    fig.savefig(save_path, dpi=130)
    plt.close(fig)


def plot_epoch_comparison(df, save_path):
    """Test accuracy vs number of epochs, one line per configuration."""
    fig, ax = plt.subplots(figsize=(7, 4.5))
    for name, g in df.groupby("config"):
        g = g.sort_values("epochs")
        ax.plot(g["epochs"], g["test_acc"] * 100, marker="o", label=name)
    ax.set_xlabel("Number of epochs"); ax.set_ylabel("Test accuracy (%)")
    ax.set_title("Accuracy vs. epochs for each DCNN configuration")
    ax.grid(alpha=0.3); ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(save_path, dpi=130)
    plt.close(fig)


def plot_predictions(X_raw, y_true, y_pred, confidence, classes, save_path, n=12):
    rng = np.random.default_rng(0)
    idx = rng.choice(len(X_raw), min(n, len(X_raw)), replace=False)
    cols = 4
    rows = int(np.ceil(len(idx) / cols))
    fig, axes = plt.subplots(rows, cols, figsize=(3 * cols, 3.3 * rows))
    axes = np.atleast_1d(axes).ravel()
    for ax in axes:
        ax.axis("off")
    for ax, i in zip(axes, idx):
        ok = y_true[i] == y_pred[i]
        ax.imshow(X_raw[i])
        ax.set_title(f"Pred: {classes[y_pred[i]]} ({confidence[i]*100:.0f}%)\n"
                     f"True: {classes[y_true[i]]}",
                     color="green" if ok else "red", fontsize=9)
    fig.tight_layout()
    fig.savefig(save_path, dpi=130)
    plt.close(fig)


def report(y_true, y_pred, classes, save_path):
    labels = list(range(len(classes)))
    acc = accuracy_score(y_true, y_pred)
    text = classification_report(y_true, y_pred, labels=labels,
                                 target_names=classes, zero_division=0)
    with open(save_path, "w") as f:
        f.write(f"Accuracy: {acc*100:.2f}%\n\n{text}")
    return acc
