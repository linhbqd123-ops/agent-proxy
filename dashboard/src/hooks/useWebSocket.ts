import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsEvent } from '../types';

const WS_URL = `ws://${window.location.hostname}:4000/ws`;
const RECONNECT_DELAY_MS = 2000;

export type WsStatus = 'connecting' | 'connected' | 'disconnected';

export interface UseWebSocketReturn {
  lastEvent: WsEvent | null;
  status: WsStatus;
}

export function useWebSocket(): UseWebSocketReturn {
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const [status, setStatus] = useState<WsStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    setStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return; }
      setStatus('connected');
      console.log('[ws] connected');
    };

    ws.onmessage = (event) => {
      if (unmountedRef.current) return;
      try {
        const parsed = JSON.parse(event.data as string) as WsEvent;
        setLastEvent(parsed);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      // errors always precede close; handled there
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      setStatus('disconnected');
      console.log(`[ws] disconnected — reconnecting in ${RECONNECT_DELAY_MS}ms`);
      timerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { lastEvent, status };
}
