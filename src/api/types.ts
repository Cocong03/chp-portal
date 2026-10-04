/** GET /_api/serverlogics/me. Field names follow the wireframe (ACCOUNTS[], CURRENT_USER). */
export interface MeDto {
  contact: { name: string; email: string }
  /** null when the contact isn't linked to a customer account yet. company: "Solid Cement" | "APO Cement" */
  account: { customerNo: string; customerName: string; company: string } | null
  /** Web role names, e.g. "Authenticated Users", "Full Access". */
  roles: string[]
}

/** GET /_api/serverlogics/company. Field names follow the wireframe's ACCOUNTS[]. */
export interface CompanyDto {
  customerNo: string
  customerName: string
  address: string
  vatRegNumber: string
  phone: string
  email: string
}
