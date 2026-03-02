// app/api/report/[interviewId]/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Interview from '@/models/Interview';
import Question from '@/models/Question';
import Answer from '@/models/Answer';
import Report from '@/models/Report';
import { verifyAuth } from '@/lib/auth';

export async function GET(request, { params }) {
    const auth = verifyAuth(request);
    if (auth.error) {
        return NextResponse.json(auth.body, { status: auth.status });
    }

    await connectDB();

    const { interviewId } = await params;

    const interview = await Interview.findOne({ _id: interviewId, user_id: auth.user.id }).lean();
    if (!interview) {
        return NextResponse.json(
            { success: false, message: 'Interview not found.' },
            { status: 404 }
        );
    }

    const report = await Report.findOne({ interview_id: interviewId }).lean();
    if (!report) {
        return NextResponse.json(
            { success: false, message: 'Report not found. Generate one first using POST /api/report/generate/:interviewId' },
            { status: 404 }
        );
    }

    // Get Q&A breakdown
    const questions = await Question.find({ interview_id: interviewId }).sort({ question_index: 1 }).lean();
    const qaBreakdown = await Promise.all(
        questions.map(async (q) => {
            const answer = await Answer.findOne({ question_id: q._id, interview_id: interviewId }).lean();
            return {
                question_text: q.question_text,
                answer_text: answer?.answer_text || null,
                score: answer?.score || null,
                positive: answer?.positive || null,
                improve: answer?.improve || null,
                brief: answer?.brief || null,
            };
        })
    );

    return NextResponse.json({
        success: true,
        report: {
            ...report,
            strengths: report.strengths || [],
            improvements: report.improvements || [],
        },
        interview: {
            id: interview._id,
            jobRole: interview.job_role,
            experience: interview.experience,
            interviewType: interview.interview_type,
            difficulty: interview.difficulty,
            topic: interview.topic,
            startedAt: interview.started_at,
            completedAt: interview.completed_at,
        },
        qaBreakdown,
    });
}
