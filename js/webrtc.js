import { state } from "./state.js";
import { BUFFER_LOW_WATER } from "./transfer.js";
import { send } from "./websocket.js";

let incoming = null;

export async function addIceCandidate(candidate) {
  const connection = state.peerConnection;

  if (!connection) return;

  // Кандидаты, пришедшие до setRemoteDescription, копим и добавляем позже.
  if (!connection.remoteDescription) {
    state.pendingCandidates.push(candidate);
    return;
  }

  try {
    await connection.addIceCandidate(candidate);
  } catch (error) {
    console.error("Не удалось добавить ICE-кандидата:", error);
  }
}

async function flushPendingCandidates() {
  const connection = state.peerConnection;

  if (!connection || state.pendingCandidates.length === 0) return;

  const candidates = state.pendingCandidates.splice(0, state.pendingCandidates.length);

  for (const candidate of candidates) {
    try {
      await connection.addIceCandidate(candidate);
    } catch (error) {
      console.error("Не удалось добавить ICE-кандидата:", error);
    }
  }
}

function emitReceiveProgress() {
  if (!incoming?.meta) return;

  const totalBytes = incoming.meta.size ?? 0;
  const percent = totalBytes > 0 ? Math.min((incoming.size / totalBytes) * 100, 100) : 100;

  state.onProgress?.({
    direction: "receive",
    percent,
    bytes: incoming.size,
    totalBytes,
    fileName: incoming.meta.name,
    batchIndex: incoming.batch?.index ?? 1,
    batchTotal: incoming.batch?.total ?? 1,
  });
}

function finishIncomingFile() {
  const { meta, batch, chunks, size } = incoming;
  const fileMeta = meta ?? { name: "file", size, type: "" };
  const blob = new Blob(chunks, { type: fileMeta.type ?? "" });

  incoming = null;

  state.onFileReceived?.(blob, fileMeta, batch ?? null);
}

function handleControlMessage(raw) {
  let message = null;

  try {
    message = JSON.parse(raw);
  } catch (error) {
    console.error("Не удалось разобрать управляющее сообщение:", error);
    return;
  }

  if (message?.type !== "file-meta") return;

  const fileMeta = message.fileMeta ?? { name: "file", size: 0, type: "" };

  incoming = {
    meta: fileMeta,
    batch: message.batch ?? null,
    chunks: [],
    size: 0,
  };

  emitReceiveProgress();

  // Для файла нулевой длины чанков не будет — завершаем сразу.
  if (fileMeta.size === 0) finishIncomingFile();
}

function handleBinaryMessage(data) {
  if (!incoming?.meta) return;

  incoming.chunks.push(data);
  incoming.size += data.byteLength;

  emitReceiveProgress();

  if (incoming.size >= incoming.meta.size) finishIncomingFile();
}

function attachDataChannel(channel) {
  channel.binaryType = "arraybuffer";

  // Нижняя граница буфера: отправка возобновляется по событию bufferedamountlow.
  if ("bufferedAmountLowThreshold" in channel) {
    channel.bufferedAmountLowThreshold = BUFFER_LOW_WATER;
  }

  channel.onopen = () => state.onChannelOpen?.();
  channel.onclose = () => state.onChannelClose?.();
  channel.onerror = () => state.onChannelClose?.();

  channel.onmessage = (event) => {
    if (typeof event.data === "string") {
      handleControlMessage(event.data);
      return;
    }

    handleBinaryMessage(event.data);
  };
}

export function createPeerConnection(handlers = {}) {
  const connection = new RTCPeerConnection();

  state.peerConnection = connection;
  state.pendingCandidates = [];
  state.onFileReceived = handlers.onFileReceived ?? null;
  state.onProgress = handlers.onProgress ?? null;
  state.onChannelOpen = handlers.onChannelOpen ?? null;
  state.onChannelClose = handlers.onChannelClose ?? null;

  connection.onicecandidate = (event) => {
    if (!event.candidate) return;

    send(
      JSON.stringify({
        type: "ice-candidate",
        candidate: event.candidate,
      }),
    );
  };

  connection.onconnectionstatechange = () => {
    if (connection.connectionState === "failed") state.onChannelClose?.();
  };

  connection.ondatachannel = (event) => {
    state.dataChannel = event.channel;
    attachDataChannel(state.dataChannel);
  };

  return connection;
}

export function createDataChannel() {
  const channel = state.peerConnection.createDataChannel("file");

  state.dataChannel = channel;
  attachDataChannel(channel);

  return channel;
}

export async function createOffer() {
  const connection = state.peerConnection;
  const offer = await connection.createOffer();

  await connection.setLocalDescription(offer);

  send(JSON.stringify({ type: "offer", offer }));
}

export async function createAnswer(offer) {
  const connection = state.peerConnection;

  await connection.setRemoteDescription(offer);
  await flushPendingCandidates();

  const answer = await connection.createAnswer();

  await connection.setLocalDescription(answer);

  send(JSON.stringify({ type: "answer", answer }));
}

export async function setRemoteAnswer(answer) {
  const connection = state.peerConnection;

  await connection.setRemoteDescription(answer);
  await flushPendingCandidates();
}
