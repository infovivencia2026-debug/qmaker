import {
  AlignmentType, BorderStyle, Document, SectionType, HorizontalPositionAlign, HorizontalPositionRelativeFrom, ImageRun, Packer, Paragraph, Table,
  TableCell, TableRow, TabStopType, TextRun, TextWrappingSide, TextWrappingType, VerticalPositionRelativeFrom, WidthType,
  type IRunOptions, type ParagraphChild,
} from 'docx';
import type { DB, ImageAlign, ImageAsset, Paper, Question, QuestionLayout, Template } from '../shared/types';
import { letter, seededOrder } from './util';
import { asOptions, asPairs, asParts, asText, fieldValue, effectiveLayout, lockedView, optionColumns, optionGrid, paperQuestionIds, partLabel, resolvePaper, secondKey, sectionInstruction, type ResolvedQuestion } from './paper';
import { collectImageIds } from './rich';
import { richBody, richHasImage } from './richdoc';
import { imageBytes, imgType } from './images';
import { effectiveStyle, wordLatinFont } from './fonts';
import { paperLabels, type LabelKey } from './labels';
import { answerLabel } from './renderHtml';

const CONTENT_WIDTH = 9906; // A4 width (11906 twips) minus 1000 twip margins
const COLUMN_GAP = 400;

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

/** Invisible table used to lay things out side by side (option grids, parts in columns). */
function layoutTable(cells: (Paragraph | Table)[][], cols: number, width: number, indent: number, alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]) {
  const colWidth = Math.floor((width - indent) / cols);
  const rows: TableRow[] = [];
  for (let i = 0; i < cells.length; i += cols) {
    const row = cells.slice(i, i + cols);
    while (row.length < cols) row.push([new Paragraph({ children: [] })]);
    rows.push(new TableRow({ children: row.map((children) => new TableCell({ children, width: { size: colWidth, type: WidthType.DXA }, borders: NO_BORDERS })) }));
  }
  return new Table({ rows, borders: NO_BORDERS, alignment, indent: alignment ? undefined : { size: indent, type: WidthType.DXA }, columnWidths: Array(cols).fill(colWidth), width: { size: colWidth * cols, type: WidthType.DXA } });
}
const INDENT = 560;
const PX_PER_MM = 96 / 25.4;

type RunOpts = Partial<IRunOptions>;
const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED } as const;

/** A paragraph's worth of content; block images (left/center) get a paragraph of their own. */
interface Chunk {
  children: ParagraphChild[];
  align?: 'left' | 'center' | 'right' | 'justify';
  table?: Table;
  /** Answer lines to draw. */
  lines?: number;
  /** Horizontal rule. */
  rule?: boolean;
  /** List nesting depth (extra indent). */
  extraIndent?: number;
}

class DocxWriter {
  readonly size: number; // half-points
  readonly gap: number; // twips before each question
  private font: { ascii: string; hAnsi: string; eastAsia: string; cs: string };
  readonly templates: Map<string, Template>;
  readonly L: (k: LabelKey) => string;
  readonly bilingual: boolean;
  /** Right edge for marks: the page, or one column on a 2-column page. */
  readonly width: number;

  constructor(private db: DB, paper: Paper, private imageData: Map<string, Uint8Array>) {
    const style = effectiveStyle(db.settings.paperStyle, paper.style);
    this.size = Math.round(style.fontSize * 2);
    this.gap = Math.round(style.questionGap * 20);
    this.templates = new Map(db.templates.map((t) => [t.id, t]));
    this.L = paperLabels(paper.labelLang);
    this.bilingual = !!paper.bilingual;
    this.width = paper.pageCols === 2 ? Math.floor((CONTENT_WIDTH - COLUMN_GAP) / 2) : CONTENT_WIDTH;
    const latin = wordLatinFont(style);
    // Word renders Devanagari/Telugu with the complex-script (cs) font. Nirmala UI ships with every Windows since 8.
    this.font = { ascii: latin, hAnsi: latin, eastAsia: latin, cs: 'Nirmala UI' };
  }

  run(text: string, opts: RunOpts = {}) {
    const size = (opts.size as number | undefined) ?? this.size;
    return new TextRun({ text, font: this.font, size, sizeComplexScript: size, boldComplexScript: opts.bold, ...opts });
  }

  scaled(factor: number): RunOpts {
    const size = Math.round(this.size * factor);
    return { size, sizeComplexScript: size };
  }

  private image(asset: ImageAsset, widthMm: number, align: ImageAlign) {
    const bytes = this.imageData.get(asset.id) ?? new Uint8Array();
    const width = Math.round(Math.min(widthMm, 170) * PX_PER_MM);
    const height = Math.round((width * asset.h) / asset.w);
    const type = imgType(asset);
    if (align !== 'right') return new ImageRun({ type, data: bytes, transformation: { width, height } });
    return new ImageRun({
      type, data: bytes, transformation: { width, height },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, align: HorizontalPositionAlign.RIGHT },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 },
        wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.LEFT },
        margins: { left: 114300, bottom: 57150 },
      },
    });
  }

  /** Rich content (editor HTML, or older text) → paragraph-sized chunks; tables and blocks come as tables/paragraphs. */
  chunks(s: string, opts: RunOpts = {}, _flat = false): Chunk[] {
    if (!s) return [{ children: [] }];
    const out: Chunk[] = [];
    const walkBlocks = (el: Element, depth = 0) => {
      for (const node of [...el.childNodes]) {
        if (node.nodeType === 3) {
          if (node.textContent?.trim()) out.push({ children: this.inline(node, opts) });
          continue;
        }
        if (node.nodeType !== 1) continue;
        const n = node as Element;
        switch (n.tagName) {
          case 'P': {
            const align = /text-align:\s*(\w+)/.exec(n.getAttribute('style') ?? '')?.[1];
            out.push({ children: this.inline(n, opts), align: align as Chunk['align'], extraIndent: depth });
            break;
          }
          case 'UL':
          case 'OL': {
            let k = Number(n.getAttribute('start')) || 1;
            for (const li of [...n.children].filter((c) => c.tagName === 'LI')) {
              const bullet = n.tagName === 'UL' ? '•' : `${k++}.`;
              const first = out.length;
              walkBlocks(li, depth + 1);
              const target = out[first];
              if (target && !target.table) target.children.unshift(this.run(`${bullet}\t`, opts));
              else out.splice(first, 0, { children: [this.run(bullet, opts)], extraIndent: depth + 1 });
            }
            break;
          }
          case 'TABLE':
            out.push({ children: [], table: this.table(n, opts) });
            break;
          case 'DIV':
            if (n.hasAttribute('data-lines')) out.push({ children: [], lines: Math.min(Number(n.getAttribute('data-lines')) || 1, 60) });
            else if (n.hasAttribute('data-box')) out.push({ children: [], table: this.box(Number(n.getAttribute('data-box')) || 40) });
            else walkBlocks(n, depth);
            break;
          case 'HR':
            out.push({ children: [], rule: true });
            break;
          default:
            out.push({ children: this.inline(n, opts) });
        }
      }
    };
    walkBlocks(richBody(s));
    return out.length ? out : [{ children: [] }];
  }

  /** Inline content with formatting marks, line breaks and pictures. */
  private inline(node: Node, opts: RunOpts): ParagraphChild[] {
    const runs: ParagraphChild[] = [];
    const walk = (n: Node, o: RunOpts) => {
      if (n.nodeType === 3) {
        if (n.textContent) runs.push(this.run(n.textContent, o));
        return;
      }
      if (n.nodeType !== 1) return;
      const el = n as Element;
      const t = el.tagName;
      if (t === 'BR') return void runs.push(this.run('', { ...o, break: 1 }));
      if (t === 'IMG') {
        const a = this.db.images[el.getAttribute('data-id') ?? ''];
        if (a && this.imageData.has(a.id)) runs.push(this.image(a, Number(el.getAttribute('data-width')) || 30, (el.getAttribute('data-align') ?? 'inline') as ImageAlign));
        return;
      }
      const next: RunOpts = { ...o };
      if (t === 'STRONG') Object.assign(next, { bold: true });
      if (t === 'EM') Object.assign(next, { italics: true });
      if (t === 'U') Object.assign(next, { underline: {} });
      if (t === 'S') Object.assign(next, { strike: true });
      if (t === 'SUB') Object.assign(next, { subScript: true });
      if (t === 'SUP') Object.assign(next, { superScript: true });
      el.childNodes.forEach((c) => walk(c, next));
    };
    if (node.nodeType === 3) walk(node, opts);
    else node.childNodes.forEach((c) => walk(c, opts));
    return runs;
  }

  /** Editor table → Word table (merged cells, header row, borders on/off). */
  private table(el: Element, opts: RunOpts): Table {
    const borderless = el.getAttribute('data-borderless') === 'true';
    const rows = [...el.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr')];
    const cols = Math.max(1, ...rows.map((r) => [...r.children].reduce((n, c) => n + (Number(c.getAttribute('colspan')) || 1), 0)));
    const total = this.width - INDENT;
    const colWidth = Math.floor(total / cols);
    const line = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
    const borders = borderless ? NO_BORDERS : { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line };
    return new Table({
      borders,
      indent: { size: INDENT, type: WidthType.DXA },
      columnWidths: Array(cols).fill(colWidth),
      width: { size: colWidth * cols, type: WidthType.DXA },
      rows: rows.map((tr) => new TableRow({
        tableHeader: [...tr.children].some((c) => c.tagName === 'TH'),
        children: [...tr.children].map((cell) => {
          const span = Number(cell.getAttribute('colspan')) || 1;
          const isHead = cell.tagName === 'TH';
          const inner = this.toBlocks(this.chunks(cell.innerHTML || '<p></p>', isHead ? { ...opts, bold: true } : opts), 0);
          return new TableCell({
            children: inner.length ? inner : [new Paragraph({ children: [] })],
            columnSpan: span > 1 ? span : undefined,
            rowSpan: Number(cell.getAttribute('rowspan')) > 1 ? Number(cell.getAttribute('rowspan')) : undefined,
            width: { size: colWidth * span, type: WidthType.DXA },
            borders: borderless ? NO_BORDERS : undefined,
            shading: isHead && !borderless ? { fill: 'F2F2F2', type: 'clear', color: 'auto' } : undefined,
          });
        }),
      })),
    });
  }

  /** Empty bordered box of a given height (mm) for drawings. */
  private box(heightMm: number): Table {
    const line = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
    const width = this.width - INDENT;
    return new Table({
      indent: { size: INDENT, type: WidthType.DXA },
      columnWidths: [width],
      width: { size: width, type: WidthType.DXA },
      rows: [new TableRow({ height: { value: Math.round(Math.min(heightMm, 250) * 56.7), rule: 'exact' }, children: [new TableCell({ children: [new Paragraph({ children: [] })], borders: { top: line, bottom: line, left: line, right: line } })] })],
    });
  }

  /** Rich content squeezed into one paragraph (option cells): paragraphs joined by line breaks. */
  flat(s: string, opts: RunOpts = {}) {
    const parts = this.chunks(s, opts).filter((c) => c.children.length);
    return parts.flatMap((c, i) => (i ? [this.run('', { break: 1 }), ...c.children] : c.children));
  }

  para(children: ParagraphChild[], extra: Record<string, unknown> = {}) {
    return new Paragraph({ children, spacing: { after: 60 }, ...extra });
  }

  /** Multi-paragraph block of rich text, indented under the question number. */
  /** Paragraphs/tables for chunks, indented to `left`. */
  toBlocks(chunks: Chunk[], left = INDENT, extra: Record<string, unknown> = {}): (Paragraph | Table)[] {
    return chunks.flatMap((c): (Paragraph | Table)[] => {
      if (c.table) return [c.table];
      if (c.rule) return [new Paragraph({ children: [], indent: { left }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } } })];
      if (c.lines)
        return Array.from({ length: c.lines }, () => new Paragraph({ children: [this.run('')], indent: { left }, spacing: { before: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999', space: 1 } } }));
      const ind = left + (c.extraIndent ?? 0) * 360;
      return [this.para(c.children, { indent: c.extraIndent ? { left: ind, hanging: 280 } : { left }, tabStops: c.extraIndent ? [{ type: TabStopType.LEFT, position: ind }] : undefined, alignment: c.align && ALIGN[c.align], ...extra })];
    });
  }

  block(s: string, opts: RunOpts = {}, left = INDENT) {
    return this.toBlocks(this.chunks(s, opts), left);
  }

}

async function logoRun(dataUrl: string) {
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const h = 60;
  const w = Math.round((img.naturalWidth / img.naturalHeight) * h) || h;
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  const type = m[1].startsWith('jp') ? 'jpg' : (m[1] as 'png' | 'gif' | 'bmp');
  return new ImageRun({ type, data: bytes, transformation: { width: w, height: h } });
}

type QLike = Pick<Question, 'id' | 'data'> & { layout?: QuestionLayout };

/** Content that can't share the question-number line: tables, lines, rules, non-left paragraphs. */
const ownLine = (c: Chunk) => !!(c.table || c.lines || c.rule || (c.align && c.align !== 'left'));

interface BlockOpts {
  label: string;
  marks: string;
  /** Where the text starts; parts sit one step further in than their question. */
  left: number;
  /** Right edge (marks are right-aligned here). */
  right: number;
  bold?: boolean;
  sectionLayout?: QuestionLayout;
}

/**
 * Paragraphs for one question (or one part). `label` and `marks` go on the first line;
 * `left` is where the text starts, so parts sit one step further in than their question.
 */
function fieldBlocks(w: DocxWriter, q: QLike, template: Template, o: BlockOpts, answerKey: boolean, answerSpace: boolean) {
  const { label, marks, left, right, bold = true } = o;
  const layout = effectiveLayout(q.layout, o.sectionLayout);
  const out: (Paragraph | Table)[] = [];
  let numbered = false;
  // The first paragraph carries the question number and the marks, like a printed paper.
  const firstLine = (children: ParagraphChild[]) => {
    numbered = true;
    return w.para([w.run(label, { bold }), w.run('\t'), ...children, w.run('\t'), w.run(marks, { bold })], {
      indent: { left: left, hanging: INDENT },
      spacing: { before: left > INDENT ? 40 : w.gap, after: 60 },
      tabStops: [{ type: TabStopType.LEFT, position: left }, { type: TabStopType.RIGHT, position: right }],
    });
  };
  const addRich = (s: string, opts: RunOpts = {}, prefix: ParagraphChild[] = []) => {
    const paras = w.block(s, opts, left);
    if (!numbered) {
      const [first, ...rest] = w.chunks(s, opts);
      // A centred/left image as the very first thing still needs the number line above it.
      if (ownLine(first)) out.push(firstLine(prefix), ...w.block(s, opts, left));
      else out.push(firstLine([...prefix, ...first.children]), ...w.toBlocks(rest, left));
      return;
    }
    if (prefix.length) {
      const [first, ...rest] = w.chunks(s, opts);
      const blockFirst = ownLine(first);
      out.push(w.para([...prefix, ...(blockFirst ? [] : first.children)], { indent: { left: left } }));
      if (blockFirst) out.push(...w.toBlocks([first], left));
      out.push(...w.toBlocks(rest, left));
      return;
    }
    out.push(...paras);
  };
  const ensureNumbered = () => { if (!numbered) out.push(firstLine([])); };

  for (const f of template.fields) {
    const v = fieldValue(q, f);
    if (f.answer && !answerKey) continue;
    switch (f.type) {
      case 'text': {
        const text = asText(v);
        const text2 = w.bilingual ? asText(q.data[secondKey(f.key)]) : '';
        if (!text && !text2) break;
        if (f.answer) addRich(text2 ? `${text}\n${text2}` : text, { italics: true }, [w.run(`${answerLabel(template, f.label, w.L)}: `, { bold: true })]);
        else {
          addRich(text);
          if (text2) out.push(...w.block(text2, {}, left));
        }
        break;
      }
      case 'truefalse':
        if (typeof v === 'boolean') addRich(w.L(v ? 'true' : 'false'), { italics: true }, [w.run(`${answerLabel(template, f.label, w.L)}: `, { bold: true })]);
        break;
      case 'options': {
        const { items, items2, correct } = asOptions(v);
        const twoLang = w.bilingual && !!items2?.some(Boolean);
        const cols = layout.optionCols || optionColumns(twoLang ? [...items, ...(items2 ?? [])] : items);
        const grid = optionGrid(items.length, cols, layout.optionOrder);
        const cellRuns = (i: number) => {
          const on = answerKey && i === correct;
          const second = twoLang && items2?.[i] ? [w.run('', { break: 1 }), ...w.flat(items2[i])] : [];
          return [w.run(`(${letter(i)}) `, { bold: on }), ...w.flat(items[i], { bold: on, underline: on ? {} : undefined }), ...second];
        };
        ensureNumbered();
        if (grid.cols === 1) {
          for (const i of grid.cells) if (i !== null) out.push(new Paragraph({ children: cellRuns(i), indent: { left }, spacing: { after: 40 } }));
        } else {
          const cells = grid.cells.map((i) => [new Paragraph({ children: i === null ? [] : cellRuns(i), spacing: { after: 40 } })]);
          out.push(layoutTable(cells, grid.cols, right, left));
        }
        if (answerKey && correct !== null) addRich(richHasImage(items[correct]) ? '' : items[correct], { italics: true }, [w.run(`${w.L('answer')}: (${letter(correct)}) `, { bold: true })]);
        break;
      }
      case 'pairs': {
        const pairs = asPairs(v);
        if (!pairs.length) break;
        ensureNumbered();
        const order = seededOrder(pairs.length, q.id);
        const cell = (label: string, s: string, bold = false) =>
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: w.chunks(s, { bold }).map((c, i) => c.table ?? new Paragraph({ children: i ? c.children : [w.run(label, { bold }), ...c.children], alignment: c.align && ALIGN[c.align] })),
          });
        out.push(new Table({
          width: { size: 90, type: WidthType.PERCENTAGE },
          indent: { size: left, type: WidthType.DXA },
          rows: [
            new TableRow({ children: [cell('', 'A', true), cell('', 'B', true)] }),
            ...pairs.map((p, i) => new TableRow({ children: [cell(`${i + 1}. `, p[0]), cell(`(${letter(i)}) `, pairs[order[i]][1])] })),
          ],
        }));
        if (answerKey) addRich(pairs.map((_, i) => `${i + 1} → (${letter(order.indexOf(i))})`).join(',  '), { italics: true }, [w.run(`${w.L('answer')}: `, { bold: true })]);
        break;
      }
      case 'lines': {
        const n = Math.min(Number(v) || 0, 60);
        if (!answerSpace || answerKey || !n) break;
        ensureNumbered();
        for (let i = 0; i < n; i++) {
          out.push(new Paragraph({ children: [w.run('')], indent: { left: left }, spacing: { before: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999', space: 1 } } }));
        }
        break;
      }
      case 'parts': {
        const { numbering, items } = asParts(v);
        ensureNumbered();
        const pc = Math.min(layout.partCols, Math.max(1, items.length));
        const partBlocks = (p: (typeof items)[number], i: number, pLeft: number, pRight: number) => {
          const t = w.templates.get(p.templateId);
          return t ? fieldBlocks(w, p, t, { label: partLabel(numbering, i), marks: `[${p.marks}]`, left: pLeft, right: pRight, bold: false, sectionLayout: o.sectionLayout }, answerKey, answerSpace) : [];
        };
        if (pc === 1) items.forEach((p, i) => out.push(...partBlocks(p, i, left + INDENT, right)));
        else {
          // Parts side by side: each cell is its own little question with label and marks.
          const cellWidth = Math.floor((right - left) / pc);
          out.push(layoutTable(items.map((p, i) => { const b = partBlocks(p, i, INDENT, cellWidth - 120); return b.length ? b : [new Paragraph({ children: [] })]; }), pc, right, left));
        }
        break;
      }
    }
  }
  ensureNumbered();
  return out;
}

function questionBlocks(w: DocxWriter, { number, question, template, marks, alt, sectionLayout }: ResolvedQuestion, answerKey: boolean, answerSpace: boolean) {
  const base = { left: INDENT, right: w.width, sectionLayout };
  const out = fieldBlocks(w, question, template, { ...base, label: `${number}.`, marks: `[${marks}]` }, answerKey, answerSpace);
  if (alt) {
    out.push(w.para([w.run(w.L('or'), { bold: true })], { alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 } }));
    out.push(...fieldBlocks(w, alt.question, alt.template, { ...base, label: '', marks: '' }, answerKey, answerSpace));
  }
  return out;
}

export async function renderPaperDocx(paper: Paper, liveDb: DB, answerKey: boolean): Promise<Uint8Array> {
  const db = lockedView(paper, liveDb);
  const { settings: s } = db;
  // Word needs the picture bytes up front; read every image this paper uses once.
  const imageData = new Map<string, Uint8Array>();
  const used = new Set(paperQuestionIds(paper));
  for (const id of collectImageIds([paper, db.questions.filter((q) => used.has(q.id))])) {
    const a = db.images[id];
    if (a) imageData.set(id, await imageBytes(a).catch(() => new Uint8Array()));
  }
  const w = new DocxWriter(db, paper, imageData);
  const { sections, totalMarks } = resolvePaper(paper, db);
  const center = (children: ParagraphChild[]) => w.para(children, { alignment: AlignmentType.CENTER });
  const spread = (left: string, right: string) =>
    w.para([w.run(left, { bold: true }), w.run('\t'), w.run(right, { bold: true })], { tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }] });
  const plain = (text: string, opts: RunOpts = {}) => w.toBlocks(w.chunks(text, opts), 0);

  const logo = s.logo ? await logoRun(s.logo).catch(() => null) : null;
  const children: (Paragraph | Table)[] = [];
  if (logo) children.push(center([logo]));
  if (s.institutionName) children.push(center([w.run(s.institutionName, { bold: true, ...w.scaled(1.33) })]));
  if (s.address) children.push(center([w.run(s.address, w.scaled(0.83))]));
  children.push(
    w.para([w.run(paper.examName + (answerKey ? ` — ${w.L('answerKey')}` : ''), { bold: true, ...w.scaled(1.08) })], {
      alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000', space: 4 } },
    }),
    spread(`${w.L('class')}: ${paper.className}`, `${w.L('subject')}: ${paper.subject}`),
    spread(`${w.L('time')}: ${paper.duration}${paper.date ? `    ${w.L('date')}: ${paper.date}` : ''}`, `${w.L('maxMarks')}: ${totalMarks}`),
  );
  if (paper.instructions.trim()) {
    children.push(w.para([w.run(`${w.L('instructions')}:`, { bold: true })], { spacing: { before: 160, after: 40 } }));
    children.push(...plain(paper.instructions.trim(), w.scaled(0.92)));
  }
  // The header spans the page; questions go in a second section that may have two columns.
  const header = children;
  const body: (Paragraph | Table)[] = [];
  for (const sec of sections) {
    const children = body;
    if (sec.title || sec.marksLabel) {
      children.push(
        w.para([w.run(sec.title, { bold: true }), w.run('\t'), w.run(sec.marksLabel, { bold: true })], {
          spacing: { before: 240, after: 60 },
          keepNext: true,
          tabStops: [{ type: TabStopType.RIGHT, position: w.width }],
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } },
        }),
      );
    }
    const instr = sectionInstruction(sec);
    if (instr) children.push(...plain(instr, { italics: true, ...w.scaled(0.92) }));
    for (const q of sec.questions) children.push(...questionBlocks(w, q, answerKey, paper.answerSpace));
  }
  body.push(center([w.run(w.L('end'), { bold: true })]));

  const style = effectiveStyle(s.paperStyle, paper.style);
  const page = { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } };
  const doc = new Document({
    creator: 'QMaker',
    title: paper.examName,
    styles: { default: { document: { paragraph: { spacing: { line: Math.round(240 * style.lineHeight / 1.15) } } } } },
    sections: [
      { properties: { page }, children: header },
      {
        properties: { page, type: SectionType.CONTINUOUS, column: paper.pageCols === 2 ? { count: 2, space: COLUMN_GAP, separate: true, equalWidth: true } : { count: 1 } },
        children: body,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
