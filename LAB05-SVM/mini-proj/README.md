# SVM Pokemon Classification

Classifies Pokemon species from images using an SVM (RBF kernel) trained on grayscale pixel features reduced with PCA.

## Setup

1. Download the dataset: https://www.kaggle.com/datasets/lantian773030/pokemonclassification
2. Place the extracted `PokemonData/` folder here, next to `main.py`.
3. `pip install -r ../requirements.txt`

## Usage

```bash
python main.py        # load images, preprocess, split, train SVM, evaluate
python test_svm.py    # run the trained model on a few random test images
```

## Files

- `data_load.py` — reads images from `PokemonData/<class>/*.jpg`, resizes and grayscales them
- `preprocess.py` — image resize/grayscale + flatten to feature vectors
- `split_data.py` — stratified train/test split
- `svm_model.py` — StandardScaler + PCA + SVC(kernel="rbf") pipeline
- `evaluate.py` — accuracy, classification report, confusion matrix plot
- `test_svm.py` — visualize predictions on random test samples
