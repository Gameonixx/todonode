import React, { useState, useEffect, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/notes\/?$/, '')
  : '/api';

const NOTES_URL = `${API_BASE}/notes`;
const EMAILS_URL = `${API_BASE}/emails`;
const UPLOAD_URL = `${API_BASE}/upload`;
const HEALTH_URL = `${API_BASE}/health`;

export default function App() {
  // Navigation: 'notes' or 'emails'
  const [activeTab, setActiveTab] = useState('notes');

  // ----------------- NOTES STATE ----------------- //
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const fileInputRef = useRef(null);

  // Note inline editing
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteTitle, setEditNoteTitle] = useState('');
  const [editNoteContent, setEditNoteContent] = useState('');

  // ----------------- EMAILS STATE ----------------- //
  const [emails, setEmails] = useState([]);
  const [emailFolder, setEmailFolder] = useState('inbox'); // 'inbox' or 'sent'
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [emailSearchTerm, setEmailSearchTerm] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);

  // Compose form fields
  const [composeFrom, setComposeFrom] = useState('');
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeBcc, setComposeBcc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);

  // ----------------- SYSTEM / HEALTH STATE ----------------- //
  const [serverOnline, setServerOnline] = useState(false);
  const [dbMode, setDbMode] = useState('');
  const [storageMode, setStorageMode] = useState('');
  const [bucketName, setBucketName] = useState('');
  const [sesActive, setSesActive] = useState(false);
  const [defaultSender, setDefaultSender] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // ----------------- FETCH DATA ----------------- //

  // Fetch Notes & System Health
  const fetchNotes = async () => {
    try {
      const response = await fetch(NOTES_URL);
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data = await response.json();
      setNotes(data);
      setServerOnline(true);
      setError(null);

      // Check Health
      try {
        const healthRes = await fetch(HEALTH_URL);
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setDbMode(healthData.mode === 'sql-database' ? 'SQL Database' : 'In-Memory');
          if (healthData.storage === 's3') {
            setStorageMode('AWS S3');
            setBucketName(healthData.s3Bucket || '');
          } else {
            setStorageMode('Local Storage');
          }
          setSesActive(!!healthData.sesConfigured);
          if (healthData.defaultFromEmail) {
            setDefaultSender(healthData.defaultFromEmail);
            if (!composeFrom) setComposeFrom(healthData.defaultFromEmail);
          }
        }
      } catch (e) {}
    } catch (err) {
      console.error('Failed to fetch notes:', err);
      setServerOnline(false);
      setError('Cannot connect to backend server. Make sure "node server.js" is running.');
    } finally {
      setLoadingNotes(false);
    }
  };

  // Fetch Emails from Database
  const fetchEmails = async () => {
    setLoadingEmails(true);
    try {
      const response = await fetch(EMAILS_URL);
      if (!response.ok) throw new Error('Failed to fetch emails');
      const data = await response.json();
      setEmails(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch emails:', err);
      setError('Failed to fetch emails from database.');
    } finally {
      setLoadingEmails(false);
    }
  };

  useEffect(() => {
    fetchNotes();
    fetchEmails();
  }, []);

  // ----------------- NOTES HANDLERS ----------------- //
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      if (file.type.startsWith('image/')) {
        setFilePreview(URL.createObjectURL(file));
      } else {
        setFilePreview(null);
      }
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
      setFilePreview(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!title.trim() && !content.trim() && !selectedFile) return;

    setUploading(true);
    let uploadedFileUrl = null;
    let uploadedFileName = null;

    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        const uploadRes = await fetch(UPLOAD_URL, { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('File upload failed');
        const uploadData = await uploadRes.json();
        uploadedFileUrl = uploadData.fileUrl;
        uploadedFileName = uploadData.fileName;
      }

      const response = await fetch(NOTES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          fileUrl: uploadedFileUrl,
          fileName: uploadedFileName
        })
      });

      if (!response.ok) throw new Error('Failed to create note');
      const newNote = await response.json();
      setNotes((prev) => [newNote, ...prev]);

      setTitle('');
      setContent('');
      handleRemoveFile();
      setSuccessMsg('Note created successfully!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to add note.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteNote = async (id) => {
    try {
      const response = await fetch(`${NOTES_URL}/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete note');
      setNotes((prev) => prev.filter((note) => note.id !== id));
    } catch (err) {
      setError('Failed to delete note.');
    }
  };

  const handleStartEditNote = (note) => {
    setEditingNoteId(note.id);
    setEditNoteTitle(note.title);
    setEditNoteContent(note.content);
  };

  const handleSaveEditNote = async (id) => {
    try {
      const response = await fetch(`${NOTES_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editNoteTitle.trim(), content: editNoteContent.trim() })
      });
      if (!response.ok) throw new Error('Failed to update note');
      const updatedNote = await response.json();
      setNotes((prev) => prev.map((n) => (n.id === id ? updatedNote : n)));
      setEditingNoteId(null);
    } catch (err) {
      setError('Failed to update note.');
    }
  };

  // ----------------- EMAIL HANDLERS ----------------- //

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!composeTo.trim()) {
      setError('Please provide a recipient (To) email address.');
      return;
    }
    if (!composeSubject.trim()) {
      setError('Please provide an email subject.');
      return;
    }

    setSendingEmail(true);
    try {
      const response = await fetch(`${EMAILS_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: composeFrom.trim(),
          to: composeTo.trim(),
          cc: composeCc.trim(),
          bcc: composeBcc.trim(),
          subject: composeSubject.trim(),
          body: composeBody.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send email');

      setEmails((prev) => [data.email, ...prev]);
      setShowCompose(false);
      setComposeTo('');
      setComposeCc('');
      setComposeBcc('');
      setComposeSubject('');
      setComposeBody('');
      setEmailFolder('sent');

      if (data.deliveryMethod === 'aws-ses') {
        setSuccessMsg(`🚀 Real Email sent via AWS SES to ${composeTo}! (Message ID: ${data.messageId})`);
        setTimeout(() => setSuccessMsg(null), 6000);
      } else if (data.warning) {
        setError(`AWS SES Warning: ${data.warning}. (The email was saved to your database).`);
      } else {
        setSuccessMsg(`Email recorded in database as sent!`);
        setTimeout(() => setSuccessMsg(null), 5000);
      }
    } catch (err) {
      setError(err.message || 'Failed to send email.');
    } finally {
      setSendingEmail(false);
    }
  };

  // Simulate an incoming email received in MySQL database
  const handleSimulateReceive = async () => {
    try {
      const testSenders = [
        'hr@company.com',
        'notifications@github.com',
        'sarah.consulting@gmail.com',
        'aws-billing@amazon.com'
      ];
      const testSubjects = [
        'Interview Confirmation & Cloud Assignment',
        'Repository updates: todonode main branch',
        'Project Milestone Completed',
        'AWS SES Domain & Verification Status'
      ];
      const randomSender = testSenders[Math.floor(Math.random() * testSenders.length)];
      const randomSubject = testSubjects[Math.floor(Math.random() * testSubjects.length)];

      const response = await fetch(`${EMAILS_URL}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: randomSender,
          to: defaultSender || 'me@domain.com',
          cc: 'team@domain.com',
          bcc: '',
          subject: randomSubject,
          body: `Hi,\n\nThis email was successfully received and stored in your database.\nTimestamp: ${new Date().toLocaleString()}.\n\nBest regards,\n${randomSender}`
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to simulate incoming email');

      setEmails((prev) => [data.email, ...prev]);
      setEmailFolder('inbox');
      setSuccessMsg(`New email received from ${randomSender} and saved to database!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err.message || 'Failed to receive email.');
    }
  };

  const handleDeleteEmail = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      const response = await fetch(`${EMAILS_URL}/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete email');
      setEmails((prev) => prev.filter((m) => m.id !== id));
      if (selectedEmail && selectedEmail.id === id) setSelectedEmail(null);
    } catch (err) {
      setError('Failed to delete email.');
    }
  };

  const handleReplyEmail = (mail) => {
    setComposeTo(mail.from_email);
    setComposeSubject(mail.subject.startsWith('Re:') ? mail.subject : `Re: ${mail.subject}`);
    setComposeBody(`\n\n--- On ${mail.createdAt}, ${mail.from_email} wrote: ---\n> ${mail.body.replace(/\n/g, '\n> ')}`);
    setShowCompose(true);
    setSelectedEmail(null);
  };

  // Filtered lists
  const isImageUrl = (url) => url && /\.(jpeg|jpg|gif|png|webp|svg)($|\?)/i.test(url);

  const filteredNotes = notes.filter((n) => {
    const q = searchTerm.toLowerCase();
    return (
      (n.title || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q) ||
      (n.fileName || '').toLowerCase().includes(q)
    );
  });

  const inboxEmails = emails.filter((m) => m.folder === 'inbox');
  const sentEmails = emails.filter((m) => m.folder === 'sent');
  const activeFolderEmails = emailFolder === 'inbox' ? inboxEmails : sentEmails;

  const filteredEmails = activeFolderEmails.filter((m) => {
    const q = emailSearchTerm.toLowerCase();
    return (
      (m.subject || '').toLowerCase().includes(q) ||
      (m.from_email || '').toLowerCase().includes(q) ||
      (m.to_email || '').toLowerCase().includes(q) ||
      (m.body || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="brand">
          <span className="brand-icon">☁️</span>
          <div>
            <h1>Cloud Workspace</h1>
            <span className="brand-sub">React • Node.js • MySQL • S3 • SES</span>
          </div>
        </div>

        {/* System Status & Navigation */}
        <div className="header-right">
          <div className="header-status">
            <span className={`status-badge ${serverOnline ? 'online' : 'offline'}`}>
              <span className="status-dot"></span>
              {serverOnline
                ? `Online • ${dbMode || 'Local'} • ${storageMode === 'AWS S3' ? `☁️ S3` : '💾 Local'} • ${sesActive ? '✉️ SES' : '✉️ Email'}`
                : 'Backend Offline'}
            </span>
          </div>

          {/* Module Switcher Tabs */}
          <nav className="nav-tabs">
            <button
              className={`nav-tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
              onClick={() => setActiveTab('notes')}
            >
              📝 Notes ({notes.length})
            </button>
            <button
              className={`nav-tab-btn ${activeTab === 'emails' ? 'active' : ''}`}
              onClick={() => { setActiveTab('emails'); fetchEmails(); }}
            >
              ✉️ Email Inbox ({inboxEmails.length})
            </button>
          </nav>
        </div>
      </header>

      {/* Notifications */}
      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="btn-dismiss">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="success-banner">
          <span>✅ {successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="btn-dismiss">✕</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODULE 1: NOTES & AWS S3 UPLOADS                                          */}
      {/* ========================================================================= */}
      {activeTab === 'notes' && (
        <main className="main-content">
          <section className="card form-card">
            <h2>Create New Note</h2>
            <form onSubmit={handleAddNote}>
              <div className="form-group">
                <label htmlFor="title">Title</label>
                <input
                  id="title"
                  type="text"
                  placeholder="Note title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label htmlFor="content">Content</label>
                <textarea
                  id="content"
                  rows="3"
                  placeholder="Write your note here..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                ></textarea>
              </div>

              <div className="form-group file-upload-group">
                <label>Attachment (Uploaded to AWS S3)</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />

                {!selectedFile ? (
                  <button
                    type="button"
                    className="btn-upload"
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  >
                    📁 Choose File or Image to Upload to S3
                  </button>
                ) : (
                  <div className="selected-file-card">
                    {filePreview && (
                      <img src={filePreview} alt="Preview" className="preview-thumbnail" />
                    )}
                    <div className="file-info">
                      <span className="file-name">📎 {selectedFile.name}</span>
                      <span className="file-size">{formatBytes(selectedFile.size)}</span>
                    </div>
                    <button type="button" className="btn-remove-file" onClick={handleRemoveFile}>
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setTitle(''); setContent(''); handleRemoveFile(); }}
                  disabled={!title && !content && !selectedFile}
                >
                  Clear
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={(!title.trim() && !content.trim() && !selectedFile) || uploading}
                >
                  {uploading ? (
                    <>
                      <span className="btn-spinner"></span> Uploading...
                    </>
                  ) : (
                    '+ Add Note'
                  )}
                </button>
              </div>
            </form>
          </section>

          <section className="notes-section">
            <div className="notes-header">
              <div className="notes-count">
                <h2>My Notes</h2>
                <span className="count-pill">{notes.length} total</span>
              </div>
              <div className="search-box">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search notes or files..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button className="clear-search" onClick={() => setSearchTerm('')}>✕</button>
                )}
              </div>
            </div>

            {loadingNotes && (
              <div className="empty-state">
                <div className="spinner"></div>
                <p>Loading notes...</p>
              </div>
            )}

            {!loadingNotes && filteredNotes.length > 0 && (
              <div className="notes-grid">
                {filteredNotes.map((note) => (
                  <div key={note.id} className="note-card">
                    {editingNoteId === note.id ? (
                      <div className="edit-mode">
                        <input
                          type="text"
                          className="edit-input"
                          value={editNoteTitle}
                          onChange={(e) => setEditNoteTitle(e.target.value)}
                        />
                        <textarea
                          className="edit-textarea"
                          rows="4"
                          value={editNoteContent}
                          onChange={(e) => setEditNoteContent(e.target.value)}
                        />
                        <div className="edit-actions">
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => setEditingNoteId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={() => handleSaveEditNote(note.id)}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="note-card-header">
                          <h3 className="note-title">{note.title || 'Untitled'}</h3>
                          <div className="card-actions">
                            <button
                              className="icon-btn"
                              title="Edit"
                              onClick={() => handleStartEditNote(note)}
                            >
                              ✏️
                            </button>
                            <button
                              className="icon-btn delete-btn"
                              title="Delete"
                              onClick={() => handleDeleteNote(note.id)}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>

                        {note.fileUrl && isImageUrl(note.fileUrl) && (
                          <div className="note-image-container">
                            <a href={note.fileUrl} target="_blank" rel="noopener noreferrer">
                              <img
                                src={note.fileUrl}
                                alt={note.fileName || 'Attachment'}
                                className="note-image-preview"
                              />
                            </a>
                          </div>
                        )}

                        <p className="note-body">{note.content}</p>

                        {note.fileUrl && (
                          <div className="note-attachment-wrapper">
                            <a
                              href={note.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="attachment-link"
                            >
                              <span className="attachment-icon">📎</span>
                              <span className="attachment-name">
                                {note.fileName || 'View Attached File'}
                              </span>
                              <span className="attachment-arrow">↗</span>
                            </a>
                          </div>
                        )}

                        <div className="note-footer">
                          <span className="note-date">📅 {note.createdAt || 'Just now'}</span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!loadingNotes && notes.length === 0 && (
              <div className="empty-state">
                <span className="empty-icon">📋</span>
                <h3>No notes yet</h3>
                <p>Add your first note above with an optional file upload to AWS S3!</p>
              </div>
            )}
          </section>
        </main>
      )}

      {/* ========================================================================= */}
      {/* MODULE 2: EMAIL & MESSAGE SYSTEM (AWS SES)                                */}
      {/* ========================================================================= */}
      {activeTab === 'emails' && (
        <main className="main-content email-module">
          {/* Email Toolbar */}
          <div className="email-toolbar">
            <div className="folder-buttons">
              <button
                className={`folder-btn ${emailFolder === 'inbox' ? 'active' : ''}`}
                onClick={() => { setEmailFolder('inbox'); setSelectedEmail(null); }}
              >
                📥 Inbox ({inboxEmails.length})
              </button>
              <button
                className={`folder-btn ${emailFolder === 'sent' ? 'active' : ''}`}
                onClick={() => { setEmailFolder('sent'); setSelectedEmail(null); }}
              >
                📤 Sent ({sentEmails.length})
              </button>
            </div>

            <div className="email-actions">
              <button
                className="btn-secondary btn-sm"
                onClick={handleSimulateReceive}
                title="Simulate receiving an incoming email into the database"
              >
                📥 Simulate Inbound Mail
              </button>
              <button
                className="btn-primary"
                onClick={() => { setShowCompose(true); setSelectedEmail(null); }}
              >
                ✉️ Compose Email
              </button>
            </div>
          </div>

          {/* Search Bar for Emails */}
          <div className="email-search-container">
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search emails by subject, sender, or content..."
                value={emailSearchTerm}
                onChange={(e) => setEmailSearchTerm(e.target.value)}
              />
              {emailSearchTerm && (
                <button className="clear-search" onClick={() => setEmailSearchTerm('')}>✕</button>
              )}
            </div>
            <button className="btn-secondary btn-sm" onClick={fetchEmails} title="Refresh emails">
              ↻ Refresh
            </button>
          </div>

          {/* Compose Modal */}
          {showCompose && (
            <div className="modal-overlay" onClick={() => setShowCompose(false)}>
              <div className="compose-modal card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>✉️ Compose New Email</h3>
                  <button className="modal-close" onClick={() => setShowCompose(false)}>✕</button>
                </div>

                <form onSubmit={handleSendEmail} className="compose-form">
                  {/* From Field */}
                  <div className="compose-row">
                    <label>From:</label>
                    <input
                      type="text"
                      value={composeFrom}
                      onChange={(e) => setComposeFrom(e.target.value)}
                      placeholder="e.g. your-verified-ses@gmail.com"
                      required
                    />
                  </div>

                  {/* To Field */}
                  <div className="compose-row">
                    <label>To:</label>
                    <input
                      type="text"
                      value={composeTo}
                      onChange={(e) => setComposeTo(e.target.value)}
                      placeholder="e.g. client@gmail.com (comma-separate multiple)"
                      required
                    />
                    <button
                      type="button"
                      className="btn-toggle-cc"
                      onClick={() => setShowCcBcc(!showCcBcc)}
                    >
                      {showCcBcc ? 'Hide Cc/Bcc' : '+ Cc / Bcc'}
                    </button>
                  </div>

                  {/* Cc & Bcc Fields */}
                  {showCcBcc && (
                    <>
                      <div className="compose-row">
                        <label>Cc:</label>
                        <input
                          type="text"
                          value={composeCc}
                          onChange={(e) => setComposeCc(e.target.value)}
                          placeholder="e.g. manager@gmail.com, team@company.com"
                        />
                      </div>
                      <div className="compose-row">
                        <label>Bcc:</label>
                        <input
                          type="text"
                          value={composeBcc}
                          onChange={(e) => setComposeBcc(e.target.value)}
                          placeholder="e.g. archive@company.com"
                        />
                      </div>
                    </>
                  )}

                  {/* Subject Field */}
                  <div className="compose-row">
                    <label>Subject:</label>
                    <input
                      type="text"
                      value={composeSubject}
                      onChange={(e) => setComposeSubject(e.target.value)}
                      placeholder="Email subject line..."
                      required
                    />
                  </div>

                  {/* Message Body Field */}
                  <div className="compose-body-row">
                    <textarea
                      rows="8"
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      placeholder="Write your email message here..."
                      required
                    ></textarea>
                  </div>

                  <div className="compose-footer">
                    <span className="ses-indicator">
                      {sesActive ? '☁️ Dispatched via AWS SES' : '💾 Stored in Database (SES Simulated)'}
                    </span>
                    <div className="compose-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setShowCompose(false)}
                        disabled={sendingEmail}
                      >
                        Discard
                      </button>
                      <button type="submit" className="btn-primary" disabled={sendingEmail}>
                        {sendingEmail ? (
                          <>
                            <span className="btn-spinner"></span> Sending...
                          </>
                        ) : (
                          '🚀 Send Email'
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Email View Layout (Split View: List & Detail) */}
          <div className="email-layout">
            {/* Left: Email List */}
            <div className="email-list-column">
              {loadingEmails && (
                <div className="empty-state">
                  <div className="spinner"></div>
                  <p>Loading emails from database...</p>
                </div>
              )}

              {!loadingEmails && filteredEmails.length === 0 && (
                <div className="empty-state">
                  <span className="empty-icon">📭</span>
                  <h3>No emails in {emailFolder}</h3>
                  <p>
                    {emailFolder === 'inbox'
                      ? 'Click "Simulate Inbound Mail" above or receive messages via AWS SES.'
                      : 'Send an email using the "Compose Email" button.'}
                  </p>
                </div>
              )}

              {!loadingEmails &&
                filteredEmails.map((mail) => (
                  <div
                    key={mail.id}
                    className={`email-item-card ${selectedEmail && selectedEmail.id === mail.id ? 'active' : ''}`}
                    onClick={() => setSelectedEmail(mail)}
                  >
                    <div className="email-item-header">
                      <span className="email-party">
                        {emailFolder === 'inbox' ? `From: ${mail.from_email}` : `To: ${mail.to_email}`}
                      </span>
                      <span className="email-date">{mail.createdAt}</span>
                    </div>
                    <div className="email-item-subject">{mail.subject}</div>
                    <div className="email-item-snippet">
                      {mail.body ? mail.body.substring(0, 90) + '...' : '(No content)'}
                    </div>
                    <div className="email-item-footer">
                      <span className={`status-pill ${mail.folder}`}>
                        {mail.folder === 'inbox' ? 'Received' : mail.status}
                      </span>
                      <button
                        className="icon-btn delete-btn"
                        onClick={(e) => handleDeleteEmail(mail.id, e)}
                        title="Delete email"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            {/* Right: Email Detail View */}
            <div className="email-detail-column">
              {selectedEmail ? (
                <div className="card email-detail-card">
                  <div className="detail-header">
                    <h2>{selectedEmail.subject}</h2>
                    <div className="detail-actions">
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => handleReplyEmail(selectedEmail)}
                      >
                        ↩ Reply
                      </button>
                      <button
                        className="btn-secondary btn-sm delete-btn"
                        onClick={() => handleDeleteEmail(selectedEmail.id)}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>

                  <div className="email-metadata-box">
                    <div className="meta-row">
                      <strong>From:</strong> <span>{selectedEmail.from_email}</span>
                    </div>
                    <div className="meta-row">
                      <strong>To:</strong> <span>{selectedEmail.to_email}</span>
                    </div>
                    {selectedEmail.cc && (
                      <div className="meta-row">
                        <strong>Cc:</strong> <span>{selectedEmail.cc}</span>
                      </div>
                    )}
                    {selectedEmail.bcc && (
                      <div className="meta-row">
                        <strong>Bcc:</strong> <span>{selectedEmail.bcc}</span>
                      </div>
                    )}
                    <div className="meta-row">
                      <strong>Date:</strong> <span>{selectedEmail.createdAt}</span>
                    </div>
                    <div className="meta-row">
                      <strong>Status:</strong>{' '}
                      <span className={`status-pill ${selectedEmail.folder}`}>
                        {selectedEmail.status || 'Delivered'}
                      </span>
                    </div>
                  </div>

                  <div className="email-body-content">
                    {selectedEmail.body}
                  </div>
                </div>
              ) : (
                <div className="empty-detail-placeholder card">
                  <span className="placeholder-icon">📨</span>
                  <h3>Select an email to view full content</h3>
                  <p>Click on any message in the list to read the full conversation, To, Cc, Bcc, and metadata.</p>
                </div>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
