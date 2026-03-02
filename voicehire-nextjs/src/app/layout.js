import "./globals.css";

export const metadata = {
  title: "VoiceHire — AI Mock Interview Platform",
  description:
    "VoiceHire — AI-powered mock interview platform. Practice interviews with real-time AI feedback and voice recognition.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
