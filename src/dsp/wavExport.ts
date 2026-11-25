/**
 * Encodes multi-channel Float32Array PCM buffers into a standard RIFF WAVE ArrayBuffer.
 */
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
  bitDepth: 16 | 32 = 16,
): ArrayBuffer {
  const numChannels = Math.max(1, channels.length);
  const length = channels[0]?.length ?? 0;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteLength = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true); // 1 = PCM, 3 = IEEE Float
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, "data");
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  if (bitDepth === 32) {
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const s = Math.max(-1, Math.min(1, channels[ch][i] ?? 0));
        view.setFloat32(offset, s, true);
        offset += 4;
      }
    }
  } else {
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const clamped = Math.max(-1, Math.min(1, channels[ch][i] ?? 0));
        const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        view.setInt16(offset, Math.round(int16), true);
        offset += 2;
      }
    }
  }

  return buffer;
}
