import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Exocore Next.js App',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0f0f0f', color: '#fff', fontFamily: 'sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
