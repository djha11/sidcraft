"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPoll } from "./actions";

type Region = { code: string; name: string };
type Constituency = {
  code: string;
  stateCode: string;
  name: string;
  number: number;
};
export type AdminPoll = {
  id: string;
  question: string;
  topic: string;
  responseType: string;
  status: string;
  opensAt: string;
  closesAt: string;
  responseCount: number;
  target: {
    scope: string;
    countryCode: string | null;
    stateCode: string | null;
    lokSabhaConstituencyCode: string | null;
  };
  media: { kind: "image" | "video"; url: string } | null;
  options: Array<{
    id: string;
    label: string;
    votes: number;
    percentage: number;
    mediaUrl?: string | null;
  }>;
};

const initialOptions = [
  "Public transport",
  "Jobs and skills",
  "Air and water",
  "Local healthcare",
];
export function OpinionConsole({
  regions,
  constituencies,
  polls,
  countries,
}: {
  regions: Region[];
  constituencies: Constituency[];
  polls: AdminPoll[];
  countries: Array<{ code: string; name: string }>;
}) {
  const router = useRouter(),
    [question, setQuestion] = useState(
      "What should your representative prioritize this month?",
    ),
    [topic, setTopic] = useState("Local priorities"),
    [type, setType] = useState("choice"),
    [options, setOptions] = useState(initialOptions),
    [optionMedia, setOptionMedia] = useState(["", "", "", ""]),
    [scope, setScope] = useState("india"),
    [country, setCountry] = useState("IN"),
    [state, setState] = useState(""),
    [constituency, setConstituency] = useState(""),
    [immediate, setImmediate] = useState(true),
    [mediaPreview, setMediaPreview] = useState<string | null>(null),
    [mediaKind, setMediaKind] = useState<"image" | "video">("image");
  const filtered = useMemo(
    () => constituencies.filter((x) => x.stateCode === state),
    [constituencies, state],
  );
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(timer);
  }, [router]);
  const now = new Date(),
    later = new Date(Date.now() + 7 * 86400000),
    local = (d: Date) =>
      new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
  function fileChanged(file?: File) {
    if (!file) {
      setMediaPreview(null);
      return;
    }
    setMediaKind(file.type.startsWith("video/") ? "video" : "image");
    setMediaPreview(URL.createObjectURL(file));
  }
  return (
    <>
      <form action={createPoll} className="creator opinionCreator">
        <div className="card formCard">
          <div className="sectionIntro">
            <small>QUESTION BUILDER</small>
            <h2>Opinion details</h2>
          </div>
          <div className="questionTypes">
            <label>
              <input
                type="radio"
                name="responseType"
                value="choice"
                checked={type === "choice"}
                onChange={() => setType("choice")}
              />
              <b>▥ Poll</b>
              <small>Multiple choice</small>
            </label>
            <label>
              <input
                type="radio"
                name="responseType"
                value="open_text"
                checked={type === "open_text"}
                onChange={() => setType("open_text")}
              />
              <b>◯ Text opinion</b>
              <small>Open response</small>
            </label>
          </div>
          <label>
            Question title{" "}
            <span className="fieldCount">{question.length}/280</span>
            <textarea
              name="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              minLength={8}
              maxLength={280}
              required
            />
          </label>
          <label>
            Topic
            <input
              name="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={80}
              required
            />
          </label>
          {type === "choice" ? (
            <div className="optionBuilder">
              <div className="optionHead">
                <b>Answer options</b>
                <small>
                  Add text and an optional image URL to each answer.
                </small>
              </div>
              {options.map((value, index) => (
                <div className="optionEditor" key={index}>
                  <i>{index + 1}</i>
                  <input
                    name="optionLabel"
                    value={value}
                    maxLength={160}
                    required
                    onChange={(e) =>
                      setOptions((current) =>
                        current.map((x, i) =>
                          i === index ? e.target.value : x,
                        ),
                      )
                    }
                    placeholder={`Option ${index + 1}`}
                  />
                  <input
                    name="optionMediaUrl"
                    value={optionMedia[index] ?? ""}
                    onChange={(e) =>
                      setOptionMedia((current) =>
                        current.map((x, i) =>
                          i === index ? e.target.value : x,
                        ),
                      )
                    }
                    type="url"
                    placeholder="Optional image URL"
                  />
                  <button
                    type="button"
                    disabled={options.length <= 2}
                    onClick={() => {
                      setOptions((x) => x.filter((_, i) => i !== index));
                      setOptionMedia((x) => x.filter((_, i) => i !== index));
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                className="secondaryButton"
                type="button"
                disabled={options.length >= 8}
                onClick={() => {
                  setOptions((x) => [...x, ""]);
                  setOptionMedia((x) => [...x, ""] as string[]);
                }}
              >
                ＋ Add option
              </button>
            </div>
          ) : null}
          <label>
            Response comments
            <select name="commentMode">
              <option value="optional">Optional</option>
              <option value="disabled">Disabled</option>
              <option value="required">Required</option>
            </select>
          </label>
          <div className="mediaBox">
            <b>Poll cover photo or video</b>
            <small>
              This media is displayed inside this poll card, directly above its
              question.
            </small>
            <input
              type="file"
              name="mediaFile"
              accept="image/*,video/*"
              onChange={(e) => fileChanged(e.target.files?.[0])}
            />
            <div className="or">
              <span />
              or use a direct link
              <span />
            </div>
            <div className="mediaLink">
              <select
                name="mediaKind"
                value={mediaKind}
                onChange={(e) =>
                  setMediaKind(e.target.value as "image" | "video")
                }
              >
                <option value="image">Image link</option>
                <option value="video">Video link</option>
              </select>
              <input
                type="url"
                name="mediaUrl"
                placeholder="https://example.com/poll-cover.jpg"
                onChange={(e) => setMediaPreview(e.target.value || null)}
              />
            </div>
          </div>
        </div>
        <div className="card formCard">
          <div className="sectionIntro">
            <small>AUDIENCE</small>
            <h2>Targeting & schedule</h2>
          </div>
          <label>
            Country
            <select
              name="countryCode"
              value={country}
              disabled={scope === "global"}
              onChange={(e) => {
                const code = e.target.value;
                setCountry(code);
                setScope(code === "IN" ? "india" : "country");
                setState("");
                setConstituency("");
              }}
            >
              {countries.map((c) => (
                <option value={c.code} key={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target level
            <select
              name="scope"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setState("");
                setConstituency("");
              }}
            >
              <option value="global">Everyone worldwide</option>
              <option value="country">Everyone in selected country</option>
              {country === "IN" ? (
                <>
                  <option value="india">Everyone in India</option>
                  <option value="state">
                    Specific state or union territory
                  </option>
                  <option value="lok_sabha">
                    Specific Lok Sabha constituency
                  </option>
                </>
              ) : null}
            </select>
          </label>
          {scope === "state" || scope === "lok_sabha" ? (
            <label>
              State / union territory
              <select
                name="stateCode"
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  setConstituency("");
                }}
                required
              >
                <option value="">Select a state</option>
                {regions.map((r) => (
                  <option value={r.code} key={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="stateCode" value="" />
          )}
          {scope === "lok_sabha" ? (
            <label>
              Constituency
              <select
                name="constituencyCode"
                value={constituency}
                onChange={(e) => setConstituency(e.target.value)}
                required
                disabled={!state}
              >
                <option value="">
                  {state ? "Select a constituency" : "Select a state first"}
                </option>
                {filtered.map((c) => (
                  <option value={c.code} key={c.code}>
                    {c.number}. {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="constituencyCode" value="" />
          )}
          <div className="scheduleChoice">
            <label>
              <input
                type="radio"
                name="scheduleMode"
                checked={immediate}
                onChange={() => setImmediate(true)}
              />{" "}
              Publish as soon as possible
            </label>
            <label>
              <input
                type="radio"
                name="scheduleMode"
                checked={!immediate}
                onChange={() => setImmediate(false)}
              />{" "}
              Schedule for later
            </label>
          </div>
          {immediate ? (
            <input type="hidden" name="opensAt" value={local(now)} />
          ) : (
            <label>
              Starts
              <input
                type="datetime-local"
                name="opensAt"
                defaultValue={local(new Date(Date.now() + 300000))}
                required
              />
            </label>
          )}
          <label>
            Ends
            <input
              type="datetime-local"
              name="closesAt"
              defaultValue={local(later)}
              required
            />
          </label>
          <div className="targetSummary">
            ◎ Delivery:{" "}
            {scope === "global"
              ? "all SidCraft users worldwide"
              : scope === "country" || scope === "india"
                ? `all located users in ${countries.find((x) => x.code === country)?.name ?? country}`
                : scope === "state"
                  ? regions.find((x) => x.code === state)?.name ||
                    "select a state"
                  : filtered.find((x) => x.code === constituency)?.name ||
                    "select a constituency"}
          </div>
          <button className="publishButton">⌁ Publish opinion</button>
        </div>
        <div className="card preview">
          <div className="sectionIntro">
            <small>CONNECTED PREVIEW</small>
            <h2>How this poll appears</h2>
          </div>
          <div className="phone opinionPhone">
            <b>
              <i>⌁</i> SidCraft
            </b>
            <small>SidCraft Opinion · Live</small>
            {mediaPreview ? (
              mediaKind === "image" ? (
                <img src={mediaPreview} alt="Poll cover preview" />
              ) : (
                <video src={mediaPreview} controls />
              )
            ) : (
              <div className="previewMedia">
                <b>Poll cover</b>
                <small>Add a related photo or video</small>
              </div>
            )}
            <div className="pollQuestionBlock">
              <small>{topic}</small>
              <h3>{question || "Your question"}</h3>
            </div>
            {type === "choice" ? (
              options.filter(Boolean).map((label, i) => (
                <span key={i}>
                  {optionMedia[i] ? (
                    <img src={optionMedia[i]} alt="" />
                  ) : (
                    <i>{i + 1}</i>
                  )}
                  <b>{label}</b>
                </span>
              ))
            ) : (
              <div className="textAnswer">Write your private response…</div>
            )}
            <button>Vote now</button>
          </div>
        </div>
      </form>
      <section className="pollHistory">
        <div className="historyHead">
          <div>
            <small>REAL-TIME MANAGEMENT</small>
            <h2>SidCraft Opinion history</h2>
            <p>
              Results refresh every 10 seconds. Only aggregate votes are
              displayed.
            </p>
          </div>
          <a href="#top">＋ Create another opinion</a>
        </div>
        <div className="pollGrid">
          {polls.length ? (
            polls.map((p) => (
              <article className="card pollResult" key={p.id}>
                <header>
                  <span className={`status ${p.status}`}>● {p.status}</span>
                  <small>{p.responseCount} responses</small>
                </header>
                <h3>{p.question}</h3>
                <p>
                  {p.topic} · {p.target.scope.replace("_", " ")}
                </p>
                {p.options.map((o) => (
                  <div className="resultBar" key={o.id}>
                    <div>
                      <b>{o.label}</b>
                      <span>
                        {o.votes} · {o.percentage}%
                      </span>
                    </div>
                    <progress max="100" value={o.percentage} />
                  </div>
                ))}
                <footer>
                  <span>{new Date(p.opensAt).toLocaleString()}</span>
                  <span>Ends {new Date(p.closesAt).toLocaleString()}</span>
                </footer>
              </article>
            ))
          ) : (
            <div className="card emptyPolls">
              No opinions published yet. Use the builder above to create the
              first one.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
