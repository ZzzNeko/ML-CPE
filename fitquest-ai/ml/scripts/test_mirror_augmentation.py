"""Tests for label-aware, train-only left/right pose mirroring."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mirror_augmentation import (
    MIRRORED_LABELS,
    augment_mirrored_training_windows,
    mirror_landmarks,
)


class MirrorAugmentationTests(unittest.TestCase):
    def setUp(self):
        # Distinct x coordinates make both reflection and semantic swaps testable.
        self.windows = np.zeros((4, 6, 33, 3), dtype=np.float32)
        for landmark in range(33):
            self.windows[:, :, landmark, 0] = landmark / 40.0
            self.windows[:, :, landmark, 1] = landmark / 50.0
        self.labels = np.asarray([
            "left_arm_up", "left_arm_up", "right_arm_up", "standing"
        ])

    def test_mirror_reflects_x_and_swaps_left_right_landmarks(self):
        mirrored = mirror_landmarks(self.windows[:1])
        self.assertAlmostEqual(
            float(mirrored[0, 0, 12, 0]), 1.0 - float(self.windows[0, 0, 11, 0])
        )
        self.assertAlmostEqual(
            float(mirrored[0, 0, 11, 0]), 1.0 - float(self.windows[0, 0, 12, 0])
        )
        np.testing.assert_array_equal(
            mirrored[..., 11, 1], self.windows[:1, ..., 12, 1]
        )
        np.testing.assert_array_equal(
            mirrored[..., 12, 1], self.windows[:1, ..., 11, 1]
        )

    def test_targeted_mirror_adds_opposite_label_from_train_rows_only(self):
        mask = np.asarray([True, True, False, False])
        generated, labels, counts = augment_mirrored_training_windows(
            self.windows, self.labels, mask,
            ["left_arm_up", "right_arm_up", "standing"],
            factor=2, min_class_windows=10, seed=5,
        )
        # Two left-arm training windows become two varied right-arm windows each.
        self.assertEqual(len(generated), 4)
        self.assertTrue(np.all(labels == "right_arm_up"))
        self.assertEqual(counts["right_arm_up"], 4)
        self.assertEqual(counts["left_arm_up"], 0)
        self.assertTrue(np.isfinite(generated).all())

    def test_sufficient_target_class_is_not_oversampled(self):
        mask = np.ones(4, dtype=bool)
        labels = np.asarray(["left_arm_up", "right_arm_up", "right_arm_up", "standing"])
        _, _, counts = augment_mirrored_training_windows(
            self.windows, labels, mask,
            ["left_arm_up", "right_arm_up", "standing"],
            factor=3, min_class_windows=2, seed=5,
        )
        self.assertEqual(counts["right_arm_up"], 0)

    def test_mirror_label_pairs_are_symmetric(self):
        for source, target in MIRRORED_LABELS.items():
            self.assertEqual(MIRRORED_LABELS[target], source)


if __name__ == "__main__":
    unittest.main()
