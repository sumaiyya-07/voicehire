// routes/interview.js
// Handles all interview lifecycle endpoints (all protected by JWT)
//
// POST   /api/interview/start              → create interview + generate questions
// POST   /api/interview/:id/answer         → submit answer + get AI feedback
// PATCH  /api/interview/:id/complete       → mark interview as completed
// GET    /api/interview/history            → get all interviews for logged-in user
// GET    /api/interview/:id                → get single interview with all Q&A
// DELETE /api/interview/:id               → delete an interview

const express = require('express');
const { getDB } = require('../db/database');
const authMiddleware = require('../middleware/auth');
const { callGemini, parseGeminiJSON } = require('../config/gemini');
const { generateLocalQuestions, evaluateAnswerLocally } = require('../config/fallback');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// ─────────────────────────────────────────
//  POST /api/interview/start
//  Creates interview record + generates questions via Gemini
// ─────────────────────────────────────────
router.post('/start', async (req, res) => {
  const { jobRole, experience, interviewType, topic, difficulty, numQuestions } = req.body;

  // Validate required fields
  if (!jobRole || !interviewType || !difficulty || !numQuestions) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: jobRole, interviewType, difficulty, numQuestions'
    });
  }

  const db = getDB();

  try {
    // 1. Generate questions — try Gemini first, fallback to local
    let questions;

    try {
      const topicLine = topic ? `Focus specifically on: ${topic}.` : '';
      const expLine = experience ? `Candidate experience level: ${experience}.` : '';

      const prompt = `You are Morgan Reid, a senior hiring manager. Generate exactly ${numQuestions} ${interviewType} interview questions for a ${difficulty}-level ${jobRole} candidate.
${expLine}
${topicLine}
Make questions sound natural and conversational, as a real interviewer would speak them. Be specific and progressively challenging.
Return ONLY a valid JSON array of strings. No explanation. No markdown.
Example: ["Tell me about yourself.", "Describe a recent challenge you overcame."]`;

      const raw = await callGemini(prompt, 0.8);
      questions = parseGeminiJSON(raw);
      if (!Array.isArray(questions)) throw new Error('Not an array');
      questions = questions.slice(0, numQuestions);
      console.log('✅ Questions generated via Gemini AI');
    } catch (geminiErr) {
      console.log('⚠️ Gemini unavailable, using built-in questions:', geminiErr.message);
      questions = generateLocalQuestions({ jobRole, interviewType, difficulty, numQuestions, topic });
    }

    // 2. Save interview to database
    const interviewResult = db.prepare(`
      INSERT INTO interviews (user_id, job_role, experience, interview_type, topic, difficulty, num_questions)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, jobRole, experience || null, interviewType, topic || null, difficulty, questions.length);

    const interviewId = interviewResult.lastInsertRowid;

    // 3. Save all questions
    const insertQuestion = db.prepare(`
      INSERT INTO questions (interview_id, question_index, question_text)
      VALUES (?, ?, ?)
    `);

    const insertMany = db.transaction((qs) => {
      qs.forEach((q, i) => insertQuestion.run(interviewId, i, q));
    });

    insertMany(questions);

    // 4. Fetch saved questions with IDs
    const savedQuestions = db.prepare(`
      SELECT id, question_index, question_text FROM questions
      WHERE interview_id = ? ORDER BY question_index ASC
    `).all(interviewId);

    res.status(201).json({
      success: true,
      message: 'Interview started successfully',
      interviewId,
      questions: savedQuestions
    });

  } catch (err) {
    console.error('Start interview error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to start interview. Check your Gemini API key.'
    });
  }
});

// ─────────────────────────────────────────
//  POST /api/interview/:id/answer
//  Saves an answer + evaluates it with Gemini
// ─────────────────────────────────────────
router.post('/:id/answer', async (req, res) => {
  const { questionId, answerText } = req.body;
  const interviewId = req.params.id;

  if (!questionId || !answerText || answerText.trim().length < 5) {
    return res.status(400).json({ success: false, message: 'questionId and answerText (min 5 chars) are required.' });
  }

  const db = getDB();

  // Verify interview belongs to this user
  const interview = db.prepare('SELECT * FROM interviews WHERE id = ? AND user_id = ?').get(interviewId, req.user.id);
  if (!interview) {
    return res.status(404).json({ success: false, message: 'Interview not found.' });
  }

  // Get the question
  const question = db.prepare('SELECT * FROM questions WHERE id = ? AND interview_id = ?').get(questionId, interviewId);
  if (!question) {
    return res.status(404).json({ success: false, message: 'Question not found.' });
  }

  try {
    // Evaluate answer with Gemini
    const prompt = `You are evaluating a candidate's answer in a ${interview.difficulty} ${interview.interview_type} interview for a ${interview.job_role} role.

Question: "${question.question_text}"
Candidate's answer: "${answerText}"

Return ONLY a valid JSON object. No markdown. No explanation:
{
  "score": <integer 0 to 100>,
  "positive": "<one specific strength of this answer in 1-2 sentences>",
  "improve": "<one specific actionable improvement in 1-2 sentences>",
  "brief": "<one sentence overall verdict, spoken aloud to the candidate>"
}`;

    let feedback;
    try {
      const raw = await callGemini(prompt, 0.5);
      feedback = parseGeminiJSON(raw);
      console.log('✅ Answer evaluated via Gemini AI');
    } catch (e) {
      // Smart local fallback evaluator
      console.log('⚠️ Gemini unavailable, using local evaluator');
      feedback = evaluateAnswerLocally(question.question_text, answerText, interview.difficulty);
    }

    // Save answer to database
    const result = db.prepare(`
      INSERT INTO answers (interview_id, question_id, answer_text, score, positive, improve, brief)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(interviewId, questionId, answerText, feedback.score, feedback.positive, feedback.improve, feedback.brief);

    res.json({
      success: true,
      answerId: result.lastInsertRowid,
      feedback
    });

  } catch (err) {
    console.error('Answer submission error:', err);
    res.status(500).json({ success: false, message: 'Failed to evaluate answer.' });
  }
});

// ─────────────────────────────────────────
//  PATCH /api/interview/:id/complete
//  Marks interview as completed
// ─────────────────────────────────────────
router.patch('/:id/complete', (req, res) => {
  const db = getDB();
  const interview = db.prepare('SELECT * FROM interviews WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

  if (!interview) {
    return res.status(404).json({ success: false, message: 'Interview not found.' });
  }

  // Calculate average score from answers
  const avgRow = db.prepare(`
    SELECT AVG(score) as avg_score FROM answers WHERE interview_id = ?
  `).get(req.params.id);

  const overallScore = Math.round(avgRow.avg_score || 0);
  const grade = scoreToGrade(overallScore);

  db.prepare(`
    UPDATE interviews
    SET status = 'completed', overall_score = ?, grade = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(overallScore, grade, req.params.id);

  res.json({ success: true, message: 'Interview marked as completed.', overallScore, grade });
});

// ─────────────────────────────────────────
//  GET /api/interview/history
//  Returns all interviews for logged-in user
// ─────────────────────────────────────────
router.get('/history', (req, res) => {
  const db = getDB();

  const interviews = db.prepare(`
    SELECT
      i.id, i.job_role, i.experience, i.interview_type, i.topic,
      i.difficulty, i.num_questions, i.overall_score, i.grade,
      i.status, i.started_at, i.completed_at,
      COUNT(a.id) as answered_count
    FROM interviews i
    LEFT JOIN answers a ON a.interview_id = i.id
    WHERE i.user_id = ?
    GROUP BY i.id
    ORDER BY i.started_at DESC
  `).all(req.user.id);

  res.json({ success: true, total: interviews.length, interviews });
});

// ─────────────────────────────────────────
//  GET /api/interview/:id
//  Get single interview with all questions and answers
// ─────────────────────────────────────────
router.get('/:id', (req, res) => {
  const db = getDB();

  const interview = db.prepare('SELECT * FROM interviews WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!interview) {
    return res.status(404).json({ success: false, message: 'Interview not found.' });
  }

  const questions = db.prepare(`
    SELECT q.id, q.question_index, q.question_text,
           a.id as answer_id, a.answer_text, a.score, a.positive, a.improve, a.brief, a.answered_at
    FROM questions q
    LEFT JOIN answers a ON a.question_id = q.id AND a.interview_id = q.interview_id
    WHERE q.interview_id = ?
    ORDER BY q.question_index ASC
  `).all(req.params.id);

  const report = db.prepare('SELECT * FROM reports WHERE interview_id = ?').get(req.params.id);

  res.json({ success: true, interview, questions, report: report || null });
});

// ─────────────────────────────────────────
//  DELETE /api/interview/:id
// ─────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const db = getDB();

  const interview = db.prepare('SELECT id FROM interviews WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!interview) {
    return res.status(404).json({ success: false, message: 'Interview not found.' });
  }

  db.prepare('DELETE FROM interviews WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Interview deleted successfully.' });
});

// ─────────────────────────────────────────
//  HELPER
// ─────────────────────────────────────────
function scoreToGrade(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Average';
  if (score >= 40) return 'Needs Improvement';
  return 'Poor';
}

module.exports = router;
