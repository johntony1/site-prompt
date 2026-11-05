-- one row per event: an install, a first run (plugin installs that never ran the installer), a tool used
CREATE TABLE IF NOT EXISTS events (
	ts INTEGER NOT NULL,        -- unix ms
	event TEXT NOT NULL,        -- install | uninstall | first_run | tool
	id TEXT NOT NULL,           -- a random id made on the machine; nothing about the person
	v TEXT,                     -- site-prompt version
	os TEXT,                    -- darwin | linux | win32
	agent TEXT,                 -- the MCP client (claude-code, codex, cursor…) or, for installs, the agents installed into
	tool TEXT,                  -- for tool events: site_pick, site_read…
	ok INTEGER,                 -- the tool call succeeded
	country TEXT                -- from Cloudflare, two letters
);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS events_event ON events (event, ts);
