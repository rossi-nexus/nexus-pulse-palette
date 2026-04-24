import { brregAdapter } from "./brreg.ts";
import { cvrAdapter } from "./cvr.ts";
import { prhAdapter } from "./prh.ts";
import type { RegistryAdapter } from "./types.ts";

export const ADAPTERS: RegistryAdapter[] = [brregAdapter, cvrAdapter, prhAdapter];

export function getAdapterById(id: string): RegistryAdapter | null {
  return ADAPTERS.find((a) => a.id === id) ?? null;
}

export function getAdapterByCountry(country: string): RegistryAdapter | null {
  const c = country.toLowerCase().trim();
  if (!c) return null;
  return ADAPTERS.find((a) => a.country_codes.includes(c)) ?? null;
}

export { brregAdapter, cvrAdapter, prhAdapter };
export type { RegistryAdapter } from "./types.ts";
