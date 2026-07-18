import {
  assertShareGatewayPublicationRequest,
  type ShareGatewayAccessPolicyContract,
  type ShareGatewayArtifactKind as ShareGatewayArtifactKindContract,
  type ShareGatewayMode as ShareGatewayModeContract,
  type ShareGatewayPublicationRequestContract,
  type ShareGatewayPublicationResponseContract,
} from "@trustcare/contracts";
import type { ReadinessContext } from "./models";

export type ShareGatewayMode = ShareGatewayModeContract;
export type ShareGatewayArtifactKind = ShareGatewayArtifactKindContract;
export type ShareGatewayAccessPolicy = ShareGatewayAccessPolicyContract;
export type ShareGatewayPublicationRequest =
  ShareGatewayPublicationRequestContract & { context?: ReadinessContext };
export type ShareGatewayPublicationResponse =
  ShareGatewayPublicationResponseContract;

export function normalizeShareGatewayBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export function shareGatewayArtifactPath(
  kind: ShareGatewayArtifactKind,
  artifactId: string,
): string {
  const encoded = encodeURIComponent(artifactId);
  switch (kind) {
    case "vp":
      return `/presentations/${encoded}.jwt`;
    case "standard_shl_manifest":
      return `/s/${encoded}`;
    case "shl_file":
      return `/files/${encoded}`;
  }
}

export function shareGatewayArtifactUrl(
  baseUrl: string,
  kind: ShareGatewayArtifactKind,
  artifactId: string,
): string {
  return `${normalizeShareGatewayBaseUrl(baseUrl)}${shareGatewayArtifactPath(kind, artifactId)}`;
}

export function createShareGatewayPublicationRequest(input: {
  artifactId: string;
  kind: ShareGatewayArtifactKind;
  contentType: string;
  payload: unknown;
  ownerUserId?: string | number;
  holderDid?: string;
  context?: ReadinessContext;
  purpose?: string;
  recipient?: string;
  expiresAt?: string;
  accessPolicy?: ShareGatewayAccessPolicy;
  trustcare?: Record<string, unknown>;
}): ShareGatewayPublicationRequest {
  return assertShareGatewayPublicationRequest({
    artifactId: input.artifactId,
    kind: input.kind,
    contentType: input.contentType,
    payload: input.payload,
    ownerUserId: input.ownerUserId,
    holderDid: input.holderDid,
    context: input.context,
    purpose: input.purpose,
    recipient: input.recipient,
    expiresAt: input.expiresAt,
    accessPolicy: input.accessPolicy,
    trustcare: input.trustcare,
  }) as ShareGatewayPublicationRequest;
}
