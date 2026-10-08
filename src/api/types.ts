/** GET /_api/serverlogics/me. Field names follow the wireframe (ACCOUNTS[], CURRENT_USER). */
export interface MeDto {
  contact: { name: string; email: string }
  /** null when the contact isn't linked to a customer account yet. company: "Solid Cement" | "APO Cement" */
  account: { customerNo: string; customerName: string; company: string } | null
  /** Web role names, e.g. "Authenticated Users", "Full Access". */
  roles: string[]
  /** BC switched this contact's portal access off (customerPortalAccess = false). */
  blocked?: boolean
}

/** GET /_api/serverlogics/company. Mirrors the wireframe's ACCOUNTS[] and PORTAL_CONTACTS[]. */
export interface CompanyDto {
  customerNo: string
  customerName: string
  address: string
  /** "" until BC exposes a website on the customer card. */
  website: string
  vatRegNumber: string
  phone: string
  email: string
  contacts: PortalContactDto[]
}

/** BC person contact of the customer, merged with portal activation and web role. */
export interface PortalContactDto {
  name: string
  /** "" until BC exposes a job title on its contacts. */
  title: string
  phone: string
  email: string
  /** Activated on this account + a business web role + BC customerPortalAccess. */
  portalAccess: boolean
  /** Highest business web role; "" when portalAccess is false. */
  portalRole: string
  isYou: boolean
}

/** GET /_api/serverlogics/sites. Mirrors the wireframe's SITES[]. */
export interface SiteDto {
  code: string
  name: string
  address: string
  city: string
  contact: string
  phone: string
  email: string
  isDefault: boolean
}

/** Dashboard banner (Dataverse chp_announcement, newest active row). Mirrors the wireframe's ANNOUNCEMENT. */
export interface AnnouncementDto {
  title: string
  message: string
}
