# LAB07 - Convolutional Neural Network (CNN)

A convolutional neural network (CNN) image classification pipeline in
Python, built with `tf.keras`. The project covers image loading,
preprocessing, dataset splitting, model training, evaluation, and
prediction — applied to classifying 150 Pokemon from images.

## Dataset

**Pokemon Classification Dataset** (Kaggle):
https://www.kaggle.com/datasets/lantian773030/pokemonclassification

The dataset is **not included in this repository** because it's too large
to commit (~800 MB, ~7,000 images across 150 classes). Download it
yourself and place it next to `m-project/`, so the folder layout matches
the tree below:

1. Download and unzip the dataset from the Kaggle link above (requires a
   free Kaggle account).
2. Copy its `PokemonData/` folder to the root of this repo, so you end up
   with `LAB07-CNN/PokemonData/<ClassName>/<image>.jpg`.
3. `data_loader.py` auto-detects classes from the subfolder names, so no
   further configuration is needed.

## Setup

```bash
pip install tensorflow opencv-python numpy scikit-learn matplotlib
```

## Usage

```bash
cd m-project
python main.py       # full pipeline: load -> preprocess -> split -> train -> evaluate
python test_cnn.py   # sanity-check the saved model on a few random images
```

See `m-project/README.md` for pipeline details, model architecture, and
results.

## Structure

```text
LAB07-CNN/
│
├── PokemonData/                     # dataset (download separately, see above)
│   ├── Abra/
│   │   ├── 2eb2a528f9a247358452b3c740df69a0.jpg
│   │   └── ...
│   └── ...
│
├── m-project/
│   ├── main.py                     # main training pipeline
│   ├── data_loader.py              # load images and skip corrupted files
│   ├── preprocessing.py            # resize images and convert BGR to RGB
│   ├── split_data.py               # split data into train / validation / test
│   ├── cnn_model.py                # build, train, save, and predict with the CNN
│   ├── evaluate.py                 # accuracy, classification report, confusion matrix, training plots
│   ├── test_cnn.py                 # test the trained model on a few random images
│   ├── README.md                   # pipeline details, architecture, results
│   └── outputs/
│       ├── features.npy
│       ├── labels.npy
│       ├── classes.json
│       ├── X_train.npy
│       ├── X_val.npy
│       ├── X_test.npy
│       ├── y_train.npy
│       ├── y_val.npy
│       ├── y_test.npy
│       ├── cnn_model.keras
│       ├── history.json
│       ├── confusion_matrix.png
│       ├── training_history.png
│       └── prediction_sample.png
│
└── README.md
```

## Summary

Images are automatically loaded from `PokemonData/`, resized to 100x100
RGB, and split into train / validation / test sets (stratified, so every
class is represented proportionally in each split). A small CNN
(3 conv blocks + a dense head, with light data augmentation) is trained
on the result, then evaluated on the held-out test set with a
classification report, a normalized confusion matrix, and training-history
plots. See `m-project/README.md` for the model architecture and the
latest results in detail.
