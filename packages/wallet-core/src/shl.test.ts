import { describe, expect, it } from "vitest";
import {
  createDemoShlKey,
  createShlLinkPayload,
  decryptShlCompactJwe,
  fetchShlManifest,
} from "./shl";

describe("SMART Health Links manifest decryption", () => {
  it("decrypts embedded compact JWE files with the SHL content key", async () => {
    const key = createDemoShlKey("embedded-file");
    const payload = fhirBundle("embedded-file-1");
    const jwe = await encryptCompactJwe(payload, key);
    const manifest = {
      resourceType: "TrustCareShlManifest",
      files: [
        {
          id: "embedded-file-1",
          contentType: "application/fhir+json",
          embedded: jwe,
        },
      ],
    };

    const result = await fetchShlManifest(
      createShlLinkPayload({
        url: "https://gateway.example/shl/manifest",
        key,
      }),
      { fetcher: jsonManifestFetcher(manifest) },
    );

    expect(result.ok).toBe(true);
    expect(result.fileCount).toBe(1);
    expect(result.decryptedFileCount).toBe(1);
    expect(result.resolvedFiles[0]).toMatchObject({
      id: "embedded-file-1",
      source: "embedded",
      encrypted: true,
      ok: true,
      payload,
    });
  });

  it("fetches and decrypts location-based compact JWE files", async () => {
    const key = createDemoShlKey("location-file");
    const payload = fhirBundle("location-file-1");
    const jwe = await encryptCompactJwe(payload, key);
    const manifest = {
      resourceType: "TrustCareShlManifest",
      files: [
        {
          id: "location-file-1",
          contentType: "application/fhir+json",
          location: "https://gateway.example/shl/files/location-file-1.jwe",
        },
      ],
    };
    const fetcher: typeof fetch = async (url, init) => {
      const requestUrl = String(url);
      if (requestUrl.endsWith("/manifest")) {
        return jsonResponse(manifest);
      }
      expect(init?.method).toBe("GET");
      expect(requestUrl).toBe(
        "https://gateway.example/shl/files/location-file-1.jwe",
      );
      return textResponse(jwe, "application/jose");
    };

    const result = await fetchShlManifest(
      createShlLinkPayload({
        url: "https://gateway.example/shl/manifest",
        key,
      }),
      { fetcher },
    );

    expect(result.ok).toBe(true);
    expect(result.decryptedFileCount).toBe(1);
    expect(result.resolvedFiles[0]).toMatchObject({
      source: "location",
      encrypted: true,
      ok: true,
      payload,
    });
  });

  it("sends passcode-protected manifest requests through POST", async () => {
    const manifest = {
      resourceType: "TrustCareShlManifest",
      files: [
        {
          id: "plain-file-1",
          embedded: fhirBundle("plain-file-1"),
        },
      ],
    };
    const seenBodies: unknown[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      expect(init?.method).toBe("POST");
      seenBodies.push(JSON.parse(String(init?.body)));
      return jsonResponse(manifest);
    };

    const result = await fetchShlManifest(
      createShlLinkPayload({
        url: "https://gateway.example/shl/manifest",
        passcodeRequired: true,
      }),
      { fetcher, passcode: "246810", recipient: "Unit verifier" },
    );

    expect(result.ok).toBe(true);
    expect(result.requestMethod).toBe("POST");
    expect(seenBodies).toEqual([
      { recipient: "Unit verifier", passcode: "246810" },
    ]);
    expect(result.resolvedFiles[0]?.encrypted).toBe(false);
  });

  it("preserves existing unencrypted embedded manifest files", async () => {
    const payload = fhirBundle("plain-file-1");
    const result = await fetchShlManifest(
      createShlLinkPayload({
        url: "https://gateway.example/shl/manifest",
      }),
      {
        fetcher: jsonManifestFetcher({
          resourceType: "TrustCareShlManifest",
          files: [{ id: "plain-file-1", embedded: payload }],
        }),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.decryptedFileCount).toBe(0);
    expect(result.resolvedFiles[0]).toMatchObject({
      encrypted: false,
      ok: true,
      payload,
    });
  });

  it("rejects encrypted embedded files when the SHL key is missing", async () => {
    const jwe = await encryptCompactJwe(
      fhirBundle("missing-key-file"),
      createDemoShlKey("missing-key-file"),
    );

    const result = await fetchShlManifest(
      createShlLinkPayload({
        url: "https://gateway.example/shl/manifest",
      }),
      {
        fetcher: jsonManifestFetcher({
          resourceType: "TrustCareShlManifest",
          files: [{ id: "missing-key-file", embedded: jwe }],
        }),
      },
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("requires a content key");
  });

  it("decrypts compact JWE directly for lower-level contract tests", async () => {
    const key = createDemoShlKey("direct");
    const payload = fhirBundle("direct-file");
    const jwe = await encryptCompactJwe(payload, key);

    await expect(decryptShlCompactJwe(jwe, key)).resolves.toEqual(payload);
  });
});

function fhirBundle(id: string) {
  return {
    resourceType: "Bundle",
    id,
    type: "document",
    entry: [
      {
        fullUrl: `urn:trustcare:test:${id}`,
        resource: { resourceType: "DocumentReference", id },
      },
    ],
  };
}

function jsonManifestFetcher(manifest: Record<string, unknown>): typeof fetch {
  return async () => jsonResponse(manifest);
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(value: string, contentType: string): Response {
  return new Response(value, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

async function encryptCompactJwe(
  payload: unknown,
  key: string,
): Promise<string> {
  const protectedHeader = base64Url(
    JSON.stringify({ alg: "dir", enc: "A256GCM" }),
  );
  const keyBytes = base64UrlToBytes(key);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(
          new TextEncoder().encode(protectedHeader),
        ),
        tagLength: 128,
      },
      cryptoKey,
      toArrayBuffer(new TextEncoder().encode(JSON.stringify(payload))),
    ),
  );
  const ciphertext = encrypted.slice(0, -16);
  const tag = encrypted.slice(-16);
  return [
    protectedHeader,
    "",
    base64UrlBytes(iv),
    base64UrlBytes(ciphertext),
    base64UrlBytes(tag),
  ].join(".");
}

function base64Url(value: string): string {
  return base64UrlBytes(new TextEncoder().encode(value));
}

function base64UrlBytes(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
