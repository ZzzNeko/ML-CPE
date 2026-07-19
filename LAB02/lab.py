# %% Lab1: Load data
import pandas as pd
import numpy as np

df = pd.read_csv(".\WA_Fn-UseC_-Telco-Customer-Churn.csv")
print("Shape:", df.shape)

# %% Lab1: Data Types
print(df.dtypes)

# %% Lab1: Summary Statistics
print(df.describe(include='all'))

# %% Lab1: Missing Values
print(df.isnull().sum())

# %% Lab1: Duplicate Records
print("Duplicates:", df.duplicated().sum())

# %% Lab1: Class Distribution
print(df['Churn'].value_counts())


# %% Lab2: Histogram
import matplotlib.pyplot as plt

df.hist(figsize=(12, 10))
plt.tight_layout()
plt.show()

# %% Lab2: Correlation Heatmap
import seaborn as sns

numeric_df = df.select_dtypes(include=[np.number])
plt.figure(figsize=(6, 5))
sns.heatmap(numeric_df.corr(), annot=True, cmap='coolwarm')
plt.title("Correlation Heatmap")
plt.show()


# %% Part 3: Incorrect Data Correction
# TotalCharges เป็น string แต่ควรเป็นตัวเลข และมีช่องว่าง " " แทนค่าว่าง
df['TotalCharges'] = df['TotalCharges'].replace(' ', np.nan)

# %% Part 3: Data Type Conversion
df['TotalCharges'] = df['TotalCharges'].astype(float)
print(df['TotalCharges'].dtypes)

# %% Part 3: Compare Mean vs Median (ก่อนเติมค่า)
mean_val = df['TotalCharges'].mean()
median_val = df['TotalCharges'].median()
print(f"Mean: {mean_val:.2f}")
print(f"Median: {median_val:.2f}")

plt.figure(figsize=(6, 4))
sns.histplot(df['TotalCharges'].dropna(), kde=True)
plt.axvline(mean_val, color='red', linestyle='--', label='Mean')
plt.axvline(median_val, color='green', linestyle='--', label='Median')
plt.legend()
plt.title("TotalCharges: Mean vs Median")
plt.show()

# %% Part 3: Missing Value Handling
print("Missing before:", df['TotalCharges'].isnull().sum())
df['TotalCharges'] = df['TotalCharges'].fillna(median_val)  # ใช้ median เพราะทนต่อ outlier
print("Missing after:", df['TotalCharges'].isnull().sum())

# %% Part 3: Duplicate Removal
print("Duplicates before:", df.duplicated().sum())
df = df.drop_duplicates()
print("Duplicates after:", df.duplicated().sum())
print("Shape after cleaning:", df.shape)


# %% Part 4: Label Encoding (binary columns)
from sklearn.preprocessing import LabelEncoder

le = LabelEncoder()
binary_cols = ['gender', 'Partner', 'Dependents', 'PhoneService', 'Churn']

for col in binary_cols:
    df[col] = le.fit_transform(df[col])

print(df[binary_cols].head())

# %% Part 4: One-Hot Encoding (multi-category columns)
multi_cols = ['InternetService', 'Contract', 'PaymentMethod']
df = pd.get_dummies(df, columns=multi_cols, drop_first=True)

print(df.head())
print("Shape after encoding:", df.shape)