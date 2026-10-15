import cv2
import numpy as np


def preprocess_image(image, img_size=64):
    """BGR/BGRA/gray -> RGB uint8, resized to (img_size, img_size)."""
    if image is None or image.size == 0:
        return None

    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
    elif image.shape[2] == 4:
        # Transparent PNGs: paste onto a white background instead of black
        alpha = image[:, :, 3:4].astype(np.float32) / 255.0
        rgb = image[:, :, :3].astype(np.float32)
        image = (rgb * alpha + 255.0 * (1.0 - alpha)).astype(np.uint8)
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    else:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    return cv2.resize(image, (img_size, img_size), interpolation=cv2.INTER_AREA)


def to_features(images):
    return np.ascontiguousarray(images, dtype=np.uint8)


def standardize(X_train, X_val, X_test):
    """Per-channel standardization: (x - mean) / std.

    Mean and std come from the TRAINING set only, so no information from the
    validation/test data leaks into training.
    """
    X_train = X_train.astype("float32")
    mean = X_train.mean(axis=(0, 1, 2), keepdims=True)
    std = X_train.std(axis=(0, 1, 2), keepdims=True) + 1e-7

    X_train = (X_train - mean) / std
    X_val = (X_val.astype("float32") - mean) / std
    X_test = (X_test.astype("float32") - mean) / std
    return X_train, X_val, X_test, mean.ravel(), std.ravel()
