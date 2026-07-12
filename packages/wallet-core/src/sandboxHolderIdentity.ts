import { importJWK, type CryptoKey, type JWK } from "jose";
import { holderIdentityFromKeyPair, type HolderSigningIdentity } from "./holderIdentity";
import { isWalletTestLoginUser } from "./testUserProfiles";

const sandboxPrivateKeys = {
  "demo-patient-001": { d: "7BIpWfdIyzp9er9DHQ5FU_PECHKOoXmrlFCEB6l9zAU", x: "mPWoMhUtPYg4B7JQX-VIK30Snh-cSAmi3_B9tTyhZrQ" },
  "demo-patient-002": { d: "GCIe_ow8jmY5ghTf1VBMjA1VXu2UzG-ntAC-Y8SNhJs", x: "xjelwa8AH12AAph9drgrHfEhxWqNbH9NBcGOQ7_ZFw8" },
  "demo-patient-003": { d: "dmDjo_upmCRp4qlVvfCFYFqgkkSovot-4j3VyBOQSkQ", x: "L8W6FVSR0xHoSYjYgyQJ0jXMLvhVm0OmND0aha0K-lE" },
  "demo-patient-004": { d: "nMsaqPTluFa1WZZ23XcaeJ4FwYQDtE6I5i_Yyqro0_4", x: "Utaxs55Bc2TtJq0Og8JMH7e3GwV6UeovRmE3kEeXUoM" },
  "demo-patient-005": { d: "OoBiIsqZOHix_ZtKQmG3UJxiHVBdp3re75AM-nWWFzo", x: "leiXNdCNP0xJ1SFGWeOPxoNQF2Aiwm5M1scKA-3bUPU" },
  "demo-patient-006": { d: "iz0QsHoZx52EveGnvV32rgqmLXf3OE86k9ZWfWr_H7I", x: "MQOmrjCIGv6s6gytleIxIe31oCo1ZbA5OogXoupXG-A" },
  "demo-patient-007": { d: "Bbkqfx1QkVmc0bKv_BnRuKT5jiCngF730kq2Hw5K3SQ", x: "ZB9uLFkB5mjrnE1s2Pz_YNH71BKfrmo6wyA8_-chgOs" },
  "demo-patient-008": { d: "pbZDas9v07FJK1Rw2l95DVnwngVPXOov7azhhdVyGjk", x: "grHlxbYn8rzTOGsqZ4PD9GtmVsqYnh1Dz9FH8cCAiZE" },
  "demo-patient-009": { d: "Su0UTvCOd9JfiD8lc5hPxUjSj7ssGdCCKtjctAfk_6w", x: "mHjdNu-Hyy3n5rVVwX9OH7btcjVYHxRglm8I_sy1SbM" },
} as const;

/**
 * Returns a deterministic test-only self-custody identity. The private fixture
 * remains in the Wallet repository; Portal receives only the public JWK. This
 * function must never be used for a non-sandbox runtime or a non-test user.
 */
export async function sandboxHolderIdentityForUser(input: {
  userId: string;
  sandboxRuntime: boolean;
}): Promise<HolderSigningIdentity | undefined> {
  if (!input.sandboxRuntime || !isWalletTestLoginUser(input.userId)) return undefined;
  const key = sandboxPrivateKeys[input.userId as keyof typeof sandboxPrivateKeys];
  if (!key) return undefined;
  const privateJwk: JWK = { kty: "OKP", crv: "Ed25519", d: key.d, x: key.x };
  const publicJwk: JWK = { kty: "OKP", crv: "Ed25519", x: key.x };
  const privateKey = await importJWK(privateJwk, "EdDSA", { extractable: false }) as CryptoKey;
  return holderIdentityFromKeyPair({ privateKey, publicKey: publicJwk, keyAlgorithm: "Ed25519" });
}
