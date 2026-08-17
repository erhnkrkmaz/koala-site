const SUPABASE_URL = "https://ndgdzwprwphklqwyxque.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kZ2R6d3Byd3Boa2xxd3l4cXVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMzMzMDcsImV4cCI6MjEwMTgwOTMwN30.6d9lBoh-pQ4lqtYO07LKmuMHLa3yq0q3x1DhYjOV2Tw";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PAGE_SIZE = 50;

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

async function signedPhotoUrl(bucket, path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

async function attachSignedPhoto(container, bucket, path) {
  const url = await signedPhotoUrl(bucket, path);
  if (!url) {
    container.textContent = "Unavailable";
    return;
  }
  container.textContent = "";
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  const img = document.createElement("img");
  img.src = url;
  img.alt = "";
  link.appendChild(img);
  container.appendChild(link);
}

function profilePhotoPath(row) {
  return Array.isArray(row.photo_urls) && row.photo_urls.length > 0 ? row.photo_urls[0] : null;
}

function buildIdentityHeader(row, options = {}) {
  const header = document.createElement("div");
  header.className = "card-header";

  if (!options.hidePrimaryPhoto) {
    const photoWrap = document.createElement("div");
    photoWrap.className = "card-photo";
    const path = options.photoPath !== undefined ? options.photoPath : profilePhotoPath(row);
    photoWrap.textContent = path ? "Loading…" : "No photo";
    header.appendChild(photoWrap);
    if (path) attachSignedPhoto(photoWrap, "profile-photos", path);
  }

  const identity = document.createElement("div");
  identity.className = "card-identity";

  const nameEl = document.createElement("div");
  nameEl.className = "card-name";
  nameEl.innerHTML = `<span>${escapeHtml(row.display_name || "(no name)")}</span>`;
  if (row.instagram_handle) {
    const handle = row.instagram_handle.replace(/^@/, "");
    nameEl.innerHTML += ` <a class="instagram-link" href="https://instagram.com/${encodeURIComponent(handle)}" target="_blank" rel="noopener">@${escapeHtml(handle)}</a>`;
  }
  identity.appendChild(nameEl);

  const metaParts = [];
  if (row.age) metaParts.push(`${row.age} yrs`);
  if (row.city) metaParts.push(escapeHtml(row.city));
  if (row.gender) metaParts.push(escapeHtml(row.gender));
  if (Array.isArray(options.extraMeta)) metaParts.push(...options.extraMeta.map(escapeHtml));
  const metaEl = document.createElement("div");
  metaEl.className = "card-meta";
  metaEl.textContent = metaParts.join(" · ");
  identity.appendChild(metaEl);

  if (row.bio) {
    const bioEl = document.createElement("div");
    bioEl.className = "card-bio";
    bioEl.textContent = row.bio;
    identity.appendChild(bioEl);
  }

  if (Array.isArray(row.interests) && row.interests.length > 0) {
    const tagsEl = document.createElement("div");
    tagsEl.className = "card-tags";
    for (const interest of row.interests) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = interest;
      tagsEl.appendChild(tag);
    }
    identity.appendChild(tagsEl);
  }

  header.appendChild(identity);
  return header;
}

function buildPhotoCompareBlock(label, path) {
  const block = document.createElement("div");
  block.className = "photo-compare-block";
  const photoWrap = document.createElement("div");
  photoWrap.className = "card-photo";
  photoWrap.textContent = path ? "Loading…" : "None";
  block.appendChild(photoWrap);
  const labelEl = document.createElement("div");
  labelEl.className = "photo-compare-label";
  labelEl.textContent = label;
  block.appendChild(labelEl);
  if (path) attachSignedPhoto(photoWrap, "profile-photos", path);
  return block;
}

function renderPendingCard(row) {
  const card = document.createElement("div");
  card.className = "card";
  card.appendChild(buildIdentityHeader(row, { extraMeta: [`submitted ${formatDate(row.created_at)}`] }));
  return card;
}

function renderReportCard(row) {
  const card = document.createElement("div");
  card.className = "card";
  card.appendChild(buildIdentityHeader(row, { extraMeta: [`reported ${formatDate(row.updated_at)}`] }));

  const holdSection = document.createElement("div");
  holdSection.className = "card-section";
  const until = row.report_hold_until
    ? `Auto-reopens ${formatDate(row.report_hold_until)}`
    : "No auto-reopen — manual only";
  holdSection.innerHTML =
    `<p class="card-section-title">Report hold — tier ${row.report_hold_tier}</p>` +
    `<p class="card-meta">${escapeHtml(until)}</p>`;
  card.appendChild(holdSection);

  const reportsSection = document.createElement("div");
  reportsSection.className = "card-section";
  const reportsTitle = document.createElement("p");
  reportsTitle.className = "card-section-title";
  reportsTitle.textContent = "Reports";
  reportsSection.appendChild(reportsTitle);
  const reportsBody = document.createElement("p");
  reportsBody.className = "card-meta";
  reportsBody.textContent = "Loading…";
  reportsSection.appendChild(reportsBody);
  card.appendChild(reportsSection);

  supabaseClient.rpc("admin_list_reports_for_user", { p_user_id: row.id }).then(({ data, error }) => {
    if (error) {
      reportsBody.textContent = `Could not load: ${error.message}`;
      return;
    }
    if (!data || data.length === 0) {
      reportsBody.textContent = "No report details found.";
      return;
    }
    const list = document.createElement("div");
    list.className = "report-list";
    for (const report of data) {
      const item = document.createElement("div");
      item.className = "report-item";
      item.innerHTML =
        `<div class="report-reason">${escapeHtml(report.reason || "No reason given")}</div>` +
        (report.details ? `<div>${escapeHtml(report.details)}</div>` : "") +
        `<div class="report-meta">by ${escapeHtml(report.reporter_display_name || "unknown")} · ${formatDate(report.created_at)}</div>`;
      list.appendChild(item);
    }
    reportsBody.replaceWith(list);
  });

  return card;
}

function renderSafetyCard(row) {
  const card = document.createElement("div");
  card.className = "card";

  const pseudoProfile = {
    display_name: row.subject_display_name,
    age: row.subject_age,
    city: row.subject_city,
    instagram_handle: row.subject_instagram_handle,
    photo_urls: row.subject_photo_urls,
  };
  card.appendChild(buildIdentityHeader(pseudoProfile, { extraMeta: [`flagged ${formatDate(row.created_at)}`] }));

  const detailSection = document.createElement("div");
  detailSection.className = "card-section";
  const windowText = row.observed_window_ms ? `${(row.observed_window_ms / 1000).toFixed(1)}s` : "—";
  detailSection.innerHTML =
    `<p class="card-section-title">Detection detail</p>` +
    `<div class="detail-grid">` +
    `<div><span class="detail-label">Trigger</span>${escapeHtml(row.trigger || "—")}</div>` +
    `<div><span class="detail-label">Positive frames</span>${row.positive_frame_count ?? "—"}</div>` +
    `<div><span class="detail-label">Window</span>${windowText}</div>` +
    `<div><span class="detail-label">Account status</span>${escapeHtml(row.subject_status || "—")}</div>` +
    `</div>`;
  card.appendChild(detailSection);

  const evidenceSection = document.createElement("div");
  evidenceSection.className = "card-section";
  const evidenceTitle = document.createElement("p");
  evidenceTitle.className = "card-section-title";
  evidenceTitle.textContent = "Evidence";
  evidenceSection.appendChild(evidenceTitle);

  const revealButton = document.createElement("button");
  revealButton.type = "button";
  revealButton.className = "evidence-reveal-button";
  revealButton.textContent = "Reveal evidence photo";
  revealButton.addEventListener("click", async () => {
    revealButton.disabled = true;
    revealButton.textContent = "Loading…";
    const url = await signedPhotoUrl("safety-evidence", row.evidence_path);
    if (!url) {
      revealButton.textContent = "Unavailable";
      return;
    }
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.className = "evidence-photo";
    evidenceSection.appendChild(img);
    revealButton.remove();
  });
  evidenceSection.appendChild(revealButton);

  const warn = document.createElement("p");
  warn.className = "evidence-warning";
  warn.textContent = "Sensitive content — only loads after you click reveal.";
  evidenceSection.appendChild(warn);

  card.appendChild(evidenceSection);
  return card;
}

function renderPhotoUpdateCard(row) {
  const card = document.createElement("div");
  card.className = "card";
  card.appendChild(
    buildIdentityHeader(row, {
      hidePrimaryPhoto: true,
      extraMeta: [`new photo submitted ${formatDate(row.updated_at)}`],
    })
  );

  const section = document.createElement("div");
  section.className = "card-section";
  const title = document.createElement("p");
  title.className = "card-section-title";
  title.textContent = "Photo change";
  section.appendChild(title);

  const compare = document.createElement("div");
  compare.className = "photo-compare";
  compare.appendChild(buildPhotoCompareBlock("Current", profilePhotoPath(row)));
  compare.appendChild(buildPhotoCompareBlock("New (pending)", row.pending_photo_url));
  section.appendChild(compare);

  card.appendChild(section);
  return card;
}

function renderSearchResultCard(row) {
  const card = document.createElement("div");
  card.className = "card";
  card.appendChild(
    buildIdentityHeader(row, {
      extraMeta: [`status: ${row.status}`, `updated ${formatDate(row.updated_at)}`],
    })
  );
  return card;
}

const ACTIVITY_LABELS = {
  resolve_profile: "Profile decision",
  resolve_safety_incident: "Nude Hold decision",
  resolve_report_hold: "Report Hold decision",
  resolve_pending_photo: "Profile Pic Update decision",
};

const POSITIVE_DECISIONS = new Set(["approve", "cleared", "reopen"]);

function renderActivityRow(row) {
  const el = document.createElement("div");
  el.className = "activity-row";

  const main = document.createElement("div");
  main.className = "activity-main";
  const actionLabel = ACTIVITY_LABELS[row.action] || row.action;
  main.innerHTML =
    `<div class="activity-action">${escapeHtml(actionLabel)}</div>` +
    `<div class="activity-meta">${escapeHtml(row.target_table)} · ${row.target_id.slice(0, 8)}… · ${formatDate(row.created_at)}</div>`;
  el.appendChild(main);

  const decision = document.createElement("span");
  decision.className = `activity-decision ${POSITIVE_DECISIONS.has(row.decision) ? "positive" : "negative"}`;
  decision.textContent = row.decision;
  el.appendChild(decision);

  return el;
}

const TABS = {
  pending: {
    label: "Under Review",
    listFn: "admin_list_pending_profiles",
    resolveFn: "admin_resolve_profile",
    idParam: "p_user_id",
    countEl: "count-pending",
    render: renderPendingCard,
    actions: [
      { label: "Approve", kind: "positive", decision: "approve" },
      { label: "Reject", kind: "negative", decision: "reject" },
    ],
  },
  safety: {
    label: "Nude Hold",
    listFn: "admin_list_safety_holds",
    resolveFn: "admin_resolve_safety_incident",
    idParam: "p_incident_id",
    countEl: "count-safety",
    render: renderSafetyCard,
    actions: [
      { label: "Clear", kind: "positive", decision: "cleared" },
      { label: "Confirm violation", kind: "negative", decision: "confirmed" },
    ],
  },
  reports: {
    label: "Report Hold",
    listFn: "admin_list_report_holds",
    resolveFn: "admin_resolve_report_hold",
    idParam: "p_user_id",
    countEl: "count-reports",
    render: renderReportCard,
    actions: [
      { label: "Reopen", kind: "positive", decision: "reopen" },
      { label: "Suspend", kind: "negative", decision: "suspend" },
    ],
  },
  photos: {
    label: "Profile Pic Update",
    listFn: "admin_list_pending_photos",
    resolveFn: "admin_resolve_pending_photo",
    idParam: "p_user_id",
    countEl: "count-photos",
    render: renderPhotoUpdateCard,
    actions: [
      { label: "Approve", kind: "positive", decision: "approve" },
      { label: "Reject", kind: "negative", decision: "reject" },
    ],
  },
  activity: {
    label: "Activity Log",
    listFn: "admin_list_audit_log",
    render: renderActivityRow,
  },
};

const QUEUE_TABS = ["pending", "safety", "reports", "photos"];

let activeTab = "pending";
let currentOffset = 0;
let searchMode = false;

const ADMIN_URL = "https://www.heykoala.app/koalavideo/admin/";

const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginForm = document.getElementById("login-form");
const loginButton = document.getElementById("login-button");
const loginError = document.getElementById("login-error");
const logoutButton = document.getElementById("logout-button");
const tabsEl = document.getElementById("tabs");
const panelBody = document.getElementById("panel-body");
const panelTitle = document.getElementById("panel-title");
const refreshButton = document.getElementById("refresh-button");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const awaitingEmailCard = document.getElementById("awaiting-email-card");
const awaitingEmailAddress = document.getElementById("awaiting-email-address");
const backToLoginButton = document.getElementById("back-to-login-button");

function showApp() {
  loginScreen.hidden = true;
  appScreen.hidden = false;
  refreshAllCounts();
  loadActiveTab();
}

function showLogin(message) {
  appScreen.hidden = true;
  loginScreen.hidden = false;
  awaitingEmailCard.hidden = true;
  loginForm.hidden = false;
  if (message) {
    loginError.textContent = message;
    loginError.hidden = false;
  }
}

function showAwaitingEmail(email) {
  loginForm.hidden = true;
  awaitingEmailCard.hidden = false;
  awaitingEmailAddress.textContent = email;
}

backToLoginButton.addEventListener("click", () => {
  loginForm.reset();
  loginError.hidden = true;
  awaitingEmailCard.hidden = true;
  loginForm.hidden = false;
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  loginButton.disabled = true;
  loginButton.textContent = "Signing in…";

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  // Step 1: password proves "something you know". This alone must never grant access, so the
  // session it creates is immediately discarded -- only a click on the emailed link (step 2,
  // "something you have": access to the inbox) establishes the session the app actually uses.
  const { error: passwordError } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (passwordError) {
    loginButton.disabled = false;
    loginButton.textContent = "Sign in";
    loginError.textContent = passwordError.message;
    loginError.hidden = false;
    return;
  }

  await supabaseClient.auth.signOut();

  const { error: otpError } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: ADMIN_URL },
  });

  loginButton.disabled = false;
  loginButton.textContent = "Sign in";

  if (otpError) {
    loginError.textContent = `Password correct, but could not send the confirmation email: ${otpError.message}`;
    loginError.hidden = false;
    return;
  }

  showAwaitingEmail(email);
});

logoutButton.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  showLogin();
});

tabsEl.addEventListener("click", (event) => {
  const button = event.target.closest(".side-tab");
  if (!button) return;
  searchMode = false;
  searchInput.value = "";
  activeTab = button.dataset.tab;
  for (const tab of tabsEl.querySelectorAll(".side-tab")) {
    tab.classList.toggle("active", tab === button);
  }
  loadActiveTab();
});

refreshButton.addEventListener("click", () => {
  if (searchMode) {
    runSearch(searchInput.value);
  } else {
    refreshAllCounts();
    loadActiveTab();
  }
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;
  searchMode = true;
  for (const tab of tabsEl.querySelectorAll(".side-tab")) {
    tab.classList.remove("active");
  }
  runSearch(query);
});

async function runSearch(query) {
  panelTitle.textContent = `Search results for "${query}"`;
  panelBody.innerHTML = '<p class="empty-state">Searching…</p>';

  const { data, error } = await supabaseClient.rpc("admin_search_profiles", { p_query: query, p_limit: 30 });

  if (error) {
    panelBody.innerHTML = `<p class="empty-state">Could not search: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    panelBody.innerHTML = '<p class="empty-state">No matching users.</p>';
    return;
  }

  panelBody.innerHTML = "";
  for (const row of data) {
    panelBody.appendChild(renderSearchResultCard(row));
  }
}

async function refreshAllCounts() {
  const entries = QUEUE_TABS.map((key) => [key, TABS[key]]);
  const results = await Promise.all(entries.map(([, config]) => supabaseClient.rpc(config.listFn)));
  results.forEach(({ data, error }, i) => {
    const [, config] = entries[i];
    const countEl = document.getElementById(config.countEl);
    if (countEl && !error) countEl.textContent = String(data.length);
  });
}

function buildActionsRow(row, config) {
  const actionsEl = document.createElement("div");
  actionsEl.className = "row-actions";
  for (const action of config.actions) {
    const btn = document.createElement("button");
    btn.className = `action-button ${action.kind}`;
    btn.textContent = action.label;
    btn.addEventListener("click", () => runAction(row, config, action, btn));
    actionsEl.appendChild(btn);
  }
  return actionsEl;
}

async function runAction(row, config, action, button) {
  if (action.kind === "negative") {
    const name = row.display_name || "this account";
    const confirmed = confirm(`${action.label} ${name}? This cannot be undone.`);
    if (!confirmed) return;
  }

  const card = button.closest(".card");
  const buttons = card.querySelectorAll(".action-button");
  for (const b of buttons) b.disabled = true;
  button.textContent = "Working…";

  const params = { [config.idParam]: row.id, p_decision: action.decision };
  const { error } = await supabaseClient.rpc(config.resolveFn, params);

  if (error) {
    alert(`Failed: ${error.message}`);
    for (const b of buttons) b.disabled = false;
    button.textContent = action.label;
    return;
  }

  card.remove();
  const countEl = document.getElementById(config.countEl);
  if (countEl) countEl.textContent = String(Math.max(0, Number(countEl.textContent) - 1));
  if (!panelBody.querySelector(".card")) {
    panelBody.innerHTML = '<p class="empty-state">Nothing here right now.</p>';
  }
}

function appendRows(config, data) {
  for (const row of data) {
    const item = config.render(row);
    if (config.actions) item.appendChild(buildActionsRow(row, config));
    panelBody.appendChild(item);
  }
}

function showLoadMoreIfNeeded(config, data) {
  const existing = panelBody.querySelector(".load-more-row");
  if (existing) existing.remove();

  if (data.length < PAGE_SIZE) return;

  const wrap = document.createElement("div");
  wrap.className = "load-more-row";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost-button";
  button.textContent = "Load more";
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Loading…";
    currentOffset += PAGE_SIZE;
    const { data: moreData, error } = await supabaseClient.rpc(config.listFn, {
      p_limit: PAGE_SIZE,
      p_offset: currentOffset,
    });
    wrap.remove();
    if (error) {
      alert(`Could not load more: ${error.message}`);
      return;
    }
    appendRows(config, moreData);
    showLoadMoreIfNeeded(config, moreData);
  });
  wrap.appendChild(button);
  panelBody.appendChild(wrap);
}

async function loadActiveTab() {
  const config = TABS[activeTab];
  currentOffset = 0;
  panelTitle.textContent = config.label;
  panelBody.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data, error } = await supabaseClient.rpc(config.listFn, { p_limit: PAGE_SIZE, p_offset: 0 });

  if (error) {
    panelBody.innerHTML = `<p class="empty-state">Could not load: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const countEl = document.getElementById(config.countEl);
  if (countEl) countEl.textContent = String(data.length) + (data.length === PAGE_SIZE ? "+" : "");

  if (data.length === 0) {
    panelBody.innerHTML = '<p class="empty-state">Nothing here right now.</p>';
    return;
  }

  panelBody.innerHTML = "";
  appendRows(config, data);
  showLoadMoreIfNeeded(config, data);
}

(async function init() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    showApp();
  } else {
    showLogin();
  }
})();
