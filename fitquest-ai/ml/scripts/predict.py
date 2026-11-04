"""Run one Phase 5 model against a prepared pose dataset sample."""
import argparse, json, pickle
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import extract_features

ap = argparse.ArgumentParser()
ap.add_argument('model', type=Path)
ap.add_argument('dataset', type=Path)
ap.add_argument('--index', type=int, default=0)
args = ap.parse_args()
artifact = pickle.loads(args.model.read_bytes())
data = json.loads(args.dataset.read_text(encoding='utf-8'))
samples = data.get('samples', data)
sample = samples[args.index]
X = extract_features(sample['landmarks']).reshape(1, -1)
model = artifact['model']
pred = int(model.predict(X)[0])
result = {'predicted_class': artifact['classes'][pred], 'source_label': sample.get('labelKey'), 'confidence': None}
if hasattr(model, 'predict_proba'):
    probs = model.predict_proba(X)[0]
    result['confidence'] = float(probs[pred])
print(json.dumps(result, indent=2))
