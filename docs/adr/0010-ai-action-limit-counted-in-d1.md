# The AI action limit is counted in D1

The AI action limit, 60 AI actions a minute for each account, is a count in one D1 row per account, not Cloudflare's Workers Rate Limiting binding. The binding counts apart in each Cloudflare location and lets calls pass the limit before its counts meet, and its price on the free plan is not written down. One row per account, raised in one statement each call, gives the exact limit for the cost of one D1 write per AI action. The count runs per clock minute, so up to 120 actions can pass across the edge of a minute.
