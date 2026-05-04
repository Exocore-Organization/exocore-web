import { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif', background: '#0f0f0f', color: '#fff' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚡ Exocore React</h1>
      <p style={{ opacity: 0.6, marginBottom: '2rem' }}>Edit <code>src/App.tsx</code> to get started</p>
      <button
        onClick={() => setCount(c => c + 1)}
        style={{ padding: '0.75rem 2rem', fontSize: '1rem', borderRadius: '8px', border: 'none', background: '#00a1ff', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
      >
        count is {count}
      </button>
    </div>
  )
}
