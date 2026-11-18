import React, { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '/api/notes';

export default function App() {
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  const [dbMode, setDbMode] = useState('');
  const [storageMode, setStorageMode] = useState('');
  const [bucketName, setBucketName] = useState('');
  const [error, setError] = useState(null);

  // File upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const fileInputRef = useRef(null);

  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  // Fetch all notes & server health from Node.js backend
  const fetchNotes = async () => {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const data = await response.json();
      setNotes(data);
      setServerOnline(true);
      setError(null);

      // Check DB & S3 status from health check
      try {
        const healthUrl = API_URL.replace(/\/notes\/?$/, '/health');
        const healthRes = await fetch(healthUrl);
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setDbMode(healthData.mode === 'sql-database' ? 'SQL Database' : 'In-Memory');
          if (healthData.storage === 's3') {
            setStorageMode('AWS S3');
            setBucketName(healthData.s3Bucket || '');
          } else {
            setStorageMode('Local Storage');
          }
        }
      } catch (e) {
        // Ignore health check error if notes succeeded
      }
    } catch (err) {
      console.error('Failed to fetch notes:', err);
      setServerOnline(false);
      setError('Cannot connect to backend server. Make sure "node server.js" is running on localhost:5000.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  // Handle file selection
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

  // Clear selected file
  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
      setFilePreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Format file size
  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Handle Note Submission (Create + S3 File Upload)
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!title.trim() && !content.trim() && !selectedFile) return;

    setUploading(true);
    let uploadedFileUrl = null;
    let uploadedFileName = null;

    try {
      // 1. Upload file if one is selected
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const uploadUrl = API_URL.replace(/\/notes\/?$/, '/upload');
        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          body: formData
        });

        if (!uploadRes.ok) {
          throw new Error('File upload failed');
        }

        const uploadData = await uploadRes.json();
        uploadedFileUrl = uploadData.fileUrl;
        uploadedFileName = uploadData.fileName;
      }

      // 2. Create Note with attached file details
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          fileUrl: uploadedFileUrl,
          fileName: uploadedFileName
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create note');
      }

      const newNote = await response.json();
      setNotes((prevNotes) => [newNote, ...prevNotes]);

      // Reset form
      setTitle('');
      setContent('');
      handleRemoveFile();
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to add note.');
    } finally {
      setUploading(false);
    }
  };

  // Handle Note Deletion
  const handleDeleteNote = async (id) => {
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete note');
      }

      setNotes((prevNotes) => prevNotes.filter((note) => note.id !== id));
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to delete note.');
    }
  };

  // Start inline editing
  const handleStartEdit = (note) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  // Cancel inline editing
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditContent('');
  };

  // Save edited note
  const handleSaveEdit = async (id) => {
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          content: editContent.trim()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update note');
      }

      const updatedNote = await response.json();
      setNotes((prevNotes) =>
        prevNotes.map((note) => (note.id === id ? updatedNote : note))
      );
      setEditingId(null);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to update note.');
    }
  };

  // Check if URL is an image
  const isImageUrl = (url) => {
    if (!url) return false;
    return /\.(jpeg|jpg|gif|png|webp|svg)($|\?)/i.test(url);
  };

  // Filter notes by search keyword
  const filteredNotes = notes.filter((note) => {
    const query = searchTerm.toLowerCase();
    const noteTitle = (note.title || '').toLowerCase();
    const noteContent = (note.content || '').toLowerCase();
    const noteFile = (note.fileName || '').toLowerCase();
    return noteTitle.includes(query) || noteContent.includes(query) || noteFile.includes(query);
  });

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="brand">
          <span className="brand-icon">📝</span>
          <div>
            <h1>Simple Notes</h1>
            <span className="brand-sub">Localhost + AWS S3 Storage</span>
          </div>
        </div>
        <div className="header-status">
          <span className={`status-badge ${serverOnline ? 'online' : 'offline'}`}>
            <span className="status-dot"></span>
            {serverOnline
              ? `Backend Online • ${dbMode || 'Local'} • ${storageMode === 'AWS S3' ? `☁️ S3 (${bucketName})` : '💾 Local Storage'}`
              : 'Backend Offline'}
          </span>
          <button className="btn-secondary btn-sm" onClick={fetchNotes} title="Refresh notes">
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="btn-dismiss">✕</button>
        </div>
      )}

      {/* Main Grid */}
      <main className="main-content">
        {/* Create Note Section */}
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

            {/* File Upload Section */}
            <div className="form-group file-upload-group">
              <label>Attachment (Upload to AWS S3)</label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="file-input"
              />

              {!selectedFile ? (
                <button
                  type="button"
                  className="btn-upload"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  📁 Choose File or Image to Upload
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
                  <button
                    type="button"
                    className="btn-remove-file"
                    onClick={handleRemoveFile}
                    title="Remove attachment"
                  >
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

        {/* Notes Listing Section */}
        <section className="notes-section">
          <div className="notes-header">
            <div className="notes-count">
              <h2>My Notes</h2>
              <span className="count-pill">{notes.length} total</span>
            </div>

            {/* Search Input */}
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search notes or files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="clear-search" onClick={() => setSearchTerm('')}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Loading Indicator */}
          {loading && (
            <div className="empty-state">
              <div className="spinner"></div>
              <p>Loading notes...</p>
            </div>
          )}

          {/* Notes Grid */}
          {!loading && filteredNotes.length > 0 && (
            <div className="notes-grid">
              {filteredNotes.map((note) => (
                <div key={note.id} className="note-card">
                  {editingId === note.id ? (
                    /* Inline Editing Mode */
                    <div className="edit-mode">
                      <input
                        type="text"
                        className="edit-input"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Note title"
                      />
                      <textarea
                        className="edit-textarea"
                        rows="4"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        placeholder="Note content"
                      />
                      <div className="edit-actions">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={handleCancelEdit}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() => handleSaveEdit(note.id)}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Normal View Mode */
                    <>
                      <div className="note-card-header">
                        <h3 className="note-title">{note.title || 'Untitled'}</h3>
                        <div className="card-actions">
                          <button
                            className="icon-btn edit-btn"
                            title="Edit Note"
                            onClick={() => handleStartEdit(note)}
                          >
                            ✏️
                          </button>
                          <button
                            className="icon-btn delete-btn"
                            title="Delete Note"
                            onClick={() => handleDeleteNote(note.id)}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {/* Image Preview if note has an image file */}
                      {note.fileUrl && isImageUrl(note.fileUrl) && (
                        <div className="note-image-container">
                          <a href={note.fileUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={note.fileUrl}
                              alt={note.fileName || 'Attachment'}
                              className="note-image-preview"
                              loading="lazy"
                            />
                          </a>
                        </div>
                      )}

                      <p className="note-body">{note.content}</p>

                      {/* File Download / View Link */}
                      {note.fileUrl && (
                        <div className="note-attachment-wrapper">
                          <a
                            href={note.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="attachment-link"
                            title="Open or download attached file"
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
                        <span className="note-date">
                          📅 {note.createdAt || 'Just now'}
                          {note.updatedAt && ' (edited)'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Empty state when no notes match search */}
          {!loading && notes.length > 0 && filteredNotes.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">🔎</span>
              <h3>No matching notes found</h3>
              <p>Try searching for a different keyword or clear the search filter.</p>
            </div>
          )}

          {/* Empty state when notes array is empty */}
          {!loading && notes.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">📋</span>
              <h3>No notes yet</h3>
              <p>Fill out the form above to add your first note with optional S3 file upload!</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
