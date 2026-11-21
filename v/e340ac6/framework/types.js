/**
 * Module contract typedefs (JSDoc only; no runtime code).
 * See docs/refactor/audit/04-framework.md section 3.1 and docs/refactor/PLAN.md T0.14 / section 3.
 *
 * Rule: a module's promise means "my visuals are done", and nothing else.
 *
 * Resolution moments (TODAY's behaviour, preserved; load-bearing feel):
 *
 * | Call                  | Resolves when                                                        |
 * |-----------------------|----------------------------------------------------------------------|
 * | Hero  enter()         | text animations end                                                  |
 * | Yard  enter()         | title text only; the logo cascade is NOT awaited                     |
 * | Yard  exit()          | includes cascade + hairline                                          |
 * | Video enter()         | pacing timer `revealSettle` (also drives mute-CTA appearance and     |
 * |                       | first-view playback start; iOS-critical, do not touch). Since T3.8   |
 * |                       | the shader freeze no longer follows it: the deck freezes on          |
 * |                       | shader.whenSettled() after unlock (dissolve + balance done).         |
 * | Video exit()          | resolves immediately                                                 |
 * | Deck unlock / hide    | min(1400, max(exit, enter)) after one nextFrame (~1350 Yard>Video,   |
 * |                       | 1400 elsewhere); input unlocks and old section hides then            |
 *
 * @typedef {"up"|"down"} Dir
 *
 * @typedef {Object} Leads  Resolved (breakpoint-applied) leads for one move, in ms.
 * @property {number} textIn
 * @property {number} anchorIn
 * @property {number} textOut
 * @property {number} cascadeIn
 * @property {number} cascadeOut
 * @property {number} hairline
 * @property {number} wash
 * @property {number} brand
 * @property {number|null} unwash        null when no unwash happens
 * @property {number} shader.dissolve    (property of the `shader` group)
 * @property {number} shader.balance
 * @property {boolean} shader.reverse
 * @property {boolean} shader.timer      timer-scheduled vs synchronous
 *
 * @typedef {Object} TransitionCtx  Frozen per go(); replaces ui.trans / ui.persist.
 * @property {string} from
 * @property {string} to
 * @property {Dir} dir
 * @property {boolean} mobile
 * @property {Leads} leads
 * @property {Set<Element>} persist      anchors handled by the deck
 * @property {AbortSignal} signal        aborted when a newer go() starts (not on module-local cancellation)
 *
 * @typedef {Object} Module
 * @property {string} id
 * @property {"dark"|"light"} scheme
 * @property {{paused?:boolean, opacity?:number, balance?:number|(()=>number), treatment?:object|null}} [shader]
 * @property {{undecked?:boolean}} [layout]   content lives outside #deck, so deck pointer-events:none
 * @property {(section:HTMLElement)=>void} mount
 * @property {(dir:Dir, ctx:TransitionCtx)=>Promise<void>} enter
 * @property {(dir:Dir, ctx:TransitionCtx)=>Promise<void>} exit
 * @property {()=>void} [unmount]
 * @property {Object<string,string>} [anchors]  data-anchor keys for persistence
 */

export {};
