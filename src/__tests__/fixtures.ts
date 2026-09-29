import { BUILTIN_TEMPLATES } from '../shared/templates';
import { DEFAULT_STYLE } from '../lib/fonts';
import type { DB, Paper, Question, Section } from '../shared/types';

let n = 0;
export function q(templateId: string, marks: number, data: Record<string, unknown> = {}, extra: Partial<Question> = {}): Question {
  n++;
  return {
    id: `q${n}`, templateId, templateVersion: 1, subject: 'Science', chapter: 'Light', difficulty: 'easy',
    marks, data: { stem: `Question ${n}`, ...data }, createdAt: n, updatedAt: n, ...extra,
  };
}

export const section = (questionIds: string[], extra: Partial<Section> = {}): Section => ({
  id: `s-${questionIds.join('-')}`, title: 'Section', instruction: '', questionIds, ...extra,
});

export const paper = (sections: Section[], extra: Partial<Paper> = {}): Paper => ({
  id: 'p1', examName: 'Test', subject: 'Science', className: 'X', duration: '1h', date: '', instructions: '',
  answerSpace: false, sections, createdAt: 0, updatedAt: 0, ...extra,
});

export const db = (questions: Question[], papers: Paper[] = []): DB => ({
  version: 1, images: {}, templates: BUILTIN_TEMPLATES, questions, papers, library: [],
  settings: { institutionName: '', address: '', logo: '', uiLang: 'en', paperStyle: DEFAULT_STYLE },
});
