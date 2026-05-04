import { useState } from 'react'

export default function Index() {
  const [count, setCount] = useState(0)
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem' }}>
      <h1 style={{ fontSize: '2.5rem' }}>⚡ Exocore Remix</h1>
      <p style={{ opacity: 0.6 }}>Edit <code>app/routes/_index.tsx</code> to get started</p>
      <button onClick={() => setCount(c => c + 1)} style={{ padding: '0.75rem 2rem', fontSize: '1rem', borderRadius: '8px', border: 'none', background: '#e8f2ff', color: '#121212', cursor: 'pointer', fontWeight: 700 }}>
        count is {count}
      </button>
    </main>
  )
}
