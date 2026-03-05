// routes/interview.js
// All interview lifecycle endpoints (all protected by JWT)
//
// POST   /api/interview/start              → create interview + generate questions
// POST   /api/interview/:id/answer         → submit answer + get AI feedback
// PATCH  /api/interview/:id/complete       → mark interview as completed
// GET    /api/interview/history            → get all interviews for logged-in user
// GET    /api/interview/:id                → get single interview with all Q&A
// DELETE /api/interview/:id               → delete an interview

const express = require('express');
const authMiddleware = require('../middleware/auth');
const Interview = require('../models/Interview');
const { callGemini, parseGeminiJSON } = require('../config/gemini');
const { generateLocalQuestions, evaluateAnswerLocally } = require('../config/fallback');
const mongoose = require('mongoose');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// ─────────────────────────────────────────
//  POST /api/interview/start
// ─────────────────────────────────────────
router.post('/start', async (req, res) => {
  const { jobRole, experience, interviewType, topic, difficulty, numQuestions } = req.body;

  if (!jobRole || !interviewType || !difficulty || !numQuestions) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: jobRole, interviewType, difficulty, numQuestions'
    });
  }

  try {
    // 1. Generate questions — Gemini first, fallback to local
    let questions;
    try {
      const topicLine = topic ? `Focus specifically on: ${topic}.` : '';
      const expLine = experience ? `Candidate experience level: ${experience}.` : '';
      const prompt = `You are Morgan Reid, a senior hiring manager. Generate exactly ${numQuestions} ${interviewType} interview questions for a ${difficulty}-level ${jobRole} candidate.\n${expLine}\n${topicLine}\nMake questions sound natural and conversational, as a real interviewer would speak them. Be specific and progressively challenging.\nReturn ONLY a valid JSON array of strings. No explanation. No markdown.\nExample: ["Tell me about yourself.", "Describe a recent challenge you overcame."]`;

      const raw = await callGemini(prompt, 0.8);
      questions = parseGeminiJSON(raw);
      if (!Array.isArray(questions)) throw new Error('Not an array');
      questions = questions.slice(0, numQuestions);
      console.log('✅ Questions generated via Gemini AI');
    } catch (geminiErr) {
      console.log('⚠️ Gemini unavailable, using built-in questions:', geminiErr.message);
      questions = generateLocalQuestions({ jobRole, interviewType, difficulty, numQuestions, topic });
    }

    // 2. Save interview with embedded questions
    const interview = await Interview.create({
      user: req.user.id,
      jobRole,
      experience: experience || null,
      interviewType,
      topic: topic || null,
      difficulty,
      numQuestions: questions.length,
      questions: questions.map((q, i) => ({ questionIndex: i, questionText: q }))
    });

    res.status(201).json({
      success: true,
      message: 'Interview started successfully',
      interviewId: interview._id,
      questions: interview.questions.map(q => ({
        id: q._id,
        question_index: q.questionIndex,
        question_text: q.questionText
      }))
    });

  } catch (err) {
    console.error('Start interview error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to start interview.' });
  }
});

// ─────────────────────────────────────────
//  POST /api/interview/:id/answer
// ─────────────────────────────────────────
router.post('/:id/answer', async (req, res) => {
  const { questionId, answerText } = req.body;
  const interviewId = req.params.id;

  if (!questionId || !answerText || answerText.trim().length < 5) {
    return res.status(400).json({ success: false, message: 'questionId and answerText (min 5 chars) are required.' });
  }

  try {
    const interview = await Interview.findOne({ _id: interviewId, user: req.user.id });
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found.' });
    }

    const question = interview.questions.id(questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found.' });
    }

    // Evaluate with Gemini
    const prompt = `You are evaluating a candidate's answer in a ${interview.difficulty} ${interview.interviewType} interview for a ${interview.jobRole} role.\n\nQuestion: "${question.questionText}"\nCandidate's answer: "${answerText}"\n\nReturn ONLY a valid JSON object. No markdown. No explanation:\n{\n  "score": <integer 0 to 100>,\n  "positive": "<one specific strength of this answer in 1-2 sentences>",\n  "improve": "<one specific actionable improvement in 1-2 sentences>",\n  "brief": "<one sentence overall verdict, spoken aloud to the candidate>"\n}`;

    let feedback;
    try {
      const raw = await callGemini(prompt, 0.5);
      feedback = parseGeminiJSON(raw);
      console.log('✅ Answer evaluated via Gemini AI');
    } catch (e) {
      console.log('⚠️ Gemini unavailable, using local evaluator');
      feedback = evaluateAnswerLocally(question.questionText, answerText, interview.difficulty);
    }

    // Save answer into the embedded question subdocument
    question.answer = {
      answerText,
      score: feedback.score,
      positive: feedback.positive,
      improve: feedback.improve,
      brief: feedback.brief
    };
    await interview.save();

    res.json({
      success: true,
      answerId: question.answer._id,
      feedback
    });

  } catch (err) {
    console.error('Answer submission error:', err);
    res.status(500).json({ success: false, message: 'Failed to evaluate answer.' });
  }
});

// ─────────────────────────────────────────
//  PATCH /api/interview/:id/complete
// ─────────────────────────────────────────
router.patch('/:id/complete', async (req, res) => {
  try {
    const interview = await Interview.findOne({ _id: req.params.id, user: req.user.id });
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found.' });
    }

    // Calculate average score from embedded answers
    const scores = interview.questions
      .map(q => q.answer?.score)
      .filter(s => s !== null && s !== undefined);
    const overallScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const grade = scoreToGrade(overallScore);

    interview.status = 'completed';
    interview.overallScore = overallScore;
    interview.grade = grade;
    interview.completedAt = new Date();
    await interview.save();

    res.json({ success: true, message: 'Interview marked as completed.', overallScore, grade });
  } catch (err) {
    console.error('Complete interview error:', err);
    res.status(500).json({ success: false, message: 'Failed to complete interview.' });
  }
});

// ─────────────────────────────────────────
//  GET /api/interview/history
// ─────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const interviews = await Interview.find({ user: req.user.id })
      .select('jobRole experience interviewType topic difficulty numQuestions overallScore grade status createdAt completedAt questions')
      .sort({ createdAt: -1 })
      .lean();

    const result = interviews.map(i => ({
      id: i._id,
      job_role: i.jobRole,
      experience: i.experience,
      interview_type: i.interviewType,
      topic: i.topic,
      difficulty: i.difficulty,
      num_questions: i.numQuestions,
      overall_score: i.overallScore,
      grade: i.grade,
      status: i.status,
      started_at: i.createdAt,
      completed_at: i.completedAt,
      answered_count: i.questions.filter(q => q.answer).length
    }));

    res.json({ success: true, total: result.length, interviews: result });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch history.' });
  }
});

// ─────────────────────────────────────────
//  GET /api/interview/:id
// ─────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const interview = await Interview.findOne({ _id: req.params.id, user: req.user.id }).lean();
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found.' });
    }

    const questions = interview.questions.map(q => ({
      id: q._id,
      question_index: q.questionIndex,
      question_text: q.questionText,
      answer_id: q.answer?._id || null,
      answer_text: q.answer?.answerText || null,
      score: q.answer?.score ?? null,
      positive: q.answer?.positive || null,
      improve: q.answer?.improve || null,
      brief: q.answer?.brief || null,
      answered_at: q.answer?.createdAt || null
    }));

    res.json({
      success: true,
      interview: {
        id: interview._id,
        job_role: interview.jobRole,
        experience: interview.experience,
        interview_type: interview.interviewType,
        topic: interview.topic,
        difficulty: interview.difficulty,
        num_questions: interview.numQuestions,
        overall_score: interview.overallScore,
        grade: interview.grade,
        status: interview.status,
        started_at: interview.createdAt,
        completed_at: interview.completedAt
      },
      questions,
      report: interview.report || null
    });
  } catch (err) {
    console.error('Get interview error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch interview.' });
  }
});

// ─────────────────────────────────────────
//  DELETE /api/interview/:id
// ─────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const interview = await Interview.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found.' });
    }
    res.json({ success: true, message: 'Interview deleted successfully.' });
  } catch (err) {
    console.error('Delete interview error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete interview.' });
  }
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
