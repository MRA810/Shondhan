# 🔍 Shondhan (সন্ধান)

A web app that connects **families searching for a missing person** with **police stations and hospitals that are caring for unidentified people**. Both sides describe the person using the same dropdown lists, the system suggests matches with a percentage score, and a **case officer confirms every match**: a score is never a verdict.

Bangla first (English toggle), dark mode by default (light toggle), glass UI, large touch targets, separate pages for every task.

---

## What is built

| Part of the idea | Where it lives |
|---|---|
| **Scenario 1: police station** posts a found person: face photos, NID / student / worker ID / licence pictures, body marks, belongings, location, contact | `/records/new` (police login) |
| **Scenario 2: medical team** posts a patient, with each mark or injury pinned to an exact body place (region → place nested dropdowns), plus medical notes | `/records/new` (medical login) |
| **Scenario 3: family**, new visitor: **welcome page → one big "Start report" page → the report in short steps (2–3 related questions per page, 12 pages with a progress bar and a review page) → their own name / phone / email / age → SMS code + password**. The account and the report are created together. At least 3 photos (max 8), optional ID pictures. Typed answers survive a page reload | `/`, `/report`, `/report/steps` |
| Logged-in family adds another report: same start page and steps, without the account part | `/cases/new` |
| **Phone check by SMS code** at family and staff signup; **forgot password** by SMS code | `/report/steps`, `/signup/staff`, `/forgot` |
| **Police see every missing report**, with search by name/place/belongings/family number and filters (gender, division, age range, last-seen dates, body mark type and region, cannot speak, has matches, sort). Case officers and admins too; medical teams and families cannot | `/reports` |
| **3D body figure**: in every form (family, police, medical) a mark's place is chosen by tapping the exact spot on a 3D human figure (drag to turn, pinch/scroll to zoom, front/back/left/right buttons). A list picker is there for people who can't tap, and it also pins the mark on the figure | `frontend/src/body/` |
| Marks are shown as numbered pins on a 3D figure wherever a person is displayed; officers see both sides on one figure (red = family, blue = found record) | case, match, record and officer pages |
| **Print**: families print an A4 "নিখোঁজ / MISSING" poster (photos, description, front/back figure with numbered marks, their phone number, 999); police/hospitals print an information sheet; a family can print a match to take to the station/hospital. "Save as PDF" works from the same print window | 🖨 buttons on those pages |
| Victim conditions: conscious, unconscious, mute, accident/disaster, **deceased (restricted)** | condition picker on the record form |
| **Duplicate merge with permission on both ends**: police and hospital records of the same person are detected; both reporters must agree before merging | merge cards on the reporter dashboard |
| **Matching with % accuracy**: only matches **over 50%** are kept; families are told about them at once (bands: strong ≥ 85, possible ≥ 60) | `backend/cases/matching.py` |
| **Eye-catching dashboard alert** and in-app notifications (badge, alerts page, refreshes every minute) | family dashboard, `/notifications` |
| **"Who visited which victim info"**: every view by a family, officer or admin is logged; families see "seen by officials N times", reporters see "viewed by families N times" | `AuditLog`, officer "who viewed this" panel |
| **Found = removed completely**: closing a post, closing a record or marking "reunited" deletes rows **and photo files** | family case page, record page, officer match page |
| Deceased records: families never see photos, place or score; only "an officer will contact you" after an officer confirms | enforced on the server |
| Staff approval: police / hospital apply, admin verifies and approves | `/signup/staff`, `/admin` |
| Case officer review queue with side-by-side comparison, confirm / rule out, reunite | `/officer` |
| Immutable audit ledger for auditors | `/audit` |
| Profile page with extra details | `/profile` |

### Roles

| Role | How the account is made | Home page |
|---|---|---|
| family | report first, then own details + SMS code (18+) | `/dashboard` |
| police, medical | apply at `/signup/staff`, admin approves | `/reporter` |
| officer, auditor, admin | created by an admin at `/admin/users` (or `createsuperuser`) | `/officer`, `/audit`, `/admin` |

---

## Run it

### 1. Database (once)

```bash
sudo -u postgres psql
CREATE USER shondhan WITH PASSWORD 'shondhan_pass';
CREATE DATABASE shondhan OWNER shondhan;
\q
```

> **Upgrading from the login-only version:** the user table gained new columns and the migrations were regenerated, so start from a fresh development database (your current one only has test signups):
> ```bash
> sudo -u postgres psql -c "DROP DATABASE shondhan;" -c "CREATE DATABASE shondhan OWNER shondhan;"
> ```
> Then replace the whole `backend/` and `frontend/src/` folders with these ones (keep your `backend/.env` and `venv/`).

### 2. Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                 # set DB_PASSWORD
python manage.py migrate
python manage.py seed_demo                           # optional: demo accounts + sample posts
python manage.py runserver
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173  (/api is proxied to Django on :8000)
```

Or run `./install.sh` once and then `./start_server.sh` (Windows: `install.bat`, `start_server.bat`).

### Open it on other devices

**Same Wi-Fi (phones, other laptops):**

```bash
./start_server.sh --lan
```

It prints the address to open, e.g. `http://192.168.0.105:5173`. Only the website listens on the network; Django stays private on the laptop and is reached through the website. If Ubuntu's firewall is on, allow the port once: `sudo ufw allow 5173/tcp`. Some public/venue Wi-Fi blocks devices from seeing each other; then use a phone hotspot or a tunnel.

**From the internet, for a demo (temporary link):** keep `./start_server.sh` running, and in a second terminal:

```bash
cloudflared tunnel --url http://localhost:5173     # prints https://<random>.trycloudflare.com
```

Install `cloudflared` once (it is not in the snap store):

```bash
curl --location --output cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$(dpkg --print-architecture).deb"
sudo dpkg -i cloudflared.deb
```
 `ngrok http 5173` works too. Anyone with the link can open the app, so for that set `DJANGO_DEBUG=0` in `backend/.env` (no error details, no on-screen SMS codes) and close the tunnel after the demo.

### SMS codes (signup, forgot password)

In development nothing is sent: with `SMS_BACKEND=console` (the default) the code is printed in the Django log, **and** shown on the page in a "Development mode" box (only while `DJANGO_DEBUG=1`).

For real SMS, set in `backend/.env`:

```
SMS_BACKEND=bulksmsbd        # or smsnetbd
SMS_API_KEY=your-key
SMS_SENDER_ID=your-approved-sender-id
```

Codes are 6 digits and last 5 minutes. Only a hash is stored. Each number can request one code per minute and 5 per hour, and a code allows 5 wrong tries. "Forgot password" gives the same answer whether or not the number has an account.

### Demo accounts (`seed_demo`)

Password for all: **`Shondhan@2026`**

| Role | Phone |
|---|---|
| admin | 01700000001 |
| case officer | 01700000002 |
| police (Mirpur Model Thana) | 01700000003 |
| medical (Dhaka Medical College Hospital) | 01700000004 |
| auditor | 01700000005 |
| family (Ayesha Begum, searching for Rahim Uddin) | 01700000006 |

The demo already contains a family post, a police record and a hospital record of the same man. So you see two matches (90% and 77%) and a merge request between the police and the hospital straight away.

A good walkthrough is: family alert → police and medical both approve the merge → officer confirms the match → family sees "an officer checked a match" → officer marks reunited and everything is deleted.

### Tests

```bash
cd backend && python manage.py test        # 48 tests, needs PostgreSQL running
DB_ENGINE=sqlite python manage.py test     # same tests without PostgreSQL
```

---

## Build for production

Development (`./start_server.sh`) runs two servers: Vite for the website and Django for the API.
Production runs **one**: the React site is compiled once and Django serves it together with the API.

```bash
# 1. settings: in backend/.env
DJANGO_DEBUG=0
DJANGO_SECRET_KEY=...            # python3 -c "import secrets; print(secrets.token_urlsafe(50))"
DJANGO_ALLOWED_HOSTS=your-domain.com,localhost,127.0.0.1
CSRF_TRUSTED_ORIGINS=https://your-domain.com
SMS_BACKEND=bulksmsbd            # real SMS codes (console only prints them in the log)

# 2. build (after every update)
./build.sh

# 3. run  ->  http://localhost:8000
./start_production.sh
```

`build.sh` installs packages, builds the website (`frontend/dist/`), applies migrations, collects the admin
styles and downloads the face models. `start_production.sh` runs gunicorn (2 workers x 4 threads).
To try the production build on your laptop over plain http, also set `DJANGO_HTTPS=0`.
For a demo without an SMS provider, `OTP_DEMO_MODE=1` shows the code on screen. Never use that with real users.

To put it online, point a Cloudflare Tunnel at `http://localhost:8000`:
`cloudflared tunnel --url http://localhost:8000`.

## How matching works

`backend/cases/matching.py` compares a family post with every active found record (opposite gender is skipped):

| Signal | Points |
|---|---|
| Same ID number (NID etc.) | 97, straight away |
| Same gender | 12 |
| Age inside the record's estimated range (±3) | 18 |
| Body marks: same type and pinned within 6 cm on the 3D figure (15 cm: most points), otherwise same body place → same region → elsewhere | up to 26 |
| Clothing item + colour, and belongings words | up to 20 |
| Name the person gave matches | 10 |
| Same division | 8 |
| Skin / build / hair, 3 each | up to 12 |
| Height within 8 cm | 4 |
| Cannot speak ↔ mute | 5 |
| Found *before* they went missing | −20 |

Only pairs scoring **over 50** are stored; families are notified about them straight away (restricted/deceased ones go to the officer queue instead). Police/hospital pairs scoring 60 or more are offered for merging.

### Photo matching (face AI)

Every face photo is checked by a face AI: **OpenCV YuNet** finds the face, **SFace** turns it into 128 numbers.
Both are free (Apache-2.0), run on a normal laptop CPU (≈50–150 ms per photo), and need ~40 MB of model files.
`start_server.sh` installs `opencv-python-headless` and downloads the models the first time it runs. To do it by hand:

```bash
cd backend
venv/bin/pip install -r requirements.txt
venv/bin/python manage.py download_face_models     # once
venv/bin/python manage.py face_check me1.jpg me2.jpg friend.jpg   # test it on your own photos
venv/bin/python manage.py process_faces            # photos uploaded before the models were installed
```

**How photos and details are combined.** The program measures how many details *both* sides gave
(gender, age, height, area, marks, clothing, looks, name = 110 points max): that share is the *coverage*.

| Details both sides gave | Details count | Photos count |
|---|---|---|
| Almost all (coverage 100%) | 80% | 20% |
| About half | 50% | 50% |
| Almost none (e.g. an unconscious person with only a photo) | 20% | 80% |

`final = (1 − w) × details + w × face%`, with `w = 0.2 + 0.6 × (1 − coverage)`.
The face % is the best pair among all family photos × all found-person photos (cosine similarity, 50% at OpenCV's
0.363 "same person" threshold). A small or blurry face pulls the face % towards 50% ("not sure") instead of giving a firm yes or no.
A gender mismatch or the same ID number still decides on its own. If either side has no clear face, only the details are used.
Police and hospital duplicates use the same rule.

Faces are found in a background thread right after an upload, then matching runs again, so a family can get a
"possible match" a few seconds after the police post a photo. The officer's review page shows the face % and the
two photos the AI paired (outlined); a family sees "No clear face" on photos that could not be used, with a tip to add a better one.
`python manage.py explain_match <case id>` prints every step, including the photo step. Set `FACE_MATCHING=off` in `.env` to turn it off.

The AI only suggests. A case officer always confirms before a family is told someone was found.

---

## API (all under `/api/`, JWT Bearer)

| Who | Method and path | Purpose |
|---|---|---|
| anyone | `POST auth/login/`, `auth/refresh/` | login (`invalid` / `locked` / `pending`) |
| anyone | `POST auth/otp/send/` `{"phone", "purpose": "signup" \| "reset"}` | send a 6-digit SMS code |
| anyone | `POST auth/register-report/` (multipart: report fields + photos + `full_name, phone, email, age, password, consent, otp`) | new family: account + report together, returns tokens |
| anyone | `POST auth/register/`, `auth/register-staff/` (both need `otp`) · `POST auth/password/reset/` `{"phone", "otp", "password"}` | account only, staff application, forgot password |
| police, officer, admin | `GET reports/?q=&gender=&division=&age_min=&age_max=&seen_from=&seen_to=&mark_type=&mark_region=&cannot_speak=1&has_matches=1&sort=` · `GET reports/<id>/` | every family report |
| any user | `GET/PATCH auth/me/` | profile |
| any user | `GET notifications/`, `POST notifications/read/` | alerts (`{"ids": [...]}` or all) |
| any user | `GET photos/case/<id>/`, `photos/record/<id>/` | private photos, permission-checked |
| family | `GET family/summary/` · `POST family/cases/` (multipart) · `GET/DELETE family/cases/<id>/` · `GET family/matches/<id>/` | dashboard, post, view/close, match detail |
| police/medical | `GET reporter/summary/` · `GET/POST reporter/records/` · `GET/PATCH/DELETE reporter/records/<id>/` · `DELETE reporter/records/<id>/photos/<pid>/` · `POST reporter/merges/<id>/` `{"approve": true}` | records and merges |
| officer, admin | `GET officer/queue/?status=&kind=` · `GET/POST officer/matches/<id>/` `{"decision": "confirm" \| "reject", "note"}` · `POST officer/matches/<id>/reunite/` · `GET officer/records/[<id>/]` | review |
| admin | `GET admin/summary/` · `GET/POST admin/users/` · `PATCH admin/users/<id>/` `{"action": "approve" \| "activate" \| "deactivate" \| "unlock"}` · `DELETE admin/users/<id>/` (reject request) | accounts |
| auditor, admin | `GET audit/?action=&actor_role=&target_type=&target_id=&page=` | ledger |

---

## Project structure

```
backend/
  config/            settings (PostgreSQL from .env), urls
  accounts/          User model (roles, staff fields), login with lockout, signup, staff application, profile,
                     otp.py + sms.py (SMS codes: console / bulksmsbd / sms.net.bd), PhoneOTP model
  cases/
    models.py        MissingCase, CasePhoto, FoundRecord, RecordPhoto, Match, MergeRequest, Notification, AuditLog
    traits.py        shared dropdown vocabulary, mark validation (incl. the 3D point "pos": [x, y, z]) (body regions → places, marks, clothing, colours, traits, ID types)
    matching.py      scoring (details + photos), duplicate detection
    faces.py         face AI: find face, 128 numbers, compare, background processing
    services.py      notifications, audit, officer review, reunite, merge
    views.py, urls.py, tests.py
    management/commands/seed_demo.py
frontend/src/
  api.js             fetch wrapper, token refresh, private photo loader
  i18n.js            every text in Bangla and English
  traits.js          same vocabulary as backend/cases/traits.py
  body/              3D figure: body3d.js (three.js mannequin, tap-to-pin, print snapshots), bodyMap.js (tap point → body place),
                     BodyModel.jsx, MarksFigure.jsx (loaded only when a page needs it)
  session.jsx, prefs.jsx, hooks.js, styles.css
  components/        Layout (role-aware nav, bottom tab bar on phones), form inputs, PrintSheet (A4 poster / sheet), shared UI
  pages/             Login, Forgot, StaffSignup, Notifications, Profile
    report/          Welcome, ReportStart, ReportWizard (the step-by-step report, guest + member), GuestReport
    reports/         Reports (police: every family report, search + filters)
    family/          FamilyHome, MemberReport, CaseView, MatchView
    reporter/        ReporterHome, RecordForm, RecordView, MergeCard
    officer/         OfficerQueue, OfficerMatch, OfficerLists
    admin/           AdminHome, AdminUsers, AuditLog
```

## Design

- **Dark theme (default):** background `#194350`, borders `#9DBEB8`, details (secondary text, links, labels, count badges) `#FFC2B4`, highlights (main buttons, active items, rings) `#FF8882`, text `#FFF2EF`. Button text on the coral is a darker shade of the background (6.5:1).
- **Light theme:** the original palette `#FCF9EA` / `#DB9558` / `#97A87A` / `#A8BBA3`. `#DB9558` carries dark text (6.8:1), because white on it fails contrast. The greens are only used for borders and decoration.
- **Background:** a soft gradient glow (dark: `#9DBEB8` top-left and `#FF8882` bottom-right, capped at 20% / 28% so text standing on it stays readable; light: `#DB9558` and `#A8BBA3`).
- **Layout style (flat dashboard):**
  - a top navigation bar: logo and page links on the left; on the right the highlighted **+ Add post / + New record** button, the **bell** (count badge, rings while there are unread alerts), language/theme, who is logged in, and an outlined **Logout** button (it goes back to the main page). On phones the links move to a bottom tab bar with a raised "+" button in the middle;
  - **pop-up messages**: the app checks every 30 s and slides in a pop-up on any page when a new match or alert arrives (one at a time on phones, with "+N more"); each alert pops up once; the unread count also shows in the browser tab title;
  - solid panels with 4px corners and no blur;
  - UPPERCASE section titles with square count badges;
  - list rows with a round photo, "source | date" details, pill tags, a score ring and "›";
  - "→" on the main actions;
  - a light "feature" panel for the match alert.
- Every text/background pair meets **WCAG AA** (at least 4.5:1). All colours are CSS variables at the top of `frontend/src/styles.css`.
- **Nothing gets skipped by accident:**
  - The marks page asks "Does … have any marks? Yes / No / Not sure" first.
  - A mark is saved the moment its type is tapped (no "Add" button to forget).
  - A tapped place without a type, or a clothing item picked but not added, stops the person with a clear message.
  - The review page lists every section with ✓ or a highlighted "Not given" and an "Add" button, plus "X of 9 sections filled in".
- **Main page** is for families; an **Authority login** strip leads to `/authority`, which has police (login + apply), doctor / hospital (login + apply) and case officer / admin / auditor (login) options.

## The 3D figure

- Model space is metres, feet at y = 0, facing the viewer (+z). The person's **left** is +x, so it appears on screen-right in the front view, like looking at someone. The help text says this.
- Each mark is saved as `{"region", "part", "type", "detail", "pos": [x, y, z]}`. The region and exact place come from the tap (`bodyMap.js → locate`), so lists, matching and printouts stay readable even without 3D.
- Devices without WebGL fall back to the region → exact place dropdowns.
- three.js (~130 kB gzipped) is a separate chunk that loads only on pages that show the figure.

## Privacy and safety

- Photos are stored in `backend/private_media/`, outside any public folder, and served only to people allowed to see them: the owner, a case officer, the reporter, or a family with a living match (face photos only, never ID pictures).
- Deceased records never reveal anything to families. Their printed sheet is marked CONFIDENTIAL.
- Printed missing posters never include ID pictures or ID numbers.
- Every view, create, change, merge and delete is written to an append-only audit log, which survives deletion of the case.
- Login lockout (5 tries / 15 min), throttling, 15-minute access tokens with refresh, admin-approved staff accounts.

**Before going online:** set `DJANGO_DEBUG=0`, a long random `DJANGO_SECRET_KEY`, real `DJANGO_ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS`, and a new database password. Serve with gunicorn behind HTTPS, build the frontend with `npm run build`, and back up `private_media/` together with the database.

## Not built yet (future scope)

- Mark / clothing image AI (faces are done; the same pattern can be used for tattoos and clothes).
- SMS alerts for new matches (SMS is used only for codes so far; alerts are in-app).
- Kidnapping workflows.
