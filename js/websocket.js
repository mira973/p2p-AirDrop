const wsUri = "ws://localhost:8080";

let websocket = null;
const pendingMessages = [];

function flushPendingMessages() {
  while (pendingMessages.length > 0) {
    websocket.send(pendingMessages.shift());
  }
}

export function connectWebSocket({ onMessage }) {
  websocket = new WebSocket(wsUri);

  websocket.addEventListener("open", () => {
    console.log("Соединение с сервером установлено");
  });

  websocket.addEventListener("message", (msg) => {
    const data = JSON.parse(msg.data);

    console.log("Получено сообщение:", data);

    onMessage(data);
  });

  websocket.addEventListener("close", () => {
    console.log("Соединение с WebSocket-сервером закрыто");
  });

  websocket.addEventListener("error", (error) => {
    console.log("Ошибка WebSocket:", error);
  });

  websocket.addEventListener("open", flushPendingMessages);

  return websocket;
}

export function send(message) {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    pendingMessages.push(message);
    return;
  }

  websocket.send(message);
}
