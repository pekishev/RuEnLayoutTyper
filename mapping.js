// mapping.js — RU→EN раскладка и границы Alt+Shift
const RU2EN = new Map(Object.entries({
  "ё":"`","й":"q","ц":"w","у":"e","к":"r","е":"t","н":"y","г":"u","ш":"i","щ":"o","з":"p","х":"[","ъ":"]",
  "ф":"a","ы":"s","в":"d","а":"f","п":"g","р":"h","о":"j","л":"k","д":"l","ж":";","э":"'","я":"z","ч":"x","с":"c","м":"v","и":"b","т":"n","ь":"m","б":",","ю":"."
  ,"№":"#"
}));

// Заглавные кириллические буквы на знаках препинания → Shift-вариант US QWERTY (б→, Б→<).
const PUNCT_SHIFT = Object.freeze({
  "`": "~", "[": "{", "]": "}", ";": ":", "'": '"', ",": "<", ".": ">", "/": "?"
});

function ruToEn(ch) {
  if (RU2EN.has(ch)) return RU2EN.get(ch);
  const lo = ch.toLowerCase();
  if (RU2EN.has(lo)) {
    const mapped = RU2EN.get(lo);
    if (/[a-z]/.test(mapped)) return mapped.toUpperCase();
    if (ch !== lo && PUNCT_SHIFT[mapped]) return PUNCT_SHIFT[mapped];
    return mapped;
  }
  return ch;
}

export function isCyr(ch){ return /[А-Яа-яЁё]/.test(ch) || ch === "№"; }

export function fixLayout(text){
  let out = "";
  for (const ch of text) out += isCyr(ch) ? ruToEn(ch) : ch;
  return out;
}

export function computeAltShiftBoundaries(originalText){
  const out = [];
  if (!originalText) return out;
  let prev = null;
  for (let i=0;i<originalText.length;i++){
    const cur = isCyr(originalText[i]);
    if (prev === null){ prev = cur; continue; }
    if (cur !== prev){ out.push(i); prev = cur; }
  }
  return out;
}
