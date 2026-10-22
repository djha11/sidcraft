import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  conversations,
  directMessages,
  follows,
  profiles,
  type Database,
} from "@pulse/database";
import type {
  Conversation,
  DirectMessage,
  FeedAuthor,
  SendDirectMessage,
} from "@pulse/contracts";
import type { ChatRepository } from "./repository.js";

export class DrizzleChatRepository implements ChatRepository {
  constructor(private readonly db: Database) {}
  async assertMember(conversationId: string, userId: string) {
    const conversation = await this.requireMember(conversationId, userId);
    if (conversation.status !== "accepted")
      throw new Error("MESSAGE_REQUEST_NOT_ACCEPTED");
  }
  async inbox(userId: string, requested: boolean) {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          or(
            eq(conversations.userOneId, userId),
            eq(conversations.userTwoId, userId),
          ),
          requested
            ? and(
                eq(conversations.status, "requested"),
                eq(conversations.requestedForId, userId),
              )
            : or(
                eq(conversations.status, "accepted"),
                ne(conversations.requestedForId, userId),
                isNull(conversations.requestedForId),
              ),
        ),
      )
      .orderBy(desc(conversations.updatedAt));
    return Promise.all(
      rows.map((row) => this.presentConversation(row, userId)),
    );
  }
  async messages(id: string, userId: string) {
    const c = await this.requireMember(id, userId);
    if (c.status === "accepted")
      await this.db
        .update(directMessages)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(directMessages.conversationId, id),
            ne(directMessages.senderId, userId),
            isNull(directMessages.readAt),
          ),
        );
    const rows = await this.db
      .select({
        message: directMessages,
        sender: {
          id: profiles.userId,
          displayName: profiles.displayName,
          handle: profiles.handle,
          verificationType: sql<FeedAuthor["verificationType"]>`${profiles.verificationType}`,
        },
      })
      .from(directMessages)
      .innerJoin(profiles, eq(profiles.userId, directMessages.senderId))
      .where(eq(directMessages.conversationId, id))
      .orderBy(asc(directMessages.createdAt));
    return rows.map((r) => this.presentMessage(r.message, r.sender, userId));
  }
  async send(
    sender: FeedAuthor,
    recipient: FeedAuthor,
    input: SendDirectMessage,
  ) {
    if (sender.id === recipient.id) throw new Error("CANNOT_MESSAGE_SELF");
    const [one, two] = [sender.id, recipient.id].sort();
    let [conversation] = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userOneId, one!),
          eq(conversations.userTwoId, two!),
        ),
      )
      .limit(1);
    if (!conversation) {
      const followsSender = await this.db
        .select({ id: follows.followerId })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, recipient.id),
            eq(follows.followedId, sender.id),
          ),
        )
        .limit(1);
      [conversation] = await this.db
        .insert(conversations)
        .values({
          userOneId: one!,
          userTwoId: two!,
          status: followsSender.length ? "accepted" : "requested",
          requestedForId: followsSender.length ? null : recipient.id,
        })
        .returning();
    }
    if (!conversation) throw new Error("CONVERSATION_CREATE_FAILED");
    if (
      conversation.status === "requested" &&
      conversation.requestedForId === sender.id
    )
      throw new Error("MESSAGE_REQUEST_NOT_ACCEPTED");
    const [row] = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(directMessages)
        .values({
          conversationId: conversation!.id,
          senderId: sender.id,
          body: input.body,
          attachment: input.attachment
            ? {
                kind: input.attachment.kind,
                mimeType: input.attachment.mimeType,
                originalName: input.attachment.originalName,
                sizeBytes: input.attachment.sizeBytes,
                dataBase64: input.attachment.base64,
              }
            : null,
        })
        .returning();
      await tx
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversation!.id));
      return inserted;
    });
    if (!row) throw new Error("MESSAGE_SEND_FAILED");
    return this.presentMessage(row, sender, sender.id);
  }
  async media(messageId: string, userId: string) {
    const [row] = await this.db
      .select({
        conversationId: directMessages.conversationId,
        attachment: directMessages.attachment,
      })
      .from(directMessages)
      .where(eq(directMessages.id, messageId))
      .limit(1);
    if (!row) return null;
    await this.requireMember(row.conversationId, userId);
    return row.attachment
      ? {
          mimeType: row.attachment.mimeType,
          dataBase64: row.attachment.dataBase64,
        }
      : null;
  }
  async accept(id: string, userId: string) {
    const c = await this.requireMember(id, userId);
    if (c.requestedForId !== userId)
      throw new Error("MESSAGE_REQUEST_OWNER_REQUIRED");
    await this.db
      .update(conversations)
      .set({ status: "accepted", requestedForId: null, updatedAt: new Date() })
      .where(eq(conversations.id, id));
  }
  async decline(id: string, userId: string) {
    const c = await this.requireMember(id, userId);
    if (c.requestedForId !== userId)
      throw new Error("MESSAGE_REQUEST_OWNER_REQUIRED");
    await this.db.delete(conversations).where(eq(conversations.id, id));
  }
  async search(userId: string, query: string) {
    return this.db
      .select({
        id: profiles.userId,
        displayName: profiles.displayName,
        handle: profiles.handle,
        verificationType: sql<FeedAuthor["verificationType"]>`${profiles.verificationType}`,
      })
      .from(profiles)
      .where(
        and(
          ne(profiles.userId, userId),
          or(
            ilike(profiles.displayName, `%${query}%`),
            ilike(profiles.handle, `%${query}%`),
          ),
        ),
      )
      .limit(20);
  }
  private async requireMember(id: string, userId: string) {
    const [c] = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    if (!c) throw new Error("CONVERSATION_NOT_FOUND");
    if (c.userOneId !== userId && c.userTwoId !== userId)
      throw new Error("CONVERSATION_MEMBER_REQUIRED");
    return c;
  }
  private presentMessage(
    m: typeof directMessages.$inferSelect,
    sender: FeedAuthor,
    userId: string,
  ): DirectMessage {
    return {
      id: m.id,
      conversationId: m.conversationId,
      sender,
      body: m.body,
      attachment: m.attachment
        ? {
            kind: m.attachment.kind,
            mimeType: m.attachment.mimeType,
            originalName: m.attachment.originalName,
            sizeBytes: m.attachment.sizeBytes,
            url: `/v1/chat/messages/${m.id}/media`,
          }
        : null,
      isOwn: m.senderId === userId,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  }
  private async presentConversation(
    c: typeof conversations.$inferSelect,
    userId: string,
  ): Promise<Conversation> {
    const otherId = c.userOneId === userId ? c.userTwoId : c.userOneId;
    const [[other], [latest], [unread]] = await Promise.all([
      this.db
        .select({
          id: profiles.userId,
          displayName: profiles.displayName,
          handle: profiles.handle,
          verificationType: sql<FeedAuthor["verificationType"]>`${profiles.verificationType}`,
        })
        .from(profiles)
        .where(eq(profiles.userId, otherId))
        .limit(1),
      this.db
        .select({
          message: directMessages,
          sender: {
            id: profiles.userId,
            displayName: profiles.displayName,
            handle: profiles.handle,
            verificationType: sql<FeedAuthor["verificationType"]>`${profiles.verificationType}`,
          },
        })
        .from(directMessages)
        .innerJoin(profiles, eq(profiles.userId, directMessages.senderId))
        .where(eq(directMessages.conversationId, c.id))
        .orderBy(desc(directMessages.createdAt))
        .limit(1),
      this.db
        .select({ value: sql<number>`count(*)` })
        .from(directMessages)
        .where(
          and(
            eq(directMessages.conversationId, c.id),
            ne(directMessages.senderId, userId),
            isNull(directMessages.readAt),
          ),
        ),
    ]);
    if (!other) throw new Error("USER_NOT_FOUND");
    return {
      id: c.id,
      otherUser: other,
      status: c.status,
      isIncomingRequest:
        c.status === "requested" && c.requestedForId === userId,
      lastMessage: latest
        ? this.presentMessage(latest.message, latest.sender, userId)
        : null,
      unreadCount: Number(unread?.value ?? 0),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
