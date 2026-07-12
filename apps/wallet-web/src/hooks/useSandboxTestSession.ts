import { useEffect, useMemo, useRef, useState } from "react";
import type { WalletTestUserProfile } from "@trustcare/wallet-core";
import {
  SandboxTestSessionStore,
  type SandboxTestSession,
  type SandboxTestSessionSnapshot,
} from "../sandbox/sandboxTestSessionStore";

export function useSandboxTestSession(input: {
  enabled: boolean;
  authenticated: boolean;
  userId: string;
  profile?: WalletTestUserProfile;
  snapshot: SandboxTestSessionSnapshot;
}) {
  const store = useMemo(
    () =>
      input.enabled && typeof localStorage !== "undefined"
        ? new SandboxTestSessionStore(localStorage)
        : null,
    [input.enabled],
  );
  const activeRef = useRef<SandboxTestSession | null>(null);
  const latestSnapshot = useRef(input.snapshot);
  latestSnapshot.current = input.snapshot;
  const [activeSession, setActiveSession] = useState<SandboxTestSession | null>(
    null,
  );
  const [sessions, setSessions] = useState<SandboxTestSession[]>([]);

  useEffect(() => {
    if (!store || !input.profile) {
      activeRef.current = null;
      setActiveSession(null);
      setSessions([]);
      return;
    }
    if (!input.authenticated) {
      if (activeRef.current) store.end(activeRef.current.id);
      activeRef.current = null;
      setActiveSession(null);
      setSessions(store.list(input.userId));
      return;
    }
    if (activeRef.current?.userId !== input.userId) {
      if (activeRef.current) store.end(activeRef.current.id);
      activeRef.current = store.resumeOrStart({
        userId: input.userId,
        portalFixtureOpenId: input.profile.portalFixtureOpenId,
        dataState: input.profile.initialState,
        functionScopes: input.profile.functionScopes,
        snapshot: latestSnapshot.current,
      });
    }
    setActiveSession(activeRef.current);
    setSessions(store.list(input.userId));
  }, [input.authenticated, input.profile, input.userId, store]);

  useEffect(() => {
    if (!store || !activeRef.current || !input.authenticated) return;
    const updated = store.update(activeRef.current.id, input.snapshot);
    if (!updated) return;
    activeRef.current = updated;
    setActiveSession(updated);
    setSessions(store.list(input.userId));
  }, [input.authenticated, input.snapshot, input.userId, store]);

  return { activeSession, sessions };
}
