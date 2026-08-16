





## Read data from CSV file and prepare for clustering mini-project 

from pathlib import Path

import pandas as pd
from sklearn.preprocessing import StandardScaler

CSV_PATH = Path(__file__).resolve().parent.parent / "data-pokemon" / "pokemon.csv"

# pokemon.csv มีคอลัมน์ Name, Type1, Type2, Evolution, image (ไม่มีตัวเลขให้ใช้ตรง ๆ)
# จึงต้องสร้าง feature ตัวเลขเอง: multi-hot ของธาตุ (Type1/Type2) + มี evolution ต่อหรือไม่
ALL_TYPES = [
    "Bug", "Dark", "Dragon", "Electric", "Fairy", "Fighting", "Fire", "Flying",
    "Ghost", "Grass", "Ground", "Ice", "Normal", "Poison", "Psychic", "Rock",
    "Steel", "Water",
]

FEATURES = [f"Type_{t}" for t in ALL_TYPES] + ["Has_Evolution"]


# ---------------------------------------------------------------------------
def load_data():
    """
    คืนค่าเป็น dict ที่มี
        X        : ข้อมูลหลัง scale แล้ว (ใช้จัดกลุ่ม)
        X_raw    : ข้อมูลหน่วยจริง (ใช้ตอนอธิบายผล เช่น "กลุ่มนี้เป็นธาตุไฟกี่ %")
        df       : ตารางเต็มจากไฟล์ CSV
    """
    df = pd.read_csv(CSV_PATH)

    # Type2 และ Evolution ไม่มีค่าได้ตามธรรมชาติ (โปเกมอนธาตุเดียว / วิวัฒนาการขั้นสุดท้าย)
    # จึงไม่ dropna ทั้งแถว แต่แปลงเป็น feature แทน
    for t in ALL_TYPES:
        df[f"Type_{t}"] = ((df["Type1"] == t) | (df["Type2"] == t)).astype("float32")

    df["Has_Evolution"] = df["Evolution"].notna().astype("float32")

    X_raw = df[FEATURES].to_numpy(dtype="float32")
    X = StandardScaler().fit_transform(X_raw).astype("float32")  ## transform to mean=0, std=1 (scale) for clustering 

    return {"X": X, "X_raw": X_raw, "df": df, "features": FEATURES}


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    data = load_data()
    print("size data :", data["X"].shape)
    print("mean after scale (should be close to 0) :", data["X"].mean(axis=0).round(3))
