// IdeaLegnoApp V0.6 Complete
const STORAGE_KEY = "IdeaLegnoApp_V0_5_COMPLETE";
const STORAGE_ROOT = "IdeaLegnoApp_V0_7";           // nuova “radice”
const STORAGE_INDEX = `${STORAGE_ROOT}:index`;       // indice generale
const STORAGE_JOB   = (id)=>`${STORAGE_ROOT}:job:${id}`; // singola commessa

function readLS(key, fallback=null){
  try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch{ return fallback; }
}
function writeLS(key, obj){
  localStorage.setItem(key, JSON.stringify(obj));
}

const STATI = [
  "Misure","Progetto","Preventivo","Preventivo confermato","Ordine materiali",
  "Materiale consegnato","In lavorazione","In verniciatura","Materiale pronto",
  "Programmato posa","Posato","Da completare","Finito","Fattura emessa","Pagato"
];

//----------------------------
function setViewProgress(enabled){
  document.body.classList.toggle('view-progress', !!enabled);
}

//----------------------------
function loadState(){
  // 1) Nuovo schema shardato
  const idx = readLS(STORAGE_INDEX);
  if (idx && Array.isArray(idx.attiviIds)){
    const attivi   = idx.attiviIds.map(id => readLS(STORAGE_JOB(id))).filter(Boolean);
    const archivio = (idx.archiviIds||[]).map(id => readLS(STORAGE_JOB(id))).filter(Boolean);
    return { attivi, archivio, lastOpenView: idx.lastOpenView || "list" };
  }

  // 2) Migrazione da schema legacy monolitico (se esiste)
  const legacy = readLS(STORAGE_KEY);
  if (legacy && (Array.isArray(legacy.attivi) || Array.isArray(legacy.archivio) || Array.isArray(legacy.archivi))){
    const attiviIds  = [];
    const archiviIds = [];

    (legacy.attivi || []).forEach(job => { writeLS(STORAGE_JOB(job.id), job); attiviIds.push(job.id); });
    // accetta sia legacy.archivio che legacy.archivi
    (legacy.archivio || legacy.archivi || []).forEach(job => { writeLS(STORAGE_JOB(job.id), job); archiviIds.push(job.id); });

    writeLS(STORAGE_INDEX, { attiviIds, archiviIds, lastOpenView: legacy.lastOpenView || "list" });
    return { attivi: legacy.attivi||[], archivio: (legacy.archivio||legacy.archivi||[]), lastOpenView: legacy.lastOpenView||"list" };
  }

  // 3) Vuoto
  writeLS(STORAGE_INDEX, { attiviIds: [], archiviIds: [], lastOpenView: "list" });
  return { attivi: [], archivio: [], lastOpenView: "list" };
}


let state = loadState();

/* ==== MIGRAZIONE FATTURE (retro-compatibile) ==== */
function migrateInvoicesOnArray(arr){
  (arr || []).forEach(job => {
    if (!job.fatture) job.fatture = [];
    // Se esiste il vecchio campo singolo "fattura" lo trasformo in una fattura base
    if (job.fattura && !job.fatture.length){
      job.fatture.push({
        data: job.fattura,     // es. "2025-11-01"
        percent: null,         // la gestiremo nello STEP 2
        importo: null,
        numero: null,
        pagata: !!job.pagato,  // se avevi un flag/ data pagato
        data_pagamento: job.dataPagato || null,
        note: ""
      });
    }
  });
}
function migrateInvoices(){
  migrateInvoicesOnArray(state.attivi);
  migrateInvoicesOnArray(state.archivio);
}
migrateInvoices();

const jobTableBody = document.getElementById("jobTableBody");
const archiveTableBody = document.getElementById("archiveTableBody");
const totalCount = document.getElementById("totalCount");
const archiveCount = document.getElementById("archiveCount");
const searchInput = document.getElementById("searchInput");
const filterState = document.getElementById("filterState");
const listView = document.getElementById("listView");
const boardView = document.getElementById("boardView");
const archiveView = document.getElementById("archiveView");
const boardBody = document.getElementById("boardBody");
const viewListBtn = document.getElementById("viewListBtn");
const viewBoardBtn = document.getElementById("viewBoardBtn");
const viewArchiveBtn = document.getElementById("viewArchiveBtn");
const detailBody = document.getElementById("detailBody");
const detailTitle = document.getElementById("detailTitle");
const detailSubtitle = document.getElementById("detailSubtitle");
const dCliente = document.getElementById("dCliente");
const dMobile = document.getElementById("dMobile");
const dArch = document.getElementById("dArch");
const dStato = document.getElementById("dStato");
const dPosaWrapper = document.getElementById("dPosaWrapper");
const dDataPosa = document.getElementById("dDataPosa");
const dFatturaWrapper = document.getElementById("dFatturaWrapper");
const dDataFattura = document.getElementById("dDataFattura");
const dPagatoWrapper = document.getElementById("dPagatoWrapper");
const dDataPagato = document.getElementById("dDataPagato");
const materialBody = document.getElementById("materialBody");
const dMancanze = document.getElementById("dMancanze");
const newJobBtn = document.getElementById("newJobBtn");
const newJobModal = document.getElementById("newJobModal");
const closeNewJobBtn = document.getElementById("closeNewJobBtn");
const njCliente = document.getElementById("njCliente");
const njMobile = document.getElementById("njMobile");
const njArch = document.getElementById("njArch");
const njStato = document.getElementById("njStato");
const saveNewJobBtn = document.getElementById("saveNewJobBtn");
const materialModal = document.getElementById("materialModal");
const materialDetailBody = document.getElementById("materialDetailBody");
const closeMaterialBtn = document.getElementById("closeMaterialBtn");
const addSubMaterialBtn = document.getElementById("addSubMaterialBtn");
const addMaterialBtn = document.getElementById("addMaterialBtn");
const btnFatture = document.getElementById("btnFatture");
btnFatture && btnFatture.addEventListener("click", ()=>{
  document.body.classList.toggle("show-fatture");
});

// Quando cambi commessa o cambi vista, chiudi la vista fatture "full"
function closeFattureView(){
  document.body.classList.remove("show-fatture");
}

const toast = document.getElementById("toast");
let selectedJobId = null;
let selectedMaterialRef = { jobId:null, materialId:null };
let currentView = "list";
// inizializzazione dei menu a tendina con "Vedi tutti"
const optAll = document.createElement("option");
optAll.value = "";
optAll.textContent = "Vedi tutti";
filterState.appendChild(optAll);
// Init modulo Documenti (usa il tuo saveState e l'array lavori corrente)
Documents.init({
  saveState: () => saveState(),
  getJobs:   () => (state.attivi || []),
});

STATI.forEach(s => {
  const o = document.createElement("option");
  o.value = s;
  o.textContent = s;
  filterState.appendChild(o);

  const o2 = o.cloneNode(true);
  dStato.appendChild(o2);

  const o3 = o.cloneNode(true);
  njStato.appendChild(o3);
});

njStato.value="Misure";

function saveState(){
  try{
    const attiviIds  = (state.attivi  || []).map(j => j.id);
    const archiviIds = (state.archivio || []).map(j => j.id);
    writeLS(STORAGE_INDEX, { attiviIds, archiviIds, lastOpenView: state.lastOpenView || "list" });
    return true;
  }catch(e){
    console.warn("saveState index error:", e);
    alert("⚠️ Spazio esaurito su memoria locale (indice).");
    return false;
  }
}


function saveJob(job){
  try{
    writeLS(STORAGE_JOB(job.id), job);
    return true;
  }catch(e){
    console.warn("saveJob error:", e);
    alert("⚠️ Spazio esaurito salvando la commessa.");
    return false;
  }
}

function deleteJob(id){
  try{
    localStorage.removeItem(STORAGE_JOB(id));
    // rimuovi dai vettori in RAM
    state.attivi  = (state.attivi  || []).filter(j=>j.id!==id);
    state.archivi = (state.archivi || []).filter(j=>j.id!==id);
    // aggiorna indice
    saveState();
    return true;
  }catch(e){
    console.warn("deleteJob error:", e);
    return false;
  }
}

function addJobToIndex(job, archived=false){
  // evita duplicati
  const arr = archived ? (state.archivi||[]) : (state.attivi||[]);
  if (!arr.find(j=>j.id===job.id)) arr.push(job);
  // salva singola commessa + indice
  saveJob(job);
  saveState();
}


function showToast(msg){toast.textContent=msg;toast.classList.add("show");toast.classList.remove("hidden");setTimeout(()=>toast.classList.remove("show"),1600);}
function statoToClass(s){return "status-"+s.replace(/ /g,"-");}
function deriveFornitore(mat){
  if (!mat) return "";
  if (mat.fornitore && mat.fornitore.trim()!=="") return mat.fornitore;
  if (Array.isArray(mat.dettagli)) {
    const r = mat.dettagli.find(d => (d.fornitore||"").trim()!=="");
    if (r) return r.fornitore;
  }
  return "";
}

function renderList(filterText="", filterStato=""){jobTableBody.innerHTML="";let count=0;state.attivi.forEach(job=>{const matchText=job.cliente.toLowerCase().includes(filterText)||job.mobile.toLowerCase().includes(filterText)||(job.architetto||"").toLowerCase().includes(filterText);const matchState = filterStato === "" || job.stato === filterStato;
if(matchText && matchState){const tr=document.createElement("tr");tr.innerHTML=`<td>${job.cliente}</td><td>${job.mobile}</td><td class="hide-mobile">${job.architetto||"—"}</td><td><span class="badge ${statoToClass(job.stato)}">${job.stato}</span></td><td class="hide-mobile">${job.dataPosa||"—"}</td><td class="hide-small"><span class="fatt-inline">${fattCell(job)}</span>
</td><td style="white-space:nowrap"><button class="ghost-btn small" data-job="${job.id}">🔍</button><button class="trash-btn" data-archive="${job.id}">🗑️</button></td>`;jobTableBody.appendChild(tr);count++;}});totalCount.textContent=count+" lavori";}

/* ==== FATTURE: cella lista (frazione + badge numeri) ==== */
function fattCell(job){
  const fatt = job.fatture || [];
  if (!fatt.length) return "—";

  const paid = fatt.filter(f => !!f.pagata).length;

  // badge: usa f.numero se presente, altrimenti indice 1-based
  const badges = fatt.map((f, idx) => {
    const n = (f.numero != null && f.numero !== "") ? String(f.numero) : String(idx + 1);
    const cls = f.pagata ? 'badge-inv paid' : 'badge-inv';
    const title = f.pagata ? 'Pagata' : 'Da pagare';
    return `<span class="${cls}" title="${title}">#${n}</span>`;
  }).join(" ");

  return `🧾 ${paid}/${fatt.length} ${badges}`;
}
/* ===== FATTURE — helpers ===== */
const fattTableBody   = document.querySelector("#fattureTable tbody");
const addFatturaBtn   = document.getElementById("addFatturaBtn");
const fattTotaleInfo  = document.getElementById("fattureTotaleInfo");

// oggi in formato YYYY-MM-DD
function todayISO(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}

// Somma % pagate; se >=100 → stato = "Pagato"
function checkAutoPagato(job){
  const fatt = job.fatture || [];
  const totPaid = fatt.reduce((acc,f)=> acc + (f.pagata ? (Number(f.percent)||0) : 0), 0);
  if (totPaid >= 100 && job.stato !== "Pagato"){
    job.stato = "Pagato";
    // aggiorna select stato nel dettaglio se presente
    if (typeof dStato !== "undefined" && dStato) dStato.value = "Pagato";
    showToast && showToast("✅ Fatture al 100%: stato impostato a Pagato");
  }
  return totPaid;
}

/* Render tabella fatture nel dettaglio */
function renderFatture(job){
  if (!job.fatture) job.fatture = [];
  const rows = job.fatture.map((f,i)=>`
    <tr data-i="${i}">
      <td><input type="text"   class="f-num"   value="${f.numero??""}"  placeholder="es. 1025"></td>
      <td><input type="date"   class="f-data"  value="${f.data??""}"></td>
      <td><input type="number" class="f-perc"  value="${f.percent??""}" min="0" max="100" step="1" placeholder="%"></td>
      <td style="text-align:center"><input type="checkbox" class="f-paid" ${f.pagata?"checked":""}></td>
      <td><input type="date"   class="f-dpay"  value="${f.data_pagamento??""}"></td>
      <td><input type="text"   class="f-note"  value="${f.note??""}" placeholder="note"></td>
      <td><button class="del-row" title="Elimina">✖</button></td>
    </tr>
  `).join("");
  fattTableBody.innerHTML = rows || `<tr><td colspan="7" class="muted">Nessuna fattura</td></tr>`;

  // mostra totale % pagate
  const totPaid = job.fatture.reduce((acc,f)=> acc + (f.pagata ? (Number(f.percent)||0) : 0), 0);
  fattTotaleInfo.textContent = `Pagato: ${totPaid}%`;
}

// render avanzamento — versione migliorata con emoji e font leggibile
function renderBoard(filterText = "", filterStato = "") {
  boardBody.innerHTML = "";

  state.attivi.forEach(job => {
    const matchText =
      job.cliente.toLowerCase().includes(filterText) ||
      job.mobile.toLowerCase().includes(filterText);
    const matchState = filterStato ? job.stato === filterStato : true;

    if (matchText && matchState) {
      const row = document.createElement("div");
      row.className = "board-row";

      // titolo cliente + mobile
      const titolo = document.createElement("p");
      titolo.className = "board-title";
      titolo.textContent = `${job.cliente} – ${job.mobile}`;
      row.appendChild(titolo);

      // linea delle fasi
      const line = document.createElement("div");
      line.className = "stage-line";
      row.appendChild(line);

      // posizione stato attuale
      const idx = STATI.indexOf(job.stato);

      // crea le "pillole" di avanzamento
      STATI.forEach((s, i) => {
        const pill = document.createElement("span");
        pill.className = "stage-pill";
        pill.textContent = s; // include già emoji

        // stati completati
        if (i < idx) pill.classList.add("done");

        // stato corrente
        if (i === idx) pill.classList.add("current");

        line.appendChild(pill);
      });

      boardBody.appendChild(row);
    }
  });

  // se non ci sono lavori corrispondenti
  if (boardBody.innerHTML.trim() === "") {
    boardBody.innerHTML =
      "<p style='text-align:center;color:#aaa;'>Nessuna commessa corrispondente ai filtri</p>";
  }
}

function openDetail(id){const job=state.attivi.find(j=>j.id===Number(id));if(!job) return;
  closeFattureView();
  selectedJobId=job.id;
  detailBody.classList.remove("hidden");
  detailTitle.textContent=job.cliente+" – "+job.mobile;
  detailBody.dataset.jobId = String(job.id);
  detailSubtitle.textContent=job.stato;dCliente.textContent=job.cliente;dMobile.textContent=job.mobile;dArch.textContent=job.architetto||"—";dStato.value=job.stato;



  // Documenti: delega al modulo
  Documents.onDetailOpen(job);
  renderFatture(job);




  
  
  dDataPosa.value=job.dataPosa||"";dDataFattura.value=job.fattura||"";dDataPagato.value=job.pagato||"";dMancanze.value=job.mancanze||"";showConditional(job.stato);materialBody.innerHTML="";(job.materiali||[]).forEach(mat=>{const tr=document.createElement("tr");
  tr.innerHTML = `
  <td>${deriveFornitore(mat)}</td>
  <td><input class="inline-input" data-mat="${mat.id}" data-field="descrizione" value="${mat.descrizione||""}"></td>
  <td>
    <select class="inline-input" data-mat="${mat.id}" data-field="stato">
      <option value="🕓" ${mat.stato==="🕓"?"selected":""}>🕓 Da ordinare</option>
      <option value="🚚" ${mat.stato==="🚚"?"selected":""}>🚚 In arrivo</option>
      <option value="✅" ${mat.stato==="✅"?"selected":""}>✅ Arrivato</option>
    </select>
  </td>
  <td><button class="ghost-btn small" data-matdetail="${mat.id}">🔍</button></td>
`;

  materialBody.appendChild(tr);});}
function showConditional(stato){dPosaWrapper.classList.add("hidden");dFatturaWrapper.classList.add("hidden");dPagatoWrapper.classList.add("hidden");if(stato==="Programmato posa") dPosaWrapper.classList.remove("hidden");if(stato==="Fattura emessa") dFatturaWrapper.classList.remove("hidden");if(stato==="Pagato") dPagatoWrapper.classList.remove("hidden");}

function openMaterialModal(jobId,matId){
  const job = state.attivi.find(j => j.id === Number(jobId)); if(!job) return;
  const mat = job.materiali.find(m => m.id === Number(matId)); if(!mat) return;

  selectedMaterialRef = { jobId: job.id, materialId: mat.id };
  materialDetailBody.innerHTML = "";

  (mat.dettagli || []).forEach((d,idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input  class="md-voce inline-input"     data-sub="${idx}" value="${d.voce||""}"      placeholder="Materiale"></td>
      <td><input  class="md-variante inline-input" data-sub="${idx}" value="${d.variante||""}"  placeholder="Codice"></td>
      <td><input  class="md-qta inline-input"      data-sub="${idx}" value="${d.qta||""}"       placeholder="Qtà"></td>
      <td>
        <select class="md-stato" data-sub="${idx}">
          <option value="da ordinare" ${d.stato==="da ordinare"||d.stato==="🕓"?"selected":""}>da ordinare</option>
          <option value="in arrivo"   ${d.stato==="in arrivo"  ||d.stato==="🚚"?"selected":""}>in arrivo</option>
          <option value="arrivato"    ${d.stato==="arrivato"   ||d.stato==="✅"?"selected":""}>arrivato</option>
        </select>
      </td>
    `;
    materialDetailBody.appendChild(tr);
  });

  materialModal.classList.remove("hidden");
}

// Salvataggio LIVE dei campi testo nel modale materiali
materialDetailBody.addEventListener("input", (e) => {
  const el = e.target;
  const idx = Number(el.getAttribute("data-sub"));
  if (Number.isNaN(idx) || !selectedMaterialRef.jobId) return;

  const job = state.attivi.find(j => j.id === selectedMaterialRef.jobId);
  const mat = job?.materiali.find(m => m.id === selectedMaterialRef.materialId);
  if (!mat || !mat.dettagli[idx]) return;

  if (el.classList.contains("md-voce"))     mat.dettagli[idx].voce     = el.value;
  if (el.classList.contains("md-variante")) mat.dettagli[idx].variante = el.value;
  if (el.classList.contains("md-qta"))      mat.dettagli[idx].qta      = el.value;

  job.lastUpdate = new Date().toISOString();
  saveState();
});

// Salvataggio LIVE dello stato (select) nel modale materiali
materialDetailBody.addEventListener("change", (e) => {
  const el = e.target;
  if (!el.classList.contains("md-stato")) return;

  const idx = Number(el.getAttribute("data-sub"));
  if (Number.isNaN(idx) || !selectedMaterialRef.jobId) return;

  const job = state.attivi.find(j => j.id === selectedMaterialRef.jobId);
  const mat = job?.materiali.find(m => m.id === selectedMaterialRef.materialId);
  if (!mat || !mat.dettagli[idx]) return;

  mat.dettagli[idx].stato = el.value;            // da ordinare / in arrivo / arrivato
  job.lastUpdate = new Date().toISOString();
  saveState();
});


document.addEventListener("click", e=>{
  const jb=e.target.closest("button[data-job]");
  if(jb) openDetail(jb.getAttribute("data-job"));
  const mb=e.target.closest("button[data-matdetail]");
  if(mb) openMaterialModal(selectedJobId, mb.getAttribute("data-matdetail"));
  const ab=e.target.closest("button[data-archive]");
  if(ab) archiveJob(Number(ab.getAttribute("data-archive")));
  const rb=e.target.closest("button[data-restore]");
  if(rb) restoreJob(Number(rb.getAttribute("data-restore")));
  const db=e.target.closest("button[data-delete-final]");
  if(db) deleteJobForever(Number(db.getAttribute("data-delete-final")));
});
searchInput.addEventListener("input", ()=>{
  const txt=searchInput.value.toLowerCase();
  refreshAll(txt, filterState.value);
});
filterState.addEventListener("change", ()=>{
  const txt=searchInput.value.toLowerCase();
  refreshAll(txt, filterState.value);
});
viewBoardBtn.addEventListener("click", ()=>{
  currentView="board";
  listView.classList.add("hidden");
  archiveView.classList.add("hidden");
  boardView.classList.remove("hidden");
  viewListBtn.classList.remove("hidden");
  setViewProgress(true);
  closeFattureView();
  refreshAll(searchInput.value.toLowerCase(), filterState.value);
});
viewArchiveBtn.addEventListener("click", ()=>{
  currentView="archive";
  listView.classList.add("hidden");
  boardView.classList.add("hidden");
  archiveView.classList.remove("hidden");
  viewListBtn.classList.remove("hidden");
  setViewProgress(false);
  closeFattureView();
  refreshAll(searchInput.value.toLowerCase(), filterState.value);
});
viewListBtn.addEventListener("click", ()=>{
  currentView="list";
  listView.classList.remove("hidden");
  boardView.classList.add("hidden");
  archiveView.classList.add("hidden");
  viewListBtn.classList.add("hidden");
  setViewProgress(false);
  closeFattureView();
  refreshAll(searchInput.value.toLowerCase(), filterState.value);
});
dStato.addEventListener("change", ()=>{
  if(!selectedJobId) return;
  const job=state.attivi.find(j=>j.id===selectedJobId);
  job.stato=dStato.value;
  job.dataPosa=dDataPosa.value;
  job.fattura=dDataFattura.value;
  job.pagato=dDataPagato.value;
  job.mancanze=dMancanze.value;
  job.lastUpdate=new Date().toISOString();
  showConditional(job.stato);
  saveState();
  refreshAll(searchInput.value.toLowerCase(), filterState.value);
  openDetail(selectedJobId);
});
document.addEventListener("change", e=>{
  if(e.target.matches("input.inline-input, select.inline-input") && selectedJobId){
    const job=state.attivi.find(j=>j.id===selectedJobId);
    const matId=Number(e.target.getAttribute("data-mat"));
    const field=e.target.getAttribute("data-field");
    const mat=job.materiali.find(m=>m.id===matId);
    mat[field]=e.target.value;
    job.lastUpdate=new Date().toISOString();
    saveState();
    refreshAll(searchInput.value.toLowerCase(), filterState.value);
  }
});
closeMaterialBtn.addEventListener("click", ()=>{materialModal.classList.add("hidden");});
addSubMaterialBtn.addEventListener("click", ()=>{
  const {jobId,materialId}=selectedMaterialRef;
  const job=state.attivi.find(j=>j.id===jobId);
  const mat=job.materiali.find(m=>m.id===materialId);
  if(!mat.dettagli) mat.dettagli=[];
  mat.dettagli.push({voce:"Voce",variante:"",qta:"",fornitore:"",stato:""});
  saveState();
  openMaterialModal(jobId, materialId);
});
addMaterialBtn.addEventListener("click", ()=>{
  if(!selectedJobId) return;
  const job=state.attivi.find(j=>j.id===selectedJobId);
  const newId=(job.materiali?.slice(-1)[0]?.id||0)+1;
  if(!job.materiali) job.materiali=[];
  job.materiali.push({id:newId,categoria:"Varie",descrizione:"Nuovo materiale",stato:"🕓",dettagli:[]});
  job.lastUpdate=new Date().toISOString();
  saveState();
  openDetail(selectedJobId);
});

// Aggiungi nuova fattura
if (addFatturaBtn){
  addFatturaBtn.addEventListener("click", ()=>{
    const job = (state.attivi||[]).find(j => String(j.id) === String(selectedJobId));
    if (!job) return;
    if (!job.fatture) job.fatture = [];
    job.fatture.push({
      numero: "", data: todayISO(), percent: "", pagata: false, data_pagamento: "", note: ""
    });
    if (typeof saveJob === "function"){ saveJob(job); }
    if (typeof saveState === "function"){ saveState(); }
    renderFatture(job);
    refreshAll(searchInput.value.toLowerCase(), filterState.value);
  });
}

// Modifiche/Elimina nella tabella (delegato)
if (fattTableBody){
  fattTableBody.addEventListener("input", (e)=>{
    // Non re-renderizzare mentre si digita: niente flicker, niente caret che salta.
    // Ignora i checkbox (per quelli c’è il listener "change").
    if (e.target.classList.contains("f-paid") || e.target.classList.contains("f-dpay")) return;

    const tr = e.target.closest("tr[data-i]"); if (!tr) return;
    const i  = Number(tr.dataset.i);
    const job = (state.attivi||[]).find(j => String(j.id) === String(selectedJobId));
    if (!job || !job.fatture || !job.fatture[i]) return;

    const f = job.fatture[i];

    if (e.target.classList.contains("f-num"))  f.numero = e.target.value.trim();
    if (e.target.classList.contains("f-data")) f.data   = e.target.value;
    if (e.target.classList.contains("f-perc")) f.percent= e.target.value;
    if (e.target.classList.contains("f-note")) f.note   = e.target.value;

    // Salva senza re-render per non perdere il focus
    if (typeof saveJob === "function"){ saveJob(job); }
    if (typeof saveState === "function"){ saveState(); }
    // NIENTE renderFatture() qui
  });


  fattTableBody.addEventListener("change", (e)=>{
    const tr = e.target.closest("tr[data-i]"); if (!tr) return;
    const i  = Number(tr.dataset.i);
    const job = (state.attivi||[]).find(j => String(j.id) === String(selectedJobId));
    if (!job || !job.fatture || !job.fatture[i]) return;

    const f = job.fatture[i];

    if (e.target.classList.contains("f-paid")){
      f.pagata = e.target.checked;
      if (f.pagata && !f.data_pagamento) f.data_pagamento = todayISO();
      if (!f.pagata) f.data_pagamento = f.data_pagamento || "";
    }
    if (e.target.classList.contains("f-dpay")) f.data_pagamento = e.target.value;

    const totPaid = checkAutoPagato(job);

    if (typeof saveJob === "function"){ saveJob(job); }
    if (typeof saveState === "function"){ saveState(); }
    renderFatture(job);
    refreshAll(searchInput.value.toLowerCase(), filterState.value);
  });

  fattTableBody.addEventListener("click", (e)=>{
    if (!e.target.classList.contains("del-row")) return;
    const tr = e.target.closest("tr[data-i]"); if (!tr) return;
    const i  = Number(tr.dataset.i);
    const job = (state.attivi||[]).find(j => String(j.id) === String(selectedJobId));
    if (!job || !job.fatture) return;
    if (!confirm("Eliminare questa fattura?")) return;
    job.fatture.splice(i,1);
    checkAutoPagato(job);
    if (typeof saveJob === "function"){ saveJob(job); }
    if (typeof saveState === "function"){ saveState(); }
    renderFatture(job);
    refreshAll(searchInput.value.toLowerCase(), filterState.value);
  });
}

newJobBtn.addEventListener("click", ()=>{
  newJobModal.classList.remove("hidden");
  njCliente.value="";njMobile.value="";njArch.value="";njStato.value="Misure";
});
closeNewJobBtn.addEventListener("click", ()=>{
  newJobModal.classList.add("hidden");
});
saveNewJobBtn.addEventListener("click", ()=>{
  const cliente = njCliente.value.trim();
  const mobile  = njMobile.value.trim();
  if (!cliente || !mobile){ showToast("⚠️ Inserisci Cliente e Mobile"); return; }

  const all = [...(state.attivi || []), ...(state.archivio || [])]; // no crash se archivio è vuoto
  const newId = all.length ? Math.max(...all.map(j => j.id)) + 1 : 1;

  const job = {
    id:newId, cliente, mobile,
    architetto: njArch.value.trim(),
    stato: njStato.value,
    dataPosa:"", fattura:"", pagato:"",
    materiali:[], mancanze:"",
    // inizializza subito anche il contenitore documenti
    documenti: { rilievi:[], disegni:[], preventivi:[], ordini:[] },
    lastUpdate: new Date().toISOString()
  };

  // assicurati che l'array esista
  if (!state.attivi) state.attivi = [];
  state.attivi.push(job);

  // 🔐 salva lo shard della commessa + aggiorna indice
  saveJob(job) && saveState();

  newJobModal.classList.add("hidden");
  currentView="list";
  listView.classList.remove("hidden");
  boardView.classList.add("hidden");
  archiveView.classList.add("hidden");
  viewListBtn.classList.add("hidden");
  refreshAll(searchInput.value.toLowerCase(), filterState.value);
  openDetail(job.id);
});

function archiveJob(id){
  const idx=state.attivi.findIndex(j=>j.id===id);
  if(idx===-1) return;
  const job=state.attivi[idx];
  if(!confirm("Archiviare il lavoro: "+job.cliente+" – "+job.mobile+" ?")) return;
  job.lastUpdate=new Date().toISOString();
  state.attivi.splice(idx,1);
  state.archivio.push(job);
  saveState();
  currentView="list";
  listView.classList.remove("hidden");
  boardView.classList.add("hidden");
  archiveView.classList.add("hidden");
  viewListBtn.classList.add("hidden");
  refreshAll(searchInput.value.toLowerCase(), filterState.value);
  detailBody.classList.add("hidden");
}
function restoreJob(id){
  const idx=state.archivio.findIndex(j=>j.id===id);
  if(idx===-1) return;
  const job=state.archivio[idx];
  state.archivio.splice(idx,1);
  state.attivi.push(job);
  saveState();
  refreshAll(searchInput.value.toLowerCase(), filterState.value);
  showToast("↩︎ Lavoro ripristinato");
}
function deleteJobForever(id){
  const idx=state.archivio.findIndex(j=>j.id===id);
  if(idx===-1) return;
  if(!confirm("Eliminare definitivamente questo lavoro dall'archivio?")) return;
  state.archivio.splice(idx,1);
  saveState();
  refreshAll(searchInput.value.toLowerCase(), filterState.value);
}
function refreshAll(filterText="", filterStato=""){
  renderList(filterText, filterStato);
  renderBoard(filterText, filterStato);
  renderArchive();
}
refreshAll();
console.log("IdeaLegnoApp V0.5 Complete pronta");


// --- V0.6: Archivio renderer ---
function renderArchive() {
  if (typeof archiveTableBody === "undefined" || typeof archiveCount === "undefined") return;
  archiveTableBody.innerHTML = "";
  let count = 0;
  (state.archivio || []).forEach(job => {
    const tr = document.createElement("tr");
    const last = new Date(job.lastUpdate || Date.now()).toLocaleDateString();
    tr.innerHTML = `
      <td>${job.cliente || ""}</td>
      <td>${job.mobile || ""}</td>
      <td><span class="badge ${statoToClass(job.stato)}">${job.stato}</span></td>
      <td>${last}</td>
      <td style="white-space:nowrap">
        <button class="restore-btn" data-restore="${job.id}">↩︎ Ripristina</button>
        <button class="trash-btn" data-delete-final="${job.id}">✖</button>
      </td>
    `;
    archiveTableBody.appendChild(tr);
    count++;
  });
  if (typeof archiveCount !== "undefined") {
    archiveCount.textContent = count + " lavori";
  }
}


// --- V0.6: salvataggio immediato date/fattura/pagato e mancanze ---
(function(){
  try {
    const els = [dDataPosa, dDataFattura, dDataPagato];
    els.forEach(el => {
      el && el.addEventListener("change", () => {
        if (!selectedJobId) return;
        const job = (state.attivi || []).find(j => j.id === selectedJobId);
        if (!job) return;
        job.dataPosa   = dDataPosa ? dDataPosa.value : job.dataPosa;
        job.fattura    = dDataFattura ? dDataFattura.value : job.fattura;
        job.pagato     = dDataPagato ? dDataPagato.value : job.pagato;
        job.lastUpdate = new Date().toISOString();
        saveState && saveState();
        if (typeof refreshAll === "function") {
          const q = (typeof searchInput !== "undefined" && searchInput) ? searchInput.value.toLowerCase() : "";
          const f = (typeof filterState !== "undefined" && filterState) ? filterState.value : "all";
          refreshAll(q, f);
        }
        if (typeof openDetail === "function") openDetail(selectedJobId);
      });
    });

    if (typeof dMancanze !== "undefined" && dMancanze) {
      dMancanze.addEventListener("input", () => {
        if (!selectedJobId) return;
        const job = (state.attivi || []).find(j => j.id === selectedJobId);
        if (!job) return;
        job.mancanze  = dMancanze.value;
        job.lastUpdate = new Date().toISOString();
        saveState && saveState();
      });
    }
  } catch(e) {
    console.warn("V0.6 listeners init warning:", e);
  }
})();

//------------------------------------------------------------------------------------------------------------------------------------------------

// --- V0.9: Tabs Documenti (handler locale e robusto) ---
(() => {
  const bar = document.getElementById("docCategoryBar");
  if (!bar) return;

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest(".doc-cat-btn");
    if (!btn) return;
    e.preventDefault();

    const cat = btn.getAttribute("data-cat") || "rilievi";
    const hidden = document.getElementById("docActiveCat");
    if (hidden) hidden.value = cat;

    // jobId robusto: prima dal pannello, poi dal selectedJobId
    const panel = document.getElementById("detailBody");
    const jid = Number(panel?.dataset?.jobId) || Number(window.selectedJobId);
    const job = (window.state?.attivi || []).find(j => j.id === jid);
    if (!job) return;

    // chiama il renderer esposto dal modulo Documenti
    if (window.__docs_renderDocuments) {
      window.__docs_renderDocuments(job, cat);
    }
  });
})();






