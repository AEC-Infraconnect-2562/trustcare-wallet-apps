export type TrustCareValidationIssue = {
  path: string;
  message: string;
};

export class TrustCareContractError extends Error {
  readonly contractName: string;
  readonly issues: TrustCareValidationIssue[];

  constructor(contractName: string, issues: TrustCareValidationIssue[]) {
    super(
      `${contractName} contract validation failed: ${issues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "TrustCareContractError";
    this.contractName = contractName;
    this.issues = issues;
  }
}
