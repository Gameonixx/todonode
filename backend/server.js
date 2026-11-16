const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory data store (no database)
let notes = [
  {
    id: '1',
    title: 'Welcome to Notes App',
    content: 'This is a simple note application built with React and Node.js. It stores notes in memory with no database required.',
    createdAt: new Date().toLocaleString()
  },
  {
    id: '2',
    title: 'How to use',
    content: '1. Type a title and content to create a note.\n2. Use the search bar to filter notes.\n3. Click delete to remove a note.',
    createdAt: new Date().toLocaleString()
  }
];

// Routes

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', count: notes.length });
});

// GET all notes
app.get('/api/notes', (req, res) => {
  res.json(notes);
});

// POST create a new note
app.post('/api/notes', (req, res) => {
  const { title, content } = req.body || {};

  if (!title && !content) {
    return res.status(400).json({ error: 'Title or content is required' });
  }

  const newNote = {
    id: Date.now().toString(),
    title: title ? title.trim() : 'Untitled Note',
    content: content ? content.trim() : '',
    createdAt: new Date().toLocaleString()
  };

  notes.unshift(newNote); // Prepend so latest notes show first
  res.status(201).json(newNote);
});

// PUT update an existing note
app.put('/api/notes/:id', (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body || {};

  const noteIndex = notes.findIndex(n => n.id === id);
  if (noteIndex === -1) {
    return res.status(404).json({ error: 'Note not found' });
  }

  notes[noteIndex] = {
    ...notes[noteIndex],
    title: title !== undefined ? title.trim() : notes[noteIndex].title,
    content: content !== undefined ? content.trim() : notes[noteIndex].content,
    updatedAt: new Date().toLocaleString()
  };

  res.json(notes[noteIndex]);
});

// DELETE a note by id
app.delete('/api/notes/:id', (req, res) => {
  const { id } = req.params;
  const initialLength = notes.length;
  notes = notes.filter(n => n.id !== id);

  if (notes.length === initialLength) {
    return res.status(404).json({ error: 'Note not found' });
  }

  res.json({ message: 'Note deleted successfully', id });
});

// Optional: Serve frontend build files if they exist
const frontendDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDistPath));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend server running at http://localhost:${PORT}`);
  });
}

module.exports = app;

