import type { Template } from './types';

const t = (id: string, name: string, defaultMarks: number, fields: Template['fields']): Template => ({
  id, name, version: 1, builtin: true, defaultMarks, fields, updatedAt: 0,
});

/** Shipped with the app. Users customise by duplicating, so these can be updated in new releases. */
export const BUILTIN_TEMPLATES: Template[] = [
  t('mcq', 'Multiple Choice', 1, [
    { key: 'stem', label: 'Question', type: 'text', required: true },
    { key: 'options', label: 'Options', type: 'options', required: true, default: { items: ['', '', '', ''], correct: null } },
  ]),
  t('fib', 'Fill in the Blank', 1, [
    { key: 'stem', label: 'Sentence (use ____ for the blank)', type: 'text', required: true },
    { key: 'answer', label: 'Answer', type: 'text', answer: true },
  ]),
  t('tf', 'True / False', 1, [
    { key: 'stem', label: 'Statement', type: 'text', required: true },
    { key: 'answer', label: 'Answer', type: 'truefalse', answer: true, default: null },
  ]),
  t('match', 'Match the Following', 4, [
    { key: 'stem', label: 'Instruction', type: 'text', default: 'Match the following:' },
    { key: 'pairs', label: 'Pairs (correct matches)', type: 'pairs', required: true, default: [['', ''], ['', ''], ['', ''], ['', '']] },
  ]),
  t('short', 'Short Answer', 2, [
    { key: 'stem', label: 'Question', type: 'text', required: true },
    { key: 'lines', label: 'Answer lines', type: 'lines', default: 3 },
    { key: 'answer', label: 'Model answer', type: 'text', answer: true },
  ]),
  t('long', 'Long Answer', 5, [
    { key: 'stem', label: 'Question', type: 'text', required: true },
    { key: 'lines', label: 'Answer lines', type: 'lines', default: 12 },
    { key: 'answer', label: 'Model answer / marking points', type: 'text', answer: true },
  ]),
  t('multi', 'Question with Parts', 5, [
    { key: 'stem', label: 'Main question (optional)', type: 'text' },
    { key: 'parts', label: 'Parts', type: 'parts', required: true, default: { numbering: 'a', items: [] } },
  ]),
  t('case', 'Case Study / Passage', 4, [
    { key: 'stem', label: 'Passage, data or figure', type: 'text', required: true },
    { key: 'parts', label: 'Questions on the passage', type: 'parts', required: true, default: { numbering: 'i', items: [] } },
  ]),
];

/** Templates that contain parts can't themselves be used as a part. */
export const isGroupTemplate = (t: Template) => t.fields.some((f) => f.type === 'parts');
