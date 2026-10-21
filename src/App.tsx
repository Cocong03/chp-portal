import { Navigate, Route, Routes } from 'react-router-dom'
import { getPortalUser } from '@/auth/session'
import { AppShell } from '@/layout/AppShell'
import { SECTIONS } from '@/layout/sections'
import { SectionRoute } from '@/layout/SectionRoute'
import { Activate } from '@/modules/signin/Activate'
import { ForgotPassword } from '@/modules/signin/ForgotPassword'
import { ResetPassword } from '@/modules/signin/ResetPassword'
import { SetPassword } from '@/modules/signin/SetPassword'
import { SignIn } from '@/modules/signin/SignIn'

export default function App() {
  if (!getPortalUser()) {
    return (
      <Routes>
        <Route path="/" element={<SignIn />} />
        <Route path="/activate" element={<Activate />} />
        <Route path="/activate/complete" element={<SetPassword />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }
  return (
    <Routes>
      <Route element={<AppShell />}>
        {SECTIONS.map((section) => (
          // Sections own their subpaths (/orders/new); the Dashboard is exactly "/".
          <Route key={section.key} path={section.path === '/' ? '/' : `${section.path}/*`} element={<SectionRoute section={section} />} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
