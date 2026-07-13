// Thin WebSocket wrapper for the chat bridge.
export class ChatSocket {
  private ws: WebSocket | null = null;
  private queue: string[] = [];

  constructor(
    private handlers: {
      onMessage: (data: any) => void;
      onOpen?: () => void;
      onClose?: () => void;
    }
  ) {}

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onopen = () => {
      this.handlers.onOpen?.();
      for (const m of this.queue) this.ws!.send(m);
      this.queue = [];
    };
    this.ws.onmessage = (e) => {
      try {
        this.handlers.onMessage(JSON.parse(e.data));
      } catch {
        /* ignore malformed */
      }
    };
    this.ws.onclose = () => this.handlers.onClose?.();
    this.ws.onerror = () => {};
  }

  send(obj: unknown) {
    const data = JSON.stringify(obj);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(data);
    else this.queue.push(data);
  }

  get isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close() {
    this.ws?.close();
    this.ws = null;
  }
}
