/* documents.js — Modulo Documenti (job.documenti), anteprime migliorate + download */
(function(){
  "use strict";

  // Etichette e impostazioni
  const LABELS   = { rilievi:"Rilievi/Foto", disegni:"Disegni", preventivi:"Preventivi", ordini:"Ordini" };
  const ALLOWED  = ["application/pdf", "image/jpeg", "image/png"];
  const MAX_EACH = 1.8 * 1024 * 1024; // ~1.8MB
  const DEFAULT_CAT = "rilievi";

  // Dipendenze iniettate dal main
  let _saveState = () => {};
  let _getJobs   = () => [];
  let _selectors = {
    panel:  "#detailBody",
    bar:    "#docCategoryBar",
    hidden: "#docActiveCat",
    input:  "#docUploadInput, #docFile",
    list:   "#docList",
  };

  // Evita doppio wiring
  let _wired = false;

  /* ===== Utils ===== */
  const qs  = (sel) => document.querySelector(sel);
  const qsa = (scope, sel) => Array.from((scope||document).querySelectorAll(sel));

  function humanSize(bytes){
    if (bytes == null) return "—";
    const k=1024, units=["KB","MB","GB","TB"];
    if (Math.abs(bytes) < k) return bytes+" B";
    let u=-1; do{ bytes/=k; ++u; } while(Math.abs(bytes)>=k && u<units.length-1);
    return bytes.toFixed(1)+" "+units[u];
  }

  function fileExt(name=""){
    const m = name.match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : "";
  }
  function shortenName(name="", max=28){
    if (name.length <= max) return name;
    const ext = fileExt(name);
    const base = ext ? name.slice(0, -(ext.length+1)) : name;
    const keep = Math.max(8, max - (ext ? ext.length+4 : 3));
    return ext ? `${base.slice(0, keep)}….${ext}` : `${name.slice(0, max-1)}…`;
  }

  function ensureDocs(job){
    if (!job.documenti) job.documenti = { rilievi:[], disegni:[], preventivi:[], ordini:[] };
    return job.documenti;
  }

  const activePanel = () => qs(_selectors.panel);

  function activeJobId(){
    const p = activePanel();
    return Number(p?.dataset?.jobId) || null;
  }
  function activeJob(){
    const id = activeJobId(); if (!id) return null;
    return _getJobs().find(j => j.id === id) || null;
  }

  function getCat(){
    const h = qs(_selectors.hidden);
    if (h?.value) return h.value;
    const bar = qs(_selectors.bar);
    const btn = bar?.querySelector(".doc-cat-btn.active");
    return btn?.getAttribute("data-cat") || DEFAULT_CAT;
  }
  function setCat(cat){
    const h = qs(_selectors.hidden); if (h) h.value = cat;
    const bar = qs(_selectors.bar);
    if (bar){
      qsa(bar, ".doc-cat-btn").forEach(b => b.classList.remove("active"));
      const btn = bar.querySelector(`[data-cat="${cat}"]`);
      if (btn) btn.classList.add("active");
    }
  }

  function dataURLtoBlob(dataURL){
    const [meta, base64] = dataURL.split(",");
    const mime = (meta.match(/data:(.*?);/) || [,"application/octet-stream"])[1];
    const bin  = atob(base64);
    const len  = bin.length;
    const u8   = new Uint8Array(len);
    for (let i=0; i<len; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  function downloadFile(file){
    const a = document.createElement("a");
    if (file.data){
      const blob = dataURLtoBlob(file.data);
      const url  = URL.createObjectURL(blob);
      a.href = url;
      a.download = file.name || "documento";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 60_000);
    } else if (file.url){
      a.href = file.url;
      a.download = file.name || "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  /* ===== Render ===== */
  function render(job = activeJob(), cat = getCat()){
    const list = qs(_selectors.list);
    const bar  = qs(_selectors.bar);
    if (!job || !list || !bar) return;

    const docset = ensureDocs(job);

    // Tabs: contatori + active
    qsa(bar, ".doc-cat-btn").forEach(b=>{
      const key = b.getAttribute("data-cat");
      const n = (docset[key] || []).length;
      b.textContent = `${(LABELS[key] ?? key)} (${n})`;
      b.classList.toggle("active", key===cat);
    });

    const docs = docset[cat] || [];
    list.classList.add("doc-grid");

    if (!docs.length){
      list.innerHTML = `<div class="doc-card empty"><div class="doc-meta"><div class="sub">Nessun documento in <b>${cat}</b></div></div></div>`;
      return;
    }

    list.innerHTML = docs.map((f, i) => {
      const isImg = /^image\//.test(f.type||"");
      const isPdf = f.type==="application/pdf" || (/\.pdf$/i.test(f.name||""));
      const ext   = fileExt(f.name||"");
      const size  = f.size ? humanSize(f.size)
                 : (f.data ? humanSize(Math.round((f.data.length*3)/4)) : "—");

      const thumb = isImg
        ? `<img class="doc-thumb-img" src="${f.data||''}" loading="lazy" alt="">`
        : `<div class="doc-thumb-icon">${isPdf ? "📄" : "📎"}</div>`;

      const nameShort = shortenName(f.name || "Documento", 28);

      return `
        <div class="doc-card" title="${f.name||''}">
          <div class="thumb-wrap">
            ${thumb}
            ${ext ? `<span class="badge badge-ext">${ext}</span>` : ""}
          </div>
          <div class="doc-meta">
            <div class="doc-name" title="${f.name||''}">${nameShort}</div>
            <div class="sub">${f.type||''} · ${size}</div>
          </div>
          <div class="doc-actions-inline">
            <button class="doc-open" data-idx="${i}" title="Apri">🔗</button>
            <button class="doc-dl"   data-idx="${i}" title="Scarica">⬇︎</button>
            <button class="doc-del"  data-idx="${i}" title="Elimina">✖</button>
          </div>
        </div>
      `;
    }).join("");
  }

  /* ===== Handlers ===== */
  function wireTabs(){
    const bar = qs(_selectors.bar); if (!bar) return;
    bar.addEventListener("click", (e)=>{
      const btn = e.target.closest(".doc-cat-btn");
      if (!btn) return;
      e.preventDefault();
      const cat = btn.getAttribute("data-cat") || DEFAULT_CAT;
      setCat(cat);
      render();
    });
  }

  function wireOpenDeleteDownload(){
    const list = qs(_selectors.list); if (!list) return;
    list.addEventListener("click", (e)=>{
      const openBtn = e.target.closest(".doc-open");
      const delBtn  = e.target.closest(".doc-del");
      const dlBtn   = e.target.closest(".doc-dl");
      if (!openBtn && !delBtn && !dlBtn) return;

      const job = activeJob(); if (!job) return;
      const cat = getCat();
      const docs = ensureDocs(job)[cat];
      const idx  = Number((openBtn||delBtn||dlBtn).getAttribute("data-idx"));
      const file = docs[idx]; if (!file) return;

      if (openBtn){
        let url = file.url || null;
        if (!url && file.data){
          try{
            const blob = dataURLtoBlob(file.data);
            url = URL.createObjectURL(blob);
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          }catch(e){ console.warn("Blob conversion failed, fallback inline", e); }
        }
        if (url){ window.open(url, "_blank", "noopener"); return; }

        // Fallback inline viewer
        const isPdf = (file.type === "application/pdf") || /\.pdf$/i.test(file.name||"");
        const w = window.open("", "_blank", "noopener");
        if (w){
          w.document.title = file.name || "Documento";
          if (isPdf){
            w.document.body.innerHTML = `<style>html,body,iframe{margin:0;height:100%;width:100%;border:0}</style><iframe src="${file.data}" title="${file.name||''}"></iframe>`;
          }else{
            w.document.body.innerHTML = `<style>html,body{margin:0;background:#111;display:grid;place-items:center;height:100%}</style><img src="${file.data}" alt="${file.name||''}" style="max-width:100%;max-height:100%;object-fit:contain">`;
          }
        }
        return;
      }

      if (dlBtn){ downloadFile(file); return; }

      if (delBtn){
        if (!confirm("Eliminare questo documento?")) return;
        docs.splice(idx,1);
        try { _saveState(); } catch(e){ console.warn(e); }
        render(job, cat);
        return;
      }
    });
  }

  function wireUpload(){
    const input = qs(_selectors.input);
    if (!input) return;

    function fileToDataURL(file){
      return new Promise((res, rej)=>{
        const r = new FileReader();
        r.onload  = () => res(r.result);
        r.onerror = () => rej(new Error("FileReader error"));
        r.readAsDataURL(file);
      });
    }

    input.addEventListener("change", async (e)=>{
      const files = Array.from(e.target.files || []);
      if (!files.length) return;

      const job = activeJob(); if (!job) return;
      const cat = getCat();
      const docs = ensureDocs(job)[cat];

      for (const f of files){
        if (!ALLOWED.includes(f.type)){ alert("Formato non supportato: "+f.type); continue; }
        if (f.size > MAX_EACH){
          docs.push({ name:f.name, type:f.type, size:f.size, note:"File grande: usa ‘Aggiungi link’" });
          try { _saveState(); } catch(e){ console.warn(e); }
          continue;
        }
        let dataUrl;
        try { dataUrl = await fileToDataURL(f); }
        catch { alert("Errore lettura: "+f.name); continue; }

        docs.push({ name:f.name, type:f.type, size:f.size, data:dataUrl });
        try { _saveState(); }
        catch(e){
          console.warn("Quota piena, salvo come nota:", e);
          docs.pop();
          docs.push({ name:f.name, type:f.type, size:f.size, note:"Spazio esaurito: usa ‘Aggiungi link’" });
          try { _saveState(); } catch(_) {}
        }
      }
      render(job, cat);
      input.value = "";
    });
  }

  function wireDnD(){
    const list = qs(_selectors.list); if (!list) return;
    list.addEventListener("dragover", (e)=>{ e.preventDefault(); list.classList.add("drag"); });
    list.addEventListener("dragleave",(e)=>{ list.classList.remove("drag"); });
    list.addEventListener("drop", async (e)=>{
      e.preventDefault(); list.classList.remove("drag");
      const file = e.dataTransfer?.files?.[0]; if (!file) return;
      const input = qs(_selectors.input);
      if (input){
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("change"));
      }
    });
  }

  /* ===== API Pubblica ===== */
  window.Documents = {
    /**
     * Inizializza il modulo Documenti.
     * @param {{saveState:Function, getJobs:Function, selectors?:Object}} cfg
     */
    init(cfg = {}){
      _saveState = cfg.saveState || _saveState;
      _getJobs   = cfg.getJobs   || _getJobs;
      _selectors = Object.assign({}, _selectors, cfg.selectors || {});
      if (_wired) return;
      wireTabs(); wireOpenDeleteDownload(); wireUpload(); wireDnD();
      _wired = true;
    },

    /**
     * Da chiamare quando apri il pannello Dettagli di una commessa.
     */
    onDetailOpen(job){
      const panel = activePanel();
      if (panel) panel.dataset.jobId = job.id;
      const cat = getCat() || DEFAULT_CAT;
      setCat(cat);
      render(job, cat);
    },

    /** (opzionale) render manuale */
    render
  };

})();
