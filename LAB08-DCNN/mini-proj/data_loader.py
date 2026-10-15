import os
import cv2
import numpy as np

from preprocessing import preprocess_image

VALID_EXT = (".jpg", ".jpeg", ".png", ".bmp")


def find_class_root(data_path):
    """Kaggle zips often nest the data (e.g. PokemonData/PokemonData/<class>/).
    Descend while the folder holds exactly one sub-folder and no images."""
    while True:
        entries = os.listdir(data_path)
        subdirs = [e for e in entries if os.path.isdir(os.path.join(data_path, e))]
        has_files = any(e.lower().endswith(VALID_EXT) for e in entries)
        if len(subdirs) == 1 and not has_files:
            data_path = os.path.join(data_path, subdirs[0])
        else:
            return data_path


def load_data(data_path, img_size=64, max_per_class=None):
    if not os.path.isdir(data_path):
        raise FileNotFoundError(f"Dataset not found: {os.path.abspath(data_path)}")

    data_path = find_class_root(data_path)

    classes = sorted(
        f for f in os.listdir(data_path)
        if os.path.isdir(os.path.join(data_path, f))
    )
    print(f"Detected {len(classes)} classes in {data_path}")

    images, labels = [], []
    total_skipped = 0

    for label, class_name in enumerate(classes):
        class_path = os.path.join(data_path, class_name)
        filenames = sorted(
            f for f in os.listdir(class_path) if f.lower().endswith(VALID_EXT)
        )

        loaded = 0
        for filename in filenames:
            if max_per_class and loaded >= max_per_class:
                break

            # IMREAD_UNCHANGED keeps the alpha channel of PNGs
            image = cv2.imread(os.path.join(class_path, filename), cv2.IMREAD_UNCHANGED)
            image = preprocess_image(image, img_size)

            if image is None:          # unreadable / damaged file
                total_skipped += 1
                continue

            images.append(image)
            labels.append(label)
            loaded += 1

    print(f"Loaded {len(images)} images, skipped {total_skipped} unreadable files")
    return np.stack(images), np.array(labels), classes
