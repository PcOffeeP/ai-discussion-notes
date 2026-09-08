// content/content.js — 选区监听 + 悬浮按钮 + toast（纯 UI 层）。
// 业务动作只有一句：aidn.save()。
(function () {
  const AIDN = window.AIDN;
  const aidn = AIDN.createClient({
    repo: AIDN.createRuntimeNoteClient(),
    source: AIDN.createDomSelectionSource(window),
  });

  let buttonEl = null;
  let toastEl = null;
  let captureEnabled = true;

  aidn.advanced.settings?.get().then((s) => {
    captureEnabled = s.captureButtonEnabled !== false;
  }).catch(() => { /* 扩展上下文失效（扩展刚更新）时静默忽略 */ });

  // ---- floating button ----
  function ensureButton() {
    if (buttonEl) return buttonEl;
    buttonEl = document.createElement("button");
    buttonEl.className = "aidn-save-btn";
    buttonEl.textContent = "＋ Note";
    buttonEl.title = "Save to AI Discussion Notes";
    buttonEl.addEventListener("mousedown", (e) => e.preventDefault()); // 保住选区
    buttonEl.addEventListener("click", onSaveClick);
    document.documentElement.appendChild(buttonEl);
    return buttonEl;
  }

  function showButtonAt(rect) {
    const btn = ensureButton();
    const top = rect.top + window.scrollY - 40;
    const left = rect.left + window.scrollX + rect.width / 2 - 30;
    btn.style.top = Math.max(top, window.scrollY + 4) + "px";
    btn.style.left = Math.max(left, 4) + "px";
    btn.classList.add("aidn-visible");
  }

  function hideButton() {
    if (buttonEl) buttonEl.classList.remove("aidn-visible");
  }

  // ---- toast ----
  function showToast(text, duration = 1500) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "aidn-toast";
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add("aidn-visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove("aidn-visible"), duration);
  }

  // ---- 扩展上下文失效检测 ----
  // 扩展更新/刷新后，已打开页面里的 content script 上下文即失效
  // （chrome.runtime.id 变为 undefined，消息通道断开）。此时保存必然失败，
  // 必须明确引导用户刷新页面，而不是报一个含糊的 "Save failed"。
  function contextInvalidated() {
    try {
      return !chrome.runtime?.id;
    } catch (_) {
      return true;
    }
  }

  function isInvalidationError(err) {
    return contextInvalidated() || /Extension context invalidated/i.test(String(err?.message || err));
  }

  // ---- save: 主路径一行 ----
  async function onSaveClick(e) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const note = await aidn.save();
      if (!note) return;
      showToast("Saved");
      hideButton();
      window.getSelection()?.removeAllRanges();
    } catch (err) {
      if (isInvalidationError(err)) {
        showToast("扩展已更新，请刷新本页后再收藏", 3000);
      } else {
        console.error("[AIDN] save failed:", err);
        showToast("Save failed");
      }
    }
  }

  // ---- selection tracking ----
  function onSelectionMaybe() {
    if (!captureEnabled) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      hideButton();
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideButton();
      return;
    }
    showButtonAt(rect);
  }

  document.addEventListener("mouseup", () => setTimeout(onSelectionMaybe, 10));
  document.addEventListener("keyup", (e) => {
    if (e.key === "Escape") hideButton();
  });
  document.addEventListener("mousedown", (e) => {
    if (buttonEl && !buttonEl.contains(e.target)) {
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) hideButton();
      }, 10);
    }
  });
  window.addEventListener("scroll", hideButton, { passive: true });

  // 来自 service worker 的消息
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "AIDN_TOAST") {
      showToast(msg.text || "Saved");
      return false;
    }
    // 右键菜单入口：在页面内走完整管道（保留 HTML → 列表/表格不丢失）
    if (msg?.type === "AIDN_CAPTURE_CONTEXT_MENU") {
      (async () => {
        try {
          const note = await aidn.save();
          if (note) showToast("Saved");
          sendResponse({ ok: !!note });
        } catch (_) {
          sendResponse({ ok: false });
        }
      })();
      return true; // async response
    }
    return false;
  });
})();
