/** Mirrors public.employees in the Hub Supabase project. */
export interface Employee {
  id: string;
  auth_user_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  department: string | null;
  designation: string | null;
  employee_code: string | null;
  is_active: boolean | null;
}

/** LCS module id used in public.employee_module_access / roles.default_modules. */
export const LCS_MODULE_ID = "lcs" as const;

/** Roles that get LCS by default (PRD §6.1 / §7). */
export type LcsRole =
  | "site_engineer"
  | "project_manager"
  | "procurement"
  | "finance"
  | "management"
  | "founder"
  | "admin"
  | "ai";

// ---- Phase 2 masters ----
export type ContractorType = "agency" | "labour";
export type WorkOrderTrack = "measured" | "attendance";
/** For type='labour': B = thekedar (paid as a group) · C = direct (we pay each worker). */
export type LabourEngagement = "thekedar" | "direct";

export interface ContractorProfile {
  id: string;
  supplier_ref: string | null;
  type: ContractorType;
  labour_engagement: LabourEngagement | null;
  name: string | null;
  phone: string | null;
  gstin: string | null;
  pan: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_holder_name: string | null;
  bank_ifsc: string | null;
  kyc_status: "pending" | "verified" | "rejected";
  bank_verified: boolean;
  default_retention_pct: number;
  performance_score: number | null;
  status: "active" | "inactive" | "blacklisted";
  payment_mode: PaymentMode;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** lcs.v_contractors — contractor_profiles LEFT JOIN cps.cps_suppliers. */
export interface ContractorView extends ContractorProfile {
  display_name: string | null;
  supplier_name: string | null;
  supplier_gstin: string | null;
  supplier_pan: string | null;
  supplier_bank_name: string | null;
  supplier_bank_ifsc: string | null;
  supplier_bank_last4: string | null;
  supplier_categories: string[] | null;
}

/** lcs.v_cps_suppliers — read-only supplier directory for the link picker. */
export interface SupplierOption {
  id: string;
  name: string | null;
  gstin: string | null;
  pan: string | null;
  bank_name: string | null;
  bank_account_last4: string | null;
  bank_ifsc: string | null;
  categories: string[] | null;
  status: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  bank_account_holder_name: string | null;
  bank_account_number: string | null;
}

export interface Project {
  id: string;
  name: string;
  client: string | null;
  location: string | null;
  budget: number | null;
  design_pm_employee_id: string | null;
  project_head_employee_id: string | null;
  status: "active" | "on_hold" | "closed";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkOrder {
  id: string;
  wo_no: string;
  contractor_profile_id: string;
  project_id: string;
  track: WorkOrderTrack;
  scope: string | null;
  wo_value: number;
  payment_terms: string | null;
  retention_pct: number;
  advance_pct: number;
  ld_clause: string | null;
  dlp_months: number;
  status: "draft" | "active" | "on_hold" | "closed";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoqItem {
  id?: string;
  work_order_id?: string;
  description: string;
  unit: string | null;
  agreed_rate: number;
  total_qty: number;
}

/** Roles allowed to manage each master (mirrors lcs RLS write policies). */
export type PaymentMode = "cash" | "upi" | "bank_transfer";

export interface Worker {
  id: string;
  contractor_profile_id: string;
  name: string;
  phone: string | null;
  skill: string | null;
  day_rate: number;
  aadhaar_last4: string | null;
  is_active: boolean;
  payment_mode: PaymentMode;
  upi_id: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_account_holder_name: string | null;
  payment_verified: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Editable worker draft used in onboarding (direct) and the workers panel. */
export interface WorkerDraft {
  name: string;
  phone: string;
  skill: string;
  day_rate: string;
  payment_mode: PaymentMode;
  upi_id: string;
  bank_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_account_holder_name: string;
  payment_verified: boolean;
}

export const emptyWorkerDraft = (): WorkerDraft => ({
  name: "", phone: "", skill: "", day_rate: "",
  payment_mode: "cash", upi_id: "",
  bank_name: "", bank_account_number: "", bank_ifsc: "", bank_account_holder_name: "",
  payment_verified: false,
});

/** Validate a worker draft's payment details by mode. Returns an error string or null. */
export function validateWorkerDraft(w: WorkerDraft): string | null {
  if (!w.name.trim()) return "worker name";
  if (w.payment_mode === "upi" && !w.upi_id.trim()) return "UPI ID";
  if (w.payment_mode === "bank_transfer" && (!w.bank_account_number.trim() || !w.bank_ifsc.trim()))
    return "bank account + IFSC";
  return null;
}

/** Map a draft to a workers-table insert payload. */
export function workerDraftToRow(w: WorkerDraft, contractorId: string, createdBy: string | null) {
  return {
    contractor_profile_id: contractorId,
    name: w.name.trim(),
    phone: w.phone.trim() || null,
    skill: w.skill.trim() || null,
    day_rate: Number(w.day_rate) || 0,
    payment_mode: w.payment_mode,
    upi_id: w.upi_id.trim() || null,
    bank_name: w.bank_name.trim() || null,
    bank_account_number: w.bank_account_number.trim() || null,
    bank_ifsc: w.bank_ifsc.trim() || null,
    bank_account_holder_name: w.bank_account_holder_name.trim() || null,
    payment_verified: w.payment_verified,
    created_by: createdBy,
  };
}

/** lcs.v_cps_projects — read-only CPS project directory for the import picker. */
export interface CpsProject {
  id: string;
  name: string;
  code: string | null;
  site_address: string | null;
  site_incharge_name: string | null;
  active: boolean;
}

export const OPS_ROLES = ["procurement", "admin", "ai", "management", "founder"] as const;
export const PROJECT_ADMIN_ROLES = ["admin", "ai", "management", "founder"] as const;
export const canManageOps = (role: string | null) => !!role && (OPS_ROLES as readonly string[]).includes(role);
export const canManageProjects = (role: string | null) => !!role && (PROJECT_ADMIN_ROLES as readonly string[]).includes(role);
