// app/api/auth/login/route.js
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

function generateToken(user) {
    return jwt.sign(
        { id: user._id.toString(), email: user.email, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
}

export async function POST(request) {
    await connectDB();
    try {
        const { email, password } = await request.json();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            return NextResponse.json({ success: false, errors: [{ msg: 'Enter a valid email' }] }, { status: 400 });
        }
        if (!password) {
            return NextResponse.json({ success: false, errors: [{ msg: 'Password is required' }] }, { status: 400 });
        }
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return NextResponse.json({ success: false, message: 'Invalid email or password.' }, { status: 401 });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return NextResponse.json({ success: false, message: 'Invalid email or password.' }, { status: 401 });
        }
        const token = generateToken(user);
        return NextResponse.json({ success: true, message: 'Logged in successfully!', token, user: { id: user._id, name: user.name, email: user.email, photo: user.photo, created_at: user.createdAt } });
    } catch (err) {
        console.error('Login error:', err);
        return NextResponse.json({ success: false, message: 'Server error during login.' }, { status: 500 });
    }
}
