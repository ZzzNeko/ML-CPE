# LAB06 - Neural Network (NN)

A neural network (MLP) image classification pipeline in Python. The project
covers image loading, preprocessing, dataset splitting, model training,
evaluation, and prediction — applied to classifying the first 149 Pokemon
from images.

## Dataset

**Pokemon Classification Dataset** (Kaggle):
https://www.kaggle.com/datasets/lantian773030/pokemonclassification

The dataset is **not included in this repository** because it's too large
to commit (~800 MB, ~7,000 images across 149 classes). Download it yourself
and place it next to `mini-proj/`, so the folder layout matches the tree
below:

1. Download and unzip the dataset from the Kaggle link above (requires a
   free Kaggle account).
2. Copy its `PokemonData/` folder to the root of this repo, so you end up
   with `LAB06-NN/PokemonData/<ClassName>/<image>.jpg`.
3. `data_loader.py` auto-detects classes from the subfolder names, so no
   further configuration is needed.

## Setup

```bash
pip install -r requirements.txt
```

## Usage

```bash
cd mini-proj
python main.py       # loads data, trains, evaluates -> outputs/
python test_nn.py    # runs the saved model on 4 random test images
```

See `mini-proj/README.md` for pipeline details, model architecture, and
results.

## Structure

```text
LAB06-NN/
│
├── PokemonData/                     # dataset (download separately, see above)
│   ├── Abra/
│   │   ├── 2eb2a528f9a247358452b3c740df69a0.jpg
│   │   └── ...
│   └── ...
│
├── mini-proj/
│   ├── main.py                     # main training pipeline
│   ├── data_loader.py              # load images and skip corrupted files
│   ├── preprocessing.py            # resize images and convert BGR to RGB
│   ├── split_data.py               # split data into train / validation / test
│   ├── nn_model.py                 # build, train, save, and predict with the NN
│   ├── evaluate.py                 # accuracy, classification report, confusion matrix, training plots
│   ├── test_nn.py                  # test the trained model on 4 random images
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
│       ├── nn_model.keras
│       ├── history.json
│       ├── confusion_matrix.png
│       ├── training_history.png
│       └── prediction_sample.png
│
└── requirements.txt
```

## Summary

Images are automatically loaded from the `PokemonData/` class subdirectories,
resized to a fixed resolution, and converted from BGR to RGB during
preprocessing. The dataset is split into training, validation, and test sets,
then used to train a fully-connected neural network (MLP) with batch
normalization and dropout for regularization. The trained model is evaluated
using accuracy, precision, recall, F1-score, a confusion matrix, and training
history plots to assess its classification performance across 149 Pokemon
classes.
