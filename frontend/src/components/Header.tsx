interface HeaderProps {
  connected: boolean;
  scrapeRemaining: number;
}

export function Header({ connected, scrapeRemaining }: HeaderProps) {
  return (
    <header className="flex flex-col md:flex-row justify-between items-center mb-10 pt-2">
      <div className="flex items-center gap-4 mb-4 md:mb-0 group cursor-default">
        <div className="relative w-12 h-12">
          <div className={`absolute inset-0 bg-gradient-to-tr ${connected ? 'from-[var(--accent)] to-[var(--accent-secondary)]' : 'from-red-500 to-orange-500'} rounded-xl blur-lg opacity-40 group-hover:opacity-60 transition-all duration-500 animate-pulse-glow`} />
          <div className="relative w-full h-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl flex items-center justify-center text-xl text-white shadow-xl overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
             <span className="relative z-10 transform group-hover:scale-110 transition-transform duration-300">▶</span>
          </div>
          {/* Status Dot */}
          <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[var(--bg-primary)] ${connected ? 'bg-emerald-500' : 'bg-red-500'} z-20`} />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--text-secondary)]">
            StreamProvider
          </h1>
          <div className="flex items-center gap-2">
            <span className={`h-[1px] w-8 ${connected ? 'bg-[var(--accent)]' : 'bg-red-500'} transition-colors duration-300`} />
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">System Dashboard</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="glass-panel px-4 py-2 rounded-lg flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Daily Scrape Quota</span>
          <span className="font-mono font-bold text-[var(--accent-secondary)] text-lg">{scrapeRemaining}</span>
        </div>
      </div>
    </header>
  );
}
