use std::io::{Write, BufRead, BufReader};
use std::net::{TcpListener, TcpStream};

fn handle_connection(mut stream: TcpStream) {
    let buf_reader = BufReader::new(&stream);
    let _request_line = buf_reader.lines().next()
        .unwrap_or(Ok(String::new())).unwrap_or_default();

    let body = r#"{"message": "Hello from Exocore Rust!", "status": "ok"}"#;
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        body.len(), body
    );
    stream.write_all(response.as_bytes()).unwrap_or(());
}

fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).expect("Failed to bind");
    println!("[Exocore] Rust server running on http://{}", addr);
    for stream in listener.incoming().flatten() {
        handle_connection(stream);
    }
}
