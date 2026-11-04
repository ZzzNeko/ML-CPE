// Validates the active eight-class 1D-CNN runtime and its feature contract.
// The previous golden vectors belonged to the retired five-class model and
// included a different feature definition. Do not compare those stale vectors.
// Run: node --experimental-strip-types scripts/verify-cnn-parity.mjs
import { readFileSync } from 'node:fs';
import { extractFeatures, FEATURE_COUNT } from '../src/ai/poseFeatures.ts';
import { CnnModel } from '../src/ai/CnnModel.ts';

const samplePath = process.argv[2] ?? 'ml/models/cnn/golden.json';
const modelPath = process.argv[3] ?? 'public/assets/models/pose-8class/model.json';
const sample = JSON.parse(readFileSync(samplePath, 'utf8'));
const modelFile = JSON.parse(readFileSync(modelPath, 'utf8'));
const model = new CnnModel(modelFile);

const fail = (message) => {
  console.error('CNN VALIDATION FAIL:', message);
  process.exit(1);
};

if (!Array.isArray(sample.landmarks0) || sample.landmarks0.length !== 33) {
  fail('expected a 33-landmark reference frame');
}
if (model.classes.length !== 8) fail(`expected 8 classes, got ${model.classes.length}`);
if (model.window !== 30) fail(`expected a 30-frame window, got ${model.window}`);
if (modelFile.mean?.length !== FEATURE_COUNT || modelFile.std?.length !== FEATURE_COUNT) {
  fail(`model normalization must contain ${FEATURE_COUNT} features`);
}
if (modelFile.std.some((value) => !Number.isFinite(value) || value <= 0)) {
  fail('model standard deviations must be finite and positive');
}

const landmarks = sample.landmarks0.map(([x, y, z]) => ({ x, y, z }));
const features = extractFeatures(landmarks);
const noDepth = extractFeatures(landmarks.map(({ x, y }) => ({ x, y, z: 123.456 })));
if (features.length !== FEATURE_COUNT) fail(`expected ${FEATURE_COUNT} features, got ${features.length}`);

const featureError = Math.max(...features.map((value, i) => Math.abs(value - noDepth[i])));
if (featureError > 1e-6) fail(`depth invariance error ${featureError}`);
if (Array.from(features).some((value) => !Number.isFinite(value))) fail('features contain non-finite values');

// Smoke-test the same inference path used by gameplay with a full model window.
const frames = Array.from({ length: model.window }, () => Float32Array.from(features));
const probabilities = model.predict(frames);
if (probabilities.length !== model.classes.length) {
  fail(`expected ${model.classes.length} probabilities, got ${probabilities.length}`);
}
if (probabilities.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
  fail('CNN probabilities must be finite values in [0, 1]');
}
const probabilitySum = probabilities.reduce((sum, value) => sum + value, 0);
if (Math.abs(probabilitySum - 1) > 1e-5) fail(`softmax sum is ${probabilitySum}`);

console.log(
  'CNN runtime OK | classes:', model.classes.length,
  '| window:', model.window,
  '| features:', FEATURE_COUNT,
  '| depth invariance err:', featureError.toExponential(2),
  '| probability sum:', probabilitySum.toFixed(6),
);
