/// Lightweight HTTP server for OBS browser source.
/// Starts automatically on port 4316 when the app launches.
/// Serves /livestream (HTML page) and /livestream-ws (WebSocket).
/// No PIN required — intended for local screen-overlay use only.

use axum::{
    Router,
    extract::{State, WebSocketUpgrade},
    extract::ws::{Message, WebSocket},
    response::{Html, IntoResponse, Response},
    routing::get,
};
use std::sync::Arc;
use tokio::sync::broadcast;

pub const LIVESTREAM_PORT: u16 = 4316;

pub struct LivestreamServerState {
    pub state_tx: broadcast::Sender<String>,
}

impl LivestreamServerState {
    pub fn new() -> Self {
        let (state_tx, _) = broadcast::channel(32);
        Self { state_tx }
    }
}

struct AxumLsState {
    state_tx: broadcast::Sender<String>,
}

const LIVESTREAM_HTML: &str = r#"<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:transparent}
#stage{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center}
#stage.top{justify-content:flex-start;padding-top:5%}
#stage.center{justify-content:center}
#stage.bottom{justify-content:flex-end;padding-bottom:5%}
#box{text-align:center;padding:8px 20px;border-radius:4px;transition:opacity 0.3s ease}
#lines{white-space:pre-wrap;line-height:1.3;letter-spacing:0px}
</style>
</head>
<body>
<div id="stage" class="bottom">
  <div id="box"><div id="lines"></div></div>
</div>
<script>
var ws;
function connect(){
  ws=new WebSocket('ws://'+location.host+'/livestream-ws');
  ws.onmessage=function(e){try{apply(JSON.parse(e.data));}catch(err){}};
  ws.onclose=function(){setTimeout(connect,2000)};
}
function apply(cfg){
  var sub=cfg.subtitle,bg=cfg.background;
  var stage=document.getElementById('stage');
  var box=document.getElementById('box');
  var lines=document.getElementById('lines');
  document.body.style.background=bg.type==='color'?(bg.color||'transparent'):'transparent';
  stage.className=sub.position||'bottom';
  var text=(sub.lines||[]).join('\n');
  lines.textContent=text;
  box.style.opacity=(sub.visible&&text)?'1':'0';
  lines.style.fontSize=(sub.fontSize||36)+'px';
  lines.style.fontFamily=sub.fontFamily||'sans-serif';
  lines.style.fontWeight=sub.fontWeight||'normal';
  lines.style.fontStyle=sub.fontStyle||'normal';
  lines.style.color=sub.color||'#ffffff';
  lines.style.lineHeight=String(sub.lineHeight||1.3);
  lines.style.letterSpacing=(sub.letterSpacing||0)+'px';
  lines.style.textDecoration=sub.textDecoration||'none';
  var sh=[];
  if(sub.strokeWidth>0){var sc=sub.strokeColor||'#000',sw=sub.strokeWidth;for(var dx=-sw;dx<=sw;dx++)for(var dy=-sw;dy<=sw;dy++)if(Math.abs(dx)+Math.abs(dy)>0)sh.push(dx+'px '+dy+'px 0 '+sc);}
  if(sub.shadowEnabled)sh.push('2px 3px 6px rgba(0,0,0,0.7)');
  lines.style.textShadow=sh.join(',');
  box.style.background=sub.backgroundBoxVisible?'rgba(0,0,0,'+(sub.backgroundBoxOpacity!=null?sub.backgroundBoxOpacity:0.5)+')':'transparent';
}
connect();
</script>
</body>
</html>"#;

async fn page_handler() -> impl IntoResponse {
    Html(LIVESTREAM_HTML)
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AxumLsState>>,
) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AxumLsState>) {
    let mut rx = state.state_tx.subscribe();
    loop {
        tokio::select! {
            result = rx.recv() => {
                match result {
                    Ok(msg) => { if socket.send(Message::Text(msg.into())).await.is_err() { break; } }
                    Err(_) => break,
                }
            }
            msg = socket.recv() => { if msg.is_none() { break; } }
        }
    }
}

/// Start the livestream HTTP server. Runs for the lifetime of the app.
pub fn start(state_tx: broadcast::Sender<String>) {
    let axum_state = Arc::new(AxumLsState { state_tx });
    let router = Router::new()
        .route("/livestream", get(page_handler))
        .route("/livestream-ws", get(ws_handler))
        .with_state(axum_state);

    tauri::async_runtime::spawn(async move {
        let addr = std::net::SocketAddr::from(([127, 0, 0, 1], LIVESTREAM_PORT));
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[livestream-server] bind error on port {}: {}", LIVESTREAM_PORT, e);
                return;
            }
        };
        if let Err(e) = axum::serve(listener, router).await {
            eprintln!("[livestream-server] serve error: {}", e);
        }
    });
}

#[tauri::command]
pub fn send_livestream_update(
    payload: String,
    ls: tauri::State<'_, LivestreamServerState>,
) {
    let _ = ls.state_tx.send(payload);
}
