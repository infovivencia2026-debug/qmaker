import type { UiLang } from './shared/types';

// Hindi and Telugu strings should be reviewed by a native speaker before release.
const en = {
  papers: 'Papers', bank: 'Question Bank', templates: 'Templates', share: 'Share / Backup', settings: 'Settings',
  newPaper: 'New paper', newQuestion: 'New question', search: 'Search', subject: 'Subject', chapter: 'Chapter',
  className: 'Class', difficulty: 'Difficulty', marks: 'Marks', template: 'Template', all: 'All', edit: 'Edit',
  delete: 'Delete', duplicate: 'Duplicate', save: 'Save', cancel: 'Cancel', close: 'Close', add: 'Add',
  easy: 'Easy', medium: 'Medium', hard: 'Hard', questions: 'Questions', total: 'Total', noItems: 'Nothing here yet.',
  examName: 'Exam name', duration: 'Time', date: 'Date', instructions: 'General instructions', answerSpace: 'Print answer lines',
  section: 'Section', addSection: 'Add section', addQuestions: 'Add questions', exportPdf: 'PDF', answerKeyPdf: 'Answer key PDF',
  exportWord: 'Word', exportWordKey: 'Answer key Word', sharePaper: 'Share paper file', preview: 'Preview', paper: 'Paper',
  answerKey: 'Answer key', saved: 'Saved', showInFolder: 'Show in folder', builtin: 'Built-in', fields: 'Fields',
  addField: 'Add field', name: 'Name', defaultMarks: 'Default marks', required: 'Required', answerOnly: 'Answer key only',
  institution: 'Institution name', address: 'Address', logo: 'Logo', language: 'App language', removeLogo: 'Remove logo',
  exportBank: 'Export question bank', importFile: 'Import a file', open: 'Open', back: 'Back', updated: 'Updated',
  confirmDelete: 'Delete this? This cannot be undone.', whatsappHint: 'Send this file on WhatsApp as a Document. The receiver opens it in QMaker (Share / Import → Import a file).',
  selected: 'selected', untitled: 'Untitled paper',
};

type Dict = typeof en;

const hi: Dict = {
  papers: 'प्रश्न पत्र', bank: 'प्रश्न बैंक', templates: 'टेम्पलेट', share: 'साझा / बैकअप', settings: 'सेटिंग्स',
  newPaper: 'नया प्रश्न पत्र', newQuestion: 'नया प्रश्न', search: 'खोजें', subject: 'विषय', chapter: 'अध्याय',
  className: 'कक्षा', difficulty: 'कठिनाई', marks: 'अंक', template: 'टेम्पलेट', all: 'सभी', edit: 'संपादित करें',
  delete: 'हटाएँ', duplicate: 'प्रतिलिपि', save: 'सहेजें', cancel: 'रद्द करें', close: 'बंद करें', add: 'जोड़ें',
  easy: 'आसान', medium: 'मध्यम', hard: 'कठिन', questions: 'प्रश्न', total: 'कुल', noItems: 'अभी कुछ नहीं है।',
  examName: 'परीक्षा का नाम', duration: 'समय', date: 'दिनांक', instructions: 'सामान्य निर्देश', answerSpace: 'उत्तर के लिए लाइनें छापें',
  section: 'खंड', addSection: 'खंड जोड़ें', addQuestions: 'प्रश्न जोड़ें', exportPdf: 'PDF', answerKeyPdf: 'उत्तर कुंजी PDF',
  exportWord: 'Word', exportWordKey: 'उत्तर कुंजी Word', sharePaper: 'पेपर फ़ाइल साझा करें', preview: 'पूर्वावलोकन', paper: 'प्रश्न पत्र',
  answerKey: 'उत्तर कुंजी', saved: 'सहेजा गया', showInFolder: 'फ़ोल्डर में दिखाएँ', builtin: 'अंतर्निर्मित', fields: 'फ़ील्ड',
  addField: 'फ़ील्ड जोड़ें', name: 'नाम', defaultMarks: 'डिफ़ॉल्ट अंक', required: 'आवश्यक', answerOnly: 'केवल उत्तर कुंजी में',
  institution: 'संस्थान का नाम', address: 'पता', logo: 'लोगो', language: 'ऐप की भाषा', removeLogo: 'लोगो हटाएँ',
  exportBank: 'प्रश्न बैंक निर्यात करें', importFile: 'फ़ाइल आयात करें', open: 'खोलें', back: 'वापस', updated: 'अद्यतन',
  confirmDelete: 'क्या इसे हटाना है? यह वापस नहीं होगा।', whatsappHint: 'इस फ़ाइल को WhatsApp पर Document के रूप में भेजें। प्राप्तकर्ता इसे QMaker में खोलें (साझा / आयात → फ़ाइल आयात करें)।',
  selected: 'चयनित', untitled: 'बिना नाम का पेपर',
};

const te: Dict = {
  papers: 'ప్రశ్నాపత్రాలు', bank: 'ప్రశ్నల బ్యాంక్', templates: 'టెంప్లేట్లు', share: 'పంచుకోండి / బ్యాకప్', settings: 'సెట్టింగ్‌లు',
  newPaper: 'కొత్త ప్రశ్నాపత్రం', newQuestion: 'కొత్త ప్రశ్న', search: 'వెతకండి', subject: 'విషయం', chapter: 'అధ్యాయం',
  className: 'తరగతి', difficulty: 'కఠినత', marks: 'మార్కులు', template: 'టెంప్లేట్', all: 'అన్నీ', edit: 'సవరించండి',
  delete: 'తొలగించండి', duplicate: 'నకలు', save: 'సేవ్ చేయండి', cancel: 'రద్దు', close: 'మూసివేయండి', add: 'జోడించండి',
  easy: 'సులభం', medium: 'మధ్యస్థం', hard: 'కష్టం', questions: 'ప్రశ్నలు', total: 'మొత్తం', noItems: 'ఇంకా ఏమీ లేదు.',
  examName: 'పరీక్ష పేరు', duration: 'సమయం', date: 'తేదీ', instructions: 'సాధారణ సూచనలు', answerSpace: 'జవాబు గీతలు ముద్రించండి',
  section: 'విభాగం', addSection: 'విభాగం జోడించండి', addQuestions: 'ప్రశ్నలు జోడించండి', exportPdf: 'PDF', answerKeyPdf: 'జవాబు కీ PDF',
  exportWord: 'Word', exportWordKey: 'జవాబు కీ Word', sharePaper: 'పేపర్ ఫైల్ పంచుకోండి', preview: 'ముందుచూపు', paper: 'ప్రశ్నాపత్రం',
  answerKey: 'జవాబు కీ', saved: 'సేవ్ అయింది', showInFolder: 'ఫోల్డర్‌లో చూపించు', builtin: 'అంతర్నిర్మిత', fields: 'ఫీల్డ్‌లు',
  addField: 'ఫీల్డ్ జోడించండి', name: 'పేరు', defaultMarks: 'డిఫాల్ట్ మార్కులు', required: 'తప్పనిసరి', answerOnly: 'జవాబు కీలో మాత్రమే',
  institution: 'సంస్థ పేరు', address: 'చిరునామా', logo: 'లోగో', language: 'యాప్ భాష', removeLogo: 'లోగో తొలగించండి',
  exportBank: 'ప్రశ్నల బ్యాంక్ ఎగుమతి', importFile: 'ఫైల్ దిగుమతి', open: 'తెరవండి', back: 'వెనుకకు', updated: 'నవీకరించబడింది',
  confirmDelete: 'దీన్ని తొలగించాలా? ఇది తిరిగి రాదు.', whatsappHint: 'ఈ ఫైల్‌ను WhatsAppలో Documentగా పంపండి. స్వీకర్త దాన్ని QMakerలో తెరవాలి (పంచుకోండి / దిగుమతి → ఫైల్ దిగుమతి).',
  selected: 'ఎంచుకున్నవి', untitled: 'పేరులేని పేపర్',
};

const dicts: Record<UiLang, Dict> = { en, hi, te };
export type TKey = keyof Dict;
export const translate = (lang: UiLang) => (k: TKey) => dicts[lang][k] ?? en[k];
