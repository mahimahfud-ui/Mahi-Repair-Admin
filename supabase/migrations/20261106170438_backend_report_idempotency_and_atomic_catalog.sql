-- Atomic private catalog fetches and idempotent repair-run acceptance.
-- Forward-only: existing migrations, published recipe payloads and repair-run IDs
-- are retained. Android RepairRunReport.runId is stored directly as repair_runs.id.

ALTER TABLE public.repair_runs
  ADD COLUMN request_fingerprint text;

ALTER TABLE public.repair_runs
  ADD CONSTRAINT repair_runs_request_fingerprint_format_check
  CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[0-9a-f]{64}$');

CREATE OR REPLACE FUNCTION private.app_version_at_least(p_actual text, p_required text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_actual !~ '^[0-9]+(\.[0-9]+){0,3}$'
      OR p_required !~ '^[0-9]+(\.[0-9]+){0,3}$'
    THEN false
    ELSE
      ARRAY[
        split_part(p_actual, '.', 1)::numeric,
        coalesce(nullif(split_part(p_actual, '.', 2), ''), '0')::numeric,
        coalesce(nullif(split_part(p_actual, '.', 3), ''), '0')::numeric,
        coalesce(nullif(split_part(p_actual, '.', 4), ''), '0')::numeric
      ] >= ARRAY[
        split_part(p_required, '.', 1)::numeric,
        coalesce(nullif(split_part(p_required, '.', 2), ''), '0')::numeric,
        coalesce(nullif(split_part(p_required, '.', 3), ''), '0')::numeric,
        coalesce(nullif(split_part(p_required, '.', 4), ''), '0')::numeric
      ]
  END;
$$;

REVOKE ALL ON FUNCTION private.app_version_at_least(text, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Locks ensure the device's authorization is current at the same instant that
-- device_tool_syncs is updated. A concurrent revoke/unpublish waits for this
-- transaction, then its broadcast trigger observes the synced device.
CREATE OR REPLACE FUNCTION public.get_signed_repair_tool_for_device(
  p_user_id uuid,
  p_device_id uuid,
  p_tool_id uuid
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

  SELECT * INTO v_tool
  FROM public.repair_tools
  WHERE id = p_tool_id
  FOR SHARE;

  IF NOT FOUND OR v_tool.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'TOOL_NOT_PUBLISHED' USING ERRCODE = '42501';
  END IF;

  IF v_tool.audience = 'selected_members' THEN
    PERFORM 1
    FROM public.repair_tool_access
    WHERE tool_id = p_tool_id AND member_id = p_user_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TOOL_ACCESS_DENIED' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_version
  FROM public.repair_tool_versions
  WHERE tool_id = p_tool_id AND version = v_tool.version
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT_PUBLISHED_VERSION_MISSING' USING ERRCODE = 'P0001';
  END IF;

  v_min_api := coalesce((v_version.payload ->> 'minAndroidApi')::integer, 23);
  v_min_app_version := coalesce(v_version.payload ->> 'minAppVersion', '1.0.0');

  IF v_device.android_api IS NULL OR v_device.android_api < v_min_api THEN
    RAISE EXCEPTION 'ANDROID_API_INCOMPATIBLE' USING ERRCODE = 'P0001';
  END IF;
  IF NOT private.app_version_at_least(v_device.app_version, v_min_app_version) THEN
    RAISE EXCEPTION 'APP_VERSION_INCOMPATIBLE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.device_tool_syncs(device_id, user_id, tool_id, version, synced_at)
  VALUES (p_device_id, p_user_id, p_tool_id, v_version.version, now())
  ON CONFLICT (device_id, tool_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        version = EXCLUDED.version,
        synced_at = EXCLUDED.synced_at;

  RETURN jsonb_build_object(
    'signed_payload', v_version.canonical_payload,
    'signature', v_version.signature,
    'signature_algorithm', v_version.signature_algorithm,
    'version', v_version.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_signed_repair_tool_for_device(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_signed_repair_tool_for_device(uuid, uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.get_signed_repair_tool_for_device(uuid, uuid, uuid) IS
  'Returns only the current published, assigned, device-compatible signed recipe and records the device sync atomically.';

-- p_run_id is Android RepairRunReport.runId. The fingerprint covers normalized
-- content, run ID and verified user ID. An exact retry from the same member/device
-- returns the accepted row; reuse with changed content or identity conflicts.
-- Profile/device/tool/assignment locks serialize acceptance with suspension,
-- revocation, unpublishing, version changes and assignment removal.
CREATE OR REPLACE FUNCTION public.submit_repair_run_idempotent(
  p_run_id uuid,
  p_user_id uuid,
  p_device_id uuid,
  p_tool_id uuid,
  p_tool_version integer,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_result public.repair_result,
  p_step_results jsonb,
  p_error_code text,
  p_app_version text,
  p_request_fingerprint text
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
  v_existing public.repair_runs%ROWTYPE;
  v_inserted_id uuid;
  v_min_api integer;
  v_min_app_version text;
BEGIN
  IF p_run_id IS NULL
     OR p_user_id IS NULL
     OR p_device_id IS NULL
     OR p_tool_id IS NULL
     OR p_tool_version IS NULL
     OR p_started_at IS NULL
     OR p_result IS NULL
     OR p_request_fingerprint IS NULL
     OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_step_results IS NULL
     OR jsonb_typeof(p_step_results) IS DISTINCT FROM 'array'
     OR p_app_version IS NULL
     OR p_app_version !~ '^[0-9]+(\.[0-9]+){0,3}$'
     OR (p_completed_at IS NOT NULL AND p_completed_at < p_started_at)
  THEN
    RAISE EXCEPTION 'INVALID_REPORT' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_array_length(p_step_results) < 1 OR jsonb_array_length(p_step_results) > 50 THEN
    RAISE EXCEPTION 'INVALID_REPORT' USING ERRCODE = 'P0001';
  END IF;

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

  -- Existing accepted reports are receipts, not new repair authorizations.
  -- Profile and device status are still revalidated before returning a receipt.
  SELECT * INTO v_existing
  FROM public.repair_runs
  WHERE id = p_run_id;

  IF FOUND THEN
    IF v_existing.user_id = p_user_id
       AND v_existing.device_id = p_device_id
       AND (
         v_existing.request_fingerprint = p_request_fingerprint
         OR (
           v_existing.request_fingerprint IS NULL
           AND v_existing.tool_id = p_tool_id
           AND v_existing.tool_version = p_tool_version
           AND v_existing.started_at = p_started_at
           AND v_existing.completed_at IS NOT DISTINCT FROM p_completed_at
           AND v_existing.result = p_result
           AND v_existing.step_results = p_step_results
           AND v_existing.error_code IS NOT DISTINCT FROM p_error_code
           AND v_existing.app_version = p_app_version
         )
       )
    THEN
      RETURN jsonb_build_object('accepted', true, 'duplicate', true, 'run_id', p_run_id::text);
    END IF;
    RETURN jsonb_build_object('conflict', true, 'run_id', p_run_id::text);
  END IF;

  IF v_device.app_version IS DISTINCT FROM p_app_version THEN
    RAISE EXCEPTION 'DEVICE_APP_VERSION_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_tool
  FROM public.repair_tools
  WHERE id = p_tool_id
  FOR SHARE;

  IF NOT FOUND OR v_tool.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'TOOL_NOT_PUBLISHED' USING ERRCODE = '42501';
  END IF;
  IF v_tool.version <> p_tool_version THEN
    RAISE EXCEPTION 'STALE_RECIPE_VERSION' USING ERRCODE = 'P0001';
  END IF;

  IF v_tool.audience = 'selected_members' THEN
    PERFORM 1
    FROM public.repair_tool_access
    WHERE tool_id = p_tool_id AND member_id = p_user_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TOOL_ACCESS_DENIED' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_version
  FROM public.repair_tool_versions
  WHERE tool_id = p_tool_id AND version = p_tool_version
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT_PUBLISHED_VERSION_MISSING' USING ERRCODE = 'P0001';
  END IF;

  v_min_api := coalesce((v_version.payload ->> 'minAndroidApi')::integer, 23);
  v_min_app_version := coalesce(v_version.payload ->> 'minAppVersion', '1.0.0');

  IF v_device.android_api IS NULL OR v_device.android_api < v_min_api THEN
    RAISE EXCEPTION 'ANDROID_API_INCOMPATIBLE' USING ERRCODE = 'P0001';
  END IF;
  IF NOT private.app_version_at_least(p_app_version, v_min_app_version) THEN
    RAISE EXCEPTION 'APP_VERSION_INCOMPATIBLE' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_step_results) AS submitted(step)
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(v_version.payload -> 'steps', '[]'::jsonb)) AS recipe(step)
      WHERE recipe.step ->> 'id' = submitted.step ->> 'step_id'
    )
    AND NOT (
      p_result = 'FAILED'
      AND jsonb_array_length(p_step_results) = 1
      AND submitted.step ->> 'status' = 'FAILED'
      AND submitted.step ->> 'step_id' = ANY (ARRAY[
        'verify_sig',
        'parse_schema',
        'recipe_identity',
        'app_version_check',
        'compat_check'
      ])
    )
  ) THEN
    RAISE EXCEPTION 'INVALID_STEP_IDS' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.repair_runs(
    id, user_id, device_id, tool_id, tool_version, started_at, completed_at,
    result, step_results, error_code, app_version, request_fingerprint
  )
  VALUES (
    p_run_id, p_user_id, p_device_id, p_tool_id, p_tool_version, p_started_at,
    p_completed_at, p_result, p_step_results, p_error_code, p_app_version,
    p_request_fingerprint
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    -- A concurrent request won the primary-key race; compare the committed row.
    SELECT * INTO v_existing
    FROM public.repair_runs
    WHERE id = p_run_id;

    IF FOUND
       AND v_existing.user_id = p_user_id
       AND v_existing.device_id = p_device_id
       AND v_existing.request_fingerprint = p_request_fingerprint
    THEN
      RETURN jsonb_build_object('accepted', true, 'duplicate', true, 'run_id', p_run_id::text);
    END IF;
    RETURN jsonb_build_object('conflict', true, 'run_id', p_run_id::text);
  END IF;

  -- A SUCCESS value is a client report, not cryptographic evidence of physical repair.
  RETURN jsonb_build_object('accepted', true, 'duplicate', false, 'run_id', p_run_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_repair_run_idempotent(
  uuid, uuid, uuid, uuid, integer, timestamptz, timestamptz,
  public.repair_result, jsonb, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_repair_run_idempotent(
  uuid, uuid, uuid, uuid, integer, timestamptz, timestamptz,
  public.repair_result, jsonb, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.submit_repair_run_idempotent(
  uuid, uuid, uuid, uuid, integer, timestamptz, timestamptz,
  public.repair_result, jsonb, text, text, text
) IS
  'Accepts an Android RepairRunReport.runId exactly once. Exact same-identity/content retries return the existing acceptance; changed content or identity conflicts.';

-- Lock order: owner profile, selected member profiles (sorted), then tool.
-- Fetch/report transactions lock their member profile before device/tool, so
-- assignment changes cannot deadlock by holding the tool while waiting on a member.
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
