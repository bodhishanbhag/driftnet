/** A small FITS reader: enough for SPHEREx cutouts (image HDUs, any BITPIX, BSCALE/BZERO). */

export type Header = Record<string, string | number | boolean>;

export interface Hdu {
  header: Header;
  /** Byte offset of the data unit and its length (unpadded). */
  offset: number;
  bytes: number;
}

const BLOCK = 2880;

function parseValue(raw: string): string | number | boolean {
  const v = raw.trim();
  if (v.startsWith("'")) {
    const end = v.indexOf("'", 1);
    return (end > 0 ? v.slice(1, end) : v.slice(1)).replace(/''/g, "'").trimEnd();
  }
  const noComment = v.split("/")[0]!.trim();
  if (noComment === "T") return true;
  if (noComment === "F") return false;
  const n = Number(noComment.replace(/D/i, "E"));
  return Number.isFinite(n) && noComment !== "" ? n : noComment;
}

export function readHdus(buf: ArrayBuffer): Hdu[] {
  const text = new TextDecoder("ascii");
  const out: Hdu[] = [];
  let pos = 0;
  while (pos + BLOCK <= buf.byteLength) {
    const header: Header = {};
    let ended = false;
    while (!ended && pos + BLOCK <= buf.byteLength) {
      const block = text.decode(buf.slice(pos, pos + BLOCK));
      pos += BLOCK;
      for (let i = 0; i < BLOCK; i += 80) {
        const card = block.slice(i, i + 80);
        const key = card.slice(0, 8).trim();
        if (key === "END") {
          ended = true;
          break;
        }
        if (card[8] === "=" && key) header[key] = parseValue(card.slice(10));
      }
    }
    if (!ended) break;
    const bitpix = Math.abs(Number(header.BITPIX ?? 8));
    const naxis = Number(header.NAXIS ?? 0);
    let n = naxis > 0 ? 1 : 0;
    for (let i = 1; i <= naxis; i++) n *= Number(header[`NAXIS${i}`] ?? 0);
    const bytes = (bitpix / 8) * Number(header.GCOUNT ?? 1) * (Number(header.PCOUNT ?? 0) + n);
    out.push({ header, offset: pos, bytes });
    pos += Math.ceil(bytes / BLOCK) * BLOCK;
  }
  return out;
}

export interface Image2D {
  width: number;
  height: number;
  /** Row-major, row 0 = FITS y = 1. NaN for blanks. */
  data: Float32Array;
  header: Header;
}

export function readImage(buf: ArrayBuffer, hdu: Hdu): Image2D {
  const h = hdu.header;
  const width = Number(h.NAXIS1);
  const height = Number(h.NAXIS2);
  const bitpix = Number(h.BITPIX);
  const scale = Number(h.BSCALE ?? 1);
  const zero = Number(h.BZERO ?? 0);
  const blank = h.BLANK === undefined ? null : Number(h.BLANK);
  const view = new DataView(buf, hdu.offset, hdu.bytes);
  const data = new Float32Array(width * height);
  const step = Math.abs(bitpix) / 8;
  for (let i = 0; i < data.length; i++) {
    const o = i * step;
    let v: number;
    switch (bitpix) {
      case -32:
        v = view.getFloat32(o, false);
        break;
      case -64:
        v = view.getFloat64(o, false);
        break;
      case 16:
        v = view.getInt16(o, false);
        break;
      case 32:
        v = view.getInt32(o, false);
        break;
      case 8:
        v = view.getUint8(o);
        break;
      default:
        throw new Error(`unsupported BITPIX ${bitpix}`);
    }
    data[i] = blank !== null && bitpix > 0 && v === blank ? Number.NaN : v * scale + zero;
  }
  return { width, height, data, header: h };
}

/** The science image of a SPHEREx cutout: EXTNAME IMAGE, else the first 2-D image. */
export function findImage(buf: ArrayBuffer, name = "IMAGE"): Image2D | null {
  const hdus = readHdus(buf);
  const is2d = (d: Hdu) => Number(d.header.NAXIS) === 2 && d.header.XTENSION !== "BINTABLE" && Number(d.header.NAXIS1) > 0;
  const hdu = hdus.find((d) => String(d.header.EXTNAME ?? "").trim() === name && is2d(d)) ?? (name === "IMAGE" ? hdus.find(is2d) : undefined);
  return hdu ? readImage(buf, hdu) : null;
}
