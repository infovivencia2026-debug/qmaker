import type { DB, Paper, Question, Template } from '../shared/types';
import { esc, letter, seededOrder } from './util';
import { asOptions, asPairs, asParts, asText, fieldValue, lockedView, optionColumns, partLabel, resolvePaper, sectionInstruction, type ResolvedQuestion } from './paper';
import { hasImage, richHtml } from './rich';
import { effectiveStyle, styleVars } from './fonts';

// Every size is relative to --fs (body size) so the font-size setting scales the whole paper.
export const PAPER_CSS = `
.qp { --fs: 12pt; --lh: 1.45; --gap: 6pt; font-size: var(--fs); line-height: var(--lh); color: #000; background: #fff; }
.qp * { box-sizing: border-box; }
.qp .hd { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
.qp .hd-top { display: flex; align-items: center; justify-content: center; gap: 12px; }
.qp .hd img { max-height: 60px; max-width: 80px; }
.qp .inst { font-size: calc(var(--fs) * 1.33); font-weight: 700; }
.qp .addr { font-size: calc(var(--fs) * 0.83); }
.qp .exam { font-size: calc(var(--fs) * 1.08); font-weight: 700; margin-top: 4px; }
.qp .meta { display: flex; justify-content: space-between; font-weight: 600; margin: 2px 0; }
.qp .gi { margin: 8px 0; font-size: calc(var(--fs) * 0.92); }
.qp .gi-title { font-weight: 700; }
.qp .gi p { margin: 0; white-space: pre-wrap; display: flow-root; }
.qp .sec { margin-top: calc(var(--gap) + 8pt); }
.qp .sec-h, .qp .sec-i { break-after: avoid; }
.qp .sec-h { display: flex; justify-content: space-between; font-weight: 700; border-bottom: 1px solid #000; margin-bottom: 4px; }
.qp .sec-i { font-style: italic; font-size: calc(var(--fs) * 0.92); margin-bottom: 4px; white-space: pre-wrap; display: flow-root; }
.qp .q { display: grid; grid-template-columns: 2.2em 1fr auto; gap: 0 6px; margin: var(--gap) 0; break-inside: avoid; }
.qp .q > div:nth-child(2) { display: flow-root; min-width: 0; }
.qp .qn { font-weight: 600; }
.qp .qm { font-weight: 600; white-space: nowrap; }
.qp .t { white-space: pre-wrap; display: flow-root; }
.qp .opts { display: grid; gap: 2px 12px; margin-top: 3px; }
.qp .opts > div { white-space: pre-wrap; }
.qp .opts.c4 { grid-template-columns: repeat(4, 1fr); }
.qp .opts.c2 { grid-template-columns: repeat(2, 1fr); }
.qp .opts.c1 { grid-template-columns: 1fr; }
.qp .ok { font-weight: 700; text-decoration: underline; }
.qp table.pairs { border-collapse: collapse; margin-top: 4px; width: 90%; }
.qp table.pairs td, .qp table.pairs th { border: 1px solid #000; padding: 2px 8px; text-align: left; vertical-align: top; white-space: pre-wrap; }
.qp .lines { clear: both; }
.qp .lines div { border-bottom: 1px solid #999; height: calc(var(--fs) * 2.1); }
.qp .ans { margin-top: 3px; padding: 3px 8px; border-left: 3px solid #000; background: #f2f2f2; white-space: pre-wrap; display: flow-root; }
.qp .warn { color: #b00; }
.qp .q.part { margin: 3pt 0; grid-template-columns: 2.2em 1fr auto; }
.qp .q.part .qm { font-weight: normal; }
.qp .or { text-align: center; font-weight: 700; margin: 2pt 0; }
.qp .either > .q { margin-bottom: 2pt; }
.qp .end { text-align: center; margin-top: 18px; font-weight: 600; clear: both; }
/* images */
.qp img.qi { max-width: 100%; height: auto; }
.qp img.qi.al-inline { display: inline-block; vertical-align: middle; margin: 0 2px; }
.qp img.qi.al-left { display: block; margin: 4px 0; }
.qp img.qi.al-center { display: block; margin: 4px auto; }
.qp img.qi.al-right { float: right; margin: 2px 0 4px 10px; }
.qp .opts img.qi.al-left, .qp .opts img.qi.al-center, .qp table.pairs img.qi { margin: 2px 0; }
`;

type QLike = Pick<Question, 'id' | 'data'>;

const grid = (num: string, body: string, marks: string, cls = '') =>
  `<div class="q ${cls}"><div class="qn">${num}</div><div>${body}</div><div class="qm">${marks}</div></div>`;

function renderFields(q: QLike, template: Template, db: DB, answerKey: boolean, answerSpace: boolean): string {
  const rich = (s: string) => richHtml(s, db.images);
  const parts: string[] = [];
  for (const f of template.fields) {
    const v = fieldValue(q, f);
    if (f.answer && !answerKey) continue;
    switch (f.type) {
      case 'text': {
        const text = asText(v);
        if (!text) break;
        parts.push(f.answer ? `<div class="ans"><b>${esc(f.label)}:</b> ${rich(text)}</div>` : `<div class="t">${rich(text)}</div>`);
        break;
      }
      case 'truefalse':
        if (typeof v === 'boolean') parts.push(`<div class="ans"><b>${esc(f.label)}:</b> ${v ? 'True' : 'False'}</div>`);
        break;
      case 'options': {
        const { items, correct } = asOptions(v);
        const cells = items
          .map((it, i) => `<div class="${answerKey && i === correct ? 'ok' : ''}">(${letter(i)}) ${rich(it)}</div>`)
          .join('');
        parts.push(`<div class="opts c${optionColumns(items)}">${cells}</div>`);
        // Picture options: the underlined option is enough, don't print the picture twice.
        if (answerKey && correct !== null) parts.push(`<div class="ans"><b>Answer:</b> (${letter(correct)}) ${hasImage(items[correct]) ? '' : rich(items[correct])}</div>`);
        break;
      }
      case 'pairs': {
        const pairs = asPairs(v);
        const order = seededOrder(pairs.length, q.id);
        const rows = pairs
          .map((p, i) => `<tr><td>${i + 1}. ${rich(p[0])}</td><td>(${letter(i)}) ${rich(pairs[order[i]][1])}</td></tr>`)
          .join('');
        parts.push(`<table class="pairs"><tr><th>A</th><th>B</th></tr>${rows}</table>`);
        if (answerKey) {
          const key = pairs.map((_, i) => `${i + 1} → (${letter(order.indexOf(i))})`).join(',  ');
          parts.push(`<div class="ans"><b>Answer:</b> ${key}</div>`);
        }
        break;
      }
      case 'lines': {
        const n = Number(v) || 0;
        if (answerSpace && !answerKey && n > 0) parts.push(`<div class="lines">${'<div></div>'.repeat(Math.min(n, 60))}</div>`);
        break;
      }
      case 'parts': {
        const { numbering, items } = asParts(v);
        items.forEach((p, i) => {
          const t = db.templates.find((x) => x.id === p.templateId);
          if (t) parts.push(grid(partLabel(numbering, i), renderFields(p, t, db, answerKey, answerSpace), `[${p.marks}]`, 'part'));
        });
        break;
      }
    }
  }
  return parts.join('');
}

function renderQuestion({ number, question: q, template, marks, alt }: ResolvedQuestion, db: DB, answerKey: boolean, answerSpace: boolean) {
  const main = grid(`${number}.`, renderFields(q, template, db, answerKey, answerSpace), `[${marks}]`);
  if (!alt) return main;
  return `<div class="either">${main}<div class="or">OR</div>${grid('', renderFields(alt.question, alt.template, db, answerKey, answerSpace), '')}</div>`;
}

export function renderPaperHtml(paper: Paper, liveDb: DB, answerKey: boolean) {
  const db = lockedView(paper, liveDb);
  const { settings: s } = db;
  const rich = (t: string) => richHtml(t, db.images);
  const { sections, totalMarks, missing } = resolvePaper(paper, db);
  const style = effectiveStyle(s.paperStyle, paper.style);
  const header = `
    <div class="hd">
      <div class="hd-top">
        ${s.logo ? `<img src="${esc(s.logo)}" />` : ''}
        <div>
          ${s.institutionName ? `<div class="inst">${esc(s.institutionName)}</div>` : ''}
          ${s.address ? `<div class="addr">${esc(s.address)}</div>` : ''}
        </div>
      </div>
      <div class="exam">${esc(paper.examName)}${answerKey ? ' — ANSWER KEY' : ''}</div>
    </div>
    <div class="meta"><span>Class: ${esc(paper.className)}</span><span>Subject: ${esc(paper.subject)}</span></div>
    <div class="meta"><span>Time: ${esc(paper.duration)}</span>${paper.date ? `<span>Date: ${esc(paper.date)}</span>` : ''}<span>Max. Marks: ${totalMarks}</span></div>`;
  const instructions = paper.instructions.trim()
    ? `<div class="gi"><div class="gi-title">General Instructions:</div><p>${rich(paper.instructions.trim())}</p></div>`
    : '';
  const body = sections
    .map((sec) => {
      const instr = sectionInstruction(sec);
      return `
    <div class="sec">
      ${sec.title || sec.marksLabel ? `<div class="sec-h"><span>${esc(sec.title)}</span><span>${esc(sec.marksLabel)}</span></div>` : ''}
      ${instr ? `<div class="sec-i">${rich(instr)}</div>` : ''}
      ${sec.questions.map((q) => renderQuestion(q, db, answerKey, paper.answerSpace)).join('')}
    </div>`;
    })
    .join('');
  const warn = missing ? `<p class="warn">${missing} question(s) in this paper no longer exist in the bank.</p>` : '';
  return `<div class="qp" style="${styleVars(style)}">${header}${instructions}${warn}${body}<div class="end">*** End of Paper ***</div></div>`;
}
