// routes/report.js
// Handles: POST /api/report/generate/:interviewId
//           GET  /api/report/:interviewId

const express = require('express');
const { getDB } = require('../db/database');
const authMiddleware = require('../middleware/auth');
const { callGemini, parseGeminiJSON } = require('../config/gemini');
const { generateReportLocally } = require('../config/fallback');

const router = express.Router();

router.use(authMiddleware);

// ─────────────────────────────────────────
//  POST /api/report/generate/:interviewId
//  Generates full performance report via Gemini and saves to DB
// ─────────────────────────────────────────
router.post('/generate/:interviewId', async (req, res) => {
  const db = getDB();
  const { interviewId } = req.params;

  // 1. Verify interview belongs to this user
  const interview = db.prepare(`
    SELECT * FROM interviews WHERE id = ? AND user_id = ?
  `).get(interviewId, req.user.id);

  if (!interview) {
    return res.status(404).json({ success: false, message: 'Interview not found.' });
  }

  // 2. Get all questions + answers
  const qas = db.prepare(`
    SELECT q.question_text, a.answer_text, a.score
    FROM questions q
    LEFT JOIN answers a ON a.question_id = q.id AND a.interview_id = q.interview_id
    WHERE q.interview_id = ?
    ORDER BY q.question_index ASC
  `).all(interviewId);

  const answeredQAs = qas.filter(qa => qa.answer_text);

  if (answeredQAs.length === 0) {
    return res.status(400).json({ success: false, message: 'No answers found for this interview.' });
  }

  // 3. Build Gemini prompt
  const qaText = answeredQAs.map((qa, i) =>
    `Q${i + 1}: ${qa.question_text}\nAnswer: ${qa.answer_text}`
  ).join('\n\n');

  const prompt = `You are a professional interview coach evaluating a complete ${interview.difficulty} ${interview.interview_type} interview for a ${interview.job_role} candidate.

Here are all the questions and candidate answers:

${qaText}

Analyze the entire interview holistically and return ONLY a valid JSON object. No markdown, no explanation:
{
  "overallScore": <integer 0-100>,
  "grade": "<Excellent|Good|Average|Needs Improvement|Poor>",
  "communication": <integer 0-100>,
  "relevance": <integer 0-100>,
  "confidence": <integer 0-100>,
  "structure": <integer 0-100>,
  "depth": <integer 0-100>,
  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "improvements": ["<actionable improvement 1>", "<actionable improvement 2>", "<actionable improvement 3>"],
  "recommendation": "<2-3 sentence strategic recommendation for this candidate's career development>"
}`;

  try {
    let analysis;

    try {
      const raw = await callGemini(prompt, 0.4);
      analysis = parseGeminiJSON(raw);
      console.log('✅ Report generated via Gemini AI');
    } catch (e) {
      console.log('⚠️ Gemini unavailable, using local report generator');
      analysis = generateReportLocally(interview, answeredQAs);
    }

    // 4. Delete old report if exists (regeneration)
    db.prepare('DELETE FROM reports WHERE interview_id = ?').run(interviewId);

    // 5. Save report to database
    const result = db.prepare(`
      INSERT INTO reports (
        interview_id, overall_score, grade,
        communication, relevance, confidence, structure, depth,
        strengths, improvements, recommendation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      interviewId,
      analysis.overallScore,
      analysis.grade,
      analysis.communication,
      analysis.relevance,
      analysis.confidence,
      analysis.structure,
      analysis.depth,
      JSON.stringify(analysis.strengths),
      JSON.stringify(analysis.improvements),
      analysis.recommendation
    );

    // 6. Update interview overall score
    db.prepare(`
      UPDATE interviews
      SET overall_score = ?, grade = ?, status = 'completed', completed_at = COALESCE(completed_at, datetime('now'))
      WHERE id = ?
    `).run(analysis.overallScore, analysis.grade, interviewId);

    // 7. Return full report + Q&A breakdown
    const fullQAs = db.prepare(`
      SELECT q.question_text, a.answer_text, a.score, a.positive, a.improve, a.brief
      FROM questions q
      LEFT JOIN answers a ON a.question_id = q.id AND a.interview_id = q.interview_id
      WHERE q.interview_id = ?
      ORDER BY q.question_index ASC
    `).all(interviewId);

    res.json({
      success: true,
      reportId: result.lastInsertRowid,
      report: {
        ...analysis,
        strengths: analysis.strengths,
        improvements: analysis.improvements,
        generatedAt: new Date().toISOString()
      },
      interview: {
        id: interview.id,
        jobRole: interview.job_role,
        experience: interview.experience,
        interviewType: interview.interview_type,
        difficulty: interview.difficulty,
        topic: interview.topic,
        startedAt: interview.started_at
      },
      qaBreakdown: fullQAs
    });

  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate report: ' + err.message });
  }
});

// ─────────────────────────────────────────
//  GET /api/report/:interviewId
//  Retrieves saved report for an interview
// ─────────────────────────────────────────
router.get('/:interviewId', (req, res) => {
  const db = getDB();

  const interview = db.prepare('SELECT * FROM interviews WHERE id = ? AND user_id = ?').get(req.params.interviewId, req.user.id);
  if (!interview) {
    return res.status(404).json({ success: false, message: 'Interview not found.' });
  }

  const report = db.prepare('SELECT * FROM reports WHERE interview_id = ?').get(req.params.interviewId);
  if (!report) {
    return res.status(404).json({ success: false, message: 'Report not found. Generate one first using POST /api/report/generate/:interviewId' });
  }

  const qaBreakdown = db.prepare(`
    SELECT q.question_text, a.answer_text, a.score, a.positive, a.improve, a.brief
    FROM questions q
    LEFT JOIN answers a ON a.question_id = q.id AND a.interview_id = q.interview_id
    WHERE q.interview_id = ?
    ORDER BY q.question_index ASC
  `).all(req.params.interviewId);

  res.json({
    success: true,
    report: {
      ...report,
      strengths: JSON.parse(report.strengths || '[]'),
      improvements: JSON.parse(report.improvements || '[]')
    },
    interview: {
      id: interview.id,
      jobRole: interview.job_role,
      experience: interview.experience,
      interviewType: interview.interview_type,
      difficulty: interview.difficulty,
      topic: interview.topic,
      startedAt: interview.started_at,
      completedAt: interview.completed_at
    },
    qaBreakdown
  });
});

// ─────────────────────────────────────────
//  GET /api/report/all/me
//  Get all reports for logged-in user
// ─────────────────────────────────────────
router.get('/all/me', (req, res) => {
  const db = getDB();

  const reports = db.prepare(`
    SELECT r.id, r.interview_id, r.overall_score, r.grade, r.generated_at,
           i.job_role, i.difficulty, i.interview_type, i.num_questions
    FROM reports r
    JOIN interviews i ON i.id = r.interview_id
    WHERE i.user_id = ?
    ORDER BY r.generated_at DESC
  `).all(req.user.id);

  res.json({ success: true, total: reports.length, reports });
});

function scoreToGrade(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Average';
  if (score >= 40) return 'Needs Improvement';
  return 'Poor';
}

module.exports = router;
