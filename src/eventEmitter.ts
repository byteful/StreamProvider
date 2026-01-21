import { Response } from 'express';

export type SSEEventType = 
    | 'stats'
    | 'job:created'
    | 'job:started'
    | 'job:completed'
    | 'job:failed'
    | 'cache:updated'
    | 'connected';

export interface SSEEvent {
    type: SSEEventType;
    data: any;
    timestamp: number;
}

class EventEmitter {
    private clients: Set<Response> = new Set();

    addClient(res: Response): void {
        this.clients.add(res);
        
        this.sendToClient(res, {
            type: 'connected',
            data: { message: 'Connected to SSE stream' },
            timestamp: Date.now()
        });
    }

    removeClient(res: Response): void {
        this.clients.delete(res);
    }

    getClientCount(): number {
        return this.clients.size;
    }

    private sendToClient(res: Response, event: SSEEvent): void {
        try {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
            this.clients.delete(res);
        }
    }

    broadcast(type: SSEEventType, data: any): void {
        const event: SSEEvent = {
            type,
            data,
            timestamp: Date.now()
        };

        for (const client of this.clients) {
            this.sendToClient(client, event);
        }
    }

    broadcastStats(stats: any): void {
        this.broadcast('stats', stats);
    }

    broadcastJobCreated(job: {
        id: string;
        tmdbId: string;
        season?: number;
        episode?: number;
        source: 'direct' | 'precache' | 'manual';
    }): void {
        this.broadcast('job:created', job);
    }

    broadcastJobStarted(id: string): void {
        this.broadcast('job:started', { id });
    }

    broadcastJobCompleted(id: string, cached: boolean = true): void {
        this.broadcast('job:completed', { id, cached });
    }

    broadcastJobFailed(id: string, error: string): void {
        this.broadcast('job:failed', { id, error });
    }

    broadcastCacheUpdated(tmdbId: string, season?: number, episode?: number): void {
        this.broadcast('cache:updated', { tmdbId, season, episode });
    }
}

export const eventEmitter = new EventEmitter();
