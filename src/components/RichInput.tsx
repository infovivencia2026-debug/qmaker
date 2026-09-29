import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { useStore } from '../store';
import { toHtml } from '../lib/richdoc';
import { defaultWidthMm } from '../lib/rich';
import { AnswerLines, DrawBox, QImage, QTable } from './rich/extensions';
import { clearActiveEditor, setActiveEditor } from './rich/activeEditor';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Short fields (options, match cells): Enter does not start a new paragraph. */
  single?: boolean;
  className?: string;
  /** Boxed look for forms; default is the borderless on-paper look. */
  boxed?: boolean;
}

export const editorExtensions = (placeholder = '') => [
  // Undo/redo is app-wide (Ctrl+Z), so the editor's own history is off.
  StarterKit.configure({ undoRedo: false, heading: false, code: false, codeBlock: false, blockquote: false, link: false }),
  Subscript,
  Superscript,
  TextAlign.configure({ types: ['paragraph'] }),
  // Drag a column border to resize it (also in borderless layout grids).
  QTable.configure({ resizable: true, cellMinWidth: 24, lastColumnResizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  QImage,
  AnswerLines,
  DrawBox,
  Placeholder.configure({ placeholder }),
];

const imageFiles = (files: FileList | undefined | null) => [...(files ?? [])].filter((f) => f.type.startsWith('image/'));

/** Adds pictures at the cursor; several at once become a row (borderless table) with one per cell. */
export async function insertImages(editor: Editor, files: File[], addImage: (b: Blob) => Promise<{ id: string; w: number; h: number } | null>) {
  const assets = (await Promise.all(files.map((f) => addImage(f)))).filter((a) => a !== null);
  if (!assets.length) return;
  if (assets.length === 1) {
    const a = assets[0];
    editor.chain().focus().insertContent({ type: 'qimage', attrs: { id: a.id, width: defaultWidthMm(a as never), align: 'inline' } }).run();
    return;
  }
  const cells = assets.map((a) => `<td><p style="text-align: center"><img data-id="${a.id}" data-width="25" data-align="inline"></p></td>`).join('');
  editor.chain().focus().insertContent(`<table data-borderless="true"><tbody><tr>${cells}</tr></tbody></table><p></p>`).run();
}

/** Word-like rich text: formatting, lists, tables, pictures, answer lines. The shared toolbar acts on it. */
export default function RichInput({ value, onChange, placeholder, single, className = '', boxed }: Props) {
  const { addImage } = useStore();
  const lastEmitted = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const addImageRef = useRef(addImage);
  addImageRef.current = addImage;

  const editor = useEditor({
    extensions: editorExtensions(placeholder),
    content: toHtml(value),
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? '' : editor.getHTML();
      lastEmitted.current = html;
      onChangeRef.current(html);
    },
    onFocus: ({ editor }) => setActiveEditor(editor),
    editorProps: {
      attributes: { class: 'ed' },
      handleKeyDown: (_view, event) => !!single && event.key === 'Enter' && !event.shiftKey,
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (!files.length || !editor) return false;
        insertImages(editor, files, addImageRef.current);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = imageFiles((event as DragEvent).dataTransfer?.files);
        if (!files.length || !editor) return false;
        event.preventDefault();
        insertImages(editor, files, addImageRef.current);
        return true;
      },
    },
  });

  // Outside changes (undo, restore, switching questions) replace the content.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(toHtml(value), { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => () => {
    if (editor) clearActiveEditor(editor);
  }, [editor]);

  return (
    <div className={`rich ${boxed ? 'boxed' : ''} ${single ? 'single' : ''} ${className}`}>
      <EditorContent editor={editor} />
    </div>
  );
}
