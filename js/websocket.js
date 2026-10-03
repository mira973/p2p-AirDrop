const wsUri = "ws://localhost:8080";

let websocket = null;

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

  return websocket;
}

export function send(message) {
  websocket.send(message);
}
