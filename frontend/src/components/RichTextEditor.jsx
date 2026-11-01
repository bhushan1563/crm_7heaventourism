import React, { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { Bold, Eraser, Highlighter, Italic, List, ListOrdered, Palette, Redo2, Type, Underline as UnderlineIcon, Undo2 } from 'lucide-react';
import { FontSize } from '../utils/tiptapFontSize';
import { looksLikeHtml, plainToHtml } from '../utils/richText';
import './richtext.css';

const TEXT_COLORS = [
  ['Black', '#111827'],
  ['Dark grey', '#4b5563'],
  ['Red', '#dc2626'],
  ['Orange', '#ea580c'],
  ['Green', '#15803d'],
  ['Teal', '#0f766e'],
  ['Blue', '#1d4ed8'],
  ['Purple', '#7e22ce']
];
const HIGHLIGHTS = [
  ['Yellow', '#fde047'],
  ['Green', '#86efac'],
  ['Blue', '#93c5fd'],
  ['Pink', '#f9a8d4'],
  ['Orange', '#fdba74']
];
const SIZES = [
  ['Default', ''],
  ['Small', '12px'],
  ['Normal', '14px'],
  ['Large', '18px'],
  ['Extra large', '24px'],
  ['Heading', '32px']
];

const toEditorHtml = (value) => (!value ? '' : looksLikeHtml(value) ? value : plainToHtml(value));

/** One toolbar button. Pressing it must not take the cursor out of the text, hence preventDefault on mouse down. */
const Btn = ({ onClick, active, label, children, disabled }) => (
  <button
    type="button"
    className={`rich-btn${active ? ' is-active' : ''}`}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    aria-label={label}
    aria-pressed={active ?? undefined}
    title={label}
    disabled={disabled}
  >
    {children}
  </button>
);

/** A colour button with a small palette. `onPick(hex)` applies a colour, `onClear()` removes it. */
const ColorMenu = ({ icon: Icon, label, colors, active, onPick, onClear, open, setOpen, disabled }) => (
  <span className="rich-menu">
    <button
      type="button"
      className={`rich-btn${active ? ' is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setOpen(open ? null : label)}
      aria-label={label}
      aria-haspopup="true"
      aria-expanded={open}
      title={label}
      disabled={disabled}
    >
      <Icon size={16} />
      <span className="rich-swatch" style={{ background: active || 'transparent' }} aria-hidden="true" />
    </button>
    {open && (
      <span className="rich-popover" role="group" aria-label={label}>
        {colors.map(([name, hex]) => (
          <button
            key={hex}
            type="button"
            className="rich-color"
            style={{ background: hex }}
            aria-label={`${label}: ${name}`}
            title={name}
            onClick={() => {
              onPick(hex);
              setOpen(null);
            }}
          />
        ))}
        <label className="rich-color rich-color-custom" title="Choose any colour">
          <input
            type="color"
            aria-label={`${label}: custom colour`}
            onChange={(e) => onPick(e.target.value)}
            onBlur={() => setOpen(null)}
          />
          +
        </label>
        <button
          type="button"
          className="rich-clear"
          onClick={() => {
            onClear();
            setOpen(null);
          }}
        >
          None
        </button>
      </span>
    )}
  </span>
);

/**
 * Formatted-text field: bold, italic, underline, font size, text colour, highlight and lists.
 * `value` / `onChange` carry the stored text (formatted text as HTML; older plain text is shown as it was written).
 * The server cleans the result again before saving; nothing here is trusted.
 */
export const RichTextEditor = ({
  value = '',
  onChange,
  placeholder = 'Write here…',
  maxLength = 20000,
  minHeight = 140,
  ariaLabel = 'Text',
  disabled = false,
  error = '',
  autoFocus = false // put the cursor at the end of the text as soon as the editor appears
}) => {
  const lastEmitted = useRef(value);
  const [menu, setMenu] = useState(null);
  const frame = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, blockquote: false, horizontalRule: false }),
      Underline,
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({ multicolor: true })
    ],
    content: toEditorHtml(value),
    autofocus: autoFocus ? 'end' : false,
    editable: !disabled,
    editorProps: {
      attributes: { class: 'rich-editor-content rich-text', role: 'textbox', 'aria-multiline': 'true', 'aria-label': ariaLabel, 'data-placeholder': placeholder }
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? '' : ed.getHTML();
      lastEmitted.current = html;
      onChange?.(html);
    }
  });

  // A value that changed from outside (a record was loaded, an itinerary was inserted) replaces the content.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(toEditorHtml(value), false);
  }, [value, editor]);

  useEffect(() => {
    // `false`: switching editable on or off is not an edit. By default TipTap reports it as an update, which made every
    // record look changed the moment it was opened (its text is written back in the editor's own spelling).
    editor?.setEditable(!disabled, false);
  }, [disabled, editor]);

  // Close an open palette with Escape or a click elsewhere.
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      // Pressing inside ANY palette (text colour or highlight) is not "elsewhere": closing on mouse-down would remove the
      // colour button before the click could reach it.
      if (e.type === 'mousedown' && e.target instanceof Element && e.target.closest('.rich-menu')) return;
      setMenu(null);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('mousedown', close);
    };
  }, [menu]);

  if (!editor) return <div className="rich-editor rich-editor-loading" style={{ minHeight }} aria-busy="true" />;

  const length = editor.getText().length;
  const over = length > maxLength;
  const run = (fn) => () => fn(editor.chain().focus()).run();
  const currentSize = editor.getAttributes('textStyle').fontSize || '';
  const currentColor = editor.getAttributes('textStyle').color || '';
  const currentHighlight = editor.getAttributes('highlight').color || '';

  return (
    <div className={`rich-editor${error || over ? ' has-error' : ''}${disabled ? ' is-disabled' : ''}`} ref={frame}>
      <div className="rich-toolbar" role="toolbar" aria-label="Text formatting">
        <Btn disabled={disabled} label="Bold" active={editor.isActive('bold')} onClick={run((c) => c.toggleBold())}>
          <Bold size={16} />
        </Btn>
        <Btn disabled={disabled} label="Italic" active={editor.isActive('italic')} onClick={run((c) => c.toggleItalic())}>
          <Italic size={16} />
        </Btn>
        <Btn disabled={disabled} label="Underline" active={editor.isActive('underline')} onClick={run((c) => c.toggleUnderline())}>
          <UnderlineIcon size={16} />
        </Btn>
        <span className="rich-sep" aria-hidden="true" />
        <label className="rich-size" title="Font size">
          <Type size={15} aria-hidden="true" />
          <select
            aria-label="Font size"
            value={SIZES.some(([, v]) => v === currentSize) ? currentSize : ''}
            disabled={disabled}
            onChange={(e) => (e.target.value ? editor.chain().focus().setFontSize(e.target.value).run() : editor.chain().focus().unsetFontSize().run())}
          >
            {SIZES.map(([name, v]) => (
              <option key={name} value={v}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <ColorMenu
          icon={Palette}
          label="Text colour"
          colors={TEXT_COLORS}
          active={currentColor}
          open={menu === 'Text colour'}
          setOpen={setMenu}
          disabled={disabled}
          onPick={(hex) => editor.chain().focus().setColor(hex).run()}
          onClear={() => editor.chain().focus().unsetColor().run()}
        />
        <ColorMenu
          icon={Highlighter}
          label="Highlight"
          colors={HIGHLIGHTS}
          active={currentHighlight}
          open={menu === 'Highlight'}
          setOpen={setMenu}
          disabled={disabled}
          onPick={(hex) => editor.chain().focus().setHighlight({ color: hex }).run()}
          onClear={() => editor.chain().focus().unsetHighlight().run()}
        />
        <span className="rich-sep" aria-hidden="true" />
        <Btn disabled={disabled} label="Bulleted list" active={editor.isActive('bulletList')} onClick={run((c) => c.toggleBulletList())}>
          <List size={16} />
        </Btn>
        <Btn disabled={disabled} label="Numbered list" active={editor.isActive('orderedList')} onClick={run((c) => c.toggleOrderedList())}>
          <ListOrdered size={16} />
        </Btn>
        <span className="rich-sep" aria-hidden="true" />
        <Btn disabled={disabled} label="Clear formatting" onClick={run((c) => c.unsetAllMarks().clearNodes())}>
          <Eraser size={16} />
        </Btn>
        <Btn label="Undo" onClick={run((c) => c.undo())} disabled={disabled || !editor.can().undo()}>
          <Undo2 size={16} />
        </Btn>
        <Btn label="Redo" onClick={run((c) => c.redo())} disabled={disabled || !editor.can().redo()}>
          <Redo2 size={16} />
        </Btn>
      </div>

      <div className="rich-editor-body" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>

      <div className="rich-editor-foot">
        {error || over ? (
          <span className="rich-error" role="alert">
            {error || `This text is too long: ${length.toLocaleString('en-IN')} of ${maxLength.toLocaleString('en-IN')} characters.`}
          </span>
        ) : (
          <span />
        )}
        <span className={`rich-count${length > maxLength * 0.9 ? ' is-near' : ''}`}>
          {length.toLocaleString('en-IN')} / {maxLength.toLocaleString('en-IN')}
        </span>
      </div>
    </div>
  );
};

export default RichTextEditor;
