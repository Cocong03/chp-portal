import { z } from 'zod'

// Mirrors Power Pages' default policy (PasswordValidator/EnforcePasswordPolicy = true, RequiredLength = 8).
// If those site settings change, change this and the hint together.
const KINDS = [/\p{Lu}/u, /\p{Ll}/u, /\p{Nd}/u, /[^\p{L}\p{N}]/u]
const hasThreeKinds = (password: string) => KINDS.filter((kind) => kind.test(password)).length >= 3

export const passwordField = z
  .string()
  .min(1, 'Enter a password.')
  .min(8, 'Use at least 8 characters.')
  .refine(hasThreeKinds, 'Use at least three of: uppercase letters, lowercase letters, numbers, symbols.')

export const PASSWORD_HINT = 'At least 8 characters, using three of these: uppercase letters, lowercase letters, numbers, symbols.'
