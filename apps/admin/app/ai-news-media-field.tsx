"use client";

import { useState } from "react";

export function AiNewsMediaField({
  defaultUrl,
  suggestedUrl,
}: {
  defaultUrl: string;
  suggestedUrl?: string | null;
}) {
  const [url, setUrl] = useState(defaultUrl);
  const external = url.startsWith("https://");
  const video = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(url);
  return (
    <div className="aiNewsMediaField">
      <label>
        Permitted HTTPS image or direct video URL
        <input
          name="mediaUrl"
          type="text"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
          placeholder="https://publisher.example/licensed-photo.jpg"
        />
      </label>
      <small>
        Use only media you may republish. Direct MP4/WebM/MOV links play as
        video; a news-page or video-platform link is not a media file.
      </small>
      {suggestedUrl ? (
        <div>
          <small>
            Publisher feed suggests{" "}
            <a href={suggestedUrl} target="_blank" rel="noopener noreferrer">
              this media URL
            </a>
            . Check the image, rights, and attribution before using it.
          </small>
          <button type="button" onClick={() => setUrl(suggestedUrl)}>
            Preview suggested media
          </button>
        </div>
      ) : null}
      {external ? (
        video ? (
          <video
            controls
            playsInline
            preload="metadata"
            src={url}
            style={{ maxWidth: "100%", maxHeight: 180 }}
          />
        ) : (
          // External media is intentionally previewed without fetching through the server.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="News media preview"
            style={{ maxWidth: "100%", maxHeight: 180, objectFit: "contain" }}
          />
        )
      ) : (
        <small>
          Current image is SidCraft fallback artwork. Paste a licensed URL to
          preview a real image or video.
        </small>
      )}
    </div>
  );
}
