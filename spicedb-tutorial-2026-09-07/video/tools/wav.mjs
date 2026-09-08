// WAV (RIFF, PCM16 mono) の読み書き。VOICEVOX の出力と mix が使う。

/**
 * @param {Buffer} buf
 * @returns {{sampleRate:number, channels:number, bitsPerSample:number,
 *            pcm:Int16Array, durationSec:number}}
 */
export function parseWav(buf) {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("RIFF/WAVE ではない");
  }
  let fmt = null;
  let data = null;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      data = buf.subarray(body, body + size);
    }
    off = body + size + (size % 2); // チャンクは 2 byte 境界
  }
  if (!fmt || !data) throw new Error("fmt / data チャンクが見つからない");
  if (fmt.audioFormat !== 1 || fmt.channels !== 1 || fmt.bitsPerSample !== 16) {
    throw new Error(`PCM16 mono 以外は未対応 (format=${fmt.audioFormat}, ch=${fmt.channels}, bits=${fmt.bitsPerSample})`);
  }
  // Int16Array は 2 byte 境界を要求するので、ずれていたらコピーする
  const aligned = data.byteOffset % 2 === 0 ? data : Buffer.from(data);
  const pcm = new Int16Array(aligned.buffer, aligned.byteOffset, Math.floor(data.length / 2));
  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitsPerSample: fmt.bitsPerSample,
    pcm,
    durationSec: pcm.length / fmt.sampleRate,
  };
}

/**
 * @param {Int16Array} pcm
 * @param {number} sampleRate
 * @returns {Buffer}
 */
export function buildWav(pcm, sampleRate) {
  const dataSize = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt チャンク長
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  Buffer.from(pcm.buffer, pcm.byteOffset, dataSize).copy(buf, 44);
  return buf;
}

/** 秒 → サンプル数 */
export function silenceSamples(sec, sampleRate) {
  return Math.round(sec * sampleRate);
}
