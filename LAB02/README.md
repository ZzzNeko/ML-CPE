# Telco Customer Churn – Data Exploration, Visualization, Cleaning & Feature Engineering

This project performs a full exploratory data analysis (EDA) and preprocessing pipeline on the **Telco Customer Churn** dataset from Kaggle. It covers dataset exploration, visualization, data cleaning, and feature engineering, structured into four labs/parts as required by the assignment.

## Dataset

- **Source:** [Telco Customer Churn](https://www.kaggle.com/datasets/blastchar/telco-customer-churn) (Kaggle)
- **File:** `WA_Fn-UseC_-Telco-Customer-Churn.csv`
- **Rows / Columns:** 7043 rows × 21 columns
- **Target variable:** `Churn` (Yes/No — whether the customer left the company)

## Project Structure

```
CH02/
├── lab.py
├── WA_Fn-UseC_-Telco-Customer-Churn.csv
└── README.md
```

## Requirements

Install the required Python packages before running:

```bash
py -3.11 -m pip install pandas numpy matplotlib seaborn scikit-learn
```

## How to Run

Open `lab.py` in VS Code with the Python/Jupyter extensions installed. The file is divided into cells using `# %%` markers. Run each cell sequentially (top to bottom) using the **Run Cell** button or Interactive Window, since later cells (Part 3 and Part 4) depend on transformations made in earlier cells.

```bash
py -3.11 lab.py
```

## Lab 1: Dataset Exploration

- Load the dataset with `pandas.read_csv`
- Display dataset shape (rows, columns)
- Display data types of each column
- Display summary statistics (`describe`)
- Display count of missing values per column
- Display count of duplicate records
- Display class distribution of the target variable (`Churn`)

## Lab 2: Data Visualization

- **Histogram** of all numeric features to inspect distributions
- **Correlation heatmap** of numeric features to inspect relationships between variables

## Part 3: Data Cleaning

| Step | Description |
|---|---|
| Incorrect Data Correction | `TotalCharges` contains blank strings (`" "`) instead of proper missing values; these are replaced with `NaN` |
| Data Type Conversion | `TotalCharges` is converted from `object` (string) to `float` |
| Mean vs Median Comparison | Mean and median of `TotalCharges` are computed and visualized together on a histogram to decide the best imputation strategy |
| Missing Value Handling | Missing values in `TotalCharges` are filled using the **median**, since it is more robust to outliers/skewed distributions than the mean |
| Duplicate Removal | Duplicate rows are identified and removed using `drop_duplicates()` |

## Part 4: Feature Engineering

- **Label Encoding** — applied to binary categorical columns (`gender`, `Partner`, `Dependents`, `PhoneService`, `Churn`), converting Yes/No or two-category values into 0/1
- **One-Hot Encoding** — applied to multi-category columns (`InternetService`, `Contract`, `PaymentMethod`) using `pd.get_dummies()` with `drop_first=True` to avoid the dummy variable trap

## Notes

- Label Encoding is used only for binary features to avoid introducing artificial ordinal relationships.
- One-Hot Encoding is used for features with more than two categories so the model does not assume a false order (e.g., Contract type).
- Median imputation was chosen over mean imputation because `TotalCharges` showed a skewed distribution, making the median a more robust central estimate.

## Author

Prepared as part of a Machine Learning / Data Preprocessing lab assignment (Lab 1–2, Part 3–4).
