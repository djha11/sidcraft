import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { MemoryChatRepository } from "../src/chat/repository.js";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
async function register(
  api: FastifyInstance,
  email: string,
  displayName: string,
) {
  const otp = (
    await api.inject({
      method: "POST",
      url: "/v1/auth/otp",
      payload: { email, purpose: "signup" },
    })
  ).json().developmentOtp;
  return (
    await api.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        displayName,
        password: "correct horse battery staple",
        acceptedTerms: true,
        otp,
      },
    })
  ).json();
}

describe("direct messages", () => {
  it("routes strangers to requests, protects membership, and moves accepted chats to inbox", async () => {
    const chat = new MemoryChatRepository();
    app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        JWT_SECRET: "test-secret-that-is-at-least-thirty-two-chars",
      }),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      chat,
    );
    const sender = await register(app, "sender@example.com", "Sender");
    const recipient = await register(app, "recipient@example.com", "Recipient");
    const outsider = await register(app, "outsider@example.com", "Outsider");
    const sent = await app.inject({
      method: "POST",
      url: "/v1/chat/messages",
      headers: bearer(sender.accessToken),
      payload: { recipientId: recipient.user.id, body: "Hello" },
    });
    expect(sent.statusCode).toBe(201);
    const id = sent.json().conversationId as string;
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/chat/conversations?requested=true",
          headers: bearer(recipient.accessToken),
        })
      ).json().items,
    ).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/chat/conversations/${id}/messages`,
          headers: bearer(outsider.accessToken),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/chat/conversations/${id}/messages`,
          headers: bearer(recipient.accessToken),
          payload: { body: "Not yet" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/v1/chat/conversations/${id}/accept`,
          headers: bearer(recipient.accessToken),
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/chat/conversations/${id}/messages`,
          headers: bearer(recipient.accessToken),
          payload: { body: "Accepted" },
        })
      ).statusCode,
    ).toBe(201);
    const attachment = await app.inject({
      method: "POST",
      url: `/v1/chat/conversations/${id}/messages`,
      headers: bearer(recipient.accessToken),
      payload: {
        body: "",
        attachment: {
          kind: "audio",
          mimeType: "audio/mp4",
          originalName: "voice.m4a",
          sizeBytes: 5,
          base64: Buffer.from("voice").toString("base64"),
        },
      },
    });
    expect(attachment.statusCode).toBe(201);
    const mediaUrl = attachment.json().attachment.url as string;
    expect(
      (
        await app.inject({
          method: "GET",
          url: mediaUrl,
          headers: bearer(outsider.accessToken),
        })
      ).statusCode,
    ).toBe(403);
    const media = await app.inject({
      method: "GET",
      url: mediaUrl,
      headers: bearer(recipient.accessToken),
    });
    expect(media.statusCode).toBe(200);
    expect(media.rawPayload).toEqual(Buffer.from("voice"));
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/chat/conversations?requested=false",
          headers: bearer(recipient.accessToken),
        })
      ).json().items[0],
    ).toMatchObject({ id, status: "accepted" });
  });

  it("places messages directly in inbox when the recipient follows the sender", async () => {
    const chat = new MemoryChatRepository();
    app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        JWT_SECRET: "test-secret-that-is-at-least-thirty-two-chars",
      }),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      chat,
    );
    const sender = await register(app, "followed@example.com", "Followed");
    const recipient = await register(app, "follower@example.com", "Follower");
    chat.setFollowing(recipient.user.id, sender.user.id);
    await app.inject({
      method: "POST",
      url: "/v1/chat/messages",
      headers: bearer(sender.accessToken),
      payload: { recipientId: recipient.user.id, body: "Hello follower" },
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/chat/conversations?requested=false",
          headers: bearer(recipient.accessToken),
        })
      ).json().items[0].status,
    ).toBe("accepted");
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/chat/conversations?requested=true",
          headers: bearer(recipient.accessToken),
        })
      ).json().items,
    ).toHaveLength(0);
  });
});
