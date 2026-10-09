/* ==========================================================================
   toast.js — ненавязчивые уведомления: появляются сами, закрываются вручную
   или исчезают через несколько секунд.
   ========================================================================== */

import { t } from "./i18n.js";

const MAX_TOASTS = 3;
const DEFAULT_DURATION = 4000;
const LEAVE_DURATION = 250;

const activeToasts = [];
let listensToLangChange = false;

function getContainer() {
  return document.getElementById("toasts");
}

function toastText(entry) {
  if (entry.messageKey) return t(entry.messageKey, entry.params);

  return entry.message || t("error.unknown");
}

function renderToast(entry) {
  entry.text.textContent = toastText(entry);
  entry.close.setAttribute("aria-label", t("toast.close"));
}

function refreshToasts() {
  for (const entry of activeToasts) {
    renderToast(entry);
  }
}

function ensureLangListener() {
  if (listensToLangChange) return;

  listensToLangChange = true;
  document.addEventListener("langchange", refreshToasts);
}

function removeToast(entry) {
  const index = activeToasts.indexOf(entry);

  if (index !== -1) activeToasts.splice(index, 1);

  clearTimeout(entry.timer);

  const { element } = entry;

  if (!element.isConnected) return;

  element.classList.add("toast--leaving");

  setTimeout(() => element.remove(), LEAVE_DURATION);
}

/**
 * Показать уведомление.
 * messageKey — ключ словаря; message — готовый текст (например, от сервера).
 */
export function showToast({
  kind = "info",
  messageKey = null,
  params = null,
  message = null,
  durationMs = DEFAULT_DURATION,
} = {}) {
  const container = getContainer();

  if (!container) return null;

  ensureLangListener();

  while (activeToasts.length >= MAX_TOASTS) {
    removeToast(activeToasts[0]);
  }

  const element = document.createElement("div");
  element.className = `toast toast--${kind}`;
  element.setAttribute("role", kind === "error" ? "alert" : "status");

  const dot = document.createElement("span");
  dot.className = "toast__dot";
  dot.setAttribute("aria-hidden", "true");

  const text = document.createElement("p");
  text.className = "toast__text";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast__close";
  close.textContent = "✕";

  element.append(dot, text, close);
  container.append(element);

  const entry = { element, text, close, messageKey, params, message, timer: null };

  renderToast(entry);
  activeToasts.push(entry);

  close.addEventListener("click", () => removeToast(entry));

  if (durationMs > 0) {
    entry.timer = setTimeout(() => removeToast(entry), durationMs);
  }

  return entry;
}
