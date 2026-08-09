// UI wiring for Sound Sheets

document.addEventListener("DOMContentLoaded", () => {
  const soundInput = document.getElementById("soundInput");
  const pageCount = document.getElementById("pageCount");
  const generateBtn = document.getElementById("generateBtn");
  const printBtn = document.getElementById("printBtn");
  const errorMsg = document.getElementById("errorMsg");
  const resultsSection = document.getElementById("resultsSection");
  const resultsSummary = document.getElementById("resultsSummary");
  const pagesWrap = document.getElementById("pagesWrap");
  const patternList = document.getElementById("patternList");
  const allPatterns = document.getElementById("allPatterns");
  const patternCountSummary = document.getElementById("patternCountSummary");
  patternCountSummary.textContent = `See all available sounds & digraphs (${Object.keys(PATTERNS).length})`;

  // populate datalist + chip list from PATTERNS
  // Sorted so the picker reads in roughly Foundation -> Year1 -> Year2 order
  const orderedKeys = Object.keys(PATTERNS);
  orderedKeys.forEach(key => {
    const p = PATTERNS[key];
    const opt = document.createElement("option");
    opt.value = p.label; // full label so ambiguous graphemes (ow, ear, oo) stay disambiguated
    patternList.appendChild(opt);

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "pattern-chip";
    chip.textContent = p.label;
    chip.addEventListener("click", () => {
      soundInput.value = p.label;
      soundInput.focus();
    });
    allPatterns.appendChild(chip);
  });

  document.querySelectorAll(".hint-fill").forEach(btn => {
    btn.addEventListener("click", () => {
      soundInput.value = btn.dataset.fill;
      generate();
    });
  });

  function generate() {
    errorMsg.hidden = true;
    const input = soundInput.value.trim();
    if (!input) {
      errorMsg.textContent = "Type a sound or digraph first, e.g. “sh” or “ai”.";
      errorMsg.hidden = false;
      return;
    }
    let n = parseInt(pageCount.value, 10) || 5;
    n = Math.max(1, Math.min(10, n));
    pageCount.value = n;

    const result = generateWorksheets(input, n);
    if (result.error) {
      errorMsg.textContent = result.error;
      errorMsg.hidden = false;
      resultsSection.hidden = true;
      return;
    }

    pagesWrap.innerHTML = "";
    result.pages.forEach((page, i) => {
      const sheet = document.createElement("div");
      sheet.className = "worksheet-page phonics";
      sheet.innerHTML = page.html;
      const badge = document.createElement("div");
      badge.className = "page-badge no-print";
      badge.textContent = `Page ${i + 1} of ${result.pages.length} — ${page.title}`;
      sheet.prepend(badge);
      pagesWrap.appendChild(sheet);
    });

    const patternLabels = result.patternsUsed.map(k => PATTERNS[k].label).join(", ");
    resultsSummary.textContent = `${result.pages.length} page${result.pages.length > 1 ? "s" : ""} generated for: ${patternLabels}`;
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  generateBtn.addEventListener("click", generate);
  soundInput.addEventListener("keydown", (e) => { if (e.key === "Enter") generate(); });
  printBtn.addEventListener("click", () => window.print());
});
