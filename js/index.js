import { state } from "./state.js";
import {
  addIceCandidate,
  createAnswer,
  createDataChannel,
  createOffer,
  createPeerConnection,
  sendData,
  sendFileMeta,
  setRemoteAnswer,
} from "./webrtc.js";
import { connectWebSocket, send } from "./websocket.js";

const btn = document.getElementById("CreateSession");
const display = document.getElementById("number-display");
const fileInput = document.getElementById("file-input");
const infoDisplay = document.getElementById("info-display");
const joinBtn = document.getElementById("JoinSession");
const inputCode = document.getElementById("inputCode");
const sendFile = document.getElementById("SendFile");
const downloadFile = document.getElementById("DownloadFile");
const progressBar = document.getElementById("progress");
const progressText = document.getElementById("progress-text");
const qrCode = document.getElementById("qr-code");

const urlCode = new URLSearchParams(window.location.search).get("code");

if (urlCode) {
  inputCode.value = urlCode;
  console.log("Код из ссылки:", urlCode);
}

const saveFile = [];
let receivedFile = null;

const CHUNK_SIZE = 64 * 1024; // 64 КБ

// Не даём переполниться очереди data channel на быстрых файлах.
async function waitForBufferDrain() {
  const channel = state.dataChannel;

  while (channel?.readyState === "open" && channel.bufferedAmount > CHUNK_SIZE * 8) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function sendFileInChunks(file) {
  sendFileMeta(file);

  if (file.size === 0) {
    sendData(new ArrayBuffer(0));
    return;
  }

  for (let start = 0; start < file.size; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const buffer = await chunk.arrayBuffer();

    sendData(buffer);

    await waitForBufferDrain();
  }
}

function showDownloadButton(blob, fileMeta) {
  receivedFile = { blob, fileMeta };

  downloadFile.hidden = false;
  downloadFile.textContent = `Скачать ${fileMeta.name}`;
}

function updateProgress(percent) {
  const value = Math.round(percent);

  progressBar.value = value;
  progressText.textContent = `${value}%`;
}

function resetProgress() {
  updateProgress(0);
}

downloadFile.addEventListener("click", () => {
  if (!receivedFile) return;

  const objectURL = URL.createObjectURL(receivedFile.blob);
  const link = document.createElement("a");

  link.href = objectURL;
  link.download = receivedFile.fileMeta.name;

  document.body.append(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(objectURL);

  resetProgress();
});

connectWebSocket({
  onMessage: async (data) => {
    if (data.type === "session-created") {
      console.log("Сессия создана:", data.code);
      display.textContent = data.code;

      const joinUrl = new URL(window.location.origin);

      joinUrl.searchParams.set("code", data.code);

      state.session = { code: data.code, link: joinUrl.toString() };

      console.log("Ссылка для подключения:", state.session.link);
      window.QRCode.toCanvas(qrCode, joinUrl.toString(), (error) => {
        if (error) {
          console.error("Ошибка создания QR:", error);
          return;
        }

        console.log("QR создан");
      });
    }

    if (data.type === "peer-joined") {
      state.role = data.role;

      createPeerConnection((blob, fileMeta) => {
        console.log("Получен Blob:", blob);
        console.log("Метаданные файла:", fileMeta);

        showDownloadButton(blob, fileMeta);
      }, updateProgress);

      if (data.role === "host") {
        createDataChannel();
        createOffer();
      }

      if (data.role === "peer") {
        console.log("ждет оффер");
      }

      console.log(data.role);
    }

    if (data.type === "offer") {
      createAnswer(data.offer);
    }

    if (data.type === "answer") {
      await setRemoteAnswer(data.answer);
    }

    if (data.type === "error") {
      console.log("Ошибка:", data.message);
    }

    if (data.type === "peer-disconnected") {
      console.log("Peer отключился");
    }

    if (data.type === "session-closed") {
      console.log("Host отключился. Сессия закрыта");
    }

    if (data.type === "ice-candidate") {
      await addIceCandidate(data.candidate);
    }
  },
});

if (urlCode) {
  joinSession(urlCode);
}

function getInfo() {
  const file = fileInput.files[0];

  if (!file) return;

  infoDisplay.textContent =
    `Имя: ${file.name}, ` +
    `Размер: ${(file.size / (1024 * 1024)).toFixed(2)} MB, ` +
    `Тип: ${file.type}`;
}

fileInput.addEventListener("change", () => {
  console.log("Выбран файл:", fileInput.files[0]);
  const file = fileInput.files[0];
  saveFile.push(file);
  console.log("Размер файла в байтах:", file.size);
  getInfo();
});

sendFile.addEventListener("click", async () => {
  for (const file of saveFile) {
    await sendFileInChunks(file);
  }
});

btn.addEventListener("click", () => {
  const obj = JSON.stringify({ type: "create-session" });

  send(obj);
});

joinBtn.addEventListener("click", () => {
  joinSession(inputCode.value);
});

function joinSession(code) {
  const message = JSON.stringify({ type: "join-session", code });

  send(message);
}
