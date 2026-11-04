"""Train the 1D CNN pose-sequence classifier and export it for the browser.

One command does everything:
  python ml/scripts/train_cnn.py --kaggle "Physical Exercise Recognition"

Outputs
  ml/models/cnn/cnn1d.keras      Keras model
  ml/models/cnn/metrics.json     accuracy / macro-F1 / confusion matrix (val + test)
  ml/models/cnn/golden.json      test vectors for scripts/verify-cnn-parity.mjs
  public/assets/models/cnn/model.json   weights used by the game (src/ai/CnnModel.ts)

Data: landmarks.csv + labels.csv from the Kaggle "Physical Exercise Recognition"
dataset (the other CSVs are not used). Splits are made per video so frames of one
video never appear in two splits; datasets with a `group_id` column are split by
group instead (for example, by participant).
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
import numpy as np, pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import extract_features_batch
from pose_augmentation import augment_training_windows
from mirror_augmentation import augment_mirrored_training_windows

NAMES = ['nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner', 'right_eye', 'right_eye_outer',
         'left_ear', 'right_ear', 'mouth_left', 'mouth_right', 'left_shoulder', 'right_shoulder', 'left_elbow',
         'right_elbow', 'left_wrist', 'right_wrist', 'left_pinky_1', 'right_pinky_1', 'left_index_1',
         'right_index_1', 'left_thumb_2', 'right_thumb_2', 'left_hip', 'right_hip', 'left_knee', 'right_knee',
         'left_ankle', 'right_ankle', 'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index']
# Kaggle label -> game class id.
LABELS = {'jumping_jack': 'jumping_jack', 'pull_up': 'pull_up', 'push_up': 'push_up',
          'situp': 'sit_up', 'sit_up': 'sit_up', 'squat': 'squat'}
MIRRORED_LABELS = {
    'left_arm_up': 'right_arm_up', 'right_arm_up': 'left_arm_up',
    'knee_left': 'knee_right', 'knee_right': 'knee_left',
}
# Left<->right landmark swap used for horizontal-flip augmentation.
MIRROR = list(range(33))
for a, b in [(1, 4), (2, 5), (3, 6)] + [(i, i + 1) for i in range(7, 32, 2)]:
    MIRROR[a], MIRROR[b] = b, a


def mirror_lm(a):  # (N, 33, 3) -> horizontally flipped copy
    return a[:, MIRROR] * np.array([-1, 1, 1], np.float32) + np.array([1, 0, 0], np.float32)


def load_windows(path: Path, T: int, stride: int):
    """Returns per-window landmarks W, features F, mirrored features FM, labels y, video ids vid, groups.

    Features are computed once per frame of each video (vectorised) and then cut into
    windows, instead of re-computing every frame ~T/stride times.
    """
    d = pd.read_csv(path / 'landmarks.csv').sort_values(['vid_id', 'frame_order'])
    labels = pd.read_csv(path / 'labels.csv').set_index('vid_id')
    lab = labels['class']
    group_by_video = labels['group_id'] if 'group_id' in labels else labels.index.to_series()
    cols = [c for n in NAMES for c in (f'x_{n}', f'y_{n}', f'z_{n}')]
    W, F, FM, y, vid, groups = [], [], [], [], [], []
    for v, g in d.groupby('vid_id'):
        a = g[cols].to_numpy(np.float32).reshape(-1, 33, 3)
        if len(a) < T:
            continue
        name = str(lab[v]).strip().lower()
        f, fm = extract_features_batch(a), extract_features_batch(mirror_lm(a))
        for s in range(0, len(a) - T + 1, stride):
            W.append(a[s:s + T]); F.append(f[s:s + T]); FM.append(fm[s:s + T])
            y.append(LABELS.get(name, name)); vid.append(v); groups.append(group_by_video[v])
    return np.stack(W), np.stack(F), np.stack(FM), np.array(y), np.array(vid), np.array(groups)


def split_by_video(y, vid, seed, train_only_prefixes=(), groups=None):
    rng = np.random.default_rng(seed)
    sp = np.full(len(y), 'train', dtype='<U5')
    train_only = np.array([
        any(str(video).startswith(prefix) for prefix in train_only_prefixes)
        for video in vid
    ])
    if groups is not None:
        shared_groups = {
            group for group in np.unique(groups)
            if len(np.unique(vid[groups == group])) > 1
        }
        shared_mask = np.isin(groups, list(shared_groups)) & ~train_only
        eligible_shared = np.unique(groups[shared_mask])
        if len(eligible_shared) >= 3:
            # Three or more participants allow a true group-disjoint train/val/test split.
            shared_rng = np.random.default_rng(seed + 1)
            shuffled_groups = shared_rng.permutation(eligible_shared)
            n_test = max(1, round(len(shuffled_groups) * 0.2))
            n_val = max(1, round(len(shuffled_groups) * 0.2))
            # Always leave at least one participant group in training.
            while n_test + n_val >= len(shuffled_groups):
                if n_val > 0:
                    n_val -= 1
                else:
                    n_test -= 1
            sp[np.isin(groups, shuffled_groups[:n_test]) & shared_mask] = 'test'
            sp[np.isin(groups, shuffled_groups[n_test:n_test + n_val]) & shared_mask] = 'val'
        elif len(eligible_shared) == 2:
            # With only two participants, a 3-way group split would leave no
            # participant data for training. Hold one group out for testing;
            # keep the other group in training. Validation is supplied by
            # independent video datasets below.
            shared_rng = np.random.default_rng(seed + 1)
            held_out_group = shared_rng.permutation(eligible_shared)[0]
            sp[(groups == held_out_group) & shared_mask] = 'test'
        # With one participant group, keep it in training; independent videos
        # still provide validation/test data.
        independent = ~np.isin(groups, list(shared_groups))
        for c in np.unique(y):
            eligible = (y == c) & ~train_only & independent
            vs = rng.permutation(np.unique(vid[eligible]))
            n = len(vs)
            if n == 0:
                continue
            n_test, n_val = max(1, round(n * 0.2)), max(1, round(n * 0.2))
            sp[np.isin(vid, vs[:n_test]) & eligible] = 'test'
            sp[np.isin(vid, vs[n_test:n_test + n_val]) & eligible] = 'val'
        return sp
    for c in np.unique(y):
        eligible = (y == c) & ~train_only
        vs = rng.permutation(np.unique(vid[eligible])); n = len(vs)
        if n == 0:
            continue
        n_test, n_val = max(1, round(n * 0.2)), max(1, round(n * 0.2))
        sp[np.isin(vid, vs[:n_test]) & eligible] = 'test'
        sp[np.isin(vid, vs[n_test:n_test + n_val]) & eligible] = 'val'
    return sp


def build_model(tf, T, F, n_classes):
    L = tf.keras.layers; reg = tf.keras.regularizers.l2(1e-4)
    return tf.keras.Sequential([
        L.Input((T, F)),
        L.Conv1D(48, 5, padding='same', activation='relu', kernel_regularizer=reg), L.BatchNormalization(),
        L.Conv1D(48, 5, padding='same', activation='relu', kernel_regularizer=reg), L.BatchNormalization(),
        L.MaxPool1D(2), L.Dropout(0.25),
        L.Conv1D(96, 3, padding='same', activation='relu', kernel_regularizer=reg), L.BatchNormalization(),
        L.GlobalAveragePooling1D(), L.Dropout(0.5),
        L.Dense(n_classes, activation='softmax')])


def export_web(tf, model, meta, out_dir: Path):
    layers = []
    for l in model.layers:
        w = [x.tolist() for x in l.get_weights()]
        if isinstance(l, tf.keras.layers.Conv1D): layers.append({'type': 'conv1d', 'kernel': w[0], 'bias': w[1]})
        elif isinstance(l, tf.keras.layers.BatchNormalization):
            layers.append({'type': 'bn', 'gamma': w[0], 'beta': w[1], 'mean': w[2], 'var': w[3], 'eps': float(l.epsilon)})
        elif isinstance(l, tf.keras.layers.MaxPooling1D): layers.append({'type': 'maxpool', 'size': 2})
        elif isinstance(l, tf.keras.layers.GlobalAveragePooling1D): layers.append({'type': 'gap'})
        elif isinstance(l, tf.keras.layers.Dense): layers.append({'type': 'dense', 'kernel': w[0], 'bias': w[1]})
    out_dir.mkdir(parents=True, exist_ok=True)
    json.dump({**meta, 'layers': layers}, open(out_dir / 'model.json', 'w'))


def save_training_plots(history, classes, test_report, report_dir: Path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    report_dir.mkdir(parents=True, exist_ok=True)

    epochs = range(1, len(history.history['loss']) + 1)
    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    axes[0].plot(epochs, history.history['loss'], label='Train')
    axes[0].plot(epochs, history.history['val_loss'], label='Validation')
    axes[0].set(title='Training and validation loss', xlabel='Epoch', ylabel='Loss')
    axes[0].legend()
    axes[0].grid(alpha=0.25)
    axes[1].plot(epochs, history.history['accuracy'], label='Train')
    axes[1].plot(epochs, history.history['val_accuracy'], label='Validation')
    axes[1].set(title='Training and validation accuracy', xlabel='Epoch', ylabel='Accuracy', ylim=(0, 1))
    axes[1].legend()
    axes[1].grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(report_dir / 'training_curves.png', dpi=160)
    plt.close(fig)

    matrix = np.asarray(test_report['confusion_matrix'], dtype=np.int64)
    row_totals = matrix.sum(axis=1, keepdims=True)
    normalized = np.divide(matrix, row_totals, out=np.zeros_like(matrix, dtype=np.float64), where=row_totals != 0)
    fig, ax = plt.subplots(figsize=(7, 6))
    image = ax.imshow(normalized, cmap='Blues', vmin=0, vmax=1)
    fig.colorbar(image, ax=ax, label='Share of actual class')
    ax.set(title='Test confusion matrix (row-normalized)', xlabel='Predicted class', ylabel='Actual class')
    ax.set_xticks(range(len(classes)), classes, rotation=35, ha='right')
    ax.set_yticks(range(len(classes)), classes)
    for row in range(len(classes)):
        for col in range(len(classes)):
            ax.text(col, row, f'{matrix[row, col]}\n{normalized[row, col]:.0%}',
                    ha='center', va='center', color='white' if normalized[row, col] > 0.55 else '#172033')
    fig.tight_layout()
    fig.savefig(report_dir / 'test_confusion_matrix.png', dpi=160)
    plt.close(fig)

    f1 = test_report['f1_per_class']
    fig, ax = plt.subplots(figsize=(8, 4))
    values = [f1[name] for name in classes]
    bars = ax.bar(classes, values, color='#4f83cc')
    ax.bar_label(bars, labels=[f'{value:.2f}' for value in values], padding=3)
    ax.set(title='Test F1 score by class', ylabel='F1 score', ylim=(0, 1))
    ax.tick_params(axis='x', rotation=30)
    ax.grid(axis='y', alpha=0.25)
    fig.tight_layout()
    fig.savefig(report_dir / 'test_class_f1.png', dpi=160)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kaggle', type=Path, required=True, help='folder with landmarks.csv + labels.csv')
    ap.add_argument('--window', type=int, default=30)
    ap.add_argument('--stride', type=int, default=5)
    ap.add_argument('--epochs', type=int, default=60)
    ap.add_argument('--seed', type=int, default=42)
    ap.add_argument('--learning-rate', type=float, default=1e-3)
    ap.add_argument('--noise-std', type=float, default=0.03)
    ap.add_argument('--augment-factor', type=int, default=4, help='synthetic train-only variants per underrepresented real window')
    ap.add_argument('--augment-min-windows', type=int, default=200, help='augment target classes only below this train-window count')
    ap.add_argument('--no-pose-augmentation', action='store_true', help='disable geometric real-pose augmentation')
    ap.add_argument('--batch-size', type=int, default=64)
    ap.add_argument('--patience', type=int, default=10)
    ap.add_argument('--model-dir', type=Path, default=Path('ml/models/cnn'))
    ap.add_argument('--web-dir', type=Path, default=Path('public/assets/models/cnn'))
    ap.add_argument('--train-only-prefix', action='append', default=[],
                    help='keep matching video IDs in training only (repeatable)')
    ap.add_argument('--no-export-web', action='store_true', help='save training reports without changing the web model')
    a = ap.parse_args()

    import tensorflow as tf
    from sklearn.metrics import confusion_matrix, f1_score
    from sklearn.utils.class_weight import compute_class_weight
    if (a.learning_rate <= 0 or a.noise_std < 0 or a.batch_size < 1 or a.patience < 1 or a.augment_factor < 0 or a.augment_min_windows < 1):
        ap.error('learning-rate must be positive; noise-std must be non-negative; batch-size and patience must be positive')
    tf.keras.utils.set_random_seed(a.seed)

    print('[1/4] Loading windows...', flush=True)
    raw_windows, feats, feats_m, y, vid, groups = load_windows(a.kaggle, a.window, a.stride)
    W = len(y)
    classes = sorted(str(c) for c in set(y)); yi = np.array([classes.index(c) for c in y])
    use_group_split = len(np.unique(groups)) < len(np.unique(vid))
    sp = split_by_video(
        y, vid, a.seed, a.train_only_prefix, groups if use_group_split else None,
    )
    tr, va, te = sp == 'train', sp == 'val', sp == 'test'
    missing_train = sorted(set(range(len(classes))) - set(yi[tr].tolist()))
    if missing_train:
        missing_names = [classes[i] for i in missing_train]
        raise ValueError(
            'Training split is missing classes: ' + ', '.join(missing_names) +
            '. Add participant groups/videos or adjust the split before training.'
        )
    if not va.any() or not te.any():
        raise ValueError(
            f'Empty evaluation split: train={tr.sum()}, val={va.sum()}, test={te.sum()}. '
            'Add more independent videos/groups to create validation and test sets.'
        )
    print(f'      {W} windows, classes={classes}, train/val/test={tr.sum()}/{va.sum()}/{te.sum()}', flush=True)
    print('      split class coverage: ' + ', '.join(
        f'{name}={int(np.sum(y[tr] == name))}' for name in classes
    ), flush=True)

    print('[2/4] Normalising features and augmenting training-only real poses...', flush=True)
    mu, sd = feats[tr].mean((0, 1)), feats[tr].std((0, 1)) + 1e-6
    norm = lambda x: ((x - mu) / sd).astype(np.float32)
    if a.no_pose_augmentation:
        augmented_features = np.empty((0, a.window, feats.shape[2]), dtype=np.float32)
        augmented_y = np.empty((0,), dtype=yi.dtype)
        augmentation_counts = {name: 0 for name in ('standing', 'right_arm_up', 'left_arm_up', 'knee_left', 'knee_right')}
    else:
        augmented_windows, augmented_labels, augmentation_counts = augment_training_windows(
            raw_windows, y, tr, classes, factor=a.augment_factor,
            min_class_windows=a.augment_min_windows, seed=a.seed,
        )
        if len(augmented_windows):
            augmented_features = np.stack([extract_features_batch(window) for window in augmented_windows])
            augmented_y = np.asarray([classes.index(str(label)) for label in augmented_labels], dtype=yi.dtype)
        else:
            augmented_features = np.empty((0, a.window, feats.shape[2]), dtype=np.float32)
            augmented_y = np.empty((0,), dtype=yi.dtype)
    print('      synthetic train-only windows: ' + ', '.join(
        f'{name}={count}' for name, count in augmentation_counts.items()
    ), flush=True)
    mirrored_y = yi[tr].copy()
    mirrored_valid = np.ones(len(mirrored_y), dtype=bool)
    for index, class_name in enumerate(classes):
        counterpart = MIRRORED_LABELS.get(class_name)
        if counterpart:
            class_rows = yi[tr] == index
            if counterpart in classes:
                mirrored_y[class_rows] = classes.index(counterpart)
            else:
                mirrored_valid[class_rows] = False
    # Add targeted, varied mirrors only where the opposite-side class is scarce.
    mirrored_windows, targeted_mirror_y, targeted_mirror_counts = augment_mirrored_training_windows(
        raw_windows, y, tr, classes, factor=a.augment_factor,
        min_class_windows=a.augment_min_windows, seed=a.seed + 1,
    )
    if len(mirrored_windows):
        targeted_mirror_features = np.stack([
            extract_features_batch(window) for window in mirrored_windows
        ])
        targeted_mirror_labels = np.asarray(
            [classes.index(str(label)) for label in targeted_mirror_y], dtype=yi.dtype
        )
    else:
        targeted_mirror_features = np.empty((0, a.window, feats.shape[2]), dtype=np.float32)
        targeted_mirror_labels = np.empty((0,), dtype=yi.dtype)

    Xtr = np.concatenate([
        norm(feats[tr]), norm(feats_m[tr][mirrored_valid]),
        norm(augmented_features), norm(targeted_mirror_features),
    ])
    ytr = np.concatenate([
        yi[tr], mirrored_y[mirrored_valid], augmented_y, targeted_mirror_labels,
    ])
    Xtr = Xtr + np.random.default_rng(a.seed).normal(0, a.noise_std, Xtr.shape).astype(np.float32)

    print('[3/4] Training 1D CNN...', flush=True)
    model = build_model(tf, a.window, feats.shape[2], len(classes))
    model.compile(tf.keras.optimizers.Adam(a.learning_rate), 'sparse_categorical_crossentropy', metrics=['accuracy'])
    present_train_classes = np.unique(ytr)
    class_weights = compute_class_weight('balanced', classes=present_train_classes, y=ytr)
    cw = {int(class_id): float(weight) for class_id, weight in zip(present_train_classes, class_weights)}
    history = model.fit(Xtr, ytr, validation_data=(norm(feats[va]), yi[va]), epochs=a.epochs,
              batch_size=a.batch_size, class_weight=cw, verbose=2, callbacks=[
                  tf.keras.callbacks.EarlyStopping(patience=a.patience, restore_best_weights=True, monitor='val_loss'),
                  tf.keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=4)])

    report = {'classes': classes, 'window': a.window, 'seed': a.seed, 'windows': {k: int(m.sum()) for k, m in
              (('train', tr), ('val', va), ('test', te))},
              'training': {'learning_rate': a.learning_rate, 'noise_std': a.noise_std, 'batch_size': a.batch_size,
                           'epochs_requested': a.epochs, 'epochs_completed': len(history.history['loss']),
                           'pose_augmentation': {'enabled': not a.no_pose_augmentation,
                                                 'factor': a.augment_factor,
                                                 'min_class_windows': a.augment_min_windows,
                                                 'generated_train_windows': augmentation_counts,
                                                 'targeted_mirror_factor': a.augment_factor,
                                                 'targeted_mirror_min_class_windows': a.augment_min_windows,
                                                 'targeted_mirror_generated_train_windows': targeted_mirror_counts},
                           'train_only_prefixes': a.train_only_prefix,
                           'split_unit': 'video_and_group' if use_group_split else 'video',
                           'split_groups': {k: int(len(np.unique(groups[m]))) for k, m in
                                            (('train', tr), ('val', va), ('test', te))}}}
    for k, m in (('validation', va), ('test', te)):
        p = model.predict(norm(feats[m]), verbose=0).argmax(1)
        report[k] = {'accuracy': float((p == yi[m]).mean()), 'f1_macro': float(f1_score(yi[m], p, average='macro')),
                     'f1_per_class': dict(zip(classes, map(float, f1_score(yi[m], p, average=None)))),
                     'confusion_matrix': confusion_matrix(yi[m], p, labels=range(len(classes))).tolist()}
        print(f'      {k}: acc={report[k]["accuracy"]:.3f} macro-F1={report[k]["f1_macro"]:.3f}', flush=True)

    print('[4/4] Saving model and training reports...', flush=True)
    a.model_dir.mkdir(parents=True, exist_ok=True)
    model.save(a.model_dir / 'cnn1d.keras')
    json.dump(report, open(a.model_dir / 'metrics.json', 'w'), indent=1)
    report_dir = a.model_dir / 'reports'
    save_training_plots(history, classes, report['test'], report_dir)
    meta = {'classes': classes, 'window': a.window, 'mean': mu.tolist(), 'std': sd.tolist()}
    if not a.no_export_web:
        export_web(tf, model, meta, a.web_dir)
    i = int(np.flatnonzero(te)[0])
    json.dump({'landmarks0': raw_windows[i][0].tolist(), 'features0': feats[i][0].tolist(), 'window': feats[i].tolist(),
               'probs': model.predict(norm(feats[i:i + 1]), verbose=0)[0].tolist()}, open(a.model_dir / 'golden.json', 'w'))
    print(f'Done. Model: {a.model_dir/"cnn1d.keras"}  Reports: {report_dir}')
    if not a.no_export_web:
        print(f'Web model: {a.web_dir/"model.json"}')
    print('Check TS parity:  node --experimental-strip-types scripts/verify-cnn-parity.mjs')


if __name__ == '__main__':
    main()
