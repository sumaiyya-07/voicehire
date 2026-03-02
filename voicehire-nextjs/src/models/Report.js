// models/Report.js
// Mongoose schema mirroring the SQLite reports table

import mongoose from 'mongoose';

const ReportSchema = new mongoose.Schema({
    interview_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Interview',
        required: true,
        unique: true,
    },
    overall_score: {
        type: Number,
        default: null,
    },
    grade: {
        type: String,
        default: null,
    },
    communication: {
        type: Number,
        default: null,
    },
    relevance: {
        type: Number,
        default: null,
    },
    confidence: {
        type: Number,
        default: null,
    },
    structure: {
        type: Number,
        default: null,
    },
    depth: {
        type: Number,
        default: null,
    },
    strengths: {
        type: [String],
        default: [],
    },
    improvements: {
        type: [String],
        default: [],
    },
    recommendation: {
        type: String,
        default: null,
    },
    generated_at: {
        type: Date,
        default: Date.now,
    },
});

export default mongoose.models.Report || mongoose.model('Report', ReportSchema);
