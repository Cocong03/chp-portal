import { useMe } from '@/auth/useMe'

export function partOfDay(hour: number) {
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
}

/** BC person contacts arrive as "PROP.: ERLINDA ARENAS GAWAN": drop the role label and title-case all-caps names.
 * ponytail: the whole name, not a first name — BC has no first-name field and name order varies. */
export function greetingName(name: string) {
  const bare = name.replace(/^[^:]*:\s*/, '').trim()
  return bare === bare.toUpperCase() ? bare.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase()) : bare
}

/** The old mockup's Dashboard greeting, by the viewer's own clock. */
export function Greeting() {
  const me = useMe().data
  if (!me) return null
  const name = greetingName(me.contact.name)
  return (
    <div className="mb-5">
      <p className="mb-1 text-[19px] font-bold">
        Good {partOfDay(new Date().getHours())}
        {name && `, ${name}`}
      </p>
      <p className="text-[13px] text-muted-foreground">
        Welcome back to Concreat Connect
        {me.account && (
          <>
            {" — here's what's happening with "}
            <strong className="font-semibold text-foreground">{me.account.company}</strong> ({me.account.customerName}) today
          </>
        )}
        .
      </p>
    </div>
  )
}
