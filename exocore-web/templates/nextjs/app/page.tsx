'use client'
import { useState } from 'react'

export default function Home() {
  const [count, setCount] = useState(0)
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem' }}>
      <h1 style={{ fontSize: '2.5rem' }}>⚡ Exocore Next.js</h1>
      <p style={{ opacity: 0.6 }}>Edit <code>app/page.tsx</code> to get started</p>
      <button onClick={() => setCount(c => c + 1)} style={{ padding: '0.75rem 2rem', fontSize: '1rem', borderRadius: '8px', border: 'none', background: '#000', color: '#fff', cursor: 'pointer', fontWeight: 700, outline: '1px solid #333' }}>
        count is {count}
      </button>
    </main>
  )
}
