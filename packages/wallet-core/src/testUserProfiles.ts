import type { ReadinessContext } from "./models";

export type WalletTestFunctionScope =
  | "receive"
  | "prepare"
  | "share_vp"
  | "share_shl"
  | "verify"
  | "portal_sync"
  | "credential_request"
  | "payer_orchestration"
  | "offline_retry";

export type WalletTestDataState =
  "complete" | "ready" | "partial" | "empty" | "external";

export type WalletTestUserProfile = Readonly<{
  userId: string;
  portalFixtureOpenId?: string;
  portalRole: "patient";
  dataScope: "holder_only";
  useCases: readonly ReadinessContext[];
  functionScopes: readonly WalletTestFunctionScope[];
  initialState: WalletTestDataState;
  expectedObjects: readonly string[];
  expectedFlowStates: readonly string[];
  persistentState: true;
}>;

const standardPatientScopes = [
  "receive",
  "prepare",
  "share_vp",
  "share_shl",
  "verify",
  "portal_sync",
  "credential_request",
  "offline_retry",
] as const satisfies readonly WalletTestFunctionScope[];

export const walletTestUserProfiles: readonly WalletTestUserProfile[] = [
  profile("demo-patient-001", ["opd_visit", "referral", "insurance_claim"], {
    initialState: "ready",
    expectedObjects: ["VC", "VP", "SHL", "consent", "claim evidence"],
    functionScopes: [...standardPatientScopes, "payer_orchestration"],
  }),
  profile("demo-patient-002", ["opd_visit", "emergency"], {
    initialState: "ready",
    expectedObjects: ["identity", "summary", "allergy", "lab"],
  }),
  profile("demo-patient-003", ["medical_tourist", "insurance_claim"], {
    initialState: "ready",
    expectedObjects: ["travel", "coverage", "quotation", "SHL"],
    functionScopes: [...standardPatientScopes, "payer_orchestration"],
  }),
  profile("demo-patient-004", ["cross_border"], {
    initialState: "partial",
    expectedObjects: ["identity", "consent"],
    expectedFlowStates: ["missing_referral", "missing_summary", "missing_lab"],
  }),
  profile("demo-patient-005", ["pharmacy_dispense"], {
    initialState: "partial",
    expectedObjects: ["identity", "allergy"],
    expectedFlowStates: ["missing_prescription", "missing_medication"],
  }),
  profile("demo-patient-006", ["insurance_claim"], {
    initialState: "partial",
    expectedObjects: ["identity"],
    expectedFlowStates: ["missing_coverage", "missing_claim", "payer_pending"],
    functionScopes: [...standardPatientScopes, "payer_orchestration"],
  }),
  profile("demo-patient-007", ["referral"], {
    initialState: "partial",
    expectedObjects: ["identity", "allergy", "medication"],
    expectedFlowStates: ["missing_referral", "missing_summary"],
  }),
  profile("demo-patient-008", ["medical_tourist"], {
    initialState: "partial",
    expectedObjects: ["identity", "summary"],
    expectedFlowStates: [
      "missing_quotation",
      "missing_guarantee",
      "missing_visa",
    ],
    functionScopes: [...standardPatientScopes, "payer_orchestration"],
  }),
  profile("demo-patient-009", ["emergency"], {
    initialState: "partial",
    expectedObjects: ["identity"],
    expectedFlowStates: ["missing_allergy", "missing_medication"],
  }),
  profile(
    "demo-patient-complete-001",
    [
      "opd_visit",
      "emergency",
      "referral",
      "cross_border",
      "medical_tourist",
      "insurance_claim",
      "pharmacy_dispense",
    ],
    {
      initialState: "complete",
      expectedObjects: ["all credential types", "VP", "SHL", "payer artifacts"],
      functionScopes: [...standardPatientScopes, "payer_orchestration"],
    },
  ),
  profile("portal-empty-patient-001", ["opd_visit"], {
    initialState: "empty",
    expectedObjects: [],
    expectedFlowStates: ["initial_sync", "cursor_recovery", "ack_pending"],
  }),
  profile(
    "partner-patient-001",
    ["cross_border", "opd_visit"],
    {
      initialState: "external",
      expectedObjects: ["patient-provided VC", "DocumentReference"],
    },
    false,
  ),
  profile(
    "partner-patient-002",
    ["medical_tourist"],
    {
      initialState: "external",
      expectedObjects: ["travel", "insurance", "guarantee"],
      functionScopes: [...standardPatientScopes, "payer_orchestration"],
    },
    false,
  ),
];

const profileByUserId = new Map(
  walletTestUserProfiles.map((candidate) => [candidate.userId, candidate]),
);

export function walletTestUserProfile(
  userId: string,
): WalletTestUserProfile | undefined {
  return profileByUserId.get(userId);
}

export function isWalletTestLoginUser(userId: string): boolean {
  return profileByUserId.has(userId);
}

function profile(
  userId: string,
  useCases: readonly ReadinessContext[],
  overrides: Partial<
    Pick<
      WalletTestUserProfile,
      | "initialState"
      | "expectedObjects"
      | "expectedFlowStates"
      | "functionScopes"
    >
  > = {},
  portalBacked = true,
): WalletTestUserProfile {
  return Object.freeze({
    userId,
    portalFixtureOpenId: portalBacked ? userId : undefined,
    portalRole: "patient" as const,
    dataScope: "holder_only" as const,
    useCases: Object.freeze([...useCases]),
    functionScopes: Object.freeze([
      ...(overrides.functionScopes ?? standardPatientScopes),
    ]),
    initialState: overrides.initialState ?? "ready",
    expectedObjects: Object.freeze([...(overrides.expectedObjects ?? [])]),
    expectedFlowStates: Object.freeze([
      ...(overrides.expectedFlowStates ?? ["ready"]),
    ]),
    persistentState: true as const,
  });
}
