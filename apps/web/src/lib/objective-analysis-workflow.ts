export interface ObjectiveAnalysisProgress {
  completed_steps: number;
  total_steps: number;
}

export interface ObjectiveAnalysisJob<T> extends ObjectiveAnalysisProgress {
  job_id: string;
  status: 'pending' | 'running' | 'complete';
  objective: T | null;
}

interface AnalysisRequests<T> {
  start: () => Promise<ObjectiveAnalysisJob<T>>;
  step: (jobId: string) => Promise<ObjectiveAnalysisJob<T>>;
  pause?: () => Promise<void>;
}

function transientConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const failure = error as { code?: string; status?: number };
  return failure.code === 'offline' || failure.code === 'parse'
    || [408, 429, 500, 503, 504].includes(failure.status ?? 0);
}

/** Each request checkpoints one part; retries keep the server's same job. */
export async function runObjectiveAnalysis<T>(
  requests: AnalysisRequests<T>,
  onProgress?: (progress: ObjectiveAnalysisProgress) => void,
): Promise<T> {
  const pause = requests.pause ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 1500)));
  async function requestWithRetry(request: () => Promise<ObjectiveAnalysisJob<T>>) {
    for (let attempt = 0; ; attempt += 1) {
      try { return await request(); }
      catch (error: unknown) {
        if (attempt >= 2 || !transientConnectionError(error)) throw error;
        await pause();
      }
    }
  }

  let job = await requestWithRetry(requests.start);
  let stalledPolls = 0;
  while (true) {
    onProgress?.({ completed_steps: job.completed_steps, total_steps: job.total_steps });
    if (job.status === 'complete') {
      if (job.objective === null) throw new Error('Não foi possível ler o resultado da análise. Tente novamente.');
      return job.objective;
    }
    if (job.status === 'running') {
      if (stalledPolls >= 80) throw new Error('O progresso da análise está salvo. Tente novamente para continuar.');
      stalledPolls += 1;
      await pause();
    }
    const next = await requestWithRetry(() => requests.step(job.job_id));
    if (next.completed_steps > job.completed_steps || next.status !== 'running') stalledPolls = 0;
    job = next;
  }
}
