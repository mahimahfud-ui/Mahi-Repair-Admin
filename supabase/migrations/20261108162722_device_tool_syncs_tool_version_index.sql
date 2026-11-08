CREATE INDEX IF NOT EXISTS device_tool_syncs_tool_version_idx
  ON public.device_tool_syncs(tool_id, version);
