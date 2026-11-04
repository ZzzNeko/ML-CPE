"""Validate and export the Kaggle Physical Exercise Recognition dataset.

Usage:
  python ml/scripts/prepare_kaggle.py "Physical Exercise Recognition" --out data/kaggle.json
"""
from __future__ import annotations
import argparse, json
from pathlib import Path
from kaggle_adapter import read_kaggle_path

ap = argparse.ArgumentParser()
ap.add_argument('dataset', type=Path)
ap.add_argument('--out', type=Path, default=Path('data/kaggle-physical-exercise.json'))
args = ap.parse_args()
samples = read_kaggle_path(args.dataset)
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(json.dumps({'samples': samples}, indent=2), encoding='utf-8')
print(f'Exported {len(samples)} samples to {args.out}')
