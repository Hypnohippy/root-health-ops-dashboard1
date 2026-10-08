// Read container duration from the downloaded bytes, never a client-provided duration.
export function videoDurationSeconds(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number, size: number) => String.fromCharCode(...bytes.subarray(at, at + size));
  function boxes(start: number, end: number): number {
    for (let at = start; at + 8 <= end;) {
      let size = view.getUint32(at), header = 8;
      if (size === 1) { if (at + 16 > end) break; size = Number(view.getBigUint64(at + 8)); header = 16; }
      if (size === 0) size = end - at;
      if (size < header || at + size > end) break;
      const type = tag(at + 4, 4), data = at + header;
      if (type === "mvhd") {
        const version = bytes[data], scaleAt = data + (version === 1 ? 20 : 12), durationAt = scaleAt + 4;
        if (version > 1 || durationAt + (version === 1 ? 8 : 4) > at + size) break;
        const scale = view.getUint32(scaleAt), duration = version === 1 ? Number(view.getBigUint64(durationAt)) : view.getUint32(durationAt);
        if (scale && duration) return duration / scale;
      }
      if (type === "moov") { const found = boxes(data, at + size); if (found) return found; }
      at += size;
    }
    return 0;
  }
  function vint(at: number, id: boolean): { value: number; next: number; unknown: boolean } {
    if (at >= bytes.length || bytes[at] === 0) throw Error("Invalid WebM duration metadata.");
    let length = 1, mask = 128; while (!(bytes[at] & mask)) { length++; mask >>= 1; }
    if (length > 8 || at + length > bytes.length) throw Error("Invalid WebM duration metadata.");
    let value = id ? bytes[at] : bytes[at] & (mask - 1), unknown = !id && value === mask - 1;
    for (let i = 1; i < length; i++) { value = value * 256 + bytes[at + i]; unknown = unknown && bytes[at + i] === 255; }
    return { value, next: at + length, unknown };
  }
  function webm(start: number, end: number, depth = 0): number {
    if (depth > 3) return 0;
    let scale = 1000000, duration = 0;
    for (let at = start; at < end;) {
      const id = vint(at, true), size = vint(id.next, false), stop = size.unknown ? end : size.next + size.value;
      if (stop > end || stop <= at) break;
      if (id.value === 0x18538067 || id.value === 0x1549a966) { const found = webm(size.next, stop, depth + 1); if (found) return found; }
      if (id.value === 0x2ad7b1) { scale = 0; for (let i = size.next; i < stop; i++) scale = scale * 256 + bytes[i]; }
      if (id.value === 0x4489) { if (size.value === 4) duration = view.getFloat32(size.next); if (size.value === 8) duration = view.getFloat64(size.next); }
      at = stop;
    }
    return duration * scale / 1e9;
  }
  const duration = bytes.length >= 4 && view.getUint32(0) === 0x1a45dfa3 ? webm(0, bytes.length) : boxes(0, bytes.length);
  if (!Number.isFinite(duration) || duration <= 0) throw Error("Cannot verify this video's duration. Export a standard MP4/MOV/WebM with duration metadata and upload it again.");
  return duration;
}
