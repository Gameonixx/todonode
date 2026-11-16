# Simple Notes Application (React + Node.js)

A clean, fast, and simple full-stack note application built with **React** (frontend) and **Node.js / Express** (backend). Notes are stored **in-memory** on the server (no database required).

---

## 📁 Project Structure

```text
temp react app/
├── backend/
│   ├── server.js          # Express server with REST API (CRUD) & static file serving
│   ├── package.json       # Backend dependencies (express, cors)
│   └── node_modules/
├── frontend/
│   ├── index.html         # HTML entry point
│   ├── vite.config.js     # Vite dev config with API proxy
│   ├── package.json       # React & Vite dependencies
│   ├── src/
│   │   ├── App.jsx        # Main React component (CRUD, search, edit, responsive UI)
│   │   ├── App.css        # Clean, modern styles
│   │   └── main.jsx       # React DOM root entry
│   └── dist/              # Production build (served automatically by backend)
└── package.json           # Root convenience scripts
```

---

## 🚀 Quick Start

### 1. Run the Backend (Port 5000)

From the project root:
```bash
npm start
```
*Or navigate to the backend folder:*
```bash
cd backend
node server.js
```
The server will start at: `http://localhost:5000`

> 💡 **Bonus**: The backend automatically serves the built React app! Once the backend is running, you can immediately open `http://localhost:5000` in your browser.

---

### 2. Run the Frontend (Vite Dev Server, Port 3000)

If you want live hot-reloading during development:
```bash
cd frontend
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 📡 REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/notes` | Fetch all notes (sorted newest first) |
| `POST` | `/api/notes` | Create a new note (`{ title, content }`) |
| `PUT` | `/api/notes/:id` | Update an existing note (`{ title, content }`) |
| `DELETE` | `/api/notes/:id` | Delete a note by its ID |
| `GET` | `/api/health` | Health check and current notes count |

---

## ✨ Features Included

- **Full In-Memory CRUD**: Create, read, edit, and delete notes.
- **Search & Filter**: Real-time instant filtering of notes by title or content.
- **Connection Status Badge**: Indicates live backend connectivity.
- **Production Build Included**: Pre-built in `frontend/dist/` so running `node backend/server.js` works instantly.
- **Responsive Design**: Clean, modern card layout that works on desktop and mobile.
