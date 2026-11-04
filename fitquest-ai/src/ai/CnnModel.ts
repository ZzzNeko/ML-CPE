// Dependency-free inference for the exported 1D CNN (Conv1D/BN/MaxPool/GAP/Dense).
// Weights come from ml/scripts/export_cnn_web.py.

interface ConvLayer { type: 'conv1d'; kernel: number[][][]; bias: number[] }
interface BnLayer { type: 'bn'; gamma: number[]; beta: number[]; mean: number[]; var: number[]; eps: number }
interface PoolLayer { type: 'maxpool'; size: number }
interface GapLayer { type: 'gap' }
interface DenseLayer { type: 'dense'; kernel: number[][]; bias: number[] }
type Layer = ConvLayer | BnLayer | PoolLayer | GapLayer | DenseLayer;

export interface CnnModelFile {
  classes: string[];
  window: number;
  mean: number[];
  std: number[];
  layers: Layer[];
}

type Seq = Float32Array[]; // [time][channels]

export class CnnModel {
  readonly classes: string[];
  readonly window: number;
  private readonly file: CnnModelFile;
  constructor(file: CnnModelFile) {
    this.file = file;
    this.classes = file.classes;
    this.window = file.window;
  }

  static async load(url: string): Promise<CnnModel> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CNN model fetch failed: ${res.status}`);
    return new CnnModel((await res.json()) as CnnModelFile);
  }

  /** `frames` = window x features (raw, un-normalised). Returns class probabilities. */
  predict(frames: Float32Array[]): number[] {
    const { mean, std } = this.file;
    let seq: Seq = frames.map((f) => Float32Array.from(f, (v, i) => (v - mean[i]) / std[i]));
    let vec: number[] | null = null;
    for (const layer of this.file.layers) {
      if (layer.type === 'conv1d') seq = conv1d(seq, layer);
      else if (layer.type === 'bn') seq = bn(seq, layer);
      else if (layer.type === 'maxpool') seq = maxpool(seq, layer.size);
      else if (layer.type === 'gap') vec = gap(seq);
      else if (layer.type === 'dense' && vec) vec = softmax(dense(vec, layer));
    }
    return vec ?? [];
  }
}

function conv1d(x: Seq, l: ConvLayer): Seq {
  const k = l.kernel.length, cin = l.kernel[0].length, cout = l.bias.length;
  const T = x.length, padL = Math.floor((k - 1) / 2); // TF 'same' padding
  const out: Seq = [];
  for (let t = 0; t < T; t++) {
    const row = new Float32Array(cout);
    for (let o = 0; o < cout; o++) {
      let s = l.bias[o];
      for (let j = 0; j < k; j++) {
        const tt = t + j - padL;
        if (tt < 0 || tt >= T) continue;
        const xr = x[tt], kr = l.kernel[j];
        for (let i = 0; i < cin; i++) s += xr[i] * kr[i][o];
      }
      row[o] = s > 0 ? s : 0; // ReLU fused (every conv in this model is followed by ReLU)
    }
    out.push(row);
  }
  return out;
}

function bn(x: Seq, l: BnLayer): Seq {
  const c = l.gamma.length;
  const scale = new Float32Array(c), shift = new Float32Array(c);
  for (let i = 0; i < c; i++) {
    scale[i] = l.gamma[i] / Math.sqrt(l.var[i] + l.eps);
    shift[i] = l.beta[i] - l.mean[i] * scale[i];
  }
  return x.map((r) => Float32Array.from(r, (v, i) => v * scale[i] + shift[i]));
}

function maxpool(x: Seq, size: number): Seq {
  const out: Seq = [];
  for (let t = 0; t + size <= x.length; t += size) {
    const row = Float32Array.from(x[t]);
    for (let j = 1; j < size; j++) for (let i = 0; i < row.length; i++) row[i] = Math.max(row[i], x[t + j][i]);
    out.push(row);
  }
  return out;
}

function gap(x: Seq): number[] {
  const c = x[0].length, out = new Array<number>(c).fill(0);
  for (const r of x) for (let i = 0; i < c; i++) out[i] += r[i] / x.length;
  return out;
}

function dense(v: number[], l: DenseLayer): number[] {
  return l.bias.map((b, o) => v.reduce((s, vi, i) => s + vi * l.kernel[i][o], b));
}

function softmax(v: number[]): number[] {
  const m = Math.max(...v), e = v.map((x) => Math.exp(x - m)), s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}
