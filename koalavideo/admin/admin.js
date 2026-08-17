const SUPABASE_URL = "https://ndgdzwprwphklqwyxque.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kZ2R6d3Byd3Boa2xxd3l4cXVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMzMzMDcsImV4cCI6MjEwMTgwOTMwN30.6d9lBoh-pQ4lqtYO07LKmuMHLa3yq0q3x1DhYjOV2Tw";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

const TABS = {
  pending: {
    label: "Under Review",
    listFn: "admin_list_pending_profiles",
    resolveFn: "admin_resolve_profile",
    idParam: "p_user_id",
    render(row) {
      return {
        name: row.display_name || "(no name)",
        meta: `${row.age ?? "?"} · ${escapeHtml(row.city ?? "unknown city")} · submitted ${formatDate(row.created_at)}`,
        actions: [
          { label: "Approve", kind: "positive", decision: "approve" },
          { label: "Reject", kind: "negative", decision: "reject" },
        ],
      };
    },
  },
  safety: {
    label: "Nude Hold",
    listFn: "admin_list_safety_holds",
    resolveFn: "admin_resolve_safety_incident",
    idParam: "p_incident_id",
    render(row) {
      return {
        name: `Incident ${row.id.slice(0, 8)}…`,
        meta: `subject <code>${row.subject_user_id.slice(0, 8)}…</code> · ${row.trigger} · flagged ${formatDate(row.created_at)}`,
        actions: [
          { label: "Clear", kind: "positive", decision: "cleared" },
          { label: "Confirm violation", kind: "negative", decision: "confirmed" },
        ],
      };
    },
  },
  reports: {
    label: "Report Hold",
    listFn: "admin_list_report_holds",
    resolveFn: "admin_resolve_report_hold",
    idParam: "p_user_id",
    render(row) {
      const until = row.report_hold_until
        ? `auto-reopens ${formatDate(row.report_hold_until)}`
        : "no auto-reopen — manual only";
      return {
        name: row.display_name || "(no name)",
        meta: `tier ${row.report_hold_tier} · ${until}`,
        actions: [
          { label: "Reopen", kind: "positive", decision: "reopen" },
          { label: "Suspend", kind: "negative", decision: "suspend" },
        ],
      };
    },
  },
  photos: {
    label: "Profile Pic Update",
    listFn: "admin_list_pending_photos",
    resolveFn: "admin_resolve_pending_photo",
    idParam: "p_user_id",
    render(row) {
      return {
        name: row.display_name || "(no name)",
        meta: `new photo submitted ${formatDate(row.updated_at)}`,
        actions: [
          { label: "Approve", kind: "positive", decision: "approve" },
          { label: "Reject", kind: "negative", decision: "reject" },
        ],
      };
    },
  },
};

let activeTab = "pending";

const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginForm = document.getElementById("login-form");
const loginButton = document.getElementById("login-button");
const loginError = document.getElementById("login-error");
const logoutButton = document.getElementById("logout-button");
const tabsEl = document.getElementById("tabs");
const panelBody = document.getElementById("panel-body");
const panelCount = document.getElementById("panel-count");
const refreshButton = document.getElementById("refresh-button");

function showApp() {
  loginScreen.hidden = true;
  appScreen.hidden = false;
  loadActiveTab();
}

function showLogin(message) {
  appScreen.hidden = true;
  loginScreen.hidden = false;
  if (message) {
    loginError.textContent = message;
    loginError.hidden = false;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  loginButton.disabled = true;
  loginButton.textContent = "Signing in…";

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  loginButton.disabled = false;
  loginButton.textContent = "Sign in";

  if (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
    return;
  }

  showApp();
});

logoutButton.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  showLogin();
});

tabsEl.addEventListener("click", (event) => {
  const button = event.target.closest(".tab");
  if (!button) return;
  activeTab = button.dataset.tab;
  for (const tab of tabsEl.querySelectorAll(".tab")) {
    tab.classList.toggle("active", tab === button);
  }
  loadActiveTab();
});

refreshButton.addEventListener("click", loadActiveTab);

async function loadActiveTab() {
  const config = TABS[activeTab];
  panelBody.innerHTML = '<p class="empty-state">Loading…</p>';

  const { data, error } = await supabaseClient.rpc(config.listFn);

  if (error) {
    panelBody.innerHTML = `<p class="empty-state">Could not load: ${escapeHtml(error.message)}</p>`;
    panelCount.textContent = "0";
    return;
  }

  panelCount.textContent = String(data.length);

  if (data.length === 0) {
    panelBody.innerHTML = '<p class="empty-state">Nothing here right now.</p>';
    return;
  }

  panelBody.innerHTML = "";
  for (const row of data) {
    panelBody.appendChild(renderRow(row, config));
  }
}

function renderRow(row, config) {
  const info = config.render(row);
  const el = document.createElement("div");
  el.className = "row";

  const infoEl = document.createElement("div");
  infoEl.className = "row-info";
  infoEl.innerHTML = `<div class="row-name">${escapeHtml(info.name)}</div><div class="row-meta">${info.meta}</div>`;

  const actionsEl = document.createElement("div");
  actionsEl.className = "row-actions";

  for (const action of info.actions) {
    const btn = document.createElement("button");
    btn.className = `action-button ${action.kind}`;
    btn.textContent = action.label;
    btn.addEventListener("click", () => runAction(row, config, action, btn, el));
    actionsEl.appendChild(btn);
  }

  el.appendChild(infoEl);
  el.appendChild(actionsEl);
  return el;
}

async function runAction(row, config, action, button, rowEl) {
  const buttons = rowEl.querySelectorAll(".action-button");
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

  rowEl.remove();
  const remaining = Number(panelCount.textContent) - 1;
  panelCount.textContent = String(Math.max(0, remaining));
  if (remaining <= 0) {
    panelBody.innerHTML = '<p class="empty-state">Nothing here right now.</p>';
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

(async function init() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    showApp();
  } else {
    showLogin();
  }
})();
