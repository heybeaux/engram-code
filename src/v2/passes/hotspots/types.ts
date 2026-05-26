/**
 * Shared types for the Pass 4 hotspots pass (engram-code v2).
 *
 * Hotspots is a multi-signal pass: several independent collectors emit
 * per-file signals which the orchestrator later normalizes and combines
 * into a single hotspot score. This module declares the common
 * vocabulary so each signal collector lives in its own file but speaks
 * the same shape.
 *
 * Signals intentionally stay pure-ish (no LLM, no DB writes). The
 * orchestrator owns persistence and ranking.
 */

/**
 * Per-file churn signal derived from git history over a bounded window.
 *
 * High churn + many distinct authors + recent activity is a classic
 * hotspot indicator (cf. "Your Code as a Crime Scene", Tornhill).
 */
export interface GitChurnSignal {
  /** Repo-relative POSIX path. */
  filePath: string;
  /** Commits touching the file inside the window. */
  commitCount: number;
  /** Distinct author emails inside the window. */
  uniqueAuthors: number;
  /** Whole days between last touch and "now". 0 if touched today. */
  daysSinceLastTouch: number;
  /** SHA of the most recent commit touching the file in the window. */
  lastTouchSha: string;
}
