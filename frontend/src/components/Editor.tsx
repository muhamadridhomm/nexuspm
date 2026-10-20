'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { useState, useEffect } from 'react';
import { Download, Plus, FileText, Sparkles, RefreshCw } from 'lucide-react';
import { db, type LocalIssue } from '@/db';

interface EditorProps {
  docId: string;
  title: string;
  content: string;
  onChange: (newContent: string) => void;
  onAddTask: (text: string) => void;
  geminiToken: string;
  projectContext: string;
  documentType: string;
  aiMode?: 'local_rules' | 'local_ai' | 'external_api';
  localAiUrl?: string;
  localAiModel?: string;
  originalPrompt?: string;
  preparedBy?: string;
  createdDate?: string;
  useTOC?: boolean;
  templateContent?: string;
}

export default function Editor({ 
  docId, 
  title, 
  content, 
  onChange, 
  onAddTask, 
  geminiToken, 
  projectContext, 
  documentType,
  aiMode = 'local_rules',
  localAiUrl = '',
  localAiModel = '',
  originalPrompt = '',
  preparedBy = '',
  createdDate = '',
  useTOC = true,
  templateContent = ''
}: EditorProps) {
  const [selectedText, setSelectedText] = useState('');
  const [linkedIssues, setLinkedIssues] = useState<LocalIssue[]>([]);
  const [regenPrompt, setRegenPrompt] = useState(originalPrompt || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showRegenModal, setShowRegenModal] = useState(false);

  useEffect(() => {
    setRegenPrompt(originalPrompt || '');
  }, [originalPrompt, docId]);

  // States for interactive missing fields filling
  const [placeholderInputs, setPlaceholderInputs] = useState<{[key: string]: string}>({});
  const [confirmingPlaceholder, setConfirmingPlaceholder] = useState<string | null>(null);

  const getPlaceholders = () => {
    if (!editor) return [];
    const html = editor.getHTML();
    const regex = /\[Insert\s+[^\]]+\]|\[MISSING:\s*[^\]]+\]|\[\?\]|\[[^\]]*Placeholder[^\]]*\]|\[[^\]]*description[^\]]*\]|insert_[a-z0-9_]+_here/gi;
    const matches: string[] = [];
    let match;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const text = doc.body.textContent || '';
    
    // Check text placeholders
    while ((match = regex.exec(text)) !== null) {
      const item = match[0].trim();
      if (!matches.includes(item)) {
        matches.push(item);
      }
    }
    
    // Check image placeholders
    const images = doc.querySelectorAll('img');
    images.forEach(img => {
      const src = img.getAttribute('src') || '';
      if (src.includes('placeholder') || src.includes('insert_image_url_here')) {
        if (!matches.includes(src)) {
          matches.push(src);
        }
      }
    });

    return matches;
  };

  const handleFillPlaceholder = (placeholder: string) => {
    const val = placeholderInputs[placeholder] || '';
    if (!val.trim()) return;
    setConfirmingPlaceholder(placeholder);
  };

  const handleConfirmPlaceholderFill = (placeholder: string) => {
    const val = placeholderInputs[placeholder] || '';
    if (!editor || !val.trim()) return;

    const currentHtml = editor.getHTML();
    const escaped = placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const nextHtml = currentHtml.replace(new RegExp(escaped, 'g'), val);
    editor.commands.setContent(nextHtml);
    onChange(nextHtml);

    setPlaceholderInputs(prev => {
      const copy = { ...prev };
      delete copy[placeholder];
      return copy;
    });
    setConfirmingPlaceholder(null);
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: content || '<p>Start writing or load a template...</p>',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Watch content changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '<p>Start writing or load a template...</p>');
    }
  }, [docId, editor]);

  // Highlight selection tracker
  useEffect(() => {
    if (!editor) return;
    const handleSelection = () => {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        const selected = editor.state.doc.textBetween(from, to, ' ');
        setSelectedText(selected);
      } else {
        setSelectedText('');
      }
    };
    editor.on('selectionUpdate', handleSelection);
    return () => {
      editor.off('selectionUpdate', handleSelection);
    };
  }, [editor]);

  // Load linked tasks
  useEffect(() => {
    const fetchLinkedIssues = async () => {
      const list = await db.issues.where('pageId').equals(docId).toArray();
      setLinkedIssues(list);
    };
    fetchLinkedIssues();
    const interval = setInterval(fetchLinkedIssues, 2500);
    return () => clearInterval(interval);
  }, [docId]);

  const handleCreateTaskFromSelection = () => {
    if (selectedText.trim()) {
      onAddTask(selectedText.trim());
      if (editor) {
        editor.commands.insertContent(` <strong>[Task: ${selectedText.trim()}]</strong> `);
      }
      setSelectedText('');
    }
  };

  const handleExportPDF = async () => {
    if (!editor) return;
    try {
      const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, html_content: editor.getHTML() })
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportDOCX = async () => {
    if (!editor) return;
    try {
      const response = await fetch('/api/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, html_content: editor.getHTML() })
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/\s+/g, '_')}.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegenerateDocument = async () => {
    if (!regenPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-Key': geminiToken,
          'X-AI-Mode': aiMode,
          'X-Local-AI-Url': localAiUrl,
          'X-Local-AI-Model': localAiModel
        },
        body: JSON.stringify({
          prompt: regenPrompt,
          document_type: documentType,
          template_content: templateContent,
          title: title,
          prepared_by: preparedBy,
          created_date: createdDate,
          use_toc: useTOC,
          context: projectContext
        })
      });
      if (response.ok) {
        const data = await response.json();
        editor?.commands.setContent(data.content);
        onChange(data.content);
        // Persist the updated prompt locally in IndexedDB
        await db.documents.update(docId, { prompt: regenPrompt, synced: 0 });
        setShowRegenModal(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[550px] shadow-2xl">
      {/* Editor Toolbar */}
      <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-800/80 flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
          <button
            onClick={handleExportDOCX}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5" /> Word (DOCX)
          </button>
        </div>

        {/* Prompt-based regeneration */}
        <button
          onClick={() => setShowRegenModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 transition cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          Re-run / Edit AI Prompt
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main text area */}
        <div className="flex-1 overflow-y-auto p-6 text-slate-300 prose prose-invert max-w-none focus:outline-none">
          <EditorContent editor={editor} className="min-h-full outline-none focus:outline-none" />
        </div>

        {/* Sidebar Linked Cards */}
        <div className="w-64 bg-slate-950/40 border-l border-slate-800/80 p-4 flex flex-col gap-4 overflow-y-auto">
          {selectedText.trim() && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <h4 className="text-[10px] font-bold text-blue-400 mb-1">Highlight Selection</h4>
              <p className="text-slate-400 text-[10px] mb-2 truncate">"{selectedText}"</p>
              <button
                onClick={handleCreateTaskFromSelection}
                className="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-550 text-white text-[10px] font-semibold transition"
              >
                <Plus className="w-3 h-3" /> Create linked issue
              </button>
            </div>
          )}

          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Connected Tasks ({linkedIssues.length})</h4>
            {linkedIssues.length === 0 ? (
              <p className="text-slate-500 text-[10px] italic">No active tasks are linked to this spec.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {linkedIssues.map((iss) => (
                  <div key={iss.id} className="bg-slate-900 border border-slate-850 p-2.5 rounded-lg flex flex-col gap-1.5">
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-[10px] font-bold text-slate-200 truncate">{iss.title}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${
                        iss.status === 'DONE' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' :
                        iss.status === 'IN_PROGRESS' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {iss.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Interactive Placeholders / Missing Information List */}
          <div className="border-t border-slate-800/80 pt-4 mt-2">
            <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>Required Template Inputs ({getPlaceholders().length})</span>
            </h4>
            {getPlaceholders().length === 0 ? (
              <p className="text-slate-500 text-[10px] italic">✓ Template is fully complete. No missing fields!</p>
            ) : (
              <div className="flex flex-col gap-3">
                {getPlaceholders().map((placeholder, idx) => (
                  <div key={idx} className="bg-slate-950/60 border border-slate-850 p-2.5 rounded-lg flex flex-col gap-2">
                    <div className="flex items-start gap-1 justify-between">
                      <span className="text-[10px] font-bold text-amber-400 break-all leading-normal">
                        ⚠️ {placeholder.length > 50 ? placeholder.substring(0, 50) + '...' : placeholder}
                      </span>
                    </div>

                    {confirmingPlaceholder === placeholder ? (
                      <div className="flex flex-col gap-1.5 p-1 bg-indigo-950/20 border border-indigo-500/20 rounded">
                        <span className="text-[9px] text-indigo-300 font-bold">Are you sure this is the right information?</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleConfirmPlaceholderFill(placeholder)}
                            className="flex-1 py-1 rounded bg-indigo-650 hover:bg-indigo-600 text-white text-[9px] font-bold transition"
                          >
                            Yes, Confirm
                          </button>
                          <button
                            onClick={() => setConfirmingPlaceholder(null)}
                            className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-350 text-[9px] font-bold transition"
                          >
                            No
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="Type information..."
                          value={placeholderInputs[placeholder] || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPlaceholderInputs(prev => ({ ...prev, [placeholder]: val }));
                          }}
                          className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          onClick={() => handleFillPlaceholder(placeholder)}
                          disabled={!(placeholderInputs[placeholder] || '').trim()}
                          className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-550 disabled:bg-slate-850 disabled:text-slate-500 text-white text-[10px] font-bold transition"
                        >
                          Fill
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Rerun / Prompt Edit Modal */}
      {showRegenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-[#0b0924] border border-[#1f1a3a] rounded-xl w-full max-w-lg p-6 flex flex-col gap-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-2 border-b border-[#1f1a3a] pb-3">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm font-bold text-slate-200">Modify & Re-run AI Prompt</h3>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Content Prompt</label>
              <p className="text-[11px] text-slate-500 mb-1">Tweak the instructions below to regenerate the document layout and content using AI.</p>
              <textarea
                rows={8}
                placeholder="Enter content details or prompt requirements..."
                value={regenPrompt}
                onChange={(e) => setRegenPrompt(e.target.value)}
                className="w-full bg-[#050412] border border-[#1f1a3a] rounded-lg p-3 text-xs focus:outline-none focus:border-indigo-500 text-slate-350 font-sans leading-relaxed"
              />
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowRegenModal(false)}
                className="bg-[#1b153b] hover:bg-[#251d52] text-slate-300 px-4 py-2 rounded-lg text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRegenerateDocument}
                disabled={isGenerating || !regenPrompt.trim()}
                className="bg-indigo-600 hover:bg-indigo-550 border border-indigo-500/30 text-white px-5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40"
              >
                {isGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {isGenerating ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
