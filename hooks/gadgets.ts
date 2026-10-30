// What each costume rides. Pixel rows in the crab's own 30x28 grid, facing right, the
// ground at row 26. A gadget may run past the grid; keep its middle near column 15,
// where the crab turns around. In the rows a letter is a colour from INK and `.` is empty.

import type { Costume } from './sprites'

const INK: Record<string, string> = {
  g: '#1D9E75', G: '#0F6E56', w: '#F4F3EE', k: '#1F1E1D', s: '#C9CCD2', S: '#8E929A', b: '#A9D6F5', y: '#F5C542', Y: '#F5D96A',
  r: '#D8433B', R: '#E8577A', o: '#F28C3A', h: '#6B4423', m: '#5A3519', n: '#7A4A26', p: '#534AB7', B: '#378ADD', d: '#3A3936',
  a: '#A0703F', f: '#F5B731', l: '#5B8FD9', q: '#D85A30', C: '#D97757', x: '#5F5E5A', t: '#6BB8D6', e: '#E8E5DD',
  u: '#C8B68C', z: '#3E8FB0', A: '#C99A1E', D: '#9E2F2A',
}

type Art = readonly [x: number, y: number, rows: readonly string[], cls?: string]
type Spec = {
  back?: readonly Art[]
  front: readonly Art[]
  /** The gadget is all you see: the crab is inside it. */
  hideCrab?: boolean
  /** Its legs still show. */
  legs?: boolean
  /** Lays down what it carries, such as a surfboard under a claw. */
  bare?: boolean
  /** Moves the crab up (negative) in the gadget. */
  dy?: number
}
export type Gadget = { back: string; front: string; hideCrab?: boolean; legs?: boolean; bare?: boolean; dy?: number }

/** A big wheel, 8 rows, and a hub that flickers as it spins. */
const wheel = (x: number, y: number): Art => [x, y, ['..xxxx..', '.xxxxxx.', 'xxssssxx', 'xxsddsxx', 'xxsddsxx', 'xxssssxx', '.xxxxxx.', '..xxxx..']]
const spin = (x: number, y: number): Art => [x + 2, y + 2, ['s..s', '....', '....', 's..s'], 'spark']

const SPECS: Record<Costume, Spec> = {
  racer: {
    front: [
      [-9, 15, [
        '..........ggggg',
        '......ggggggggggg',
        '...ggGGgGGgGGgggggggggggggggggggggggggggggg',
        '.gggggggggggggggggggggggggggggggggggggggggggggg',
        'rrggggggggggwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwyy',
        'rrgggggggggggggggggggggggggggggggggggggggggggggggg',
        'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
        '.GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
      ]],
      [27, 13, ['bb', 'bbb', '.bbb', '..bbb']],
      wheel(-5, 18), spin(-5, 18),
      wheel(27, 18), spin(27, 18),
      [-14, 23, ['uu', 'uuu'], 'dust'],
      [-12, 21, ['uu'], 'dust dust2'],
    ],
  },
  surfer: {
    bare: true,
    legs: true,
    dy: -3,
    back: [[-46, -13, [
      '..........................................ttttbbbb',
      '.......................................tttttttwwwbbbb',
      '.....................................ttttttttwwwwwwwbbbb',
      '...................................ttttttttttwwwwwwwwwwbbb',
      '.................................tttttttttttttwwwwttwwwwwbbb',
      '................................tttttttttttttttt....ttwwwwwbb',
      '..............................ttttttttttttttttt........twwwwbbb',
      '.............................ttttttttttttttttt..........twwwbb',
      '............................ttttttttttttttttt..............wwwb',
      '...........................tttttttttttttttt...................bbb',
      '..........................ttttttttttttttttt....................bb',
      '........................zzzztttttttttttttttt',
      '.......................zzzzzzttttttttttttttt',
      '.....................zzzzzzzzttttttttttttttt',
      '....................zzzzzzzzzztttttttttttttt',
      '...................zzzzzzzzzzzttttttttttttttt',
      '..................zzzzzzzzzzzzztttttttttttttt',
      '................zzzzzzzzzzzzzzzttttttttttttttt',
      '...............zzzzzzzzzzzzzzzzztttttttttttttt',
      '..............zzzzzzzzzzzzzzzzzzttttttttttttttt',
      '.............zzzzzzzzzzzzzzzzzzzztttttttttttttt',
      '............zzzzzzzzzzzzzzzzzzzzzztttttttttttttt',
      '............zzzzzzzzzzzzzzzzzzzzzzttttttttttttttt',
      '.........zzzzzzzzzzzzzzzzzzzzzzzzzzttttttttttttttt',
      '.........zzzzzzzzzzzzzzzzzzzzzzzzzzttttttttttttttttt',
      '........zzzzzzzzzzzzzzzzzzzzzzzzzzzzttttttttttttttttttt',
      '........zzzzzzzzzzzzzzzzzzzzzzzzzzzzttttttttttttttttttttttt',
      '......zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzttttttttttttttttttttttttttt',
      '......zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzttttttttttttttttttttttttttttttt',
      '....zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzttttttttttttttttttttttttttttttttt',
      '....zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzttttttttttttttttttttttttttttttttttt',
      '...zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzztttttttttttttttttttttttttttttttttttt',
      '...zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzttttttttttttttttttttttttttttttttttttt',
      '..zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzztttttttttttttttttttttttttttttttbb',
      '.zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzztttttttttttttttttttttttttttttttbbww',
      '.zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzztttttttttttttttttttttttttttttttbbww',
      'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzztttttttttttttttttttttttttttttttbbw',
      'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzttttttttttttttttttttttttttttttbb',
      'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzttttttttttttttttttttttttttttb',
    ]]],
    front: [
      [-1, 22, [
        '..............................wwww',
        '.wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
        'wwBBBBBBBBBBBBBBBBBBBBBBBBBBBBBww.',
        '.wwwwwwwwwwwwwwwwwwwwwwwwwwwww....',
      ]],
      [31, 15, ['..w', '.w.w', 'w..w.w'], 'spark'],
      [33, 18, ['w.w', '...', '.w.'], 'spark spark2'],
    ],
  },
  diver: {
    hideCrab: true,
    front: [
      [17, 0, ['xxxxxss', 'xxxxxss', 'xx.....', 'xx.....', 'xx.....', 'xx.....']],
      [9, 6, [
        '...yyyyyyyyy....',
        '..yyyyyyyyyyy...',
        '..yyyyyyyyyyy...',
        '..yyyyyyyyyyy...',
        '..AAAAAAAAAAA...',
      ]],
      [-1, 11, [
        '.......yyyyyyyyyyyyyyyyy.......',
        '....yyyyyyyyyyyyyyyyyyyyyyyy...',
        '..yyyyyyyyyyyyyyyyyyyyyyyyyyyy.',
        '.yyyyyyyyyyyyyddddddddyyyyyyyyy',
        'yyyyyyyyyyyyydbbbbbbbbdyyyyyyyy',
        'yyyyyyyyyyyyydbCCCCCbbdyyyyyyyy',
        'yyyyyyyyyyyyydbCkkCCbbdyyyyyyyy',
        'yyyyyyyyyyyyydbCkkCCbbdyyyyyyyy',
        'yyyyyyyyyyyyydbCCCCCbbdyyyyyyyy',
      ]],
      [-1, 20, [
        'yyyyyyyyyyyyydbbbbbbbbdyyyyyyyy',
        '.yyyyyyyyyyyyyddddddddyyyyyyyyy',
        '.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        '..AAAAAAAAAAAAAAAAAAAAAAAAAAAA.',
        '...AAAAAAAAAAAAAAAAAAAAAAAAAA..',
        '.....AAAAAAAAAAAAAAAAAAAAAA....',
      ], 'sunk'],
      [-5, 14, ['x...', 'xx..', 'xxxx', 'xxxx', 'xx..', 'x...']],
      [-4, 19, ['ww.www...ww..www..wwww..www..ww']],
    ],
  },
  viking: {
    back: [
      [14, -13, Array<string>(23).fill('mm')],
      [1, -13, ['mmmmmmmmmmmmmmmmmmmmmmmmmmmmm']],
      [2, -12, [
        ...Array<string>(14).fill('rrrYYYrrrYYYrrrYYYrrrYYYrrr'),
        '.rrYYYrrrYYYrrrYYYrrrYYYrr.',
        '..rrrrrrrrrrrrrrrrrrrrrrr..',
        '..rrrrrrrrrrrrrrrrrrrrrrr..',
      ]],
    ],
    front: [
      [-10, 8, [
        'hhh',
        'hhhh',
        '.hhh',
        '.hhhh',
        '..hhh',
        '..hhhh',
        '...hhh',
        '...hhhh',
        '...hhhhh',
      ]],
      [31, 3, [
        '......yy.y..',
        '.....hhhhh..',
        '....hhyhhhhh',
        '....hhhhhhhh',
        '....hhh.hh..',
        '...hhh..hhh.',
        '...hhh......',
        '..hhh.......',
        '..hhh.......',
        '..hhhh......',
        '...hhhh.....',
        '....hhhh....',
        '....hhhh....',
        '...hhhh.....',
      ]],
      [-7, 17, [
        'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
        'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
        '.mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
        '.hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
        '..hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
        '...mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
        '.....hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
        '........hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
        '...........hhhhhhhhhhhhhhhhhhhhhhhhhh',
      ]],
      [0, 15, [
        '.yyy..rrr..BBB..yyy..rrr..BBB.',
        'yyyyyrrrrrBBBBByyyyyrrrrrBBBBB',
        'yyyyyrrrrrBBBBByyyyyrrrrrBBBBB',
        '.yyy..rrr..BBB..yyy..rrr..BBB.',
      ]],
      [3, 19, ['..aa', '..aa', '..aa', '.aa.', '.aa.', 'aaa.', 'aaa.', 'aaa.'], 'oar'],
    ],
  },
  wizard: {
    dy: -3,
    legs: true,
    front: [
      [-22, 12, [
        '..........yyy',
        '.....yyyyyyyy',
        '..yyyyyyyyyyyy',
        'yyyyyyyyyyyyyfhh',
        'ffyyyyyyyyyyyfhh',
        '.yfyyyyyyyyyyfhh',
        '..ffffyyyyyyyy',
        '.....fffffyyy',
        '..........fff',
      ]],
      [-7, 14, [
        '..............................nnnnnnnnnnnn',
        '..............nnnnnnnnnnnnnnnnnnnnnnnnnnnn',
        'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
        'nnnnnnnnnnnnnnnn',
      ]],
      [-27, 10, ['yy', 'yy'], 'spark'],
      [-30, 16, ['ww', 'ww'], 'spark spark2'],
      [-27, 22, ['yy', 'yy'], 'spark'],
      [-34, 12, ['yy'], 'spark spark2'],
    ],
  },
  dj: {
    front: [
      [-4, 16, [
        ...Array<string>(7).fill('ssssssssssssssssssssssssssssssssssssss'),
        ...Array<string>(3).fill('SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS'),
      ]],
      ...[-3, 18].map((x): Art => [x, 16, [
        '...kkkkkkkkk...',
        '.kkkkkkkkkkkkk.',
        'kkkkkqqqqqkkkkk',
        'kkkkkqqyqqkkkkk',
        '.kkkkkkkkkkkkk.',
        '...kkkkkkkkk...',
      ]]),
      ...[-3, 18].flatMap((x): Art[] => [[x + 2, 18, ['ww'], 'spark'], [x + 11, 19, ['ww'], 'spark spark2']]),
      [12, 16, ['dd.dd', 'dd.dd', '.....', 'yy.RR', 'yy.RR']],
      [-2, 23, ['BB.yy.RR.gg', 'BB.yy.RR.gg']],
      [24, 23, ['ddddddddd', 'ddddddddd']],
    ],
  },
  astronaut: {
    hideCrab: true,
    front: [
      [5, -9, [
        '.........rr',
        '.........rr',
        '........rrrr',
        '........rrrr',
        '.......rrrrrr',
        '.......rrrrrr',
        '......rrrrrrrr',
        '......rrrrrrrr',
        '.....DrrrrrrrrD',
        '.....Srwwwwwwws',
      ]],
      [8, 1, [
        'SwwwwwwwwwwssS',
        'SwwwwwwwwwwssS',
        'SwwddddddwwssS',
        'SwdbbbbbbdwssS',
        'SwdbCCCbbdwssS',
        'SwdCkkCbbdwssS',
        'SwdCkkCbbdwssS',
        'SwdbCCbbbdwssS',
        'SwdbbbbbbdwssS',
        'SwwddddddwwssS',
        'SwwwwwwwwwwssS',
        'SwwwwwwwwwwssS',
        'rrrrrrrrrrrrDD',
        'rrrrrrrrrrrrDD',
        'SwwwwwwwwwwssS',
        'SwwwwwwwwwwssS',
        'SwwwwwwwwwwssS',
        'SwwwwwwwwwwssS',
        'SwwwwwwwwwwssS',
        'SwwwwwwwwwwssS',
      ]],
      [3, 15, [
        '....rr............rr',
        '...rrr............rrr',
        '...rrr............rrr',
        '..rrrr............rrrr',
        '..rrrr............rrrr',
        '.rrrrr............rrrrr',
        '.rrrrr............rrrrr',
        'rrrrrr............rrrrrr',
        'rrrr................rrrr',
        'rrr..................rrr',
        'rr....................rr',
      ]],
      [10, 21, ['xxxxxxxxxx', '.xxxxxxxx.', '.xxxxxxxx.']],
      [11, 24, ['ooyyyyoo', 'ooyyyyoo', 'ooyYYyoo', '.oyYYyo.', '.oyyyyo.', '..oyyo..', '..oyyo..', '...oo...'], 'flame'],
    ],
  },
  detective: {
    bare: true,
    legs: true,
    front: [
      [4, 10, [
        'SxxxxxxwxxxxwxxxxxxxxS',
        'SxxxxxxwxxxxwxxxxxxxxS',
        'Swww....wwwwww....wwwS',
        'Swww....wwwwww....wwwS',
        'Swww....wwwwww....wwwS',
        'SwwwwwwwwwSSwwwwwwwwwS',
        'SxxxxxxxxwSSwssssssswS',
        'SwwwwwwwwwSSwssssssswS',
        'SxxxxxxxxwSSwssssssswS',
        'SwwwwwwwwwSSwssssssswS',
        'SxxxxxxxxwSSwwwwwwwwwS',
        'SSSSSSSSSSSSSSSSSSSSSS',
      ]],
      [2, 14, ['CCCC', 'CCCC', 'CCCC', 'CCCC']],
      [24, 14, ['CCCC', 'CCCC', 'CCCC', 'CCCC']],
    ],
  },
  engineer: {
    bare: true,
    back: [[3, 3, Array<string>(13).fill('bbbbbbbbbbbbbbbbbbbbbbbb')]],
    front: [
      [-8, 9, [
        'yyyyyyyyyyy',
        'yyyyyyyyyyy',
        'yyyyyyyyyyy',
        'AAAAAAAAAAA',
        'yyyyyyyyyyy',
        'yyyyyyyyyyy',
      ]],
      [1, 0, [
        'yyyyyyyyyyyyyyyyyyyyyyyyyyyy',
        'yyyyyyyyyyyyyyyyyyyyyyyyyyyy',
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ]],
      [1, 3, Array<string>(13).fill('yy........................yy')],
      [-8, 15, [
        'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
        'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
        'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ]],
      [-8, 19, [
        '...dddddddddddddddddddddddddddddddddd...',
        '.dddddddddddddddddddddddddddddddddddddd.',
        'dddSSSdddSSSdddSSSdddSSSdddSSSdddSSSdddd',
        'dddSSSdddSSSdddSSSdddSSSdddSSSdddSSSdddd',
        'dddSSSdddSSSdddSSSdddSSSdddSSSdddSSSdddd',
        '.dddddddddddddddddddddddddddddddddddddd.',
        '...dddddddddddddddddddddddddddddddddd...',
      ]],
      [28, -5, [
        '........yyyy.......',
        '.......yyyyyy......',
        '.......yyyyyyy.....',
        '......yyyyyyyy.....',
        '......yyy.yyyy.....',
        '.....yyyy..yyyy....',
        '.....yyy....yyy....',
        '....yyyy....yyyy...',
        '....yyy......yyy...',
        '...yyyy......yyyy..',
        '...yyy........yyy..',
        '..yyyy........yyy..',
        '..yyy.........yyy..',
        '.yyyy.........xxx..',
        '.yyy.......SSSSSSSS',
        'yyyy......SSSSSSSSS',
        'yyy.......SSSSSSSSS',
        '...........SSSSSSS.',
        '.............SSSS..',
        '...........S.S.S...',
      ], 'boom'],
    ],
  },
  chef: {
    legs: true,
    front: [
      [29, 3, [
        '.rrrrrrrrrrrrrrrrrrrr.',
        'rrrrrrrrrrrrrrrrrrrrrr',
        'rrrrwwwrrrwwwrrrwwwrrr',
        'rrrrwwwrrrwwwrrrwwwrrr',
        'rrrrwwwrrrwwwrrrwwwrrr',
        'r.r.w.w.r.r.w.w.r.r.r.',
      ]],
      [31, 9, Array<string>(6).fill('aa............aa')],
      [35, 11, ['.xxxxx.', 'xxxxxxx', 'xxxxxxx', 'xxxxxxx']],
      [26, 13, ['nnnnn']],
      [29, 15, [
        'aaaaaaaaaaaaaaaaaaaaaa',
        'aaaaaaaaaaaaaaaaaaaaaa',
        '.lllllllllllllllllllll',
        '.lllllllllllllllllllll',
        '.lwwlwwlwwlwwlwwlwwll.',
        '.lwwlwwlwwlwwlwwlwwll.',
        '.lllllllllllllllllllll',
      ]],
      wheel(30, 18),
      wheel(40, 18),
    ],
  },
  pirate: {
    legs: true,
    front: [
      [29, 8, [
        '.................ddd',
        '..............xxxxxx',
        '...........xxxxxxxxx',
        '.........xxsssxxxxxd',
        '.......xxxxsssxxxddd',
        '.....xxxxxsssxxxddd.',
        '...xxxxxxsssxxxddd..',
        'dxxxxxxsssxxxddd....',
        'dxxxxxsssxxxdd......',
        '.dxxxxxxxddd........',
        '..dddddd............',
      ]],
      [27, 15, ['r', 'y'], 'spark'],
      [28, 17, [
        '...nnnnnnnnnnnnnnn',
        '..nnnnnnnnnnnnnnnnnn',
        '.nnnnnnnnnnnnnnnnnnnn',
        'nnnnnnnnnnnnnnnnnnnnnn',
        'hhhhhhhhhhhhhhhhhhhhhh',
      ]],
      ...[30, 41].map((x): Art => [x, 19, ['..mmmm..', '.mmmmmm.', 'mmaaaamm', 'mmaaaamm', 'mmaaaamm', '.mmmmmm.', '..mmmm..']]),
    ],
  },
  plain: {
    legs: true,
    dy: -4,
    front: [
      [1, 21, [
        'BB..........................BB',
        'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        '.BBBBBBBBBBBBBBBBBBBBBBBBBBBB.',
      ]],
      [5, 24, ['yyyy............yyyy', 'yyyy............yyyy']],
    ],
  },
  ghost: {
    back: [[5, 5, [
      '.....SSSSSSSSSS.....',
      '...SSSSSSSSSSSSSS...',
      '..SSSSSSSSSSSSSSSS..',
      '.SSSSSSSSSSSSSSSSSS.',
      ...Array<string>(13).fill('SSSSSSSSSSSSSSSSSSSS'),
      '.SS.SSS.SSSS.SSS.SS.',
    ]]],
    front: [
      [8, 21, ['S...S....S....S']],
      [24, 13, ['SSSS.', 'wwwwS', 'wwwwS', 'wwwwS', 'wwwwS', 'SSSS.']],
      [2, 13, ['.SSS', 'Swww', 'Swww', 'Swww', 'Swww', '.SSS']],
      [25, 19, [
        '...gg....',
        '.ooooooo.',
        'okkoookko',
        'ooooooooo',
        'okoooooko',
        'ookkkkkoo',
        '.ooooooo.',
      ]],
      [27, 21, ['y...y'], 'spark'],
    ],
  },
  santa: {
    dy: -3,
    front: [
      [-8, 9, [
        'rrrrr',
        'rrrrrr',
        '.rrrrr',
        '.rrrrr',
        '..rrrr................................rrrr',
        '..rrrr...............................rrrrr',
        '..rrrr..............................rrrrr',
        '..rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
        '..rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
        '..yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
        '...rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
        '....DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
        '.....DDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
      ]],
      [0, 22, ['S.....................S', 'S.....................S']],
      [-9, 21, [
        '..............................................SS',
        '.............................................SS.',
        '............................................SS..',
        'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
        '.SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
      ]],
      [38, 6, [
        '...........n..n.',
        '...........n.nn.',
        '............nn..',
        '...........aaa..',
        '...........aaaa.',
        '...........aaarr',
        '..........aaa.rr',
        '.........aaaa...',
        '..aaaaaaaaaaa...',
        '.aaaaaaaaaaaa...',
        'aaaaaaaaaaaaa...',
        'aaaaaaaaaaaaa...',
        '.aaaaaaaaaaa....',
        'nn.........nn...',
        'n...........nn..',
        '.............n..',
      ]],
      [32, 16, ['yyyyyyyyyyyyyyyyyy']],
    ],
  },
  oktoberfest: {
    legs: true,
    dy: -12,
    front: [
      [1, 14, [
        '.......aaaaaaaaaaaaaa.......',
        '...aaSSaaaaaaaaaaaaaaSSaa...',
        'aaaaaSSaaaaaaaaaaaaaaSSaaaaa',
        'aaaaaSSaaaaaaaaaaaaaaSSaaaaa',
        'aaaaaSSaaaaaaaaaaaaaaSSaaaaa',
        'aaaaaSSaaaaaaaaaaaaaaSSaaaaa',
        'aaaaaSSaaaaaaaaaaaaaaSSaaaaa',
        'aaaaaSSaaaaaaaaaaaaaaSSaaaaa',
        'aaaaaSSaaaaaaaaaaaaaaSSaaaaa',
        'aaaaaSSaaaaaaaaaaaaaaSSaaaaa',
        '...aaSSaaaaaaaaaaaaaaSSaa...',
        '.......aaaaaaaaaaaaaa.......',
      ]],
      ...[16, 20].map((y): Art => [1, y, ['nnnnn..nnnnnnnnnnnnnn..nnnnn'], 'spark']),
      ...[18, 22].map((y): Art => [1, y, ['nnnnn..nnnnnnnnnnnnnn..nnnnn'], 'spark spark2']),
    ],
  },
  raincoat: {
    back: [[-7, -4, [
      '....................SSSS',
      '....................SSSS',
      '..................SSwwssSS',
      '..................SSwwssSS',
      '................SSwwwwssssSS',
      '................SSwwwwssssSS',
      '..............SSwwwwwwssssssSS',
      '..............SSwwwwwwssssssSS',
      '............SSwwwwwwwwssssssssSS',
      '............SSwwwwwwwwssssssssSS',
      '..........SSwwwwwwwwwwssssssssssSS',
      '..........SSwwwwwwwwwwssssssssssSS',
      '........SSwwwwwwwwwwwwssssssssssssSS',
      '........SSwwwwwwwwwwwwssssssssssssSS',
      '......SSwwwwwwwwwwwwwwssssssssssssssSS',
      '......SSwwwwwwwwwwwwwwssssssssssssssSS',
      '....SSwwwwwwwwwwwwwwwwssssssssssssssssSS',
      '....SSwwwwwwwwwwwwwwwwssssssssssssssssSS',
      '..SSwwwwwwwwwwwwwwwwwwssssssssssssssssssSS',
      '..SSwwwwwwwwwwwwwwwwwwssssssssssssssssssSS',
      'SSwwwwwwwwwwwwwwwwwwwwssssssssssssssssssssSS',
      'SSwwwwwwwwwwwwwwwwwwwwssssssssssssssssssssSS',
    ]]],
    front: [
      [-9, 14, [
        'S..............................................S',
        'SwS..........................................SsS',
        'SwwSS......................................SSssS',
        '.SwwwSS..................................SSsssS',
        '.SwwwwwSS..............................SSsssssS',
        '..SwwwwwwSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSssssssS',
        '..SwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwsssssssssS',
        '..SwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwsssssssssS',
        '...SwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwssssssssS',
        '...SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
      ]],
      [-11, 24, ['bbbttbbbttbbbbbbttbbbbttbbbbbttbbbbbttbbbttbbbbbbbbb', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']],
    ],
  },
  king: {
    dy: -9,
    bare: true,
    back: [[3, -4, Array<string>(17).fill('pppppppppppppppppppppppp')]],
    front: [
      [13, -11, ['..yy..', '.yyyy.', '..yy..']],
      [0, -8, [
        '.........RRRRRRRRRRRR.........',
        '.....RRRRRRRRRRRRRRRRRRRR.....',
        '..RRRRRRRRRRRRRRRRRRRRRRRRRR..',
        'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
      ]],
      [1, -4, Array<string>(18).fill('yy........................yy')],
      [-1, 12, ['RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR', 'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy']],
      [-13, 14, ['hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh', 'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn']],
      ...[-11, 31].flatMap((x): Art[] => [
        [x, 16, [
          'l........l',
          'll......ll',
          '.llllllll.',
          '.lkkllkkl.',
          '.llllllll.',
          '.llllllll.',
        ]],
        [x + 1, 22, ['ll', 'll', 'll', 'll'], 'la'],
        [x + 4, 22, ['ll', 'll', 'll', 'll'], 'lb'],
        [x + 7, 22, ['ll', 'll', 'll', 'll'], 'la'],
      ]),
    ],
  },
}

// Each run of one colour along a row is one rect, and a run that repeats in the rows
// below it grows taller instead, which keeps the drawings small.
const art = ([x, y, rows, cls]: Art): string => {
  const done: string[] = []
  let open = new Map<string, number>()
  const close = (key: string, top: number, end: number): void => {
    const [dx, w, c] = key.split(' ')
    done.push(`<rect x="${x + Number(dx)}" y="${y + top}" width="${w}" height="${end - top}" fill="${INK[c ?? '']}"/>`)
  }
  rows.forEach((row, dy) => {
    const next = new Map<string, number>()
    for (let dx = 0; dx < row.length; ) {
      const c = row[dx] ?? '.'
      let end = dx + 1
      while (row[end] === c) end++
      if (INK[c]) {
        const key = `${dx} ${end - dx} ${c}`
        next.set(key, open.get(key) ?? dy)
        open.delete(key)
      }
      dx = end
    }
    open.forEach((top, key) => close(key, top, dy))
    open = next
  })
  open.forEach((top, key) => close(key, top, rows.length))
  const rects = done.join('')
  return cls ? `<g class="${cls}">${rects}</g>` : rects
}

/** The car's headlights after dark: a fan of light from the nose, like the lighthouse's. */
const BEAM = '<polygon points="40,20 98,10 98,28" fill="#FFF3B0" opacity=".3"/>'

export const gadgetOf = (costume: Costume, isDark = false): Gadget => {
  const { back = [], front, ...rest } = SPECS[costume]
  return { ...rest, back: back.map(art).join(''), front: `${costume === 'racer' && isDark ? BEAM : ''}${front.map(art).join('')}` }
}
