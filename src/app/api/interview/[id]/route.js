// app/api/interview/[id]/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import { verifyAuth } from '@/lib/auth';

export async function GET(request, { params }) {
    const auth = verifyAuth(request);
    if (auth.error) return NextResponse.json(auth.body, { status: auth.status });
    await connectDB();
    const { id } = await params;
    try {
        const interview = await Interview.findOne({ _id: id, user: auth.user.id }).lean();
        if (!interview) return NextResponse.json({ success: false, message: 'Interview not found.' }, { status: 404 });
        const questions = interview.questions.map((q) => ({
            id: q._id, question_index: q.questionIndex, question_text: q.questionText,
            answer_id: q.answer?._id || null, answer_text: q.answer?.answerText || null,
            score: q.answer?.score ?? null, positive: q.answer?.positive || null,
            improve: q.answer?.improve || null, brief: q.answer?.brief || null,
            answered_at: q.answer?.createdAt || null,
        }));
        return NextResponse.json({ success: true, interview: { id: interview._id, job_role: interview.jobRole, experience: interview.experience, interview_type: interview.interviewType, topic: interview.topic, difficulty: interview.difficulty, num_questions: interview.numQuestions, overall_score: interview.overallScore, grade: interview.grade, status: interview.status, started_at: interview.createdAt, completed_at: interview.completedAt }, questions, report: interview.report || null });
    } catch (err) {
        return NextResponse.json({ success: false, message: 'Failed to fetch interview.' }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const auth = verifyAuth(request);
    if (auth.error) return NextResponse.json(auth.body, { status: auth.status });
    await connectDB();
    const { id } = await params;
    try {
        const interview = await Interview.findOneAndDelete({ _id: id, user: auth.user.id });
        if (!interview) return NextResponse.json({ success: false, message: 'Interview not found.' }, { status: 404 });
        return NextResponse.json({ success: true, message: 'Interview deleted successfully.' });
    } catch (err) {
        return NextResponse.json({ success: false, message: 'Failed to delete interview.' }, { status: 500 });
    }
}
