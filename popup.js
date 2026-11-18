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

let currentKey = null;
let currentWordObj = null;
let autoClose = false;
let closeTimer = null;
let allWordsCache = {};

function tts(text) {
  if (!text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.95;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function speakWordAudio(wObj) {
  if (!wObj) return;
  if (wObj.audio) {
    const audio = new Audio(wObj.audio);
    audio.play().catch(() => tts(wObj.word));
  } else {
    tts(wObj.word);
  }
}

function highlightKeyword(sentence, word) {
  const container = document.createDocumentFragment();
  if (!sentence || !word) {
    container.append(sentence || "");
    return container;
  }
  const cleanWord = word.trim().toLowerCase();
  const idx = sentence.toLowerCase().indexOf(cleanWord);
  if (idx < 0) {
    container.append(sentence);
    return container;
  }
  container.append(
    sentence.slice(0, idx),
    (() => {
      const mark = document.createElement("mark");
      mark.className = "kw";
      mark.textContent = sentence.slice(idx, idx + cleanWord.length);
      return mark;
    })(),
    sentence.slice(idx + cleanWord.length)
  );
  return container;
}

function armAutoClose(durationMs = 4000) {
  if (!autoClose) return;
  clearTimeout(closeTimer);
  const bar = $("#bar");
  bar.classList.remove("run", "paused");
  void bar.offsetWidth; // reset animation
  bar.classList.add("run");
  closeTimer = setTimeout(() => {
    chrome.storage.local.remove("lastSaved");
    window.close();
  }, durationMs);
}

// Tạm dừng đếm ngược khi di chuột vào popup
document.body.addEventListener("mouseenter", () => {
  if (closeTimer) {
    clearTimeout(closeTimer);
    $("#bar").classList.add("paused");
  }
});
document.body.addEventListener("mouseleave", () => {
  if (autoClose && currentWordObj?.status === "done") {
    $("#bar").classList.remove("paused");
    closeTimer = setTimeout(() => {
      chrome.storage.local.remove("lastSaved");
      window.close();
    }, 2500);
  }
});

// Chuyển sang giao diện Tra cứu / Tìm từ mặc định
function showSearchView(words = allWordsCache) {
  $("#searchView").hidden = false;
  $("#wordView").hidden = true;
  $("#bar").classList.remove("run");
  autoClose = false;
  currentKey = null;
  currentWordObj = null;

  // Hiển thị danh sách các từ gần đây dạng viên thuốc (chips)
  const recentList = Object.values(words).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  const recentChips = $("#recentChips");
  recentChips.replaceChildren();

  if (recentList.length > 0) {
    $("#recentWrap").hidden = false;
    for (const w of recentList.slice(0, 6)) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip-word";
      chip.textContent = w.word;
      chip.onclick = () => {
        $("#wordInput").value = w.word;
        lookupWord(w.word);
      };
      recentChips.append(chip);
    }
  } else {
    $("#recentWrap").hidden = true;
  }

  setTimeout(() => $("#wordInput").focus(), 80);
}

// Hiển thị chi tiết từ vựng và câu ví dụ
function renderWord(w) {
  currentWordObj = w;
  $("#searchView").hidden = true;
  $("#wordView").hidden = false;

  const altsBox = $("#a");
  const exCard = $("#exampleCard");
  const exEn = $("#exampleEn");
  const exVi = $("#exampleVi");
  const wordTools = $("#wordTools");
  const statusPill = $("#statusPill");

  altsBox.replaceChildren();
  exEn.replaceChildren();
  exVi.textContent = "";

  if (!w) {
    showSearchView();
    return;
  }

  $("#w").textContent = w.word;
  $("#p").textContent = w.phonetic || "";
  $("#pos").hidden = !w.pos;
  $("#pos").textContent = ABBR[w.pos] || w.pos || "";
  wordTools.hidden = false;

  if (w.status === "done" && w.meaning) {
    statusPill.hidden = false;
    statusPill.textContent = "✓ Đã lưu";
    $("#m").textContent = w.meaning;
    $("#m").className = "meaning-box";

    // Hiển thị câu ví dụ
    if (w.example) {
      exCard.hidden = false;
      exEn.replaceChildren(highlightKeyword(w.example, w.word));
      exVi.textContent = w.exampleTrans || "";
    } else {
      exCard.hidden = true;
    }

    // Hiển thị các nghĩa phụ
    for (const a of (w.alts || []).slice(0, 2)) {
      const row = document.createElement("div");
      const b = document.createElement("b");
      b.textContent = ABBR[a.pos] || a.pos;
      row.append(b, a.terms.slice(0, 3).join(", "));
      altsBox.append(row);
    }

    if (autoClose) {
      armAutoClose(4000);
    }
  } else if (w.status === "error") {
    statusPill.hidden = true;
    $("#m").textContent = "Chưa dịch được từ này.";
    $("#m").className = "meaning-box wait";
    exCard.hidden = true;
  } else {
    statusPill.hidden = false;
    statusPill.textContent = "⏳ Đang tra...";
    $("#m").textContent = "Đang tra nghĩa và tạo câu ví dụ…";
    $("#m").className = "meaning-box wait";
    exCard.hidden = true;
  }
}

// Xử lý tra cứu từ
async function lookupWord(text) {
  const clean = (text || "").trim();
  if (!clean) return;
  autoClose = false; // Tra thủ công thì không tự tắt
  $("#bar").classList.remove("run");

  currentKey = clean.toLowerCase();
  renderWord({ word: clean, status: "pending" });

  const res = await chrome.runtime.sendMessage({
    type: "SAVE_WORD",
    text: clean
  });

  if (res?.key) {
    currentKey = res.key;
    const { words = {} } = await chrome.storage.local.get("words");
    allWordsCache = words;
    if (words[currentKey]) {
      renderWord(words[currentKey]);
    }
  }
}

// Submit tra từ
$("#inputForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const val = $("#wordInput").value;
  lookupWord(val);
  $("#wordInput").select();
});

// Nút dán từ từ clipboard
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    const clean = (text || "").trim();
    if (clean) {
      $("#wordInput").value = clean;
      lookupWord(clean);
    }
  } catch (err) {
    $("#wordInput").focus();
    $("#wordInput").select();
  }
}

$("#btnPaste").addEventListener("click", pasteFromClipboard);
$("#btnHeroPaste").addEventListener("click", pasteFromClipboard);

// Quay lại giao diện tra từ
$("#btnBackToSearch").addEventListener("click", () => {
  $("#wordInput").value = "";
  showSearchView();
});

// Nút phát âm từ vựng
$("#speakWord").addEventListener("click", () => {
  speakWordAudio(currentWordObj);
});

// Nút sao chép từ
$("#copyWord").addEventListener("click", async () => {
  if (currentWordObj?.word) {
    await navigator.clipboard.writeText(currentWordObj.word);
    const pill = $("#statusPill");
    pill.hidden = false;
    const old = pill.textContent;
    pill.textContent = "✓ Đã chép";
    setTimeout(() => { pill.textContent = old; }, 1500);
  }
});

// Nút nghe phát âm cả câu ví dụ
$("#speakExample").addEventListener("click", () => {
  if (currentWordObj?.example) {
    tts(currentWordObj.example);
  }
});

// Nút đổi câu ví dụ khác
$("#cycleExample").addEventListener("click", async () => {
  if (!currentWordObj?.word) return;
  const btn = $("#cycleExample");
  const oldHtml = btn.innerHTML;
  btn.textContent = "Đang đổi...";
  const res = await chrome.runtime.sendMessage({
    type: "CYCLE_EXAMPLE",
    word: currentWordObj.word
  });
  btn.innerHTML = oldHtml;
  if (res?.ok && res.example) {
    currentWordObj.example = res.example;
    currentWordObj.exampleTrans = res.exampleTrans;
    $("#exampleEn").replaceChildren(highlightKeyword(res.example, currentWordObj.word));
    $("#exampleVi").textContent = res.exampleTrans || "";
  }
});

// Mở sổ từ vựng
const openOptions = () => {
  chrome.runtime.openOptionsPage();
  window.close();
};
$("#openNotebook").addEventListener("click", openOptions);
$("#openFull").addEventListener("click", openOptions);

// Theo dõi thay đổi storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.words?.newValue) {
      allWordsCache = changes.words.newValue;
      if (currentKey && changes.words.newValue[currentKey]) {
        renderWord(changes.words.newValue[currentKey]);
      }
    }
  }
});

// Khởi chạy khi mở popup
(async () => {
  const { lastSaved, words = {} } = await chrome.storage.local.get(["lastSaved", "words"]);
  allWordsCache = words;

  const now = Date.now();
  // Chỉ hiển thị từ vừa lưu nếu hành động lưu diễn ra trong vòng 4.5 giây trước
  const isJustSaved = lastSaved && (now - (lastSaved.at || 0) < 4500) && words[lastSaved.key];

  if (isJustSaved) {
    // Trường hợp 1: Vừa bôi đen lưu xong -> hiện từ đó trong 4 giây rồi tự đóng
    currentKey = lastSaved.key;
    autoClose = true;
    renderWord(words[currentKey]);
    armAutoClose(4000);
    // Xóa luôn lastSaved để lần sau bấm vào icon tiện ích sẽ chỉ hiện tra cứu
    chrome.storage.local.remove("lastSaved");
  } else {
    // Trường hợp 2: Bấm vào extension để sử dụng -> CHỈ HIỆN TRA CỨU HOẶC TÌM TỪ
    chrome.storage.local.remove("lastSaved");
    showSearchView(words);
  }
})();
