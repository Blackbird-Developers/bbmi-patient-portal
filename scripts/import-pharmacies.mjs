#!/usr/bin/env node
// Imports pharmacies into Semble as Contacts the portal can offer patients (metadata portalKind=pharmacy).
//
//   node scripts/import-pharmacies.mjs <file.csv>            # dry run: shows what would be created
//   node scripts/import-pharmacies.mjs <file.csv> --write    # creates them
//
// The CSV needs a header row. Columns are matched by name (case-insensitive):
//   name / pharmacy / pharmacy name · email / healthmail · address / address 1 · town / city
//   county · eircode / postcode · phone / telephone
// Rows without a valid email are skipped; emails already imported are skipped (so it is safe to re-run).
// Uses SEMBLE_GRAPHQL_URL + SEMBLE_API_TOKEN from .env.local. Refuses a production Semble URL
// unless --production is passed AND PORTAL_ALLOW_PRODUCTION=1 is set.
import fs from "node:fs";
import path from "node:path";

const [file, ...flags] = process.argv.slice(2);
const WRITE = flags.includes("--write");
if (!file) {
  console.error("usage: node scripts/import-pharmacies.mjs <file.csv> [--write] [--production]");
  process.exit(1);
}

const envFile = path.join(process.cwd(), ".env.local");
const env = Object.fromEntries(
  (fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const URL_ = process.env.SEMBLE_GRAPHQL_URL || env.SEMBLE_GRAPHQL_URL;
const TOKEN = process.env.SEMBLE_API_TOKEN || env.SEMBLE_API_TOKEN;
if (!URL_ || !TOKEN) throw new Error("SEMBLE_GRAPHQL_URL / SEMBLE_API_TOKEN missing");
if (!/sandbox/i.test(URL_) && !(flags.includes("--production") && (process.env.PORTAL_ALLOW_PRODUCTION || env.PORTAL_ALLOW_PRODUCTION) === "1")) {
  throw new Error("Refusing a production Semble URL (pass --production and set PORTAL_ALLOW_PRODUCTION=1)");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gql(query, variables = {}) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", "x-token": TOKEN }, body: JSON.stringify({ query, variables }) });
    const j = await r.json().catch(() => ({}));
    const msg = JSON.stringify(j.errors ?? "");
    if ((r.status === 429 || /too often|rate/i.test(msg)) && attempt < 6) {
      await sleep(15_000 * attempt); // Semble throttles at ~240 requests/minute
      continue;
    }
    if (j.errors) throw new Error(msg.slice(0, 300));
    return j.data;
  }
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, commas and newlines inside quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const COLS = {
  name: /^(name|pharmacy|pharmacy ?name|business ?name|trading ?name)$/i,
  email: /^(email|e-?mail|healthmail|healthmail ?(address|email))$/i,
  address: /^(address|address ?1|address ?line ?1|street)$/i,
  address2: /^(address ?2|address ?line ?2)$/i,
  city: /^(town|city|town ?\/ ?city)$/i,
  county: /^(county)$/i,
  postcode: /^(eircode|postcode|post ?code)$/i,
  phone: /^(phone|telephone|tel|phone ?number)$/i,
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const [header, ...data] = parseCsv(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
const idx = Object.fromEntries(Object.entries(COLS).map(([k, re]) => [k, header.findIndex((h) => re.test(h.trim()))]));
if (idx.name < 0 || idx.email < 0) throw new Error(`CSV needs a name and an email column; found: ${header.join(" | ")}`);
const get = (r, k) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");

const seen = new Set();
const rows = [];
let skipped = 0;
for (const r of data) {
  const email = get(r, "email").toLowerCase();
  const name = get(r, "name");
  if (!name || !EMAIL.test(email) || seen.has(email)) { skipped++; continue; }
  seen.add(email);
  rows.push({ name, email, address: [get(r, "address"), get(r, "address2")].filter(Boolean).join(", "), city: get(r, "city"), county: get(r, "county"), postcode: get(r, "postcode"), phone: get(r, "phone") });
}

// Pharmacies already in Semble (by email), so re-runs never duplicate.
const existing = new Map();
for (let page = 1; page <= 500; page++) {
  const d = await gql(`query P($page: Int) { contacts(filters: { metadata: { key: "portalKind", value: "pharmacy" } }, pagination: { page: $page, pageSize: 100 }) { data { id email } pageInfo { hasMore } } }`, { page });
  for (const c of d.contacts.data) if (c.email) existing.set(c.email.toLowerCase(), c.id);
  if (!d.contacts.pageInfo?.hasMore) break;
}

const todo = rows.filter((r) => !existing.has(r.email));
console.log(`${data.length} rows · ${rows.length} usable · ${skipped} skipped (no name/valid email, or duplicate) · ${rows.length - todo.length} already in Semble · ${todo.length} to create${WRITE ? "" : " (dry run — add --write)"}`);
if (!WRITE) {
  for (const r of todo.slice(0, 10)) console.log("  +", r.name, "·", r.email, "·", [r.city, r.county].filter(Boolean).join(", "));
  process.exit(0);
}

let created = 0;
for (const r of todo) {
  // Only send what the row has: Semble rejects null for typed arguments (e.g. phoneNumber without a value).
  const args = { company: r.name, first: r.name, last: "Pharmacy", email: r.email, address: r.address, city: r.city, postcode: r.postcode, country: "IE", ...(r.phone ? { phoneType: "Office", phoneNumber: r.phone } : {}) };
  const used = Object.entries(args).filter(([, v]) => v);
  const d = await gql(
    `mutation C(${used.map(([k]) => `$${k}: String`).join(", ")}) { createContact(${used.map(([k]) => `${k}: $${k}`).join(", ")}) { data { id } error } }`,
    Object.fromEntries(used),
  );
  const id = d.createContact.data?.id;
  if (!id) { console.error("  ! failed:", r.name, d.createContact.error); continue; }
  await gql(`mutation M($id: ID!, $k: String!, $v: String!) { updateContactMetadata(contactId: $id, key: $k, value: $v) { data { id } error } }`, { id, k: "portalKind", v: "pharmacy" });
  if (r.county) await gql(`mutation M($id: ID!, $k: String!, $v: String!) { updateContactMetadata(contactId: $id, key: $k, value: $v) { data { id } error } }`, { id, k: "county", v: r.county });
  created++;
  if (created % 50 === 0) console.log(`  … ${created}/${todo.length}`);
  await sleep(300);
}
console.log(`created ${created}`);
