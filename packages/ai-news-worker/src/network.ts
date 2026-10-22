import { isIP } from "node:net";

export function publicAddress(address: string) {
  if (isIP(address) === 6)
    return (
      !/^(::1$|::$|fc|fd|fe8|fe9|fea|feb|ff)/i.test(address) &&
      !address.toLowerCase().startsWith("::ffff:")
    );
  const parts = address.split(".").map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  if (a === undefined || b === undefined) return false;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && parts[2] === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
