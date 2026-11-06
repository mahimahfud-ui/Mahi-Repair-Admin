-- Keep the internal bucket table explicitly inaccessible to browser roles.
-- The service-role-only consume_rate_limit RPC executes with its owner's privileges.
CREATE POLICY "deny browser access to rate limits"
  ON private.rate_limit_buckets
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
