# LAB08 - DCNN on the Pokemon Image Dataset

Data: https://www.kaggle.com/datasets/lantian773030/pokemonclassification
(150 classes, one folder per Pokemon).

## Structure

```text
LAB08-DCNN/
├── PokemonData/                 # unzipped Kaggle dataset
│   ├── Abra/
│   │   ├── 0.jpg
│   │   └── ...
│   └── ...
├── mini-proj/
│   ├── main.py                  # Main pipeline: train and compare configurations
│   ├── data_loader.py           # Load images, skip unreadable files
│   ├── preprocessing.py         # Resize, BGR to RGB, PNG transparency, standardization
│   ├── split_data.py            # Stratified train/validation/test split
│   ├── vgg_model.py             # VGG-style DCNN builder
│   ├── evaluate.py              # Plots and classification report
│   └── outputs/                 # Generated files
└── requirements.txt
```

## Setup

```
pip install -r requirements.txt
cd mini-proj
python main.py                       # defaults: 64x64 images, epochs 5/10/20/30
python main.py --data /path/to/PokemonData --checkpoints 10 20 40
```

## Pipeline (matches the lab contents)
1. Load dataset (`data_loader.py`; skips unreadable files, handles PNG transparency)
2. Stratified split 60/20/20 train/val/test (`split_data.py`)
3. Standardize per channel with train-set mean/std (`preprocessing.standardize`)
4. Build VGG-style DCNN (`vgg_model.py`)
5. Train 4 configurations (`main.py: CONFIGS`) that vary conv layers and dense neurons
6. Compare accuracy at several epoch counts, then predict with the best model

| Config | Conv blocks | Conv layers | Dense neurons |
|--------|-------------|-------------|---------------|
| A | 2 | 2  | 128 |
| B | 3 | 6  | 256 |
| C | 3 | 6  | 512 |
| D | 4 | 10 | 256 |

B vs C isolates the effect of neurons; A vs B vs D isolates depth.

## Epoch comparison
No early stopping and a constant learning rate are used, so the model after
epoch N of one run equals a model trained for N epochs. Test accuracy is logged
at each value in `--checkpoints`.

## Outputs (`mini-proj/outputs/`)
- `results.csv`: train/val/test accuracy for every config x epoch count
- `accuracy_vs_epochs.png`: epoch comparison plot
- `training_history_all.png`: all models overlaid (train/val accuracy and loss)
- `history_A..D.png`, `histories.json`: per-model training/validation accuracy and loss
- `predictions.csv`, `prediction_sample.png`, `classification_report.txt`:
  predictions of the best model (selected by validation accuracy)
- `best_model.keras`