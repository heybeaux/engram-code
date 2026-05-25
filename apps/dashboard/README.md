# engram-code dashboard

Next.js 15 (App Router) dashboard for the engram-code v1 API.

## Run

```bash
# from repo root
pnpm install
pnpm --filter dashboard dev   # http://localhost:3001
```

The backend API is expected on `http://localhost:3000` (override with
`EC_API_URL`). Start it with `pnpm start:dev` from the repo root.

## Endpoints wrapped

`lib/api.ts` exposes a typed client over the v1 endpoints introduced in
EC-28:

- `getCard(path, lod?)` — `GET /v1/cards/<path>?lod=`
- `getMap(root?, depth?)` — `GET /v1/map`
- `searchConcept(query, opts?)` — `POST /v1/search/concept`
- `listSubsystems()` — `GET /v1/subsystems`

Response shapes are validated against the zod schemas in
`lib/schemas.ts`, which mirror `src/v2/api/dto/index.ts` on the backend.

## Tests

```bash
pnpm --filter dashboard test
```
