// app/api/resume/upload/route.js
// Accepts a resume file (PDF or TXT), extracts the text, and returns it.

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';

export async function POST(request) {
    // Auth check
    const auth = verifyAuth(request);
    if (auth.error) {
        return NextResponse.json(auth.body, { status: auth.status });
    }

    let formData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json({ success: false, message: 'Invalid form data.' }, { status: 400 });
    }

    const file = formData.get('resume');
    if (!file || typeof file === 'string') {
        return NextResponse.json({ success: false, message: 'No file uploaded.' }, { status: 400 });
    }

    const fileName = file.name || '';
    const ext = fileName.split('.').pop().toLowerCase();

    if (!['pdf', 'txt'].includes(ext)) {
        return NextResponse.json(
            { success: false, message: 'Only PDF and TXT files are supported.' },
            { status: 400 }
        );
    }

    try {
        const buffer = Buffer.from(await file.arrayBuffer());

        let text = '';

        if (ext === 'txt') {
            text = buffer.toString('utf-8');
        } else if (ext === 'pdf') {
            // Import the internal lib directly (bypasses index.js which loads test
            // PDF files at startup and crashes in Next.js App Router)
            const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
            const result = await pdfParse(buffer);
            text = result.text || '';
        }

        text = text.trim();

        if (text.length < 30) {
            return NextResponse.json(
                { success: false, message: 'Could not extract readable text from the file. Please paste your resume manually.' },
                { status: 422 }
            );
        }

        return NextResponse.json({ success: true, text });
    } catch (err) {
        console.error('Resume upload error:', err);
        return NextResponse.json(
            { success: false, message: 'Failed to read the file. Please paste your resume text instead.' },
            { status: 500 }
        );
    }
}
