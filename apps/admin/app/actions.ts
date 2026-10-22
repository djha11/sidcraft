"use server";
"use server";
import { redirect } from "next/navigation";
import { parseSourceImport } from "./source-import";

const apiUrl = process.env.PULSE_API_URL ?? "http://127.0.0.1:4000";
const adminKey =
  process.env.ADMIN_API_KEY ?? "development-admin-key-change-before-prod";
export async function createPoll(form: FormData) {
  const responseType = String(form.get("responseType")) as
    "choice" | "open_text";
  const scope = String(form.get("scope")) as
    "global" | "country" | "india" | "state" | "lok_sabha";
  const stateCode =
    String(form.get("stateCode") ?? "")
      .trim()
      .toUpperCase() || null;
  const constituencyCode =
    String(form.get("constituencyCode") ?? "").trim() || null;
  const mediaFile = form.get("mediaFile");
  const mediaLink = String(form.get("mediaUrl") ?? "").trim();
  let media: {
    kind: "image" | "video";
    url: string;
    originalName?: string;
  } | null = null;
  if (mediaFile instanceof File && mediaFile.size > 0) {
    if (mediaFile.size > 4_000_000)
      redirect(
        "/?view=opinion&adminError=Opinion%20media%20must%20be%20under%204MB",
      );
    const kind = mediaFile.type.startsWith("video/") ? "video" : "image";
    media = {
      kind,
      url: `data:${mediaFile.type || "application/octet-stream"};base64,${Buffer.from(await mediaFile.arrayBuffer()).toString("base64")}`,
      originalName: mediaFile.name,
    };
  } else if (mediaLink) {
    media = {
      kind: String(form.get("mediaKind")) === "video" ? "video" : "image",
      url: mediaLink,
    };
  }
  const body = {
    question: String(form.get("question")),
    topic: String(form.get("topic")),
    responseType,
    commentMode: String(form.get("commentMode")),
    options:
      responseType === "choice"
        ? form
            .getAll("optionLabel")
            .map(String)
            .map((value) => value.trim())
            .filter(Boolean)
        : [],
    optionMediaUrls:
      responseType === "choice"
        ? form
            .getAll("optionMediaUrl")
            .map((value) => String(value).trim() || null)
        : [],
    opensAt: new Date(String(form.get("opensAt"))).toISOString(),
    closesAt: new Date(String(form.get("closesAt"))).toISOString(),
    target: {
      scope,
      countryCode:
        scope === "global" ? null : String(form.get("countryCode") || "IN"),
      stateCode: scope === "state" || scope === "lok_sabha" ? stateCode : null,
      lokSabhaConstituencyCode: scope === "lok_sabha" ? constituencyCode : null,
    },
    media,
  };
  try {
    const response = await fetch(`${apiUrl}/v1/admin/polls`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pulse-admin-key": adminKey,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error((await response.json()).error ?? "CREATE_FAILED");
    const poll = (await response.json()) as { id: string };
    redirect(
      `/?view=opinion&adminSuccess=Opinion%20published&created=${poll.id}`,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT")
      throw error;
    redirect(
      `/?view=opinion&adminError=${encodeURIComponent(error instanceof Error ? error.message : "CREATE_FAILED")}`,
    );
  }
}

export async function createPublication(form: FormData) {
  const files = form
    .getAll("mediaFiles")
    .filter((value): value is File => value instanceof File && value.size > 0)
    .slice(0, 10);
  const media = await Promise.all(
    files.map(async (file) => ({
      kind: file.type.startsWith("video/") ? "video" : "image",
      mimeType: file.type || "application/octet-stream",
      originalName: file.name,
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    })),
  );
  const mediaUrls = form
    .getAll("mediaUrls")
    .map((value) => String(value).trim())
    .filter(Boolean)
    .slice(0, 10);
  const body = {
    kind: String(form.get("kind")),
    category: String(form.get("category")),
    headline: String(form.get("headline")),
    summary: String(form.get("summary")),
    ...(mediaUrls.length ? { mediaUrls } : {}),
    ...(media.length ? { media } : {}),
    sourceName: String(form.get("sourceName")),
    sourceUrl: String(form.get("sourceUrl")),
    evidenceNote: String(form.get("evidenceNote")),
  };
  try {
    const response = await fetch(`${apiUrl}/v1/admin/publications`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pulse-admin-key": adminKey,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error((await response.json()).error ?? "PUBLISH_FAILED");
    const item = (await response.json()) as { id: string };
    redirect(`/?published=${item.id}`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT")
      throw error;
    redirect(
      `/?publishError=${encodeURIComponent(error instanceof Error ? error.message : "PUBLISH_FAILED")}`,
    );
  }
}

async function adminMutation(
  path: string,
  method: string,
  body: unknown,
  ok: string,
) {
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-pulse-admin-key": adminKey,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error((await response.json()).error ?? "ACTION_FAILED");
    redirect(`/?adminSuccess=${encodeURIComponent(ok)}`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT")
      throw error;
    redirect(
      `/?adminError=${encodeURIComponent(error instanceof Error ? error.message : "ACTION_FAILED")}`,
    );
  }
}
async function adminMutationTo(
  path: string,
  method: string,
  body: unknown,
  ok: string,
  view: string,
) {
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-pulse-admin-key": adminKey,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error((await response.json()).error ?? "ACTION_FAILED");
    redirect(`/?view=${view}&adminSuccess=${encodeURIComponent(ok)}`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT")
      throw error;
    const message = error instanceof Error ? error.message : "ACTION_FAILED";
    redirect(
      `/?view=${view}&adminError=${encodeURIComponent(message === "CANDIDATE_CLOSED" ? "This story was already published or rejected. Refresh the queue to see its current status." : message)}`,
    );
  }
}
export async function reviewVerification(form: FormData) {
  const status = String(form.get("status"));
  await adminMutationTo(
    `/v1/admin/verification-requests/${form.get("id")}`,
    "PATCH",
    {
      status,
      verificationType:
        status === "approved"
          ? String(form.get("verificationType") || "general")
          : null,
      note: String(form.get("note") ?? ""),
    },
    `Verification ${status}`,
    "verification",
  );
}
export async function setProfileVerification(form: FormData) {
  const enabled = String(form.get("enabled")) === "true",
    returnView = String(form.get("returnView") || "verification");
  await adminMutationTo(
    `/v1/admin/profiles/${form.get("id")}/verification`,
    "PATCH",
    {
      enabled,
      verificationType: enabled
        ? String(form.get("verificationType") || "general")
        : null,
    },
    enabled ? "Verification enabled" : "Verification disabled",
    returnView,
  );
}
export async function moderateContent(form: FormData) {
  const action = String(form.get("action"));
  await adminMutationTo(
    `/v1/admin/content/${form.get("kind")}/${form.get("id")}/moderate`,
    "POST",
    {
      action,
      reason: String(form.get("reason") || "Reviewed by trust and safety"),
    },
    `Content ${action === "delete" ? "removed" : "warned"}`,
    "moderation",
  );
}
export async function createCampaign(form: FormData) {
  await adminMutation(
    "/v1/admin/campaigns",
    "POST",
    {
      name: String(form.get("name")),
      advertiser: String(form.get("advertiser")),
      headline: String(form.get("headline")),
      destinationUrl: String(form.get("destinationUrl")),
      mediaUrl: String(form.get("mediaUrl") || "") || null,
      status: String(form.get("status")),
    },
    "Campaign saved",
  );
}
export async function updatePlatformSetting(form: FormData) {
  await adminMutationTo(
    `/v1/admin/settings/${form.get("key")}`,
    "PUT",
    {
      enabled: String(form.get("enabled")) === "true",
      value: String(form.get("value") ?? "") || null,
    },
    "Setting saved",
    "settings",
  );
}
export async function createBroadcast(form: FormData) {
  await adminMutationTo(
    "/v1/admin/broadcasts",
    "POST",
    {
      title: String(form.get("title")),
      message: String(form.get("message")),
      audience: String(form.get("audience")),
      deepLink: String(form.get("deepLink") ?? "") || null,
    },
    "Notification sent",
    "notifications",
  );
}
export async function addAiNewsSource(form: FormData) {
  await adminMutationTo(
    "/v1/admin/ai-news/sources",
    "POST",
    {
      name: String(form.get("name")),
      feedUrl: String(form.get("feedUrl")),
      websiteUrl: String(form.get("websiteUrl") || "") || null,
      category: String(form.get("category")),
      enabled: true,
      pollingMinutes: Number(form.get("pollingMinutes") || 2),
    },
    "News source added",
    "ai-news",
  );
}
export async function importAiNewsSources(form: FormData) {
  if (form.get("approved") !== "on") {
    redirect(
      "/?view=ai-news&adminError=Confirm%20source%20rights%20and%20cloud%20usage%20before%20importing",
    );
  }
  let parsed: ReturnType<typeof parseSourceImport>;
  try {
    parsed = parseSourceImport(String(form.get("sources") ?? ""));
  } catch {
    redirect(
      "/?view=ai-news&adminError=Import%201-100%20valid%20name%7Chttps-feed%7Ccategory%7Cminutes%20rows",
    );
  }
  let added = 0;
  let skipped = 0;
  for (const row of parsed) {
    const response = await fetch(`${apiUrl}/v1/admin/ai-news/sources`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pulse-admin-key": adminKey,
      },
      body: JSON.stringify({
        name: row.name,
        feedUrl: row.feedUrl,
        websiteUrl: null,
        category: row.category,
        enabled: true,
        pollingMinutes: row.pollingMinutes,
      }),
    });
    if (response.status === 201) added++;
    else if (response.status === 409) skipped++;
    else
      redirect(
        `/?view=ai-news&adminError=${encodeURIComponent(`Imported ${added}; failed on ${row.name} (${response.status}). Check the source details.`)}`,
      );
  }
  redirect(
    `/?view=ai-news&adminSuccess=${encodeURIComponent(`Imported ${added} source(s); skipped ${skipped} duplicate(s).`)}`,
  );
}
export async function updatePublishedNews(form: FormData) {
  await adminMutationTo(
    `/v1/admin/publications/${String(form.get("id"))}`,
    "PATCH",
    {
      category: String(form.get("category")),
      headline: String(form.get("headline")),
      summary: String(form.get("summary")),
      mediaUrl: String(form.get("mediaUrl")),
      evidenceNote: String(form.get("evidenceNote")),
    },
    "Published news updated",
    "news",
  );
}
export async function toggleAiNewsSource(form: FormData) {
  await adminMutationTo(
    `/v1/admin/ai-news/sources/${form.get("id")}`,
    "PATCH",
    { enabled: String(form.get("enabled")) === "true" },
    "News source updated",
    "ai-news",
  );
}
export async function updateAiNewsSourceInterval(form: FormData) {
  const id = String(form.get("id") ?? "");
  const pollingMinutes = Number(form.get("pollingMinutes"));
  if (
    !id ||
    !Number.isInteger(pollingMinutes) ||
    pollingMinutes < 2 ||
    pollingMinutes > 1440
  ) {
    redirect(
      "/?view=ai-news&adminError=Choose%20an%20interval%20from%202%20to%201440%20minutes",
    );
  }
  await adminMutationTo(
    `/v1/admin/ai-news/sources/${id}`,
    "PATCH",
    { pollingMinutes },
    `Source check interval updated to ${pollingMinutes} minutes`,
    "ai-news",
  );
}
export async function updateAiNewsSourceCategory(form: FormData) {
  const id = String(form.get("id") ?? "");
  const category = String(form.get("category") ?? "");
  if (
    !id ||
    ![
      "india",
      "world",
      "politics",
      "business",
      "stocks",
      "tech",
      "sports",
      "entertainment",
    ].includes(category)
  ) {
    redirect("/?view=ai-news&adminError=Invalid%20source%20category");
  }
  await adminMutationTo(
    `/v1/admin/ai-news/sources/${id}`,
    "PATCH",
    { category },
    `Source category updated to ${category}`,
    "ai-news",
  );
}
export async function setAiNewsPaused(form: FormData) {
  const paused = String(form.get("paused")) === "true";
  await adminMutationTo(
    "/v1/admin/ai-news/control",
    "PUT",
    { paused },
    paused ? "News intake paused" : "News intake resumed",
    "ai-news",
  );
}
export async function reviewAiNews(form: FormData) {
  await adminMutationTo(
    `/v1/admin/ai-news/${form.get("id")}`,
    "PATCH",
    {
      finalHeadline: String(form.get("finalHeadline")),
      finalSummary: String(form.get("finalSummary")),
      mediaUrl: String(form.get("mediaUrl")),
      mediaAttribution: String(form.get("mediaAttribution")),
    },
    "News review saved",
    "ai-news",
  );
}
export async function publishAiNews(form: FormData) {
  await adminMutationTo(
    `/v1/admin/ai-news/${form.get("id")}/publish`,
    "POST",
    {},
    "News published",
    "ai-news",
  );
}
export async function rejectAiNews(form: FormData) {
  await adminMutationTo(
    `/v1/admin/ai-news/${form.get("id")}/reject`,
    "POST",
    {},
    "News candidate rejected",
    "ai-news",
  );
}
