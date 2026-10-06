import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { requestPasswordReset } from '@/auth/session'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/ui/button'
import { Field, FieldError, FieldLabel } from '@/ui/field'
import { Input } from '@/ui/input'
import { AuthCardHeader, AuthLayout, brandButton, FormAlert, inputClass, labelClass, SupportLine } from './AuthLayout'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
})
type Values = z.infer<typeof schema>

export function ForgotPassword() {
  usePageTitle('Reset your password')
  const [sent, setSent] = useState(false)
  const [failure, setFailure] = useState<string>()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async ({ email }) => {
    setFailure(undefined)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "We couldn't reach the sign-in service. Please try again.")
    }
  })

  if (sent) {
    return (
      <AuthLayout>
        <AuthCardHeader title="Check your email" />
        <p className="text-center text-[13px] leading-normal text-muted-foreground">
          If this email has an active Concreat Connect account, we've sent a link to reset your password. The link expires in 1 hour.
        </p>
        <p className="mt-[18px] text-center text-[13px]">
          <Link to="/" className="font-semibold text-primary">
            Back to sign in
          </Link>
        </p>
        <SupportLine />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthCardHeader title="Reset your password" sub="Enter your email address and we'll send you a link to set a new password." />
      <form noValidate onSubmit={onSubmit}>
        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="forgot-email" className={labelClass}>
            Email address
          </FieldLabel>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            className={inputClass}
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          <FieldError errors={[errors.email]} />
        </Field>
        {failure && <FormAlert>{failure}</FormAlert>}
        <Button type="submit" disabled={isSubmitting} className={cn(brandButton, 'mt-5')}>
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <p className="mt-[18px] text-center text-[13px]">
        <Link to="/" className="font-semibold text-primary">
          Back to sign in
        </Link>
      </p>
      <SupportLine />
    </AuthLayout>
  )
}
