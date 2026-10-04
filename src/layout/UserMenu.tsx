import { LogOut } from 'lucide-react'
import { signOut } from '@/auth/session'
import { Avatar, AvatarFallback } from '@/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu'

// Wireframe accountInitials(): first letters of the first two words that start with a letter.
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

export function UserMenu({ name }: { name: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full text-[13px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <Avatar className="size-[26px]">
          <AvatarFallback className="bg-primary text-[11px] font-bold text-primary-foreground">{initials(name)}</AvatarFallback>
        </Avatar>
        <span className="hidden lg:inline">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
