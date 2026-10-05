-- INSERT ... RETURNING on public.clients was rejected by RLS (42501).
-- RETURNING re-checks the SELECT policy against the new row, but clients_select called
-- can_access_client(id): a STABLE function that reads public.clients with the statement's snapshot,
-- which cannot see the row being inserted. Every other table is unaffected because its policy calls
-- can_access_client(client_id) for a client row that already exists.
--
-- Add a branch that needs no lookup of the new row: agency staff may see rows of their own agency.
-- current_agency_id() / is_staff() read profiles, which the statement never modifies. This grants
-- nothing new: staff could already see every client of their agency through can_access_client().
-- Client users (not staff) and other agencies are unaffected.
drop policy clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
  using (
    public.can_access_client(id)
    or (public.is_staff() and agency_id = public.current_agency_id())
  );
