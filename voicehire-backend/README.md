# VoiceHire Backend API

Node.js + Express backend for the VoiceHire AI Mock Interview Platform.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | SQLite (via better-sqlite3) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| AI | Google Gemini API (gemini-1.5-flash) |
| Validation | express-validator |
| Rate Limiting | express-rate-limit |

---

## Project Structure

```
voicehire-backend/
├── server.js              ← Entry point
├── package.json
├── .env                   ← Your env variables (create from .env.example)
├── .env.example           ← Template
├── voicehire.db           ← SQLite DB (auto-created on first run)
├── config/
│   └── gemini.js          ← Gemini API helper
├── db/
│   └── database.js        ← DB connection + schema
├── middleware/
│   └── auth.js            ← JWT verification middleware
└── routes/
    ├── auth.js            ← Register / Login / Profile
    ├── interview.js       ← Interview lifecycle
    └── report.js          ← Report generation
```

---

## Setup & Run

### Step 1 — Install Node.js
Make sure you have Node.js v18 or higher:
```bash
node --version
```
Download from: https://nodejs.org

### Step 2 — Install dependencies
```bash
cd voicehire-backend
npm install
```

### Step 3 — Create your .env file
```bash
cp .env.example .env
```

Open `.env` and fill in:
```
PORT=5000
JWT_SECRET=any_long_random_string_here
GEMINI_API_KEY=your_gemini_key_from_aistudio_google_com
```

Get a free Gemini key at: https://aistudio.google.com

### Step 4 — Start the server

**For development (auto-restarts on file change):**
```bash
npm run dev
```

**For production:**
```bash
npm start
```

You should see:
```
╔══════════════════════════════════════╗
║   VoiceHire Backend                  ║
║   Running on http://localhost:5000   ║
╚══════════════════════════════════════╝
```

The SQLite database file `voicehire.db` is created automatically on first run.

---

## API Reference

### Base URL
```
http://localhost:5000/api
```

### Authentication
All protected routes require a JWT token in the header:
```
Authorization: Bearer <your_token>
```

---

### AUTH ROUTES

#### Register
```
POST /api/auth/register
Content-Type: application/json

{
  "name": "Rahul Sharma",
  "email": "rahul@example.com",
  "password": "mypassword123",
  "photo": "data:image/jpeg;base64,..."   ← optional
}

Response:
{
  "success": true,
  "token": "eyJhbGci...",
  "user": { "id": 1, "name": "Rahul Sharma", "email": "...", ... }
}
```

#### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "rahul@example.com",
  "password": "mypassword123"
}

Response:
{
  "success": true,
  "token": "eyJhbGci...",
  "user": { ... }
}
```

#### Get Current User (protected)
```
GET /api/auth/me
Authorization: Bearer <token>
```

---

### INTERVIEW ROUTES (all protected)

#### Start Interview + Generate Questions
```
POST /api/interview/start
Authorization: Bearer <token>

{
  "jobRole": "Software Engineer",
  "experience": "Mid-level (3-6 yrs)",
  "interviewType": "behavioral",
  "topic": "React, Node.js",
  "difficulty": "Medium",
  "numQuestions": 5
}

Response:
{
  "success": true,
  "interviewId": 1,
  "questions": [
    { "id": 1, "question_index": 0, "question_text": "Tell me about yourself..." },
    ...
  ]
}
```

#### Submit Answer + Get Feedback
```
POST /api/interview/1/answer
Authorization: Bearer <token>

{
  "questionId": 1,
  "answerText": "I have been working as a software engineer for 4 years..."
}

Response:
{
  "success": true,
  "answerId": 1,
  "feedback": {
    "score": 78,
    "positive": "Clear and structured response...",
    "improve": "Add more specific metrics...",
    "brief": "Good answer, keep going."
  }
}
```

#### Get Interview History
```
GET /api/interview/history
Authorization: Bearer <token>

Response:
{
  "success": true,
  "total": 5,
  "interviews": [ ... ]
}
```

#### Get Single Interview (with all Q&A)
```
GET /api/interview/1
Authorization: Bearer <token>
```

---

### REPORT ROUTES (all protected)

#### Generate Report
```
POST /api/report/generate/1
Authorization: Bearer <token>

Response:
{
  "success": true,
  "report": {
    "overallScore": 74,
    "grade": "Good",
    "communication": 80,
    "relevance": 72,
    "confidence": 68,
    "structure": 76,
    "depth": 70,
    "strengths": ["..."],
    "improvements": ["..."],
    "recommendation": "..."
  },
  "qaBreakdown": [ ... ]
}
```

#### Get Saved Report
```
GET /api/report/1
Authorization: Bearer <token>
```

#### Get All My Reports
```
GET /api/report/all/me
Authorization: Bearer <token>
```

---

### HEALTH CHECK
```
GET /api/health
→ { "status": "VoiceHire API is running" }
```

---

## Connecting Your Frontend

In your HTML frontend JavaScript, set the base URL:
```js
const API_BASE = 'http://localhost:5000/api';
let TOKEN = ''; // store after login

// Login example
async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.success) {
    TOKEN = data.token;
    localStorage.setItem('voicehire_token', TOKEN);
  }
  return data;
}

// Protected request example
async function startInterview(config) {
  const res = await fetch(`${API_BASE}/interview/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    },
    body: JSON.stringify(config)
  });
  return res.json();
}
```

---

## Test With cURL

```bash
# Health check
curl http://localhost:5000/api/health

# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@test.com","password":"test1234"}'

# Login and grab the token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test1234"}'
```

---

## Common Issues

| Problem | Fix |
|---------|-----|
| `Cannot find module 'better-sqlite3'` | Run `npm install` again |
| `Invalid API key` | Check GEMINI_API_KEY in .env |
| `CORS error` | Add your frontend URL to the CORS list in server.js |
| `Port 5000 in use` | Change PORT in .env to 5001 |
| DB locked error | Restart the server |
