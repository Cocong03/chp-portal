export type SectionKey = 'dashboard' | 'sites' | 'orders' | 'ledger' | 'documents' | 'requests' | 'complaints' | 'account'

export interface Section {
  key: SectionKey
  path: string
  label: string
  /** One-paragraph overview for the Help dialog (wireframe help modal, verbatim). */
  help: string
}

// Wireframe nav order and labels (`.app-sections`). Nav, routes, help and page titles all read this list.
export const SECTIONS: Section[] = [
  {
    key: 'dashboard',
    path: '/',
    label: 'Dashboard',
    help: 'A quick greeting, your account balance and credit standing, and a live snapshot of your Sales Orders by status — click any tile to jump straight to those orders.',
  },
  {
    key: 'sites',
    path: '/sites',
    label: 'Delivery Sites',
    help: "The sites approved for delivery on your account. Request a new site, or a change to one already here, and track that request until it's approved.",
  },
  {
    key: 'orders',
    path: '/orders',
    label: 'Orders',
    help: 'Place a Single or Blanket Order, submit multiple orders at once, and track every order from submission through delivery and invoicing.',
  },
  {
    key: 'ledger',
    path: '/ledger',
    label: 'Customer Ledger',
    help: "Your account's posted invoices, credit memos, and payments — the same figures reflected on the Dashboard.",
  },
  {
    key: 'documents',
    path: '/documents',
    label: 'Document Center',
    help: 'Download invoices, credit memos, receipts, and a generated Statement of Account, any time.',
  },
  {
    key: 'requests',
    path: '/requests',
    label: 'Requests',
    help: 'Ask your account team about a sales order, a trip, a delivery, or a document copy, and track it through to resolution.',
  },
  {
    key: 'complaints',
    path: '/complaints',
    label: 'Complaints & Feedback',
    help: "File a complaint about an order, delivery, or service, and track its status until it's resolved.",
  },
  {
    key: 'account',
    path: '/account',
    label: 'Account and User Management',
    help: 'Your registered company details, and who on your team can sign in to the portal and what they can see.',
  },
]
