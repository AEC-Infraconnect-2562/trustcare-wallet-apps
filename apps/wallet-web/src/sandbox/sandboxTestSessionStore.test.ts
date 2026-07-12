import { describe, expect, it } from "vitest";
import {
  SandboxTestSessionStore,
  type SandboxTestSessionSnapshot,
} from "./sandboxTestSessionStore";

const initialSnapshot: SandboxTestSessionSnapshot = {
  route: "home",
  documentCount: 2,
  storedObjectCount: 2,
  presentationCount: 0,
  shlCount: 0,
  credentialRequestCount: 0,
  pendingSubmissionCount: 0,
  walletExchangeState: "ready",
};

describe("SandboxTestSessionStore", () => {
  it("resumes active state and preserves snapshots across store instances", () => {
    const storage = memoryStorage();
    let tick = 0;
    const now = () => `2026-07-12T00:00:0${tick++}.000Z`;
    const first = new SandboxTestSessionStore(storage, now, () => "session-1");
    const started = first.resumeOrStart({
      userId: "demo-patient-004",
      portalFixtureOpenId: "demo-patient-004",
      dataState: "partial",
      functionScopes: ["prepare", "credential_request"],
      snapshot: initialSnapshot,
    });
    first.update(started.id, {
      ...initialSnapshot,
      route: "prepare",
      credentialRequestCount: 1,
    });

    const reloaded = new SandboxTestSessionStore(
      storage,
      now,
      () => "must-not-create",
    ).resumeOrStart({
      userId: "demo-patient-004",
      portalFixtureOpenId: "demo-patient-004",
      dataState: "partial",
      functionScopes: ["prepare", "credential_request"],
      snapshot: {
        ...initialSnapshot,
        route: "prepare",
        credentialRequestCount: 1,
      },
    });

    expect(reloaded.id).toBe("session-1");
    expect(reloaded.snapshot).toMatchObject({
      route: "prepare",
      credentialRequestCount: 1,
    });
  });

  it("ends the prior user session and never stores credentials or tokens", () => {
    const storage = memoryStorage();
    let id = 0;
    const store = new SandboxTestSessionStore(
      storage,
      () => "2026-07-12T00:00:00.000Z",
      () => `session-${++id}`,
    );
    store.resumeOrStart({
      userId: "demo-patient-004",
      dataState: "partial",
      functionScopes: ["prepare"],
      snapshot: initialSnapshot,
    });
    store.resumeOrStart({
      userId: "demo-patient-006",
      dataState: "partial",
      functionScopes: ["payer_orchestration"],
      snapshot: initialSnapshot,
    });

    expect(store.list().map((session) => session.status)).toEqual([
      "active",
      "ended",
    ]);
    const serialized = storage.getItem(
      "trustcare-wallet-sandbox-test-sessions:v1",
    );
    expect(serialized).not.toMatch(
      /accessToken|refreshToken|privateKey|password/,
    );
  });
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
