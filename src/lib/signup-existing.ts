// Sign-up for an address that already has an account (2026-10-28). Supabase
// does not say the address is taken: signUp() answers with a placeholder user
// whose identities list is empty, and sends no email. Treated as a success,
// the person is told to check their email, nothing arrives, and they try again
// (Iviani Figueroa, three times on Oct 28, on an account made for her with no
// password). Every sign-up form checks this right after signUp().
export const EXISTING_ACCOUNT_MESSAGE =
  'You already have an account with this email. Please use Sign In instead. If you do not know your password, use Forgot password, or ask the District Web Team for a temporary password.'

export function isExistingAccount(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0
}
