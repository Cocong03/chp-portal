import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { requestActivation } from '@/auth/session'
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
  const [sentTo, setSentTo] = useState<string>()
  const [failed, setFailed] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async ({ email }) => {
    setFailed(false)
    try {
      await requestActivation(email)
      setSentTo(email)
    } catch {
      setFailed(true)
    }
  })

  if (sentTo) {
    return (
      <AuthLayout>
        <AuthCardHeader title="Check your email" />
        <p className="text-center text-[13px] leading-normal text-muted-foreground">
          If <strong className="text-foreground">{sentTo}</strong> is registered to a Concreat Holdings customer account, we've sent an
          activation link to it. The link can be used once and expires in 7 days.
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
