from tensorflow import keras
from tensorflow.keras import layers


def vgg_block(model, filters, n_conv):
    """n_conv x (Conv3x3 -> BatchNorm -> ReLU), then halve the resolution."""
    for _ in range(n_conv):
        model.add(layers.Conv2D(filters, 3, padding="same", use_bias=False))
        model.add(layers.BatchNormalization())
        model.add(layers.Activation("relu"))
    model.add(layers.MaxPooling2D(2))


def build_model(input_shape, num_classes, blocks, dense_units=256,
                dropout=0.3, lr=1e-3):
    """blocks      : list of (filters, n_conv) -> number of conv layers/filters
       dense_units : neurons in the fully-connected layer"""
    model = keras.Sequential()
    model.add(keras.Input(shape=input_shape))

    # Augmentation (active only during fit)
    model.add(layers.RandomFlip("horizontal"))
    model.add(layers.RandomRotation(0.08))
    model.add(layers.RandomZoom(0.1))

    for filters, n_conv in blocks:
        vgg_block(model, filters, n_conv)

    model.add(layers.GlobalAveragePooling2D())
    model.add(layers.Dense(dense_units, activation="relu"))
    model.add(layers.Dropout(dropout))
    model.add(layers.Dense(num_classes, activation="softmax"))

    model.compile(
        optimizer=keras.optimizers.Adam(lr),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model
