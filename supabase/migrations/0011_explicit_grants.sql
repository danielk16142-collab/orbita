-- Make API-role privileges explicit.
-- Supabase's default privileges grant ALL (incl. TRUNCATE, which ignores RLS) on every table,
-- sequence and function created after 0002's revokes to anon and authenticated. Strip those,
-- stop new objects inheriting them, then re-grant exactly what 0002-0009 intended.
-- RLS policies remain the row-level gate; this is the privilege layer beneath them.

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Revoking table privileges also revokes the matching column-level grants; those are re-added below.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Helper functions used by RLS policies and the storage policies.
grant execute on function
  public.current_agency_id(), public.current_role_name(), public.current_client_id(),
  public.can_access_client(uuid), public.is_staff(), public.is_admin(),
  public.can_edit_branding(uuid), public.logo_client_id(text)
to authenticated;

-- Full CRUD (policies decide the rows, triggers guard the columns).
grant select, insert, update, delete on
  public.agencies, public.clients, public.profiles, public.brand_briefs, public.proof_items,
  public.client_rules, public.competitors, public.posts, public.post_comments,
  public.conversations, public.messages,
  public.client_sources, public.brand_memories, public.proposals,
  public.strategies, public.research_notes
to authenticated;

-- Read-only from the API; written by the server with the service role.
grant select on public.metrics_daily, public.usage_events, public.audit_log,
  public.account_posts, public.sync_runs to authenticated;

grant select, insert, delete on public.audits to authenticated;
grant select, insert on public.generation_feedback, public.legal_acceptances to authenticated;
grant select, insert, update on public.data_requests to authenticated;

-- Column-level grants: secrets (tokens, token hashes) are never readable through the API.
grant select (id, client_id, network, external_id, handle, scopes, status, created_at,
              token_expires_at, last_synced_at, last_error, display_name)
  on public.social_accounts to authenticated;
grant select (id, agency_id, client_id, email, role, expires_at, used_at, created_by, created_at)
  on public.invitations to authenticated;
grant insert (agency_id, client_id, email, role, token_hash, expires_at) on public.invitations to authenticated;
grant delete on public.invitations to authenticated;
