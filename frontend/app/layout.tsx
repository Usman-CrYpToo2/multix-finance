import { Navbar } from '@/components/Navbar'
import './globals.css'
import { Web3Provider } from '@/components/Web3Provider'


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <Web3Provider>
          <div className="fixed inset-0 -z-10 pointer-events-none bg-[#09090b] overflow-hidden">
            {/* Deep Space Background with Pulsing Orbs */}
            <div className="absolute -top-[20%] -right-[10%] w-[70%] h-[70%] bg-[radial-gradient(circle,_rgba(230,0,122,0.12)_0%,_transparent_70%)] animate-[pulse_10s_ease-in-out_infinite]"></div>
            <div className="absolute top-[30%] -left-[20%] w-[60%] h-[60%] bg-[radial-gradient(circle,_rgba(94,114,228,0.12)_0%,_transparent_70%)] animate-[pulse_14s_ease-in-out_infinite]"></div>

            <svg
              className="absolute inset-0 w-full h-full"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <pattern id="cyber-grid" width="60" height="60" patternUnits="userSpaceOnUse">
                  <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#cyber-grid)" />

              <path d="M-200,700 C400,800 600,200 1200,200" stroke="#E6007A" strokeWidth="1.5" fill="none" opacity="0.1">
                <animate attributeName="opacity" values="0.1;0.6;0.1" dur="6s" repeatCount="indefinite" />
              </path>
              <path d="M-200,800 C500,900 700,300 1200,300" stroke="#5E72E4" strokeWidth="1" fill="none" opacity="0.1">
                <animate attributeName="opacity" values="0.1;0.5;0.1" dur="9s" repeatCount="indefinite" />
              </path>
              <path d="M-200,900 C600,1000 800,400 1200,400" stroke="#E6007A" strokeWidth="0.5" fill="none" opacity="0.1">
                <animate attributeName="opacity" values="0.1;0.4;0.1" dur="12s" repeatCount="indefinite" />
              </path>
            </svg>
          </div>
          {/* Global Navigation Bar */}
          <Navbar />
          {/* Page Content */}
          <div className="pt-8">
            {children}
          </div>
        </Web3Provider>
      </body>
    </html>
  )
}