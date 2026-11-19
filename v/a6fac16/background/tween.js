// The shared rAF tween driver (moved verbatim from src/framework/shader.js, T3.4).

// One rAF tween driver for every shader tween (T3.1). The CALLER owns the curve:
// onStep(frameNow, start) computes progress/easing with its own expressions and
// returns whether to keep going (its own stop rule); the driver owns scheduling,
// cancellation and the `done` promise. `start` is the caller's own
// performance.now()-based origin (defaults to now() at creation). A throwing
// onStep ends the tween (done resolves) and the error propagates, as before.
// Returns { cancel, done, active }: `done` resolves on completion OR cancel();
// `active` is true until then. Adds no timers and no extra frames.
export const tween = ({ start, onStep, now = () => performance.now(), raf = requestAnimationFrame, caf = cancelAnimationFrame }) => {
  const origin = start != null ? start : now();
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  let id = null;
  let active = true;
  const finish = () => {
    active = false;
    id = null;
    resolveDone();
  };
  const step = (frameNow) => {
    if (!active) return;
    let keep;
    try {
      keep = onStep(frameNow, origin);
    } catch (e) {
      finish();
      throw e;
    }
    if (active && keep) id = raf(step);
    else if (active) finish();
  };
  id = raf(step);
  return {
    done,
    get active() {
      return active;
    },
    cancel() {
      if (!active) return;
      if (id != null) caf(id);
      finish();
    },
  };
};
export const settled = () => Promise.resolve();
