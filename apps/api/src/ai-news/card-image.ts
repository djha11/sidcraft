import { deflateSync } from "node:zlib";

function crc32(data: Buffer) {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++)
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(name: string, bytes: Buffer) {
  const label = Buffer.from(name);
  const length = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  crc.writeUInt32BE(crc32(Buffer.concat([label, bytes])));
  return Buffer.concat([length, label, bytes, crc]);
}

/** Original SidCraft abstract artwork. No third-party image rights are assumed. */
export function cardPng(category: string) {
  const width = 800,
    height = 450;
  const palette: Record<string, [number, number, number]> = {
    politics: [44, 76, 132],
    sports: [19, 130, 117],
    entertainment: [126, 67, 151],
    business: [32, 104, 147],
    stocks: [30, 117, 139],
    tech: [38, 97, 177],
    india: [220, 108, 60],
    world: [62, 101, 146],
  };
  const [r, g, b] = palette[category] ?? [37, 99, 170];
  const pixels = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const offset = row + 1 + x * 3;
      const wave =
        Math.sin(x / 48 + y / 75) * 14 + Math.sin((x - y) / 120) * 16;
      const glow = Math.max(0, 1 - Math.hypot(x - 570, y - 110) / 380) * 44;
      pixels[offset] = Math.min(255, r + 22 + wave + glow);
      pixels[offset + 1] = Math.min(255, g + 22 + wave + glow);
      pixels[offset + 2] = Math.min(255, b + 25 + wave + glow);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
