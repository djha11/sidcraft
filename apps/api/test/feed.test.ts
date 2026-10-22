import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});
const setup = async () =>
  (app = await buildApp(
    loadConfig({
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-that-is-at-least-thirty-two-chars",
    }),
  ));
const register = async (
  api: FastifyInstance,
  email: string,
  displayName: string,
) => {
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
};
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("social feed", () => {
  it("searches people, posts, reels, and hashtags and personalizes followed creators", async () => {
    const api = await setup();
    const followed = await register(
      api,
      "followed-search@example.com",
      "Aarav Reporter",
    );
    const other = await register(
      api,
      "other-search@example.com",
      "Other Creator",
    );
    const viewer = await register(
      api,
      "viewer-search@example.com",
      "Search Viewer",
    );
    const followedPost = (
      await api.inject({
        method: "POST",
        url: "/v1/feed/posts",
        headers: bearer(followed.accessToken),
        payload: { body: "Local transport update #Mobility" },
      })
    ).json();
    await api.inject({
      method: "POST",
      url: "/v1/feed/posts",
      headers: bearer(other.accessToken),
      payload: { body: "Another unrelated update" },
    });
    await api.inject({
      method: "POST",
      url: "/v1/feed/posts",
      headers: bearer(followed.accessToken),
      payload: {
        body: "Mobility video #Mobility",
        media: [
          {
            kind: "video",
            mimeType: "video/mp4",
            originalName: "mobility.mp4",
            sizeBytes: 5,
            durationSeconds: 30,
            base64: Buffer.from("video").toString("base64"),
          },
        ],
      },
    });
    await api.inject({
      method: "PUT",
      url: `/v1/feed/users/${followed.user.id}/follow`,
      headers: bearer(viewer.accessToken),
    });
    const search = await api.inject({
      method: "GET",
      url: "/v1/feed/search?q=mobility",
      headers: bearer(viewer.accessToken),
    });
    expect(search.statusCode).toBe(200);
    expect(search.json()).toMatchObject({
      posts: [{ id: followedPost.id }],
      reels: [{ body: "Mobility video #Mobility" }],
      topics: [{ tag: "#mobility" }],
    });
    const people = await api.inject({
      method: "GET",
      url: "/v1/feed/search?q=aarav",
      headers: bearer(viewer.accessToken),
    });
    expect(people.json().people[0]).toMatchObject({
      id: followed.user.id,
      handle: followed.user.handle,
    });
    const feed = await api.inject({
      method: "GET",
      url: "/v1/feed",
      headers: bearer(viewer.accessToken),
    });
    expect(feed.json().items[0].author.id).toBe(followed.user.id);
  });
  it("ranks visible trending hashtags and segments posts from reels", async () => {
    const api = await setup();
    const user = await register(api, "trends@example.com", "Trend Maker");
    const headers = bearer(user.accessToken);
    const create = (payload: Record<string, unknown>) =>
      api.inject({ method: "POST", url: "/v1/feed/posts", headers, payload });
    await create({ body: "A city update #India #Local" });
    await create({
      body: "A short report #India #News",
      media: [
        {
          kind: "video",
          mimeType: "video/mp4",
          originalName: "report.mp4",
          sizeBytes: 5,
          durationSeconds: 30,
          base64: Buffer.from("video").toString("base64"),
        },
      ],
    });
    const all = await api.inject({
      method: "GET",
      url: "/v1/feed/trending",
      headers,
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().topics[0]).toMatchObject({
      tag: "#India",
      postCount: 2,
      reelCount: 1,
    });
    expect(all.json().items).toHaveLength(2);
    const posts = await api.inject({
      method: "GET",
      url: "/v1/feed/trending?kind=posts&tag=%23India",
      headers,
    });
    expect(posts.statusCode).toBe(200);
    expect(posts.json().items).toHaveLength(1);
    expect(posts.json().items[0].media).toHaveLength(0);
  });
  it("updates optional profile fields, validates unique usernames, and serves profile media", async () => {
    const api = await setup();
    const owner = await register(
      api,
      "profile-owner@example.com",
      "Profile Owner",
    );
    const other = await register(
      api,
      "profile-other@example.com",
      "Profile Other",
    );
    const updated = await api.inject({
      method: "PUT",
      url: "/v1/feed/me/profile",
      headers: bearer(owner.accessToken),
      payload: {
        displayName: "Pulse Creator",
        username: "pulse.creator",
        bio: "Reporting from my city",
        website: "https://example.com",
        avatar: {
          kind: "image",
          mimeType: "image/png",
          base64: Buffer.from("profile-image").toString("base64"),
          scale: 1.6,
          offsetX: 0.2,
          offsetY: -0.15,
        },
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().user).toMatchObject({
      displayName: "Pulse Creator",
      handle: "pulse.creator",
      bio: "Reporting from my city",
      website: "https://example.com",
      avatar: { kind: "image", scale: 1.6, offsetX: 0.2, offsetY: -0.15 },
    });
    const media = await api.inject({
      method: "GET",
      url: `/v1/feed/users/${owner.user.id}/avatar`,
      headers: bearer(owner.accessToken),
    });
    expect(media.statusCode).toBe(200);
    expect(media.headers["content-type"]).toContain("image/png");
    const duplicate = await api.inject({
      method: "PUT",
      url: "/v1/feed/me/profile",
      headers: bearer(other.accessToken),
      payload: {
        displayName: "Other",
        username: "pulse.creator",
        bio: null,
        website: null,
      },
    });
    expect(duplicate.statusCode).toBe(409);
  });
  it("requires authentication and validates post content", async () => {
    const api = await setup();
    expect(
      (await api.inject({ method: "GET", url: "/v1/feed" })).statusCode,
    ).toBe(401);
    const user = await register(api, "aanya@example.com", "Aanya Rao");
    expect(
      (
        await api.inject({
          method: "POST",
          url: "/v1/feed/posts",
          headers: bearer(user.accessToken),
          payload: { body: "   " },
        })
      ).statusCode,
    ).toBe(400);
  });

  it("creates, paginates, likes, comments, and follows without exposing private identity data", async () => {
    const api = await setup();
    const author = await register(api, "author@example.com", "Author One");
    const viewer = await register(api, "viewer@example.com", "Viewer Two");
    const created = await api.inject({
      method: "POST",
      url: "/v1/feed/posts",
      headers: bearer(author.accessToken),
      payload: { body: "A real database-ready feed post" },
    });
    expect(created.statusCode).toBe(201);
    const post = created.json();

    const listed = await api.inject({
      method: "GET",
      url: "/v1/feed?limit=1",
      headers: bearer(viewer.accessToken),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items[0]).toMatchObject({
      id: post.id,
      body: "A real database-ready feed post",
      likeCount: 0,
      commentCount: 0,
      viewerLiked: false,
      isOwn: false,
    });
    expect(listed.body).not.toContain("email");
    expect(listed.body).not.toContain("vote");

    expect(
      (
        await api.inject({
          method: "PUT",
          url: `/v1/feed/posts/${post.id}/like`,
          headers: bearer(viewer.accessToken),
        })
      ).json(),
    ).toMatchObject({ viewerLiked: true, likeCount: 1 });
    expect(
      (
        await api.inject({
          method: "PUT",
          url: `/v1/feed/posts/${post.id}/like`,
          headers: bearer(viewer.accessToken),
        })
      ).json(),
    ).toMatchObject({ likeCount: 1 });
    const comment = await api.inject({
      method: "POST",
      url: `/v1/feed/posts/${post.id}/comments`,
      headers: bearer(viewer.accessToken),
      payload: { body: "Thoughtful point" },
    });
    expect(comment.statusCode).toBe(201);
    expect(comment.json()).toMatchObject({
      body: "Thoughtful point",
      isOwn: true,
    });

    expect(
      (
        await api.inject({
          method: "PUT",
          url: `/v1/feed/users/${author.user.id}/follow`,
          headers: bearer(viewer.accessToken),
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await api.inject({
          method: "GET",
          url: "/v1/feed",
          headers: bearer(viewer.accessToken),
        })
      ).json().items[0],
    ).toMatchObject({ viewerFollowsAuthor: true, commentCount: 1 });
  });

  it("hides privately reported posts and removes blocked authors", async () => {
    const api = await setup();
    const author = await register(api, "blocked@example.com", "Blocked Author");
    const viewer = await register(api, "safe@example.com", "Safe Viewer");
    const first = (
      await api.inject({
        method: "POST",
        url: "/v1/feed/posts",
        headers: bearer(author.accessToken),
        payload: { body: "First post" },
      })
    ).json();
    await api.inject({
      method: "POST",
      url: "/v1/feed/posts",
      headers: bearer(author.accessToken),
      payload: { body: "Second post" },
    });

    expect(
      (
        await api.inject({
          method: "POST",
          url: `/v1/feed/posts/${first.id}/reports`,
          headers: bearer(viewer.accessToken),
          payload: { reason: "spam" },
        })
      ).statusCode,
    ).toBe(204);
    let feed = (
      await api.inject({
        method: "GET",
        url: "/v1/feed",
        headers: bearer(viewer.accessToken),
      })
    ).json();
    expect(feed.items.map((item: { id: string }) => item.id)).not.toContain(
      first.id,
    );
    expect(feed.items).toHaveLength(1);

    expect(
      (
        await api.inject({
          method: "PUT",
          url: `/v1/feed/users/${author.user.id}/block`,
          headers: bearer(viewer.accessToken),
        })
      ).statusCode,
    ).toBe(204);
    feed = (
      await api.inject({
        method: "GET",
        url: "/v1/feed",
        headers: bearer(viewer.accessToken),
      })
    ).json();
    expect(feed.items).toEqual([]);
    expect(
      (
        await api.inject({
          method: "PUT",
          url: `/v1/feed/users/${viewer.user.id}/follow`,
          headers: bearer(viewer.accessToken),
        })
      ).statusCode,
    ).toBe(400);
  });

  it("keeps anonymous identity private and supports media, reposts, and threaded replies", async () => {
    const api = await setup();
    const author = await register(
      api,
      "anonymous@example.com",
      "Secret Author",
    );
    const viewer = await register(api, "thread@example.com", "Thread Reader");
    const created = await api.inject({
      method: "POST",
      url: "/v1/feed/posts",
      headers: bearer(author.accessToken),
      payload: {
        body: "Evidence attached",
        anonymous: true,
        media: [
          {
            kind: "document",
            mimeType: "text/plain",
            originalName: "evidence.txt",
            sizeBytes: 5,
            base64: Buffer.from("proof").toString("base64"),
          },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const post = created.json();
    expect(post).toMatchObject({
      author: null,
      isAnonymous: true,
      media: [{ originalName: "evidence.txt" }],
    });
    expect(created.body).not.toContain("Secret Author");
    const media = await api.inject({ method: "GET", url: post.media[0].url });
    expect(media.statusCode).toBe(200);
    expect(media.body).toBe("proof");
    const repost = await api.inject({
      method: "PUT",
      url: `/v1/feed/posts/${post.id}/repost`,
      headers: bearer(viewer.accessToken),
    });
    expect(repost.json()).toMatchObject({
      repostCount: 1,
      viewerReposted: true,
    });
    const parent = (
      await api.inject({
        method: "POST",
        url: `/v1/feed/posts/${post.id}/comments`,
        headers: bearer(viewer.accessToken),
        payload: { body: "Question" },
      })
    ).json();
    const reply = await api.inject({
      method: "POST",
      url: `/v1/feed/posts/${post.id}/comments`,
      headers: bearer(author.accessToken),
      payload: { body: "Answer", parentCommentId: parent.id },
    });
    expect(reply.statusCode).toBe(201);
    const thread = await api.inject({
      method: "GET",
      url: `/v1/feed/posts/${post.id}/comments`,
      headers: bearer(viewer.accessToken),
    });
    expect(thread.json()[0]).toMatchObject({
      body: "Question",
      replies: [{ body: "Answer", parentCommentId: parent.id }],
    });
  });
  it("builds profile tabs and never exposes anonymous content to other viewers", async () => {
    const api = await setup();
    const owner = await register(
      api,
      "profile-owner@example.com",
      "Profile Owner",
    );
    const viewer = await register(
      api,
      "profile-viewer@example.com",
      "Profile Viewer",
    );
    await api.inject({
      method: "POST",
      url: "/v1/feed/posts",
      headers: bearer(owner.accessToken),
      payload: { body: "Public profile post" },
    });
    await api.inject({
      method: "POST",
      url: "/v1/feed/posts",
      headers: bearer(owner.accessToken),
      payload: {
        body: "Private author identity",
        anonymous: true,
        poll: {
          question: "Private profile poll",
          options: ["One", "Two"],
          allowMultiple: false,
          durationMinutes: 60,
        },
      },
    });
    await api.inject({
      method: "POST",
      url: "/v1/feed/posts",
      headers: bearer(owner.accessToken),
      payload: { body: "Newest anonymous post", anonymous: true },
    });
    await api.inject({
      method: "POST",
      url: "/v1/feed/posts",
      headers: bearer(owner.accessToken),
      payload: {
        body: "Profile reel",
        media: [
          {
            kind: "video",
            mimeType: "video/mp4",
            originalName: "reel.mp4",
            sizeBytes: 5,
            durationSeconds: 90,
            base64: Buffer.from("video").toString("base64"),
          },
        ],
      },
    });
    const tagged = (
      await api.inject({
        method: "POST",
        url: "/v1/feed/posts",
        headers: bearer(viewer.accessToken),
        payload: { body: `Hello @${owner.user.handle}` },
      })
    ).json();
    await api.inject({
      method: "PUT",
      url: `/v1/feed/posts/${tagged.id}/repost`,
      headers: bearer(owner.accessToken),
    });
    await api.inject({
      method: "PUT",
      url: `/v1/feed/users/${owner.user.id}/follow`,
      headers: bearer(viewer.accessToken),
    });
    const own = (
      await api.inject({
        method: "GET",
        url: "/v1/feed/me/profile",
        headers: bearer(owner.accessToken),
      })
    ).json();
    expect(own).toMatchObject({
      isOwn: true,
      counts: { posts: 2, anonymous: 2, followers: 1, following: 0 },
    });
    expect(own.posts).toHaveLength(1);
    expect(own.reels).toHaveLength(1);
    expect(own.anonymous).toHaveLength(2);
    expect(own.anonymous[0].body).toBe("Newest anonymous post");
    expect(own.anonymous[1].poll).toMatchObject({
      question: "Private profile poll",
      options: [{ label: "One" }, { label: "Two" }],
    });
    expect(own.reposts[0].id).toBe(tagged.id);
    expect(own.tagged[0].id).toBe(tagged.id);
    const publicProfile = (
      await api.inject({
        method: "GET",
        url: `/v1/feed/users/${owner.user.id}/profile`,
        headers: bearer(viewer.accessToken),
      })
    ).json();
    expect(publicProfile).toMatchObject({
      isOwn: false,
      viewerFollows: true,
      counts: { anonymous: null },
    });
    expect(publicProfile.anonymous).toEqual([]);
    expect(JSON.stringify(publicProfile)).not.toContain(
      "Private author identity",
    );
  });
  it("promotes only user videos up to three minutes to Reels and limits stories to followed users", async () => {
    const api = await setup();
    const author = await register(api, "creator@example.com", "Video Creator");
    const viewer = await register(
      api,
      "storyviewer@example.com",
      "Story Viewer",
    );
    const video = (durationSeconds: number) => ({
      kind: "video",
      mimeType: "video/mp4",
      originalName: `${durationSeconds}.mp4`,
      sizeBytes: 5,
      durationSeconds,
      base64: Buffer.from("video").toString("base64"),
    });
    await api.inject({
      method: "POST",
      url: "/v1/feed/posts",
      headers: bearer(author.accessToken),
      payload: { body: "Short reel", media: [video(180)] },
    });
    await api.inject({
      method: "POST",
      url: "/v1/feed/posts",
      headers: bearer(author.accessToken),
      payload: { body: "Long feed video", media: [video(181)] },
    });
    const reels = (
      await api.inject({
        method: "GET",
        url: "/v1/publications?kind=reel",
        headers: bearer(viewer.accessToken),
      })
    ).json().items;
    expect(reels.map((item: { headline: string }) => item.headline)).toContain(
      "Short reel",
    );
    expect(
      reels.map((item: { headline: string }) => item.headline),
    ).not.toContain("Long feed video");
    expect(
      (
        await api.inject({
          method: "GET",
          url: "/v1/feed/me/videos",
          headers: bearer(author.accessToken),
        })
      ).json().items,
    ).toHaveLength(2);
    const storyPayload = {
      caption: "Today",
      media: {
        kind: "image",
        mimeType: "image/png",
        originalName: "story.png",
        sizeBytes: 3,
        base64: Buffer.from("img").toString("base64"),
      },
    };
    const createdStory = await api.inject({
      method: "POST",
      url: "/v1/feed/stories",
      headers: bearer(author.accessToken),
      payload: storyPayload,
    });
    expect(createdStory.statusCode).toBe(201);
    expect(
      (
        await api.inject({
          method: "GET",
          url: "/v1/feed/stories",
          headers: bearer(viewer.accessToken),
        })
      ).json().items,
    ).toHaveLength(0);
    await api.inject({
      method: "PUT",
      url: `/v1/feed/users/${author.user.id}/follow`,
      headers: bearer(viewer.accessToken),
    });
    const unseen = (
      await api.inject({
        method: "GET",
        url: "/v1/feed/stories",
        headers: bearer(viewer.accessToken),
      })
    ).json().items[0];
    expect(unseen).toMatchObject({
      caption: "Today",
      author: { id: author.user.id },
      viewerSeen: false,
    });
    await api.inject({
      method: "PUT",
      url: `/v1/feed/stories/${createdStory.json().id}/view`,
      headers: bearer(viewer.accessToken),
    });
    expect(
      (
        await api.inject({
          method: "GET",
          url: "/v1/feed/stories",
          headers: bearer(viewer.accessToken),
        })
      ).json().items[0].viewerSeen,
    ).toBe(true);
    await api.inject({
      method: "POST",
      url: "/v1/feed/stories",
      headers: bearer(author.accessToken),
      payload: { ...storyPayload, caption: "New update" },
    });
    expect(
      (
        await api.inject({
          method: "GET",
          url: "/v1/feed/stories",
          headers: bearer(viewer.accessToken),
        })
      )
        .json()
        .items.some((story: { viewerSeen: boolean }) => !story.viewerSeen),
    ).toBe(true);
  });
  it("supports aggregate feed polls and sends story reactions and replies to Chat", async () => {
    const api = await setup();
    const owner = await register(api, "poll-owner@example.com", "Poll Owner");
    const viewer = await register(
      api,
      "poll-viewer@example.com",
      "Poll Viewer",
    );
    const created = (
      await api.inject({
        method: "POST",
        url: "/v1/feed/posts",
        headers: bearer(owner.accessToken),
        payload: {
          poll: {
            question: "Which feature next?",
            options: ["Search", "Groups", "Events"],
            allowMultiple: true,
            durationMinutes: 60,
          },
        },
      })
    ).json();
    expect(created.poll).toMatchObject({
      question: "Which feature next?",
      totalVotes: 0,
      allowMultiple: true,
    });
    const voted = (
      await api.inject({
        method: "PUT",
        url: `/v1/feed/posts/${created.id}/poll-vote`,
        headers: bearer(viewer.accessToken),
        payload: {
          optionIds: [created.poll.options[0].id, created.poll.options[1].id],
        },
      })
    ).json();
    expect(voted.poll.totalVotes).toBe(1);
    expect(
      voted.poll.options.map(
        (option: { viewerSelected: boolean }) => option.viewerSelected,
      ),
    ).toEqual([true, true, false]);
    expect(Object.keys(voted.poll.options[0]).sort()).toEqual(
      ["id", "label", "percentage", "viewerSelected", "voteCount"].sort(),
    );
    await api.inject({
      method: "PUT",
      url: `/v1/feed/users/${owner.user.id}/follow`,
      headers: bearer(viewer.accessToken),
    });
    const story = (
      await api.inject({
        method: "POST",
        url: "/v1/feed/stories",
        headers: bearer(owner.accessToken),
        payload: {
          caption: "Update",
          media: {
            kind: "image",
            mimeType: "image/png",
            originalName: "s.png",
            sizeBytes: 3,
            base64: Buffer.from("img").toString("base64"),
          },
        },
      })
    ).json();
    await api.inject({
      method: "PUT",
      url: `/v1/feed/stories/${story.id}/view`,
      headers: bearer(viewer.accessToken),
    });
    await api.inject({
      method: "PUT",
      url: `/v1/feed/stories/${story.id}/like`,
      headers: bearer(viewer.accessToken),
    });
    await api.inject({
      method: "POST",
      url: `/v1/feed/stories/${story.id}/replies`,
      headers: bearer(viewer.accessToken),
      payload: { body: "Great update" },
    });
    expect(
      (
        await api.inject({
          method: "GET",
          url: `/v1/feed/stories/${story.id}/viewers`,
          headers: bearer(viewer.accessToken),
        })
      ).statusCode,
    ).toBe(403);
    const viewers = (
      await api.inject({
        method: "GET",
        url: `/v1/feed/stories/${story.id}/viewers`,
        headers: bearer(owner.accessToken),
      })
    ).json().items;
    expect(viewers[0]).toMatchObject({
      user: { id: viewer.user.id },
      liked: true,
    });
    const chat = (
      await api.inject({
        method: "GET",
        url: "/v1/feed/story-messages",
        headers: bearer(owner.accessToken),
      })
    ).json().items;
    expect(
      chat.map((message: { body: string }) => message.body).sort(),
    ).toEqual(["Great update", "♥ Liked your story"].sort());
  });
  it("notifies followers about Live sessions and keeps floating comments out of Chat", async () => {
    const api = await setup();
    const host = await register(api, "live-host@example.com", "Live Host");
    const follower = await register(
      api,
      "live-follower@example.com",
      "Live Follower",
    );
    await api.inject({
      method: "PUT",
      url: `/v1/feed/users/${host.user.id}/follow`,
      headers: bearer(follower.accessToken),
    });
    const live = (
      await api.inject({
        method: "POST",
        url: "/v1/feed/live",
        headers: bearer(host.accessToken),
        payload: { title: "Town hall" },
      })
    ).json();
    const credentials = (
      await api.inject({
        method: "GET",
        url: `/v1/feed/live/${live.id}/credentials`,
        headers: bearer(follower.accessToken),
      })
    ).json();
    expect(credentials).toMatchObject({
      serverUrl: "ws://10.0.2.2:7880",
      roomName: `pulse-live-${live.id}`,
    });
    expect(typeof credentials.token).toBe("string");
    expect(
      (
        await api.inject({
          method: "PUT",
          url: "/v1/feed/push-token",
          headers: bearer(follower.accessToken),
          payload: {
            token: "ExponentPushToken[test-device]",
            platform: "android",
          },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await api.inject({
          method: "GET",
          url: "/v1/feed/live",
          headers: bearer(follower.accessToken),
        })
      ).json().items[0],
    ).toMatchObject({
      id: live.id,
      host: { id: host.user.id },
      status: "live",
    });
    const inbox = (
      await api.inject({
        method: "GET",
        url: "/v1/feed/notifications",
        headers: bearer(follower.accessToken),
      })
    ).json().items;
    expect(
      inbox.some(
        (item: { type: string; liveSessionId: string }) =>
          item.type === "live_started" && item.liveSessionId === live.id,
      ),
    ).toBe(true);
    await api.inject({
      method: "PUT",
      url: `/v1/feed/live/${live.id}/join`,
      headers: bearer(follower.accessToken),
    });
    await api.inject({
      method: "POST",
      url: `/v1/feed/live/${live.id}/comments`,
      headers: bearer(follower.accessToken),
      payload: { body: "Hello live" },
    });
    expect(
      (
        await api.inject({
          method: "GET",
          url: `/v1/feed/live/${live.id}/comments`,
          headers: bearer(host.accessToken),
        })
      ).json().items[0].body,
    ).toBe("Hello live");
    expect(
      (
        await api.inject({
          method: "GET",
          url: "/v1/feed/story-messages",
          headers: bearer(host.accessToken),
        })
      ).json().items,
    ).toEqual([]);
    expect(
      (
        await api.inject({
          method: "PUT",
          url: `/v1/feed/live/${live.id}/end`,
          headers: bearer(host.accessToken),
        })
      ).statusCode,
    ).toBe(204);
  });
  it("persists profile highlights and permits deletion only by the content owner", async () => {
    const api = await setup();
    const owner = await register(
      api,
      "delete-owner@example.com",
      "Delete Owner",
    );
    const other = await register(
      api,
      "delete-other@example.com",
      "Delete Other",
    );
    const post = (
      await api.inject({
        method: "POST",
        url: "/v1/feed/posts",
        headers: bearer(owner.accessToken),
        payload: { body: "Owner content" },
      })
    ).json();
    expect(
      (
        await api.inject({
          method: "DELETE",
          url: `/v1/feed/posts/${post.id}`,
          headers: bearer(other.accessToken),
        })
      ).statusCode,
    ).toBe(403);
    const comment = (
      await api.inject({
        method: "POST",
        url: `/v1/feed/posts/${post.id}/comments`,
        headers: bearer(other.accessToken),
        payload: { body: "My own comment" },
      })
    ).json();
    expect(
      (
        await api.inject({
          method: "DELETE",
          url: `/v1/feed/posts/${post.id}/comments/${comment.id}`,
          headers: bearer(owner.accessToken),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await api.inject({
          method: "DELETE",
          url: `/v1/feed/posts/${post.id}/comments/${comment.id}`,
          headers: bearer(other.accessToken),
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await api.inject({
          method: "DELETE",
          url: `/v1/feed/posts/${post.id}`,
          headers: bearer(owner.accessToken),
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await api.inject({
          method: "GET",
          url: "/v1/feed",
          headers: bearer(other.accessToken),
        })
      ).json().items,
    ).toEqual([]);

    const highlight = (
      await api.inject({
        method: "POST",
        url: "/v1/feed/stories",
        headers: bearer(owner.accessToken),
        payload: {
          caption: "Saved moment",
          isHighlight: true,
          media: {
            kind: "image",
            mimeType: "image/png",
            originalName: "highlight.png",
            sizeBytes: 3,
            base64: Buffer.from("img").toString("base64"),
          },
        },
      })
    ).json();
    const profile = (
      await api.inject({
        method: "GET",
        url: "/v1/feed/me/profile",
        headers: bearer(owner.accessToken),
      })
    ).json();
    expect(profile.highlights[0]).toMatchObject({
      id: highlight.id,
      caption: "Saved moment",
      isHighlight: true,
    });
    expect(
      (
        await api.inject({
          method: "GET",
          url: "/v1/feed/stories",
          headers: bearer(owner.accessToken),
        })
      ).json().items,
    ).toEqual([]);
    expect(
      (
        await api.inject({
          method: "DELETE",
          url: `/v1/feed/stories/${highlight.id}`,
          headers: bearer(other.accessToken),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await api.inject({
          method: "DELETE",
          url: `/v1/feed/stories/${highlight.id}`,
          headers: bearer(owner.accessToken),
        })
      ).statusCode,
    ).toBe(204);
  });
});
