// app/api/report/all/me/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import Report from '@/models/Report';
import { verifyAuth } from '@/lib/auth';

export async function GET(request) {
    const auth = verifyAuth(request);
    if (auth.error) {
        return NextResponse.json(auth.body, { status: auth.status });
    }

    await connectDB();

    // Get all interviews for this user
    const interviews = await Interview.find({ user_id: auth.user.id }).lean();
    const interviewIds = interviews.map((i) => i._id);

    // Get all reports for those interviews
    const reports = await Report.find({ interview_id: { $in: interviewIds } })
        .sort({ generated_at: -1 })
        .lean();

    const result = reports.map((r) => {
        const iv = interviews.find((i) => i._id.toString() === r.interview_id.toString());
        return {
            id: r._id,
            interview_id: r.interview_id,
            overall_score: r.overall_score,
            grade: r.grade,
            generated_at: r.generated_at,
            job_role: iv?.job_role,
            difficulty: iv?.difficulty,
            interview_type: iv?.interview_type,
            num_questions: iv?.num_questions,
        };
    });

    return NextResponse.json({
        success: true,
        total: result.length,
        reports: result,
    });
}
