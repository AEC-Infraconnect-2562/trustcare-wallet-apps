import {
  CompactSign,
  base64url,
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importJWK,
  type CompactJWSHeaderParameters,
  type CryptoKey,
  type JWK,
} from "jose";

export type HolderKeyAlgorithm = "Ed25519" | "P-256";
export type HolderJwsAlgorithm = "EdDSA" | "ES256";
export type HolderJwsPurpose = "session" | "dpop" | "vp";

/**
 * Platform key stores may return a non-extractable WebCrypto key or a JWK.
 * The Wallet domain never requires a Portal patient identifier to use either.
 */
export type HolderPrivateKey = CryptoKey | JWK;
export type HolderPublicKey = CryptoKey | JWK;

export type HolderIdentity = {
  keyAlgorithm: HolderKeyAlgorithm;
  jwsAlgorithm: HolderJwsAlgorithm;
  did: string;
  kid: string;
  publicKeyMultibase: string;
  publicJwk: JWK;
  publicJwkThumbprint: string;
};

export type HolderSigningIdentity = HolderIdentity & {
  privateKey: HolderPrivateKey;
};

export type GeneratedHolderIdentity = HolderSigningIdentity & {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
};

export type GenerateHolderIdentityOptions = {
  algorithm?: HolderKeyAlgorithm;
  /**
   * Defaults to false so browser-generated private keys can be persisted as
   * non-extractable CryptoKeys. A mobile key adapter may instead supply a JWK.
   */
  extractable?: boolean;
};

export type HolderCompactJwsInput = {
  identity: HolderSigningIdentity;
  /** Exact bytes are signed. Strings are UTF-8 encoded without JSON changes. */
  payload: Uint8Array | string;
  protectedHeader: CompactJWSHeaderParameters;
};

const keyConfiguration: Record<
  HolderKeyAlgorithm,
  { jwsAlgorithm: HolderJwsAlgorithm; crv?: string }
> = {
  Ed25519: { jwsAlgorithm: "EdDSA", crv: "Ed25519" },
  "P-256": { jwsAlgorithm: "ES256" },
};

const multicodecHeader: Record<HolderKeyAlgorithm, Uint8Array> = {
  // unsigned-varint(0xed), ed25519-pub
  Ed25519: new Uint8Array([0xed, 0x01]),
  // unsigned-varint(0x1200), p256-pub
  "P-256": new Uint8Array([0x80, 0x24]),
};

const BASE58_BTC_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export async function generateHolderIdentity(
  options: GenerateHolderIdentityOptions = {},
): Promise<GeneratedHolderIdentity> {
  const keyAlgorithm = options.algorithm ?? "Ed25519";
  const configuration = keyConfiguration[keyAlgorithm];
  const keyPair = await generateKeyPair(configuration.jwsAlgorithm, {
    crv: configuration.crv,
    extractable: options.extractable ?? false,
  });
  const identity = await holderIdentityFromKeyPair({
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    keyAlgorithm,
  });
  return {
    ...identity,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
  };
}

export async function holderIdentityFromKeyPair(input: {
  privateKey: HolderPrivateKey;
  publicKey: HolderPublicKey;
  keyAlgorithm?: HolderKeyAlgorithm;
}): Promise<HolderSigningIdentity> {
  const identity = await holderIdentityFromPublicKey(input.publicKey);
  if (
    input.keyAlgorithm !== undefined &&
    input.keyAlgorithm !== identity.keyAlgorithm
  ) {
    throw new Error(
      `Holder public key uses ${identity.keyAlgorithm}, not ${input.keyAlgorithm}.`,
    );
  }
  assertPrivateKey(input.privateKey, identity.keyAlgorithm);
  if (isJwk(input.privateKey)) {
    await assertJwkKeyPair(input.privateKey, identity.publicJwk);
  }
  return { ...identity, privateKey: input.privateKey };
}

export async function holderIdentityFromPublicKey(
  publicKey: HolderPublicKey,
): Promise<HolderIdentity> {
  const exported = isJwk(publicKey)
    ? publicKey
    : await exportPublicCryptoKey(publicKey);
  const publicJwk = normalizedPublicJwk(exported);
  const keyAlgorithm = holderKeyAlgorithmFromJwk(publicJwk);
  const jwsAlgorithm = keyConfiguration[keyAlgorithm].jwsAlgorithm;
  const publicKeyMultibase = publicKeyMultibaseFromJwk(publicJwk);
  const did = `did:key:${publicKeyMultibase}`;
  return {
    keyAlgorithm,
    jwsAlgorithm,
    did,
    kid: verificationMethodKidFromDidKey(did),
    publicKeyMultibase,
    // Keep the embedded DPoP JWK minimal and public. Algorithm and key use are
    // carried by the protected header and the holder identity descriptor.
    publicJwk,
    publicJwkThumbprint: await calculateJwkThumbprint(publicJwk, "sha256"),
  };
}

export function didKeyFromPublicJwk(publicJwk: JWK): string {
  return `did:key:${publicKeyMultibaseFromJwk(publicJwk)}`;
}

export function publicKeyMultibaseFromJwk(publicJwk: JWK): string {
  const normalized = normalizedPublicJwk(publicJwk);
  const keyAlgorithm = holderKeyAlgorithmFromJwk(normalized);
  const rawPublicKey = rawPublicKeyBytes(normalized, keyAlgorithm);
  const encoded = base58Encode(
    concatenateBytes(multicodecHeader[keyAlgorithm], rawPublicKey),
  );
  return `z${encoded}`;
}

export function verificationMethodKidFromDidKey(did: string): string {
  const prefix = "did:key:";
  if (!did.startsWith(prefix) || !did.slice(prefix.length).startsWith("z")) {
    throw new Error("Holder DID must be a base58btc did:key identifier.");
  }
  const publicKeyMultibase = did.slice(prefix.length);
  if (publicKeyMultibase.length < 2) {
    throw new Error("Holder did:key identifier has no public key material.");
  }
  return `${did}#${publicKeyMultibase}`;
}

export function holderJwsProtectedHeader(
  identity: HolderIdentity,
  purpose: HolderJwsPurpose,
): CompactJWSHeaderParameters {
  switch (purpose) {
    case "session":
      return {
        alg: identity.jwsAlgorithm,
        typ: "trustcare-wallet-session+jwt",
        kid: identity.kid,
      };
    case "dpop":
      return {
        alg: identity.jwsAlgorithm,
        typ: "dpop+jwt",
        jwk: { ...identity.publicJwk },
      };
    case "vp":
      return {
        alg: identity.jwsAlgorithm,
        typ: "vp+jwt",
        cty: "vp",
        kid: identity.kid,
      };
  }
}

export async function signHolderCompactJws(
  input: HolderCompactJwsInput,
): Promise<string> {
  const protectedHeader = { ...input.protectedHeader };
  if (
    protectedHeader.alg !== undefined &&
    protectedHeader.alg !== input.identity.jwsAlgorithm
  ) {
    throw new Error(
      `Holder JWS header algorithm ${protectedHeader.alg} does not match ${input.identity.jwsAlgorithm}.`,
    );
  }
  protectedHeader.alg = input.identity.jwsAlgorithm;
  if (
    protectedHeader.kid !== undefined &&
    protectedHeader.kid !== input.identity.kid
  ) {
    throw new Error("Holder JWS header kid does not match the holder did:key.");
  }
  if (protectedHeader.jwk !== undefined) {
    if (
      "d" in protectedHeader.jwk &&
      typeof (protectedHeader.jwk as JWK).d === "string"
    ) {
      throw new Error(
        "Holder JWS protected header must not expose a private JWK.",
      );
    }
    const embeddedThumbprint = await calculateJwkThumbprint(
      normalizedPublicJwk(protectedHeader.jwk),
      "sha256",
    );
    if (embeddedThumbprint !== input.identity.publicJwkThumbprint) {
      throw new Error(
        "Holder JWS embedded public JWK does not match the holder did:key.",
      );
    }
  }
  const privateKey = await signingCryptoKey(
    input.identity.privateKey,
    input.identity.keyAlgorithm,
  );
  const payload =
    typeof input.payload === "string"
      ? new TextEncoder().encode(input.payload)
      : input.payload;
  return new CompactSign(payload)
    .setProtectedHeader(protectedHeader)
    .sign(privateKey);
}

export function holderKeyAlgorithmFromJwk(jwk: JWK): HolderKeyAlgorithm {
  if (jwk.kty === "OKP" && jwk.crv === "Ed25519" && typeof jwk.x === "string") {
    return "Ed25519";
  }
  if (
    jwk.kty === "EC" &&
    jwk.crv === "P-256" &&
    typeof jwk.x === "string" &&
    typeof jwk.y === "string"
  ) {
    return "P-256";
  }
  throw new Error("Holder key must be an Ed25519 or P-256 public key.");
}

async function signingCryptoKey(
  privateKey: HolderPrivateKey,
  keyAlgorithm: HolderKeyAlgorithm,
): Promise<CryptoKey> {
  assertPrivateKey(privateKey, keyAlgorithm);
  if (!isJwk(privateKey)) return privateKey;
  const imported = await importJWK(
    {
      ...privateKey,
      alg: keyConfiguration[keyAlgorithm].jwsAlgorithm,
    },
    keyConfiguration[keyAlgorithm].jwsAlgorithm,
    { extractable: false },
  );
  if (imported instanceof Uint8Array) {
    throw new Error("Holder signing key must be asymmetric.");
  }
  return imported;
}

function assertPrivateKey(
  privateKey: HolderPrivateKey,
  keyAlgorithm: HolderKeyAlgorithm,
): void {
  if (isJwk(privateKey)) {
    if (holderKeyAlgorithmFromJwk(privateKey) !== keyAlgorithm) {
      throw new Error("Holder private and public key algorithms do not match.");
    }
    if (typeof privateKey.d !== "string" || !privateKey.d) {
      throw new Error("Holder private JWK has no private key material.");
    }
    if (privateKey.key_ops && !privateKey.key_ops.includes("sign")) {
      throw new Error("Holder private JWK is not permitted to sign.");
    }
    return;
  }
  if (privateKey.type !== "private" || !privateKey.usages.includes("sign")) {
    throw new Error("Holder CryptoKey must be a private signing key.");
  }
  const algorithm = privateKey.algorithm as KeyAlgorithm & {
    namedCurve?: string;
  };
  const matches =
    keyAlgorithm === "Ed25519"
      ? algorithm.name === "Ed25519"
      : algorithm.name === "ECDSA" && algorithm.namedCurve === "P-256";
  if (!matches) {
    throw new Error("Holder private and public key algorithms do not match.");
  }
}

async function assertJwkKeyPair(
  privateJwk: JWK,
  publicJwk: JWK,
): Promise<void> {
  const privatePublicJwk = normalizedPublicJwk(privateJwk);
  const [privateThumbprint, publicThumbprint] = await Promise.all([
    calculateJwkThumbprint(privatePublicJwk, "sha256"),
    calculateJwkThumbprint(publicJwk, "sha256"),
  ]);
  if (privateThumbprint !== publicThumbprint) {
    throw new Error("Holder private JWK does not match the public did:key.");
  }
}

async function exportPublicCryptoKey(publicKey: CryptoKey): Promise<JWK> {
  if (publicKey.type !== "public" || !publicKey.usages.includes("verify")) {
    throw new Error("Holder public CryptoKey must be a verification key.");
  }
  return exportJWK(publicKey);
}

function normalizedPublicJwk(jwk: JWK): JWK {
  const keyAlgorithm = holderKeyAlgorithmFromJwk(jwk);
  if (keyAlgorithm === "Ed25519") {
    return {
      kty: "OKP",
      crv: "Ed25519",
      x: requireBase64UrlCoordinate(jwk.x, 32, "x"),
    };
  }
  return {
    kty: "EC",
    crv: "P-256",
    x: requireBase64UrlCoordinate(jwk.x, 32, "x"),
    y: requireBase64UrlCoordinate(jwk.y, 32, "y"),
  };
}

function rawPublicKeyBytes(
  publicJwk: JWK,
  keyAlgorithm: HolderKeyAlgorithm,
): Uint8Array {
  const x = base64url.decode(String(publicJwk.x));
  if (keyAlgorithm === "Ed25519") return x;
  const y = base64url.decode(String(publicJwk.y));
  const compressedPoint = new Uint8Array(33);
  compressedPoint[0] = (y[y.length - 1] & 1) === 0 ? 0x02 : 0x03;
  compressedPoint.set(x, 1);
  return compressedPoint;
}

function requireBase64UrlCoordinate(
  value: unknown,
  expectedBytes: number,
  name: string,
): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`Holder public JWK is missing ${name}.`);
  }
  let decoded: Uint8Array;
  try {
    decoded = base64url.decode(value);
  } catch {
    throw new Error(`Holder public JWK ${name} is not base64url.`);
  }
  if (decoded.length !== expectedBytes) {
    throw new Error(
      `Holder public JWK ${name} must be ${expectedBytes} bytes.`,
    );
  }
  return value;
}

function isJwk(value: HolderPrivateKey | HolderPublicKey): value is JWK {
  return !(
    typeof value === "object" &&
    value !== null &&
    "algorithm" in value &&
    "usages" in value &&
    "type" in value
  );
}

function concatenateBytes(...values: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    values.reduce((total, value) => total + value.length, 0),
  );
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

function base58Encode(bytes: Uint8Array): string {
  if (!bytes.length) return "";
  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) {
    leadingZeroes += 1;
  }
  const digits: number[] = [];
  for (const byte of bytes.slice(leadingZeroes)) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index] * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  const encoded = digits
    .reverse()
    .map((digit) => BASE58_BTC_ALPHABET[digit])
    .join("");
  return `${"1".repeat(leadingZeroes)}${encoded}`;
}
