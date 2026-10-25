import type { Archetype, Locality, Store, Tier } from "./types";

export interface CityInfo {
  name: string;
  state: string;
  prefix: string;
  tier: Tier;
  lat: number;
  lng: number;
  aliases: string[];
  headPin: string; // the city's central pin, used as the "town centre" for estimates
}

// Allowed values from the case brief, plus real city-centre coordinates.
export const CITIES: CityInfo[] = [
  { name: "Bengaluru", state: "Karnataka", prefix: "560", tier: "Tier 1", lat: 12.9716, lng: 77.5946, aliases: ["bangalore", "bengaluru", "blr", "b'lore", "blore", "bengaluru urban", "bangalore urban", "bengalooru", "ಬೆಂಗಳೂರು"], headPin: "560001" },
  { name: "Mysuru", state: "Karnataka", prefix: "570", tier: "Tier 2", lat: 12.2958, lng: 76.6394, aliases: ["mysore", "mysuru", "mysore city", "ಮೈಸೂರು"], headPin: "570001" },
  { name: "Mangaluru", state: "Karnataka", prefix: "575", tier: "Tier 2", lat: 12.9141, lng: 74.856, aliases: ["mangalore", "mangaluru", "mangalooru", "kudla", "ಮಂಗಳೂರು"], headPin: "575001" },
  { name: "Hubballi-Dharwad", state: "Karnataka", prefix: "580", tier: "Tier 2", lat: 15.3647, lng: 75.124, aliases: ["hubballi-dharwad", "hubli-dharwad", "hubballi", "hubli", "dharwad", "hubballi dharwad", "hubli dharwad", "dharwar", "hubli-dharwar", "ಹುಬ್ಬಳ್ಳಿ", "ಧಾರವಾಡ"], headPin: "580020" },
  { name: "Belagavi", state: "Karnataka", prefix: "590", tier: "Tier 2", lat: 15.8497, lng: 74.4977, aliases: ["belagavi", "belgaum", "belgavi", "ಬೆಳಗಾವಿ"], headPin: "590001" },
  { name: "Tumakuru", state: "Karnataka", prefix: "572", tier: "Tier 3", lat: 13.3379, lng: 77.1173, aliases: ["tumakuru", "tumkur", "ತುಮಕೂರು"], headPin: "572101" },
  { name: "Davanagere", state: "Karnataka", prefix: "577", tier: "Tier 3", lat: 14.4644, lng: 75.9218, aliases: ["davanagere", "davangere", "davanagere city", "davengere", "ದಾವಣಗೆರೆ"], headPin: "577001" },
];

export const CITY_BY_NAME = new Map(CITIES.map((c) => [c.name, c]));

export function findCity(raw: string | null | undefined): CityInfo | null {
  if (!raw) return null;
  const k = raw.toLowerCase().replace(/[·.,()]/g, " ").replace(/\s+/g, " ").trim();
  for (const c of CITIES) if (c.aliases.includes(k) || c.name.toLowerCase() === k) return c;
  for (const c of CITIES) if (c.aliases.some((a) => k.includes(a))) return c;
  return null;
}

export function cityForPin(pin: string): CityInfo | null {
  return CITIES.find((c) => pin.startsWith(c.prefix)) ?? null;
}

// Sheet 3 of the template: fixed, all stores open today.
export const EXISTING_STORES: Store[] = [
  { id: "ST-01", city: "Bengaluru", pin: "560001", opened: 2019 },
  { id: "ST-02", city: "Bengaluru", pin: "560034", opened: 2020 },
  { id: "ST-03", city: "Bengaluru", pin: "560038", opened: 2021 },
  { id: "ST-04", city: "Bengaluru", pin: "560066", opened: 2022 },
  { id: "ST-05", city: "Bengaluru", pin: "560076", opened: 2023 },
  { id: "ST-06", city: "Mysuru", pin: "570009", opened: 2021 },
  { id: "ST-07", city: "Mysuru", pin: "570017", opened: 2024 },
  { id: "ST-08", city: "Mangaluru", pin: "575001", opened: 2022 },
  { id: "ST-09", city: "Hubballi-Dharwad", pin: "580020", opened: 2023 },
  { id: "ST-10", city: "Belagavi", pin: "590001", opened: 2024 },
];

// Approximate locality map for well-known pin codes. Coordinates are rough
// centroids (±1 km) — good enough to reason about catchment overlap, and the
// UI labels every distance as approximate. Unmapped pins fall back to the AI
// estimate, then to the city baseline.
type G = [string, string, Archetype, number, number];
const GAZ: G[] = [
  ["560001", "MG Road / CBD", "cbd", 12.975, 77.606],
  ["560002", "Chickpet / City Market", "high-street", 12.965, 77.577],
  ["560003", "Malleshwaram", "high-street", 13.003, 77.57],
  ["560004", "Basavanagudi", "high-street", 12.942, 77.573],
  ["560005", "Frazer Town", "residential", 12.997, 77.615],
  ["560008", "HAL 2nd Stage", "premium-residential", 12.97, 77.645],
  ["560009", "Gandhinagar / Majestic", "transit", 12.977, 77.572],
  ["560010", "Rajajinagar", "residential", 12.991, 77.555],
  ["560011", "Jayanagar", "high-street", 12.93, 77.583],
  ["560016", "Ramamurthy Nagar", "residential", 13.013, 77.678],
  ["560017", "Vimanapura / Old Airport Rd", "residential", 12.96, 77.675],
  ["560018", "Chamarajpet", "residential", 12.957, 77.565],
  ["560022", "Yeshwanthpur", "transit", 13.023, 77.55],
  ["560024", "Hebbal", "residential", 13.036, 77.597],
  ["560025", "Richmond Town", "premium-residential", 12.962, 77.603],
  ["560027", "Shanthinagar / Wilson Garden", "residential", 12.95, 77.599],
  ["560032", "RT Nagar", "residential", 13.022, 77.595],
  ["560034", "Koramangala", "high-street", 12.935, 77.625],
  ["560035", "Sarjapur Road / Carmelaram", "it-corridor", 12.907, 77.705],
  ["560036", "KR Puram", "transit", 13.008, 77.695],
  ["560037", "Marathahalli", "it-corridor", 12.956, 77.701],
  ["560038", "Indiranagar", "high-street", 12.978, 77.641],
  ["560040", "Vijayanagar", "residential", 12.971, 77.537],
  ["560041", "Jayanagar East / Tilaknagar", "residential", 12.925, 77.593],
  ["560043", "Kalyan Nagar / HRBR", "residential", 13.023, 77.64],
  ["560047", "Viveknagar", "residential", 12.95, 77.62],
  ["560048", "Mahadevapura", "it-corridor", 12.995, 77.7],
  ["560050", "Banashankari", "residential", 12.925, 77.547],
  ["560054", "Mathikere", "residential", 13.033, 77.562],
  ["560058", "Peenya", "industrial", 13.028, 77.519],
  ["560060", "Kengeri", "peri-urban", 12.908, 77.485],
  ["560064", "Yelahanka", "residential", 13.1, 77.596],
  ["560066", "Whitefield", "it-corridor", 12.97, 77.75],
  ["560067", "Kadugodi", "peri-urban", 12.999, 77.76],
  ["560068", "Bommanahalli", "residential", 12.903, 77.625],
  ["560070", "Banashankari 2nd Stage", "residential", 12.925, 77.565],
  ["560071", "Domlur", "premium-residential", 12.961, 77.639],
  ["560072", "Nagarbhavi", "residential", 12.96, 77.51],
  ["560075", "New Thippasandra", "residential", 12.975, 77.655],
  ["560076", "Bannerghatta Road / Arekere", "residential", 12.89, 77.597],
  ["560078", "JP Nagar", "residential", 12.906, 77.585],
  ["560079", "Basaveshwaranagar", "residential", 12.989, 77.538],
  ["560083", "Bannerghatta", "peri-urban", 12.8, 77.577],
  ["560085", "Banashankari 3rd Stage", "residential", 12.918, 77.55],
  ["560086", "Mahalakshmi Layout", "residential", 13.013, 77.545],
  ["560087", "Varthur", "peri-urban", 12.94, 77.747],
  ["560092", "Sahakara Nagar", "residential", 13.062, 77.589],
  ["560093", "CV Raman Nagar", "residential", 12.986, 77.663],
  ["560095", "Koramangala 6th Block", "premium-residential", 12.94, 77.62],
  ["560097", "Vidyaranyapura", "residential", 13.078, 77.558],
  ["560098", "RR Nagar", "residential", 12.926, 77.518],
  ["560099", "Bommasandra", "industrial", 12.815, 77.695],
  ["560100", "Electronic City", "it-corridor", 12.845, 77.66],
  ["560102", "HSR Layout", "premium-residential", 12.912, 77.645],
  ["560103", "Bellandur", "it-corridor", 12.926, 77.676],
  ["570001", "Mysuru city centre", "cbd", 12.308, 76.654],
  ["575001", "Mangaluru city centre (Hampankatta)", "cbd", 12.87, 74.843],
  ["580020", "Hubballi city centre", "cbd", 15.35, 75.138],
  ["590001", "Belagavi city centre", "cbd", 15.856, 74.506],
  ["572101", "Tumakuru city centre", "cbd", 13.34, 77.101],
  ["577001", "Davanagere city centre", "cbd", 14.466, 75.924],
];

export const GAZETTEER: Record<string, Locality> = Object.fromEntries(
  GAZ.map(([pin, name, archetype, lat, lng]) => [pin, { pin, name, archetype, lat, lng, confidence: "mapped" as const }]),
);

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  cbd: "Central business district",
  "high-street": "Commercial high street",
  transit: "Transit hub",
  "it-corridor": "IT / office corridor",
  "premium-residential": "Premium residential",
  residential: "Residential",
  "peri-urban": "Peri-urban fringe",
  industrial: "Industrial area",
  unknown: "Not mapped",
};

export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Road distance is ~1.3x straight-line for Indian intercity routes. */
export const ROAD_FACTOR = 1.3;
