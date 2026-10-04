/** GET /_api/serverlogics/me. Field names follow the wireframe (ACCOUNTS[], CURRENT_USER). */
export interface MeDto {
  contact: { name: string; email: string }
  /** company: "Solid Cement" | "APO Cement" */
  account: { customerNo: string; customerName: string; company: string }
  /** Web role names, e.g. "Authenticated Users", "Full Access". */
  roles: string[]
}
