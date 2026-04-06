import {
  DAYS,
  DEFAULT_NON_WORKING_CODES,
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
};

const elements = {
  loginOverlay: document.querySelector("#login-overlay"),
  loginForm: document.querySelector("#login-form"),
  loginMessage: document.querySelector("#login-message"),
  loginHint: document.querySelector("#login-hint"),
  sessionSummary: document.querySelector("#session-summary"),
  logoutBtn: document.querySelector("#logout-btn"),
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
  settingsForm: document.querySelector("#settings-form"),
  ftePreview: document.querySelector("#fte-preview"),
  mappingForm: document.querySelector("#mapping-form"),
  mappingStatus: document.querySelector("#mapping-status"),
  mappingTable: document.querySelector("#mapping-table"),
  mismatchReview: document.querySelector("#mismatch-review"),
  rosterForm: document.querySelector("#roster-form"),
  rosterSearch: document.querySelector("#roster-search"),
  rosterTable: document.querySelector("#roster-table"),
  uploadValidation: document.querySelector("#upload-validation"),
  blankRosterCheck: document.querySelector("#blank-roster-check"),
  complianceDepartmentFilter: document.querySelector("#compliance-department-filter"),
  complianceTable: document.querySelector("#compliance-table"),
};

const FORCED_MAPPING_OVERRIDES = {
  "f&b - nickel lounge": "F&B - Millies",
};

const authState = {
  environment: "development",
  usesDefaultCredentials: true,
};

let currentUser = await initializeSession();
const state = await initializeState();
const viewState = {
  baselineDepartment: "all",
  complianceDepartment: "all",
  rosterSearch: "",
};

seedForms();
bindEvents();
render();

async function initializeState() {
  const localState = loadStateFromLocal();
  const remoteState = await loadStateFromApi();
  return reconcileLoadedState(remoteState || localState);
}

async function initializeSession() {
  try {
    const response = await fetch("/api/auth/session", { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const payload = await response.json();
    authState.environment = payload?.auth?.environment || "development";
    authState.usesDefaultCredentials = payload?.auth?.usesDefaultCredentials ?? true;
    return payload?.user || null;
  } catch {
    return null;
  }
}

function loadStateFromLocal() {
  const baselineRows = loadJSON(storageKeys.baselineRows, DEMO_BASELINE_ROWS);
  const mappings = loadJSON(storageKeys.mappings, DEMO_MAPPINGS);
  const settings = loadJSON(storageKeys.settings, DEMO_SETTINGS);
  const demoUpload = createRosterUpload("Week 1 Demo", DEMO_ROSTER_TEXT, DEMO_MAPPINGS, baselineRows);
  const rosterUpload = loadJSON(storageKeys.rosterUpload, demoUpload);
  const rosterHistory = loadJSON(storageKeys.rosterHistory, [historySnapshot(demoUpload)]);
  return { baselineRows, mappings, settings, rosterUpload, rosterHistory };
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
    const response = await fetch("/api/state", { headers: { Accept: "application/json" } });
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
      body: JSON.stringify({
        state: {
          baselineRows: state.baselineRows,
          mappings: state.mappings,
          settings: state.settings,
          rosterUpload: state.rosterUpload,
          rosterHistory: state.rosterHistory,
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
      )
    : createRosterUpload("Week 1 Demo", DEMO_ROSTER_TEXT, mappings, baselineRows);
  const rosterHistory = source.rosterHistory || [historySnapshot(rosterUpload)];
  return { baselineRows, mappings, settings, rosterUpload, rosterHistory };
}

function mergeBaselineRows(existingRows) {
  let rows = Array.isArray(existingRows)
    ? existingRows.filter((row) => row.shiftName !== "Imported Baseline")
    : [];
  const knownKeys = new Set(
    rows.map(
      (row) =>
        `${normalizeName(row.mainDepartment)}|||${normalizeName(row.subDepartment)}|||${normalizeName(row.shiftName)}|||${normalizeName(row.positionName)}|||${row.rowType || "shift"}`,
    ),
  );
  DEMO_BASELINE_ROWS.forEach((row) => {
    const key = `${normalizeName(row.mainDepartment)}|||${normalizeName(row.subDepartment)}|||${normalizeName(row.shiftName)}|||${normalizeName(row.positionName)}|||${row.rowType || "shift"}`;
    if (!knownKeys.has(key)) {
      rows.push(structuredClone(row));
      return;
    }
    if ((row.rowType || "shift") !== "summary" || !row.budgetHeadcount) return;
    rows = rows.map((existingRow) => {
      const existingKey = `${normalizeName(existingRow.mainDepartment)}|||${normalizeName(existingRow.subDepartment)}|||${normalizeName(existingRow.shiftName)}|||${normalizeName(existingRow.positionName)}|||${existingRow.rowType || "shift"}`;
      if (existingKey !== key || existingRow.budgetHeadcount) return existingRow;
      return {
        ...existingRow,
        budgetHeadcount: row.budgetHeadcount,
      };
    });
  });
  return rows;
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
  return await persistStateToApi();
}

function seedForms() {
  elements.rosterForm.elements.uploadLabel.value = state.rosterUpload.label;
  elements.rosterForm.elements.rosterText.value = state.rosterUpload.rawText;
  elements.settingsForm.elements.weeksInYear.value = state.settings.weeksInYear;
  elements.settingsForm.elements.annualDays.value = state.settings.annualDays;
  elements.settingsForm.elements.daysOff.value = state.settings.daysOff;
  elements.settingsForm.elements.publicHolidays.value = state.settings.publicHolidays;
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    elements.loginMessage.textContent = "Signing in...";
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: form.get("username"),
            password: form.get("password"),
          }),
        });
        const payload = await readJsonResponse(response);
        if (!response.ok) {
          elements.loginMessage.textContent = payload?.error || payload?.rawText || "Sign in failed.";
          return;
        }
        currentUser = payload.user;
        const remoteState = await loadStateFromApi();
      if (remoteState) {
        applyLoadedState(remoteState);
      }
      event.currentTarget.reset();
      elements.loginMessage.textContent = "";
      render();
    } catch {
      elements.loginMessage.textContent = "Unable to reach the server.";
    }
  });

  elements.logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout transport failures and clear local session view.
    }
    currentUser = null;
    render();
  });

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
    const complianceSummary = buildComplianceRows(baselineSummary, state.rosterUpload.rows);
    renderComplianceTable(complianceSummary);
  });

  elements.rosterSearch.addEventListener("input", (event) => {
    viewState.rosterSearch = event.target.value.trim().toLowerCase();
    renderRosterTable();
  });

  elements.seedDataBtn.addEventListener("click", () => {
    state.baselineRows = structuredClone(DEMO_BASELINE_ROWS);
    state.mappings = structuredClone(DEMO_MAPPINGS);
    state.settings = structuredClone(DEMO_SETTINGS);
    state.rosterUpload = createRosterUpload("Week 1 Demo", DEMO_ROSTER_TEXT, DEMO_MAPPINGS, state.baselineRows);
    state.rosterHistory = [historySnapshot(state.rosterUpload)];
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
    );
    state.rosterHistory.unshift(historySnapshot(state.rosterUpload));
    state.rosterHistory = state.rosterHistory.slice(0, 8);
    saveState();
    render();
    activateView("compliance");
  });

  elements.baselineTable.addEventListener("click", (event) => {
    if (!isAdmin()) return;
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const rowId = button.dataset.id;
    if (button.dataset.action === "edit-baseline") loadBaselineRowIntoForm(rowId);
    if (button.dataset.action === "delete-baseline") {
      state.baselineRows = state.baselineRows.filter((row) => row.id !== rowId);
      saveState();
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
    compliance: ["Compliance", "Compare baseline need against roster actual and highlight shortages or excess staffing."],
  };

  elements.viewTitle.textContent = titles[viewName][0];
  elements.viewSubtitle.textContent = titles[viewName][1];
}

function render() {
  const baselineSummary = aggregateBaseline(state.baselineRows);
  const complianceSummary = buildComplianceRows(baselineSummary, state.rosterUpload.rows);
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
  renderBlankRosterCheck();
  renderComplianceTable(complianceSummary);
}

function renderLoginHint() {
  if (!elements.loginHint) return;
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

  elements.baselineDepartmentFilter.innerHTML = options;
  elements.complianceDepartmentFilter.innerHTML = options;
  elements.baselineDepartmentFilter.value = departments.includes(viewState.baselineDepartment) ? viewState.baselineDepartment : "all";
  elements.complianceDepartmentFilter.value = departments.includes(viewState.complianceDepartment) ? viewState.complianceDepartment : "all";
}

function renderSessionState() {
  const signedIn = Boolean(currentUser);
  document.body.classList.toggle("auth-locked", !signedIn);
  elements.loginOverlay.classList.toggle("active", !signedIn);

  if (!signedIn) {
    elements.sessionSummary.innerHTML = "<p>Not signed in.</p>";
    elements.logoutBtn.classList.add("is-hidden");
    setAdminControlsEnabled(false);
    return;
  }

  elements.sessionSummary.innerHTML = `
    <p><strong>${escapeHtml(currentUser.name)}</strong></p>
    <p>${escapeHtml(currentUser.role)}</p>
  `;
  elements.logoutBtn.classList.remove("is-hidden");
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
  const tiles = [
    ["Total Work Areas", "Baseline areas currently tracked", String(baselineSummary.length)],
    ["Departments Short", "Areas below required staffing", String(shortages)],
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
    ["Baseline Weekly Need", weeklyBaseline],
    ["Roster Weekly Actual", weeklyActual],
    ["Variance", weeklyVariance],
    ["Mapped Aliases", state.mappings.length],
  ];

  elements.summaryCards.innerHTML = rows
    .map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderRecentUpload() {
  const createdAt = new Date(state.rosterUpload.createdAt).toLocaleString();
  elements.recentUpload.innerHTML = `
    <p><strong>${escapeHtml(state.rosterUpload.label)}</strong></p>
    <p>Uploaded: ${createdAt}</p>
    <p>Rows: ${state.rosterUpload.rows.length}</p>
    <p>Issues: ${state.rosterUpload.issues.length}</p>
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
    const weeklyTotal = row.weeklyTotal ?? DAYS.reduce((sum, day) => sum + Number(row[day] || 0), 0);
    const actions = isAdmin()
      ? `
          <button class="inline-button" type="button" data-action="edit-baseline" data-id="${row.id}">Edit</button>
          <button class="danger-button" type="button" data-action="delete-baseline" data-id="${row.id}">Delete</button>
        `
      : `<span class="status-chip status-warn">View only</span>`;

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
      <tr class="${row.rowType === "summary" ? "summary-row" : ""}">
        <td>${escapeHtml(row.mainDepartment)}</td>
        <td>${escapeHtml(row.subDepartment)}</td>
        <td>${escapeHtml(row.shiftName)}</td>
        <td>${escapeHtml(row.rowType === "summary" ? `FTE ${row.requiredFte || ""}`.trim() : row.positionName)}</td>
        ${DAYS.map((day) => `<td>${row[day]}</td>`).join("")}
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
  elements.rosterTable.innerHTML = state.rosterUpload.rows
    .filter((row) => {
      if (!search) return true;
      const haystack = [
        row.sourceRowNumber,
        row.employeeId,
        row.employeeName,
        row.rosterDepartment,
        row.mappedSubDepartment,
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

function renderBlankRosterCheck() {
  const blanks = collectBlankRosterEntries(state.rosterUpload.rows);
  if (!blanks.length) {
    elements.blankRosterCheck.innerHTML = "<p>No blank roster cells found. All roster days are updated.</p>";
    return;
  }

  elements.blankRosterCheck.innerHTML = `
    <p><strong>${blanks.length}</strong> blank roster entries found.</p>
    <div class="history-list">${blanks
      .map(
        (entry) => `
          <div class="history-item">
            <div>
              <p><strong>Row ${entry.rowNumber}</strong> | ${escapeHtml(entry.employeeName || "Unknown Employee")}</p>
              <p>ID: ${escapeHtml(entry.employeeId || "Missing ID")} | Department: ${escapeHtml(entry.rosterDepartment || "Missing Department")}</p>
              <p>Blank day: ${entry.dayLabel}</p>
            </div>
          </div>
        `,
      )
      .join("")}</div>
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
      rows.push(buildMetricRow(entry, "Variance", entry.varianceByDay, entry.weeklyVariance));
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

function buildMetricRow(entry, label, byDay, weeklyTotal, requiredFte = "") {
  const rowClass = [
    "compliance-metric-row",
    label === "Variance" ? "variance-row" : "",
    label === "Total (Shifts)" ? "summary-row" : "",
    label === "Baseline Need" ? "baseline-row" : "",
    label === "Roster Actual" ? "actual-row" : "",
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
        if (label === "Variance") cellClasses.push(varianceCellClass(byDay[day]));
        return `<td class="${cellClasses.join(" ")}">${value}</td>`;
      }).join("")}
      <td class="weekly-total-cell ${label === "Variance" ? varianceCellClass(weeklyTotal) : ""}">${weeklyDisplay}</td>
    </tr>
  `;
}

function metricPillClass(label) {
  if (label === "Baseline Need") return "baseline";
  if (label === "Roster Actual") return "actual";
  if (label === "Variance") return "variance";
  return "summary";
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
  if (numeric < 0) return "variance-negative";
  if (numeric > 0) return "variance-positive";
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

function buildComplianceRows(baselineSummary, rosterRows) {
  return baselineSummary.map((baselineEntry) => {
    const actualByDay = emptyDayMap();
    rosterRows
      .filter((row) => normalizeName(row.mappedSubDepartment) === normalizeName(baselineEntry.subDepartment))
      .forEach((row) => {
        DAYS.forEach((day) => {
          if (countsAsWorking(row[day])) actualByDay[day] += 1;
        });
      });

    const varianceByDay = emptyDayMap();
    DAYS.forEach((day) => {
      varianceByDay[day] = actualByDay[day] - baselineEntry.baselineByDay[day];
    });

    return {
      mainDepartment: baselineEntry.mainDepartment,
      subDepartment: baselineEntry.subDepartment,
      baselineByDay: baselineEntry.baselineByDay,
      summaryByDay: baselineEntry.baselineByDay,
      requiredFte: baselineEntry.summary?.requiredFte || "",
      budgetHeadcount: baselineEntry.summary?.budgetHeadcount || "",
      actualByDay,
      varianceByDay,
      weeklyBaseline: sumDayMap(baselineEntry.baselineByDay),
      weeklySummaryTotal: sumDayMap(baselineEntry.baselineByDay),
      weeklyActual: sumDayMap(actualByDay),
      weeklyVariance: sumDayMap(varianceByDay),
    };
  });
}

function createRosterUpload(label, rawText, mappings, baselineRows) {
  const rows = parseRosterText(rawText, mappings);
  return {
    label,
    createdAt: new Date().toISOString(),
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
  );
  state.rosterHistory = state.rosterHistory.map((item, index) =>
    index === 0
      ? historySnapshot(state.rosterUpload)
      : item,
  );
}

function parseRosterText(rawText, mappings) {
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
      const [employeeId, employeeName, rosterDepartment, ...codes] = cells;
      return {
        sourceRowNumber,
        employeeId: employeeId?.trim() || "",
        employeeName: employeeName?.trim() || "",
        rosterDepartment: rosterDepartment?.trim() || "",
        mappedSubDepartment: (mappingMap.get(normalizeName(rosterDepartment)) || rosterDepartment || "").trim(),
        ...Object.fromEntries(DAYS.map((day, index) => [day, (codes[index] || "").trim()])),
      };
    });
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

function collectBlankRosterEntries(rows) {
  return rows.flatMap((row) =>
    DAYS.filter((day) => !String(row[day] || "").trim()).map((day) => ({
      rowNumber: row.sourceRowNumber || "",
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      rosterDepartment: row.rosterDepartment,
      day,
      dayLabel: day.toUpperCase(),
    })),
  );
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
    rowCount: upload.rows.length,
    issueCount: upload.issues.length,
    rawText: upload.rawText,
  };
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
  return !DEFAULT_NON_WORKING_CODES.includes((code || "").trim().toUpperCase());
}

function emptyDayMap() {
  return { sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0 };
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
