// app/api/interview/history/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import Answer from '@/models/Answer';
import { verifyAuth } from '@/lib/auth';

export async function GET(request) {
    const auth = verifyAuth(request);
    if (auth.error) {
        return NextResponse.json(auth.body, { status: auth.status });
    }

    await connectDB();

    const interviews = await Interview.find({ user_id: auth.user.id }).sort({ started_at: -1 }).lean();

    // Get answer counts for each interview
    const interviewsWithCounts = await Promise.all(
        interviews.map(async (iv) => {
            const answeredCount = await Answer.countDocuments({ interview_id: iv._id });
            return {
                id: iv._id,
                job_role: iv.job_role,
                experience: iv.experience,
                interview_type: iv.interview_type,
                topic: iv.topic,
                difficulty: iv.difficulty,
                num_questions: iv.num_questions,
                overall_score: iv.overall_score,
                grade: iv.grade,
                status: iv.status,
                started_at: iv.started_at,
                completed_at: iv.completed_at,
                answered_count: answeredCount,
            };
        })
    );

    return NextResponse.json({
        success: true,
        total: interviewsWithCounts.length,
        interviews: interviewsWithCounts,
    });
}
