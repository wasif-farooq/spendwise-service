-- 024_activity_logs.sql - Activity logs with monthly partitions
CREATE TABLE activity_logs (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL,
    user_id UUID,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    metadata JSONB DEFAULT '{}',
    activity_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- A partitioned table's primary key must include the partition column.
    PRIMARY KEY (id, activity_date)
) PARTITION BY RANGE (activity_date);

CREATE INDEX idx_activity_logs_workspace_id ON activity_logs (workspace_id);
CREATE INDEX idx_activity_logs_entity ON activity_logs (entity_type, entity_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs (user_id);
CREATE INDEX idx_activity_logs_action ON activity_logs (action);
CREATE INDEX idx_activity_logs_date ON activity_logs (activity_date);
CREATE INDEX idx_activity_logs_workspace_date ON activity_logs (workspace_id, activity_date);

CREATE TABLE activity_logs_y2026m05 PARTITION OF activity_logs
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE activity_logs_y2026m06 PARTITION OF activity_logs
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE activity_logs_y2026m07 PARTITION OF activity_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE activity_logs_y2026m08 PARTITION OF activity_logs
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE activity_logs_y2026m09 PARTITION OF activity_logs
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE activity_logs_y2026m10 PARTITION OF activity_logs
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE activity_logs_y2026m11 PARTITION OF activity_logs
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE activity_logs_y2026m12 PARTITION OF activity_logs
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE activity_logs_default PARTITION OF activity_logs DEFAULT;

CREATE OR REPLACE FUNCTION create_activity_partition(year INT, month INT)
RETURNS TEXT AS $$
DECLARE
    partition_name TEXT;
    start_date TEXT;
    end_date TEXT;
    end_year INT;
    end_month INT;
    sql TEXT;
BEGIN
    partition_name := format('activity_logs_y%sm%s', year, lpad(month::text, 2, '0'));
    start_date := format('%s-%s-01', year, lpad(month::text, 2, '0'));

    end_month := (month % 12) + 1;
    end_year := year + (month / 12);
    end_date := format('%s-%s-01', end_year, lpad(end_month::text, 2, '0'));

    sql := format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF activity_logs FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
    );

    EXECUTE sql;
    RETURN partition_name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ensure_activity_partitions(start_date TIMESTAMP, end_date TIMESTAMP)
RETURNS VOID AS $$
DECLARE
    -- Not `current_date`: that is a reserved SQL keyword and fails to parse.
    month_cursor TIMESTAMP;
BEGIN
    month_cursor := date_trunc('month', start_date);
    WHILE month_cursor < end_date LOOP
        PERFORM create_activity_partition(
            EXTRACT(YEAR FROM month_cursor)::INT,
            EXTRACT(MONTH FROM month_cursor)::INT
        );
        month_cursor := month_cursor + INTERVAL '1 month';
    END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION list_activity_partitions()
RETURNS TABLE (
    partition_name TEXT,
    partition_range TEXT
) AS $$
DECLARE
    child RECORD;
    parent_oid OID;
BEGIN
    SELECT oid INTO parent_oid FROM pg_class WHERE relname = 'activity_logs';

    FOR child IN
        SELECT c.relname, pg_get_expr(c.relpartbound, c.oid) as range_expr
        FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = parent_oid
        ORDER BY c.relname
    LOOP
        partition_name := child.relname;
        partition_range := child.range_expr;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
