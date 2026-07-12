import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryArtifactStore,
  validIsoDateOrNull,
} from "./share-gateway-store.mjs";

const baseArtifact = {
  artifactId: "artifact-1",
  kind: "vp",
  contentType: "application/vp+jwt",
  payload: "signed-vp",
  requestDigest: "digest-1",
  createdAt: "2026-07-12T00:00:00.000Z",
  expiresAt: "2026-07-12T00:10:00.000Z",
};

test("memory store preserves immutable and idempotent artifact semantics", async () => {
  const store = createMemoryArtifactStore();

  const created = await store.set(baseArtifact);
  assert.equal(created.status, "created");
  assert.deepEqual(await store.get("vp", "artifact-1"), baseArtifact);

  const idempotent = await store.set({ ...baseArtifact });
  assert.equal(idempotent.status, "idempotent");

  const conflict = await store.set({
    ...baseArtifact,
    payload: "different-vp",
    requestDigest: "digest-2",
  });
  assert.equal(conflict.status, "conflict");
  assert.equal((await store.get("vp", "artifact-1")).payload, "signed-vp");
});

test("validIsoDateOrNull normalizes only valid timestamps", () => {
  assert.equal(
    validIsoDateOrNull("2026-07-12T08:30:00+07:00"),
    "2026-07-12T01:30:00.000Z",
  );
  assert.equal(validIsoDateOrNull("not-a-date"), null);
  assert.equal(validIsoDateOrNull(undefined), null);
});
