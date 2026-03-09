// app/api/interview/history/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import { verifyAuth } from '@/lib/auth';

export async function GET(request) {
    const auth = verifyAuth(request);
    if (auth.error) return NextResponse.json(auth.body, { status: auth.status });
    await connectDB();
    try {
        const interviews = await Interview.find({ user: auth.user.id })
            .select('jobRole experience interviewType topic difficulty numQuestions overallScore grade status createdAt completedAt questions')
            .sort({ createdAt: -1 }).lean();
        const result = interviews.map((i) => ({
            id: i._id, job_role: i.jobRole, experience: i.experience, interview_type: i.interviewType,
            topic: i.topic, difficulty: i.difficulty, num_questions: i.numQuestions,
            overall_score: i.overallScore, grade: i.grade, status: i.status,
            started_at: i.createdAt, completed_at: i.completedAt,
            answered_count: i.questions.filter((q) => q.answer).length,
        }));
        return NextResponse.json({ success: true, total: result.length, interviews: result });
    } catch (err) {
        console.error('History error:', err);
        return NextResponse.json({ success: false, message: 'Failed to fetch history.' }, { status: 500 });
    }
}
