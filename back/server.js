import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });

console.log("WebSocket-сервер запущен на ws://localhost:8080");

const sessions = new Map();

function findSessionBySocket(ws) {
  for (const session of sessions.values()) {
    if (session.host === ws || session.peer === ws) {
      return session;
    }
  }

  return null;
}

/** Клиент переводит ошибку по code, message — запасной текст. */
function sendError(ws, code, message) {
  ws.send(
    JSON.stringify({
      type: "error",
      code,
      message,
    }),
  );
}

wss.on("connection", (ws) => {
  console.log("Новое подключение");

  ws.on("message", (msg) => {
    console.log("Получено сообщение:", msg.toString());

    const data = JSON.parse(msg.toString());

    if (data.type === "create-session") {
      let code = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");

      while (sessions.has(code)) {
        code = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
      }

      sessions.set(code, {
        host: ws,
        peer: null,
      });

      ws.send(
        JSON.stringify({
          type: "session-created",
          code,
        }),
      );
    }

    if (data.type === "join-session") {
      if (data.code === "") {
        sendError(ws, "empty-code", "Введите код сессии");

        return;
      }

      if (data.code.length !== 6) {
        sendError(ws, "invalid-code", "Код сессии не верный");

        return;
      }

      const session = sessions.get(data.code);

      if (!session) {
        sendError(ws, "session-not-found", "Сессия не найдена");

        return;
      }

      if (session.peer !== null) {
        sendError(ws, "session-busy", "Сессия уже занята");

        return;
      }

      session.peer = ws;

      const hostResponse = JSON.stringify({
        type: "peer-joined",
        role: "host",
      });

      const peerResponse = JSON.stringify({
        type: "peer-joined",
        role: "peer",
      });

      session.host.send(hostResponse);
      session.peer.send(peerResponse);
    }

    if (data.type === "offer") {
      const session = findSessionBySocket(ws);

      if (!session || session.peer === null) {
        console.log("Peer не найден");
        return;
      }

      session.peer.send(
        JSON.stringify({
          type: "offer",
          offer: data.offer,
        }),
      );
    }

    if (data.type === "ice-candidate") {
      const session = findSessionBySocket(ws);

      if (!session) {
        return;
      }

      if (ws === session.host) {
        session.peer.send(JSON.stringify({ type: "ice-candidate", candidate: data.candidate }));
      }

      if (ws === session.peer) {
        session.host.send(JSON.stringify({ type: "ice-candidate", candidate: data.candidate }));
      }
    }

    if (data.type === "answer") {
      const session = findSessionBySocket(ws);

      if (!session || session.host === null) {
        console.log("Host не найден");
        return;
      }

      session.host.send(JSON.stringify({ type: "answer", answer: data.answer }));
    }
  });

  ws.on("close", () => {
    sessions.forEach((session, code) => {
      if (session.host === ws) {
        console.log(`Хост сессии ${code} отключился`);

        if (session.peer !== null) {
          session.peer.send(JSON.stringify({ type: "session-closed" }));
        }

        sessions.delete(code);
      } else if (session.peer === ws) {
        console.log(`Peer сессии ${code} отключился`);

        if (session.host !== null) {
          session.host.send(JSON.stringify({ type: "peer-disconnected" }));
        }

        session.peer = null;
      }
    });

    console.log("Клиент отключился");
  });
});
