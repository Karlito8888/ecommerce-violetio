export type ContentType = "guide" | "comparison" | "review";
export type ContentStatus = "draft" | "published" | "archived";

export interface ContentPage {
  id: string;
  slug: string;
  title: string;
  type: ContentType;
  bodyMarkdown: string;
  author: string;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  featuredImageUrl: string | null;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ContentListParams {
  type?: ContentType;
  page?: number;
  limit?: number;
}

export interface ContentListResult {
  items: ContentPage[];
  total: number;
  page: number;
  hasNext: boolean;
}
