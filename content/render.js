(() => {
  const CONTENT_URL = "content/content.json";
  const APP_SCRIPT = "script.js";

  const escapeHtml = (value) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const mdToHtml = (value) => {
    if (value == null) return "";
    return escapeHtml(String(value))
      .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
      .replace(/==([^=\n]+?)==/g, '<span class="accent">$1</span>')
      .replace(/\*([^*\n]+?)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br />");
  };

  const getPath = (obj, path) =>
    path.split(".").reduce((current, key) => (current == null ? undefined : current[key]), obj);

  const interpolateTokens = (value, tokens) =>
    typeof value === "string"
      ? value.replace(/\{(\w+)\}/g, (match, key) => (key in tokens ? tokens[key] : match))
      : value;

  const setAttributesFromSpec = (element, spec, scope) => {
    spec.split(",").forEach((rawPair) => {
      const pair = rawPair.trim();
      if (!pair) return;
      const eqIndex = pair.indexOf("=");
      if (eqIndex === -1) return;
      const attr = pair.slice(0, eqIndex).trim();
      const path = pair.slice(eqIndex + 1).trim();
      const value = getPath(scope, path);
      if (value == null) return;
      element.setAttribute(attr, String(value));
    });
  };

  const hydrateScalars = (root, scope, tokens) => {
    root.querySelectorAll("[data-copy]").forEach((el) => {
      const value = getPath(scope, el.dataset.copy);
      el.innerHTML = mdToHtml(interpolateTokens(value, tokens));
    });

    root.querySelectorAll("[data-text]").forEach((el) => {
      const value = getPath(scope, el.dataset.text);
      if (value != null) el.textContent = interpolateTokens(String(value), tokens);
    });

    root.querySelectorAll("[data-attr]").forEach((el) => {
      setAttributesFromSpec(el, el.dataset.attr, scope);
    });
  };

  const fillBindings = (clone, item, tokens) => {
    clone.querySelectorAll("[data-bind]").forEach((el) => {
      const value = getPath(item, el.dataset.bind);
      el.innerHTML = mdToHtml(interpolateTokens(value, tokens));
    });

    clone.querySelectorAll("[data-bind-text]").forEach((el) => {
      const value = getPath(item, el.dataset.bindText);
      if (value != null) el.textContent = interpolateTokens(String(value), tokens);
    });

    clone.querySelectorAll("[data-bind-html]").forEach((el) => {
      const template = el.dataset.bindHtml;
      el.innerHTML = template.replace(/\{(\w+)\}/g, (match, key) => mdToHtml(item[key]));
    });

    clone.querySelectorAll("[data-bind-attr]").forEach((el) => {
      setAttributesFromSpec(el, el.dataset.bindAttr, item);
    });

    clone.querySelectorAll("[data-class-from]").forEach((el) => {
      const value = getPath(item, el.dataset.classFrom);
      if (typeof value === "string" && value.trim()) {
        el.classList.add(...value.trim().split(/\s+/));
      }
    });

    clone.querySelectorAll("[data-if]").forEach((el) => {
      if (!getPath(item, el.dataset.if)) el.remove();
    });

    clone.querySelectorAll("[data-list]").forEach((el) => {
      renderList(el, item, tokens);
    });
  };

  const renderList = (container, scope, tokens) => {
    const items = getPath(scope, container.dataset.list);
    if (!Array.isArray(items)) return;

    const templateId = container.dataset.itemTemplate;
    const template = templateId ? document.getElementById(templateId) : null;
    if (!template || !("content" in template)) return;

    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const clone = template.content.cloneNode(true);
      const normalized = typeof item === "string" ? { value: item } : item;
      fillBindings(clone, normalized, tokens);
      fragment.append(clone);
    });

    container.replaceChildren(fragment);
  };

  const hydrate = (content) => {
    const tokens = { year: String(new Date().getFullYear()) };
    hydrateScalars(document, content, tokens);
    document.querySelectorAll("[data-list]").forEach((container) => {
      if (container.closest("template")) return;
      renderList(container, content, tokens);
    });
  };

  const revealPage = () => {
    requestAnimationFrame(() => document.body.classList.remove("is-loading"));
  };

  const injectAppScript = () => {
    if (document.querySelector(`script[data-app-script="${APP_SCRIPT}"]`)) return;
    const script = document.createElement("script");
    script.src = APP_SCRIPT;
    script.defer = true;
    script.dataset.appScript = APP_SCRIPT;
    document.body.append(script);
  };

  const reportError = (error) => {
    console.error("[content] failed to render:", error);
    const main = document.getElementById("main");
    if (main) {
      const notice = document.createElement("p");
      notice.textContent = "Failed to load page content. Try a hard refresh.";
      notice.style.cssText = "padding:24px;color:#b34a2a;font-family:Georgia,serif;";
      main.replaceChildren(notice);
    }
    document.body.classList.remove("is-loading");
  };

  fetch(CONTENT_URL, { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`content.json HTTP ${response.status}`);
      return response.json();
    })
    .then((content) => {
      hydrate(content);
      revealPage();
      injectAppScript();
    })
    .catch(reportError);
})();
