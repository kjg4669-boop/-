use axum::{
    Router,
    extract::{ConnectInfo, Query, State, WebSocketUpgrade},
    extract::ws::{Message, WebSocket},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::get,
};
use rand::Rng;
use serde::Deserialize;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

/// Rate limiting: max failed attempts before lockout.
const MAX_FAILED_ATTEMPTS: u32 = 5;
/// Lockout duration after exceeding MAX_FAILED_ATTEMPTS.
const LOCKOUT_DURATION: Duration = Duration::from_secs(30);

/// Allowed remote command types. Any other type is silently dropped.
const ALLOWED_COMMANDS: &[&str] = &["next", "prev", "blackout", "goto", "stop"];

/// Generate a cryptographically secure 6-digit PIN using OS CSPRNG.
fn generate_pin() -> String {
    let pin: u32 = rand::thread_rng().gen_range(100000u32..1000000u32);
    format!("{:06}", pin)
}

// REMOTE_HTML uses {{PIN}} as a placeholder that is replaced at runtime.
const REMOTE_HTML: &str = r#"<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>예배 원격 제어</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{background:#111;color:#fff;font-family:system-ui,sans-serif;height:100dvh;display:flex;flex-direction:column;overflow:hidden;user-select:none}
#status{padding:10px 16px;font-size:12px;color:#6b7280;background:#1a1a1a;text-align:center;border-bottom:1px solid #222;letter-spacing:.04em}
#status.ok{color:#4ade80}
#info{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px;text-align:center;gap:8px;overflow:hidden}
#song-title{font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#slide-text{font-size:clamp(18px,5vw,28px);font-weight:600;line-height:1.45;color:#f1f5f9;max-width:100%;white-space:pre-wrap;overflow:hidden}
#slide-pos{font-size:13px;color:#4b5563;margin-top:4px}
#controls{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px}
.btn{border:none;border-radius:14px;font-size:17px;font-weight:700;height:68px;cursor:pointer;transition:opacity .1s,transform .1s;display:flex;align-items:center;justify-content:center;gap:6px}
.btn-prev{background:#1e293b;color:#94a3b8}
.btn-next{background:#1d4ed8;color:#fff}
.btn-blackout{background:#1c1917;color:#9ca3af;grid-column:span 2;height:52px;font-size:15px;border:1px solid #292524;border-radius:10px}
.btn-blackout.active{background:#7f1d1d;color:#fca5a5;border-color:#991b1b}
.btn:active{opacity:.6;transform:scale(.96)}
</style>
</head>
<body>
<div id="status">연결 중...</div>
<div id="info">
  <div id="song-title">–</div>
  <div id="slide-text">–</div>
  <div id="slide-pos"></div>
</div>
<div id="controls">
  <button class="btn btn-prev" onclick="send('prev')">◀ 이전</button>
  <button class="btn btn-next" onclick="send('next')">다음 ▶</button>
  <button id="btn-blackout" class="btn btn-blackout" onclick="toggleBlackout()">블랙아웃</button>
</div>
<script>
var PIN='{{PIN}}';
var blackout=false;
var ws;
function connect(){
  ws=new WebSocket('ws://'+location.host+'/ws?pin='+PIN);
  ws.onopen=function(){document.getElementById('status').textContent='연결됨';document.getElementById('status').className='ok'};
  ws.onmessage=function(e){
    try{var d=JSON.parse(e.data);if(d.type==='state'){
      document.getElementById('song-title').textContent=d.songTitle||'–';
      document.getElementById('slide-text').textContent=d.slideText||'–';
      document.getElementById('slide-pos').textContent=d.totalSlides>0?(d.slideIndex+1)+' / '+d.totalSlides:'';
    }}catch(ex){}
  };
  ws.onclose=function(){document.getElementById('status').textContent='연결 끊김 (재시도 중...)';document.getElementById('status').className='';setTimeout(connect,2000)};
}
function send(type,extra){if(ws&&ws.readyState===1)ws.send(JSON.stringify(Object.assign({type:type},extra)))}
function toggleBlackout(){blackout=!blackout;document.getElementById('btn-blackout').className='btn btn-blackout'+(blackout?' active':'');send('blackout')}
connect();
</script>
</body>
</html>"#;

#[derive(Debug, Deserialize)]
struct RemoteMsg {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(rename = "slideIndex")]
    slide_index: Option<usize>,
}

/// Per-IP rate limit entry: (failure_count, first_failure_time).
type FailedAttempts = Arc<std::sync::Mutex<HashMap<String, (u32, Instant)>>>;

pub struct RemoteServerState {
    pub abort_handle: std::sync::Mutex<Option<tokio::task::AbortHandle>>,
    pub state_tx: broadcast::Sender<String>,
}

impl RemoteServerState {
    pub fn new() -> Self {
        let (state_tx, _) = broadcast::channel(16);
        Self {
            abort_handle: std::sync::Mutex::new(None),
            state_tx,
        }
    }
}

struct AxumState {
    app: AppHandle,
    state_tx: broadcast::Sender<String>,
    pin: String,
    failed_attempts: FailedAttempts,
}

/// Returns true if the IP is currently locked out, and updates the failure tracker.
/// `success` = true clears the counter; false increments it.
fn check_rate_limit(failed_attempts: &FailedAttempts, ip: &str, success: bool) -> bool {
    let mut map = match failed_attempts.lock() {
        Ok(g) => g,
        Err(_) => return false,
    };
    if success {
        map.remove(ip);
        return false;
    }
    let entry = map.entry(ip.to_string()).or_insert((0, Instant::now()));
    // Reset counter if the lockout window has expired.
    if entry.1.elapsed() >= LOCKOUT_DURATION {
        *entry = (0, Instant::now());
    }
    entry.0 += 1;
    entry.0 > MAX_FAILED_ATTEMPTS
}

/// Returns true if this IP is already in lockout (without incrementing counter).
fn is_locked_out(failed_attempts: &FailedAttempts, ip: &str) -> bool {
    let map = match failed_attempts.lock() {
        Ok(g) => g,
        Err(_) => return false,
    };
    if let Some(&(count, ts)) = map.get(ip) {
        count > MAX_FAILED_ATTEMPTS && ts.elapsed() < LOCKOUT_DURATION
    } else {
        false
    }
}

async fn root_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<Arc<AxumState>>,
) -> Response {
    let ip = addr.ip().to_string();
    if is_locked_out(&state.failed_attempts, &ip) {
        return (StatusCode::TOO_MANY_REQUESTS, Html("<h1>너무 많은 시도. 잠시 후 다시 시도하세요.</h1>")).into_response();
    }
    let provided = params.get("pin").map(String::as_str).unwrap_or("");
    if provided != state.pin.as_str() {
        check_rate_limit(&state.failed_attempts, &ip, false);
        return (StatusCode::UNAUTHORIZED, Html("<h1>잘못된 PIN입니다</h1>")).into_response();
    }
    check_rate_limit(&state.failed_attempts, &ip, true);
    let html = REMOTE_HTML.replace("{{PIN}}", &state.pin);
    Html(html).into_response()
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<Arc<AxumState>>,
) -> Response {
    let ip = addr.ip().to_string();
    if is_locked_out(&state.failed_attempts, &ip) {
        return (StatusCode::TOO_MANY_REQUESTS, "Too many attempts").into_response();
    }
    let provided = params.get("pin").map(String::as_str).unwrap_or("");
    if provided != state.pin.as_str() {
        check_rate_limit(&state.failed_attempts, &ip, false);
        return (StatusCode::UNAUTHORIZED, "Invalid PIN").into_response();
    }
    check_rate_limit(&state.failed_attempts, &ip, true);
    ws.on_upgrade(|socket| handle_socket(socket, state)).into_response()
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AxumState>) {
    let mut rx = state.state_tx.subscribe();
    loop {
        tokio::select! {
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(cmd) = serde_json::from_str::<RemoteMsg>(&text) {
                            // Whitelist: only allow known command types.
                            if !ALLOWED_COMMANDS.contains(&cmd.msg_type.as_str()) {
                                continue;
                            }
                            let payload = serde_json::json!({
                                "type": cmd.msg_type,
                                "slideIndex": cmd.slide_index,
                            });
                            let _ = state.app.emit("remote:command", payload);
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
            Ok(msg) = rx.recv() => {
                if socket.send(Message::Text(msg.into())).await.is_err() {
                    break;
                }
            }
        }
    }
}

#[tauri::command]
pub async fn start_remote_server(
    port: u16,
    remote: tauri::State<'_, RemoteServerState>,
    app: AppHandle,
) -> Result<String, String> {
    // Check and reject early — drop the guard before any await.
    {
        let guard = remote.abort_handle.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("already_running".to_string());
        }
    }

    let pin = generate_pin();
    let state_tx = remote.state_tx.clone();
    let failed_attempts: FailedAttempts = Arc::new(std::sync::Mutex::new(HashMap::new()));
    let axum_state = Arc::new(AxumState {
        app,
        state_tx,
        pin: pin.clone(),
        failed_attempts,
    });
    let router = Router::new()
        .route("/", get(root_handler))
        .route("/ws", get(ws_handler))
        .with_state(axum_state)
        .into_make_service_with_connect_info::<SocketAddr>();

    // Bind to local network IP only — prevents WAN direct access.
    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());
    let listener = tokio::net::TcpListener::bind(format!("{local_ip}:{port}"))
        .await
        .map_err(|e| e.to_string())?;

    let task = tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });

    // Re-acquire the lock after the await to store the abort handle.
    let mut guard = remote.abort_handle.lock().map_err(|e| e.to_string())?;
    *guard = Some(task.abort_handle());
    Ok(pin)
}

#[tauri::command]
pub async fn stop_remote_server(
    remote: tauri::State<'_, RemoteServerState>,
) -> Result<(), String> {
    let mut guard = remote.abort_handle.lock().map_err(|e| e.to_string())?;
    if let Some(h) = guard.take() {
        h.abort();
    }
    Ok(())
}

#[tauri::command]
pub fn get_local_ip() -> String {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

#[tauri::command]
pub async fn send_remote_state(
    payload: String,
    remote: tauri::State<'_, RemoteServerState>,
) -> Result<(), String> {
    let _ = remote.state_tx.send(payload);
    Ok(())
}
