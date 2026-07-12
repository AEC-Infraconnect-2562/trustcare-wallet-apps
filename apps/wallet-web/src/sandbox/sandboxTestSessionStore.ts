import type {
  WalletTestDataState,
  WalletTestFunctionScope,
} from "@trustcare/wallet-core";

export const SANDBOX_TEST_SESSION_SCHEMA =
  "trustcare.wallet.sandbox-test-session.v1" as const;
const storageKey = "trustcare-wallet-sandbox-test-sessions:v1";
const maxSessions = 100;

export type SandboxTestSessionSnapshot = {
  route: string;
  documentCount: number;
  storedObjectCount: number;
  presentationCount: number;
  shlCount: number;
  credentialRequestCount: number;
  pendingSubmissionCount: number;
  walletExchangeState:
    "initializing" | "ready" | "syncing" | "error" | "not_started";
  lastError?: string;
};

export type SandboxTestSession = {
  schema: typeof SANDBOX_TEST_SESSION_SCHEMA;
  id: string;
  userId: string;
  portalFixtureOpenId?: string;
  portalRole: "patient";
  dataScope: "holder_only";
  dataState: WalletTestDataState;
  functionScopes: WalletTestFunctionScope[];
  status: "active" | "ended";
  startedAt: string;
  lastActiveAt: string;
  endedAt?: string;
  snapshot: SandboxTestSessionSnapshot;
};

export type SandboxTestSessionStorage = Pick<Storage, "getItem" | "setItem">;

export class SandboxTestSessionStore {
  constructor(
    private readonly storage: SandboxTestSessionStorage,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createId: () => string = createSessionId,
  ) {}

  list(userId?: string): SandboxTestSession[] {
    return this.read()
      .filter((session) => !userId || session.userId === userId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  resumeOrStart(input: {
    userId: string;
    portalFixtureOpenId?: string;
    dataState: WalletTestDataState;
    functionScopes: readonly WalletTestFunctionScope[];
    snapshot: SandboxTestSessionSnapshot;
  }): SandboxTestSession {
    const sessions = this.read();
    const active = sessions.find(
      (session) =>
        session.status === "active" && session.userId === input.userId,
    );
    const now = this.now();
    if (active) {
      const resumed = {
        ...active,
        lastActiveAt: now,
        snapshot: clone(input.snapshot),
      };
      this.write(replaceSession(sessions, resumed));
      return clone(resumed);
    }
    const ended = sessions.map((session) =>
      session.status === "active"
        ? {
            ...session,
            status: "ended" as const,
            endedAt: now,
            lastActiveAt: now,
          }
        : session,
    );
    const created: SandboxTestSession = {
      schema: SANDBOX_TEST_SESSION_SCHEMA,
      id: this.createId(),
      userId: input.userId,
      portalFixtureOpenId: input.portalFixtureOpenId,
      portalRole: "patient",
      dataScope: "holder_only",
      dataState: input.dataState,
      functionScopes: [...input.functionScopes],
      status: "active",
      startedAt: now,
      lastActiveAt: now,
      snapshot: clone(input.snapshot),
    };
    this.write([created, ...ended]);
    return clone(created);
  }

  update(
    sessionId: string,
    snapshot: SandboxTestSessionSnapshot,
  ): SandboxTestSession | null {
    const sessions = this.read();
    const current = sessions.find((session) => session.id === sessionId);
    if (!current || current.status !== "active") return null;
    const updated = {
      ...current,
      lastActiveAt: this.now(),
      snapshot: clone(snapshot),
    };
    this.write(replaceSession(sessions, updated));
    return clone(updated);
  }

  end(sessionId: string): SandboxTestSession | null {
    const sessions = this.read();
    const current = sessions.find((session) => session.id === sessionId);
    if (!current || current.status === "ended")
      return current ? clone(current) : null;
    const now = this.now();
    const ended = {
      ...current,
      status: "ended" as const,
      endedAt: now,
      lastActiveAt: now,
    };
    this.write(replaceSession(sessions, ended));
    return clone(ended);
  }

  private read(): SandboxTestSession[] {
    const raw = this.storage.getItem(storageKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isSandboxTestSession).map(clone);
    } catch {
      return [];
    }
  }

  private write(sessions: SandboxTestSession[]): void {
    this.storage.setItem(
      storageKey,
      JSON.stringify(sessions.slice(0, maxSessions)),
    );
  }
}

function replaceSession(
  sessions: SandboxTestSession[],
  replacement: SandboxTestSession,
): SandboxTestSession[] {
  return sessions.map((session) =>
    session.id === replacement.id ? replacement : session,
  );
}

function isSandboxTestSession(value: unknown): value is SandboxTestSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schema === SANDBOX_TEST_SESSION_SCHEMA &&
    typeof record.id === "string" &&
    typeof record.userId === "string" &&
    record.portalRole === "patient" &&
    record.dataScope === "holder_only" &&
    (record.status === "active" || record.status === "ended") &&
    typeof record.startedAt === "string" &&
    typeof record.lastActiveAt === "string" &&
    Boolean(record.snapshot) &&
    typeof record.snapshot === "object"
  );
}

function createSessionId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Web Crypto randomUUID is required for sandbox sessions.");
  }
  return `test-session:${globalThis.crypto.randomUUID()}`;
}

function clone<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}
