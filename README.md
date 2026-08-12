# Carrot Upgraded

Carrot Upgraded centralizes Codeforces rating prediction to reduce API load by **40,000 times** and deliver **sub-second results during live contests**.

A high-performance, cloud-native system that revolutionizes how Codeforces participants view real-time performance data and rating changes during contests.

> **Credits**: Rating calculation algorithm reverse-engineered from the excellent [Carrot extension](https://github.com/meooow25/carrot) by meooow25.

---

## 📊 The Problem with Existing Solutions

Traditional rating prediction tools like the original Carrot extension suffer from critical scalability issues:

### Client-Side Architecture Issues

In the original Carrot implementation:

- **Every user fetches complete contest data** directly from Codeforces API on every page refresh
- **Every user performs rating calculations** locally in their browser
- **No caching mechanism** - same data downloaded repeatedly by thousands of users

### The Scalability Crisis

Consider a typical Codeforces Div 4 contest with **~40,000 participants**:

| Metric | Original Carrot | Impact |
|--------|----------------|---------|
| **API Requests to CF** | 40,000 requests (one per user) | Massive server load on Codeforces |
| **Data Transfer** | 40,000 × 40,000 = **1.6 billion** participant records | Extremely high bandwidth consumption |
| **Client Computation** | Each user runs calculations independently | Browser performance degradation |
| **Refresh Cost** | Full re-download + re-calculation | Poor user experience |

**Real-world consequences:**

- Codeforces API gets hammered with redundant requests **during live contests**
- Users experience slow load times (10-30+ seconds)
- Browser tabs freeze during calculation
- CF servers face unnecessary load spikes during peak contest hours
- Multiple refreshes compound the problem exponentially

---

## 🏗️ System Architecture

### High-Level Architecture

![Contest processing flow](carrot.svg)

### High-Level Design

The system leverages cloud infrastructure to provide a scalable, reliable service:

- **Frontend**: Chrome Extension (Manifest V3) that injects performance metrics into Codeforces standings
- **Reverse Proxy**: Nginx handles HTTPS, SSL termination, and forwards to backend
- **Backend**: Node.js Express server on AWS EC2 for API management and orchestration
- **Database**: Amazon RDS (MySQL) for persistent storage of contest results
- **Cache & Locking**: Redis/Valkey for distributed locks and concurrency control

### Deployment on AWS

#### Compute & Networking

- **AWS EC2**: Hosts the Node.js application
- **Elastic IP**: Provides static IPv4 address across instance restarts
- **DNS Configuration**: Custom subdomain mapped via A-record for clean API endpoints

#### Reverse Proxy & Security

- **Nginx** configured to:
  - Accept HTTPS requests on port 443
  - Handle SSL certificate management
  - Forward to Express app on localhost:3000
  - Shield backend from direct internet exposure

#### Database Layer

- **Amazon RDS (MySQL)**: Managed database service providing:
  - Automated backups and point-in-time recovery
  - Automatic patching and updates
  - High availability and performance isolation
  - Better scalability than EC2-hosted databases

---

# ☁️ Production Deployment & AWS Infrastructure

Carrot Upgraded was deployed as a production-style cloud application on AWS, with the Chrome Extension communicating with a centralized HTTPS backend.

### Production Architecture

```text
                    Chrome Extension
                    (Manifest V3)
                          │
                          │ HTTPS
                          ▼
             carrot-upgraded.duckdns.org
                          │
                          ▼
                    Nginx :443
                  Reverse Proxy
                          │
                          │ proxy_pass
                          ▼
                    Node.js :3000
                    Express API
                          │
                 ┌────────┴────────┐
                 │                 │
                 ▼                 ▼
          Amazon RDS          ElastiCache
             MySQL             Redis/Valkey
```

### 1. AWS EC2 — Backend Server

The Node.js/Express backend is hosted on an Amazon EC2 instance.

Responsibilities:

- Hosts the production backend API
- Runs the Node.js application
- Connects securely to Amazon RDS and ElastiCache
- Provides the compute layer for contest processing

The backend runs on port `3000`, but this port is **not publicly exposed**.

External traffic is handled through Nginx over HTTPS.

---

### 2. Amazon RDS — MySQL

Amazon RDS is used as the persistent database layer.

The database stores processed contest information and rating results, allowing subsequent requests to retrieve already-computed results instead of repeating the complete calculation.

Benefits of using RDS:

- Managed MySQL database
- Persistent storage independent of the EC2 instance
- Automated backups
- Database isolation from the application server
- Independent scaling of the database layer

---

### 3. Amazon ElastiCache — Redis/Valkey

Amazon ElastiCache is used for Redis/Valkey-based distributed locking and concurrency control.

During a live contest, many users may request the same contest simultaneously.

A contest-specific distributed lock ensures that only one request performs the expensive Codeforces data fetch and calculation.

```text
User 1 ──┐
User 2 ──┤
User 3 ──┼──► Redis/Valkey Lock ──► One request processes contest
User 4 ──┤
User N ──┘
                         │
                         ▼
                   Cached DB Results
                         │
                  ┌──────┴──────┐
                  ▼             ▼
                User 1        User N
```

This prevents multiple simultaneous users from triggering duplicate contest processing.

---

### 4. Nginx Reverse Proxy

Nginx sits in front of the Node.js application.

```text
Internet
   │
   │ HTTPS :443
   ▼
 Nginx
   │
   │ proxy_pass
   ▼
Node.js :3000
```

Nginx is responsible for:

- Reverse proxying requests to Express
- HTTPS termination
- HTTP → HTTPS redirection
- Keeping the Node.js port private
- Handling public web traffic

The Node.js application is therefore not directly exposed to the public internet.

---

### 5. HTTPS with Let's Encrypt

The production API is available through:

https://carrot-upgraded.duckdns.org

HTTPS was configured using a Let's Encrypt SSL certificate.

The certificate allows the Chrome Extension to communicate securely with the production backend.

The HTTPS setup was also tested directly using `curl`, including certificate validation and the TLS handshake.

---

### 6. DuckDNS

A DuckDNS subdomain was configured to point to the EC2 instance.

```text
carrot-upgraded.duckdns.org
              │
              ▼
        EC2 Public IP
              │
              ▼
            Nginx
```

This provides a stable domain name for the production API instead of hard-coding the EC2 public IP inside the extension.

---

### 7. PM2 Process Management

The Node.js backend is managed using PM2.

```bash
pm2 start backend/master.js --name carrot-backend
```

PM2 provides:

- Process monitoring
- Automatic application restart
- Application status monitoring
- Persistent process management
- Easy process inspection using `pm2 status`

The production process is named:

```text
carrot-backend
```

---

### 8. PM2 + systemd Auto-Recovery

PM2 was integrated with systemd so the backend automatically starts after an EC2 reboot.

The production setup was tested by performing an actual EC2 reboot.

After reconnecting to the server:

```bash
pm2 status
```

the backend was automatically restored and reported:

```text
carrot-backend   online
```

The process received a new PID after the reboot, confirming that it was actually restarted rather than simply continuing from before the reboot.

This verifies that the application does not require manual startup after an EC2 restart.

---

### 9. EC2 Security Group Configuration

The EC2 security group was configured so that only the required services are publicly accessible.

Public web traffic:

```text
HTTP   :80
HTTPS  :443
```

SSH access:

```text
SSH    :22
```

SSH access is restricted to the required source IP.

The Node.js application port:

```text
3000
```

is **not publicly exposed**.

Therefore, production traffic follows:

```text
Internet
   │
   ▼
HTTPS :443
   │
   ▼
Nginx
   │
   ▼
localhost:3000
   │
   ▼
Express
```

This provides an additional security layer by preventing clients from directly accessing the Node.js server.

---

### 10. Production Environment Configuration

Production credentials and infrastructure endpoints are provided through environment variables rather than being committed to Git.

The `.env` file is excluded using `.gitignore`.

Sensitive information such as:

- Database passwords
- Redis/Valkey credentials
- Database endpoints
- Environment-specific configuration

is kept outside the source repository.

The repository was also checked to ensure that `.env`, private keys, and obvious credential files were not tracked by Git.

---

### 11. Production Health Check

The deployed backend exposes a health endpoint:

https://carrot-upgraded.duckdns.org

Example response:

```json
{
  "status": "ok",
  "message": "Server is working"
}
```

The production endpoint was tested after deployment and again after an EC2 reboot.

This confirms the complete production path:

```text
Chrome / Internet
        ↓
      HTTPS
        ↓
      Nginx
        ↓
Node.js / Express
        ↓
   AWS Services
        ↓
RDS + Redis/Valkey
```

---

## ✨ How Carrot Upgraded Solves This

**Carrot Upgraded** introduces a centralized backend that acts as an intelligent intermediary between users and Codeforces.

### Architectural Transformation

```text
┌─────────────────────────────────────────────────────────────┐
│                    ORIGINAL CARROT                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User 1 → CF API (fetch 40K records) → Calculate locally    │
│  User 2 → CF API (fetch 40K records) → Calculate locally    │
│  User 3 → CF API (fetch 40K records) → Calculate locally    │
│  ...                                                        │
│  User 40K → CF API (fetch 40K records) → Calculate locally  │
│                                                             │
│  Result: 40,000 API calls × 40,000 records each             │
└─────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────┐
│                 CARROT UPGRADED                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Backend Server (every 5 min):                              │
│    └─→ CF API (fetch 40K records ONCE) → Calculate →        │
│         Cache in MySQL                                      │
│                                                             │
│  User 1 → Backend API → Cached Data (instant)               │
│  User 2 → Backend API → Cached Data (instant)               │
│  User 3 → Backend API → Cached Data (instant)               │
│  ...                                                        │
│  User 40K → Backend API → Cached Data (instant)             │
│                                                             │
│  Result: 1 API call to CF, 40,000 lightweight responses     │
└─────────────────────────────────────────────────────────────┘
```

### Key Improvements

#### 1. **Centralized Data Fetching**

- Backend fetches contest data **once every 5 minutes** from Codeforces
- Single point of contact with CF API reduces load by **40,000×**
- CF API requests drop from **40,000 → 1** per refresh cycle
- **Critical during live contests** when users refresh frequently to check standings

#### 2. **Server-Side Computation**

- Rating calculations performed **once on server**
- Results cached in MySQL database
- Users receive **pre-computed results instantly**

#### 3. **Massive Data Transfer Reduction**

| Scenario | Original Carrot | Carrot Upgraded | Improvement |
|----------|----------------|-----------------|-------------|
| **CF → Clients** | 40,000 × 40,000 = 1.6B records | 1 × 40,000 = 40K records | **40,000× reduction** |
| **Backend → Clients** | N/A | 40,000 lightweight responses | Minimal bandwidth |
| **Total Network Load** | Extreme | Minimal | **99.9975% reduction** |

#### 4. **Client Performance Gains**

- **No local computation** - browser stays responsive
- **Instant results** - data arrives pre-calculated from cache
- **Low memory usage** - no need to store 40K participant objects
- **Consistent experience** - no performance degradation during large contests

---

## ⚡ Advanced Optimizations

### 1. Rating Calculation Algorithm

**Credit**: The rating calculation algorithm used in Carrot Upgraded is reverse-engineered from the [original Carrot extension](https://github.com/meooow25/carrot) by meooow25, which implements an efficient FFT-based approach.

**The Algorithm**:

Both the original Carrot and Carrot Upgraded use the same core calculation method based on Fast Fourier Transform (FFT) to compute expected ranks efficiently.

For each participant, the expected rank is calculated based on win probability against all other participants:

```text
Expected_Rank[i] = 0.5 + Σ(P(rating[i] beats rating[j])) for all j ≠ i
```

By recognizing that this calculation is mathematically equivalent to a **convolution** operation:

- The rating distribution is treated as a discrete signal
- FFT transforms the problem from time domain to frequency domain
- Convolution is performed in O(N log N) or O(M log M) time (M = rating range ~4000)

**Key Difference**:

- **Original Carrot**: Each client runs the FFT calculation independently in their browser
- **Carrot Upgraded**: Server runs the calculation **once** and serves results to all users

This architectural shift is what enables the massive scalability improvements.

---

### 2. Redis Distributed Locking

**Problem**: During live contests, when thousands of users refresh their standings pages simultaneously, we risk triggering multiple concurrent data fetches and calculations.

**Solution**: Redis-based distributed locking mechanism.

```javascript
// Pseudocode
async function getContestResults(contestId) {
  const lockKey = `lock:contest:${contestId}`;

  // Try to acquire lock
  const lockAcquired = await redis.set(
    lockKey,
    'processing',
    'NX',
    'EX',
    300
  );

  if (lockAcquired) {
    // First request - do the work
    await fetchFromCodeforces(contestId);
    await calculateRatings();
    await saveToDatabase();
    await redis.del(lockKey);
  } else {
    // Subsequent requests - wait and poll
    while (await redis.exists(lockKey)) {
      await sleep(500);
    }
  }

  // All requests served from cached DB
  return await database.getContestResults(contestId);
}
```

**Benefits**:

- Only **one fetch** from Codeforces API regardless of concurrent users
- Prevents wasteful duplicate calculations
- Reduces CPU, memory, and network usage by **orders of magnitude**
- Guarantees consistency - all users get same calculated results

---

### 3. High-Performance Batch Processing

**Database Operations Optimization**:

- **Batch Inserts**: Group records into batches (e.g., 1,000 per batch)
- **Reduced Round-Trips**: Minimize network overhead to RDS
- **Transaction Efficiency**: Single transaction for multiple records

**Impact**: Initial data ingestion of 40,000 records completes in seconds rather than minutes.

---

## 📈 Performance Comparison

| Metric | Original Carrot | Carrot Upgraded |
|--------|----------------|-----------------|
| **CF API Load (Live Contest)** | 40,000 requests | 1 request (every 5 min) |
| **Data Transferred** | 1.6 billion records | 40,000 records |
| **Client Calculation** | Full calculation per user | Zero (pre-computed) |
| **Page Load Time** | 10-30+ seconds | <1 second |
| **Browser Memory** | High (all participant data) | Minimal (results only) |
| **CF Server Impact** | Extremely high | Negligible |

---

## 🧩 Chrome Extension

Carrot Upgraded is implemented as a **Chrome Extension using Manifest V3**.

### Extension Architecture

```text
Chrome Extension
       │
       ├── content.js
       │      │
       │      └── Reads Codeforces standings
       │
       └── background.js
              │
              └── Calls production API
                       │
                       ▼
              carrot-upgraded.duckdns.org
```

### Extension Components

```text
frontend/
│
├── manifest.json
├── background.js
├── icon.png
│
├── popup/
│   ├── popup.html
│   └── popup.js
│
└── scripts/
    ├── content.js
    └── content.css
```

### Content Script

`content.js`:

- Detects the Codeforces contest ID
- Extracts participant handles from standings
- Sends required information to the backend
- Receives Performance and Delta values
- Injects Performance and Delta columns into the standings table

### Background Service Worker

`background.js`:

- Receives messages from the content script
- Communicates with the production backend
- Sends returned contest results back to the content script

### Production API

https://carrot-upgraded.duckdns.org

---

## ⚙️ Setup & Installation

### Backend Setup

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Environment Configuration

Create a `.env` file with:

```env
DB_HOST=your-rds-endpoint.amazonaws.com
DB_USER=admin
DB_PASSWORD=your-password
DB_NAME=carrot_db
DB_PORT=3306

REDIS_HOST=your-redis-endpoint
REDIS_PORT=6379
REDIS_USERNAME=your-redis-username
REDIS_PASSWORD=your-redis-password

PORT=3000
```

> Never commit `.env` to Git. It is included in `.gitignore`.

#### 3. Run the Backend

```bash
node backend/master.js
```

The backend runs on:

```text
http://localhost:3000
```

---

### Frontend / Chrome Extension Setup

1. Navigate to:

```text
chrome://extensions/
```

2. Enable **Developer mode**

3. Click **Load unpacked**

4. Select the:

```text
frontend/
```

folder

5. The extension will now appear in your browser

6. Open a Codeforces contest standings page

7. Carrot Upgraded will add the Performance and Delta columns

---

## 📁 Project Structure

```text
Carrot_upgraded/
│
├── backend/
│   ├── db/
│   │   ├── mysql.js
│   │   └── redis.js
│   │
│   └── master.js
│
├── frontend/
│   ├── manifest.json
│   ├── background.js
│   ├── icon.png
│   │
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   │
│   └── scripts/
│       ├── content.js
│       └── content.css
│
├── WEB/
├── package.json
├── package-lock.json
├── README.md
└── .gitignore
```

---

## 🛠️ Technology Stack

### Chrome Extension

- JavaScript
- Chrome Extension APIs
- Manifest V3
- Content Scripts
- Service Workers
- DOM manipulation

### Backend

- Node.js
- Express.js
- REST API

### Database & Caching

- MySQL
- Amazon RDS
- Redis / Valkey
- Amazon ElastiCache

### Cloud & Infrastructure

- AWS EC2
- Nginx
- PM2
- systemd
- HTTPS / Let's Encrypt
- DuckDNS

---

## 🎯 Key Takeaways

**Carrot Upgraded transforms a client-heavy architecture into an efficient cloud-native solution:**

✅ **40,000× reduction** in Codeforces API requests during live contests  
✅ **99.997% reduction** in total data transfer  
✅ **Instant loading** for end users (no client-side computation)  
✅ **Scalable infrastructure** that handles peak contest loads  
✅ **Chrome Extension using Manifest V3**  
✅ **Production deployment on AWS**  
✅ **HTTPS-secured API using Nginx and Let's Encrypt**  
✅ **Redis/Valkey distributed locking for concurrent requests**  
✅ **PM2 + systemd automatic backend recovery**  
✅ **Managed MySQL database using Amazon RDS**

By centralizing data fetching and computation while using the same proven FFT algorithm from the original Carrot, we've built a system that scales efficiently while providing a superior user experience.

---

## 🙏 Acknowledgments

- **[Carrot](https://github.com/meooow25/carrot)** by meooow25 - For the brilliant FFT-based rating calculation algorithm that we reverse-engineered and implemented in our backend

---

## 🔗 Links

- **Production API**: https://carrot-upgraded.duckdns.org
- **Original Carrot**: https://github.com/meooow25/carrot
- **Codeforces**: https://codeforces.com

---

## 📄 License

MIT License - feel free to learn from and build upon this project!
