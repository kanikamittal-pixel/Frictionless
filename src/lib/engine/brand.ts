import type { BrandProfile, Tier } from "./types";

// The two trigger inputs (industry + business model) set every brand-specific
// number the rubric needs: what a "right-sized" space is, how much capital a
// partner must bring, which past businesses count as relevant, and what the
// training plan contains. The team can edit any of it before running.

type Base = Omit<BrandProfile, "industry" | "model" | "industryKey" | "modelKey" | "summary">;

const COMMON_RETAIL = ["retail", "store", "shop", "showroom", "outlet", "franchise", "business", "trader", "dealer"];

export const INDUSTRIES: { key: string; label: string; hint: string; base: Base }[] = [
  {
    key: "eyewear",
    label: "Eyewear & optical",
    hint: "Lenskart-style optical stores",
    base: {
      // Lenskart's published figures: ~₹35L regular store, ~₹20L "Lite" small-town format, 250–500 sq ft.
      sqft: { min: 200, idealMin: 250, idealMax: 600, max: 900 },
      capexLakh: { "Tier 1": 35, "Tier 2": 25, "Tier 3": 20 },
      relevantWords: ["optical", "optician", "eyewear", "spectacle", "optometr", "lens", "eye", "sunglass"],
      adjacentWords: ["footwear", "shoe", "apparel", "garment", "fashion", "watch", "jewel", "mobile", "electronic", "pharmacy", "medical", "fmcg", "cosmetic", ...COMMON_RETAIL],
      footfall: "high",
      groundCritical: true,
      mallFit: "good",
      partnerOperates: true,
      needsExistingBusiness: false,
      leadMonths: { withSpace: 2, withoutSpace: 4 },
      staff: 4,
      licences: ["Trade licence", "GST registration", "Shops & Establishments registration", "Registered optometrist on staff"],
      training: [
        { title: "Brand, product range and lens science", days: 2 },
        { title: "Eye-test protocol and optometry SOPs", days: 4 },
        { title: "Point of sale, inventory and lab orders", days: 2 },
        { title: "Selling, frame styling and customer care", days: 2 },
        { title: "Store opening drill at the buddy store", days: 3 },
      ],
      revenueLakhPerMonth: { "Tier 1": 9, "Tier 2": 6.5, "Tier 3": 5 },
      marginPct: 18,
      triggers: ["hospital", "clinic", "college", "office", "market", "main road", "mall", "metro", "bus"],
    },
  },
  {
    key: "qsr",
    label: "Food & QSR / café",
    hint: "Quick-service restaurant, café, bakery",
    base: {
      sqft: { min: 200, idealMin: 300, idealMax: 600, max: 1200 },
      capexLakh: { "Tier 1": 40, "Tier 2": 32, "Tier 3": 25 },
      relevantWords: ["restaurant", "cafe", "café", "food", "qsr", "bakery", "catering", "hotel", "kitchen", "juice", "sweet", "tea", "coffee", "dhaba", "darshini", "canteen"],
      adjacentWords: ["fmcg", "grocery", "kirana", "hospitality", "dairy", ...COMMON_RETAIL],
      footfall: "high",
      groundCritical: true,
      mallFit: "good",
      partnerOperates: true,
      needsExistingBusiness: false,
      leadMonths: { withSpace: 2, withoutSpace: 4 },
      staff: 8,
      licences: ["FSSAI licence", "Trade licence", "GST registration", "Fire NOC", "Shops & Establishments registration"],
      training: [
        { title: "Food safety (FSSAI FoSTaC) certification", days: 2 },
        { title: "Kitchen SOPs, recipes and plating", days: 5 },
        { title: "Point of sale, aggregator apps and inventory", days: 2 },
        { title: "Service, hygiene audits and complaints", days: 2 },
        { title: "Live shifts at the buddy store", days: 4 },
      ],
      revenueLakhPerMonth: { "Tier 1": 12, "Tier 2": 9, "Tier 3": 6.5 },
      marginPct: 15,
      triggers: ["office", "college", "bus", "metro", "railway", "market", "main road", "mall", "it park", "hospital"],
    },
  },
  {
    key: "apparel",
    label: "Apparel & footwear",
    hint: "Fashion, footwear, accessories",
    base: {
      sqft: { min: 500, idealMin: 800, idealMax: 1200, max: 2000 },
      capexLakh: { "Tier 1": 45, "Tier 2": 35, "Tier 3": 28 },
      relevantWords: ["apparel", "cloth", "garment", "textile", "footwear", "shoe", "fashion", "boutique", "saree", "readymade", "tailor"],
      adjacentWords: ["eyewear", "optical", "jewel", "cosmetic", "watch", "bag", "mobile", ...COMMON_RETAIL],
      footfall: "high",
      groundCritical: true,
      mallFit: "good",
      partnerOperates: true,
      needsExistingBusiness: false,
      leadMonths: { withSpace: 2, withoutSpace: 4 },
      staff: 5,
      licences: ["Trade licence", "GST registration", "Shops & Establishments registration"],
      training: [
        { title: "Brand, collections and visual merchandising", days: 3 },
        { title: "Point of sale, stock and size-ratio planning", days: 2 },
        { title: "Selling, fitting and returns", days: 2 },
        { title: "Store opening drill at the buddy store", days: 3 },
      ],
      revenueLakhPerMonth: { "Tier 1": 10, "Tier 2": 7, "Tier 3": 5.5 },
      marginPct: 20,
      triggers: ["market", "main road", "mall", "college", "bus", "metro"],
    },
  },
  {
    key: "grocery",
    label: "Grocery & convenience",
    hint: "Supermarket, kirana, daily needs",
    base: {
      sqft: { min: 400, idealMin: 600, idealMax: 1000, max: 1500 },
      capexLakh: { "Tier 1": 30, "Tier 2": 24, "Tier 3": 18 },
      relevantWords: ["grocery", "kirana", "supermarket", "provision", "fmcg", "dairy", "mart", "general store", "departmental"],
      adjacentWords: ["pharmacy", "medical", "distributor", "wholesale", "bakery", "vegetable", ...COMMON_RETAIL],
      footfall: "medium",
      groundCritical: true,
      mallFit: "poor",
      partnerOperates: true,
      needsExistingBusiness: false,
      leadMonths: { withSpace: 2, withoutSpace: 3 },
      staff: 6,
      licences: ["FSSAI registration", "Trade licence", "GST registration", "Shops & Establishments registration"],
      training: [
        { title: "Category management and replenishment", days: 3 },
        { title: "Point of sale, home delivery app and payments", days: 2 },
        { title: "Fresh handling, expiry and shrinkage control", days: 2 },
        { title: "Store opening drill at the buddy store", days: 3 },
      ],
      revenueLakhPerMonth: { "Tier 1": 15, "Tier 2": 11, "Tier 3": 8 },
      marginPct: 8,
      triggers: ["residential", "apartment", "layout", "market", "main road", "bus"],
    },
  },
  {
    key: "pharmacy",
    label: "Pharmacy & health",
    hint: "Chemist, diagnostics collection",
    base: {
      sqft: { min: 150, idealMin: 250, idealMax: 500, max: 800 },
      capexLakh: { "Tier 1": 20, "Tier 2": 16, "Tier 3": 12 },
      relevantWords: ["pharmacy", "chemist", "medical", "drug", "health", "clinic", "hospital", "diagnostic", "pharma"],
      adjacentWords: ["grocery", "fmcg", "optical", "cosmetic", "distributor", ...COMMON_RETAIL],
      footfall: "medium",
      groundCritical: true,
      mallFit: "ok",
      partnerOperates: true,
      needsExistingBusiness: false,
      leadMonths: { withSpace: 2, withoutSpace: 3 },
      staff: 3,
      licences: ["Drug licence (Form 20/21)", "Registered pharmacist", "Trade licence", "GST registration"],
      training: [
        { title: "Drug law, schedule H/H1 and record keeping", days: 2 },
        { title: "Dispensing SOPs and cold chain", days: 2 },
        { title: "Point of sale, substitutes and expiry control", days: 2 },
        { title: "Store opening drill at the buddy store", days: 2 },
      ],
      revenueLakhPerMonth: { "Tier 1": 8, "Tier 2": 6, "Tier 3": 4.5 },
      marginPct: 12,
      triggers: ["hospital", "clinic", "residential", "market", "main road"],
    },
  },
  {
    key: "beauty",
    label: "Beauty & wellness",
    hint: "Salon, spa, cosmetics",
    base: {
      sqft: { min: 400, idealMin: 600, idealMax: 900, max: 1400 },
      capexLakh: { "Tier 1": 30, "Tier 2": 24, "Tier 3": 18 },
      relevantWords: ["salon", "beauty", "spa", "parlour", "parlor", "cosmetic", "makeup", "wellness", "grooming"],
      adjacentWords: ["fashion", "apparel", "fitness", "gym", "boutique", ...COMMON_RETAIL],
      footfall: "medium",
      groundCritical: false,
      mallFit: "ok",
      partnerOperates: true,
      needsExistingBusiness: false,
      leadMonths: { withSpace: 2, withoutSpace: 4 },
      staff: 6,
      licences: ["Trade licence", "GST registration", "Shops & Establishments registration"],
      training: [
        { title: "Service menu and hygiene protocols", days: 4 },
        { title: "Booking app, point of sale and memberships", days: 2 },
        { title: "Client consultation and retail add-ons", days: 2 },
        { title: "Live shifts at the buddy store", days: 3 },
      ],
      revenueLakhPerMonth: { "Tier 1": 7, "Tier 2": 5, "Tier 3": 3.5 },
      marginPct: 22,
      triggers: ["residential", "office", "main road", "mall", "market"],
    },
  },
  {
    key: "electronics",
    label: "Mobiles & electronics",
    hint: "Phones, appliances, accessories",
    base: {
      sqft: { min: 300, idealMin: 400, idealMax: 700, max: 1200 },
      capexLakh: { "Tier 1": 40, "Tier 2": 32, "Tier 3": 25 },
      relevantWords: ["mobile", "electronic", "phone", "appliance", "computer", "laptop", "telecom", "gadget", "recharge"],
      adjacentWords: ["distributor", "optical", "watch", "fmcg", ...COMMON_RETAIL],
      footfall: "high",
      groundCritical: true,
      mallFit: "good",
      partnerOperates: true,
      needsExistingBusiness: false,
      leadMonths: { withSpace: 2, withoutSpace: 3 },
      staff: 4,
      licences: ["Trade licence", "GST registration", "Shops & Establishments registration"],
      training: [
        { title: "Range, financing schemes and demos", days: 2 },
        { title: "Point of sale, IMEI tracking and returns", days: 2 },
        { title: "After-sales and warranty handling", days: 1 },
        { title: "Store opening drill at the buddy store", days: 2 },
      ],
      revenueLakhPerMonth: { "Tier 1": 18, "Tier 2": 12, "Tier 3": 9 },
      marginPct: 7,
      triggers: ["market", "main road", "college", "mall", "bus", "metro"],
    },
  },
  {
    key: "logistics",
    label: "Logistics & last-mile",
    hint: "Delhivery-style delivery centres",
    base: {
      sqft: { min: 800, idealMin: 1200, idealMax: 2500, max: 4000 },
      capexLakh: { "Tier 1": 15, "Tier 2": 12, "Tier 3": 10 },
      relevantWords: ["logistic", "courier", "delivery", "transport", "warehouse", "cargo", "parcel", "fleet", "supply chain", "godown"],
      adjacentWords: ["distributor", "wholesale", "grocery", "fmcg", "e-commerce", "ecommerce", "travel", ...COMMON_RETAIL],
      footfall: "low",
      groundCritical: true,
      mallFit: "poor",
      partnerOperates: true,
      needsExistingBusiness: false,
      leadMonths: { withSpace: 1, withoutSpace: 3 },
      staff: 10,
      licences: ["Trade licence", "GST registration", "Shops & Establishments registration", "Labour / contract registration"],
      training: [
        { title: "Hub operations, sorting and bagging SOPs", days: 3 },
        { title: "Rider onboarding, safety and route planning", days: 2 },
        { title: "Scanning app, proof of delivery and returns", days: 2 },
        { title: "Cash-on-delivery handling and reconciliation", days: 1 },
        { title: "Live shifts at the nearest hub", days: 3 },
      ],
      revenueLakhPerMonth: { "Tier 1": 6, "Tier 2": 4.5, "Tier 3": 3.5 },
      marginPct: 20,
      triggers: ["residential", "apartment", "layout", "highway", "industrial", "warehouse"],
    },
  },
  {
    key: "education",
    label: "Education & learning",
    hint: "Tuition, pre-school, skilling",
    base: {
      sqft: { min: 600, idealMin: 900, idealMax: 1500, max: 2500 },
      capexLakh: { "Tier 1": 25, "Tier 2": 20, "Tier 3": 15 },
      relevantWords: ["education", "tuition", "coaching", "school", "teach", "academy", "training", "preschool", "tutor"],
      adjacentWords: ["books", "stationery", "it", "software", "consult", ...COMMON_RETAIL],
      footfall: "medium",
      groundCritical: false,
      mallFit: "ok",
      partnerOperates: true,
      needsExistingBusiness: false,
      leadMonths: { withSpace: 2, withoutSpace: 4 },
      staff: 6,
      licences: ["Trade licence", "GST registration", "Fire safety clearance"],
      training: [
        { title: "Curriculum and teacher certification", days: 5 },
        { title: "Admissions, CRM and fee collection", days: 2 },
        { title: "Parent communication and safety", days: 1 },
        { title: "Shadow sessions at the buddy centre", days: 3 },
      ],
      revenueLakhPerMonth: { "Tier 1": 6, "Tier 2": 4.5, "Tier 3": 3 },
      marginPct: 25,
      triggers: ["residential", "school", "college", "apartment", "main road"],
    },
  },
];

export const MODELS: { key: string; label: string; hint: string }[] = [
  { key: "fofo", label: "FOFO", hint: "Franchise-owned, franchise-operated. Partner invests and runs the store." },
  { key: "foco", label: "FOCO", hint: "Franchise-owned, company-operated. Partner invests; the brand runs the store." },
  { key: "sis", label: "Shop-in-shop / kiosk", hint: "Small brand corner inside the partner's existing shop." },
  { key: "micro", label: "Micro-partner", hint: "Partner lends space and time (Amazon I Have Space style). Very low capex." },
];

const r = (n: number) => Math.round(n);
const scaleTier = (t: Record<Tier, number>, f: number): Record<Tier, number> => ({
  "Tier 1": +(t["Tier 1"] * f).toFixed(1),
  "Tier 2": +(t["Tier 2"] * f).toFixed(1),
  "Tier 3": +(t["Tier 3"] * f).toFixed(1),
});

export function buildProfile(industryKey: string, modelKey: string, customIndustry?: string, customModel?: string): BrandProfile {
  const ind = INDUSTRIES.find((i) => i.key === industryKey) ?? INDUSTRIES[0];
  const mod = MODELS.find((m) => m.key === modelKey) ?? MODELS[0];
  const b: Base = structuredClone(ind.base);

  if (mod.key === "foco") {
    b.partnerOperates = false;
    b.capexLakh = scaleTier(b.capexLakh, 1.1); // company-standard fit-out
    b.marginPct = +(b.marginPct * 0.75).toFixed(1); // partner earns a revenue share
    b.training = [
      { title: "Partner induction: governance, reporting and revenue share", days: 1 },
      { title: "Site, landlord and local-authority liaison", days: 1 },
      { title: "Monthly business review and dashboards", days: 1 },
    ];
  } else if (mod.key === "sis") {
    b.sqft = { min: Math.max(60, r(b.sqft.min * 0.2)), idealMin: r(b.sqft.idealMin * 0.25), idealMax: r(b.sqft.idealMax * 0.3), max: r(b.sqft.max * 0.4) };
    b.capexLakh = scaleTier(b.capexLakh, 0.3);
    b.needsExistingBusiness = true;
    b.staff = 2;
    b.leadMonths = { withSpace: 1, withoutSpace: 2 };
    b.revenueLakhPerMonth = scaleTier(b.revenueLakhPerMonth, 0.35);
    b.training = b.training.slice(0, 3).map((t) => ({ ...t, days: Math.max(1, Math.ceil(t.days / 2)) }));
  } else if (mod.key === "micro") {
    b.sqft = { min: 80, idealMin: 120, idealMax: 300, max: 600 };
    b.capexLakh = scaleTier(b.capexLakh, 0.12);
    b.needsExistingBusiness = true;
    b.staff = 2;
    b.leadMonths = { withSpace: 0.5, withoutSpace: 1.5 };
    b.revenueLakhPerMonth = scaleTier(b.revenueLakhPerMonth, 0.2);
    b.marginPct = 30;
    b.training = b.training.slice(0, 2).map((t) => ({ ...t, days: Math.max(1, Math.ceil(t.days / 2)) }));
  }

  const industry = customIndustry?.trim() || ind.label;
  const model = customModel?.trim() || `${mod.label} — ${mod.hint}`;
  return {
    ...b,
    industry,
    model,
    industryKey: ind.key,
    modelKey: mod.key,
    summary: `${industry}, ${mod.label}. Ideal space ${b.sqft.idealMin}–${b.sqft.idealMax} sq ft; partner capital needed ₹${b.capexLakh["Tier 1"]}L / ₹${b.capexLakh["Tier 2"]}L / ₹${b.capexLakh["Tier 3"]}L (Tier 1/2/3).`,
  };
}

/** Clamp an AI- or user-edited profile so a typo can't break the engine. */
export function sanitizeProfile(p: BrandProfile): BrandProfile {
  const pos = (n: unknown, d: number) => (typeof n === "number" && isFinite(n) && n > 0 ? n : d);
  const q = structuredClone(p);
  const s = q.sqft;
  s.min = pos(s.min, 200);
  s.idealMin = Math.max(s.min, pos(s.idealMin, 400));
  s.idealMax = Math.max(s.idealMin, pos(s.idealMax, 600));
  s.max = Math.max(s.idealMax, pos(s.max, 1000));
  for (const t of ["Tier 1", "Tier 2", "Tier 3"] as Tier[]) {
    q.capexLakh[t] = pos(q.capexLakh[t], 25);
    q.revenueLakhPerMonth[t] = pos(q.revenueLakhPerMonth[t], 6);
  }
  q.marginPct = Math.min(60, pos(q.marginPct, 15));
  q.staff = Math.round(pos(q.staff, 4));
  q.leadMonths = { withSpace: pos(q.leadMonths?.withSpace, 2), withoutSpace: pos(q.leadMonths?.withoutSpace, 4) };
  q.relevantWords = (q.relevantWords ?? []).map((w) => String(w).toLowerCase()).filter(Boolean);
  q.adjacentWords = (q.adjacentWords ?? []).map((w) => String(w).toLowerCase()).filter(Boolean);
  q.training = (q.training ?? []).filter((t) => t && t.title).map((t) => ({ title: String(t.title), days: Math.max(1, Math.round(pos(t.days, 1))) }));
  if (!q.training.length) q.training = [{ title: "Brand and store operations", days: 5 }];
  return q;
}
