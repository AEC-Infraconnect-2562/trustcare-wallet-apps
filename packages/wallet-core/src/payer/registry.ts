import type { PayerAdapter, PayerAdapterRegistry } from "./adapters/base";
import {
  createMockPayerAdapter,
  mockPayerProfiles,
} from "./adapters/mockPayerAdapter";
import type { PayerProfile } from "./types";

export class StaticPayerAdapterRegistry implements PayerAdapterRegistry {
  private readonly adapters: Map<string, PayerAdapter>;

  constructor(adapters: PayerAdapter[]) {
    this.adapters = new Map(
      adapters.map((adapter) => [adapter.profile.payerId, adapter]),
    );
  }

  listProfiles(): PayerProfile[] {
    return Array.from(this.adapters.values()).map((adapter) => adapter.profile);
  }

  getAdapter(payerId: string): PayerAdapter | null {
    return this.adapters.get(payerId) ?? null;
  }
}

export function createMockPayerRegistry(): PayerAdapterRegistry {
  return new StaticPayerAdapterRegistry(
    mockPayerProfiles.map(createMockPayerAdapter),
  );
}

export function listMockPayerProfiles(): PayerProfile[] {
  return createMockPayerRegistry().listProfiles();
}

export function getMockPayerAdapter(payerId: string): PayerAdapter | null {
  return createMockPayerRegistry().getAdapter(payerId);
}
