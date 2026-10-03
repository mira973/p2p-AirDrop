import { state } from "./state.js";
import { send } from "./websocket.js";

export function createPeerConnection() {
  state.peerConnection = new RTCPeerConnection();
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
