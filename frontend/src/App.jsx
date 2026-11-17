import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '/api/notes';

export default function App() {
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(false);
  const [dbMode, setDbMode] = useState('');
  const [error, setError] = useState(null);

  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  // Fetch all notes from Node.js backend
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

      // Check DB mode from health check
      try {
        const healthUrl = API_URL.replace(/\/notes\/?$/, '/health');
        const healthRes = await fetch(healthUrl);
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          if (healthData.mode === 'sql-database') {
            setDbMode('SQL Database');
          } else {
            setDbMode('In-Memory');
          }
        }
      } catch (e) {
        // Ignore health check error if notes succeeded
      }
    } catch (err) {
      console.error('Failed to fetch notes:', err);
      setServerOnline(false);
      setError('Cannot connect to backend server. Make sure the backend server is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  // Handle Note Submission (Create)
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!title.trim() && !content.trim()) return;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create note');
      }

      const newNote = await response.json();
      setNotes((prevNotes) => [newNote, ...prevNotes]);
      setTitle('');
      setContent('');
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to add note. Please verify the backend is running.');
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

  // Filter notes by search keyword
  const filteredNotes = notes.filter((note) => {
    const query = searchTerm.toLowerCase();
    const noteTitle = (note.title || '').toLowerCase();
    const noteContent = (note.content || '').toLowerCase();
    return noteTitle.includes(query) || noteContent.includes(query);
  });

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="brand">
          <span className="brand-icon">📝</span>
          <h1>Simple Notes</h1>
        </div>
        <div className="header-status">
          <span className={`status-badge ${serverOnline ? 'online' : 'offline'}`}>
            <span className="status-dot"></span>
            {serverOnline ? (dbMode ? `Backend Online (${dbMode})` : 'Backend Online') : 'Backend Offline'}
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
                rows="4"
                placeholder="Write your note here..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              ></textarea>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setTitle(''); setContent(''); }}
                disabled={!title && !content}
              >
                Clear
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={!title.trim() && !content.trim()}
              >
                + Add Note
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
                placeholder="Search notes..."
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
              <p>Loading notes from server...</p>
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

                      <p className="note-body">{note.content}</p>

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
              <p>Fill out the form above to add your first note!</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
