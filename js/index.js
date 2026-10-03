import { state } from "./state.js";
import { createAnswer, createOffer, createPeerConnection, setRemoteAnswer } from "./webrtc.js";
import { connectWebSocket, send } from "./websocket.js";

const btn = document.getElementById("CreateSession");
const display = document.getElementById("number-display");
const fileInput = document.getElementById("file-input");
const infoDisplay = document.getElementById("info-display");
const joinBtn = document.getElementById("JoinSession");
const inputCode = document.getElementById("inputCode");

connectWebSocket({
  onMessage: async (data) => {
    if (data.type === "session-created") {
      console.log("Сессия создана:", data.code);
      display.textContent = data.code;
      state.session = { code: data.code };
    }

    if (data.type === "peer-joined") {
      state.role = data.role;

      createPeerConnection();

      if (data.role === "host") {
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
  },
});

function getInfo() {
  const file = fileInput.files[0];

  if (!file) return;

  infoDisplay.textContent =
    `Имя: ${file.name}, ` +
    `Размер: ${(file.size / (1024 * 1024)).toFixed(2)} MB, ` +
    `Тип: ${file.type}`;
}

fileInput.addEventListener("change", getInfo);

btn.addEventListener("click", () => {
  const obj = JSON.stringify({
    type: "create-session",
  });

  send(obj);
});

joinBtn.addEventListener("click", () => {
  const message = JSON.stringify({
    type: "join-session",
    code: inputCode.value,
  });

  send(message);
});
