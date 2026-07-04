import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { TrustCareApiError } from "./errors";

export type TrustCareClientOptions = {
  url: string;
  getAuthToken?: () => Promise<string | null> | string | null;
  fetchImpl?: typeof fetch;
  credentials?: RequestCredentials;
};

export function createTrustCareTrpcClient(options: TrustCareClientOptions) {
  return createTRPCProxyClient<any>({
    links: [
      httpBatchLink({
        url: options.url,
        transformer: superjson,
        async headers() {
          const token = await options.getAuthToken?.();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
        fetch(url, init) {
          const fetcher = options.fetchImpl ?? fetch;
          return fetcher(url, {
            ...init,
            credentials: options.credentials ?? "include"
          });
        }
      })
    ]
  });
}

export async function callTrpcProcedure<TOutput>(
  options: TrustCareClientOptions,
  path: string,
  input?: unknown
): Promise<TOutput> {
  const fetcher = options.fetchImpl ?? fetch;
  const token = await options.getAuthToken?.();
  const response = await fetcher(`${options.url.replace(/\/$/, "")}/${path}`, {
    method: "POST",
    credentials: options.credentials ?? "include",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ json: input ?? null })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new TrustCareApiError(payload?.error?.message ?? response.statusText, {
      status: response.status,
      code: payload?.error?.code
    });
  }
  if (payload?.error) {
    throw new TrustCareApiError(payload.error.message ?? "TrustCare API error", {
      code: payload.error.code
    });
  }
  return (payload?.result?.data?.json ?? payload?.result?.data ?? payload) as TOutput;
}
