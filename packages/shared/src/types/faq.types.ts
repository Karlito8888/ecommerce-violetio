export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answerMarkdown: string;
  sortOrder: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FaqCategory {
  name: string;
  items: FaqItem[];
}
