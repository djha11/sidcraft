import { randomUUID } from "node:crypto";
import type {
  Conversation,
  DirectMessage,
  FeedAuthor,
  SendDirectMessage,
} from "@pulse/contracts";

export interface ChatRepository {
  assertMember(conversationId: string, userId: string): Promise<void>;
  inbox(userId: string, requested: boolean): Promise<Conversation[]>;
  messages(conversationId: string, userId: string): Promise<DirectMessage[]>;
  send(
    sender: FeedAuthor,
    recipient: FeedAuthor,
    input: SendDirectMessage,
  ): Promise<DirectMessage>;
  media(
    messageId: string,
    userId: string,
  ): Promise<{ mimeType: string; dataBase64: string } | null>;
  accept(conversationId: string, userId: string): Promise<void>;
  decline(conversationId: string, userId: string): Promise<void>;
  search(userId: string, query: string): Promise<FeedAuthor[]>;
}

type MemoryConversation = {
  id: string;
  one: FeedAuthor;
  two: FeedAuthor;
  status: "requested" | "accepted";
  requestedForId: string | null;
  updatedAt: Date;
};
type MemoryMessage = {
  id: string;
  conversationId: string;
  sender: FeedAuthor;
  body: string;
  attachment: SendDirectMessage["attachment"] | null;
  readAt: Date | null;
  createdAt: Date;
};

export class MemoryChatRepository implements ChatRepository {
  private readonly conversations: MemoryConversation[] = [];
  private readonly messageRows: MemoryMessage[] = [];
  private readonly follows = new Set<string>();
  private readonly users = new Map<string, FeedAuthor>();

  setFollowing(followerId: string, followedId: string, enabled = true) {
    const key = `${followerId}:${followedId}`;
    enabled ? this.follows.add(key) : this.follows.delete(key);
  }
  async assertMember(conversationId: string, userId: string) {
    const conversation = this.requireMember(conversationId, userId);
    if (conversation.status !== "accepted")
      throw new Error("MESSAGE_REQUEST_NOT_ACCEPTED");
  }
  async inbox(userId: string, requested: boolean) {
    return this.conversations
      .filter((c) => c.one.id === userId || c.two.id === userId)
      .filter((c) =>
        requested
          ? c.status === "requested" && c.requestedForId === userId
          : c.status === "accepted" || c.requestedForId !== userId,
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((c) => this.presentConversation(c, userId));
  }
  async messages(conversationId: string, userId: string) {
    const conversation = this.requireMember(conversationId, userId);
    if (conversation.status === "accepted")
      for (const row of this.messageRows)
        if (row.conversationId === conversationId && row.sender.id !== userId)
          row.readAt = new Date();
    return this.messageRows
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => this.presentMessage(m, userId));
  }
  async send(
    sender: FeedAuthor,
    recipient: FeedAuthor,
    input: SendDirectMessage,
  ) {
    if (sender.id === recipient.id) throw new Error("CANNOT_MESSAGE_SELF");
    this.users.set(sender.id, sender);
    this.users.set(recipient.id, recipient);
    let conversation = this.conversations.find(
      (c) =>
        (c.one.id === sender.id && c.two.id === recipient.id) ||
        (c.one.id === recipient.id && c.two.id === sender.id),
    );
    if (!conversation) {
      const accepted = this.follows.has(`${recipient.id}:${sender.id}`);
      conversation = {
        id: randomUUID(),
        one: sender,
        two: recipient,
        status: accepted ? "accepted" : "requested",
        requestedForId: accepted ? null : recipient.id,
        updatedAt: new Date(),
      };
      this.conversations.push(conversation);
    }
    if (
      conversation.status === "requested" &&
      conversation.requestedForId === sender.id
    )
      throw new Error("MESSAGE_REQUEST_NOT_ACCEPTED");
    conversation.updatedAt = new Date();
    const row = {
      id: randomUUID(),
      conversationId: conversation.id,
      sender,
      body: input.body,
      attachment: input.attachment ?? null,
      readAt: null,
      createdAt: new Date(),
    };
    this.messageRows.push(row);
    return this.presentMessage(row, sender.id);
  }
  async media(messageId: string, userId: string) {
    const row = this.messageRows.find((message) => message.id === messageId);
    if (!row) return null;
    this.requireMember(row.conversationId, userId);
    return row.attachment
      ? { mimeType: row.attachment.mimeType, dataBase64: row.attachment.base64 }
      : null;
  }
  async accept(id: string, userId: string) {
    const c = this.requireMember(id, userId);
    if (c.requestedForId !== userId)
      throw new Error("MESSAGE_REQUEST_OWNER_REQUIRED");
    c.status = "accepted";
    c.requestedForId = null;
    c.updatedAt = new Date();
  }
  async decline(id: string, userId: string) {
    const c = this.requireMember(id, userId);
    if (c.requestedForId !== userId)
      throw new Error("MESSAGE_REQUEST_OWNER_REQUIRED");
    this.messageRows.splice(
      0,
      this.messageRows.length,
      ...this.messageRows.filter((m) => m.conversationId !== id),
    );
    this.conversations.splice(this.conversations.indexOf(c), 1);
  }
  async search(userId: string, query: string) {
    const q = query.toLowerCase();
    return [...this.users.values()]
      .filter(
        (u) =>
          u.id !== userId &&
          `${u.displayName} ${u.handle}`.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }
  private requireMember(id: string, userId: string) {
    const c = this.conversations.find((x) => x.id === id);
    if (!c) throw new Error("CONVERSATION_NOT_FOUND");
    if (c.one.id !== userId && c.two.id !== userId)
      throw new Error("CONVERSATION_MEMBER_REQUIRED");
    return c;
  }
  private presentMessage(m: MemoryMessage, userId: string): DirectMessage {
    return {
      id: m.id,
      conversationId: m.conversationId,
      sender: m.sender,
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
      isOwn: m.sender.id === userId,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  }
  private presentConversation(
    c: MemoryConversation,
    userId: string,
  ): Conversation {
    const last = this.messageRows
      .filter((m) => m.conversationId === c.id)
      .at(-1);
    return {
      id: c.id,
      otherUser: c.one.id === userId ? c.two : c.one,
      status: c.status,
      isIncomingRequest:
        c.status === "requested" && c.requestedForId === userId,
      lastMessage: last ? this.presentMessage(last, userId) : null,
      unreadCount: this.messageRows.filter(
        (m) => m.conversationId === c.id && m.sender.id !== userId && !m.readAt,
      ).length,
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
