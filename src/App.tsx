import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'

// ponytail: placeholder until S1-01 brings the AppShell and module routes.
function Home() {
  useEffect(() => {
    document.title = 'Concreat Hub'
  }, [])
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Concreat Hub</h1>
      <p className="mt-2 text-muted-foreground">Project scaffold is running.</p>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
