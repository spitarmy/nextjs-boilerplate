-- =============================================================================
-- Kanteno — Supabase Row Level Security (RLS) Policies
-- =============================================================================
-- Generated from analysis of all API route files:
--   app/api/assess/route.ts
--   app/api/assess/worker/route.ts
--   app/api/assess/enqueue/route.ts
--   app/api/assess/result/route.ts
--   app/api/usage/route.ts
--   app/api/user-settings/route.ts
--   app/api/auth/after-signup/route.ts
--   app/api/admin/usage/route.ts
--   app/api/upload-url/route.ts
--
-- Tables discovered:
--   1. usage_events          — per-user usage tracking (user_id column)
--   2. profiles              — user profile & settings (id = auth.uid())
--   3. brand_data_reference_v2 — read-only reference data
--   4. jewelry_reference     — read-only reference data
--   5. kinko_urushi_reference — read-only reference data
--   6. wamon_reference       — read-only reference data
--   7. training_items        — AI training data (no user_id; server-managed)
--   8. appraisals            — assessment results log (user_id column)
--   9. assessment_jobs       — async job queue (user_id column)
--  10. tenants               — multi-tenant orgs (owner_user_id column)
--
-- Access pattern notes:
--   • All API routes use the service-role Supabase client (supabase / supabaseAdmin),
--     which bypasses RLS. These policies protect against direct client-side access
--     and add defense-in-depth.
--   • Service-role key always bypasses RLS, so server-side operations are unaffected.
-- =============================================================================

BEGIN;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  1. usage_events                                                        ║
-- ║  Columns seen: user_id, units, is_overage, kind, assess_mode,           ║
-- ║                listing_mode, created_at                                 ║
-- ║  Operations: SELECT (own rows), INSERT (server-side via service key)    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage events
CREATE POLICY "usage_events_select_own"
  ON usage_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own usage events
-- (Server normally does this via service key, but this allows client-side if needed)
CREATE POLICY "usage_events_insert_own"
  ON usage_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No UPDATE or DELETE for regular users (usage records are immutable)


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  2. profiles                                                            ║
-- ║  Columns seen: id, email, name, tenant_id, role, allow_training         ║
-- ║  Operations: SELECT (own), INSERT (after-signup via admin), UPSERT (own)║
-- ║  Note: id = auth.uid() (not a separate user_id column)                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Users can insert their own profile (for upsert on settings update)
CREATE POLICY "profiles_insert_own"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Users can update their own profile (allow_training toggle, etc.)
CREATE POLICY "profiles_update_own"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Note: after-signup route uses supabaseAdmin (service key) to create the
-- initial profile row, which bypasses RLS. No anonymous insert needed.


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  3. brand_data_reference_v2                                             ║
-- ║  Columns seen: brand, line_name, model_name                             ║
-- ║  Operations: SELECT only (read-only reference table)                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE brand_data_reference_v2 ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read brand reference data
CREATE POLICY "brand_data_reference_v2_select_authenticated"
  ON brand_data_reference_v2
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE for regular users (admin-managed reference data)


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  4. jewelry_reference                                                   ║
-- ║  Columns seen: * (all columns via select("*"))                          ║
-- ║  Operations: SELECT only (read-only reference table)                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE jewelry_reference ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read jewelry reference data
CREATE POLICY "jewelry_reference_select_authenticated"
  ON jewelry_reference
  FOR SELECT
  TO authenticated
  USING (true);


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  5. kinko_urushi_reference                                              ║
-- ║  Columns seen: * (all columns via select("*"))                          ║
-- ║  Operations: SELECT only (read-only reference table)                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE kinko_urushi_reference ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read kinko/urushi reference data
CREATE POLICY "kinko_urushi_reference_select_authenticated"
  ON kinko_urushi_reference
  FOR SELECT
  TO authenticated
  USING (true);


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  6. wamon_reference                                                     ║
-- ║  Columns seen: genre, category, author_name, style_traits,              ║
-- ║    stroke_traits, signature_traits, seal_text, seal_shape_color,        ║
-- ║    seal_position, authenticity_points, common_fake_patterns, era,       ║
-- ║    school_lineage                                                       ║
-- ║  Operations: SELECT only (read-only reference table)                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE wamon_reference ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read wamon reference data
CREATE POLICY "wamon_reference_select_authenticated"
  ON wamon_reference
  FOR SELECT
  TO authenticated
  USING (true);


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  7. training_items                                                      ║
-- ║  Columns seen: genre, item_name, image_urls, output_text,               ║
-- ║    mercari_title, mercari_description, auction_title, listing_mode,      ║
-- ║    model, source, confidence, is_trainable, raw_request, raw_response,  ║
-- ║    created_at                                                           ║
-- ║  Operations: SELECT (filtered by is_trainable), INSERT (server-side)    ║
-- ║  Note: No user_id column — data is shared across the system             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE training_items ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read trainable items (used as AI reference data)
CREATE POLICY "training_items_select_authenticated"
  ON training_items
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT is only done server-side via service key (bypasses RLS)
-- No client-side INSERT/UPDATE/DELETE allowed


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  8. appraisals                                                          ║
-- ║  Columns seen: user_id, genre, item_name, confidence, mercari_title,    ║
-- ║    mercari_description, auction_title, listing_mode, output_text,       ║
-- ║    image_urls, model                                                    ║
-- ║  Operations: INSERT (server-side, records assessment results)           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE appraisals ENABLE ROW LEVEL SECURITY;

-- Users can read their own appraisal history
CREATE POLICY "appraisals_select_own"
  ON appraisals
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own appraisals
-- (Server normally does this via service key, but defense-in-depth)
CREATE POLICY "appraisals_insert_own"
  ON appraisals
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No UPDATE or DELETE for regular users (appraisal records are immutable)


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  9. assessment_jobs                                                     ║
-- ║  Columns seen: id, user_id, image_urls, status, result, error_message,  ║
-- ║                created_at                                               ║
-- ║  Operations: SELECT, INSERT, UPDATE (job lifecycle management)          ║
-- ║  Note: Worker route uses service key for all operations.                ║
-- ║        Enqueue/result routes also use service key.                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE assessment_jobs ENABLE ROW LEVEL SECURITY;

-- Users can read their own jobs (to poll for results)
CREATE POLICY "assessment_jobs_select_own"
  ON assessment_jobs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own jobs (enqueue)
CREATE POLICY "assessment_jobs_insert_own"
  ON assessment_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own jobs (e.g., cancel)
-- Note: The worker uses service key to update status to processing/done/error
CREATE POLICY "assessment_jobs_update_own"
  ON assessment_jobs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No DELETE for regular users


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  10. tenants                                                            ║
-- ║  Columns seen: id, name, owner_user_id, seats_limit                     ║
-- ║  Operations: INSERT (after-signup via supabaseAdmin only)               ║
-- ║  Note: Only created by supabaseAdmin (service key) during signup.       ║
-- ║        Regular users should only read their own tenant.                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Users can read their own tenant (where they are the owner)
CREATE POLICY "tenants_select_own"
  ON tenants
  FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

-- Users can also read tenants they belong to (via profiles.tenant_id join)
-- This allows members to see their tenant info
CREATE POLICY "tenants_select_member"
  ON tenants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.tenant_id = tenants.id
        AND profiles.id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE only via service key (supabaseAdmin)
-- No client-side write access to tenants


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  Summary of access matrix                                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- ┌──────────────────────────┬─────────┬─────────┬─────────┬─────────┐
-- │ Table                    │ SELECT  │ INSERT  │ UPDATE  │ DELETE  │
-- ├──────────────────────────┼─────────┼─────────┼─────────┼─────────┤
-- │ usage_events             │ own     │ own     │ —       │ —       │
-- │ profiles                 │ own     │ own     │ own     │ —       │
-- │ brand_data_reference_v2  │ all     │ —       │ —       │ —       │
-- │ jewelry_reference        │ all     │ —       │ —       │ —       │
-- │ kinko_urushi_reference   │ all     │ —       │ —       │ —       │
-- │ wamon_reference          │ all     │ —       │ —       │ —       │
-- │ training_items           │ all     │ —       │ —       │ —       │
-- │ appraisals               │ own     │ own     │ —       │ —       │
-- │ assessment_jobs          │ own     │ own     │ own     │ —       │
-- │ tenants                  │ own/mbr │ —       │ —       │ —       │
-- ├──────────────────────────┼─────────┴─────────┴─────────┴─────────┤
-- │ Legend                   │ own = user_id/id = auth.uid()         │
-- │                          │ all = any authenticated user          │
-- │                          │ mbr = member via profiles join        │
-- │                          │  —  = denied (service key only)       │
-- └──────────────────────────┴───────────────────────────────────────┘
--
-- IMPORTANT: All current API routes use the service-role key, which
-- bypasses RLS entirely. These policies provide defense-in-depth and
-- protect against:
--   1. Direct client-side Supabase access (anon/authenticated key)
--   2. Future refactors that switch to client-side queries
--   3. Accidental data leakage via Supabase dashboard or REST API

COMMIT;
