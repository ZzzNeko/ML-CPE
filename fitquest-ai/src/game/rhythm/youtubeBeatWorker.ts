import { analyzeAudioSamples, type BeatAnalysis } from './youtubeBeatDetection';

interface AnalysisRequest {
  samples: ArrayBuffer;
  sampleRate: number;
}

interface AnalysisResponse {
  analysis?: BeatAnalysis;
  error?: string;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage(message: AnalysisResponse): void;
}

const workerScope = self as unknown as WorkerScope;

workerScope.onmessage = (event) => {
  try {
    const samples = new Float32Array(event.data.samples);
    workerScope.postMessage({ analysis: analyzeAudioSamples(samples, event.data.sampleRate) });
  } catch (error) {
    workerScope.postMessage({
      error: error instanceof Error ? error.message : 'Audio analysis failed.',
    });
  }
};
