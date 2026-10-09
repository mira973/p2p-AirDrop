/* ==========================================================================
   i18n.js — простой словарь переводов без библиотек.
   Все пользовательские тексты живут здесь: разметка помечается data-атрибутами,
   а рантайм-строки запрашиваются через t().
   ========================================================================== */

const STORAGE_KEY = "p2p-airdrop:lang";
const SUPPORTED = ["ru", "en"];
const FALLBACK = "en";

const translations = {
  ru: {
    "app.title": "P2P AirDrop — передача файлов",
    "lang.label": "Язык интерфейса",
    "lang.ru": "Русский язык",
    "lang.en": "Английский язык",

    "create.title": "Создать сессию",
    "create.hint": "Сгенерируйте код и QR — по ним подключатся другие устройства.",
    "create.button": "Создать сессию",
    "create.codeLabel": "Код сессии",

    "join.title": "Присоединиться",
    "join.hint": "Введите код сессии, который вам передали.",
    "join.codeLabel": "Код сессии",
    "join.inputPlaceholder": "0000",
    "join.button": "Присоединиться к сессии",
    "join.connected": "Подключено · код {code}",

    "file.title": "Передать файл",
    "file.hint": "Выберите файлы и отправьте их участнику сессии.",
    "file.dropzoneTitle": "Выбрать файлы",
    "file.dropzoneHint": "Нажмите, чтобы выбрать файлы на устройстве",
    "file.sendButton": "Отправить файлы",
    "file.download": "Скачать",

    "file.status.waiting": "Ожидает",
    "file.status.sending": "Отправка…",
    "file.status.sent": "Отправлено",
    "file.status.receiving": "Получение…",
    "file.status.received": "Получено",
    "file.status.error": "Ошибка",

    "transfer.label": "Прогресс передачи",
    "transfer.sending": "Отправка",
    "transfer.receiving": "Получение",
    "transfer.fileOfTotal": "Файл {index} из {total}",
    "transfer.bytes": "{done} / {total}",

    "status.waiting": "Ожидание подключения",
    "status.connecting": "Подключение…",
    "status.connected": "Подключено",
    "status.transferring": "Передача…",
    "status.error": "Ошибка",

    "toast.connectedPeer": "Вы подключились к сессии",
    "toast.peerJoined": "Устройство подключилось",
    "toast.peerLeft": "Устройство отключилось",
    "toast.sessionClosed": "Сессия закрыта",
    "toast.close": "Закрыть уведомление",

    "error.empty-code": "Введите код сессии",
    "error.invalid-code": "Код сессии неверный",
    "error.session-not-found": "Сессия не найдена",
    "error.session-busy": "Сессия уже занята",
    "error.unknown": "Произошла ошибка",
    "error.send-failed": "Не удалось отправить файл",
    "error.channel-closed": "Соединение потеряно",
  },

  en: {
    "app.title": "P2P AirDrop — file transfer",
    "lang.label": "Interface language",
    "lang.ru": "Russian",
    "lang.en": "English",

    "create.title": "Create a session",
    "create.hint": "Generate a code and QR — other devices will join with them.",
    "create.button": "Create session",
    "create.codeLabel": "Session code",

    "join.title": "Join a session",
    "join.hint": "Enter the session code you were given.",
    "join.codeLabel": "Session code",
    "join.inputPlaceholder": "0000",
    "join.button": "Join session",
    "join.connected": "Connected · code {code}",

    "file.title": "Send a file",
    "file.hint": "Pick the files and send them to the session participant.",
    "file.dropzoneTitle": "Choose files",
    "file.dropzoneHint": "Tap to pick files on this device",
    "file.sendButton": "Send files",
    "file.download": "Download",

    "file.status.waiting": "Waiting",
    "file.status.sending": "Sending…",
    "file.status.sent": "Sent",
    "file.status.receiving": "Receiving…",
    "file.status.received": "Received",
    "file.status.error": "Failed",

    "transfer.label": "Transfer progress",
    "transfer.sending": "Sending",
    "transfer.receiving": "Receiving",
    "transfer.fileOfTotal": "File {index} of {total}",
    "transfer.bytes": "{done} / {total}",

    "status.waiting": "Waiting for connection",
    "status.connecting": "Connecting…",
    "status.connected": "Connected",
    "status.transferring": "Transferring…",
    "status.error": "Error",

    "toast.connectedPeer": "You have connected to the session",
    "toast.peerJoined": "A device has connected",
    "toast.peerLeft": "The device disconnected",
    "toast.sessionClosed": "The session was closed",
    "toast.close": "Dismiss notification",

    "error.empty-code": "Enter the session code",
    "error.invalid-code": "The session code is not valid",
    "error.session-not-found": "Session not found",
    "error.session-busy": "The session is already taken",
    "error.unknown": "Something went wrong",
    "error.send-failed": "Failed to send the file",
    "error.channel-closed": "The connection was lost",
  },
};

let currentLang = FALLBACK;

function normalize(lang) {
  const base = String(lang ?? "")
    .toLowerCase()
    .split("-")[0];

  return SUPPORTED.includes(base) ? base : null;
}

function readSavedLang() {
  try {
    return normalize(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function persistLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Приватный режим или отключённое хранилище — просто обходимся без сохранения.
  }
}

/** Язык браузера, затем запасной вариант. */
function detectLang() {
  const saved = readSavedLang();

  if (saved) return saved;

  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];

  for (const candidate of candidates) {
    const matched = normalize(candidate);

    if (matched) return matched;
  }

  return FALLBACK;
}

export function getLang() {
  return currentLang;
}

/** Подстановка {name}-параметров в строку словаря. */
export function t(key, params) {
  const dictionary = translations[currentLang] ?? translations[FALLBACK];
  let value = dictionary[key] ?? translations[FALLBACK][key] ?? key;

  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.split(`{${name}}`).join(String(replacement));
    }
  }

  return value;
}

/** Проставляем переводы в разметку и отмечаем активный язык. */
export function applyI18n(root = document) {
  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }

  for (const element of root.querySelectorAll("[data-i18n-placeholder]")) {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  }

  for (const element of root.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  }

  for (const element of root.querySelectorAll("[data-i18n-title]")) {
    element.title = t(element.dataset.i18nTitle);
  }

  for (const element of root.querySelectorAll("[data-lang]")) {
    element.setAttribute("aria-pressed", String(element.dataset.lang === currentLang));
  }
}

function render() {
  document.documentElement.lang = currentLang;
  document.title = t("app.title");
  applyI18n(document);

  // Динамические части интерфейса перерисовывает index.js.
  document.dispatchEvent(new CustomEvent("langchange", { detail: { lang: currentLang } }));
}

/** Первый запуск: язык из localStorage либо из браузера. */
export function initI18n() {
  currentLang = detectLang();
  render();
}

/** Ручной переключатель: выбор пользователя сохраняется. */
export function setLang(lang) {
  const next = normalize(lang);

  if (!next || next === currentLang) return;

  currentLang = next;
  persistLang(next);
  render();
}
