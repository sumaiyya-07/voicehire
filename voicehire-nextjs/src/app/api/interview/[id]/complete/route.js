// app/api/interview/[id]/complete/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import Answer from '@/models/Answer';
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
    if (auth.error) {
        return NextResponse.json(auth.body, { status: auth.status });
    }

    await connectDB();

    const { id } = await params;

    const interview = await Interview.findOne({ _id: id, user_id: auth.user.id });
    if (!interview) {
        return NextResponse.json(
            { success: false, message: 'Interview not found.' },
            { status: 404 }
        );
    }

    // Calculate average score from answers
    const answers = await Answer.find({ interview_id: id });
    const scores = answers.map((a) => a.score).filter((s) => s != null);
    const overallScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const grade = scoreToGrade(overallScore);

    await Interview.findByIdAndUpdate(id, {
        status: 'completed',
        overall_score: overallScore,
        grade,
        completed_at: new Date(),
    });

    return NextResponse.json({
        success: true,
        message: 'Interview marked as completed.',
        overallScore,
        grade,
    });
}
