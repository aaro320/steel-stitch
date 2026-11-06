# Steel & Stitch — Next.js + Supabase

## Setup
1. Create a Supabase project. Run `supabase/schema.sql` in the SQL Editor.
2. Copy `.env.example` to `.env.local`. Add Supabase URL, anon key, **SUPABASE_SERVICE_ROLE_KEY** (server-only) and random 32+ character AUTH_SESSION_SECRET.
3. Run `npm install` then `npm run dev`. Open http://localhost:3000.
4. Sign in with a seeded profile and PIN `1234`. Security answer: `Bulacan`. **Change all seeded PINs and security answers before real use.**
5. Deploy to Vercel by importing the Git repository. Add the same four environment variables in Vercel Project Settings → Environment Variables. Redeploy.

## Important security and functional limitations
- This is an academic/demo starter, **not a production-ready security implementation**. The server uses the service role key, which bypasses RLS; server API checks are therefore critical.
- The RPC functions currently trust the actor UUID passed by the server. Only call them from trusted server endpoints; do not grant execution to anon/authenticated.
- Security-question reset is weak authentication; apply rate limiting, monitoring, and stronger recovery before production.
- Stock adjustments currently only decrease stock. For positive corrections use Stock-In.
- Job-order material creation interrupts the unsaved job form.
- Report usage totals are all-time, not period filtered.
- The requested 3-click workflow is not strictly met.
- Existing records are displayed but editing/deleting supplier, catalog and material records is not yet implemented.
- No automated tests or live Supabase/Vercel verification included.
