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
    const extra = (typeof EXTRA_WORDS !== "undefined" && EXTRA_WORDS[key]) || [];
    const allWords = p.words.concat(extra);
    words = words.concat(allWords.map(w => ({ ...w, grapheme: p.grapheme, patternLabel: p.label })));
  });
  return words;
}

// =====================================================================
// PAGE SHELL — shared program identity, per the master design system.
// Every activity renders inside this exact rhythm:
// PROGRAM BAND -> NAME/DATE -> FOCUS+ACTIVITY CHIPS -> TITLE -> PROMPT -> BODY -> FOOTER
// =====================================================================
const PROGRAM_NAME = "[Program Name]";

function pageShell({ focusLabel, activityLabel, title, instructions, bodyHtml }) {
  return `
    <div class="program-band">
      <span>${esc(PROGRAM_NAME)}</span>
      <span>PHONICS</span>
    </div>
    <div class="ws-shell-top">
      <div class="student-info">
        <div class="info-field"><span>Name</span><span class="info-line"></span></div>
        <div class="info-field"><span>Date</span><span class="info-line"></span></div>
      </div>
      <div class="focus-row">
        <span class="chip focus-chip auto-wrap">${esc(focusLabel)}</span>
        <span class="chip phonics-activity-chip auto-wrap">${esc(activityLabel)}</span>
      </div>
      <h1>${esc(title)}</h1>
      <div class="title-rule"></div>
      <p class="prompt">${esc(instructions)}</p>
    </div>
    <div class="ws-body">${bodyHtml}</div>
    <div class="footer">
      <span>${esc(PROGRAM_NAME)}</span>
      <span>Sound Sheets</span>
      <span>Phonics</span>
    </div>
  `;
}

// Word bank card with pills that wrap predictably (content-aware — no fixed widths)
function wordBankHtml(words) {
  return `<div class="card word-bank" style="padding:3mm 4mm; margin-bottom:4mm;">${words.map(w => `<span class="word-pill auto-wrap">${esc(w)}</span>`).join("")}</div>`;
}

function wsRows(rowsHtml, extraClass = "") {
  return `<div class="ws-rows ${extraClass}">${rowsHtml}</div>`;
}
function wsRow(num, contentHtml, extraClass = "") {
  return `<div class="ws-row ${extraClass}"><span class="ws-row-num">${num}.</span><span class="ws-row-main auto-wrap">${contentHtml}</span></div>`;
}

// ---------- ACTIVITY 1: Trace, Read, Write ----------
function activityTraceWrite(words, patternLabel) {
  const chosen = pick(words, 6);
  const header = `
    <div class="trace-cell trace-head model-head">Trace</div>
    <div class="trace-cell trace-head">Write</div>
    <div class="trace-cell trace-head">Write</div>
    <div class="trace-cell trace-head">Write</div>`;
  const rows = chosen.map(w => `
    <div class="trace-cell model">${esc(w.word)}</div>
    <div class="trace-cell write"><span class="write-line"></span></div>
    <div class="trace-cell write"><span class="write-line"></span></div>
    <div class="trace-cell write"><span class="write-line"></span></div>`).join("");
  return pageShell({
    focusLabel: patternLabel,
    activityLabel: "Trace, Read, Write",
    title: "Trace, Read, Write",
    instructions: "Trace the word, then write it twice more by yourself. Read each word to a partner.",
    bodyHtml: `<div class="trace-grid">${header}${rows}</div>`
  });
}

// ---------- ACTIVITY 2: Fill in the Blank ----------
function activityFillBlank(words, patternLabel) {
  const chosen = pick(words, 8);
  const box = wordBankHtml(chosen.map(w => w.word));
  const rows = chosen.map((w, i) => wsRow(i + 1, esc(w.sentence.replace("___", "______________")))).join("");
  return pageShell({
    focusLabel: patternLabel,
    activityLabel: "Fill in the Blank",
    title: "Fill in the Blank",
    instructions: "Choose a word from the box to complete each sentence. Write it on the line.",
    bodyHtml: box + wsRows(rows)
  });
}

// ---------- ACTIVITY 3: Word Sort (target vs trick words) ----------
function activityWordSort(words, patternLabel, grapheme) {
  const chosen = pick(words, 7).map(w => w.word);
  const g = grapheme.replace("_", "").toLowerCase();
  const safeDistractors = DISTRACTORS.filter(d => !d.toLowerCase().includes(g));
  const tricky = pick(safeDistractors, 7);
  const all = shuffle([...chosen, ...tricky]);
  const box = wordBankHtml(all);
  const linesA = Array.from({ length: 7 }).map(() => `<span class="write-line"></span>`).join("");
  const linesB = Array.from({ length: 7 }).map(() => `<span class="write-line"></span>`).join("");
  return pageShell({
    focusLabel: patternLabel,
    activityLabel: "Word Sort",
    title: "Word Sort",
    instructions: `Read each word in the box. Sort it into the correct column: words with '${grapheme.replace("_"," ")}' or words without it.`,
    bodyHtml: box + `
      <div class="sort-columns">
        <div class="sort-col"><div class="sort-col-head">Has '${esc(grapheme.replace("_"," "))}'</div><div class="sort-col-body">${linesA}</div></div>
        <div class="sort-col"><div class="sort-col-head">Does NOT have it</div><div class="sort-col-body">${linesB}</div></div>
      </div>`
  });
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
      const row = Math.floor(Math.random() * (size)) ;
      const col = Math.floor(Math.random() * (size));
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
  const cells = grid.map(row => row.map(ch => `<div class="ws-grid-cell">${ch}</div>`).join("")).join("");
  return pageShell({
    focusLabel: patternLabel,
    activityLabel: "Word Search",
    title: "Word Search",
    instructions: "Find and circle each word from the list in the puzzle below.",
    bodyHtml: `
      <div class="wordsearch-wrap">
        <div class="wordsearch-grid" style="grid-template-columns: repeat(${size}, 1fr); grid-template-rows: repeat(${size}, 1fr);">${cells}</div>
        <div class="wordsearch-list">
          <div class="wordsearch-list-head">Find these words:</div>
          <div class="wordsearch-list-grid">${placed.map(w => `<span class="word-item">${esc(w.toLowerCase())}</span>`).join("")}</div>
        </div>
      </div>`
  });
}

// ---------- ACTIVITY 5: Missing Letters ----------
function activityMissingLetters(words, patternLabel, grapheme) {
  const chosen = pick(words, 8);
  const cards = chosen.map(w => {
    const segs = blankWordSegments(w.word, grapheme);
    const html = segs.map(s => s.blank
      ? `<span class="ml-blank">${"_".repeat(Math.max(s.text.length, 2))}</span>`
      : `<span>${esc(s.text)}</span>`
    ).join("");
    return `<div class="ml-card">${html}</div>`;
  }).join("");
  return pageShell({
    focusLabel: patternLabel,
    activityLabel: "Missing Letters",
    title: "Missing Letters",
    instructions: `Fill in the missing letters '${grapheme.replace("_"," ")}' to complete each word. Write the whole word, then read it aloud.`,
    bodyHtml: `<div class="missing-letters-grid">${cards}</div>`
  });
}

// ---------- ACTIVITY 6: Sentence Unscramble ----------
function activityUnscramble(words, patternLabel) {
  const chosen = pick(words, 5);
  const rows = chosen.map((w, i) => {
    const sentence = w.sentence.replace("___", w.word);
    const clean = sentence.replace(/[.?!]$/, "");
    const tokens = shuffle(clean.split(" "));
    const pills = tokens.map(t => `<span class="word-pill auto-wrap">${esc(t)}</span>`).join("");
    const content = `<div class="unscramble-pills">${pills}</div><span class="write-line"></span>`;
    return wsRow(i + 1, content, "unscramble-row");
  }).join("");
  return pageShell({
    focusLabel: patternLabel,
    activityLabel: "Unscramble the Sentence",
    title: "Unscramble the Sentence",
    instructions: "Put the words in the right order to make a sentence that makes sense. Write it on the line.",
    bodyHtml: wsRows(rows)
  });
}

// ---------- ACTIVITY 7: Word Building ----------
function activityWordBuilding(words, patternLabel, grapheme) {
  const chosen = pick(words, 7);
  const parts = chosen.map(w => splitOnsetRime(w.word, grapheme)).filter(Boolean);
  const onsets = shuffle(parts.map(p => p.onset));
  const rimes = shuffle(parts.map(p => p.rime));
  return pageShell({
    focusLabel: patternLabel,
    activityLabel: "Word Building",
    title: "Word Building",
    instructions: "Draw a line to join a beginning part to an ending part to build a real word. Write the words you made below.",
    bodyHtml: `
      <div class="wordbuild-wrap">
        <div class="wordbuild-col">
          <div class="wordbuild-col-head">Beginnings</div>
          ${onsets.map(o => `<div class="wordbuild-chip auto-wrap">${esc(o)}</div>`).join("")}
        </div>
        <div class="wordbuild-col">
          <div class="wordbuild-col-head">Endings</div>
          ${rimes.map(r => `<div class="wordbuild-chip auto-wrap">${esc(r)}</div>`).join("")}
        </div>
      </div>
      <p class="ws-subheading">Words I built:</p>
      <div class="ws-write-grid">${Array.from({length: 7}).map(() => `<span class="write-line"></span>`).join("")}</div>`
  });
}

// ---------- ACTIVITY 8: Choose the Right Word ----------
function activityChooseRight(words, patternLabel) {
  const chosen = pick(words, 7);
  const rows = chosen.map((w, i) => {
    const pool = DISTRACTORS.filter(d => d.toLowerCase() !== w.word.toLowerCase());
    const distractor = pick(pool, 1)[0];
    const options = shuffle([w.word, distractor]);
    const sentence = esc(w.sentence.replace("___", "______"));
    const content = `
      <div class="choice-row">
        <span class="choice-text auto-wrap">${sentence}</span>
        <span class="word-pill">${esc(options[0])}</span>
        <span class="word-pill">${esc(options[1])}</span>
      </div>
      <span class="write-line"></span>`;
    return wsRow(i + 1, content, "choice-row-wrap");
  }).join("");
  return pageShell({
    focusLabel: patternLabel,
    activityLabel: "Choose the Right Word",
    title: "Choose the Right Word",
    instructions: "Read each sentence. Circle the word in brackets that correctly completes it, then write it on the line.",
    bodyHtml: wsRows(rows)
  });
}

// ---------- ACTIVITY 9: Read and Circle ----------
function activityCircleWrite(words, patternLabel, grapheme) {
  const chosen = pick(words, 5);
  const rows = chosen.map((w, i) => {
    const sentence = w.sentence.replace("___", `<u>${esc(w.word)}</u>`);
    return wsRow(i + 1, `<span class="auto-wrap">${sentence}</span>`, "circle-row");
  }).join("");
  const rewriteLines = chosen.map(() => `<span class="write-line"></span>`).join("");
  return pageShell({
    focusLabel: patternLabel,
    activityLabel: "Read and Circle",
    title: "Read and Circle",
    instructions: `Read each sentence. Circle the word with '${grapheme.replace("_"," ")}' in it.`,
    bodyHtml: `
      ${wsRows(rows, "compact")}
      <div class="circle-panels">
        <div class="circle-panel rewrite">
          <div class="circle-panel-head">Rewrite the sentences</div>
          <div class="circle-panel-body">${rewriteLines}</div>
        </div>
        <div class="circle-panel draw">
          <div class="circle-panel-head">Draw a picture</div>
          <div class="circle-panel-body"></div>
        </div>
      </div>`
  });
}

// ---------- ACTIVITY 10: Write Your Own Sentence ----------
function activityWriteOwn(words, patternLabel) {
  const chosen = pick(words, 6);
  const rows = chosen.map((w, i) => {
    const content = `<span class="word-pill">${esc(w.word)}</span><span class="write-line"></span>`;
    return wsRow(i + 1, content, "write-own-row");
  }).join("");
  return pageShell({
    focusLabel: patternLabel,
    activityLabel: "Write Your Own Sentence",
    title: "Write Your Own Sentence",
    instructions: "Read each word. Write your own sentence using that word. Remember capital letters and full stops!",
    bodyHtml: wsRows(rows)
  });
}

const ACTIVITIES = [
  { key: "trace", label: "Trace, Read, Write", fn: (w, p) => activityTraceWrite(w, p.label) },
  { key: "fill", label: "Fill in the Blank", fn: (w, p) => activityFillBlank(w, p.label) },
  { key: "sort", label: "Word Sort", fn: (w, p) => activityWordSort(w, p.label, p.grapheme) },
  { key: "search", label: "Word Search", fn: (w, p) => activityWordSearch(w, p.label) },
  { key: "missing", label: "Missing Letters", fn: (w, p) => activityMissingLetters(w, p.label, p.grapheme) },
  { key: "unscramble", label: "Unscramble the Sentence", fn: (w, p) => activityUnscramble(w, p.label) },
  { key: "build", label: "Word Building", fn: (w, p) => activityWordBuilding(w, p.label, p.grapheme) },
  { key: "choose", label: "Choose the Right Word", fn: (w, p) => activityChooseRight(w, p.label) },
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
