import { state } from "./state.js";
import { send } from "./websocket.js";

export async function addIceCandidate(candidate) {
  await state.peerConnection.addIceCandidate(candidate);
}

export function createPeerConnection() {
  state.peerConnection = new RTCPeerConnection();

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
    state.dataChannel.onmessage = (event) => {
      console.log("размер  байтах", event.data.byteLength);
    };

    console.log("Получен DataChannel:", state.dataChannel.label);
  };
}

export function createDataChannel() {
  state.dataChannel = state.peerConnection.createDataChannel("file");

  state.dataChannel.onopen = () => {
    console.log("Канал успешно открыт! Теперь можно отправлять данные.");
    state.dataChannel.send("hello from host");
  };
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
