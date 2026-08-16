# ML-04-KNN — Pokemon Type Classification & Clustering

Two mini-projects built around the same Pokemon dataset, demonstrating K-Nearest Neighbors (KNN) for classification and K-Means for clustering, each implemented both from scratch in TensorFlow and cross-checked against scikit-learn.

## Dataset

[Pokemon Images and Types](https://www.kaggle.com/datasets/vishalsubbiah/pokemon-images-and-types) (Kaggle, by Vishal Subbiah)

- `pokemon.csv` — 809 Pokemon with `Name`, `Type1`, `Type2`, `Evolution`, `image`
- `image/` — one PNG sprite per Pokemon

Place the dataset at `mini-proj/data-pokemon/` (containing `pokemon.csv` and the `image/` folder) before running either mini-project.

## Structure

```text
ML-04-KNN/
│
├── mini-proj/
│   ├── data-pokemon/
│   │   ├── pokemon.csv
│   │   └── image/
│   │       └── *.png
│   │
│   ├── classification/
│   │   ├── data_loader.py     # load sprites + Type1 labels, train/val/test split
│   │   ├── knn_tf.py          # KNN classifier implemented in TensorFlow
│   │   ├── evaluate.py        # accuracy, classification report, confusion matrix
│   │   ├── main.py            # pipeline: search best k, train, evaluate, save outputs
│   │   └── outputs/
│   │       ├── 01_k_curve.png
│   │       ├── 02_confusion_matrix.png
│   │       └── predictions.csv
│   │
│   └── clustering/
│       ├── data_loader.py     # build features (multi-hot Type1/Type2 + has-evolution flag)
│       ├── kmeans_tf.py       # K-Means implemented in TensorFlow
│       ├── knn_tools.py       # assign new points to existing clusters via nearest centroid/neighbors
│       ├── visualize.py       # elbow plot, cluster scatter plot (PCA 2D)
│       ├── main.py            # pipeline: elbow method, fit K-Means, visualize, save outputs
│       └── outputs/
│           ├── 01_elbow.png
│           ├── 02_clusters.png
│           ├── cluster_summary.csv
│           └── clustered_animals.csv
│
└── README.md
```

## Classification — predicting a Pokemon's primary type (Type1)

Each Pokemon sprite is flattened into a pixel feature vector and classified into one of 18 `Type1` classes using KNN.

```bash
cd mini-proj/classification
python main.py
```

The pipeline:
1. Loads sprites and splits them into train / validation / test sets.
2. Searches over several values of `k` and picks the one with the best validation accuracy.
3. Trains the final KNN model and evaluates it on the test set (accuracy, classification report, confusion matrix).
4. Cross-checks the TensorFlow KNN implementation against scikit-learn's `KNeighborsClassifier`.
5. Compares the model's accuracy against a naive baseline (always predicting the most common class).
6. Saves the k-search curve, confusion matrix plot, and per-sample predictions to `outputs/`.

Note: raw pixel colors are a weak signal for a Pokemon's type (e.g. Fire types aren't always red/orange), so accuracy on this task is expected to be well above the naive baseline but still modest.

## Clustering — grouping Pokemon by typing

Since the raw CSV has no numeric columns, features are engineered from `Type1` / `Type2` (an 18-dimensional multi-hot type vector) plus a flag for whether the Pokemon has a further evolution.

```bash
cd mini-proj/clustering
python main.py
```

The pipeline:
1. Builds and scales the feature matrix.
2. Runs the elbow method over a range of cluster counts to help pick `k`.
3. Fits K-Means (TensorFlow implementation) on the known portion of the data.
4. Assigns new/unseen Pokemon to the nearest existing cluster using `knn_tools.py`.
5. Projects the features to 2D with PCA for visualization.
6. Saves the elbow plot, cluster scatter plot, and per-Pokemon cluster assignments to `outputs/`.

## Requirements

```bash
pip install tensorflow scikit-learn pandas numpy matplotlib opencv-python-headless
```
