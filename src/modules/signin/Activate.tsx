import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { type ActivationStatus, requestActivation } from '@/auth/session'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/ui/button'
import { Field, FieldError, FieldLabel } from '@/ui/field'
import { Input } from '@/ui/input'
import { ActivationNote, AuthCardHeader, AuthLayout, brandButton, FormAlert, inputClass, labelClass, SupportLine } from './AuthLayout'

// Copy from the spec (no wireframe screen; pending client review).
const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
})
type Values = z.infer<typeof schema>

export function Activate() {
  usePageTitle('Activate your account')
  const [result, setResult] = useState<{ status: ActivationStatus; email: string }>()
  const [failed, setFailed] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async ({ email }) => {
    setFailed(false)
    try {
      setResult({ status: await requestActivation(email), email })
    } catch {
      setFailed(true)
    }
  })

  if (result?.status === 'needs_help') {
    return (
      <AuthLayout>
        <AuthCardHeader title="We couldn't activate this email automatically" />
        <p className="text-center text-[13px] leading-normal text-muted-foreground">
          This email address is linked to more than one Concreat customer account, so it needs to be set up by our team. Please contact the
          Concreat Customer Service Center at (02) 8849-3600.
        </p>
        <p className="mt-[18px] text-center text-[13px]">
          <Link to="/" className="font-semibold text-primary">
            Back to sign in
          </Link>
        </p>
      </AuthLayout>
    )
  }

  if (result?.status === 'already_active') {
    return (
      <AuthLayout>
        <AuthCardHeader title="Your account is already active" />
        <p className="text-center text-[13px] leading-normal text-muted-foreground">
          Sign in with your email and password. If you've forgotten your password, you can reset it.
        </p>
        <Button asChild className={cn(brandButton, 'mt-6')}>
          <Link to="/">Sign in</Link>
        </Button>
        <p className="mt-[18px] text-center text-[13px]">
          <Link to="/forgot-password" className="font-semibold text-primary">
            Reset password
          </Link>
        </p>
      </AuthLayout>
    )
  }

  if (result) {
    return (
      <AuthLayout>
        <AuthCardHeader title="Check your email" />
        <p className="text-center text-[13px] leading-normal text-muted-foreground">
          If <strong className="text-foreground">{result.email}</strong> is registered to a Concreat Holdings customer account, we've sent an
          activation link to it. The link can be used once and expires in 24 hours.
        </p>
        <p className="mt-3.5 text-center text-[12.5px] leading-normal text-muted-foreground">
          Didn't get it? Check your spam or junk folder, or contact the <strong>Concreat Customer Service Center</strong> at{' '}
          <strong>(02) 8849-3600</strong>.
        </p>
        <p className="mt-[18px] text-center text-[13px]">
          <Link to="/" className="font-semibold text-primary">
            Back to sign in
          </Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthCardHeader
        title="Activate your account"
        sub="Enter the email address registered to your customer account. We'll email you a link to set your password."
      />
      <form noValidate onSubmit={onSubmit}>
        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="activate-email" className={labelClass}>
            Email address
          </FieldLabel>
          <Input
            id="activate-email"
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            className={inputClass}
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          <FieldError errors={[errors.email]} />
        </Field>
        {failed && <FormAlert>We couldn't send the activation email right now. Please try again in a few minutes.</FormAlert>}
        <Button type="submit" disabled={isSubmitting} className={cn(brandButton, 'mt-5')}>
          {isSubmitting ? 'Sending…' : 'Send activation link'}
        </Button>
      </form>
      <p className="mt-[18px] text-center text-[13px] text-muted-foreground">
        Already activated?{' '}
        <Link to="/" className="font-semibold text-primary">
          Sign in
        </Link>
      </p>
      <ActivationNote />
      <SupportLine />
    </AuthLayout>
  )
}
