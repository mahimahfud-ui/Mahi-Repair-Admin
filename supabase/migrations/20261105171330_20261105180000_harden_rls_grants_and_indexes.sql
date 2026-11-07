-- Harden Data API grants and keep internal rate-limit state outside exposed schemas.
-- These changes are safe for a fresh Mahi-Repair project and preserve all recipe data.

-- Remove inherited browser access from the internal rate-limit table, then move it
-- into the non-exposed private schema.
ALTER TABLE public.rate_limit_buckets SET SCHEMA private;
REVOKE ALL ON TABLE private.rate_limit_buckets FROM PUBLIC, anon, authenticated;

-- New Supabase projects no longer grant Data API access to new public tables by default.
-- Make the intended access explicit: authenticated SELECT only, with RLS as the row gate.
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT ON TABLE
  public.profiles,
  public.devices,
  public.repair_tools,
  public.repair_tool_versions,
  public.repair_tool_access,
  public.repair_runs,
  public.device_tool_syncs,
  public.admin_audit_logs,
  public.recipe_test_history
TO authenticated;

-- Anonymous users have no direct table access. Authenticated users have no browser writes.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Internal rate-limit state is only reachable through the service-role-only RPC.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  now_at timestamptz := now();
  current_count integer;
BEGIN
  INSERT INTO private.rate_limit_buckets(bucket_key, window_started_at, request_count)
  VALUES (p_bucket_key, now_at, 1)
  ON CONFLICT (bucket_key) DO UPDATE SET
    window_started_at = CASE
      WHEN private.rate_limit_buckets.window_started_at < now_at - make_interval(secs => p_window_seconds)
      THEN now_at
      ELSE private.rate_limit_buckets.window_started_at
    END,
    request_count = CASE
      WHEN private.rate_limit_buckets.window_started_at < now_at - make_interval(secs => p_window_seconds)
      THEN 1
      ELSE private.rate_limit_buckets.request_count + 1
    END;

  SELECT request_count INTO current_count
  FROM private.rate_limit_buckets
  WHERE bucket_key = p_bucket_key;

  RETURN current_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer)
  TO service_role;

-- Trigger helpers do not need a mutable search_path.
ALTER FUNCTION private.set_updated_at() SET search_path = '';
ALTER FUNCTION private.reject_version_mutation() SET search_path = '';
ALTER FUNCTION private.reject_audit_mutation() SET search_path = '';

-- Index foreign-key columns that were not covered by an existing index.
CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_id_idx
  ON public.admin_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS device_tool_syncs_tool_id_idx
  ON public.device_tool_syncs(tool_id);
CREATE INDEX IF NOT EXISTS recipe_test_history_tool_id_idx
  ON public.recipe_test_history(tool_id);
CREATE INDEX IF NOT EXISTS repair_runs_device_id_idx
  ON public.repair_runs(device_id);
CREATE INDEX IF NOT EXISTS repair_tool_access_assigned_by_idx
  ON public.repair_tool_access(assigned_by);
CREATE INDEX IF NOT EXISTS repair_tool_versions_published_by_idx
  ON public.repair_tool_versions(published_by);
CREATE INDEX IF NOT EXISTS repair_tools_created_by_idx
  ON public.repair_tools(created_by);

-- Combine equivalent read policies and evaluate identity helpers once per statement.
DROP POLICY IF EXISTS "profiles self or owner read" ON public.profiles;
CREATE POLICY "profiles self or owner read"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT private.is_owner()));

DROP POLICY IF EXISTS "devices owner or device owner read" ON public.devices;
CREATE POLICY "devices owner or device owner read"
  ON public.devices FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_owner()));

DROP POLICY IF EXISTS "owners read repair tools" ON public.repair_tools;
DROP POLICY IF EXISTS "members read accessible published tools" ON public.repair_tools;
CREATE POLICY "owner or assigned member reads repair tools"
  ON public.repair_tools FOR SELECT TO authenticated
  USING ((SELECT private.is_owner()) OR (SELECT private.can_access_tool(id)));

DROP POLICY IF EXISTS "owner reads versions" ON public.repair_tool_versions;
DROP POLICY IF EXISTS "members read accessible versions" ON public.repair_tool_versions;
CREATE POLICY "owner or assigned member reads versions"
  ON public.repair_tool_versions FOR SELECT TO authenticated
  USING ((SELECT private.is_owner()) OR (SELECT private.can_access_tool(tool_id)));

DROP POLICY IF EXISTS "owner reads assignments" ON public.repair_tool_access;
DROP POLICY IF EXISTS "members read own assignments" ON public.repair_tool_access;
CREATE POLICY "owner or member reads assignments"
  ON public.repair_tool_access FOR SELECT TO authenticated
  USING ((SELECT private.is_owner()) OR member_id = (SELECT auth.uid()));
