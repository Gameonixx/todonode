require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

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

// Local uploads directory (fallback)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Multer memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// ----------------- AWS SES (EMAIL) CONFIGURATION ----------------- //
const sesRegion = process.env.AWS_REGION || 'us-east-1';
const hasSESConfig = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const defaultFromEmail = process.env.AWS_SES_FROM_EMAIL || 'support@aws-cloud-app.com';

let sesClient = null;
if (hasSESConfig) {
  sesClient = new SESClient({
    region: sesRegion,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
  console.log(`✉️ [Email] AWS SES client active in region: ${sesRegion}`);
} else {
  console.log('✉️ [Email] AWS credentials not set for SES. Using simulated email dispatch fallback.');
}

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

// In-memory fallback stores
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

let inMemoryEmails = [
  {
    id: 1,
    folder: 'inbox',
    from_email: 'notifications@aws.amazon.com',
    to_email: defaultFromEmail,
    cc: 'admin@cloudengg.local',
    bcc: '',
    subject: 'Welcome to AWS SES Email & Message Module',
    body: 'Hello!\n\nYour message module is ready. You can receive incoming emails stored in your SQL database and compose new emails with standard features including To, From, Cc, Bcc, and Subject.\n\nEnjoy testing your full-stack cloud application!',
    status: 'received',
    createdAt: new Date().toLocaleString()
  },
  {
    id: 2,
    folder: 'inbox',
    from_email: 'john.smith@gmail.com',
    to_email: defaultFromEmail,
    cc: 'team@cloudengg.local',
    bcc: '',
    subject: 'Cloud Project Milestone Review',
    body: 'Hi there,\n\nI reviewed your 3-tier architecture with React frontend, Node.js backend, MySQL database, S3 file storage, and SES email integration. Everything is looking solid.\n\nLet me know when the final deployment is ready for presentation.\n\nBest,\nJohn Smith',
    status: 'received',
    createdAt: new Date(Date.now() - 3600000).toLocaleString()
  }
];

// Initialize MySQL Database & Tables
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

    // 1. Notes Table
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

    try { await connection.query('ALTER TABLE notes ADD COLUMN fileUrl VARCHAR(1000)'); } catch(e) {}
    try { await connection.query('ALTER TABLE notes ADD COLUMN fileName VARCHAR(255)'); } catch(e) {}

    const [noteRows] = await connection.query('SELECT COUNT(*) as count FROM notes');
    if (noteRows[0].count === 0) {
      await connection.query(`
        INSERT INTO notes (title, content, fileUrl, fileName) VALUES
        ('Welcome to Notes App (SQL + S3)', 'Notes are saved in MySQL database and files upload to AWS S3.', NULL, NULL),
        ('File Upload Feature', 'Attach any file or image when creating a note.', NULL, NULL);
      `);
    }

    // 2. Emails Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id INT AUTO_INCREMENT PRIMARY KEY,
        folder VARCHAR(50) DEFAULT 'inbox',
        from_email VARCHAR(255) NOT NULL,
        to_email VARCHAR(255) NOT NULL,
        cc VARCHAR(500),
        bcc VARCHAR(500),
        subject VARCHAR(500) NOT NULL,
        body TEXT,
        status VARCHAR(50) DEFAULT 'received',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const [emailRows] = await connection.query('SELECT COUNT(*) as count FROM emails');
    if (emailRows[0].count === 0) {
      for (const m of inMemoryEmails) {
        await connection.query(`
          INSERT INTO emails (folder, from_email, to_email, cc, bcc, subject, body, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [m.folder, m.from_email, m.to_email, m.cc, m.bcc, m.subject, m.body, m.status]);
      }
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
    s3Region: hasS3Config ? s3Region : null,
    sesConfigured: hasSESConfig,
    defaultFromEmail
  });
});

// ----------------- FILE UPLOAD (AWS S3) ----------------- //
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const originalName = req.file.originalname;
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `notes-${Date.now()}-${sanitizedName}`;

    if (hasS3Config && s3Client) {
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

// ----------------- NOTES ROUTES ----------------- //

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

// POST create a note
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

// PUT update a note
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

// DELETE a note
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

  const initialLength = inMemoryNotes.length;
  inMemoryNotes = inMemoryNotes.filter(n => String(n.id) !== String(id));
  if (inMemoryNotes.length === initialLength) {
    return res.status(404).json({ error: 'Note not found' });
  }
  res.json({ message: 'Note deleted successfully', id });
});

// ----------------- EMAIL & MESSAGE MODULE (AWS SES) ----------------- //

// Helper to parse comma-separated emails
const parseEmailList = (str) => {
  if (!str) return [];
  if (Array.isArray(str)) return str;
  return str.split(',').map(s => s.trim()).filter(Boolean);
};

// GET /api/emails - Fetch all emails (stored in MySQL or in-memory)
app.get('/api/emails', async (req, res) => {
  const folder = req.query.folder; // 'inbox', 'sent', or undefined for all

  if (isDbConnected && dbPool) {
    try {
      let query = `
        SELECT id, folder, from_email, to_email, cc, bcc, subject, body, status,
               DATE_FORMAT(createdAt, '%d/%m/%Y, %h:%i:%s %p') AS createdAt
        FROM emails
      `;
      const params = [];

      if (folder) {
        query += ' WHERE folder = ? ';
        params.push(folder);
      }
      query += ' ORDER BY id DESC;';

      const [rows] = await dbPool.query(query, params);
      return res.json(rows);
    } catch (err) {
      console.error('Database email fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch emails from database' });
    }
  }

  // In-memory fallback
  let list = inMemoryEmails;
  if (folder) {
    list = list.filter(e => e.folder === folder);
  }
  res.json(list);
});

// POST /api/emails/send - Send an email via AWS SES and store in database
app.post('/api/emails/send', async (req, res) => {
  const { from, to, cc, bcc, subject, body } = req.body || {};

  if (!to || !to.trim()) {
    return res.status(400).json({ error: 'Recipient email (To) is required' });
  }
  if (!subject || !subject.trim()) {
    return res.status(400).json({ error: 'Subject is required' });
  }

  const fromEmail = from && from.trim() ? from.trim() : defaultFromEmail;
  const toEmail = to.trim();
  const ccEmail = cc ? cc.trim() : '';
  const bccEmail = bcc ? bcc.trim() : '';
  const emailSubject = subject.trim();
  const emailBody = body ? body.trim() : '';

  let dispatchStatus = 'sent';
  let deliveryMethod = 'simulated';
  let sesMessageId = null;
  let sesError = null;

  // Attempt real delivery via AWS SES if credentials exist
  if (hasSESConfig && sesClient) {
    try {
      const toAddresses = parseEmailList(toEmail);
      const ccAddresses = parseEmailList(ccEmail);
      const bccAddresses = parseEmailList(bccEmail);

      const sesParams = {
        Source: fromEmail,
        Destination: {
          ToAddresses: toAddresses,
          CcAddresses: ccAddresses.length > 0 ? ccAddresses : undefined,
          BccAddresses: bccAddresses.length > 0 ? bccAddresses : undefined
        },
        Message: {
          Subject: { Data: emailSubject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: emailBody, Charset: 'UTF-8' },
            Html: {
              Data: `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #222;">
                ${emailBody.replace(/\n/g, '<br/>')}
              </div>`,
              Charset: 'UTF-8'
            }
          }
        }
      };

      const command = new SendEmailCommand(sesParams);
      const sesResponse = await sesClient.send(command);
      sesMessageId = sesResponse.MessageId;
      deliveryMethod = 'aws-ses';
      console.log(`✉️ [AWS SES] Email sent successfully to ${toEmail}. MessageId: ${sesMessageId}`);
    } catch (err) {
      console.warn(`⚠️ [AWS SES Warning] Could not dispatch email via SES (${err.message}). Storing in database as sent-simulated.`);
      sesError = err.message;
      deliveryMethod = 'simulated';
      dispatchStatus = 'sent (simulated)';
    }
  }

  // Store in MySQL database with folder = 'sent'
  if (isDbConnected && dbPool) {
    try {
      const [result] = await dbPool.query(`
        INSERT INTO emails (folder, from_email, to_email, cc, bcc, subject, body, status)
        VALUES ('sent', ?, ?, ?, ?, ?, ?, ?)
      `, [fromEmail, toEmail, ccEmail, bccEmail, emailSubject, emailBody, dispatchStatus]);

      const [newRow] = await dbPool.query(`
        SELECT id, folder, from_email, to_email, cc, bcc, subject, body, status,
               DATE_FORMAT(createdAt, '%d/%m/%Y, %h:%i:%s %p') AS createdAt
        FROM emails WHERE id = ?
      `, [result.insertId]);

      return res.status(201).json({
        success: true,
        email: newRow[0],
        deliveryMethod,
        messageId: sesMessageId,
        warning: sesError
      });
    } catch (err) {
      console.error('Database email insert error:', err);
      return res.status(500).json({ error: 'Failed to record sent email in database' });
    }
  }

  // In-memory fallback
  const newEmail = {
    id: Date.now(),
    folder: 'sent',
    from_email: fromEmail,
    to_email: toEmail,
    cc: ccEmail,
    bcc: bccEmail,
    subject: emailSubject,
    body: emailBody,
    status: dispatchStatus,
    createdAt: new Date().toLocaleString()
  };
  inMemoryEmails.unshift(newEmail);

  res.status(201).json({
    success: true,
    email: newEmail,
    deliveryMethod,
    messageId: sesMessageId,
    warning: sesError
  });
});

// POST /api/emails/receive - Record an incoming/received email in database (Webhook or Simulation)
app.post('/api/emails/receive', async (req, res) => {
  const { from, to, cc, bcc, subject, body } = req.body || {};

  const fromEmail = from && from.trim() ? from.trim() : 'sender@gmail.com';
  const toEmail = to && to.trim() ? to.trim() : defaultFromEmail;
  const ccEmail = cc ? cc.trim() : '';
  const bccEmail = bcc ? bcc.trim() : '';
  const emailSubject = subject && subject.trim() ? subject.trim() : 'New Received Email';
  const emailBody = body ? body.trim() : 'Email body received via AWS incoming message stream.';

  if (isDbConnected && dbPool) {
    try {
      const [result] = await dbPool.query(`
        INSERT INTO emails (folder, from_email, to_email, cc, bcc, subject, body, status)
        VALUES ('inbox', ?, ?, ?, ?, ?, ?, 'received')
      `, [fromEmail, toEmail, ccEmail, bccEmail, emailSubject, emailBody]);

      const [newRow] = await dbPool.query(`
        SELECT id, folder, from_email, to_email, cc, bcc, subject, body, status,
               DATE_FORMAT(createdAt, '%d/%m/%Y, %h:%i:%s %p') AS createdAt
        FROM emails WHERE id = ?
      `, [result.insertId]);

      return res.status(201).json({ success: true, email: newRow[0] });
    } catch (err) {
      console.error('Database receive email error:', err);
      return res.status(500).json({ error: 'Failed to store received email' });
    }
  }

  // In-memory fallback
  const receivedEmail = {
    id: Date.now(),
    folder: 'inbox',
    from_email: fromEmail,
    to_email: toEmail,
    cc: ccEmail,
    bcc: bccEmail,
    subject: emailSubject,
    body: emailBody,
    status: 'received',
    createdAt: new Date().toLocaleString()
  };
  inMemoryEmails.unshift(receivedEmail);

  res.status(201).json({ success: true, email: receivedEmail });
});

// DELETE /api/emails/:id - Delete an email
app.delete('/api/emails/:id', async (req, res) => {
  const { id } = req.params;

  if (isDbConnected && dbPool) {
    try {
      const [result] = await dbPool.query('DELETE FROM emails WHERE id = ?', [id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Email not found' });
      }
      return res.json({ message: 'Email deleted successfully', id });
    } catch (err) {
      console.error('Database email delete error:', err);
      return res.status(500).json({ error: 'Failed to delete email' });
    }
  }

  const initialLength = inMemoryEmails.length;
  inMemoryEmails = inMemoryEmails.filter(e => String(e.id) !== String(id));
  if (inMemoryEmails.length === initialLength) {
    return res.status(404).json({ error: 'Email not found' });
  }
  res.json({ message: 'Email deleted successfully', id });
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
