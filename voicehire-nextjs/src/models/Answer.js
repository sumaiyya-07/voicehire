// models/Answer.js
// Mongoose schema mirroring the SQLite answers table

import mongoose from 'mongoose';

const AnswerSchema = new mongoose.Schema({
    interview_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Interview',
        required: true,
    },
    question_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
        required: true,
    },
    answer_text: {
        type: String,
        required: true,
    },
    score: {
        type: Number,
        default: null,
    },
    positive: {
        type: String,
        default: null,
    },
    improve: {
        type: String,
        default: null,
    },
    brief: {
        type: String,
        default: null,
    },
    answered_at: {
        type: Date,
        default: Date.now,
    },
});

export default mongoose.models.Answer || mongoose.model('Answer', AnswerSchema);
