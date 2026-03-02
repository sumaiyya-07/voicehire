// app/api/interview/[id]/route.js
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

    const { id } = await params;

    const interview = await Interview.findOne({ _id: id, user_id: auth.user.id }).lean();
    if (!interview) {
        return NextResponse.json(
            { success: false, message: 'Interview not found.' },
            { status: 404 }
        );
    }

    // Get all questions with their answers
    const questions = await Question.find({ interview_id: id }).sort({ question_index: 1 }).lean();

    const questionsWithAnswers = await Promise.all(
        questions.map(async (q) => {
            const answer = await Answer.findOne({ question_id: q._id, interview_id: id }).lean();
            return {
                id: q._id,
                question_index: q.question_index,
                question_text: q.question_text,
                answer_id: answer?._id || null,
                answer_text: answer?.answer_text || null,
                score: answer?.score || null,
                positive: answer?.positive || null,
                improve: answer?.improve || null,
                brief: answer?.brief || null,
                answered_at: answer?.answered_at || null,
            };
        })
    );

    const report = await Report.findOne({ interview_id: id }).lean();

    return NextResponse.json({
        success: true,
        interview: { ...interview, id: interview._id },
        questions: questionsWithAnswers,
        report: report || null,
    });
}

export async function DELETE(request, { params }) {
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

    // Delete cascade: answers, questions, report, interview
    await Answer.deleteMany({ interview_id: id });
    await Question.deleteMany({ interview_id: id });
    await Report.deleteMany({ interview_id: id });
    await Interview.findByIdAndDelete(id);

    return NextResponse.json({
        success: true,
        message: 'Interview deleted successfully.',
    });
}
