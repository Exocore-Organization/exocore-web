import { createSignal } from 'solid-js'

export default function App() {
  const [count, setCount] = createSignal(0)

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'justify-content': 'center', 'min-height': '100vh', 'font-family': 'sans-serif', background: '#0f0f0f', color: '#fff', gap: '1rem' }}>
      <h1 style={{ 'font-size': '2.5rem' }}>⚡ Exocore Solid</h1>
      <p style={{ opacity: '0.6' }}>Edit <code>src/App.tsx</code> to get started</p>
      <button
        onClick={() => setCount(c => c + 1)}
        style={{ padding: '0.75rem 2rem', 'font-size': '1rem', 'border-radius': '8px', border: 'none', background: '#2c4f7c', color: '#fff', cursor: 'pointer', 'font-weight': '700' }}
      >
        count is {count()}
      </button>
    </div>
  )
}
