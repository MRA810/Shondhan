# 🔍 Shondhan (সন্ধান)

An AI-powered web application designed to bridge the gap between missing persons and their searching families.

Every week, countless individuals go missing due to accidents, memory loss, or natural disasters, leaving families to frantically search through random police stations and hospitals. **Shondhan** centralizes this process. By leveraging AI-driven multimodal feature matching, the platform connects "Found Streams" (institutions like police and hospitals) with "Searching Streams" (families), narrowing down searches with percentage-based accuracy to reunite families faster.

> **Target Audience:** Designed with a very basic, minimal, and intuitive interface so that people of all ages and technical backgrounds can use it effortlessly.

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

## 💻 Tech Stack

- **Frontend:** React.js (Multi-page architecture)
- **Backend & AI Training:** Django (Primary Backend), FastAPI (API Gateway)
- **Database:** PostgreSQL (Relational DB), Qdrant (Vector DB for AI search)
- **Caching/Queues:** Redis (Async jobs & alerts)
- **AI/ML Models:** InsightFace (Facial vectors), YOLOv8-seg (Scar/Tattoo detection), OpenCLIP (Apparel vectors)

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

## 🚀 Future Scope

- Support and specific workflows for kidnapped victims.
- Further expansion of AI matching capabilities (e.g., aging progression for long-term missing individuals).
