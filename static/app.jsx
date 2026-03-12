const { useState, useEffect } = React;

function App() {
  const [activeTab, setActiveTab] = useState('upload');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [createdFiles, setCreatedFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [newVersionName, setNewVersionName] = useState('');
  
  const [draftName, setDraftName] = useState('');
  const [outputFormat, setOutputFormat] = useState('pdf');
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);

  // Improvement Flow states
  const [isImproving, setIsImproving] = useState(false);
  const [improvementStep, setImprovementStep] = useState('');
  const [improvementLogs, setImprovementLogs] = useState([]);
  const [improvementTable, setImprovementTable] = useState([]);

  // Section chat states
  const [selectedRowIndex, setSelectedRowIndex] = useState(-1);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Market research states
  const [marketResearchGoal, setMarketResearchGoal] = useState('');
  const [isMarketResearchLoading, setIsMarketResearchLoading] = useState(false);
  const [marketResearchMarkdown, setMarketResearchMarkdown] = useState('');
  const [marketResearchError, setMarketResearchError] = useState('');

  // TOC generation states
  const [isTocLoading, setIsTocLoading] = useState(false);
  const [tocError, setTocError] = useState('');
  const [tocModificationRow, setTocModificationRow] = useState(null);
  const [tocSectionRows, setTocSectionRows] = useState([]);
  const [tocOriginalBaselineText, setTocOriginalBaselineText] = useState('');

  // Section creation states
  const [currentSectionIndex, setCurrentSectionIndex] = useState(-1);
  const [isSectionLoading, setIsSectionLoading] = useState(false);
  const [sectionError, setSectionError] = useState('');
  const [improveWorkflowId, setImproveWorkflowId] = useState('');
  const [marketResearchWorkflowId, setMarketResearchWorkflowId] = useState('');
  const [sectionWorkflowId, setSectionWorkflowId] = useState('');
  const [originalTocItems, setOriginalTocItems] = useState([]);

  const fetchUploadedFiles = async () => {
    try {
      const res = await fetch('/api/uploads');
      const data = await res.json();
      setUploadedFiles(data.files || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCreatedFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      setCreatedFiles(data.files || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchUploadedFiles();
    fetchCreatedFiles();
  }, [activeTab]);

  const buildOutputFilename = (name, format) => {
    const trimmedName = (name || '').trim();
    if (!trimmedName) return '';
    const baseName = trimmedName.replace(/\.(pdf|docx|md)$/i, '');
    return `${baseName}.${format}`;
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchWorkflowJson = async (url, options = {}) => {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok && !data.workflow_id) {
      throw new Error(data.error || 'Workflow request failed');
    }
    return data;
  };

  const advanceWorkflow = async (workflowId) => {
    return fetchWorkflowJson(`/api/workflows/${encodeURIComponent(workflowId)}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const syncImproveWorkflowState = (workflow) => {
    const logs = workflow.progress_messages || [];
    const result = workflow.result || {};
    const items = result.table || [];
    const latestStep = logs[logs.length - 1] || workflow.phase || 'Processing...';

    setImproveWorkflowId(workflow.workflow_id || '');
    setImprovementStep(latestStep);
    setImprovementLogs(logs);
    setIsImproving(workflow.status === 'pending' || workflow.status === 'running');

    if (items.length > 0) {
      setImprovementTable(items);
      setEditorContent(items.map(r => `## ${r.section_title}\n\n${r.summary}`).join('\n\n'));
    }

    if (result.toc_items) {
      setOriginalTocItems(result.toc_items);
    }
  };

  const syncMarketResearchWorkflowState = (workflow) => {
    const result = workflow.result || {};
    setMarketResearchWorkflowId(workflow.workflow_id || '');
    setIsMarketResearchLoading(workflow.status === 'pending' || workflow.status === 'running');
    if (result.markdown) {
      setMarketResearchMarkdown(result.markdown);
    }
  };

  const syncSectionWorkflowState = (workflow) => {
    const result = workflow.result || {};
    const rows = result.section_rows || [];

    setSectionWorkflowId(workflow.workflow_id || '');
    setCurrentSectionIndex(
      workflow.status === 'completed'
        ? rows.length
        : (typeof workflow.current_section_index === 'number' ? workflow.current_section_index : -1)
    );

    if (rows.length > 0) {
      setTocSectionRows((previousRows) => rows.map((row, index) => {
        const previousRow = previousRows[index];
        if (previousRow && previousRow.improvedText && previousRow.improvedText !== row.improvedText) {
          return {
            ...row,
            improvedText: previousRow.improvedText,
            explanation: previousRow.explanation || row.explanation,
          };
        }
        return row;
      }));
    }
  };

  const runWorkflowToCompletion = async (createUrl, body, onUpdate) => {
    let workflow = await fetchWorkflowJson(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    onUpdate(workflow);

    while (workflow.status === 'pending' || workflow.status === 'running') {
      workflow = await advanceWorkflow(workflow.workflow_id);
      onUpdate(workflow);
      if (workflow.status === 'pending' || workflow.status === 'running') {
        await sleep(50);
      }
    }

    return workflow;
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      fetchUploadedFiles();
      alert('File uploaded successfully!');
    } catch (e) {
      alert('Error uploading file');
    }
  };

  const handleDeleteUpload = async (filename) => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await fetch(`/api/uploads/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      fetchUploadedFiles();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectFile = (e) => {
    const filename = e.target.value;
    setSelectedFile(filename);
    if (!filename) {
      setDraftName('');
      return;
    }
    setDraftName(`new-${filename.replace(/\.[^/.]+$/, "")}`);
  };

  const handleLoadAndProcess = async () => {
    if (!selectedFile) {
      alert("Please select an uploaded file.");
      return;
    }
    
    setImprovementTable([]);
    setEditorContent('');
    setIsImproving(true);
    setImprovementStep("מתחיל תהליך שיפור מסמך... (Initializing...)");
    setImprovementLogs(["מתחיל תהליך שיפור מסמך... (Initializing...)"]);
    setSelectedRowIndex(-1);
    setChatMessages([]);
    setMarketResearchMarkdown('');
    setMarketResearchError('');
    setTocError('');
    setTocModificationRow(null);
    setTocOriginalBaselineText('');
    setTocSectionRows([]);
    setCurrentSectionIndex(-1);
    setIsSectionLoading(false);
    setSectionError('');
    setImproveWorkflowId('');
    setMarketResearchWorkflowId('');
    setSectionWorkflowId('');
    setOriginalTocItems([]);
    
    // Derive version name from selected file
    const baseName = selectedFile.replace(/\.[^/.]+$/, "");
    setNewVersionName(`new-${baseName}`);
    if (!draftName) setDraftName(`new-${baseName}`);
    
    try {
      const workflow = await runWorkflowToCompletion(
        '/api/improve',
        { filename: selectedFile },
        syncImproveWorkflowState
      );

      if (workflow.status === 'failed') {
        throw new Error(workflow.last_error || 'Error processing document');
      }

      setImprovementStep('תהליך הסתיים (Finished!)');
    } catch (err) {
      console.error(err);
      const errorMessage = err.message || 'Error processing document.';
      setImprovementStep(errorMessage);
      setImprovementLogs(prev => [...prev, errorMessage]);
      setIsImproving(false);
    }
  };

  const handleSaveVersion = async () => {
    const saveName = (draftName || newVersionName || '').trim();
    const improvedMd = buildImprovedDocumentMarkdown();
    if (!saveName || (improvementTable.length === 0 && !improvedMd)) {
      alert('Please process a file first before saving.');
      return;
    }

    const filename = buildOutputFilename(saveName, outputFormat);
    const mdContent = improvedMd || improvementTable.map(r => `## ${r.section_title}\n\n${r.summary}`).join('\n\n');

    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: mdContent, output_format: outputFormat })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save document');
      }
      fetchCreatedFiles();
      alert(`Document saved successfully as ${data.filename || filename}!`);
      setActiveTab('files');
    } catch (e) {
      alert(e.message || 'Error saving document');
    }
  };

  const handleDownloadFile = (filename) => {
    window.open(`/api/files/${encodeURIComponent(filename)}`, '_blank');
  };

  const handleRowClick = (index) => {
    if (selectedRowIndex !== index) {
      setSelectedRowIndex(index);
      setChatMessages([]);
    }
  };

  const handleChatSend = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || selectedRowIndex < 0 || isChatLoading) return;

    setChatInput('');
    const userMsg = { role: 'user', content: trimmed };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setIsChatLoading(true);

    const history = chatMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      content: m.content
    }));

    try {
      const tocRow = tocSectionRows[selectedRowIndex];
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          selected_row: {
            section_title: tocRow.sectionTitle,
            original_text: tocRow.originalText,
            improved_text: tocRow.improvedText,
            explanation: tocRow.explanation,
          },
          chat_history: history
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChatMessages([...updatedMessages, {
        role: 'assistant',
        content: data.message,
        isProposal: data.is_proposal,
        proposedText: data.proposed_improved_text
      }]);
    } catch (e) {
      setChatMessages([...updatedMessages, { role: 'assistant', content: 'Error: ' + e.message }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleAcceptProposal = (proposedText, msgIndex) => {
    setTocSectionRows(prev => prev.map((row, i) =>
      i === selectedRowIndex ? { ...row, improvedText: proposedText } : row
    ));
    setChatMessages(msgs => msgs.map((m, i) =>
      i === msgIndex ? { ...m, accepted: true } : m
    ));
  };

  const handleDeclineProposal = (msgIndex) => {
    setChatMessages(msgs => msgs.map((m, i) =>
      i === msgIndex ? { ...m, declined: true } : m
    ));
  };

  const handleStartMarketResearch = async () => {
    const goal = marketResearchGoal.trim();
    if (!editorContent) {
      alert('Please process a file first before running market research.');
      return;
    }
    if (!goal) {
      alert('Please describe your goal before starting market research.');
      return;
    }

    setIsMarketResearchLoading(true);
    setMarketResearchError('');
    setMarketResearchMarkdown('');
    setTocError('');
    setTocModificationRow(null);
    setTocSectionRows([]);
    setMarketResearchWorkflowId('');

    try {
      const workflow = await runWorkflowToCompletion(
        '/api/market-research',
        {
          summary: editorContent,
          user_goal: goal
        },
        syncMarketResearchWorkflowState
      );

      if (workflow.status === 'failed') {
        throw new Error(workflow.last_error || 'Failed to run market research');
      }
    } catch (e) {
      setMarketResearchError(e.message || 'Error running market research');
    } finally {
      setIsMarketResearchLoading(false);
    }
  };

  const getOriginalTocTextFromSummaries = () => {
    const tocRow = (improvementTable || []).find((row) => {
      const title = (row?.section_title || '').toLowerCase();
      return title.includes('תוכן עניינים') || title.includes('table of contents');
    });
    return (tocRow?.original_text || '').trim();
  };

  const handleCreateNewTableOfContents = async () => {
    if (!editorContent || !marketResearchMarkdown || isTocLoading) return;

    setIsTocLoading(true);
    setTocError('');
    setTocModificationRow(null);
    setTocSectionRows([]);
    setSectionWorkflowId('');
    setCurrentSectionIndex(-1);

    try {
      const originalTocFromSummaryTable = getOriginalTocTextFromSummaries();

      const res = await fetch('/api/table-of-contents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: editorContent,
          market_research: marketResearchMarkdown,
          original_toc_text: originalTocFromSummaryTable,
          original_toc: originalTocItems
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate table of contents');
      }

      const exactOriginalText = originalTocFromSummaryTable || data.original_toc_page_text || data.original_toc_text || '';
      const baselineOriginalText = tocOriginalBaselineText || exactOriginalText;
      if (!tocOriginalBaselineText && exactOriginalText) {
        setTocOriginalBaselineText(exactOriginalText);
      }

      setTocModificationRow({
        sectionTitle: 'תוכן עניינים (Table of Contents)',
        originalText: baselineOriginalText,
        improvedText: data.new_toc_text || '',
        explanation: data.additions_explanation || ''
      });

      const originalSet = new Set((data.original_toc || []).map(s => `${s.kind}|${s.number}|${s.title}`));
      const sectionRows = (data.new_toc || []).map(section => {
        const isExisting = originalSet.has(`${section.kind}|${section.number}|${section.title}`);
        const sectionLabel = [section.kind, section.number, section.title].filter(Boolean).join(' ');
        let originalText = '';
        if (isExisting) {
          const matchingRow = (improvementTable || []).find(row => {
            const rowTitle = (row.section_title || '').trim();
            return rowTitle.includes(section.title) || (section.title && section.title.includes(rowTitle));
          });
          originalText = matchingRow ? (matchingRow.original_text || matchingRow.summary || '') : '';
        }
        return { sectionTitle: sectionLabel, originalText, improvedText: '', explanation: '' };
      });
      setTocSectionRows(sectionRows);
      setCurrentSectionIndex(0);
      setSectionError('');
    } catch (e) {
      setTocError(e.message || 'Error generating table of contents');
    } finally {
      setIsTocLoading(false);
    }
  };

  const handleCreateNextSection = async () => {
    if (currentSectionIndex < 0 || currentSectionIndex >= tocSectionRows.length || isSectionLoading) return;
    setIsSectionLoading(true);
    setSectionError('');

    try {
      let workflowId = sectionWorkflowId;

      if (!workflowId) {
        const createdWorkflow = await fetchWorkflowJson('/api/section-generation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sections: tocSectionRows,
            market_research: marketResearchMarkdown,
            document_summary: editorContent,
          })
        });
        workflowId = createdWorkflow.workflow_id;
        syncSectionWorkflowState(createdWorkflow);
      }

      const workflow = await advanceWorkflow(workflowId);
      syncSectionWorkflowState(workflow);

      if (workflow.status === 'failed') {
        throw new Error(workflow.last_error || 'Failed to create section');
      }
    } catch (e) {
      setSectionError(e.message || 'Error creating section');
    } finally {
      setIsSectionLoading(false);
    }
  };

  const buildImprovedDocumentMarkdown = () => {
    const parts = [];
    if (tocModificationRow && tocModificationRow.improvedText) {
      parts.push(`## ${tocModificationRow.sectionTitle}\n\n${tocModificationRow.improvedText}`);
    }
    tocSectionRows.forEach(row => {
      if (row.improvedText) {
        parts.push(`## ${row.sectionTitle}\n\n${row.improvedText}`);
      }
    });
    return parts.join('\n\n');
  };

  return (
    <>
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
      
      <div className="app-container">
        {/* Collapsible Chat Panel */}
        <div className={`left-panel ${isChatCollapsed ? 'collapsed' : ''}`} style={{ transition: 'width 0.3s', width: isChatCollapsed ? '50px' : '380px', position: 'relative', overflow: 'hidden' }}>
          <button
            onClick={() => setIsChatCollapsed(!isChatCollapsed)}
            style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10, border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', cursor: 'pointer', padding: '5px' }}
          >
            {isChatCollapsed ? '>>' : '<<'}
          </button>

          {!isChatCollapsed && (() => {
            const chatEnabled = tocSectionRows.length > 0 && !isImproving;
            const inputEnabled = chatEnabled && selectedRowIndex >= 0 && !isChatLoading;
            const selectedRow = chatEnabled && selectedRowIndex >= 0 ? tocSectionRows[selectedRowIndex] : null;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <h2 style={{ paddingRight: '40px', marginBottom: '8px' }}>Assistant Chat</h2>

                {/* Section chip */}
                {selectedRow && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', margin: '0 0 8px 0',
                    backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
                    borderRadius: '20px', fontSize: '0.82rem', color: '#1d4ed8', fontWeight: '600'
                  }} dir="rtl">
                    <span>§</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedRow.sectionTitle}
                    </span>
                  </div>
                )}

                {/* Messages area */}
                <div className="chat-messages" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', gap: '8px', padding: '4px 0' }}>
                  {isImproving ? (
                    <div style={{
                      padding: '20px', backgroundColor: '#f1f5f9', borderRadius: '8px',
                      border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: '10px'
                    }}>
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '50%',
                        border: '3px solid #cbd5e1', borderTopColor: '#3b82f6',
                        animation: 'spin 1s linear infinite'
                      }}></div>
                      <p style={{ margin: 0, textAlign: 'center', color: '#0f172a', fontWeight: 'bold' }} dir="rtl">{improvementStep}</p>
                      <div style={{
                        width: '100%', maxHeight: '260px', overflowY: 'auto',
                        background: '#fff', border: '1px solid #cbd5e1',
                        borderRadius: '6px', padding: '10px'
                      }} dir="rtl">
                        {improvementLogs.map((log, i) => (
                          <div key={i} style={{
                            fontSize: '0.82rem', color: '#334155',
                            padding: '6px 0', borderBottom: i === improvementLogs.length - 1 ? 'none' : '1px solid #e2e8f0'
                          }}>
                            {log}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : !chatEnabled ? (
                    <p className="system-message">Hello! I am your RFP Assistant. Upload and process a document to begin.</p>
                  ) : chatMessages.length === 0 && !selectedRow ? (
                    <p className="system-message" style={{ color: '#64748b', fontSize: '0.9rem' }}>
                      Click a row in the sections table to select a section and start chatting.
                    </p>
                  ) : chatMessages.length === 0 ? (
                    <p className="system-message" style={{ color: '#64748b', fontSize: '0.9rem' }} dir="rtl">
                      I\'m ready to help with <strong>{selectedRow.sectionTitle}</strong>. What would you like to change?
                    </p>
                  ) : (
                    chatMessages.map((msg, i) => (
                      <div key={i} style={{
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '90%'
                      }}>
                        {/* bubble */}
                        <div style={{
                          padding: '8px 12px',
                          borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                          backgroundColor: msg.role === 'user' ? '#3b82f6' : '#f1f5f9',
                          color: msg.role === 'user' ? '#fff' : '#0f172a',
                          fontSize: '0.88rem', lineHeight: '1.5', whiteSpace: 'pre-wrap'
                        }} dir="rtl">
                          {msg.content}
                        </div>

                        {/* Proposal block */}
                        {msg.isProposal && msg.proposedText && (
                          <div style={{
                            marginTop: '8px', padding: '10px 12px',
                            border: '1px solid #bfdbfe', borderRadius: '8px',
                            backgroundColor: '#fff',
                            fontSize: '0.85rem', opacity: (msg.accepted || msg.declined) ? 0.6 : 1
                          }} dir="rtl">
                            <div style={{ fontWeight: '600', marginBottom: '6px', color: '#1d4ed8' }}>Proposed Improved Text:</div>
                            <div style={{ whiteSpace: 'pre-wrap', color: '#0f172a', marginBottom: '10px' }}>
                              {msg.proposedText}
                            </div>
                            {!msg.accepted && !msg.declined ? (
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={() => handleAcceptProposal(msg.proposedText, i)}
                                  style={{ flex: 1, padding: '6px 0', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={() => handleDeclineProposal(i)}
                                  style={{ flex: 1, padding: '6px 0', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}
                                >
                                  Decline
                                </button>
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.8rem', color: msg.accepted ? '#16a34a' : '#dc2626', fontWeight: '600' }}>
                                {msg.accepted ? '✓ Accepted' : '✗ Declined'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {/* Loading indicator */}
                  {isChatLoading && (
                    <div style={{ alignSelf: 'flex-start', padding: '8px 12px', backgroundColor: '#f1f5f9', borderRadius: '12px', fontSize: '0.85rem', color: '#64748b' }}>
                      Thinking...
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="chat-input-wrapper">
                  <input
                    type="text"
                    placeholder={!chatEnabled ? 'Process a document first...' : selectedRowIndex < 0 ? 'Select a section from the table...' : 'Type a message...'}
                    className="chat-input"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleChatSend(); }}
                    disabled={!inputEnabled}
                    style={{ opacity: inputEnabled ? 1 : 0.5 }}
                  />
                  <button
                    onClick={handleChatSend}
                    disabled={!inputEnabled}
                    style={{ opacity: inputEnabled ? 1 : 0.5 }}
                  >
                    Send
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Right Panel: Tabs */}
        <div className="right-panel" style={{ flex: 1, minWidth: 0 }}>
          <div className="tabs">
            <button 
              onClick={() => setActiveTab('upload')} 
              className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
            >
              File Upload
            </button>
            <button 
              onClick={() => setActiveTab('editor')} 
              className={`tab-btn ${activeTab === 'editor' ? 'active' : ''}`}
            >
              RFP Document Editor
            </button>
            <button 
              onClick={() => setActiveTab('files')} 
              className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`}
            >
              Drafts / Created Files
            </button>
          </div>

          <div className="tab-content" style={{ display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'upload' && (
              <div className="tab-pane">
                <h3>Upload Old RFP Document</h3>
                <div className="upload-area">
                  <input type="file" onChange={handleFileUpload} accept=".txt,.md,.doc,.docx" />
                </div>
                
                <div style={{marginTop: '30px'}}>
                  <h4>Uploaded Files</h4>
                  <ul className="file-list">
                    {uploadedFiles.length === 0 && <li style={{backgroundColor: 'transparent', border: 'none', color: '#64748b'}}>No files uploaded yet.</li>}
                    {uploadedFiles.map(f => (
                      <li key={f} style={{display: 'flex', justifyContent: 'space-between'}}>
                        <span>{f}</span>
                        <button onClick={() => handleDeleteUpload(f)} style={{background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold'}}>
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'editor' && (
              <div className="tab-pane" style={{display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto'}}>
                <h3>RFP Document Editor</h3>
                
                {/* 1. File Selection */}
                <div style={{display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px'}}>
                  <select onChange={handleSelectFile} value={selectedFile || ''} style={{padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1'}}>
                    <option value="">Select an uploaded file...</option>
                    {uploadedFiles.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  
                  <button onClick={handleLoadAndProcess} disabled={isImproving} style={{padding: '8px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', opacity: isImproving ? 0.5 : 1}}>
                    Load & Process
                  </button>
                </div>
                
                {/* 2. Improvement Table */}
                {improvementTable.length > 0 && !isImproving && (
                  <div style={{ marginBottom: '25px' }} dir="rtl">
                    <h4 style={{ marginBottom: '15px', color: '#0f172a', borderBottom: '2px solid #3b82f6', paddingBottom: '8px', display: 'inline-block' }}>
                      סיכומים לפי סעיף (Summaries by Section)
                    </h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f1f5f9' }}>
                            <th style={{ border: '1px solid #cbd5e1', padding: '10px', width: '20%', fontWeight: '600' }}>סעיף (Section)</th>
                            <th style={{ border: '1px solid #cbd5e1', padding: '10px', width: '40%', fontWeight: '600' }}>טקסט מקורי (Original)</th>
                            <th style={{ border: '1px solid #cbd5e1', padding: '10px', width: '40%', fontWeight: '600' }}>סיכום (Summary)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {improvementTable.map((row, i) => (
                            <tr
                              key={i}
                              onClick={() => handleRowClick(i)}
                              style={{
                                backgroundColor: selectedRowIndex === i ? '#dbeafe' : (i % 2 === 0 ? '#ffffff' : '#f8fafc'),
                                cursor: 'pointer',
                                outline: selectedRowIndex === i ? '2px solid #3b82f6' : 'none',
                                outlineOffset: '-2px'
                              }}
                            >
                              <td style={{ border: '1px solid #cbd5e1', padding: '10px', verticalAlign: 'top', fontWeight: '500' }}>{row.section_title}</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '10px', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>{row.original_text}</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '10px', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>{row.summary}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                
                {/* 3. Fully Rendered Markdown Preview */}
                {editorContent && !isImproving && (
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ marginBottom: '15px', color: '#0f172a', borderBottom: '2px solid #3b82f6', paddingBottom: '8px', display: 'inline-block' }} dir="rtl">
                      סיכום המסמך (Document Summary)
                    </h4>
                    <div 
                      dir="rtl"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(editorContent)) }}
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '25px',
                        backgroundColor: '#ffffff',
                        lineHeight: '1.8',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                    />
                  </div>
                )}

                {/* 4. Market Research Goal + Results */}
                {editorContent && !isImproving && (
                  <div style={{ marginBottom: '24px', textAlign: 'right' }} dir="rtl">
                    <h4 style={{ marginBottom: '12px', color: '#0f172a', borderBottom: '2px solid #10b981', paddingBottom: '8px', display: 'inline-block' }}>
                      Market Research
                    </h4>

                    <textarea
                      dir="rtl"
                      value={marketResearchGoal}
                      onChange={(e) => setMarketResearchGoal(e.target.value)}
                      placeholder="Describe your market-research goal in detail. Include target period, priorities, and expected outcomes."
                      style={{
                        width: '100%',
                        minHeight: '120px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '12px',
                        fontSize: '0.95rem',
                        lineHeight: '1.5',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                        marginBottom: '10px'
                      }}
                    />

                    <button
                      onClick={handleStartMarketResearch}
                      disabled={isMarketResearchLoading || !marketResearchGoal.trim()}
                      style={{
                        padding: '10px 18px',
                        backgroundColor: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        opacity: (isMarketResearchLoading || !marketResearchGoal.trim()) ? 0.6 : 1
                      }}
                    >
                      {isMarketResearchLoading ? 'Running Research...' : 'Start Market Research'}
                    </button>

                    {marketResearchError && (
                      <div style={{
                        marginTop: '12px',
                        border: '1px solid #fecaca',
                        backgroundColor: '#fef2f2',
                        color: '#991b1b',
                        borderRadius: '8px',
                        padding: '10px 12px'
                      }}>
                        {marketResearchError}
                      </div>
                    )}

                    {marketResearchMarkdown && (
                      <div style={{ marginTop: '16px' }} dir="rtl">
                        <h5 style={{ marginBottom: '10px', color: '#0f172a' }}>Market Research Results</h5>
                        <div
                          dir="rtl"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(marketResearchMarkdown)) }}
                          style={{
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            padding: '18px',
                            backgroundColor: '#ffffff',
                            lineHeight: '1.8',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                          }}
                        />

                        <div style={{ marginTop: '14px', textAlign: 'right' }}>
                          <button
                            onClick={handleCreateNewTableOfContents}
                            disabled={isTocLoading}
                            style={{
                              padding: '10px 18px',
                              backgroundColor: '#0f766e',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: '600',
                              opacity: isTocLoading ? 0.6 : 1
                            }}
                          >
                            {isTocLoading ? 'Generating...' : 'Create New Table of Contents (תוכן עניינים)'}
                          </button>
                        </div>

                        {tocError && (
                          <div style={{
                            marginTop: '12px',
                            border: '1px solid #fecaca',
                            backgroundColor: '#fef2f2',
                            color: '#991b1b',
                            borderRadius: '8px',
                            padding: '10px 12px'
                          }}>
                            {tocError}
                          </div>
                        )}

                        {tocModificationRow && (
                          <div style={{ marginTop: '16px' }}>
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
                                <thead>
                                  <tr style={{ backgroundColor: '#f1f5f9' }}>
                                    <th style={{ border: '1px solid #cbd5e1', padding: '10px', width: '18%', fontWeight: '600' }}>Section Title</th>
                                    <th style={{ border: '1px solid #cbd5e1', padding: '10px', width: '27%', fontWeight: '600' }}>Original Text</th>
                                    <th style={{ border: '1px solid #cbd5e1', padding: '10px', width: '27%', fontWeight: '600' }}>Improved Text</th>
                                    <th style={{ border: '1px solid #cbd5e1', padding: '10px', width: '28%', fontWeight: '600' }}>Explanation of Modification</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '10px', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>{tocModificationRow.sectionTitle}</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '10px', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>{tocModificationRow.originalText}</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '10px', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>{tocModificationRow.improvedText}</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '10px', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>{tocModificationRow.explanation}</td>
                                  </tr>
                                  {tocSectionRows.map((row, i) => (
                                    <tr
                                      key={`toc-section-${i}`}
                                      onClick={() => handleRowClick(i)}
                                      style={{
                                        backgroundColor: selectedRowIndex === i ? '#dbeafe' : (i === currentSectionIndex && isSectionLoading ? '#fef9c3' : undefined),
                                        cursor: 'pointer',
                                        outline: selectedRowIndex === i ? '2px solid #3b82f6' : 'none',
                                        outlineOffset: '-2px'
                                      }}
                                    >
                                      <td style={{ border: '1px solid #cbd5e1', padding: '10px', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>{row.sectionTitle}</td>
                                      <td style={{ border: '1px solid #cbd5e1', padding: '10px', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>{row.originalText}</td>
                                      <td style={{ border: '1px solid #cbd5e1', padding: '10px', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>
                                        {i === currentSectionIndex && isSectionLoading ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontSize: '0.85rem' }}>
                                            <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #fcd34d', borderTopColor: '#d97706', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                            Generating...
                                          </div>
                                        ) : row.improvedText}
                                      </td>
                                      <td style={{ border: '1px solid #cbd5e1', padding: '10px', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>{row.explanation}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Create next section button */}
                            {tocSectionRows.length > 0 && (
                              <div style={{ marginTop: '16px', textAlign: 'right' }}>
                                {currentSectionIndex < tocSectionRows.length ? (
                                  <button
                                    onClick={handleCreateNextSection}
                                    disabled={isSectionLoading}
                                    style={{ padding: '10px 18px', backgroundColor: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '0.95rem', opacity: isSectionLoading ? 0.6 : 1 }}
                                  >
                                    {isSectionLoading
                                      ? 'Creating...'
                                      : `Create ${tocSectionRows[currentSectionIndex].sectionTitle}`}
                                  </button>
                                ) : (
                                  <div style={{ color: '#16a34a', fontWeight: '600', fontSize: '0.95rem' }}>✓ All sections created</div>
                                )}
                                {sectionError && (
                                  <div style={{ marginTop: '10px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: '8px', padding: '10px 12px' }}>
                                    {sectionError}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Improved document preview */}
                            {buildImprovedDocumentMarkdown() && (
                              <div style={{ marginTop: '24px' }}>
                                <h5 style={{ marginBottom: '10px', color: '#0f172a', borderBottom: '2px solid #7c3aed', paddingBottom: '8px', display: 'inline-block' }}>
                                  Improved Document Preview
                                </h5>
                                <div
                                  dir="rtl"
                                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(buildImprovedDocumentMarkdown())) }}
                                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '25px', backgroundColor: '#ffffff', lineHeight: '1.8', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                {/* 5. Save Document */}
                {editorContent && !isImproving && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '15px 0',
                    borderTop: '1px solid #e2e8f0',
                    marginTop: '10px'
                  }}>
                    <div style={{color: '#64748b', fontSize: '0.9rem'}}>
                      {draftName ? `Saving as: ${buildOutputFilename(draftName, outputFormat)}` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="New draft name"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        style={{padding: '8px', minWidth: '220px', borderRadius: '4px', border: '1px solid #cbd5e1'}}
                      />
                      <select
                        value={outputFormat}
                        onChange={(e) => setOutputFormat(e.target.value)}
                        style={{padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#fff'}}
                      >
                        <option value="pdf">PDF</option>
                        <option value="docx">DOCX</option>
                      </select>
                      <button onClick={handleSaveVersion} disabled={!draftName || (!improvementTable.length && !buildImprovedDocumentMarkdown())} style={{
                        padding: '10px 25px',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: '500',
                        fontSize: '1rem',
                        opacity: (!draftName || (!improvementTable.length && !buildImprovedDocumentMarkdown())) ? 0.5 : 1
                      }}>
                        Save File
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Empty state */}
                {!editorContent && !isImproving && (
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#94a3b8',
                    fontSize: '1.1rem'
                  }}>
                    Select a file and click "Load & Process" to begin.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'files' && (
              <div className="tab-pane">
                <h3>Drafts / Created Files</h3>
                <ul className="file-list">
                  {createdFiles.length === 0 && <li style={{backgroundColor: 'transparent', border: 'none', color: '#64748b'}}>No files created yet.</li>}
                  {createdFiles.map(f => (
                    <li key={f} style={{display: 'flex', justifyContent: 'space-between'}}>
                      <span>{f}</span>
                      <button onClick={() => handleDownloadFile(f)} style={{background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 'bold'}}>
                        Download
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);