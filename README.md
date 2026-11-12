# 🔍 Shondhan (সন্ধান)

An AI-powered web application designed to bridge the gap between missing persons and their searching families.

Every week, countless individuals go missing due to accidents, memory loss, or natural disasters, leaving families to frantically search through random police stations and hospitals. **Shondhan** centralizes this process. By leveraging AI-driven multimodal feature matching, the platform connects "Found Streams" (institutions like police and hospitals) with "Searching Streams" (families), narrowing down searches with percentage-based accuracy to reunite families faster.

> **Target Audience:** Designed with a very basic, minimal, and intuitive interface so that people of all ages and technical backgrounds can use it effortlessly.

---

## 🚀 Getting Started — Run on Your PC

Follow these steps to clone, set up, and run the full Shondhan project locally.

### Prerequisites

Make sure these are installed on your system:

| Tool           | Minimum Version | Install Guide |
|----------------|-----------------|---------------|
| **Git**        | 2.30+           | [git-scm.com](https://git-scm.com/downloads) |
| **Python**     | 3.10+           | [python.org](https://www.python.org/downloads/) |
| **Node.js**    | 18+             | [nodejs.org](https://nodejs.org/) |
| **npm**        | 9+              | Comes with Node.js |
| **PostgreSQL** | 14+             | [postgresql.org](https://www.postgresql.org/download/) |

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/MRA810/Shondhan.git
cd Shondhan
```

To work on the development branch:

```bash
git checkout atest
```

---

### Step 2 — Set Up PostgreSQL Database

Open a terminal and run:

```bash
# Start PostgreSQL (if not already running)
sudo systemctl start postgresql     # Linux
# or: brew services start postgresql  # macOS

# Enter the PostgreSQL shell
sudo -u postgres psql
```

Inside the `psql` shell, run:

```sql
CREATE USER shondhan WITH PASSWORD 'shondhan_pass';
CREATE DATABASE shondhan OWNER shondhan;
GRANT ALL PRIVILEGES ON DATABASE shondhan TO shondhan;
\q
```

---

### Step 3 — Set Up the Backend (Django)

```bash
cd backend

# Create a Python virtual environment
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate          # Linux / macOS
# venv\Scripts\activate           # Windows (PowerShell)

# Install Python dependencies
pip install -r requirements.txt
```

#### Configure Environment Variables

Create the `.env` file inside the `backend/` folder:

```bash
cat > .env << 'EOF'
DJANGO_SECRET_KEY=change-me-to-a-random-string
DJANGO_DEBUG=1
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DB_NAME=shondhan
DB_USER=shondhan
DB_PASSWORD=shondhan_pass
DB_HOST=localhost
DB_PORT=5432
CORS_ALLOWED_ORIGINS=http://localhost:5173
EOF
```

> **⚠️ Important:** Change `DJANGO_SECRET_KEY` to a long random string in production. Keep `DB_PASSWORD` matching whatever you set in Step 2.

#### Apply Database Migrations

```bash
python manage.py migrate
```

#### Create an Admin User (Optional)

```bash
python manage.py createsuperuser
```

#### Start the Backend Server

```bash
python manage.py runserver
```

The Django API will be available at **http://localhost:8000**.

---

### Step 4 — Set Up the Frontend (React + Vite)

Open a **new terminal** (keep the backend running):

```bash
cd frontend

# Install Node.js dependencies
npm install

# Start the Vite dev server
npm run dev
```

The frontend will be available at **http://localhost:5173**.

> Vite is configured to proxy all `/api/*` requests to the Django backend at `localhost:8000`, so everything works seamlessly in development.

---

### Step 5 — Open in Browser

Go to **http://localhost:5173** in your browser.

- **Sign up** as a new family user from the registration page.
- **Log in** with your phone number/email and password.
- You'll land on the **Family Dashboard** showing your profile and cases (pulled live from the database).

---

## 📁 Project Structure

```
Shondhan/
├── README.md
├── backend/                    # Django REST API
│   ├── .env                    # Environment variables (not committed)
│   ├── manage.py
│   ├── requirements.txt        # Python dependencies
│   ├── config/                 # Django project settings
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   └── accounts/               # Main app (users, cases, matches)
│       ├── models.py           # User, FamilyCase, CaseMatch models
│       ├── serializers.py      # DRF serializers
│       ├── views.py            # API views
│       ├── urls.py             # API routes
│       └── migrations/         # Database migrations
└── frontend/                   # React SPA (Vite)
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx            # App entry point
        ├── App.jsx             # Routes
        ├── api.js              # API client (login, register, me, cases)
        ├── i18n.js             # Bangla & English translations
        ├── prefs.jsx           # Language & theme context
        ├── styles.css          # Global styles (Glassmorphism)
        └── pages/
            ├── Login.jsx
            ├── Signup.jsx
            ├── Dashboard.jsx   # Family dashboard
            └── Toggles.jsx     # Language & theme toggles
```

---

## 🔌 API Endpoints

All API routes are under `/api/auth/`:

| Method | Endpoint                          | Auth | Description |
|--------|-----------------------------------|------|-------------|
| POST   | `/api/auth/login/`                | No   | Log in with phone/email + password |
| POST   | `/api/auth/register/`             | No   | Register a new family user |
| POST   | `/api/auth/refresh/`              | No   | Refresh JWT access token |
| GET    | `/api/auth/me/`                   | Yes  | Get current user profile |
| GET    | `/api/auth/cases/`                | Yes  | List the logged-in user's cases |
| POST   | `/api/auth/cases/`                | Yes  | Create a new missing person case |
| GET    | `/api/auth/cases/<id>/matches/`   | Yes  | List matches for a specific case |

---

## 🌐 Localization

- **Primary Language:** Bangla (বাংলা)
- **Secondary Language:** English (Seamless toggle available)

---

## ✨ Key Features & Scenarios

### 1. Police Station Portal (Scenario 1)

When a victim is found and handed over to the police, authorized personnel can create a digital record:

- Upload facial photos, NID/Student ID, Driver's License.
- Log physical traits, previous body marks, and belongings via easy-to-use nested dropdowns.
- Record location and contact details.

### 2. Medical Team Portal (Scenario 2)

When an unidentified victim is brought in for treatment, medical staff can update the system:

- Upload medical traits specifically mapped to body locations using intuitive dropdowns.
- Log current condition, hospital location, and contact details.

### 3. Family Search Portal (Scenario 3)

Families searching for a loved one can create a missing person post:

- Upload at least 3 mandatory photos of the missing person (plus optional ID documents).
- Provide text-based physical traits.
- Submit family contact info (Name, Phone, optional Email, Relationship, Age).
- Monitor profile visits and track matching progress.

### ⚙️ Core Functionality

- **Smart Merging:** If a Police Station and a Hospital report the same victim, the system detects duplicate submissions and merges them (with mutual permission).
- **AI Matching & Notifications:** When a family uploads a profile, the system suggests potential matches from the database with a **% accuracy score**. Eye-catching dashboard notifications alert families instantly.
- **Auto-Cleanup:** Once a missing person is successfully found and verified, their record is permanently removed from the active database to ensure privacy and data relevance.

---

## 💻 Tech Stack

- **Frontend:** React.js + Vite (SPA with client-side routing)
- **Backend:** Django + Django REST Framework
- **Database:** PostgreSQL
- **Auth:** JWT (via `djangorestframework-simplejwt`)
- **Future:** Qdrant (Vector DB for AI search), Redis, InsightFace, YOLOv8-seg, OpenCLIP

---

## 🎨 UI/UX & Design System

The application features a modern **Glassmorphism (Glassy UI)** aesthetic with transparent elements to provide a clean, uncluttered, and soothing experience.

**Color Palette:**

- **Dark Mode (Default):**
  - Background/Base: `#2A1A0E`
  - Accents: `#D4621A`, `#F4AE52`, `#FEF3E2`
- **Light Mode:**
  - Background/Base: `#FCF9EA`
  - Accents: `#DB9558`, `#97A87A`, `#A8BBA3`

---

## 🏗️ System Architecture

### Process Flow

```text
       [SEARCHING STREAM]                                  [FOUND STREAM]
- Family / Police GD Postings                 - Emergency Trauma Units
- Old Photos, Age, Clothing                   - Shelters & Relief Camps
- Distinctive Scars / Tattoos                 - Forensic Morgue Records
               │                                            │
               └───────────────────────┬────────────────────┘
                                       ▼
                        [Multimodal Feature Ingestion]
                  - Facial geometry (swelling/age-invariant)
                  - Biometric marks (tattoos, birthmarks, scars)
                  - Attire context (color, fabric, accessories)
                                       │
                                       ▼
                         [Hybrid Vector Search & Match]
                  Evaluates similarity across both streams in < 1s
                                       │
                 ┌─────────────────────┴─────────────────────┐
                 ▼                                           ▼
       High-Confidence Match                          Ambiguous Match
        (Score ≥ Threshold)                         (Review Queue with
                 │                                 Visual Heatmaps / XAI)
                 ▼                                           │
      Verified Location Alert                                ▼
      to Family & Case Officer                      Officer Verification
```

### Infrastructure Layering

```text
+-------------------------------------------------------------------------+
|                        CLIENT PRESENTATION LAYER                        |
|   [Citizen/Family Portal]    [ER Trauma Intake UI]    [Police Desk]     |
+-------------------+---------------------+---------------------+---------+
                    |                     |                     |
                    v                     v                     v
+-------------------------------------------------------------------------+
|                   API GATEWAY & AUTHENTICATION LAYER                    |
|         FastAPI Gateway + JWT RBAC + Automated PII Vault Filter         |
+-------------------+-------------------------------------------+---------+
                    |                                           |
                    v                                           v
+---------------------------------------+ +-------------------------------+
|     MULTIMODAL BIOMETRIC PIPELINE     | |    GOVCOPILOT AGENTIC CORE    |
| - InsightFace (512-d Face Vector)     | | - Unstructured GD NER         |
| - YOLOv8-seg (Scars/Tattoo Crop)      | | - Statutory SOP RAG Engine    |
| - OpenCLIP (512-d Apparel Vector)     | | - LangGraph Triage Agent      |
+-------------------+-------------------+ +--------------+----------------+
                    |                                    |
                    +------------------+-----------------+
                                       |
                                       v
+-------------------------------------------------------------------------+
|                        DATA & PERSISTENCE LAYER                         |
|   [Qdrant Vector DB]       [PostgreSQL Relational DB]   [Redis Queue]   |
| - HNSW Hybrid Search       - Cases, Intakes, PII        - Async Jobs    |
| - Multi-Vector Payloads    - Immutable Audit Ledger     - Alert Bus     |
+-------------------------------------------------------------------------+
```

---

## 🧍 Victim Categorization

The platform handles various victim conditions, strictly categorizing sensitive data:

**1. Unidentified Living People (Reported by authorized reporters)**

- Conscious and able to communicate.
- Unconscious or unable to communicate.
- Mute or otherwise unable to provide identifying details.
- Found after accidents or disasters.

**2. Unidentified Deceased People (Restricted, sensitive records)**

- Deceased person with possible identifying information.
- Deceased person with no confirmed identity.
- Records containing forensic descriptions, clothing, belongings, or other evidence.

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| `FATAL: role "shondhan" does not exist` | Run the `CREATE USER` SQL command from Step 2 |
| `FATAL: database "shondhan" does not exist` | Run the `CREATE DATABASE` SQL command from Step 2 |
| `Error: That port is already in use` (8000) | Kill the old process: `kill $(lsof -ti :8000)` or use a different port |
| Frontend shows blank white page | Check the browser console (F12) for errors; make sure the backend is running |
| `ModuleNotFoundError` on backend start | Make sure you activated the venv: `source venv/bin/activate` |
| `npm install` fails | Make sure Node.js 18+ is installed: `node --version` |

---

## 🚀 Future Scope

- Support and specific workflows for kidnapped victims.
- Further expansion of AI matching capabilities (e.g., aging progression for long-term missing individuals).
- Integration with Qdrant vector database for facial/biometric AI search.
- Redis-based real-time notifications and background job processing.

---

## 📄 License

This project is developed for the **AI Builders Congress**.
