# Premium Patient UX Implementation

This is a living implementation record for the Constitution V3 patient shell.
Premium means calm hierarchy, understandable state and predictable control;
it does not mean additional protocol labels or decorative card gradients.

This document records current implementation, not intended behavior as if it
were already complete. An acceptance item remains incomplete until it has
current code and test evidence.

## Patient information architecture

Web routes introduced in Phase 1:

- `/home`
- `/records` and `/records/:recordId`
- `/receive`
- `/prepare` and `/prepare/:serviceProfileId`
- `/share` and `/share/requests/:requestId`
- `/shares/active`
- `/activity`
- `/connections`
- `/family`
- `/settings`
- `/verify` and `/verify/:artifactId`

The current `/shares/active`, `/connections` and `/family` pages are honest
placeholders. They do not fabricate external state. Record, prepare and verify
deep-link matching is established; the page workflows continue to migrate from
the legacy application controller.

Mobile primary destinations are Home, Records, Receive, Prepare and Share.
Settings, Activity and credential detail remain secondary routes.

## Phase 3 page status

| Patient page  | Current implementation                                             | Remaining acceptance evidence                                                                               |
| ------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Home          | Partial legacy composition with repository-backed record summaries | Remove remaining demo/controller assumptions; verify patient-language, sync/offline and active-share states |
| Records       | Web and Mobile V2 repository slices exist                          | Complete filters, grouping, versions, originals and shared render semantics                                 |
| Record detail | V2 detail routes exist                                             | Render through the shared contract; complete corrections, privacy, originals and advanced details           |
| Receive       | Existing scan/import paths are partial                             | Add mandatory patient/source/type/date/trust/duplicate review before import                                 |
| Prepare       | Readiness and acquisition UI exists, strongest in Demo             | Extract the shared application workflow and complete request/retrieve/import actions                        |
| Share         | Existing review/publication composition is partial                 | Complete shared application service, biometric confirmation and Active Shares handoff                       |
| Active Shares | Honest placeholder                                                 | Implement gateway-backed lifecycle, access history, revoke and renew                                        |
| Activity      | Partial local/seed history                                         | Use repository events and patient-readable filters                                                          |
| Connections   | Honest placeholder                                                 | Implement provider discovery, connect, sync, errors and disconnect                                          |
| Family/Proxy  | Honest placeholder                                                 | Implement scoped relationship, consent, revocation and audit                                                |
| Settings      | Partial runtime, security and presentation controls                | Complete production authentication/recovery and privacy-safe diagnostics                                    |
| Public Verify | Existing verifier and deep-link routes                             | Re-run second-device, failure-state and deployed-revision acceptance                                        |

## Shared patient-state meanings

- Target trust state comes from `WalletDocumentRecordV2.trust` checks and the
  shared Portable Presentation Envelope, never color or proof presence alone.
- Current limitation: Web and Mobile V2 screens still contain separate trust
  presentation mappings. The shared SHL envelope now keeps an artifact pending
  when it lacks independent verification evidence, but full-path regression
  evidence and one shared semantic/copy mapping are still pending. Shared trust
  rendering is therefore incomplete and remains a release blocker.
- Freshness uses clinical record time, period and profile rules. Package time
  is displayed separately.
- Demo and Sandbox are visibly labelled. Pilot/Production fail closed when
  authentication or repositories are not configured.
- A patient upload is always described as patient-provided unverified evidence
  until an authorized issuer attests a new artifact.
- Prepare explains ready, stale, unacceptable and missing documents. Share
  finalizes recipient, purpose, disclosure, duration and consent.

## Component recipe target

| Recipe                     | Shared semantics                                         | Current status                                                                                                                          |
| -------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| PageHeader                 | route title, plain-language summary, focus target        | Partial in Web shell                                                                                                                    |
| RecordListItem             | title, facility, clinical date, lifecycle, concise trust | V2 migration in progress                                                                                                                |
| TrustBadge                 | explicit state plus non-color label                      | Incomplete: Web/Mobile V2 and legacy call sites still have separate mappings; Certified SHL hardening requires final full-path evidence |
| FreshnessIndicator         | record time/profile freshness, never package time        | Domain work required                                                                                                                    |
| ReadinessSummary           | required/recommended/missing with patient actions        | Existing Web component, Contract Hub migration pending                                                                                  |
| ShareReviewPanel           | recipient, purpose, records/fields, duration, access     | Existing Web composition, application-service extraction pending                                                                        |
| ActiveShareCard            | lifecycle, access history, revoke/renew                  | Not implemented                                                                                                                         |
| ProviderConnectionCard     | connection/sync/error/disconnect                         | Not implemented                                                                                                                         |
| Empty/Error/Offline states | truthful recovery and stale context                      | Partial                                                                                                                                 |
| TechnicalDetailsDisclosure | JWT/DID/JWKS/hash only on demand                         | Shared renderer/detail partial                                                                                                          |

## Accessibility acceptance still required

- Keyboard completion and visible focus for every primary route.
- Screen-reader labels and logical heading order in Thai and English.
- 200% Web zoom, large native text and narrow/wide layout testing.
- No color-only trust/status meaning.
- Reduced motion, timeout/expiry explanation and recoverable errors.
- Usability plan for stressed and older patients before pilot.

## Phase 3 acceptance evidence still required

- [ ] Direct navigation, browser refresh and Back/Forward work on every Web
      route without PHI, token, passcode or raw credential URL state.
- [ ] Patient-critical flows complete without developer or protocol terminology
      as the primary action.
- [ ] Page layouts and shared component recipes use the design-token system;
      remaining one-off legacy styling is inventoried.
- [ ] Thai and English visual checks pass on narrow and wide Web layouts.
- [ ] Mobile large-text layout and Web 200% zoom preserve task completion.
- [ ] Browser checks record the tested commit, route, viewport, console errors,
      framework overlays and outcome.
