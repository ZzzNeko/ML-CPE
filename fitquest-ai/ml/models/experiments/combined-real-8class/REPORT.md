# FitQuest CNN — Real 8-class evaluation

> No synthetic samples were included. Self-Data participants are grouped in the split; Physical/ArmRaise clips are split by video.

## Dataset source frame counts

- **self_data_frames**: arm_raise=189, knee_left=126, jumping_jack=137, squat=125, standing=123, knee_right=121, left_arm_up=121, right_arm_up=126
- **physical_frames**: jumping_jack=18,897, squat=11,817
- **arm_raise_frames**: arm_raise=4,031

## Split

- Windows: {'train': 3387, 'val': 1195, 'test': 1075}

- Split unit: video_and_group

## Metrics

### Validation

- Accuracy: **0.7331**
- Macro F1: **0.3592**

| Class | F1 |
|---|---:|
| arm_raise | 0.6623 |
| jumping_jack | 0.7924 |
| knee_left | 0.0000 |
| knee_right | 0.0000 |
| left_arm_up | 0.7003 |
| right_arm_up | 0.0000 |

### Test

- Accuracy: **0.6986**
- Macro F1: **0.6785**

| Class | F1 |
|---|---:|
| arm_raise | 0.5417 |
| jumping_jack | 0.7866 |
| knee_left | 1.0000 |
| knee_right | 1.0000 |
| left_arm_up | 0.7500 |
| right_arm_up | 0.2564 |
| squat | 0.6723 |
| standing | 0.4211 |

## Charts

- `reports/training_curves.png`
- `reports/test_confusion_matrix.png`
- `reports/test_class_f1.png`

## Caveat

The dataset has only two Self-Data participant groups; participant-independent generalization is therefore limited. Treat test metrics as an initial benchmark, not a clinical or production guarantee.
