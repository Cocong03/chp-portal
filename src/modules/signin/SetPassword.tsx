import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { InvalidInvitationError, redeemInvitation } from '@/auth/session'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/ui/field'
import { Input } from '@/ui/input'
import { PasswordInput } from '@/ui/PasswordInput'
import { AuthCardHeader, AuthLayout, brandButton, FormAlert, inputClass, labelClass, SupportLine } from './AuthLayout'

// Mirrors Power Pages' default policy (PasswordValidator/EnforcePasswordPolicy = true, RequiredLength = 8).
// If sub-project B changes those site settings, change this schema and the hint together.
const KINDS = [/\p{Lu}/u, /\p{Ll}/u, /\p{Nd}/u, /[^\p{L}\p{N}]/u]
const hasThreeKinds = (password: string) => KINDS.filter((kind) => kind.test(password)).length >= 3

const schema = z
  .object({
    email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
    password: z
      .string()
      .min(1, 'Enter a password.')
      .min(8, 'Use at least 8 characters.')
      .refine(hasThreeKinds, 'Use at least three of: uppercase letters, lowercase letters, numbers, symbols.'),
    confirm: z.string(),
  })
  .refine((values) => values.confirm === values.password, { message: "Passwords don't match.", path: ['confirm'] })
type Values = z.infer<typeof schema>

const FALLBACK_ERROR = "We couldn't activate your account. Please try again, or contact the Concreat Customer Service Center at (02) 8849-3600."

export function SetPassword() {
  usePageTitle('Set your password')
  const [params] = useSearchParams()
  const code = params.get('code')
  const [expired, setExpired] = useState(!code)
  const [serverError, setServerError] = useState<string>()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', confirm: '' } })

  const onSubmit = handleSubmit(async ({ email, password, confirm }) => {
    if (!code) return
    setServerError(undefined)
    try {
      await redeemInvitation(code, email, password, confirm)
    } catch (error) {
      if (error instanceof InvalidInvitationError) setExpired(true)
      else setServerError(error instanceof Error && error.message ? error.message : FALLBACK_ERROR)
    }
  })

  if (expired) {
    return (
      <AuthLayout>
        <AuthCardHeader title="This link has expired" />
        <p className="text-center text-[13px] text-muted-foreground">
          This activation link is invalid, has already been used, or has expired.
        </p>
        <Button asChild className={cn(brandButton, 'mt-6')}>
          <Link to="/activate">Request a new link</Link>
        </Button>
        <SupportLine />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthCardHeader title="Set your password" sub="Create a password to finish activating your Concreat Connect account." />
      <form noValidate onSubmit={onSubmit}>
        <FieldGroup className="gap-[18px]">
          <Field data-invalid={errors.email ? true : undefined}>
            <FieldLabel htmlFor="setpw-email" className={labelClass}>
              Email address
            </FieldLabel>
            <Input id="setpw-email" type="email" autoComplete="email" className={inputClass} aria-invalid={!!errors.email} {...register('email')} />
            <FieldDescription>The email address the activation link was sent to.</FieldDescription>
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={errors.password ? true : undefined}>
            <FieldLabel htmlFor="setpw-password" className={labelClass}>
              Password
            </FieldLabel>
            <PasswordInput
              id="setpw-password"
              autoComplete="new-password"
              className={inputClass}
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            <FieldDescription>At least 8 characters, using three of these: uppercase letters, lowercase letters, numbers, symbols.</FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={errors.confirm ? true : undefined}>
            <FieldLabel htmlFor="setpw-confirm" className={labelClass}>
              Confirm password
            </FieldLabel>
            <PasswordInput
              id="setpw-confirm"
              autoComplete="new-password"
              className={inputClass}
              aria-invalid={!!errors.confirm}
              {...register('confirm')}
            />
            <FieldError errors={[errors.confirm]} />
          </Field>
        </FieldGroup>
        {serverError && <FormAlert>{serverError}</FormAlert>}
        <Button type="submit" disabled={isSubmitting} className={cn(brandButton, 'mt-5')}>
          {isSubmitting ? 'Activating…' : 'Activate account'}
        </Button>
      </form>
      <SupportLine />
    </AuthLayout>
  )
}
