// life log admin — edits content/content.json + uploads images via GitHub API.
// No backend; PAT lives in localStorage. Commits atomically to main, mirrors to pages-release.

const REPO_OWNER = "jackylailai";
const REPO_NAME = "life";
const SOURCE_BRANCH = "main";
const RELEASE_BRANCH = "pages-release";
const CONTENT_PATH = "content/content.json";
const ASSETS_DIR = "assets";
const TOKEN_KEY = "life-admin-token";
const MAX_IMAGE_WIDTH = 2000;
const JPEG_QUALITY = 0.85;

// ---------- schema (mirrors content.json) ----------
const SCHEMA = [
  { section: "meta", title: "Meta", fields: [
    { path: "meta.lang", label: "Language", type: "text" },
    { path: "meta.title", label: "Site title", type: "text" },
    { path: "meta.description", label: "Meta description", type: "textarea" },
    { path: "meta.ogTitle", label: "OG title", type: "text" },
    { path: "meta.ogDescription", label: "OG description", type: "textarea" },
  ]},
  { section: "header", title: "Header", fields: [
    { path: "header.brand", label: "Brand", type: "text" },
    { path: "header.tagline", label: "Tagline", type: "text" },
    { path: "header.links", label: "Nav links", type: "array-object", item: [
      { key: "href", label: "href", type: "text" },
      { key: "label", label: "label", type: "text" },
    ]},
    { path: "header.back.href", label: "Back link URL", type: "text" },
    { path: "header.back.label", label: "Back link label", type: "text" },
  ]},
  { section: "hero", title: "Hero", fields: [
    { path: "hero.eyebrow", label: "Eyebrow", type: "text" },
    { path: "hero.title", label: "Title (supports **bold** ==accent== *italic*)", type: "text" },
    { path: "hero.lead", label: "Lead", type: "textarea" },
    { path: "hero.meta", label: "Meta line", type: "text" },
  ]},
  { section: "now", title: "Now", fields: [
    { path: "now.kicker", label: "Kicker", type: "text" },
    { path: "now.title", label: "Title", type: "text" },
    { path: "now.lines", label: "Lines", type: "array-string" },
    { path: "now.updated", label: "Updated line (use {year} token)", type: "text" },
  ]},
  { section: "journal", title: "Journal", fields: [
    { path: "journal.kicker", label: "Kicker", type: "text" },
    { path: "journal.title", label: "Title", type: "text" },
    { path: "journal.intro", label: "Intro", type: "textarea" },
    { path: "journal.entries", label: "Entries", type: "array-object", item: [
      { key: "date", label: "Date", type: "text" },
      { key: "title", label: "Title", type: "text" },
      { key: "excerpt", label: "Excerpt", type: "textarea" },
    ]},
  ]},
  { section: "frames", title: "Frames", fields: [
    { path: "frames.kicker", label: "Kicker", type: "text" },
    { path: "frames.title", label: "Title", type: "text" },
    { path: "frames.intro", label: "Intro", type: "textarea" },
    { path: "frames.captions", label: "Captions", type: "array-string" },
  ]},
  { section: "about", title: "About", fields: [
    { path: "about.kicker", label: "Kicker", type: "text" },
    { path: "about.title", label: "Title", type: "text" },
    { path: "about.paragraphs", label: "Paragraphs", type: "array-string" },
    { path: "about.linkHelper", label: "Link helper", type: "text" },
    { path: "about.linkUrl", label: "Link URL", type: "text" },
  ]},
  { section: "footer", title: "Footer", fields: [
    { path: "footer.copy", label: "Copy (use {year} token)", type: "text" },
  ]},
];

// ---------- state ----------
let token = localStorage.getItem(TOKEN_KEY) || "";
let content = null;
const pendingImages = []; // {filename, blob, base64, dataUrl, originalSize}

const $ = (id) => document.getElementById(id);
const setStatus = (text, state = "idle") => {
  const el = $("status");
  el.textContent = text;
  el.dataset.state = state;
};

// ---------- path helpers ----------
const getPath = (obj, path) =>
  path.split(".").reduce((cur, k) => (cur == null ? undefined : cur[k]), obj);
const setPath = (obj, path, value) => {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
};

// ---------- token UI ----------
const showPanel = (id) => {
  ["token-panel", "editor-panel"].forEach((pid) => $(pid).hidden = pid !== id);
};

const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  token = "";
  $("clear-token-btn").hidden = true;
  showPanel("token-panel");
  setStatus("token cleared", "idle");
};

$("clear-token-btn").addEventListener("click", clearToken);

$("token-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = $("token-input").value.trim();
  if (!value) return;
  setStatus("verifying…", "loading");
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${value}`, "Accept": "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`token check failed: HTTP ${res.status}`);
    const me = await res.json();
    localStorage.setItem(TOKEN_KEY, value);
    token = value;
    $("clear-token-btn").hidden = false;
    setStatus(`signed in as ${me.login}`, "ok");
    await loadContent();
  } catch (err) {
    setStatus(err.message, "error");
  }
});

// ---------- form rendering ----------
const elFor = (path) => document.querySelector(`[data-path="${path}"]`);

const renderTextInput = (path, value, type = "text") => {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const isArea = type === "textarea";
  wrap.innerHTML = `<span></span>${isArea ? `<textarea data-path="${path}"></textarea>` : `<input type="text" data-path="${path}" />`}`;
  wrap.querySelector(isArea ? "textarea" : "input").value = value ?? "";
  return wrap;
};

const renderArrayString = (path, items) => {
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.innerHTML = `<span></span>`;
  const list = document.createElement("ul");
  list.className = "array-list";
  list.dataset.path = path;
  list.dataset.kind = "array-string";
  wrap.appendChild(list);

  const addRow = (value = "") => {
    const li = document.createElement("li");
    li.className = "array-row";
    li.innerHTML = `<input type="text" /><button type="button" class="row-btn" data-action="remove">×</button>`;
    li.querySelector("input").value = value;
    li.querySelector('[data-action="remove"]').addEventListener("click", () => li.remove());
    list.appendChild(li);
  };
  (items || []).forEach(addRow);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "row-btn";
  addBtn.textContent = "+ add";
  addBtn.addEventListener("click", () => addRow());
  wrap.appendChild(addBtn);

  return wrap;
};

const renderArrayObject = (path, items, itemSchema) => {
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.innerHTML = `<span></span>`;
  const list = document.createElement("ul");
  list.className = "object-list";
  list.dataset.path = path;
  list.dataset.kind = "array-object";
  wrap.appendChild(list);

  const addRow = (obj = {}) => {
    const li = document.createElement("li");
    li.className = "object-row";
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "row-btn";
    removeBtn.textContent = "× remove";
    removeBtn.addEventListener("click", () => li.remove());
    li.appendChild(removeBtn);

    itemSchema.forEach((spec) => {
      const isArea = spec.type === "textarea";
      const field = document.createElement("label");
      field.className = "field";
      field.innerHTML = `<span>${spec.label}</span>${isArea ? `<textarea data-key="${spec.key}"></textarea>` : `<input type="text" data-key="${spec.key}" />`}`;
      field.querySelector(isArea ? "textarea" : "input").value = obj[spec.key] ?? "";
      li.appendChild(field);
    });
    list.appendChild(li);
  };
  (items || []).forEach(addRow);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "row-btn";
  addBtn.textContent = "+ add";
  addBtn.addEventListener("click", () => addRow());
  wrap.appendChild(addBtn);

  return wrap;
};

const renderField = (field, sourceContent) => {
  const value = getPath(sourceContent, field.path);
  let node;
  if (field.type === "text" || field.type === "textarea") {
    node = renderTextInput(field.path, value, field.type);
  } else if (field.type === "array-string") {
    node = renderArrayString(field.path, value);
  } else if (field.type === "array-object") {
    node = renderArrayObject(field.path, value, field.item);
  }
  if (node) {
    const labelEl = node.querySelector("span");
    if (labelEl) labelEl.textContent = field.label;
  }
  return node;
};

const renderForm = (sourceContent) => {
  const form = $("content-form");
  form.replaceChildren();
  SCHEMA.forEach((section) => {
    const sec = document.createElement("section");
    sec.className = "section";
    const h = document.createElement("h3");
    h.className = "section__title";
    h.textContent = section.title;
    sec.appendChild(h);
    section.fields.forEach((field) => sec.appendChild(renderField(field, sourceContent)));
    form.appendChild(sec);
  });
};

// ---------- form -> content object ----------
const collectForm = () => {
  const next = structuredClone(content);

  document.querySelectorAll('input[data-path], textarea[data-path]').forEach((el) => {
    if (el.tagName === "INPUT" && el.type !== "text") return;
    setPath(next, el.dataset.path, el.value);
  });

  document.querySelectorAll('ul[data-path][data-kind="array-string"]').forEach((list) => {
    const values = Array.from(list.querySelectorAll(".array-row input")).map((i) => i.value);
    setPath(next, list.dataset.path, values);
  });

  document.querySelectorAll('ul[data-path][data-kind="array-object"]').forEach((list) => {
    const rows = Array.from(list.querySelectorAll(".object-row")).map((row) => {
      const obj = {};
      row.querySelectorAll("[data-key]").forEach((el) => {
        obj[el.dataset.key] = el.value;
      });
      return obj;
    });
    setPath(next, list.dataset.path, rows);
  });

  return next;
};

// ---------- load existing content ----------
const loadContent = async () => {
  setStatus("loading content…", "loading");
  try {
    // raw public fetch — no auth needed, always fresh
    const res = await fetch(`../content/content.json?t=${Date.now()}`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`content.json HTTP ${res.status}`);
    content = await res.json();
    renderForm(content);
    $("loaded-info").textContent = `Loaded ${CONTENT_PATH} (${JSON.stringify(content).length} bytes).`;
    showPanel("editor-panel");
    setStatus("ready", "ok");
  } catch (err) {
    setStatus(err.message, "error");
  }
};

// ---------- image handling ----------
const slugify = (name) =>
  name.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);

const todayStamp = () => new Date().toISOString().slice(0, 10);

const resizeImage = (file) => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, MAX_IMAGE_WIDTH / img.width);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("canvas.toBlob returned null"));
      resolve(blob);
    }, "image/jpeg", JPEG_QUALITY);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image decode failed")); };
  img.src = url;
});

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    // result is "data:<mime>;base64,<payload>"
    const result = reader.result;
    resolve(result.slice(result.indexOf(",") + 1));
  };
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const renderPending = () => {
  const list = $("pending-images");
  list.replaceChildren();
  pendingImages.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "pending-item";
    li.innerHTML = `
      <img alt="" />
      <div class="filename"></div>
      <div class="pending-row">
        <span class="size"></span>
        <button type="button" class="row-btn" data-action="remove">remove</button>
      </div>
    `;
    li.querySelector("img").src = item.dataUrl;
    li.querySelector(".filename").textContent = `${ASSETS_DIR}/${item.filename}`;
    li.querySelector(".size").textContent =
      `${(item.originalSize / 1024).toFixed(0)}K → ${(item.blob.size / 1024).toFixed(0)}K`;
    li.querySelector('[data-action="remove"]').addEventListener("click", () => {
      pendingImages.splice(idx, 1);
      renderPending();
    });
    list.appendChild(li);
  });
};

const handleFiles = async (files) => {
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    setStatus(`resizing ${file.name}…`, "loading");
    try {
      const blob = await resizeImage(file);
      const base64 = await blobToBase64(blob);
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      const filename = `${todayStamp()}-${slugify(file.name)}.jpg`;
      pendingImages.push({ filename, blob, base64, dataUrl, originalSize: file.size });
    } catch (err) {
      setStatus(`failed: ${file.name} (${err.message})`, "error");
      return;
    }
  }
  renderPending();
  setStatus("ready", "ok");
};

const dropZone = $("drop-zone");
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("is-dragover"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("is-dragover");
  handleFiles(e.dataTransfer.files);
});
$("file-input").addEventListener("change", (e) => handleFiles(e.target.files));

// ---------- GitHub API ----------
const gh = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${init.method || "GET"} ${path} → ${res.status}: ${body}`);
  }
  return res.json();
};

const utf8ToBase64 = (str) => btoa(unescape(encodeURIComponent(str)));

const atomicCommit = async ({ contentJson, images, message }) => {
  // 1. parent commit + tree
  const ref = await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${SOURCE_BRANCH}`);
  const parentCommitSha = ref.object.sha;
  const parentCommit = await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/commits/${parentCommitSha}`);
  const parentTreeSha = parentCommit.tree.sha;

  // 2. blobs
  const treeEntries = [];

  const contentBlob = await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content: utf8ToBase64(contentJson), encoding: "base64" }),
  });
  treeEntries.push({ path: CONTENT_PATH, mode: "100644", type: "blob", sha: contentBlob.sha });

  for (const img of images) {
    const blob = await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: img.base64, encoding: "base64" }),
    });
    treeEntries.push({ path: `${ASSETS_DIR}/${img.filename}`, mode: "100644", type: "blob", sha: blob.sha });
  }

  // 3. tree
  const newTree = await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: parentTreeSha, tree: treeEntries }),
  });

  // 4. commit
  const newCommit = await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: newTree.sha, parents: [parentCommitSha] }),
  });

  // 5. update refs (main + pages-release mirror)
  await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${SOURCE_BRANCH}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.sha }),
  });
  await gh(`/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${RELEASE_BRANCH}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.sha, force: true }),
  });

  return newCommit;
};

// ---------- save ----------
$("save-btn").addEventListener("click", async () => {
  const btn = $("save-btn");
  btn.disabled = true;
  $("save-result").textContent = "";
  setStatus("saving…", "saving");
  try {
    const next = collectForm();
    const json = JSON.stringify(next, null, 2) + "\n";
    const message = $("commit-message").value.trim() || "admin: update content";
    const commit = await atomicCommit({ contentJson: json, images: pendingImages, message });

    content = next;
    pendingImages.length = 0;
    renderPending();
    setStatus("saved", "ok");
    $("save-result").innerHTML =
      `Saved as <a href="https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${commit.sha}" target="_blank" rel="noopener">${commit.sha.slice(0, 7)}</a>. ` +
      `Pages will redeploy in ~30s.`;
  } catch (err) {
    setStatus(err.message, "error");
    $("save-result").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- init ----------
if (token) {
  $("clear-token-btn").hidden = false;
  loadContent();
} else {
  showPanel("token-panel");
  setStatus("needs token", "idle");
}
