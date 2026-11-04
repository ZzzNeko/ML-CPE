import assert from 'node:assert/strict';
import { createWithGpuCpuFallback } from '../src/ai/delegateFallback.ts';

const gpuModel = { delegate: 'GPU' };
const cpuModel = { delegate: 'CPU' };
let cpuAttempts = 0;
const gpuResult = await createWithGpuCpuFallback(
  async () => gpuModel,
  async () => { cpuAttempts += 1; return cpuModel; },
  () => assert.fail('successful GPU creation must not trigger fallback'),
);
assert.deepEqual(gpuResult, { delegate: 'GPU', value: gpuModel });
assert.equal(cpuAttempts, 0);

const gpuError = new Error('no GPU');
let reportedGpuError;
const cpuResult = await createWithGpuCpuFallback(
  async () => { throw gpuError; },
  async () => cpuModel,
  (error) => { reportedGpuError = error; },
);
assert.equal(reportedGpuError, gpuError);
assert.deepEqual(cpuResult, { delegate: 'CPU', value: cpuModel });

const cpuError = new Error('no CPU');
await assert.rejects(
  createWithGpuCpuFallback(
    async () => { throw gpuError; },
    async () => { throw cpuError; },
    () => {},
  ),
  (error) => error instanceof AggregateError && error.errors[0] === gpuError && error.errors[1] === cpuError,
  'both delegate errors remain available to the caller',
);
console.log('POSE RUNTIME OK (GPU preference, CPU fallback, and preserved failure causes)');
