import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { InvalidResetLinkError, resetPassword } from '@/auth/session'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/ui/field'
import { Input } from '@/ui/input'
import { PasswordInput } from '@/ui/PasswordInput'
import { AuthCardHeader, AuthLayout, brandButton, FormAlert, inputClass, labelClass, SupportLine } from './AuthLayout'
import { PASSWORD_HINT, passwordField } from './passwordPolicy'

const schema = z
  .object({ password: passwordField, confirm: z.string() })
  .refine((values) => values.confirm === values.password, { message: "Passwords don't match.", path: ['confirm'] })
type Values = z.infer<typeof schema>

export function ResetPassword() {
  usePageTitle('Set a new password')
  const [params] = useSearchParams()
  // Power Pages' reset link uses UserId and Code; the flow appends our email.
  const userId = params.get('UserId')
  const code = params.get('Code')
  const email = params.get('email') ?? ''
  const [state, setState] = useState<'form' | 'done' | 'expired'>(userId && code ? 'form' : 'expired')
  const [serverError, setServerError] = useState<string>()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } })

  const onSubmit = handleSubmit(async ({ password, confirm }) => {
    setServerError(undefined)
    try {
      await resetPassword(userId!, code!, password, confirm)
      setState('done')
    } catch (error) {
      if (error instanceof InvalidResetLinkError) setState('expired')
      else setServerError(error instanceof Error && error.message ? error.message : "We couldn't save your password. Please try again.")
    }
  })

  if (state === 'done') {
    return (
      <AuthLayout>
        <AuthCardHeader title="Your password has been reset" sub="Sign in with your email and your new password." />
        <Button asChild className={cn(brandButton, 'mt-2')}>
          <Link to="/">Sign in</Link>
        </Button>
        <SupportLine />
      </AuthLayout>
    )
  }

  if (state === 'expired') {
    return (
      <AuthLayout>
        <AuthCardHeader title="This link has expired" />
        <p className="text-center text-[13px] text-muted-foreground">This reset link is invalid or has expired.</p>
        <Button asChild className={cn(brandButton, 'mt-6')}>
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
        <SupportLine />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthCardHeader title="Set a new password" sub="Choose a new password for your Concreat Connect account." />
      <form noValidate onSubmit={onSubmit}>
        <FieldGroup className="gap-[18px]">
          <Field>
            <FieldLabel htmlFor="reset-email" className={labelClass}>
              Email address
            </FieldLabel>
            <Input id="reset-email" type="email" value={email} readOnly className={inputClass} />
          </Field>
          <Field data-invalid={errors.password ? true : undefined}>
            <FieldLabel htmlFor="reset-password" className={labelClass}>
              New password
            </FieldLabel>
            <PasswordInput id="reset-password" autoComplete="new-password" className={inputClass} aria-invalid={!!errors.password} {...register('password')} />
            <FieldDescription>{PASSWORD_HINT}</FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={errors.confirm ? true : undefined}>
            <FieldLabel htmlFor="reset-confirm" className={labelClass}>
              Confirm password
            </FieldLabel>
            <PasswordInput id="reset-confirm" autoComplete="new-password" className={inputClass} aria-invalid={!!errors.confirm} {...register('confirm')} />
            <FieldError errors={[errors.confirm]} />
          </Field>
        </FieldGroup>
        {serverError && <FormAlert>{serverError}</FormAlert>}
        <Button type="submit" disabled={isSubmitting} className={cn(brandButton, 'mt-5')}>
          {isSubmitting ? 'Saving…' : 'Save password'}
        </Button>
      </form>
      <SupportLine />
    </AuthLayout>
  )
}
