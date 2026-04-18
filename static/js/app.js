/**
 * app.js – Suivi Réseaux d'Irrigation
 * Logique frontend pour les 4 écrans : carte, saisie, stats, admin.
 */

const CONV = 6.81;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function fmt(n, dec = 2) {
  return Number(n).toLocaleString("fr-MA", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function showMsg(el, text, type = "success") {
  el.textContent = text;
  el.className   = `msg ${type}`;
  el.classList.remove("hidden");
  if (type === "success") setTimeout(() => el.classList.add("hidden"), 3500);
}

function showInlineMsg(el, text, type = "success") {
  el.textContent = text;
  el.className   = `msg-inline ${type}`;
  el.classList.remove("hidden");
  if (type === "success") setTimeout(() => el.classList.add("hidden"), 3000);
}

function confirmDel(msg) {
  return window.confirm(msg || "Supprimer cet élément ?");
}

// ─── ÉCRAN CARTE ─────────────────────────────────────────────────────────────

function initMapScreen() {
  // Carte Leaflet centrée sur le Maroc
  const map = L.map("map").setView([34.0, -6.5], 10);
  // Satellite base (ESRI — free, no API key)
  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: 'Tiles © Esri' }
  ).addTo(map);

  // Place names on top of satellite
  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, opacity: 0.7 }
  ).addTo(map);

  let layers     = {};      // reseau_id → L.geoJSON layer
  let activeId   = null;
  let reseauxData = [];

  const panel      = document.getElementById("reseau-panel");
  const panelName  = document.getElementById("panel-name");
  const panelTotal = document.getElementById("panel-total");
  const panelBreak = document.getElementById("panel-breakdown");
  const panelWorks = document.getElementById("panel-works");
  const listEl     = document.getElementById("reseaux-list");

  // ── Charger la liste des réseaux et leurs totaux ──────────────────────────
  async function loadReseaux() {
    reseauxData = await api("/api/map/reseaux");
    renderSidebarList();
    loadAllGeoJSON();
  }

  function renderSidebarList() {
    listEl.innerHTML = reseauxData.map(r => `
      <div class="reseau-item ${r.id === activeId ? 'selected' : ''}" onclick="selectReseau(${r.id})">
        <span class="reseau-dot ${r.total_ml > 0 ? 'has-work' : 'no-work'}"></span>
        <span class="reseau-item-name">${r.name}</span>
        <span class="reseau-item-ml">${fmt(r.total_ml)} ml</span>
      </div>
    `).join("") || '<p class="muted">Aucun réseau.</p>';
  }

  // ── Charger tous les GeoJSON sur la carte ─────────────────────────────────
  async function loadAllGeoJSON() {
    for (const r of reseauxData) {
      try {
        const res = await fetch(`/static/geojson/${r.geojson_file}`);
        const gj  = await res.json();
        const layer = L.geoJSON(gj, {
          style: () => styleForReseau(r),
          onEachFeature(feature, lyr) {
            lyr.on("click", () => selectReseau(r.id));
          }
        }).addTo(map);
        layers[r.id] = layer;
      } catch (e) {
        console.warn("GeoJSON non trouvé :", r.geojson_file);
      }
    }
    // Adapter la vue si des couches existent
    const allLayers = Object.values(layers);
    if (allLayers.length) {
      const group = L.featureGroup(allLayers);
      if (group.getBounds().isValid()) map.fitBounds(group.getBounds(), { padding: [30, 30] });
    }
  }

  function styleForReseau(r) {
    const active  = r.id === activeId;
    const hasWork = r.total_ml > 0;
    return {
      color:       active  ? "#ea580c" : (hasWork ? "#15803d" : "#1d4ed8"),
      fillColor:   active  ? "#fb923c" : (hasWork ? "#22c55e" : "#3b82f6"),
      weight:      active  ? 5 : 3,
      opacity:     0.9,
      fillOpacity: active  ? 0.35 : 0.2,
    };
  }

  function refreshStyles() {
    for (const r of reseauxData) {
      if (layers[r.id]) layers[r.id].setStyle(styleForReseau(r));
    }
  }

  // ── Sélectionner un réseau ────────────────────────────────────────────────
  window.selectReseau = async function(rid) {
    activeId = rid;
    renderSidebarList();
    refreshStyles();

    const r = reseauxData.find(x => x.id === rid);
    if (!r) return;

    panelName.textContent  = r.name;
    panelTotal.textContent = fmt(r.total_ml);

    // Répartition par marché
    if (r.breakdown.length) {
      panelBreak.innerHTML = r.breakdown.map(b => `
        <div class="breakdown-item">
          <span class="breakdown-ref">${b.ref}</span>
          <span class="breakdown-ml">${fmt(b.ml)} ml</span>
        </div>
      `).join("");
    } else {
      panelBreak.innerHTML = '<p class="muted">Aucun travail enregistré.</p>';
    }

    panel.classList.remove("hidden");
    await loadPanelWorks(rid);

    // Centrer sur ce réseau
    if (layers[rid]) map.fitBounds(layers[rid].getBounds(), { padding: [40, 40], maxZoom: 16 });
  };

  // ── Travaux dans le panneau ───────────────────────────────────────────────
  async function loadPanelWorks(rid) {
    panelWorks.innerHTML = '<p class="muted">Chargement…</p>';
    const works = await api(`/api/work/reseau/${rid}`);
    if (!works.length) {
      panelWorks.innerHTML = '<p class="muted">Aucun travail.</p>';
      return;
    }
    panelWorks.innerHTML = `
      <table class="works-table">
        <thead><tr><th>Date</th><th>AGR</th><th>Marché</th><th>Ø</th><th>ml</th><th>Statut</th><th></th></tr></thead>
        <tbody>
          ${works.map(w => {
            const isAdmin = window.__IS_ADMIN__ === true;
            const canDel  = isAdmin || w.status === "pending";
            return `
              <tr id="pw-${w.id}" class="status-row-${w.status}">
                <td>${w.date}</td>
                <td>${w.agr}</td>
                <td>${w.marche}</td>
                <td>${w.diametre}</td>
                <td class="num"><strong>${fmt(w.quantite_ml)}</strong></td>
                <td>${statusBadge(w.status)}</td>
                <td>${canDel
                  ? `<button class="del-btn" onclick="delWork(${w.id},${rid})" title="Supprimer">🗑</button>`
                  : ''}</td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>`;
  }

  window.delWork = async function(wid, rid) {
    if (!confirmDel("Supprimer ce travail ?")) return;
    try {
      await api(`/api/work/${wid}`, { method: "DELETE" });
      await loadReseaux();           // refresh totals
      await loadPanelWorks(rid);
      panel.querySelector(".stat-val").textContent = fmt(reseauxData.find(r=>r.id===rid)?.total_ml||0);
    } catch (e) { alert(e.message); }
  };

  window.closePanel = function() {
    panel.classList.add("hidden");
    activeId = null;
    renderSidebarList();
    refreshStyles();
  };

  loadReseaux();
}

// ─── ÉCRAN SAISIE ────────────────────────────────────────────────────────────

function initSaisieScreen() {
  const qInput   = document.getElementById("quantite_unite");
  const convBox  = document.getElementById("conversion-preview");
  const convVal  = document.getElementById("conv-value");
  const submitBtn= document.getElementById("submit-btn");
  const msgEl    = document.getElementById("saisie-msg");
  const recentEl = document.getElementById("recent-list");

  // Aperçu conversion en temps réel
  qInput.addEventListener("input", () => {
    const v = parseFloat(qInput.value);
    if (v > 0) {
      convVal.textContent = fmt(v * CONV);
      convBox.classList.remove("hidden");
    } else {
      convBox.classList.add("hidden");
    }
  });

  // Charger travaux récents de l'utilisateur
  async function loadRecent() {
    // On récupère depuis la saisie : travaux de tous les réseaux de l'utilisateur
    recentEl.innerHTML = '<p class="muted">Chargement…</p>';
    // Petit trick : on récupère le premier réseau disponible pour afficher
    const reseaux = await api("/api/reseaux");
    let all = [];
    for (const r of reseaux) {
      const works = await api(`/api/work/reseau/${r.id}`);
      all = all.concat(works.map(w => ({ ...w, reseau: r.name })));
    }
    // Trier par date desc, garder les 15 plus récents
    all.sort((a, b) => b.date.localeCompare(a.date));
    all = all.slice(0, 15);

    if (!all.length) {
      recentEl.innerHTML = '<p class="muted">Aucun travail enregistré.</p>';
      return;
    }
    // isAdmin is embedded by the server via a global var set in the template
    const isAdmin = window.__IS_ADMIN__ === true;
    recentEl.innerHTML = all.map(w => {
      // Delete button: admin always; user only on pending work
      const canDel = isAdmin || w.status === "pending";
      const delBtn = canDel
        ? `<button class="ri-del" onclick="delRecentWork(${w.id})" title="Supprimer">🗑</button>`
        : "";
      return `
        <div class="recent-item status-row-${w.status}" id="ri-${w.id}">
          <div class="ri-left">
            <span><strong>${w.reseau}</strong> — ${w.marche} — ${w.diametre}</span>
            <span class="muted">${w.agr} · ${w.secteur} · ${w.date}</span>
          </div>
          <span class="ri-ml">${fmt(w.quantite_ml)} ml</span>
          ${statusBadge(w.status)}
          ${delBtn}
        </div>`;
    }).join("");
  }

  window.delRecentWork = async function(wid) {
    if (!confirmDel("Supprimer ce travail ?")) return;
    try {
      await api(`/api/work/${wid}`, { method: "DELETE" });
      document.getElementById(`ri-${wid}`)?.remove();
    } catch (e) { alert(e.message); }
  };

  // Soumettre le formulaire
  submitBtn.addEventListener("click", async () => {
    const body = {
      annee:         document.getElementById("annee").value,
      reseau_id:     document.getElementById("reseau_id").value,
      agr:           document.getElementById("agr").value,
      secteur:       document.getElementById("secteur").value,
      diametre:      document.getElementById("diametre").value,
      quantite_unite:document.getElementById("quantite_unite").value,
      provenance_id: document.getElementById("provenance_id").value,
      serie:         document.getElementById("serie").value,
    };

    // Validation basique
    const required = ["annee","reseau_id","agr","secteur","diametre","quantite_unite","provenance_id"];
    if (!required.every(k => String(body[k] || "").trim())) {
      showMsg(msgEl, "Veuillez remplir tous les champs obligatoires.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Enregistrement…";
    try {
      const res = await api("/api/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      showMsg(msgEl, `✅ Travail enregistré — ${fmt(res.quantite_ml)} ml`, "success");
      // Réinitialiser
      document.getElementById("quantite_unite").value = "";
      document.getElementById("serie").value = "";
      convBox.classList.add("hidden");
      loadRecent();
    } catch (e) {
      showMsg(msgEl, e.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "💾 Enregistrer le travail";
    }
  });

  loadRecent();
}

// ─── ÉCRAN STATISTIQUES ──────────────────────────────────────────────────────

function initStatsScreen() {
  const kpis = {
    ml:    document.getElementById("kpi-ml"),
    four:  document.getElementById("kpi-four"),
    pose:  document.getElementById("kpi-pose"),
    total: document.getElementById("kpi-total"),
  };
  const tbls = {
    reseau:  document.querySelector("#tbl-reseau tbody"),
    agr:     document.querySelector("#tbl-agr tbody"),
    marche:  document.querySelector("#tbl-marche tbody"),
    secteur: document.querySelector("#tbl-secteur tbody"),
  };

  function costRow(r) {
    const total = (r.fourniture || 0) + (r.pose || 0);
    return `
      <td>${r.label}</td>
      <td class="num">${fmt(r.total_ml)}</td>
      <td class="num">${fmt(r.fourniture||0)}</td>
      <td class="num">${fmt(r.pose||0)}</td>
      <td class="num"><strong>${fmt(total)}</strong></td>`;
  }

  function fillTable(tbody, rows) {
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">Aucune donnée.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `<tr>${costRow(r)}</tr>`).join("");
  }

  async function loadStats() {
    const d = await api("/api/stats");
    const t = d.totals;
    kpis.ml.textContent    = fmt(t.total_ml);
    kpis.four.textContent  = fmt(t.fourniture);
    kpis.pose.textContent  = fmt(t.pose);
    kpis.total.textContent = fmt((t.fourniture||0) + (t.pose||0));

    fillTable(tbls.reseau,  d.par_reseau);
    fillTable(tbls.agr,     d.par_agr);
    fillTable(tbls.marche,  d.par_marche);
    fillTable(tbls.secteur, d.par_secteur);
  }

  loadStats();
}

// ─── ÉCRAN ADMIN ─────────────────────────────────────────────────────────────

function initAdminScreen() {
  // ── Utilisateurs ──────────────────────────────────────────────────────────
  document.getElementById("form-user").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = document.getElementById("msg-user");
    const body = {
      username: document.getElementById("u-username").value.trim(),
      password: document.getElementById("u-password").value.trim(),
      role:     document.getElementById("u-role").value,
      agr:      document.getElementById("u-agr").value || null,
    };
    try {
      const res = await api("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      showInlineMsg(msg, "Ajouté ✓");
      // Ajouter ligne au tableau
      const tbody = document.querySelector("#tbl-users tbody");
      const tr = document.createElement("tr");
      tr.id = `user-row-${res.id}`;
      tr.innerHTML = `
        <td>${body.username}</td>
        <td><span class="badge ${body.role}">${body.role==='super_admin'?'Admin':'Utilisateur'}</span></td>
        <td>${body.agr||'–'}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteUser(${res.id})">Supprimer</button></td>`;
      tbody.appendChild(tr);
      e.target.reset();
    } catch (err) {
      showInlineMsg(msg, err.message, "error");
    }
  });

  window.deleteUser = async function(uid) {
    if (!confirmDel("Supprimer cet utilisateur ?")) return;
    try {
      await api(`/api/admin/users/${uid}`, { method: "DELETE" });
      document.getElementById(`user-row-${uid}`)?.remove();
    } catch (err) { alert(err.message); }
  };

  // ── Réseaux ───────────────────────────────────────────────────────────────
  document.getElementById("form-reseau").addEventListener("submit", async e => {
    e.preventDefault();
    const msg  = document.getElementById("msg-reseau");
    const name = document.getElementById("r-name").value.trim();
    const file = document.getElementById("r-file").files[0];
    const fd   = new FormData();
    fd.append("name", name);
    fd.append("geojson_file", file);
    try {
      const r = await fetch("/api/admin/reseaux", { method: "POST", body: fd }).then(async res => {
        if (!res.ok) throw new Error((await res.json()).error);
        return res.json();
      });
      showInlineMsg(msg, "Ajouté ✓");
      const tbody = document.querySelector("#tbl-reseaux tbody");
      const tr = document.createElement("tr");
      tr.id = `reseau-row-${r.id}`;
      tr.innerHTML = `<td>${r.name}</td><td><code>${r.geojson_file}</code></td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteReseau(${r.id})">Supprimer</button></td>`;
      tbody.appendChild(tr);
      e.target.reset();
    } catch (err) { showInlineMsg(msg, err.message, "error"); }
  });

  window.deleteReseau = async function(rid) {
    if (!confirmDel("Supprimer ce réseau et tous ses travaux ?")) return;
    try {
      await api(`/api/admin/reseaux/${rid}`, { method: "DELETE" });
      document.getElementById(`reseau-row-${rid}`)?.remove();
    } catch (err) { alert(err.message); }
  };

  // ── Marchés ───────────────────────────────────────────────────────────────
  document.getElementById("form-prov").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = document.getElementById("msg-prov");
    const ref = document.getElementById("p-ref").value.trim();
    try {
      const r = await api("/api/admin/provenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: ref })
      });
      showInlineMsg(msg, "Ajouté ✓");
      const tbody = document.querySelector("#tbl-provs tbody");
      const tr = document.createElement("tr");
      tr.id = `prov-row-${r.id}`;
      tr.innerHTML = `<td>${r.reference}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteProv(${r.id})">Supprimer</button></td>`;
      tbody.appendChild(tr);
      // Ajouter au select tarifs
      const sel = document.getElementById("pr-prov");
      const opt = document.createElement("option");
      opt.value = r.id; opt.textContent = r.reference;
      sel.appendChild(opt);
      e.target.reset();
    } catch (err) { showInlineMsg(msg, err.message, "error"); }
  });

  window.deleteProv = async function(pid) {
    if (!confirmDel("Supprimer ce marché (et ses tarifs) ?")) return;
    try {
      await api(`/api/admin/provenance/${pid}`, { method: "DELETE" });
      document.getElementById(`prov-row-${pid}`)?.remove();
    } catch (err) { alert(err.message); }
  };

  // ── Tarifs ────────────────────────────────────────────────────────────────
  document.getElementById("form-price").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = document.getElementById("msg-price");
    const body = {
      provenance_id:   document.getElementById("pr-prov").value,
      diametre:        document.getElementById("pr-diam").value,
      prix_fourniture: document.getElementById("pr-four").value || 0,
      prix_pose:       document.getElementById("pr-pose").value || 0,
    };
    if (!body.provenance_id || !body.diametre) {
      showInlineMsg(msg, "Marché et diamètre requis", "error");
      return;
    }
    try {
      await api("/api/admin/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      showInlineMsg(msg, "Tarif enregistré ✓");
      // Recharger la page pour refléter l'upsert
      setTimeout(() => location.reload(), 800);
    } catch (err) { showInlineMsg(msg, err.message, "error"); }
  });

  window.deletePrice = async function(pid) {
    if (!confirmDel("Supprimer ce tarif ?")) return;
    try {
      await api(`/api/admin/prices/${pid}`, { method: "DELETE" });
      document.getElementById(`price-row-${pid}`)?.remove();
    } catch (err) { alert(err.message); }
  };
}
