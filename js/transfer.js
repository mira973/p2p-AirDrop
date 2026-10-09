/* ==========================================================================
   transfer.js — конвейер отправки файла по RTCDataChannel.

   Пропускная способность улучшена тремя приёмами:
   1. Чанк 256 КиБ вместо 64 КиБ — вчетверо меньше вызовов slice/arrayBuffer/send
      на файл, то есть меньше накладных расходов на кадрирование.
   2. Backpressure по событию bufferedamountlow вместо опроса setTimeout(20 мс):
      нет искусственной задержки на каждом ожидании, но буфер жёстко ограничен.
   3. Чтение следующего чанка начинается до того, как отправлен текущий, поэтому
      время чтения из файла перекрывается с передачей по сети.
   ========================================================================== */

/** Практический максимум одного SCTP-сообщения в браузерах. */
export const CHUNK_SIZE = 256 * 1024;

/** Выше этой отметки отправка приостанавливается, чтобы буфер не рос бесконтрольно. */
export const BUFFER_HIGH_WATER = 4 * 1024 * 1024;

/** До этой отметки буфер должен опуститься, чтобы отправка продолжилась. */
export const BUFFER_LOW_WATER = 1 * 1024 * 1024;

/** Страховка на случай, если событие освобождения буфера не придёт. */
export const DRAIN_TIMEOUT_MS = 2000;

function readChunk(file, offset) {
  return file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
}

/**
 * Ждём, пока канал переварит уже отправленное.
 * Возвращаемся по событию bufferedamountlow, по закрытию канала или по таймауту.
 */
function waitForBufferDrain(channel) {
  if (channel.bufferedAmount <= BUFFER_HIGH_WATER) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;

    const finish = () => {
      if (settled) return;

      settled = true;
      channel.removeEventListener("bufferedamountlow", handleLowWater);
      channel.removeEventListener("close", finish);
      channel.removeEventListener("error", finish);
      clearTimeout(timer);
      resolve();
    };

    function handleLowWater() {
      if (channel.bufferedAmount <= BUFFER_HIGH_WATER) finish();
    }

    timer = setTimeout(finish, DRAIN_TIMEOUT_MS);

    channel.addEventListener("bufferedamountlow", handleLowWater);
    channel.addEventListener("close", finish);
    channel.addEventListener("error", finish);
  });
}

/** Сообщение с метаданными файла; batch нужен интерфейсу для «Файл i из n». */
export function sendFileMeta(channel, file, batch) {
  const payload = {
    type: "file-meta",
    fileMeta: { name: file.name, size: file.size, type: file.type },
  };

  if (batch) payload.batch = batch;

  channel.send(JSON.stringify(payload));
}

/**
 * Отправляет файл целиком, сообщая о прогрессе через onProgress(отправлено байт).
 * Бросает Error("channel-closed"), если канал закрылся во время передачи.
 */
export async function sendFile(channel, file, batch, onProgress) {
  sendFileMeta(channel, file, batch);

  // Файл нулевой длины: получатель завершит его сразу по метаданным.
  if (file.size === 0) return;

  let sentBytes = 0;
  let nextChunk = readChunk(file, 0);

  while (sentBytes < file.size) {
    const buffer = await nextChunk;
    const nextOffset = sentBytes + buffer.byteLength;

    nextChunk = nextOffset < file.size ? readChunk(file, nextOffset) : null;

    await waitForBufferDrain(channel);

    if (channel.readyState !== "open") {
      throw new Error("channel-closed");
    }

    channel.send(buffer);

    sentBytes = nextOffset;
    onProgress(sentBytes);
  }
}
