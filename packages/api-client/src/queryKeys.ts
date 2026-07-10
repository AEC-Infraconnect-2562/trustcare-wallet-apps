export const queryKeys = {
  authMe: ["auth", "me"] as const,
  walletCards: ["wallet", "cardsByCategory"] as const,
  walletHistory: ["wallet", "history"] as const,
  walletSuperseded: ["wallet", "superseded"] as const,
  shlList: ["shl", "list"] as const,
  shlDetail: (id: number) => ["shl", "detail", id] as const,
  readiness: (context: string) => ["wallet", "readiness", context] as const,
  payerProfiles: ["payer", "profiles"] as const,
  payerCoverage: (patientId: string | number, payerId?: string) =>
    ["payer", "coverage", patientId, payerId ?? "all"] as const,
  payerEligibility: (patientId: string | number, payerId: string) =>
    ["payer", "eligibility", patientId, payerId] as const,
  payerPreAuth: (patientId: string | number, payerId: string) =>
    ["payer", "preAuth", patientId, payerId] as const,
  payerClaimStatus: (claimCaseId: string, payerId: string) =>
    ["payer", "claimStatus", claimCaseId, payerId] as const,
  authBrokerProviders: ["authBroker", "providers"] as const,
};
