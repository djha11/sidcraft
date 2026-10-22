import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

async function browserBlob(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Unable to read the selected media file.");
  return response.blob();
}

export async function readMediaAsBase64(uri: string): Promise<string> {
  if (Platform.OS !== "web") {
    return FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  if (uri.startsWith("data:")) {
    const comma = uri.indexOf(",");
    if (comma < 0) throw new Error("The selected media file is invalid.");
    const metadata = uri.slice(0, comma);
    const payload = uri.slice(comma + 1);
    return metadata.includes(";base64")
      ? payload
      : btoa(decodeURIComponent(payload));
  }

  const blob = await browserBlob(uri);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read the selected media file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      if (comma < 0) reject(new Error("Unable to encode the selected media file."));
      else resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export async function mediaFileSize(uri: string): Promise<number> {
  if (Platform.OS === "web") return (await browserBlob(uri)).size || 1;
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && "size" in info ? info.size : 1;
}
