import {
  AlignmentType, BorderStyle, Document, HorizontalPositionAlign, HorizontalPositionRelativeFrom, ImageRun, Packer, Paragraph, Table,
  TableCell, TableRow, TabStopType, TextRun, TextWrappingSide, TextWrappingType, VerticalPositionRelativeFrom, WidthType,
  type IRunOptions, type ParagraphChild,
} from 'docx';
import type { DB, ImageAlign, ImageAsset, Paper, Question, Template } from '../shared/types';
import { letter, seededOrder } from './util';
import { asOptions, asPairs, asParts, asText, fieldValue, optionColumns, partLabel, resolvePaper, sectionInstruction, type ResolvedQuestion } from './paper';
import { hasImage, parseRich } from './rich';
import { effectiveStyle, wordLatinFont } from './fonts';

const CONTENT_WIDTH = 9906; // A4 width (11906 twips) minus 1000 twip margins
const INDENT = 560;
const PX_PER_MM = 96 / 25.4;

type RunOpts = Partial<IRunOptions>;
const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER } as const;

/** A paragraph's worth of content; block images (left/center) get a paragraph of their own. */
interface Chunk { children: ParagraphChild[]; align?: 'left' | 'center' }

class DocxWriter {
  private imageCache = new Map<string, Uint8Array>();
  readonly size: number; // half-points
  readonly gap: number; // twips before each question
  private font: { ascii: string; hAnsi: string; eastAsia: string; cs: string };
  readonly templates: Map<string, Template>;

  constructor(private db: DB, paper: Paper) {
    const style = effectiveStyle(db.settings.paperStyle, paper.style);
    this.size = Math.round(style.fontSize * 2);
    this.gap = Math.round(style.questionGap * 20);
    this.templates = new Map(db.templates.map((t) => [t.id, t]));
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
    let bytes = this.imageCache.get(asset.id);
    if (!bytes) {
      bytes = Uint8Array.from(atob(asset.src.split(',')[1]), (c) => c.charCodeAt(0));
      this.imageCache.set(asset.id, bytes);
    }
    const width = Math.round(Math.min(widthMm, 170) * PX_PER_MM);
    const height = Math.round((width * asset.h) / asset.w);
    const type = asset.src.startsWith('data:image/png') ? 'png' : 'jpg';
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

  /** Text with images → paragraphs' worth of runs. `flat` keeps everything in one chunk (option rows). */
  chunks(s: string, opts: RunOpts = {}, flat = false): Chunk[] {
    const out: Chunk[] = [{ children: [] }];
    const cur = () => out[out.length - 1];
    const segs = parseRich(s);
    segs.forEach((seg, i) => {
      if (seg.kind !== 'text' || flat) return;
      const isBlock = (x?: (typeof segs)[number]) => x?.kind === 'img' && x.align !== 'inline' && x.align !== 'right';
      if (isBlock(segs[i - 1])) seg.text = seg.text.replace(/^\n/, '');
      if (isBlock(segs[i + 1])) seg.text = seg.text.replace(/\n$/, '');
    });
    for (const seg of segs) {
      if (seg.kind === 'text') {
        seg.text.split('\n').forEach((line, i) => {
          if (i || line) cur().children.push(this.run(line, { ...opts, break: i ? 1 : 0 }));
        });
        continue;
      }
      const asset = this.db.images[seg.id];
      if (!asset) continue;
      if (flat || seg.align === 'inline' || seg.align === 'right') {
        cur().children.push(this.image(asset, seg.width, flat && seg.align === 'right' ? 'inline' : seg.align));
      } else {
        if (!cur().children.length) out.pop();
        out.push({ children: [this.image(asset, seg.width, seg.align)], align: seg.align }, { children: [] });
      }
    }
    if (out.length > 1 && !cur().children.length) out.pop();
    return out;
  }

  flat(s: string, opts: RunOpts = {}) {
    return this.chunks(s, opts, true)[0].children;
  }

  para(children: ParagraphChild[], extra: Record<string, unknown> = {}) {
    return new Paragraph({ children, spacing: { after: 60 }, ...extra });
  }

  /** Multi-paragraph block of rich text, indented under the question number. */
  block(s: string, opts: RunOpts = {}, left = INDENT) {
    return this.chunks(s, opts).map((c) => this.para(c.children, { indent: { left }, alignment: c.align && ALIGN[c.align] }));
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

type QLike = Pick<Question, 'id' | 'data'>;

/**
 * Paragraphs for one question (or one part). `label` and `marks` go on the first line;
 * `left` is where the text starts, so parts sit one step further in than their question.
 */
function fieldBlocks(w: DocxWriter, q: QLike, template: Template, label: string, marks: string, left: number, answerKey: boolean, answerSpace: boolean, bold = true) {
  const out: (Paragraph | Table)[] = [];
  let numbered = false;
  // The first paragraph carries the question number and the marks, like a printed paper.
  const firstLine = (children: ParagraphChild[]) => {
    numbered = true;
    return w.para([w.run(label, { bold }), w.run('\t'), ...children, w.run('\t'), w.run(marks, { bold })], {
      indent: { left: left, hanging: INDENT },
      spacing: { before: left > INDENT ? 40 : w.gap, after: 60 },
      tabStops: [{ type: TabStopType.LEFT, position: left }, { type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
    });
  };
  const addRich = (s: string, opts: RunOpts = {}, prefix: ParagraphChild[] = []) => {
    const paras = w.block(s, opts, left);
    if (!numbered) {
      const [first, ...rest] = w.chunks(s, opts);
      // A centred/left image as the very first thing still needs the number line above it.
      if (first.align) out.push(firstLine(prefix), ...w.block(s, opts, left));
      else out.push(firstLine([...prefix, ...first.children]), ...rest.map((c) => w.para(c.children, { indent: { left: left }, alignment: c.align && ALIGN[c.align] })));
      return;
    }
    if (prefix.length) {
      const [first, ...rest] = w.chunks(s, opts);
      out.push(w.para([...prefix, ...(first.align ? [] : first.children)], { indent: { left: left } }));
      if (first.align) out.push(w.para(first.children, { indent: { left: left }, alignment: ALIGN[first.align] }));
      out.push(...rest.map((c) => w.para(c.children, { indent: { left: left }, alignment: c.align && ALIGN[c.align] })));
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
        if (!text) break;
        if (f.answer) addRich(text, { italics: true }, [w.run(`${f.label}: `, { bold: true })]);
        else addRich(text);
        break;
      }
      case 'truefalse':
        if (typeof v === 'boolean') addRich(v ? 'True' : 'False', { italics: true }, [w.run(`${f.label}: `, { bold: true })]);
        break;
      case 'options': {
        const { items, correct } = asOptions(v);
        const cols = optionColumns(items);
        const cell = (i: number) => {
          const on = answerKey && i === correct;
          return [w.run(`(${letter(i)}) `, { bold: on }), ...w.flat(items[i], { bold: on, underline: on ? {} : undefined })];
        };
        ensureNumbered();
        const colWidth = Math.floor((CONTENT_WIDTH - left) / cols);
        for (let i = 0; i < items.length; i += cols) {
          const row = items.slice(i, i + cols).flatMap((_, j) => (j ? [w.run('\t'), ...cell(i + j)] : cell(i + j)));
          out.push(new Paragraph({
            children: row,
            indent: { left: left },
            spacing: { after: 40 },
            tabStops: Array.from({ length: cols - 1 }, (_, j) => ({ type: TabStopType.LEFT, position: left + colWidth * (j + 1) })),
          }));
        }
        if (answerKey && correct !== null) addRich(hasImage(items[correct]) ? '' : items[correct], { italics: true }, [w.run(`Answer: (${letter(correct)}) `, { bold: true })]);
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
            children: w.chunks(s, { bold }).map((c, i) => new Paragraph({ children: i ? c.children : [w.run(label, { bold }), ...c.children], alignment: c.align && ALIGN[c.align] })),
          });
        out.push(new Table({
          width: { size: 90, type: WidthType.PERCENTAGE },
          indent: { size: left, type: WidthType.DXA },
          rows: [
            new TableRow({ children: [cell('', 'A', true), cell('', 'B', true)] }),
            ...pairs.map((p, i) => new TableRow({ children: [cell(`${i + 1}. `, p[0]), cell(`(${letter(i)}) `, pairs[order[i]][1])] })),
          ],
        }));
        if (answerKey) addRich(pairs.map((_, i) => `${i + 1} → (${letter(order.indexOf(i))})`).join(',  '), { italics: true }, [w.run('Answer: ', { bold: true })]);
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
        items.forEach((p, i) => {
          const t = w.templates.get(p.templateId);
          if (t) out.push(...fieldBlocks(w, p, t, partLabel(numbering, i), `[${p.marks}]`, left + INDENT, answerKey, answerSpace, false));
        });
        break;
      }
    }
  }
  ensureNumbered();
  return out;
}

function questionBlocks(w: DocxWriter, { number, question, template, marks, alt }: ResolvedQuestion, answerKey: boolean, answerSpace: boolean) {
  const out = fieldBlocks(w, question, template, `${number}.`, `[${marks}]`, INDENT, answerKey, answerSpace);
  if (alt) {
    out.push(w.para([w.run('OR', { bold: true })], { alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 } }));
    out.push(...fieldBlocks(w, alt.question, alt.template, '', '', INDENT, answerKey, answerSpace));
  }
  return out;
}

export async function renderPaperDocx(paper: Paper, db: DB, answerKey: boolean): Promise<Uint8Array> {
  const { settings: s } = db;
  const w = new DocxWriter(db, paper);
  const { sections, totalMarks } = resolvePaper(paper, db);
  const center = (children: ParagraphChild[]) => w.para(children, { alignment: AlignmentType.CENTER });
  const spread = (left: string, right: string) =>
    w.para([w.run(left, { bold: true }), w.run('\t'), w.run(right, { bold: true })], { tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }] });
  const plain = (text: string, opts: RunOpts = {}, extra: Record<string, unknown> = {}) =>
    w.chunks(text, opts).map((c) => w.para(c.children, { alignment: c.align && ALIGN[c.align], ...extra }));

  const logo = s.logo ? await logoRun(s.logo).catch(() => null) : null;
  const children: (Paragraph | Table)[] = [];
  if (logo) children.push(center([logo]));
  if (s.institutionName) children.push(center([w.run(s.institutionName, { bold: true, ...w.scaled(1.33) })]));
  if (s.address) children.push(center([w.run(s.address, w.scaled(0.83))]));
  children.push(
    w.para([w.run(paper.examName + (answerKey ? ' — ANSWER KEY' : ''), { bold: true, ...w.scaled(1.08) })], {
      alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000', space: 4 } },
    }),
    spread(`Class: ${paper.className}`, `Subject: ${paper.subject}`),
    spread(`Time: ${paper.duration}${paper.date ? `    Date: ${paper.date}` : ''}`, `Max. Marks: ${totalMarks}`),
  );
  if (paper.instructions.trim()) {
    children.push(w.para([w.run('General Instructions:', { bold: true })], { spacing: { before: 160, after: 40 } }));
    children.push(...plain(paper.instructions.trim(), w.scaled(0.92)));
  }
  for (const sec of sections) {
    if (sec.title || sec.marksLabel) {
      children.push(
        w.para([w.run(sec.title, { bold: true }), w.run('\t'), w.run(sec.marksLabel, { bold: true })], {
          spacing: { before: 240, after: 60 },
          tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } },
        }),
      );
    }
    const instr = sectionInstruction(sec);
    if (instr) children.push(...plain(instr, { italics: true, ...w.scaled(0.92) }));
    for (const q of sec.questions) children.push(...questionBlocks(w, q, answerKey, paper.answerSpace));
  }
  children.push(center([w.run('*** End of Paper ***', { bold: true })]));

  const style = effectiveStyle(s.paperStyle, paper.style);
  const doc = new Document({
    creator: 'QMaker',
    title: paper.examName,
    styles: { default: { document: { paragraph: { spacing: { line: Math.round(240 * style.lineHeight / 1.15) } } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      children,
    }],
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
