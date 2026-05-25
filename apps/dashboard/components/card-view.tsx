import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CardResponse } from '@/lib/schemas';

interface CardViewProps {
  card: CardResponse;
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(formatMetadataValue).join(', ');
  return JSON.stringify(value);
}

export function CardView({ card }: CardViewProps) {
  const metadataEntries = Object.entries(card.metadata).filter(
    ([, value]) => value !== null && value !== undefined && value !== '',
  );

  return (
    <article className="card-view" data-testid="card-view">
      {metadataEntries.length > 0 && (
        <dl
          className="mb-12 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm text-stone-500"
          data-testid="card-metadata"
        >
          {metadataEntries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="font-medium uppercase tracking-wide text-stone-400">
                {key.replace(/_/g, ' ')}
              </dt>
              <dd className="text-stone-600">{formatMetadataValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      <div
        className="prose prose-stone max-w-none prose-headings:font-serif prose-headings:tracking-tight prose-h1:text-5xl prose-h1:leading-tight prose-h1:mb-8 prose-h2:text-3xl prose-h2:mt-12 prose-h3:text-xl prose-p:text-stone-700 prose-p:leading-relaxed prose-a:text-stone-900 prose-a:underline prose-a:underline-offset-4 prose-code:text-stone-800 prose-code:before:content-none prose-code:after:content-none prose-code:bg-stone-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded"
        data-testid="card-body"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.content}</ReactMarkdown>
      </div>
    </article>
  );
}
