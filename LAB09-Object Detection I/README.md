# LAB09-Object Detection I

This project explores **R-CNN and Fast R-CNN** using Python and TensorFlow/Keras with the **Pokémon Classification** dataset. It covers model training, evaluation, image inference, and real-time webcam testing through simplified educational implementations.

## 1. Project Overview

Two CNN-based region-classification architectures share one dataset. Each architecture lives in its own folder with independent scripts for training, evaluation, and inference.

**Features:**
- R-CNN and Fast R-CNN style models
- Shared PokemonData dataset (150 Pokémon classes)
- Model training and evaluation (accuracy, top-5 accuracy, per-class report)
- Image and real-time webcam testing
- Model checkpoints and experiment outputs

## 2. Dataset

[Pokemon Classification (Kaggle)](https://www.kaggle.com/datasets/lantian773030/pokemonclassification) — folder name **`PokemonData`**.

```text
PokemonData/
├── Abra/        *.jpg
├── Aerodactyl/  *.jpg
├── ...
└── Zubat/       *.jpg        (150 class folders)
```

**Download and place it next to this README:**

```bash
pip install kaggle
kaggle datasets download -d lantian773030/pokemonclassification
unzip pokemonclassification.zip      # produces the PokemonData/ folder
```

The dataset has **no bounding boxes** (one Pokémon per image), so each image is treated as a single region. The train/val/test split is created automatically per class (70 / 15 / 15 %, fixed seed 42) in `pokemon_data.py`, so all scripts use identical splits. Class names are the folder names (sorted) and are saved to `outputs/classes.json` during training.

## 3. Project Structure

```text
LAB09-Object-Detection-I/
├── PokemonData/{ClassName}/*.jpg     <- put the Kaggle dataset here
├── pokemon_data.py                   <- shared loader, split, region helpers
│
├── 01-R-CNN/
│   ├── train.py
│   ├── evaluate.py
│   ├── image_test.py
│   ├── realtime_test.py
│   └── outputs/
│
├── 02-Fast-R-CNN/
│   ├── train.py
│   ├── evaluate.py
│   ├── image_test.py
│   ├── realtime_test.py
│   └── outputs/
│
├── requirements.txt
└── README.md
```

| Script | Purpose |
|---|---|
| `train.py` | Train the model and save `model.keras` + `classes.json` |
| `evaluate.py` | Evaluate on the train / val / test split |
| `image_test.py` | Predict a random (or given) image and save `image_result.jpg` |
| `realtime_test.py` | Webcam sliding-window inference. Press **Q** to exit |
| `outputs/` | Trained models, class names, and inference results |

## 4. Usage

Install dependencies, then run inside `01-R-CNN/` or `02-Fast-R-CNN/`:

```bash
pip install -r requirements.txt
```

**Train** (`--limit` = max images per class per split, `0` = all):

```bash
python train.py --limit 0 --epochs 30        # full training
python train.py --limit 20 --epochs 10       # quick run
```

**Evaluate:**

```bash
python evaluate.py --split test
```

**Image test** (random test image, or your own picture):

```bash
python image_test.py
python image_test.py --image path/to/pikachu.jpg
```

**Real-time webcam test:**

```bash
python realtime_test.py --camera 0 --threshold 0.5 --regions 25
```

## 5. Architectures

| | R-CNN | Fast R-CNN |
|---|---|---|
| Input | 96×96 RGB region | 96×96 RGB region |
| Backbone | 4 conv layers + max-pool | 3 conv layers + max-pool |
| Region feature | Global average pooling | Fixed-size ROI-style max-pool (6×6) + Flatten |
| Head | Dense 256 → Dropout → Softmax(150) | Dense 256 → Dropout → Softmax(150) |

Both use light augmentation (flip / rotation / zoom) during training.

**Implementation note:** These are simplified crop-classification baselines, not complete object detectors. Because PokemonData has no box annotations, `image_test.py` classifies the whole image and `realtime_test.py` uses a sliding-window region proposal plus NMS. Full implementations would need region proposals (e.g. Selective Search / RPN), bounding-box regression, and detection post-processing, and a dataset with box labels to train them.

## 6. References

- [Pokemon Classification dataset](https://www.kaggle.com/datasets/lantian773030/pokemonclassification)
- [R-CNN](https://arxiv.org/abs/1311.2524)
- [Fast R-CNN](https://arxiv.org/abs/1504.08083)
