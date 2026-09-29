// Self-test run by `QMaker.exe --smoke-test <dir>` (used by CI on Windows): builds a realistic paper
// and renders it, exercising fonts, images, parts, either/or and both exporters.
import { BUILTIN_TEMPLATES } from './shared/templates';
import { DEFAULT_STYLE } from './lib/fonts';
import { imageFromBlob, imgToken } from './lib/rich';
import { renderPaperHtml } from './lib/renderHtml';
import { renderPaperDocx } from './lib/renderDocx';
import { resolvePaper } from './lib/paper';
import type { DB, Question } from './shared/types';

async function sampleImage() {
  const c = document.createElement('canvas');
  c.width = 300;
  c.height = 200;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 300, 200);
  g.fillStyle = '#000';
  g.beginPath();
  g.moveTo(150, 20);
  g.lineTo(270, 180);
  g.lineTo(30, 180);
  g.fill();
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
  return imageFromBlob(blob);
}

export async function run() {
  const img = await sampleImage();
  let n = 0;
  const q = (templateId: string, marks: number, data: Record<string, unknown>): Question => ({
    id: `smoke-q${++n}`, templateId, templateVersion: 1, subject: 'Science', chapter: 'Light', difficulty: 'easy', marks, data, createdAt: 0, updatedAt: 0,
  });
  const questions = [
    q('mcq', 1, { stem: `${imgToken(img.id, 40, 'right')}How many sides does this shape have?`, options: { items: ['2', '3', '4', '5'], correct: 1 } }),
    q('mcq', 1, { stem: 'प्रकाश की चाल निर्वात में कितनी होती है?', options: { items: ['3 × 10⁸ मी/से', '340 मी/से', 'शून्य', 'अनंत'], correct: 0 } }),
    q('fib', 1, { stem: 'కాంతి యొక్క వక్రీభవనం ____ వల్ల జరుగుతుంది.', answer: 'వేగం మార్పు' }),
    q('case', 4, { stem: 'Read the passage.\nA candle is placed 30 cm from a concave mirror of focal length 15 cm.', parts: { numbering: 'i', items: [
      { id: 'sp1', templateId: 'mcq', marks: 1, data: { stem: 'Where is the image?', options: { items: ['At F', 'At C', 'Beyond C', 'Behind'], correct: 1 } } },
      { id: 'sp2', templateId: 'short', marks: 3, data: { stem: 'State three properties of the image.', answer: 'Real, inverted, same size.' } },
    ] } }),
    q('long', 5, { stem: 'Explain the human eye.', answer: 'Cornea, lens, retina.' }),
    q('long', 5, { stem: 'Explain dispersion through a prism.', answer: 'Splitting of white light.' }),
  ];
  const db: DB = {
    version: 1, images: { [img.id]: img }, templates: BUILTIN_TEMPLATES, questions,
    settings: { institutionName: 'श्री विद्या निकेतन / శ్రీ విద్యా నికేతన్', address: 'Smoke test', logo: '', uiLang: 'en', paperStyle: DEFAULT_STYLE },
    papers: [],
  };
  const paper = {
    id: 'smoke-paper', examName: 'QMaker smoke test', subject: 'Science', className: 'X', duration: '1 Hour', date: '', instructions: 'All questions are compulsory.',
    answerSpace: true, createdAt: 0, updatedAt: 0,
    sections: [
      { id: 'sa', title: 'Section A', instruction: '', questionIds: questions.slice(0, 4).map((x) => x.id) },
      { id: 'sb', title: 'Section B', instruction: '', questionIds: [questions[4].id], alternatives: { [questions[4].id]: questions[5].id } },
    ],
  };
  const checks: string[] = [];
  const expect = (ok: boolean, what: string) => {
    if (!ok) throw new Error(`Check failed: ${what}`);
    checks.push(what);
  };

  const total = resolvePaper(paper, db).totalMarks;
  expect(total === 12, `total marks is 12 (got ${total})`);
  const html = renderPaperHtml(paper, db, false);
  const keyHtml = renderPaperHtml(paper, db, true);
  expect(html.includes('qimg://img/'), 'image is referenced from its file');
  expect(html.includes('>OR<'), 'either/or is printed');
  expect(keyHtml.includes('ANSWER KEY'), 'answer key renders');
  const docx = await renderPaperDocx(paper, db, true);
  expect(docx.length > 5000, `word file has content (${docx.length} bytes)`);
  const res = await fetch(`qimg://img/${img.file}`);
  expect(res.ok, 'stored image can be read back');

  let bin = '';
  for (let i = 0; i < docx.length; i += 0x8000) bin += String.fromCharCode(...docx.subarray(i, i + 0x8000));
  return { html, keyHtml, docxBase64: btoa(bin), checks };
}
