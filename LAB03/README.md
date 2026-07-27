# Abalone Age & Gender Prediction — Regression & Classification

Lab 3: **Regression & Classification** — a demonstration of core Supervised Learning concepts using the
[Abalone Dataset (Kaggle)](https://www.kaggle.com/datasets/rodolfomendes/abalone-dataset) to
**predict age (Regression)** and **predict gender (Classification)** of abalone from physical measurements.

> The Abalone dataset stands in for the "Age/Gender Prediction from face images" task in the original
> assignment. The Machine Learning pipeline (Data Prep -> PCA -> Train/Test -> Evaluate -> Compare) is
> identical; only the input features change, from face image pixels to physical shell measurements.

---

## Objectives

1. Understand the principles of Regression vs Classification, and the difference between predicting a
   continuous value and a categorical value.
2. Prepare data, select appropriate features, and apply PCA to reduce dimensionality.
3. Develop a Linear Regression model (age prediction) and a Logistic Regression model (gender prediction).
4. Use Python and scikit-learn to build, train, test, and evaluate models.
5. Analyze results using Accuracy, Precision, Recall, F1-score, ROC Curve, and AUC, and present the work
   through GitHub.

---

## Dataset

**Abalone Dataset** — 4,177 samples, 8 physical features.

| Column | Description |
|---|---|
| `Sex` | M (Male) / F (Female) / I (Infant) |
| `Length`, `Diameter`, `Height` | Shell dimensions (mm) |
| `Whole_weight`, `Shucked_weight`, `Viscera_weight`, `Shell_weight` | Weights of different parts (g) |
| `Rings` | Number of shell rings -> used to compute **Age = Rings + 1.5 (years)** |

Data file: [`data/abalone.csv`](data/abalone.csv)

---

## Project Structure

```
abalone-ml/
├── data/
│   └── abalone.csv                          # dataset
├── notebooks/
│   └── Lab3_Regression_Classification.ipynb  # main notebook (fully executed, with output)
├── images/                                   # exported plots/results
└── README.md
```

---

## Notebook Contents

### LAB 1: Regression — Age Prediction
- **Simple Linear Regression**: predict age from a single feature, `Shell_weight`
- **Multiple Linear Regression**: predict age from all features (including `Sex`, one-hot encoded)
- **PCA + Regression**: reduce 7 features down to the minimum needed to explain >= 95% of variance, then
  build a model

### LAB 2: Classification — Gender Prediction
- **Preparing Classification Data**: filter to M/F only (drop Infant) -> the problem becomes Binary
  Classification
- **Decision Boundary Visualization**: plot the Logistic Regression decision boundary using two features
- **Logistic Regression**: full model using all features
- **Confusion Matrix**, **ROC Curve & AUC**

### LAB 3: Model Comparison
- Simple vs Multiple Linear Regression
- Training vs Testing Performance (checking for overfitting)
- Regression vs Classification (conceptual and metric comparison)
- Overall model performance metrics summary

---

## Results Summary

### Regression (Age Prediction, test set)

| Model | Test R2 | Test MAE | Test RMSE |
|---|---|---|---|
| Simple LR (Shell_weight) | 0.401 | 1.86 | 2.55 |
| **Multiple LR (all features)** | **0.548** | **1.59** | **2.21** |
| PCA + LR | 0.393 | — | 2.56 |

### Classification (Gender Prediction, test set)

| Metric | Score |
|---|---|
| Accuracy | 0.531 |
| Precision | 0.552 |
| Recall | 0.696 |
| F1-score | 0.616 |
| AUC | 0.567 |

> **Observation:** Multiple Linear Regression clearly outperforms Simple LR because it combines multiple
> dimensions of data. Gender prediction performance is modest, since the physical characteristics of males
> and females overlap significantly (unlike Infants, which are more clearly separable) — a good illustration
> that classification accuracy depends heavily on whether the available features actually separate the classes.

See all plots in the [`images/`](images/) folder, or run the notebook for an interactive view.

---

## Libraries Used

- `pandas`, `numpy` — data handling
- `matplotlib`, `seaborn` — visualization
- `scikit-learn` — Linear Regression, Logistic Regression, PCA, train/test split, metrics

---

## References

- Dataset: [Abalone Dataset — Kaggle (rodolfomendes)](https://www.kaggle.com/datasets/rodolfomendes/abalone-dataset)
- Original source: [UCI Machine Learning Repository — Abalone](https://archive.ics.uci.edu/dataset/1/abalone)

---

## Author

Lab 3: Regression & Classification — Machine Learning course
