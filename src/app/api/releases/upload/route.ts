import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth/require-owner';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ZIP_BYTES = 50 * 1024 * 1024;
const MAX_APK_BYTES = 150 * 1024 * 1024;

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: Request) {
  const { supabase } = await requireOwner();

  try {
    const form = await request.formData();
    const file = form.get('file');
    const channel = String(form.get('channel') ?? '');
    const kind = String(form.get('kind') ?? '');

    if (!(file instanceof File) || !['stable', 'beta'].includes(channel) || !['packages', 'native'].includes(kind)) {
      return NextResponse.json({ error: 'A release file, channel and asset type are required.' }, { status: 400 });
    }

    const extension = file.name.toLowerCase().split('.').pop();
    const isNative = kind === 'native';
    if ((isNative && extension !== 'apk') || (!isNative && extension !== 'zip')) {
      return NextResponse.json({ error: isNative ? 'Select a signed .apk file.' : 'Select a .zip content package.' }, { status: 415 });
    }

    const maxBytes = isNative ? MAX_APK_BYTES : MAX_ZIP_BYTES;
    if (file.size < 4 || file.size > maxBytes) {
      return NextResponse.json({ error: `File size must be between 4 bytes and ${Math.floor(maxBytes / 1024 / 1024)} MB.` }, { status: 413 });
    }

    const bytes = await file.arrayBuffer();
    const magic = new Uint8Array(bytes, 0, 4);
    if (magic[0] !== 0x50 || magic[1] !== 0x4b) {
      return NextResponse.json({ error: 'The selected file is not a ZIP-based package.' }, { status: 415 });
    }

    const contentType = isNative ? 'application/vnd.android.package-archive' : 'application/zip';
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const id = crypto.randomUUID();
    const storagePath = `channels/${channel}/${kind}/${id}.${extension}`;

    const { error } = await supabase.storage
      .from('mahi-app-updates')
      .upload(storagePath, file, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      return NextResponse.json({ error: 'The private release asset could not be uploaded.' }, { status: 502 });
    }

    return NextResponse.json({
      data: {
        id,
        storagePath,
        sha256: hex(digest),
        sizeBytes: file.size,
        contentType,
      },
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'The release asset upload could not be completed.' }, { status: 500 });
  }
}
