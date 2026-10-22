import rawConstituencies from "./seeds/india-lok-sabha.json" with { type: "json" };

export const ECI_ATLAS_SOURCE = "https://www.eci.gov.in/EBooks/atlas-2024/files/basic-html/page17.html";
export const RAJYA_SABHA_SOURCE = "https://cms.rajyasabha.nic.in/UploadedFiles/ElectronicPublications/Information_AtGlance_2022.pdf";

type RegionSeed = { code: string; name: string; kind: "state" | "union_territory"; rajyaSabhaSeats: number };
const regionSeeds: RegionSeed[] = [
  { code: "AN", name: "Andaman and Nicobar Islands", kind: "union_territory", rajyaSabhaSeats: 0 },
  { code: "AP", name: "Andhra Pradesh", kind: "state", rajyaSabhaSeats: 11 },
  { code: "AR", name: "Arunachal Pradesh", kind: "state", rajyaSabhaSeats: 1 },
  { code: "AS", name: "Assam", kind: "state", rajyaSabhaSeats: 7 },
  { code: "BR", name: "Bihar", kind: "state", rajyaSabhaSeats: 16 },
  { code: "CH", name: "Chandigarh", kind: "union_territory", rajyaSabhaSeats: 0 },
  { code: "CT", name: "Chhattisgarh", kind: "state", rajyaSabhaSeats: 5 },
  { code: "DH", name: "Dadra and Nagar Haveli and Daman and Diu", kind: "union_territory", rajyaSabhaSeats: 0 },
  { code: "DL", name: "NCT of Delhi", kind: "union_territory", rajyaSabhaSeats: 3 },
  { code: "GA", name: "Goa", kind: "state", rajyaSabhaSeats: 1 },
  { code: "GJ", name: "Gujarat", kind: "state", rajyaSabhaSeats: 11 },
  { code: "HR", name: "Haryana", kind: "state", rajyaSabhaSeats: 5 },
  { code: "HP", name: "Himachal Pradesh", kind: "state", rajyaSabhaSeats: 3 },
  { code: "JK", name: "Jammu and Kashmir", kind: "union_territory", rajyaSabhaSeats: 4 },
  { code: "JH", name: "Jharkhand", kind: "state", rajyaSabhaSeats: 6 },
  { code: "KA", name: "Karnataka", kind: "state", rajyaSabhaSeats: 12 },
  { code: "KL", name: "Kerala", kind: "state", rajyaSabhaSeats: 9 },
  { code: "LA", name: "Ladakh", kind: "union_territory", rajyaSabhaSeats: 0 },
  { code: "LD", name: "Lakshadweep", kind: "union_territory", rajyaSabhaSeats: 0 },
  { code: "MP", name: "Madhya Pradesh", kind: "state", rajyaSabhaSeats: 11 },
  { code: "MH", name: "Maharashtra", kind: "state", rajyaSabhaSeats: 19 },
  { code: "MN", name: "Manipur", kind: "state", rajyaSabhaSeats: 1 },
  { code: "ML", name: "Meghalaya", kind: "state", rajyaSabhaSeats: 1 },
  { code: "MZ", name: "Mizoram", kind: "state", rajyaSabhaSeats: 1 },
  { code: "NL", name: "Nagaland", kind: "state", rajyaSabhaSeats: 1 },
  { code: "OR", name: "Odisha", kind: "state", rajyaSabhaSeats: 10 },
  { code: "PY", name: "Puducherry", kind: "union_territory", rajyaSabhaSeats: 1 },
  { code: "PB", name: "Punjab", kind: "state", rajyaSabhaSeats: 7 },
  { code: "RJ", name: "Rajasthan", kind: "state", rajyaSabhaSeats: 10 },
  { code: "SK", name: "Sikkim", kind: "state", rajyaSabhaSeats: 1 },
  { code: "TN", name: "Tamil Nadu", kind: "state", rajyaSabhaSeats: 18 },
  { code: "TG", name: "Telangana", kind: "state", rajyaSabhaSeats: 7 },
  { code: "TR", name: "Tripura", kind: "state", rajyaSabhaSeats: 1 },
  { code: "UP", name: "Uttar Pradesh", kind: "state", rajyaSabhaSeats: 31 },
  { code: "UT", name: "Uttarakhand", kind: "state", rajyaSabhaSeats: 3 },
  { code: "WB", name: "West Bengal", kind: "state", rajyaSabhaSeats: 16 },
];

const raw = rawConstituencies as Array<{ state: string; number: number; name: string; reservation: "GENERAL" | "SC" | "ST" }>;
const regionByName = new Map(regionSeeds.map((region) => [region.name, region]));
export const indiaRegionsSeed = regionSeeds.map((region) => ({
  ...region,
  lokSabhaSeats: raw.filter((row) => row.state === region.name).length,
}));
export const lokSabhaConstituenciesSeed = raw.map((row) => {
  const region = regionByName.get(row.state);
  if (!region) throw new Error(`Unknown India region: ${row.state}`);
  return { ...row, stateCode: region.code, stateName: row.state, code: `IN-${region.code}-PC-${String(row.number).padStart(2, "0")}` };
});

if (lokSabhaConstituenciesSeed.length !== 543) throw new Error("Lok Sabha constituency seed must contain exactly 543 rows");
if (indiaRegionsSeed.reduce((sum, region) => sum + region.rajyaSabhaSeats, 0) !== 233) throw new Error("Rajya Sabha elected-seat allocation must total 233");
