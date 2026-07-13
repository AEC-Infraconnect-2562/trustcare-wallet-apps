import { describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import {
  credentialRenderModelFromCard,
  sandboxHolderIdentityForUser,
  walletCardForDocumentRendering,
  type HolderSigningIdentity,
} from "@trustcare/wallet-core";
import { loadWalletExchangeContracts } from "./walletContractLoader";
import {
  prepareWalletExchangeCredential,
  verifyWalletExchangeContentHash,
} from "./walletExchangeCredential";
import { WalletExchangeV2Client } from "./walletExchangeV2";
import {
  resolveAllPortalHospitalIssuers,
  verifyPortalHospitalCredentialJwt,
} from "./portalIssuerResolver";
import {
  WalletProvisioningClient,
  WalletProvisioningProblemError,
} from "./walletProvisioning";

const liveEnabled = process.env.TRUSTCARE_PORTAL_LIVE_BINDING_TEST === "1";
const portalBaseUrl =
  process.env.TRUSTCARE_PORTAL_BASE_URL ??
  "https://trustcare-hospital-network-production.up.railway.app";
const username =
  process.env.TRUSTCARE_WALLET_TEST_USERNAME ?? "demo-patient-003";
const appId = "trustcare-wallet-production";

describe.skipIf(!liveEnabled)("live Portal Wallet binding and sync", () => {
  it("reloads configuration then completes test-login -> binding -> DPoP session -> sync", async () => {
    const identity = await sandboxHolderIdentityForUser({
      userId: username,
      sandboxRuntime: true,
    });
    expect(identity).toBeDefined();
    const holder = identity as HolderSigningIdentity;
    const provisioning = new WalletProvisioningClient({
      portalBaseUrl,
      appId,
      identity: holder,
    });

    const configuration = await provisioning.reloadConfiguration();
    expect(configuration.endpoints.sandboxTestLogin).toContain(
      "/api/wallet/test-login",
    );
    const catalog = await provisioning.listSandboxTestIdentities();
    expect(catalog.some((entry) => entry.username === username)).toBe(true);

    const oidc = await provisioning.sandboxTestLogin(username);
    expect(oidc.testOnly).toBe(true);
    let walletIdentity;
    try {
      walletIdentity = await provisioning.getWalletIdentity(oidc.accessToken);
    } catch (reason) {
      const claims = decodeJwt(oidc.accessToken);
      const problem =
        reason instanceof WalletProvisioningProblemError ? reason : undefined;
      throw new Error(
        [
          "Portal rejected the sandbox OIDC access token before holder binding.",
          `status=${problem?.status ?? "unknown"}`,
          `code=${problem?.code ?? "unknown"}`,
          `correlationId=${problem?.correlationId ?? "missing"}`,
          `sub=${typeof claims.sub === "string" && claims.sub ? "present" : "missing"}`,
          `iss=${String(claims.iss ?? "missing")}`,
          `azp=${String(claims.azp ?? "missing")}`,
        ].join(" "),
      );
    }
    expect(walletIdentity).toMatchObject({
      linked: true,
      username,
      portalSession: false,
      walletExchangeAppId: appId,
    });
    let status = await provisioning.getProvisioningStatus(oidc.accessToken);
    if (!status.ready) {
      expect(status.nextAction).toBe("complete_holder_binding");
      status = await provisioning.bindHolder({
        oidcAccessToken: oidc.accessToken,
        consentRef: `wallet-consent:live-e2e:${username}`,
      });
    }
    expect(status).toMatchObject({
      identityLinked: true,
      ready: true,
      holder: { holderDid: holder.did, bound: true },
      nextAction: "create_exchange_session",
    });

    const contracts = await loadWalletExchangeContracts({
      portalBaseUrl,
      runtimeEnvironment: "sandbox",
      walletVersion: "0.1.0",
    });
    let syncResponseMeta:
      | { status: number; correlationId?: string; requestId?: string }
      | undefined;
    const trackingFetch: typeof fetch = async (request, init) => {
      const response = await fetch(request, init);
      if (
        String(request) === contracts.discovery.endpoints.credentialSync
      ) {
        syncResponseMeta = {
          status: response.status,
          correlationId:
            response.headers.get("x-correlation-id") ?? undefined,
          requestId: response.headers.get("x-request-id") ?? undefined,
        };
      }
      return response;
    };
    const exchange = new WalletExchangeV2Client({
      contracts,
      identity: holder,
      appId,
      requestedScopes: [
        "credentials:read",
        "credentials:request",
        "credentials:present",
        "documents:read",
        "documents:write",
      ],
      fetchImpl: trackingFetch,
    });
    const session = await exchange.createSession();
    expect(session).toMatchObject({
      tokenType: "DPoP",
      holderDid: holder.did,
      publicJwkThumbprint: holder.publicJwkThumbprint,
    });

    const page = await exchange.syncCredentials({ limit: 100 });
    expect(page.schema).toBe("trustcare.wallet.sync.v2");
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.changes.length).toBeGreaterThan(0);
    console.info(
      `Live Portal sync returned ${page.changes.length} credential changes for ${username}.`,
      syncResponseMeta,
    );
    const issuers = await resolveAllPortalHospitalIssuers({ portalBaseUrl });
    let rendered = 0;
    const rejectedTypes: string[] = [];
    for (const change of page.changes) {
      if (change.type === "credential.upsert") {
        expect(change.credential).toMatchObject({
          holderDid: holder.did,
          sourceSystem: "trustcare_portal",
          deliveryState: "signed",
          proof: { type: "jwt" },
        });
        const prepared = await prepareWalletExchangeCredential({
          change,
          portalBaseUrl,
          holderDid: holder.did,
          requiredRenderBlocks:
            contracts.renderContract.payload.requiredBlocks,
          resolvedIssuer: issuers.find(
            (issuer) => issuer.issuerDid === change.credential.issuerDid,
          ),
        });
        if (!prepared.document) {
          const subject = record(change.credential.credentialData?.credentialSubject);
          const data = record(subject.data);
          const humanDocument = record(data.humanDocument);
          const renderData = record(humanDocument.renderData);
          const issuer = issuers.find(
            (candidate) => candidate.issuerDid === change.credential.issuerDid,
          );
          const verification =
            issuer &&
            change.credential.proof?.jwt &&
            change.credential.credentialData
              ? await verifyPortalHospitalCredentialJwt({
                  jwt: change.credential.proof.jwt,
                  issuer,
                  expectedHolderDid: holder.did,
                  expectedCredentialData: change.credential.credentialData,
                })
              : undefined;
          console.info("Live credential rejected before rendering", {
            cardType: change.credential.cardType,
            credentialType: change.credential.credentialType,
            signedTypes: Array.isArray(change.credential.credentialData?.type)
              ? change.credential.credentialData.type
              : [],
            signedDocumentType: subject.documentType,
            verificationErrors: verification?.errors ?? ["issuer_or_proof_missing"],
            contentHashValid: await verifyWalletExchangeContentHash(change),
            proofVerified: prepared.issuerEvidence?.proofVerified ?? false,
            issuerActive: prepared.issuerEvidence?.issuerActive ?? false,
            hasCanonicalHumanDocument: Object.keys(humanDocument).length > 0,
            renderBlocks: Object.keys(
              Object.keys(renderData).length > 0 ? renderData : humanDocument,
            ).sort(),
          });
          rejectedTypes.push(change.credential.cardType);
          continue;
        }
        const card = walletCardForDocumentRendering(prepared.document);
        const model = credentialRenderModelFromCard(card);
        expect(model.documentType).toBe(change.credential.cardType);
        expect(model.paper.title.th || model.paper.title.en).toBeTruthy();
        rendered += 1;
      }
    }
    expect(rendered).toBeGreaterThan(0);
    expect(rejectedTypes.every((type) => type === "shl_manifest")).toBe(true);
    console.info(
      `Verified, normalized, and rendered ${rendered} live Portal credentials for ${username}; quarantined ${rejectedTypes.length} unsupported trust artifacts.`,
    );
  }, 120_000);
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
