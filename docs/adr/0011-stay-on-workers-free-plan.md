# Stay on the Workers free plan for now

Status: accepted. This is the current choice and may change. If the app outgrows the free plan, moving to Workers Paid ($5 a month) is the next step, and a new ADR replaces this one.

The app runs on the Cloudflare Workers free plan, which stops a request after about 10 ms of CPU time, so every request must fit under that limit. To fit, the app builds Better Auth once per isolate and reuses it, turns off the `set-auth-jwt` header that no code reads, and patches `@better-auth/cimd` so a metadata download that Cloudflare stops halfway no longer blocks later AI app connects on that isolate (better-auth#11675). Workers Paid removes the limit for $5 a month. We chose the code changes because they cost nothing and aim to bring requests back under 10 ms.
