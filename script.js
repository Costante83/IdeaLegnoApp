/* -------------------------------------------------------------------------- */
/*  IdeaLegnoApp – Gestione commesse                                          */
/*  Versione 0.6.1 (script2.js)                                               */
/*  - Fix persistenza archivio (state.archivio)                               */
/*  - Persistenza immediata dei dettagli (stato, date, materiali, documenti)  */
/*  - Ripristino della vista all’avvio (lastOpenView)                         */
/*  - Commenti e struttura leggibile                                          */
/* -------------------------------------------------------------------------- */

"use strict";

/* -------------------------------------------------------------------------- */
/* 1. Costanti di storage                                                     */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "IdeaLegnoApp_V0_5_COMPLETE";
const STORAGE_ROOT = "IdeaLegnoApp_V0_7";
const STORAGE_INDEX = `${STORAGE_ROOT}:index`;
const STORAGE_JOB = (id) => `${STORAGE_ROOT}:job:${id}`;

/* -------------------------------------------------------------------------- */
/* 2. Utility per localStorage                                                */
/* -------------------------------------------------------------------------- */

/**
 * Legge un valore JSON da localStorage.
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 */
function readLS(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Scrive un valore JSON su localStorage.
 * @param {string} key
 * @param {*} obj
 */
function writeLS(key, obj) {
  localStorage.setItem(key, JSON.stringify(obj));
}

/* -------------------------------------------------------------------------- */
/* 3. Definizioni dominio                                                     */
/* -------------------------------------------------------------------------- */

const STATI = [
  "Misure",
  "Progetto",
  "Preventivo",
  "Preventivo confermato",
  "Ordine materiali",
  "Materiale consegnato",
  "In lavorazione",
  "In verniciatura",
  "Materiale pronto",
  "Programmato posa",
  "Posato",
  "Da completare",
  "Finito",
  "Pagato",
];

/* -------------------------------------------------------------------------- */
/* 4. Stato applicativo + migrazione                                          */
/* -------------------------------------------------------------------------- */

/**
 * Carica lo stato iniziale, con migrazione dal vecchio formato monolitico.
 * @returns {{attivi: Array, archivio: Array, lastOpenView: string}}
 */
function loadState() {
  // 1. Nuovo schema “shardato”
  const idx = readLS(STORAGE_INDEX);
  if (idx && Array.isArray(idx.attiviIds)) {
    const attivi = idx.attiviIds
      .map((id) => readLS(STORAGE_JOB(id)))
      .filter(Boolean);
    const archivio = (idx.archiviIds || [])
      .map((id) => readLS(STORAGE_JOB(id)))
      .filter(Boolean);
    return {
      attivi,
      archivio,
      lastOpenView: idx.lastOpenView || "list",
    };
  }

  // 2. Migrazione legacy monolitica
  const legacy = readLS(STORAGE_KEY);
  if (
    legacy &&
    (Array.isArray(legacy.attivi) ||
      Array.isArray(legacy.archivio) ||
      Array.isArray(legacy.archivi))
  ) {
    const attiviIds = [];
    const archiviIds = [];

    (legacy.attivi || []).forEach((job) => {
      writeLS(STORAGE_JOB(job.id), job);
      attiviIds.push(job.id);
    });

    (legacy.archivio || legacy.archivi || []).forEach((job) => {
      writeLS(STORAGE_JOB(job.id), job);
      archiviIds.push(job.id);
    });

    writeLS(STORAGE_INDEX, {
      attiviIds,
      archiviIds,
      lastOpenView: legacy.lastOpenView || "list",
    });

    return {
      attivi: legacy.attivi || [],
      archivio: legacy.archivio || legacy.archivi || [],
      lastOpenView: legacy.lastOpenView || "list",
    };
  }

  // 3. Stato vuoto
  writeLS(STORAGE_INDEX, {
    attiviIds: [],
    archiviIds: [],
    lastOpenView: "list",
  });

  return {
    attivi: [],
    archivio: [],
    lastOpenView: "list",
  };
}

let state = loadState();
window.state = state; // usato dai listener del modulo Documenti

/* -------------------------------------------------------------------------- */
/* 5. Migrazione fatture (retro-compatibile)                                  */
/* -------------------------------------------------------------------------- */

/**
 * Trasforma eventuale campo legacy "fattura" in lista "fatture".
 * @param {Array} arr
 */
function migrateInvoicesOnArray(arr) {
  (arr || []).forEach((job) => {
    if (!job.fatture) job.fatture = [];

    if (job.fattura && !job.fatture.length) {
      job.fatture.push({
        data: job.fattura,
        percent: null,
        importo: null,
        numero: null,
        pagata: !!job.pagato,
        data_pagamento: job.dataPagato || null,
        note: "",
      });
    }
  });
}

function migrateInvoices() {
  migrateInvoicesOnArray(state.attivi);
  migrateInvoicesOnArray(state.archivio);
}

migrateInvoices();

/* -------------------------------------------------------------------------- */
/* 6. DOM cache                                                               */
/* -------------------------------------------------------------------------- */

const dom = {
  jobTableBody: document.getElementById("jobTableBody"),
  archiveTableBody: document.getElementById("archiveTableBody"),
  totalCount: document.getElementById("totalCount"),
  archiveCount: document.getElementById("archiveCount"),
  searchInput: document.getElementById("searchInput"),
  filterState: document.getElementById("filterState"),
  listView: document.getElementById("listView"),
  boardView: document.getElementById("boardView"),
  archiveView: document.getElementById("archiveView"),
  boardBody: document.getElementById("boardBody"),
  viewListBtn: document.getElementById("viewListBtn"),
  viewBoardBtn: document.getElementById("viewBoardBtn"),
  viewArchiveBtn: document.getElementById("viewArchiveBtn"),
  detailBody: document.getElementById("detailBody"),
  detailTitle: document.getElementById("detailTitle"),
  detailSubtitle: document.getElementById("detailSubtitle"),
  dCliente: document.getElementById("dCliente"),
  dMobile: document.getElementById("dMobile"),
  dArch: document.getElementById("dArch"),
  dStato: document.getElementById("dStato"),
  dPosaWrapper: document.getElementById("dPosaWrapper"),
  dDataPosa: document.getElementById("dDataPosa"),
  dFatturaWrapper: document.getElementById("dFatturaWrapper"),
  dDataFattura: document.getElementById("dDataFattura"),
  dPagatoWrapper: document.getElementById("dPagatoWrapper"),
  dDataPagato: document.getElementById("dDataPagato"),
  materialBody: document.getElementById("materialBody"),
  dMancanze: document.getElementById("dMancanze"),
  toast: document.getElementById("toast"),
  newJobBtn: document.getElementById("newJobBtn"),
  newJobModal: document.getElementById("newJobModal"),
  closeNewJobBtn: document.getElementById("closeNewJobBtn"),
  njCliente: document.getElementById("njCliente"),
  njMobile: document.getElementById("njMobile"),
  njArch: document.getElementById("njArch"),
  njStato: document.getElementById("njStato"),
  saveNewJobBtn: document.getElementById("saveNewJobBtn"),
  materialModal: document.getElementById("materialModal"),
  materialDetailBody: document.getElementById("materialDetailBody"),
  closeMaterialBtn: document.getElementById("closeMaterialBtn"),
  addSubMaterialBtn: document.getElementById("addSubMaterialBtn"),
  addMaterialBtn: document.getElementById("addMaterialBtn"),
  btnFatture: document.getElementById("btnFatture"),
  fattureTableBody: document.querySelector("#fattureTable tbody"),
  addFatturaBtn: document.getElementById("addFatturaBtn"),
  fattureTotaleInfo: document.getElementById("fattureTotaleInfo"),
};
/* -------------------------------------------------------------------------- */
/* 7. Stato UI                                                                */
/* -------------------------------------------------------------------------- */

let selectedJobId = null;
let selectedMaterialRef = { jobId: null, materialId: null };
let currentView = state.lastOpenView || "list";

/* -------------------------------------------------------------------------- */
/* 8. Inizializzazione selettori e documenti                                  */
/* -------------------------------------------------------------------------- */

// Opzione filtro “Vedi tutti”
const optAll = document.createElement("option");
optAll.value = "";
optAll.textContent = "Vedi tutti";
dom.filterState.appendChild(optAll);

// Popola stati in filtri e select
STATI.forEach((stato) => {
  const optList = document.createElement("option");
  optList.value = stato;
  optList.textContent = stato;
  dom.filterState.appendChild(optList);

  const optDetail = optList.cloneNode(true);
  dom.dStato.appendChild(optDetail);

  const optNew = optList.cloneNode(true);
  dom.njStato.appendChild(optNew);
});

dom.njStato.value = "Misure";

// Inizializza modulo Documenti con persistenza reale
Documents.init({
  saveState: persistActiveJobSilently,
  getJobs: () => state.attivi || [],
});
window.__docs_renderDocuments = Documents.render;

/* -------------------------------------------------------------------------- */
/* 9. Persistenza                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Aggiorna l’indice generale (ids + vista).
 * @returns {boolean}
 */
function saveState() {
  try {
    const attiviIds = (state.attivi || []).map((j) => j.id);
    const archiviIds = (state.archivio || []).map((j) => j.id);
    writeLS(STORAGE_INDEX, {
      attiviIds,
      archiviIds,
      lastOpenView: state.lastOpenView || "list",
    });
    return true;
  } catch (error) {
    console.warn("saveState index error:", error);
    alert("Memoria locale esaurita (indice).");
    return false;
  }
}

/**
 * Salva la singola commessa su localStorage.
 * @param {Object} job
 * @returns {boolean}
 */
function saveJob(job) {
  if (!job) return false;
  try {
    writeLS(STORAGE_JOB(job.id), job);
    return true;
  } catch (error) {
    console.warn("saveJob error:", error);
    alert("Memoria locale esaurita salvando la commessa.");
    return false;
  }
}

/**
 * Persistenza di una commessa modificata e refresh opzionale.
 * @param {Object} job
 * @param {Object} options
 * @param {boolean} [options.refresh=true]
 * @param {boolean} [options.reopenDetail=false]
 */
function persistJob(job, { refresh = true, reopenDetail = false } = {}) {
  if (!job) return;
  if (!saveJob(job)) return;
  saveState();

  if (refresh) {
    refreshAll();
  }
  if (reopenDetail) {
    openDetail(job.id);
  }
}

/**
 * Restituisce il lavoro attualmente aperto nel pannello dettagli.
 * @returns {Object|null}
 */
function getActiveJob() {
  return state.attivi.find((job) => job.id === selectedJobId) || null;
}

/**
 * Persiste il lavoro attualmente aperto senza refresh (usato da Documents).
 */
function persistActiveJobSilently() {
  const job = getActiveJob();
  if (!job) {
    // comunque manteniamo la vista selezionata
    saveState();
    return;
  }
  saveJob(job);
  saveState();
}

/**
 * Aggiorna il timestamp di una commessa e la salva.
 * @param {Object} job
 * @param {Object} options
 */
function touchAndPersist(job, options) {
  job.lastUpdate = new Date().toISOString();
  persistJob(job, options);
}

/* -------------------------------------------------------------------------- */
/* 10. Helpers UI                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Mostra un toast temporaneo.
 * @param {string} message
 */
function showToast(message) {
  if (!dom.toast) return;
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  dom.toast.classList.remove("hidden");
  setTimeout(() => dom.toast.classList.remove("show"), 1600);
}

/**
 * Converte lo stato in classe CSS.
 * @param {string} stato
 */
function statoToClass(stato) {
  return `status-${(stato || "").replace(/ /g, "-")}`;
}

/**
 * Deriva il fornitore principale da una riga materiali.
 * @param {Object} mat
 */
function deriveFornitore(mat) {
  if (!mat) return "";
  if (mat.fornitore && mat.fornitore.trim() !== "") return mat.fornitore;
  if (Array.isArray(mat.dettagli)) {
    const det = mat.dettagli.find(
      (d) => (d.fornitore || "").trim() !== ""
    );
    if (det) return det.fornitore;
  }
  return "";
}

/**
 * Ritorna la stringa di ricerca corrente.
 */
function currentSearchText() {
  return dom.searchInput.value.toLowerCase();
}

/**
 * Ritorna il filtro stato corrente.
 */
function currentFilterState() {
  return dom.filterState.value;
}

/**
 * Oggi in formato YYYY-MM-DD.
 */
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/**
 * Mostra/nasconde i wrapper delle date in base allo stato.
 * @param {string} stato
 */
function showConditional(stato) {
  dom.dPosaWrapper.classList.add("hidden");
  
  if (stato === "Programmato posa") dom.dPosaWrapper.classList.remove("hidden");
}

/**
 * Attiva/disattiva la modalità “avanzamento” (nasconde pannello dettagli).
 * @param {boolean} enabled
 */
function setViewProgress(enabled) {
  document.body.classList.toggle("view-progress", !!enabled);
}

/**
 * Chiude la visualizzazione mobile-only delle fatture.
 */
function closeFattureView() {
  document.body.classList.remove("show-fatture");
}

/* -------------------------------------------------------------------------- */
/* 11. Rendering lista                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Rende la tabella commesse attive.
 * @param {string} filterText
 * @param {string} filterStato
 */
function renderList(filterText = "", filterStato = "") {
  dom.jobTableBody.innerHTML = "";
  let count = 0;

  (state.attivi || []).forEach((job) => {
    const matchText =
      job.cliente?.toLowerCase().includes(filterText) ||
      job.mobile?.toLowerCase().includes(filterText) ||
      (job.architetto || "").toLowerCase().includes(filterText);

    const matchState = filterStato === "" || job.stato === filterStato;

    if (!matchText || !matchState) return;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${job.cliente || ""}</td>
      <td>${job.mobile || ""}</td>
      <td class="hide-mobile">${job.architetto || ""}</td>
      <td><span class="badge ${statoToClass(job.stato)}">${job.stato}</span></td>
      <td class="hide-mobile">${job.dataPosa || ""}</td>
      <td class="hide-small"><span class="fatt-inline">${fattCell(job)}</span></td>
      <td style="white-space:nowrap">
        <button class="ghost-btn small" data-job="${job.id}">Apri</button>
        <button class="trash-btn" data-archive="${job.id}">Archivia</button>
      </td>
    `;
    dom.jobTableBody.appendChild(row);
    count += 1;
  });

  dom.totalCount.textContent = `${count} lavori`;
}

/**
 * Restituisce il testo della cella fatture (x/y + badge).
 * @param {Object} job
 */
function fattCell(job) {
  const fatture = job.fatture || [];
  if (!fatture.length) return "";

  const paid = fatture.filter((f) => !!f.pagata).length;

  const badges = fatture
    .map((f, idx) => {
      const numero =
        f.numero != null && f.numero !== "" ? String(f.numero) : String(idx + 1);
      const cls = f.pagata ? "badge-inv paid" : "badge-inv";
      const title = f.pagata ? "Pagata" : "Da pagare";
      return `<span class="${cls}" title="${title}">#${numero}</span>`;
    })
    .join(" ");

  return `Pagate ${paid}/${fatture.length} ${badges}`;
}

/* -------------------------------------------------------------------------- */
/* 12. Rendering board                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Rende il pannello “Avanzamento commesse”.
 */
function renderBoard(filterText = "", filterStato = "") {
  dom.boardBody.innerHTML = "";

  (state.attivi || []).forEach((job) => {
    const matchText =
      job.cliente?.toLowerCase().includes(filterText) ||
      job.mobile?.toLowerCase().includes(filterText);
    const matchState = filterStato ? job.stato === filterStato : true;

    if (!matchText || !matchState) return;

    const row = document.createElement("div");
    row.className = "board-row";

    const titolo = document.createElement("p");
    titolo.className = "board-title";
    titolo.textContent = `${job.cliente || ""} - ${job.mobile || ""}`;
    row.appendChild(titolo);

    const line = document.createElement("div");
    line.className = "stage-line";
    row.appendChild(line);

    const currentIndex = STATI.indexOf(job.stato);

    STATI.forEach((stato, idx) => {
      const pill = document.createElement("span");
      pill.className = "stage-pill";
      pill.textContent = stato;

      if (idx < currentIndex) pill.classList.add("done");
      if (idx === currentIndex) pill.classList.add("current");

      line.appendChild(pill);
    });

    dom.boardBody.appendChild(row);
  });

  if (!dom.boardBody.innerHTML.trim()) {
    dom.boardBody.innerHTML =
      "<p style='text-align:center;color:#aaa;'>Nessuna commessa corrispondente ai filtri</p>";
  }
}

/* -------------------------------------------------------------------------- */
/* 13. Rendering archivio                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Rende la tabella dell’archivio.
 */
function renderArchive() {
  if (!dom.archiveTableBody || !dom.archiveCount) return;

  dom.archiveTableBody.innerHTML = "";
  let count = 0;

  (state.archivio || []).forEach((job) => {
    const last = new Date(job.lastUpdate || Date.now()).toLocaleDateString();
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${job.cliente || ""}</td>
      <td>${job.mobile || ""}</td>
      <td><span class="badge ${statoToClass(job.stato)}">${job.stato}</span></td>
      <td>${last}</td>
      <td style="white-space:nowrap">
        <button class="restore-btn" data-restore="${job.id}">Ripristina</button>
        <button class="trash-btn" data-delete-final="${job.id}">Elimina</button>
      </td>
    `;
    dom.archiveTableBody.appendChild(row);
    count += 1;
  });

  dom.archiveCount.textContent = `${count} lavori`;
}

/* -------------------------------------------------------------------------- */
/* 14. Pannello dettagli                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Apre il pannello dettagli per la commessa indicata.
 * @param {number|string} id
 */
function openDetail(id) {
  const job = state.attivi.find((j) => j.id === Number(id));
  if (!job) return;

  closeFattureView();
  selectedJobId = job.id;

  dom.detailBody.classList.remove("hidden");
  dom.detailBody.dataset.jobId = String(job.id);
  dom.detailTitle.textContent = `${job.cliente || ""} - ${job.mobile || ""}`;
  dom.detailSubtitle.textContent = job.stato || "";
  dom.dCliente.textContent = job.cliente || "";
  dom.dMobile.textContent = job.mobile || "";
  dom.dArch.textContent = job.architetto || "";
  dom.dStato.value = job.stato || "";

  dom.dDataPosa.value = job.dataPosa || "";
  dom.dDataFattura.value = job.fattura || "";
  dom.dDataPagato.value = job.pagato || "";
  dom.dMancanze.value = job.mancanze || "";

  showConditional(job.stato);

  // Rende tab materiali
  dom.materialBody.innerHTML = "";
  (job.materiali || []).forEach((mat) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      
      <td>
        <input class="inline-input"
               data-mat="${mat.id}"
               data-field="descrizione"
               value="${mat.descrizione || ""}">
      </td>
      <td>
        <select class="inline-input"
                data-mat="${mat.id}"
                data-field="stato">
          <option value="da ordinare" ${mat.stato === "da ordinare" ? "selected" : ""}>Da ordinare</option>
          <option value="in arrivo" ${mat.stato === "in arrivo" ? "selected" : ""}>In arrivo</option>
          <option value="arrivato" ${mat.stato === "arrivato" ? "selected" : ""}>Arrivato</option>
        </select>
      </td>
      <td><button class="ghost-btn small" data-matdetail="${mat.id}">Dettagli</button></td>
    `;
    dom.materialBody.appendChild(tr);
  });

  // Documenti
  Documents.onDetailOpen(job);

  // Fatture
  renderFatture(job);
}

/* -------------------------------------------------------------------------- */
/* 15. Modale materiali                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Apre la modale di dettaglio materiali.
 */
function openMaterialModal(jobId, materialId) {
  const job = state.attivi.find((j) => j.id === Number(jobId));
  if (!job) return;

  const mat = (job.materiali || []).find((m) => m.id === Number(materialId));
  if (!mat) return;

  selectedMaterialRef = { jobId: job.id, materialId: mat.id };
  dom.materialDetailBody.innerHTML = "";

  (mat.dettagli || []).forEach((det, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input class="md-voce inline-input" data-sub="${idx}" value="${det.voce || ""}" placeholder="Voce"></td>
      <td><input class="md-variante inline-input" data-sub="${idx}" value="${det.variante || ""}" placeholder="Codice"></td>
      <td><input class="md-qta inline-input" data-sub="${idx}" value="${det.qta || ""}" placeholder="Qtà"></td>
      <td>
        <select class="md-stato" data-sub="${idx}">
          <option value="da ordinare" ${det.stato === "da ordinare" ? "selected" : ""}>Da ordinare</option>
          <option value="in arrivo" ${det.stato === "in arrivo" ? "selected" : ""}>In arrivo</option>
          <option value="arrivato" ${det.stato === "arrivato" ? "selected" : ""}>Arrivato</option>
        </select>
      </td>
    `;
    dom.materialDetailBody.appendChild(tr);
  });

  dom.materialModal.classList.remove("hidden");
}

/* -------------------------------------------------------------------------- */
/* 16. Fatture                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Somma le percentuali pagate e aggiorna eventualmente lo stato Pagato.
 * @param {Object} job
 */
function checkAutoPagato(job) {
  const fatture = job.fatture || [];
  const totalPaid = fatture.reduce(
    (acc, f) => acc + (f.pagata ? Number(f.percent) || 0 : 0),
    0
  );

  if (totalPaid >= 100 && job.stato !== "Pagato") {
    job.stato = "Pagato";
    if (dom.dStato) dom.dStato.value = "Pagato";
    showToast("Fatture al 100%: stato impostato a Pagato.");
  }

  dom.fattureTotaleInfo.textContent = `Pagato: ${totalPaid}%`;
  return totalPaid;
}

/**
 * Rende la tabella fatture nel pannello dettagli.
 * @param {Object} job
 */
function renderFatture(job) {
  if (!dom.fattureTableBody) return;
  if (!job.fatture) job.fatture = [];

  const rows = job.fatture
    .map(
      (f, index) => `
      <tr data-i="${index}">
        <td><input type="text" class="f-num" value="${f.numero ?? ""}" placeholder="Numero"></td>
        <td><input type="date" class="f-data" value="${f.data ?? ""}"></td>
        <td><input type="number" class="f-perc" value="${f.percent ?? ""}" min="0" max="100" step="1" placeholder="%"></td>
        <td style="text-align:center"><input type="checkbox" class="f-paid" ${f.pagata ? "checked" : ""}></td>
        <td><input type="date" class="f-dpay" value="${f.data_pagamento ?? ""}"></td>
        <td><input type="text" class="f-note" value="${f.note ?? ""}" placeholder="Note"></td>
        <td><button class="del-row" title="Elimina">Elimina</button></td>
      </tr>
    `
    )
    .join("");

  dom.fattureTableBody.innerHTML =
    rows || `<tr><td colspan="7" class="muted">Nessuna fattura</td></tr>`;

  checkAutoPagato(job);
}

/* -------------------------------------------------------------------------- */
/* 17. Gestione viste                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Attiva la vista desiderata (list | board | archive).
 * @param {string} view
 * @param {boolean} [skipPersist=false]
 */
function switchView(view, { skipPersist = false } = {}) {
  currentView = view;

  const isList = view === "list";
  const isBoard = view === "board";
  const isArchive = view === "archive";

  dom.listView.classList.toggle("hidden", !isList);
  dom.boardView.classList.toggle("hidden", !isBoard);
  dom.archiveView.classList.toggle("hidden", !isArchive);
  dom.viewListBtn.classList.toggle("hidden", isList);

  setViewProgress(isBoard);
  closeFattureView();

  if (!skipPersist) {
    state.lastOpenView = view;
    saveState();
  }

  refreshAll();
}

/* -------------------------------------------------------------------------- */
/* 18. Event binding                                                          */
/* -------------------------------------------------------------------------- */

// Toggle vista fatture mobile
dom.btnFatture?.addEventListener("click", () => {
  document.body.classList.toggle("show-fatture");
});

// Ricerca e filtro
dom.searchInput.addEventListener("input", () => refreshAll());
dom.filterState.addEventListener("change", () => refreshAll());

// Cambio vista
dom.viewBoardBtn.addEventListener("click", () => switchView("board"));
dom.viewArchiveBtn.addEventListener("click", () => switchView("archive"));
dom.viewListBtn.addEventListener("click", () => switchView("list"));

// Cambio stato commessa dal dettaglio
dom.dStato.addEventListener("change", () => {
  if (!selectedJobId) return;
  const job = getActiveJob();
  if (!job) return;

  job.stato = dom.dStato.value;
  job.dataPosa = dom.dDataPosa.value;
  job.fattura = dom.dDataFattura.value;
  job.pagato = dom.dDataPagato.value;
  job.mancanze = dom.dMancanze.value;

  showConditional(job.stato);
  touchAndPersist(job, { refresh: true, reopenDetail: true });
});

// Campi inline materiali (tabella principale)
document.addEventListener("change", (event) => {
  const target = event.target;
  if (
    selectedJobId &&
    target.matches("input.inline-input, select.inline-input")
  ) {
    const job = getActiveJob();
    if (!job) return;

    const matId = Number(target.getAttribute("data-mat"));
    const field = target.getAttribute("data-field");
    const materiale = job.materiali?.find((m) => m.id === matId);
    if (!materiale || !field) return;

    materiale[field] = target.value;
    touchAndPersist(job, { refresh: true, reopenDetail: false });
  }
});

// Apertura dettaglio materiale
document.addEventListener("click", (event) => {
  const jobBtn = event.target.closest("button[data-job]");
  if (jobBtn) {
    openDetail(jobBtn.getAttribute("data-job"));
  }

  const matBtn = event.target.closest("button[data-matdetail]");
  if (matBtn) {
    openMaterialModal(selectedJobId, matBtn.getAttribute("data-matdetail"));
  }

  const archiveBtn = event.target.closest("button[data-archive]");
  if (archiveBtn) {
    archiveJob(Number(archiveBtn.getAttribute("data-archive")));
  }

  const restoreBtn = event.target.closest("button[data-restore]");
  if (restoreBtn) {
    restoreJob(Number(restoreBtn.getAttribute("data-restore")));
  }

  const deleteBtn = event.target.closest("button[data-delete-final]");
  if (deleteBtn) {
    deleteJobForever(Number(deleteBtn.getAttribute("data-delete-final")));
  }
});

// Modale materiali: input live
dom.materialDetailBody.addEventListener("input", (event) => {
  const idx = Number(event.target.getAttribute("data-sub"));
  if (Number.isNaN(idx) || !selectedMaterialRef.jobId) return;

  const job = getActiveJob();
  if (!job) return;

  const mat = job.materiali?.find(
    (m) => m.id === selectedMaterialRef.materialId
  );
  if (!mat || !mat.dettagli || !mat.dettagli[idx]) return;

  const dettaglio = mat.dettagli[idx];

  if (event.target.classList.contains("md-voce")) {
    dettaglio.voce = event.target.value;
  }
  if (event.target.classList.contains("md-variante")) {
    dettaglio.variante = event.target.value;
  }
  if (event.target.classList.contains("md-qta")) {
    dettaglio.qta = event.target.value;
  }

  touchAndPersist(job, { refresh: false });
});

// Modale materiali: cambio stato
dom.materialDetailBody.addEventListener("change", (event) => {
  if (!event.target.classList.contains("md-stato")) return;

  const idx = Number(event.target.getAttribute("data-sub"));
  if (Number.isNaN(idx) || !selectedMaterialRef.jobId) return;

  const job = getActiveJob();
  if (!job) return;

  const mat = job.materiali?.find(
    (m) => m.id === selectedMaterialRef.materialId
  );
  if (!mat || !mat.dettagli || !mat.dettagli[idx]) return;

  mat.dettagli[idx].stato = event.target.value;
  touchAndPersist(job, { refresh: true, reopenDetail: false });
});

// Modale materiali: chiusura
dom.closeMaterialBtn.addEventListener("click", () => {
  dom.materialModal.classList.add("hidden");
});

// Modale materiali: nuova riga dettaglio
dom.addSubMaterialBtn.addEventListener("click", () => {
  const job = getActiveJob();
  if (!job) return;

  const mat = job.materiali?.find(
    (m) => m.id === selectedMaterialRef.materialId
  );
  if (!mat) return;

  if (!Array.isArray(mat.dettagli)) mat.dettagli = [];
  mat.dettagli.push({
    voce: "Voce",
    variante: "",
    qta: "",
    stato: "da ordinare",
  });

  touchAndPersist(job, { refresh: false });
  openMaterialModal(selectedMaterialRef.jobId, selectedMaterialRef.materialId);
});

// Aggiunta materiale dal dettaglio
dom.addMaterialBtn.addEventListener("click", () => {
  const job = getActiveJob();
  if (!job) return;

  if (!Array.isArray(job.materiali)) job.materiali = [];
  const lastId = job.materiali.slice(-1)[0]?.id || 0;

  job.materiali.push({
    id: lastId + 1,
    categoria: "Varie",
    descrizione: "Nuovo materiale",
    stato: "da ordinare",
    dettagli: [],
  });

  touchAndPersist(job, { refresh: true, reopenDetail: true });
});

// Nuova commessa
dom.newJobBtn.addEventListener("click", () => {
  dom.newJobModal.classList.remove("hidden");
  dom.njCliente.value = "";
  dom.njMobile.value = "";
  dom.njArch.value = "";
  dom.njStato.value = "Misure";
});

dom.closeNewJobBtn.addEventListener("click", () => {
  dom.newJobModal.classList.add("hidden");
});

dom.saveNewJobBtn.addEventListener("click", () => {
  const cliente = dom.njCliente.value.trim();
  const mobile = dom.njMobile.value.trim();

  if (!cliente || !mobile) {
    showToast("Inserisci Cliente e Mobile.");
    return;
  }

  const allJobs = [...(state.attivi || []), ...(state.archivio || [])];
  const newId = allJobs.length ? Math.max(...allJobs.map((j) => j.id)) + 1 : 1;

  const job = {
    id: newId,
    cliente,
    mobile,
    architetto: dom.njArch.value.trim(),
    stato: dom.njStato.value,
    dataPosa: "",
    fattura: "",
    pagato: "",
    materiali: [],
    mancanze: "",
    documenti: { rilievi: [], disegni: [], preventivi: [], ordini: [] },
    fatture: [],
    lastUpdate: new Date().toISOString(),
  };

  if (!Array.isArray(state.attivi)) state.attivi = [];
  state.attivi.push(job);

  saveJob(job);
  saveState();

  dom.newJobModal.classList.add("hidden");
  switchView("list");
  openDetail(job.id);
  refreshAll();
});

// Archivio / ripristino / delete definitivo
function archiveJob(id) {
  const index = state.attivi.findIndex((j) => j.id === id);
  if (index === -1) return;

  const job = state.attivi[index];
  if (
    !confirm(`Archiviare il lavoro: ${job.cliente || ""} - ${job.mobile || ""}?`)
  )
    return;

  job.lastUpdate = new Date().toISOString();
  state.attivi.splice(index, 1);
  if (!Array.isArray(state.archivio)) state.archivio = [];
  state.archivio.push(job);

  saveJob(job);
  saveState();

  switchView("list");
  dom.detailBody.classList.add("hidden");
  refreshAll();
}

function restoreJob(id) {
  const index = state.archivio.findIndex((j) => j.id === id);
  if (index === -1) return;

  const job = state.archivio[index];
  state.archivio.splice(index, 1);
  state.attivi.push(job);

  saveJob(job);
  saveState();

  refreshAll();
  showToast("Lavoro ripristinato.");
}

function deleteJobForever(id) {
  const index = state.archivio.findIndex((j) => j.id === id);
  if (index === -1) return;
  if (!confirm("Eliminare definitivamente questo lavoro dall'archivio?")) return;

  const job = state.archivio[index];
  state.archivio.splice(index, 1);

  localStorage.removeItem(STORAGE_JOB(job.id));
  saveState();
  refreshAll();
}

/* -------------------------------------------------------------------------- */
/* 19. Fatture – Eventi                                                       */
/* -------------------------------------------------------------------------- */

// Aggiunta fattura
dom.addFatturaBtn?.addEventListener("click", () => {
  const job = getActiveJob();
  if (!job) return;

  if (!Array.isArray(job.fatture)) job.fatture = [];
  job.fatture.push({
    numero: "",
    data: todayISO(),
    percent: "",
    pagata: false,
    data_pagamento: "",
    note: "",
  });

  touchAndPersist(job, { refresh: true, reopenDetail: true });
});

// Input (numero, data, percentuale, note)
dom.fattureTableBody?.addEventListener("input", (event) => {
  if (
    event.target.classList.contains("f-paid") ||
    event.target.classList.contains("f-dpay")
  ) {
    return; // gestiti dal listener change
  }

  const row = event.target.closest("tr[data-i]");
  if (!row) return;

  const index = Number(row.dataset.i);
  const job = getActiveJob();
  if (!job || !job.fatture || !job.fatture[index]) return;

  const fattura = job.fatture[index];

  if (event.target.classList.contains("f-num")) {
    fattura.numero = event.target.value.trim();
  }
  if (event.target.classList.contains("f-data")) {
    fattura.data = event.target.value;
  }
  if (event.target.classList.contains("f-perc")) {
    fattura.percent = event.target.value;
  }
  if (event.target.classList.contains("f-note")) {
    fattura.note = event.target.value;
  }

  touchAndPersist(job, { refresh: false });
});

// Checkbox pagata / data pagamento
dom.fattureTableBody?.addEventListener("change", (event) => {
  const row = event.target.closest("tr[data-i]");
  if (!row) return;

  const index = Number(row.dataset.i);
  const job = getActiveJob();
  if (!job || !job.fatture || !job.fatture[index]) return;

  const fattura = job.fatture[index];

  if (event.target.classList.contains("f-paid")) {
    fattura.pagata = event.target.checked;
    if (fattura.pagata && !fattura.data_pagamento) {
      fattura.data_pagamento = todayISO();
    }
    if (!fattura.pagata) {
      fattura.data_pagamento = fattura.data_pagamento || "";
    }
  }

  if (event.target.classList.contains("f-dpay")) {
    fattura.data_pagamento = event.target.value;
  }

  touchAndPersist(job, { refresh: true, reopenDetail: true });
});

// Eliminazione fattura
dom.fattureTableBody?.addEventListener("click", (event) => {
  if (!event.target.classList.contains("del-row")) return;

  const row = event.target.closest("tr[data-i]");
  if (!row) return;

  const index = Number(row.dataset.i);
  const job = getActiveJob();
  if (!job || !job.fatture) return;
  if (!confirm("Eliminare questa fattura?")) return;

  job.fatture.splice(index, 1);
  touchAndPersist(job, { refresh: true, reopenDetail: true });
});

/* -------------------------------------------------------------------------- */
/* 20. Aggiornamento diretto date/mananze (listener legacy)                   */
/* -------------------------------------------------------------------------- */

(() => {
  try {
    const fields = [dom.dDataPosa, dom.dDataFattura, dom.dDataPagato];
    fields.forEach((field) => {
      field?.addEventListener("change", () => {
        const job = getActiveJob();
        if (!job) return;

        job.dataPosa = dom.dDataPosa?.value || job.dataPosa;
        job.fattura = dom.dDataFattura?.value || job.fattura;
        job.pagato = dom.dDataPagato?.value || job.pagato;
        touchAndPersist(job, { refresh: true, reopenDetail: true });
      });
    });

    dom.dMancanze?.addEventListener("input", () => {
      const job = getActiveJob();
      if (!job) return;
      job.mancanze = dom.dMancanze.value;
      touchAndPersist(job, { refresh: false });
    });
  } catch (error) {
    console.warn("Listeners init warning:", error);
  }
})();

/* -------------------------------------------------------------------------- */
/* 21. Documenti – click tab (fallback)                                       */
/* -------------------------------------------------------------------------- */

(() => {
  const bar = document.getElementById("docCategoryBar");
  if (!bar) return;

  bar.addEventListener("click", (event) => {
    const btn = event.target.closest(".doc-cat-btn");
    if (!btn) return;

    event.preventDefault();

    const cat = btn.getAttribute("data-cat") || "rilievi";
    const hidden = document.getElementById("docActiveCat");
    if (hidden) hidden.value = cat;

    const panel = document.getElementById("detailBody");
    const jid =
      Number(panel?.dataset?.jobId) || Number(window.selectedJobId || null);
    const job = (window.state?.attivi || []).find((j) => j.id === jid);
    if (!job) return;

    window.__docs_renderDocuments?.(job, cat);
  });
})();

/* -------------------------------------------------------------------------- */
/* 22. Funzioni legacy non più usate ma mantenute                             */
/* -------------------------------------------------------------------------- */

/**
 * Rimuove definitivamente un lavoro (usato da vecchie versioni).
 * @param {number} id
 */
function deleteJob(id) {
  try {
    localStorage.removeItem(STORAGE_JOB(id));
    state.attivi = (state.attivi || []).filter((j) => j.id !== id);
    state.archivio = (state.archivio || []).filter((j) => j.id !== id);
    saveState();
    return true;
  } catch (error) {
    console.warn("deleteJob error:", error);
    return false;
  }
}

/**
 * Inserisce una commessa in attivi o archivio evitando duplicati.
 * @param {Object} job
 * @param {boolean} [archived=false]
 */
function addJobToIndex(job, archived = false) {
  const target = archived ? state.archivio || [] : state.attivi || [];
  if (!target.find((j) => j.id === job.id)) target.push(job);
  saveJob(job);
  saveState();
}

/* -------------------------------------------------------------------------- */
/* 23. Refresh globale                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Aggiorna l’interfaccia (lista, board, archivio) secondo ricerca/filtri.
 */
function refreshAll() {
  const text = currentSearchText();
  const stato = currentFilterState();
  renderList(text, stato);
  renderBoard(text, stato);
  renderArchive();
}

/* -------------------------------------------------------------------------- */
/* 24. Bootstrap finale                                                       */
/* -------------------------------------------------------------------------- */

switchView(currentView, { skipPersist: true });
refreshAll();
console.log("IdeaLegnoApp aggiornata (script2.js).");