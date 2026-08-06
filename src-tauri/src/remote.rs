use axum::{
    Router,
    extract::{State, WebSocketUpgrade},
    extract::ws::{Message, WebSocket},
    response::{Html, IntoResponse},
    routing::get,
};
use serde::Deserialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

const REMOTE_HTML: &str = r#"<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>예배 원격 제어</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#111;color:#fff;font-family:sans-serif;height:100dvh;display:flex;flex-direction:column;overflow:hidden}
#status{padding:8px 16px;font-size:13px;color:#888;background:#1a1a1a;text-align:center;border-bottom:1px solid #222}
#status.ok{color:#4ade80}
#slide-info{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;gap:10px}
#slide-text{font-size:22px;font-weight:600;line-height:1.5;color:#f0f0f0;max-width:400px;white-space:pre-wrap}
#slide-pos{font-size:14px;color:#555}
#controls{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:20px}
.btn{border:none;border-radius:12px;font-size:18px;font-weight:600;padding:22px 16px;cursor:pointer;transition:opacity .1s,transform .1s}
.btn-prev{background:#334155;color:#94a3b8}
.btn-next{background:#1d4ed8;color:#fff}
.btn-blackout{background:#7f1d1d;color:#fca5a5;grid-column:span 2}
.btn:active{opacity:.7;transform:scale(.97)}
</style>
</head>
<body>
<div id="status">연결 중...</div>
<div id="slide-info">
  <div id="slide-text">–</div>
  <div id="slide-pos"></div>
</div>
<div id="controls">
  <button class="btn btn-prev" onclick="send('prev')">◀ 이전</button>
  <button class="btn btn-next" onclick="send('next')">다음 ▶</button>
  <button class="btn btn-blackout" onclick="send('blackout')">⬛ 블랙아웃</button>
</div>
<script>
let ws;
function connect(){
  ws=new WebSocket('ws://'+location.host+'/ws');
  ws.onopen=()=>{document.getElementById('status').textContent='연결됨 ✓';document.getElementById('status').className='ok'};
  ws.onmessage=(e)=>{
    try{const d=JSON.parse(e.data);if(d.type==='state'){
      document.getElementById('slide-text').textContent=d.slideText||'–';
      document.getElementById('slide-pos').textContent=d.totalSlides>0?`${d.slideIndex+1} / ${d.totalSlides}`:'';
    }}catch{}
  };
  ws.onclose=()=>{document.getElementById('status').textContent='연결 끊김 (재시도 중...)';document.getElementById('status').className='';setTimeout(connect,2000)};
}
function send(type,extra){if(ws&&ws.readyState===1)ws.send(JSON.stringify({type,...extra}))}
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
}

async fn root_handler() -> Html<&'static str> {
    Html(REMOTE_HTML)
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AxumState>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
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
) -> Result<(), String> {
    // Check and reject early — drop the guard before any await.
    {
        let guard = remote.abort_handle.lock().unwrap();
        if guard.is_some() {
            return Err("already_running".to_string());
        }
    }

    let state_tx = remote.state_tx.clone();
    let axum_state = Arc::new(AxumState { app, state_tx });
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
    Ok(())
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
