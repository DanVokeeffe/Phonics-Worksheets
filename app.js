// Phonics Worksheet Generator — app logic

// ---------- helpers ----------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pick(arr, n) {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Build a matched grapheme string for splitting a word into onset/rime
// e.g. word "rain", grapheme "ai" -> { onset: "r", rime: "ain" }
// Split digraphs (grapheme contains "_", e.g. "a_e") split at the vowel instead,
// since the target letters aren't contiguous — e.g. "cake" -> onset "ca", rime "ke".
function splitOnsetRime(word, grapheme) {
  if (grapheme.includes("_")) {
    const vowel = grapheme[0];
    const idx = word.toLowerCase().indexOf(vowel.toLowerCase());
    if (idx === -1) return null;
    return { onset: word.slice(0, idx + 1), rime: word.slice(idx + 1) };
  }
  const g = grapheme;
  const idx = word.toLowerCase().indexOf(g.toLowerCase());
  if (idx === -1) return null;
  const onset = word.slice(0, idx) || word[0];
  const rimeStart = onset === word.slice(0, idx) ? idx : 1;
  return { onset: word.slice(0, rimeStart) || word.slice(0,1), rime: word.slice(rimeStart) };
}

// Break a word into segments for the Missing Letters activity, marking which
// segments should render as blanks. Split digraphs (a_e, e_e, i_e, o_e, u_e)
// get TWO blanks (the vowel, and the final "bossy e"), with the consonant(s)
// in between left visible — matching how these are actually taught.
function blankWordSegments(word, grapheme) {
  if (grapheme.includes("_")) {
    const vowel = grapheme[0];
    const idx = word.toLowerCase().indexOf(vowel.toLowerCase());
    if (idx === -1) return [{ text: word, blank: false }];
    const before = word.slice(0, idx);
    const middle = word.slice(idx + 1, word.length - 1);
    const tail = word.slice(word.length - 1);
    return [
      { text: before, blank: false },
      { text: vowel, blank: true },
      { text: middle, blank: false },
      { text: tail, blank: true },
    ];
  }
  const lower = word.toLowerCase();
  const idx = lower.indexOf(grapheme.toLowerCase());
  if (idx === -1) return [{ text: word, blank: false }];
  return [
    { text: word.slice(0, idx), blank: false },
    { text: word.slice(idx, idx + grapheme.length), blank: true },
    { text: word.slice(idx + grapheme.length), blank: false },
  ];
}

// ---------- pattern lookup ----------
// Aliases so free-text entry is forgiving (e.g. "ew/ue", "ai (rain)", "long a", "split e")
const ALIASES = {
  "long a": "a_e", "long i": "i_e", "long o": "o_e", "long u": "u_e", "long e": "e_e",
  "a-e": "a_e", "e-e": "e_e", "i-e": "i_e", "o-e": "o_e", "u-e": "u_e",
  "a_e": "a_e", "e_e": "e_e", "i_e": "i_e", "o_e": "o_e", "u_e": "u_e",
  "bossy e a": "a_e", "split digraph a": "a_e",
  "ow (snow)": "ow_snow", "ow snow": "ow_snow", "ow (cow)": "ow_cow", "ow cow": "ow_cow",
  "y (cry)": "y_cry", "y cry": "y_cry", "y": "y_cry",
  "y (yes)": "y_yes", "y yes": "y_yes",
  "_y (happy)": "y_ee", "_y happy": "y_ee", "y (happy)": "y_ee", "y happy": "y_ee",
  "_ey (monkey)": "ey", "_ey monkey": "ey", "ey monkey": "ey",
  "ear (hear)": "ear", "ear hear": "ear",
  "ear (bear)": "ear_bear", "ear bear": "ear_bear",
  "are (care)": "are", "are care": "are",
  "or/ore": "or", "ore (store)": "ore", "ore store": "ore",
  "soft c (city)": "soft_c", "soft c": "soft_c", "softc": "soft_c",
  "soft g (giant)": "soft_g", "soft g": "soft_g", "softg": "soft_g",
  "_dge/_ge": "dge", "dge (bridge)": "dge", "_dge": "dge", "_ge": "dge",
  "_tch": "tch", "tch (catch)": "tch",
  "ch (school)": "ch_k", "ch school": "ch_k", "ch as /k/": "ch_k",
  "kn (knee)": "kn", "kn silent k (knee)": "kn",
  "wr (write)": "wr", "wr silent w (write)": "wr",
  "mb (comb)": "mb", "mb silent b (comb)": "mb",
  "consonant + le": "cle", "consonant+le": "cle", "cle": "cle", "le (candle)": "cle",
  "oo (moon)": "oo_moon", "oo moon": "oo_moon",
  "oo (book)": "oo_book", "oo book": "oo_book",
  "oo": "oo_moon",
};

function findPattern(token) {
  const raw = token.trim().toLowerCase();
  if (!raw) return null;

  // 1. explicit alias
  if (ALIASES[raw]) return ALIASES[raw];
  // 2. exact key match (e.g. "sh", "a_e", "m")
  if (PATTERNS[raw]) return raw;
  // 3. exact match against a pattern's full label (with disambiguating hint),
  //    e.g. "ear (bear)" vs "ear (hear)" — must check BEFORE stripping parens
  for (const key in PATTERNS) {
    if (PATTERNS[key].label.toLowerCase() === raw) return key;
  }
  // 4. exact match against exampleWord
  for (const key in PATTERNS) {
    if (PATTERNS[key].exampleWord.toLowerCase() === raw) return key;
  }
  // 5. strip "(...)" hints and retry loosely
  const stripped = raw.replace(/\(.*?\)/g, "").trim();
  if (stripped && stripped !== raw) {
    if (ALIASES[stripped]) return ALIASES[stripped];
    if (PATTERNS[stripped]) return stripped;
  }
  if (stripped === "ow") return "ow_snow"; // sensible default
  if (stripped === "oo") return "oo_moon"; // sensible default
  // 6. last resort: unambiguous substring match on label text
  const matches = Object.keys(PATTERNS).filter(key =>
    PATTERNS[key].label.toLowerCase().replace(/[()]/g, "").includes(stripped) && stripped.length > 1
  );
  if (matches.length === 1) return matches[0];
  return null;
}

function resolvePatterns(input) {
  const tokens = input.split(/[\/,+&]| and /i).map(s => s.trim()).filter(Boolean);
  const found = [];
  for (const tok of tokens) {
    const key = findPattern(tok);
    if (key && !found.includes(key)) found.push(key);
  }
  return found;
}

function combinedWordList(patternKeys) {
  let words = [];
  patternKeys.forEach(key => {
    const p = PATTERNS[key];
    words = words.concat(p.words.map(w => ({ ...w, grapheme: p.grapheme, patternLabel: p.label })));
  });
  return words;
}

// ---------- page chrome ----------
function pageHeader(title, instructions) {
  return `
    <div class="ws-header">
      <div class="ws-name-line"><span>Name:</span><span class="line"></span><span>Date:</span><span class="line short"></span></div>
      <h2>${esc(title)}</h2>
    </div>
    <p class="ws-instructions">${esc(instructions)}</p>
  `;
}

// ---------- ACTIVITY 1: Trace, Read, Write ----------
function activityTraceWrite(words, patternLabel) {
  const chosen = pick(words, 8);
  const rows = chosen.map(w => `
    <tr>
      <td class="trace-cell">${esc(w.word)}</td>
      <td class="write-cell"></td>
      <td class="write-cell"></td>
      <td class="write-cell"></td>
    </tr>`).join("");
  return pageHeader(`Trace, Read, Write: ${patternLabel}`,
    "Trace the word, then write it twice more by yourself. Read each word to a partner.") + `
    <table class="ws-table trace-table">
      <thead><tr><th>Trace</th><th>Write</th><th>Write</th><th>Write</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ---------- ACTIVITY 2: Fill in the Blank ----------
function activityFillBlank(words, patternLabel) {
  const chosen = pick(words, 8);
  const box = chosen.map(w => esc(w.word)).join("&nbsp;&nbsp;&bull;&nbsp;&nbsp;");
  const items = chosen.map((w, i) => `<li>${esc(w.sentence.replace("___", "______________"))}</li>`).join("");
  return pageHeader(`Fill in the Blank: ${patternLabel}`,
    "Choose a word from the box to complete each sentence. Write it on the line.") + `
    <div class="word-box">${box}</div>
    <ol class="ws-list">${items}</ol>`;
}

// ---------- ACTIVITY 3: Word Sort (target vs trick words) ----------
function activityWordSort(words, patternLabel, grapheme) {
  const chosen = pick(words, 7).map(w => w.word);
  const g = grapheme.replace("_", "").toLowerCase();
  const safeDistractors = DISTRACTORS.filter(d => !d.toLowerCase().includes(g));
  const tricky = pick(safeDistractors, 7);
  const all = shuffle([...chosen.map(w => ({ w, target: true })), ...tricky.map(w => ({ w, target: false }))]);
  const wordBank = all.map(x => esc(x.w)).join("&nbsp;&nbsp;&bull;&nbsp;&nbsp;");
  return pageHeader(`Word Sort: ${patternLabel}`,
    `Read each word in the box. Sort it into the correct column: words with '${grapheme.replace("_"," ")}' or words without it.`) + `
    <div class="word-box">${wordBank}</div>
    <table class="ws-table sort-table">
      <thead><tr><th>Has '${esc(grapheme.replace("_"," "))}'</th><th>Does NOT have '${esc(grapheme.replace("_"," "))}'</th></tr></thead>
      <tbody>
        ${Array.from({length: 7}).map(() => `<tr><td class="sort-cell"></td><td class="sort-cell"></td></tr>`).join("")}
      </tbody>
    </table>`;
}

// ---------- ACTIVITY 4: Word Search ----------
function buildWordSearchGrid(size, wordList) {
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  const dirs = [[0,1],[1,0],[1,1],[0,-1],[-1,0],[-1,-1],[1,-1],[-1,1]];
  const placed = [];
  const words = wordList.map(w => w.toUpperCase()).sort((a,b) => b.length - a.length);
  for (const word of words) {
    let ok = false;
    for (let attempt = 0; attempt < 60 && !ok; attempt++) {
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      const maxRow = dir[0] === 1 ? size - word.length : dir[0] === -1 ? size - 1 : size - 1;
      const startRowMin = dir[0] === -1 ? word.length - 1 : 0;
      const startColMin = dir[1] === -1 ? word.length - 1 : 0;
      const startColMax = dir[1] === 1 ? size - word.length : size - 1;
      const row = Math.floor(Math.random() * (size)) ;
      const col = Math.floor(Math.random() * (size));
      // validate path stays in bounds
      const endRow = row + dir[0] * (word.length - 1);
      const endCol = col + dir[1] * (word.length - 1);
      if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;
      let fits = true;
      for (let i = 0; i < word.length; i++) {
        const r = row + dir[0] * i, c = col + dir[1] * i;
        const existing = grid[r][c];
        if (existing !== null && existing !== word[i]) { fits = false; break; }
      }
      if (!fits) continue;
      for (let i = 0; i < word.length; i++) {
        const r = row + dir[0] * i, c = col + dir[1] * i;
        grid[r][c] = word[i];
      }
      placed.push(word);
      ok = true;
    }
  }
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (grid[r][c] === null) grid[r][c] = letters[Math.floor(Math.random() * letters.length)];
  return { grid, placed };
}

function activityWordSearch(words, patternLabel) {
  const chosen = pick(words, 8).map(w => w.word);
  const size = 12;
  const { grid, placed } = buildWordSearchGrid(size, chosen);
  const table = grid.map(row => `<tr>${row.map(ch => `<td>${ch}</td>`).join("")}</tr>`).join("");
  return pageHeader(`Word Search: ${patternLabel}`,
    "Find and circle each word from the list in the puzzle below.") + `
    <div class="wordsearch-wrap">
      <table class="ws-table wordsearch-table">${table}</table>
      <div class="wordsearch-list">
        <strong>Find these words:</strong>
        <ul>${placed.map(w => `<li>${esc(w.toLowerCase())}</li>`).join("")}</ul>
      </div>
    </div>`;
}

// ---------- ACTIVITY 5: Missing Letters ----------
function activityMissingLetters(words, patternLabel, grapheme) {
  const chosen = pick(words, 10);
  const items = chosen.map(w => {
    const segs = blankWordSegments(w.word, grapheme);
    const html = segs.map(s => s.blank
      ? `<span class="ml-blank">${"_".repeat(Math.max(s.text.length, 2))}</span>`
      : `<span class="ml-part">${esc(s.text)}</span>`
    ).join("");
    return `<li>${html}</li>`;
  }).join("");
  return pageHeader(`Missing Letters: ${patternLabel}`,
    `Fill in the missing letters '${grapheme.replace("_"," ")}' to complete each word. Write the whole word, then read it aloud.`) + `
    <ol class="ws-list missing-letters-list">${items}</ol>`;
}

// ---------- ACTIVITY 6: Sentence Unscramble ----------
function activityUnscramble(words, patternLabel) {
  const chosen = pick(words, 6);
  const items = chosen.map(w => {
    const sentence = w.sentence.replace("___", w.word);
    const clean = sentence.replace(/[.?!]$/, "");
    const tokens = shuffle(clean.split(" "));
    return `<li><p class="unscramble-jumbled">${tokens.map(esc).join(" &nbsp; ")}</p><p class="write-line"></p></li>`;
  }).join("");
  return pageHeader(`Unscramble the Sentence: ${patternLabel}`,
    "Put the words in the right order to make a sentence that makes sense. Write it on the line.") + `
    <ol class="ws-list unscramble-list">${items}</ol>`;
}

// ---------- ACTIVITY 7: Word Building ----------
function activityWordBuilding(words, patternLabel, grapheme) {
  const chosen = pick(words, 7);
  const parts = chosen.map(w => splitOnsetRime(w.word, grapheme)).filter(Boolean);
  const onsets = shuffle(parts.map(p => p.onset));
  const rimes = shuffle(parts.map(p => p.rime));
  return pageHeader(`Word Building: ${patternLabel}`,
    "Draw a line to join a beginning part to an ending part to build a real word. Write the words you made below.") + `
    <div class="wordbuild-wrap">
      <div class="wordbuild-col">${onsets.map(o => `<div class="wordbuild-chip">${esc(o)}</div>`).join("")}</div>
      <div class="wordbuild-col">${rimes.map(r => `<div class="wordbuild-chip">${esc(r)}</div>`).join("")}</div>
    </div>
    <p class="ws-instructions" style="margin-top:.75in">Words I built:</p>
    <div class="ws-write-grid">${Array.from({length: 7}).map(() => `<span class="line"></span>`).join("")}</div>`;
}

// ---------- ACTIVITY 8: Story Cloze ----------
function activityStoryCloze(words, patternLabel) {
  const chosen = pick(words, 6);
  const box = chosen.map(w => esc(w.word)).join("&nbsp;&nbsp;&bull;&nbsp;&nbsp;");
  const story = chosen.map(w => w.sentence.replace("___", "________")).join(" ");
  return pageHeader(`Story Time: ${patternLabel}`,
    "Read the story. Choose the best word from the box to fill each gap.") + `
    <div class="word-box">${box}</div>
    <p class="ws-story">${esc(story).replace(/________/g, '<span class="story-blank"></span>')}</p>
    <p class="ws-instructions" style="margin-top:.5in">Draw a picture about the story in the box below.</p>
    <div class="draw-box"></div>`;
}

// ---------- ACTIVITY 9: Circle & Write (word discrimination in sentences) ----------
function activityCircleWrite(words, patternLabel, grapheme) {
  const chosen = pick(words, 6);
  const items = chosen.map(w => {
    const sentence = w.sentence.replace("___", `<u>${esc(w.word)}</u>`);
    return `<li>${sentence}</li>`;
  }).join("");
  return pageHeader(`Read and Circle: ${patternLabel}`,
    `Read each sentence. Circle the word with '${grapheme.replace("_"," ")}' in it. Then copy one sentence into your exercise book and draw a picture.`) + `
    <ol class="ws-list circle-list">${items}</ol>`;
}

// ---------- ACTIVITY 10: Write Your Own Sentence ----------
function activityWriteOwn(words, patternLabel) {
  const chosen = pick(words, 6);
  const items = chosen.map(w => `
    <li>
      <span class="wo-word">${esc(w.word)}</span>
      <span class="write-line"></span>
    </li>`).join("");
  return pageHeader(`Write Your Own Sentence: ${patternLabel}`,
    "Read each word. Write your own sentence using that word. Remember capital letters and full stops!") + `
    <ol class="ws-list write-own-list">${items}</ol>`;
}

const ACTIVITIES = [
  { key: "trace", label: "Trace, Read, Write", fn: (w, p) => activityTraceWrite(w, p.label) },
  { key: "fill", label: "Fill in the Blank", fn: (w, p) => activityFillBlank(w, p.label) },
  { key: "sort", label: "Word Sort", fn: (w, p) => activityWordSort(w, p.label, p.grapheme) },
  { key: "search", label: "Word Search", fn: (w, p) => activityWordSearch(w, p.label) },
  { key: "missing", label: "Missing Letters", fn: (w, p) => activityMissingLetters(w, p.label, p.grapheme) },
  { key: "unscramble", label: "Unscramble the Sentence", fn: (w, p) => activityUnscramble(w, p.label) },
  { key: "build", label: "Word Building", fn: (w, p) => activityWordBuilding(w, p.label, p.grapheme) },
  { key: "story", label: "Story Time", fn: (w, p) => activityStoryCloze(w, p.label) },
  { key: "circle", label: "Read and Circle", fn: (w, p) => activityCircleWrite(w, p.label, p.grapheme) },
  { key: "writeown", label: "Write Your Own Sentence", fn: (w, p) => activityWriteOwn(w, p.label) },
];

// ---------- main generation ----------
function generateWorksheets(input, numPages) {
  const keys = resolvePatterns(input);
  if (keys.length === 0) return { error: `Sorry, "${input}" isn't in the word bank yet. Try one of the patterns listed below the generator.` };

  const words = combinedWordList(keys);
  if (words.length < 4) return { error: "Not enough words found for that pattern." };

  const labelParts = keys.map(k => PATTERNS[k].exampleWord);
  const combinedGrapheme = keys.map(k => PATTERNS[k].grapheme).join(" / ");
  const combinedLabel = keys.map(k => PATTERNS[k].label.split(" (")[0]).join(" / ") + ` (${labelParts.join(", ")})`;

  const pseudoPattern = { label: combinedLabel, grapheme: combinedGrapheme };

  const order = shuffle(ACTIVITIES);
  const pages = [];
  for (let i = 0; i < numPages; i++) {
    const activity = order[i % order.length];
    // for missing-letters/word-building/circle/sort which need a single grapheme,
    // rotate through the individual patterns if multiple were given
    const singleKey = keys[i % keys.length];
    const singlePattern = PATTERNS[singleKey];
    const useSingle = ["missing", "build", "circle", "sort"].includes(activity.key) && keys.length > 1;
    const patternForActivity = useSingle ? singlePattern : pseudoPattern;
    const wordsForActivity = useSingle ? combinedWordList([singleKey]) : words;
    try {
      pages.push({ title: activity.label, html: activity.fn(wordsForActivity, patternForActivity) });
    } catch (e) {
      pages.push({ title: activity.label, html: `<p>Could not generate this page.</p>` });
    }
  }
  return { pages, patternsUsed: keys };
}
