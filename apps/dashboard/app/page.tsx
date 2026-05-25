import { HomeCard } from '@/components/home-card';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-6 py-16 sm:py-24">
      <HomeCard />
    </main>
  );
}
