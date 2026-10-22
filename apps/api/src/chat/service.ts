import type {
  FeedAuthor,
  SendDirectMessage,
  UserPreferences,
} from "@pulse/contracts";
import type { ChatRepository } from "./repository.js";

export class ChatService {
  constructor(
    private readonly repository: ChatRepository,
    private readonly resolveUser: (id: string) => Promise<FeedAuthor | null>,
    private readonly issueCallToken?: (
      roomName: string,
      identity: string,
    ) => Promise<{ serverUrl: string; token: string }>,
    private readonly preferencesFor?: (
      userId: string,
    ) => Promise<UserPreferences>,
  ) {}
  async callCredentials(conversationId: string, userId: string) {
    await this.repository.assertMember(conversationId, userId);
    if (!this.issueCallToken) throw new Error("CALLS_NOT_CONFIGURED");
    const roomName = `private-${conversationId}`;
    return {
      ...(await this.issueCallToken(roomName, userId)),
      roomName,
    };
  }
  inbox(userId: string, requested: boolean) {
    return this.repository.inbox(userId, requested);
  }
  messages(id: string, userId: string) {
    return this.repository.messages(id, userId);
  }
  search(userId: string, query: string) {
    return this.repository.search(userId, query);
  }
  async send(userId: string, recipientId: string, input: SendDirectMessage) {
    const [sender, recipient] = await Promise.all([
      this.resolveUser(userId),
      this.resolveUser(recipientId),
    ]);
    if (!sender || !recipient) throw new Error("USER_NOT_FOUND");
    if (
      this.preferencesFor &&
      !(await this.preferencesFor(recipientId)).allowMessageRequests
    )
      throw new Error("MESSAGE_REQUESTS_DISABLED");
    return this.repository.send(sender, recipient, input);
  }
  media(messageId: string, userId: string) {
    return this.repository.media(messageId, userId);
  }
  accept(id: string, userId: string) {
    return this.repository.accept(id, userId);
  }
  decline(id: string, userId: string) {
    return this.repository.decline(id, userId);
  }
}
