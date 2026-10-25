# LAB10-Object Detection II

This project uses **Ultralytics YOLOv8** with the **Pokémon Classification** dataset. It fine-tunes a pretrained **YOLOv8n-cls** model to recognise 150 Pokémon and covers training, evaluation, image inference, and real-time webcam inference.

## 1. Project Overview

**Features:**
- 150-class Pokémon recognition
- Pretrained YOLOv8 fine-tuning (`yolov8n-cls.pt`)
- Evaluation using Top-1 and Top-5 accuracy
- Image and real-time webcam inference
- Automatic model checkpoints, confusion matrices, and epoch-by-epoch CSV training logs

> **Why classification instead of detection?** The PokemonData dataset has no bounding-box annotations (one Pokémon per image), so YOLOv8 detection (Precision / Recall / mAP) cannot be trained on it. YOLOv8's classification mode uses the same Ultralytics workflow and works directly with this folder-per-class layout.

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

YOLO classification needs `train/`, `val/` and `test/` folders. `prepare_data.py` (run automatically by `train.py`) builds them into `dataset/` from `PokemonData/` using a per-class split of **70 / 15 / 15 %** with a fixed seed (42). Files are hard-linked when possible, so no extra disk space is used (otherwise copied).

## 3. Project Structure

```text
LAB10-Object-Detection-II/
├── PokemonData/{ClassName}/*.jpg     <- put the Kaggle dataset here
├── dataset/{train,val,test}/{ClassName}/*.jpg   <- generated automatically
├── common.py
├── prepare_data.py
├── train.py
├── evaluate.py
├── image_test.py
├── realtime_test.py
├── requirements.txt
└── README.md
```

| Script | Purpose |
|---|---|
| `prepare_data.py` | Build `dataset/` (train / val / test) from `PokemonData/` |
| `train.py` | Train YOLOv8-cls and save checkpoints and training logs to `runs/pokemon/` |
| `evaluate.py` | Evaluate on the test split (Top-1 / Top-5), save results to `runs/evaluation/` |
| `image_test.py` | Classify random test images (or your own), save results to `runs/image_test/` |
| `realtime_test.py` | Webcam real-time classification (top-3 shown). Press **Q** to exit |
| `common.py` | Shared paths, dataset preparation, weights lookup, device selection |

## 4. Usage

```bash
pip install -r requirements.txt
```

**Train** (uses GPU 0 if available, otherwise CPU):

```bash
python train.py                         # 30 epochs, imgsz 224, batch 32
python train.py --epochs 10 --batch 16  # quick run / less memory
```

**Evaluate:**

```bash
python evaluate.py
```

**Image test** — random test images, or your own picture:

```bash
python image_test.py
python image_test.py --image path/to/pikachu.jpg
python image_test.py --no-show          # save only, no window
```

**Real-time test:**

```bash
python realtime_test.py --camera 0
```

The inference scripts load `runs/pokemon/weights/best.pt`, so run `train.py` first.

## 5. Future Work

Potential improvements include larger models (`yolov8s-cls`, `yolov8m-cls`), hyperparameter tuning, stronger augmentation, class-wise error analysis, inference FPS measurement, and web deployment. To get true object detection, use a dataset with bounding-box labels (or label the Pokémon yourself) and switch back to YOLOv8 detection (`yolov8n.pt`).

## 6. References

- [Pokemon Classification dataset](https://www.kaggle.com/datasets/lantian773030/pokemonclassification)
- [Ultralytics YOLO Documentation](https://docs.ultralytics.com/models/yolov8/)
- [Ultralytics Image Classification](https://docs.ultralytics.com/tasks/classify/)
