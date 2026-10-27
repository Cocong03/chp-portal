import { SECTIONS } from '@/layout/sections'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/dialog'

// S1-10 basic help: the wireframe help modal's eight overviews, for every role.
export function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-40px)] overflow-y-auto p-[22px] sm:max-w-[720px]">
        {/* Left-aligned like the wireframe; right padding keeps the title clear of the close button on phones. */}
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>Getting around Concreat Connect</DialogTitle>
          <DialogDescription>A quick guide to what each section of the portal is for.</DialogDescription>
        </DialogHeader>
        <div className="my-[18px] flex flex-col gap-3.5">
          {SECTIONS.map((section) => (
            <div key={section.key}>
              <h3 className="mb-[3px] text-[13.5px] font-bold">{section.label}</h3>
              <p className="text-[13px] leading-normal text-muted-foreground">{section.help}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
