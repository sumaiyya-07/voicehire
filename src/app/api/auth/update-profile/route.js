// app/api/auth/update-profile/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { verifyAuth } from '@/lib/auth';

export async function PUT(request) {
    const auth = verifyAuth(request);
    if (auth.error) return NextResponse.json(auth.body, { status: auth.status });
    await connectDB();
    try {
        const { name, photo } = await request.json();
        const updated = await User.findByIdAndUpdate(
            auth.user.id,
            { name: name || auth.user.name, photo: photo || null },
            { new: true }
        ).select('-password');
        return NextResponse.json({ success: true, message: 'Profile updated.', user: { id: updated._id, name: updated.name, email: updated.email, photo: updated.photo } });
    } catch (err) {
        console.error('Update profile error:', err);
        return NextResponse.json({ success: false, message: 'Failed to update profile.' }, { status: 500 });
    }
}
