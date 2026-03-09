// app/api/report/[interviewId]/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import { verifyAuth } from '@/lib/auth';

export async function GET(request, { params }) {
    const auth = verifyAuth(request);
    if (auth.error) return NextResponse.json(auth.body, { status: auth.status });
    await connectDB();
    const { interviewId } = await params;
    try {
        const interview = await Interview.findOne({ _id: interviewId, user: auth.user.id }).lean();
        if (!interview) return NextResponse.json({ success: false, message: 'Interview not found.' }, { status: 404 });
        if (!interview.report) return NextResponse.json({ success: false, message: 'Report not found. Generate one first using POST /api/report/generate/:interviewId' }, { status: 404 });
        const qaBreakdown = interview.questions.map((q) => ({ question_text: q.questionText, answer_text: q.answer?.answerText || null, score: q.answer?.score ?? null, positive: q.answer?.positive || null, improve: q.answer?.improve || null, brief: q.answer?.brief || null }));
        return NextResponse.json({ success: true, report: { ...interview.report, strengths: interview.report.strengths || [], improvements: interview.report.improvements || [] }, interview: { id: interview._id, jobRole: interview.jobRole, experience: interview.experience, interviewType: interview.interviewType, difficulty: interview.difficulty, topic: interview.topic, startedAt: interview.createdAt, completedAt: interview.completedAt }, qaBreakdown });
    } catch (err) {
        return NextResponse.json({ success: false, message: 'Failed to fetch report.' }, { status: 500 });
    }
}
