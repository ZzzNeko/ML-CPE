# mini-proj: Pokemon Image Classification (MLP)

Training pipeline for classifying 149 Pokemon from images using a
fully-connected neural network (MLP) built with `tensorflow.keras`.

See the [root README](../README.md) for how to download the dataset.

## Pipeline (`main.py`)

1. **Load** — `data_loader.py` walks `../PokemonData/<class>/`, reads each
   image with OpenCV, resizes it, and skips any file it can't decode.
2. **Preprocess** — `preprocessing.py` resizes to `IMG_SIZE x IMG_SIZE`,
   converts BGR → RGB, and keeps the array as `uint8` (0-255 scaling is
   done inside the model, not here).
3. **Split** — `split_data.py` does a stratified train / validation / test
   split (default 70% / 10% / 20%).
4. **Train** — `nn_model.py` builds and trains the MLP, with early stopping
   and learning-rate reduction on plateau.
5. **Evaluate** — `evaluate.py` reports accuracy, a per-class classification
   report, and a confusion matrix; also plots the training curves.

All intermediate arrays and the trained model are written to `outputs/`.

Run it with:

```bash
python main.py
```

Then check a handful of predictions visually:

```bash
python test_nn.py
```

## Model

A simple MLP (not a CNN):

```
Input (100, 100, 3)
Rescaling(1/255)
Flatten
Dense(256, relu) -> BatchNorm -> Dropout(0.4)
Dense(128, relu) -> BatchNorm -> Dropout(0.4)
Dense(64, relu)  -> Dropout(0.3)
Dense(num_classes, softmax)
```

Trained with Adam, `sparse_categorical_crossentropy`, early stopping
(`patience=5` on `val_loss`), and `ReduceLROnPlateau`.

## Results

On the included run (149 classes, `outputs/history.json`):

- Best validation accuracy: **~22%**
- Test set size: 1,364 images

An MLP flattens the image and throws away spatial structure, so this
accuracy is expected to be modest on a 149-way fine-grained task like this
— a CNN would do meaningfully better. See `outputs/confusion_matrix.png`
and `outputs/training_history.png` for the full picture, and
`outputs/prediction_sample.png` for example predictions from `test_nn.py`.

## Configuration

Edit the constants at the top of `main.py`:

| Constant        | Default | Meaning                                   |
|-----------------|---------|--------------------------------------------|
| `IMG_SIZE`      | 100     | Images are resized to `IMG_SIZE x IMG_SIZE` |
| `TEST_SIZE`     | 0.2     | Fraction of data held out for testing       |
| `VAL_SIZE`      | 0.1     | Fraction of data held out for validation    |
| `MAX_PER_CLASS` | 3000    | Cap per class (`None` = use all images)     |
| `EPOCHS`        | 30      | Max training epochs (early stopping applies)|
| `BATCH_SIZE`    | 32      | Training batch size                         |

## Outputs

| File                       | Contents                                    |
|-----------------------------|----------------------------------------------|
| `classes.json`              | Ordered list of class names                  |
| `labels.npy`, `features.npy`| All loaded labels / images before splitting  |
| `X_*.npy`, `y_*.npy`        | Train / validation / test splits             |
| `nn_model.keras`            | Trained model                                |
| `history.json`              | Per-epoch accuracy/loss                      |
| `confusion_matrix.png`      | Confusion matrix over the test set           |
| `training_history.png`      | Accuracy/loss curves                         |
| `prediction_sample.png`     | 4 random test predictions (from `test_nn.py`)|
