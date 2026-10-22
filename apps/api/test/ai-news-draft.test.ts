import { describe, expect, it } from "vitest";
import {
  extractiveDraft,
  localModelStatus,
  prepareDraft,
  storySimilarity,
} from "../src/ai-news/draft.js";

describe("source-grounded news preparation", () => {
  it("uses only supplied excerpt and leaves an empty excerpt unpublishable", () => {
    expect(
      extractiveDraft(
        "Council approves city rail plan",
        "The council approved a rail plan. Work starts next year. Details remain pending.",
      ),
    ).toMatchObject({
      summary:
        "The council approved a rail plan. Work starts next year. Details remain pending.",
      method: "source_excerpt",
    });
    expect(
      extractiveDraft("Council approves city rail plan", "").summary,
    ).toBeNull();
  });
  it("finds the same event despite extra headline wording", () => {
    expect(
      storySimilarity(
        "Agency announces major public transport policy for city",
        "Official agency announces public transport policy for city",
      ),
    ).toBeGreaterThanOrEqual(0.75);
    expect(
      storySimilarity(
        "Agency announces major public transport policy for city",
        "Team wins football championship final today",
      ),
    ).toBeLessThan(0.75);
  });
  it("uses a loopback local model without any OpenAI key", async () => {
    let called = false;
    const draft = await prepareDraft(
      "Council opens 2 new bus routes",
      "The council opened 2 new bus routes on Monday.",
      "https://example.org/buses",
      { PULSE_NEWS_AI_PROVIDER: "local", PULSE_NEWS_MODEL: "test-model" },
      async (url, init) => {
        called = true;
        expect(String(url)).toBe("http://127.0.0.1:11434/api/generate");
        expect(JSON.parse(String(init?.body)).model).toBe("test-model");
        return new Response(
          JSON.stringify({
            response: JSON.stringify({
              headline: "Council opens 2 bus routes",
              summary:
                "According to the council, 2 new bus routes opened on Monday.",
            }),
          }),
          { status: 200 },
        );
      },
    );
    expect(called).toBe(true);
    expect(draft.method).toBe("local_ai_source_grounded");
  });
  it("rejects model output that adds unsupported numbers", async () => {
    const draft = await prepareDraft(
      "Council opens 2 new bus routes",
      "The council opened 2 new bus routes on Monday.",
      "https://example.org/buses",
      { PULSE_NEWS_AI_PROVIDER: "local" },
      async () =>
        new Response(
          JSON.stringify({
            response: JSON.stringify({
              headline: "Council opens 20 bus routes",
              summary: "The council opened 20 new bus routes.",
            }),
          }),
          { status: 200 },
        ),
    );
    expect(draft.method).toBe("source_excerpt");
  });
  it("reports local model readiness without generating a draft", async () => {
    const status = await localModelStatus(
      { PULSE_NEWS_AI_PROVIDER: "local", PULSE_NEWS_MODEL: "test-model" },
      async (url) => {
        expect(String(url)).toBe("http://127.0.0.1:11434/api/tags");
        return new Response(
          JSON.stringify({ models: [{ name: "test-model" }] }),
          { status: 200 },
        );
      },
    );
    expect(status.status).toBe("ready");
  });
  it("requires a server-side API key before using Ollama Cloud", async () => {
    const status = await localModelStatus({
      PULSE_NEWS_AI_PROVIDER: "ollama_cloud",
    });
    expect(status).toMatchObject({
      status: "needs_api_key",
      provider: "ollama_cloud",
    });
  });
  it("sends source-grounded drafts to Ollama Cloud without exposing the key", async () => {
    const draft = await prepareDraft(
      "Council opens 2 new bus routes",
      "The council opened 2 new bus routes on Monday.",
      "https://example.org/buses",
      {
        PULSE_NEWS_AI_PROVIDER: "ollama_cloud",
        OLLAMA_API_KEY: "test-secret",
        PULSE_NEWS_MODEL: "gemma4:31b",
      },
      async (url, init) => {
        expect(String(url)).toBe("https://ollama.com/api/chat");
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer test-secret",
        });
        expect(JSON.parse(String(init?.body)).messages).toHaveLength(2);
        return new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                headline: "Council opens 2 bus routes",
                summary:
                  "According to the council, 2 new bus routes opened on Monday.",
              }),
            },
          }),
          { status: 200 },
        );
      },
    );
    expect(draft.method).toBe("cloud_ai_source_grounded");
  });
  it("requests an English source-attributed draft for non-English source text", async () => {
    const draft = await prepareDraft(
      "La agencia anuncia una nueva misión espacial",
      "La agencia anunció una nueva misión espacial el lunes.",
      "https://example.org/es/mision",
      { PULSE_NEWS_AI_PROVIDER: "ollama_cloud", OLLAMA_API_KEY: "test-secret" },
      async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.messages[0].content).toContain("natural English");
        expect(body.messages[1].content).toContain("La agencia");
        return new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                headline: "Agency announces a new space mission",
                summary:
                  "According to the agency, it announced a new space mission on Monday.",
              }),
            },
          }),
          { status: 200 },
        );
      },
    );
    expect(draft).toMatchObject({
      headline: "Agency announces a new space mission",
      method: "cloud_ai_source_grounded",
    });
  });
});
