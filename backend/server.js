require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'notesdb',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000 // 5 seconds timeout
};

let dbPool = null;
let isDbConnected = false;

// In-memory fallback if DB is not yet running/configured
let inMemoryNotes = [
  {
    id: 1,
    title: 'Welcome to Notes App',
    content: 'This application is running with React, Node.js, and SQL database support.',
    createdAt: new Date().toLocaleString()
  },
  {
    id: 2,
    title: '3-Tier Architecture on AWS',
    content: 'Tier 1: Frontend EC2 (React + Nginx)\nTier 2: Backend EC2 (Node.js + Express)\nTier 3: Database EC2 (MySQL Server)',
    createdAt: new Date().toLocaleString()
  }
];

// Initialize MySQL Database & Table
async function initDB() {
  try {
    // 1. Connect without database first to ensure database exists
    const rootConnection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port,
      connectTimeout: 5000
    });

    await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
    await rootConnection.end();

    // 2. Create pool connected to database
    dbPool = mysql.createPool(dbConfig);
    const connection = await dbPool.getConnection();

    // 3. Create notes table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    // 4. Seed sample data if table is empty
    const [rows] = await connection.query('SELECT COUNT(*) as count FROM notes');
    if (rows[0].count === 0) {
      await connection.query(`
        INSERT INTO notes (title, content) VALUES
        ('Welcome to Notes App (SQL Database)', 'Notes are now saved in MySQL database on Tier 3.'),
        ('3-Tier Architecture on AWS', 'Tier 1: Frontend (React)\nTier 2: Backend (Node.js)\nTier 3: Database (MySQL)');
      `);
    }

    connection.release();
    isDbConnected = true;
    console.log(`✅ [Database] Connected successfully to MySQL at ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  } catch (err) {
    isDbConnected = false;
    console.warn(`⚠️ [Database Warning] Could not connect to MySQL (${err.message}). Using in-memory store as fallback.`);
  }
}

// Start database initialization
initDB();

// ----------------- ROUTES ----------------- //

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: isDbConnected ? 'sql-database' : 'in-memory-fallback',
    dbHost: dbConfig.host,
    dbConnected: isDbConnected
  });
});

// GET all notes
app.get('/api/notes', async (req, res) => {
  if (isDbConnected && dbPool) {
    try {
      const [rows] = await dbPool.query(`
        SELECT id, title, content,
               DATE_FORMAT(createdAt, '%d/%m/%Y, %h:%i:%s %p') AS createdAt,
               DATE_FORMAT(updatedAt, '%d/%m/%Y, %h:%i:%s %p') AS updatedAt
        FROM notes
        ORDER BY id DESC;
      `);
      return res.json(rows);
    } catch (err) {
      console.error('Database query error:', err);
      return res.status(500).json({ error: 'Database read failed' });
    }
  }

  // Fallback
  res.json(inMemoryNotes);
});

// POST create a new note
app.post('/api/notes', async (req, res) => {
  const { title, content } = req.body || {};

  if (!title && !content) {
    return res.status(400).json({ error: 'Title or content is required' });
  }

  const noteTitle = title ? title.trim() : 'Untitled Note';
  const noteContent = content ? content.trim() : '';

  if (isDbConnected && dbPool) {
    try {
      const [result] = await dbPool.query(
        'INSERT INTO notes (title, content) VALUES (?, ?)',
        [noteTitle, noteContent]
      );
      const [newRow] = await dbPool.query(`
        SELECT id, title, content,
               DATE_FORMAT(createdAt, '%d/%m/%Y, %h:%i:%s %p') AS createdAt
        FROM notes WHERE id = ?
      `, [result.insertId]);

      return res.status(201).json(newRow[0]);
    } catch (err) {
      console.error('Database insert error:', err);
      return res.status(500).json({ error: 'Database insert failed' });
    }
  }

  // Fallback
  const newNote = {
    id: Date.now(),
    title: noteTitle,
    content: noteContent,
    createdAt: new Date().toLocaleString()
  };
  inMemoryNotes.unshift(newNote);
  res.status(201).json(newNote);
});

// PUT update an existing note
app.put('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body || {};

  if (isDbConnected && dbPool) {
    try {
      const [existing] = await dbPool.query('SELECT * FROM notes WHERE id = ?', [id]);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Note not found' });
      }

      const updatedTitle = title !== undefined ? title.trim() : existing[0].title;
      const updatedContent = content !== undefined ? content.trim() : existing[0].content;

      await dbPool.query(
        'UPDATE notes SET title = ?, content = ? WHERE id = ?',
        [updatedTitle, updatedContent, id]
      );

      const [updatedRow] = await dbPool.query(`
        SELECT id, title, content,
               DATE_FORMAT(createdAt, '%d/%m/%Y, %h:%i:%s %p') AS createdAt,
               DATE_FORMAT(updatedAt, '%d/%m/%Y, %h:%i:%s %p') AS updatedAt
        FROM notes WHERE id = ?
      `, [id]);

      return res.json(updatedRow[0]);
    } catch (err) {
      console.error('Database update error:', err);
      return res.status(500).json({ error: 'Database update failed' });
    }
  }

  // Fallback
  const noteIndex = inMemoryNotes.findIndex(n => String(n.id) === String(id));
  if (noteIndex === -1) {
    return res.status(404).json({ error: 'Note not found' });
  }
  inMemoryNotes[noteIndex] = {
    ...inMemoryNotes[noteIndex],
    title: title !== undefined ? title.trim() : inMemoryNotes[noteIndex].title,
    content: content !== undefined ? content.trim() : inMemoryNotes[noteIndex].content,
    updatedAt: new Date().toLocaleString()
  };
  res.json(inMemoryNotes[noteIndex]);
});

// DELETE a note by id
app.delete('/api/notes/:id', async (req, res) => {
  const { id } = req.params;

  if (isDbConnected && dbPool) {
    try {
      const [result] = await dbPool.query('DELETE FROM notes WHERE id = ?', [id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Note not found' });
      }
      return res.json({ message: 'Note deleted successfully', id });
    } catch (err) {
      console.error('Database delete error:', err);
      return res.status(500).json({ error: 'Database delete failed' });
    }
  }

  // Fallback
  const initialLength = inMemoryNotes.length;
  inMemoryNotes = inMemoryNotes.filter(n => String(n.id) !== String(id));
  if (inMemoryNotes.length === initialLength) {
    return res.status(404).json({ error: 'Note not found' });
  }
  res.json({ message: 'Note deleted successfully', id });
});

// Optional: Serve frontend static build files if present
const frontendDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDistPath));

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend server running at http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
