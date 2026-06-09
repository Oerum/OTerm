export type IssueState = "open" | "closed" | "all";

export interface IssueListFilters {
  state: IssueState;
  label?: string | null;
  author?: string | null;
  assignee?: string | null;
}

export interface IssueSummary {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  labels: string[];
  assignees: string[];
  createdAt: string;
  updatedAt: string;
}

export interface IssueComment {
  author: string;
  body: string;
  createdAt: string;
}

export interface IssueDetail extends IssueSummary {
  body: string;
  comments: IssueComment[];
}
