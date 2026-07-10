# Auth Broker Contract

The Auth Broker abstracts patient, hospital, ThaiD-compatible, payer, and foreign-patient identity flows. It is a contract boundary, not an implementation of a national identity system.

## Provider Types

```ts
export type AuthProviderType =
  | "hospital_sso_oidc"
  | "hospital_sso_saml"
  | "thaid_compatible_oidc"
  | "nhso_sso"
  | "payer_sso"
  | "passport_manual_verification"
  | "mobile_deep_link_exchange";
```

## Required Rules

- Wallet mobile must not depend only on browser cookie auth.
- Browser and mobile exchange flows must separate start, callback/exchange, refresh, and logout.
- ThaiD, NHSO, payer, or SSO tokens must not be stored unencrypted in browser localStorage.
- Auth assurance evidence should be stored separately from clinical and claim data.
- Foreign patient flows may use passport/manual verification or a contracted KYC provider.
- Production provider metadata must be configured, not hard-coded.

## Demo Scope

Demo mode may return a typed auth session and assurance context without connecting to a real provider. The demo response must identify itself as `mock_demo`.

## Wallet Use

The wallet should use Auth Broker outputs to:

- Bind holder DID and patient identity context.
- Request payer consent using the correct assurance level.
- Gate payer submission and medical tourist pre-arrival flows.
- Display authentication confidence without implying payer approval.

