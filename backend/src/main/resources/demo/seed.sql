CREATE TABLE IF NOT EXISTS demo_seed (
    seed_version integer PRIMARY KEY CHECK (seed_version = 1)
);

DO $$
DECLARE
    continuous_id uuid := gen_random_uuid();
    event_id uuid := gen_random_uuid();
    continuous_a uuid := gen_random_uuid();
    continuous_b uuid := gen_random_uuid();
    event_a uuid := gen_random_uuid();
    event_b uuid := gen_random_uuid();
    this_month date := date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
    IF EXISTS (SELECT 1 FROM demo_seed WHERE seed_version = 1) THEN
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM projects) OR EXISTS (SELECT 1 FROM browser_context_roots)
        OR EXISTS (SELECT 1 FROM anonymous_subjects) THEN
        RAISE EXCEPTION 'Demo seed requires an empty ledger';
    END IF;

    INSERT INTO projects (id, public_token, name, description, type, currency, rounding_unit, status, created_at, updated_at)
    VALUES
        (continuous_id, left(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 43),
         'こもれび共同アトリエ', '架空の共同作業スペースの月次支出', 'CONTINUOUS', 'JPY', 1, 'ACTIVE', now(), now()),
        (event_id, left(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 43),
         '星見ピクニック', '架空のイベントの準備と当日の支出', 'EVENT', 'JPY', 1, 'ACTIVE', now(), now());

    INSERT INTO project_members (id, project_id, name, display_order, created_at, updated_at)
    VALUES (continuous_a, continuous_id, 'こむぎ', 1, now(), now()),
           (continuous_b, continuous_id, 'みどり', 2, now(), now()),
           (event_a, event_id, 'つき', 1, now(), now()),
           (event_b, event_id, 'すみれ', 2, now(), now());

    WITH added AS (
        INSERT INTO expenses (id, project_id, payer_member_id, amount, content, category, paid_on, created_at, updated_at)
        VALUES (gen_random_uuid(), continuous_id, continuous_a, 8400, '共用備品', 'DAILY_NECESSITIES', this_month - 1, now(), now()),
               (gen_random_uuid(), continuous_id, continuous_a, 12000, 'アトリエ利用料', 'OTHER', this_month, now(), now()),
               (gen_random_uuid(), continuous_id, continuous_b, 3200, '共同作業の軽食', 'FOOD', this_month, now(), now()),
               (gen_random_uuid(), event_id, event_a, 2400, '下見の交通費', 'TRANSPORTATION', this_month - 1, now(), now()),
               (gen_random_uuid(), event_id, event_b, 6800, 'ピクニックの食材', 'FOOD', this_month, now(), now())
        RETURNING id, project_id, amount
    )
    INSERT INTO expense_participants (id, expense_id, member_id, allocated_share, allocation_order)
    SELECT gen_random_uuid(), added.id, member.id, added.amount / 2, member.display_order
    FROM added JOIN project_members AS member ON member.project_id = added.project_id;

    INSERT INTO demo_seed (seed_version) VALUES (1);
END $$;

GRANT USAGE ON SCHEMA public TO spendingmate_demo_runtime;
GRANT SELECT ON demo_seed TO spendingmate_demo_runtime;
GRANT SELECT, INSERT, UPDATE ON projects, project_members, settlement_runs TO spendingmate_demo_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON expenses, expense_participants TO spendingmate_demo_runtime;
GRANT SELECT, INSERT ON settlement_balances, settlement_transfers TO spendingmate_demo_runtime;
