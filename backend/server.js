require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// ----------------- AWS S3 CONFIGURATION ----------------- //
const s3Bucket = process.env.AWS_BUCKET_NAME;
const s3Region = process.env.AWS_REGION || 'us-east-1';
const hasS3Config = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && s3Bucket);

let s3Client = null;
if (hasS3Config) {
  s3Client = new S3Client({
    region: s3Region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
  console.log(`📦 [Storage] AWS S3 connected for bucket: ${s3Bucket} (${s3Region})`);
} else {
  console.log('📁 [Storage] AWS S3 credentials not set in .env. Using local storage fallback for uploads.');
}

// Local uploads directory (fallback if S3 credentials not yet provided)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Multer memory storage (allows buffering to S3 or local disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max file size
});

// ----------------- DATABASE CONFIGURATION ----------------- //
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'notesdb',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000
};

let dbPool = null;
let isDbConnected = false;

// In-memory fallback if DB is not yet running
let inMemoryNotes = [
  {
    id: 1,
    title: 'Welcome to Notes App',
    content: 'Running locally on your machine with React, Node.js, and AWS S3 upload support!',
    fileUrl: null,
    fileName: null,
    createdAt: new Date().toLocaleString()
  },
  {
    id: 2,
    title: 'File Uploads with S3',
    content: 'Use the file upload button below to attach images or documents. Files will be stored in your AWS S3 bucket!',
    fileUrl: null,
    fileName: null,
    createdAt: new Date().toLocaleString()
  }
];

// Initialize MySQL Database & Table
async function initDB() {
  try {
    const rootConnection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port,
      connectTimeout: 5000
    });

    await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
    await rootConnection.end();

    dbPool = mysql.createPool(dbConfig);
    const connection = await dbPool.getConnection();

    await connection.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        fileUrl VARCHAR(1000),
        fileName VARCHAR(255),
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    // Ensure columns exist if table was created in an older version
    try { await connection.query('ALTER TABLE notes ADD COLUMN fileUrl VARCHAR(1000)'); } catch(e) {}
    try { await connection.query('ALTER TABLE notes ADD COLUMN fileName VARCHAR(255)'); } catch(e) {}

    const [rows] = await connection.query('SELECT COUNT(*) as count FROM notes');
    if (rows[0].count === 0) {
      await connection.query(`
        INSERT INTO notes (title, content, fileUrl, fileName) VALUES
        ('Welcome to Notes App (SQL + S3)', 'Notes are saved in MySQL database and files upload to AWS S3.', NULL, NULL),
        ('File Upload Feature', 'Attach any file or image when creating a note.', NULL, NULL);
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

initDB();

// ----------------- ROUTES ----------------- //

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: isDbConnected ? 'sql-database' : 'in-memory-fallback',
    dbHost: dbConfig.host,
    dbConnected: isDbConnected,
    storage: hasS3Config ? 's3' : 'local',
    s3Bucket: hasS3Config ? s3Bucket : null,
    s3Region: hasS3Config ? s3Region : null
  });
});

// POST /api/upload - Upload file to AWS S3 (or local fallback)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const originalName = req.file.originalname;
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `notes-${Date.now()}-${sanitizedName}`;

    if (hasS3Config && s3Client) {
      // Upload directly to AWS S3
      const command = new PutObjectCommand({
        Bucket: s3Bucket,
        Key: fileKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      });

      await s3Client.send(command);
      const fileUrl = `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${fileKey}`;
      console.log(`☁️ [S3 Upload] Successfully uploaded to S3: ${fileUrl}`);

      return res.status(200).json({
        success: true,
        fileUrl,
        fileName: originalName,
        storage: 's3',
        bucket: s3Bucket
      });
    } else {
      // Local storage fallback
      const localFilePath = path.join(uploadsDir, fileKey);
      fs.writeFileSync(localFilePath, req.file.buffer);

      const host = req.get('host') || `localhost:${PORT}`;
      const protocol = req.protocol || 'http';
      const fileUrl = `${protocol}://${host}/uploads/${fileKey}`;
      console.log(`💾 [Local Upload] Saved to local storage: ${fileUrl}`);

      return res.status(200).json({
        success: true,
        fileUrl,
        fileName: originalName,
        storage: 'local'
      });
    }
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ error: `File upload failed: ${err.message}` });
  }
});

// GET all notes
app.get('/api/notes', async (req, res) => {
  if (isDbConnected && dbPool) {
    try {
      const [rows] = await dbPool.query(`
        SELECT id, title, content, fileUrl, fileName,
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

  res.json(inMemoryNotes);
});

// POST create a new note
app.post('/api/notes', async (req, res) => {
  const { title, content, fileUrl, fileName } = req.body || {};

  if (!title && !content && !fileUrl) {
    return res.status(400).json({ error: 'Title, content, or attached file is required' });
  }

  const noteTitle = title ? title.trim() : (fileName || 'Untitled Note');
  const noteContent = content ? content.trim() : '';
  const noteFileUrl = fileUrl || null;
  const noteFileName = fileName || null;

  if (isDbConnected && dbPool) {
    try {
      const [result] = await dbPool.query(
        'INSERT INTO notes (title, content, fileUrl, fileName) VALUES (?, ?, ?, ?)',
        [noteTitle, noteContent, noteFileUrl, noteFileName]
      );
      const [newRow] = await dbPool.query(`
        SELECT id, title, content, fileUrl, fileName,
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
    fileUrl: noteFileUrl,
    fileName: noteFileName,
    createdAt: new Date().toLocaleString()
  };
  inMemoryNotes.unshift(newNote);
  res.status(201).json(newNote);
});

// PUT update an existing note
app.put('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content, fileUrl, fileName } = req.body || {};

  if (isDbConnected && dbPool) {
    try {
      const [existing] = await dbPool.query('SELECT * FROM notes WHERE id = ?', [id]);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Note not found' });
      }

      const updatedTitle = title !== undefined ? title.trim() : existing[0].title;
      const updatedContent = content !== undefined ? content.trim() : existing[0].content;
      const updatedFileUrl = fileUrl !== undefined ? fileUrl : existing[0].fileUrl;
      const updatedFileName = fileName !== undefined ? fileName : existing[0].fileName;

      await dbPool.query(
        'UPDATE notes SET title = ?, content = ?, fileUrl = ?, fileName = ? WHERE id = ?',
        [updatedTitle, updatedContent, updatedFileUrl, updatedFileName, id]
      );

      const [updatedRow] = await dbPool.query(`
        SELECT id, title, content, fileUrl, fileName,
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
    fileUrl: fileUrl !== undefined ? fileUrl : inMemoryNotes[noteIndex].fileUrl,
    fileName: fileName !== undefined ? fileName : inMemoryNotes[noteIndex].fileName,
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
    console.log(`Backend server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
