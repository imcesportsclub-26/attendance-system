# IMC Esports Club Attendance System v4

Free-stack event attendance system for MLBB Scrims, PUBG Scrims, Meetings, Training and other club events.

## What v4 does
- Super Admin-only dashboard and attendance logs
- Create unlimited event records within your free Supabase limits
- Event types: MLBB Scrim, PUBG Scrim, Meeting, Training, Other
- Unique QR/check-in URL for every event
- Optional open/close time window and manual Open/Close switch
- Team Name required for scrims by default; optional for Meetings
- Duplicate protection: same Student Name + Batch/Intake can check in only once per event
- Public users can submit attendance but cannot read attendance logs
- Event-specific search and CSV export

## Free platforms
1. GitHub — source repository
2. Supabase Free — database, authentication and Row Level Security
3. Cloudflare Pages Free — static website hosting

## Setup
1. Create a Supabase Free project.
2. Open SQL Editor, paste all of `supabase.sql`, and Run.
3. In Authentication -> Users, create your Super Admin email/password account.
4. Copy that user's UUID and run:
   `insert into public.super_admins(user_id) values ('YOUR-SUPER-ADMIN-USER-UUID');`
5. In Supabase Project Settings/API, copy the Project URL and public anon/publishable key.
6. Put them in `config.js`. NEVER put a service_role/secret key in this project.
7. Upload this folder to a GitHub repository.
8. In Cloudflare Pages, connect the GitHub repo and deploy it as a static site (no build command required).
9. Open `/login.html`, sign in as Super Admin, create an event, and download its QR.

## Usage
- Super Admin: `https://YOUR-SITE.pages.dev/login.html`
- Student/member: scans the QR generated for a specific event.
- Each QR looks like `https://YOUR-SITE.pages.dev/?event=unique-event-slug`

## Security model
The `events` and `attendance` tables have RLS enabled. Only a UUID listed in `super_admins` can directly read/manage them. Public visitors get limited event display information via `get_public_event()` and submit via `check_in_event()`. They cannot SELECT attendance rows.

## Recommended event workflow
Create event -> set date/open/close window -> download QR -> display QR at venue -> members check in -> manually close check-in when finished -> export selected event CSV if needed.

## Note on time zones
The browser sends event open/close times as absolute timestamps, so the times entered in the Super Admin browser use that device's local timezone. Keep the Super Admin device clock/timezone correct.
