# Cloud Workspace (React + Node.js + SQL + AWS S3 + AWS SES)

A full-stack cloud application featuring:
1. **📝 Notes & Documents**: In-memory or MySQL database persistence.
2. **📁 AWS S3 File Storage**: Direct file and image uploads to an AWS S3 bucket.
3. **✉️ Email & Message System (AWS SES)**:
   - **Inbox**: Stored received emails from MySQL database.
   - **Compose & Send**: Send emails with **To, From, Subject, Cc, and Bcc** via **AWS SES** directly to external mailboxes (such as Gmail).
   - **Reply & Search**: Filter emails in real time and reply directly to incoming messages.

---

## 🚀 Running on Localhost

### 1. Configure Environment Variables
Inside `backend/.env` (see `backend/.env.example`):
```env
PORT=5000

# Database (Leave as localhost or RDS endpoint)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=notesdb
DB_PORT=3306

# AWS Credentials (shared for S3 and SES)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1

# AWS S3 Bucket (for file uploads)
AWS_BUCKET_NAME=your-s3-bucket-name

# AWS SES (for sending emails to Gmail/other providers)
AWS_SES_FROM_EMAIL=your-verified-email@gmail.com
```

> 💡 **Graceful Fallbacks**:
> - If AWS SES is not configured or in sandbox, emails are saved in the database in simulated mode so you can test sending and receiving without AWS credentials.
> - If AWS S3 is not configured, file uploads save to `backend/uploads/`.
> - If MySQL is not running, notes and emails are stored in server memory.

---

### 2. Start the Application
From the project root:
```bash
npm start
```
Open **`http://localhost:5000`** in your browser.

*(For live hot-reloading: run `npm start` in one terminal and `npm run dev` in another).*

---

## ✉️ Setting up AWS SES to Send to Gmail

1. Open the [AWS SES Console](https://console.aws.amazon.com/ses/).
2. In the sidebar, click **Identities** > **Create identity**:
   - Choose **Email address**.
   - Enter your email (e.g. `your-email@gmail.com`).
   - Click **Create identity**.
3. Check your Gmail inbox and click the verification link sent by Amazon Web Services.
4. Put that verified email as `AWS_SES_FROM_EMAIL` in `backend/.env`.

> 📌 **Note on SES Sandbox Mode**:  
> In AWS SES Sandbox mode (default for new accounts), you can send emails to **any verified email address**. To send to arbitrary unverified Gmail addresses, you can verify the recipient email in the SES console or submit a 1-click request to move out of the SES sandbox.

---

## 📡 REST API Endpoints

### 📝 Notes & Files
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/notes` | Get all notes |
| `POST` | `/api/notes` | Create a note (`{ title, content, fileUrl, fileName }`) |
| `POST` | `/api/upload` | Upload file to AWS S3 (or local fallback) |
| `PUT` | `/api/notes/:id` | Update note |
| `DELETE` | `/api/notes/:id` | Delete note |

### ✉️ Email & Messages
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/emails?folder=inbox` | Get all received emails stored in database |
| `GET` | `/api/emails?folder=sent` | Get all sent emails |
| `POST` | `/api/emails/send` | Send email via AWS SES (`{ from, to, cc, bcc, subject, body }`) |
| `POST` | `/api/emails/receive` | Record incoming email in database |
| `DELETE` | `/api/emails/:id` | Delete email from database |
| `GET` | `/api/health` | Health check for DB, S3, and SES |
