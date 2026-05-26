/**
 * Ingest orchestrator service (EC-39a).
 *
 * One in-memory queue keyed by `repoId` so simultaneous submissions of
 * the same URL coalesce into a single job (single-flight). Background work
 * is kicked off via `setImmediate`; the BullMQ flavor from the spec is
 * the natural follow-up once we need persistence across restarts, but the
 * in-memory queue keeps the dependency surface small for v1 (personal use,
 * single-process server).
 *
 * The pipeline reuses `runSynth` from EC-38 directly — we do not
 * reimplement the structure→repository chain here. Mocks for the git
 * clone and LLM clients are injected via the constructor so the
 * integration test can run the full state machine without network IO.
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { runSynth, type SynthOverrides } from '../cli/synth';
import {
  CloneError,
  RealGitCloneAdapter,
  type GitCloneAdapter,
} from './git-clone.adapter';
import {
  artifactsDirFor,
  evictIfOverCap,
  resetRepoStorage,
  scratchDirFor,
} from './storage';
import { STAGE_PROGRESS, type IngestJob, type IngestStage } from './types';
import { parseGitHubUrl } from './url';

export const INGEST_CLONE_ADAPTER = Symbol('INGEST_CLONE_ADAPTER');
export const INGEST_SYNTH_OVERRIDES = Symbol('INGEST_SYNTH_OVERRIDES');

export interface SubmitInput {
  url: string;
  ref?: string;
}

export interface SubmitResult {
  job: IngestJob;
  /** True when this submission coalesced into an existing in-flight job. */
  coalesced: boolean;
}

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  private readonly jobs = new Map<string, IngestJob>();
  /** Maps `repoId` → active job id, so duplicate URLs coalesce. */
  private readonly activeByRepo = new Map<string, string>();

  constructor(
    @Optional()
    @Inject(INGEST_CLONE_ADAPTER)
    private readonly cloneAdapter: GitCloneAdapter = new RealGitCloneAdapter(),
    @Optional()
    @Inject(INGEST_SYNTH_OVERRIDES)
    private readonly synthOverrides: SynthOverrides = {},
  ) {}

  /**
   * Submit a new ingest job. If an in-flight job exists for the same
   * `repoId`, return that one with `coalesced: true` instead of starting
   * a duplicate run.
   */
  submit(input: SubmitInput): SubmitResult {
    const parsed = parseGitHubUrl(input.url);
    if (parsed === null) {
      throw new InvalidUrlError(
        `Invalid GitHub URL: ${input.url}. Expected https://github.com/<owner>/<repo>.`,
      );
    }
    const ref = input.ref ?? parsed.ref;

    const existing = this.activeByRepo.get(parsed.repoId);
    if (existing !== undefined) {
      const job = this.jobs.get(existing);
      if (job && (job.status === 'queued' || job.status === 'running')) {
        return { job: { ...job }, coalesced: true };
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const job: IngestJob = {
      id,
      repoId: parsed.repoId,
      url: parsed.cloneUrl,
      ref,
      status: 'queued',
      stage: 'queued',
      progress: STAGE_PROGRESS.queued,
      startedAt: now,
    };
    this.jobs.set(id, job);
    this.activeByRepo.set(parsed.repoId, id);

    setImmediate(() => {
      void this.run(id);
    });

    return { job: { ...job }, coalesced: false };
  }

  get(id: string): IngestJob | undefined {
    const job = this.jobs.get(id);
    return job ? { ...job } : undefined;
  }

  list(limit = 20): IngestJob[] {
    const all = Array.from(this.jobs.values());
    all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return all.slice(0, limit).map((j) => ({ ...j }));
  }

  /** Test hook — drains the queue for deterministic assertions. */
  async waitForJob(id: string, timeoutMs = 10_000): Promise<IngestJob> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const job = this.jobs.get(id);
      if (job && (job.status === 'ready' || job.status === 'failed')) {
        return { ...job };
      }
      await delay(20);
    }
    throw new Error(`Timeout waiting for ingest job ${id}`);
  }

  private async run(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'running';

    try {
      await this.runPipeline(job);
      this.transition(job, 'done');
      job.status = 'ready';
      job.finishedAt = new Date().toISOString();
    } catch (err) {
      job.status = 'failed';
      job.finishedAt = new Date().toISOString();
      if (err instanceof CloneError) {
        job.error = err.message;
        job.errorKind = err.kind;
      } else if (err instanceof Error) {
        job.error = err.message;
        job.errorKind = classifySynthError(err);
      } else {
        job.error = String(err);
        job.errorKind = 'unknown';
      }
      this.logger.error(
        `Ingest ${id} failed at ${job.stage}: ${job.error}`,
      );
    } finally {
      // Release the single-flight slot so the next submission for this
      // repoId can start a fresh run (e.g. after a fix or LLM rate-limit
      // recovery).
      if (this.activeByRepo.get(job.repoId) === id) {
        this.activeByRepo.delete(job.repoId);
      }
    }
  }

  private async runPipeline(job: IngestJob): Promise<void> {
    // Clean any prior scratch/artifacts for this repoId so the synth
    // pipeline sees fresh sources.
    await resetRepoStorage(job.repoId);

    this.transition(job, 'cloning');
    const scratchDir = scratchDirFor(job.repoId);
    await this.cloneAdapter.clone({
      cloneUrl: job.url,
      ref: job.ref,
      targetDir: scratchDir,
    });

    // Synth pipeline. `runSynth` advances through structure → contracts →
    // gotchas → subsystem → repository internally, but we surface each
    // stage to the dashboard via a small log-line shim.
    this.transition(job, 'structure');
    const stageRouter = (line: string) => {
      const stage = pickStageFromLog(line);
      if (stage !== null) this.transition(job, stage);
    };

    const artifactsDir = artifactsDirFor(job.repoId);
    const summary = await runSynth({
      repoPath: scratchDir,
      subcommand: 'all',
      outDir: artifactsDir,
      repoId: job.repoId,
      log: (line) => {
        this.logger.log(`[ingest ${job.id}] ${line}`);
        stageRouter(line);
      },
      overrides: this.synthOverrides,
    });

    job.totalTokens = summary.totalTokens;

    // Best-effort LRU eviction. Failures here are logged but don't fail
    // the ingest — the cap is a soft limit.
    try {
      const evicted = await evictIfOverCap();
      if (evicted.length > 0) {
        this.logger.log(`Evicted ${evicted.length} repo(s): ${evicted.join(', ')}`);
      }
    } catch (err) {
      this.logger.warn(`LRU eviction skipped: ${(err as Error).message}`);
    }
  }

  private transition(job: IngestJob, stage: IngestStage): void {
    job.stage = stage;
    job.progress = STAGE_PROGRESS[stage];
  }
}

export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUrlError';
  }
}

function pickStageFromLog(line: string): IngestStage | null {
  if (line.includes('structure pass')) return 'structure';
  if (line.includes('contracts →')) return 'contracts';
  if (line.includes('gotchas →')) return 'gotchas';
  if (line.includes('subsystem →')) return 'subsystem';
  if (line.includes('repository →')) return 'repository';
  return null;
}

function classifySynthError(err: Error): IngestJob['errorKind'] {
  const msg = err.message.toLowerCase();
  if (msg.includes('rate limit') || msg.includes('429')) return 'rate-limit';
  if (msg.includes('network') || msg.includes('fetch failed')) return 'network';
  return 'unknown';
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
