// models/Interview.js
// Mongoose schema mirroring the SQLite interviews table

import mongoose from 'mongoose';

const InterviewSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    job_role: {
        type: String,
        required: true,
    },
    experience: {
        type: String,
        default: null,
    },
    interview_type: {
        type: String,
        required: true,
    },
    topic: {
        type: String,
        default: null,
    },
    difficulty: {
        type: String,
        required: true,
    },
    num_questions: {
        type: Number,
        required: true,
    },
    overall_score: {
        type: Number,
        default: null,
    },
    grade: {
        type: String,
        default: null,
    },
    status: {
        type: String,
        default: 'in_progress',
    },
    started_at: {
        type: Date,
        default: Date.now,
    },
    completed_at: {
        type: Date,
        default: null,
    },
});

export default mongoose.models.Interview || mongoose.model('Interview', InterviewSchema);
