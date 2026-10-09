/* ==========================================================================
   websocket.js — только сигнализация: создание/поиск сессии, offer/answer, ICE.
   ========================================================================== */

const SIGNALING_PORT = "8080";
const FALLBACK_URI = `ws://localhost:${SIGNALING_PORT}`;

let websocket = null;
const pendingMessages = [];

/**
 * Адрес сигнального сервера: тот же хост, что и страница, но порт сигналинга —
 * так телефон подключается к компьютеру по IP в локальной сети.
 * Переопределяется параметром ?ws=ws://host:port.
 */
function resolveSignalingUri() {
  const override = new URLSearchParams(window.location.search).get("ws");

  if (override) return override;

  const { protocol, hostname } = window.location;

  if (protocol !== "http:" && protocol !== "https:") return FALLBACK_URI;

  const scheme = protocol === "https:" ? "wss:" : "ws:";

  return `${scheme}//${hostname}:${SIGNALING_PORT}`;
}

function flushPendingMessages() {
  while (pendingMessages.length > 0) {
    websocket.send(pendingMessages.shift());
  }
}

export function connectWebSocket({ onMessage }) {
  websocket = new WebSocket(resolveSignalingUri());

  websocket.addEventListener("open", () => {
    console.info("Соединение с сервером сигнализации установлено");
    flushPendingMessages();
  });

  websocket.addEventListener("message", (msg) => {
    let data = null;

    try {
      data = JSON.parse(msg.data);
    } catch (error) {
      console.error("Не удалось разобрать сообщение сервера:", error);
      return;
    }

    onMessage(data);
  });

  websocket.addEventListener("close", () => {
    console.info("Соединение с сервером сигнализации закрыто");
  });

  websocket.addEventListener("error", (error) => {
    console.error("Ошибка WebSocket:", error);
  });

  return websocket;
}

export function send(message) {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    pendingMessages.push(message);
    return;
  }

  websocket.send(message);
}
