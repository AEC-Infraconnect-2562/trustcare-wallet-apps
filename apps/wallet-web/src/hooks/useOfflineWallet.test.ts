import { describe, expect, it } from "vitest";
import { getDemoWalletCards } from "@trustcare/wallet-core";
import { mergeOfflineCardsForOwner } from "./useOfflineWallet";

describe("offline Wallet owner partitions", () => {
  it("replaces only the active holder partition", () => {
    const first = getDemoWalletCards("demo-patient-004");
    const second = getDemoWalletCards("demo-patient-006");

    expect(
      mergeOfflineCardsForOwner(
        "demo-patient-004",
        [...first, ...second],
        [first[0]],
      ),
    ).toEqual([...second, first[0]]);
  });

  it("rejects a cross-holder replacement before writing IndexedDB", () => {
    const first = getDemoWalletCards("demo-patient-004");
    const second = getDemoWalletCards("demo-patient-006");

    expect(() =>
      mergeOfflineCardsForOwner("demo-patient-004", first, second),
    ).toThrow("owner boundary violation");
  });
});
