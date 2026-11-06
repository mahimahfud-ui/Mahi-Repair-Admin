-- Atomic member-side device/catalog transactions, publication lock ordering,
-- and relational constraints tying runs/syncs to their true owner and version.

ALTER TABLE public.repair_runs
  ADD CONSTRAINT repair_runs_user_device_fk
    FOREIGN KEY (user_id, device_id)
    REFERENCES public.devices(user_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT repair_runs_tool_version_fk
    FOREIGN KEY (tool_id, tool_version)
    REFERENCES public.repair_tool_versions(tool_id, version)
    ON DELETE RESTRICT,
  ADD CONSTRAINT repair_runs_positive_tool_version
    CHECK (tool_version > 0);

ALTER TABLE public.device_tool_syncs
  ADD CONSTRAINT device_tool_syncs_user_device_fk
    FOREIGN KEY (user_id, device_id)
    REFERENCES public.devices(user_id, id)
    ON DELETE CASCADE,
  ADD CONSTRAINT device_tool_syncs_tool_version_fk
    FOREIGN KEY (tool_id, version)
    REFERENCES public.repair_tool_versions(tool_id, version)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS repair_runs_user_device_idx
  ON public.repair_runs(user_id, device_id);
CREATE INDEX IF NOT EXISTS repair_runs_tool_version_fk_idx
  ON public.repair_runs(tool_id, tool_version);
CREATE INDEX IF NOT EXISTS device_tool_syncs_user_device_idx
  ON public.device_tool_syncs(user_id, device_id);

CREATE OR REPLACE FUNCTION public.register_device_for_member(
  p_user_id uuid,
  p_device_id uuid,
  p_device_label text,
  p_app_version text,
  p_android_version text,
  p_android_api integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_device public.devices%ROWTYPE;
  v_device_id uuid;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR SHARE;

  IF NOT FOUND OR v_profile.role <> 'member' OR v_profile.status <> 'active' THEN
    RAISE EXCEPTION 'ACTIVE_MEMBER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_app_version IS NULL OR p_app_version !~ '^[0-9]+(\.[0-9]+){0,3}$'
     OR p_android_version IS NULL OR char_length(p_android_version) NOT BETWEEN 1 AND 40
     OR p_android_api IS NULL OR p_android_api < 23 OR p_android_api > 100
     OR (p_device_label IS NOT NULL AND char_length(p_device_label) > 60)
  THEN
    RAISE EXCEPTION 'INVALID_DEVICE' USING ERRCODE = 'P0001';
  END IF;

  IF p_device_id IS NULL THEN
    INSERT INTO public.devices(
      user_id, device_label, app_version, android_version, android_api
    )
    VALUES (
      p_user_id, p_device_label, p_app_version, p_android_version, p_android_api
    )
    RETURNING id INTO v_device_id;
    RETURN v_device_id;
  END IF;

  SELECT * INTO v_device
  FROM public.devices
  WHERE id = p_device_id
  FOR UPDATE;

  IF NOT FOUND OR v_device.user_id <> p_user_id THEN
    RAISE EXCEPTION 'INVALID_DEVICE' USING ERRCODE = '42501';
  END IF;
  IF v_device.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'DEVICE_REVOKED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.devices
  SET device_label = p_device_label,
      app_version = p_app_version,
      android_version = p_android_version,
      android_api = p_android_api,
      last_seen_at = now()
  WHERE id = p_device_id
  RETURNING id INTO v_device_id;

  RETURN v_device_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_for_member(uuid, uuid, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_device_for_member(uuid, uuid, text, text, text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_member_repair_catalog(
  p_user_id uuid,
  p_device_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_device public.devices%ROWTYPE;
  v_tool public.repair_tools%ROWTYPE;
  v_version public.repair_tool_versions%ROWTYPE;
  v_min_api integer;
  v_min_app_version text;
  v_catalog jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR SHARE;

  IF NOT FOUND OR v_profile.role <> 'member' OR v_profile.status <> 'active' THEN
    RAISE EXCEPTION 'ACTIVE_MEMBER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_device
  FROM public.devices
  WHERE id = p_device_id
  FOR SHARE;

  IF NOT FOUND OR v_device.user_id <> p_user_id THEN
    RAISE EXCEPTION 'INVALID_DEVICE' USING ERRCODE = '42501';
  END IF;
  IF v_device.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'DEVICE_REVOKED' USING ERRCODE = '42501';
  END IF;

  FOR v_tool IN
    SELECT t.*
    FROM public.repair_tools t
    WHERE t.status = 'PUBLISHED'
      AND (
        t.audience = 'all_active_members'
        OR EXISTS (
          SELECT 1
          FROM public.repair_tool_access a
          WHERE a.tool_id = t.id AND a.member_id = p_user_id
        )
      )
    ORDER BY t.id
    FOR SHARE OF t
  LOOP
    IF v_tool.audience = 'selected_members' THEN
      PERFORM 1
      FROM public.repair_tool_access
      WHERE tool_id = v_tool.id AND member_id = p_user_id
      FOR KEY SHARE;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;
    END IF;

    SELECT * INTO v_version
    FROM public.repair_tool_versions
    WHERE tool_id = v_tool.id AND version = v_tool.version
    FOR SHARE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_min_api := coalesce((v_version.payload ->> 'minAndroidApi')::integer, 23);
    v_min_app_version := coalesce(v_version.payload ->> 'minAppVersion', '1.0.0');

    IF v_device.android_api IS NULL OR v_device.android_api < v_min_api
       OR NOT private.app_version_at_least(v_device.app_version, v_min_app_version)
    THEN
      CONTINUE;
    END IF;

    INSERT INTO public.device_tool_syncs(device_id, user_id, tool_id, version, synced_at)
    VALUES (p_device_id, p_user_id, v_tool.id, v_version.version, now())
    ON CONFLICT (device_id, tool_id) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          version = EXCLUDED.version,
          synced_at = EXCLUDED.synced_at;

    v_catalog := v_catalog || jsonb_build_array(jsonb_build_object(
      'tool_id', v_tool.id,
      'version', v_version.version,
      'signed_payload', v_version.canonical_payload,
      'signature', v_version.signature,
      'signature_algorithm', v_version.signature_algorithm,
      'published_at', v_version.published_at
    ));
  END LOOP;

  RETURN v_catalog;
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_repair_catalog(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_repair_catalog(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.get_member_repair_catalog(uuid, uuid) IS
  'Returns only the current published, assigned, compatible signed recipes for one active member device and records device sync atomically.';

-- Recreate the assignment transaction with sync cleanup. The lock order is
-- owner profile -> selected member profiles (sorted) -> tool -> assignments.
CREATE OR REPLACE FUNCTION public.replace_repair_tool_access(
  p_tool_id uuid,
  p_member_ids uuid[],
  p_assigned_by uuid,
  p_audience public.tool_audience
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invalid_count integer;
BEGIN
  PERFORM 1
  FROM public.profiles
  WHERE id = p_assigned_by AND role = 'owner' AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OWNER_REQUIRED';
  END IF;

  IF p_audience = 'selected_members' THEN
    IF coalesce(cardinality(p_member_ids), 0) = 0 THEN
      RAISE EXCEPTION 'MEMBER_LIST_REQUIRED';
    END IF;

    PERFORM 1
    FROM public.profiles p
    WHERE p.id = ANY(coalesce(p_member_ids, ARRAY[]::uuid[]))
    ORDER BY p.id
    FOR SHARE;

    SELECT count(*) INTO invalid_count
    FROM (
      SELECT DISTINCT member_id
      FROM unnest(p_member_ids) AS u(member_id)
    ) selected
    LEFT JOIN public.profiles p
      ON p.id = selected.member_id
     AND p.role = 'member'
     AND p.status = 'active'
    WHERE p.id IS NULL;

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'INVALID_OR_INACTIVE_MEMBER';
    END IF;
  END IF;

  PERFORM 1
  FROM public.repair_tools
  WHERE id = p_tool_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOOL_NOT_FOUND';
  END IF;

  DELETE FROM public.repair_tool_access WHERE tool_id = p_tool_id;

  IF p_audience = 'selected_members' THEN
    DELETE FROM public.device_tool_syncs s
    WHERE s.tool_id = p_tool_id
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(p_member_ids) AS selected(member_id)
        WHERE selected.member_id = s.user_id
      );

    INSERT INTO public.repair_tool_access(tool_id, member_id, assigned_by)
    SELECT p_tool_id, member_id, p_assigned_by
    FROM (
      SELECT DISTINCT member_id
      FROM unnest(p_member_ids) AS u(member_id)
    ) selected;
  END IF;

  UPDATE public.repair_tools
  SET audience = p_audience
  WHERE id = p_tool_id;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    p_assigned_by,
    'tool.access.updated',
    'repair_tool',
    p_tool_id::text,
    jsonb_build_object(
      'audience', p_audience,
      'member_count',
      CASE WHEN p_audience = 'all_active_members' THEN 'all'
           ELSE cardinality(p_member_ids)::text END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_repair_tool_access(uuid, uuid[], uuid, public.tool_audience)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_repair_tool_access(uuid, uuid[], uuid, public.tool_audience)
  TO service_role;

-- Lock the active owner profile before the tool row while publishing. The
-- immutable version, current-version increment and audit record stay atomic.
CREATE OR REPLACE FUNCTION public.commit_repair_tool_version(
  p_tool_id uuid,
  p_expected_version integer,
  p_payload jsonb,
  p_canonical_payload text,
  p_signature text,
  p_changelog text,
  p_published_by uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_version integer;
  next_version integer;
  current_status public.tool_status;
  current_slug text;
BEGIN
  PERFORM 1
  FROM public.profiles
  WHERE id = p_published_by
    AND role = 'owner'
    AND status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT version, status, slug
  INTO current_version, current_status, current_slug
  FROM public.repair_tools
  WHERE id = p_tool_id
  FOR UPDATE;

  IF current_version IS NULL THEN
    RAISE EXCEPTION 'TOOL_NOT_FOUND';
  END IF;
  IF current_version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF current_status IN ('DISABLED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'TOOL_NOT_PUBLISHABLE' USING ERRCODE = 'P0001';
  END IF;
  IF p_payload ->> 'toolId' IS DISTINCT FROM current_slug
     OR (p_payload ->> 'version')::integer IS DISTINCT FROM current_version + 1
     OR p_payload ->> 'schemaVersion' IS DISTINCT FROM '1'
  THEN
    RAISE EXCEPTION 'INVALID_PUBLISHED_PAYLOAD' USING ERRCODE = 'P0001';
  END IF;
  IF length(coalesce(p_canonical_payload, '')) = 0
     OR length(coalesce(p_signature, '')) = 0
  THEN
    RAISE EXCEPTION 'MISSING_SIGNATURE' USING ERRCODE = 'P0001';
  END IF;

  next_version := current_version + 1;

  INSERT INTO public.repair_tool_versions(
    tool_id, version, payload, canonical_payload, signature,
    signature_algorithm, changelog, published_by
  )
  VALUES (
    p_tool_id, next_version, p_payload, p_canonical_payload, p_signature,
    'RSA-SHA256', coalesce(p_changelog, ''), p_published_by
  );

  UPDATE public.repair_tools
  SET version = next_version, status = 'PUBLISHED'
  WHERE id = p_tool_id;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    p_published_by,
    'tool.published',
    'repair_tool',
    p_tool_id::text,
    jsonb_build_object('version', next_version, 'signature_algorithm', 'RSA-SHA256')
  );

  RETURN next_version;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_repair_tool_version(uuid, integer, jsonb, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_repair_tool_version(uuid, integer, jsonb, text, text, text, uuid)
  TO service_role;
