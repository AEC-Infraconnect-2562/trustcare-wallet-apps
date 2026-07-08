import type { ReadinessContext } from "./models";

export type ShareGatewayMode = "portal_backend" | "local_dev_gateway";

export type ShareGatewayArtifactKind =
  | "vp"
  | "standard_shl_manifest"
  | "certified_shl_manifest"
  | "manifest_vp"
  | "manifest_credential"
  | "holder_authorization"
  | "shl_file";

export type ShareGatewayAccessPolicy = {
  expiresAt?: string;
  passcodeRequired?: boolean;
  passcodeHint?: string | null;
  maxAccessCount?: number;
  accessCodeDelivery?:
    | "separate_channel"
    | "not_required"
    | "sms"
    | "in_person"
    | "secure_message"
    | string;
};

export type ShareGatewayPublicationRequest = {
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
};

export type ShareGatewayPublicationResponse = {
  ok: boolean;
  mode: ShareGatewayMode;
  artifactId: string;
  kind: ShareGatewayArtifactKind;
  publicUrl?: string;
  qrPayload?: string;
  manifestUrl?: string;
  warnings: string[];
  errors: string[];
};

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
    case "certified_shl_manifest":
      return `/manifests/${encoded}.json`;
    case "manifest_vp":
      return `/manifest-vps/${encoded}.json`;
    case "manifest_credential":
      return `/manifest-credentials/${encoded}.json`;
    case "holder_authorization":
      return `/holder-authorizations/${encoded}.json`;
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
  return {
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
  };
}
