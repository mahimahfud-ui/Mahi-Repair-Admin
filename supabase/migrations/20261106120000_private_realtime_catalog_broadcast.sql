-- Private, device-scoped Broadcast notifications.
-- Events contain only an opaque event ID. Android always fetches current authorized
-- recipes from get-my-repair-tools and revalidates authorization before execution.

GRANT USAGE ON SCHEMA realtime TO authenticated;
GRANT SELECT ON TABLE realtime.messages TO authenticated;

DROP POLICY IF EXISTS "mahi repair member device broadcasts" ON realtime.messages;
CREATE POLICY "mahi repair member device broadcasts"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    -- Existing channels retain the evaluated policy cache long enough to receive the
    -- opaque suspension event. New connections require an active member profile.
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'member'
        AND p.status = 'active'
    )
    AND extension = 'broadcast'
    AND private IS TRUE
    AND EXISTS (
      SELECT 1
      FROM public.devices d
      WHERE d.user_id = (SELECT auth.uid())
        AND d.revoked_at IS NULL
        AND d.id::text = split_part(realtime.topic(), ':device:', 2)
        AND realtime.topic() =
          'mahi-repair:member:' || d.user_id::text || ':device:' || d.id::text
    )
  );

CREATE OR REPLACE FUNCTION private.broadcast_repair_device_event(
  p_user_id uuid,
  p_device_id uuid,
  p_event text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_event NOT IN ('catalog_changed', 'member_access_changed', 'device_revoked') THEN
    RAISE EXCEPTION 'INVALID_REPAIR_BROADCAST_EVENT';
  END IF;

  PERFORM realtime.send(
    jsonb_build_object('event_id', gen_random_uuid()::text),
    p_event,
    'mahi-repair:member:' || p_user_id::text || ':device:' || p_device_id::text,
    TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION private.broadcast_repair_device_event(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.broadcast_repair_tool_catalog_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_device record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.version IS NOT DISTINCT FROM NEW.version
     AND OLD.audience IS NOT DISTINCT FROM NEW.audience THEN
    RETURN NEW;
  END IF;

  FOR affected_device IN
    SELECT DISTINCT d.id AS device_id, d.user_id
    FROM public.devices d
    JOIN public.profiles p ON p.id = d.user_id
    LEFT JOIN public.device_tool_syncs synced
      ON synced.device_id = d.id AND synced.tool_id = NEW.id
    WHERE d.revoked_at IS NULL
      AND p.role = 'member'
      AND p.status = 'active'
      AND (
        synced.device_id IS NOT NULL
        OR (
          NEW.status = 'PUBLISHED'
          AND (
            NEW.audience = 'all_active_members'
            OR EXISTS (
              SELECT 1
              FROM public.repair_tool_access access
              WHERE access.tool_id = NEW.id
                AND access.member_id = d.user_id
            )
          )
        )
      )
  LOOP
    PERFORM private.broadcast_repair_device_event(
      affected_device.user_id,
      affected_device.device_id,
      'catalog_changed'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER repair_tools_private_catalog_broadcast
  AFTER INSERT OR UPDATE OF status, version, audience
  ON public.repair_tools
  FOR EACH ROW
  EXECUTE FUNCTION private.broadcast_repair_tool_catalog_changed();

CREATE OR REPLACE FUNCTION private.broadcast_repair_tool_access_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_device record;
  changed_tool_id uuid;
  changed_member_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    changed_tool_id := OLD.tool_id;
    changed_member_id := OLD.member_id;
  ELSE
    changed_tool_id := NEW.tool_id;
    changed_member_id := NEW.member_id;
  END IF;

  FOR affected_device IN
    SELECT d.id AS device_id, d.user_id
    FROM public.devices d
    JOIN public.profiles p ON p.id = d.user_id
    WHERE d.user_id = changed_member_id
      AND d.revoked_at IS NULL
      AND p.role = 'member'
      AND p.status = 'active'
  LOOP
    PERFORM private.broadcast_repair_device_event(
      affected_device.user_id,
      affected_device.device_id,
      'catalog_changed'
    );
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER repair_tool_access_private_catalog_broadcast
  AFTER INSERT OR DELETE
  ON public.repair_tool_access
  FOR EACH ROW
  EXECUTE FUNCTION private.broadcast_repair_tool_access_changed();

CREATE OR REPLACE FUNCTION private.broadcast_repair_member_access_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_device record;
  event_name text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  event_name := CASE
    WHEN NEW.status = 'active' THEN 'catalog_changed'
    ELSE 'member_access_changed'
  END;

  FOR affected_device IN
    SELECT d.id AS device_id, d.user_id
    FROM public.devices d
    WHERE d.user_id = NEW.id
      AND d.revoked_at IS NULL
  LOOP
    PERFORM private.broadcast_repair_device_event(
      affected_device.user_id,
      affected_device.device_id,
      event_name
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_private_access_broadcast
  AFTER UPDATE OF status
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.broadcast_repair_member_access_changed();

CREATE OR REPLACE FUNCTION private.broadcast_repair_device_access_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.revoked_at IS NOT DISTINCT FROM NEW.revoked_at THEN
    RETURN NEW;
  END IF;

  PERFORM private.broadcast_repair_device_event(
    NEW.user_id,
    NEW.id,
    CASE WHEN NEW.revoked_at IS NULL THEN 'catalog_changed' ELSE 'device_revoked' END
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER devices_private_access_broadcast
  AFTER UPDATE OF revoked_at
  ON public.devices
  FOR EACH ROW
  EXECUTE FUNCTION private.broadcast_repair_device_access_changed();

COMMENT ON POLICY "mahi repair member device broadcasts" ON realtime.messages IS
  'Allows an authenticated user to receive only opaque private Broadcast events on their own registered-device topic, including access-revocation notifications. It grants no repair recipe or Edge Function authorization.';


-- SECURITY DEFINER predicates are needed by authenticated RLS policies, but they
-- must not inherit PUBLIC/anon execution. Trigger handlers are trigger-only.
REVOKE ALL ON FUNCTION private.is_owner() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_active_member() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_access_tool(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_owner() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_active_member() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_tool(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.sync_user_email() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.broadcast_repair_device_event(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.broadcast_repair_tool_catalog_changed() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.broadcast_repair_tool_access_changed() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.broadcast_repair_member_access_changed() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.broadcast_repair_device_access_changed() FROM PUBLIC, anon, authenticated, service_role;


-- Owner-only realtime invalidation for the web Admin Console.
-- All changes are sent as an opaque event ID; clients refetch with their Owner session.
CREATE POLICY "mahi repair active owners admin broadcasts"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'owner'
        AND p.status = 'active'
    )
    AND extension = 'broadcast'
    AND private IS TRUE
    AND realtime.topic() = 'mahi-repair:admin'
  );

CREATE OR REPLACE FUNCTION private.broadcast_repair_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('event_id', gen_random_uuid()::text),
    'admin_data_changed',
    'mahi-repair:admin',
    TRUE
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.broadcast_repair_admin_change()
  FROM PUBLIC, anon, authenticated, service_role;

-- Send one invalidation after the transaction commits for any Admin-visible mutation.
-- No row values, member PII, recipe payloads, signatures, or credentials enter events.
DROP TRIGGER IF EXISTS repair_tools_admin_broadcast ON public.repair_tools;
CREATE TRIGGER repair_tools_admin_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON public.repair_tools
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_repair_admin_change();

DROP TRIGGER IF EXISTS profiles_admin_broadcast ON public.profiles;
CREATE TRIGGER profiles_admin_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_repair_admin_change();

DROP TRIGGER IF EXISTS devices_admin_broadcast ON public.devices;
CREATE TRIGGER devices_admin_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_repair_admin_change();

DROP TRIGGER IF EXISTS repair_tool_access_admin_broadcast ON public.repair_tool_access;
CREATE TRIGGER repair_tool_access_admin_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON public.repair_tool_access
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_repair_admin_change();

DROP TRIGGER IF EXISTS repair_runs_admin_broadcast ON public.repair_runs;
CREATE TRIGGER repair_runs_admin_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON public.repair_runs
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_repair_admin_change();

DROP TRIGGER IF EXISTS admin_audit_logs_admin_broadcast ON public.admin_audit_logs;
CREATE TRIGGER admin_audit_logs_admin_broadcast
  AFTER INSERT ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_repair_admin_change();

DROP TRIGGER IF EXISTS recipe_test_history_admin_broadcast ON public.recipe_test_history;
CREATE TRIGGER recipe_test_history_admin_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON public.recipe_test_history
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_repair_admin_change();
