// Cost Persistence Module
//
// RISK-006 FIX: Persist rate limit cost records to SQLite
//
// Provides:
// - Persistent storage of API usage costs
// - Historical cost tracking
// - Cost analytics and reporting
// - Data recovery after restart

use rusqlite::{params, Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

// ============================================
// Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostRecord {
    pub id: Option<i64>,
    pub provider: String,
    pub model: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cost_usd: f64,
    pub request_type: String, // "chat", "completion", "embedding"
    pub timestamp: i64,
    pub workspace_id: Option<String>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyCostSummary {
    pub date: String, // YYYY-MM-DD
    pub provider: String,
    pub total_requests: i64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthlyCostSummary {
    pub month: String, // YYYY-MM
    pub provider: String,
    pub total_requests: i64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cost_usd: f64,
    pub average_daily_cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostAnalytics {
    pub today_cost: f64,
    pub this_week_cost: f64,
    pub this_month_cost: f64,
    pub last_month_cost: f64,
    pub daily_average: f64,
    pub most_used_provider: String,
    pub most_used_model: String,
    pub total_requests: i64,
}

// ============================================
// Cost Database Manager
// ============================================

pub struct CostDatabase {
    conn: Mutex<Connection>,
}

impl CostDatabase {
    /// Open or create the cost database
    pub fn new(db_path: PathBuf) -> SqliteResult<Self> {
        let conn = Connection::open(&db_path)?;
        
        // Enable WAL mode for better concurrency
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        
        // Create tables
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS cost_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                input_tokens INTEGER NOT NULL DEFAULT 0,
                output_tokens INTEGER NOT NULL DEFAULT 0,
                cost_usd REAL NOT NULL DEFAULT 0.0,
                request_type TEXT NOT NULL DEFAULT 'chat',
                timestamp INTEGER NOT NULL,
                workspace_id TEXT,
                session_id TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            );
            
            CREATE INDEX IF NOT EXISTS idx_cost_provider ON cost_records(provider);
            CREATE INDEX IF NOT EXISTS idx_cost_timestamp ON cost_records(timestamp);
            CREATE INDEX IF NOT EXISTS idx_cost_workspace ON cost_records(workspace_id);
            
            CREATE TABLE IF NOT EXISTS daily_summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                provider TEXT NOT NULL,
                total_requests INTEGER NOT NULL DEFAULT 0,
                total_input_tokens INTEGER NOT NULL DEFAULT 0,
                total_output_tokens INTEGER NOT NULL DEFAULT 0,
                total_cost_usd REAL NOT NULL DEFAULT 0.0,
                UNIQUE(date, provider)
            );
            
            CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_summaries(date);
            "#
        )?;
        
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
    
    /// Record a new cost entry
    pub fn record_cost(&self, record: &CostRecord) -> SqliteResult<i64> {
        let conn = self.conn.lock().unwrap();
        
        conn.execute(
            r#"
            INSERT INTO cost_records 
            (provider, model, input_tokens, output_tokens, cost_usd, request_type, timestamp, workspace_id, session_id)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                record.provider,
                record.model,
                record.input_tokens,
                record.output_tokens,
                record.cost_usd,
                record.request_type,
                record.timestamp,
                record.workspace_id,
                record.session_id,
            ],
        )?;
        
        let id = conn.last_insert_rowid();
        
        // Update daily summary
        let date = chrono::DateTime::from_timestamp(record.timestamp, 0)
            .map(|dt| dt.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| "unknown".to_string());
        
        conn.execute(
            r#"
            INSERT INTO daily_summaries (date, provider, total_requests, total_input_tokens, total_output_tokens, total_cost_usd)
            VALUES (?1, ?2, 1, ?3, ?4, ?5)
            ON CONFLICT(date, provider) DO UPDATE SET
                total_requests = total_requests + 1,
                total_input_tokens = total_input_tokens + ?3,
                total_output_tokens = total_output_tokens + ?4,
                total_cost_usd = total_cost_usd + ?5
            "#,
            params![
                date,
                record.provider,
                record.input_tokens,
                record.output_tokens,
                record.cost_usd,
            ],
        )?;
        
        Ok(id)
    }
    
    /// Get today's cost for a provider
    pub fn get_today_cost(&self, provider: &str) -> SqliteResult<f64> {
        let conn = self.conn.lock().unwrap();
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        
        let cost: f64 = conn.query_row(
            "SELECT COALESCE(total_cost_usd, 0) FROM daily_summaries WHERE date = ?1 AND provider = ?2",
            params![today, provider],
            |row| row.get(0),
        ).unwrap_or(0.0);
        
        Ok(cost)
    }
    
    /// Get this month's cost for a provider
    pub fn get_month_cost(&self, provider: &str) -> SqliteResult<f64> {
        let conn = self.conn.lock().unwrap();
        let month_start = chrono::Utc::now().format("%Y-%m-01").to_string();
        
        let cost: f64 = conn.query_row(
            "SELECT COALESCE(SUM(total_cost_usd), 0) FROM daily_summaries WHERE date >= ?1 AND provider = ?2",
            params![month_start, provider],
            |row| row.get(0),
        ).unwrap_or(0.0);
        
        Ok(cost)
    }
    
    /// Get daily summaries for a date range
    pub fn get_daily_summaries(&self, start_date: &str, end_date: &str) -> SqliteResult<Vec<DailyCostSummary>> {
        let conn = self.conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            r#"
            SELECT date, provider, total_requests, total_input_tokens, total_output_tokens, total_cost_usd
            FROM daily_summaries
            WHERE date >= ?1 AND date <= ?2
            ORDER BY date DESC, provider
            "#
        )?;
        
        let summaries = stmt.query_map(params![start_date, end_date], |row| {
            Ok(DailyCostSummary {
                date: row.get(0)?,
                provider: row.get(1)?,
                total_requests: row.get(2)?,
                total_input_tokens: row.get(3)?,
                total_output_tokens: row.get(4)?,
                total_cost_usd: row.get(5)?,
            })
        })?;
        
        summaries.collect()
    }
    
    /// Get monthly summaries
    pub fn get_monthly_summaries(&self, months: i32) -> SqliteResult<Vec<MonthlyCostSummary>> {
        let conn = self.conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            r#"
            SELECT 
                strftime('%Y-%m', date) as month,
                provider,
                SUM(total_requests) as total_requests,
                SUM(total_input_tokens) as total_input_tokens,
                SUM(total_output_tokens) as total_output_tokens,
                SUM(total_cost_usd) as total_cost_usd,
                AVG(total_cost_usd) as average_daily_cost
            FROM daily_summaries
            WHERE date >= date('now', ?1 || ' months')
            GROUP BY month, provider
            ORDER BY month DESC, provider
            "#
        )?;
        
        let summaries = stmt.query_map(params![format!("-{}", months)], |row| {
            Ok(MonthlyCostSummary {
                month: row.get(0)?,
                provider: row.get(1)?,
                total_requests: row.get(2)?,
                total_input_tokens: row.get(3)?,
                total_output_tokens: row.get(4)?,
                total_cost_usd: row.get(5)?,
                average_daily_cost: row.get(6)?,
            })
        })?;
        
        summaries.collect()
    }
    
    /// Get cost analytics
    pub fn get_analytics(&self) -> SqliteResult<CostAnalytics> {
        let conn = self.conn.lock().unwrap();
        
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let week_ago = (chrono::Utc::now() - chrono::Duration::days(7)).format("%Y-%m-%d").to_string();
        let month_start = chrono::Utc::now().format("%Y-%m-01").to_string();
        let last_month_start = (chrono::Utc::now() - chrono::Duration::days(30)).format("%Y-%m-01").to_string();
        let last_month_end = (chrono::Utc::now().with_day(1).unwrap() - chrono::Duration::days(1)).format("%Y-%m-%d").to_string();
        
        // Today's cost
        let today_cost: f64 = conn.query_row(
            "SELECT COALESCE(SUM(total_cost_usd), 0) FROM daily_summaries WHERE date = ?1",
            params![today],
            |row| row.get(0),
        ).unwrap_or(0.0);
        
        // This week's cost
        let this_week_cost: f64 = conn.query_row(
            "SELECT COALESCE(SUM(total_cost_usd), 0) FROM daily_summaries WHERE date >= ?1",
            params![week_ago],
            |row| row.get(0),
        ).unwrap_or(0.0);
        
        // This month's cost
        let this_month_cost: f64 = conn.query_row(
            "SELECT COALESCE(SUM(total_cost_usd), 0) FROM daily_summaries WHERE date >= ?1",
            params![month_start],
            |row| row.get(0),
        ).unwrap_or(0.0);
        
        // Last month's cost
        let last_month_cost: f64 = conn.query_row(
            "SELECT COALESCE(SUM(total_cost_usd), 0) FROM daily_summaries WHERE date >= ?1 AND date <= ?2",
            params![last_month_start, last_month_end],
            |row| row.get(0),
        ).unwrap_or(0.0);
        
        // Daily average (last 30 days)
        let daily_average: f64 = conn.query_row(
            "SELECT COALESCE(AVG(daily_total), 0) FROM (SELECT SUM(total_cost_usd) as daily_total FROM daily_summaries WHERE date >= date('now', '-30 days') GROUP BY date)",
            [],
            |row| row.get(0),
        ).unwrap_or(0.0);
        
        // Most used provider
        let most_used_provider: String = conn.query_row(
            "SELECT provider FROM daily_summaries GROUP BY provider ORDER BY SUM(total_requests) DESC LIMIT 1",
            [],
            |row| row.get(0),
        ).unwrap_or_else(|_| "none".to_string());
        
        // Most used model
        let most_used_model: String = conn.query_row(
            "SELECT model FROM cost_records GROUP BY model ORDER BY COUNT(*) DESC LIMIT 1",
            [],
            |row| row.get(0),
        ).unwrap_or_else(|_| "none".to_string());
        
        // Total requests
        let total_requests: i64 = conn.query_row(
            "SELECT COALESCE(SUM(total_requests), 0) FROM daily_summaries",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        Ok(CostAnalytics {
            today_cost,
            this_week_cost,
            this_month_cost,
            last_month_cost,
            daily_average,
            most_used_provider,
            most_used_model,
            total_requests,
        })
    }
    
    /// Get recent cost records
    pub fn get_recent_records(&self, limit: i32) -> SqliteResult<Vec<CostRecord>> {
        let conn = self.conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            r#"
            SELECT id, provider, model, input_tokens, output_tokens, cost_usd, request_type, timestamp, workspace_id, session_id
            FROM cost_records
            ORDER BY timestamp DESC
            LIMIT ?1
            "#
        )?;
        
        let records = stmt.query_map(params![limit], |row| {
            Ok(CostRecord {
                id: Some(row.get(0)?),
                provider: row.get(1)?,
                model: row.get(2)?,
                input_tokens: row.get(3)?,
                output_tokens: row.get(4)?,
                cost_usd: row.get(5)?,
                request_type: row.get(6)?,
                timestamp: row.get(7)?,
                workspace_id: row.get(8)?,
                session_id: row.get(9)?,
            })
        })?;
        
        records.collect()
    }
    
    /// Export cost data to CSV
    pub fn export_to_csv(&self, start_date: &str, end_date: &str) -> SqliteResult<String> {
        let conn = self.conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            r#"
            SELECT provider, model, input_tokens, output_tokens, cost_usd, request_type, 
                   datetime(timestamp, 'unixepoch') as timestamp, workspace_id, session_id
            FROM cost_records
            WHERE timestamp >= strftime('%s', ?1) AND timestamp <= strftime('%s', ?2)
            ORDER BY timestamp
            "#
        )?;
        
        let mut csv = String::from("provider,model,input_tokens,output_tokens,cost_usd,request_type,timestamp,workspace_id,session_id\n");
        
        let rows = stmt.query_map(params![start_date, end_date], |row| {
            Ok(format!(
                "{},{},{},{},{:.6},{},{},{},{}\n",
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, f64>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                row.get::<_, Option<String>>(8)?.unwrap_or_default(),
            ))
        })?;
        
        for row in rows {
            csv.push_str(&row?);
        }
        
        Ok(csv)
    }
    
    /// Cleanup old records (keep last N days)
    pub fn cleanup_old_records(&self, keep_days: i32) -> SqliteResult<usize> {
        let conn = self.conn.lock().unwrap();
        
        let cutoff = chrono::Utc::now() - chrono::Duration::days(keep_days as i64);
        let cutoff_timestamp = cutoff.timestamp();
        
        let deleted = conn.execute(
            "DELETE FROM cost_records WHERE timestamp < ?1",
            params![cutoff_timestamp],
        )?;
        
        // Also cleanup daily summaries
        let cutoff_date = cutoff.format("%Y-%m-%d").to_string();
        conn.execute(
            "DELETE FROM daily_summaries WHERE date < ?1",
            params![cutoff_date],
        )?;
        
        // Vacuum to reclaim space
        conn.execute_batch("VACUUM;")?;
        
        Ok(deleted)
    }
}

// ============================================
// Global Instance
// ============================================

use once_cell::sync::Lazy;

static COST_DB: Lazy<Mutex<Option<CostDatabase>>> = Lazy::new(|| Mutex::new(None));

/// Initialize the global cost database
pub fn init_cost_database(db_path: PathBuf) -> Result<(), String> {
    let db = CostDatabase::new(db_path).map_err(|e| e.to_string())?;
    let mut guard = COST_DB.lock().map_err(|e| e.to_string())?;
    *guard = Some(db);
    Ok(())
}

/// Get the global cost database instance
pub fn get_cost_database() -> Result<std::sync::MutexGuard<'static, Option<CostDatabase>>, String> {
    COST_DB.lock().map_err(|e| e.to_string())
}

// ============================================
// Tauri Commands
// ============================================

#[tauri::command]
pub fn record_api_cost(
    provider: String,
    model: String,
    input_tokens: i64,
    output_tokens: i64,
    cost_usd: f64,
    request_type: String,
    workspace_id: Option<String>,
    session_id: Option<String>,
) -> Result<i64, String> {
    let guard = get_cost_database()?;
    let db = guard.as_ref().ok_or("Cost database not initialized")?;
    
    let record = CostRecord {
        id: None,
        provider,
        model,
        input_tokens,
        output_tokens,
        cost_usd,
        request_type,
        timestamp: chrono::Utc::now().timestamp(),
        workspace_id,
        session_id,
    };
    
    db.record_cost(&record).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_cost_analytics() -> Result<CostAnalytics, String> {
    let guard = get_cost_database()?;
    let db = guard.as_ref().ok_or("Cost database not initialized")?;
    db.get_analytics().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_daily_cost_summaries(start_date: String, end_date: String) -> Result<Vec<DailyCostSummary>, String> {
    let guard = get_cost_database()?;
    let db = guard.as_ref().ok_or("Cost database not initialized")?;
    db.get_daily_summaries(&start_date, &end_date).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_monthly_cost_summaries(months: i32) -> Result<Vec<MonthlyCostSummary>, String> {
    let guard = get_cost_database()?;
    let db = guard.as_ref().ok_or("Cost database not initialized")?;
    db.get_monthly_summaries(months).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_cost_csv(start_date: String, end_date: String) -> Result<String, String> {
    let guard = get_cost_database()?;
    let db = guard.as_ref().ok_or("Cost database not initialized")?;
    db.export_to_csv(&start_date, &end_date).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cleanup_old_cost_records(keep_days: i32) -> Result<usize, String> {
    let guard = get_cost_database()?;
    let db = guard.as_ref().ok_or("Cost database not initialized")?;
    db.cleanup_old_records(keep_days).map_err(|e| e.to_string())
}
