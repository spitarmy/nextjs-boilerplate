-- ============================================================
-- カンテノ プラン分け: profiles テーブルにplanカラムを追加
-- ============================================================

-- 1) plan カラムを追加（デフォルトは 'light'）
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'light';

-- 2) 既存ユーザーは全員プロプランに設定
UPDATE profiles SET plan = 'pro' WHERE plan = 'light';

-- 3) 確認
SELECT id, email, plan FROM profiles;
