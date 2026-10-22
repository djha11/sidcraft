import { indiaRegionsSeed, lokSabhaConstituenciesSeed } from "@pulse/database/india";
import type { LocationPreference, LocationProfile } from "@pulse/contracts";
import type { AudienceProfile } from "../polls/repository.js";
import type { LocationRepository, SavedLocation } from "./repository.js";

export class GeographyError extends Error { constructor(public readonly code: "REGION_NOT_FOUND" | "CONSTITUENCY_NOT_FOUND" | "CONSTITUENCY_STATE_MISMATCH" | "LOCATION_NOT_SET") { super(code); } }
export class GeographyService {
  constructor(private readonly repository: LocationRepository) {}
  regions() { return indiaRegionsSeed; }
  allConstituencies() { return lokSabhaConstituenciesSeed; }
  constituencies(stateCode: string) { const region = indiaRegionsSeed.find((item) => item.code === stateCode); if (!region) throw new GeographyError("REGION_NOT_FOUND"); return lokSabhaConstituenciesSeed.filter((item) => item.stateCode === stateCode); }
  async save(userId: string, value: LocationPreference) {
    const region = indiaRegionsSeed.find((item) => item.code === value.stateCode); if (!region) throw new GeographyError("REGION_NOT_FOUND");
    if (value.lokSabhaConstituencyCode) { const constituency = lokSabhaConstituenciesSeed.find((item) => item.code === value.lokSabhaConstituencyCode); if (!constituency) throw new GeographyError("CONSTITUENCY_NOT_FOUND"); if (constituency.stateCode !== value.stateCode) throw new GeographyError("CONSTITUENCY_STATE_MISMATCH"); }
    return this.present(await this.repository.save(userId, { stateCode: value.stateCode, lokSabhaConstituencyCode: value.lokSabhaConstituencyCode ?? null, source: value.source }));
  }
  async get(userId: string) { const value = await this.repository.get(userId); if (!value) throw new GeographyError("LOCATION_NOT_SET"); return this.present(value); }
  async audienceFor(userId: string): Promise<AudienceProfile> { const value = await this.repository.get(userId); return { countryCode:"IN", stateCode: value?.stateCode ?? null, lokSabhaConstituencyCode: value?.lokSabhaConstituencyCode ?? null }; }
  private present(value: SavedLocation): LocationProfile { const region = indiaRegionsSeed.find((item) => item.code === value.stateCode); const constituency = lokSabhaConstituenciesSeed.find((item) => item.code === value.lokSabhaConstituencyCode); if (!region) throw new GeographyError("REGION_NOT_FOUND"); return { stateCode: region.code, stateName: region.name, lokSabhaConstituencyCode: constituency?.code ?? null, lokSabhaConstituencyName: constituency?.name ?? null, precision: constituency ? "constituency" : "state", updatedAt: value.updatedAt.toISOString() }; }
}
