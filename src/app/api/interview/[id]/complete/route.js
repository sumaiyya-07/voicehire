// app/api/interview/[id]/complete/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import { verifyAuth } from '@/lib/auth';

function scoreToGrade(score) {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 55) return 'Average';
    if (score >= 40) return 'Needs Improvement';
    return 'Poor';
}

export async function PATCH(request, { params }) {
    const auth = verifyAuth(request);
    if (auth.error) return NextResponse.json(auth.body, { status: auth.status });
    await connectDB();
    const { id } = await params;
    try {
        const interview = await Interview.findOne({ _id: id, user: auth.user.id });
        if (!interview) return NextResponse.json({ success: false, message: 'Interview not found.' }, { status: 404 });
        const scores = interview.questions.map((q) => q.answer?.score).filter((s) => s !== null && s !== undefined);
        const overallScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        const grade = scoreToGrade(overallScore);
        interview.status = 'completed';
        interview.overallScore = overallScore;
        interview.grade = grade;
        interview.completedAt = new Date();
        await interview.save();
        return NextResponse.json({ success: true, message: 'Interview marked as completed.', overallScore, grade });
    } catch (err) {
        return NextResponse.json({ success: false, message: 'Failed to complete interview.' }, { status: 500 });
    }
}
