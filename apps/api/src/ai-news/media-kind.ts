/** Only direct video files are supported in a news card; other URLs remain images. */
export function newsMediaKind(url: string): "image" | "video" {
  try {
    return /\.(mp4|webm|mov|m4v)$/i.test(
      new URL(url, "https://pulse.invalid").pathname,
    )
      ? "video"
      : "image";
  } catch {
    return "image";
  }
}
