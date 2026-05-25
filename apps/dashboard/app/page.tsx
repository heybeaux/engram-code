import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { listSubsystems } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface SubsystemsResult {
  count: number;
  error: string | null;
}

async function loadSubsystems(): Promise<SubsystemsResult> {
  try {
    const res = await listSubsystems();
    return { count: res.count, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { count: 0, error: message };
  }
}

export default async function Home() {
  const { count, error } = await loadSubsystems();

  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-8 py-16">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-5xl font-bold">
            {error ? '—' : count}
          </CardTitle>
          <CardDescription className="text-base">
            {error
              ? 'API unreachable — start the engram-code server on $EC_API_URL.'
              : count === 1
                ? 'subsystem discovered'
                : 'subsystems discovered'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error
              ? error
              : 'Smoke test of the v1 API. Future pages will surface cards, the concept map, and search.'}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
