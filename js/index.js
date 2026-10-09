import { getLang, initI18n, setLang, t } from "./i18n.js";
import { state } from "./state.js";
import { showToast } from "./toast.js";
import { sendFile } from "./transfer.js";
import {
  addIceCandidate,
  createAnswer,
  createDataChannel,
  createOffer,
  createPeerConnection,
  setRemoteAnswer,
} from "./webrtc.js";
import { connectWebSocket, send } from "./websocket.js";

/* --- Элементы интерфейса --- */
const createCard = document.getElementById("createCard");
const createBtn = document.getElementById("CreateSession");
const codeDisplay = document.getElementById("number-display");
const qrCanvas = document.getElementById("qr-code");

const joinForm = document.getElementById("joinForm");
const joinStatus = document.getElementById("joinStatus");
const joinStatusText = document.getElementById("joinStatusText");
const joinBtn = document.getElementById("JoinSession");
const inputCode = document.getElementById("inputCode");

const connectionChip = document.getElementById("connection-status");
const connectionChipText = document.getElementById("connection-status-text");

const fileInput = document.getElementById("file-input");
const fileList = document.getElementById("file-list");
const sendFileBtn = document.getElementById("SendFile");

const progressPanel = document.getElementById("progress-panel");
const progressLabel = document.getElementById("progress-label");
const progressBar = document.getElementById("progress");
const progressText = document.getElementById("progress-text");
const progressMeta = document.getElementById("progress-meta");

/* Коды ошибок сигнального сервера, для которых есть перевод. */
const ERROR_KEYS = new Set(["empty-code", "invalid-code", "session-not-found", "session-busy"]);

/* --- Состояние интерфейса --- */
let itemId = 0;
let items = []; // весь список: отправленные и полученные файлы
let pending = []; // элементы, ожидающие отправки
let sending = false;
let lastProgress = null;
let connectionStatus = "waiting";

/* ==========================================================================
   Форматирование и отрисовка
   ========================================================================== */

function formatBytes(value) {
  const bytes = Number(value) || 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  const digits = index === 0 || size >= 100 ? 0 : size >= 10 ? 1 : 2;
  const formatter = new Intl.NumberFormat(getLang() === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  return `${formatter.format(size)} ${units[index]}`;
}

function renderConnectionStatus() {
  connectionChip.className = `status-chip status-chip--${connectionStatus}`;
  connectionChipText.textContent = t(`status.${connectionStatus}`);
}

function setConnectionStatus(status) {
  connectionStatus = status;
  renderConnectionStatus();
}

/** Статус, когда передача не идёт. */
function idleConnectionStatus() {
  const channel = state.dataChannel;

  if (!channel) return state.role ? "connecting" : "waiting";
  if (channel.readyState === "open") return "connected";
  if (channel.readyState === "connecting") return "connecting";

  return "error";
}

function renderFileList() {
  fileList.replaceChildren();
  fileList.hidden = items.length === 0;

  for (const item of items) {
    const row = document.createElement("li");
    row.className = `file-item file-item--${item.status}`;

    const main = document.createElement("div");
    main.className = "file-item__main";

    const name = document.createElement("span");
    name.className = "file-item__name";
    name.textContent = item.name;

    const meta = document.createElement("span");
    meta.className = "file-item__meta";
    meta.textContent = `${formatBytes(item.size)} · ${t(`file.status.${item.status}`)}`;

    main.append(name, meta);
    row.append(main);

    if (item.blob) {
      const download = document.createElement("button");
      download.type = "button";
      download.className = "btn btn--ghost btn--small";
      download.dataset.download = String(item.id);
      download.textContent = t("file.download");

      row.append(download);
    }

    fileList.append(row);
  }
}

function renderProgress() {
  if (!lastProgress) return;

  const { direction, percent, bytes, totalBytes, batchIndex, batchTotal } = lastProgress;
  const value = Math.max(0, Math.min(Math.round(percent), 100));

  progressPanel.hidden = false;
  progressLabel.textContent =
    direction === "send" ? t("transfer.sending") : t("transfer.receiving");
  progressText.textContent = `${value}%`;
  progressBar.value = value;

  const parts = [];

  if ((batchTotal ?? 1) > 1) {
    parts.push(t("transfer.fileOfTotal", { index: batchIndex ?? 1, total: batchTotal }));
  }

  parts.push(t("transfer.bytes", { done: formatBytes(bytes), total: formatBytes(totalBytes) }));
  progressMeta.textContent = parts.join(" · ");
}

function showProgress(event) {
  lastProgress = event;

  if (connectionStatus !== "transferring") setConnectionStatus("transferring");

  renderProgress();
}

function hideProgress() {
  lastProgress = null;
  progressPanel.hidden = true;
  progressBar.value = 0;
  progressText.textContent = "0%";
  progressMeta.textContent = "";

  setConnectionStatus(idleConnectionStatus());
}

function renderJoinStatus() {
  if (joinStatus.hidden) return;

  const code = state.session?.code;

  joinStatusText.textContent = code ? t("join.connected", { code }) : t("status.connected");
}

function updateSendButton() {
  sendFileBtn.disabled = pending.length === 0 || sending;
}

/** Перерисовка всего, что зависит от языка или состояния. */
function renderDynamic() {
  renderConnectionStatus();
  renderJoinStatus();
  renderFileList();
  renderProgress();
}

/* ==========================================================================
   Отправка файлов
   ========================================================================== */

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = name;

  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function sendPendingFiles() {
  if (sending || pending.length === 0) return;

  const channel = state.dataChannel;

  if (channel?.readyState !== "open") {
    showToast({ kind: "error", messageKey: "error.channel-closed" });
    return;
  }

  const batch = pending.slice();
  const batchBytes = batch.reduce((sum, item) => sum + item.size, 0);

  sending = true;
  updateSendButton();

  try {
    for (let index = 0; index < batch.length; index += 1) {
      const item = batch[index];

      item.status = "sending";
      renderFileList();

      await sendFile(
        channel,
        item.file,
        { index: index + 1, total: batch.length, batchBytes },
        (sentBytes) => {
          showProgress({
            direction: "send",
            percent: item.size > 0 ? (sentBytes / item.size) * 100 : 100,
            bytes: sentBytes,
            totalBytes: item.size,
            fileName: item.name,
            batchIndex: index + 1,
            batchTotal: batch.length,
          });
        },
      );

      item.status = "sent";
      renderFileList();
    }
  } catch (error) {
    console.error("Ошибка отправки файла:", error);

    for (const item of batch) {
      if (item.status === "sending" || item.status === "waiting") item.status = "error";
    }

    showToast({
      kind: "error",
      messageKey:
        error?.message === "channel-closed" ? "error.channel-closed" : "error.send-failed",
    });
  } finally {
    pending = pending.filter((item) => !batch.includes(item));
    sending = false;

    hideProgress();
    renderFileList();
    updateSendButton();
  }
}

/* ==========================================================================
   Соединение
   ========================================================================== */

function markJoined() {
  createCard.hidden = true;
  joinForm.hidden = true;
  joinStatus.hidden = false;

  renderJoinStatus();
}

function handleChannelOpen() {
  setConnectionStatus("connected");

  if (state.role === "peer") {
    markJoined();
    showToast({ kind: "success", messageKey: "toast.connectedPeer" });
  } else {
    showToast({ kind: "success", messageKey: "toast.peerJoined" });
  }

  updateSendButton();
}

function handleChannelClose() {
  setConnectionStatus("error");
  showToast({ kind: "error", messageKey: "error.channel-closed" });
}

function handleFileReceived(blob, meta, batch) {
  itemId += 1;

  items = [
    ...items,
    {
      id: itemId,
      name: meta?.name ?? "file",
      size: meta?.size ?? blob.size,
      file: null,
      blob,
      direction: "in",
      status: "received",
      batch,
    },
  ];

  hideProgress();
  renderFileList();
}

function handleSessionCreated(data) {
  codeDisplay.textContent = data.code;

  const joinUrl = new URL(window.location.href);
  joinUrl.searchParams.set("code", data.code);

  state.session = { code: data.code, link: joinUrl.toString() };

  if (typeof window.QRCode?.toCanvas !== "function") {
    console.error("Библиотека QR-кода не загрузилась");
    return;
  }

  window.QRCode.toCanvas(qrCanvas, joinUrl.toString(), (error) => {
    if (error) console.error("Не удалось построить QR-код:", error);
  });
}

function handlePeerJoined(data) {
  state.role = data.role;

  createPeerConnection({
    onFileReceived: handleFileReceived,
    onProgress: showProgress,
    onChannelOpen: handleChannelOpen,
    onChannelClose: handleChannelClose,
  });

  if (data.role === "host") {
    createDataChannel();
    createOffer().catch((error) => console.error("Не удалось создать offer:", error));
    return;
  }

  setConnectionStatus("connecting");
}

function handleServerError(data) {
  const known = typeof data.code === "string" && ERROR_KEYS.has(data.code);

  if (!state.dataChannel) setConnectionStatus("waiting");

  showToast({
    kind: "error",
    messageKey: known ? `error.${data.code}` : null,
    message: known ? null : data.message,
  });
}

function joinSession(rawCode) {
  const code = String(rawCode ?? "").trim();

  state.session = { code };
  setConnectionStatus("connecting");

  send(JSON.stringify({ type: "join-session", code }));
}

/* ==========================================================================
   События интерфейса
   ========================================================================== */

function bindEvents() {
  createBtn.addEventListener("click", () => {
    send(JSON.stringify({ type: "create-session" }));
  });

  joinBtn.addEventListener("click", () => joinSession(inputCode.value));

  inputCode.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    joinSession(inputCode.value);
  });

  fileInput.addEventListener("change", () => {
    for (const file of Array.from(fileInput.files ?? [])) {
      itemId += 1;

      const item = {
        id: itemId,
        name: file.name,
        size: file.size,
        file,
        blob: null,
        direction: "out",
        status: "waiting",
      };

      items = [...items, item];
      pending = [...pending, item];
    }

    // Сбрасываем поле, чтобы тот же файл можно было выбрать повторно.
    fileInput.value = "";

    renderFileList();
    updateSendButton();
  });

  sendFileBtn.addEventListener("click", () => {
    sendPendingFiles();
  });

  fileList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-download]");

    if (!button) return;

    const item = items.find((entry) => entry.id === Number(button.dataset.download));

    if (item?.blob) downloadBlob(item.blob, item.name);
  });

  for (const button of document.querySelectorAll(".lang-switch__btn")) {
    button.addEventListener("click", () => setLang(button.dataset.lang));
  }

  document.addEventListener("langchange", renderDynamic);
}

function connectSignaling() {
  connectWebSocket({
    onMessage: async (data) => {
      try {
        switch (data.type) {
          case "session-created":
            handleSessionCreated(data);
            break;

          case "peer-joined":
            handlePeerJoined(data);
            break;

          case "offer":
            await createAnswer(data.offer);
            break;

          case "answer":
            await setRemoteAnswer(data.answer);
            break;

          case "ice-candidate":
            await addIceCandidate(data.candidate);
            break;

          case "error":
            handleServerError(data);
            break;

          case "peer-disconnected":
            setConnectionStatus("waiting");
            showToast({ kind: "info", messageKey: "toast.peerLeft" });
            break;

          case "session-closed":
            setConnectionStatus("error");
            showToast({ kind: "info", messageKey: "toast.sessionClosed" });
            break;

          default:
            break;
        }
      } catch (error) {
        console.error("Ошибка обработки сообщения сигнализации:", error);
      }
    },
  });
}

/* ==========================================================================
   Запуск
   ========================================================================== */

const urlCode = new URLSearchParams(window.location.search).get("code");

if (urlCode) inputCode.value = urlCode;

bindEvents();
initI18n();
connectSignaling();

if (urlCode) joinSession(urlCode);
