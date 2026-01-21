import { eventEmitter } from './eventEmitter.ts';

export type JobSource = 'direct' | 'precache' | 'manual';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ActiveJob {
    id: string;
    tmdbId: string;
    season?: number;
    episode?: number;
    source: JobSource;
    status: JobStatus;
    ipAddress?: string;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    error?: string;
}

class JobTracker {
    private jobs: Map<string, ActiveJob> = new Map();
    private jobCounter = 0;

    private generateId(): string {
        return `job_${Date.now()}_${++this.jobCounter}`;
    }

    createJob(
        tmdbId: string,
        source: JobSource,
        season?: number,
        episode?: number,
        ipAddress?: string
    ): string {
        const id = this.generateId();
        const job: ActiveJob = {
            id,
            tmdbId,
            season,
            episode,
            source,
            status: 'pending',
            ipAddress,
            createdAt: Date.now()
        };

        this.jobs.set(id, job);

        eventEmitter.broadcastJobCreated({
            id,
            tmdbId,
            season,
            episode,
            source
        });

        return id;
    }

    startJob(id: string): void {
        const job = this.jobs.get(id);
        if (job) {
            job.status = 'processing';
            job.startedAt = Date.now();
            eventEmitter.broadcastJobStarted(id);
        }
    }

    completeJob(id: string): void {
        const job = this.jobs.get(id);
        if (job) {
            job.status = 'completed';
            job.completedAt = Date.now();
            eventEmitter.broadcastJobCompleted(id, true);
            eventEmitter.broadcastCacheUpdated(job.tmdbId, job.season, job.episode);

            setTimeout(() => this.jobs.delete(id), 60000);
        }
    }

    failJob(id: string, error: string): void {
        const job = this.jobs.get(id);
        if (job) {
            job.status = 'failed';
            job.completedAt = Date.now();
            job.error = error;
            eventEmitter.broadcastJobFailed(id, error);

            setTimeout(() => this.jobs.delete(id), 60000);
        }
    }

    getJob(id: string): ActiveJob | undefined {
        return this.jobs.get(id);
    }

    getAllJobs(): ActiveJob[] {
        return Array.from(this.jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    getActiveJobs(): ActiveJob[] {
        return this.getAllJobs().filter(j => j.status === 'pending' || j.status === 'processing');
    }

    getRecentJobs(limit: number = 50): ActiveJob[] {
        return this.getAllJobs().slice(0, limit);
    }

    getStats(): {
        pending: number;
        processing: number;
        completed: number;
        failed: number;
        total: number;
    } {
        const jobs = this.getAllJobs();
        return {
            pending: jobs.filter(j => j.status === 'pending').length,
            processing: jobs.filter(j => j.status === 'processing').length,
            completed: jobs.filter(j => j.status === 'completed').length,
            failed: jobs.filter(j => j.status === 'failed').length,
            total: jobs.length
        };
    }

    cleanup(): void {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes

        for (const [id, job] of this.jobs.entries()) {
            if (job.completedAt && now - job.completedAt > maxAge) {
                this.jobs.delete(id);
            }
        }
    }
}

export const jobTracker = new JobTracker();

setInterval(() => jobTracker.cleanup(), 60000);
