import { state } from "./state.js";
import { send } from "./websocket.js";

export async function addIceCandidate(candidate) {
  await state.peerConnection.addIceCandidate(candidate);
}

let incomingFile = { meta: null, chunks: [], size: 0 };

function attachDataChannel(channel) {
  channel.onopen = () => {
    console.log("Канал успешно открыт! Теперь можно отправлять данные.");
  };

  channel.onmessage = (event) => {
    if (typeof event.data === "string") {
      const message = JSON.parse(event.data);

      if (message.type === "file-meta") {
        incomingFile = { meta: message.fileMeta, chunks: [], size: 0 };
        state.onProgress?.(0);
        console.log("Получены метаданные файла:", message.fileMeta);
      }

      return;
    }

    incomingFile.chunks.push(event.data);
    incomingFile.size += event.data.byteLength;

    const meta = incomingFile.meta;
    const totalBytes = meta?.size ?? 0;
    const percent = totalBytes > 0 ? Math.min((incomingFile.size / totalBytes) * 100, 100) : 100;

    state.onProgress?.(percent);

    const isComplete = meta ? incomingFile.size >= meta.size : true;

    if (!isComplete) return;

    const blob = new Blob(incomingFile.chunks, { type: meta?.type ?? "" });
    const fileMeta = meta ?? { name: "file", size: blob.size, type: blob.type };

    console.log("Получен файл:", fileMeta.name, blob.size, "байт");

    state.onFileReceived?.(blob, fileMeta);

    incomingFile = { meta: null, chunks: [], size: 0 };
  };
}

export function createPeerConnection(onFileReceived, onProgress) {
  state.peerConnection = new RTCPeerConnection();
  state.onFileReceived = onFileReceived;
  state.onProgress = onProgress;

  state.peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      send(
        JSON.stringify({
          type: "ice-candidate",
          candidate: event.candidate,
        }),
      );
    } else {
      console.log("ICE gathering finished");
    }
  };

  state.peerConnection.onconnectionstatechange = () => {
    console.log("Connection state:", state.peerConnection.connectionState);
  };

  state.peerConnection.ondatachannel = (event) => {
    state.dataChannel = event.channel;

    attachDataChannel(state.dataChannel);

    console.log("Получен DataChannel:", state.dataChannel.label);
  };
}

export function createDataChannel() {
  state.dataChannel = state.peerConnection.createDataChannel("file");

  attachDataChannel(state.dataChannel);
}

export async function createOffer() {
  const offer = await state.peerConnection.createOffer();

  await state.peerConnection.setLocalDescription(offer);

  send(JSON.stringify({ type: "offer", offer: offer }));
}

export async function createAnswer(offer) {
  await state.peerConnection.setRemoteDescription(offer);

  const answer = await state.peerConnection.createAnswer();

  await state.peerConnection.setLocalDescription(answer);

  console.log("Answer:", answer);

  send(JSON.stringify({ type: "answer", answer: answer }));
}

export async function setRemoteAnswer(answer) {
  await state.peerConnection.setRemoteDescription(answer);
}

export function sendData(buffer) {
  if (state.dataChannel.readyState === "open") {
    state.dataChannel.send(buffer);
  }
}

export function sendFileMeta(file) {
  if (state.dataChannel?.readyState !== "open") return;

  const fileMeta = {
    name: file.name,
    size: file.size,
    type: file.type,
  };
  state.dataChannel.send(JSON.stringify({ type: "file-meta", fileMeta: fileMeta }));
}
