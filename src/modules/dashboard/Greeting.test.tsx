import { screen } from '@testing-library/react'
import { renderApp } from '@/test/render'
import { Greeting, greetingName, partOfDay } from './Greeting'

test('the greeting follows the hour on the viewer\'s clock', () => {
  expect([0, 11, 12, 17, 18, 23].map(partOfDay)).toEqual(['morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening'])
})

test('BC contact names lose their role label and shouting, other names stay as typed', () => {
  expect(greetingName('PROP.: ERLINDA ARENAS GAWAN')).toBe('Erlinda Arenas Gawan')
  expect(greetingName('AUTH.REP.: NATIVIDAD SANTOS')).toBe('Natividad Santos')
  expect(greetingName('J.D. Santos')).toBe('J.D. Santos')
  expect(greetingName('MARIA DELA CRUZ-REYES')).toBe('Maria Dela Cruz-Reyes')
  expect(greetingName('')).toBe('')
})

test('greets the signed-in contact and names the company and account', async () => {
  renderApp(<Greeting />)
  expect(await screen.findByText(/^Good (morning|afternoon|evening), J\.D\. Santos$/)).toBeInTheDocument()
  expect(screen.getByText(/Welcome back to Concreat Connect/)).toHaveTextContent(
    "Welcome back to Concreat Connect — here's what's happening with Solid Cement (J.D. Santos Hardware & Construction Supply) today.",
  )
})
