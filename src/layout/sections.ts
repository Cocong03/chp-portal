import type { LucideIcon } from 'lucide-react'
import { ClipboardList, FileText, Folder, House, MapPin, MessageSquare, MessageSquareWarning, Users } from 'lucide-react'

export type SectionKey = 'dashboard' | 'sites' | 'orders' | 'ledger' | 'documents' | 'requests' | 'complaints' | 'account'

export interface Section {
  key: SectionKey
  path: string
  label: string
  /** Shown beside the label in the phone menu drawer. */
  icon: LucideIcon
  /** One-paragraph overview for the Help dialog (wireframe help modal, verbatim). */
  help: string
}

// Wireframe nav order and labels (`.app-sections`). Nav, routes, help and page titles all read this list.
export const SECTIONS: Section[] = [
  {
    key: 'dashboard',
    path: '/',
    label: 'Dashboard',
    icon: House,
    help: 'A quick greeting, your account balance and credit standing, and a live snapshot of your Sales Orders by status — click any tile to jump straight to those orders.',
  },
  {
    key: 'sites',
    path: '/sites',
    label: 'Delivery Sites',
    icon: MapPin,
    help: "The sites approved for delivery on your account. Request a new site, or a change to one already here, and track that request until it's approved.",
  },
  {
    key: 'orders',
    path: '/orders',
    label: 'Orders',
    icon: ClipboardList,
    help: 'Place a Single or Blanket Order, submit multiple orders at once, and track every order from submission through delivery and invoicing.',
  },
  {
    key: 'ledger',
    path: '/ledger',
    label: 'Customer Ledger',
    icon: FileText,
    help: "Your account's posted invoices, credit memos, and payments — the same figures reflected on the Dashboard.",
  },
  {
    key: 'documents',
    path: '/documents',
    label: 'Document Center',
    icon: Folder,
    help: 'Download invoices, credit memos, receipts, and a generated Statement of Account, any time.',
  },
  {
    key: 'requests',
    path: '/requests',
    label: 'Requests',
    icon: MessageSquare,
    help: 'Ask your account team about a sales order, a trip, a delivery, or a document copy, and track it through to resolution.',
  },
  {
    key: 'complaints',
    path: '/complaints',
    label: 'Complaints & Feedback',
    icon: MessageSquareWarning,
    help: "File a complaint about an order, delivery, or service, and track its status until it's resolved.",
  },
  {
    key: 'account',
    path: '/account',
    label: 'Account and User Management',
    icon: Users,
    help: 'Your registered company details, and who on your team can sign in to the portal and what they can see.',
  },
]
