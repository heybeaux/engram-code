'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, EngramCodeApi } from '@/lib/api';
import type { CardResponse, LodLevel } from '@/lib/schemas';
import { CardView } from './card-view';
import { LodSwitcher } from './lod-switcher';

const REPO_PATH = '.';

interface HomeCardProps {
  initialLod?: LodLevel;
  client?: Pick<EngramCodeApi, 'getCard'>;
}

type CardState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'success'; card: CardResponse };

export function HomeCard({ initialLod = 'standard', client }: HomeCardProps) {
  const [lod, setLod] = useState<LodLevel>(initialLod);
  const [state, setState] = useState<CardState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const api = client ?? new EngramCodeApi();
    let cancelled = false;
    setState({ status: 'loading' });
    api
      .getCard(REPO_PATH, lod)
      .then((card) => {
        if (cancelled) return;
        setState({ status: 'success', card });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'empty' });
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [lod, client, reloadKey]);

  const retry = useCallback(() => setReloadKey((n) => n + 1), []);

  return (
    <section className="flex flex-col gap-12">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-stone-400">
            engram-code
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-stone-900 sm:text-4xl">
            What is this codebase?
          </h1>
        </div>
        <LodSwitcher value={lod} onChange={setLod} />
      </header>

      <div className="min-h-[24rem]">
        {state.status === 'loading' && <LoadingSkeleton />}
        {state.status === 'empty' && <EmptyState />}
        {state.status === 'error' && (
          <ErrorState message={state.message} onRetry={retry} />
        )}
        {state.status === 'success' && <CardView card={state.card} />}
      </div>
    </section>
  );
}

function LoadingSkeleton() {
  return (
    <div data-testid="card-skeleton" className="animate-pulse space-y-6">
      <div className="h-3 w-32 rounded bg-stone-200" />
      <div className="h-10 w-3/4 rounded bg-stone-200" />
      <div className="space-y-3">
        <div className="h-4 w-full rounded bg-stone-200" />
        <div className="h-4 w-11/12 rounded bg-stone-200" />
        <div className="h-4 w-10/12 rounded bg-stone-200" />
        <div className="h-4 w-9/12 rounded bg-stone-200" />
      </div>
      <div className="space-y-3 pt-6">
        <div className="h-4 w-full rounded bg-stone-200" />
        <div className="h-4 w-8/12 rounded bg-stone-200" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      data-testid="card-empty"
      className="rounded-md border border-dashed border-stone-300 bg-stone-50/50 p-12 text-center"
    >
      <p className="font-serif text-2xl text-stone-700">No repository card yet</p>
      <p className="mt-4 text-stone-500">
        Run{' '}
        <code className="rounded bg-stone-100 px-2 py-1 font-mono text-sm text-stone-700">
          engram-code synth repo
        </code>{' '}
        to populate it.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      data-testid="card-error"
      role="alert"
      className="rounded-md border border-red-200 bg-red-50/60 p-8"
    >
      <p className="font-serif text-xl text-red-900">Couldn&apos;t load the card</p>
      <p className="mt-2 break-words font-mono text-sm text-red-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        data-testid="card-retry"
        className="mt-6 rounded-full border border-red-300 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.15em] text-red-700 transition-colors hover:bg-red-100"
      >
        Retry
      </button>
    </div>
  );
}
