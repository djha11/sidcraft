import { createDatabase, indiaRegions, lokSabhaConstituencies } from "./index.js";
import { ECI_ATLAS_SOURCE, RAJYA_SABHA_SOURCE, indiaRegionsSeed, lokSabhaConstituenciesSeed } from "./india.js";

const url = process.env.DATABASE_URL ?? "postgresql://pulse:pulse@localhost:5432/pulse";
const database = createDatabase(url);
const checkedAt = new Date("2026-08-26T00:00:00.000Z");
try {
  await database.db.insert(indiaRegions).values(indiaRegionsSeed.map((region) => ({ ...region, sourceUrl: RAJYA_SABHA_SOURCE, sourceCheckedAt: checkedAt }))).onConflictDoUpdate({ target: indiaRegions.code, set: { sourceCheckedAt: checkedAt } });
  for (let offset = 0; offset < lokSabhaConstituenciesSeed.length; offset += 100) {
    const batch = lokSabhaConstituenciesSeed.slice(offset, offset + 100).map((row) => ({ code: row.code, stateCode: row.stateCode, number: row.number, name: row.name, reservation: row.reservation, sourceUrl: ECI_ATLAS_SOURCE, validFrom: new Date("2024-03-16T00:00:00.000Z") }));
    await database.db.insert(lokSabhaConstituencies).values(batch).onConflictDoUpdate({ target: lokSabhaConstituencies.code, set: { sourceUrl: ECI_ATLAS_SOURCE } });
  }
  console.info(`Seeded ${indiaRegionsSeed.length} regions and ${lokSabhaConstituenciesSeed.length} Lok Sabha constituencies.`);
} finally { await database.close(); }
