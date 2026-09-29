export type FieldType = 'text' | 'options' | 'truefalse' | 'pairs' | 'lines' | 'parts';

export interface FieldDef {
  /** Stable key into Question.data; never changes after the field is created. */
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Printed only in the answer key, never on the question paper. */
  answer?: boolean;
  default?: unknown;
}

export interface Template {
  id: string;
  name: string;
  version: number;
  builtin: boolean;
  defaultMarks: number;
  fields: FieldDef[];
  updatedAt: number;
}

export interface OptionsValue {
  items: string[];
  /** Second-language version of each option (bilingual papers). */
  items2?: string[];
  correct: number | null;
}

export type PairsValue = [string, string][];

/** A sub-question inside a case study or multi-part question. Uses any non-group template. */
export interface Part {
  id: string;
  templateId: string;
  marks: number;
  data: Record<string, unknown>;
  layout?: QuestionLayout;
}

export type PartNumbering = 'a' | 'i' | '1';

export interface PartsValue {
  numbering: PartNumbering;
  items: Part[];
}

/** How a question (or part) arranges its pieces. Unset values fall back to the section, then to automatic. */
export interface QuestionLayout {
  /** MCQ option columns, 1–6 (unset = automatic). */
  optionCols?: number;
  /** Fill options across rows (a b / c d) or down columns (a c / b d). */
  optionOrder?: 'across' | 'down';
  /** Sub-question parts side by side, 1–4 columns. */
  partCols?: number;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  id: string;
  templateId: string;
  templateVersion: number;
  subject: string;
  chapter: string;
  difficulty: Difficulty;
  marks: number;
  data: Record<string, unknown>;
  layout?: QuestionLayout;
  createdAt: number;
  updatedAt: number;
}

export interface Section {
  id: string;
  title: string;
  instruction: string;
  questionIds: string[];
  /** Blueprint: question type expected in this section ('' = any). */
  templateId?: string;
  /** Blueprint: how many questions this section should have (0 = no plan). */
  count?: number;
  /** Marks for every question in this section; overrides the bank question's marks (0 = use each question's own). */
  marksEach?: number;
  /** "Answer any N" — only the best N count towards the total (0 = all compulsory). */
  attempt?: number;
  /** Default layout for every question in this section (a question's own layout wins). */
  layout?: QuestionLayout;
  /** Either/or choice: question id in questionIds → its "OR" alternative's id. */
  alternatives?: Record<string, string>;
}

export interface Paper {
  id: string;
  examName: string;
  subject: string;
  className: string;
  duration: string;
  date: string;
  instructions: string;
  answerSpace: boolean;
  /** Per-paper overrides of the institution's paper style. */
  style?: Partial<PaperStyle>;
  /** Language of printed words like "Class", "Max. Marks", "OR". */
  labelLang?: import('../lib/labels').PaperLang;
  /** Page columns for the questions (the header always spans the page). */
  pageCols?: 1 | 2;
  /** Print each question's second-language version under it. */
  bilingual?: boolean;
  /** The paper's content as a tree of Boxes. Older papers (sections) are converted on first open. */
  body?: import('../lib/box').Box;
  /** A locked (final) paper prints from these copies, so later edits in the bank never change it. */
  locked?: { at: number; questions: Question[]; templates: Template[] };
  /** Target maximum marks for the blueprint (0 = no target). */
  maxMarks?: number;
  sections: Section[];
  createdAt: number;
  updatedAt: number;
}

export interface PaperStyle {
  /** Font ids from lib/fonts.ts, one per script. */
  latinFont: string;
  hindiFont: string;
  teluguFont: string;
  /** Body size in points. */
  fontSize: number;
  lineHeight: number;
  /** Space between questions in points. */
  questionGap: number;
}

export type ImageAlign = 'inline' | 'left' | 'center' | 'right';

/** Images live once in the DB and are referenced from any text by an [[img:id|widthMm|align]] token. */
export interface ImageAsset {
  id: string;
  /** File name in the app's images folder (e.g. "<id>.png"). */
  file?: string;
  /** data: URL — only inside share/backup files and data from older versions. */
  src?: string;
  /** natural pixel size, for aspect ratio */
  w: number;
  h: number;
  /** Searchable name in the image store (images with a name are kept even when unused). */
  name?: string;
  addedAt?: number;
}

export type UiLang = 'en' | 'hi' | 'te';

export interface Settings {
  institutionName: string;
  address: string;
  /** data: URL */
  logo: string;
  uiLang: UiLang;
  paperStyle: PaperStyle;
}

export interface DB {
  version: 1;
  settings: Settings;
  templates: Template[];
  questions: Question[];
  papers: Paper[];
  images: Record<string, ImageAsset>;
  /** Saved boxes (the question bank / your own templates). */
  library: import('../lib/box').Box[];
}

/** A shareable file (.qbank / .qpaper) — small enough to send on WhatsApp. */
export interface Bundle {
  format: 'qmaker';
  kind: 'bank' | 'paper';
  version: 1;
  exportedAt: number;
  templates: Template[];
  questions: Question[];
  papers: Paper[];
  images?: Record<string, ImageAsset>;
  library?: import('../lib/box').Box[];
}
