import { PAYLOADS, proposalToOps, type Op, type ProposalTarget } from "./proposals";

export type StoredProposal = { id: string; client_id: string; target: ProposalTarget; payload: unknown; status: "pending" | "accepted" | "rejected" };

export type Feedback = {
  client_id: string; proposal_id: string; outcome: "accepted" | "edited" | "rejected"; comment: string | null; original: unknown; final: unknown;
};

/** Persistence needed to decide a proposal. The web app implements it with the user's own database session. */
export interface ProposalRepo {
  get(id: string): Promise<StoredProposal | null>;
  /** Atomically move a PENDING proposal to `status`. Returns false if it was already decided (e.g. a double click). */
  claim(id: string, status: "accepted" | "rejected"): Promise<boolean>;
  /** Put a claimed proposal back to pending (needs elevated rights: decided proposals are otherwise immutable). */
  release(id: string): Promise<void>;
  apply(clientId: string, target: ProposalTarget, ops: Op[]): Promise<void>;
  feedback(f: Feedback): Promise<void>;
}

export type DecideResult =
  | { ok: true; outcome: "accepted" | "edited" | "rejected" }
  | { ok: false; error: "not_found" | "already_decided" | "invalid" | "apply_failed" };

const canon = (target: ProposalTarget, v: unknown): string | null => {
  const r = PAYLOADS[target].safeParse(v);
  return r.success ? JSON.stringify(r.data) : null;
};

/**
 * Accept (optionally with the person's edits) or reject a proposal.
 * Order matters: validate and compute the operations BEFORE claiming, claim exactly once, apply,
 * and put the claim back if applying fails so nothing is lost. Feedback is the learning signal:
 * accepted as proposed, accepted after edits (with before/after), or rejected (with a reason).
 */
export async function decideProposal(
  repo: ProposalRepo,
  input: { proposalId: string; decision: "accept" | "reject"; edited?: unknown; comment?: string },
): Promise<DecideResult> {
  const p = await repo.get(input.proposalId);
  if (!p) return { ok: false, error: "not_found" };
  if (p.status !== "pending") return { ok: false, error: "already_decided" };
  const comment = input.comment?.trim().slice(0, 1000) || null;

  if (input.decision === "reject") {
    if (!(await repo.claim(p.id, "rejected"))) return { ok: false, error: "already_decided" };
    await repo.feedback({ client_id: p.client_id, proposal_id: p.id, outcome: "rejected", comment, original: p.payload, final: null }).catch(() => {});
    return { ok: true, outcome: "rejected" };
  }

  const final = input.edited !== undefined ? input.edited : p.payload;
  let ops: Op[];
  try { ops = proposalToOps(p.target, final); } catch { return { ok: false, error: "invalid" }; }

  if (!(await repo.claim(p.id, "accepted"))) return { ok: false, error: "already_decided" };
  try {
    await repo.apply(p.client_id, p.target, ops);
  } catch {
    await repo.release(p.id).catch(() => {});
    return { ok: false, error: "apply_failed" };
  }
  const before = canon(p.target, p.payload), after = canon(p.target, final);
  const edited = input.edited !== undefined && before !== after;
  await repo.feedback({ client_id: p.client_id, proposal_id: p.id, outcome: edited ? "edited" : "accepted", comment, original: p.payload, final }).catch(() => {});
  return { ok: true, outcome: edited ? "edited" : "accepted" };
}
