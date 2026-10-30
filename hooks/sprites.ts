// Pixel crab and costumes adapted from savvy-progress by johnnyvizz
// (https://github.com/johnnyvizz/claude-kit, MIT License, Copyright (c) 2026 johnnyvizz).
// Changes: eyes that shut, droop, look around and go dizzy; moods, care poses, the
// poses of its own life, tool props, a nightcap and hearts.

import type { Costume, Pose, Prop, Tiredness } from '../types'
import { gadgetOf } from './gadgets'

export const CLAY = '#D97757'
export const INK = '#1F1E1D'

/** The daily rotation. */
export const COSTUMES = ['astronaut', 'surfer', 'detective', 'viking', 'engineer', 'diver', 'chef', 'wizard', 'racer', 'dj', 'pirate', 'plain'] as const satisfies readonly Costume[]
/** Outside the rotation: worn on holidays, in the rain or once earned, or picked with /crab. */
export const SPECIAL_COSTUMES = ['ghost', 'santa', 'oktoberfest', 'raincoat', 'king'] as const satisfies readonly Costume[]
export type { Costume }

const ACCENT: Record<Costume, string> = {
  astronaut: '#7F77DD',
  detective: '#D85A30',
  engineer: '#BA7517',
  chef: '#378ADD',
  racer: '#1D9E75',
  pirate: '#888780',
  plain: '#888780',
  surfer: '#378ADD',
  diver: '#F28C3A',
  viking: '#8E929A',
  wizard: '#534AB7',
  dj: '#D85A30',
  ghost: '#B4B2A9',
  santa: '#D8433B',
  oktoberfest: '#3B6D11',
  raincoat: '#F5C542',
  king: '#F5C542',
}

export const isCostume = (v: unknown): v is Costume =>
  typeof v === 'string' && ((COSTUMES as readonly string[]).includes(v) || (SPECIAL_COSTUMES as readonly string[]).includes(v))

// Local calendar day, so the costume changes at midnight where you are.
export const costumeOfDay = (ms: number, offsetMinutes: number): Costume => {
  const day = Math.floor((ms - offsetMinutes * 60_000) / 86_400_000)
  return COSTUMES[((day % COSTUMES.length) + COSTUMES.length) % COSTUMES.length] ?? 'plain'
}

type Eyes = 'open' | 'half' | 'shut' | 'x' | 'side' | 'up' | 'front' | 'wide'
type EyePair = Eyes | readonly [Eyes, Eyes]
type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

// Each run of one colour along a row is one rect, which keeps the drawings small.
const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => {
    const cells = [...row]
    for (let dx = 0; dx < cells.length; ) {
      const ch = cells[dx] ?? '.'
      let end = dx + 1
      while (end < cells.length && cells[end] === ch) end++
      if (map[ch]) f(x + dx, y + dy, end - dx, 1, map[ch] ?? '', cls)
      dx = end
    }
  })

const eye = (f: Fill, x: number, eyes: Eyes): void => {
  if (eyes === 'open') return f(x, 12, 2, 2, INK, 'eye')
  if (eyes === 'side') return f(x + 1, 12, 2, 2, INK, 'eye')
  if (eyes === 'up') return f(x, 11, 2, 2, INK, 'eye')
  if (eyes === 'front') {
    f(x, 12, 2, 2, INK, 'eye')
    return f(x, 12, 1, 1, '#ffffff', 'eye')
  }
  if (eyes === 'wide') {
    f(x, 11, 2, 3, INK)
    return f(x, 11, 1, 1, '#ffffff')
  }
  if (eyes === 'shut') return f(x - 1, 13, 3, 1, INK)
  if (eyes === 'half') {
    f(x - 1, 12, 3, 1, '#A9502F')
    return f(x, 13, 2, 1, INK)
  }
  // Dizzy: a little x.
  f(x - 1, 11, 1, 1, INK); f(x + 1, 11, 1, 1, INK); f(x, 12, 1, 1, INK); f(x - 1, 13, 1, 1, INK); f(x + 1, 13, 1, 1, INK)
}

const crabBody = (f: Fill, eyes: EyePair, armFront = 0, armCls?: string): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY, armCls)
  eye(f, 9, typeof eyes === 'string' ? eyes : eyes[0])
  eye(f, 19, typeof eyes === 'string' ? eyes : eyes[1])
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

// For a costume drawn over the face: the eyes again, on top of it.
const eyesOver = (f: Fill, eyes: EyePair): void => {
  eye(f, 9, typeof eyes === 'string' ? eyes : eyes[0])
  eye(f, 19, typeof eyes === 'string' ? eyes : eyes[1])
}

const DRAW: Record<Costume, (f: Fill, t: string, eyes: EyePair) => void> = {
  astronaut: (f, t, eyes) => {
    crabBody(f, eyes)
    // A space headband with two antennas: no glass dome, so it doesn't read as a fishtank.
    f(7, 9, 16, 2, '#E6E8EE'); f(7, 10, 16, 1, '#C9CCD2')
    f(9, 5, 1, 4, '#8E929A'); f(20, 5, 1, 4, '#8E929A')
    f(8, 3, 3, 2, t, 'ant'); f(19, 3, 3, 2, t, 'ant')
    f(13, 18, 4, 2, t); f(14, 18, 2, 1, '#F5C542')
    f(27, 3, 1, 3, '#F5C542', 'star'); f(26, 4, 3, 1, '#F5C542', 'star')
  },
  detective: (f, t, eyes) => {
    crabBody(f, eyes, -4, 'it')
    stamp(f, 6, 3, ['......bbbbbb......', '....bbcbbcbbbb....', '...bbbbbbbbbbbb...', '..bcbbcbbcbbcbbb..', '.bbbbbbbbbbbbbbbb.', 'dddddddddddddddddd'], { b: '#7A4A26', c: '#A0703F', d: '#5A3519' })
    f(6, 9, 18, 1, t)
    stamp(f, 23, 1, ['.kkk.', 'k...k', 'k...k', 'k...k', '.kkk.'], { k: '#3A3A3C' }, 'it')
    f(24, 2, 3, 3, 'rgba(169,214,245,.7)', 'it'); f(25, 6, 1, 4, '#7A4A26', 'it'); f(24, 2, 1, 1, '#fff', 'gl')
  },
  engineer: (f, t, eyes) => {
    crabBody(f, eyes)
    stamp(f, 6, 4, ['.....yyyyyyyy.....', '...yyyyyhhyyyyy...', '..yyyyyyhhyyyyyy..', '..yyyyyyhhyyyyyy..', '.yyyyyyyhhyyyyyyy.', 'dddddddddddddddddd'], { y: '#F5C542', h: '#FBE08A', d: '#C99A1E' })
    f(13, 5, 4, 2, t)
    stamp(f, 0, 10, ['.s.s', 'sss.', '.s..', '.s..'], { s: '#8E929A' }, 'it')
  },
  chef: (f, t, eyes) => {
    crabBody(f, eyes, -4, 'pan')
    stamp(f, 6, 0, ['........lll.......', '.......lllll......', '.wwwwgwwwwwwgwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwgwwwwwggwwwww', '.wwwwgwwwwwggwwwww', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.'], { w: '#F4F3EE', l: '#F7F6F2', g: '#D2D1C8', b: t, d: '#B45F43' })
    f(22, 8, 7, 2, '#4A4A48', 'pan'); f(26, 10, 1, 1, '#4A4A48', 'pan'); f(24, 7, 3, 1, '#F5B731', 'egg')
  },
  racer: (f, t, eyes) => {
    crabBody(f, eyes, -4)
    stamp(f, 6, 5, ['....rrrrrrrrrr....', '..rrrrrrwwrrrrrr..', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.kkkkkkkkkkkkkkkkr'], { r: t, w: '#F8F6F1', k: INK })
    f(25, 1, 1, 9, '#8E929A')
    stamp(f, 26, 1, ['wkwk', 'kwkw', 'wkwk'], { w: '#F8F6F1', k: INK }, 'flag')
  },
  pirate: (f, _t, eyes) => {
    crabBody(f, eyes)
    stamp(f, 5, 3, ['.kk..............kk.', '.kkk....kkkk....kkk.', '..kkkkkkkwwkkkkkkk..', '..kkkkkkkkkkkkkkkk..', '.gggggggggggggggggg.'], { k: '#55514C', w: '#F8F6F1', g: '#F5C542' })
    f(7, 11, 11, 1, INK); f(18, 11, 4, 3, INK)
    f(27, 6, 1, 9, '#C9CCD2', 'it'); f(26, 15, 3, 1, '#7A4A26', 'it')
  },
  plain: (f, _t, eyes) => crabBody(f, eyes),
  ghost: (f, _t, eyes) => {
    crabBody(f, eyes)
    // A bedsheet ghost: the sheet over the shell, eye holes cut, a wavy hem.
    stamp(f, 6, 6, ['....wwwwwwwwww....', '..wwwwwwwwwwwwww..', '.wwwwwwwwwwwwwwwg.', ...Array(12).fill('wwwwwwwwwwwwwwwwgg'), 'ww.www.wwww.www.wg'], { w: '#F4F3EE', g: '#DAD8D0' })
    eyesOver(f, eyes)
    f(13, 17, 4, 2, '#3A3936')
  },
  santa: (f, t, eyes) => {
    crabBody(f, eyes)
    stamp(f, 6, 2, ['..........rrrrr...', '.......rrrrrrrrr..', '....rrrrrrrrrrrrww', '..rrrrrrrrrrrrr.ww', 'wwwwwwwwwwwwwwww..', 'wwwwwwwwwwwwwwww..'], { r: t, w: '#F4F3EE' })
    f(10, 17, 10, 4, '#F4F3EE'); f(11, 21, 8, 1, '#F4F3EE')
  },
  surfer: (f, t, eyes) => {
    crabBody(f, eyes)
    // Shades over the eyes, the board under a claw.
    f(7, 11, 6, 3, INK); f(17, 11, 6, 3, INK); f(13, 12, 4, 1, INK)
    f(8, 11, 1, 1, '#ffffff'); f(18, 11, 1, 1, '#ffffff')
    stamp(f, 0, 3, ['..w.', '.wbw', '.wbw', '.wbw', '.wbw', '.wbw', '.wbw', '.wbw', '.wbw', '.wbw', '..w.'], { w: '#F4F3EE', b: t }, 'it')
  },
  diver: (f, t, eyes) => {
    crabBody(f, eyes)
    f(7, 10, 16, 5, '#2B2A28'); f(8, 11, 14, 3, '#A9D6F5')
    eyesOver(f, eyes)
    // The snorkel, and its bubbles while it swims along.
    f(23, 12, 2, 2, '#2B2A28'); f(24, 4, 2, 9, t); f(24, 3, 4, 2, t)
    f(27, 0, 1, 1, '#A9D6F5', 'bub'); f(25, 1, 1, 1, '#A9D6F5', 'bub')
  },
  viking: (f, t, eyes) => {
    crabBody(f, eyes)
    stamp(f, 6, 4, ['ww..............ww', '.ww............ww.', '.ww...ssssss...ww.', '..wwssssssssssww..', '...ssssssssssss...', 'gggggggggggggggggg'], { w: '#F4F3EE', s: t, g: '#F5C542' })
    f(14, 10, 2, 3, t)
  },
  wizard: (f, t, eyes) => {
    crabBody(f, eyes)
    stamp(f, 6, 1, ['.........pp.......', '........ppp.......', '.......pppp.......', '......ppppp.......', '.....pppppppp.....', '....pppppppppp....', '....pppppppppp....', '...pppppppppppp...', 'bbbbbbbbbbbbbbbbbb'], { p: t, b: '#26215C' })
    f(18, 3, 1, 1, '#F5C542', 'star'); f(13, 6, 1, 1, '#F5C542', 'star')
    // The wand, its tip sparkling as it walks.
    f(27, 9, 1, 6, '#7A4A26'); f(26, 7, 3, 1, '#F5C542', 'star'); f(27, 6, 1, 3, '#F5C542', 'star')
  },
  dj: (f, t, eyes) => {
    crabBody(f, eyes)
    stamp(f, 5, 6, ['.....kkkkkkkkkk.....', '...kk..........kk...', '..k..............k..', '.k................k.'], { k: '#3A3936' }, 'ph')
    f(4, 10, 3, 6, t, 'ph'); f(23, 10, 3, 6, t, 'ph')
    stamp(f, 26, 2, ['..kk', '..k.', '..k.', 'kkk.', 'kk..'], { k: '#F5C542' }, 'star')
  },
  oktoberfest: (f, t, eyes) => {
    crabBody(f, eyes)
    stamp(f, 7, 5, ['......gggg......', '.....gggggg.....', '....ggggggggf...', '...gggggggggfw..', '.dddddddddddddd.'], { g: t, d: '#2B2A28', f: '#E8577A', w: '#F4F3EE' })
    // Braces, and the stein in its claw.
    f(10, 15, 2, 7, t); f(18, 15, 2, 7, t); f(10, 18, 10, 1, t)
    stamp(f, 24, 10, ['wwww.', 'yyyyg', 'yyyyg', 'yyyy.'], { w: '#F4F3EE', y: '#F5B731', g: '#B4B2A9' }, 'it')
  },
  raincoat: (f, t, eyes) => {
    crabBody(f, eyes)
    stamp(f, 6, 6, ['.....yyyyyyyy.....', '...yyyyyyyyyyyy...', '..yyyyyyyyyyyyyy..', '.yyyyyyyyyyyyyyyy.'], { y: t })
    f(6, 10, 1, 4, t); f(23, 10, 1, 4, t)
    f(7, 16, 16, 6, t); f(14, 16, 2, 6, '#C99A1E')
  },
  king: (f, t, eyes) => {
    crabBody(f, eyes)
    stamp(f, 8, 5, ['y...y...y...y.', 'yy.yyy.yyy.yy.', 'yyyyyyyyyyyyy.', 'yryyybyyyryyy.', 'yyyyyyyyyyyyy.'], { y: t, r: '#D8433B', b: '#378ADD' })
    f(27, 8, 1, 8, t, 'it'); f(26, 6, 3, 2, '#D8433B', 'it')
  },
}

// Shared by the strip and the panel. Pure CSS run by the compositor: no redraws,
// no tokens. Reduced motion stops it all.
export const CRAB_CSS = `
.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
.stroll .la,.stroll .lb,.stroll .bd{animation-duration:.9s}.stroll .lb{animation-delay:-.45s}
.run g,.mood{transform-box:fill-box}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
.c-astronaut.run .ant{animation:blink 1s steps(1) infinite}.c-astronaut.run .star{animation:blink .5s steps(1) infinite -.25s}
@keyframes float{50%{transform:translateY(-2px)}}@keyframes blink{50%{opacity:.15}}
.c-detective.run .it{animation:scan 1s steps(1) infinite}.c-detective.run .gl{animation:blink 1s steps(1) infinite -.5s}
@keyframes scan{25%{transform:translate(-1px,1px)}50%{transform:translate(-2px,2px)}75%{transform:translate(-1px,1px)}}
.c-engineer.run .it{transform-origin:100% 100%;animation:twist .5s ease-in-out infinite}
@keyframes twist{50%{transform:rotate(-35deg)}}
.c-chef.run .pan{transform-origin:0 50%;animation:tilt 1s ease-in-out infinite}.c-chef.run .egg{animation:flip 1s ease-in-out infinite}
@keyframes tilt{20%,40%{transform:rotate(-12deg)}}@keyframes flip{30%{transform:translateY(-5px) scaleY(-1)}60%{transform:translateY(0)}}
.c-racer.run .la{animation-duration:.25s}.c-racer.run .lb{animation-duration:.25s;animation-delay:-.125s}
.c-racer.run .flag{transform-origin:0 50%;animation:wave .25s steps(1) infinite}
@keyframes wave{50%{transform:skewY(-12deg) scaleX(.85)}}
.c-pirate.run .it{transform-origin:50% 100%;animation:fence .5s ease-in-out infinite}
@keyframes fence{50%{transform:rotate(25deg)}}
.c-surfer.run .it{transform-origin:50% 100%;animation:tilt 1s ease-in-out infinite}
.c-diver.run .bub{animation:float 1s steps(1) infinite}
.c-wizard.run .star{animation:blink .5s steps(1) infinite -.25s}
.c-dj.run .ph{animation:float .5s steps(1) infinite}.c-dj.run .star{animation:blink .5s steps(1) infinite}
.c-oktoberfest.run .it{transform-origin:0 100%;animation:tilt 1s ease-in-out infinite}
.c-king.run .it{transform-origin:50% 100%;animation:tilt 1s ease-in-out infinite}
.eye{transform-box:fill-box;transform-origin:center;animation:wink 4.7s steps(1) infinite}
@keyframes wink{96%{transform:scaleY(.15)}}
.shrimp{transform-box:fill-box;transform-origin:0 50%}
.nap{transform-origin:50% 100%;animation:breathe 3.2s ease-in-out infinite}
@keyframes breathe{50%{transform:scaleY(.95)}}
.z{opacity:0;animation:zz 3.6s ease-out infinite}.z2{animation-delay:-1.2s}.z3{animation-delay:-2.4s}
@keyframes zz{0%{opacity:0;transform:translate(0,0)}25%{opacity:.85}100%{opacity:0;transform:translate(-5px,-9px)}}
.cheer,.party{animation:hop .55s ease-out 4}
@keyframes hop{35%{transform:translateY(-6px)}70%{transform:translateY(0)}}
.love{animation:hop .8s ease-out 3}
.daze{transform-origin:50% 100%;animation:wob .45s ease-in-out 5}
@keyframes wob{25%{transform:rotate(-7deg)}75%{transform:rotate(7deg)}}
.nervous{animation:shiver .12s steps(2) infinite}
@keyframes shiver{50%{transform:translateX(1px)}}
.stretch{transform-origin:50% 100%;animation:sway 2.4s ease-in-out infinite}
@keyframes sway{25%{transform:rotate(-4deg) scaleY(1.04)}75%{transform:rotate(4deg) scaleY(1.04)}}
.wv{transform-box:fill-box;transform-origin:100% 100%;animation:wave2 .5s ease-in-out infinite}
@keyframes wave2{50%{transform:rotate(-25deg)}}
.mouth{transform-box:fill-box;transform-origin:50% 0;animation:chomp .3s steps(1) infinite}
@keyframes chomp{50%{transform:scaleY(3)}}
.shrimp{animation:nibble 1.2s steps(4) forwards}
@keyframes nibble{to{transform:scaleX(.2);opacity:.3}}
.ball{animation:bounce .5s ease-in-out infinite}
@keyframes bounce{50%{transform:translateY(-7px)}}
.spark{animation:blink .35s steps(1) infinite}.spark2{animation-delay:-.17s}
.cf{animation:fall 1.1s linear infinite}.cf2{animation-delay:-.37s}.cf3{animation-delay:-.73s}
@keyframes fall{0%{transform:translateY(-6px);opacity:1}100%{transform:translateY(16px);opacity:0}}
.drop{animation:drip 1.4s ease-in infinite}
@keyframes drip{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(7px);opacity:0}}
.hrt{opacity:0;animation:rise 1.6s ease-out infinite}.hrt2{animation-delay:-.55s}.hrt3{animation-delay:-1.1s}
@keyframes rise{0%{opacity:0;transform:translateY(4px)}25%{opacity:1}100%{opacity:0;transform:translateY(-10px)}}
.think{animation:blink 2s steps(1) infinite}
:is(.tired,.sweaty) .run :is(.la,.lb,.bd){animation-duration:1s}
:is(.tired,.sweaty) .run .lb{animation-delay:-.5s}
:is(.tired,.sweaty) .mood{transform:translateY(1px)}
.sit{transform:translateY(3px)}
.dig{transform-origin:100% 100%;animation:dg .5s ease-in-out infinite}
@keyframes dg{50%{transform:rotate(5deg) translateY(1px)}}
.build{transform-origin:50% 100%;animation:dg .8s ease-in-out infinite}
.pat{transform-box:fill-box;animation:pt .4s steps(2) infinite}
@keyframes pt{50%{transform:translateY(2px)}}
.sf{animation:sfly .6s ease-out infinite}.sf2{animation-delay:-.2s}.sf3{animation-delay:-.4s}
@keyframes sfly{0%{transform:translate(0,0);opacity:1}100%{transform:translate(5px,-8px);opacity:0}}
.yawn{transform-origin:50% 100%;animation:yw 2.5s ease-in-out infinite}
@keyframes yw{40%,70%{transform:scaleY(1.06)}}
.ym{transform-box:fill-box;transform-origin:50% 0;animation:ymo 2.5s ease-in-out infinite}
@keyframes ymo{0%,100%{transform:scaleY(.3)}40%,70%{transform:scaleY(1)}}
.sneeze{transform-origin:50% 100%;animation:snz 1.4s ease-in forwards}
@keyframes snz{55%{transform:scale(1.04,.92)}62%{transform:translateX(3px) scale(.96,1.05)}80%,100%{transform:none}}
.spray{opacity:0;animation:spr 1.4s steps(1) forwards}
@keyframes spr{60%{opacity:1}90%{opacity:0}}
.dance{transform-origin:50% 100%;animation:dnc .6s ease-in-out infinite}
@keyframes dnc{25%{transform:rotate(-8deg) translateY(-1px)}75%{transform:rotate(8deg) translateY(-1px)}}
.sway{transform-origin:50% 100%;animation:sway 2.4s ease-in-out infinite}
.note{opacity:0;animation:rise 1.6s ease-out infinite}.note2{animation-delay:-.8s}
.duck{transform-origin:50% 100%;transform:scaleY(.78)}
.peek{transform-origin:50% 100%;transform:rotate(6deg)}
.hic{animation:hc 1s ease-out infinite}
@keyframes hc{20%{transform:translateY(-3px)}45%{transform:none}}
.notice{animation:hc .5s ease-out 1}
.chase{animation:hc .55s ease-in-out infinite}
.kick{transform-origin:0 100%;animation:kk .7s ease-out forwards}
@keyframes kk{40%{transform:rotate(-8deg) translateY(-2px)}100%{transform:none}}
.held{animation:bob .9s steps(1) infinite}
.pr-swing{transform-box:fill-box;transform-origin:50% 100%;animation:swing .45s ease-in-out infinite}
@keyframes swing{50%{transform:rotate(-40deg)}}
.pr-read{animation:bob 1.2s steps(1) infinite}
.pr-scan{animation:scan 1s steps(1) infinite}
.pr-tap rect+rect{animation:blink .3s steps(1) infinite}
.umb{animation:bob 1.1s steps(1) infinite}
.dust{animation:dst .5s ease-out infinite}.dust2{animation-delay:-.25s}
@keyframes dst{0%{opacity:.9;transform:translate(0,0)}100%{opacity:0;transform:translate(-7px,-3px)}}
.oar{transform-box:fill-box;transform-origin:50% 0;animation:oar 1.2s ease-in-out infinite}
@keyframes oar{50%{transform:rotate(24deg)}}
.boom{transform-box:fill-box;transform-origin:0 100%;animation:boom 2.4s ease-in-out infinite}
@keyframes boom{50%{transform:rotate(9deg)}}
.flame{transform-box:fill-box;transform-origin:50% 0;animation:flm .16s steps(2) infinite}
@keyframes flm{50%{transform:scaleY(.6)}}
.sunk{opacity:.6}
`

export type CrabLook = {
  tiredness?: Tiredness
  isGrumpy?: boolean
  isHungry?: boolean
  hasNightcap?: boolean
  /** Evening or night: the car's headlights are on. */
  isDark?: boolean
}

const HEART = ['.r.r.', 'rrrrr', '.rrr.', '..r..']

const heart = (x: number, y: number, cls: string): string =>
  `<g class="${cls}" fill="#E8577A">${HEART.flatMap((row, dy) => [...row].map((c, dx) => (c === 'r' ? `<rect x="${x + dx}" y="${y + dy}" width="1" height="1"/>` : ''))).join('')}</g>`

const dropSvg = (x: number, y: number, cls = 'drop'): string =>
  `<g class="${cls}" fill="#7EC8F0"><rect x="${x}" y="${y}" width="1.5" height="1.5"/><rect x="${x - 0.5}" y="${y + 1.5}" width="2.5" height="2"/></g>`

const SHUT: ReadonlySet<Pose> = new Set(['nap', 'yawn', 'duck', 'sneeze', 'love'])
const BRIGHT: ReadonlySet<Pose> = new Set(['cheer', 'party', 'eat', 'play', 'dance', 'notice', 'gaze', 'wink'])
const SEATED: ReadonlySet<Pose> = new Set(['sit', 'sun', 'skywatch', 'muse'])

const eyesFor = (pose: Pose, tiredness: Tiredness): EyePair => {
  if (SHUT.has(pose)) return 'shut'
  if (pose === 'daze') return 'x'
  if (pose === 'skywatch') return 'up'
  if (pose === 'gaze' || pose === 'muse') return 'front'
  if (pose === 'wink') return ['shut', 'front']
  if (pose === 'notice') return 'wide'
  if (tiredness !== 'fresh' && !BRIGHT.has(pose)) return 'half'
  return pose === 'look' || pose === 'peek' || pose === 'chase' ? 'side' : 'open'
}

const isMoving = (pose: Pose): boolean => pose === 'work' || pose === 'play' || pose === 'wander' || pose === 'chase' || pose === 'carry'
const isStrolling = (pose: Pose): boolean => pose === 'wander' || pose === 'chase' || pose === 'carry'

const HIDE_SHELL = ['....dddddd....', '..ddppwwppdd..', '.dpwwpppwwppd.', 'dpwppwwwppwpwd', 'dppwppppwppwpd', 'dpwppwwppwppwd', '.ddddddddddddd.']
const SHELL_INK: Record<string, string> = { p: '#F2B8A0', w: '#FBE3D6', d: '#D98E73' }

const note = (x: number, y: number, cls: string): string =>
  `<g class="${cls}" fill="#7F77DD"><rect x="${x + 2}" y="${y}" width="1" height="5"/><rect x="${x + 2}" y="${y}" width="3" height="1"/><rect x="${x}" y="${y + 4}" width="3" height="2"/></g>`

/**
 * One crab in its own 30x28 grid, facing right, with the pose's pixels and effects.
 * The caller places and scales it. Effects that read as text (Zs, "!", "?") are left
 * to `overlay`, drawn by the caller outside any mirroring.
 */
export const crab = (costume: Costume, pose: Pose, look: CrabLook = {}): string => {
  const tiredness = look.tiredness ?? 'fresh'
  if (pose === 'hide') {
    // Tucked under a shell, only the eyes peeking out.
    const cells = HIDE_SHELL.flatMap((row, dy) => [...row].map((c, dx) => (SHELL_INK[c] ? `<rect x="${2 + dx * 2}" y="${12 + dy * 2}" width="2" height="2" fill="${SHELL_INK[c]}"/>` : ''))).join('')
    return `<g class="${tiredness}"><g class="mood hidep">${cells}<rect x="9" y="10" width="2" height="2" fill="${CLAY}"/><rect x="19" y="10" width="2" height="2" fill="${CLAY}"/><rect class="eye" x="9" y="8" width="2" height="2" fill="${INK}"/><rect class="eye" x="19" y="8" width="2" height="2" fill="${INK}"/></g></g>`
  }
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (x, y, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  const shown: Costume = look.hasNightcap ? 'plain' : costume
  DRAW[shown](f, ACCENT[shown], eyesFor(pose, tiredness))
  if (look.hasNightcap) {
    stamp(f, 6, 3, ['..........bbbbb.', '.......bbbbbbbbbw', '....bbbbbbbbbbb.w', '..bbbbbbbbbbbb...', 'wwwwwwwwwwwwwwww'], { b: '#5B6FB5', w: '#F4F3EE' })
  }
  if (look.isGrumpy && pose !== 'nap' && pose !== 'love' && pose !== 'gaze' && pose !== 'wink') {
    f(8, 10, 3, 1, INK); f(19, 10, 3, 1, INK); f(10, 11, 1, 1, INK); f(19, 11, 1, 1, INK)
  }
  if (pose === 'cool' || pose === 'sun') {
    f(7, 11, 5, 3, INK, 'sh'); f(17, 11, 5, 3, INK, 'sh'); f(12, 11, 5, 1, INK, 'sh'); f(8, 11, 1, 1, '#ffffff', 'sh')
  }
  if (pose === 'gaze' || pose === 'wink') {
    f(7, 15, 2, 1, '#F2A0A0'); f(21, 15, 2, 1, '#F2A0A0')
  }
  if (pose === 'wave' || pose === 'wink') {
    f(4, 9, 2, 5, CLAY, 'wv'); f(2, 5, 4, 4, CLAY, 'wv')
  }
  if (pose === 'stretch' || pose === 'dance' || pose === 'carry') {
    f(4, 9, 2, 5, CLAY, 'st'); f(2, 5, 4, 4, CLAY, 'st'); f(24, 9, 2, 5, CLAY, 'st'); f(24, 5, 4, 4, CLAY, 'st')
  }
  if (pose === 'sway') {
    f(24, 9, 2, 5, CLAY, 'st'); f(24, 5, 4, 4, CLAY, 'st')
  }
  if (pose === 'carry') stamp(f, 9, 0, ['...ppp...', '.ppwpwpp.', 'pwpwpwpwp', 'ddddddddd'], { p: '#F2B8A0', w: '#FBE3D6', d: '#D98E73' }, 'held')
  if (pose === 'dig' || pose === 'build') f(23, 19, 4, 3, CLAY, 'pat')
  if (pose === 'yawn') f(13, 16, 4, 3, INK, 'ym')
  if (pose === 'eat') {
    f(13, 17, 4, 1, INK, 'mouth')
    f(25, 11, 4, 2, '#F28C6A', 'shrimp'); f(29, 10, 1, 1, '#F28C6A', 'shrimp'); f(29, 13, 1, 1, '#F28C6A', 'shrimp')
  }
  const group = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const ride = pose === 'ride' ? gadgetOf(shown, look.isDark) : null
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb' && !(ride?.bare && k === 'it'))
  const body = `<g class="bd">${(groups.get('bd') ?? []).join('')}${props.map(group).join('')}</g>`
  const legs = SEATED.has(pose) ? '' : `${group('la')}${group('lb')}`
  // On its gadget: the gadget behind it, the crab (or just its legs, or nothing), the gadget in front.
  if (ride) {
    const me = ride.hideCrab ? '' : `<g transform="translate(0,${ride.dy ?? 0})">${body}${ride.legs ? legs : ''}</g>`
    return `<g class="${tiredness}"><g class="mood ride"><g class="c-${shown} run">${ride.back}${me}${ride.front}</g></g></g>`
  }

  const fx: string[] = []
  if (pose === 'cheer') fx.push(`<g fill="#F5C542"><rect class="spark" x="-6" y="4" width="2" height="2"/><rect class="spark spark2" x="-12" y="12" width="2" height="2"/><rect class="spark spark2" x="-3" y="18" width="2" height="2"/></g>`)
  if (pose === 'daze') fx.push(`<g fill="#B4B2A9"><rect class="spark" x="-5" y="3" width="2" height="2"/><rect class="spark spark2" x="-10" y="8" width="2" height="2"/></g>`)
  if (pose === 'party') {
    const bits = [['#F5C542', -16, 0], ['#7F77DD', -9, -2], ['#1D9E75', -2, 1], ['#D85A30', 7, -1], ['#378ADD', 15, 0], ['#F5C542', 22, -2]] as const
    fx.push(bits.map(([c, dx, dy], i) => `<rect class="cf cf${(i % 3) + 1}" x="${dx}" y="${dy}" width="2" height="2" fill="${c}"/>`).join(''))
  }
  if (pose === 'nervous') fx.push(dropSvg(-3, 6))
  if (tiredness === 'sweaty' && pose !== 'nervous' && pose !== 'nap') fx.push(dropSvg(5, 3))
  if (pose === 'wave') fx.push(`<g fill="#F5C542"><rect class="spark" x="-8" y="2" width="2" height="2"/><rect class="spark spark2" x="-12" y="7" width="2" height="2"/></g>`)
  if (pose === 'love') fx.push(heart(4, -2, 'hrt'), heart(13, -5, 'hrt hrt2'), heart(21, -1, 'hrt hrt3'))
  if (pose === 'play') fx.push(`<circle class="ball" cx="37" cy="22" r="3.5" fill="#E85D75"/><rect class="ball" x="35.5" y="20.5" width="1.5" height="1.5" fill="#fff" opacity=".7"/>`)
  if (pose === 'dig' || pose === 'build') fx.push(`<g fill="#D9C493"><rect class="sf" x="27" y="22" width="2" height="1"/><rect class="sf sf2" x="29" y="23" width="1" height="1"/><rect class="sf sf3" x="25" y="21" width="2" height="1"/></g>`)
  if (pose === 'sneeze') fx.push(`<g class="spray" fill="#BFE3F5"><rect x="29" y="14" width="1" height="1"/><rect x="31" y="16" width="1" height="1"/><rect x="30" y="18" width="1" height="1"/><rect x="33" y="15" width="1" height="1"/></g>`)
  if (pose === 'dance') fx.push(note(-7, 2, 'note'), note(29, -2, 'note note2'))
  if (look.isHungry && pose !== 'eat' && pose !== 'nap' && pose !== 'dig') {
    fx.push(`<g class="think"><rect x="-2" y="6" width="2" height="2" fill="#B4B2A9"/><rect x="-6" y="2" width="3" height="3" fill="#B4B2A9"/><rect x="-14" y="-6" width="9" height="7" rx="2" fill="#F4F3EE" stroke="#B4B2A9" stroke-width=".6"/><rect x="-12" y="-3" width="4" height="2" fill="#F28C6A"/><rect x="-8" y="-4" width="1" height="1" fill="#F28C6A"/></g>`)
  }

  const moodCls = `${pose === 'work' || pose === 'wander' ? '' : pose}${SEATED.has(pose) ? ' sit' : ''}`
  const gait = isMoving(pose) ? ` run${isStrolling(pose) ? ' stroll' : ''}` : ''
  return `<g class="${tiredness}"><g class="mood ${moodCls}"><g class="c-${shown}${gait}">${body}${legs}</g>${fx.join('')}</g></g>`
}

/** What reads as text above the crab (Zs, "!", "?", a thought), in the strip's own frame. */
export const overlay = (pose: Pose): string => {
  if (pose === 'nap') return zzz(32, 4)
  if (pose === 'notice') return `<g fill="#E8577A"><rect x="12" y="-9" width="2" height="5"/><rect x="12" y="-3" width="2" height="2"/></g>`
  if (pose === 'peek') {
    return `<g fill="#7F77DD">${['.ww.', 'w..w', '...w', '..w.', '..w.', '....', '..w.'].flatMap((row, dy) => [...row].map((c, dx) => (c === 'w' ? `<rect x="${20 + dx}" y="${dy - 9}" width="1" height="1"/>` : ''))).join('')}</g>`
  }
  if (pose === 'muse') return `<g class="think" fill="#B4B2A9"><rect x="9" y="-3" width="1.5" height="1.5"/><rect x="12" y="-4" width="1.5" height="1.5"/><rect x="15" y="-5" width="1.5" height="1.5"/></g>`
  return ''
}

/** A tiny umbrella in its other claw for rainy days, in the crab's own grid. */
export const umbrellaSvg = (): string =>
  `<g class="umb"><rect x="4.5" y="2" width="1" height="13" fill="#3A3936"/><rect x="3.5" y="14" width="1" height="1.5" fill="#3A3936"/>${['....pppp....', '..pppppppp..', '.pppwppppwpp.', 'pppppppppppp'].flatMap((row, dy) => [...row].map((c, dx) => (c === '.' ? '' : `<rect x="${dx - 1}" y="${dy - 2}" width="1" height="1" fill="${c === 'w' ? '#A9A4E8' : '#7F77DD'}"/>`))).join('')}</g>`

/** A tool prop in its claw, in the crab's own grid, mirroring what Claude is doing. */
export const propSvg = (prop: Prop): string => {
  switch (prop) {
    case 'scroll':
      return `<g class="pr-read"><rect x="24" y="9" width="7" height="6" fill="#F4E4BC"/><rect x="23.5" y="8.5" width="8" height="1.2" fill="#C9AE7A"/><rect x="23.5" y="14.3" width="8" height="1.2" fill="#C9AE7A"/><rect x="25" y="11" width="5" height=".6" fill="#9C8559"/><rect x="25" y="12.6" width="4" height=".6" fill="#9C8559"/></g>`
    case 'magnifier':
      return `<g class="pr-scan"><rect x="25.5" y="11" width="1.3" height="5" fill="#7A4A26"/><circle cx="27.5" cy="8.5" r="2.8" fill="rgba(169,214,245,.75)" stroke="#3A3A3C" stroke-width="1"/><rect x="26.4" y="7.2" width="1" height="1" fill="#fff"/></g>`
    case 'hammer':
      return `<g class="pr-swing"><rect x="26" y="7" width="1.4" height="9" fill="#8A5A2B"/><rect x="24" y="5.4" width="6" height="2.6" fill="#8E929A"/></g>`
    case 'keyboard':
      return `<g class="pr-tap"><rect x="18" y="19" width="13" height="3.4" rx=".6" fill="#3A3936"/><rect x="19" y="19.7" width="11" height=".7" fill="#BDB6A8"/><rect x="19" y="21" width="11" height=".7" fill="#BDB6A8"/></g>`
    case 'binoculars':
      return `<g><rect x="7.5" y="10" width="5" height="4" fill="#3A3A3C"/><rect x="17.5" y="10" width="5" height="4" fill="#3A3A3C"/><rect x="12.5" y="11" width="5" height="1.4" fill="#3A3A3C"/><rect x="8.5" y="11" width="1.5" height="1.5" fill="#9FD3F5"/><rect x="18.5" y="11" width="1.5" height="1.5" fill="#9FD3F5"/></g>`
    case 'whistle':
      return `<g><rect x="23" y="15" width="4" height="2" fill="#F5C542"/><rect x="26.5" y="14.5" width="1.5" height="3" fill="#C99A1E"/>${note(30, 6, 'note')}</g>`
  }
}

// The nap's Zs, drawn by the caller outside any mirroring.
export const zzz = (x: number, y: number): string =>
  `<g class="zs" font-family="-apple-system,'SF Pro Text',sans-serif" font-weight="700"><text class="z" x="${x}" y="${y}" font-size="7">z</text><text class="z z2" x="${x - 4}" y="${y - 2}" font-size="8.5">z</text><text class="z z3" x="${x - 8}" y="${y - 4}" font-size="10">Z</text></g>`

const SCALE = 0.86
export const W = 58
export const H = 28

// A single crab at the right edge of a small box: the panel's and the preview's.
export const crabSvg = (costume: Costume, mood: Pose, tiredness: Tiredness = 'fresh'): string => {
  const x0 = W - 30 * SCALE
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${CRAB_CSS}.z{fill:#8a8a86}
@media (prefers-reduced-motion: reduce){*{animation:none!important}.z{opacity:.6}}</style>${mood === 'nap' ? zzz(x0 - 2, 14) : ''}
<g transform="translate(${x0},1) scale(${SCALE})" shape-rendering="crispEdges">${crab(costume, mood, { tiredness })}</g>
</svg>`
}
