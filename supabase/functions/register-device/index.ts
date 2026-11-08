import { authenticate, respond, preflight, handleError, jsonBody, rateLimit } from '../_shared/http.ts';
import { z } from 'npm:zod@4';

const JsonObject = z.record(z.string().max(120), z.unknown()).superRefine((value, ctx) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > 32768) ctx.addIssue({ code: 'custom', message: 'Device profile payload exceeds 32 KB.' });
});

const FieldAvailability = z.record(
  z.string().max(120),
  z.enum(['OBSERVED', 'ESTIMATED', 'UNAVAILABLE', 'PERMISSION_REQUIRED', 'UNSUPPORTED']),
).optional();

const Device = z.object({
  device_id: z.string().uuid().optional(),
  device_label: z.string().max(60).optional(),
  app_version: z.string().max(30).regex(/^\d+(?:\.\d+){0,3}$/),
  android_version: z.string().min(1).max(40),
  android_api: z.number().int().min(23).max(100),
  hardware_profile: JsonObject.optional(),
  telemetry: JsonObject.optional(),
  field_availability: FieldAvailability,
}).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  try {
    const { user, profile, admin } = await authenticate(req);
    if (profile.role !== 'member') {
      throw Object.assign(new Error('Member account required'), { status: 403 });
    }
    await rateLimit(admin, `device-profile:${user.id}`, 20, 3600);

    const parsed = Device.safeParse(await jsonBody(req));
    if (!parsed.success) {
      return respond(req, { error: { code: 'INVALID_DEVICE', issues: parsed.error.issues } }, 422);
    }

    const device = parsed.data;
    const { data: deviceId, error } = await admin.rpc('register_device_profile_for_member', {
      p_user_id: user.id,
      p_device_id: device.device_id ?? null,
      p_device_label: device.device_label ?? null,
      p_app_version: device.app_version,
      p_android_version: device.android_version,
      p_android_api: device.android_api,
      p_hardware_profile: device.hardware_profile ?? null,
      p_telemetry: device.telemetry ?? null,
      p_field_availability: device.field_availability ?? {},
    });
    if (error) {
      if (error.message.includes('ACTIVE_MEMBER_REQUIRED') ||
          error.message.includes('DEVICE_REVOKED') ||
          error.message.includes('INVALID_DEVICE')) {
        throw Object.assign(new Error('An active member and owned, non-revoked device are required.'), { status: 403 });
      }
      if (error.message.includes('INVALID_DEVICE_PROFILE') ||
          error.message.includes('INVALID_FIELD_AVAILABILITY')) {
        throw Object.assign(new Error('The device profile payload is invalid or exceeds the server limit.'), { status: 422 });
      }
      throw error;
    }
    if (typeof deviceId !== 'string') throw new Error('Device registration did not return a device ID.');

    return respond(req, {
      data: {
        device_id: deviceId,
        registered: true,
        profile_updated: Boolean(device.hardware_profile || device.telemetry),
      },
    });
  } catch (error) {
    return handleError(req, error);
  }
});
