export interface FAQQuestion {
  questionId: string;
  question: string;
  answer: string;
}

export interface FAQList {
  listId: string;
  listName: string;
  questionCount: number;
  questions: FAQQuestion[];
}

export interface FAQScrapeResult {
  faqLists: FAQList[];
} 