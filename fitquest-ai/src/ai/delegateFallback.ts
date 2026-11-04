export async function createWithGpuCpuFallback<T>(
  createGpu: () => Promise<T>,
  createCpu: () => Promise<T>,
  onGpuFailure: (error: unknown) => void,
): Promise<{ delegate: 'GPU' | 'CPU'; value: T }> {
  try {
    return { delegate: 'GPU', value: await createGpu() };
  } catch (gpuError) {
    onGpuFailure(gpuError);
    try {
      return { delegate: 'CPU', value: await createCpu() };
    } catch (cpuError) {
      throw new AggregateError([gpuError, cpuError], 'Pose model creation failed with both GPU and CPU delegates.');
    }
  }
}
