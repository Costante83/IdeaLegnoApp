/* -------------------------------------------------------------------------- */
/*  IdeaLegno · Gestione Commesse V1.6                                       */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "IdeaLegnoApp_V1_6";

const PROGRESS_STAGES = [
  "Misure",
  "Progetto",
  "Preventivo",
  "Preventivo confermato",
  "Ordine materiale",
  "In lavorazione",
  "Materiale pronto",
  "Posato",
  "Da completare",
  "Finito",
  "Pagato",
];

const PROGRESS_STAGE_INDEX = PROGRESS_STAGES.reduce((acc, name, idx) => {
  acc[name] = idx;
  return acc;
}, {});

const MOBILE_PHASES = [
  "Misure",
  "Progetto",
  "Preventivo",
  "Preventivo confermato",
  "Ordine materiale",
  "In lavorazione",
  "Materiale pronto",
  "Posato",
  "Da completare",
  "Finito",
];

const ORDER_STATES = ["da-ordinare", "ordinato", "consegnato"];
const ORDER_STATE_LABEL = {
  "da-ordinare": "Da ordinare",
  ordinato: "Ordinato",
  consegnato: "Consegnato",
};
const MATERIAL_STATES = ["da-ordinare", "ordinato", "consegnato"];

const LEGACY_PHASE_MAP = {
  "Da avviare": "Misure",
  "Materiale ordinato": "Ordine materiale",
  "In lavorazione": "In lavorazione",
  "Pronto": "Materiale pronto",
  "Posato": "Posato",
  "Da completare": "Da completare",
  "Finito": "Finito",
};

let state = migrateState(loadState());
let selectedCommessaId = null;
let selectedMobileId = null;
let activeTab = "info";
let isProgressOpen = false;

const dom = {
  mainLayout: document.getElementById("mainLayout"),
  searchInput: document.getElementById("searchCommessa"),
  progressToggleBtn: document.getElementById("progressToggleBtn"),
  closeProgressBtn: document.getElementById("closeProgressBtn"),
  progressOverlay: document.getElementById("progressOverlay"),
  progressGrid: document.getElementById("progressGrid"),
  listPane: document.getElementById("listPane"),

  detailPlaceholder: document.getElementById("detailPlaceholder"),
  detailContent: document.getElementById("detailContent"),
  detailTitle: document.getElementById("detailTitle"),
  detailSubtitle: document.getElementById("detailSubtitle"),
  detailTabs: document.getElementById("detailTabs"),
  deleteCommessaBtn: document.getElementById("deleteCommessaBtn"),
  tabSections: {
    info: document.getElementById("tab-info"),
    fatture: document.getElementById("tab-fatture"),
    mobili: document.getElementById("tab-mobili"),
  },

  newCommessaBtn: document.getElementById("newCommessaBtn"),
  commessaModal: document.getElementById("commessaModal"),
  commessaForm: document.getElementById("commessaForm"),

  orderModal: document.getElementById("orderModal"),
  orderModalBody: document.getElementById("orderModalBody"),
  orderModalTitle: document.getElementById("orderModalTitle"),

  toast: document.getElementById("toast"),
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { commesse: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.commesse)) parsed.commesse = [];
    return parsed;
  } catch {
    return { commesse: [] };
  }
}

function saveState({ silent = false } = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!silent) showToast("Salvato");
}

function showToast(message) {
  if (!dom.toast) return;
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  dom.toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    dom.toast.classList.remove("show");
  }, 1800);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(16).slice(2);
}

function getSelectedCommessa() {
  return state.commesse.find((c) => c.id === selectedCommessaId) || null;
}

function getSelectedMobile(commessa = getSelectedCommessa()) {
  if (!commessa) return null;
  return (commessa.mobili || []).find((m) => m.id === selectedMobileId) || null;
}

function ensureMobileDocumenti(mobile) {
  if (!mobile.documenti) {
    mobile.documenti = {
      rilievi: [],
      disegni: [],
      ordini: [],
    };
  }
  return mobile.documenti;
}

function ensureFattureDocs(commessa) {
  if (!commessa.fattureDocs) {
    commessa.fattureDocs = { fatture: [] };
  }
  return commessa.fattureDocs;
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function setNested(target, path, value) {
  const segments = path.split(".");
  let ref = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    if (!ref[key] || typeof ref[key] !== "object") ref[key] = {};
    ref = ref[key];
  }
  ref[segments[segments.length - 1]] = value;
}

function calculateCommessaProgress(commessa) {
  const mobili = commessa.mobili || [];
  if (!mobili.length) return 0;

  const stageCount = PROGRESS_STAGES.length - 1; // exclude Pagato
  const mobileSum = mobili.reduce((acc, mobile) => {
    const idx = PROGRESS_STAGE_INDEX[mobile.fase] ?? -1;
    if (idx === -1) return acc + 0;
    return acc + Math.min(idx, stageCount - 1);
  }, 0);

  const mobileAvg = (mobileSum / (mobili.length * (stageCount - 1))) * 100;

  const orderScore = mobili
    .flatMap((m) => m.ordini || [])
    .reduce((acc, order) => acc + (order.stato === "consegnato" ? 1 : 0), 0);

  const orderTotal = mobili.reduce((acc, m) => acc + (m.ordini?.length || 0), 0);
  const orderPct = orderTotal ? (orderScore / orderTotal) * 100 : 0;

  if (!orderTotal) return Math.round(mobileAvg);
  return Math.round(mobileAvg * 0.7 + orderPct * 0.3);
}

function calculateFatturePercent(commessa) {
  const fatture = commessa.fatture || [];
  if (!fatture.length) return 0;
  const totalPercent = fatture.reduce(
    (acc, f) => acc + (Number(f.percentuale) || 0),
    0
  );
  const paidPercent = fatture.reduce(
    (acc, f) => acc + (f.pagata ? Number(f.percentuale) || 0 : 0),
    0
  );
  if (!totalPercent) return 0;
  return Math.round((paidPercent / totalPercent) * 100);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function migrateState(data) {
  (data.commesse || []).forEach((commessa) => {
    (commessa.mobili || []).forEach((mobile) => {
      if (LEGACY_PHASE_MAP[mobile.fase]) {
        mobile.fase = LEGACY_PHASE_MAP[mobile.fase];
      }
      ensureMobileDocumenti(mobile);

      (mobile.ordini || []).forEach((ordine) => {
        if (!ordine.fornitore) {
          ordine.fornitore = ordine.titolo || "Ordine materiale";
        }
        delete ordine.titolo;

        ordine.stato = ORDER_STATES.includes(ordine.stato)
          ? ordine.stato
          : "da-ordinare";

        if (!Array.isArray(ordine.materiali)) ordine.materiali = [];

        ordine.materiali.forEach((mat) => {
          if (!MATERIAL_STATES.includes(mat.stato)) mat.stato = "da-ordinare";
        });
      });
    });
  });
  return data;
}

/* -------------------------------------------------------------------------- */
/*  Rendering                                                                 */
/* -------------------------------------------------------------------------- */

function renderAll() {
  dom.mainLayout.classList.toggle("list-only", !selectedCommessaId);
  renderSidebar();
  renderDetail();
  renderProgressOverlay();
}

function renderSidebar() {
  if (!selectedCommessaId) {
    renderSidebarCommesse();
  } else {
    renderSidebarMobili();
  }
}

function renderSidebarCommesse() {
  const filter = dom.searchInput.value.trim().toLowerCase();
  const items = [];

  state.commesse.forEach((commessa) => {
    const haystack = [
      commessa.nome,
      commessa.cliente?.nome,
      commessa.cliente?.ragioneSociale,
      commessa.architetto?.nome,
      commessa.preventivo?.numero,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (filter && !haystack.includes(filter)) return;

    const progress = calculateCommessaProgress(commessa);
    const fatturePercent = calculateFatturePercent(commessa);

    items.push(`
      <li class="sidebar-item" data-commessa-id="${commessa.id}">
        <div class="item-title">${commessa.nome || "Commessa senza titolo"}</div>
        <div class="item-sub">${commessa.preventivo?.numero || ""}</div>
        <div class="item-stats">
          <span>Produzione: ${progress}%</span>
          <span>Fatture: ${fatturePercent}%</span>
        </div>
      </li>
    `);
  });

  dom.listPane.innerHTML = `
    <div class="sidebar-header">
      <h2>Commesse</h2>
      <p>Seleziona una commessa per gestire mobili e documenti.</p>
    </div>
    <ul class="sidebar-list sidebar-commesse">
      ${
        items.join("") ||
        `<li class="sidebar-item" style="cursor:default;opacity:0.6;">
          Nessuna commessa trovata.
        </li>`
      }
    </ul>
  `;
}

function renderSidebarMobili() {
  const commessa = getSelectedCommessa();
  if (!commessa) return;

  const mobiles = commessa.mobili || [];
  const listItems = mobiles
    .map((mobile) => {
      const idx = PROGRESS_STAGE_INDEX[mobile.fase] ?? -1;
      const progress = idx === -1 ? 0 : Math.round((idx / (PROGRESS_STAGES.length - 2)) * 100);
      const ordini = mobile.ordini?.length || 0;
      return `
        <li class="sidebar-item ${mobile.id === selectedMobileId ? "active" : ""}" data-mobile-id="${mobile.id}">
          <div class="item-title">${mobile.nome || "Mobile senza titolo"}</div>
          <div class="item-sub">${mobile.fase || "Misure"}</div>
          <div class="item-stats">
            <span>Stato: ${progress}%</span>
            <span>Ordini: ${ordini}</span>
          </div>
        </li>
      `;
    })
    .join("");

  dom.listPane.innerHTML = `
    <div class="sidebar-header">
      <button class="ghost-btn small" data-list-action="back">← Torna alle commesse</button>
      <h2>${commessa.nome || "Commessa"}</h2>
      <p>Mobili e lavorazioni</p>
    </div>
    <div class="sidebar-actions">
      <button class="ghost-btn" data-list-action="add-mobile">+ Aggiungi mobile</button>
    </div>
    <ul class="sidebar-list sidebar-mobili">
      ${
        listItems ||
        `<li class="sidebar-item" style="cursor:default;opacity:0.6;">
          Nessun mobile inserito.
        </li>`
      }
    </ul>
  `;
}

function renderDetail() {
  const commessa = getSelectedCommessa();
  if (!commessa) {
    dom.detailContent.classList.add("hidden");
    dom.detailPlaceholder.classList.remove("hidden");
    return;
  }

  dom.detailPlaceholder.classList.add("hidden");
  dom.detailContent.classList.remove("hidden");

  dom.detailTitle.textContent = commessa.nome || "Commessa senza titolo";
  dom.detailSubtitle.textContent = [
    commessa.cliente?.nome || commessa.cliente?.ragioneSociale || "",
    commessa.preventivo?.numero ? `Preventivo ${commessa.preventivo.numero}` : "",
    commessa.updatedAt ? `Aggiornato ${formatDate(commessa.updatedAt)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  updateTabButtons();
  renderTabInfo(commessa);
  renderTabFatture(commessa);
  renderTabMobili(commessa);
}

function updateTabButtons() {
  dom.detailTabs.querySelectorAll(".tab-btn[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === activeTab);
  });

  Object.entries(dom.tabSections).forEach(([key, section]) => {
    section.classList.toggle("hidden", key !== activeTab);
  });
}

/* -------------------------------------------------------------------------- */
/*  Tab: info                                                                 */
/* -------------------------------------------------------------------------- */

function renderTabInfo(commessa) {
  if (activeTab !== "info") return;

  const cliente = commessa.cliente || {};
  const architetto = commessa.architetto || {};
  const preventivo = commessa.preventivo || {};

  dom.tabSections.info.innerHTML = `
    <div class="grid-two">
      <label>
        Nome commessa
        <input data-path="nome" type="text" value="${commessa.nome || ""}" placeholder="es. Cucina Rossi">
      </label>

      <label>
        Numero preventivo
        <input data-path="preventivo.numero" type="text" value="${preventivo.numero || ""}">
      </label>

      <label>
        Data preventivo
        <input data-path="preventivo.data" type="date" value="${preventivo.data || ""}">
      </label>

      <label>
        Importo preventivo
        <input data-path="preventivo.importo" data-type="number" type="number" min="0" step="0.01" value="${
          preventivo.importo ?? ""
        }">
      </label>

      <label>
        Cliente · Nome / Ragione sociale
        <input data-path="cliente.nome" type="text" value="${cliente.nome || ""}" placeholder="es. Rossi Srl">
      </label>

      <label>
        Cliente · P.IVA / CF
        <input data-path="cliente.piva" type="text" value="${cliente.piva || ""}">
      </label>

      <label>
        Cliente · Telefono
        <input data-path="cliente.telefono" type="tel" value="${cliente.telefono || ""}">
      </label>

      <label>
        Cliente · Email
        <input data-path="cliente.email" type="email" value="${cliente.email || ""}">
      </label>

      <label>
        Cliente · Indirizzo fatturazione
        <textarea data-path="cliente.indirizzo" rows="2">${cliente.indirizzo || ""}</textarea>
      </label>

      <label>
        Cliente · Note
        <textarea data-path="cliente.note" rows="2">${cliente.note || ""}</textarea>
      </label>

      <label>
        Architetto · Nome
        <input data-path="architetto.nome" type="text" value="${architetto.nome || ""}" placeholder="es. Arch. Verdi">
      </label>

      <label>
        Architetto · Telefono
        <input data-path="architetto.telefono" type="tel" value="${architetto.telefono || ""}">
      </label>

      <label>
        Architetto · Note
        <textarea data-path="architetto.note" rows="2">${architetto.note || ""}</textarea>
      </label>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/*  Tab: fatture                                                              */
/* -------------------------------------------------------------------------- */

function renderTabFatture(commessa) {
  if (activeTab !== "fatture") return;

  const fatture = commessa.fatture || [];

  dom.tabSections.fatture.innerHTML = `
    <div class="fatture-actions">
      <h3>Fatture commessa</h3>
      <button id="addFatturaBtn" class="ghost-btn">+ Aggiungi fattura</button>
    </div>

    <div class="table-wrapper slim">
      <table class="compact-table" id="fattureTable">
        <thead>
          <tr>
            <th>Numero</th>
            <th>Data</th>
            <th>Importo</th>
            <th>%</th>
            <th>Pagata</th>
            <th>Pagamento</th>
            <th>Note</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${
            fatture.length
              ? fatture
                  .map(
                    (f) => `
                <tr data-id="${f.id}">
                  <td><input data-field="numero" type="text" value="${f.numero || ""}"></td>
                  <td><input data-field="data" type="date" value="${f.data || ""}"></td>
                  <td><input data-field="importo" data-type="number" type="number" min="0" step="0.01" value="${f.importo ?? ""}"></td>
                  <td><input data-field="percentuale" data-type="number" type="number" min="0" max="100" step="1" value="${f.percentuale ?? ""}"></td>
                  <td style="text-align:center;"><input data-field="pagata" type="checkbox" ${f.pagata ? "checked" : ""}></td>
                  <td><input data-field="dataPagamento" type="date" value="${f.dataPagamento || ""}"></td>
                  <td><input data-field="note" type="text" value="${f.note || ""}"></td>
                  <td style="text-align:right;">
                    <button class="ghost-btn small" data-action="fattura-delete">Elimina</button>
                  </td>
                </tr>`
                  )
                  .join("")
              : `<tr><td colspan="8" style="text-align:center;opacity:0.6;padding:0.8rem 0;">Nessuna fattura inserita.</td></tr>`
          }
        </tbody>
      </table>
    </div>

    <p class="fatture-summary">${renderFattureSummary(commessa)}</p>

    <div class="docs-wrapper">
      <h4>Documenti fatture</h4>
      <div class="docs-block" id="fattureDocsRoot">
        <div class="doc-categories" id="docCategoryBar"></div>
        <div class="doc-actions">
          <input type="file" id="docUploadInput" accept=".pdf,image/jpeg,image/png" multiple>
          <small>PDF, JPG, PNG · max 5MB</small>
        </div>
        <div id="docList" class="doc-list"></div>
        <input type="hidden" id="docActiveCat" value="fatture">
      </div>
    </div>
  `;

  Documents.mount({
    root: document.getElementById("fattureDocsRoot"),
    docset: ensureFattureDocs(commessa),
    persist: () =>
      persistCommessa(commessa, {
        silent: true,
        rerenderSidebar: true,
        refreshDetail: false,
      }),
    categories: { fatture: "Allegati fatture" },
  maxFileSize: 5 * 1024 * 1024,
  });
}

function renderFattureSummary(commessa) {
  const fatture = commessa.fatture || [];
  if (!fatture.length) return "Nessuna fattura emessa.";

  const totalPercent = fatture.reduce(
    (acc, f) => acc + (Number(f.percentuale) || 0),
    0
  );
  const paidPercent = fatture.reduce(
    (acc, f) => acc + (f.pagata ? Number(f.percentuale) || 0 : 0),
    0
  );
  const paidCount = fatture.filter((f) => f.pagata).length;

  const percent = totalPercent ? Math.round((paidPercent / totalPercent) * 100) : 0;
  return `${paidCount}/${fatture.length} fatture pagate · ${percent}% pagato`;
}

/* -------------------------------------------------------------------------- */
/*  Tab: mobili                                                               */
/* -------------------------------------------------------------------------- */

function renderTabMobili(commessa) {
  if (activeTab !== "mobili") return;

  const mobile = getSelectedMobile(commessa);
  if (!mobile) {
    dom.tabSections.mobili.innerHTML = `<p class="muted">Seleziona un mobile dalla lista a sinistra per gestire ordini, note e documenti.</p>`;
    return;
  }

  ensureMobileDocumenti(mobile);

  dom.tabSections.mobili.innerHTML = `
    <div class="mobile-header">
      <label>
        Nome mobile
        <input data-mobile-path="nome" type="text" value="${mobile.nome || ""}" placeholder="es. Cucina in noce">
      </label>
      <label>
        Stato avanzamento
        <select data-mobile-path="fase">
          ${MOBILE_PHASES.map(
            (fase) => `<option value="${fase}" ${mobile.fase === fase ? "selected" : ""}>${fase}</option>`
          ).join("")}
        </select>
      </label>
    </div>

    <div class="mobile-grid">
      <div class="block">
        <h4>Ordini materiale</h4>
        <div class="order-actions">
          <button id="addOrderBtn" class="ghost-btn">+ Aggiungi ordine</button>
        </div>
        <div class="order-list">${renderOrderList(mobile)}</div>
      </div>

      <div class="block">
        <h4>Note mobile</h4>
        <textarea data-mobile-path="note" rows="6" placeholder="Annotazioni di lavorazione">${mobile.note || ""}</textarea>
      </div>
    </div>

    <div class="block">
      <h4>Documenti</h4>
      <div class="docs-block" id="mobileDocsRoot">
        <div class="doc-categories" id="docCategoryBar"></div>
        <div class="doc-actions">
          <input type="file" id="docUploadInput" accept=".pdf,image/jpeg,image/png" multiple>
          <small>PDF, JPG, PNG · max 5MB</small>
        </div>
        <div id="docList" class="doc-list"></div>
        <input type="hidden" id="docActiveCat" value="rilievi">
      </div>
    </div>
  `;

  Documents.mount({
    root: document.getElementById("mobileDocsRoot"),
    docset: mobile.documenti,
    persist: () =>
      persistCommessa(commessa, {
        silent: true,
        rerenderSidebar: true,
        refreshDetail: false,
      }),
    categories: {
      rilievi: "Foto / Rilievi",
      disegni: "Disegni",
      ordini: "Ordini",
    },
  maxFileSize: 5 * 1024 * 1024,
  });
}

function renderOrderList(mobile) {
  const ordini = mobile.ordini || [];
  if (!ordini.length) {
    return `<p class="muted">Nessun ordine per questo mobile.</p>`;
  }

  return ordini
    .map((ordine) => {
      return `
        <div class="order-card" data-order="${ordine.id}">
          <header style="display: flex; align-items: center; gap: 0.7rem;">
            <h5 style="margin-right: 0.7rem;">${ordine.fornitore || "Fornitore non impostato"}</h5>
            <span class="tag">${ORDER_STATE_LABEL[ordine.stato] || "Da ordinare"}</span>
            <div class="order-actions" style="margin-left: auto; display: flex; gap: 0.45rem;">
              <button class="ghost-btn small" data-action="ordine-apri">Dettagli</button>
              <button class="ghost-btn small" data-action="ordine-elimina">Elimina</button>
            </div>
          </header>
        </div>
      `;
    })
    .join("");
}

/* -------------------------------------------------------------------------- */
/*  Progress overlay                                                          */
/* -------------------------------------------------------------------------- */

function renderProgressOverlay() {
  dom.progressOverlay.classList.toggle("hidden", !isProgressOpen);
  if (!isProgressOpen) return;

  if (!state.commesse.length) {
    dom.progressGrid.innerHTML = `<p class="muted">Nessuna commessa disponibile.</p>`;
    return;
  }

  dom.progressGrid.innerHTML = state.commesse
    .map((commessa) => {
      const fatturePercent = calculateFatturePercent(commessa);
      const mobili = commessa.mobili || [];

      if (!mobili.length) {
        return `
          <div class="progress-card">
            <h4>${commessa.nome || "Commessa"}</h4>
            <p class="muted">${commessa.cliente?.nome || commessa.cliente?.ragioneSociale || "Cliente non impostato"}</p>
            <p class="muted">Nessun mobile inserito.</p>
          </div>
        `;
      }

      return mobili
        .map((mobile) => {
          const stageStrip = buildStageStrip(commessa, mobile, fatturePercent);
          return `
            <div class="progress-card">
              <div style="display:flex; align-items:center; margin-bottom:0.3rem;">
                <h4 style="margin:0; font-size:0.95rem;">${commessa.nome || "Commessa"}</h4>
                <span class="muted" style="margin:0; font-size:0.78rem; margin-left:1.1rem;">${commessa.cliente?.nome || commessa.cliente?.ragioneSociale || "Cliente non impostato"}</span>
                <span style="display:inline-block; width:100px;"></span>
                <strong style="font-size:0.85rem;">${mobile.nome || "Mobile"}</strong>
              </div>
              <div class="stage-strip">${stageStrip}</div>
            </div>
          `;
        })
        .join("");
    })
    .join("");
}

function buildStageStrip(commessa, mobile, fatturePercent) {
  const currentIdx = PROGRESS_STAGE_INDEX[mobile.fase] ?? -1;
  const isPaid = fatturePercent === 100;

  return PROGRESS_STAGES.map((stage, index) => {
    let cls = "stage-pill";
    if (stage === "Pagato") {
      if (isPaid) cls += " done";
    } else {
      if (currentIdx > index) cls += " done";
      else if (currentIdx === index) cls += " current";
    }
    return `<span class="${cls}">${stage}</span>`;
  }).join("");
}

/* -------------------------------------------------------------------------- */
/*  Persistenza                                                               */
/* -------------------------------------------------------------------------- */

function persistCommessa(
  commessa,
  {
    silent = true,
    rerenderSidebar = true,
    refreshDetail = true,
  } = {}
) {
  commessa.updatedAt = new Date().toISOString();
  saveState({ silent });
  if (rerenderSidebar) renderSidebar();
  if (refreshDetail) renderDetail();
  if (isProgressOpen) renderProgressOverlay();
}

/* -------------------------------------------------------------------------- */
/*  Event binding                                                             */
/* -------------------------------------------------------------------------- */

dom.searchInput.addEventListener("input", () => {
  renderSidebar();
});

dom.listPane.addEventListener("click", (event) => {
  const backBtn = event.target.closest("[data-list-action='back']");
  if (backBtn) {
    selectedCommessaId = null;
    selectedMobileId = null;
    activeTab = "info";
    renderAll();
    return;
  }

  const addMobileBtn = event.target.closest("[data-list-action='add-mobile']");
  if (addMobileBtn) {
    const commessa = getSelectedCommessa();
    if (!commessa) return;
    const nome = window.prompt("Nome del nuovo mobile:", "Mobile senza nome");
    if (nome === null) return;

    const mobile = {
      id: generateId(),
      nome: nome.trim() || "Mobile senza nome",
      fase: "Misure",
      note: "",
      ordini: [],
      documenti: {
        rilievi: [],
        disegni: [],
        ordini: [],
      },
    };

    commessa.mobili = commessa.mobili || [];
    commessa.mobili.push(mobile);
    selectedMobileId = mobile.id;

    persistCommessa(commessa, {
      silent: true,
      rerenderSidebar: true,
      refreshDetail: true,
    });
    return;
  }

  const commessaItem = event.target.closest("[data-commessa-id]");
  if (commessaItem) {
    selectedCommessaId = commessaItem.dataset.commessaId;
    const commessa = getSelectedCommessa();
    selectedMobileId = commessa?.mobili?.[0]?.id || null;
    activeTab = "info";
    renderAll();
    return;
  }

  const mobileItem = event.target.closest("[data-mobile-id]");
  if (mobileItem) {
    selectedMobileId = mobileItem.dataset.mobileId;
    renderSidebarMobili();
    if (activeTab === "mobili") renderTabMobili(getSelectedCommessa());
  }
});

dom.detailTabs.addEventListener("click", (event) => {
  const btn = event.target.closest(".tab-btn[data-tab]");
  if (!btn) return;
  activeTab = btn.dataset.tab;
  updateTabButtons();
  renderDetail();
});

dom.deleteCommessaBtn.addEventListener("click", () => {
  const commessa = getSelectedCommessa();
  if (!commessa) return;
  if (!window.confirm(`Eliminare definitivamente "${commessa.nome}"?`)) return;

  state.commesse = state.commesse.filter((c) => c.id !== commessa.id);
  saveState({ silent: true });

  selectedCommessaId = null;
  selectedMobileId = null;
  activeTab = "info";
  renderAll();
  showToast("Commessa eliminata");
});

/* --- Tab info ------------------------------------------------------------- */

dom.tabSections.info.addEventListener("input", (event) => {
  const path = event.target.dataset.path;
  if (!path) return;

  const commessa = getSelectedCommessa();
  if (!commessa) return;

  let value = event.target.value;
  if (event.target.dataset.type === "number") {
    value = value === "" ? null : Number(value);
  }

  setNested(commessa, path, value);
  persistCommessa(commessa, {
    silent: true,
    rerenderSidebar: true,
    refreshDetail: false,
  });
});

/* --- Tab fatture ---------------------------------------------------------- */

dom.tabSections.fatture.addEventListener("click", (event) => {
  if (event.target.id === "addFatturaBtn") {
    const commessa = getSelectedCommessa();
    if (!commessa) return;

    commessa.fatture = commessa.fatture || [];
    commessa.fatture.push({
      id: generateId(),
      numero: "",
      data: todayISO(),
      importo: null,
      percentuale: null,
      pagata: false,
      dataPagamento: "",
      note: "",
    });

    persistCommessa(commessa, {
      silent: true,
      rerenderSidebar: true,
      refreshDetail: true,
    });
    return;
  }

  const deleteBtn = event.target.closest("[data-action='fattura-delete']");
  if (deleteBtn) {
    const row = deleteBtn.closest("tr[data-id]");
    if (!row) return;
    const commessa = getSelectedCommessa();
    if (!commessa) return;

    commessa.fatture = (commessa.fatture || []).filter(
      (f) => f.id !== row.dataset.id
    );
    persistCommessa(commessa, {
      silent: true,
      rerenderSidebar: true,
      refreshDetail: true,
    });
  }
});

dom.tabSections.fatture.addEventListener("input", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const field = event.target.dataset.field;
  if (!field) return;

  const commessa = getSelectedCommessa();
  if (!commessa) return;
  const fattura = commessa.fatture.find((f) => f.id === row.dataset.id);
  if (!fattura) return;

  let value = event.target.value;
  if (event.target.dataset.type === "number") {
    value = value === "" ? null : Number(value);
  }

  fattura[field] = value;
  persistCommessa(commessa, {
    silent: true,
    rerenderSidebar: true,
    refreshDetail: false,
  });
});

dom.tabSections.fatture.addEventListener("change", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const field = event.target.dataset.field;
  if (!field) return;

  const commessa = getSelectedCommessa();
  if (!commessa) return;
  const fattura = commessa.fatture.find((f) => f.id === row.dataset.id);
  if (!fattura) return;

  if (event.target.type === "checkbox") {
    fattura[field] = event.target.checked;
    if (field === "pagata" && event.target.checked && !fattura.dataPagamento) {
      fattura.dataPagamento = todayISO();
      row.querySelector('[data-field="dataPagamento"]').value =
        fattura.dataPagamento;
    }
  }

  persistCommessa(commessa, {
    silent: true,
    rerenderSidebar: true,
    refreshDetail: false,
  });
});

/* --- Tab mobili ----------------------------------------------------------- */

dom.tabSections.mobili.addEventListener("input", (event) => {
  const path = event.target.dataset.mobilePath;
  if (!path) return;

  const commessa = getSelectedCommessa();
  const mobile = getSelectedMobile(commessa);
  if (!mobile) return;

  setNested(mobile, path, event.target.value);
  persistCommessa(commessa, {
    silent: true,
    rerenderSidebar: true,
    refreshDetail: false,
  });
});

dom.tabSections.mobili.addEventListener("change", (event) => {
  const path = event.target.dataset.mobilePath;
  if (!path) return;

  const commessa = getSelectedCommessa();
  const mobile = getSelectedMobile(commessa);
  if (!mobile) return;

  setNested(mobile, path, event.target.value);
  persistCommessa(commessa, {
    silent: true,
    rerenderSidebar: true,
    refreshDetail: false,
  });
});

dom.tabSections.mobili.addEventListener("click", (event) => {
  if (event.target.id === "addOrderBtn") {
    const commessa = getSelectedCommessa();
    const mobile = getSelectedMobile(commessa);
    if (!mobile) return;

    const fornitore = window.prompt("Nome fornitore:", "Fornitore");
    if (fornitore === null) return;

    mobile.ordini = mobile.ordini || [];
    mobile.ordini.push({
      id: generateId(),
      fornitore: fornitore.trim() || "Fornitore",
      dataOrdine: "",
      stato: "da-ordinare",
      materiali: [],
    });

    persistCommessa(commessa, {
      silent: true,
      rerenderSidebar: true,
      refreshDetail: true,
    });
    return;
  }

  const orderCard = event.target.closest(".order-card");
  if (!orderCard) return;
  const action = event.target.dataset.action;
  if (!action) return;

  const commessa = getSelectedCommessa();
  const mobile = getSelectedMobile(commessa);
  if (!mobile) return;

  const ordine = mobile.ordini.find((o) => o.id === orderCard.dataset.order);
  if (!ordine) return;

  if (action === "ordine-elimina") {
    if (!window.confirm(`Eliminare l'ordine di ${ordine.fornitore}?`)) return;
    mobile.ordini = mobile.ordini.filter((o) => o.id !== ordine.id);
    persistCommessa(commessa, {
      silent: true,
      rerenderSidebar: true,
      refreshDetail: true,
    });
    return;
  }

  if (action === "ordine-apri") {
    openOrderModal(commessa, mobile, ordine);
  }
});

/* -------------------------------------------------------------------------- */
/*  Modale ordine                                                             */
/* -------------------------------------------------------------------------- */

function openOrderModal(commessa, mobile, ordine) {
  dom.orderModal.dataset.mobileId = mobile.id;
  dom.orderModal.dataset.orderId = ordine.id;

  dom.orderModalTitle.textContent = ordine.fornitore || "Ordine materiale";
  dom.orderModalBody.innerHTML = `
    <div class="inline-row">
      <label>
        Fornitore
        <input id="orderSupplierInput" type="text" value="${ordine.fornitore || ""}">
      </label>
      <label>
        Data ordine
        <input id="orderDateInput" type="date" value="${ordine.dataOrdine || ""}">
      </label>
    </div>

    <label>Stato ordine</label>
    <select id="orderStateSelect">
      ${ORDER_STATES.map(
        (state) => `<option value="${state}" ${state === ordine.stato ? "selected" : ""}>${ORDER_STATE_LABEL[state]}</option>`
      ).join("")}
    </select>

    <h4>Materiali</h4>
    <div class="table-wrapper slim">
      <table class="compact-table" id="orderMaterialTable">
        <thead>
          <tr>
            <th>Materiale</th>
            <th>Specifiche</th>
            <th>Quantità</th>
            <th>Stato</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${renderMaterialRows(ordine.materiali || [])}
        </tbody>
      </table>
    </div>
    <button id="addMaterialRowBtn" class="ghost-btn">+ Aggiungi materiale</button>
  `;

  openModal("orderModal");
}

function renderMaterialRows(materiali) {
  if (!materiali.length) {
    return `<tr><td colspan="5" style="text-align:center;opacity:0.6;padding:0.6rem 0;">Nessun materiale aggiunto.</td></tr>`;
  }

  return materiali
    .map(
      (mat) => `
        <tr data-id="${mat.id}">
          <td><input data-field="materiale" type="text" value="${mat.materiale || ""}" placeholder="Materiale"></td>
          <td><input data-field="specifiche" type="text" value="${mat.specifiche || ""}" placeholder="Codice / finitura"></td>
          <td><input data-field="quantita" type="text" value="${mat.quantita || ""}" placeholder="Qtà"></td>
          <td>
            <select data-field="stato">
              ${MATERIAL_STATES.map(
                (state) => `<option value="${state}" ${state === mat.stato ? "selected" : ""}>${state.replace("-", " ")}</option>`
              ).join("")}
            </select>
          </td>
          <td style="text-align:right;">
            <button class="ghost-btn small" data-action="material-delete">✕</button>
          </td>
        </tr>
      `
    )
    .join("");
}

dom.orderModalBody.addEventListener("input", (event) => {
  const mobileId = dom.orderModal.dataset.mobileId;
  const orderId = dom.orderModal.dataset.orderId;
  if (!mobileId || !orderId) return;

  const commessa = getSelectedCommessa();
  const mobile = commessa?.mobili.find((m) => m.id === mobileId);
  if (!mobile) return;

  const ordine = mobile.ordini.find((o) => o.id === orderId);
  if (!ordine) return;

  if (event.target.id === "orderSupplierInput") {
    ordine.fornitore = event.target.value;
    dom.orderModalTitle.textContent = ordine.fornitore || "Ordine materiale";
    persistCommessa(commessa, {
      silent: true,
      rerenderSidebar: true,
      refreshDetail: true,
    });
    return;
  }

  const row = event.target.closest("tr[data-id]");
  if (!row) return;

  const materiale = ordine.materiali.find((m) => m.id === row.dataset.id);
  if (!materiale) return;

  materiale[event.target.dataset.field] = event.target.value;

  persistCommessa(commessa, {
    silent: true,
    rerenderSidebar: false,
    refreshDetail: false,
  });
});

dom.orderModalBody.addEventListener("change", (event) => {
  const mobileId = dom.orderModal.dataset.mobileId;
  const orderId = dom.orderModal.dataset.orderId;
  if (!mobileId || !orderId) return;

  const commessa = getSelectedCommessa();
  const mobile = commessa?.mobili.find((m) => m.id === mobileId);
  if (!mobile) return;

  const ordine = mobile.ordini.find((o) => o.id === orderId);
  if (!ordine) return;

  if (event.target.id === "orderStateSelect") {
    ordine.stato = event.target.value;
    persistCommessa(commessa, {
      silent: true,
      rerenderSidebar: true,
      refreshDetail: true,
    });
    return;
  }

  if (event.target.id === "orderDateInput") {
    ordine.dataOrdine = event.target.value;
    persistCommessa(commessa, {
      silent: true,
      rerenderSidebar: false,
      refreshDetail: false,
    });
    return;
  }

  const row = event.target.closest("tr[data-id]");
  if (!row) return;

  const materiale = ordine.materiali.find((m) => m.id === row.dataset.id);
  if (!materiale) return;

  materiale[event.target.dataset.field] = event.target.value;

  persistCommessa(commessa, {
    silent: true,
    rerenderSidebar: false,
    refreshDetail: false,
  });
});

dom.orderModalBody.addEventListener("click", (event) => {
  const mobileId = dom.orderModal.dataset.mobileId;
  const orderId = dom.orderModal.dataset.orderId;
  if (!mobileId || !orderId) return;

  const commessa = getSelectedCommessa();
  const mobile = commessa?.mobili.find((m) => m.id === mobileId);
  if (!mobile) return;

  const ordine = mobile.ordini.find((o) => o.id === orderId);
  if (!ordine) return;

  const tableBody = dom.orderModalBody.querySelector("#orderMaterialTable tbody");

  if (event.target.id === "addMaterialRowBtn") {
    ordine.materiali = ordine.materiali || [];
    ordine.materiali.push({
      id: generateId(),
      materiale: "",
      specifiche: "",
      quantita: "",
      stato: "da-ordinare",
    });
    if (tableBody) tableBody.innerHTML = renderMaterialRows(ordine.materiali);
    persistCommessa(commessa, {
      silent: true,
      rerenderSidebar: true,
      refreshDetail: true,
    });
    return;
  }

  if (event.target.dataset.action === "material-delete") {
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    ordine.materiali = ordine.materiali.filter((m) => m.id !== row.dataset.id);
    if (tableBody) tableBody.innerHTML = renderMaterialRows(ordine.materiali);
    persistCommessa(commessa, {
      silent: true,
      rerenderSidebar: true,
      refreshDetail: true,
    });
  }
});

/* -------------------------------------------------------------------------- */
/*  Modali generici                                                           */
/* -------------------------------------------------------------------------- */

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove("hidden");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add("hidden");
}

document.addEventListener("click", (event) => {
  const closeId = event.target.getAttribute("data-modal-close");
  if (closeId) closeModal(closeId);
  if (event.target.classList.contains("modal")) {
    event.target.classList.add("hidden");
  }
});

dom.newCommessaBtn.addEventListener("click", () => {
  dom.commessaForm.reset();
  openModal("commessaModal");
});

dom.commessaForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(dom.commessaForm);

  const nome = formData.get("nome")?.trim();
  const preventivoNumero = formData.get("preventivoNumero")?.trim();
  const preventivoData = formData.get("preventivoData") || "";
  const preventivoImporto = Number(formData.get("preventivoImporto")) || null;

  const commessa = {
    id: generateId(),
    nome: nome || "Commessa senza titolo",
    cliente: {},
    architetto: {},
    preventivo: {
      numero: preventivoNumero || "",
      data: preventivoData || "",
      importo: preventivoImporto,
    },
    fatture: [],
    fattureDocs: { fatture: [] },
    mobili: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.commesse.unshift(commessa);
  saveState({ silent: true });
  closeModal("commessaModal");
  showToast("Commessa creata");

  selectedCommessaId = commessa.id;
  selectedMobileId = null;
  activeTab = "info";
  renderAll();
});

/* -------------------------------------------------------------------------- */
/*  Overlay avanzamento                                                       */
/* -------------------------------------------------------------------------- */

dom.progressToggleBtn.addEventListener("click", () => {
  isProgressOpen = true;
  renderProgressOverlay();
});

dom.closeProgressBtn.addEventListener("click", () => {
  isProgressOpen = false;
  renderProgressOverlay();
});

/* -------------------------------------------------------------------------- */
/*  Bootstrap                                                                 */
/* -------------------------------------------------------------------------- */

Documents.init({
  categories: {
    rilievi: "Foto / Rilievi",
    disegni: "Disegni",
    ordini: "Ordini",
    fatture: "Documenti",
  },
  maxFileSize: 1.8 * 1024 * 1024,
});

renderAll();

if (state.commesse.length) {
  selectedCommessaId = state.commesse[0].id;
  selectedMobileId = state.commesse[0].mobili?.[0]?.id || null;
  renderAll();
}