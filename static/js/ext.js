/**
 * ext.js – Extensions avancées
 * Notifications, validation, Chart.js, diamètres dynamiques.
 *
 * Inclure dans base.html APRÈS app.js :
 *   <script src="{{ url_for('static', filename='js/ext.js') }}"></script>
 */

"use strict";

// ─── Helper API ───────────────────────────────────────────────────────────────

async function extApi(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function showExt(elOrId, text, type = "success") {
  const el = typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  el.textContent = text;
  el.className   = `msg ${type}`;
  el.classList.remove("hidden");
  if (type === "success") setTimeout(() => el.classList.add("hidden"), 3500);
}

// ─── Badge statut ─────────────────────────────────────────────────────────────

function statusBadge(status) {
  const map = {
    pending:  '<span class="st-badge st-pending">⏳ En attente</span>',
    approved: '<span class="st-badge st-approved">✅ Approuvé</span>',
    rejected: '<span class="st-badge st-rejected">❌ Rejeté</span>',
  };
  return map[status] || `<span class="st-badge">${status}</span>`;
}

// ─── Badge notification navbar ────────────────────────────────────────────────

async function refreshNotifBadge() {
  try {
    const data = await extApi("/api/notifications");
    const badge = document.getElementById("notif-badge");
    if (!badge) return;
    if (typeof data.pending_count === "number") {
      badge.textContent = data.pending_count;
      badge.style.display = data.pending_count > 0 ? "inline-flex" : "none";
    }
  } catch (_) {}
}

// Appeler au chargement de chaque page
document.addEventListener("DOMContentLoaded", refreshNotifBadge);

// ═══════════════════════════════════════════════════════════════════════════════
// ÉCRAN: TRAVAUX EN ATTENTE (admin)
// ═══════════════════════════════════════════════════════════════════════════════

function initPendingScreen() {
  const tbody   = document.querySelector("#tbl-pending tbody");
  const msgEl   = document.getElementById("pending-msg");
  const counter = document.getElementById("pending-count-val");

  async function load() {
    const rows = await extApi("/api/admin/pending");

    // Mettre à jour le compteur
    if (counter) {
      counter.textContent = rows.length;
      const parent = counter.parentElement;
      if (parent) {
        parent.querySelector("span:last-child").textContent =
          ` travail${rows.length !== 1 ? "s" : ""} en attente`;
      }
    }

    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align:center;padding:3rem;color:var(--green)">
            ✅ Aucun travail en attente — tout est à jour !
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = rows.map(w => `
      <tr id="pr-${w.id}">
        <td>${w.date}</td>
        <td><strong>${w.username}</strong></td>
        <td>${w.reseau}</td>
        <td><span class="agr-chip">${w.agr}</span></td>
        <td>${w.secteur}</td>
        <td>${w.marche}</td>
        <td><code style="font-size:.8rem">${w.diametre}</code></td>
        <td class="num">${Number(w.quantite_unite).toFixed(2)}</td>
        <td class="num"><strong>${Number(w.quantite_ml).toFixed(2)}</strong></td>
        <td>${w.serie || '–'}</td>
        <td>
          <button class="btn btn-sm btn-approve" onclick="approveWork(${w.id})">
            ✅ Approuver
          </button>
        </td>
        <td>
          <button class="btn btn-sm btn-reject" onclick="rejectWork(${w.id})">
            ❌ Rejeter
          </button>
        </td>
      </tr>
    `).join("");
  }

  window.approveWork = async function(wid) {
    try {
      await extApi(`/api/work/${wid}/approve`, { method: "POST" });
      document.getElementById(`pr-${wid}`)?.remove();
      if (counter) counter.textContent = parseInt(counter.textContent) - 1;
      refreshNotifBadge();
      showExt(msgEl, "✅ Travail approuvé avec succès.", "success");
    } catch (e) { showExt(msgEl, e.message, "error"); }
  };

  window.rejectWork = async function(wid) {
    if (!confirm("Rejeter définitivement ce travail ?")) return;
    try {
      await extApi(`/api/work/${wid}/reject`, { method: "POST" });
      document.getElementById(`pr-${wid}`)?.remove();
      if (counter) counter.textContent = parseInt(counter.textContent) - 1;
      refreshNotifBadge();
      showExt(msgEl, "Travail rejeté.", "success");
    } catch (e) { showExt(msgEl, e.message, "error"); }
  };

  load();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ÉCRAN: MES TRAVAUX (utilisateur)
// ═══════════════════════════════════════════════════════════════════════════════

function initMesTravaux() {
  const tbody = document.querySelector("#tbl-mes-travaux tbody");

  async function load() {
    const rows = await extApi("/api/notifications");

    if (!Array.isArray(rows) || !rows.length) {
      tbody.innerHTML = `
        <tr><td colspan="8" class="muted" style="text-align:center;padding:2rem">
          Aucun travail enregistré.
        </td></tr>`;
      // Reset counters
      ["cnt-pending","cnt-approved","cnt-rejected"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = "0";
      });
      return;
    }

    // Compteurs par statut
    const counts = { pending: 0, approved: 0, rejected: 0 };
    rows.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
    const setC = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
    setC("cnt-pending",  counts.pending);
    setC("cnt-approved", counts.approved);
    setC("cnt-rejected", counts.rejected);

    tbody.innerHTML = rows.map(w => `
      <tr class="status-row-${w.status}">
        <td>${w.date}</td>
        <td>${w.reseau}</td>
        <td>${w.marche}</td>
        <td>${w.agr}</td>
        <td>${w.secteur}</td>
        <td><code style="font-size:.8rem">${w.diametre}</code></td>
        <td class="num"><strong>${Number(w.quantite_ml).toFixed(2)}</strong></td>
        <td style="text-align:center">${statusBadge(w.status)}</td>
      </tr>
    `).join("");
  }

  load();
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIAMÈTRES DYNAMIQUES (page saisie)
// ═══════════════════════════════════════════════════════════════════════════════

async function loadDiameterDropdown(selectId = "diametre") {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  try {
    const diams = await extApi("/api/diameters");
    // Conserver la valeur sélectionnée si elle existe
    const current = sel.value;
    sel.innerHTML = '<option value="">– Diamètre –</option>' +
      diams.map(d => `<option value="${d.value}">${d.value}</option>`).join("");
    if (current) sel.value = current;
  } catch (e) {
    console.warn("Impossible de charger les diamètres:", e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: GESTION DES DIAMÈTRES
// ═══════════════════════════════════════════════════════════════════════════════

function initDiameterAdmin() {
  const form  = document.getElementById("form-diam");
  const msg   = document.getElementById("msg-diam");
  const tbody = document.querySelector("#tbl-diams tbody");

  async function loadDiams() {
    if (!tbody) return;
    const rows = await extApi("/api/diameters");
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="2" class="muted">Aucun diamètre.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(d => `
      <tr id="diam-row-${d.id}">
        <td id="diam-val-${d.id}">${d.value}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm" style="background:#f0fdf4;color:var(--green);border:1px solid #bbf7d0"
                  onclick="editDiam(${d.id})">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteDiam(${d.id})">🗑</button>
        </td>
      </tr>
    `).join("");
  }

  if (form) {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const val = document.getElementById("diam-val-new")?.value.trim();
      if (!val) return;
      try {
        const r = await extApi("/api/admin/diameters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: val })
        });
        showExt(msg, "Diamètre ajouté ✓", "success");
        form.reset();
        loadDiams();
        // Mettre à jour tous les selects de diamètre sur la page
        loadDiameterDropdown("diametre");
        loadDiameterDropdown("pr-diam");
      } catch (err) { showExt(msg, err.message, "error"); }
    });
  }

  window.deleteDiam = async function(did) {
    if (!confirm("Supprimer ce diamètre ?")) return;
    try {
      await extApi(`/api/admin/diameters/${did}`, { method: "DELETE" });
      document.getElementById(`diam-row-${did}`)?.remove();
    } catch (err) { alert(err.message); }
  };

  window.editDiam = async function(did) {
    const cell = document.getElementById(`diam-val-${did}`);
    const old  = cell?.textContent || "";
    const nv   = prompt("Nouveau nom du diamètre :", old);
    if (!nv || nv.trim() === old) return;
    try {
      await extApi(`/api/admin/diameters/${did}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: nv.trim() })
      });
      if (cell) cell.textContent = nv.trim();
    } catch (err) { alert(err.message); }
  };

  loadDiams();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: MODIFIER MARCHÉ (PUT)
// ═══════════════════════════════════════════════════════════════════════════════

window.editProvenance = async function(pid) {
  const cell = document.getElementById(`prov-ref-${pid}`);
  const old  = cell?.textContent || "";
  const nv   = prompt("Nouveau nom du marché :", old);
  if (!nv || nv.trim() === old) return;
  try {
    await extApi(`/api/admin/provenance/${pid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: nv.trim() })
    });
    if (cell) cell.textContent = nv.trim();
    // Mettre à jour les selects sur la page
    document.querySelectorAll(`option[data-prov-id="${pid}"]`)
      .forEach(o => { o.textContent = nv.trim(); });
  } catch (err) { alert("Erreur : " + err.message); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: MODIFIER TARIF (PUT)
// ═══════════════════════════════════════════════════════════════════════════════

window.editPrice = async function(pid) {
  const row  = document.getElementById(`price-row-${pid}`);
  if (!row) return;
  const cells = row.querySelectorAll("td");
  const oldF  = cells[2]?.textContent.replace(/\s/g, "").replace(",", ".") || "0";
  const oldP  = cells[3]?.textContent.replace(/\s/g, "").replace(",", ".") || "0";

  const newF  = prompt("Nouveau prix fourniture (MAD/ml) :", oldF);
  if (newF === null) return;
  const newP  = prompt("Nouveau prix pose (MAD/ml) :", oldP);
  if (newP === null) return;

  try {
    await extApi(`/api/admin/prices/${pid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prix_fourniture: parseFloat(newF) || 0,
        prix_pose:       parseFloat(newP) || 0
      })
    });
    if (cells[2]) cells[2].textContent = parseFloat(newF).toFixed(2);
    if (cells[3]) cells[3].textContent = parseFloat(newP).toFixed(2);
  } catch (err) { alert("Erreur : " + err.message); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPHIQUES CHART.JS (page stats)
// ═══════════════════════════════════════════════════════════════════════════════

let _chartBar = null;
let _chartPie = null;

window.toggleStatsView = function(view) {
  const tableDiv  = document.getElementById("tables-view");
  const chartsDiv = document.getElementById("charts-view");
  const btnTable  = document.getElementById("btn-tbl");
  const btnChart  = document.getElementById("btn-chrt");

  if (view === "chart") {
    tableDiv?.classList.add("hidden");
    chartsDiv?.classList.remove("hidden");
    btnTable?.classList.remove("toggle-active");
    btnChart?.classList.add("toggle-active");
    _loadChartJs();
  } else {
    tableDiv?.classList.remove("hidden");
    chartsDiv?.classList.add("hidden");
    btnChart?.classList.remove("toggle-active");
    btnTable?.classList.add("toggle-active");
  }
};

function _loadChartJs() {
  if (window.Chart) { _drawCharts(); return; }
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
  s.onload = _drawCharts;
  document.head.appendChild(s);
}

async function _drawCharts() {
  let data;
  try { data = await extApi("/api/stats"); }
  catch (e) { console.error("Erreur stats:", e); return; }

  const PALETTE = ["#1d4ed8","#0d9488","#ea580c","#7c3aed","#db2777",
                   "#16a34a","#d97706","#0891b2","#b91c1c","#4338ca"];

  // ── Bar : réseau vs ml ───────────────────────────────────────────────────
  const barCtx = document.getElementById("chart-bar")?.getContext("2d");
  if (barCtx) {
    if (_chartBar) _chartBar.destroy();
    _chartBar = new Chart(barCtx, {
      type: "bar",
      data: {
        labels: data.par_reseau.map(r => r.label),
        datasets: [{
          label: "Quantité approuvée (ml)",
          data:  data.par_reseau.map(r => parseFloat(r.total_ml)),
          backgroundColor: data.par_reseau.map((_, i) => PALETTE[i % PALETTE.length]),
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title:  { display: true, text: "Quantité (ml) approuvée par Réseau", font: { size: 13 } }
        },
        scales: { y: { beginAtZero: true, grid: { color: "#e2e8f0" } } }
      }
    });
  }

  // ── Doughnut : distribution par marché ──────────────────────────────────
  const pieCtx = document.getElementById("chart-pie")?.getContext("2d");
  if (pieCtx) {
    if (_chartPie) _chartPie.destroy();
    const labels = data.par_marche.map(r => r.label);
    const values = data.par_marche.map(r => parseFloat(r.total_ml));
    _chartPie = new Chart(pieCtx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: PALETTE.slice(0, labels.length),
          borderWidth: 3,
          borderColor: "#fff",
          hoverOffset: 8,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title:  { display: true, text: "Distribution par Marché (ml approuvés)", font: { size: 13 } },
          legend: { position: "right" }
        }
      }
    });
  }

  // ── Bar horizontal : coûts par AGR ──────────────────────────────────────
  const costCtx = document.getElementById("chart-costs")?.getContext("2d");
  if (costCtx) {
    const labels = data.par_agr.map(r => r.label);
    new Chart(costCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Fourniture (MAD)",
            data:  data.par_agr.map(r => parseFloat(r.fourniture || 0)),
            backgroundColor: "#3b82f6",
            borderRadius: 4,
          },
          {
            label: "Pose (MAD)",
            data:  data.par_agr.map(r => parseFloat(r.pose || 0)),
            backgroundColor: "#0d9488",
            borderRadius: 4,
          }
        ]
      },
      options: {
        responsive: true,
        indexAxis: "y",
        plugins: {
          title: { display: true, text: "Coûts par AGR (MAD)", font: { size: 13 } }
        },
        scales: {
          x: { beginAtZero: true, stacked: false, grid: { color: "#e2e8f0" } },
          y: { stacked: false }
        }
      }
    });
  }
}
