import type { Provider, ProviderInfo } from "./types.js";

export class ProviderRegistry {
  private providers = new Map<string, Provider>();

  register(provider: Provider): this {
    this.providers.set(provider.id, provider);
    return this;
  }

  get(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  list(): Provider[] {
    return [...this.providers.values()];
  }
}

/** The public, serializable description of a provider (no methods). */
export function providerInfo(p: Provider): ProviderInfo {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    homepage: p.homepage,
    connectInstructions: p.connectInstructions,
    credentialFields: p.credentialFields,
  };
}
