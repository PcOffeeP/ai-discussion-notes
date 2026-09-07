// Content script (Plan A: selection floating button).
// Shows a small "＋ Note" button near the current text selection on ChatGPT,
// saves through the matching CaptureAdapter, and confirms with a "Saved" toast.
// The whole flow never interrupts the conversation: no dialogs, no inputs.
(function () {
  const AIDN = window.AIDN || {};
  let adapter = null;
  let buttonEl = null;
  let toastEl = null;
  let captureEnabled = true;

  function pickAdapter() {
    adapter = (AIDN.adapters || []).find((a) => a.matches()) || null;
  }

  function loadSetting() {
    chrome.runtime.sendMessage({ type: "AIDN_GET_SETTINGS" }, (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) return;
      captureEnabled = resp.settings.captureButtonEnabled !== false;
      if (!captureEnabled) hideButton();
    });
  }

  // ---- floating button ----
  function ensureButton() {
    if (buttonEl) return buttonEl;
    buttonEl = document.createElement("button");
    buttonEl.className = "aidn-save-btn";
    buttonEl.textContent = "＋ Note";
    buttonEl.title = "Save to AI Discussion Notes";
    // prevent selection from collapsing when pressing the button
    buttonEl.addEventListener("mousedown", (e) => e.preventDefault());
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
  function showToast(text) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "aidn-toast";
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add("aidn-visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove("aidn-visible"), 1500);
  }

  // ---- save ----
  function currentPayload() {
    const a = adapter;
    const content = a ? a.getSelectedContent() : (getSelection()?.toString().trim() || "");
    if (!content) return null;
    return {
      content,
      source: a ? a.getSource() : "ChatGPT",
      sourceType: a ? a.getSourceType() : "chat",
      conversationTitle: a ? a.getConversationTitle() : "",
      conversationUrl: a ? a.getConversationUrl() : location.href,
      metadata: a ? a.getMetadata() : {},
    };
  }

  function save(payload, done) {
    chrome.runtime.sendMessage({ type: "AIDN_SAVE_NOTE", payload }, (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) {
        showToast("Save failed");
        return;
      }
      showToast("Saved");
      if (done) done();
    });
  }

  function onSaveClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const payload = currentPayload();
    if (!payload) return;
    save(payload, () => {
      hideButton();
      getSelection()?.removeAllRanges();
    });
  }

  // ---- selection tracking ----
  function onSelectionMaybe() {
    if (!captureEnabled) return;
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      hideButton();
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideButton();
      return;
    }
    showButtonAt(rect);
  }

  // Wait briefly after mouseup so the selection is final.
  document.addEventListener("mouseup", () => setTimeout(onSelectionMaybe, 10));
  document.addEventListener("keyup", (e) => {
    if (e.key === "Escape") hideButton();
  });
  // Hide when the user clicks elsewhere / scrolls away.
  document.addEventListener("mousedown", (e) => {
    if (buttonEl && !buttonEl.contains(e.target)) {
      setTimeout(() => {
        const sel = getSelection();
        if (!sel || sel.isCollapsed) hideButton();
      }, 10);
    }
  });
  window.addEventListener("scroll", hideButton, { passive: true });

  // ---- messages from background ----
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "AIDN_GET_CONTEXT") {
      sendResponse({
        source: adapter ? adapter.getSource() : "ChatGPT",
        conversationTitle: adapter ? adapter.getConversationTitle() : "",
        conversationUrl: adapter ? adapter.getConversationUrl() : location.href,
      });
      return false;
    }
    if (msg?.type === "AIDN_SHOW_SAVED") {
      showToast("Saved");
      return false;
    }
    return false;
  });

  pickAdapter();
  loadSetting();
})();
