// models/Interview.js
// Single document holds the interview + embedded questions, answers, and report.

const mongoose = require('mongoose');

// ── Answer subdocument ────────────────────────────────────────────────────────
const answerSchema = new mongoose.Schema(
    {
        answerText: { type: String, required: true },
        score: { type: Number, default: null },
        positive: { type: String, default: null },
        improve: { type: String, default: null },
        brief: { type: String, default: null }
    },
    { timestamps: true }
);

// ── Question subdocument (embeds one answer) ──────────────────────────────────
const questionSchema = new mongoose.Schema({
    questionIndex: { type: Number, required: true },
    questionText: { type: String, required: true },
    answer: { type: answerSchema, default: null }
});

// ── Report subdocument ────────────────────────────────────────────────────────
const reportSchema = new mongoose.Schema(
    {
        overallScore: { type: Number },
        grade: { type: String },
        communication: { type: Number },
        relevance: { type: Number },
        confidence: { type: Number },
        structure: { type: Number },
        depth: { type: Number },
        strengths: { type: [String], default: [] },
        improvements: { type: [String], default: [] },
        recommendation: { type: String }
    },
    { timestamps: true }
);

// ── Interview document ────────────────────────────────────────────────────────
const interviewSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        jobRole: { type: String, required: true },
        experience: { type: String, default: null },
        interviewType: { type: String, required: true },   // behavioral / technical / situational / mixed
        topic: { type: String, default: null },
        difficulty: { type: String, required: true },   // Easy / Medium / Hard / Expert
        numQuestions: { type: Number, required: true },
        overallScore: { type: Number, default: null },
        grade: { type: String, default: null },
        status: { type: String, default: 'in_progress' },  // in_progress / completed
        completedAt: { type: Date, default: null },
        questions: { type: [questionSchema], default: [] },
        report: { type: reportSchema, default: null }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Interview', interviewSchema);
