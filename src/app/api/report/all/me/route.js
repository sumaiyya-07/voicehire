// app/api/report/all/me/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import { verifyAuth } from '@/lib/auth';

export async function GET(request) {
    const auth = verifyAuth(request);
    if (auth.error) return NextResponse.json(auth.body, { status: auth.status });
    await connectDB();
    try {
        const interviews = await Interview.find({ user: auth.user.id, report: { $ne: null } })
            .select('jobRole difficulty interviewType numQuestions report createdAt')
            .sort({ 'report.createdAt': -1 }).lean();
        const reports = interviews.map((i) => ({ id: i.report._id, interview_id: i._id, overall_score: i.report.overallScore, grade: i.report.grade, generated_at: i.report.createdAt, job_role: i.jobRole, difficulty: i.difficulty, interview_type: i.interviewType, num_questions: i.numQuestions }));
        return NextResponse.json({ success: true, total: reports.length, reports });
    } catch (err) {
        return NextResponse.json({ success: false, message: 'Failed to fetch reports.' }, { status: 500 });
    }
}
