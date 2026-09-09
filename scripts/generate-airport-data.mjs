/**
 * Regenerates src/airportData.ts from OurAirports' public-domain dataset
 * (https://github.com/davidmegginson/ourairports-data), which maps every IATA-coded
 * airport worldwide to its city/country — far more complete than any manually curated
 * list can be (a real gap this project hit: South Africa was entirely absent from the
 * original hand-curated table until this generator replaced it).
 *
 * OurAirports' data is public domain (Unlicense) — see the source repo's LICENSE.md.
 *
 * Usage: node scripts/generate-airport-data.mjs
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AIRPORTS_URL = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv";
const COUNTRIES_URL = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/countries.csv";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (c === "\r") {
      // skip
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res.text();
}

const [airportsRaw, countriesRaw] = await Promise.all([fetchText(AIRPORTS_URL), fetchText(COUNTRIES_URL)]);

const countryRows = parseCsv(countriesRaw);
const countryHeader = countryRows[0];
const codeIdx = countryHeader.indexOf("code");
const nameIdx = countryHeader.indexOf("name");
const countryMap = new Map();
for (const r of countryRows.slice(1)) {
  if (r.length < countryHeader.length) continue;
  countryMap.set(r[codeIdx], r[nameIdx]);
}

const airportRows = parseCsv(airportsRaw);
const header = airportRows[0];
const iataIdx = header.indexOf("iata_code");
const nameIdxA = header.indexOf("name");
const municipalityIdx = header.indexOf("municipality");
const isoCountryIdx = header.indexOf("iso_country");
const typeIdx = header.indexOf("type");

const table = {};
for (const r of airportRows.slice(1)) {
  if (r.length < header.length) continue;
  const iata = r[iataIdx];
  if (!/^[A-Z]{3}$/.test(iata)) continue;
  if (r[typeIdx] === "closed") continue;

  const countryName = countryMap.get(r[isoCountryIdx]);
  if (!countryName) continue;
  if (table[iata]) continue; // keep first occurrence for a handful of shared/reused codes

  const city = r[municipalityIdx] || r[nameIdxA];
  table[iata] = { city, country: countryName };
}

const codes = Object.keys(table).sort();
const lines = codes.map((code) => `  ${JSON.stringify(code)}: ${JSON.stringify(table[code])},`);

const output = `/**
 * GENERATED FILE — do not hand-edit. Run \`node scripts/generate-airport-data.mjs\` to
 * refresh from OurAirports' public-domain dataset
 * (https://github.com/davidmegginson/ourairports-data, Unlicense).
 *
 * Generated ${new Date().toISOString().slice(0, 10)}. ${codes.length} IATA-coded airports.
 */

/** IATA airport code -> city/municipality and full country name. */
export const AIRPORT_DATA: Record<string, { city: string; country: string }> = {
${lines.join("\n")}
};
`;

await writeFile(path.join(__dirname, "../src/airportData.ts"), output);
console.log(`Wrote src/airportData.ts with ${codes.length} airports`);
