'use client';

import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Plus, Check, Trash2, Play, RefreshCw, 
  Sparkles, FileText, Calendar, CheckSquare, Layers, 
  ChevronRight, Inbox, Kanban, Folder, FolderPlus, 
  Settings, ChevronDown, Download, Eye, Edit3, Wand2,
  Upload, FileCode
} from 'lucide-react';
import { 
  db, 
  type LocalIssue, 
  type LocalPage, 
  type LocalCycle, 
  type LocalResource,
  type LocalFolder,
  type LocalDocumentType,
  type LocalDocumentTemplate,
  type LocalDocument
} from '@/db';
import Editor from '@/components/Editor';
import { markdownToHtml } from '@/lib/markdown';
import { beautifyMarkdown } from '@/lib/markdownFormatter';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'editor' | 'board' | 'triage' | 'solver' | 'config' | 'settings'>('editor');
  const [activeProjectId, setActiveProjectId] = useState('default-project');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('default-workspace');
  
  // Triage state
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [aiMode, setAiMode] = useState<'local_rules' | 'local_ai' | 'external_api'>('local_rules');
  const [geminiToken, setGeminiToken] = useState('');
  const [localAiUrl, setLocalAiUrl] = useState('http://localhost:11434/v1');
  const [localAiModel, setLocalAiModel] = useState('llama3');
  const [isTriaging, setIsTriaging] = useState(false);
  const [triageSuggestions, setTriageSuggestions] = useState<any>(null);

  // Load AI configuration on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('nexus_ai_mode');
      if (savedMode) setAiMode(savedMode as any);
      const savedToken = localStorage.getItem('nexus_gemini_token');
      if (savedToken) setGeminiToken(savedToken);
      const savedUrl = localStorage.getItem('nexus_local_ai_url');
      if (savedUrl) setLocalAiUrl(savedUrl);
      const savedModel = localStorage.getItem('nexus_local_ai_model');
      if (savedModel) setLocalAiModel(savedModel);
    }
  }, []);

  // Cycle creator
  const [cycleName, setCycleName] = useState('');
  const [cycleStart, setCycleStart] = useState('');
  const [cycleEnd, setCycleEnd] = useState('');

  // Resource mapping capacity
  const [reqResources, setReqResources] = useState<{ [resId: string]: number }>({});
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending' | 'syncing'>('synced');

  // DOCUMENT MANAGEMENT STATE
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  
  // Folders CRUD
  const [newFolderName, setNewFolderName] = useState('');
  // Document Types CRUD
  const [newDocTypeName, setNewDocTypeName] = useState('');
  
  // Document creation form
  const [docTitle, setDocTitle] = useState('');
  const [selectedDocTypeId, setSelectedDocTypeId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [docDestFolderId, setDocDestFolderId] = useState('');
  const [docPrompt, setDocPrompt] = useState('');
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const [showDocCreator, setShowDocCreator] = useState(false);

  // Enhanced Document generation form states
  const [docPreparedBy, setDocPreparedBy] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('nexus_doc_prepared_by') || '';
    }
    return '';
  });
  const [docCreatedDate, setDocCreatedDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [docUseTOC, setDocUseTOC] = useState(true);

  useEffect(() => {
    localStorage.setItem('nexus_doc_prepared_by', docPreparedBy);
  }, [docPreparedBy]);

  // TEMPLATES CRUD CONFIG STATE
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');
  const [newTemplateDocTypeId, setNewTemplateDocTypeId] = useState('');
  const [importedFileName, setImportedFileName] = useState('');

  // Issue editing states
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [editIssueTitle, setEditIssueTitle] = useState('');
  const [editIssuePriority, setEditIssuePriority] = useState('NORMAL');
  const [editIssuePoints, setEditIssuePoints] = useState(1);

  // Document Type & Template editing states
  const [editingDocTypeId, setEditingDocTypeId] = useState<string | null>(null);
  const [editDocTypeName, setEditDocTypeName] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  // Live query database mapping
  const projects = useLiveQuery(() => db.projects.toArray()) || [];
  const cycles = useLiveQuery(() => db.cycles.where('projectId').equals(activeProjectId).toArray()) || [];
  const issues = useLiveQuery(() => db.issues.where('projectId').equals(activeProjectId).toArray()) || [];
  const resources = useLiveQuery(() => db.resources.toArray()) || [];
  const requirements = useLiveQuery(() => db.resourceRequirements.toArray()) || [];
  
  // Document DB queries
  const folders = useLiveQuery(() => db.folders.where('projectId').equals(activeProjectId).toArray()) || [];
  const documentTypes = useLiveQuery(() => db.documentTypes.toArray()) || [];
  const documentTemplates = useLiveQuery(() => db.documentTemplates.toArray()) || [];
  const documents = useLiveQuery(() => db.documents.where('projectId').equals(activeProjectId).toArray()) || [];

  const activeDoc = documents.find(d => d.id === activeDocId);

  // Trigger sync load
  const syncWithServer = async () => {
    setSyncStatus('syncing');
    try {
      const pullResponse = await fetch('/api/sync');
      if (pullResponse.ok) {
        const remote = await pullResponse.json();
        if (remote.workspaces) await db.workspaces.bulkPut(remote.workspaces);
        if (remote.projects) await db.projects.bulkPut(remote.projects);
        if (remote.resources) await db.resources.bulkPut(remote.resources);
        if (remote.resourceRequirements) await db.resourceRequirements.bulkPut(remote.resourceRequirements);
        
        // Document tables sync
        if (remote.folders) await db.folders.bulkPut(remote.folders);
        if (remote.documentTypes) await db.documentTypes.bulkPut(remote.documentTypes);
        if (remote.documentTemplates) await db.documentTemplates.bulkPut(remote.documentTemplates);

        for (const remoteIssue of remote.issues) {
          const local = await db.issues.get(remoteIssue.id);
          if (!local || local.synced === 1) {
            await db.issues.put({ ...remoteIssue, synced: 1 });
          }
        }
        for (const remoteDoc of remote.documents) {
          const local = await db.documents.get(remoteDoc.id);
          if (!local || local.synced === 1) {
            await db.documents.put({ ...remoteDoc, synced: 1 });
          }
        }
        for (const remoteCycle of remote.cycles) {
          await db.cycles.put(remoteCycle);
        }
      }

      const unsyncedIssues = await db.issues.where('synced').equals(0).toArray();
      const unsyncedDocs = await db.documents.where('synced').equals(0).toArray();
      
      if (unsyncedIssues.length > 0 || unsyncedDocs.length > 0) {
        const allFolders = await db.folders.toArray();
        const allDocTypes = await db.documentTypes.toArray();
        const allTemplates = await db.documentTemplates.toArray();
        
        const pushResponse = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issues: unsyncedIssues,
            documents: unsyncedDocs,
            folders: allFolders,
            documentTypes: allDocTypes,
            documentTemplates: allTemplates
          })
        });
        if (pushResponse.ok) {
          for (const iss of unsyncedIssues) {
            await db.issues.update(iss.id, { synced: 1 });
          }
          for (const doc of unsyncedDocs) {
            await db.documents.update(doc.id, { synced: 1 });
          }
        }
      }
      setSyncStatus('synced');
    } catch (err) {
      setSyncStatus('pending');
    }
  };

  useEffect(() => {
    syncWithServer();
    const interval = setInterval(syncWithServer, 10000);
    return () => clearInterval(interval);
  }, [activeProjectId]);

  // Set default document if empty
  useEffect(() => {
    if (documents.length > 0 && !activeDocId) {
      setActiveDocId(documents[0].id);
    }
  }, [documents]);

  // Create Folder (Directory)
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await db.folders.put({
      id: crypto.randomUUID(),
      name: newFolderName.trim(),
      projectId: activeProjectId
    });
    setNewFolderName('');
    syncWithServer();
  };

  const handleDeleteFolder = async (folderId: string) => {
    await db.folders.delete(folderId);
    const files = await db.documents.where('folderId').equals(folderId).toArray();
    for (const file of files) {
      await db.documents.update(file.id, { folderId: undefined, synced: 0 });
    }
    try {
      await fetch('/api/sync', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'folder', id: folderId })
      });
    } catch (err) {}
    syncWithServer();
  };

  // Document Type CRUD
  const handleCreateDocType = async () => {
    if (!newDocTypeName.trim()) return;
    await db.documentTypes.put({
      id: crypto.randomUUID(),
      name: newDocTypeName.trim()
    });
    setNewDocTypeName('');
    syncWithServer();
  };

  const handleDeleteDocType = async (typeId: string) => {
    await db.documentTypes.delete(typeId);
    try {
      await fetch('/api/sync', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'documentType', id: typeId })
      });
    } catch (err) {}
    syncWithServer();
  };

  // Import Markdown file parser
  const handleMarkdownImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const markdown = event.target?.result as string;
      setNewTemplateContent(beautifyMarkdown(markdown));
    };
    reader.readAsText(file);
  };

  // Create / Update Template Config
  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplateDocTypeId || !newTemplateContent.trim()) return;
    const tempId = editingTemplateId || crypto.randomUUID();
    const newTemp = {
      id: tempId,
      name: newTemplateName.trim(),
      content: newTemplateContent,
      documentTypeId: newTemplateDocTypeId
    };
    await db.documentTemplates.put(newTemp);
    
    // Save to server
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentTemplates: [newTemp] })
      });
    } catch (err) {}

    setNewTemplateName('');
    setNewTemplateContent('');
    setNewTemplateDocTypeId('');
    setImportedFileName('');
    setEditingTemplateId(null);
    syncWithServer();
  };

  const handleStartEditTemplate = (temp: LocalDocumentTemplate) => {
    setEditingTemplateId(temp.id);
    setNewTemplateName(temp.name);
    setNewTemplateContent(temp.content);
    setNewTemplateDocTypeId(temp.documentTypeId);
  };

  const handleStartEditDocType = (dt: LocalDocumentType) => {
    setEditingDocTypeId(dt.id);
    setEditDocTypeName(dt.name);
  };

  const handleSaveDocType = async (id: string) => {
    if (!editDocTypeName.trim()) return;
    await db.documentTypes.update(id, { name: editDocTypeName.trim() });
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentTypes: [{ id, name: editDocTypeName.trim() }] })
      });
    } catch (err) {}
    setEditingDocTypeId(null);
    setEditDocTypeName('');
    syncWithServer();
  };

  const handleDeleteTemplate = async (templateId: string) => {
    await db.documentTemplates.delete(templateId);
    try {
      await fetch('/api/sync', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'template', id: templateId })
      });
    } catch (err) {}
    syncWithServer();
  };

  // Create Document (Blueprint Generation)
  const handleCreateDocument = async () => {
    if (!docTitle.trim() || !selectedDocTypeId) return;
    setIsGeneratingDoc(true);
    try {
      let finalContent = "";
      
      if (docPrompt.trim()) {
        const selectedTemplate = selectedTemplateId ? documentTemplates.find(t => t.id === selectedTemplateId) : null;
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
            prompt: docPrompt,
            document_type: documentTypes.find(t => t.id === selectedDocTypeId)?.name || "Technical Spec",
            template_content: selectedTemplate ? selectedTemplate.content : "",
            title: docTitle.trim(),
            prepared_by: docPreparedBy,
            created_date: docCreatedDate,
            use_toc: docUseTOC,
            context: `Project context: ${projects.find(p => p.id === activeProjectId)?.name || 'Sample Product Workspace'}. Prepared by: ${docPreparedBy}. Date: ${docCreatedDate}. Include TOC: ${docUseTOC}.`
          })
        });
        const data = await response.json();
        finalContent = data.content;
      } else if (selectedTemplateId) {
        const template = documentTemplates.find(t => t.id === selectedTemplateId);
        let contentWithMeta = template ? template.content : "Start writing document spec...";
        // Simple search and replace for metadata placeholders on loading raw template
        contentWithMeta = contentWithMeta
          .replace(/\[Insert Project \/ Application Name\]/gi, docTitle.trim())
          .replace(/\[Insert Prepared By \/ Team Name\]/gi, docPreparedBy)
          .replace(/\[Insert Date\]/gi, docCreatedDate);
        finalContent = markdownToHtml(contentWithMeta);
      } else {
        finalContent = `<h1>${docTitle.trim()}</h1><p><b>Prepared by:</b> ${docPreparedBy}</p><p><b>Date:</b> ${docCreatedDate}</p><br/><p>Start writing document spec...</p>`;
      }

      const docId = crypto.randomUUID();
      await db.documents.put({
        id: docId,
        title: docTitle.trim(),
        content: finalContent,
        projectId: activeProjectId,
        folderId: docDestFolderId || undefined,
        documentTypeId: selectedDocTypeId,
        templateId: selectedTemplateId || undefined,
        prompt: docPrompt,
        preparedBy: docPreparedBy,
        createdDate: docCreatedDate,
        useTOC: docUseTOC,
        synced: 0
      });

      setActiveDocId(docId);
      setDocTitle('');
      setSelectedTemplateId('');
      setDocPrompt('');
      setShowDocCreator(false);
      syncWithServer();
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingDoc(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    await db.documents.delete(docId);
    if (activeDocId === docId) {
      setActiveDocId(null);
    }
    try {
      await fetch('/api/sync', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'document', id: docId })
      });
    } catch (err) {}
    syncWithServer();
  };

  // AI Triage trigger
  const handleTriageRequest = async () => {
    if (!newTitle.trim()) return;
    setIsTriaging(true);
    try {
      const response = await fetch('/api/triage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-Key': geminiToken,
          'X-AI-Mode': aiMode,
          'X-Local-AI-Url': localAiUrl,
          'X-Local-AI-Model': localAiModel
        },
        body: JSON.stringify({ title: newTitle, description: newDesc })
      });
      const data = await response.json();
      setTriageSuggestions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTriaging(false);
    }
  };

  // Add issue helper
  const handleAddIssue = async (title: string, priority = "NORMAL", points = 1) => {
    const newIssue: LocalIssue = {
      id: crypto.randomUUID(),
      title: title,
      description: newDesc,
      status: 'TRIAGE',
      priority: priority,
      points: points,
      projectId: activeProjectId,
      synced: 0
    };
    await db.issues.put(newIssue);
    
    for (const [resId, qty] of Object.entries(reqResources)) {
      if (qty > 0) {
        await db.resourceRequirements.put({
          id: crypto.randomUUID(),
          quantity: qty,
          issueId: newIssue.id,
          resourceId: resId
        });
      }
    }

    setNewTitle('');
    setNewDesc('');
    setTriageSuggestions(null);
    setReqResources({});
    syncWithServer();
  };

  const updateIssueStatus = async (id: string, newStatus: string) => {
    await db.issues.update(id, { status: newStatus, synced: 0 });
    syncWithServer();
  };

  const handleStartEditIssue = (iss: LocalIssue) => {
    setEditingIssueId(iss.id);
    setEditIssueTitle(iss.title);
    setEditIssuePriority(iss.priority);
    setEditIssuePoints(iss.points);
  };

  const handleSaveEditIssue = async (id: string) => {
    await db.issues.update(id, {
      title: editIssueTitle,
      priority: editIssuePriority,
      points: editIssuePoints,
      synced: 0
    });
    setEditingIssueId(null);
    syncWithServer();
  };

  const handleDeleteIssue = async (id: string) => {
    await db.issues.delete(id);
    try {
      await fetch('/api/sync', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'issue', id })
      });
    } catch (err) {}
    syncWithServer();
  };

  const runPortfolioScheduler = async () => {
    try {
      setSyncStatus('syncing');
      const backendIssues = issues.map(iss => ({
        id: iss.id,
        duration: iss.points || 1,
        projectId: iss.projectId,
        priority: iss.priority
      }));

      const backendResources = resources.map(res => ({
        id: res.id,
        capacity: res.capacity,
        projectId: res.projectId
      }));

      const backendRequirements = requirements.filter(req => 
        issues.some(iss => iss.id === req.issueId)
      ).map(req => ({
        issueId: req.issueId,
        resourceId: req.resourceId,
        quantity: req.quantity
      }));

      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issues: backendIssues,
          resources: backendResources,
          requirements: backendRequirements
        })
      });

      if (response.ok) {
        const solution = await response.json();
        const baseDate = new Date();
        for (const [taskId, sched] of Object.entries(solution.schedule) as any) {
          const startDays = sched.start;
          const taskDate = new Date(baseDate);
          taskDate.setDate(taskDate.getDate() + startDays);
          await db.issues.update(taskId, {
            dueDate: taskDate.toISOString(),
            synced: 0
          });
        }
        alert(`Schedule optimized! Total Makespan: ${solution.tms} days. Average Resource Utilization: ${(solution.auf * 100).toFixed(1)}%`);
        syncWithServer();
      } else {
        alert("Failed to compute optimal schedule.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTaskFromEditor = async (text: string) => {
    const newIssue: LocalIssue = {
      id: crypto.randomUUID(),
      title: text,
      description: `Created from document blueprint context.`,
      status: 'TODO',
      priority: 'HIGH',
      points: 3,
      projectId: activeProjectId,
      pageId: activeDocId || undefined,
      synced: 0
    };
    await db.issues.put(newIssue);
    syncWithServer();
  };

  const handleCreateCycle = async () => {
    if (!cycleName || !cycleStart || !cycleEnd) return;
    await db.cycles.put({
      id: crypto.randomUUID(),
      name: cycleName,
      startsAt: cycleStart,
      endsAt: cycleEnd,
      projectId: activeProjectId
    });
    setCycleName('');
    setCycleStart('');
    setCycleEnd('');
  };

  // Filtered documents list based on folder selection
  const filteredDocs = selectedFolderId === 'all' 
    ? documents 
    : documents.filter(d => d.folderId === selectedFolderId);

  return (
    <div className="min-h-screen bg-[#070514] text-slate-100 flex font-sans antialiased overflow-hidden h-screen">
      
      {/* Left Navigation Sidebar */}
      <aside className="w-64 bg-[#0a081f] border-r border-[#1f1a3a] flex flex-col justify-between shrink-0">
        <div className="flex flex-col">
          {/* Brand details */}
          <div className="p-5 border-b border-[#1f1a3a]/80 flex items-center gap-3 bg-gradient-to-b from-[#110e2f]/20 to-transparent">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              N
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">NexusPM</h1>
              <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Local Cockpit</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 flex flex-col gap-1">
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${
                activeTab === 'editor' 
                  ? 'bg-indigo-600/10 text-indigo-300 border border-indigo-500/20' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'
              }`}
            >
              <FileText className="w-4 h-4" /> Document Cockpit
            </button>
            
            <button
              onClick={() => setActiveTab('board')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${
                activeTab === 'board' 
                  ? 'bg-indigo-600/10 text-indigo-300 border border-indigo-500/20' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'
              }`}
            >
              <Kanban className="w-4 h-4" /> Active Kanban Board
            </button>
            
            <button
              onClick={() => setActiveTab('triage')}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${
                activeTab === 'triage' 
                  ? 'bg-indigo-600/10 text-indigo-300 border border-indigo-500/20' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <Inbox className="w-4 h-4" /> Mandatory Triage
              </div>
              <span className="bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full text-[9px] font-bold">
                {issues.filter(i => i.status === 'TRIAGE').length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('solver')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${
                activeTab === 'solver' 
                  ? 'bg-indigo-600/10 text-indigo-300 border border-indigo-500/20' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'
              }`}
            >
              <CheckSquare className="w-4 h-4" /> Capacity & Scheduler
            </button>

            <button
              onClick={() => setActiveTab('config')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${
                activeTab === 'config' 
                  ? 'bg-indigo-600/10 text-indigo-300 border border-indigo-500/20' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'
              }`}
            >
              <Settings className="w-4 h-4" /> Blueprint Config
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${
                activeTab === 'settings' 
                  ? 'bg-indigo-600/10 text-indigo-300 border border-indigo-500/20' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'
              }`}
            >
              <Sparkles className="w-4 h-4" /> AI Configuration
            </button>
          </nav>
        </div>

        {/* Project status metadata */}
        <div className="p-4 border-t border-[#1f1a3a]/80 bg-[#08061a] flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase">
            <span>Project Workspace</span>
            <span className="text-indigo-400">ACTIVE</span>
          </div>
          <span className="text-xs font-bold text-slate-300 truncate">Sample Product Workspace</span>
        </div>
      </aside>

      {/* Main Cockpit Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar header */}
        <header className="h-16 border-b border-[#1f1a3a] bg-[#0a081f]/80 backdrop-blur-md px-8 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-xs font-medium">Cockpit</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-xs font-bold capitalize text-indigo-400 tracking-wider">
              {activeTab === 'editor' ? 'Document Cockpit' : activeTab === 'board' ? 'Kanban Board' : activeTab === 'triage' ? 'Mandatory Triage' : activeTab === 'solver' ? 'Drawers Scheduler' : activeTab === 'config' ? 'Blueprint Templates Configuration' : 'AI Engine Configuration'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Sync Monitor */}
            <div className="flex items-center gap-2 bg-[#050412] px-3.5 py-1.5 rounded-full border border-[#1f1a3a]/60">
              <span className={`w-1.5 h-1.5 rounded-full ${
                syncStatus === 'synced' ? 'bg-emerald-500 shadow-lg shadow-emerald-500/40' :
                syncStatus === 'syncing' ? 'bg-indigo-500 animate-pulse' :
                'bg-amber-500 animate-ping'
              }`} />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing...' : 'Pending Sync'}
              </span>
            </div>
            <button 
              onClick={syncWithServer}
              className="p-2 hover:bg-[#1a153b]/40 rounded-lg text-slate-400 hover:text-slate-200 border border-[#1f1a3a]/65 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Dynamic Inner Cockpit View */}
        <div className="flex-1 overflow-y-auto p-8 bg-gradient-to-br from-[#070514] via-[#09071f]/80 to-[#070514]">
          
          {/* TAB 1: DOCUMENT COCKPIT */}
          {activeTab === 'editor' && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 h-full items-start">
              
              {/* Sidebar Left: Folders */}
              <div className="bg-[#0b0924]/40 border border-[#1f1a3a]/80 p-5 rounded-xl flex flex-col gap-6 backdrop-blur-sm">
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project Folders</span>
                    <FolderPlus className="w-4 h-4 text-indigo-400" />
                  </div>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Folder name"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      className="flex-1 bg-[#050412] border border-[#1f1a3a] rounded px-2 py-1 text-[11px] focus:outline-none focus:border-indigo-500"
                    />
                    <button onClick={handleCreateFolder} className="bg-indigo-600 hover:bg-indigo-550 p-1.5 rounded transition text-white">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1 mt-1">
                    <button
                      onClick={() => setSelectedFolderId('all')}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-semibold tracking-wide transition ${
                        selectedFolderId === 'all' ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Folder className="w-3.5 h-3.5" /> All Documents
                    </button>
                    {folders.map(f => (
                      <div key={f.id} className="flex justify-between items-center group">
                        <button
                          onClick={() => setSelectedFolderId(f.id)}
                          className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-semibold tracking-wide transition ${
                            selectedFolderId === f.id ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Folder className="w-3.5 h-3.5" /> {f.name}
                        </button>
                        <button 
                          onClick={() => handleDeleteFolder(f.id)} 
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sidebar Middle: Document Selection & Creator */}
              <div className="col-span-3 flex flex-col gap-6">
                
                <div className="bg-[#0b0924]/40 border border-[#1f1a3a]/80 p-5 rounded-xl flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Project Specifications</h3>
                      <p className="text-[11px] text-slate-500">Selected directory: {selectedFolderId === 'all' ? 'All Files' : folders.find(f => f.id === selectedFolderId)?.name}</p>
                    </div>
                    <button
                      onClick={() => setShowDocCreator(!showDocCreator)}
                      className="bg-indigo-600 hover:bg-indigo-550 text-white text-[11px] font-bold px-3.5 py-2 rounded-lg transition flex items-center gap-1 shadow-lg shadow-indigo-600/10"
                    >
                      <Plus className="w-3.5 h-3.5" /> Generate Document
                    </button>
                  </div>

                  {/* Creator Form */}
                  {showDocCreator && (
                    <div className="bg-[#050412]/60 border border-[#1f1a3a]/80 p-5 rounded-xl flex flex-col gap-3 transition">
                      <h4 className="text-xs font-bold text-slate-300">Spec Blueprint Generator Configuration</h4>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-400">1. Document Type</label>
                          <select
                            value={selectedDocTypeId}
                            onChange={(e) => setSelectedDocTypeId(e.target.value)}
                            className="bg-[#050412] border border-[#1f1a3a] rounded px-3 py-2 text-xs text-slate-300 focus:outline-none"
                          >
                            <option value="">-- Choose Document Type --</option>
                            {documentTypes.map(dt => (
                              <option key={dt.id} value={dt.id}>{dt.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-400">2. Document Title</label>
                          <input
                            type="text"
                            placeholder="Document Title (e.g., BRD Assurance)"
                            value={docTitle}
                            onChange={(e) => setDocTitle(e.target.value)}
                            className="bg-[#050412] border border-[#1f1a3a] rounded px-3 py-2 text-xs text-slate-200 focus:outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-400">3. Prepared By</label>
                          <input
                            type="text"
                            placeholder="Prepared By (e.g., QA Team / PM Name)"
                            value={docPreparedBy}
                            onChange={(e) => setDocPreparedBy(e.target.value)}
                            className="bg-[#050412] border border-[#1f1a3a] rounded px-3 py-2 text-xs text-slate-200 focus:outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-400">4. Created Date (App Generated)</label>
                          <input
                            type="date"
                            value={docCreatedDate}
                            onChange={(e) => setDocCreatedDate(e.target.value)}
                            className="bg-[#050412] border border-[#1f1a3a] rounded px-3 py-2 text-xs text-slate-350 focus:outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-400">5. Select Document Template</label>
                          <select
                            value={selectedTemplateId}
                            onChange={(e) => setSelectedTemplateId(e.target.value)}
                            disabled={!selectedDocTypeId}
                            className="bg-[#050412] border border-[#1f1a3a] rounded px-3 py-2 text-xs text-slate-300 focus:outline-none disabled:opacity-40"
                          >
                            <option value="">-- Use default template layout --</option>
                            {documentTemplates.filter(t => t.documentTypeId === selectedDocTypeId).map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-400">6. Destination Folder (Optional)</label>
                          <select
                            value={docDestFolderId}
                            onChange={(e) => setDocDestFolderId(e.target.value)}
                            className="bg-[#050412] border border-[#1f1a3a] rounded px-3 py-2 text-xs text-slate-300 focus:outline-none"
                          >
                            <option value="">-- Assign to Folder (Optional) --</option>
                            {folders.map(f => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 py-2 border-t border-[#1f1a3a]/40 mt-1">
                        <input
                          type="checkbox"
                          id="useTOCCheckbox"
                          checked={docUseTOC}
                          onChange={(e) => setDocUseTOC(e.target.checked)}
                          className="rounded border-[#1f1a3a] bg-[#050412] text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                        />
                        <label htmlFor="useTOCCheckbox" className="text-xs text-slate-300 font-semibold cursor-pointer">
                          Include "DAFTAR ISI" (Table of Contents) section
                        </label>
                      </div>

                      {/* Prompt input */}
                      <div className="flex flex-col gap-1 border-t border-[#1f1a3a]/40 pt-3">
                        <label className="text-[10px] font-bold text-indigo-400 flex items-center gap-1.5">
                          <Wand2 className="w-3.5 h-3.5" /> Prompt Auto-Writer instruction (Optional)
                        </label>
                        <textarea
                          placeholder="Tell the AI what to write (e.g. Generate a BRD for Sample Workflow Closed Ticket TTR)..."
                          value={docPrompt}
                          onChange={(e) => setDocPrompt(e.target.value)}
                          rows={2}
                          className="w-full bg-[#050412] border border-[#1f1a3a] rounded px-3 py-2 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-2 justify-end mt-1">
                        <button
                          onClick={() => setShowDocCreator(false)}
                          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleCreateDocument}
                          disabled={isGeneratingDoc || !docTitle.trim() || !selectedDocTypeId}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-550 text-white text-xs font-semibold rounded disabled:opacity-40"
                        >
                          {isGeneratingDoc ? 'AI Generating...' : 'Generate Spec'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Document list */}
                  <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                    {filteredDocs.length === 0 ? (
                      <span className="text-xs text-slate-500 italic py-4 text-center">No documents found in this path. Click "Generate Document" to build one.</span>
                    ) : (
                      filteredDocs.map(doc => (
                        <div 
                          key={doc.id}
                          className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                            activeDocId === doc.id 
                              ? 'bg-indigo-600/10 border-indigo-500/50' 
                              : 'bg-[#0f0c2f] border-[#1f1a3a] hover:border-indigo-500/30'
                          }`}
                          onClick={() => setActiveDocId(doc.id)}
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4 text-indigo-400" />
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-200">{doc.title}</span>
                              <span className="text-[10px] text-slate-500">{documentTypes.find(t => t.id === doc.documentTypeId)?.name || 'General Document'}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setActiveDocId(doc.id)}
                              className="p-1.5 hover:bg-[#1f1a3a]/40 text-slate-400 hover:text-indigo-400 rounded transition"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteDocument(doc.id)}
                              className="p-1.5 hover:bg-[#1f1a3a]/40 text-slate-500 hover:text-rose-400 rounded transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Editor Canvas */}
                {activeDoc && (
                  <Editor
                    key={activeDoc.id}
                    docId={activeDoc.id}
                    title={activeDoc.title}
                    content={activeDoc.content}
                    onChange={async (newContent) => {
                      await db.documents.update(activeDoc.id, { content: newContent, synced: 0 });
                    }}
                    onAddTask={handleTaskFromEditor}
                    geminiToken={geminiToken}
                    projectContext={`Project context: ${projects.find(p => p.id === activeProjectId)?.name || 'Sample Product Workspace'}. Prepared by: ${activeDoc.preparedBy || ''}. Date: ${activeDoc.createdDate || ''}. Include TOC: ${activeDoc.useTOC || false}.`}
                    documentType={documentTypes.find(t => t.id === activeDoc.documentTypeId)?.name || 'Spec Blueprint'}
                    aiMode={aiMode}
                    localAiUrl={localAiUrl}
                    localAiModel={localAiModel}
                    originalPrompt={activeDoc.prompt}
                    preparedBy={activeDoc.preparedBy}
                    createdDate={activeDoc.createdDate}
                    useTOC={activeDoc.useTOC}
                    templateContent={documentTemplates.find(t => t.id === activeDoc.templateId)?.content || ""}
                  />
                )}
              </div>

            </div>
          )}

          {/* TAB 5: BLUEPRINT TEMPLATE CONFIGURATION */}
          {activeTab === 'config' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Document Type Panel (Left) */}
              <div className="bg-[#0b0924]/40 border border-[#1f1a3a]/80 p-6 rounded-xl flex flex-col gap-4 backdrop-blur-sm h-fit">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">1. Document Categories (CRUD)</h3>
                  <p className="text-xs text-slate-400">Add or manage global document types.</p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g., Release Plan"
                    value={newDocTypeName}
                    onChange={(e) => setNewDocTypeName(e.target.value)}
                    className="flex-1 bg-[#050412] border border-[#1f1a3a] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                  />
                  <button
                    onClick={handleCreateDocType}
                    className="bg-indigo-600 hover:bg-indigo-550 px-4 py-2 rounded-lg text-xs font-semibold transition"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-col gap-2 mt-2 overflow-y-auto max-h-[350px]">
                  {documentTypes.map(dt => (
                    <div key={dt.id} className="bg-[#0f0c2f] border border-[#1f1a3a] px-4 py-2 rounded-xl flex justify-between items-center gap-2">
                      {editingDocTypeId === dt.id ? (
                        <div className="flex-1 flex gap-2 items-center">
                          <input
                            type="text"
                            value={editDocTypeName}
                            onChange={(e) => setEditDocTypeName(e.target.value)}
                            className="flex-1 bg-[#050412] border border-[#1f1a3a] rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveDocType(dt.id)}
                            className="px-2.5 py-1 bg-indigo-650 hover:bg-indigo-600 rounded text-[10px] font-bold text-white transition"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingDocTypeId(null)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px] font-bold text-slate-300 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-xs font-bold text-slate-350 flex-1 truncate">{dt.name}</span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleStartEditDocType(dt)}
                              className="p-1 hover:bg-[#1a153b] text-slate-500 hover:text-indigo-400 rounded transition"
                              title="Edit category"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteDocType(dt.id)}
                              className="p-1 hover:bg-[#1a153b] text-slate-500 hover:text-rose-400 rounded transition"
                              title="Delete category"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Template Blueprint Creator Panel (Right) */}
              <div className="col-span-2 bg-[#0b0924]/40 border border-[#1f1a3a]/80 p-6 rounded-xl flex flex-col gap-4 backdrop-blur-sm">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">2. Document Template Blueprints</h3>
                  <p className="text-xs text-slate-400">Initialize default layouts. Assign a type or import a local markdown (.md) template.</p>
                </div>

                {/* Form to Create Template */}
                <div className="bg-[#050412]/40 border border-[#1f1a3a]/40 p-4 rounded-xl flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Template Name (e.g., Agile SRS)"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      className="bg-[#050412] border border-[#1f1a3a] rounded-lg px-3 py-2 text-xs focus:outline-none"
                    />
                    <select
                      value={newTemplateDocTypeId}
                      onChange={(e) => setNewTemplateDocTypeId(e.target.value)}
                      className="bg-[#050412] border border-[#1f1a3a] rounded-lg px-3 py-2 text-xs focus:outline-none text-slate-300"
                    >
                      <option value="">-- Assign Document Type --</option>
                      {documentTypes.map(dt => (
                        <option key={dt.id} value={dt.id}>{dt.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Markdown File Importer Input */}
                  <div className="border border-[#1f1a3a] border-dashed rounded-lg p-3 flex items-center justify-between bg-slate-950/20">
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-indigo-400" />
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-slate-300">Import Markdown Template (.md)</span>
                        <span className="text-[9px] text-slate-500">{importedFileName || 'No file selected'}</span>
                      </div>
                    </div>
                    <label className="bg-indigo-600/15 hover:bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition">
                      Choose File
                      <input
                        type="file"
                        accept=".md"
                        onChange={handleMarkdownImport}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Template Editor */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Template Content Blueprint (Markdown)</label>
                      <button
                        onClick={() => {
                          const beautified = beautifyMarkdown(newTemplateContent);
                          setNewTemplateContent(beautified);
                        }}
                        type="button"
                        className="bg-indigo-650/15 hover:bg-indigo-600/25 border border-indigo-500/30 text-indigo-300 px-2.5 py-1 rounded text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                        title="Click to align tables and clean up markdown structure"
                      >
                        <Sparkles className="w-3 h-3 text-indigo-400" /> Beautify Markdown
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      placeholder="# Document Structure&#10;&#10;Standard sections go here..."
                      value={newTemplateContent}
                      onChange={(e) => setNewTemplateContent(e.target.value)}
                      className="w-full bg-[#050412] border border-[#1f1a3a] rounded-lg p-3 text-xs focus:outline-none text-slate-300 font-mono"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    {editingTemplateId && (
                      <button
                        onClick={() => {
                          setEditingTemplateId(null);
                          setNewTemplateName('');
                          setNewTemplateContent('');
                          setNewTemplateDocTypeId('');
                          setImportedFileName('');
                        }}
                        className="bg-[#1b153b] hover:bg-[#251d52] text-slate-300 px-4 py-2.5 rounded-lg text-xs font-semibold transition"
                      >
                        Cancel Edit
                      </button>
                    )}
                    <button
                      onClick={handleCreateTemplate}
                      className="bg-indigo-600 hover:bg-indigo-550 text-white px-5 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Plus className="w-3.5 h-3.5" /> {editingTemplateId ? 'Update Template' : 'Save Template'}
                    </button>
                  </div>
                </div>

                {/* Templates Grid List */}
                <div className="mt-2">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Saved Blueprints</h4>
                  {documentTemplates.length === 0 ? (
                    <div className="text-center py-6 border border-[#1f1a3a]/40 rounded-xl bg-[#050412]/20">
                      <span className="text-xs text-slate-500 italic">No blueprints uploaded or created yet.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {documentTemplates.map(temp => (
                        <div key={temp.id} className="bg-[#0f0c2f] border border-[#1f1a3a] p-3.5 rounded-xl flex flex-col justify-between shadow-lg">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-slate-200">{temp.name}</span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                              Type: {documentTypes.find(t => t.id === temp.documentTypeId)?.name || 'Unknown'}
                            </span>
                          </div>
                          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-[#1f1a3a]/40">
                            <button
                              onClick={() => handleStartEditTemplate(temp)}
                              className="p-1 hover:bg-[#1a153b] text-slate-500 hover:text-indigo-400 rounded transition"
                              title="Edit template"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTemplate(temp.id)}
                              className="p-1 hover:bg-[#1a153b] text-slate-500 hover:text-rose-400 rounded transition"
                              title="Delete template"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: AI ENGINE CONFIGURATION */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto w-full">
              <div className="bg-[#0b0924]/40 border border-[#1f1a3a]/80 p-8 rounded-xl flex flex-col gap-6 backdrop-blur-sm shadow-2xl">
                <div>
                  <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" /> AI Engine Configuration Settings
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Specify whether to use local heuristic fallback, a local deployed LLM server, or an external cloud token key.</p>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Integration Mode</label>
                    <select
                      value={aiMode}
                      onChange={(e) => {
                        const mode = e.target.value as any;
                        setAiMode(mode);
                        localStorage.setItem('nexus_ai_mode', mode);
                      }}
                      className="bg-[#050412] border border-[#1f1a3a] rounded-lg px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 text-slate-300"
                    >
                      <option value="local_rules">Offline Local Rules (No AI Server)</option>
                      <option value="local_ai">Local Deployed AI (Ollama / LocalAI)</option>
                      <option value="external_api">External AI API Token (Gemini API)</option>
                    </select>
                  </div>

                  {aiMode === 'local_ai' && (
                    <div className="bg-[#050412]/40 border border-[#1f1a3a]/40 p-4 rounded-xl flex flex-col gap-4">
                      <h4 className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">Local AI Connection Parameters</h4>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Endpoint URL</label>
                        <input
                          type="text"
                          placeholder="e.g., http://localhost:11434/v1"
                          value={localAiUrl}
                          onChange={(e) => {
                            setLocalAiUrl(e.target.value);
                            localStorage.setItem('nexus_local_ai_url', e.target.value);
                          }}
                          className="bg-[#050412] border border-[#1f1a3a] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Model Name</label>
                        <input
                          type="text"
                          placeholder="e.g., llama3, qwen2.5, mistral"
                          value={localAiModel}
                          onChange={(e) => {
                            setLocalAiModel(e.target.value);
                            localStorage.setItem('nexus_local_ai_model', e.target.value);
                          }}
                          className="bg-[#050412] border border-[#1f1a3a] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                        />
                      </div>
                    </div>
                  )}

                  {aiMode === 'external_api' && (
                    <div className="bg-[#050412]/40 border border-[#1f1a3a]/40 p-4 rounded-xl flex flex-col gap-4">
                      <h4 className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">Cloud API Key Configuration</h4>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gemini Key Token</label>
                        <input
                          type="password"
                          placeholder="Insert key (AIzaSy...)"
                          value={geminiToken}
                          onChange={(e) => {
                            setGeminiToken(e.target.value);
                            localStorage.setItem('nexus_gemini_token', e.target.value);
                          }}
                          className="bg-[#050412] border border-[#1f1a3a] rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gemini Model</label>
                        <select
                          value={localAiModel.startsWith('gemini') || localAiModel.includes('banan') || localAiModel.includes('research') || localAiModel.includes('antigravity') ? localAiModel : 'gemini-1.5-flash'}
                          onChange={(e) => {
                            setLocalAiModel(e.target.value);
                            localStorage.setItem('nexus_local_ai_model', e.target.value);
                          }}
                          className="bg-[#050412] border border-[#1f1a3a] rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 text-slate-200 cursor-pointer"
                        >
                          <option value="gemini-3.5-flash">Gemini 3.5 Flash (Stable)</option>
                          <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Preview)</option>
                          <option value="gemini-3-flash-preview">Gemini 3 Flash (Preview)</option>
                          <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite (Stable)</option>
                          <option value="gemini-3.1-flash-live-preview">Gemini 3.1 Flash Live (Preview)</option>
                          <option value="gemini-2.5-flash">Gemini 2.5 Flash (Stable)</option>
                          <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite (Stable)</option>
                          <option value="gemini-2.5-pro">Gemini 2.5 Pro (Stable)</option>
                          <option value="gemini-2.5-flash-live-preview">Gemini 2.5 Flash Live (Preview)</option>
                          <option value="gemini-1.5-flash">Gemini 1.5 Flash (Stable)</option>
                          <option value="gemini-2.0-flash">Gemini 2.0 Flash (Deprecated)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {aiMode === 'local_rules' && (
                    <div className="text-xs text-slate-400 bg-slate-950/40 p-4 rounded-xl border border-[#1f1a3a]/40 flex flex-col gap-1">
                      <span className="font-bold text-slate-300">Offline Rules Mode Active</span>
                      <span>NexusPM will bypass server API generation calls and fall back to a local rule-based heuristic parser for triage priority and tag suggestions, and load pre-formatted mock blueprints for specs. No AI server endpoints are called.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: KANBAN BOARD */}
          {activeTab === 'board' && (
            <div className="flex flex-col gap-6 h-full">
              <div className="flex justify-between items-center bg-[#0d0a27]/30 border border-[#1f1a3a]/50 p-4 rounded-xl backdrop-blur-sm">
                <div>
                  <h2 className="text-sm font-bold text-slate-200">Interactive Kanban Workflow</h2>
                  <p className="text-xs text-slate-400">Manage, organize, and transition developer tasks offline-first.</p>
                </div>
                <button
                  onClick={() => setActiveTab('triage')}
                  className="bg-indigo-600 hover:bg-indigo-550 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition shadow-lg shadow-indigo-600/10 flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Add Issue via Triage
                </button>
              </div>

              {/* Grid Columns */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5 flex-1 min-h-[500px]">
                {['BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE'].map((colStatus) => {
                  const colIssues = issues.filter(i => i.status === 'colStatus');
                  return (
                    <div key={colStatus} className="bg-[#0b0924]/40 border border-[#1f1a3a]/40 rounded-xl p-4 flex flex-col gap-4">
                      <div className="flex justify-between items-center border-b border-[#1f1a3a]/80 pb-2">
                        <span className="text-xs font-bold text-slate-300 tracking-wider capitalize">{colStatus.replace('_', ' ')}</span>
                        <span className="bg-slate-800/80 text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">
                          {issues.filter(i => i.status === colStatus).length}
                        </span>
                      </div>
                      
                      <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1">
                        {issues.filter(i => i.status === colStatus).length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-10 border border-dashed border-[#1f1a3a]/30 rounded-lg text-slate-500 text-xs italic">
                            No tasks
                          </div>
                        ) : (
                          issues.filter(i => i.status === colStatus).map((iss) => (
                            <div 
                              key={iss.id} 
                              className="bg-[#0f0c2f] border border-[#1f1a3a] p-4 rounded-xl shadow-lg hover:border-indigo-500/40 transition duration-150 flex flex-col gap-2.5 group relative"
                            >
                              {editingIssueId === iss.id ? (
                                <div className="flex flex-col gap-2">
                                  <input 
                                    type="text" 
                                    value={editIssueTitle} 
                                    onChange={(e) => setEditIssueTitle(e.target.value)}
                                    className="bg-[#050412] border border-[#1f1a3a] rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 w-full"
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[8px] text-slate-500 font-bold uppercase">Priority</label>
                                      <select 
                                        value={editIssuePriority} 
                                        onChange={(e) => setEditIssuePriority(e.target.value)}
                                        className="bg-[#050412] border border-[#1f1a3a] rounded px-2 py-1 text-xs text-slate-350 focus:outline-none w-full"
                                      >
                                        <option value="URGENT">Urgent</option>
                                        <option value="HIGH">High</option>
                                        <option value="NORMAL">Normal</option>
                                        <option value="LOW">Low</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-[8px] text-slate-500 font-bold uppercase">Points</label>
                                      <input 
                                        type="number" 
                                        min={0}
                                        value={editIssuePoints} 
                                        onChange={(e) => setEditIssuePoints(parseInt(e.target.value) || 0)}
                                        className="bg-[#050412] border border-[#1f1a3a] rounded px-2 py-1 text-xs text-slate-200 focus:outline-none w-full"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex justify-end gap-1.5 mt-1">
                                    <button 
                                      onClick={() => setEditingIssueId(null)} 
                                      className="px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200 text-[10px] font-semibold transition"
                                    >
                                      Cancel
                                    </button>
                                    <button 
                                      onClick={() => handleSaveEditIssue(iss.id)} 
                                      className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-550 text-white text-[10px] font-semibold transition"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex justify-between items-start gap-2">
                                    <h4 className="text-xs font-semibold text-slate-200 leading-relaxed group-hover:text-indigo-300 transition duration-100 pr-8">{iss.title}</h4>
                                    {/* Action Buttons Overlay (top-right) */}
                                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 flex gap-1 transition duration-150">
                                      <button 
                                        onClick={() => handleStartEditIssue(iss)} 
                                        className="p-1 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-indigo-400 rounded transition"
                                        title="Edit Task"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteIssue(iss.id)} 
                                        className="p-1 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-rose-400 rounded transition"
                                        title="Delete Task"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-[#1f1a3a]/60 pt-2.5 mt-1">
                                    <span className={`px-1.5 py-0.5 rounded font-bold ${
                                      iss.priority === 'HIGH' ? 'bg-amber-500/10 text-amber-400' :
                                      iss.priority === 'URGENT' ? 'bg-rose-500/10 text-rose-400' :
                                      'bg-slate-800 text-slate-400'
                                    }`}>
                                      {iss.priority}
                                    </span>
                                    <span className="font-semibold text-indigo-400">{iss.points} Points</span>
                                  </div>

                                  {iss.dueDate && (
                                    <span className="text-[9px] text-slate-500 flex items-center gap-1 mt-1 font-medium">
                                      <Calendar className="w-3 h-3 text-slate-600" /> Start: {iss.dueDate.split('T')[0]}
                                    </span>
                                  )}

                                  {/* Transitions */}
                                  <div className="flex justify-between mt-2 pt-2 border-t border-[#1f1a3a]/30">
                                    {/* Rollback button (left aligned) */}
                                    <div>
                                      {colStatus === 'TODO' && (
                                        <button onClick={() => updateIssueStatus(iss.id, 'BACKLOG')} className="text-[9px] text-slate-500 hover:text-slate-350 font-semibold hover:underline">← Rollback</button>
                                      )}
                                      {colStatus === 'IN_PROGRESS' && (
                                        <button onClick={() => updateIssueStatus(iss.id, 'TODO')} className="text-[9px] text-slate-500 hover:text-slate-350 font-semibold hover:underline">← Rollback</button>
                                      )}
                                      {colStatus === 'DONE' && (
                                        <button onClick={() => updateIssueStatus(iss.id, 'IN_PROGRESS')} className="text-[9px] text-slate-500 hover:text-slate-350 font-semibold hover:underline">← Rollback</button>
                                      )}
                                    </div>

                                    {/* Forward button (right aligned) */}
                                    <div>
                                      {colStatus === 'BACKLOG' && (
                                        <button onClick={() => updateIssueStatus(iss.id, 'TODO')} className="text-[9px] text-indigo-400 hover:text-indigo-300 font-bold hover:underline">Move to TODO →</button>
                                      )}
                                      {colStatus === 'TODO' && (
                                        <button onClick={() => updateIssueStatus(iss.id, 'IN_PROGRESS')} className="text-[9px] text-amber-400 hover:text-amber-300 font-bold hover:underline">Start Work →</button>
                                      )}
                                      {colStatus === 'IN_PROGRESS' && (
                                        <button onClick={() => updateIssueStatus(iss.id, 'DONE')} className="text-[9px] text-emerald-400 hover:text-emerald-300 font-bold hover:underline">Complete →</button>
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: TRIAGE QUEUE */}
          {activeTab === 'triage' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Form Input */}
              <div className="bg-[#0b0924]/40 border border-[#1f1a3a]/80 p-6 rounded-xl flex flex-col gap-4 backdrop-blur-sm">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Triage Intake Form</h3>
                  <p className="text-xs text-slate-400">Feed raw requirements. Use AI suggestions to auto-categorize capacity limits.</p>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Active AI Status / Quick Config */}
                  <div className="flex flex-col gap-2 bg-[#050412]/40 border border-[#1f1a3a]/40 p-3 rounded-xl">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">AI Engine:</span>
                      <span className="text-xs font-bold text-indigo-400">
                        {aiMode === 'local_rules' && 'Local Rules Engine'}
                        {aiMode === 'local_ai' && 'Local AI (Ollama)'}
                        {aiMode === 'external_api' && 'Gemini Token API'}
                      </span>
                    </div>

                    {aiMode === 'external_api' && (
                      <div className="flex flex-col gap-2 mt-1">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-semibold text-slate-400 uppercase">Gemini Token Key</label>
                          <input
                            type="password"
                            placeholder="Insert key (AIzaSy...)"
                            value={geminiToken}
                            onChange={(e) => {
                              setGeminiToken(e.target.value);
                              localStorage.setItem('nexus_gemini_token', e.target.value);
                            }}
                            className="w-full bg-[#050412] border border-[#1f1a3a] rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-indigo-500 text-slate-200"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-semibold text-slate-400 uppercase">Gemini Model</label>
                          <select
                            value={localAiModel.startsWith('gemini') || localAiModel.includes('banan') || localAiModel.includes('research') || localAiModel.includes('antigravity') ? localAiModel : 'gemini-1.5-flash'}
                            onChange={(e) => {
                              setLocalAiModel(e.target.value);
                              localStorage.setItem('nexus_local_ai_model', e.target.value);
                            }}
                            className="w-full bg-[#050412] border border-[#1f1a3a] rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-indigo-500 text-slate-200 cursor-pointer"
                          >
                            <option value="gemini-3.5-flash">Gemini 3.5 Flash (Stable)</option>
                            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Preview)</option>
                            <option value="gemini-3-flash-preview">Gemini 3 Flash (Preview)</option>
                            <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite (Stable)</option>
                            <option value="gemini-3.1-flash-live-preview">Gemini 3.1 Flash Live (Preview)</option>
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Stable)</option>
                            <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite (Stable)</option>
                            <option value="gemini-2.5-pro">Gemini 2.5 Pro (Stable)</option>
                            <option value="gemini-2.5-flash-live-preview">Gemini 2.5 Flash Live (Preview)</option>
                            <option value="gemini-1.5-flash">Gemini 1.5 Flash (Stable)</option>
                            <option value="gemini-2.0-flash">Gemini 2.0 Flash (Deprecated)</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {aiMode === 'local_ai' && (
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-semibold text-slate-400 uppercase">Model</label>
                          <input
                            type="text"
                            placeholder="e.g. llama3"
                            value={localAiModel}
                            onChange={(e) => {
                              setLocalAiModel(e.target.value);
                              localStorage.setItem('nexus_local_ai_model', e.target.value);
                            }}
                            className="w-full bg-[#050412] border border-[#1f1a3a] rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-indigo-500 text-slate-250"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-semibold text-slate-400 uppercase">URL</label>
                          <input
                            type="text"
                            placeholder="e.g. http://..."
                            value={localAiUrl}
                            onChange={(e) => {
                              setLocalAiUrl(e.target.value);
                              localStorage.setItem('nexus_local_ai_url', e.target.value);
                            }}
                            className="w-full bg-[#050412] border border-[#1f1a3a] rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-indigo-500 text-slate-250"
                          />
                        </div>
                      </div>
                    )}

                    {aiMode === 'local_rules' && (
                      <div className="text-[10px] text-slate-500 italic mt-1 text-center bg-slate-950/20 py-1.5 rounded border border-[#1f1a3a]/20">
                        Running local rule heuristic. Switch to AI models in Config tab.
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Title / Requirement</label>
                    <input
                      type="text"
                      placeholder="Title"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full bg-[#050412] border border-[#1f1a3a] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Description</label>
                    <textarea
                      placeholder="Input business context or meeting summary notes..."
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      rows={3}
                      className="w-full bg-[#050412] border border-[#1f1a3a] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                    />
                  </div>
                </div>

                {/* Capacity inputs */}
                <div className="flex flex-col gap-1.5 border-t border-[#1f1a3a]/80 pt-3">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Required Capacity Pools</label>
                  <div className="grid grid-cols-3 gap-2">
                    {resources.map(res => (
                      <div key={res.id} className="bg-[#050412] border border-[#1f1a3a] rounded-lg p-2 flex flex-col items-center">
                        <span className="text-[9px] text-slate-500 truncate w-full text-center">{res.name}</span>
                        <input
                          type="number"
                          min="0"
                          max={res.capacity}
                          value={reqResources[res.id] || ''}
                          onChange={(e) => setReqResources({ ...reqResources, [res.id]: parseInt(e.target.value) || 0 })}
                          className="w-10 bg-transparent text-center text-xs font-bold text-indigo-400 focus:outline-none mt-1"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 mt-2">
                  <button
                    onClick={handleTriageRequest}
                    disabled={isTriaging}
                    className="flex-1 bg-gradient-to-tr from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white py-2 rounded-lg text-xs font-bold shadow-lg shadow-indigo-600/10 transition"
                  >
                    {isTriaging ? 'Processing...' : 'Run Auto-Triage'}
                  </button>
                  <button
                    onClick={() => handleAddIssue(newTitle, triageSuggestions?.priority || 'NORMAL', triageSuggestions?.priority === 'URGENT' ? 5 : 2)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
                  >
                    Submit
                  </button>
                </div>

                {triageSuggestions && (
                  <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-4 flex flex-col gap-2 mt-2">
                    <span className="text-[11px] font-bold text-indigo-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Suggestions:
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="bg-slate-950/60 p-2 rounded border border-[#1f1a3a]">Priority: <strong className="text-amber-400">{triageSuggestions.priority}</strong></div>
                      <div className="bg-slate-950/60 p-2 rounded border border-[#1f1a3a]">Assign Role: <strong className="text-indigo-400">{triageSuggestions.assignee_role}</strong></div>
                      <div className="bg-slate-950/60 p-2 rounded border border-[#1f1a3a] col-span-2">Tags: {triageSuggestions.tags.join(', ')}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Triage list queue */}
              <div className="col-span-2 bg-[#0b0924]/40 border border-[#1f1a3a]/80 p-6 rounded-xl flex flex-col gap-4 backdrop-blur-sm">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Pending Triage Triage Queue</h3>
                  <p className="text-xs text-slate-400">All newly entered requests must be approved here into the backlog.</p>
                </div>

                <div className="flex flex-col gap-3 overflow-y-auto max-h-[500px] pr-1">
                  {issues.filter(i => i.status === 'TRIAGE').length === 0 ? (
                    <div className="py-20 border border-dashed border-[#1f1a3a]/40 rounded-xl flex flex-col items-center justify-center text-slate-500 text-xs italic">
                      Triage Queue is empty. Ready for new intakes!
                    </div>
                  ) : (
                    issues.filter(i => i.status === 'TRIAGE').map(iss => (
                      <div key={iss.id} className="bg-[#0f0c2f] border border-[#1f1a3a] p-4 rounded-xl flex items-center justify-between hover:border-indigo-500/30 transition duration-150">
                        <div className="flex flex-col gap-1.5 max-w-lg">
                          <span className="text-xs font-bold text-slate-200">{iss.title}</span>
                          <span className="text-[10px] text-slate-400 truncate">{iss.description || 'No description provided.'}</span>
                          <div className="flex gap-2 mt-1">
                            <span className="bg-[#050412] px-2 py-0.5 rounded text-[9px] text-slate-500 font-bold border border-[#1f1a3a]">Priority: {iss.priority}</span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => updateIssueStatus(iss.id, 'TODO')}
                            className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-lg text-xs font-bold transition flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={async () => await db.issues.delete(iss.id)}
                            className="px-3 py-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 rounded-lg text-xs font-bold transition flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DRAWERS SCHEDULER */}
          {activeTab === 'solver' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Resources pool display */}
              <div className="bg-[#0b0924]/40 border border-[#1f1a3a]/80 p-6 rounded-xl flex flex-col gap-4 backdrop-blur-sm">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Portfolio Capacity Pools</h3>
                  <p className="text-xs text-slate-400">Specify global shared resource capacities.</p>
                </div>

                <div className="flex flex-col gap-3">
                  {resources.map(res => (
                    <div key={res.id} className="bg-[#0f0c2f] border border-[#1f1a3a] p-4 rounded-xl flex justify-between items-center shadow-lg">
                      <span className="text-xs font-bold text-slate-200">{res.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-bold">Capacity:</span>
                        <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 px-2.5 py-0.5 rounded text-xs font-bold">
                          {res.capacity} Active
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-indigo-950/15 border border-indigo-500/20 p-4 rounded-xl flex flex-col gap-3 mt-2">
                  <h4 className="text-xs font-bold text-indigo-300">Run Solver Optimization</h4>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    This will run the Parallel-SGS scheduling algorithm to calculate and map optimized target dates based on resource conflicts and slack durations.
                  </p>
                  <button
                    onClick={runPortfolioScheduler}
                    className="w-full py-2.5 bg-gradient-to-tr from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-600/10 transition flex items-center justify-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" /> Run Multi-Project Solver
                  </button>
                </div>
              </div>

              {/* Cycle Manager */}
              <div className="col-span-2 bg-[#0b0924]/40 border border-[#1f1a3a]/80 p-6 rounded-xl flex flex-col gap-4 backdrop-blur-sm">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Active Sprint Cycles</h3>
                  <p className="text-xs text-slate-400">Initialize and manage time-boxed project development cycles.</p>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-[#050412]/40 border border-[#1f1a3a]/40 p-4 rounded-xl">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Cycle Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Cycle 1 - Foundation"
                      value={cycleName}
                      onChange={(e) => setCycleName(e.target.value)}
                      className="w-full bg-[#050412] border border-[#1f1a3a] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                    />
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 flex flex-col gap-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Starts At</label>
                      <input
                        type="date"
                        value={cycleStart}
                        onChange={(e) => setCycleStart(e.target.value)}
                        className="bg-[#050412] border border-[#1f1a3a] rounded-lg px-3 py-2 text-xs focus:outline-none text-slate-300 w-full"
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Ends At</label>
                      <input
                        type="date"
                        value={cycleEnd}
                        onChange={(e) => setCycleEnd(e.target.value)}
                        className="bg-[#050412] border border-[#1f1a3a] rounded-lg px-3 py-2 text-xs focus:outline-none text-slate-300 w-full"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleCreateCycle}
                    className="col-span-2 bg-[#1b153b] hover:bg-[#251e52] text-slate-200 py-2 rounded-lg text-xs font-bold transition border border-[#3b3273]/30"
                  >
                    Add Cycle
                  </button>
                </div>

                <div className="flex flex-col gap-3 mt-2 overflow-y-auto max-h-[300px]">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Configured Cycles</h4>
                  {cycles.length === 0 ? (
                    <p className="text-slate-500 text-xs italic">No cycles established yet.</p>
                  ) : (
                    cycles.map(cy => (
                      <div key={cy.id} className="bg-[#0f0c2f] border border-[#1f1a3a] p-4 rounded-xl flex justify-between items-center shadow-lg">
                        <span className="text-xs font-bold text-slate-200">{cy.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-slate-400 font-semibold">{cy.startsAt} to {cy.endsAt}</span>
                          <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Scheduled</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

        </div>
      </div>

    </div>
  );
}
