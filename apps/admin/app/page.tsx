import Link from "next/link";
import {
  addAiNewsSource,
  setAiNewsPaused,
  toggleAiNewsSource,
  updateAiNewsSourceInterval,
  updateAiNewsSourceCategory,
  updatePublishedNews,
  importAiNewsSources,
  reviewAiNews,
  publishAiNews,
  rejectAiNews,
  createBroadcast,
  createCampaign,
  createPublication,
  moderateContent,
  reviewVerification,
  setProfileVerification,
  updatePlatformSetting,
} from "./actions";
import { MediaUrlFields } from "./media-url-fields";
import { AiNewsMediaField } from "./ai-news-media-field";
import { OpinionConsole, type AdminPoll } from "./opinion-console";
export const dynamic = "force-dynamic";
const apiUrl = process.env.PULSE_API_URL ?? "http://127.0.0.1:4000",
  adminKey =
    process.env.ADMIN_API_KEY ?? "development-admin-key-change-before-prod";
type Profile = {
  id: string;
  displayName: string;
  handle: string;
  verificationType: string | null;
  status: string;
};
type Request = {
  id: string;
  displayName: string;
  handle: string;
  requestedType: string;
  evidenceUrl: string | null;
  note: string | null;
  status: string;
  createdAt: string;
};
type Content = {
  id: string;
  kind: string;
  title: string;
  owner: string | null;
  status: string;
  createdAt: string;
};
type Campaign = {
  id: string;
  name: string;
  advertiser: string;
  status: string;
};
type Publication = {
  id: string;
  kind: string;
  headline: string;
  summary: string;
  category: string;
  mediaUrl: string;
  evidenceNote: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt: string;
};
type AdminSetting = {
  key: string;
  enabled: boolean;
  value: string | null;
  updatedAt: string;
};
type Broadcast = {
  id: string;
  title: string;
  message: string;
  audience: string;
  status: string;
  deepLink: string | null;
  createdAt: string;
};
type Audit = {
  id: string;
  targetType: string;
  targetId: string;
  action: string;
  reason: string;
  createdAt: string;
};
type AiSource = {
  id: string;
  name: string;
  feedUrl: string;
  category: string;
  enabled: boolean;
  pollingMinutes: number;
  lastFetchedAt: string | null;
  lastError: string | null;
};
type AiCandidate = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  originalHeadline: string;
  description: string;
  suggestedMediaUrl: string | null;
  storyId: string;
  draftMethod: string;
  category: string;
  status: string;
  finalHeadline: string | null;
  finalSummary: string | null;
  mediaUrl: string | null;
  mediaAttribution: string | null;
  createdAt: string;
};
type LocalModelStatus = {
  status:
    | "ready"
    | "offline"
    | "model_missing"
    | "disabled"
    | "invalid_url"
    | "configured"
    | "needs_api_key";
  model: string;
  provider?: string;
};
type Region = { code: string; name: string };
type Constituency = {
  code: string;
  stateCode: string;
  name: string;
  number: number;
};
async function load<T>(path: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${apiUrl}${path}`, {
      headers: { "x-pulse-admin-key": adminKey },
      cache: "no-store",
    });
    return r.ok ? ((await r.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}
function countryList() {
  const names = new Intl.DisplayNames(["en"], { type: "region" }),
    unique = new Map<string, { code: string; name: string }>(),
    excluded = new Set([
      "European Union",
      "Eurozone",
      "United Nations",
      "Pseudo-Accents",
      "Pseudo-Bidi",
      "Canary Islands",
      "Ceuta & Melilla",
      "Outlying Oceania",
    ]);
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b),
        name = names.of(code);
      if (
        name &&
        name !== code &&
        !name.includes("Unknown Region") &&
        !excluded.has(name) &&
        !unique.has(name)
      )
        unique.set(name, { code, name });
    }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}
const nav = [
  ["dashboard", "⌂", "Dashboard"],
  ["content", "▣", "Content Management"],
  ["opinion", "▥", "SidCraft Opinions"],
  ["news", "▤", "News Articles"],
  ["ai-news", "✦", "AI News Queue"],
  ["users", "♙", "User Management"],
  ["verification", "◇", "Verification"],
  ["moderation", "⚑", "Moderation"],
  ["analytics", "▥", "Analytics"],
  ["monetization", "$", "Monetization"],
  ["notifications", "♧", "Notifications"],
  ["settings", "⚙", "Platform Settings"],
  ["logs", "≣", "Reports & Logs"],
];
const badgeOptions = (
  <>
    <option value="general">🔵 Blue · standard</option>
    <option value="grey">⚪ Grey · authentic</option>
    <option value="government">🟣 Violet · government</option>
    <option value="media">🟢 Green · media</option>
    <option value="business">🔷 Gray-blue · business</option>
  </>
);
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams,
    view = q.view ?? "dashboard",
    search = (q.q ?? "").toLowerCase();
  const [
    requests,
    profiles,
    content,
    campaigns,
    news,
    reels,
    settings,
    broadcasts,
    audits,
    pollHistory,
    regions,
    constituencies,
    aiSources,
    aiCandidates,
    aiControl,
    aiModel,
  ] = await Promise.all([
    load("/v1/admin/verification-requests", { items: [] } as {
      items: Request[];
    }),
    load("/v1/admin/profiles", { items: [] } as { items: Profile[] }),
    load("/v1/admin/content", { items: [] } as { items: Content[] }),
    load("/v1/admin/campaigns", { items: [] } as { items: Campaign[] }),
    load("/v1/admin/publications?kind=news", { items: [] } as {
      items: Publication[];
    }),
    load("/v1/admin/publications?kind=reel", { items: [] } as {
      items: Publication[];
    }),
    load("/v1/admin/settings", { items: [] } as { items: AdminSetting[] }),
    load("/v1/admin/broadcasts", { items: [] } as { items: Broadcast[] }),
    load("/v1/admin/audits", { items: [] } as { items: Audit[] }),
    load("/v1/admin/polls", { items: [] } as { items: AdminPoll[] }),
    load("/v1/geography/regions", [] as Region[]),
    load("/v1/geography/constituencies", [] as Constituency[]),
    load("/v1/admin/ai-news/sources", { items: [] } as { items: AiSource[] }),
    load("/v1/admin/ai-news", { items: [] } as { items: AiCandidate[] }),
    load("/v1/admin/ai-news/control", { paused: false }),
    view === "ai-news"
      ? load("/v1/admin/ai-news/model-status", {
          status: "offline",
          model: "pulse-news:v1",
        } as LocalModelStatus)
      : Promise.resolve({
          status: "offline",
          model: "pulse-news:v1",
        } as LocalModelStatus),
  ]);
  const matches = (s: string) => !search || s.toLowerCase().includes(search),
    kind = q.kind ?? "all",
    requestStatus = q.status ?? "all",
    filteredContent = content.items.filter(
      (x) =>
        matches(`${x.title} ${x.owner} ${x.id}`) &&
        (kind === "all" || x.kind === kind),
    ),
    filteredProfiles = profiles.items.filter((x) =>
      matches(`${x.displayName} ${x.handle} ${x.id}`),
    ),
    filteredRequests =
      requestStatus === "all"
        ? requests.items
        : requests.items.filter((x) => x.status === requestStatus);
  return (
    <div className="adminShell">
      <aside className="sidebar">
        <div className="logo">
          <span>⌁</span>
          <div>
            <b>SidCraft</b>
            <small>Admin Dashboard</small>
          </div>
        </div>
        <nav>
          {nav.map(([id, icon, label]) => (
            <Link
              className={view === id ? "active" : ""}
              href={`/?view=${id}`}
              key={id}
            >
              <i>{icon}</i>
              {label}
              {id === "verification" &&
              requests.items.filter((x) => x.status === "pending").length ? (
                <em>
                  {requests.items.filter((x) => x.status === "pending").length}
                </em>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="sideFoot">
          <span>⌁</span>
          <b>Real People. Real Opinions.</b>
          <small>Manage. Engage. Empower.</small>
        </div>
      </aside>
      <main className="workspace">
        <div className="topbar">
          <form>
            <span>⌕</span>
            <input
              name="q"
              defaultValue={q.q}
              placeholder="Search all users, posts, articles and opinions…"
            />
          </form>
          <div className="topActions">
            <span>
              ▣{" "}
              {new Date().toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
            <Link className="notificationLink" href="/?view=notifications">
              ♧
              <b>
                {requests.items.filter((x) => x.status === "pending").length}
              </b>
            </Link>
            <div className="adminAvatar">A</div>
            <div>
              <strong>Admin</strong>
              <small>Super Admin</small>
            </div>
          </div>
        </div>
        <section className="page">
          {q.adminSuccess ? (
            <div className="toast success">✓ {q.adminSuccess}</div>
          ) : null}
          {q.adminError ? (
            <div className="toast error">! {q.adminError}</div>
          ) : null}
          {search ? (
            <SearchResults
              query={q.q ?? ""}
              profiles={filteredProfiles}
              content={filteredContent}
              news={news.items.filter((x) =>
                matches(`${x.headline} ${x.summary} ${x.sourceName}`),
              )}
              reels={reels.items.filter((x) =>
                matches(`${x.headline} ${x.summary} ${x.sourceName}`),
              )}
            />
          ) : (
            <>
              {view === "dashboard" ? (
                <Dashboard
                  profiles={profiles.items}
                  content={content.items}
                  requests={requests.items}
                  news={news.items}
                  reels={reels.items}
                />
              ) : null}
              {view === "verification" ? (
                <Verification
                  requests={filteredRequests}
                  allRequests={requests.items}
                  profiles={filteredProfiles}
                  status={requestStatus}
                />
              ) : null}
              {view === "users" ? <Users profiles={filteredProfiles} /> : null}
              {view === "content" || view === "moderation" ? (
                <Moderation
                  items={filteredContent}
                  title={
                    view === "content"
                      ? "Content Management"
                      : "Moderation & Reports"
                  }
                  view={view}
                  kind={kind}
                />
              ) : null}
              {view === "opinion" ? (
                <>
                  <Head
                    title="Create SidCraft Opinion"
                    copy="Build targeted polls with connected media and monitor aggregate results live."
                  />
                  <OpinionConsole
                    regions={regions}
                    constituencies={constituencies}
                    polls={pollHistory.items}
                    countries={countryList()}
                  />
                </>
              ) : null}
              {view === "news" ? <News items={news.items} /> : null}
              {view === "monetization" ? (
                <Monetization items={campaigns.items} />
              ) : null}
              {view === "ai-news" ? (
                <AiNews
                  sources={aiSources.items}
                  candidates={aiCandidates.items}
                  paused={aiControl.paused}
                  model={aiModel}
                />
              ) : null}
              {view === "analytics" ? (
                <Analytics
                  profiles={profiles.items}
                  content={content.items}
                  news={news.items}
                  reels={reels.items}
                />
              ) : null}
              {view === "notifications" ? (
                <Notifications items={broadcasts.items} />
              ) : null}
              {view === "settings" ? <Settings items={settings.items} /> : null}
              {view === "logs" ? <AuditLogs items={audits.items} /> : null}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
function Head({
  eyebrow = "CONTROL CENTER",
  title,
  copy,
  action,
}: {
  eyebrow?: string;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="pageHead">
      <div>
        <small>{eyebrow}</small>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action}
    </header>
  );
}
function Dashboard({
  profiles,
  content,
  requests,
  news,
  reels,
}: {
  profiles: Profile[];
  content: Content[];
  requests: Request[];
  news: Publication[];
  reels: Publication[];
}) {
  const cards = [
    ["Users", profiles.length, "Live database", "users"],
    [
      "Posts",
      content.filter((x) => x.kind === "post" || x.kind === "anonymous").length,
      "Live database",
      "content",
    ],
    ["Reels / Videos", reels.length, "Live database", "content"],
    ["News Articles", news.length, "Live database", "news"],
    [
      "Verification",
      requests.filter((x) => x.status === "pending").length,
      "Action needed",
      "verification",
    ],
    [
      "Moderation",
      content.filter((x) => x.status !== "active").length,
      "Review queue",
      "moderation",
    ],
  ];
  return (
    <>
      <Head
        title="Welcome back, Admin!"
        copy="Here’s what’s happening across SidCraft today."
        action={<div className="livePill">● Live system</div>}
      />
      <div className="kpis">
        {cards.map(([label, value, trend, target]) => (
          <Link href={`/?view=${target}`} className="kpi" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{trend}</small>
          </Link>
        ))}
      </div>
      <div className="dashboardGrid">
        <div className="card chart">
          <div className="cardHead">
            <div>
              <small>CURRENT DATABASE SNAPSHOT</small>
              <h2>Content mix</h2>
            </div>
          </div>
          <div className="chartBars">
            {[
              profiles.length,
              content.length,
              reels.length,
              news.length,
              requests.length,
            ].map((n, i) => {
              const max = Math.max(
                1,
                profiles.length,
                content.length,
                reels.length,
                news.length,
                requests.length,
              );
              return (
                <i
                  key={i}
                  style={{ height: `${Math.max(8, (n / max) * 100)}%` }}
                />
              );
            })}
          </div>
          <div className="legend">
            <span>● Users</span>
            <span>● Content</span>
            <span>● Reels</span>
            <span>● News</span>
            <span>● Requests</span>
          </div>
        </div>
        <div className="card">
          <div className="cardHead">
            <div>
              <small>QUICK ACTIONS</small>
              <h2>Operate SidCraft</h2>
            </div>
          </div>
          <div className="quick">
            <Link href="/?view=opinion">▥ Create SidCraft Opinion</Link>
            <Link href="/?view=news">▤ Push News Article</Link>
            <Link href="/?view=verification">◇ Review Verification</Link>
            <Link href="/?view=users">♙ Manage Users</Link>
            <Link href="/?view=moderation">⚑ View Reports</Link>
          </div>
        </div>
      </div>
      <div className="dashboardGrid">
        <div className="card">
          <div className="cardHead">
            <h2>Recent activity</h2>
            <Link href="/?view=logs">View all</Link>
          </div>
          {content.slice(0, 5).map((x) => (
            <div className="activity" key={x.id}>
              <span>{x.kind === "publication" ? "▤" : "●"}</span>
              <div>
                <b>{x.title}</b>
                <small>
                  {x.owner ?? "Identity protected"} · {x.status}
                </small>
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="cardHead">
            <h2>Attention required</h2>
            <Link href="/?view=moderation">Open queue</Link>
          </div>
          <div className="queue">
            <span>
              Pending verification{" "}
              <b>{requests.filter((x) => x.status === "pending").length}</b>
            </span>
            <span>
              Restricted content{" "}
              <b>{content.filter((x) => x.status !== "active").length}</b>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
function Verification({
  requests,
  allRequests,
  profiles,
  status,
}: {
  requests: Request[];
  allRequests: Request[];
  profiles: Profile[];
  status: string;
}) {
  const tabs = [
    ["all", "All"],
    ["pending", "Pending"],
    ["approved", "Approved"],
    ["rejected", "Rejected"],
  ];
  return (
    <>
      <Head
        eyebrow="TRUST & SAFETY"
        title="Verification Center"
        copy="Review requests and control badge assignments from one accountable workflow."
      />
      <div className="tabs">
        {tabs.map(([id, label]) => (
          <Link
            className={status === id ? "active" : ""}
            href={`/?view=verification&status=${id}`}
            key={id}
          >
            {label} (
            {id === "all"
              ? allRequests.length
              : allRequests.filter((x) => x.status === id).length}
            )
          </Link>
        ))}
      </div>
      <div className="card tableCard">
        <div className="cardHead">
          <h2>Verification requests</h2>
          <span>{requests.length} requests</span>
        </div>
        {requests.length ? (
          requests.map((r) => (
            <div className="dataRow verifyRow" key={r.id}>
              <div className="userCell">
                <i>{r.displayName[0]}</i>
                <span>
                  <b>{r.displayName}</b>
                  <small>
                    @{r.handle} · {r.status}
                  </small>
                </span>
              </div>
              <span className={r.status === "approved" ? "tag green" : "tag"}>
                {r.requestedType}
              </span>
              <span>{new Date(r.createdAt).toLocaleDateString()}</span>
              {r.status === "pending" ? (
                <>
                  <form action={reviewVerification} className="inlineAction">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value="approved" />
                    <select
                      name="verificationType"
                      defaultValue={r.requestedType}
                    >
                      {badgeOptions}
                    </select>
                    <button>✓ Approve</button>
                  </form>
                  <form action={reviewVerification} className="inlineAction">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value="rejected" />
                    <button className="danger">Reject</button>
                  </form>
                </>
              ) : (
                <span
                  className={
                    r.status === "approved"
                      ? "decision approved"
                      : "decision rejected"
                  }
                >
                  {r.status === "approved" ? "✓ Badge active" : "Rejected"}
                </span>
              )}
            </div>
          ))
        ) : (
          <Empty text="No verification requests" />
        )}
      </div>
      <div className="card profileManager">
        <div className="cardHead">
          <h2>Verified profile controls</h2>
          <span>
            {profiles.filter((x) => x.verificationType).length} active
          </span>
        </div>
        {profiles.map((p) => (
          <div className="dataRow verifyRow" key={p.id}>
            <div className="userCell">
              <i>{p.displayName[0]}</i>
              <span>
                <b>{p.displayName}</b>
                <small>@{p.handle}</small>
              </span>
            </div>
            <span className={p.verificationType ? "tag green" : "tag"}>
              {p.verificationType ?? "Not verified"}
            </span>
            <span />
            <form action={setProfileVerification} className="inlineAction">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="enabled" value="true" />
              <select
                name="verificationType"
                defaultValue={p.verificationType ?? "general"}
              >
                {badgeOptions}
              </select>
              <button>Enable / update</button>
            </form>
            <form action={setProfileVerification} className="inlineAction">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="enabled" value="false" />
              <button className="danger">Disable</button>
            </form>
          </div>
        ))}
      </div>
    </>
  );
}
function Users({ profiles }: { profiles: Profile[] }) {
  return (
    <>
      <Head
        title="User Management"
        copy="Search registered accounts and manage each verification badge directly."
      />
      <div className="card tableCard">
        <div className="tableHeader userAdminHeader">
          <b>User</b>
          <b>Status</b>
          <b>Badge</b>
          <b>Verification controls</b>
        </div>
        {profiles.length ? (
          profiles.map((p) => (
            <div className="dataRow userAdminRow" key={p.id}>
              <div className="userCell">
                <i>{p.displayName[0]}</i>
                <span>
                  <b>
                    {p.displayName}
                    {p.verificationType ? " ✓" : ""}
                  </b>
                  <small>@{p.handle}</small>
                </span>
              </div>
              <span className="tag green">{p.status}</span>
              <span className={p.verificationType ? "tag green" : "tag"}>
                {p.verificationType ?? "Not verified"}
              </span>
              <div className="userBadgeActions">
                <form action={setProfileVerification} className="inlineAction">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="enabled" value="true" />
                  <input type="hidden" name="returnView" value="users" />
                  <select
                    name="verificationType"
                    defaultValue={p.verificationType ?? "general"}
                  >
                    {badgeOptions}
                  </select>
                  <button>
                    {p.verificationType ? "Change badge" : "Verify"}
                  </button>
                </form>
                {p.verificationType ? (
                  <form
                    action={setProfileVerification}
                    className="inlineAction"
                  >
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="enabled" value="false" />
                    <input type="hidden" name="returnView" value="users" />
                    <button className="danger">Disable</button>
                  </form>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <Empty text="No registered users match" />
        )}
      </div>
    </>
  );
}
function SearchResults({
  query,
  profiles,
  content,
  news,
  reels,
}: {
  query: string;
  profiles: Profile[];
  content: Content[];
  news: Publication[];
  reels: Publication[];
}) {
  const total = profiles.length + content.length + news.length + reels.length;
  return (
    <>
      <Head
        eyebrow="GLOBAL SEARCH"
        title={`Results for “${query}”`}
        copy={`${total} matching records across registered users and published content.`}
      />
      <div className="searchSections">
        <div className="card">
          <div className="cardHead">
            <h2>Registered users</h2>
            <span>{profiles.length}</span>
          </div>
          {profiles.length ? (
            profiles.map((p) => (
              <div className="activity" key={p.id}>
                <span>{p.displayName[0]}</span>
                <div>
                  <b>{p.displayName}</b>
                  <small>
                    @{p.handle} · {p.status} ·{" "}
                    {p.verificationType ?? "not verified"}
                  </small>
                </div>
                <Link
                  href={`/?view=verification&q=${encodeURIComponent(p.handle)}`}
                >
                  Manage
                </Link>
              </div>
            ))
          ) : (
            <Empty text="No registered users match" />
          )}
        </div>
        <div className="card">
          <div className="cardHead">
            <h2>Posts and publications</h2>
            <span>{content.length}</span>
          </div>
          {content.length ? (
            content.map((x) => (
              <div className="activity" key={x.id}>
                <span>▤</span>
                <div>
                  <b>{x.title}</b>
                  <small>
                    {x.kind} · {x.owner ?? "Identity protected"} · {x.status}
                  </small>
                </div>
                <Link href={`/?view=moderation&q=${encodeURIComponent(query)}`}>
                  Review
                </Link>
              </div>
            ))
          ) : (
            <Empty text="No posts match" />
          )}
        </div>
        <div className="card">
          <div className="cardHead">
            <h2>News</h2>
            <span>{news.length}</span>
          </div>
          {news.map((x) => (
            <div className="activity" key={x.id}>
              <span>▤</span>
              <div>
                <b>{x.headline}</b>
                <small>{x.sourceName}</small>
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="cardHead">
            <h2>Reels</h2>
            <span>{reels.length}</span>
          </div>
          {reels.map((x) => (
            <div className="activity" key={x.id}>
              <span>▶</span>
              <div>
                <b>{x.headline}</b>
                <small>{x.sourceName}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
function Moderation({
  items,
  title,
  view,
  kind,
}: {
  items: Content[];
  title: string;
  view: string;
  kind: string;
}) {
  const tabs = [
    ["all", "All"],
    ["post", "Posts"],
    ["anonymous", "Anonymous"],
    ["publication", "Publications"],
  ];
  return (
    <>
      <Head
        title={title}
        copy="Review live platform content with auditable reasons and protected anonymous identities."
      />
      <div className="tabs">
        {tabs.map(([id, label]) => (
          <Link
            className={kind === id ? "active" : ""}
            href={`/?view=${view}&kind=${id}`}
            key={id}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="card tableCard">
        {items.length ? (
          items.map((x) => (
            <form
              action={moderateContent}
              className="dataRow modRow"
              key={x.id}
            >
              <input type="hidden" name="id" value={x.id} />
              <input type="hidden" name="kind" value={x.kind} />
              <div>
                <b>{x.title}</b>
                <small>
                  {x.kind} · {x.owner ?? "Anonymous identity protected"} ·{" "}
                  {x.status}
                </small>
              </div>
              <input
                name="reason"
                required
                minLength={3}
                placeholder="Required reason / policy"
              />
              <button name="action" value="warn">
                ⚠ Review
              </button>
              <button className="danger" name="action" value="delete">
                Remove
              </button>
            </form>
          ))
        ) : (
          <Empty text="No matching content" />
        )}
      </div>
    </>
  );
}
function News({ items }: { items: Publication[] }) {
  return (
    <>
      <Head
        title="News Articles"
        copy="Create source-backed news and publish it directly to the SidCraft app."
      />
      <div className="dashboardGrid">
        <form action={createPublication} className="card formCard">
          <input type="hidden" name="kind" value="news" />
          <h2>Push News Article</h2>
          <label>
            Headline
            <input name="headline" required />
          </label>
          <label>
            Summary
            <textarea name="summary" required />
          </label>
          <div className="two">
            <label>
              Category
              <select name="category">
                <option value="india">India</option>
                <option value="politics">Politics</option>
                <option value="business">Business</option>
                <option value="stocks">Stocks</option>
                <option value="tech">Technology</option>
                <option value="sports">Sports</option>
                <option value="world">World</option>
              </select>
            </label>
            <label>
              Source name
              <input name="sourceName" required />
            </label>
          </div>
          <label>
            Source URL
            <input type="url" name="sourceUrl" required />
          </label>
          <label>
            Evidence note
            <textarea name="evidenceNote" />
          </label>
          <label>
            Media files
            <input
              type="file"
              name="mediaFiles"
              accept="image/*,video/*"
              multiple
            />
          </label>
          <MediaUrlFields />
          <button>Publish to SidCraft</button>
        </form>
        <div className="card">
          <div className="cardHead">
            <h2>Published articles</h2>
            <span>{items.length}</span>
          </div>
          {items.map((x) => (
            <div className="activity" key={x.id}>
              <span>▤</span>
              <div>
                <b>{x.headline}</b>
                <small>
                  {x.sourceName} ·{" "}
                  {new Date(x.publishedAt).toLocaleDateString()}
                </small>
                <details>
                  <summary>Edit section or media</summary>
                  <form action={updatePublishedNews} className="formCard">
                    <input type="hidden" name="id" value={x.id} />
                    <label>
                      Headline
                      <input
                        name="headline"
                        defaultValue={x.headline}
                        required
                        maxLength={180}
                      />
                    </label>
                    <label>
                      Full news summary (5–6 sentences)
                      <textarea
                        name="summary"
                        defaultValue={x.summary}
                        required
                        minLength={40}
                        maxLength={1200}
                      />
                    </label>
                    <label>
                      News section
                      <select name="category" defaultValue={x.category}>
                        {[
                          "india",
                          "world",
                          "politics",
                          "business",
                          "stocks",
                          "tech",
                          "sports",
                          "entertainment",
                        ].map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                    <AiNewsMediaField defaultUrl={x.mediaUrl} />
                    <label>
                      Source and media attribution
                      <textarea
                        name="evidenceNote"
                        defaultValue={x.evidenceNote}
                        minLength={10}
                        maxLength={500}
                        required
                      />
                    </label>
                    <small>
                      Original source:{" "}
                      <a
                        href={x.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {x.sourceUrl}
                      </a>
                    </small>
                    <button type="submit">Save article changes</button>
                  </form>
                </details>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
function AiNews({
  sources,
  candidates,
  paused,
  model,
}: {
  sources: AiSource[];
  candidates: AiCandidate[];
  paused: boolean;
  model: LocalModelStatus;
}) {
  const activeSources = sources.filter((source) => source.enabled);
  const workerSeen = activeSources.some((source) => source.lastFetchedAt);
  const pendingCount = candidates.filter(
    (candidate) => candidate.status === "needs_review",
  ).length;
  return (
    <>
      <Head
        eyebrow="SOURCE-LINKED INTAKE"
        title="AI News Queue"
        copy="Source-linked drafts and original SidCraft artwork are prepared automatically. Read the source, then approve or reject. Ingestion never auto-publishes."
      />
      <div className="card aiNewsControl">
        <div>
          <b>
            News ingestion:{" "}
            {paused
              ? "Paused"
              : activeSources.length === 0
                ? "Setup required"
                : workerSeen
                  ? pendingCount === 0
                    ? "Up to date"
                    : "Review needed"
                  : "Waiting for worker"}
          </b>
          <p>
            {activeSources.length === 0
              ? "Add an HTTPS feed or news website below and run the separate intake worker. The queue stays empty until then."
              : pendingCount === 0
                ? "No new articles are waiting for review. Sources are checked on their schedule; already-ingested URLs are skipped. Refresh this page after the next check."
                : "New source articles are waiting below. Read each original before approving or rejecting it."}
          </p>
          {pendingCount > 0 ? (
            <a href="#ai-news-review">Review {pendingCount} pending drafts ↓</a>
          ) : null}
          <small>
            {model.provider === "ollama_cloud" ? "Ollama Cloud" : "Local model"}
            : {model.model} ·{" "}
            {model.status === "configured"
              ? candidates.some(
                  (candidate) =>
                    candidate.draftMethod === "cloud_ai_source_grounded",
                )
                ? "Cloud drafting tested; a new source article is needed for the next draft"
                : "API key configured; awaiting a source article to test generation"
              : model.status === "needs_api_key"
                ? "API key required on the API server; source excerpts only"
                : model.status === "ready"
                  ? "Model available; no draft generated until an article arrives"
                  : model.status === "model_missing"
                    ? "Model not downloaded"
                    : model.status === "disabled"
                      ? "Disabled; using source excerpts"
                      : model.status === "invalid_url"
                        ? "Invalid local server URL"
                        : "Offline; using source excerpts"}
          </small>
        </div>
        <form action={setAiNewsPaused}>
          <input type="hidden" name="paused" value={String(!paused)} />
          <button>{paused ? "Resume intake" : "Pause intake"}</button>
        </form>
      </div>
      <div className="dashboardGrid">
        <form action={addAiNewsSource} className="card formCard">
          <h2>Add news source</h2>
          <p>
            Add a publisher's HTTPS RSS/Atom feed, news page, or article URL.
            Website mode checks visible same-site article links and prepares
            source-linked drafts. Pages that block automated access stay
            blocked.
          </p>
          <label>
            Source name
            <input name="name" required minLength={2} />
          </label>
          <label>
            HTTPS RSS/Atom or news website URL
            <input name="feedUrl" type="url" required pattern="https://.*" />
          </label>
          <label>
            Website URL (optional)
            <input name="websiteUrl" type="url" />
          </label>
          <div className="two">
            <label>
              Category
              <select name="category">
                {[
                  "india",
                  "world",
                  "politics",
                  "business",
                  "stocks",
                  "tech",
                  "sports",
                  "entertainment",
                ].map((x) => (
                  <option value={x} key={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Check for new articles every (minutes)
              <input
                name="pollingMinutes"
                type="number"
                min={2}
                max={1440}
                defaultValue={2}
              />
            </label>
          </div>
          <button>Add source</button>
        </form>
        <div className="card">
          <div className="cardHead">
            <h2>Managed sources</h2>
            <span>{sources.length}</span>
          </div>
          {sources.length ? (
            sources.map((source) => (
              <div className="activity" key={source.id}>
                <span>◉</span>
                <div>
                  <b>{source.name}</b>
                  <small>
                    {source.category} · {source.enabled ? "Active" : "Paused"} ·{" "}
                    {source.lastFetchedAt
                      ? `Fetched ${new Date(source.lastFetchedAt).toLocaleString()}`
                      : "Not fetched yet"}
                  </small>
                  <small>Checks every {source.pollingMinutes} minutes</small>
                  <small>
                    {
                      candidates.filter(
                        (candidate) =>
                          candidate.sourceId === source.id &&
                          candidate.status === "needs_review",
                      ).length
                    }{" "}
                    drafts awaiting review
                  </small>
                  <form action={updateAiNewsSourceCategory}>
                    <input type="hidden" name="id" value={source.id} />
                    <label>
                      News section
                      <select name="category" defaultValue={source.category}>
                        {[
                          "india",
                          "world",
                          "politics",
                          "business",
                          "stocks",
                          "tech",
                          "sports",
                          "entertainment",
                        ].map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit">Save section</button>
                  </form>
                  <form action={updateAiNewsSourceInterval}>
                    <input type="hidden" name="id" value={source.id} />
                    <label>
                      Check interval (minutes)
                      <input
                        name="pollingMinutes"
                        type="number"
                        min={2}
                        max={1440}
                        step={1}
                        defaultValue={source.pollingMinutes}
                        required
                      />
                    </label>
                    <button type="submit">Save interval</button>
                  </form>
                  <p>{source.feedUrl}</p>
                  {source.lastError ? (
                    <small style={{ color: "#bb2436" }}>
                      Last error: {source.lastError}
                    </small>
                  ) : null}
                </div>
                <form action={toggleAiNewsSource}>
                  <input type="hidden" name="id" value={source.id} />
                  <input
                    type="hidden"
                    name="enabled"
                    value={String(!source.enabled)}
                  />
                  <button>{source.enabled ? "Pause" : "Enable"}</button>
                </form>
              </div>
            ))
          ) : (
            <Empty text="No news sources configured" />
          )}
        </div>
      </div>
      <details className="card">
        <summary>Bulk add approved news channels (up to 100)</summary>
        <p>
          One approved source per line: name | HTTPS RSS or news page URL |
          section | check minutes. Sections: india, world, politics, business,
          stocks, tech, sports, entertainment. Check each publisher's reuse
          terms before adding it. New channels begin ingesting automatically.
        </p>
        <form action={importAiNewsSources} className="formCard">
          <label>
            Approved feed list
            <textarea
              name="sources"
              rows={7}
              required
              placeholder="Publisher Name | https://publisher.example/rss.xml | world | 30"
            />
          </label>
          <label>
            <input type="checkbox" name="approved" required /> I have checked
            feed access/reuse terms and understand new articles may use Ollama
            Cloud allowance.
          </label>
          <button type="submit">Import channels</button>
        </form>
      </details>
      <div className="card" id="ai-news-review">
        <div className="cardHead">
          <h2>Review queue</h2>
          <span>
            {candidates.filter((x) => x.status === "needs_review").length}{" "}
            pending
          </span>
        </div>
        {candidates.length ? (
          candidates.map((candidate) => (
            <div className="aiNewsCandidate" key={candidate.id}>
              <div>
                <span className="tag">{candidate.status}</span>{" "}
                <span className="tag">
                  {candidate.draftMethod === "cloud_ai_source_grounded"
                    ? "Ollama Cloud draft · source review required"
                    : candidate.draftMethod === "local_ai_source_grounded"
                      ? "Local AI draft · source review required"
                      : "Source excerpt · review required"}
                </span>
                {candidates.filter((item) => item.storyId === candidate.storyId)
                  .length > 1 ? (
                  <span className="tag">
                    {
                      candidates.filter(
                        (item) => item.storyId === candidate.storyId,
                      ).length
                    }{" "}
                    related reports · max 2 publications
                  </span>
                ) : null}
                {candidates.filter(
                  (item) =>
                    item.storyId === candidate.storyId &&
                    item.id !== candidate.id,
                ).length ? (
                  <div className="relatedSources">
                    <b>Related source reports</b>
                    {candidates
                      .filter(
                        (item) =>
                          item.storyId === candidate.storyId &&
                          item.id !== candidate.id,
                      )
                      .map((item) => (
                        <a
                          key={item.id}
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {item.sourceName}: {item.originalHeadline} ↗
                        </a>
                      ))}
                  </div>
                ) : null}
                <h3>{candidate.originalHeadline}</h3>
                <p>
                  {candidate.description || "No excerpt supplied by source."}
                </p>
                <small>
                  {candidate.sourceName} · {candidate.category} ·{" "}
                  <a
                    href={candidate.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Read original ↗
                  </a>
                </small>
              </div>
              {candidate.status === "needs_review" ? (
                <div>
                  <form action={reviewAiNews} className="formCard">
                    <input type="hidden" name="id" value={candidate.id} />
                    <label>
                      Final headline
                      <input
                        name="finalHeadline"
                        defaultValue={
                          candidate.finalHeadline ??
                          candidate.originalHeadline.slice(0, 180)
                        }
                        required
                        maxLength={180}
                      />
                    </label>
                    <label>
                      Source-grounded summary
                      <textarea
                        name="finalSummary"
                        defaultValue={
                          candidate.finalSummary ??
                          candidate.description.slice(0, 1200)
                        }
                        required
                        minLength={10}
                      />
                    </label>
                    <AiNewsMediaField
                      defaultUrl={candidate.mediaUrl ?? ""}
                      suggestedUrl={candidate.suggestedMediaUrl}
                    />
                    <label>
                      Media licence and attribution
                      <input
                        name="mediaAttribution"
                        defaultValue={candidate.mediaAttribution ?? ""}
                        required
                        minLength={3}
                        placeholder="Licence, creator, and source"
                      />
                    </label>
                    <button>Save edits</button>
                  </form>
                  <div className="inlineAction">
                    <form action={publishAiNews}>
                      <input type="hidden" name="id" value={candidate.id} />
                      <button
                        disabled={
                          !candidate.finalHeadline ||
                          !candidate.finalSummary ||
                          !candidate.mediaUrl ||
                          !candidate.mediaAttribution
                        }
                      >
                        Approve & publish
                      </button>
                    </form>
                    <form action={rejectAiNews}>
                      <input type="hidden" name="id" value={candidate.id} />
                      <button className="danger">Reject</button>
                    </form>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <Empty text="No ingested articles yet" />
        )}
      </div>
    </>
  );
}
function Monetization({ items }: { items: Campaign[] }) {
  const fields: Array<[string, string]> = [
    ["name", "Campaign name"],
    ["advertiser", "Advertiser"],
    ["headline", "Headline"],
    ["destinationUrl", "Destination URL"],
    ["mediaUrl", "Media URL"],
  ];
  return (
    <>
      <Head
        title="Monetization"
        copy="Manage transparent advertising and sponsored campaigns."
      />
      <div className="dashboardGrid">
        <form action={createCampaign} className="card formCard">
          <h2>Create ad campaign</h2>
          {fields.map(([n, l]) => (
            <label key={n}>
              {l}
              <input
                name={n}
                type={n.includes("Url") ? "url" : "text"}
                required={n !== "mediaUrl"}
              />
            </label>
          ))}
          <label>
            Status
            <select name="status">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </label>
          <button>Save campaign</button>
        </form>
        <div className="card">
          <h2>Campaign inventory</h2>
          {items.length ? (
            items.map((x) => (
              <div className="activity" key={x.id}>
                <span>$</span>
                <div>
                  <b>{x.name}</b>
                  <small>
                    {x.advertiser} · {x.status}
                  </small>
                </div>
              </div>
            ))
          ) : (
            <Empty text="No campaigns yet" />
          )}
        </div>
      </div>
    </>
  );
}
function Analytics({
  profiles,
  content,
  news,
  reels,
}: {
  profiles: Profile[];
  content: Content[];
  news: Publication[];
  reels: Publication[];
}) {
  const active = content.filter((x) => x.status === "active").length,
    anonymous = content.filter((x) => x.kind === "anonymous").length;
  return (
    <>
      <Head
        title="Platform Analytics"
        copy="Live totals computed from the shared SidCraft database."
      />
      <div className="kpis">
        {[
          ["Profiles", profiles.length],
          ["All content", content.length],
          ["Active content", active],
          ["Anonymous posts", anonymous],
          ["News", news.length],
          ["Reels", reels.length],
        ].map(([label, value]) => (
          <div className="kpi" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>Current database total</small>
          </div>
        ))}
      </div>
      <div className="card analyticsPanel">
        <h2>Content distribution</h2>
        {[
          ["Standard posts", content.filter((x) => x.kind === "post").length],
          ["Anonymous posts", anonymous],
          [
            "Publications",
            content.filter((x) => x.kind === "publication").length,
          ],
          ["Restricted", content.length - active],
        ].map(([label, value]) => (
          <div className="metricRow" key={label}>
            <span>{label}</span>
            <progress max={Math.max(1, content.length)} value={Number(value)} />
            <b>{value}</b>
          </div>
        ))}
      </div>
    </>
  );
}
function Notifications({ items }: { items: Broadcast[] }) {
  return (
    <>
      <Head
        title="Notifications"
        copy="Create an in-app broadcast and keep a server-backed delivery record."
      />
      <div className="dashboardGrid">
        <form action={createBroadcast} className="card formCard">
          <h2>Send notification</h2>
          <label>
            Title
            <input name="title" minLength={3} maxLength={140} required />
          </label>
          <label>
            Message
            <textarea name="message" minLength={3} maxLength={600} required />
          </label>
          <label>
            Audience
            <select name="audience">
              <option value="everyone">Everyone</option>
              <option value="verified">Verified users</option>
              <option value="followers">Followers</option>
              <option value="location">Location segment</option>
            </select>
          </label>
          <label>
            Deep link (optional)
            <input name="deepLink" placeholder="/news or /profile/..." />
          </label>
          <button>Send notification</button>
        </form>
        <div className="card">
          <div className="cardHead">
            <h2>Broadcast history</h2>
            <span>{items.length}</span>
          </div>
          {items.length ? (
            items.map((x) => (
              <div className="activity" key={x.id}>
                <span>♧</span>
                <div>
                  <b>{x.title}</b>
                  <small>
                    {x.audience} · {x.status} ·{" "}
                    {new Date(x.createdAt).toLocaleString()}
                  </small>
                  <p>{x.message}</p>
                </div>
              </div>
            ))
          ) : (
            <Empty text="No notifications sent" />
          )}
        </div>
      </div>
    </>
  );
}
function Settings({ items }: { items: AdminSetting[] }) {
  const definitions: Array<[string, string, string]> = [
    ["general", "General", "SidCraft"],
    ["appearance", "Appearance", "light"],
    ["content", "Content creation", "enabled"],
    ["moderation", "Moderation", "standard"],
    ["verification", "Verification requests", "enabled"],
    ["notifications", "Notifications", "enabled"],
    ["privacy", "Privacy defaults", "standard"],
    ["security", "Security controls", "standard"],
    ["video", "Video publishing", "enabled"],
    ["news", "News publishing", "enabled"],
    ["targeting", "Audience targeting", "enabled"],
    ["monetization", "Advertising", "enabled"],
  ];
  const map = new Map(items.map((x) => [x.key, x]));
  return (
    <>
      <Head
        title="Platform Settings"
        copy="Change live platform feature configuration. Each save is persisted to the database."
      />
      <div className="card settingsList">
        {definitions.map(([key, label, defaultValue]) => {
          const current = map.get(key);
          return (
            <form
              action={updatePlatformSetting}
              className="settingRow"
              key={key}
            >
              <input type="hidden" name="key" value={key} />
              <div>
                <b>{label}</b>
                <small>
                  Last saved:{" "}
                  {current
                    ? new Date(current.updatedAt).toLocaleString()
                    : "Not configured"}
                </small>
              </div>
              <select
                name="enabled"
                defaultValue={String(current?.enabled ?? true)}
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
              <input
                name="value"
                defaultValue={current?.value ?? defaultValue}
              />
              <button>Save</button>
            </form>
          );
        })}
      </div>
    </>
  );
}
function AuditLogs({ items }: { items: Audit[] }) {
  return (
    <>
      <Head
        title="Audit & Reports"
        copy="A permanent view of administrative moderation actions and their required reasons."
      />
      <div className="card tableCard">
        <div className="tableHeader auditHeader">
          <b>Action</b>
          <b>Target</b>
          <b>Reason</b>
          <b>Date</b>
        </div>
        {items.length ? (
          items.map((x) => (
            <div className="dataRow auditRow" key={x.id}>
              <span className={x.action === "delete" ? "tag red" : "tag"}>
                {x.action}
              </span>
              <code>
                {x.targetType}:{x.targetId.slice(0, 8)}
              </code>
              <span>{x.reason}</span>
              <time>{new Date(x.createdAt).toLocaleString()}</time>
            </div>
          ))
        ) : (
          <Empty text="No administrative actions recorded" />
        )}
      </div>
    </>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <span>◇</span>
      <b>{text}</b>
      <small>New records will appear here automatically.</small>
    </div>
  );
}
