# Railway Wallet Demo Deployment

This config deploys the wallet web demo from `AEC-Infraconnect-2562/trustcare-wallet-apps` as a separate Railway project.

Do not attach this service to an existing Railway project used by another Codex run. Create a new Railway project, for example:

- `trustcare-wallet-demo`

## Railway Service

- Repository: `AEC-Infraconnect-2562/trustcare-wallet-apps`
- Branch: `main`
- Build command: `pnpm build:web`
- Start command: `node scripts/serve-wallet-web.mjs`
- Public URL: Railway-generated domain at the service root

## Optional Variables

Set these on the Railway wallet service only when needed:

- `VITE_TRUSTCARE_SHARE_GATEWAY_URL`: public Share Gateway base URL, for example `https://<portal-or-gateway-domain>/api/share-gateway`.
- `VITE_TRUSTCARE_API_URL`: Portal API URL if live sync should target a non-default backend.
- `VITE_TRUSTCARE_SHL_VIEWER_URL`: Railway wallet public URL when SHL viewer links should return to this demo.

The Railway wallet demo is a public frontend. Do not store private JWKs, database URLs, or backend secrets in this wallet service.
