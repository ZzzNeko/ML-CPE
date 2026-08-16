# LAB05-SVM — Pokemon Species Recognition

Image classification of the original 150 Pokemon species using a Support Vector Machine (SVM) with an RBF kernel, trained on grayscale pixel features reduced with PCA.

## Dataset

[7,000 Labeled Pokemon](https://www.kaggle.com/datasets/lantian773030/pokemonclassification) (Kaggle, by lantian773030)

- 150 classes (Generation 1 Pokemon species)
- ~7,000 hand-labeled images total
- One subfolder per species: `PokemonData/<species>/*.jpg`

Download the dataset and place the extracted `PokemonData/` folder inside `mini-proj/` (next to `main.py`) before running.

## Structure

```text
LAB05-SVM/
│
├── mini-proj/
│   ├── PokemonData/
│   │   ├── Pikachu/
│   │   ├── Bulbasaur/
│   │   └── ...
│   │
│   ├── main.py            # pipeline: load, preprocess, split, train, evaluate
│   ├── data_load.py        # read images from class folders, resize + grayscale
│   ├── preprocess.py       # resize/grayscale + flatten to feature vectors
│   ├── split_data.py       # stratified train/test split
│   ├── svm_model.py        # StandardScaler + PCA + SVC(kernel="rbf") pipeline
│   ├── evaluate.py         # accuracy, classification report, confusion matrix
│   ├── test_svm.py         # visualize predictions on random test samples
│   └── outputs/
│       ├── images.npy
│       ├── labels.npy
│       ├── classes.json
│       ├── X_train.npy
│       ├── X_test.npy
│       ├── y_train.npy
│       ├── y_test.npy
│       ├── scaler.pkl
│       ├── svm_model.pkl
│       ├── confusion_matrix.png
│       └── prediction_sample.png
│
└── requirements.txt
```

## Run

```bash
cd mini-proj
python main.py        # load data, train SVM, evaluate -> outputs/
python test_svm.py    # sample predictions on random test images -> outputs/prediction_sample.png
```

## Notes

- Images are resized to 100x100 and converted to grayscale (10,000 pixel features per image), then reduced to 150 principal components before training.
- Raw pixel color is a weak signal for species identity when there are 150 similar-looking classes, so accuracy is expected to be modest (well above the ~0.7% random baseline, but well below what a CNN would achieve on the same data).

## Requirements

```bash
pip install -r requirements.txt
```
