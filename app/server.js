const express = require('express');
const mysql = require('mysql2');
const os = require('os');
const app = express();
const port = 3000;

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- CONFIGURATION ---
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'my_app_db',
  connectionLimit: 10,
  connectTimeout: 10000,
  waitForConnections: true,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);
const POD_ID = process.env.HOSTNAME || os.hostname();

// --- DATABASE HELPERS ---
const query = (sql, params) => {
  return new Promise((resolve, reject) => {
    pool.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
};

// --- API ROUTES ---

// 1. Health Probe (K8s Readiness)
app.get('/health', (req, res) => res.status(200).send('OK'));

// 2. Live Data Stream
app.get('/api/live-data', async (req, res) => {
  try {
    // Parallel Execution for Speed
    const [voteResults, logResults] = await Promise.all([
      query('SELECT candidate, COUNT(*) as count FROM votes GROUP BY candidate'),
      query('SELECT * FROM system_logs ORDER BY id DESC LIMIT 50')
    ]);

    // Process Votes
    const votes = { aws: 0, azure: 0, total: 0 };
    voteResults.forEach(r => votes[r.candidate] = r.count);
    votes.total = votes.aws + votes.azure;

    res.json({
      meta: { pod_id: POD_ID, status: 'healthy' },
      data: { votes, logs: logResults }
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: "Database connectivity interruption" });
  }
});

// 3. Transaction Handler
app.post('/vote', async (req, res) => {
  const candidate = req.body.candidate;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!['aws', 'azure'].includes(candidate)) {
    return res.status(400).json({ status: 'error', message: 'Invalid candidate' });
  }

  try {
    // Atomic Write
    await query('INSERT INTO votes (candidate) VALUES (?)', [candidate]);
    
    // Audit Log (Fire & Forget to maintain speed)
    const logMsg = `Vote confirmed for ${candidate.toUpperCase()} via ${clientIp.split(',')[0]}`;
    query('INSERT INTO system_logs (event_type, message, pod_id) VALUES (?, ?, ?)', 
          ['VOTE_TX', logMsg, POD_ID]).catch(console.error);

    res.json({ status: 'success' });
  } catch (err) {
    console.error("Transaction failed:", err);
    res.status(500).json({ status: 'error', message: 'Transaction failed' });
  }
});

// --- FRONTEND APPLICATION ---
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudVote | Enterprise</title>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #050505;
            --surface: #0f0f0f;
            --surface-hover: #1a1a1a;
            --border: #333;
            --text-primary: #ededed;
            --text-secondary: #888;
            --aws: #FF9900;
            --azure: #0078D4;
            --success: #00ff94;
            --danger: #ff4444;
        }

        * { box-sizing: border-box; outline: none; }
        
        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--bg);
            background-image: radial-gradient(circle at 50% 0%, #1a1a1a 0%, transparent 60%);
            color: var(--text-primary);
            margin: 0;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            padding: 40px 20px;
        }

        .container {
            display: grid;
            grid-template-columns: 1.4fr 1fr;
            gap: 24px;
            max-width: 1200px;
            width: 100%;
        }

        @media (max-width: 900px) { .container { grid-template-columns: 1fr; } }

        /* CARDS */
        .card {
            background: rgba(15, 15, 15, 0.6);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 32px;
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            display: flex;
            flex-direction: column;
        }

        /* TYPOGRAPHY */
        h1 { font-size: 24px; font-weight: 700; margin: 0 0 8px 0; letter-spacing: -0.5px; }
        .subtitle { color: var(--text-secondary); font-size: 14px; margin-bottom: 32px; }
        .badge { 
            background: #222; color: #aaa; padding: 4px 8px; border-radius: 6px; 
            font-size: 11px; font-family: 'JetBrains Mono', monospace; border: 1px solid #333;
        }

        /* STATS GRID */
        .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 40px; }
        .stat-box { background: var(--surface); padding: 20px; border-radius: 12px; border: 1px solid var(--border); }
        .stat-label { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 600; }
        .stat-val { font-size: 28px; font-weight: 600; font-family: 'JetBrains Mono', monospace; }

        /* BARS */
        .poll-group { margin-bottom: 24px; }
        .poll-header { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; font-weight: 600; }
        .track { width: 100%; height: 6px; background: #222; border-radius: 3px; position: relative; overflow: hidden; }
        .fill { height: 100%; border-radius: 3px; transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1); position: absolute; top: 0; left: 0; }
        .fill::after {
            content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 15px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6)); filter: blur(2px);
        }

        /* BUTTONS */
        .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: auto; }
        .btn {
            padding: 16px; border: none; border-radius: 10px; font-weight: 600; font-size: 14px;
            cursor: pointer; transition: transform 0.1s, opacity 0.2s; color: white;
            text-transform: uppercase; letter-spacing: 0.5px;
        }
        .btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn:active { transform: translateY(1px); }
        .btn-aws { background: var(--aws); box-shadow: 0 4px 20px rgba(255, 153, 0, 0.2); }
        .btn-azure { background: var(--azure); box-shadow: 0 4px 20px rgba(0, 120, 212, 0.2); }

        /* TERMINAL */
        .terminal {
            font-family: 'JetBrains Mono', monospace; font-size: 11px;
            background: #000; border: 1px solid var(--border); border-radius: 12px;
            flex: 1; padding: 16px; overflow-y: auto; height: 500px;
            display: flex; flex-direction: column;
        }
        .log-entry { 
            display: grid; grid-template-columns: 70px 1fr; gap: 12px; 
            padding: 6px 0; border-bottom: 1px solid #111; animation: fadeIn 0.2s ease-out;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .log-time { color: #555; }
        .log-pod { color: #444; font-size: 10px; margin-top: 2px; }
        
        /* SCROLLBAR */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
    </style>
</head>
<body>

<div class="container">
    
    <!-- DASHBOARD PANEL -->
    <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
                <h1>CloudVote</h1>
                <div class="subtitle">Distributed Consensus Benchmark</div>
            </div>
            <div class="badge" id="my-pod-id">CONNECTING...</div>
        </div>

        <div class="stats">
            <div class="stat-box">
                <div class="stat-label">Transactions</div>
                <div class="stat-val" id="total-val">--</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">System Status</div>
                <div class="stat-val" style="color: var(--success)">ONLINE</div>
            </div>
        </div>

        <div class="poll-group">
            <div class="poll-header"><span>AWS</span> <span id="aws-pct" style="color:var(--aws)">0%</span></div>
            <div class="track"><div class="fill" id="aws-bar" style="width:0%; background:var(--aws)"></div></div>
        </div>

        <div class="poll-group">
            <div class="poll-header"><span>Azure</span> <span id="azure-pct" style="color:var(--azure)">0%</span></div>
            <div class="track"><div class="fill" id="azure-bar" style="width:0%; background:var(--azure)"></div></div>
        </div>

        <div class="actions">
            <button class="btn btn-aws" onclick="castVote('aws')">Vote AWS</button>
            <button class="btn btn-azure" onclick="castVote('azure')">Vote Azure</button>
        </div>
        <div id="status" style="height: 20px; text-align: center; margin-top: 15px; font-size: 12px; color: var(--text-secondary);"></div>
    </div>

    <!-- LOGS PANEL -->
    <div class="card" style="padding: 0; overflow: hidden; border: none; background: transparent;">
        <div style="background: var(--surface); padding: 15px 20px; border: 1px solid var(--border); border-bottom: none; border-radius: 16px 16px 0 0; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 600; font-size: 13px;">Cluster Audit Log</span>
            <span style="color: var(--success); font-size: 10px;">● LIVE SOCKET</span>
        </div>
        <div class="terminal" id="terminal"></div>
    </div>

</div>

<script>
    const term = document.getElementById('terminal');
    
    async function refresh() {
        try {
            const res = await fetch('/api/live-data');
            const json = await res.json();
            
            // 1. Update Metadata
            document.getElementById('my-pod-id').innerText = json.meta.pod_id;

            // 2. Update Stats
            const total = json.data.votes.total;
            document.getElementById('total-val').innerText = total.toLocaleString();

            const awsPct = total ? ((json.data.votes.aws / total) * 100).toFixed(1) : 0;
            const azPct = total ? ((json.data.votes.azure / total) * 100).toFixed(1) : 0;

            document.getElementById('aws-bar').style.width = awsPct + '%';
            document.getElementById('aws-pct').innerText = awsPct + '%';
            
            document.getElementById('azure-bar').style.width = azPct + '%';
            document.getElementById('azure-pct').innerText = azPct + '%';

            // 3. Update Logs
            term.innerHTML = '';
            json.data.logs.forEach(log => {
                const date = new Date(log.created_at);
                const time = date.toLocaleTimeString('en-US', { hour12: false });
                
                term.innerHTML += \`
                    <div class="log-entry">
                        <div class="log-time">$\{time}</div>
                        <div>
                            <div style="color: #ccc;">$\{log.message}</div>
                            <div class="log-pod">$\{log.pod_id}</div>
                        </div>
                    </div>
                \`;
            });
            
        } catch (e) { console.error("Sync failed", e); }
    }

    async function castVote(candidate) {
        const status = document.getElementById('status');
        status.innerText = "Transmitting to cluster...";
        status.style.color = "#888";

        try {
            const res = await fetch('/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidate })
            });
            
            if (res.ok) {
                status.innerText = "Transaction Committed";
                status.style.color = "var(--success)";
                refresh();
                setTimeout(() => status.innerText = "", 2000);
            } else {
                throw new Error("Failed");
            }
        } catch (e) {
            status.innerText = "Connection Error";
            status.style.color = "var(--danger)";
        }
    }

    // Auto-Refresh loop
    setInterval(refresh, 2000);
    refresh();
</script>

</body>
</html>`);
});

app.listen(port, () => console.log(`v7 Obsidian running on ${port}`));
