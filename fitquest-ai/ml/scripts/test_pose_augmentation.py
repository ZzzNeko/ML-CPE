"""Unit tests for conservative real-pose augmentation."""
from __future__ import annotations
import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from pose_augmentation import augment_pose_window, augment_training_windows


class PoseAugmentationTests(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(7)
        self.windows = rng.uniform(0.2, 0.8, (8, 30, 33, 3)).astype(np.float32)
        self.labels = np.asarray(["standing"] * 4 + ["squat"] * 4)

    def test_shape_finiteness_and_input_unchanged(self):
        original = self.windows[0].copy()
        result = augment_pose_window(self.windows[0], np.random.default_rng(1))
        self.assertEqual(result.shape, (30, 33, 3))
        self.assertTrue(np.isfinite(result).all())
        np.testing.assert_array_equal(self.windows[0], original)
        self.assertFalse(np.array_equal(result, original))

    def test_only_training_rows_are_augmented(self):
        mask = np.asarray([True, True, False, False, True, True, False, False])
        generated, labels, counts = augment_training_windows(
            self.windows, self.labels, mask, ["standing", "squat"],
            factor=2, min_class_windows=10, seed=3)
        self.assertEqual(len(generated), 4)
        self.assertEqual(counts["standing"], 4)
        self.assertEqual(counts["squat"], 0)
        self.assertTrue(np.all(labels == "standing"))

    def test_sufficient_class_is_not_augmented(self):
        _, _, counts = augment_training_windows(
            self.windows, self.labels, np.ones(8, dtype=bool),
            ["standing", "squat"], factor=3, min_class_windows=4)
        self.assertEqual(counts["standing"], 0)
        self.assertEqual(counts["squat"], 0)

    def test_rejects_wrong_landmark_shape(self):
        with self.assertRaises(ValueError):
            augment_pose_window(np.zeros((30, 32, 3), np.float32),
                                np.random.default_rng(0))


if __name__ == "__main__":
    unittest.main()
