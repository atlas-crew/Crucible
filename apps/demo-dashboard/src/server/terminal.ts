import * as pty from 'node-pty';
import { EventEmitter } from 'events';

interface TerminalSession {
  id: string;
  process: pty.IPty;
}

export class TerminalService extends EventEmitter {
  private sessions: Map<string, TerminalSession> = new Map();
  private shell: string;

  constructor() {
    super();
    this.shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  }

  startSession(id: string, cols: number = 80, rows: number = 24): void {
    if (this.sessions.has(id)) {
      return;
    }

    const term = pty.spawn(this.shell, [], {
      name: 'xterm-color',
      cols,
      rows,
      cwd: process.cwd(),
      env: process.env as any,
    });

    term.onData((data) => {
      this.emit('terminal:output', { id, data });
    });

    term.onExit(({ exitCode, signal }) => {
      this.sessions.delete(id);
      this.emit('terminal:exit', { id, exitCode, signal });
    });

    this.sessions.set(id, { id, process: term });
  }

  sendInput(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.process.write(data);
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (session) {
      session.process.resize(cols, rows);
    }
  }

  stopSession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.process.kill();
      this.sessions.delete(id);
    }
  }

  destroy(): void {
    for (const session of this.sessions.values()) {
      session.process.kill();
    }
    this.sessions.clear();
  }
}
