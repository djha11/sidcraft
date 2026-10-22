import { and, desc, eq } from "drizzle-orm";
import { publications, type Database } from "@pulse/database";
import type { PublicationCategory, PublicationKind } from "@pulse/contracts";
import type {
  PublicationRepository,
  StoredPublicationInput,
} from "./repository.js";

export class DrizzlePublicationRepository implements PublicationRepository {
  constructor(private readonly db: Database) {}
  async list(kind: PublicationKind, category?: PublicationCategory) {
    const rows = await this.db
      .select()
      .from(publications)
      .where(
        and(
          eq(publications.kind, kind),
          category ? eq(publications.category, category) : undefined,
        ),
      )
      .orderBy(desc(publications.publishedAt))
      .limit(100);
    return rows.map((row) => ({
      ...row,
      media: row.media.length
        ? row.media
        : [{ url: row.mediaUrl, kind: "image" as const }],
      publishedAt: row.publishedAt.toISOString(),
    }));
  }
  async create(input: StoredPublicationInput) {
    const [row] = await this.db.insert(publications).values(input).returning();
    if (!row) throw new Error("PUBLICATION_CREATE_FAILED");
    return { ...row, publishedAt: row.publishedAt.toISOString() };
  }
  async updateNews(
    id: string,
    patch: Pick<
      import("@pulse/contracts").Publication,
      "category" | "mediaUrl" | "media" | "evidenceNote"
    > &
      Partial<
        Pick<import("@pulse/contracts").Publication, "headline" | "summary">
      >,
  ) {
    const [row] = await this.db
      .update(publications)
      .set(patch)
      .where(and(eq(publications.id, id), eq(publications.kind, "news")))
      .returning();
    return row ? { ...row, publishedAt: row.publishedAt.toISOString() } : null;
  }
}
