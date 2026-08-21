"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface PaymentEntry {
  agent: string;
  amount: string;
  receiver: string;
  txId: string;
  status: "settled" | "pending" | "failed";
}

interface PaymentAuditTableProps {
  payments: PaymentEntry[];
}

const STATUS_STYLES: Record<string, string> = {
  settled: "bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/30",
  pending: "bg-[#eab308]/10 text-[#eab308] border-[#eab308]/30",
  failed:  "bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/30",
};

function truncate(str: string, n = 12) {
  if (!str) return "—";
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

export function PaymentAuditTable({ payments }: PaymentAuditTableProps) {
  if (!payments || payments.length === 0) {
    return (
      <p className="text-sm text-[var(--tm-on-surface-var)] py-4 text-center">
        No payment records
      </p>
    );
  }

  return (
    /* Plain table — a ledger where every row is independently meaningful */
    <div className="rounded-xl overflow-hidden border border-white/[0.06]">
      <Table id="payment-audit-table">
        <TableHeader>
          <TableRow className="border-white/[0.06] hover:bg-transparent">
            <TableHead className="text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)]">Agent</TableHead>
            <TableHead className="text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)]">Amount</TableHead>
            <TableHead className="text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)] hidden sm:table-cell">Receiver</TableHead>
            <TableHead className="text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)] hidden md:table-cell">Tx ID</TableHead>
            <TableHead className="text-[10px] font-bold tracking-widest uppercase text-[var(--tm-on-surface-var)]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p, i) => (
            <TableRow
              key={i}
              className="border-white/[0.04] hover:bg-white/[0.03] transition-colors"
            >
              <TableCell className="font-medium text-sm">{p.agent}</TableCell>
              <TableCell className="font-mono text-sm text-[var(--tm-secondary)]">{p.amount}</TableCell>
              <TableCell className="font-mono text-xs text-[var(--tm-on-surface-var)] hidden sm:table-cell" title={p.receiver}>
                {truncate(p.receiver, 14)}
              </TableCell>
              <TableCell className="font-mono text-xs text-[var(--tm-on-surface-var)] hidden md:table-cell" title={p.txId}>
                {truncate(p.txId, 16)}
              </TableCell>
              <TableCell>
                <span className={`inline-block text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full border ${STATUS_STYLES[p.status] ?? ""}`}>
                  {p.status}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
