# Smart Logistics Decision System
**Web Development Course Project**

---

## Project Structure

```
smart-logistics/
├── public/
│   ├── index.html        ← Home page
│   ├── system.html       ← Decision system (main)
│   ├── about.html        ← About Us
│   ├── contact.html      ← Contact Us
│   ├── css/
│   │   └── style.css     ← External CSS only (no inline styles)
│   └── js/
│       ├── main.js       ← Navbar, scroll reveal, counters
│       ├── system.js     ← Decision logic + ORS API
│       └── contact.js    ← Contact form validation
└── backend/
    ├── server.js         ← Node.js + Express REST API
    ├── schema.sql        ← MySQL database setup
    └── package.json
```

---

## Setup Instructions

### 1. Database (MySQL)

```sql
-- Open MySQL and run:
source backend/schema.sql
```

### 2. Backend (Node.js)

```bash
cd backend
npm install
npm start
# Server runs on http://localhost:3000
```

### 3. Open the site

Navigate to `http://localhost:3000` in your browser.

---

## API Endpoints

| Method | Endpoint        | Description                  |
|--------|-----------------|------------------------------|
| GET    | /api/decisions  | Fetch all saved decisions     |
| POST   | /api/decisions  | Save a new decision result    |

---

## External API

- **OpenRouteService** (https://openrouteservice.org)
  - Used for: fetching real route distance and duration
  - Endpoints used: `/geocode/search`, `/v2/directions/driving-car`
  - The API provides **data only** — JavaScript logic makes all decisions

---

## Decision Logic

### Shipping Method
| Condition              | Decision         |
|------------------------|------------------|
| Type = time-sensitive  | Air Freight      |
| Weight > 500 kg        | Sea Freight      |
| Otherwise              | Land Transport   |

### Route Selection
| Condition              | Decision         |
|------------------------|------------------|
| Type = time-sensitive  | Route A (faster) |
| Type = fragile         | Lowest risk route|
| Budget < 200           | Lowest cost route|
| Default                | Route A (shorter duration) |

---

## Technologies

- HTML5, CSS3 (external only, no frameworks)
- JavaScript (DOM only, no libraries)
- Node.js + Express
- MySQL
- OpenRouteService API (one external API only)
