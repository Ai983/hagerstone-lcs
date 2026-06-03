import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ShieldCheck } from "lucide-react";
import type { PaymentMode, WorkerDraft } from "@/types";

/** One worker's editable fields incl. payment mode (cash / UPI / bank). */
export function WorkerFields({
  value,
  onChange,
  compact = false,
}: {
  value: WorkerDraft;
  onChange: (next: WorkerDraft) => void;
  compact?: boolean;
}) {
  const set = (patch: Partial<WorkerDraft>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Input placeholder="Name *" value={value.name} onChange={(e) => set({ name: e.target.value })} />
        <Input placeholder="Phone" value={value.phone} onChange={(e) => set({ phone: e.target.value })} />
        <Input placeholder="Skill (mason…)" value={value.skill} onChange={(e) => set({ skill: e.target.value })} />
        <Input type="number" placeholder="₹/day" value={value.day_rate} onChange={(e) => set({ day_rate: e.target.value })} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
        <div className="space-y-1">
          {!compact && <Label className="text-xs">Pay by</Label>}
          <Select value={value.payment_mode} onChange={(e) => set({ payment_mode: e.target.value as PaymentMode })}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank transfer</option>
          </Select>
        </div>

        {value.payment_mode === "upi" && (
          <div className="space-y-1 sm:col-span-2">
            {!compact && <Label className="text-xs">UPI ID *</Label>}
            <Input placeholder="name@bank" value={value.upi_id} onChange={(e) => set({ upi_id: e.target.value })} />
          </div>
        )}

        {value.payment_mode === "bank_transfer" && (
          <>
            <div className="space-y-1">
              {!compact && <Label className="text-xs">Account no. *</Label>}
              <Input placeholder="Account number" value={value.bank_account_number} onChange={(e) => set({ bank_account_number: e.target.value })} />
            </div>
            <div className="space-y-1">
              {!compact && <Label className="text-xs">IFSC *</Label>}
              <Input placeholder="IFSC" value={value.bank_ifsc} onChange={(e) => set({ bank_ifsc: e.target.value })} />
            </div>
          </>
        )}
      </div>

      {value.payment_mode === "bank_transfer" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input placeholder="Bank name" value={value.bank_name} onChange={(e) => set({ bank_name: e.target.value })} />
          <Input placeholder="Account holder" value={value.bank_account_holder_name} onChange={(e) => set({ bank_account_holder_name: e.target.value })} />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.payment_verified} onChange={(e) => set({ payment_verified: e.target.checked })} className="h-4 w-4" />
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        Payment details verified by a human
      </label>
    </div>
  );
}
