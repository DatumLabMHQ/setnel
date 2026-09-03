-- Register the dashboards we know about. `enabled` reflects what's actually
-- WIRED into Setnel (reporting via a cron). Only enable a dashboard once its
-- detectors are live — see docs/ONBOARD_A_DASHBOARD.md.
--
-- IMPORTANT: on conflict we DO NOT touch `enabled`. It is operational state
-- managed at runtime (enable on wiring, disable when retired); re-running this
-- seed must never clobber it. Only metadata is refreshed.

INSERT INTO dashboards (id, name, protocol_slug, base_url, enabled) VALUES
  ('aave',          'Aave V3',                       'aave-v3',      'https://aave-dashboard.vercel.app',                true),
  ('sui',           'State of SUI',                  'sui-lending',  'https://sui-lending.vercel.app',                   true),
  ('navi',          'Navi Lending',                  'navi',         'https://sui-lending.vercel.app', false),
  ('centrifuge',    'Centrifuge RWA',                'centrifuge',   'https://datumlabs-centrifuge.vercel.app',          false),
  ('defi_tvl',      'DeFi TVL Benchmark',            'defi-tvl',     'https://defi-tvl-dashboard.vercel.app',            false),
  ('liquidator',    'Liquidator Economy',            'liquidator',   'https://liquidator-economy-dashboard.vercel.app',  false),
  ('lending_intel', 'Lending Intelligence Terminal', 'lending-intel','https://lending-intelligence-terminal.vercel.app', false),
  ('sparklend',     'Spark Lend',                    'sparklend',    'https://sparklend-dashboard.vercel.app',           false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  protocol_slug = EXCLUDED.protocol_slug,
  base_url = EXCLUDED.base_url;
  -- note: enabled intentionally NOT updated here
