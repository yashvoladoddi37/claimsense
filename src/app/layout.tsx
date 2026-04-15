import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";


const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-code",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClaimSense",
  description: "AI-powered OPD claim adjudication",
  icons: { icon: "/favicon.png" },
};

function MobileNav() {
  return (
    <div className="sm:hidden flex items-center gap-1 overflow-x-auto text-[12px] font-medium px-4 py-2 border-b border-[#f0eee6] bg-[#faf9f5]">
      <Link href="/" className="text-[#87867f] hover:text-[#141413] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap">Submit</Link>
      <Link href="/policy" className="text-[#87867f] hover:text-[#141413] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap">Policy</Link>
      <Link href="/test-runner" className="text-[#87867f] hover:text-[#141413] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap">Tests</Link>
      <Link href="/dashboard" className="text-[#87867f] hover:text-[#141413] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap">Dashboard</Link>
      <Link href="/settings" className="text-[#87867f] hover:text-[#141413] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap">Settings</Link>
    </div>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-background text-foreground" style={{ fontFeatureSettings: '"cv01", "ss03"' }}>
        <nav className="sticky top-0 z-50 border-b border-[#f0eee6] bg-[#faf0ec]/92 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center justify-between">
              <Link href="/" className="flex items-center gap-2.5 font-semibold text-[15px] tracking-[-0.2px]">
                <span className="text-[16px] font-bold tracking-[-0.3px]">ClaimSense</span>
              </Link>
              <div className="hidden sm:flex items-center gap-0.5 text-[13px] font-medium">
                <Link href="/" className="text-[#87867f] hover:text-[#141413] px-3 py-1.5 rounded-lg transition-colors">Submit Claim</Link>
                <Link href="/policy" className="text-[#87867f] hover:text-[#141413] px-3 py-1.5 rounded-lg transition-colors">Policy Explorer</Link>
                <Link href="/test-runner" className="text-[#87867f] hover:text-[#141413] px-3 py-1.5 rounded-lg transition-colors">Test Runner</Link>
                <Link href="/dashboard" className="text-[#87867f] hover:text-[#141413] px-3 py-1.5 rounded-lg transition-colors">Dashboard</Link>
                <Link href="/settings" className="text-[#87867f] hover:text-[#141413] px-3 py-1.5 rounded-lg transition-colors">Settings</Link>
              </div>
            </div>
          </div>
          <MobileNav />
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1">
          {children}
        </main>
        <footer className="border-t border-[#f0eee6] py-3 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-[12px] text-[#87867f]">
            <span>Built by <span className="font-medium text-[#141413]">Yashpreet Voladoddi</span></span>
            <a href="https://github.com/yashvoladoddi37/claimsense" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-[#141413] transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              <span>View on GitHub</span>
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
