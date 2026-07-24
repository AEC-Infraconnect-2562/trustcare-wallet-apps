import { expect, test, type Page } from "@playwright/test";

const identityByProject = {
  "desktop-chromium": "demo-patient-001",
  "mobile-chromium": "demo-patient-002",
} as const;

test("Portal sync keeps one patient avatar and consent-gates SHL association", async ({
  page,
}, testInfo) => {
  const walletUserId =
    identityByProject[
      testInfo.project.name as keyof typeof identityByProject
    ] ?? "demo-patient-001";
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/");
  await expect(page).toHaveTitle(/TrustCare Wallet/i);

  const login = page.getByTestId(`login-user-${walletUserId}`);
  await expect(login).toBeVisible();
  await login.click();
  await expect(page.getByTestId("clinical-home")).toBeVisible();

  await completeHolderBindingWhenRequired(page);
  const sync = page.getByTestId("home-portal-sync");
  await expect(sync).toBeEnabled();
  await sync.click();
  await expect(page.getByText(/TrustCare Portal update completed/)).toBeVisible();

  const syncEvidence = await readWalletExchangeEvidence(page);
  console.info("Wallet Exchange browser evidence", syncEvidence);
  expect(syncEvidence.documentCount).toBeGreaterThan(0);
  expect(syncEvidence.documentTypes).toContain("patient_identity");
  expect(syncEvidence.avatarStatus).toBe("ready");

  const homeAvatar = page.locator(
    `[data-testid="user-avatar-${walletUserId}"] img.loaded`,
  );
  await expect(homeAvatar).not.toHaveCount(0);
  const avatarSources = await homeAvatar.evaluateAll((images) =>
    images.map((image) => {
      const element = image as HTMLImageElement;
      return {
        src: element.currentSrc,
        naturalWidth: element.naturalWidth,
        naturalHeight: element.naturalHeight,
      };
    }),
  );
  expect(new Set(avatarSources.map((avatar) => avatar.src)).size).toBe(1);
  expect(
    avatarSources.every(
      (avatar) => avatar.naturalWidth > 0 && avatar.naturalHeight > 0,
    ),
  ).toBe(true);

  const navigation =
    testInfo.project.name === "desktop-chromium"
      ? page.locator(".side-nav")
      : page.locator(".bottom-nav");
  await navigation.getByTestId("nav-documents").click();
  const identityRecord = page.locator(
    `.record-v2-row[data-credential-id="urn:trustcare:seed:vc:tcc:${walletUserId.replace("demo-patient-", "p")}:patient_identity"]`,
  );
  await expect(identityRecord).toHaveCount(1);
  await identityRecord.click();
  await expect(page.locator(".record-v2-detail")).toBeVisible();
  const renderedPortrait = page.locator(
    ".record-v2-document-preview .tc-patient-photo img",
  );
  await expect(renderedPortrait).toBeVisible();
  const renderedPortraitSource = await renderedPortrait.getAttribute("src");
  expect(renderedPortraitSource).toBeTruthy();
  expect(await imageSha256(page, renderedPortraitSource!)).toBe(
    await imageSha256(page, avatarSources[0]!.src),
  );

  if (testInfo.project.name !== "desktop-chromium") return;

  await page.getByRole("button", { name: "กลับไปเอกสาร" }).click();
  const shlRecord = page.locator(
    '.record-v2-row[data-credential-id="urn:trustcare:seed:vc:shl_manifest:tcc:vp-opd-checkin:p001"]',
  );
  await expect(shlRecord).toHaveCount(1);
  await shlRecord.click();

  const association = page.getByTestId("shl-holder-association");
  await expect(association).toBeVisible();
  const confirm = association.getByRole("button", {
    name: "ลงนามและยืนยันลิงก์",
  });
  await expect(confirm).toBeDisabled();
  await association
    .getByLabel("ฉันยืนยันการผูกลิงก์นี้กับ Wallet ของฉัน")
    .check();
  await expect(confirm).toBeEnabled();

  await confirm.click();
  await expect(
    association.getByText(
      "ผูก Holder VP แล้ว ลิงก์นี้ได้รับการยืนยันจากโรงพยาบาล",
    ),
  ).toBeVisible();
});

async function completeHolderBindingWhenRequired(page: Page) {
  const binding = page.getByTestId("portal-holder-binding");
  if ((await binding.count()) === 0) return;
  await binding.click();
  await expect(page.getByText("ผูก holder DID สำเร็จ")).toBeVisible();
}

async function imageSha256(page: Page, source: string) {
  return page.evaluate(async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Image fetch failed with HTTP ${response.status}.`);
    }
    const digest = await crypto.subtle.digest("SHA-256", await response.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }, source);
}

async function readWalletExchangeEvidence(page: Page) {
  return page.evaluate(async () => {
    const databaseNames = (await indexedDB.databases())
      .map((database) => database.name)
      .filter(
        (name): name is string =>
          typeof name === "string" &&
          name.startsWith("trustcare-wallet-exchange::"),
      );
    if (databaseNames.length !== 1) {
      throw new Error(
        `Expected one Wallet Exchange database, found ${databaseNames.length}.`,
      );
    }
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseNames[0]!);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const readStore = <Value>(storeName: string) =>
      new Promise<Value[]>((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result as Value[]);
        request.onerror = () => reject(request.error);
      });
    const stateRecords = await readStore<{
      value: {
        documents: Array<{ documentType: string }>;
        lineages: unknown[];
        quarantine: Array<{
          reason: string;
          credentialId: string;
          lineageKey?: string;
          contentHash?: string;
          detail: string;
        }>;
      };
    }>("exchange_state");
    const avatarRecords = await readStore<{
      value: { status: string; sourceUrl?: string; errorCode?: string };
    }>("avatar_current");
    database.close();
    const state = stateRecords[0]?.value;
    const avatar = avatarRecords[0]?.value;
    const identity = state?.documents.find(
      (document) => document.documentType === "patient_identity",
    ) as
      | {
          content?: { credentialPayload?: Record<string, unknown> };
        }
      | undefined;
    const subject = identity?.content?.credentialPayload?.credentialSubject as
      | Record<string, unknown>
      | undefined;
    const data = subject?.data as Record<string, unknown> | undefined;
    const humanDocument = data?.humanDocument as
      | Record<string, unknown>
      | undefined;
    const renderData = humanDocument?.renderData as
      | Record<string, unknown>
      | undefined;
    const signedPatient = (renderData?.patient ?? humanDocument?.patient) as
      | Record<string, unknown>
      | undefined;
    const scenarioManifest = state?.documents.find(
      (document) =>
        document.documentType === "shl_manifest" &&
        document.credential?.credentialId?.includes(":vp-"),
    ) as
      | { content?: { credentialPayload?: Record<string, unknown> } }
      | undefined;
    const manifestSubject = scenarioManifest?.content?.credentialPayload
      ?.credentialSubject as Record<string, unknown> | undefined;
    const manifestClaims = manifestSubject?.data as
      | Record<string, unknown>
      | undefined;
    return {
      documentCount: state?.documents.length ?? 0,
      documentTypes:
        state?.documents.map((document) => document.documentType).sort() ?? [],
      lineageCount: state?.lineages.length ?? 0,
      quarantineReasons:
        state?.quarantine.map((entry) => entry.reason).sort() ?? [],
      quarantineEvidence:
        state?.quarantine.map((entry) => ({
          reason: entry.reason,
          credentialId: entry.credentialId,
          lineageKey: entry.lineageKey,
          contentHash: entry.contentHash,
          detail: entry.detail,
        })) ?? [],
      avatarStatus: avatar?.status ?? "missing",
      avatarSourceUrl: avatar?.sourceUrl,
      avatarErrorCode: avatar?.errorCode,
      signedPortraitUrl:
        signedPatient?.photoUrl ??
        signedPatient?.portraitUrl ??
        signedPatient?.avatarUrl,
      humanDocumentKeys: Object.keys(humanDocument ?? {}).sort(),
      shlBinding: manifestClaims
        ? {
            smartHealthLinkId: manifestClaims.smartHealthLinkId,
            context: manifestClaims.context,
            purpose: manifestClaims.purpose,
            manifestHash: manifestClaims.manifestHash,
            sourceBundleHash: manifestClaims.sourceBundleHash,
            manifestUrl: manifestClaims.manifestUrl,
          }
        : null,
    };
  });
}
