# Contract Hub — Wallet Consumer Interface V2

Contract Hub is an external, versioned contract registry. Wallet consumes and
caches signed artifacts; it does not author hospital requirements or governance
policy.

## Consumer boundary

The shared `ContractHubClient` exposes:

```ts
getManifest(): Promise<ContractHubManifest>
listServiceProfiles(): Promise<ServiceProfile[]>
getServiceProfile(id: string, version?: string): Promise<ServiceProfile>
```

The current implementation deliberately aliases the existing readiness
contract for Demo use. Phase 6 must replace that alias from one generated schema
source without adding another hand-maintained catalog.

## Target V2 contract shapes

The generated schema source must define these shapes. Referenced policy and
reference types below are generated dependencies, not Wallet-authored hospital
rules.

```ts
type ContractHubManifest = {
  contractHubId: string;
  version: string;
  generatedAt: string;
  effectiveFrom: string;
  expiresAt?: string;
  minimumWalletVersion?: string;
  serviceProfiles: ContractReference[];
  capabilities: CapabilityReference[];
  schemas: SchemaReference[];
  terminology: TerminologyReference[];
  deprecatedContracts: DeprecatedContractReference[];
  signature?: ContractSignature;
};

type ServiceProfileContract = {
  id: string;
  version: string;
  status: "draft" | "active" | "deprecated" | "retired";
  patientLabel: LocalizedText;
  purpose: string;
  requiredDocuments: DocumentRequirementContract[];
  recommendedDocuments: DocumentRequirementContract[];
  acceptedDocumentProfiles: string[];
  acceptedCredentialTypes: string[];
  acceptedFormats: string[];
  freshnessRules: FreshnessRule[];
  lifecycleRules: LifecycleRule[];
  trustPolicy: TrustPolicyContract;
  consentPolicy: ConsentPolicyContract;
  recipientPolicy: RecipientPolicyContract;
  defaultAccessPolicy: AccessPolicyContract;
  recommendedShareMode:
    "DirectVP" | "PurposeVP" | "StandardSHL" | "CertifiedSHLPackage";
  capabilities?: string[];
  effectiveFrom: string;
  expiresAt?: string;
  replaces?: string;
};
```

## Required manifest properties

- Contract Hub identifier, version, generated/effective/expiry times.
- Minimum Wallet version.
- Service profile, capability, schema and terminology references.
- Deprecated/replaced contract references.
- Signature envelope and validation metadata.

## Required service profile properties

- Stable id/version, `draft | active | deprecated | retired` status, effective
  period and localized patient label.
- A purpose that can be shown to the patient and bound into readiness and
  sharing policy.
- Required and recommended document capabilities.
- Accepted document profiles, credential types and formats.
- Freshness, lifecycle, trust, consent, recipient and access-policy rules.
- Recommended one of DirectVP, PurposeVP, StandardSHL or
  CertifiedSHLPackage.
- Capability references and replacement/deprecation metadata.

## Compatibility and cache rules

- Validate signature, schema, effective period and minimum Wallet version
  before activating a manifest.
- Keep the last valid manifest only for an explicit offline grace policy; show
  its age and never call an expired profile current.
- A deprecated profile can explain historical shares but cannot create a new
  share unless its policy explicitly allows a transition period.
- Unknown required fields, incompatible formats and missing trust rules fail
  closed with a patient-readable action.
- Contract ids may appear in advanced/audit details, not as the patient's first
  service choice.

## Capability discovery and errors

Capability references must remain provider-neutral and may point to Wallet
sync, FHIR/IPA, SMART configuration, MHD, OID4VCI, OID4VP, SHL, VP resolver,
DID/JWKS, credential-status and problem-details endpoints. A capability
reference needs a stable id, kind, version, endpoint or metadata URL, supported
profiles/formats, authorization metadata and effective/deprecation state.

HTTP failures must use an RFC 9457-shaped problem contract generated with the
other artifacts:

```ts
type ContractProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  correlationId?: string;
  retryable?: boolean;
};
```

Problem details and correlation ids must not contain PHI, credentials, access
tokens or passcodes. Wallet maps technical errors to a patient-readable action
while retaining safe diagnostics in advanced details.

## Current implementation status

| Capability                                                                            | Current status     | Evidence/gap                                                                                    |
| ------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| Provider-neutral `ContractHubClient` boundary                                         | Implemented        | Shared client methods exist                                                                     |
| `ContractHubManifest`                                                                 | Demo/Sandbox alias | Existing catalog is hand-authored and is not the generated V2 manifest                          |
| `ServiceProfileContract`                                                              | Planned            | Current `ServiceProfile` aliases the legacy readiness contract                                  |
| Single schema source and generated TypeScript/validators/JSON Schema/OpenAPI/examples | Planned            | Phase 6 deliverable                                                                             |
| Signature, effective-period and minimum-Wallet-version activation checks              | Planned            | Policy is documented; runtime activation evidence is pending                                    |
| Compatibility, replacement and deprecation evaluation                                 | Planned            | Required before a signed profile can drive production readiness                                 |
| Capability/discovery model                                                            | Partial            | Provider-neutral Portal interfaces exist; generated Contract Hub capability contract is pending |
| RFC 9457-shaped problem details                                                       | Planned            | Shared generated error contract and fixtures are pending                                        |
| Consumer/provider and compatibility fixtures                                          | Planned            | No production conformance claim until generated fixtures pass                                   |

## Portal dependency

Portal/Contract Hub must publish signed HTTP/OpenAPI resources independently of
database tables or internal tRPC procedures. Consumer/provider fixtures, JSON
Schema, TypeScript, runtime validators and OpenAPI components must be generated
from the same source.
