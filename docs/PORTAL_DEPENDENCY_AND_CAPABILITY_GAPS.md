# TrustCare Portal and Contract Hub Capability Gaps

## TrustCare Portal/backend dependencies

- Provider-neutral capability discovery.
- Real patient authorization and token lifecycle; demo login is not a pilot or
  production authentication boundary.
- Paginated, patient-scoped delta sync with cursor/ETag, tombstones,
  amendments/supersession/revocation, proof envelopes and conflict reporting.
- FHIR/IPA and MHD capability/endpoints with content-type, paging,
  OperationOutcome, hash and replacement semantics.
- OID4VCI issuer metadata, OID4VP verifier metadata/request handling.
- Provider DID/JWKS, credential status, trust-registry policy and problem-details.
- Production share/SHL resolver, access history and revocation interfaces.
- Provider-issued/attested IPS and other immutable clinical documents.

Current demo-specific seam: `packages/api-client/src/portalSync.ts` calls
`/api/auth/demo-login`, `/api/wallet/sync` and `/api/wallet/sync/verify` and must
be adapted behind `PortalConnectionProvider` rather than copied into screens.

## Contract Hub dependencies

- Signed `ContractHubManifest` with version/effective/expiry metadata.
- Versioned `ServiceProfileContract` records with lifecycle, freshness, trust,
  consent, recipient, access and compatible share-mode rules.
- Schemas, terminology, capability references, replacement/deprecation and
  minimum Wallet compatibility.
- One schema source generating TypeScript, runtime validation, JSON Schema,
  OpenAPI components, examples and compatibility fixtures.
- Consumer-facing HTTP/OpenAPI contract independent of Portal database tables
  or internal tRPC details.

The existing hand-authored catalog in wallet-core remains a DemoContractHubClient
fixture. It is not a production contract-authoring surface.

## Production blockers owned outside Wallet

- Real identity/auth and patient-provider connection lifecycle.
- Signed clinical source data and issuer/status lifecycle.
- Contract Hub authoring/signing/governance service.
- MHD/FHIR provider capabilities and original-document retrieval.
- Trust registry/policy and production resolver monitoring/incident handling.

