import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { signIn } from '@/auth/session'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/ui/field'
import { Input } from '@/ui/input'
import { ActivationNote, AuthCardHeader, AuthLayout, brandButton, FormAlert, inputClass, labelClass, SupportLine } from './AuthLayout'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your user ID or email.'),
  password: z.string().min(1, 'Enter your password.'),
})
type Values = z.infer<typeof schema>

export function SignIn() {
  usePageTitle('Sign in')
  const [serverError, setServerError] = useState<string>()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(undefined)
    try {
      await signIn(email, password)
    } catch (error) {
      setServerError(error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.')
    }
  })

  return (
    <AuthLayout>
      <AuthCardHeader title="Sign in to Concreat Connect" sub="Use the access details provided for your customer account." />
      <form noValidate onSubmit={onSubmit}>
        <FieldGroup className="gap-[18px]">
          <Field data-invalid={errors.email ? true : undefined}>
            <FieldLabel htmlFor="signin-email" className={labelClass}>
              User ID or email
            </FieldLabel>
            <Input id="signin-email" autoComplete="username" className={inputClass} aria-invalid={!!errors.email} {...register('email')} />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={errors.password ? true : undefined}>
            <div className="flex items-baseline justify-between">
              <FieldLabel htmlFor="signin-password" className={labelClass}>
                Password
              </FieldLabel>
              <a href="/Account/Login/ForgotPassword" className="text-[12.5px] font-semibold text-primary">
                Forgot password?
              </a>
            </div>
            <Input
              id="signin-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••••"
              className={inputClass}
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            <FieldError errors={[errors.password]} />
          </Field>
        </FieldGroup>
        {serverError && <FormAlert>{serverError}</FormAlert>}
        <Button type="submit" disabled={isSubmitting} className={cn(brandButton, 'mt-5')}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-[18px] text-center text-[13px]">
        <Link to="/activate" className="font-semibold text-primary">
          Activate your account
        </Link>
      </p>
      <ActivationNote />
      <p className="mt-5 text-center text-[11.5px] leading-normal text-faint">
        By continuing, you acknowledge the{' '}
        <a href="#" className="text-primary">
          Terms of Use
        </a>{' '}
        and{' '}
        <a href="#" className="text-primary">
          Data Privacy Policy
        </a>
        .
      </p>
      <SupportLine />
    </AuthLayout>
  )
}
