import type { Rubric } from "./types";

// Version 1 is the two rubrics the expansion team supplied: the applicant
// qualification rubric (partner) and the geospatial pin-code rubric (location).
export const DEFAULT_RUBRIC: Rubric = {
  version: 1,
  note: "Initial rubric from the expansion team",
  createdAt: "2026-10-25T00:00:00.000Z",
  blend: { partner: 50, location: 50 },
  partner: { floor: 15, size: 10, ownership: 5, financial: 25, operational: 25, speed: 10, local: 10 },
  location: { strategic: 25, demographic: 20, jtbd: 20, supply: 15, economics: 10, competition: 10 },
  approveMin: { "Tier 1": 70, "Tier 2": 66, "Tier 3": 62 },
  conditionalMin: 55,
  rejectBelow: 45,
  capitalFloor: 0.5,
  saturationKm: 2,
};

export const PARTNER_LABELS: Record<keyof Rubric["partner"], string> = {
  floor: "Floor & accessibility",
  size: "Space size & format fit",
  ownership: "Space ownership",
  financial: "Financial readiness",
  operational: "Operating experience",
  speed: "Speed to market",
  local: "Local nuance & intent",
};

export const LOCATION_LABELS: Record<keyof Rubric["location"], string> = {
  strategic: "Strategic fit & slots",
  demographic: "Demographic density",
  jtbd: "Purchase triggers (JTBD)",
  supply: "Supply-chain reach",
  economics: "Real-estate economics",
  competition: "Cannibalisation vs. white space",
};

export function rubricTotalOk(r: Rubric): string | null {
  const p = Object.values(r.partner).reduce((a, b) => a + b, 0);
  const l = Object.values(r.location).reduce((a, b) => a + b, 0);
  if (Math.round(p) !== 100) return `Partner weights add to ${p}, not 100.`;
  if (Math.round(l) !== 100) return `Location weights add to ${l}, not 100.`;
  if (Math.round(r.blend.partner + r.blend.location) !== 100) return "Partner + location blend must add to 100.";
  return null;
}
