/* -------------------------------------------------------------------------- */
/*  IdeaLegnoApp – Modulo Documenti                                           */
/*  Versione 0.6.1 (documents2.js)                                            */
/*  - Persistenza delegata al main con compatibilità legacy                  */
/*  - Upload/drag&drop robusti (limiti, note, alert)                          */
/*  - Render sicuro con escaping, contatori coerenti, markup ordinato         */
/* -------------------------------------------------------------------------- */

(() => {
  "use strict";

  /* ------------------------------------------------------------------------ */
  /* 1. Configurazione e dipendenze                                           */
  /* ------------------------------------------------------------------------ */

  const LABELS = {
    rilievi: "Rilievi/Foto",
    disegni: "Disegni",
    preventivi: "Preventivi",
    ordini: "Ordini",
  };

  const ALLOWED_EXT = new Set(["pdf", "jpg", "jpeg", "png"]);
  const MIME_BY_EXT = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  };
  const ALLOWED_MIME = new Set(Object.values(MIME_BY_EXT));
  const MAX_FILE_SIZE = 1.8 * 1024 * 1024; // ~1.8MB
  const DEFAULT_CATEGORY = "rilievi";

  let persistJobHook = () => {};
  let getJobsHook = () => [];
  let selectors = {
    panel: "#detailBody",
    bar: "#docCategoryBar",
    hidden: "#docActiveCat",
    input: "#docUploadInput, #docFile",
    list: "#docList",
  };

  let wired = false;

  /* ------------------------------------------------------------------------ */
  /* 2. Utility                                                               */
  /* ------------------------------------------------------------------------ */

  const qs = (sel, scope = document) => scope.querySelector(sel);
  const qsa = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));
  const toArray = (value) =>
    Array.isArray(value) ? value : Array.from(value || []);

  function escapeHTML(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatSize(bytes) {
    if (bytes == null || Number.isNaN(bytes)) return "-";
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = -1;
    do {
      size /= 1024;
      unitIndex += 1;
    } while (size >= 1024 && unitIndex < units.length - 1);
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  function approximateDataUrlSize(dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string") return null;
    const base64 = dataUrl.split(",")[1];
    if (!base64) return null;
    return Math.round((base64.length * 3) / 4);
  }

  function getExtension(name = "") {
    const match = /\.[a-z0-9]+$/i.exec(name.trim());
    return match ? match[0].slice(1).toLowerCase() : "";
  }

  function shortenName(name = "", max = 28) {
    if (name.length <= max) return name;
    const ext = getExtension(name);
    const base = ext ? name.slice(0, -(ext.length + 1)) : name;
    const keep = Math.max(8, max - (ext ? ext.length + 4 : 3));
    return ext ? `${base.slice(0, keep)}...${ext}` : `${name.slice(0, max - 3)}...`;
  }

  function ensureDocumentContainer(job) {
    if (!job.documenti) {
      job.documenti = {
        rilievi: [],
        disegni: [],
        preventivi: [],
        ordini: [],
      };
    }
    return job.documenti;
  }

  function getActivePanel() {
    return qs(selectors.panel);
  }

  function getActiveJobId() {
    const panel = getActivePanel();
    const rawId = panel?.dataset?.jobId;
    return rawId ? Number(rawId) : null;
  }

  function getActiveJob() {
    const id = getActiveJobId();
    if (!id) return null;
    return getJobsHook().find((job) => job.id === id) || null;
  }

  function getCurrentCategory() {
    const hidden = qs(selectors.hidden);
    if (hidden?.value) return hidden.value;
    const bar = qs(selectors.bar);
    const activeBtn = bar?.querySelector(".doc-cat-btn.active");
    return activeBtn?.getAttribute("data-cat") || DEFAULT_CATEGORY;
  }

  function setCurrentCategory(category) {
    const hidden = qs(selectors.hidden);
    if (hidden) hidden.value = category;
  }

  function persist(job) {
    try {
      persistJobHook(job);
    } catch (error) {
      console.warn("Documents.persist error:", error);
    }
  }

  function buildThumbMarkup(file, extension) {
    const isImage =
      /^image\//.test(file.type || "") ||
      (extension && ["jpg", "jpeg", "png"].includes(extension));
    const isPdf =
      file.type === "application/pdf" || extension === "pdf";

    if (isImage && file.data) {
      return `<img class="doc-thumb-img" src="${file.data}" alt="" loading="lazy">`;
    }

    const label = isPdf
      ? "PDF"
      : extension
      ? extension.toUpperCase()
      : "FILE";
    return `<div class="doc-thumb-icon">${escapeHTML(label)}</div>`;
  }

  function buildDocCard(file, index) {
    const extension = getExtension(file.name || "");
    const size =
      file.size != null
        ? file.size
        : approximateDataUrlSize(file.data);
    const formattedSize = formatSize(size);
    const safeName = escapeHTML(file.name || "Documento");
    const shortName = escapeHTML(shortenName(file.name || "Documento"));
    const safeType = escapeHTML(file.type || "");
    const noteMarkup = file.note
      ? `<div class="doc-note">${escapeHTML(file.note)}</div>`
      : "";

    return `
      <div class="doc-card" title="${safeName}">
        <div class="thumb-wrap">
          ${buildThumbMarkup(file, extension)}
          ${
            extension
              ? `<span class="badge badge-ext">${escapeHTML(extension)}</span>`
              : ""
          }
        </div>
        <div class="doc-meta">
          <div class="doc-name" title="${safeName}">${shortName}</div>
          <div class="sub">${
            safeType ? `${safeType} · ${formattedSize}` : formattedSize
          }</div>
          ${noteMarkup}
        </div>
        <div class="doc-actions-inline">
          <button type="button" class="doc-open" data-idx="${index}" title="Apri">Apri</button>
          <button type="button" class="doc-download" data-idx="${index}" title="Scarica">Download</button>
          <button type="button" class="doc-delete" data-idx="${index}" title="Elimina">Elimina</button>
        </div>
      </div>
    `;
  }

  function dataURLtoBlob(dataURL) {
    const parts = dataURL.split(",");
    if (parts.length < 2) return null;
    const mimeMatch = /data:(.*?);/.exec(parts[0]);
    const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
    const binary = atob(parts[1]);
    const len = binary.length;
    const buffer = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      buffer[i] = binary.charCodeAt(i);
    }
    return new Blob([buffer], { type: mime });
  }

  function openDocument(file) {
    let url = file.url || null;
    let revokeUrl = null;

    if (!url && file.data) {
      const blob = dataURLtoBlob(file.data);
      if (blob) {
        url = URL.createObjectURL(blob);
        revokeUrl = url;
      }
    }

    if (url) {
      const win = window.open(url, "_blank", "noopener");
      if (!win && revokeUrl) {
        URL.revokeObjectURL(revokeUrl);
      } else if (revokeUrl) {
        setTimeout(() => URL.revokeObjectURL(revokeUrl), 60_000);
      }
      return;
    }

    if (!file.data) return;

    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    const popup = window.open("", "_blank", "noopener");
    if (!popup) return;

    popup.document.title = file.name || "Documento";
    if (isPdf) {
      popup.document.body.innerHTML =
        `<style>html,body,iframe{margin:0;height:100%;width:100%;border:0}</style>` +
        `<iframe src="${file.data}" title="${escapeHTML(file.name || "")}"></iframe>`;
    } else {
      popup.document.body.innerHTML =
        `<style>html,body{margin:0;background:#111;display:grid;place-items:center;height:100%}</style>` +
        `<img src="${file.data}" alt="${escapeHTML(file.name || "")}" style="max-width:100%;max-height:100%;object-fit:contain">`;
    }
  }

  function downloadDocument(file) {
    let url = file.url || null;
    let revokeUrl = null;

    if (!url && file.data) {
      const blob = dataURLtoBlob(file.data);
      if (blob) {
        url = URL.createObjectURL(blob);
        revokeUrl = url;
      }
    }

    if (!url) return;

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name || "documento";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    if (revokeUrl) {
      setTimeout(() => URL.revokeObjectURL(revokeUrl), 60_000);
    }
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("FileReader error"));
      reader.readAsDataURL(file);
    });
  }

  async function addFilesToCategory(job, category, files) {
    if (!files.length) return;

    const docset = ensureDocumentContainer(job);
    const docs = docset[category] || (docset[category] = []);
    let changed = false;
    const messages = [];

    for (const file of files) {
      const extension = getExtension(file.name || "");
      const normalizedExt = extension.toLowerCase();
      const inferredMime = MIME_BY_EXT[normalizedExt] || file.type || "";

      const allowed =
        (inferredMime && ALLOWED_MIME.has(inferredMime)) ||
        ALLOWED_EXT.has(normalizedExt);

      if (!allowed) {
        messages.push(`Formato non supportato: ${file.name || "sconosciuto"}.`);
        continue;
      }

      const size = file.size != null ? file.size : null;
      if (size != null && size > MAX_FILE_SIZE) {
        docs.push({
          name: file.name,
          type: inferredMime,
          size,
          note: 'File oltre il limite (1.8MB). Usa "Aggiungi link".',
          oversize: true,
        });
        changed = true;
        continue;
      }

      try {
        const dataUrl = await fileToDataURL(file);
        docs.push({
          name: file.name,
          type: inferredMime,
          size,
          data: dataUrl,
        });
        changed = true;
      } catch (error) {
        console.warn("Document upload error:", error);
        messages.push(`Errore nella lettura di ${file.name || "sconosciuto"}.`);
      }
    }

    if (changed) {
      persist(job);
      render(job, category);
    }

    if (messages.length) {
      alert(messages.join("\n"));
    }
  }

  /* ------------------------------------------------------------------------ */
  /* 3. Render                                                                */
  /* ------------------------------------------------------------------------ */

  function render(job = getActiveJob(), category = getCurrentCategory()) {
    const list = qs(selectors.list);
    const bar = qs(selectors.bar);

    if (!list || !bar) return;

    if (!job) {
      list.classList.add("doc-grid");
      list.innerHTML = `
        <div class="doc-card empty">
          <div class="doc-meta">
            <div class="sub">Seleziona una commessa per vedere i documenti.</div>
          </div>
        </div>
      `;
      qsa(".doc-cat-btn", bar).forEach((btn) => btn.classList.remove("active"));
      return;
    }

    const docset = ensureDocumentContainer(job);
    const safeCategory = docset[category] ? category : DEFAULT_CATEGORY;

    setCurrentCategory(safeCategory);

    qsa(".doc-cat-btn", bar).forEach((btn) => {
      const key = btn.getAttribute("data-cat");
      const count = (docset[key] || []).length;
      btn.textContent = `${LABELS[key] || key} (${count})`;
      btn.classList.toggle("active", key === safeCategory);
    });

    const docs = docset[safeCategory] || [];
    list.classList.add("doc-grid");
    list.classList.remove("drag");

    if (!docs.length) {
      list.innerHTML = `
        <div class="doc-card empty">
          <div class="doc-meta">
            <div class="sub">
              Nessun documento in <strong>${escapeHTML(LABELS[safeCategory] || safeCategory)}</strong>
            </div>
          </div>
        </div>
      `;
      return;
    }

    list.innerHTML = docs
      .map((file, index) => buildDocCard(file, index))
      .join("\n");
  }

  /* ------------------------------------------------------------------------ */
  /* 4. Event wiring                                                          */
  /* ------------------------------------------------------------------------ */

  function wireTabs() {
    const bar = qs(selectors.bar);
    if (!bar) return;

    bar.addEventListener("click", (event) => {
      const btn = event.target.closest(".doc-cat-btn");
      if (!btn) return;
      event.preventDefault();

      const category = btn.getAttribute("data-cat") || DEFAULT_CATEGORY;
      const job = getActiveJob();
      if (!job) return;

      setCurrentCategory(category);
      render(job, category);
    });
  }

  function wireOpenDeleteDownload() {
    const list = qs(selectors.list);
    if (!list) return;

    list.addEventListener("click", (event) => {
      const openBtn = event.target.closest(".doc-open");
      const downloadBtn = event.target.closest(".doc-download");
      const deleteBtn = event.target.closest(".doc-delete");
      const actionBtn = openBtn || downloadBtn || deleteBtn;
      if (!actionBtn) return;

      const index = Number(actionBtn.getAttribute("data-idx"));
      if (Number.isNaN(index)) return;

      const job = getActiveJob();
      if (!job) return;

      const category = getCurrentCategory();
      const docs = ensureDocumentContainer(job)[category];
      const file = docs?.[index];
      if (!file) return;

      if (openBtn) {
        openDocument(file);
        return;
      }

      if (downloadBtn) {
        downloadDocument(file);
        return;
      }

      if (deleteBtn) {
        if (!window.confirm("Eliminare questo documento?")) return;
        docs.splice(index, 1);
        persist(job);
        render(job, category);
      }
    });
  }

  function wireUpload() {
    const inputs = qsa(selectors.input);
    if (!inputs.length) return;

    inputs.forEach((input) => {
      input.addEventListener("change", async (event) => {
        const files = toArray(event.target.files);
        if (!files.length) return;

        const job = getActiveJob();
        if (!job) return;

        const category = getCurrentCategory();
        await addFilesToCategory(job, category, files);
        input.value = "";
      });
    });
  }

  function wireDnD() {
    const list = qs(selectors.list);
    if (!list) return;

    list.addEventListener("dragover", (event) => {
      event.preventDefault();
      list.classList.add("drag");
    });

    list.addEventListener("dragleave", () => {
      list.classList.remove("drag");
    });

    list.addEventListener("drop", async (event) => {
      event.preventDefault();
      list.classList.remove("drag");

      const files = toArray(event.dataTransfer?.files);
      if (!files.length) return;

      const job = getActiveJob();
      if (!job) return;

      const category = getCurrentCategory();
      await addFilesToCategory(job, category, files);
    });
  }

  /* ------------------------------------------------------------------------ */
  /* 5. API pubblica                                                          */
  /* ------------------------------------------------------------------------ */

  window.Documents = {
    /**
     * Inizializza il modulo Documenti.
     * @param {{persist?: Function, saveState?: Function, getJobs?: Function, selectors?: Object}} config
     */
    init(config = {}) {
      persistJobHook = config.persist || config.saveState || persistJobHook;
      getJobsHook = config.getJobs || getJobsHook;
      selectors = Object.assign({}, selectors, config.selectors || {});

      if (wired) return;

      wireTabs();
      wireOpenDeleteDownload();
      wireUpload();
      wireDnD();
      wired = true;
    },

    /**
     * Da chiamare quando apri il pannello Dettagli di una commessa.
     * @param {Object} job
     */
    onDetailOpen(job) {
      const panel = getActivePanel();
      if (panel) panel.dataset.jobId = job?.id ?? "";
      const category = getCurrentCategory() || DEFAULT_CATEGORY;
      setCurrentCategory(category);
      render(job, category);
    },

    /**
     * Render manuale opzionale.
     * @param {Object} job
     * @param {string} category
     */
    render,
  };
})();