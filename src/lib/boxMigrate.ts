import type { DB, OptionsValue, Paper, Question, QuestionLayout, Template } from '../shared/types';
import type { Box } from './box';
import { asOptions, asPairs, asParts, asText, effectiveLayout, fieldValue, lockedView, optionColumns, resolvePaper, secondKey } from './paper';
import { toHtml } from './richdoc';
import { answerLabel, paperLabels } from './labels';
import { esc } from './util';

/**
 * Converts the older section → question → field structure into Boxes. Nothing is lost: sections become
 * headed boxes with marks, questions numbered boxes, options/parts/pairs child boxes, answers key-only boxes.
 */

let seq = 0;
const bid = (base: string, part: string) => `${base}~${part}~${seq++}`;

const html = (s: string) => (s ? toHtml(s) : '');

/** "Answer: …" on one line: the label goes inside the first paragraph. */
const withLabel = (label: string, body: string) =>
  /^<p(\s[^>]*)?>/.test(body) ? body.replace(/^<p(\s[^>]*)?>/, (m) => `${m}<strong>${esc(label)}:</strong> `) : `<p><strong>${esc(label)}:</strong></p>${body}`;

function fieldsToBoxes(q: Pick<Question, 'id' | 'data'> & { layout?: QuestionLayout }, t: Template, db: DB, paper: Paper, sectionLayout?: QuestionLayout): Box[] {
  const L = paperLabels(paper.labelLang);
  const layout = effectiveLayout(q.layout, sectionLayout);
  const out: Box[] = [];
  for (const f of t.fields) {
    const v = fieldValue(q, f);
    switch (f.type) {
      case 'text': {
        const text = asText(v);
        const text2 = asText(q.data[secondKey(f.key)]);
        if (!text && !text2) break;
        if (f.answer) {
          out.push({ id: bid(q.id, f.key), visible: 'key', content: withLabel(answerLabel(t, f.label, L), html(text)), content2: text2 ? html(text2) : undefined });
        } else out.push({ id: bid(q.id, f.key), content: html(text), content2: text2 ? html(text2) : undefined });
        break;
      }
      case 'truefalse':
        if (typeof v === 'boolean') out.push({ id: bid(q.id, f.key), visible: 'key', content: `<p><strong>${esc(answerLabel(t, f.label, L))}:</strong> ${L(v ? 'true' : 'false')}</p>` });
        break;
      case 'options': {
        const o: OptionsValue = asOptions(v);
        out.push({
          id: bid(q.id, 'options'),
          name: 'Options',
          layout: { mode: 'grid', cols: layout.optionCols || optionColumns(o.items), order: layout.optionOrder },
          children: o.items.map((it, i) => ({
            id: bid(q.id, `opt${i}`),
            content: html(it),
            content2: o.items2?.[i] ? html(o.items2[i]) : undefined,
            number: { format: 'a', pattern: '({n})', scope: 'local' },
            correct: i === o.correct || undefined,
          })),
        });
        break;
      }
      case 'pairs': {
        const pairs = asPairs(v);
        if (!pairs.length) break;
        out.push({
          id: bid(q.id, 'match'),
          name: 'Match columns',
          layout: { mode: 'grid', cols: 2 },
          style: { border: true },
          children: [
            { id: bid(q.id, 'colA'), content: '<p><strong>A</strong></p>', children: pairs.map((p, i) => ({ id: bid(q.id, `a${i}`), content: html(p[0]), number: { format: '1', pattern: '{n}.', scope: 'local' } })) },
            { id: bid(q.id, 'colB'), content: '<p><strong>B</strong></p>', shuffle: true, children: pairs.map((p, i) => ({ id: bid(q.id, `b${i}`), content: html(p[1]), number: { format: 'a', pattern: '({n})', scope: 'local' } })) },
          ],
        });
        break;
      }
      case 'lines': {
        const n = Math.min(Number(v) || 0, 60);
        if (n && paper.answerSpace) out.push({ id: bid(q.id, 'lines'), visible: 'paper', content: `<div data-lines="${n}"></div>` });
        break;
      }
      case 'parts': {
        const { numbering, items } = asParts(v);
        const pc = Math.min(layout.partCols, Math.max(1, items.length));
        const partBoxes: Box[] = items.map((p) => {
          const pt = db.templates.find((x) => x.id === p.templateId);
          return {
            id: bid(q.id, `part-${p.id}`),
            number: { format: numbering === 'i' ? 'i' : numbering === '1' ? '1' : 'a', pattern: '({n})', scope: 'local' },
            marks: { mode: 'fixed', value: p.marks, show: true, pattern: '[{m}]' },
            children: pt ? fieldsToBoxes(p, pt, db, paper, sectionLayout) : [],
          };
        });
        out.push(pc > 1 ? { id: bid(q.id, 'parts'), layout: { mode: 'grid', cols: pc }, children: partBoxes } : { id: bid(q.id, 'parts'), children: partBoxes });
        break;
      }
    }
  }
  return out;
}

/** A whole older paper → one root Box. */
export function paperToBox(paper: Paper, liveDb: DB): Box {
  const db = lockedView(paper, liveDb);
  const L = paperLabels(paper.labelLang);
  const { sections } = resolvePaper(paper, db);
  const root: Box = { id: `${paper.id}~root`, children: [] };
  if (paper.instructions.trim()) {
    root.children!.push({ id: bid(paper.id, 'instructions'), name: 'Instructions', style: { scale: 0.92 }, content: `<p><strong>${esc(L('instructions'))}:</strong></p>${html(paper.instructions.trim())}` });
  }
  for (const [si, sec] of sections.entries()) {
    const s = paper.sections[si];
    const qBox = (q: Question, t: Template, marks: number, show: boolean): Box => ({
      id: bid(q.id, 'q'),
      meta: { subject: q.subject, chapter: q.chapter, difficulty: q.difficulty },
      marks: { mode: 'fixed', value: marks, show, pattern: '[{m}]' },
      children: fieldsToBoxes(q, t, db, paper, s.layout),
    });
    const questionBoxes: Box[] = sec.questions.map((rq) => {
      const main = qBox(rq.question, rq.template, rq.marks, !rq.alt);
      if (!rq.alt) return { ...main, number: { format: '1', pattern: '{n}.', scope: 'paper', counter: 'q' } };
      // Either/or: one numbered box offering a choice between the two questions.
      return {
        id: bid(rq.question.id, 'or'),
        number: { format: '1', pattern: '{n}.', scope: 'paper', counter: 'q' },
        choice: true,
        marks: { mode: 'best', best: 1, show: true, pattern: '[{m}]' },
        children: [{ ...main, marks: { mode: 'fixed', value: rq.marks, show: false } }, qBox(rq.alt.question, rq.alt.template, rq.marks, false)],
      };
    });
    const instr = sec.instruction.trim() || (sec.attempt ? L('anyOf', { n: sec.attempt, m: sec.questions.length }) : '');
    const children: Box[] = [];
    if (instr) children.push({ id: bid(s.id, 'instr'), style: { italic: true, scale: 0.92 }, content: html(instr) });
    children.push(...questionBoxes);
    const each = sec.questions.length > 1 && sec.questions.every((q) => q.marks === sec.questions[0].marks);
    root.children!.push({
      id: bid(s.id, 'section'),
      name: sec.title || 'Section',
      content: `<p>${esc(sec.title)}</p>`,
      style: { bold: true, rule: true, spaceBefore: 8 },
      marks: {
        mode: sec.attempt ? 'best' : 'sum',
        best: sec.attempt || undefined,
        show: true,
        pattern: each && (sec.attempt || sec.questions.length) > 1 ? '{k} × {e} = {m}' : `{m} ${L('marks')}`,
      },
      children,
    });
  }
  return root;
}
