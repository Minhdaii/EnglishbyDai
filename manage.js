const $ = (s) => document.querySelector(s);
const ABBR = {
  noun: "n.",
  verb: "v.",
  adjective: "adj.",
  adverb: "adv.",
  pronoun: "pron.",
  preposition: "prep.",
  conjunction: "conj.",
  interjection: "interj.",
  exclamation: "excl."
};
const COLORS = ["#2563eb", "#0284c7", "#4f46e5", "#0891b2"];

const MASTERY_LABELS = {
  mastered: { label: "Thành thạo", cls: "mastery-mastered" },
  familiar: { label: "Quen thuộc", cls: "mastery-familiar" },
  learning: { label: "Đang học", cls: "mastery-learning" },
  new: { label: "Mới lưu", cls: "mastery-new" }
};

function removeVietnameseTones(str) {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d");
}

function formatNextReview(ts) {
  if (!ts) return "";
  const diff = ts - Date.now();
  if (diff <= 0) return "hôm nay";
  const hours = Math.round(diff / 3600000);
  if (hours < 24) return `${hours} giờ tới`;
  const days = Math.round(diff / 86400000);
  return `${days} ngày tới`;
}

let words = {};
let deck = [];
let idx = 0;
let flipped = false;
let editingWord = null;

function svgIcon(name) {
  const ICONS = {
    speaker: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>',
    cycle: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>',
    edit: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>',
    trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
    retry: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>',
    quote: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>'
  };
  const span = document.createElement("span");
  span.style.display = "inline-flex";
  span.style.alignItems = "center";
  span.innerHTML = ICONS[name] || "";
  return span;
}

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid != null && kid !== false) e.append(kid);
  }
  return e;
}
const abbr = (p) => ABBR[p] || p;

function tts(text) {
  if (!text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.95;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function speak(word) {
  const a = words[word]?.audio;
  if (a) new Audio(a).play().catch(() => tts(word));
  else tts(word);
}

function highlightKeyword(ctx, word) {
  const frag = document.createDocumentFragment();
  if (!ctx || !word) {
    frag.append(ctx || "");
    return frag;
  }
  const clean = word.toLowerCase().trim();
  const i = ctx.toLowerCase().indexOf(clean);
  if (i < 0) {
    frag.append(ctx);
    return frag;
  }
  frag.append(
    ctx.slice(0, i),
    el("mark", { class: "kw" }, ctx.slice(i, i + clean.length)),
    ctx.slice(i + clean.length)
  );
  return frag;
}

function meaningNode(w) {
  if (w.status === "pending") return el("div", { class: "meaning wait" }, "Đang tra nghĩa & tạo câu ví dụ…");
  if (w.status === "error" && !w.meaning) return el("div", { class: "meaning wait" }, "Chưa dịch được");
  return el("div", { class: "meaning" }, w.meaning || "");
}

function altsNode(w, max = 3) {
  const list = (w.alts || []).slice(0, max);
  if (!list.length) return null;
  return el(
    "div",
    { class: "alts" },
    list.map((a) => el("div", {}, el("b", {}, abbr(a.pos)), a.terms.slice(0, 4).join(", ")))
  );
}

// Khung hiển thị câu ví dụ minh họa
function exampleBlockNode(w, onCycle, onEdit) {
  if (!w.example && w.status !== "done") return null;
  if (!w.example) return null;

  return el(
    "div",
    { class: "item-example" },
    el(
      "div",
      { class: "ex-top" },
      el("span", { class: "ex-label" }, svgIcon("quote"), " CÂU VÍ DỤ:"),
      el(
        "div",
        { class: "ex-actions" },
        el("button", {
          class: "btn-mini",
          title: "Nghe đọc câu ví dụ",
          onclick: (e) => { e.stopPropagation(); tts(w.example); }
        }, svgIcon("speaker"), " Nghe"),
        onCycle && el("button", {
          class: "btn-mini",
          title: "Đổi câu ví dụ khác",
          onclick: (e) => { e.stopPropagation(); onCycle(w.word); }
        }, svgIcon("cycle"), " Đổi"),
        onEdit && el("button", {
          class: "btn-mini",
          title: "Chỉnh sửa câu ví dụ",
          onclick: (e) => { e.stopPropagation(); onEdit(w.word); }
        }, svgIcon("edit"), " Sửa")
      )
    ),
    el("div", { class: "ex-sentence" }, highlightKeyword(w.example, w.word)),
    w.exampleTrans && el("div", { class: "ex-translation" }, w.exampleTrans)
  );
}

function domain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}

function ago(ts) {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return "hôm nay";
  if (d === 1) return "hôm qua";
  if (d < 30) return d + " ngày trước";
  return new Date(ts).toLocaleDateString("vi-VN");
}

// ===== Thống kê =====
function renderStats(all) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = all.filter((w) => w.createdAt >= start.getTime()).length;
  const withEx = all.filter((w) => !!w.example).length;
  const encountered = all.filter((w) => (w.encounters || 0) > 0).length;
  const mastered = all.filter((w) => w.mastery === "mastered").length;
  const stat = (n, label) => el("span", { class: "stat" }, el("b", {}, String(n)), " " + label);

  $("#stats").replaceChildren(
    stat(all.length, "từ"),
    stat(today, "hôm nay"),
    stat(withEx, "có ví dụ"),
    stat(encountered, "đã gặp lại"),
    stat(mastered, "thành thạo")
  );
}

// ===== Danh sách từ =====
function renderList() {
  const q = $("#q").value.trim().toLowerCase();
  const filterType = $("#filterSelect").value;
  const sortType = $("#sortSelect").value;

  let all = Object.values(words);

  // Sắp xếp
  if (sortType === "newest") {
    all.sort((a, b) => b.createdAt - a.createdAt);
  } else if (sortType === "oldest") {
    all.sort((a, b) => a.createdAt - b.createdAt);
  } else if (sortType === "az") {
    all.sort((a, b) => (a.word || "").localeCompare(b.word || ""));
  } else if (sortType === "encounters") {
    all.sort((a, b) => (b.encounters || 0) - (a.encounters || 0));
  } else if (sortType === "needs_review") {
    all.sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0));
  }

  renderStats(all);

  // Tìm kiếm từ khóa (hỗ trợ cả có dấu và không dấu)
  const qTone = removeVietnameseTones(q);

  const items = all.filter((w) => {
    // Lọc theo câu ví dụ
    if (filterType === "has_example" && !w.example) return false;
    if (filterType === "no_example" && !!w.example) return false;

    // Lọc theo độ thành thạo Word Encounter
    if (filterType === "mastery_mastered" && w.mastery !== "mastered") return false;
    if (filterType === "mastery_familiar" && w.mastery !== "familiar") return false;
    if (filterType === "mastery_learning" && w.mastery !== "learning") return false;
    if (filterType === "mastery_new" && (w.mastery && w.mastery !== "new")) return false;

    // Tìm kiếm từ khóa
    if (!q) return true;
    return [w.word, w.meaning, w.example, w.exampleTrans, w.context, w.definition].some((x) => {
      if (!x) return false;
      const lower = x.toLowerCase();
      if (lower.includes(q)) return true;
      if (qTone && removeVietnameseTones(lower).includes(qTone)) return true;
      return false;
    });
  });

  const box = $("#items");
  box.replaceChildren();

  if (!items.length) {
    box.append(
      el(
        "div",
        { class: "empty" },
        el("h2", {}, all.length ? "Không tìm thấy từ phù hợp" : "Chưa có từ vựng nào"),
        all.length
          ? "Thử thay đổi từ khóa hoặc bộ lọc tìm kiếm."
          : "Hãy nhập từ ở ô phía trên hoặc bôi đen từ trên web rồi nhấn Alt+S."
      )
    );
    return;
  }

  for (const w of items) {
    const masteryInfo = MASTERY_LABELS[w.mastery || "new"] || MASTERY_LABELS.new;
    const hasEncounter = (w.encounters || 0) > 0 || (w.correctCount || 0) > 0 || (w.incorrectCount || 0) > 0;

    box.append(
      el(
        "article",
        { class: "item" },
        el(
          "div",
          { class: "head" },
          el("div", { class: "word" }, w.word),
          el("button", { class: "icon", title: "Phát âm từ", onclick: () => speak(w.word) }, svgIcon("speaker"))
        ),
        el(
          "div",
          { class: "meta" },
          w.phonetic && el("span", { class: "ipa" }, w.phonetic),
          w.pos && el("span", { class: "pos" }, abbr(w.pos)),
          el("span", { class: `mastery-badge ${masteryInfo.cls}` }, masteryInfo.label)
        ),
        meaningNode(w),
        exampleBlockNode(w, cycleExampleForWord, openEditModal),
        altsNode(w),
        hasEncounter &&
          el(
            "div",
            { class: "encounter-card-stat" },
            el("span", { class: "enc-pill" }, `👁️ Gặp ${w.encounters || 0} lần`),
            el("span", { class: "enc-pill enc-correct" }, `✓ Đúng: ${w.correctCount || 0}`),
            (w.incorrectCount || 0) > 0 && el("span", { class: "enc-pill enc-wrong" }, `✕ Sai: ${w.incorrectCount}`),
            w.nextReview && el("span", { class: "enc-pill enc-review" }, `Ôn: ${formatNextReview(w.nextReview)}`)
          ),
        w.definition && el("div", { class: "def" }, w.definition),
        w.context && w.context !== w.example && el("div", { class: "ctx" }, highlightKeyword(w.context, w.word)),
        el(
          "div",
          { class: "foot" },
          w.url && el("a", { href: w.url, target: "_blank", rel: "noreferrer", title: w.title || w.url }, domain(w.url)),
          el("span", {}, ago(w.createdAt)),
          (w.count || 1) > 1 && el("span", {}, "×" + w.count),
          el("span", { class: "sp" }),
          w.status !== "done" &&
            el("button", {
              class: "icon",
              title: "Dịch lại",
              onclick: () => chrome.runtime.sendMessage({ type: "RETRY", word: w.word })
            }, svgIcon("retry")),
          el("button", { class: "icon del", title: "Xóa từ này", onclick: () => remove(w.word) }, svgIcon("trash"))
        )
      )
    );
  }
}

// Thêm từ mới từ ô nhập
async function addWordFromInput() {
  const input = $("#addInput");
  const text = (input.value || "").trim();
  if (!text) return;

  input.value = "";
  const res = await chrome.runtime.sendMessage({
    type: "SAVE_WORD",
    text
  });

  if (res?.key) {
    const { words: w = {} } = await chrome.storage.local.get("words");
    words = w;
    renderList();
  }
}

// Xóa từ
async function remove(word) {
  if (confirm(`Bạn có chắc muốn xóa từ "${word}" khỏi sổ?`)) {
    delete words[word];
    await chrome.storage.local.set({ words });
    renderList();
    if (!$("#cards").hidden) renderCard();
  }
}

// Đổi câu ví dụ
async function cycleExampleForWord(word) {
  const res = await chrome.runtime.sendMessage({
    type: "CYCLE_EXAMPLE",
    word
  });
  if (res?.ok) {
    if (words[word]) {
      words[word].example = res.example;
      words[word].exampleTrans = res.exampleTrans;
      renderList();
    }
  } else {
    alert(res?.msg || "Không tìm thấy thêm câu ví dụ nào khác.");
  }
}

// Mở modal chỉnh sửa ví dụ
function openEditModal(word) {
  editingWord = word;
  const w = words[word];
  if (!w) return;
  $("#editModalTitle").textContent = `Chỉnh sửa câu ví dụ cho "${word}"`;
  $("#editModalEn").value = w.example || "";
  $("#editModalVi").value = w.exampleTrans || "";
  $("#editModal").hidden = false;
  $("#editModalEn").focus();
}

function closeEditModal() {
  $("#editModal").hidden = true;
  editingWord = null;
}

// Lưu chỉnh sửa câu ví dụ
async function saveEditedExample() {
  if (!editingWord) return;
  const en = $("#editModalEn").value.trim();
  const vi = $("#editModalVi").value.trim();

  await chrome.runtime.sendMessage({
    type: "UPDATE_EXAMPLE",
    word: editingWord,
    example: en,
    exampleTrans: vi
  });

  if (words[editingWord]) {
    words[editingWord].example = en;
    words[editingWord].exampleTrans = vi;
  }
  closeEditModal();
  renderList();
  if (!$("#cards").hidden) renderCard();
}

// ===== Flashcard Ôn tập =====
function buildDeck() {
  deck = Object.keys(words);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  idx = 0;
  flipped = false;
}

function renderCard() {
  const card = $("#card");
  card.replaceChildren();

  if (!deck.length) {
    $("#deckInfo").textContent = "";
    card.append(
      el("div", { class: "empty" }, el("h2", {}, "Chưa có từ để ôn"), "Lưu hoặc thêm từ vựng rồi quay lại nhé.")
    );
    return;
  }

  const w = words[deck[idx]];
  if (!w) {
    buildDeck();
    return renderCard();
  }

  card.style.setProperty("--c", COLORS[idx % COLORS.length]);
  $("#deckInfo").textContent = `Thẻ ${idx + 1} / ${deck.length}`;

  if (!flipped) {
    card.append(
      el("div", { class: "big" }, w.word),
      w.phonetic && el("div", { class: "ipa" }, w.phonetic),
      el("button", {
        class: "icon",
        title: "Nghe phát âm từ",
        onclick: (e) => { e.stopPropagation(); speak(w.word); }
      }, svgIcon("speaker"))
    );
  } else {
    card.append(
      el("div", { class: "big" }, w.word),
      meaningNode(w),
      exampleBlockNode(w, null, null),
      altsNode(w, 2),
      w.definition && el("div", { class: "def" }, w.definition)
    );
  }
}

const go = (d) => {
  if (!deck.length) return;
  idx = (idx + d + deck.length) % deck.length;
  flipped = false;
  renderCard();
};
const flip = () => {
  flipped = !flipped;
  renderCard();
};

$("#next").onclick = () => go(1);
$("#prev").onclick = () => go(-1);
$("#flip").onclick = flip;
$("#card").onclick = flip;
$("#shuffle").onclick = () => { buildDeck(); renderCard(); };

document.addEventListener("keydown", (e) => {
  if ($("#cards").hidden || ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (e.key === " ") { e.preventDefault(); flip(); }
  else if (e.key === "ArrowRight") go(1);
  else if (e.key === "ArrowLeft") go(-1);
});

// ===== Tabs chuyển đổi =====
document.querySelectorAll(".seg button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("on", x === b));
    $("#list").hidden = b.dataset.tab !== "list";
    $("#cards").hidden = b.dataset.tab !== "cards";
    if (b.dataset.tab === "cards") {
      buildDeck();
      renderCard();
    }
  };
});

// ===== Dán từ từ Clipboard ở sổ từ vựng =====
$("#btnPasteManage").onclick = async () => {
  try {
    const text = await navigator.clipboard.readText();
    const clean = (text || "").trim();
    if (clean) {
      $("#addInput").value = clean;
      addWordFromInput();
    }
  } catch (err) {
    $("#addInput").focus();
  }
};
$("#btnAddWord").onclick = addWordFromInput;
$("#addInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addWordFromInput();
});

// ===== Bộ lọc & Tìm kiếm =====
$("#q").addEventListener("input", renderList);
$("#filterSelect").addEventListener("change", renderList);
$("#sortSelect").addEventListener("change", renderList);

// ===== Modal chỉnh sửa ví dụ =====
$("#closeEditModal").onclick = closeEditModal;
$("#cancelEditModal").onclick = closeEditModal;
$("#saveEditModal").onclick = saveEditedExample;

// ===== Modal Cài đặt AI & Word Encounter =====
$("#btnSettings").onclick = async () => {
  const { geminiApiKey = "", encounterSettings = {} } = await chrome.storage.local.get([
    "geminiApiKey",
    "encounterSettings"
  ]);
  $("#geminiKeyInput").value = geminiApiKey;
  $("#encounterEnabledCheck").checked = encounterSettings.enabled !== false;
  $("#encounterModeSelect").value = encounterSettings.mode || "normal";
  $("#maxPerPageInput").value = encounterSettings.maxPerPage || 15;
  $("#highlightStyleSelect").value = encounterSettings.highlightStyle || "subtle";
  $("#settingsModal").hidden = false;
};
$("#closeSettingsModal").onclick = () => { $("#settingsModal").hidden = true; };
$("#cancelSettingsModal").onclick = () => { $("#settingsModal").hidden = true; };
$("#saveSettingsModal").onclick = async () => {
  const key = $("#geminiKeyInput").value.trim();
  const maxPerPage = Math.max(1, Math.min(100, parseInt($("#maxPerPageInput").value, 10) || 15));
  const encounterSettings = {
    enabled: $("#encounterEnabledCheck").checked,
    mode: $("#encounterModeSelect").value,
    maxPerPage,
    highlightStyle: $("#highlightStyleSelect").value
  };
  await chrome.storage.local.set({ geminiApiKey: key, encounterSettings });
  $("#settingsModal").hidden = true;
  alert("Đã lưu cài đặt thành công!");
};

// ===== Xuất CSV có câu ví dụ, bản dịch và dữ liệu gặp lại từ =====
$("#export").onclick = () => {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = [[
    "word",
    "phonetic",
    "pos",
    "meaning",
    "example",
    "exampleTrans",
    "encounters",
    "correctCount",
    "incorrectCount",
    "mastery",
    "context",
    "url"
  ]];
  for (const w of Object.values(words).sort((a, b) => a.createdAt - b.createdAt)) {
    rows.push([
      w.word,
      w.phonetic || "",
      w.pos || "",
      w.meaning || "",
      w.example || "",
      w.exampleTrans || "",
      w.encounters || 0,
      w.correctCount || 0,
      w.incorrectCount || 0,
      w.mastery || "new",
      w.context || "",
      w.url || ""
    ]);
  }
  const csv = "\ufeff" + rows.map((r) => r.map(q).join(",")).join("\n");
  const a = el("a", {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })),
    download: "englishmdai_vocabulary.csv"
  });
  a.click();
};

// Lắng nghe thay đổi storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.words) {
    words = changes.words.newValue || {};
    renderList();
    if (!$("#cards").hidden) renderCard();
  }
});

// Khởi chạy
chrome.storage.local.get("words").then(({ words: w = {} }) => {
  words = w;
  renderList();
});
