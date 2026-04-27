import { EXTRACTED_BASELINE_ROWS, EXTRACTED_MAPPINGS } from "./workbookSeed.js";

export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const DEFAULT_NON_WORKING_CODES = ["", "V", "UP", "WO", "AL", "UPL", "PC", "X", "OC", "CD"];

const AUTO_COMPLIANCE_BUDGETS = {
  "F&B - Electric": "8",
  "F&B - Ceecconi's": "14",
  "F&B - Kaia": "9",
  "F&B - Millies": "43",
  "F&B - Malibu": "13",
  "F&B - Hadika": "7",
  "Cake Shop": "3",
  "F&B - Banquet": "9",
  "F&B - IRD": "6",
  "F&B - Ned Club": "25",
  "F&B - Admin": "",
  "CUL - Neds Club": "10",
  "CUL - Pastry": "16",
  "CUL - Millies": "10",
  "CUL - Ceconi's": "11",
  "CUL - Electric": "4",
  "CUL - Kaia": "5",
  "CUL - Malibu": "10",
  "CUL - Hadika": "4",
  "CUL - Banquet": "19",
  "CUL - QIA": "",
  "BOH Stewarding": "16",
  "CUL - Butchery": "4",
  "Front Office": "",
  "Ned SPA": "",
  "Housekeeping": "",
  "Security": "",
  "Hygiene": "",
  "Engineering": "",
  "Membership / Club": "",
  "Finance": "",
  "HR": "",
  "Cafeteria": "",
  "Sales & Marketing": "",
};

const BUDGET_ALIASES = {
  "F&B - Cecconis": "F&B - Ceecconi's",
  "CUL - Cecconis": "CUL - Ceconi's",
  "BOH - Stewarding": "BOH Stewarding",
  "CUL - Cafeteria": "Cafeteria",
};

export const DEMO_BASELINE_ROWS = EXTRACTED_BASELINE_ROWS.map((row) => ({
  id: crypto.randomUUID(),
  ...row,
  budgetHeadcount:
    (row.rowType || "shift") === "summary"
      ? AUTO_COMPLIANCE_BUDGETS[row.subDepartment] ??
        AUTO_COMPLIANCE_BUDGETS[BUDGET_ALIASES[row.subDepartment]] ??
        ""
      : "",
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

export const DEMO_ATTENDANCE_TEXT = `100011\tAmina Noor\tF&B - Electric\tR\tR\tR\tR\tR\tR\tR
100012\tRafi Ahmed\tF&B - Electric\tR\tWO\tR\tR\tR\tR\tR
100013\tMila Joseph\tF&B - Cecconis\tR\tR\tR\tR\tR\tR\tR
100014\tKabir Hasan\tF&B - Cecconis\tR\tR\tWO\tR\tR\tR\tR
100015\tLayla Kareem\tConceagre\tR\tR\tR\tWO\tR\tR\tR
100016\tOmar Nabil\tFront Office\tR\tR\tR\tR\tR\tWO\tR
100017\tSara Iqbal\tNed SPA\tR\tR\tAL\tR\tR\tR\tR`;
