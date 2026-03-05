// routes/report.js
// Handles: POST /api/report/generate/:interviewId
//           GET  /api/report/:interviewId
//           GET  /api/report/all/me

const express = require('express');
const authMiddleware = require('../middleware/auth');
const Interview = require('../models/Interview');
const { callGemini, parseGeminiJSON } = require('../config/gemini');
const { generateReportLocally } = require('../config/fallback');

const router = express.Router();
router.use(authMiddleware);

// ─────────────────────────────────────────
//  POST /api/report/generate/:interviewId
// ─────────────────────────────────────────
router.post('/generate/:interviewId', async (req, res) => {
  const { interviewId } = req.params;

  try {
    const interview = await Interview.findOne({ _id: interviewId, user: req.user.id });
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found.' });
    }

    // Get answered Q&As
    const answeredQAs = interview.questions
      .filter(q => q.answer?.answerText)
      .map(q => ({
        question_text: q.questionText,
        answer_text: q.answer.answerText,
        score: q.answer.score
      }));

    if (answeredQAs.length === 0) {
      return res.status(400).json({ success: false, message: 'No answers found for this interview.' });
    }

    // Build Gemini prompt
    const qaText = answeredQAs.map((qa, i) =>
      `Q${i + 1}: ${qa.question_text}\nAnswer: ${qa.answer_text}`
    ).join('\n\n');

    const prompt = `You are a professional interview coach evaluating a complete ${interview.difficulty} ${interview.interviewType} interview for a ${interview.jobRole} candidate.\n\nHere are all the questions and candidate answers:\n\n${qaText}\n\nAnalyze the entire interview holistically and return ONLY a valid JSON object. No markdown, no explanation:\n{\n  "overallScore": <integer 0-100>,\n  "grade": "<Excellent|Good|Average|Needs Improvement|Poor>",\n  "communication": <integer 0-100>,\n  "relevance": <integer 0-100>,\n  "confidence": <integer 0-100>,\n  "structure": <integer 0-100>,\n  "depth": <integer 0-100>,\n  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],\n  "improvements": ["<actionable improvement 1>", "<actionable improvement 2>", "<actionable improvement 3>"],\n  "recommendation": "<2-3 sentence strategic recommendation for this candidate's career development>"\n}`;

    let analysis;
    try {
      const raw = await callGemini(prompt, 0.4);
      analysis = parseGeminiJSON(raw);
      console.log('✅ Report generated via Gemini AI');
    } catch (e) {
      console.log('⚠️ Gemini unavailable, using local report generator');
      analysis = generateReportLocally(
        {
          job_role: interview.jobRole,
          interview_type: interview.interviewType,
          difficulty: interview.difficulty
        },
        answeredQAs
      );
    }

    // Save report as embedded subdocument + update interview
    interview.report = {
      overallScore: analysis.overallScore,
      grade: analysis.grade,
      communication: analysis.communication,
      relevance: analysis.relevance,
      confidence: analysis.confidence,
      structure: analysis.structure,
      depth: analysis.depth,
      strengths: analysis.strengths,
      improvements: analysis.improvements,
      recommendation: analysis.recommendation
    };
    interview.overallScore = analysis.overallScore;
    interview.grade = analysis.grade;
    interview.status = 'completed';
    if (!interview.completedAt) interview.completedAt = new Date();
    await interview.save();

    // Build full Q&A breakdown for response
    const qaBreakdown = interview.questions.map(q => ({
      question_text: q.questionText,
      answer_text: q.answer?.answerText || null,
      score: q.answer?.score ?? null,
      positive: q.answer?.positive || null,
      improve: q.answer?.improve || null,
      brief: q.answer?.brief || null
    }));

    res.json({
      success: true,
      reportId: interview._id,
      report: {
        ...analysis,
        generatedAt: interview.report.createdAt || new Date().toISOString()
      },
      interview: {
        id: interview._id,
        jobRole: interview.jobRole,
        experience: interview.experience,
        interviewType: interview.interviewType,
        difficulty: interview.difficulty,
        topic: interview.topic,
        startedAt: interview.createdAt
      },
      qaBreakdown
    });

  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate report: ' + err.message });
  }
});

// ─────────────────────────────────────────
//  GET /api/report/all/me
//  Must be defined BEFORE /:interviewId
// ─────────────────────────────────────────
router.get('/all/me', async (req, res) => {
  try {
    const interviews = await Interview.find({
      user: req.user.id,
      report: { $ne: null }
    })
      .select('jobRole difficulty interviewType numQuestions report createdAt')
      .sort({ 'report.createdAt': -1 })
      .lean();

    const reports = interviews.map(i => ({
      id: i.report._id,
      interview_id: i._id,
      overall_score: i.report.overallScore,
      grade: i.report.grade,
      generated_at: i.report.createdAt,
      job_role: i.jobRole,
      difficulty: i.difficulty,
      interview_type: i.interviewType,
      num_questions: i.numQuestions
    }));

    res.json({ success: true, total: reports.length, reports });
  } catch (err) {
    console.error('All reports error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch reports.' });
  }
});

// ─────────────────────────────────────────
//  GET /api/report/:interviewId
// ─────────────────────────────────────────
router.get('/:interviewId', async (req, res) => {
  try {
    const interview = await Interview.findOne({ _id: req.params.interviewId, user: req.user.id }).lean();
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found.' });
    }
    if (!interview.report) {
      return res.status(404).json({ success: false, message: 'Report not found. Generate one first using POST /api/report/generate/:interviewId' });
    }

    const qaBreakdown = interview.questions.map(q => ({
      question_text: q.questionText,
      answer_text: q.answer?.answerText || null,
      score: q.answer?.score ?? null,
      positive: q.answer?.positive || null,
      improve: q.answer?.improve || null,
      brief: q.answer?.brief || null
    }));

    res.json({
      success: true,
      report: {
        ...interview.report,
        strengths: interview.report.strengths || [],
        improvements: interview.report.improvements || []
      },
      interview: {
        id: interview._id,
        jobRole: interview.jobRole,
        experience: interview.experience,
        interviewType: interview.interviewType,
        difficulty: interview.difficulty,
        topic: interview.topic,
        startedAt: interview.createdAt,
        completedAt: interview.completedAt
      },
      qaBreakdown
    });
  } catch (err) {
    console.error('Get report error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch report.' });
  }
});

module.exports = router;
