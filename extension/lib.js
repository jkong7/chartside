(() => {
  function cssPath(el) {
    if (!(el instanceof Element)) return null;
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
    for (const attr of ["name", "aria-label", "data-testid", "placeholder"]) {
      const v = el.getAttribute(attr);
      if (v) {
        const sel = `${el.tagName.toLowerCase()}[${attr}="${v.replace(/["\\]/g, "\\$&")}"]`;
        if (document.querySelectorAll(sel).length === 1) return sel;
      }
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      const parent = node.parentElement;
      const tag = node.tagName.toLowerCase();
      if (!parent) break;
      const same = [...parent.children].filter((c) => c.tagName === node.tagName);
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
      const sel = parts.join(" > ");
      if (document.querySelectorAll(sel).length === 1) return sel;
      node = parent;
    }
    return parts.length ? `body > ${parts.join(" > ")}` : null;
  }

  function setValue(el, text) {
    if (el.isContentEditable) {
      el.focus();
      el.textContent = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      return true;
    }
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    el.focus();
    if (setter) setter.call(el, text);
    else el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }

  function fill(mapping, sections, mode) {
    const results = [];
    for (const s of sections) {
      const sel = mapping[s.key] || mapping[s.title];
      if (!sel) {
        results.push({ key: s.key, status: "unmapped" });
        continue;
      }
      const el = document.querySelector(sel);
      if (!el) {
        results.push({ key: s.key, status: "missing", selector: sel });
        continue;
      }
      const current = el.isContentEditable ? el.textContent : el.value;
      const text = mode === "append" && current ? `${current}\n\n${s.text}` : s.text;
      results.push({ key: s.key, status: setValue(el, text) ? "filled" : "unsupported", selector: sel });
    }
    return results;
  }

  function pick() {
    return new Promise((resolve) => {
      const box = document.createElement("div");
      box.style.cssText = "position:fixed;pointer-events:none;border:2px solid #0f6b5c;background:rgba(15,107,92,.08);z-index:2147483647;border-radius:4px;transition:all .05s";
      document.body.appendChild(box);
      const over = (e) => {
        const r = e.target.getBoundingClientRect();
        Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      };
      const done = (value) => {
        document.removeEventListener("mouseover", over, true);
        document.removeEventListener("click", click, true);
        document.removeEventListener("keydown", key, true);
        box.remove();
        resolve(value);
      };
      const click = (e) => {
        e.preventDefault();
        e.stopPropagation();
        done(cssPath(e.target));
      };
      const key = (e) => {
        if (e.key === "Escape") done(null);
      };
      document.addEventListener("mouseover", over, true);
      document.addEventListener("click", click, true);
      document.addEventListener("keydown", key, true);
    });
  }

  globalThis.ChartsideExt = { cssPath, setValue, fill, pick };
})();
