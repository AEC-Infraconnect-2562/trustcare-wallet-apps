# Railway Wallet Production Deployment

This deploys `AEC-Infraconnect-2562/trustcare-wallet-apps` as a separate
Railway project for the wallet web app and public Share Gateway demo URL.

Do not attach this service to an existing Railway project used by another Codex
run. Create a separate Railway project/service for this repository.

## Railway Service

- Repository: `AEC-Infraconnect-2562/trustcare-wallet-apps`
- Branch: `main`
- Build command: `pnpm build:web`
- Start command: `node scripts/serve-wallet-web.mjs`
- Public URL: Railway-generated domain at the service root
- Share Gateway: `/api/share-gateway`
- Health check for gateway configuration: `/api/share-gateway/health`
- JWKS: `/api/share-gateway/.well-known/jwks.json`
- DID document: `/.well-known/did.json`

`railway.json` uses `build.watchPatterns` so Railway redeploys when the wallet
app, shared packages, gateway script, lockfile, or Railway config changes.

## Required Production Variables

Set these variables on the Railway wallet service:

- `TRUSTCARE_GATEWAY_MODE=production`
- `DATABASE_URL`: Railway PostgreSQL connection string for persistent artifact
  storage.
- `TRUSTCARE_GATEWAY_SIGNING_KEY_JWK`: private P-256 JWK used for ES256 VP/VC
  JWT signing.

Generate a private JWK locally with:

```powershell
node -e "(async()=>{const k=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']); console.log(JSON.stringify(await crypto.subtle.exportKey('jwk', k.privateKey)));})()"
```

Treat `TRUSTCARE_GATEWAY_SIGNING_KEY_JWK` as a production secret. Do not commit
it to Git.

Optional variables:

- `TRUSTCARE_GATEWAY_ISSUER_DID`: override the default `did:web:<public-host>`
  issuer.
- `TRUSTCARE_GATEWAY_SIGNING_KID`: override the generated key id.
- `TRUSTCARE_GATEWAY_JWKS_URL`: override the JWKS URL in JWT headers.
- `TRUSTCARE_GATEWAY_ALLOWED_ORIGINS`: comma-separated browser origins allowed
  to publish new share artifacts with `POST /api/share-gateway/artifacts`.
  Leave unset for same-origin Railway Wallet only; add the GitHub Pages or
  Portal origin when that frontend must publish to this gateway.
- `TRUSTCARE_GATEWAY_MAX_BODY_BYTES`: maximum JSON publish body size. Defaults
  to `1000000`.
- `TRUSTCARE_GATEWAY_DB_POOL_MAX`: maximum Postgres pool size. Defaults to `5`.
- `PGSSLMODE=require`: enable TLS verification mode for external Postgres
  connections.
- `VITE_TRUSTCARE_SHARE_GATEWAY_URL`: override the browser wallet gateway base
  URL. Leave unset to use the same Railway service at `/api/share-gateway`.
- `VITE_TRUSTCARE_API_URL`: Portal API URL for live sync.
- `VITE_TRUSTCARE_SHL_VIEWER_URL`: wallet public URL for SHL viewer links.

## Production Guardrails

On Railway production, the gateway fails startup if either
`TRUSTCARE_GATEWAY_SIGNING_KEY_JWK` or `DATABASE_URL` is missing. Local
development can still run with process-local memory and an ephemeral key, but
the health endpoint will report:

- `mode=trustcare_local_development_gateway`
- `storage=memory`
- `persistent=false`
- `keySource=local_ephemeral_jwk`

Production should report:

- `mode=trustcare_production_gateway`
- `storage=postgres`
- `persistent=true`
- `keySource=env_persistent_jwk`

The gateway keeps resolver reads public so QR payloads can be fetched by
cross-device verifiers, but browser-origin artifact publishing is limited to
the service origin plus `TRUSTCARE_GATEWAY_ALLOWED_ORIGINS`. Published
artifacts are returned with `Cache-Control: no-store`, expired artifacts return
`410 Gone`, and oversized JSON publish requests return `413`.
