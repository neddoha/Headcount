import {
  DAYS,
  DEFAULT_NON_WORKING_CODES,
  DEMO_ATTENDANCE_TEXT,
  DEMO_BASELINE_ROWS,
  DEMO_MAPPINGS,
  DEMO_ROSTER_TEXT,
  DEMO_SETTINGS,
} from "./data.js";

const storageKeys = {
  baselineRows: "shift-headcount-baseline-rows",
  mappings: "shift-headcount-mappings",
  settings: "shift-headcount-settings",
  rosterUpload: "shift-headcount-roster-upload",
  rosterHistory: "shift-headcount-roster-history",
  attendanceUpload: "shift-headcount-attendance-upload",
  attendanceHistory: "shift-headcount-attendance-history",
};

const elements = {
  loginOverlay: document.querySelector("#login-overlay"),
  loginForm: document.querySelector("#login-form"),
  loginMessage: document.querySelector("#login-message"),
  loginHint: document.querySelector("#login-hint"),
  sessionSummary: document.querySelector("#session-summary"),
  logoutBtn: document.querySelector("#logout-btn"),
  headerLogoutBtn: document.querySelector("#header-logout-btn"),
  navLinks: document.querySelectorAll(".nav-link"),
  views: document.querySelectorAll(".view"),
  viewTitle: document.querySelector("#view-title"),
  viewSubtitle: document.querySelector("#view-subtitle"),
  seedDataBtn: document.querySelector("#seed-data-btn"),
  exportStateBtn: document.querySelector("#export-state-btn"),
  summaryCards: document.querySelector("#summary-cards"),
  heroStats: document.querySelector("#hero-stats"),
  recentUpload: document.querySelector("#recent-upload"),
  uploadHistory: document.querySelector("#upload-history"),
  shortageTable: document.querySelector("#shortage-table"),
  baselineForm: document.querySelector("#baseline-form"),
  baselineDepartmentFilter: document.querySelector("#baseline-department-filter"),
  baselineTable: document.querySelector("#baseline-table"),
  departmentForm: document.querySelector("#department-form"),
  departmentStatus: document.querySelector("#department-status"),
  settingsForm: document.querySelector("#settings-form"),
  ftePreview: document.querySelector("#fte-preview"),
  mappingForm: document.querySelector("#mapping-form"),
  mappingStatus: document.querySelector("#mapping-status"),
  mappingTable: document.querySelector("#mapping-table"),
  mismatchReview: document.querySelector("#mismatch-review"),
  rosterForm: document.querySelector("#roster-form"),
  rosterDepartmentFilter: document.querySelector("#roster-department-filter"),
  rosterSubDepartmentFilter: document.querySelector("#roster-subdepartment-filter"),
  rosterSearch: document.querySelector("#roster-search"),
  rosterTable: document.querySelector("#roster-table"),
  uploadValidation: document.querySelector("#upload-validation"),
  attendanceForm: document.querySelector("#attendance-form"),
  attendanceDepartmentFilter: document.querySelector("#attendance-department-filter"),
  attendanceSubDepartmentFilter: document.querySelector("#attendance-subdepartment-filter"),
  attendanceSearch: document.querySelector("#attendance-search"),
  attendanceTable: document.querySelector("#attendance-table"),
  attendanceSummary: document.querySelector("#attendance-summary"),
  attendanceValidation: document.querySelector("#attendance-validation"),
  blankDepartmentFilter: document.querySelector("#blank-department-filter"),
  blankSubDepartmentFilter: document.querySelector("#blank-subdepartment-filter"),
  blankRosterCheck: document.querySelector("#blank-roster-check"),
  complianceWeekFilter: document.querySelector("#compliance-week-filter"),
  complianceDepartmentFilter: document.querySelector("#compliance-department-filter"),
  complianceTable: document.querySelector("#compliance-table"),
  reportsTypeFilter: document.querySelector("#reports-type-filter"),
  reportsDepartmentFilter: document.querySelector("#reports-department-filter"),
  reportsSummary: document.querySelector("#reports-summary"),
  reportsCharts: document.querySelector("#reports-charts"),
};

const FORCED_MAPPING_OVERRIDES = {
  "f&b - nickel lounge": "F&B - Millies",
};

const OPEN_ACCESS_USER = {
  username: "open-access",
  name: "Open Access",
  role: "admin",
};

const authState = {
  environment: "development",
  usesDefaultCredentials: true,
  authDisabled: false,
};

let currentUser = await initializeSession();
const state = await initializeState();
let lastSyncedStateSignature = createStateSignature(state);
let updateStream = null;
const viewState = {
  complianceWeek: "",
  baselineDepartment: "all",
  complianceDepartment: "all",
  reportsType: "classic",
  reportsDepartment: "all",
  rosterDepartment: "all",
  rosterSubDepartment: "all",
  attendanceDepartment: "all",
  attendanceSubDepartment: "all",
  blankDepartment: "all",
  blankSubDepartment: "all",
  rosterSearch: "",
  attendanceSearch: "",
};

seedForms();
bindEvents();
render();
activateView("baseline");
startServerSync();

async function initializeState() {
  const localState = loadStateFromLocal();
  const remoteState = await loadStateFromApi();
  return reconcileLoadedState(remoteState || localState);
}

async function initializeSession() {
  try {
    const response = await fetch("/api/auth/session", {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (!response.ok) return null;
    const payload = await response.json();
    authState.environment = payload?.auth?.environment || "development";
    authState.usesDefaultCredentials = payload?.auth?.usesDefaultCredentials ?? true;
    authState.authDisabled = payload?.auth?.authDisabled ?? false;
    if (authState.authDisabled) {
      return payload?.user || OPEN_ACCESS_USER;
    }
    return payload?.user || null;
  } catch {
    return null;
  }
}

function loadStateFromLocal() {
  const baselineRows = loadJSON(storageKeys.baselineRows, DEMO_BASELINE_ROWS);
  const mappings = loadJSON(storageKeys.mappings, DEMO_MAPPINGS);
  const settings = loadJSON(storageKeys.settings, DEMO_SETTINGS);
  const defaultWeekStart = getCurrentWeekStart();
  const demoUpload = createRosterUpload("Week 1 Demo", DEMO_ROSTER_TEXT, DEMO_MAPPINGS, baselineRows, defaultWeekStart);
  const demoAttendance = createAttendanceUpload("Attendance Demo", DEMO_ATTENDANCE_TEXT, DEMO_MAPPINGS, baselineRows, defaultWeekStart);
  const rosterUpload = loadJSON(storageKeys.rosterUpload, demoUpload);
  const rosterHistory = loadJSON(storageKeys.rosterHistory, [historySnapshot(demoUpload)]);
  const attendanceUpload = loadJSON(storageKeys.attendanceUpload, demoAttendance);
  const attendanceHistory = loadJSON(storageKeys.attendanceHistory, [historySnapshot(demoAttendance)]);
  return { baselineRows, mappings, settings, rosterUpload, rosterHistory, attendanceUpload, attendanceHistory };
}

function loadJSON(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return structuredClone(fallback);
  try {
    return JSON.parse(raw);
  } catch {
    return structuredClone(fallback);
  }
}

async function loadStateFromApi() {
  try {
    const response = await fetch("/api/state", {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload?.state) return null;
    return payload.state;
  } catch {
    return null;
  }
}

async function persistStateToApi() {
  if (!currentUser) return;
  try {
    const response = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        state: {
          baselineRows: state.baselineRows,
          mappings: state.mappings,
        settings: state.settings,
        rosterUpload: state.rosterUpload,
        rosterHistory: state.rosterHistory,
        attendanceUpload: state.attendanceUpload,
        attendanceHistory: state.attendanceHistory,
      },
    }),
    });
    return response.ok;
  } catch {
    // Local storage remains the fallback when the backend is unavailable.
    return false;
  }
}

function applyLoadedState(loadedState) {
  const reconciled = reconcileLoadedState(loadedState);
  state.baselineRows = reconciled.baselineRows;
  state.mappings = reconciled.mappings;
  state.settings = reconciled.settings;
  state.rosterUpload = reconciled.rosterUpload;
  state.rosterHistory = reconciled.rosterHistory;
  state.attendanceUpload = reconciled.attendanceUpload;
  state.attendanceHistory = reconciled.attendanceHistory;
  seedForms();
}

function reconcileLoadedState(loadedState) {
  const source = loadedState || {};
  const baselineRows = mergeBaselineRows(source.baselineRows || []);
  const mappings = mergeMappings(source.mappings || []);
  const settings = source.settings || structuredClone(DEMO_SETTINGS);
  const rosterUpload = source.rosterUpload?.rawText
    ? createRosterUpload(
        source.rosterUpload.label || "Latest Upload",
        source.rosterUpload.rawText,
        mappings,
        baselineRows,
        source.rosterUpload.weekStart || getCurrentWeekStart(),
      )
    : createRosterUpload("Week 1 Demo", DEMO_ROSTER_TEXT, mappings, baselineRows, getCurrentWeekStart());
  const rosterHistory = normalizeUploadHistory(source.rosterHistory, rosterUpload, "roster", mappings, baselineRows);
  const attendanceUpload = source.attendanceUpload?.rawText
    ? createAttendanceUpload(
        source.attendanceUpload.label || "Latest Attendance",
        source.attendanceUpload.rawText,
        mappings,
        baselineRows,
        source.attendanceUpload.weekStart || getCurrentWeekStart(),
      )
    : createAttendanceUpload("Attendance Demo", DEMO_ATTENDANCE_TEXT, mappings, baselineRows, getCurrentWeekStart());
  const attendanceHistory = normalizeUploadHistory(source.attendanceHistory, attendanceUpload, "attendance", mappings, baselineRows);
  return { baselineRows, mappings, settings, rosterUpload, rosterHistory, attendanceUpload, attendanceHistory };
}

function mergeBaselineRows(existingRows) {
  let rows = Array.isArray(existingRows)
    ? existingRows.filter((row) => row.shiftName !== "Imported Baseline")
    : [];
  if (shouldRestoreWorkbookBaseline(rows)) {
    return structuredClone(DEMO_BASELINE_ROWS);
  }
  rows = rows.map((row) =>
    ["guest experience", "engineering"].includes(normalizeName(row.subDepartment))
      ? {
          ...row,
          mainDepartment: normalizeName(row.subDepartment) === "engineering" ? "Engineering" : "Guest Experience",
          subDepartment: normalizeName(row.subDepartment) === "engineering" ? "Engineering" : row.subDepartment,
        }
      : row,
  );
  const knownKeys = new Set(
    rows.map(
      (row) =>
        `${normalizeName(row.mainDepartment)}|||${normalizeName(row.subDepartment)}|||${normalizeName(row.shiftName)}|||${normalizeName(row.positionName)}|||${row.rowType || "shift"}`,
    ),
  );
  DEMO_BASELINE_ROWS.forEach((row) => {
    const normalizedRow = ["guest experience", "engineering"].includes(normalizeName(row.subDepartment))
      ? {
          ...row,
          mainDepartment: normalizeName(row.subDepartment) === "engineering" ? "Engineering" : "Guest Experience",
          subDepartment: normalizeName(row.subDepartment) === "engineering" ? "Engineering" : row.subDepartment,
        }
      : row;
    const key = `${normalizeName(normalizedRow.mainDepartment)}|||${normalizeName(normalizedRow.subDepartment)}|||${normalizeName(normalizedRow.shiftName)}|||${normalizeName(normalizedRow.positionName)}|||${normalizedRow.rowType || "shift"}`;
    if (!knownKeys.has(key)) {
      rows.push(structuredClone(normalizedRow));
      return;
    }
    if ((normalizedRow.rowType || "shift") !== "summary" || !normalizedRow.budgetHeadcount) return;
    rows = rows.map((existingRow) => {
      const existingKey = `${normalizeName(existingRow.mainDepartment)}|||${normalizeName(existingRow.subDepartment)}|||${normalizeName(existingRow.shiftName)}|||${normalizeName(existingRow.positionName)}|||${existingRow.rowType || "shift"}`;
      if (existingKey !== key || existingRow.budgetHeadcount) return existingRow;
      return {
        ...existingRow,
        budgetHeadcount: normalizedRow.budgetHeadcount,
      };
    });
  });
  return rows;
}

function shouldRestoreWorkbookBaseline(rows) {
  if (!rows.length) return true;
  const hasAnyValue = rows.some((row) =>
    [...DAYS, "weeklyTotal"].some((key) => Number(row?.[key] || 0) > 0),
  );
  return !hasAnyValue;
}

function mergeMappings(existingMappings) {
  const mappings = Array.isArray(existingMappings) ? [...existingMappings] : [];
  const knownKeys = new Set(
    mappings.map((item) => `${normalizeName(item.sourceName)}|||${normalizeName(item.targetName)}`),
  );
  DEMO_MAPPINGS.forEach((item) => {
    const key = `${normalizeName(item.sourceName)}|||${normalizeName(item.targetName)}`;
    if (!knownKeys.has(key)) {
      mappings.push(structuredClone(item));
    }
  });
  Object.entries(FORCED_MAPPING_OVERRIDES).forEach(([sourceKey, targetName]) => {
    const existingIndex = mappings.findIndex((item) => normalizeName(item.sourceName) === sourceKey);
    if (existingIndex >= 0) {
      mappings[existingIndex] = {
        ...mappings[existingIndex],
        targetName,
      };
    } else {
      mappings.push({
        id: crypto.randomUUID(),
        sourceName: sourceKey,
        targetName,
      });
    }
  });
  return mappings;
}

async function saveState() {
  localStorage.setItem(storageKeys.baselineRows, JSON.stringify(state.baselineRows));
  localStorage.setItem(storageKeys.mappings, JSON.stringify(state.mappings));
  localStorage.setItem(storageKeys.settings, JSON.stringify(state.settings));
  localStorage.setItem(storageKeys.rosterUpload, JSON.stringify(state.rosterUpload));
  localStorage.setItem(storageKeys.rosterHistory, JSON.stringify(state.rosterHistory));
  localStorage.setItem(storageKeys.attendanceUpload, JSON.stringify(state.attendanceUpload));
  localStorage.setItem(storageKeys.attendanceHistory, JSON.stringify(state.attendanceHistory));
  lastSyncedStateSignature = createStateSignature(state);
  return await persistStateToApi();
}

function startServerSync() {
  startLiveUpdates();
  window.addEventListener("focus", () => {
    refreshStateFromServer();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshStateFromServer();
    }
  });
  setInterval(async () => {
    if (!currentUser || isUserEditingInput()) return;
    await refreshStateFromServer();
  }, 5000);
}

function startLiveUpdates() {
  if (updateStream || !window.EventSource) return;
  updateStream = new EventSource("/api/updates", { withCredentials: true });
  updateStream.addEventListener("state", async () => {
    if (isUserEditingInput()) return;
    await refreshStateFromServer();
  });
  updateStream.addEventListener("error", () => {
    updateStream?.close();
    updateStream = null;
    setTimeout(() => startLiveUpdates(), 5000);
  });
}

async function refreshStateFromServer() {
  const remoteState = await loadStateFromApi();
  if (!remoteState) return;
  const remoteSignature = createStateSignature(remoteState);
  if (remoteSignature === lastSyncedStateSignature) return;
  applyLoadedState(remoteState);
  lastSyncedStateSignature = createStateSignature(state);
  render();
}

function isUserEditingInput() {
  const activeElement = document.activeElement;
  if (!activeElement) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName);
}

function createStateSignature(source) {
  return JSON.stringify({
    baselineRows: source.baselineRows || [],
    mappings: source.mappings || [],
    settings: source.settings || {},
    rosterUpload: source.rosterUpload || {},
    rosterHistory: source.rosterHistory || [],
    attendanceUpload: source.attendanceUpload || {},
    attendanceHistory: source.attendanceHistory || [],
  });
}

function seedForms() {
  elements.rosterForm.elements.uploadLabel.value = state.rosterUpload.label;
  elements.rosterForm.elements.weekStart.value = state.rosterUpload.weekStart || getCurrentWeekStart();
  elements.rosterForm.elements.rosterText.value = state.rosterUpload.rawText;
  elements.attendanceForm.elements.uploadLabel.value = state.attendanceUpload.label;
  elements.attendanceForm.elements.weekStart.value = state.attendanceUpload.weekStart || getCurrentWeekStart();
  elements.attendanceForm.elements.attendanceText.value = state.attendanceUpload.rawText;
  elements.settingsForm.elements.weeksInYear.value = state.settings.weeksInYear;
  elements.settingsForm.elements.annualDays.value = state.settings.annualDays;
  elements.settingsForm.elements.daysOff.value = state.settings.daysOff;
  elements.settingsForm.elements.publicHolidays.value = state.settings.publicHolidays;
  seedDepartmentForm();
}

function seedDepartmentForm() {
  const departments = [...new Set(state.baselineRows.map((row) => row.mainDepartment))].sort((a, b) => a.localeCompare(b));
  elements.departmentForm.elements.currentDepartment.innerHTML = [
    '<option value="">Add new department only</option>',
    ...departments.map((department) => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`),
  ].join("");
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", () => {
    elements.loginMessage.textContent = "Signing in...";
  });

    [elements.logoutBtn, elements.headerLogoutBtn].forEach((button) => button.addEventListener("click", async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      } catch {
      // Ignore logout transport failures and clear local session view.
    }
    currentUser = null;
    render();
  }));

  elements.navLinks.forEach((button) => {
    button.addEventListener("click", () => activateView(button.dataset.view));
  });

  elements.exportStateBtn.addEventListener("click", exportState);

  elements.baselineDepartmentFilter.addEventListener("change", (event) => {
    viewState.baselineDepartment = event.target.value;
    renderBaselineTable();
  });

  elements.complianceDepartmentFilter.addEventListener("change", (event) => {
    viewState.complianceDepartment = event.target.value;
    const baselineSummary = aggregateBaseline(state.baselineRows);
    const complianceSummary = buildComplianceRowsForSelectedWeek(baselineSummary);
    renderComplianceTable(complianceSummary);
  });

  elements.complianceWeekFilter.addEventListener("change", (event) => {
    viewState.complianceWeek = event.target.value;
    const baselineSummary = aggregateBaseline(state.baselineRows);
    renderComplianceTable(complianceSummary);
    renderReports(complianceSummary);
    renderHeroStats(baselineSummary, complianceSummary);
    renderSummaryCards(complianceSummary);
    renderShortageTable(complianceSummary);
    renderRecentUpload();
  });

  elements.reportsDepartmentFilter.addEventListener("change", (event) => {
    viewState.reportsDepartment = event.target.value;
    const baselineSummary = aggregateBaseline(state.baselineRows);
    const complianceSummary = buildComplianceRowsForSelectedWeek(baselineSummary);
    renderReports(complianceSummary);
  });

  elements.reportsTypeFilter.addEventListener("change", (event) => {
    viewState.reportsType = event.target.value;
    const baselineSummary = aggregateBaseline(state.baselineRows);
    const complianceSummary = buildComplianceRowsForSelectedWeek(baselineSummary);
    renderReports(complianceSummary);
  });

  elements.rosterDepartmentFilter.addEventListener("change", (event) => {
    viewState.rosterDepartment = event.target.value;
    viewState.rosterSubDepartment = "all";
    renderDepartmentFilters();
    renderRosterTable();
  });

  elements.rosterSubDepartmentFilter.addEventListener("change", (event) => {
    viewState.rosterSubDepartment = event.target.value;
    renderRosterTable();
  });

  elements.rosterSearch.addEventListener("input", (event) => {
    viewState.rosterSearch = event.target.value.trim().toLowerCase();
    renderRosterTable();
  });

  elements.attendanceDepartmentFilter.addEventListener("change", (event) => {
    viewState.attendanceDepartment = event.target.value;
    viewState.attendanceSubDepartment = "all";
    renderDepartmentFilters();
    renderAttendanceTable();
  });

  elements.attendanceSubDepartmentFilter.addEventListener("change", (event) => {
    viewState.attendanceSubDepartment = event.target.value;
    renderAttendanceTable();
  });

  elements.blankDepartmentFilter.addEventListener("change", (event) => {
    viewState.blankDepartment = event.target.value;
    viewState.blankSubDepartment = "all";
    renderDepartmentFilters();
    renderBlankRosterCheck();
  });

  elements.blankSubDepartmentFilter.addEventListener("change", (event) => {
    viewState.blankSubDepartment = event.target.value;
    renderBlankRosterCheck();
  });

  elements.attendanceSearch.addEventListener("input", (event) => {
    viewState.attendanceSearch = event.target.value.trim().toLowerCase();
    renderAttendanceTable();
  });

  elements.seedDataBtn.addEventListener("click", () => {
    const defaultWeekStart = getCurrentWeekStart();
    state.baselineRows = structuredClone(DEMO_BASELINE_ROWS);
    state.mappings = structuredClone(DEMO_MAPPINGS);
    state.settings = structuredClone(DEMO_SETTINGS);
    state.rosterUpload = createRosterUpload("Week 1 Demo", DEMO_ROSTER_TEXT, DEMO_MAPPINGS, state.baselineRows, defaultWeekStart);
    state.attendanceUpload = createAttendanceUpload("Attendance Demo", DEMO_ATTENDANCE_TEXT, DEMO_MAPPINGS, state.baselineRows, defaultWeekStart);
    state.rosterHistory = [historySnapshot(state.rosterUpload)];
    state.attendanceHistory = [historySnapshot(state.attendanceUpload)];
    viewState.complianceWeek = defaultWeekStart;
    seedForms();
    saveState();
    render();
  });

  elements.baselineForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isAdmin()) return;
    const form = new FormData(event.currentTarget);
    const editingId = event.currentTarget.dataset.editingId;
    const row = {
      id: editingId || crypto.randomUUID(),
      mainDepartment: form.get("mainDepartment").trim(),
      subDepartment: form.get("subDepartment").trim(),
      shiftName: form.get("shiftName").trim(),
      positionName: form.get("positionName").trim(),
      rowType: "shift",
      requiredFte: "",
      ...Object.fromEntries(DAYS.map((day) => [day, Number(form.get(day) || 0)])),
    };
    if (editingId) {
      state.baselineRows = state.baselineRows.map((item) => (item.id === editingId ? row : item));
      delete event.currentTarget.dataset.editingId;
    } else {
      state.baselineRows.unshift(row);
    }
    event.currentTarget.reset();
    saveState();
    render();
  });

  elements.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isAdmin()) return;
    const form = new FormData(event.currentTarget);
    state.settings = {
      weeksInYear: Number(form.get("weeksInYear")),
      annualDays: Number(form.get("annualDays")),
      daysOff: Number(form.get("daysOff")),
      publicHolidays: Number(form.get("publicHolidays")),
    };
    saveState();
    render();
  });

  elements.departmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) return;
    const form = new FormData(event.currentTarget);
    const currentDepartment = String(form.get("currentDepartment") || "").trim();
    const departmentName = String(form.get("departmentName") || "").trim();

    if (!departmentName) {
      elements.departmentStatus.innerHTML = "<p>Department name is required.</p>";
      return;
    }

    if (!currentDepartment) {
      elements.departmentStatus.innerHTML = `<p>New department <strong>${escapeHtml(departmentName)}</strong> is now available. Add baseline rows using that main department name in Baseline Shift.</p>`;
      event.currentTarget.reset();
      seedDepartmentForm();
      return;
    }

    state.baselineRows = state.baselineRows.map((row) =>
      row.mainDepartment === currentDepartment
        ? {
            ...row,
            mainDepartment: departmentName,
          }
        : row,
    );
    reprocessCurrentRosterWithMappings();
    const saved = await saveState();
    elements.departmentStatus.innerHTML = saved === false
      ? `<p>Department renamed locally from <strong>${escapeHtml(currentDepartment)}</strong> to <strong>${escapeHtml(departmentName)}</strong>, but the server copy could not be updated.</p>`
      : `<p>Department renamed from <strong>${escapeHtml(currentDepartment)}</strong> to <strong>${escapeHtml(departmentName)}</strong>.</p>`;
    event.currentTarget.reset();
    seedDepartmentForm();
    render();
  });

  elements.mappingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) return;
    const form = new FormData(event.currentTarget);
    const editingId = event.currentTarget.dataset.editingId;
    const sourceName = form.get("sourceName").trim();
    const targetName = form.get("targetName").trim();
    const duplicate = state.mappings.some(
      (item) =>
        item.id !== editingId &&
        normalizeName(item.sourceName) === normalizeName(sourceName) &&
        normalizeName(item.targetName) === normalizeName(targetName),
    );
    if (!sourceName || !targetName) {
      elements.mappingStatus.innerHTML = "<p>Both Paste RS Name and Baseline Sub-Department are required.</p>";
      return;
    }
    if (duplicate) {
      elements.mappingStatus.innerHTML = "<p>This department mapping already exists.</p>";
      return;
    }
    const mapping = {
      id: editingId || crypto.randomUUID(),
      sourceName,
      targetName,
    };
    if (editingId) {
      state.mappings = state.mappings.map((item) => (item.id === editingId ? mapping : item));
      delete event.currentTarget.dataset.editingId;
    } else {
      state.mappings.unshift(mapping);
    }
    event.currentTarget.reset();
    reprocessCurrentRosterWithMappings();
    const saved = await saveState();
    elements.mappingStatus.innerHTML = saved === false
      ? "<p>Mapping added locally, but the server copy could not be updated.</p>"
      : "<p>Department mapping saved successfully.</p>";
    render();
  });

  elements.rosterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.rosterUpload = createRosterUpload(
      form.get("uploadLabel").trim(),
      form.get("rosterText"),
      state.mappings,
      state.baselineRows,
      form.get("weekStart"),
    );
    upsertUploadHistory("roster", state.rosterUpload);
    viewState.complianceWeek = state.rosterUpload.weekStart;
    saveState();
    render();
    activateView("compliance");
  });

  elements.attendanceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.attendanceUpload = createAttendanceUpload(
      form.get("uploadLabel").trim(),
      form.get("attendanceText"),
      state.mappings,
      state.baselineRows,
      form.get("weekStart"),
    );
    upsertUploadHistory("attendance", state.attendanceUpload);
    viewState.complianceWeek = state.attendanceUpload.weekStart;
    saveState();
    render();
    activateView("compliance");
  });

  elements.baselineTable.addEventListener("click", async (event) => {
    if (!isAdmin()) return;
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const rowId = button.dataset.id;
    if (button.dataset.action === "save-baseline-inline") {
      const tableRow = button.closest("tr[data-row-id]");
      if (!tableRow) return;
      updateBaselineRowFromTable(tableRow);
      await saveState();
      render();
      return;
    }
    if (button.dataset.action === "delete-baseline") {
      state.baselineRows = state.baselineRows.filter((row) => row.id !== rowId);
      await saveState();
      render();
    }
  });

  elements.mappingTable.addEventListener("click", (event) => {
    if (!isAdmin()) return;
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const mappingId = button.dataset.id;
    if (button.dataset.action === "edit-mapping") loadMappingIntoForm(mappingId);
    if (button.dataset.action === "delete-mapping") {
      state.mappings = state.mappings.filter((item) => item.id !== mappingId);
      reprocessCurrentRosterWithMappings();
      saveState();
      render();
    }
  });

  elements.mismatchReview.addEventListener("click", (event) => {
    if (!isAdmin()) return;
    const button = event.target.closest("button[data-source][data-target]");
    if (!button) return;
    state.mappings.unshift({
      id: crypto.randomUUID(),
      sourceName: button.dataset.source,
      targetName: button.dataset.target,
    });
    reprocessCurrentRosterWithMappings();
    saveState();
    render();
  });

  elements.uploadHistory.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-history-index]");
    if (!button) return;
    const item = state.rosterHistory[Number(button.dataset.historyIndex)];
    if (!item) return;
    elements.rosterForm.elements.uploadLabel.value = item.label;
    elements.rosterForm.elements.weekStart.value = item.weekStart || getCurrentWeekStart();
    elements.rosterForm.elements.rosterText.value = item.rawText;
    activateView("roster");
  });
}

function activateView(viewName) {
  elements.navLinks.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  elements.views.forEach((view) => {
    view.classList.toggle("active", view.id === `${viewName}-view`);
  });

    const titles = {
      dashboard: ["Operations Dashboard", "Review staffing baseline, latest roster upload, and department-wise compliance in one place."],
      baseline: ["Baseline Setup", "Admin users can maintain departments, sub-departments, shifts, and formula assumptions."],
      mapping: ["Department Mapping", "Align Paste RS names and misspellings with baseline-controlled department names."],
        roster: ["Paste RS", "Paste daily or weekly roster rows and validate them before compliance calculations run."],
        attendance: ["Attendance", "Paste attendance data and compare actual attendance against roster and baseline."],
        compliance: ["Compliance", "Compare baseline need against roster actual and highlight shortages or excess staffing."],
        reports: ["Reports", "Review compliance data in a classic visual report format with clear colors and quick comparisons."],
        "blank-check": ["Blank Roster Check", "Review rows and days where roster values were left blank before final staffing review."],
      };

  elements.viewTitle.textContent = titles[viewName][0];
  elements.viewSubtitle.textContent = titles[viewName][1];
}

function render() {
  const baselineSummary = aggregateBaseline(state.baselineRows);
  initializeComplianceWeek();
  renderWeekFilters();
  const complianceSummary = buildComplianceRowsForSelectedWeek(baselineSummary);
  renderSessionState();
  renderLoginHint();
  renderDepartmentFilters();
  renderHeroStats(baselineSummary, complianceSummary);
  renderSummaryCards(complianceSummary);
  renderRecentUpload();
  renderUploadHistory();
  renderShortageTable(complianceSummary);
  renderBaselineTable();
  renderFtePreview(baselineSummary);
  renderMappingTable();
  renderMismatchReview();
  renderRosterTable();
  renderUploadValidation();
  renderAttendanceTable();
  renderAttendanceValidation();
  renderBlankRosterCheck();
  renderComplianceTable(complianceSummary);
  renderReports(complianceSummary);
}

function renderLoginHint() {
  const loginError = new URLSearchParams(window.location.search).get("login_error");
  if (loginError) {
    elements.loginMessage.textContent = loginError;
    const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState({}, "", cleanUrl);
  }
  if (!elements.loginHint) return;
  if (authState.authDisabled) {
    elements.loginHint.innerHTML = `
      <p><strong>Open access mode:</strong> login is currently disabled for this environment.</p>
    `;
    return;
  }
  if (authState.environment === "production" && !authState.usesDefaultCredentials) {
    elements.loginHint.innerHTML = `
      <p><strong>Live deployment:</strong> use the admin and user passwords configured in Render.</p>
      <p>The demo passwords shown during local development do not apply to this live site.</p>
    `;
    return;
  }

  elements.loginHint.innerHTML = `
    <p><strong>Demo admin:</strong> <code>admin</code> / <code>Admin@123</code></p>
    <p><strong>Demo user:</strong> <code>user</code> / <code>User@123</code></p>
  `;
}

function renderDepartmentFilters() {
  const departments = [...new Set(state.baselineRows.map((row) => row.mainDepartment))].sort((a, b) => a.localeCompare(b));
  const options = ['<option value="all">All Departments</option>']
    .concat(departments.map((department) => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`))
    .join("");
  const rosterSubDepartments = getSubDepartmentOptions(state.baselineRows, viewState.rosterDepartment);
  const attendanceSubDepartments = getSubDepartmentOptions(state.baselineRows, viewState.attendanceDepartment);
  const blankSubDepartments = getSubDepartmentOptions(state.baselineRows, viewState.blankDepartment);
  const subDepartmentOptions = (items) =>
    ['<option value="all">All Sub-Departments</option>']
      .concat(items.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`))
      .join("");

  elements.baselineDepartmentFilter.innerHTML = options;
  elements.complianceDepartmentFilter.innerHTML = options;
  elements.reportsDepartmentFilter.innerHTML = options;
  elements.rosterDepartmentFilter.innerHTML = options;
  elements.attendanceDepartmentFilter.innerHTML = options;
  elements.blankDepartmentFilter.innerHTML = options;
  elements.rosterSubDepartmentFilter.innerHTML = subDepartmentOptions(rosterSubDepartments);
  elements.attendanceSubDepartmentFilter.innerHTML = subDepartmentOptions(attendanceSubDepartments);
  elements.blankSubDepartmentFilter.innerHTML = subDepartmentOptions(blankSubDepartments);
  elements.baselineDepartmentFilter.value = departments.includes(viewState.baselineDepartment) ? viewState.baselineDepartment : "all";
  elements.complianceDepartmentFilter.value = departments.includes(viewState.complianceDepartment) ? viewState.complianceDepartment : "all";
  elements.reportsTypeFilter.value = ["classic", "line"].includes(viewState.reportsType) ? viewState.reportsType : "classic";
  elements.reportsDepartmentFilter.value = departments.includes(viewState.reportsDepartment) ? viewState.reportsDepartment : "all";
  elements.rosterDepartmentFilter.value = departments.includes(viewState.rosterDepartment) ? viewState.rosterDepartment : "all";
  elements.attendanceDepartmentFilter.value = departments.includes(viewState.attendanceDepartment) ? viewState.attendanceDepartment : "all";
  elements.blankDepartmentFilter.value = departments.includes(viewState.blankDepartment) ? viewState.blankDepartment : "all";
  elements.rosterSubDepartmentFilter.value = rosterSubDepartments.includes(viewState.rosterSubDepartment) ? viewState.rosterSubDepartment : "all";
  elements.attendanceSubDepartmentFilter.value = attendanceSubDepartments.includes(viewState.attendanceSubDepartment) ? viewState.attendanceSubDepartment : "all";
  elements.blankSubDepartmentFilter.value = blankSubDepartments.includes(viewState.blankSubDepartment) ? viewState.blankSubDepartment : "all";
}

function renderWeekFilters() {
  const weekOptions = getAvailableWeekOptions();
  const options = weekOptions
    .map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`)
    .join("");
  elements.complianceWeekFilter.innerHTML = options;
  const allowedWeeks = weekOptions.map((option) => option.value);
  if (!allowedWeeks.includes(viewState.complianceWeek)) {
    viewState.complianceWeek = allowedWeeks[0] || getCurrentWeekStart();
  }
  elements.complianceWeekFilter.value = viewState.complianceWeek;
}

function renderSessionState() {
  const signedIn = Boolean(currentUser);
  document.body.classList.toggle("auth-locked", authState.authDisabled ? false : !signedIn);
  elements.loginOverlay.classList.toggle("active", authState.authDisabled ? false : !signedIn);

  if (authState.authDisabled) {
    elements.sessionSummary.innerHTML = "<p><strong>Open Access</strong></p><p>Login disabled for now</p>";
    elements.logoutBtn.classList.add("is-hidden");
    elements.headerLogoutBtn.classList.add("is-hidden");
    setAdminControlsEnabled(true);
    return;
  }

    if (!signedIn) {
      elements.sessionSummary.innerHTML = "<p>Not signed in.</p>";
      elements.logoutBtn.classList.add("is-hidden");
      elements.headerLogoutBtn.classList.add("is-hidden");
      setAdminControlsEnabled(false);
      return;
    }

  elements.sessionSummary.innerHTML = `
    <p><strong>${escapeHtml(currentUser.name)}</strong></p>
    <p>${escapeHtml(currentUser.role)}</p>
  `;
  elements.logoutBtn.classList.remove("is-hidden");
  elements.headerLogoutBtn.classList.remove("is-hidden");
  setAdminControlsEnabled(isAdmin());
}

function setAdminControlsEnabled(enabled) {
  [elements.baselineForm, elements.settingsForm, elements.mappingForm].forEach((form) => {
    if (!form) return;
    form.querySelectorAll("input, textarea, button").forEach((control) => {
      control.disabled = !enabled;
    });
  });

  elements.seedDataBtn.disabled = !enabled;
  elements.exportStateBtn.disabled = !enabled;
}

function renderHeroStats(baselineSummary, complianceSummary) {
  const shortages = complianceSummary.filter((entry) => entry.weeklyVariance < 0).length;
  const mismatches = unmatchedRosterDepartments(state.rosterUpload.rows, state.baselineRows).length;
  const activeWeekLabel = formatWeekLabel(viewState.complianceWeek);
  const tiles = [
    ["Total Work Areas", `Baseline areas tracked for ${activeWeekLabel}`, String(baselineSummary.length)],
    ["Departments Short", `Areas below required staffing in ${activeWeekLabel}`, String(shortages)],
    ["Mapping Issues", "Paste RS names needing correction", String(mismatches)],
  ];

  elements.heroStats.innerHTML = tiles
    .map(
      ([label, helper, value]) => `
        <div class="mini-stat">
          <span>${label}</span>
          <small>${helper}</small>
          <strong>${value}</strong>
        </div>
      `,
    )
    .join("");
}

function renderSummaryCards(complianceSummary) {
  const weeklyBaseline = complianceSummary.reduce((sum, item) => sum + item.weeklyBaseline, 0);
  const weeklyActual = complianceSummary.reduce((sum, item) => sum + item.weeklyActual, 0);
  const weeklyVariance = weeklyActual - weeklyBaseline;
  const rows = [
    [`Baseline Weekly Need`, weeklyBaseline],
    [`Roster Weekly Actual`, weeklyActual],
    [`Variance`, weeklyVariance],
    ["Mapped Aliases", state.mappings.length],
  ];

  elements.summaryCards.innerHTML = rows
    .map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderRecentUpload() {
  const selectedRosterUpload = getUploadForWeek(state.rosterHistory, state.rosterUpload, viewState.complianceWeek);
  const selectedAttendanceUpload = getUploadForWeek(state.attendanceHistory, state.attendanceUpload, viewState.complianceWeek);
  const createdAt = selectedRosterUpload?.createdAt ? new Date(selectedRosterUpload.createdAt).toLocaleString() : "No roster upload in selected week";
  const attendanceCreatedAt = selectedAttendanceUpload?.createdAt ? new Date(selectedAttendanceUpload.createdAt).toLocaleString() : "No attendance upload in selected week";
  elements.recentUpload.innerHTML = `
    <p><strong>Week View:</strong> ${escapeHtml(formatWeekLabel(viewState.complianceWeek))}</p>
    <p><strong>Roster:</strong> ${escapeHtml(selectedRosterUpload?.label || "No roster upload in selected week")}</p>
    <p>Uploaded: ${createdAt}</p>
    <p>Rows: ${selectedRosterUpload?.rows?.length || 0} | Issues: ${selectedRosterUpload?.issues?.length || 0}</p>
    <p><strong>Attendance:</strong> ${escapeHtml(selectedAttendanceUpload?.label || "No attendance upload in selected week")}</p>
    <p>Uploaded: ${attendanceCreatedAt}</p>
    <p>Rows: ${selectedAttendanceUpload?.rows?.length || 0} | Issues: ${selectedAttendanceUpload?.issues?.length || 0}</p>
  `;
}

function renderUploadHistory() {
  elements.uploadHistory.innerHTML = state.rosterHistory.length
    ? `<div class="history-list">${state.rosterHistory
        .map(
          (item, index) => `
            <div class="history-item">
              <div>
                <p><strong>${escapeHtml(item.label)}</strong></p>
                <p>${escapeHtml(formatWeekLabel(item.weekStart))}</p>
                <p>${new Date(item.createdAt).toLocaleString()}</p>
                <p>Rows: ${item.rowCount} | Issues: ${item.issueCount}</p>
              </div>
              <button class="inline-button" type="button" data-history-index="${index}">Reload</button>
            </div>
          `,
        )
        .join("")}</div>`
    : "<p>No upload history yet.</p>";
}

function renderShortageTable(complianceSummary) {
  elements.shortageTable.innerHTML = complianceSummary
    .slice()
    .sort((left, right) => left.weeklyVariance - right.weeklyVariance)
    .map((entry) => {
      const chipClass = entry.weeklyVariance < 0 ? "status-bad" : entry.weeklyVariance === 0 ? "status-warn" : "status-good";
      return `
        <tr>
          <td>${escapeHtml(entry.mainDepartment)}</td>
          <td>${escapeHtml(entry.subDepartment)}</td>
          <td>${entry.weeklyBaseline}</td>
          <td>${entry.weeklyActual}</td>
          <td><span class="status-chip ${chipClass}">${entry.weeklyVariance}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderBaselineTable() {
  const baselineSummary = aggregateBaseline(state.baselineRows);
  const summaryLookup = new Map(
    baselineSummary.map((entry) => [
      `${normalizeName(entry.mainDepartment)}|||${normalizeName(entry.subDepartment)}`,
      entry,
    ]),
  );
  const sortedRows = [...state.baselineRows].sort((left, right) =>
    `${left.mainDepartment}|${left.subDepartment}|${left.rowType === "summary" ? "zz" : "aa"}|${left.shiftName}|${left.positionName}`.localeCompare(
      `${right.mainDepartment}|${right.subDepartment}|${right.rowType === "summary" ? "zz" : "aa"}|${right.shiftName}|${right.positionName}`,
    ),
  );

  let currentDepartment = "";
  let currentSubDepartment = "";
  const markup = [];
  const selectedDepartment = viewState.baselineDepartment;

  sortedRows.forEach((row) => {
    if (selectedDepartment !== "all" && row.mainDepartment !== selectedDepartment) return;
    const summaryKey = `${normalizeName(row.mainDepartment)}|||${normalizeName(row.subDepartment)}`;
    const liveSummary = summaryLookup.get(summaryKey);
    const displayDayValues = row.rowType === "summary" && liveSummary
      ? liveSummary.baselineByDay
      : row;
    const weeklyTotal = row.rowType === "summary" && liveSummary
      ? liveSummary.weeklyBaseline
      : row.weeklyTotal ?? DAYS.reduce((sum, day) => sum + Number(row[day] || 0), 0);
    const actions = isAdmin()
      ? row.rowType === "summary"
        ? `<span class="status-chip status-warn">Auto total</span>`
        : `
            <button class="inline-button" type="button" data-action="save-baseline-inline" data-id="${row.id}">Save</button>
            <button class="danger-button" type="button" data-action="delete-baseline" data-id="${row.id}">Delete</button>
          `
      : `<span class="status-chip status-warn">View only</span>`;

    const editableCells = row.rowType !== "summary" && isAdmin();
    const dayInputs = DAYS.map((day) => editableCells
      ? `<td><input class="table-input table-input-day" type="number" min="0" step="1" data-field="${day}" value="${Number(row[day] || 0)}"></td>`
      : `<td>${displayDayValues[day]}</td>`)
      .join("");
    const mainDepartmentCell = editableCells
      ? `<td><input class="table-input" type="text" data-field="mainDepartment" value="${escapeHtml(row.mainDepartment)}"></td>`
      : `<td>${escapeHtml(row.mainDepartment)}</td>`;
    const subDepartmentCell = editableCells
      ? `<td><input class="table-input" type="text" data-field="subDepartment" value="${escapeHtml(row.subDepartment)}"></td>`
      : `<td>${escapeHtml(row.subDepartment)}</td>`;
    const shiftCell = editableCells
      ? `<td><input class="table-input" type="text" data-field="shiftName" value="${escapeHtml(row.shiftName)}"></td>`
      : `<td>${escapeHtml(row.shiftName)}</td>`;
    const positionCell = editableCells
      ? `<td><input class="table-input" type="text" data-field="positionName" value="${escapeHtml(row.positionName)}"></td>`
      : `<td>${escapeHtml(row.rowType === "summary" ? `FTE ${row.requiredFte || ""}`.trim() : row.positionName)}</td>`;

    if (row.mainDepartment !== currentDepartment) {
      currentDepartment = row.mainDepartment;
      currentSubDepartment = "";
      markup.push(`
        <tr class="group-row department-row">
          <td colspan="13"><strong>${escapeHtml(currentDepartment)}</strong></td>
        </tr>
      `);
    }

    if (row.subDepartment !== currentSubDepartment) {
      currentSubDepartment = row.subDepartment;
      markup.push(`
        <tr class="group-row subdepartment-row">
          <td colspan="13">${escapeHtml(currentSubDepartment)}</td>
        </tr>
      `);
    }

    markup.push(`
        <tr class="${row.rowType === "summary" ? "summary-row" : ""}" data-row-id="${row.id}">
          ${mainDepartmentCell}
          ${subDepartmentCell}
          ${shiftCell}
          ${positionCell}
          ${dayInputs}
          <td>${weeklyTotal}</td>
          <td class="actions-cell">${actions}</td>
        </tr>
    `);
  });

  elements.baselineTable.innerHTML = markup.join("");
}

function renderFtePreview(baselineSummary) {
  const netWorkingDays = computeNetWorkingDays(state.settings);
  const weeklyShiftTotal = baselineSummary.reduce((sum, row) => sum + row.weeklyBaseline, 0);
  const requiredFte = netWorkingDays > 0
    ? ((weeklyShiftTotal * state.settings.weeksInYear) / netWorkingDays).toFixed(2)
    : "0.00";

  elements.ftePreview.innerHTML = `
    <p>Net Working Days: <strong>${netWorkingDays}</strong></p>
    <p>Weekly Shift Total: <strong>${weeklyShiftTotal}</strong></p>
    <p>Required FTE: <strong>${requiredFte}</strong></p>
  `;
}

function renderMappingTable() {
  elements.mappingTable.innerHTML = state.mappings
    .map(
      (mapping) => `
        <tr>
          <td>${escapeHtml(mapping.sourceName)}</td>
          <td>${escapeHtml(mapping.targetName)}</td>
          <td class="actions-cell">
            ${
              isAdmin()
                ? `
                  <button class="inline-button" type="button" data-action="edit-mapping" data-id="${mapping.id}">Edit</button>
                  <button class="danger-button" type="button" data-action="delete-mapping" data-id="${mapping.id}">Delete</button>
                `
                : `<span class="status-chip status-warn">View only</span>`
            }
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderMismatchReview() {
  if (!isAdmin()) {
    elements.mismatchReview.innerHTML = "<p>Admin access required to manage alias mismatches.</p>";
    return;
  }
  const mismatches = buildMismatchSuggestions(state.rosterUpload.rows, state.baselineRows, state.mappings);
  if (!mismatches.length) {
    elements.mismatchReview.innerHTML = "<p>All Paste RS department names currently map to a baseline sub-department.</p>";
    return;
  }

  elements.mismatchReview.innerHTML = `<div class="suggestion-list">${mismatches
    .map((item) => {
      const action = item.suggestion
        ? `
          <button class="inline-button" type="button" data-source="${escapeHtml(item.source)}" data-target="${escapeHtml(item.suggestion)}">
            Map to ${escapeHtml(item.suggestion)}
          </button>
        `
        : "<span class='status-chip status-warn'>No close match</span>";
      return `
        <div class="suggestion-item">
          <div class="suggestion-copy">
            <p><strong>${escapeHtml(item.source)}</strong> is not mapped.</p>
            <p>${item.suggestion ? `Suggested baseline: ${escapeHtml(item.suggestion)}` : "Add a manual alias mapping."}</p>
          </div>
          ${action}
        </div>
      `;
    })
    .join("")}</div>`;
}

function renderRosterTable() {
  const search = viewState.rosterSearch;
  const departmentLookup = buildDepartmentLookup(state.baselineRows);
  elements.rosterTable.innerHTML = state.rosterUpload.rows
    .filter((row) => {
      const mainDepartment = departmentLookup.get(normalizeName(row.mappedSubDepartment)) || "";
      if (viewState.rosterDepartment !== "all" && mainDepartment !== viewState.rosterDepartment) return false;
      if (viewState.rosterSubDepartment !== "all" && row.mappedSubDepartment !== viewState.rosterSubDepartment) return false;
      if (!search) return true;
      const haystack = [
        row.sourceRowNumber,
        row.employeeId,
        row.employeeName,
        row.rosterDepartment,
        row.mappedSubDepartment,
        mainDepartment,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    })
    .map((row) => `
        <tr>
          <td>${row.sourceRowNumber}</td>
          <td>${escapeHtml(row.employeeId)}</td>
          <td>${escapeHtml(row.employeeName)}</td>
          <td>${escapeHtml(row.rosterDepartment)}</td>
        <td>${escapeHtml(row.mappedSubDepartment || "Unmapped")}</td>
        ${DAYS.map((day) => `<td>${escapeHtml(row[day])}</td>`).join("")}
      </tr>
    `)
    .join("");
}

function renderUploadValidation() {
  elements.uploadValidation.innerHTML = state.rosterUpload.issues.length
    ? state.rosterUpload.issues.map((issue) => `<p>${escapeHtml(issue)}</p>`).join("")
    : "<p>No upload issues found. Paste RS rows are ready for compliance calculation.</p>";
}

function renderAttendanceTable() {
  const search = viewState.attendanceSearch;
  const departmentLookup = buildDepartmentLookup(state.baselineRows);
  const filteredRows = state.attendanceUpload.rows
    .filter((row) => {
      const mainDepartment = departmentLookup.get(normalizeName(row.mappedSubDepartment)) || "";
      if (viewState.attendanceDepartment !== "all" && mainDepartment !== viewState.attendanceDepartment) return false;
      if (viewState.attendanceSubDepartment !== "all" && row.mappedSubDepartment !== viewState.attendanceSubDepartment) return false;
      if (!search) return true;
      const haystack = [
        row.sourceRowNumber,
        row.employeeId,
        row.employeeName,
        row.rosterDepartment,
        row.mappedSubDepartment,
        mainDepartment,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    })
  elements.attendanceTable.innerHTML = filteredRows
    .map((row) => `
      <tr>
        <td>${row.sourceRowNumber}</td>
        <td>${escapeHtml(row.employeeId)}</td>
        <td>${escapeHtml(row.employeeName)}</td>
        <td>${escapeHtml(row.rosterDepartment)}</td>
        <td>${escapeHtml(row.mappedSubDepartment || "Unmapped")}</td>
        ${DAYS.map((day) => `<td>${escapeHtml(row[day])}</td>`).join("")}
      </tr>
    `)
    .join("");
  renderAttendanceSummary(filteredRows, departmentLookup);
}

function renderAttendanceSummary(filteredRows, departmentLookup) {
  const presentByDay = emptyDayMap();
  const countedCodes = { OW: 0, PW: 0, R: 0 };
  filteredRows.forEach((row) => {
    DAYS.forEach((day) => {
      const code = String(row[day] || "").trim().toUpperCase();
      if (countedCodes[code] !== undefined) {
        countedCodes[code] += 1;
      }
      if (countsAsWorking(code)) {
        presentByDay[day] += 1;
      }
    });
  });
  const mainDepartmentLabel = viewState.attendanceDepartment === "all" ? "All Departments" : viewState.attendanceDepartment;
  const subDepartmentLabel = viewState.attendanceSubDepartment === "all" ? "All Sub-Departments" : viewState.attendanceSubDepartment;
  const mappedCount = filteredRows.filter((row) => departmentLookup.get(normalizeName(row.mappedSubDepartment)) || row.mappedSubDepartment).length;
  const countedTotal = countedCodes.OW + countedCodes.PW + countedCodes.R;
  elements.attendanceSummary.innerHTML = `
    <p><strong>Filtered attendance rows:</strong> ${filteredRows.length}</p>
    <p><strong>Department:</strong> ${escapeHtml(mainDepartmentLabel)} | <strong>Sub-Department:</strong> ${escapeHtml(subDepartmentLabel)}</p>
    <p><strong>Mapped rows in selection:</strong> ${mappedCount}</p>
    <p><strong>OW count:</strong> ${countedCodes.OW} | <strong>PW count:</strong> ${countedCodes.PW} | <strong>R count:</strong> ${countedCodes.R} | <strong>Total counted:</strong> ${countedTotal}</p>
    <p><strong>Present count by day:</strong> Sun ${presentByDay.sun}, Mon ${presentByDay.mon}, Tue ${presentByDay.tue}, Wed ${presentByDay.wed}, Thu ${presentByDay.thu}, Fri ${presentByDay.fri}, Sat ${presentByDay.sat}</p>
  `;
}

function renderAttendanceValidation() {
  elements.attendanceValidation.innerHTML = state.attendanceUpload.issues.length
    ? state.attendanceUpload.issues.map((issue) => `<p>${escapeHtml(issue)}</p>`).join("")
    : "<p>No attendance upload issues found. Attendance rows are ready for compliance comparison.</p>";
}

function renderBlankRosterCheck() {
  const blanks = collectBlankRosterEntries(state.rosterUpload.rows, state.baselineRows);
  const filteredBlanks = blanks.filter((entry) => {
    const departmentMatch = viewState.blankDepartment === "all" || entry.mainDepartment === viewState.blankDepartment;
    const subDepartmentMatch = viewState.blankSubDepartment === "all" || entry.subDepartment === viewState.blankSubDepartment;
    return departmentMatch && subDepartmentMatch;
  });

  if (!filteredBlanks.length) {
    elements.blankRosterCheck.innerHTML = "<p>No blank roster cells found. All roster days are updated.</p>";
    return;
  }

  const sortedBlanks = filteredBlanks.sort((left, right) =>
    `${left.mainDepartment}|${left.subDepartment}|${left.employeeName}|${left.employeeId}`.localeCompare(
      `${right.mainDepartment}|${right.subDepartment}|${right.employeeName}|${right.employeeId}`,
    ),
  );

  elements.blankRosterCheck.innerHTML = `
    <p><strong>${filteredBlanks.length}</strong> blank roster entries found.</p>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th>ID</th>
            <th>Name</th>
            <th>Main Department</th>
            <th>Sub-Department</th>
            <th>Paste RS Department</th>
            <th>Missing Days</th>
          </tr>
        </thead>
        <tbody>
          ${sortedBlanks
            .map(
              (entry) => `
                <tr>
                  <td>${entry.rowNumber}</td>
                  <td>${escapeHtml(entry.employeeId || "Missing ID")}</td>
                  <td>${escapeHtml(entry.employeeName || "Unknown Employee")}</td>
                  <td>${escapeHtml(entry.mainDepartment || "Unmatched")}</td>
                  <td>${escapeHtml(entry.subDepartment || "Unmapped")}</td>
                  <td>${escapeHtml(entry.rosterDepartment || "Missing Department")}</td>
                  <td>${escapeHtml(entry.missingDays.join(", "))}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderComplianceTable(complianceSummary) {
  const rows = [];
  complianceSummary
    .filter((entry) => viewState.complianceDepartment === "all" || entry.mainDepartment === viewState.complianceDepartment)
    .forEach((entry) => {
      rows.push(`
        <tr class="compliance-group-row">
          <td colspan="11">
            <div class="compliance-group-heading">
              <span class="compliance-group-department">${escapeHtml(entry.mainDepartment)}</span>
              <span class="compliance-group-divider">/</span>
              <span class="compliance-group-subdepartment">${escapeHtml(entry.subDepartment)}</span>
            </div>
          </td>
        </tr>
      `);
      rows.push(buildMetricRow(entry, "Baseline Need", entry.baselineByDay, entry.weeklyBaseline));
      rows.push(buildMetricRow(entry, "Roster Actual", entry.actualByDay, entry.weeklyActual));
      rows.push(buildMetricRow(entry, "Roster Actual - Baseline Need", entry.baselineVarianceByDay, entry.weeklyBaselineVariance));
      rows.push(buildMetricRow(entry, "Attendance Actual", entry.attendanceByDay, entry.weeklyAttendance));
      rows.push(buildMetricRow(entry, "Attendance Actual - Roster Actual", entry.rosterAttendanceVarianceByDay, entry.weeklyRosterAttendanceVariance));
      rows.push(
        buildMetricRow(
          entry,
          "Total (Shifts)",
          entry.summaryByDay,
          entry.weeklySummaryTotal,
          entry.requiredFte,
        ),
      );
    });
  elements.complianceTable.innerHTML = rows.join("");
}

function renderReports(complianceSummary) {
  const filtered = complianceSummary.filter(
    (entry) => viewState.reportsDepartment === "all" || entry.mainDepartment === viewState.reportsDepartment,
  );

  if (!filtered.length) {
    elements.reportsSummary.innerHTML = "<p>No report data available for the selected department.</p>";
    elements.reportsCharts.innerHTML = "";
    return;
  }

  const summary = {
    baseline: filtered.reduce((sum, item) => sum + item.weeklyBaseline, 0),
    roster: filtered.reduce((sum, item) => sum + item.weeklyActual, 0),
    attendance: filtered.reduce((sum, item) => sum + item.weeklyAttendance, 0),
    baselineGap: filtered.reduce((sum, item) => sum + item.weeklyBaselineVariance, 0),
    attendanceGap: filtered.reduce((sum, item) => sum + item.weeklyRosterAttendanceVariance, 0),
  };

  elements.reportsSummary.innerHTML = `
    <div class="report-card report-card-baseline">
      <span>Baseline Need</span>
      <strong>${summary.baseline}</strong>
    </div>
    <div class="report-card report-card-roster">
      <span>Roster Actual</span>
      <strong>${summary.roster}</strong>
    </div>
    <div class="report-card report-card-attendance">
      <span>Attendance Actual</span>
      <strong>${summary.attendance}</strong>
    </div>
    <div class="report-card report-card-gap">
      <span>Roster Actual - Baseline Need</span>
      <strong>${summary.baselineGap}</strong>
    </div>
    <div class="report-card report-card-gap">
      <span>Attendance Actual - Roster Actual</span>
      <strong>${summary.attendanceGap}</strong>
    </div>
  `;

  if (viewState.reportsType === "line") {
    const dailySeries = DAYS.map((day) => ({
      day,
      baseline: filtered.reduce((sum, item) => sum + item.baselineByDay[day], 0),
      roster: filtered.reduce((sum, item) => sum + item.actualByDay[day], 0),
      attendance: filtered.reduce((sum, item) => sum + item.attendanceByDay[day], 0),
    }));

    const peakValue = Math.max(
      ...dailySeries.flatMap((item) => [item.baseline, item.roster, item.attendance, 1]),
    );

    elements.reportsCharts.innerHTML = `
      <section class="report-section">
        <div class="panel-header">
          <h3>Weekly Trend Line</h3>
          <span class="caption">Baseline, roster, and attendance across Sun to Sat for the selected department view</span>
        </div>
        <div class="report-legend">
          <span class="legend-chip legend-baseline">Baseline</span>
          <span class="legend-chip legend-roster">Roster</span>
          <span class="legend-chip legend-attendance">Attendance</span>
        </div>
        <div class="report-line-shell">
          ${buildReportLineChart(dailySeries, peakValue)}
        </div>
      </section>

      <section class="report-section">
        <div class="panel-header">
          <h3>Daily Totals</h3>
          <span class="caption">Simple day-by-day totals shown under the same line chart values</span>
        </div>
        <div class="report-day-grid">
          ${dailySeries
            .map(
              (item) => `
                <div class="report-day-card">
                  <h4>${item.day.toUpperCase()}</h4>
                  <p><span>Baseline</span><strong>${item.baseline}</strong></p>
                  <p><span>Roster</span><strong>${item.roster}</strong></p>
                  <p><span>Attendance</span><strong>${item.attendance}</strong></p>
                </div>
              `,
            )
            .join("")}
        </div>
      </section>
    `;
    return;
  }

  const maxWeekly = Math.max(...filtered.flatMap((item) => [item.weeklyBaseline, item.weeklyActual, item.weeklyAttendance, 1]));

  elements.reportsCharts.innerHTML = `
    <section class="report-section">
      <div class="panel-header">
        <h3>Weekly Comparison by Sub-Department</h3>
        <span class="caption">Classic side-by-side bars for baseline, roster, and attendance</span>
      </div>
      <div class="report-legend">
        <span class="legend-chip legend-baseline">Baseline</span>
        <span class="legend-chip legend-roster">Roster</span>
        <span class="legend-chip legend-attendance">Attendance</span>
      </div>
      <div class="report-bar-list">
        ${filtered
          .map(
            (entry) => `
              <div class="report-bar-row">
                <div class="report-bar-label">
                  <strong>${escapeHtml(entry.subDepartment)}</strong>
                  <span>${escapeHtml(entry.mainDepartment)}</span>
                </div>
                <div class="report-bar-track">
                  ${buildReportBar("Baseline", entry.weeklyBaseline, maxWeekly, "baseline")}
                  ${buildReportBar("Roster", entry.weeklyActual, maxWeekly, "roster")}
                  ${buildReportBar("Attendance", entry.weeklyAttendance, maxWeekly, "attendance")}
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>

    <section class="report-section">
      <div class="panel-header">
        <h3>Variance Overview</h3>
        <span class="caption">Quick visual read of both compliance gaps</span>
      </div>
      <div class="report-variance-grid">
        ${filtered
          .map(
            (entry) => `
              <article class="report-variance-card">
                <h4>${escapeHtml(entry.subDepartment)}</h4>
                <p class="report-variance-line">
                  <span>Roster Actual - Baseline Need</span>
                  <strong class="${varianceCellClass(entry.weeklyBaselineVariance)}">${entry.weeklyBaselineVariance}</strong>
                </p>
                <p class="report-variance-line">
                  <span>Attendance Actual - Roster Actual</span>
                  <strong class="${varianceCellClass(entry.weeklyRosterAttendanceVariance)}">${entry.weeklyRosterAttendanceVariance}</strong>
                </p>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>

    <section class="report-section">
      <div class="panel-header">
        <h3>Daily Snapshot</h3>
        <span class="caption">Baseline, roster, and attendance totals by day for the selected view</span>
      </div>
      <div class="report-day-grid">
        ${DAYS.map((day) => {
          const baseline = filtered.reduce((sum, item) => sum + item.baselineByDay[day], 0);
          const roster = filtered.reduce((sum, item) => sum + item.actualByDay[day], 0);
          const attendance = filtered.reduce((sum, item) => sum + item.attendanceByDay[day], 0);
          return `
            <div class="report-day-card">
              <h4>${day.toUpperCase()}</h4>
              <p><span>Baseline</span><strong>${baseline}</strong></p>
              <p><span>Roster</span><strong>${roster}</strong></p>
              <p><span>Attendance</span><strong>${attendance}</strong></p>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function buildReportLineChart(series, peakValue) {
  const width = 860;
  const height = 250;
  const padding = { top: 18, right: 22, bottom: 38, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(peakValue, 1);
  const stepX = series.length > 1 ? plotWidth / (series.length - 1) : 0;
  const yTicks = 4;

  const xAt = (index) => padding.left + (stepX * index);
  const yAt = (value) => padding.top + plotHeight - ((value / maxValue) * plotHeight);
  const linePath = (key) => series
    .map((item, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(2)} ${yAt(item[key]).toFixed(2)}`)
    .join(" ");
  const tickValues = Array.from({ length: yTicks + 1 }, (_, index) => Math.round((maxValue / yTicks) * (yTicks - index)));

  return `
    <svg viewBox="0 0 ${width} ${height}" class="report-line-chart" role="img" aria-label="Line chart showing baseline, roster, and attendance by day">
      <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="#ffffff"></rect>
      ${tickValues
        .map((tick) => `
          <line
            x1="${padding.left}"
            y1="${yAt(tick).toFixed(2)}"
            x2="${width - padding.right}"
            y2="${yAt(tick).toFixed(2)}"
            class="report-line-grid"
          ></line>
          <text x="${padding.left - 10}" y="${(yAt(tick) + 4).toFixed(2)}" class="report-line-axis-text report-line-axis-y">${tick}</text>
        `)
        .join("")}
      <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" class="report-line-axis"></line>
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotHeight}" class="report-line-axis"></line>
      <path d="${linePath("baseline")}" class="report-line-path report-line-path-baseline"></path>
      <path d="${linePath("roster")}" class="report-line-path report-line-path-roster"></path>
      <path d="${linePath("attendance")}" class="report-line-path report-line-path-attendance"></path>
      ${series
        .flatMap((item, index) => ([
          buildReportLinePoint(xAt(index), yAt(item.baseline), "baseline", item.baseline, item.day),
          buildReportLinePoint(xAt(index), yAt(item.roster), "roster", item.roster, item.day),
          buildReportLinePoint(xAt(index), yAt(item.attendance), "attendance", item.attendance, item.day),
          `<text x="${xAt(index).toFixed(2)}" y="${height - 12}" text-anchor="middle" class="report-line-axis-text">${item.day.toUpperCase()}</text>`,
        ]))
        .join("")}
    </svg>
  `;
}

function buildReportLinePoint(x, y, tone, value, day) {
  return `
    <g>
      <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="6.5" class="report-line-point report-line-point-${tone}"></circle>
      <title>${day.toUpperCase()} ${tone}: ${value}</title>
    </g>
  `;
}

function buildReportBar(label, value, maxWeekly, tone) {
  const width = Math.max((value / maxWeekly) * 100, value > 0 ? 8 : 0);
  return `
    <div class="report-bar report-bar-${tone}">
      <span class="report-bar-title">${label}</span>
      <div class="report-bar-fill" style="width:${width}%"></div>
      <strong>${value}</strong>
    </div>
  `;
}

function buildMetricRow(entry, label, byDay, weeklyTotal, requiredFte = "") {
  const isVarianceMetric = isVarianceLabel(label);
  const rowClass = [
    "compliance-metric-row",
    isVarianceMetric ? "variance-row" : "",
    label === "Total (Shifts)" ? "summary-row" : "",
    label === "Baseline Need" ? "baseline-row" : "",
    label === "Roster Actual" ? "actual-row" : "",
    label === "Attendance Actual" ? "attendance-row" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const isShiftSummary = label === "Total (Shifts)";
  const formattedFte = formatFte(requiredFte);
  const formattedBudget = formatBudget(entry.budgetHeadcount);
  const weeklyDisplay = isShiftSummary
    ? buildShiftSummaryDisplay(formattedBudget, formattedFte)
    : weeklyTotal;
  return `
    <tr class="${rowClass}">
      <td class="compliance-dimension-cell">${escapeHtml(entry.mainDepartment)}</td>
      <td class="compliance-dimension-cell">${escapeHtml(entry.subDepartment)}</td>
      <td class="metric-cell"><span class="metric-pill metric-pill-${metricPillClass(label)}">${label}</span></td>
      ${DAYS.map((day) => {
        const value = isShiftSummary ? "" : byDay[day];
        const cellClasses = ["day-value-cell"];
        if (isVarianceMetric) cellClasses.push(varianceCellClass(byDay[day]));
        return `<td class="${cellClasses.join(" ")}">${value}</td>`;
      }).join("")}
      <td class="weekly-total-cell ${isVarianceMetric ? varianceCellClass(weeklyTotal) : ""}">${weeklyDisplay}</td>
    </tr>
  `;
}

function metricPillClass(label) {
  if (label === "Baseline Need") return "baseline";
  if (label === "Roster Actual") return "actual";
  if (label === "Attendance Actual") return "attendance";
  if (isVarianceLabel(label)) return "variance";
  return "summary";
}

function isVarianceLabel(label) {
  return [
    "Variance",
    "Roster Actual - Baseline Need",
    "Attendance Actual - Roster Actual",
  ].includes(label);
}

function formatFte(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  return String(Math.round(numeric));
}

function formatBudget(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || value === "") return "";
  return String(Math.round(numeric));
}

function buildShiftSummaryDisplay(formattedBudget, formattedFte) {
  const parts = [];
  if (formattedBudget) {
    parts.push(`Budget ${formattedBudget}`);
  }
  parts.push(`${formattedFte} FTE`);
  return parts.join(" | ");
}

function varianceCellClass(value) {
  const numeric = Number(value || 0);
  if (numeric > 0) return "variance-negative";
  if (numeric < 0) return "variance-positive";
  return "variance-neutral";
}

function aggregateBaseline(rows) {
  const groups = new Map();
  const summaries = new Map();
  rows.filter((row) => (row.rowType || "shift") === "shift").forEach((row) => {
    const key = `${row.mainDepartment}|||${row.subDepartment}`;
    if (!groups.has(key)) {
      groups.set(key, {
        mainDepartment: row.mainDepartment,
        subDepartment: row.subDepartment,
        baselineByDay: emptyDayMap(),
      });
    }
    const target = groups.get(key);
    DAYS.forEach((day) => {
      target.baselineByDay[day] += Number(row[day] || 0);
    });
  });
  rows.filter((row) => (row.rowType || "shift") === "summary").forEach((row) => {
    const key = `${row.mainDepartment}|||${row.subDepartment}`;
    summaries.set(key, {
      requiredFte: row.requiredFte || "",
      budgetHeadcount: row.budgetHeadcount || "",
      summaryByDay: {
        sun: Number(row.sun || 0),
        mon: Number(row.mon || 0),
        tue: Number(row.tue || 0),
        wed: Number(row.wed || 0),
        thu: Number(row.thu || 0),
        fri: Number(row.fri || 0),
        sat: Number(row.sat || 0),
      },
      weeklyTotal: Number(row.weeklyTotal || 0),
    });
  });
  return Array.from(groups.values()).map((group) => ({
    ...group,
    weeklyBaseline: sumDayMap(group.baselineByDay),
    summary: summaries.get(`${group.mainDepartment}|||${group.subDepartment}`) || null,
  }));
}

function buildComplianceRows(baselineSummary, rosterRows, attendanceRows) {
  return baselineSummary.map((baselineEntry) => {
    const actualByDay = emptyDayMap();
    rosterRows
      .filter((row) => normalizeName(row.mappedSubDepartment) === normalizeName(baselineEntry.subDepartment))
      .forEach((row) => {
        DAYS.forEach((day) => {
          if (countsAsWorking(row[day])) actualByDay[day] += 1;
        });
      });

    const attendanceByDay = emptyDayMap();
    attendanceRows
      .filter((row) => normalizeName(row.mappedSubDepartment) === normalizeName(baselineEntry.subDepartment))
      .forEach((row) => {
        DAYS.forEach((day) => {
          if (countsAsWorking(row[day])) attendanceByDay[day] += 1;
        });
      });

    const baselineVarianceByDay = emptyDayMap();
    const rosterAttendanceVarianceByDay = emptyDayMap();
    DAYS.forEach((day) => {
      baselineVarianceByDay[day] = actualByDay[day] - baselineEntry.baselineByDay[day];
      rosterAttendanceVarianceByDay[day] = attendanceByDay[day] - actualByDay[day];
    });

    return {
      mainDepartment: baselineEntry.mainDepartment,
      subDepartment: baselineEntry.subDepartment,
      baselineByDay: baselineEntry.baselineByDay,
      summaryByDay: baselineEntry.baselineByDay,
      requiredFte: baselineEntry.summary?.requiredFte || "",
      budgetHeadcount: baselineEntry.summary?.budgetHeadcount || "",
      actualByDay,
      attendanceByDay,
      baselineVarianceByDay,
      rosterAttendanceVarianceByDay,
      weeklyBaseline: sumDayMap(baselineEntry.baselineByDay),
      weeklySummaryTotal: sumDayMap(baselineEntry.baselineByDay),
      weeklyActual: sumDayMap(actualByDay),
      weeklyAttendance: sumDayMap(attendanceByDay),
      weeklyBaselineVariance: sumDayMap(baselineVarianceByDay),
      weeklyRosterAttendanceVariance: sumDayMap(rosterAttendanceVarianceByDay),
    };
  });
}

function createRosterUpload(label, rawText, mappings, baselineRows, weekStart = getCurrentWeekStart()) {
  const rows = parseStaffingText(rawText, mappings);
  const normalizedWeekStart = normalizeWeekStart(weekStart);
  return {
    label,
    createdAt: new Date().toISOString(),
    weekStart: normalizedWeekStart,
    weekLabel: formatWeekLabel(normalizedWeekStart),
    rows,
    rawText,
    issues: collectRosterIssues(rows, baselineRows),
  };
}

function createAttendanceUpload(label, rawText, mappings, baselineRows, weekStart = getCurrentWeekStart()) {
  const rows = parseStaffingText(rawText, mappings, { stripLeadingEmptyDay: true });
  const normalizedWeekStart = normalizeWeekStart(weekStart);
  return {
    label,
    createdAt: new Date().toISOString(),
    weekStart: normalizedWeekStart,
    weekLabel: formatWeekLabel(normalizedWeekStart),
    rows,
    rawText,
    issues: collectRosterIssues(rows, baselineRows),
  };
}

function reprocessCurrentRosterWithMappings() {
  state.rosterUpload = createRosterUpload(
    state.rosterUpload.label || "Latest Upload",
    state.rosterUpload.rawText || "",
    state.mappings,
    state.baselineRows,
    state.rosterUpload.weekStart || getCurrentWeekStart(),
  );
  state.attendanceUpload = createAttendanceUpload(
    state.attendanceUpload.label || "Latest Attendance",
    state.attendanceUpload.rawText || "",
    state.mappings,
    state.baselineRows,
    state.attendanceUpload.weekStart || getCurrentWeekStart(),
  );
  upsertUploadHistory("roster", state.rosterUpload);
  upsertUploadHistory("attendance", state.attendanceUpload);
}

function parseStaffingText(rawText, mappings, options = {}) {
  const mappingMap = new Map(mappings.map((mapping) => [normalizeName(mapping.sourceName), mapping.targetName]));
  Object.entries(FORCED_MAPPING_OVERRIDES).forEach(([sourceKey, targetName]) => {
    mappingMap.set(sourceKey, targetName);
  });
  return rawText
    .split(/\r?\n/)
    .map((line, index) => ({
      line: line.trim(),
      sourceRowNumber: index + 1,
    }))
    .filter((entry) => entry.line)
    .map(({ line, sourceRowNumber }) => {
      const cells = line.split("\t");
      const [employeeId, employeeName, rosterDepartment, ...rawCodes] = cells.map((cell) => cell?.trim() || "");
      const skipLine = !employeeId ||
        ["id", "employee id"].includes(normalizeName(employeeId)) ||
        (!/\d/.test(employeeId) && (!employeeName || !rosterDepartment));
      if (skipLine) return null;
      const codes = options.stripLeadingEmptyDay && rawCodes[0] === ""
        ? rawCodes.slice(1)
        : rawCodes[0] === "" && rawCodes.length > 7
          ? rawCodes.slice(1)
          : rawCodes;
      return {
        sourceRowNumber,
        employeeId: employeeId || "",
        employeeName: employeeName || "",
        rosterDepartment: rosterDepartment || "",
        mappedSubDepartment: (mappingMap.get(normalizeName(rosterDepartment)) || rosterDepartment || "").trim(),
        ...Object.fromEntries(DAYS.map((day, index) => [day, (codes[index] || "").trim()])),
      };
    })
    .filter(Boolean);
}


function collectRosterIssues(rows, baselineRows) {
  const issues = [];
  const seenIds = new Set();
  const validSubDepartments = new Set(baselineRows.map((row) => normalizeName(row.subDepartment)));

  rows.forEach((row, index) => {
    const rowNumber = row.sourceRowNumber ?? index + 1;
    if (!row.employeeId || !row.employeeName || !row.rosterDepartment) {
      issues.push(`Row ${rowNumber} is missing ID, name, or department.`);
    }
    if (seenIds.has(row.employeeId)) {
      issues.push(`Duplicate employee ID found on row ${rowNumber}: ${row.employeeId}.`);
    }
    seenIds.add(row.employeeId);
    if (!validSubDepartments.has(normalizeName(row.mappedSubDepartment))) {
      if (normalizeName(row.mappedSubDepartment) !== normalizeName(row.rosterDepartment)) {
        issues.push(
          `Row ${rowNumber} uses '${row.rosterDepartment}' and maps to '${row.mappedSubDepartment}', but that target does not exist in Baseline Shift Rows yet.`,
        );
      } else {
        issues.push(`Row ${rowNumber} uses '${row.rosterDepartment}' and is not mapped to a baseline sub-department yet.`);
      }
    }
  });
  return issues;
}

function collectBlankRosterEntries(rows, baselineRows) {
  const departmentLookup = new Map();
  baselineRows.forEach((row) => {
    const subDepartmentKey = normalizeName(row.subDepartment);
    if (!departmentLookup.has(subDepartmentKey)) {
      departmentLookup.set(subDepartmentKey, row.mainDepartment);
    }
  });

  const grouped = new Map();

  rows.forEach((row) => {
    const missingDays = DAYS.filter((day) => !String(row[day] || "").trim()).map((day) => day.toUpperCase());
    if (!missingDays.length) return;

    const mainDepartment = departmentLookup.get(normalizeName(row.mappedSubDepartment)) || "";
    const key = [
      normalizeName(mainDepartment),
      normalizeName(row.mappedSubDepartment),
      normalizeName(row.employeeId),
      normalizeName(row.employeeName),
      row.sourceRowNumber || "",
    ].join("|||");

    if (!grouped.has(key)) {
      grouped.set(key, {
        rowNumber: row.sourceRowNumber || "",
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        mainDepartment,
        subDepartment: row.mappedSubDepartment || "",
        rosterDepartment: row.rosterDepartment,
        missingDays: [],
      });
    }

    grouped.get(key).missingDays.push(...missingDays);
  });

  return Array.from(grouped.values()).map((entry) => ({
    ...entry,
    missingDays: [...new Set(entry.missingDays)],
  }));
}

function buildMismatchSuggestions(rows, baselineRows, mappings) {
  const alreadyMapped = new Set(mappings.map((item) => normalizeName(item.sourceName)));
  const validSubDepartments = [...new Set(baselineRows.map((row) => row.subDepartment))];
  const validNormalized = new Set(validSubDepartments.map((name) => normalizeName(name)));
  return unmatchedRosterDepartments(rows, baselineRows)
    .filter((name) => !alreadyMapped.has(normalizeName(name)))
    .map((source) => ({
      source,
      suggestion: suggestClosestSubDepartment(source, validSubDepartments, validNormalized),
    }));
}

function suggestClosestSubDepartment(source, candidates, validNormalized) {
  if (validNormalized.has(normalizeName(source))) return source;
  const sourceTokens = normalizeName(source).split(/\s+/).filter(Boolean);
  let best = "";
  let bestScore = 0;

  candidates.forEach((candidate) => {
    const candidateTokens = normalizeName(candidate).split(/\s+/).filter(Boolean);
    const overlap = sourceTokens.filter((token) => candidateTokens.includes(token)).length;
    const score = overlap / Math.max(sourceTokens.length, candidateTokens.length, 1);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });

  return bestScore >= 0.34 ? best : "";
}

function historySnapshot(upload) {
  return {
    label: upload.label,
    createdAt: upload.createdAt,
    weekStart: upload.weekStart,
    weekLabel: upload.weekLabel,
    rowCount: upload.rows.length,
    issueCount: upload.issues.length,
    rawText: upload.rawText,
    rows: upload.rows,
    issues: upload.issues,
  };
}

function normalizeUploadHistory(history, fallbackUpload, kind, mappings, baselineRows) {
  const source = Array.isArray(history) && history.length ? history : [historySnapshot(fallbackUpload)];
  return source
    .map((item) => normalizeUploadSnapshot(item, kind, mappings, baselineRows))
    .sort((left, right) => String(right.weekStart).localeCompare(String(left.weekStart)));
}

function normalizeUploadSnapshot(item, kind, mappings, baselineRows) {
  if (item?.rows && item?.issues && item?.weekStart) {
    return {
      ...item,
      weekStart: normalizeWeekStart(item.weekStart),
      weekLabel: formatWeekLabel(item.weekStart),
      rowCount: item.rows.length,
      issueCount: item.issues.length,
    };
  }

  const upload = kind === "attendance"
    ? createAttendanceUpload(item?.label || "Attendance", item?.rawText || "", mappings, baselineRows, item?.weekStart || getCurrentWeekStart())
    : createRosterUpload(item?.label || "Roster", item?.rawText || "", mappings, baselineRows, item?.weekStart || getCurrentWeekStart());
  return historySnapshot(upload);
}

function upsertUploadHistory(kind, upload) {
  const key = kind === "attendance" ? "attendanceHistory" : "rosterHistory";
  const snapshot = historySnapshot(upload);
  const filtered = state[key].filter((item) => item.weekStart !== snapshot.weekStart);
  state[key] = [snapshot, ...filtered].sort((left, right) => String(right.weekStart).localeCompare(String(left.weekStart))).slice(0, 16);
}

function getAvailableWeekOptions() {
  const weeks = new Set([
    state.rosterUpload.weekStart,
    state.attendanceUpload.weekStart,
    ...state.rosterHistory.map((item) => item.weekStart),
    ...state.attendanceHistory.map((item) => item.weekStart),
  ].filter(Boolean));
  return [...weeks]
    .sort((left, right) => String(right).localeCompare(String(left)))
    .map((weekStart) => ({ value: weekStart, label: formatWeekLabel(weekStart) }));
}

function initializeComplianceRange() {
  if (!viewState.complianceStartDate || !viewState.complianceEndDate) {
    const latest = getAvailableWeekOptions()[0];
    setComplianceRangeFromWeek(latest?.value || getCurrentWeekStart());
  }
}

function getUploadForWeek(history, fallbackUpload, weekStart) {
  const normalizedWeekStart = normalizeWeekStart(weekStart);
  return history.find((item) => item.weekStart === normalizedWeekStart)
    || (fallbackUpload?.weekStart === normalizedWeekStart ? fallbackUpload : null);
}

function setComplianceRangeFromWeek(weekStart) {
  const normalized = normalizeWeekStart(weekStart);
  viewState.complianceRangeType = "7";
  viewState.complianceStartDate = normalized;
  viewState.complianceEndDate = shiftDate(normalized, 6);
}

function syncComplianceDateRangeInputs() {
  if (!viewState.complianceStartDate) {
    viewState.complianceStartDate = getCurrentWeekStart();
  }
  const bounds = getAvailableDateBounds();
  if (bounds) {
    if (viewState.complianceStartDate < bounds.min) {
      viewState.complianceStartDate = bounds.min;
    }
    if (viewState.complianceStartDate > bounds.max) {
      viewState.complianceStartDate = bounds.max;
    }
  }
  if (viewState.complianceRangeType === "7") {
    viewState.complianceEndDate = shiftDate(viewState.complianceStartDate, 6);
  } else if (viewState.complianceRangeType === "14") {
    viewState.complianceEndDate = shiftDate(viewState.complianceStartDate, 13);
  } else {
    if (!viewState.complianceEndDate || viewState.complianceEndDate < viewState.complianceStartDate) {
      viewState.complianceEndDate = viewState.complianceStartDate;
    }
  }
  if (bounds) {
    if (viewState.complianceEndDate > bounds.max) {
      viewState.complianceEndDate = bounds.max;
    }
    if (viewState.complianceEndDate < bounds.min) {
      viewState.complianceEndDate = bounds.min;
    }
    if (viewState.complianceEndDate < viewState.complianceStartDate) {
      viewState.complianceEndDate = viewState.complianceStartDate;
    }
    elements.complianceStartDate.min = bounds.min;
    elements.complianceStartDate.max = bounds.max;
    elements.complianceEndDate.min = bounds.min;
    elements.complianceEndDate.max = bounds.max;
  }
  elements.complianceRangeType.value = viewState.complianceRangeType;
  elements.complianceStartDate.value = viewState.complianceStartDate;
  elements.complianceEndDate.value = viewState.complianceEndDate;
  elements.complianceEndDate.disabled = viewState.complianceRangeType !== "custom";
}

function getSelectedDateRange() {
  const start = new Date(`${normalizeDateInput(viewState.complianceStartDate)}T00:00:00`);
  const end = new Date(`${normalizeDateInput(viewState.complianceEndDate)}T00:00:00`);
  const dates = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    dates.push({
      dateKey: toDateInputValue(cursor),
      dayKey: DAYS[cursor.getDay()],
    });
  }
  return dates;
}

function getWeeksInSelectedRange() {
  return [...new Set(getSelectedDateRange().map((item) => normalizeWeekStart(item.dateKey)))];
}

function shiftDate(dateValue, offsetDays) {
  const date = new Date(`${normalizeDateInput(dateValue)}T00:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return toDateInputValue(date);
}

function normalizeDateInput(value) {
  return String(value || "").slice(0, 10) || getCurrentWeekStart();
}

function getAvailableDateBounds() {
  const weeks = getAvailableWeekOptions().map((option) => option.value);
  if (!weeks.length) return null;
  const earliestWeek = weeks[weeks.length - 1];
  const latestWeek = weeks[0];
  return {
    min: earliestWeek,
    max: shiftDate(latestWeek, 6),
  };
}

function buildComplianceRowsForSelectedPeriod(baselineSummary) {
  const selectedDates = getSelectedDateRange();
  const rosterUploads = new Map(state.rosterHistory.map((item) => [item.weekStart, item]));
  const attendanceUploads = new Map(state.attendanceHistory.map((item) => [item.weekStart, item]));
  const summaryBySubDepartment = new Map();

  const ensureEntry = (baselineEntry) => {
    const key = `${normalizeName(baselineEntry.mainDepartment)}|||${normalizeName(baselineEntry.subDepartment)}`;
    if (!summaryBySubDepartment.has(key)) {
      summaryBySubDepartment.set(key, {
        mainDepartment: baselineEntry.mainDepartment,
        subDepartment: baselineEntry.subDepartment,
        budgetHeadcount: baselineEntry.budgetHeadcount,
        requiredFte: baselineEntry.requiredFte,
        baselineByDay: Object.fromEntries(DAYS.map((day) => [day, 0])),
        actualByDay: Object.fromEntries(DAYS.map((day) => [day, 0])),
        attendanceByDay: Object.fromEntries(DAYS.map((day) => [day, 0])),
      });
    }
    return summaryBySubDepartment.get(key);
  };

  selectedDates.forEach(({ dateKey, dayKey }) => {
    const weekStart = normalizeWeekStart(dateKey);
    const rosterUpload = rosterUploads.get(weekStart) || (state.rosterUpload.weekStart === weekStart ? state.rosterUpload : null);
    const attendanceUpload = attendanceUploads.get(weekStart) || (state.attendanceUpload.weekStart === weekStart ? state.attendanceUpload : null);
    const rosterRows = rosterUpload?.rows || [];
    const attendanceRows = attendanceUpload?.rows || [];

    baselineSummary.forEach((baselineEntry) => {
      const entry = ensureEntry(baselineEntry);
      entry.baselineByDay[dayKey] += Number(baselineEntry.baselineByDay[dayKey] || 0);
      entry.actualByDay[dayKey] += rosterRows.filter(
        (row) => normalizeName(row.mappedSubDepartment) === normalizeName(baselineEntry.subDepartment) && countsAsWorking(row[dayKey]),
      ).length;
      entry.attendanceByDay[dayKey] += attendanceRows.filter(
        (row) => normalizeName(row.mappedSubDepartment) === normalizeName(baselineEntry.subDepartment) && countsAsWorking(row[dayKey]),
      ).length;
    });
  });

  return Array.from(summaryBySubDepartment.values()).map((entry) => {
    const baselineVarianceByDay = {};
    const rosterAttendanceVarianceByDay = {};
    DAYS.forEach((day) => {
      baselineVarianceByDay[day] = entry.actualByDay[day] - entry.baselineByDay[day];
      rosterAttendanceVarianceByDay[day] = entry.attendanceByDay[day] - entry.actualByDay[day];
    });
    return {
      ...entry,
      summaryByDay: entry.baselineByDay,
      baselineVarianceByDay,
      rosterAttendanceVarianceByDay,
      weeklyVariance: sumDayMap(baselineVarianceByDay),
      weeklyBaseline: sumDayMap(entry.baselineByDay),
      weeklySummaryTotal: sumDayMap(entry.baselineByDay),
      weeklyActual: sumDayMap(entry.actualByDay),
      weeklyAttendance: sumDayMap(entry.attendanceByDay),
      weeklyBaselineVariance: sumDayMap(baselineVarianceByDay),
      weeklyRosterAttendanceVariance: sumDayMap(rosterAttendanceVarianceByDay),
    };
  });
}

function normalizeWeekStart(value) {
  if (!value) return getCurrentWeekStart();
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return toDateInputValue(start);
}

function getCurrentWeekStart() {
  return normalizeWeekStart(toDateInputValue(new Date()));
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWeekLabel(weekStart) {
  const normalized = normalizeWeekStart(weekStart);
  const start = new Date(`${normalized}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} to ${end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

function formatDateRangeLabel(startDate, endDate) {
  const start = new Date(`${normalizeDateInput(startDate)}T00:00:00`);
  const end = new Date(`${normalizeDateInput(endDate)}T00:00:00`);
  return `${start.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} to ${end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

function loadBaselineRowIntoForm(rowId) {
  const row = state.baselineRows.find((item) => item.id === rowId);
  if (!row) return;
  elements.baselineForm.dataset.editingId = row.id;
  elements.baselineForm.elements.mainDepartment.value = row.mainDepartment;
  elements.baselineForm.elements.subDepartment.value = row.subDepartment;
  elements.baselineForm.elements.shiftName.value = row.shiftName;
  elements.baselineForm.elements.positionName.value = row.positionName;
  DAYS.forEach((day) => {
    elements.baselineForm.elements[day].value = row[day];
  });
  activateView("baseline");
}

function updateBaselineRowFromTable(tableRow) {
  const rowId = tableRow.dataset.rowId;
  if (!rowId) return;
  state.baselineRows = state.baselineRows.map((row) => {
    if (row.id !== rowId || row.rowType === "summary") return row;

    const updatedRow = {
      ...row,
      mainDepartment: readTableInputValue(tableRow, "mainDepartment", row.mainDepartment),
      subDepartment: readTableInputValue(tableRow, "subDepartment", row.subDepartment),
      shiftName: readTableInputValue(tableRow, "shiftName", row.shiftName),
      positionName: readTableInputValue(tableRow, "positionName", row.positionName),
    };

    DAYS.forEach((day) => {
      updatedRow[day] = clampNonNegativeInteger(readTableInputValue(tableRow, day, row[day]));
    });

    updatedRow.weeklyTotal = DAYS.reduce((sum, day) => sum + Number(updatedRow[day] || 0), 0);
    return updatedRow;
  });
}

function readTableInputValue(tableRow, fieldName, fallbackValue = "") {
  const input = tableRow.querySelector(`[data-field="${fieldName}"]`);
  if (!input) return fallbackValue;
  return String(input.value || fallbackValue).trim();
}

function clampNonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

function loadMappingIntoForm(mappingId) {
  const mapping = state.mappings.find((item) => item.id === mappingId);
  if (!mapping) return;
  elements.mappingForm.dataset.editingId = mapping.id;
  elements.mappingForm.elements.sourceName.value = mapping.sourceName;
  elements.mappingForm.elements.targetName.value = mapping.targetName;
  activateView("mapping");
}

function exportState() {
  const payload = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      baselineRows: state.baselineRows,
      mappings: state.mappings,
      settings: state.settings,
      rosterUpload: state.rosterUpload,
      rosterHistory: state.rosterHistory,
      attendanceUpload: state.attendanceUpload,
      attendanceHistory: state.attendanceHistory,
    },
    null,
    2,
  );
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "shift-headcount-export.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function readJsonResponse(response) {
  const rawText = await response.text();
  if (!rawText) return {};
  try {
    return JSON.parse(rawText);
  } catch {
    return { rawText };
  }
}

function isAdmin() {
  return currentUser?.role === "admin";
}

function unmatchedRosterDepartments(rows, baselineRows) {
  const validSubDepartments = new Set(baselineRows.map((row) => normalizeName(row.subDepartment)));
  return [
    ...new Set(
      rows
        .filter((row) => !validSubDepartments.has(normalizeName(row.mappedSubDepartment)))
        .map((row) => row.rosterDepartment),
    ),
  ];
}

function computeNetWorkingDays(settings) {
  return settings.annualDays - settings.daysOff - settings.publicHolidays;
}

function countsAsWorking(code) {
  const normalizedCode = (code || "").trim().toUpperCase();
  if (["OW", "PW", "R"].includes(normalizedCode)) return true;
  return !DEFAULT_NON_WORKING_CODES.includes(normalizedCode);
}

function emptyDayMap() {
  return Object.fromEntries(DAYS.map((day) => [day, 0]));
}

function buildDepartmentLookup(rows) {
  const lookup = new Map();
  rows.forEach((row) => {
    const key = normalizeName(row.subDepartment);
    if (!lookup.has(key)) {
      lookup.set(key, row.mainDepartment);
    }
  });
  return lookup;
}

function getSubDepartmentOptions(rows, mainDepartment) {
  return [...new Set(
    rows
      .filter((row) => mainDepartment === "all" || row.mainDepartment === mainDepartment)
      .map((row) => row.subDepartment),
  )].sort((a, b) => a.localeCompare(b));
}

function sumDayMap(dayMap) {
  return DAYS.reduce((sum, day) => sum + Number(dayMap[day] || 0), 0);
}

function normalizeName(value) {
  return (value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
