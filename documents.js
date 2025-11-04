/* -------------------------------------------------------------------------- */
/*  IdeaLegno · Document manager (multi-mount)                               */
/* -------------------------------------------------------------------------- */

(() => {
  const DEFAULTS = {
    categories: {
      rilievi: "Foto / Rilievi",
      disegni: "Disegni",
      preventivi: "Preventivi / Fatture",
      ordini: "Ordini",
    },
  maxFileSize: 5 * 1024 * 1024,
  };

  const state = {
    root: null,
    docset: null,
    persist: () => {},
    categories: { ...DEFAULTS.categories },
    maxFileSize: DEFAULTS.maxFileSize,
    activeCategory: null,
  };

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function shortName(name = "", max = 26) {
    if (name.length <= max) return name;
    const dot = name.lastIndexOf(".");
    if (dot === -1) return name.slice(0, max - 1) + "…";
    const ext = name.slice(dot);
    const base = name.slice(0, dot);
    return `${base.slice(0, max - ext.length - 3)}…${ext}`;
  }

  function formatSize(bytes) {
    if (bytes == null || Number.isNaN(bytes)) return "-";
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let size = bytes;
    let unit = -1;
    do {
      size /= 1024;
      unit += 1;
    } while (size >= 1024 && unit < units.length - 1);
    return `${size.toFixed(1)} ${units[unit]}`;
  }

  function approximateDataUrlSize(dataUrl) {
    if (!dataUrl) return null;
    const base64 = dataUrl.split(",")[1];
    if (!base64) return null;
    return Math.round((base64.length * 3) / 4);
  }

  function getExtension(name = "") {
    const match = /\.([a-z0-9]+)$/i.exec(name.trim());
    return match ? match[1].toLowerCase() : "";
  }

  function ensureDocset() {
    if (!state.docset) return null;
    Object.keys(state.categories).forEach((key) => {
      if (!Array.isArray(state.docset[key])) state.docset[key] = [];
    });
    return state.docset;
  }

  function ensureActiveCategory() {
    const keys = Object.keys(state.categories);
    if (!keys.length) return;
    const hidden = state.root?.querySelector("#docActiveCat");
    if (hidden?.value && keys.includes(hidden.value)) {
      state.activeCategory = hidden.value;
    } else {
      state.activeCategory = keys[0];
      if (hidden) hidden.value = keys[0];
    }
  }

  function renderAll() {
    renderCategories();
    renderList();
  }

  function renderCategories() {
    const bar = state.root?.querySelector("#docCategoryBar");
    if (!bar) return;

    const docset = ensureDocset();
    bar.innerHTML = Object.entries(state.categories)
      .map(([key, label]) => {
        const count = docset ? docset[key]?.length || 0 : 0;
        return `
          <button type="button"
                  class="doc-cat-btn ${state.activeCategory === key ? "active" : ""}"
                  data-cat="${key}">
            ${label} (${count})
          </button>`;
      })
      .join("");
  }

  function renderList() {
    const list = state.root?.querySelector("#docList");
    if (!list) return;

    const docset = ensureDocset();
    const docs = docset?.[state.activeCategory] || [];

    if (!docs.length) {
      list.innerHTML = `
        <div class="doc-card empty">
          Nessun documento nella categoria
          <strong>${escapeHtml(state.categories[state.activeCategory] || state.activeCategory)}</strong>.
        </div>`;
      return;
    }

    list.innerHTML = docs
      .map((file, index) => buildCard(file, index))
      .join("");
  }

  function buildCard(file, index) {
    const ext = getExtension(file.name || "");
    const size =
      file.size != null ? file.size : approximateDataUrlSize(file.data);
    const humanSize = formatSize(size);
    const safeName = escapeHtml(file.name || "Documento");
    const short = escapeHtml(shortName(file.name || "Documento"));
    const safeType = escapeHtml(file.type || "");

    return `
      <div class="doc-card" data-index="${index}">
        <div class="thumb-wrap">
          ${renderThumb(file, ext)}
          ${ext ? `<span class="badge-ext">${escapeHtml(ext)}</span>` : ""}
        </div>
        <div class="doc-meta">
          <div class="doc-name" title="${safeName}">${short}</div>
          <div class="sub">${safeType ? `${safeType} · ${humanSize}` : humanSize}</div>
          ${file.note ? `<div class="doc-note">${escapeHtml(file.note)}</div>` : ""}
        </div>
        <div class="doc-actions-inline">
          <button type="button" class="doc-open">Apri</button>
          <button type="button" class="doc-download">Download</button>
          <button type="button" class="doc-rename">Rinomina</button>
          <button type="button" class="doc-delete">Elimina</button>
        </div>
      </div>
    `;
  }

  function renderThumb(file, ext) {
    const isImg =
      /^image\//.test(file.type || "") ||
      ["jpg", "jpeg", "png"].includes(ext);
    const isPdf = file.type === "application/pdf" || ext === "pdf";

    if (isImg && file.data) {
      return `<img class="doc-thumb-img" src="${file.data}" alt="">`;
    }

    const label = isPdf ? "PDF" : ext ? ext.toUpperCase() : "FILE";
    return `<div class="doc-thumb-icon">${escapeHtml(label)}</div>`;
  }

  function addFiles(files) {
    const docset = ensureDocset();
    if (!docset) return;

    const accepted = [];
    const rejected = [];

    Array.from(files).forEach((file) => {
      if (!validateFile(file)) {
        rejected.push(file.name || "File senza nome");
      } else {
        accepted.push(file);
      }
    });

    if (!accepted.length) {
      if (rejected.length) {
        alert("Formato non supportato o file troppo grande:\n" + rejected.join("\n"));
      }
      return;
    }

    processFilesSequentially(accepted, docset[state.activeCategory]);
  }

  function validateFile(file) {
    if (!file) return false;
    const ext = getExtension(file.name || "");
    const mime = file.type;
    const allowedExt = ["pdf", "jpg", "jpeg", "png"];
    const allowedMime = ["application/pdf", "image/jpeg", "image/png"];
    const okType = allowedExt.includes(ext) || allowedMime.includes(mime);
    const okSize = file.size == null || file.size <= state.maxFileSize;
    return okType && okSize;
  }

  function processFilesSequentially(files, target) {
    if (!files.length) {
      persistAndRender();
      return;
    }

    const [head, ...rest] = files;

    readFileData(head)
      .then((dataUrl) => {
        target.push({
          name: head.name,
          type: head.type,
          size: head.size,
          data: dataUrl,
        });
      })
      .catch(() => {
        target.push({
          name: head.name,
          type: head.type,
          size: head.size,
          note: "Errore durante la lettura del file.",
        });
      })
      .finally(() => {
        processFilesSequentially(rest, target);
      });
  }

  function readFileData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("FileReader error"));
      reader.readAsDataURL(file);
    });
  }

  function persistAndRender() {
    try {
      state.persist?.();
    } catch (error) {
      console.warn("Documents.persist error:", error);
    }
    renderAll();
  }

  function openFile(file) {
    if (!file) return;
    let url = file.url || null;
    let revoke = null;

    if (!url && file.data) {
      const blob = dataURLtoBlob(file.data);
      if (blob) {
        url = URL.createObjectURL(blob);
        revoke = url;
      }
    }

    if (url) {
      const win = window.open(url, "_blank", "noopener");
      if (!win && revoke) {
        URL.revokeObjectURL(revoke);
      } else if (revoke) {
        setTimeout(() => URL.revokeObjectURL(revoke), 60000);
      }
      return;
    }

    if (!file.data) return;

    const popup = window.open("", "_blank", "noopener");
    if (!popup) return;

    popup.document.title = file.name || "Documento";
    if (/\.pdf$/i.test(file.name || "") || file.type === "application/pdf") {
      popup.document.body.innerHTML =
        `<style>html,body,iframe{margin:0;height:100%;width:100%;border:0}</style>` +
        `<iframe src="${file.data}" title="${escapeHtml(file.name || "")}"></iframe>`;
    } else {
      popup.document.body.innerHTML =
        `<style>html,body{margin:0;background:#111;display:grid;place-items:center;height:100%}</style>` +
        `<img src="${file.data}" alt="" style="max-width:100%;max-height:100%;object-fit:contain">`;
    }
  }

  function downloadFile(file) {
    if (!file) return;
    let url = file.url || null;
    let revoke = null;

    if (!url && file.data) {
      const blob = dataURLtoBlob(file.data);
      if (blob) {
        url = URL.createObjectURL(blob);
        revoke = url;
      }
    }

    if (!url) return;

    const a = document.createElement("a");
    a.href = url;
    a.download = file.name || "documento";
    document.body.appendChild(a);
    a.click();
    a.remove();

    if (revoke) {
      setTimeout(() => URL.revokeObjectURL(revoke), 60000);
    }
  }

  function renameFile(file) {
    const newName = window.prompt("Nuovo nome file:", file.name || "Documento");
    if (newName == null) return;
    file.name = newName.trim() || file.name || "Documento";
    persistAndRender();
  }

  function deleteFile(index) {
    const docset = ensureDocset();
    if (!docset) return;
    docset[state.activeCategory].splice(index, 1);
    persistAndRender();
  }

  function dataURLtoBlob(dataURL) {
    try {
      const [meta, content] = dataURL.split(",");
      const mimeMatch = /data:(.*?);/.exec(meta);
      const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
      const binary = atob(content || "");
      const len = binary.length;
      const buffer = new Uint8Array(len);
      for (let i = 0; i < len; i += 1) buffer[i] = binary.charCodeAt(i);
      return new Blob([buffer], { type: mime });
    } catch {
      return null;
    }
  }

  function bindEvents() {
    const bar = state.root?.querySelector("#docCategoryBar");
    const uploadInput = state.root?.querySelector("#docUploadInput");
    const list = state.root?.querySelector("#docList");

    bar?.addEventListener("click", (event) => {
      const btn = event.target.closest(".doc-cat-btn");
      if (!btn) return;
      state.activeCategory = btn.dataset.cat;
      const hidden = state.root.querySelector("#docActiveCat");
      if (hidden) hidden.value = state.activeCategory;
      renderAll();
    });

    uploadInput?.addEventListener("change", (event) => {
      addFiles(event.target.files || []);
      event.target.value = "";
    });

    list?.addEventListener("click", (event) => {
      const card = event.target.closest(".doc-card");
      if (!card) return;
      const index = Number(card.dataset.index);
      if (Number.isNaN(index)) return;

      const docset = ensureDocset();
      if (!docset) return;
      const file = docset[state.activeCategory]?.[index];
      if (!file) return;

      if (event.target.classList.contains("doc-open")) {
        openFile(file);
        return;
      }
      if (event.target.classList.contains("doc-download")) {
        downloadFile(file);
        return;
      }
      if (event.target.classList.contains("doc-rename")) {
        renameFile(file);
        return;
      }
      if (event.target.classList.contains("doc-delete")) {
        if (!window.confirm("Eliminare questo documento?")) return;
        deleteFile(index);
      }
    });

    list?.addEventListener("dragover", (event) => {
      event.preventDefault();
      list.classList.add("drag");
    });

    list?.addEventListener("dragleave", () => {
      list.classList.remove("drag");
    });

    list?.addEventListener("drop", (event) => {
      event.preventDefault();
      list.classList.remove("drag");
      addFiles(event.dataTransfer?.files || []);
    });
  }

  const Documents = {
    init(options = {}) {
      if (options.categories) {
        DEFAULTS.categories = { ...DEFAULTS.categories, ...options.categories };
      }
      if (options.maxFileSize) DEFAULTS.maxFileSize = options.maxFileSize;
    },

    mount({ root, docset, persist, categories, maxFileSize }) {
      state.root = root || null;
      state.docset = docset || {};
      state.persist =
        typeof persist === "function"
          ? persist
          : () => {};

      state.categories = categories
        ? { ...categories }
        : { ...DEFAULTS.categories };

      state.maxFileSize = maxFileSize || DEFAULTS.maxFileSize;

      ensureActiveCategory();
      renderAll();
      bindEvents();
    },
  };

  window.Documents = Documents;
})();