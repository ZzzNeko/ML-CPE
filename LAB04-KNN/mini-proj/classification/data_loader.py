"""
Read CSV (Pokemon Images)
convert image pixels to features for KNN
split data: train / validation / test
"""

from pathlib import Path
import cv2
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

CSV_PATH = Path(__file__).resolve().parent.parent / "data-pokemon" / "pokemon.csv"
IMAGE_DIR = Path(__file__).resolve().parent.parent / "data-pokemon"

TARGET = "Type1"  # use Type1 as the target for prediction

def load_data(test_size=0.2, seed=42):
    # step 1 : read CSV
    df = pd.read_csv(CSV_PATH)
    
    image_features = []
    valid_indices = []

    # loop through CSV
    for idx, row in df.iterrows():
        img_path = IMAGE_DIR / str(row["image"]).replace("./", "")
        
        # load image with OpenCV
        img = cv2.imread(str(img_path))
        
        if img is not None:
            # resize image to have consistent size (e.g., 32x32 pixels) to ensure consistent feature size
            img_resized = cv2.resize(img, (32, 32))
            
            # convert 3D image to 1D array (Flatten) to have a consistent set of numbers
            img_flattened = img_resized.flatten()
            
            image_features.append(img_flattened)
            valid_indices.append(idx)

    # filter only rows where image was loaded successfully
    df = df.loc[valid_indices].reset_index(drop=True)
    
    # X is the pixel data of all images
    X = np.array(image_features, dtype="float32")

    # step 2 : convert target to number
    class_names = sorted(df[TARGET].unique())
    y = df[TARGET].map({name: i for i, name in enumerate(class_names)}).to_numpy(dtype="int32")

    # step 3 : split data into train 60 / validation 20 / test 20
    X_temp, X_test, y_temp, y_test = train_test_split(
        X, y, test_size=test_size, random_state=seed, stratify=y)

    X_train, X_val, y_train, y_val = train_test_split(
        X_temp, y_temp, test_size=0.25, random_state=seed, stratify=y_temp)

    # step 4 : Scaling pixel data
    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train).astype("float32")
    X_val = scaler.transform(X_val).astype("float32")
    X_test = scaler.transform(X_test).astype("float32")

    return {
        "X_train": X_train, "y_train": y_train,
        "X_val": X_val, "y_val": y_val,
        "X_test": X_test, "y_test": y_test,
        "class_names": class_names,
        "n_rows": len(df),
    }

if __name__ == "__main__":
    data = load_data()
    print("train :", data["X_train"].shape)
    print("val   :", data["X_val"].shape)
    print("test  :", data["X_test"].shape)
    print("คลาส  :", data["class_names"])