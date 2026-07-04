export const queryKeys = {
  authMe: ["auth", "me"] as const,
  walletCards: ["wallet", "cardsByCategory"] as const,
  walletHistory: ["wallet", "history"] as const,
  walletSuperseded: ["wallet", "superseded"] as const,
  shlList: ["shl", "list"] as const,
  shlDetail: (id: number) => ["shl", "detail", id] as const,
  readiness: (context: string) => ["wallet", "readiness", context] as const
};

