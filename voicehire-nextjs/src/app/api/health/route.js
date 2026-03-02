// app/api/health/route.js
import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        success: true,
        status: 'VoiceHire API is running',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
    });
}
