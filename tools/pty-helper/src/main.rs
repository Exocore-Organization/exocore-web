// pty-helper — NDJSON PTY bridge for Deno-compiled exocore-ide.
// Protocol: each line is a JSON request on stdin; response on stdout.
//
// Request:  {"cmd":"spawn","command":"bash","args":["-i"],"cols":80,"rows":24,"env":{"TERM":"xterm-256color"}}
//           {"cmd":"write","id":1,"data":"ls\n"}
//           {"cmd":"resize","id":1,"cols":120,"rows":40}
//           {"cmd":"poll","id":1}
//           {"cmd":"kill","id":1}
//
// Response: {"type":"spawn","id":1,"ok":true}
//           {"type":"poll","id":1,"ok":true,"data":"...","exit":null}
//           {"type":"poll","id":1,"ok":true,"data":"","exit":0}

use nix::fcntl::{fcntl, FcntlArg, OFlag};
use nix::libc;
use nix::pty::{forkpty, ForkptyResult, Winsize};
use nix::sys::signal::{kill, Signal};
use nix::unistd::{read, write, Pid};
use std::collections::HashMap;
use std::ffi::CString;
use std::io::{self, BufRead, BufReader, Write};
use std::os::fd::{AsRawFd, OwnedFd};

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut sessions: HashMap<u64, Session> = HashMap::new();
    let mut next_id: u64 = 1;

    for line in BufReader::new(stdin.lock()).lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        let parsed: Result<serde_json::Value, _> = serde_json::from_str(&line);
        let msg = match parsed {
            Ok(v) => v,
            Err(e) => {
                let _ = writeln!(
                    stdout.lock(),
                    r#"{{"type":"error","id":0,"ok":false,"data":"parse error: {}"}}"#,
                    e
                );
                continue;
            }
        };
        let cmd = msg["cmd"].as_str().unwrap_or("");
        match cmd {
            "spawn" => cmd_spawn(&msg, &mut sessions, &mut next_id, &stdout),
            "write" => cmd_write(&msg, &mut sessions, &stdout),
            "resize" => cmd_resize(&msg, &mut sessions, &stdout),
            "poll" => cmd_poll(&msg, &mut sessions, &stdout),
            "kill" => cmd_kill(&msg, &mut sessions, &stdout),
            _ => {
                let _ = writeln!(
                    stdout.lock(),
                    r#"{{"type":"error","id":0,"ok":false,"data":"unknown cmd: {}"}}"#,
                    cmd
                );
            }
        }
    }
}

struct Session {
    child: Pid,
    fd: OwnedFd,
    exit_code: Option<i32>,
}

fn cmd_spawn(
    msg: &serde_json::Value,
    sessions: &mut HashMap<u64, Session>,
    next_id: &mut u64,
    stdout: &io::Stdout,
) {
    let command = msg["command"].as_str().unwrap_or("bash");
    let args: Vec<&str> = msg["args"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();
    let cols = msg["cols"].as_u64().unwrap_or(80) as u16;
    let rows = msg["rows"].as_u64().unwrap_or(24) as u16;

    // Parse optional env map from JSON: {"TERM":"xterm-256color", ...}
    let env_vars: Vec<(String, String)> = msg["env"]
        .as_object()
        .map(|m| {
            m.iter()
                .filter_map(|(k, v)| {
                    v.as_str()
                        .map(|sv| (k.clone(), sv.to_string()))
                })
                .collect()
        })
        .unwrap_or_default();

    let ws = Winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: (cols as u32 * 8) as u16,  // approximate pixel width (8px per cell)
        ws_ypixel: (rows as u32 * 16) as u16, // approximate pixel height (16px per cell)
    };

    match unsafe { forkpty(Some(&ws), None) } {
        Ok(ForkptyResult::Child) => {
            // Child process: set environment variables, then exec command
            for (key, val) in &env_vars {
                std::env::set_var(key, val);
            }
            let cmd_cstr = match CString::new(command) {
                Ok(c) => c,
                Err(_) => std::process::exit(2),
            };
            let mut args_cstr: Vec<CString> = Vec::new();
            args_cstr.push(cmd_cstr.clone());
            for a in &args {
                if let Ok(c) = CString::new(*a) {
                    args_cstr.push(c);
                }
            }
            let _ = nix::unistd::execvp(&cmd_cstr, &args_cstr);
            // execvp failed — exit with a non-zero status so the parent knows
            std::process::exit(127);
        }
        Ok(ForkptyResult::Parent { child, master }) => {
            let id = *next_id;
            *next_id += 1;
            let raw = master.as_raw_fd();

            // Set non-blocking on master fd
            let flags = fcntl(raw, FcntlArg::F_GETFL).unwrap_or(0);
            let _ = fcntl(
                raw,
                FcntlArg::F_SETFL(OFlag::from_bits_truncate(flags | libc::O_NONBLOCK)),
            );

            sessions.insert(
                id,
                Session {
                    child,
                    fd: master,
                    exit_code: None,
                },
            );
            let _ = writeln!(
                stdout.lock(),
                r#"{{"type":"spawn","id":{},"ok":true}}"#,
                id
            );
        }
        Err(e) => {
            let _ = writeln!(
                stdout.lock(),
                r#"{{"type":"spawn","id":0,"ok":false,"data":"forkpty failed: {}"}}"#,
                e
            );
        }
    }
}

fn cmd_write(
    msg: &serde_json::Value,
    sessions: &mut HashMap<u64, Session>,
    stdout: &io::Stdout,
) {
    let id = msg["id"].as_u64().unwrap_or(0);
    let data = msg["data"].as_str().unwrap_or("");
    if let Some(session) = sessions.get(&id) {
        let _ = write(&session.fd, data.as_bytes());
        let _ = writeln!(stdout.lock(), r#"{{"type":"write","id":{},"ok":true}}"#, id);
    } else {
        let _ = writeln!(
            stdout.lock(),
            r#"{{"type":"write","id":{},"ok":false,"data":"session not found"}}"#,
            id
        );
    }
}

fn cmd_resize(
    msg: &serde_json::Value,
    sessions: &mut HashMap<u64, Session>,
    stdout: &io::Stdout,
) {
    let id = msg["id"].as_u64().unwrap_or(0);
    let cols = msg["cols"].as_u64().unwrap_or(80) as u16;
    let rows = msg["rows"].as_u64().unwrap_or(24) as u16;
    if let Some(session) = sessions.get(&id) {
        let ws = libc::winsize {
            ws_row: rows,
            ws_col: cols,
            ws_xpixel: (cols as u32 * 8) as u16,  // approximate pixel width
            ws_ypixel: (rows as u32 * 16) as u16, // approximate pixel height
        };
        unsafe {
            libc::ioctl(session.fd.as_raw_fd(), libc::TIOCSWINSZ, &ws);
        }
        let _ = writeln!(stdout.lock(), r#"{{"type":"resize","id":{},"ok":true}}"#, id);
    } else {
        let _ = writeln!(
            stdout.lock(),
            r#"{{"type":"resize","id":{},"ok":false,"data":"session not found"}}"#,
            id
        );
    }
}

fn cmd_poll(
    msg: &serde_json::Value,
    sessions: &mut HashMap<u64, Session>,
    stdout: &io::Stdout,
) {
    let id = msg["id"].as_u64().unwrap_or(0);
    if let Some(session) = sessions.get(&id) {
        // Check for child exit
        let exit = match nix::sys::wait::waitpid(
            session.child,
            Some(nix::sys::wait::WaitPidFlag::WNOHANG),
        ) {
            Ok(nix::sys::wait::WaitStatus::Exited(_, code)) => Some(code),
            Ok(nix::sys::wait::WaitStatus::Signaled(_, sig, _)) => Some(-(sig as i32)),
            _ => None,
        };

        // Read available data from PTY master
        let mut buf = [0u8; 8192];
        let mut data = String::new();
        loop {
            match read(session.fd.as_raw_fd(), &mut buf) {
                Ok(0) => break,
                Ok(n) => data.push_str(&String::from_utf8_lossy(&buf[..n])),
                Err(nix::errno::Errno::EAGAIN) => break,
                Err(_) => break,
            }
        }

        if let Some(ec) = exit {
            let _ = writeln!(
                stdout.lock(),
                r#"{{"type":"poll","id":{},"ok":true,"data":{},"exit":{}}}"#,
                id,
                serde_json::to_string(&data).unwrap(),
                ec
            );
        } else {
            let _ = writeln!(
                stdout.lock(),
                r#"{{"type":"poll","id":{},"ok":true,"data":{},"exit":null}}"#,
                id,
                serde_json::to_string(&data).unwrap(),
            );
        }
    } else {
        let _ = writeln!(
            stdout.lock(),
            r#"{{"type":"poll","id":{},"ok":false,"data":"session not found"}}"#,
            id
        );
    }
}

fn cmd_kill(
    msg: &serde_json::Value,
    sessions: &mut HashMap<u64, Session>,
    stdout: &io::Stdout,
) {
    let id = msg["id"].as_u64().unwrap_or(0);
    if let Some(session) = sessions.remove(&id) {
        let _ = kill(session.child, Signal::SIGTERM);
        drop(session.fd);
        let _ = writeln!(stdout.lock(), r#"{{"type":"kill","id":{},"ok":true}}"#, id);
    } else {
        let _ = writeln!(
            stdout.lock(),
            r#"{{"type":"kill","id":{},"ok":false,"data":"session not found"}}"#,
            id
        );
    }
}
