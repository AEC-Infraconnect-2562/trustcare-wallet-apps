import { describe, expect, it } from "vitest";
import type { WalletDocumentRecordV2 } from "@trustcare/wallet-core";
import {
  activeOwnerWalletDocuments,
  type OwnerScopedWalletDocumentsLoad,
} from "./mobileWalletDocumentsPolicy";

describe("activeOwnerWalletDocuments", () => {
  it("never exposes a previous owner's documents during an owner change", () => {
    const previousDocument = {
      id: "owner-a-document",
    } as WalletDocumentRecordV2;
    const previousLoad: OwnerScopedWalletDocumentsLoad = {
      ownerUserId: "owner-a",
      documents: [previousDocument],
      isLoading: false,
      error: null,
    };

    expect(activeOwnerWalletDocuments(previousLoad, "owner-b")).toEqual({
      ownerUserId: "owner-b",
      documents: [],
      isLoading: true,
      error: null,
    });
  });

  it("returns records only for the active owner scope", () => {
    const activeLoad: OwnerScopedWalletDocumentsLoad = {
      ownerUserId: "owner-a",
      documents: [{ id: "owner-a-document" } as WalletDocumentRecordV2],
      isLoading: false,
      error: null,
    };

    expect(activeOwnerWalletDocuments(activeLoad, "owner-a")).toBe(activeLoad);
  });
});
