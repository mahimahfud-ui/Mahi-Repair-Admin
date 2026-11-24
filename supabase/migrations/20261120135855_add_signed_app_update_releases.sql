-- Signed, append-only app update releases.
-- The release manifest is data only: no JavaScript, scripts, DEX or executable content is accepted.

CREATE TABLE public.app_update_releases (
  id uuid PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN ('stable', 'beta')),
  release_number integer NOT NULL CHECK (release_number > 0),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  manifest_payload text NOT NULL CHECK (char_length(manifest_payload) BETWEEN 2 AND 262144),
  signature text NOT NULL CHECK (char_length(signature) BETWEEN 256 AND 2048),
  signature_algorithm text NOT NULL DEFAULT 'RSA-SHA256'
    CHECK (signature_algorithm = 'RSA-SHA256'),
  published_by uuid NOT NULL REFERENCES public.profiles(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, release_number)
);

CREATE INDEX app_update_releases_latest_idx
  ON public.app_update_releases(channel, release_number DESC, published_at DESC);

ALTER TABLE public.app_update_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active owners read app update releases"
  ON public.app_update_releases
  FOR SELECT
  TO authenticated
  USING ((SELECT private.is_owner()));

GRANT SELECT ON TABLE public.app_update_releases TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.app_update_releases FROM anon, authenticated;
REVOKE ALL ON TABLE public.app_update_releases FROM anon;

CREATE OR REPLACE FUNCTION private.reject_app_update_release_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'APP_UPDATE_RELEASES_ARE_IMMUTABLE';
END;
$$;

CREATE TRIGGER app_update_releases_immutable
  BEFORE UPDATE OR DELETE ON public.app_update_releases
  FOR EACH ROW EXECUTE FUNCTION private.reject_app_update_release_mutation();

REVOKE ALL ON FUNCTION private.reject_app_update_release_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

-- Private package/APK objects are readable only through short-lived signed URLs
-- created by the member-authenticated get-app-update-asset-url Edge Function.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mahi-app-updates',
  'mahi-app-updates',
  false,
  157286400,
  ARRAY['application/zip', 'application/vnd.android.package-archive']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Owners upload immutable Mahi Repair update assets" ON storage.objects;
CREATE POLICY "Owners upload immutable Mahi Repair update assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'mahi-app-updates'
    AND (SELECT private.is_owner())
    AND name ~ '^channels/(stable|beta)/(packages|native)/[0-9a-f-]{36}\.(zip|apk)$'
  );

DROP POLICY IF EXISTS "Owners inspect Mahi Repair update assets" ON storage.objects;
CREATE POLICY "Owners inspect Mahi Repair update assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'mahi-app-updates'
    AND (SELECT private.is_owner())
  );

-- Only an active Owner can create a signed release. The release row and audit
-- event are committed together, and published rows can never be edited/deleted.
CREATE OR REPLACE FUNCTION public.commit_app_update_release(
  p_release_id uuid,
  p_channel text,
  p_release_number integer,
  p_manifest jsonb,
  p_manifest_payload text,
  p_signature text,
  p_published_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_channel NOT IN ('stable', 'beta')
     OR p_release_number IS NULL OR p_release_number < 1
     OR jsonb_typeof(p_manifest) <> 'object'
     OR p_manifest_payload IS NULL OR char_length(p_manifest_payload) NOT BETWEEN 2 AND 262144
     OR p_signature IS NULL OR char_length(p_signature) NOT BETWEEN 256 AND 2048
  THEN
    RAISE EXCEPTION 'INVALID_APP_UPDATE_RELEASE';
  END IF;

  PERFORM 1
  FROM public.profiles
  WHERE id = p_published_by
    AND role = 'owner'
    AND status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTIVE_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.app_update_releases (
    id, channel, release_number, manifest, manifest_payload,
    signature, signature_algorithm, published_by
  )
  VALUES (
    p_release_id, p_channel, p_release_number, p_manifest, p_manifest_payload,
    p_signature, 'RSA-SHA256', p_published_by
  );

  INSERT INTO public.admin_audit_logs (
    actor_id, action, target_type, target_id, details
  )
  VALUES (
    p_published_by,
    'app_update.published',
    'app_update_release',
    p_release_id::text,
    jsonb_build_object('channel', p_channel, 'releaseNumber', p_release_number)
  );

  RETURN p_release_id;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_app_update_release(uuid, text, integer, jsonb, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_app_update_release(uuid, text, integer, jsonb, text, text, uuid)
  TO service_role;

-- Realtime carries only an opaque event ID. Clients must fetch and verify the
-- signed manifest through an authenticated Edge Function before applying it.
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
  IF p_event NOT IN (
    'catalog_changed', 'member_access_changed', 'device_revoked', 'app_update_published'
  ) THEN
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
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.broadcast_app_update_release_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_device record;
BEGIN
  FOR target_device IN
    SELECT d.id AS device_id, d.user_id
    FROM public.devices d
    JOIN public.profiles p ON p.id = d.user_id
    WHERE d.revoked_at IS NULL
      AND p.role = 'member'
      AND p.status = 'active'
  LOOP
    PERFORM private.broadcast_repair_device_event(
      target_device.user_id,
      target_device.device_id,
      'app_update_published'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_update_release_private_broadcast
  AFTER INSERT ON public.app_update_releases
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_app_update_release_published();

REVOKE ALL ON FUNCTION private.broadcast_app_update_release_published()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.app_update_releases IS
  'Append-only signed app update manifests. Clients verify RSA-SHA256 signatures and never execute remote code.';
