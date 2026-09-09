export interface AirportInfo {
  city: string;
  /** Full country name, matching the strings used elsewhere in this package (e.g. "Philippines"). */
  country: string;
}

/**
 * IATA airport code -> city/country. This is a curated starter set (Philippine
 * airports plus the international destinations most commonly booked out of the
 * Philippines), not a complete IATA dataset — per the lessons-learned doc, shipping a
 * real, complete IATA-code-to-country table is real work worth doing before relying on
 * this in production. Extend this table (or swap it for a maintained dataset, e.g. an
 * OurAirports CSV import) as real tickets turn up codes it doesn't cover. An unknown
 * code resolves to `null`, never a guess.
 */
export const AIRPORT_COUNTRY_TABLE: Record<string, AirportInfo> = {
  // --- Philippines (domestic) ---
  MNL: { city: "Manila", country: "Philippines" },
  CRK: { city: "Clark/Angeles", country: "Philippines" },
  CEB: { city: "Cebu", country: "Philippines" },
  DVO: { city: "Davao", country: "Philippines" },
  ILO: { city: "Iloilo", country: "Philippines" },
  BCD: { city: "Bacolod", country: "Philippines" },
  TAG: { city: "Tagbilaran (Bohol)", country: "Philippines" },
  PPS: { city: "Puerto Princesa (Palawan)", country: "Philippines" },
  USU: { city: "Busuanga/Coron", country: "Philippines" },
  KLO: { city: "Kalibo", country: "Philippines" },
  MPH: { city: "Caticlan (Boracay)", country: "Philippines" },
  GES: { city: "General Santos", country: "Philippines" },
  ZAM: { city: "Zamboanga", country: "Philippines" },
  CGY: { city: "Cagayan de Oro", country: "Philippines" },
  TAC: { city: "Tacloban", country: "Philippines" },
  DGT: { city: "Dumaguete", country: "Philippines" },
  LAO: { city: "Laoag", country: "Philippines" },
  SUG: { city: "Surigao", country: "Philippines" },
  OZC: { city: "Ozamiz", country: "Philippines" },
  BXU: { city: "Butuan", country: "Philippines" },
  CYZ: { city: "Cauayan", country: "Philippines" },
  MBT: { city: "Masbate", country: "Philippines" },
  TDG: { city: "Tandag", country: "Philippines" },
  VRC: { city: "Virac (Catanduanes)", country: "Philippines" },
  CYP: { city: "Calbayog", country: "Philippines" },
  LGP: { city: "Legazpi", country: "Philippines" },
  WNP: { city: "Naga", country: "Philippines" },
  SFS: { city: "Subic Bay", country: "Philippines" },
  RXS: { city: "Roxas", country: "Philippines" },
  SJI: { city: "San Jose (Mindoro)", country: "Philippines" },

  // --- East Asia ---
  NRT: { city: "Tokyo (Narita)", country: "Japan" },
  HND: { city: "Tokyo (Haneda)", country: "Japan" },
  KIX: { city: "Osaka (Kansai)", country: "Japan" },
  NGO: { city: "Nagoya", country: "Japan" },
  FUK: { city: "Fukuoka", country: "Japan" },
  CTS: { city: "Sapporo (New Chitose)", country: "Japan" },
  ICN: { city: "Seoul (Incheon)", country: "South Korea" },
  GMP: { city: "Seoul (Gimpo)", country: "South Korea" },
  PUS: { city: "Busan", country: "South Korea" },
  CJU: { city: "Jeju", country: "South Korea" },
  TPE: { city: "Taipei (Taoyuan)", country: "Taiwan" },
  TSA: { city: "Taipei (Songshan)", country: "Taiwan" },
  KHH: { city: "Kaohsiung", country: "Taiwan" },
  HKG: { city: "Hong Kong", country: "Hong Kong" },
  MFM: { city: "Macau", country: "Macau" },
  PEK: { city: "Beijing (Capital)", country: "China" },
  PKX: { city: "Beijing (Daxing)", country: "China" },
  PVG: { city: "Shanghai (Pudong)", country: "China" },
  SHA: { city: "Shanghai (Hongqiao)", country: "China" },
  CAN: { city: "Guangzhou", country: "China" },
  SZX: { city: "Shenzhen", country: "China" },
  XMN: { city: "Xiamen", country: "China" },

  // --- Southeast Asia ---
  SIN: { city: "Singapore", country: "Singapore" },
  KUL: { city: "Kuala Lumpur", country: "Malaysia" },
  BKI: { city: "Kota Kinabalu", country: "Malaysia" },
  BKK: { city: "Bangkok (Suvarnabhumi)", country: "Thailand" },
  DMK: { city: "Bangkok (Don Mueang)", country: "Thailand" },
  HKT: { city: "Phuket", country: "Thailand" },
  CNX: { city: "Chiang Mai", country: "Thailand" },
  HAN: { city: "Hanoi", country: "Vietnam" },
  SGN: { city: "Ho Chi Minh City", country: "Vietnam" },
  DAD: { city: "Da Nang", country: "Vietnam" },
  PNH: { city: "Phnom Penh", country: "Cambodia" },
  REP: { city: "Siem Reap", country: "Cambodia" },
  VTE: { city: "Vientiane", country: "Laos" },
  RGN: { city: "Yangon", country: "Myanmar" },
  BWN: { city: "Bandar Seri Begawan", country: "Brunei" },
  CGK: { city: "Jakarta", country: "Indonesia" },
  DPS: { city: "Denpasar (Bali)", country: "Indonesia" },
  SUB: { city: "Surabaya", country: "Indonesia" },

  // --- South Asia ---
  DEL: { city: "Delhi", country: "India" },
  BOM: { city: "Mumbai", country: "India" },
  BLR: { city: "Bengaluru", country: "India" },
  MAA: { city: "Chennai", country: "India" },
  CMB: { city: "Colombo", country: "Sri Lanka" },
  KTM: { city: "Kathmandu", country: "Nepal" },
  DAC: { city: "Dhaka", country: "Bangladesh" },
  KHI: { city: "Karachi", country: "Pakistan" },

  // --- Middle East ---
  DXB: { city: "Dubai", country: "United Arab Emirates" },
  AUH: { city: "Abu Dhabi", country: "United Arab Emirates" },
  SHJ: { city: "Sharjah", country: "United Arab Emirates" },
  DOH: { city: "Doha", country: "Qatar" },
  KWI: { city: "Kuwait City", country: "Kuwait" },
  BAH: { city: "Manama", country: "Bahrain" },
  MCT: { city: "Muscat", country: "Oman" },
  RUH: { city: "Riyadh", country: "Saudi Arabia" },
  JED: { city: "Jeddah", country: "Saudi Arabia" },
  DMM: { city: "Dammam", country: "Saudi Arabia" },
  MED: { city: "Medina", country: "Saudi Arabia" },
  AMM: { city: "Amman", country: "Jordan" },
  TLV: { city: "Tel Aviv", country: "Israel" },
  IST: { city: "Istanbul", country: "Turkey" },
  SAW: { city: "Istanbul (Sabiha Gokcen)", country: "Turkey" },

  // --- Oceania ---
  SYD: { city: "Sydney", country: "Australia" },
  MEL: { city: "Melbourne", country: "Australia" },
  BNE: { city: "Brisbane", country: "Australia" },
  PER: { city: "Perth", country: "Australia" },
  ADL: { city: "Adelaide", country: "Australia" },
  DRW: { city: "Darwin", country: "Australia" },
  AKL: { city: "Auckland", country: "New Zealand" },
  WLG: { city: "Wellington", country: "New Zealand" },
  GUM: { city: "Guam", country: "Guam" },
  SPN: { city: "Saipan", country: "Northern Mariana Islands" },

  // --- North America ---
  LAX: { city: "Los Angeles", country: "United States" },
  SFO: { city: "San Francisco", country: "United States" },
  JFK: { city: "New York (JFK)", country: "United States" },
  EWR: { city: "Newark", country: "United States" },
  ORD: { city: "Chicago (O'Hare)", country: "United States" },
  SEA: { city: "Seattle", country: "United States" },
  IAD: { city: "Washington (Dulles)", country: "United States" },
  ATL: { city: "Atlanta", country: "United States" },
  HNL: { city: "Honolulu", country: "United States" },
  LAS: { city: "Las Vegas", country: "United States" },
  DFW: { city: "Dallas/Fort Worth", country: "United States" },
  YVR: { city: "Vancouver", country: "Canada" },
  YYZ: { city: "Toronto", country: "Canada" },
  YYC: { city: "Calgary", country: "Canada" },

  // --- Europe ---
  LHR: { city: "London (Heathrow)", country: "United Kingdom" },
  LGW: { city: "London (Gatwick)", country: "United Kingdom" },
  MAN: { city: "Manchester", country: "United Kingdom" },
  CDG: { city: "Paris (Charles de Gaulle)", country: "France" },
  FRA: { city: "Frankfurt", country: "Germany" },
  MUC: { city: "Munich", country: "Germany" },
  FCO: { city: "Rome (Fiumicino)", country: "Italy" },
  MXP: { city: "Milan (Malpensa)", country: "Italy" },
  MAD: { city: "Madrid", country: "Spain" },
  BCN: { city: "Barcelona", country: "Spain" },
  AMS: { city: "Amsterdam", country: "Netherlands" },
  ZRH: { city: "Zurich", country: "Switzerland" },
  VIE: { city: "Vienna", country: "Austria" },
  CPH: { city: "Copenhagen", country: "Denmark" },
  ARN: { city: "Stockholm (Arlanda)", country: "Sweden" },
  OSL: { city: "Oslo", country: "Norway" },
  DUB: { city: "Dublin", country: "Ireland" },
  BRU: { city: "Brussels", country: "Belgium" },
  ATH: { city: "Athens", country: "Greece" },
  LIS: { city: "Lisbon", country: "Portugal" },
  WAW: { city: "Warsaw", country: "Poland" },
};

/** Looks up an IATA airport code's city/country. Returns null for an unrecognized code — never a guess. */
export function lookupAirport(iataCode: string): AirportInfo | null {
  const code = iataCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return AIRPORT_COUNTRY_TABLE[code] ?? null;
}
