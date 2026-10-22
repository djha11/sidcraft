"use client";

import { useState } from "react";

export function MediaUrlFields() {
  const [fields, setFields] = useState([0]);
  return <fieldset className="mediaUrls"><legend>External image/MP4 links <i>optional · order is preserved</i></legend>{fields.map((id, index) => <div className="mediaUrlRow" key={id}><span>{index + 1}</span><input type="url" name="mediaUrls" placeholder={index === 0 ? "First image or video URL" : `Media ${index + 1} URL`} />{index ? <button aria-label={`Remove media URL ${index + 1}`} className="removeMediaUrl" type="button" onClick={() => setFields((current) => current.filter((value) => value !== id))}>×</button> : null}</div>)}<button className="addMediaUrl" type="button" disabled={fields.length >= 10} onClick={() => setFields((current) => [...current, Math.max(...current) + 1])}><b>＋</b> Add another link</button><p>Link 1 appears first. Users swipe left to see links 2, 3, and onward.</p></fieldset>;
}
