import { EXTRACTED_BASELINE_ROWS, EXTRACTED_MAPPINGS } from "./workbookSeed.js";

export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const DEFAULT_NON_WORKING_CODES = ["", "V", "UP", "WO", "AL", "UPL", "PC"];

export const DEMO_BASELINE_ROWS = EXTRACTED_BASELINE_ROWS.map((row) => ({
  id: crypto.randomUUID(),
  ...row,
}));

export const DEMO_MAPPINGS = [
  ...EXTRACTED_MAPPINGS.map((mapping) => ({
    id: crypto.randomUUID(),
    ...mapping,
  })),
  { id: crypto.randomUUID(), sourceName: "F&B - Nickel Lounge", targetName: "F&B - Millies" },
  { id: crypto.randomUUID(), sourceName: "Conceagre", targetName: "Front Office" },
  { id: crypto.randomUUID(), sourceName: "Concierge", targetName: "Front Office" },
  { id: crypto.randomUUID(), sourceName: "Rooms Concierge", targetName: "Front Office" },
];

export const DEMO_SETTINGS = {
  weeksInYear: 48,
  annualDays: 365,
  daysOff: 48,
  publicHolidays: 11,
};

export const DEMO_ROSTER_TEXT = `100011\tAmina Noor\tF&B - Electric\tP\tP\tP\tP\tP\tP\tP
100012\tRafi Ahmed\tF&B - Electric\tP\tWO\tP\tP\tP\tP\tP
100013\tMila Joseph\tF&B - Cecconis\tP\tP\tP\tP\tP\tP\tP
100014\tKabir Hasan\tF&B - Cecconis\tP\tP\tWO\tP\tP\tP\tP
100015\tLayla Kareem\tConceagre\tP\tP\tP\tWO\tP\tP\tP
100016\tOmar Nabil\tFront Office\tP\tP\tP\tP\tP\tWO\tP
100017\tSara Iqbal\tNed SPA\tP\tP\tAL\tP\tP\tP\tP`;
