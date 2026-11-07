-- Route privileged direct mutations through owner-checked SQL transactions so
-- their audit row commits or rolls back with the domain change. Auth Admin API
-- operations (email invite/ban) remain external side effects; profile state is
-- updated fail-closed and its audit event is atomic in Postgres.

CREATE OR REPLACE FUNCTION private.assert_active_owner(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM public.profiles
  WHERE id = p_actor_id
    AND role = 'owner'
    AND status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_active_owner(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_record_invited_member(
  p_actor_id uuid,
  p_member_id uuid,
  p_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.app_role;
  v_auth_email text;
BEGIN
  PERFORM private.assert_active_owner(p_actor_id);

  SELECT lower(email) INTO v_auth_email
  FROM auth.users
  WHERE id = p_member_id
  FOR SHARE;

  IF NOT FOUND OR v_auth_email IS DISTINCT FROM lower(p_email) THEN
    RAISE EXCEPTION 'INVITED_AUTH_USER_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_member_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_role <> 'member' THEN
      RAISE EXCEPTION 'INVITED_USER_IS_NOT_A_MEMBER' USING ERRCODE = '42501';
    END IF;
    UPDATE public.profiles
    SET email = v_auth_email
    WHERE id = p_member_id;
  ELSE
    INSERT INTO public.profiles(id, email, role, status)
    VALUES (p_member_id, v_auth_email, 'member', 'active');
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    p_actor_id,
    'member.invited',
    'profile',
    p_member_id::text,
    jsonb_build_object('email_domain', split_part(v_auth_email, '@', 2))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_invited_member(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_invited_member(uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_update_member_status(
  p_actor_id uuid,
  p_member_id uuid,
  p_status public.account_status
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member public.profiles%ROWTYPE;
BEGIN
  PERFORM private.assert_active_owner(p_actor_id);

  IF p_actor_id = p_member_id THEN
    RAISE EXCEPTION 'CANNOT_CHANGE_OWN_OWNER_STATUS' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_member
  FROM public.profiles
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND OR v_member.role <> 'member' THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profiles
  SET status = p_status
  WHERE id = p_member_id;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    p_actor_id,
    'member.' || p_status::text,
    'profile',
    p_member_id::text,
    jsonb_build_object('previous_status', v_member.status, 'status', p_status)
  );

  RETURN jsonb_build_object('user_id', p_member_id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_member_status(uuid, uuid, public.account_status)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_member_status(uuid, uuid, public.account_status)
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_update_device_revocation(
  p_actor_id uuid,
  p_device_id uuid,
  p_revoked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_device public.devices%ROWTYPE;
  v_revoked_at timestamptz;
BEGIN
  PERFORM private.assert_active_owner(p_actor_id);

  SELECT * INTO v_device
  FROM public.devices
  WHERE id = p_device_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEVICE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_revoked_at := CASE
    WHEN p_revoked THEN coalesce(v_device.revoked_at, now())
    ELSE NULL
  END;

  UPDATE public.devices
  SET revoked_at = v_revoked_at
  WHERE id = p_device_id;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    p_actor_id,
    CASE WHEN p_revoked THEN 'device.revoked' ELSE 'device.restored' END,
    'device',
    p_device_id::text,
    jsonb_build_object('member_id', v_device.user_id)
  );

  RETURN jsonb_build_object('device_id', p_device_id, 'revoked', p_revoked);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_device_revocation(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_device_revocation(uuid, uuid, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_repair_tool_status(
  p_actor_id uuid,
  p_tool_id uuid,
  p_expected_status public.tool_status,
  p_new_status public.tool_status
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tool public.repair_tools%ROWTYPE;
  v_action text;
BEGIN
  PERFORM private.assert_active_owner(p_actor_id);

  SELECT * INTO v_tool
  FROM public.repair_tools
  WHERE id = p_tool_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOOL_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_tool.status <> p_expected_status THEN
    RAISE EXCEPTION 'TOOL_STATE_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  IF p_new_status = 'DISABLED' THEN
    IF v_tool.status <> 'PUBLISHED' THEN
      RAISE EXCEPTION 'ONLY_PUBLISHED_TOOLS_CAN_BE_DISABLED' USING ERRCODE = 'P0001';
    END IF;
    v_action := 'tool.disabled';
  ELSIF p_new_status = 'PUBLISHED' THEN
    IF v_tool.status <> 'DISABLED' OR v_tool.version < 1 THEN
      RAISE EXCEPTION 'ONLY_DISABLED_PUBLISHED_TOOLS_CAN_BE_ENABLED' USING ERRCODE = 'P0001';
    END IF;
    v_action := 'tool.enabled';
  ELSIF p_new_status IN ('DRAFT', 'TESTING', 'ARCHIVED') THEN
    IF v_tool.status = 'ARCHIVED' THEN
      RAISE EXCEPTION 'ARCHIVED_TOOL_IS_IMMUTABLE' USING ERRCODE = 'P0001';
    END IF;
    v_action := CASE WHEN p_new_status = 'ARCHIVED'
      THEN 'tool.archived'
      ELSE 'tool.unpublished_or_test_state_changed'
    END;
  ELSE
    RAISE EXCEPTION 'INVALID_TOOL_STATE_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.repair_tools
  SET status = p_new_status
  WHERE id = p_tool_id;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    p_actor_id,
    v_action,
    'repair_tool',
    p_tool_id::text,
    jsonb_build_object('from', v_tool.status, 'to', p_new_status, 'version', v_tool.version)
  );

  RETURN jsonb_build_object('id', p_tool_id, 'status', p_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_repair_tool_status(uuid, uuid, public.tool_status, public.tool_status)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_repair_tool_status(uuid, uuid, public.tool_status, public.tool_status)
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_save_repair_tool_draft(
  p_actor_id uuid,
  p_tool_id uuid,
  p_name text,
  p_slug text,
  p_category text,
  p_description text,
  p_icon text,
  p_draft_recipe jsonb,
  p_min_android_api integer,
  p_minimum_app_version text,
  p_estimated_seconds integer,
  p_risk_classification text,
  p_repair_instructions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tool public.repair_tools%ROWTYPE;
  v_id uuid;
  v_action text;
BEGIN
  PERFORM private.assert_active_owner(p_actor_id);

  IF p_tool_id IS NULL THEN
    INSERT INTO public.repair_tools(
      name, slug, category, description, icon, draft_recipe,
      android_compatibility, minimum_app_version, estimated_seconds,
      risk_classification, repair_instructions, created_by
    )
    VALUES (
      p_name, p_slug, p_category, p_description, p_icon, p_draft_recipe,
      jsonb_build_object('minApi', p_min_android_api), p_minimum_app_version,
      p_estimated_seconds, p_risk_classification, p_repair_instructions, p_actor_id
    )
    RETURNING * INTO v_tool;
    v_action := 'tool.created';
  ELSE
    SELECT * INTO v_tool
    FROM public.repair_tools
    WHERE id = p_tool_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'TOOL_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF v_tool.status = 'ARCHIVED' THEN
      RAISE EXCEPTION 'ARCHIVED_TOOL_CANNOT_BE_EDITED' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.repair_tools
    SET name = p_name,
        slug = p_slug,
        category = p_category,
        description = p_description,
        icon = p_icon,
        draft_recipe = p_draft_recipe,
        android_compatibility = jsonb_build_object('minApi', p_min_android_api),
        minimum_app_version = p_minimum_app_version,
        estimated_seconds = p_estimated_seconds,
        risk_classification = p_risk_classification,
        repair_instructions = p_repair_instructions
    WHERE id = p_tool_id
    RETURNING * INTO v_tool;
    v_action := 'tool.draft.updated';
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    p_actor_id,
    v_action,
    'repair_tool',
    v_tool.id::text,
    jsonb_build_object('slug', v_tool.slug)
  );

  RETURN jsonb_build_object(
    'id', v_tool.id,
    'slug', v_tool.slug,
    'status', v_tool.status,
    'version', v_tool.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_repair_tool_draft(
  uuid, uuid, text, text, text, text, text, jsonb, integer, text, integer, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_repair_tool_draft(
  uuid, uuid, text, text, text, text, text, jsonb, integer, text, integer, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_draft_repair_tool(
  p_actor_id uuid,
  p_tool_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tool public.repair_tools%ROWTYPE;
BEGIN
  PERFORM private.assert_active_owner(p_actor_id);

  SELECT * INTO v_tool
  FROM public.repair_tools
  WHERE id = p_tool_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOOL_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_tool.version <> 0 OR v_tool.status NOT IN ('DRAFT', 'TESTING') THEN
    RAISE EXCEPTION 'ONLY_UNPUBLISHED_DRAFT_TOOLS_CAN_BE_DELETED' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.repair_tools WHERE id = p_tool_id;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (
    p_actor_id,
    'tool.draft.deleted',
    'repair_tool',
    p_tool_id::text,
    jsonb_build_object('slug', v_tool.slug)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_draft_repair_tool(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_draft_repair_tool(uuid, uuid)
  TO service_role;
