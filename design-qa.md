# TrustCare Wallet Premium Home and Credential Inspector — Design QA

Date: 2026-07-11

## Comparison target

- Source visual truth: `C:\Users\DELL\.codex\generated_images\019f4ad0-056f-7983-8000-17b5f77edff7\exec-b443ab3e-dedf-4158-a384-16c76b805b5c.png`
- Production URL: `https://wallet-web-production-6a00.up.railway.app`
- Desktop implementation: `C:\Users\DELL\AppData\Local\Temp\trustcare-railway-desktop-id-inspector.png`
- Current desktop polish: `C:\Users\DELL\AppData\Local\Temp\trustcare-local-desktop-final-reference-state.png`
- Mobile implementation: `C:\Users\DELL\AppData\Local\Temp\trustcare-railway-mobile-id-inspector.png`
- Mobile A4 implementation: `C:\Users\DELL\AppData\Local\Temp\trustcare-railway-mobile-a4-final.png`
- Current mobile A4 completion: `C:\Users\DELL\AppData\Local\Temp\trustcare-local-mobile-a4-complete-final.png`
- Current automatic request dialog: `C:\Users\DELL\AppData\Local\Temp\trustcare-local-mobile-auto-request-final.png`
- Full-view comparison: `C:\Users\DELL\.codex\visualizations\2026\07\10\019f4ad0-056f-7983-8000-17b5f77edff7\trustcare-design-comparison-full.png`
- Focused inspector comparison: `C:\Users\DELL\.codex\visualizations\2026\07\10\019f4ad0-056f-7983-8000-17b5f77edff7\trustcare-design-comparison-focus.png`

## Viewports and state

- Desktop: 1440 × 1024, authenticated complete demo fixture, Home with the patient identity credential open in the docked inspector.
- Mobile: 390 × 844 requested viewport (375 px browser client width), the same identity credential open in a full-screen inspector above the persistent five-item navigation.
- Mobile A4: the medical certificate open in the same inspector with the physical A4 frame scaled to fit the bounded preview.
- Railway revision inspected: `ad34e0e0a931cdda28c7d2dd5fb1ae4513d9e4d7`.

## Evidence reviewed

The source and production captures were placed together in the full-view comparison before judging overall composition. A separate focused comparison aligns the docked credential and mobile credential states so typography, spacing, patient image, credential proportions, provenance, controls, and navigation remain readable.

The current desktop capture was also placed beside the same source visual truth after the final polish pass. At the 1280 × 800 inspector state, the appointment banner is 220 px high; its 25 px, weight-600 heading stays on one line. The three important credential cards are 208.8 px high and expose 3, 3, and 2 compact source-backed summary rows respectively. Summary values come from the shared credential renderer, not a Home-specific payload parser.

Primary interactions tested in the production browser:

- Collapsed side navigation expands, exposes labels, and collapses again.
- Opening an ID-1 credential keeps the desktop Home context visible and presents a modal dialog on mobile.
- Mobile focus enters the dialog, the underlying main region becomes inert, and the back action is available.
- Share and print/PDF actions remain visible without exposing Full VC, SD, or ZKP terminology.
- A4 documents preserve 210 × 297 mm layout geometry while scaling as one sheet on narrow screens; the full-document toggle works.
- Desktop and mobile pages have no horizontal overflow.
- Browser console error and warning logs were empty for the inspected states.
- The current mobile expanded A4 frame measures 1,233 px naturally, has `aspect-ratio: auto`, preserves a 297 mm minimum paper height, and leaves the full document bottom reachable above the action bar with zero horizontal overflow.
- The current missing-document request dialog contains no Full VC, SD, ZKP, OID4VCI, FHIR Bundle, Standard SHL, or Document Bundle choices; the patient sees the responsible source, return path, and verification conditions instead.

## Required fidelity surfaces

- Fonts and typography: the implementation preserves the source's calm clinical hierarchy, bilingual document labels, compact metadata, and stronger patient/document titles. Production copy is denser where actual source-backed claims require additional rows, but remains readable and does not truncate critical values silently.
- Spacing and layout rhythm: the collapsed rail, appointment hero, three important-document cards, recent-document list, warning strip, and docked inspector follow the source composition. The production inspector uses a slightly more compact card and tighter claim rows to keep actions reachable at 1024 px height.
- Colors and visual tokens: white, soft clinical blue, navy text, muted borders, green readiness, and amber caution states map consistently to the reference. Verification is not shown in green when proof and policy checks are incomplete.
- Image quality and asset fidelity: the hospital illustration and TrustCare shield are real raster assets. Identity credentials use the exact subject image from the credential record; non-photo credentials do not borrow a person image.
- Copy and content: production shows actual credential, issuer, lifecycle, source, and policy values. Differences from the mock's names, identifiers, dates, and verified labels are intentional data-integrity constraints rather than visual drift.

## Findings

No actionable P0, P1, or P2 visual or interaction findings remain.

Acceptable differences:

- The source shows idealized verified cards; production correctly shows pending/manual-review language for proofless demo credentials.
- The production ID-1 card is slightly smaller than the mock so it keeps the ISO/IEC 7810 ID-1 aspect ratio and leaves room for source-backed details and actions.
- The production recent list contains payer demo artifacts because the complete fixture reflects the current repository data rather than invented mock content.

## Comparison history

- Earlier P2: the A4 document reflowed into a responsive card on mobile and no longer represented physical paper. Fix: excluded the scaled physical frame from responsive paper rules and retained 14 mm/16 mm print geometry. Post-fix evidence: `trustcare-railway-mobile-a4-final.png` shows the complete paper sheet scaled inside a bounded preview without horizontal overflow.
- Earlier P2: desktop A4 content was vertically compressed inside the inspector. Fix: measured the viewport, applied a uniform document scale, and guarded resize/font observer cleanup. Post-fix evidence: the final A4 captures preserve letterhead columns, metadata columns, 14 px paper type, and the physical page ratio.
- Earlier P2: the first inspector pass competed with the Home layout. Fix: docked the desktop inspector and made mobile a full-screen dialog above the bottom navigation. Post-fix evidence: the full and focused comparison images show both states aligned with the selected reference.
- Earlier P2: the desktop appointment banner was too tall and its heavy heading wrapped to two lines. Fix: reduced the banner to 220 px, set the heading to 25 px/600 at the 1280 px inspector state, and kept the heading on one line where desktop space is sufficient.
- Earlier P2: important document cards were visually empty compared with the selected reference. Fix: added compact HN, coverage, and medication summaries projected from `credentialRenderModelFromCard`, while retaining the actual lifecycle/trust state and source-bound patient photo.

## Follow-up polish

- P3: production claim rows could use abbreviated localized values for gender and nationality once canonical localization mappings are supplied by the product contract.
- P3: a hospital-provided high-resolution logo can replace the demo shield without changing renderer architecture.

## Implementation checklist

- [x] Premium Home composition matches the selected direction.
- [x] Side menu collapses and expands.
- [x] Desktop and mobile credential inspectors preserve surrounding navigation.
- [x] ID-1 and A4 credentials use their correct physical form factors.
- [x] Share copy is patient-friendly and technical disclosure mode selection remains internal.
- [x] Production Railway Browser QA completed with clean console output.

final result: passed
