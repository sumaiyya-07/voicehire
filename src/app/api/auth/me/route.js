// app/api/auth/me/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { verifyAuth } from '@/lib/auth';

export async function GET(request) {
    const auth = verifyAuth(request);
    if (auth.error) return NextResponse.json(auth.body, { status: auth.status });
    await connectDB();
    const user = await User.findById(auth.user.id).select('-password');
    if (!user) return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 });
    return NextResponse.json({ success: true, user: { id: user._id, name: user.name, email: user.email, photo: user.photo, created_at: user.createdAt } });
}
