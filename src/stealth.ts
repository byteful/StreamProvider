import type { BrowserContext } from 'patchright';

/**
 * Patchright + real Chrome (channel: "chrome") handles all fingerprint
 * evasion natively: webdriver, plugins, chrome object, stack traces, etc.
 *
 * The only remaining detection vector that survives Patchright is the
 * timing attack (f[18162]): a tight JS loop measures wall-clock time via
 * Date.now()/performance.now(). CDP round-trip overhead — inherent to any
 * remote-debugging protocol — inflates the measurement past the 1500ms
 * threshold. We compress timestamps during the initial burst window so
 * the loop appears instant, then fall back to real time for normal use.
 */
export async function applyTimingShield(ctx: BrowserContext): Promise<void> {
    await ctx.addInitScript(() => {
        const BURST_WINDOW = 300;

        const _realDateNow = Date.now.bind(Date);
        let _dateCalls = 0;
        let _dateBase = 0;

        Date.now = function now() {
            _dateCalls++;
            if (_dateCalls < BURST_WINDOW) {
                if (_dateCalls === 1) _dateBase = _realDateNow();
                return _dateBase;
            }
            return _realDateNow();
        };

        const _realPerfNow = performance.now.bind(performance);
        let _perfCalls = 0;
        let _perfBase = 0;

        performance.now = function now() {
            _perfCalls++;
            if (_perfCalls < BURST_WINDOW) {
                if (_perfCalls === 1) _perfBase = _realPerfNow();
                return _perfBase;
            }
            return _realPerfNow();
        };

        const _nativeToString = Function.prototype.toString;
        const _nativeCall = Function.prototype.call;
        const _spoofMap = new WeakMap<Function, string>();

        const _spoofedToString = function toString(this: Function) {
            const s = _spoofMap.get(this);
            if (s) return s;
            return _nativeCall.call(_nativeToString, this);
        };
        _spoofMap.set(_spoofedToString, 'function toString() { [native code] }');
        _spoofMap.set(Date.now, 'function now() { [native code] }');
        _spoofMap.set(performance.now, 'function now() { [native code] }');
        Function.prototype.toString = _spoofedToString;
    });
}
