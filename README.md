<div align="center">

# 🛡️ Test Portal & AI Anti-Cheat Proctoring Suite

**Enterprise-Grade Online Assessment Platform with Real-Time Multi-Object AI Proctoring, Document Question Parser, and Psychometric Analytics.**

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-Computer_Vision-FF6F00?style=for-the-badge&logo=tensorflow)](https://www.tensorflow.org/js)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-Modern_UI-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)

</div>

---

## 🌟 Key Features

### 👁️ 1. AI Webcam Multi-Object Proctoring (Zero Server GPU Cost)
* **Real-time Client-Side Deep Learning**: Runs directly in the candidate's browser using **TensorFlow.js + COCO-SSD** and Optical Fallback heuristics.
* **Multi-Category Violation Detection**:
  * 📱 **Mobile Phones & Smart Devices**: Detects handheld smartphones, tablets, and smartwatches.
  * 📚 **Books, Notes & Papers**: Identifies prohibited textbooks and cheat sheets.
  * 💻 **Secondary Displays & Laptops**: Detects dual-monitor setups and secondary computers.
  * 🎧 **Headphones & Audio Devices**: Flags over-ear headphones and ear-pieces.
  * 👥 **Multiple People**: Alerts if a helper or secondary person enters the webcam frame.
* **Live Candidate Warning HUD**: Dynamic floating PiP webcam with animated violation toasts and glowing bounding boxes.
* **Integrity Telemetry**: Tracks head pose/gaze deviations, fullscreen lockouts, tab-blurs, and audio anomalies.

---

### 📄 2. Smart Document Question Importer (Device Upload)
* **Drag-and-Drop File Scanner**: Import questions directly from **Word (`.docx`, `.doc`)**, **Excel (`.xlsx`, `.xls`)**, and **CSV** files.
* **Intelligent Q&A Parser**: Auto-extracts numbered questions, multiple choice options (A, B, C, D), and detected correct answer keys.
* **Interactive Live Preview**: Preview scanned questions with real-time validation error resolution before adding to question banks.

---

### 🏷️ 3. Question Origin Explorer & Multi-Format Authoring
* **Visual Source Badging**: Every question is tagged as **`📤 Uploaded`** (from device document) or **`✍️ Typed`** (manually authored).
* **Live Search & Filter Tabs**: Filter questions instantly by source (`All`, `Uploaded`, `Typed`, `Selected`) or question type.
* **Option Choice Accordion**: 1-click option previews highlighting correct choices with green `✓ Correct` badges.
* **Question Types Supported**: `MCQ_SINGLE`, `MCQ_MULTI`, `NUMERIC`, and `LIKERT`.

---

### ⏱️ 4. Test & Section Engine with Anti-Cheat Pool Sampling
* **Multi-Section Exams**: Configure sequential sections with independent time limits and quick-click duration presets (`5m`, `10m`, `15m`, `30m`, `60m`).
* **Delivery Strategies**:
  * ⚡ **Fixed Sequence**: Deterministic order for standard structured assessments.
  * 🎲 **Random Pool Sampling (Anti-Cheat)**: Randomly samples $N$ questions per candidate from the pool to prevent answer sharing.
* **Cutoff Grading**: Custom passing percentage threshold (`%`) with automatic pass/fail classification.

---

### 📊 5. Analytics, Psychometrics & Proctoring Audit
* **Candidate Results Portal**: Scorecards with percentiles, section breakdowns, pass/fail status, and tab blur counts.
* **Psychometrics Dashboard**: **Cronbach's Alpha** test reliability score, question difficulty, and discrimination index heatmaps.
* **Proctoring Incident Timeline**: Threat severity levels (`HIGH RISK`, `MEDIUM`, `CLEAN`), prohibited object KPI counters, and chronological AI event logs.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Next.js 15 (App Router)](https://nextjs.org/) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/) + [Prisma ORM](https://www.prisma.io/) |
| **Authentication** | [NextAuth.js](https://next-auth.js.org/) (Multi-Tenant Org Isolation) |
| **AI / Computer Vision** | [TensorFlow.js](https://www.tensorflow.org/js) + COCO-SSD |
| **Document Parsers** | `mammoth` (Word/Docx), `xlsx` (Excel), `papaparse` (CSV) |
| **Styling** | Vanilla CSS + TailwindCSS Design System |

---

## 🚀 Quick Start Guide

### 1. Clone the Repository
```bash
git clone https://github.com/AdityaPawade05/test-portal.git
cd test-portal
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Environment Variables
Copy `.env.example` to `.env` and fill in your database credentials:
```bash
cp .env.example .env
```

### 4. Run Prisma Migrations
```bash
npx prisma migrate dev
```

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📂 Project Architecture

```
test-portal/
├── app/
│   ├── (admin)/               # Admin command center & management
│   │   ├── dashboard/         # Executive assessment dashboard
│   │   ├── banks/             # Question banks & document scanner
│   │   ├── tests/[id]/        # Builder, Results, Analytics, Proctoring
│   │   └── invitations/       # Candidate roster & link distribution
│   ├── (auth)/                # Login & Organization authentication
│   ├── api/                   # REST endpoints (Questions, Attempts, Proctoring)
│   └── take/[token]/          # Candidate timed test-taking engine
├── components/
│   ├── admin/                 # Test builder, question cards, proctoring portal
│   ├── candidate/             # Webcam proctor HUD, question renderer
│   └── ui/                    # Design system cards, badges, buttons, spinners
├── lib/
│   ├── vision-proctor.ts      # Multi-object detection & optical CV heuristics
│   ├── bulk-scan-server.ts    # Word, Excel, CSV document parser
│   ├── session-engine.ts      # Assessment lifecycle & scoring algorithm
│   ├── psychometrics.ts       # Cronbach's Alpha & item statistics
│   └── db.ts                  # Prisma client instance
└── prisma/
    └── schema.prisma          # PostgreSQL relational data schema
```

---

## 📜 License
This project is licensed under the [MIT License](LICENSE).
