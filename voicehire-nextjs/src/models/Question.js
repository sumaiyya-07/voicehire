// models/Question.js
// Mongoose schema mirroring the SQLite questions table

import mongoose from 'mongoose';

const QuestionSchema = new mongoose.Schema({
    interview_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Interview',
        required: true,
    },
    question_index: {
        type: Number,
        required: true,
    },
    question_text: {
        type: String,
        required: true,
    },
});

export default mongoose.models.Question || mongoose.model('Question', QuestionSchema);
