import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

test('renders the home placeholder and sets the page title', () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: 'Concreat Hub' })).toBeInTheDocument()
  expect(document.title).toBe('Concreat Hub')
})
