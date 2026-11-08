ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS hardware_profile jsonb,
  ADD COLUMN IF NOT EXISTS telemetry jsonb,
  ADD COLUMN IF NOT EXISTS field_availability jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_updated_at timestamptz;

COMMENT ON COLUMN public.devices.hardware_profile IS
  'Consent-based Android hardware profile reported by the registered device; contains no location, contacts, SMS, or media.';
COMMENT ON COLUMN public.devices.telemetry IS
  'Latest device health telemetry reported by the registered device.';
COMMENT ON COLUMN public.devices.field_availability IS
  'Availability classification for collected device-profile fields.';
COMMENT ON COLUMN public.devices.profile_updated_at IS
  'Timestamp of the latest accepted device profile and telemetry payload.';

CREATE OR REPLACE FUNCTION public.register_device_profile_for_member(
  p_user_id uuid,
  p_device_id uuid,
  p_device_label text,
  p_app_version text,
  p_android_version text,
  p_android_api integer,
  p_hardware_profile jsonb DEFAULT NULL,
  p_telemetry jsonb DEFAULT NULL,
  p_field_availability jsonb DEFAULT NULL
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
  v_availability jsonb := coalesce(p_field_availability, '{}'::jsonb);
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

  IF (p_hardware_profile IS NOT NULL AND
      (jsonb_typeof(p_hardware_profile) <> 'object' OR octet_length(p_hardware_profile::text) > 32768))
     OR (p_telemetry IS NOT NULL AND
      (jsonb_typeof(p_telemetry) <> 'object' OR octet_length(p_telemetry::text) > 32768))
     OR jsonb_typeof(v_availability) <> 'object'
     OR octet_length(v_availability::text) > 8192
  THEN
    RAISE EXCEPTION 'INVALID_DEVICE_PROFILE' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each_text(v_availability) AS field(name, value)
    WHERE value NOT IN ('OBSERVED', 'ESTIMATED', 'UNAVAILABLE', 'PERMISSION_REQUIRED', 'UNSUPPORTED')
  ) THEN
    RAISE EXCEPTION 'INVALID_FIELD_AVAILABILITY' USING ERRCODE = '22023';
  END IF;

  IF p_device_id IS NULL THEN
    INSERT INTO public.devices(
      user_id, device_label, app_version, android_version, android_api,
      hardware_profile, telemetry, field_availability, profile_updated_at
    )
    VALUES (
      p_user_id, p_device_label, p_app_version, p_android_version, p_android_api,
      p_hardware_profile, p_telemetry, v_availability,
      CASE WHEN p_hardware_profile IS NOT NULL OR p_telemetry IS NOT NULL THEN now() ELSE NULL END
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
      hardware_profile = coalesce(p_hardware_profile, hardware_profile),
      telemetry = coalesce(p_telemetry, telemetry),
      field_availability = CASE
        WHEN p_hardware_profile IS NOT NULL OR p_telemetry IS NOT NULL
          THEN v_availability
        ELSE field_availability
      END,
      profile_updated_at = CASE
        WHEN p_hardware_profile IS NOT NULL OR p_telemetry IS NOT NULL
          THEN now()
        ELSE profile_updated_at
      END,
      last_seen_at = now()
  WHERE id = p_device_id
  RETURNING id INTO v_device_id;

  RETURN v_device_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_profile_for_member(
  uuid, uuid, text, text, text, integer, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_device_profile_for_member(
  uuid, uuid, text, text, text, integer, jsonb, jsonb, jsonb
) TO service_role;

COMMENT ON FUNCTION public.register_device_profile_for_member(
  uuid, uuid, text, text, text, integer, jsonb, jsonb, jsonb
) IS 'Registers or refreshes only the authenticated active member device and stores validated device profile/telemetry atomically.';
