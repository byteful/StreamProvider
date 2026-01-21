import { useEffect, useRef, useCallback, useState } from 'react';

export interface SSEEvent {
  type: string;
  data: any;
  timestamp: number;
}

export interface UseSSEOptions {
  onStats?: (data: any) => void;
  onJobCreated?: (data: any) => void;
  onJobStarted?: (data: any) => void;
  onJobCompleted?: (data: any) => void;
  onJobFailed?: (data: any) => void;
  onCacheUpdated?: (data: any) => void;
  onConnected?: () => void;
  onError?: (error: Event) => void;
}

export function useSSE(options: UseSSEOptions) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource('/api/events');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const parsed: SSEEvent = JSON.parse(event.data);
        const opts = optionsRef.current;

        switch (parsed.type) {
          case 'connected':
            opts.onConnected?.();
            break;
          case 'stats':
            opts.onStats?.(parsed.data);
            break;
          case 'job:created':
            opts.onJobCreated?.(parsed.data);
            break;
          case 'job:started':
            opts.onJobStarted?.(parsed.data);
            break;
          case 'job:completed':
            opts.onJobCompleted?.(parsed.data);
            break;
          case 'job:failed':
            opts.onJobFailed?.(parsed.data);
            break;
          case 'cache:updated':
            opts.onCacheUpdated?.(parsed.data);
            break;
        }
      } catch (error) {
        console.error('Failed to parse SSE event:', error);
      }
    };

    eventSource.onerror = (error) => {
      setConnected(false);
      optionsRef.current.onError?.(error);

      // Reconnect after 3 seconds
      setTimeout(() => {
        if (eventSourceRef.current === eventSource) {
          connect();
        }
      }, 3000);
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect]);

  return { connected };
}
