// Builds public/sample/Outpost_Sample_Batch.xlsx in the judges' template
// format, seeded with the messy cases the brief warns about.
import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";

const A = [
  "Application ID", "Applicant name", "City", "State", "Pin code", "Investment capacity (₹ lakh)", "Retail experience (years)",
  "Current / past business", "Space available", "Space size (sq ft)", "Floor", "Target launch (months)", "Preferred language", "Notes from applicant",
];
const apps: unknown[][] = [
  ["APP-001", "Ravi Kumar", "Mysuru", "Karnataka", 570001, 25, 4, "Runs a footwear store", "Rented", 450, "Ground", 3, "Kannada", "Wants to open before Diwali"],
  ["APP-002", "Priya Shetty", "Bengaluru", "Karnataka", 560102, 60, 8, "Ran an optical showroom in Jayanagar for 8 years", "Owned", 520, "Ground", 2, "English", "Visited 3 of your stores and studied footfall on 27th Main, HSR"],
  ["APP-003", "Arjun Rao", "Bengaluru", "Karnataka", 560102, 45, 5, "Manages the family electronics shop", "Rented", 480, "Ground", 3, "Kannada", ""],
  ["APP-004", "Meena Gowda", "Mysuru", "Karnataka", 570009, 30, 6, "Runs a gift and stationery shop", "Owned", 500, "Ground", 2, "Kannada", "Shop is on Saraswathipuram main road"],
  ["APP-005", "Imran Khan", "Mysuru", "Karnataka", 570002, 22, 2, "Mobile accessories kiosk", "Rented", 380, "Upper", 4, "Hindi", "First floor above a bakery, stairs access"],
  ["APP-006", "Suresh Patil", "Hubballi-Dharwad", "Karnataka", 580021, 30, 0, "Software engineer, wants to start a business", "Not yet identified", null, "Not known", 2, "English", "Will keep my full-time job, wife will manage the store"],
  ["APP-007", "Lakshmi N", "Tumakuru", "Karnataka", 572101, 26, 6, "Kirana and general store owner for 6 years", "Rented", 600, "Ground", 3, "Kannada", "On BH Road near the bus stand"],
  ["APP-008", "Deepak Hegde", "Mangaluru", "Karnataka", 575002, 12, 3, "Garment shop", "Rented", 400, "Ground", 4, "Kannada", "Can add more later"],
  ["APP-009", "Farhan Ali", "Bengaluru", "Karnataka", 560011, 38, 3, "Pharmacy owner", "Rented", 650, "Mall unit", 5, "English", "Unit in a Jayanagar shopping complex; need a bank loan for part of the fit-out"],
  ["APP-010", "Kavya Reddy", "Bengaluru", "Karnataka", 560078, 55, 10, "Runs 3 optical stores under her own name", "Owned", 500, "Ground", 2, "Kannada", "Strong local customer base in JP Nagar"],
  ["APP-011", "Ganesh Bhat", "Mysuru", "Karnataka", 560038, 40, 5, "Watch and eyewear retailer", "Rented", 450, "Ground", 3, "Kannada", ""],
  ["APP-012", "Anil Kulkarni", "Davanagere", "Karnataka", 577002, 18, 2, "Ex-sales manager at an eyewear chain", "Not yet identified", null, "Ground", 2, "Kannada", "Looking for a shop near the PB Road market"],
  ["APP-013", "Rohit Sharma", "Belagavi", "Karnataka", 590001, 35, 4, "Footwear showroom", "Rented", 550, "Ground", 3, "Hindi", ""],
  ["APP-014", "Sneha Pai", "Mangaluru", "Karnataka", 575003, 35, 5, "Owns a boutique and saree store", "Rented", 1500, "Ground", 4, "Kannada", "Large showroom, can split the floor"],
  ["APP-015", "Vikram Joshi", "Bengaluru", "Karnataka", 560066, 50, 7, "Runs a mobile phone store in Whitefield", "Rented", 450, "Ground", 2, "English", ""],
  ["APP-016", "Nandini Murthy", "Davanagere", "Karnataka", 577001, 30, 7, "Runs a medical store", "Rented", 420, "Ground", 3, "Kannada", "Main road, near Bapuji hospital"],
  [null, "Harish M", "Tumkur", "Karnataka", 572103, "15 lakh", 3, "Bakery", "Rented", 350, "Ground", 4, "Kannada", "Can open quickly"],
  ["APP-018", "Pooja Iyer", "Bengaluru", "Karnataka", 560095, 2800000, 4, "Café owner", "Rented", 450, "Ground", 3, "English", "Koramangala 6th block, opposite a college"],
  ["APP-019", "Mahesh Gowda", "Tumakuru", "Karnataka", 572101, 40, 12, "Ran an eyewear franchise in Bengaluru for 5 years, now moving home", "Owned", 550, "Ground", 2, "Kannada", "Family building on BH Road; researched the Tumakuru market"],
  ["APP-020", "Arif Pasha", "Hubballi-Dharwad", "Karnataka", 580029, 28, 5, "Electronics retail", "Rented", 500, "Ground", 4, "Hindi", "Interested in any good franchise"],
  ["APP-021", "Sunita Desai", "Belagavi", "Karnataka", 590006, 32, 6, "Runs an optical shop in Tilakwadi", "Owned", 480, "Ground", 2, "Kannada", "Many customers ask for branded frames"],
  ["APP-022", "Ramesh Naik", "Belagavi", "Karnataka", 590010, 28, 3, "Textile shop", "Rented", 600, "Ground", 4, "Kannada", ""],
  ["APP-023", "Divya Kamath", "Mangaluru", "Karnataka", 575002, 30, 3, "Teacher", "Rented", null, "Not known", 6, "English", ""],
  ["APP-024", "Prakash B", "Mysuru", "Karnataka", 570008, null, 5, "Runs a supermarket", "Owned", 600, "Ground", 3, "Kannada", "Budget to be confirmed with family"],
  ["APP-025", "Shalini Rao", "Davanagere", "Karnataka", 577004, 26, 1, "Homemaker, first business", "Not yet identified", null, "Not known", 8, "Kannada", "Family dispute over the shop property is in court"],
  ["APP-026", "Kiran Kumar", "Mysuru", "Karnataka", 570001, 32, 6, "Runs an optical store in Mysuru", "Owned", 500, "Ground", 2, "Kannada", "Visited your Bengaluru stores, know the brand well"],
  ["APP-027", "Priya Shetty", "Bengaluru", "Karnataka", 560102, 60, 8, "Ran an optical showroom", "Owned", 520, "Ground", 2, "English", "Resubmitting"],
  ["APP-028", "Uday Shetty", "Hubli", "Karnataka", 580020, 30, 4, "Sports goods store", "Rented", 450, "Ground", 3, "Kannada", ""],
];
const T = ["Territory ID", "City", "State", "Pin codes covered", "City tier", "Open slots", "Priority"];
const ters: unknown[][] = [
  ["TER-01", "Bengaluru", "Karnataka", "560034, 560095, 560102, 560068", "Tier 1", 2, "High"],
  ["TER-02", "Bengaluru", "Karnataka", "560011, 560041, 560070, 560078", "Tier 1", 1, "Medium"],
  ["TER-03", "Mysuru", "Karnataka", "570001, 570002, 570008, 570009", "Tier 2", 2, "High"],
  ["TER-04", "Mangaluru", "Karnataka", "575001, 575002, 575003", "Tier 2", 1, "Medium"],
  ["TER-05", "Hubballi-Dharwad", "Karnataka", "580020, 580021, 580029, 580001", "Tier 1", 1, "Low"],
  ["TER-06", "Tumakuru", "Karnataka", "572101, 572102, 572103", "Tier 3", 2, "High"],
  ["TER-07", "Davanagere", "Karnataka", "577001, 577002, 577004", "Tier 3", 3, "High"],
  ["TER-08", "Belagavi", "Karnataka", "590001", "Tier 2", 2, "Low"],
];
const S = ["Store ID", "City", "Pin code", "Opened (year)"];
const stores = [
  ["ST-01", "Bengaluru", 560001, 2019], ["ST-02", "Bengaluru", 560034, 2020], ["ST-03", "Bengaluru", 560038, 2021],
  ["ST-04", "Bengaluru", 560066, 2022], ["ST-05", "Bengaluru", 560076, 2023], ["ST-06", "Mysuru", 570009, 2021],
  ["ST-07", "Mysuru", 570017, 2024], ["ST-08", "Mangaluru", 575001, 2022], ["ST-09", "Hubballi-Dharwad", 580020, 2023],
  ["ST-10", "Belagavi", 590001, 2024],
];
const G = [["Column", "Meaning"], ["Investment capacity (₹ lakh)", "Money the applicant can put into the store; 1 lakh = ₹1,00,000"], ["Open slots", "How many more stores the brand wants to open here"]];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([A, ...apps]), "Applications");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([T, ...ters]), "Territories");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([S, ...stores]), "Existing stores");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(G), "Glossary");
const out = process.argv[2] ?? "public/sample/Outpost_Sample_Batch.xlsx";
writeFileSync(out, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log("wrote", out, apps.length, "applications");
