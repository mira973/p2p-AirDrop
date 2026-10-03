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
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Введите код сессии",
          }),
        );

        return;
      }

      if (data.code.length !== 6) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Код сессии не верный",
          }),
        );

        return;
      }

      const session = sessions.get(data.code);

      if (!session) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Сессия не найдена",
          }),
        );

        return;
      }

      if (session.peer !== null) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Сессия уже занята",
          }),
        );

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

      console.log(hostResponse);
      console.log(peerResponse);
    }

    if (data.type === "offer") {
      const session = findSessionBySocket(ws);

      console.log("FOUND SESSION:", session);

      if (!session || session.peer === null) {
        console.log("Peer не найден");
        return;
      }

      console.log("SENDING OFFER TO PEER");

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
        const target = session.peer;
        target.send(JSON.stringify({ type: "ice-candidate", candidate: data.candidate }));
      }

      if (ws === session.peer) {
        const target = session.host;
        target.send(JSON.stringify({ type: "ice-candidate", candidate: data.candidate }));
      }
      // 1. если ws === session.host
      // 2. если ws === session.peer
      // 3. target.send(...)
    }

    if (data.type === "answer") {
      const session = findSessionBySocket(ws);

      if (!session || session.host === null) {
        console.log("Host не найден");
        return;
      }

      console.log("SENDING ANSWER TO HOST");

      session.host.send(JSON.stringify({ type: "answer", answer: data.answer }));
    }

    if (data.type === "error") {
      console.log("Ошибка:", data.message);
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
