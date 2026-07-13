import {
  applyWalletExchangeAckReceipt,
  createHolderSignedDirectVp,
  finalizeCertifiedShl,
  normalizeDocumentType,
  prepareHolderAttestedShl,
  prepareWalletExchangeSyncCommit,
  type HolderSigningIdentity,
  type CertifiedShlPublication,
  type PreparedHolderAttestedShl,
  type PrepareHolderAttestedShlInput as CorePrepareHolderAttestedShlInput,
  type RuntimeEnvironment,
  type WalletExchangePartition,
  type WalletExchangeState,
  type WalletExchangeSyncReduction,
} from "@trustcare/wallet-core";
import type {
  WalletCredentialRequest,
  WalletCredentialRequestInput,
  WalletCredentialRequestStatus,
  WalletExchangeHospitalCode,
  WalletExchangeServiceContext,
  WalletShareGatewayBinding,
  WalletSubmission,
  WalletSubmissionRequest,
} from "@trustcare/contracts";
import {
  decodeJwt,
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
  type JWTPayload,
} from "jose";
import {
  resolveAllPortalHospitalIssuers,
  verifyPortalHospitalCredentialJwt,
  type ResolvedPortalHospitalIssuer,
} from "./portalIssuerResolver";
import {
  loadWalletExchangeContracts,
  normalizePortalOrigin,
  type WalletExchangeContractSet,
} from "./walletContractLoader";
import { prepareWalletExchangeCredential } from "./walletExchangeCredential";
import {
  createWalletExchangeV2Client,
  type WalletExchangeV2Client,
} from "./walletExchangeV2";
import { TrustCareApiError } from "./errors";
import type { ShlCertificationResponse } from "./shlCertification";

export type PrepareHolderAttestedShlInput = Omit<
  CorePrepareHolderAttestedShlInput,
  | "identity"
  | "portalOrigin"
  | "manifestUrl"
  | "fileBaseUrl"
  | "trustedIssuerDids"
  | "audience"
>;

export type ShlCertificationAttempt =
  | { status: "submitted"; response: ShlCertificationResponse }
  | {
      status: "portal_unavailable";
      patientMessage: "รอการรับรองจากโรงพยาบาล";
    };

export type WalletExchangeCredentialRequestLink = {
  clientRequestId: string;
  requestId: string;
  idempotencyKey: string;
  statusUrl: string;
  lastKnownStatus?: string;
  targetHospitalCode: WalletExchangeHospitalCode;
  context: WalletExchangeServiceContext;
  purpose: string;
  credentialTypes: string[];
  documentTypes?: string[];
  createdAt: string;
  updatedAt: string;
};

export type WalletExchangeSubmissionLink = {
  clientSubmissionId: string;
  submissionId: string;
  idempotencyKey: string;
  intentDigest: `sha256:${string}`;
  requestDigest: `sha256:${string}`;
  statusUrl: string;
  lastKnownStatus?: string;
  createdAt: string;
  updatedAt: string;
};

export type WalletExchangePendingSubmissionDraft = {
  schema: "trustcare.wallet.submission-outbox.v1";
  clientSubmissionId: string;
  idempotencyKey: string;
  intentDigest: `sha256:${string}`;
  requestDigest: `sha256:${string}`;
  requestBody: string;
  request: WalletSubmissionRequest & {
    transport: { mode: "direct_vp"; vpJwt: string };
  };
  createdAt: string;
};

export interface WalletExchangePersistencePort {
  readonly partition: WalletExchangePartition;
  configureTrustedIssuers(issuerDids: readonly string[]): void;
  loadOrCreateState(): Promise<WalletExchangeState>;
  commitSyncReduction(reduction: WalletExchangeSyncReduction): Promise<void>;
  persistAcknowledgedState(state: WalletExchangeState): Promise<void>;
  saveCredentialRequestLink(
    link: WalletExchangeCredentialRequestLink,
  ): Promise<void>;
  getCredentialRequestLink(
    clientRequestId: string,
  ): Promise<WalletExchangeCredentialRequestLink | null>;
  saveSubmissionLink(link: WalletExchangeSubmissionLink): Promise<void>;
  getSubmissionLink(
    clientSubmissionId: string,
  ): Promise<WalletExchangeSubmissionLink | null>;
  savePendingSubmissionDraft(
    draft: WalletExchangePendingSubmissionDraft,
  ): Promise<void>;
  getPendingSubmissionDraft(
    clientSubmissionId: string,
  ): Promise<WalletExchangePendingSubmissionDraft | null>;
  listPendingSubmissionDrafts(): Promise<
    WalletExchangePendingSubmissionDraft[]
  >;
  completePendingSubmission(
    draft: WalletExchangePendingSubmissionDraft,
    link: WalletExchangeSubmissionLink,
  ): Promise<void>;
}

export type WalletExchangeWorkflowOptions = {
  portalBaseUrl: string;
  runtimeEnvironment: RuntimeEnvironment;
  walletVersion: string;
  appId: string;
  identity: HolderSigningIdentity;
  persistence: WalletExchangePersistencePort;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  clientFactory?: typeof createWalletExchangeV2Client;
};

export type WalletExchangeSyncResult = {
  state: WalletExchangeState;
  pages: number;
  applied: number;
  archived: number;
  rejected: number;
  pendingAckRecovered: boolean;
};

export type WalletMissingCredentialRequestInput = {
  clientRequestId: string;
  targetHospitalCode: WalletExchangeHospitalCode;
  context: WalletExchangeServiceContext;
  purpose: string;
  consentRef: string;
  documentTypes: string[];
  notes?: string;
};

const allScopes = [
  "credentials:read",
  "credentials:request",
  "credentials:present",
  "documents:read",
  "documents:write",
] as const;

/** Shared Web/Mobile workflow. Platform code supplies only secure persistence. */
export class WalletExchangeWorkflow {
  private contractsPromise?: Promise<WalletExchangeContractSet>;
  private clientPromise?: Promise<WalletExchangeV2Client>;
  private issuersPromise?: Promise<ResolvedPortalHospitalIssuer[]>;

  constructor(private readonly options: WalletExchangeWorkflowOptions) {
    if (options.persistence.partition.holderDid !== options.identity.did) {
      throw new TrustCareApiError(
        "Wallet Exchange persistence and holder key belong to different partitions.",
        { code: "wallet_holder_partition_mismatch" },
      );
    }
    if (
      options.persistence.partition.portalOrigin !==
      normalizePortalOrigin(options.portalBaseUrl)
    ) {
      throw new TrustCareApiError(
        "Wallet Exchange persistence and live Portal configuration use different origins.",
        { code: "wallet_portal_partition_mismatch" },
      );
    }
  }

  async issuerDidForHospital(
    hospitalCode: WalletExchangeHospitalCode,
  ): Promise<string> {
    const issuer = (await this.issuers()).find(
      (candidate) => candidate.hospitalCode === hospitalCode,
    );
    if (!issuer) {
      throw new TrustCareApiError(
        `Portal trust registry has no active issuer for ${hospitalCode}.`,
        { code: "portal_issuer_not_found" },
      );
    }
    return issuer.issuerDid;
  }

  async prepareHolderAttestedShl(
    input: PrepareHolderAttestedShlInput,
  ): Promise<PreparedHolderAttestedShl> {
    const [contracts, issuers] = await Promise.all([
      this.contracts(),
      this.issuers(),
    ]);
    const shareGateway = contracts.discovery.endpoints.shareGateway.replace(
      /\/$/,
      "",
    );
    const encodedPackageId = encodeURIComponent(input.publicationId);
    return prepareHolderAttestedShl({
      ...input,
      identity: this.options.identity,
      portalOrigin: contracts.portalOrigin,
      manifestUrl: `${shareGateway}/manifests/${encodedPackageId}.json`,
      fileBaseUrl: `${shareGateway}/files/`,
      trustedIssuerDids: issuers.map((issuer) => issuer.issuerDid),
      audience: contracts.discovery.endpoints.documentSubmissions,
    });
  }

  async requestHospitalShlCertification(
    prepared: PreparedHolderAttestedShl,
  ): Promise<ShlCertificationAttempt> {
    await this.contracts();
    const response = await (
      await this.client()
    ).requestShlCertification(
      prepared.certificationRequest,
      prepared.certificationRequest.requestId,
    );
    return { status: "submitted", response };
  }

  async refreshHospitalShlCertification(
    certificationRequestId: string,
  ): Promise<ShlCertificationAttempt> {
    await this.contracts();
    const response = await (
      await this.client()
    ).getShlCertificationStatus(certificationRequestId);
    return { status: "submitted", response };
  }

  async finalizeHospitalCertifiedShl(input: {
    prepared: PreparedHolderAttestedShl;
    response: ShlCertificationResponse;
  }): Promise<CertifiedShlPublication> {
    if (
      input.response.status !== "approved" ||
      input.response.manifestCredentialContentType !== "application/vc+jwt" ||
      !input.response.manifestCredentialJwt
    ) {
      throw new TrustCareApiError(
        "รอการรับรองจากโรงพยาบาล",
        { code: "shl_certification_pending" },
      );
    }
    if (
      input.response.requestId !== input.prepared.certificationRequest.requestId ||
      input.response.shlPackageId !== input.prepared.manifest.publicationId
    ) {
      throw new TrustCareApiError(
        "Portal SHL certification response does not match the holder request.",
        { code: "shl_certification_binding_invalid" },
      );
    }
    const decoded = decodeJwt(input.response.manifestCredentialJwt);
    const issuer = (await this.issuers()).find(
      (candidate) => candidate.issuerDid === decoded.iss,
    );
    if (!issuer) {
      throw new TrustCareApiError(
        "Manifest Credential issuer is not in the live Portal trust registry.",
        { code: "shl_certification_issuer_invalid" },
      );
    }
    const now = this.options.now?.() ?? new Date();
    return finalizeCertifiedShl({
      identity: this.options.identity,
      prepared: input.prepared,
      manifestCredentialJwt: input.response.manifestCredentialJwt,
      now,
      verifyManifestCredential: async (jwt) => {
        const verification = await verifyPortalHospitalCredentialJwt({
          jwt,
          issuer,
          expectedHolderDid: this.options.identity.did,
          profile: "shl_manifest_credential",
          now,
        });
        if (
          !verification.verified ||
          verification.status !== "active" ||
          !verification.kid ||
          !verification.alg ||
          !verification.payload
        ) {
          return {
            verified: false,
            reason:
              verification.errors.join(", ") ||
              "Portal Manifest Credential verification failed",
          };
        }
        return {
          verified: true,
          issuerDid: issuer.issuerDid,
          verificationMethod: verification.kid,
          algorithm: verification.alg,
          verifiedAt: now.toISOString(),
          issuerStatus: "active",
          credentialStatus: "active",
          claims: verification.payload as JWTPayload,
        };
      },
    });
  }

  async synchronize(limit = 100): Promise<WalletExchangeSyncResult> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new TrustCareApiError("Wallet Exchange sync limit must be 1-200.", {
        code: "wallet_sync_limit_invalid",
      });
    }
    const [client, issuers] = await Promise.all([
      this.client(),
      this.issuers(),
    ]);
    let state = await this.options.persistence.loadOrCreateState();
    let pendingAckRecovered = false;
    if (state.pendingAck) {
      state = await this.acknowledgePendingState(client, state);
      pendingAckRecovered = true;
    }

    const issuerByDid = new Map(
      issuers.map((issuer) => [issuer.issuerDid, issuer] as const),
    );
    let pages = 0;
    let applied = 0;
    let archived = 0;
    let rejected = 0;
    const seenCursors = new Set<string>();

    while (true) {
      const requestCursor = state.nextCursor;
      const page = await client.syncCredentials({
        cursor: requestCursor,
        limit,
        knownCredentials: state.lineages.map((lineage) => ({
          credentialId: lineage.credentialId,
          contentHash: lineage.contentHash,
          status:
            state.documents.find(
              (document) => document.id === lineage.activeDocumentId,
            )?.lifecycle.status ?? "active",
        })),
      });
      if (seenCursors.has(page.nextCursor)) {
        throw new TrustCareApiError(
          "Wallet Exchange Portal repeated a cursor in one sync run.",
          { code: "wallet_sync_cursor_loop" },
        );
      }
      seenCursors.add(page.nextCursor);
      const changes = await Promise.all(
        page.changes.map((change) => {
          if (change.type === "credential.status") return change;
          const resolvedIssuer = change.credential.issuerDid
            ? issuerByDid.get(change.credential.issuerDid)
            : undefined;
          return prepareWalletExchangeCredential({
            change,
            portalBaseUrl: this.options.portalBaseUrl,
            holderDid: this.options.identity.did,
            resolvedIssuer,
            fetchImpl: this.options.fetchImpl,
            now: this.options.now?.(),
          });
        }),
      );
      const ackIdempotencyKey = await deterministicIdempotencyKey(
        "sync-ack",
        `${page.syncId}\u0000${page.nextCursor}`,
      );
      const reduction = prepareWalletExchangeSyncCommit(state, {
        ...page,
        requestCursor,
        ackIdempotencyKey,
        changes,
      });
      await this.options.persistence.commitSyncReduction(reduction);
      state = reduction.state;
      for (const result of state.pendingAck?.results ?? []) {
        if (result.outcome === "applied") applied += 1;
        if (result.outcome === "archived") archived += 1;
        if (result.outcome === "rejected") rejected += 1;
      }
      state = await this.acknowledgePendingState(client, state);
      pages += 1;
      if (!page.hasMore) break;
    }
    return {
      state,
      pages,
      applied,
      archived,
      rejected,
      pendingAckRecovered,
    };
  }

  async requestCredential(
    input: WalletCredentialRequestInput,
  ): Promise<WalletCredentialRequest> {
    const client = await this.client();
    const existing = await this.options.persistence.getCredentialRequestLink(
      input.clientRequestId,
    );
    const idempotencyKey =
      existing?.idempotencyKey ??
      (await deterministicIdempotencyKey(
        "credential-request",
        input.clientRequestId,
      ));
    const response = await client.requestCredential(input, idempotencyKey);
    this.assertStatusUrl(
      response.statusUrl,
      "credential-requests",
      response.requestId,
    );
    await this.options.persistence.saveCredentialRequestLink({
      clientRequestId: response.clientRequestId,
      requestId: response.requestId,
      idempotencyKey,
      statusUrl: response.statusUrl,
      lastKnownStatus: response.status,
      targetHospitalCode: input.targetHospitalCode,
      context: input.context,
      purpose: input.purpose,
      credentialTypes: [...input.credentialTypes],
      createdAt: response.createdAt,
      updatedAt: response.createdAt,
    });
    return response;
  }

  /**
   * Patient-facing request entrypoint. The Wallet receives document names from
   * UX and derives Portal credential types from the integrity-checked live
   * Contract Hub manifest instead of asking a patient to choose VC formats.
   */
  async requestMissingCredentials(
    input: WalletMissingCredentialRequestInput,
  ): Promise<WalletCredentialRequest> {
    rejectPatientId(input);
    const contracts = await this.contracts();
    const credentialTypes = credentialTypesForDocumentRequest(
      contracts.manifest.payload,
      input.context,
      input.documentTypes,
    );
    const response = await this.requestCredential({
      clientRequestId: input.clientRequestId,
      targetHospitalCode: input.targetHospitalCode,
      context: input.context,
      purpose: input.purpose,
      consentRef: input.consentRef,
      credentialTypes,
      notes: input.notes,
    });
    const link = await this.options.persistence.getCredentialRequestLink(
      input.clientRequestId,
    );
    if (!link) {
      throw new TrustCareApiError(
        "Wallet credential request link was not persisted.",
        { code: "wallet_request_link_missing" },
      );
    }
    await this.options.persistence.saveCredentialRequestLink({
      ...link,
      documentTypes: [...input.documentTypes],
    });
    return response;
  }

  async refreshCredentialRequest(
    clientRequestId: string,
  ): Promise<WalletCredentialRequestStatus> {
    const link =
      await this.options.persistence.getCredentialRequestLink(clientRequestId);
    if (!link) {
      throw new TrustCareApiError(
        "Wallet credential request link was not found.",
        {
          code: "wallet_request_link_missing",
        },
      );
    }
    const response = await (
      await this.client()
    ).getCredentialRequestStatus(link.requestId);
    await this.options.persistence.saveCredentialRequestLink({
      ...link,
      lastKnownStatus: response.status,
      updatedAt: response.updatedAt,
    });
    return response;
  }

  async submitDirectPresentation(input: {
    clientSubmissionId: string;
    context: WalletExchangeServiceContext;
    purpose: string;
    consentRef: string;
    recipient: string;
    documentIds: string[];
  }): Promise<WalletSubmission> {
    rejectPatientId(input);
    await this.assertPortalHospitalRecipient(input.recipient);
    const intentDigest = await submissionIntentDigest(input);
    const existingLink = await this.options.persistence.getSubmissionLink(
      input.clientSubmissionId,
    );
    if (existingLink) {
      if (existingLink.intentDigest !== intentDigest) {
        throw new TrustCareApiError(
          "Wallet submission id was already used for a different presentation intent.",
          { code: "wallet_submission_idempotency_conflict" },
        );
      }
      return this.refreshSubmission(input.clientSubmissionId);
    }
    const pending = await this.options.persistence.getPendingSubmissionDraft(
      input.clientSubmissionId,
    );
    if (pending && pending.intentDigest !== intentDigest) {
      throw new TrustCareApiError(
        "Wallet submission id was already queued for a different presentation intent.",
        { code: "wallet_submission_idempotency_conflict" },
      );
    }
    if (pending) return this.sendPendingDirectSubmission(pending);

    const state = await this.options.persistence.loadOrCreateState();
    const selected = input.documentIds.map((id) => {
      const document = state.documents.find((candidate) => candidate.id === id);
      if (!document) {
        throw new TrustCareApiError(`Wallet document not found: ${id}`, {
          code: "wallet_document_missing",
        });
      }
      if (
        document.owner.id !== this.options.identity.did ||
        ["revoked", "expired", "suspended", "superseded"].includes(
          document.lifecycle.status,
        ) ||
        !document.credential.jwt
      ) {
        throw new TrustCareApiError(
          `Wallet document is not eligible for presentation: ${id}`,
          { code: "wallet_document_not_presentable" },
        );
      }
      return document;
    });
    if (!selected.length) {
      throw new TrustCareApiError(
        "Select at least one signed Wallet document.",
        { code: "wallet_document_selection_empty" },
      );
    }
    const audience = `${this.options.persistence.partition.portalOrigin}/verifier`;
    const presentation = await createHolderSignedDirectVp({
      identity: this.options.identity,
      audience,
      recipient: input.recipient,
      context: input.context,
      purpose: input.purpose,
      consentRef: input.consentRef,
      credentialJwts: selected.map((document) => document.credential.jwt!),
      now: this.options.now?.(),
    });
    const idempotencyKey = await deterministicIdempotencyKey(
      "submission",
      input.clientSubmissionId,
    );
    const request: WalletExchangePendingSubmissionDraft["request"] = {
      clientSubmissionId: input.clientSubmissionId,
      context: input.context,
      purpose: input.purpose,
      consentRef: input.consentRef,
      transport: presentation.transport,
    };
    const requestBody = JSON.stringify(request);
    const draft: WalletExchangePendingSubmissionDraft = {
      schema: "trustcare.wallet.submission-outbox.v1",
      clientSubmissionId: input.clientSubmissionId,
      idempotencyKey,
      intentDigest,
      requestDigest: await sha256Digest(requestBody),
      requestBody,
      request,
      createdAt: (this.options.now?.() ?? new Date()).toISOString(),
    };
    await this.options.persistence.savePendingSubmissionDraft(draft);
    return this.sendPendingDirectSubmission(draft);
  }

  async submitCertifiedShareGateway(input: {
    clientSubmissionId: string;
    context: WalletExchangeServiceContext;
    purpose: string;
    consentRef: string;
    artifactId: string;
    binding: WalletShareGatewayBinding;
    holderSignedVpJwt: string;
  }): Promise<WalletSubmission> {
    rejectPatientId(input);
    if (input.binding.purpose !== input.purpose) {
      throw new TrustCareApiError(
        "Share Gateway purpose does not match the Wallet submission.",
        { code: "share_gateway_holder_vp_invalid" },
      );
    }
    await this.assertPortalHospitalRecipient(input.binding.recipient);
    await this.assertGatewayPreservesHolderVp({
      artifactId: input.artifactId,
      expectedVpJwt: input.holderSignedVpJwt,
      context: input.context,
      purpose: input.purpose,
      consentRef: input.consentRef,
      binding: input.binding,
    });
    const existing = await this.options.persistence.getSubmissionLink(
      input.clientSubmissionId,
    );
    const idempotencyKey =
      existing?.idempotencyKey ??
      (await deterministicIdempotencyKey(
        "submission",
        input.clientSubmissionId,
      ));
    const response = await (
      await this.client()
    ).submitDocuments(
      {
        clientSubmissionId: input.clientSubmissionId,
        context: input.context,
        purpose: input.purpose,
        consentRef: input.consentRef,
        transport: {
          mode: "share_gateway",
          artifactId: input.artifactId,
          binding: input.binding,
        },
      },
      idempotencyKey,
    );
    this.assertStatusUrl(
      response.statusUrl,
      "submissions",
      response.submissionId,
    );
    await this.options.persistence.saveSubmissionLink({
      clientSubmissionId: response.clientSubmissionId,
      submissionId: response.submissionId,
      idempotencyKey,
      intentDigest: await sha256Digest(
        stableJson({
          clientSubmissionId: input.clientSubmissionId,
          context: input.context,
          purpose: input.purpose,
          consentRef: input.consentRef,
          artifactId: input.artifactId,
          binding: input.binding,
        }),
      ),
      requestDigest: await sha256Digest(
        stableJson({
          clientSubmissionId: input.clientSubmissionId,
          context: input.context,
          purpose: input.purpose,
          consentRef: input.consentRef,
          transport: {
            mode: "share_gateway",
            artifactId: input.artifactId,
            binding: input.binding,
          },
        }),
      ),
      statusUrl: response.statusUrl,
      lastKnownStatus: response.status,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
    });
    return response;
  }

  async refreshSubmission(
    clientSubmissionId: string,
  ): Promise<WalletSubmission> {
    const link =
      await this.options.persistence.getSubmissionLink(clientSubmissionId);
    if (!link) {
      throw new TrustCareApiError("Wallet submission link was not found.", {
        code: "wallet_submission_link_missing",
      });
    }
    const response = await (
      await this.client()
    ).getSubmissionStatus(link.submissionId);
    await this.options.persistence.saveSubmissionLink({
      ...link,
      lastKnownStatus: response.status,
      updatedAt: response.updatedAt,
    });
    return response;
  }

  /**
   * Explicit crash/offline recovery entrypoint. Platform UI can discover all
   * durable drafts after restart without remembering an in-memory client id.
   * Each retry reuses the exact stored request body and idempotency key.
   */
  async recoverPendingDirectSubmissions(): Promise<WalletSubmission[]> {
    const drafts = await this.options.persistence.listPendingSubmissionDrafts();
    const responses: WalletSubmission[] = [];
    for (const draft of drafts) {
      responses.push(await this.sendPendingDirectSubmission(draft));
    }
    return responses;
  }

  private async client(): Promise<WalletExchangeV2Client> {
    this.clientPromise ??= (async () => {
      const contracts = await this.contracts();
      return (this.options.clientFactory ?? createWalletExchangeV2Client)({
        contracts,
        identity: this.options.identity,
        appId: this.options.appId,
        requestedScopes: [...allScopes],
        fetchImpl: this.options.fetchImpl,
        now: this.options.now,
      });
    })();
    return this.clientPromise;
  }

  private async contracts(): Promise<WalletExchangeContractSet> {
    this.contractsPromise ??= loadWalletExchangeContracts({
      portalBaseUrl: this.options.portalBaseUrl,
      runtimeEnvironment: this.options.runtimeEnvironment,
      walletVersion: this.options.walletVersion,
      fetchImpl: this.options.fetchImpl,
      now: this.options.now,
    });
    return this.contractsPromise;
  }

  private async issuers(): Promise<ResolvedPortalHospitalIssuer[]> {
    this.issuersPromise ??= resolveAllPortalHospitalIssuers({
      portalBaseUrl: this.options.portalBaseUrl,
      fetchImpl: this.options.fetchImpl,
    });
    const issuers = await this.issuersPromise;
    this.options.persistence.configureTrustedIssuers(
      issuers.map((issuer) => issuer.issuerDid),
    );
    return issuers;
  }

  private async acknowledgePendingState(
    client: WalletExchangeV2Client,
    state: WalletExchangeState,
  ): Promise<WalletExchangeState> {
    const pending = state.pendingAck;
    if (!pending) return state;
    const receipt = await client.acknowledgeSync(
      {
        syncId: pending.syncId,
        cursor: pending.cursor,
        results: pending.results,
      },
      pending.idempotencyKey,
    );
    const acknowledged = applyWalletExchangeAckReceipt(state, {
      ...receipt,
      cursor: pending.cursor,
    });
    await this.options.persistence.persistAcknowledgedState(acknowledged);
    return acknowledged;
  }

  private async sendPendingDirectSubmission(
    draft: WalletExchangePendingSubmissionDraft,
  ): Promise<WalletSubmission> {
    if ((await sha256Digest(draft.requestBody)) !== draft.requestDigest) {
      throw new TrustCareApiError(
        "Durable Wallet submission request digest does not match its stored bytes.",
        { code: "wallet_submission_outbox_invalid" },
      );
    }
    await this.assertPendingDirectPresentation(draft);
    const response = await (
      await this.client()
    ).submitDocumentsSerialized(draft.requestBody, draft.idempotencyKey);
    if (response.clientSubmissionId !== draft.clientSubmissionId) {
      throw new TrustCareApiError(
        "Portal returned a submission for a different Wallet client id.",
        { code: "wallet_submission_response_invalid" },
      );
    }
    this.assertStatusUrl(
      response.statusUrl,
      "submissions",
      response.submissionId,
    );
    const link: WalletExchangeSubmissionLink = {
      clientSubmissionId: response.clientSubmissionId,
      submissionId: response.submissionId,
      idempotencyKey: draft.idempotencyKey,
      intentDigest: draft.intentDigest,
      requestDigest: draft.requestDigest,
      statusUrl: response.statusUrl,
      lastKnownStatus: response.status,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
    };
    await this.options.persistence.completePendingSubmission(draft, link);
    return response;
  }

  private async assertPendingDirectPresentation(
    draft: WalletExchangePendingSubmissionDraft,
  ): Promise<void> {
    const header = decodeProtectedHeader(draft.request.transport.vpJwt);
    const key = await importJWK(
      this.options.identity.publicJwk,
      this.options.identity.jwsAlgorithm,
    );
    const audience = `${this.options.persistence.partition.portalOrigin}/verifier`;
    let verified;
    try {
      verified = await jwtVerify(draft.request.transport.vpJwt, key, {
        issuer: this.options.identity.did,
        subject: this.options.identity.did,
        audience,
        algorithms: [this.options.identity.jwsAlgorithm],
        currentDate: this.options.now?.() ?? new Date(),
      });
    } catch {
      throw new TrustCareApiError(
        "Durable Wallet submission no longer contains a valid holder-signed VP.",
        { code: "wallet_submission_outbox_invalid" },
      );
    }
    const vp = isRecord(verified.payload.vp) ? verified.payload.vp : undefined;
    const trustcare = isRecord(vp?.trustcare) ? vp.trustcare : undefined;
    const recipient =
      typeof trustcare?.recipient === "string" ? trustcare.recipient : "";
    if (
      header.typ !== "vp+jwt" ||
      header.kid !== this.options.identity.kid ||
      vp?.holder !== this.options.identity.did ||
      vp?.purpose !== draft.request.purpose ||
      trustcare?.context !== draft.request.context ||
      trustcare?.consentRef !== draft.request.consentRef ||
      trustcare?.audience !== audience ||
      !Array.isArray(vp?.verifiableCredential) ||
      vp.verifiableCredential.some(
        (credential) => !isNonEmptyString(credential),
      )
    ) {
      throw new TrustCareApiError(
        "Durable Wallet submission holder binding does not match its request.",
        { code: "wallet_submission_outbox_invalid" },
      );
    }
    await this.assertPortalHospitalRecipient(recipient);
  }

  private assertStatusUrl(url: string, collection: string, id: string): void {
    const expected = `${this.options.persistence.partition.portalOrigin}/api/wallet/v2/${collection}/${encodeURIComponent(id)}`;
    if (url !== expected) {
      throw new TrustCareApiError(
        "Portal returned a cross-origin or unexpected Wallet status URL.",
        { code: "wallet_status_url_invalid" },
      );
    }
  }

  private async assertPortalHospitalRecipient(
    recipient: string,
  ): Promise<void> {
    const allowed = new Set(
      (await this.issuers()).map((issuer) => issuer.issuerDid),
    );
    if (!allowed.has(recipient)) {
      throw new TrustCareApiError(
        "Wallet Exchange recipient must be a live Portal TCC, TCP, or TCM did:web.",
        { code: "wallet_recipient_invalid" },
      );
    }
  }

  private async assertGatewayPreservesHolderVp(input: {
    artifactId: string;
    expectedVpJwt: string;
    context: WalletExchangeServiceContext;
    purpose: string;
    consentRef: string;
    binding: WalletShareGatewayBinding;
  }): Promise<void> {
    const contracts = await this.contracts();
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(input.artifactId)) {
      throw new TrustCareApiError("Share Gateway artifactId is invalid.", {
        code: "share_gateway_artifact_invalid",
      });
    }
    const gatewayBase = new URL(contracts.discovery.endpoints.shareGateway);
    if (
      gatewayBase.origin !== contracts.portalOrigin ||
      gatewayBase.username ||
      gatewayBase.password ||
      gatewayBase.search ||
      gatewayBase.hash
    ) {
      throw new TrustCareApiError(
        "Share Gateway contract URL is outside the configured Portal origin.",
        { code: "wallet_contract_incompatible" },
      );
    }
    const url = `${gatewayBase.toString().replace(/\/+$/, "")}/presentations/${encodeURIComponent(input.artifactId)}.jwt`;
    const response = await (this.options.fetchImpl ?? fetch)(url, {
      headers: { accept: "application/vp+jwt, application/jwt, text/plain" },
      cache: "no-store",
    });
    const published = await response.text();
    if (
      !response.ok ||
      (response.url && response.url !== url) ||
      published !== input.expectedVpJwt
    ) {
      throw new TrustCareApiError(
        "Certified Share Gateway did not preserve the Wallet holder-signed VP.",
        {
          code: "share_gateway_holder_vp_not_preserved",
          status: response.status,
        },
      );
    }
    const header = decodeProtectedHeader(published);
    const key = await importJWK(
      this.options.identity.publicJwk,
      this.options.identity.jwsAlgorithm,
    );
    const verificationTime = this.options.now?.() ?? new Date();
    const verified = await jwtVerify(published, key, {
      issuer: this.options.identity.did,
      subject: this.options.identity.did,
      algorithms: [this.options.identity.jwsAlgorithm],
      currentDate: verificationTime,
    });
    const vp = isRecord(verified.payload.vp) ? verified.payload.vp : undefined;
    const trustcare = isRecord(vp?.trustcare) ? vp.trustcare : undefined;
    const audience =
      typeof verified.payload.aud === "string"
        ? verified.payload.aud
        : undefined;
    if (
      header.typ !== "vp+jwt" ||
      header.kid !== this.options.identity.kid ||
      verified.payload.sub !== this.options.identity.did ||
      verified.payload.iss !== this.options.identity.did ||
      vp?.holder !== this.options.identity.did ||
      vp?.purpose !== input.purpose ||
      trustcare?.context !== input.context ||
      trustcare?.consentRef !== input.consentRef ||
      trustcare?.recipient !== input.binding.recipient ||
      trustcare?.audience !== input.binding.audience ||
      input.binding.purpose !== input.purpose ||
      audience !== input.binding.audience ||
      typeof verified.payload.iat !== "number" ||
      typeof verified.payload.exp !== "number" ||
      verified.payload.exp <= verified.payload.iat ||
      verified.payload.exp > verified.payload.iat + 15 * 60 ||
      !/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(verified.payload.jti ?? ""),
      )
    ) {
      throw new TrustCareApiError(
        "Certified Share Gateway VP holder binding is invalid.",
        { code: "share_gateway_holder_vp_invalid" },
      );
    }
  }
}

export function credentialTypesForDocumentRequest(
  manifest: Record<string, unknown>,
  context: WalletExchangeServiceContext,
  documentTypes: string[],
): string[] {
  const requested = new Set(
    documentTypes.map((value) => normalizeDocumentType(value)).filter(Boolean),
  );
  if (!requested.size) {
    throw new TrustCareApiError(
      "Select at least one recognized document to request.",
      { code: "wallet_request_document_type_invalid" },
    );
  }
  const contracts = Array.isArray(manifest.contracts)
    ? manifest.contracts.filter(isRecord)
    : [];
  const service = contracts.find((candidate) => candidate.context === context);
  if (!service) {
    throw new TrustCareApiError(
      `The live Contract Hub has no active service profile for ${context}.`,
      { code: "wallet_request_context_unsupported" },
    );
  }
  const accepted = Array.isArray(service.acceptedCredentialTypes)
    ? service.acceptedCredentialTypes.filter(isNonEmptyString)
    : [];
  const mapped = accepted.filter((credentialType) => {
    const documentType = normalizeCredentialTypeName(credentialType);
    return documentType ? requested.has(documentType) : false;
  });
  const covered = new Set(
    mapped.map(normalizeCredentialTypeName).filter(Boolean),
  );
  const missing = [...requested].filter(
    (documentType) => !covered.has(documentType),
  );
  if (missing.length) {
    throw new TrustCareApiError(
      `The live Contract Hub does not accept credential types for: ${missing.join(", ")}.`,
      { code: "wallet_request_credential_type_unsupported" },
    );
  }
  return [...new Set(mapped)];
}

function normalizeCredentialTypeName(value: string) {
  const withoutSuffix = value.replace(/Credential$/i, "");
  const snakeCase = withoutSuffix
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
  return normalizeDocumentType(snakeCase);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

async function deterministicIdempotencyKey(
  prefix: string,
  stableIdentity: string,
): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(stableIdentity),
    ),
  );
  const hex = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}-${hex.slice(0, 48)}`;
}

async function submissionIntentDigest(input: {
  clientSubmissionId: string;
  context: WalletExchangeServiceContext;
  purpose: string;
  consentRef: string;
  recipient: string;
  documentIds: string[];
}): Promise<`sha256:${string}`> {
  return sha256Digest(
    stableJson({
      clientSubmissionId: input.clientSubmissionId,
      context: input.context,
      purpose: input.purpose,
      consentRef: input.consentRef,
      recipient: input.recipient,
      documentIds: [...input.documentIds],
    }),
  );
}

async function sha256Digest(value: string): Promise<`sha256:${string}`> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return `sha256:${Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function rejectPatientId(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.replace(/[-_]/g, "").toLowerCase() === "patientid") {
      throw new TrustCareApiError(
        "Portal patientId is forbidden in Wallet Exchange requests.",
        { code: "portal_patient_id_forbidden" },
      );
    }
    if (child && typeof child === "object") rejectPatientId(child);
  }
}
