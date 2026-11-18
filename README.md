# Simple Notes Application (React + Node.js + SQL + AWS S3)

A full-stack note application built with **React** (frontend), **Node.js / Express** (backend), **MySQL / In-Memory** (database), and **AWS S3** (cloud file storage).

---

## 🚀 Running on Localhost

### 1. Configure Environment Variables (Optional for S3 & MySQL)
In `backend/`, copy the example file to `.env`:
```bash
cp backend/.env.example backend/.env
```
Inside `backend/.env`:
```env
PORT=5000

# Database (Leave as localhost; if MySQL is not running, it gracefully falls back to in-memory)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=notesdb
DB_PORT=3306

# AWS S3 Configuration (for cloud file uploads)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your-bucket-name
```
> 💡 **Graceful Fallback**: If AWS S3 credentials are not configured, files upload to the local `backend/uploads/` folder automatically. If MySQL is not running, notes persist in memory.

---

### 2. Start the Backend (Port 5000)
```bash
cd backend
npm install
node server.js
```
The backend will run at: `http://localhost:5000`

---

### 3. Start the Frontend (Port 3000)
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:3000`** in your browser.

> 💡 **Production Build**: You can also just open `http://localhost:5000` directly after starting the backend, as the backend automatically serves the compiled React app!

---

## ☁️ AWS S3 Setup Guide

To store uploads in AWS S3:
1. Create an S3 Bucket in the AWS Console (e.g., `my-notes-bucket`).
2. Uncheck **Block all public access** if you want uploaded files/images to be viewable directly via URL, or configure a bucket policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::your-bucket-name/*"
       }
     ]
   }
   ```
3. Set your bucket's **CORS configuration**:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
       "AllowedOrigins": ["*"],
       "ExposeHeaders": []
     }
   ]
   ```
4. Put your AWS Access Key, Secret Key, Region, and Bucket Name into `backend/.env`.

---

## 📡 REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/notes` | Fetch all notes (sorted newest first) |
| `POST` | `/api/notes` | Create a note (`{ title, content, fileUrl, fileName }`) |
| `POST` | `/api/upload` | Upload file/image to AWS S3 (or local fallback) |
| `PUT` | `/api/notes/:id` | Update note title, content, or attachment |
| `DELETE` | `/api/notes/:id` | Delete a note by ID |
| `GET` | `/api/health` | Health check (reports DB and S3 status) |

---

## ✨ Features
- **Localhost Readiness**: Runs with 1 command locally without complex server setups.
- **AWS S3 File Upload**: Direct integration with AWS S3 SDK v3 for images and documents.
- **Image Previews & Attachments**: Automatically renders thumbnail previews for images and clickable download badges for files.
- **Dual Fallbacks**: Graceful fallback to local storage if S3 keys are absent, and fallback to in-memory store if MySQL is not running.
