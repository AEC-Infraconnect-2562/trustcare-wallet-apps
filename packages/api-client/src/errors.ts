export class TrustCareApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(
    message: string,
    options: { status?: number; code?: string } = {},
  ) {
    super(message);
    this.name = "TrustCareApiError";
    this.status = options.status;
    this.code = options.code;
  }
}

export function toApiError(error: unknown): TrustCareApiError {
  if (error instanceof TrustCareApiError) return error;
  if (error instanceof Error) return new TrustCareApiError(error.message);
  return new TrustCareApiError("Unknown TrustCare API error");
}
