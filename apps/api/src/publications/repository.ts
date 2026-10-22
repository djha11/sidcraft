import { randomUUID } from "node:crypto";
import type {
  Publication,
  PublicationCategory,
  PublicationKind,
} from "@pulse/contracts";

export type StoredPublicationInput = Omit<
  Publication,
  "id" | "publishedAt" | "author" | "feedPostId"
>;

export interface PublicationRepository {
  list(
    kind: PublicationKind,
    category?: PublicationCategory,
  ): Promise<Publication[]>;
  create(input: StoredPublicationInput): Promise<Publication>;
  updateNews(
    id: string,
    patch: Pick<
      Publication,
      "category" | "mediaUrl" | "media" | "evidenceNote"
    > &
      Partial<Pick<Publication, "headline" | "summary">>,
  ): Promise<Publication | null>;
}

export class MemoryPublicationRepository implements PublicationRepository {
  private readonly items: Publication[] = [];
  async list(kind: PublicationKind, category?: PublicationCategory) {
    return this.items
      .filter(
        (item) =>
          item.kind === kind && (!category || item.category === category),
      )
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }
  async create(input: StoredPublicationInput) {
    const item: Publication = {
      ...input,
      id: randomUUID(),
      publishedAt: new Date().toISOString(),
    };
    this.items.unshift(item);
    return item;
  }
  async updateNews(
    id: string,
    patch: Pick<
      Publication,
      "category" | "mediaUrl" | "media" | "evidenceNote"
    > &
      Partial<Pick<Publication, "headline" | "summary">>,
  ) {
    const index = this.items.findIndex(
      (item) => item.id === id && item.kind === "news",
    );
    if (index < 0) return null;
    const next = { ...this.items[index]!, ...patch };
    this.items[index] = next;
    return next;
  }
}
