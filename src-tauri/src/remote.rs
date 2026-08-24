use axum::{
    Router,
    extract::{Query, State, WebSocketUpgrade},
    extract::ws::{Message, WebSocket},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::get,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

/// Generate a random 4-digit PIN using system time + PID mixing.
fn generate_pin() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let pid = std::process::id();
    // XorShift mix of nanoseconds and PID for unpredictability
    let mut x = nanos ^ (pid.wrapping_shl(16));
    x ^= x.wrapping_shl(13);
    x ^= x >> 17;
    x ^= x.wrapping_shl(5);
    format!("{:04}", 1000 + (x % 9000))
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
}

async fn root_handler(
    Query(params): Query<HashMap<String, String>>,
    State(state): State<Arc<AxumState>>,
) -> Response {
    let provided = params.get("pin").map(String::as_str).unwrap_or("");
    if provided != state.pin.as_str() {
        return (StatusCode::UNAUTHORIZED, Html("<h1>잘못된 PIN입니다</h1>")).into_response();
    }
    let html = REMOTE_HTML.replace("{{PIN}}", &state.pin);
    Html(html).into_response()
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<Arc<AxumState>>,
) -> Response {
    let provided = params.get("pin").map(String::as_str).unwrap_or("");
    if provided != state.pin.as_str() {
        return (StatusCode::UNAUTHORIZED, "Invalid PIN").into_response();
    }
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
        let guard = remote.abort_handle.lock().unwrap();
        if guard.is_some() {
            return Err("already_running".to_string());
        }
    }

    let pin = generate_pin();
    let state_tx = remote.state_tx.clone();
    let axum_state = Arc::new(AxumState { app, state_tx, pin: pin.clone() });
    let router = Router::new()
        .route("/", get(root_handler))
        .route("/ws", get(ws_handler))
        .with_state(axum_state);
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .map_err(|e| e.to_string())?;
    let task = tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });

    // Re-acquire the lock after the await to store the abort handle.
    let mut guard = remote.abort_handle.lock().unwrap();
    *guard = Some(task.abort_handle());
    Ok(pin)
}

#[tauri::command]
pub async fn stop_remote_server(
    remote: tauri::State<'_, RemoteServerState>,
) -> Result<(), String> {
    let mut guard = remote.abort_handle.lock().unwrap();
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
