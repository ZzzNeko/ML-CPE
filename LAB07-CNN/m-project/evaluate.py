import matplotlib

# Set backend before pyplot, so it works without a display
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import MaxNLocator
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix
)


def evaluate_model(y_test, predictions, classes, save_path=None):

    # Pin label order so target_names always matches the columns
    labels = list(range(len(classes)))

    # Calculate accuracy
    accuracy = accuracy_score(y_test, predictions)

    print("\n------------ Evaluation ------------------")
    print(f"Accuracy: {accuracy * 100:.2f}%")

    print("\nClassification Report:")

    report = classification_report(
        y_test,
        predictions,
        labels=labels,
        target_names=classes,
        zero_division=0
    )

    print(report)
    print("Confusion Matrix:")

    matrix = confusion_matrix(y_test, predictions, labels=labels)
    print(matrix)

    if save_path:
        plot_confusion_matrix(matrix, classes, save_path, accuracy=accuracy)
        print(f"Saved: {save_path}")

    return accuracy


def plot_confusion_matrix(matrix, classes, save_path, accuracy=None):
    """Confusion matrix normalized to 0-100% per true class (per row).

    Raw counts are hard to compare across classes that have different
    numbers of test images, so each row is scaled to sum to 100. The
    diagonal then reads directly as "recall %" for that class, and the
    colorbar is fixed to a 0-100 scale so it's comparable across runs.
    """

    n = len(classes)

    matrix = np.asarray(matrix, dtype=float)
    row_sums = matrix.sum(axis=1, keepdims=True)
    row_sums[row_sums == 0] = 1  # avoid divide-by-zero for empty classes
    matrix_pct = (matrix / row_sums) * 100

    # Big label sets get unreadable if we also try to cram a number into
    # every cell, so only annotate when there are few enough classes.
    annotate = n <= 20
    figsize = (max(8, n * 0.45), max(7, n * 0.45)) if annotate else (max(10, n * 0.16), max(9, n * 0.16))

    fig, ax = plt.subplots(figsize=figsize)
    im = ax.imshow(matrix_pct, cmap="Blues", vmin=0, vmax=100, aspect="equal")

    label_fontsize = max(4, min(9, 300 / n))
    ax.set_xticks(np.arange(n))
    ax.set_xticklabels(classes, rotation=90, fontsize=label_fontsize)
    ax.set_yticks(np.arange(n))
    ax.set_yticklabels(classes, fontsize=label_fontsize)
    ax.set_xlabel("Predicted label")
    ax.set_ylabel("True label")

    title = "Confusion Matrix — normalized (% of true class)"
    if accuracy is not None:
        title += f"\nOverall test accuracy: {accuracy * 100:.2f}%"
    ax.set_title(title)

    # Thin white gridlines between cells instead of default axis grid
    ax.set_xticks(np.arange(-0.5, n, 1), minor=True)
    ax.set_yticks(np.arange(-0.5, n, 1), minor=True)
    ax.grid(which="minor", color="white", linewidth=0.3)
    ax.tick_params(which="minor", bottom=False, left=False)

    if annotate:
        threshold = 50
        for i in range(n):
            for j in range(n):
                ax.text(j, i, f"{matrix_pct[i, j]:.0f}", ha="center", va="center",
                        fontsize=label_fontsize,
                        color="white" if matrix_pct[i, j] > threshold else "black")

    cbar = fig.colorbar(im, ax=ax, fraction=0.03, pad=0.01)
    cbar.set_label("% of true class predicted as this label")
    cbar.set_ticks([0, 25, 50, 75, 100])

    fig.tight_layout()
    fig.savefig(save_path, dpi=150)
    plt.close(fig)


def plot_history(history, save_path):
    """Accuracy, loss and learning rate, side by side.

    Accuracy and loss are plotted in separate panels (they live on very
    different scales, e.g. accuracy 0-1 vs. loss 0-5, so sharing one axis
    used to squash the accuracy lines flat near zero). Learning rate is
    overlaid on the loss panel on its own log-scale axis, since
    ReduceLROnPlateau changes it by orders of magnitude, not by a small
    amount.
    """

    hist = history.history if hasattr(history, "history") else history
    epochs = np.arange(1, len(hist["accuracy"]) + 1)

    plt.style.use("seaborn-v0_8-whitegrid")
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5.5))
    fig.suptitle("Training History", fontsize=16, fontweight="bold")

    # --- Panel 1: Accuracy (%) ---
    train_acc = np.array(hist["accuracy"]) * 100
    val_acc = np.array(hist["val_accuracy"]) * 100

    ax1.plot(epochs, train_acc, marker="o", linewidth=2.2, color="#2563eb", label="Train accuracy")
    ax1.plot(epochs, val_acc, marker="o", linewidth=2.2, color="#f97316",
              linestyle="--", label="Val accuracy")
    ax1.fill_between(epochs, train_acc, val_acc, color="gray", alpha=0.08)

    best_epoch = int(np.argmax(val_acc)) + 1
    best_val = val_acc.max()
    ax1.scatter([best_epoch], [best_val], color="#16a34a", s=90, zorder=5,
                label=f"Best val: {best_val:.1f}% (epoch {best_epoch})")

    ax1.set_xlabel("Epoch")
    ax1.set_ylabel("Accuracy (%)")
    ax1.set_title("Accuracy")
    ax1.set_ylim(0, 100)
    ax1.xaxis.set_major_locator(MaxNLocator(nbins=15, integer=True, min_n_ticks=1))
    ax1.legend(loc="upper left", fontsize=9)
    ax1.grid(alpha=0.3)

    # --- Panel 2: Loss + Learning Rate ---
    train_loss = hist["loss"]
    val_loss = hist["val_loss"]

    l1, = ax2.plot(epochs, train_loss, marker="o", linewidth=2.2, color="#dc2626", label="Train loss")
    l2, = ax2.plot(epochs, val_loss, marker="o", linewidth=2.2, color="#7c3aed",
                    linestyle="--", label="Val loss")
    ax2.set_xlabel("Epoch")
    ax2.set_ylabel("Loss")
    ax2.set_title("Loss & Learning Rate")
    ax2.xaxis.set_major_locator(MaxNLocator(nbins=15, integer=True, min_n_ticks=1))
    ax2.grid(alpha=0.3)

    lr_key = "learning_rate" if "learning_rate" in hist else "lr"
    lines = [l1, l2]
    if lr_key in hist:
        ax3 = ax2.twinx()
        l3, = ax3.step(epochs, hist[lr_key], where="mid", linewidth=2, color="#059669",
                        linestyle="-.", marker="s", markersize=4, label="Learning rate")
        ax3.set_ylabel("Learning rate (log scale)", color="#059669")
        ax3.tick_params(axis="y", labelcolor="#059669")
        ax3.set_yscale("log")
        ax3.grid(False)
        lines.append(l3)

    labels = [l.get_label() for l in lines]
    ax2.legend(lines, labels, loc="upper right", fontsize=9)

    fig.tight_layout(rect=[0, 0, 1, 0.94])
    fig.savefig(save_path, dpi=150)
    plt.close(fig)
    print(f"Saved: {save_path}")
