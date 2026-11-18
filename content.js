// ===== englishmdai content.js =====
// 1. Quản lý bôi đen & lấy ngữ cảnh để lưu từ vựng (Alt+S, chuột phải)
// 2. Tính năng Word Encounter: Nhận diện & Highlight các từ đã lưu trên mọi website
// 3. Tính năng Recall: Popup Shadow DOM thông minh cho phép người dùng tự nhập nghĩa để ôn tập thụ động

(() => {
  // ==========================================
  // PHẦN 1: BÔI ĐEN VĂN BẢN & LƯU TỪ VỰNG (GIỮ NGUYÊN)
  // ==========================================
  function getContext(range, text) {
    try {
      let node = range.commonAncestorContainer;
      let el = node.nodeType === 3 ? node.parentElement : node;
      const block = el.closest("p,li,td,th,blockquote,h1,h2,h3,h4,h5,h6,div") || el;
      const full = (block.textContent || "").replace(/\s+/g, " ");
      const i = full.toLowerCase().indexOf(text.toLowerCase());
      if (i < 0) return "";
      let start = i;
      while (start > 0 && !/[.!?]/.test(full[start - 1])) start--;
      let end = i + text.length;
      while (end < full.length && !/[.!?]/.test(full[end])) end++;
      let s = full.slice(start, Math.min(end + 1, full.length)).trim();
      if (s.length > 300) {
        const from = Math.max(0, i - start - 120);
        s = s.slice(from, from + 300).trim();
      }
      return s;
    } catch (e) {
      return "";
    }
  }

  function getSelectionInfo() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const text = sel.toString().trim().replace(/\s+/g, " ");
    if (!text || text.length > 200 || !/[A-Za-z]/.test(text)) return null;
    return { text, context: getContext(sel.getRangeAt(0), text) };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "GET_SELECTION") return;
    const info = getSelectionInfo();
    if (!info) return;
    sendResponse({ ...info, url: location.href, title: document.title });
  });

  // Không chạy encounter trên các frame vô hình hoặc quá nhỏ (< 150px)
  if (window.innerWidth < 150 || window.innerHeight < 150) return;

  // ==========================================
  // PHẦN 2: THUẬT TOÁN ĐỐI SOÁT ĐÁP ÁN TIẾNG VIỆT (HỖ TRỢ CẢ CÓ DẤU & KHÔNG DẤU)
  // ==========================================
  function removeVietnameseTones(str) {
    if (!str) return "";
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d");
  }

  function normalizeVi(str) {
    if (!str) return "";
    return str
      .toLowerCase()
      .normalize("NFC")
      .replace(/[.,;!?\"'()\[\]\-\/\\:_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripPrefixes(str) {
    return str.replace(/^(sự|việc|cái|con|người|đồ|làm|tính|chất|su|viec|cai|con|nguoi|do|lam|tinh|chat)\s+/i, "").trim();
  }

  function checkAnswer(userInput, wordObj) {
    const normUser = normalizeVi(userInput);
    if (!normUser) return false;
    const coreUser = stripPrefixes(normUser);
    const toneUser = removeVietnameseTones(normUser);
    const coreToneUser = removeVietnameseTones(coreUser);

    const candidates = [];
    if (wordObj.meaning) {
      wordObj.meaning.split(/[,;\n\/]/).forEach((t) => candidates.push(t));
    }
    if (Array.isArray(wordObj.alts)) {
      wordObj.alts.forEach((a) => {
        if (Array.isArray(a.terms)) {
          a.terms.forEach((t) => candidates.push(t));
        }
      });
    }

    const allTerms = [];
    candidates.forEach((c) => {
      const raw = normalizeVi(c);
      if (raw) allTerms.push(raw);
      const withoutParens = normalizeVi(c.replace(/\([^)]*\)/g, ""));
      if (withoutParens && withoutParens !== raw) allTerms.push(withoutParens);
      const core = stripPrefixes(raw);
      if (core && core !== raw) allTerms.push(core);
    });

    for (const term of allTerms) {
      const coreTerm = stripPrefixes(term);
      const toneTerm = removeVietnameseTones(term);
      const coreToneTerm = removeVietnameseTones(coreTerm);

      // 1. So khớp có dấu chuẩn
      if (term === normUser || term === coreUser || coreTerm === normUser || coreTerm === coreUser) {
        return true;
      }

      // 2. So khớp KHÔNG DẤU (cho phép người dùng gõ không dấu)
      if (
        toneTerm === toneUser ||
        toneTerm === coreToneUser ||
        coreToneTerm === toneUser ||
        coreToneTerm === coreToneUser
      ) {
        return true;
      }

      // 3. Hỗ trợ biến âm thông dụng s/x (sốt / xốt / sot / xot)
      const sUser = normUser.replace(/x/g, "s");
      const sTerm = term.replace(/x/g, "s");
      if (sUser === sTerm) return true;

      const sToneUser = toneUser.replace(/x/g, "s");
      const sToneTerm = toneTerm.replace(/x/g, "s");
      if (sToneUser === sToneTerm) return true;

      // 4. Khớp từ khóa bao hàm nếu độ dài đủ ý nghĩa (>= 3 ký tự)
      if (normUser.length >= 3 && term.length >= 3) {
        if (term.includes(normUser) || normUser.includes(term)) return true;
      }
      if (toneUser.length >= 3 && toneTerm.length >= 3) {
        if (toneTerm.includes(toneUser) || toneUser.includes(toneTerm)) return true;
      }
    }
    return false;
  }

  // ==========================================
  // PHẦN 3: BỘ MÁY WORD ENCOUNTER TRÊN DOM
  // ==========================================
  let savedWordsMap = new Map();
  let encounterSettings = {
    enabled: true,
    mode: "normal", // "normal" | "challenge" | "focus"
    maxPerPage: 15,
    highlightStyle: "subtle"
  };

  let compiledRegex = null;
  let isHighlighting = false;
  let highlightedCount = 0;
  let encounterObserver = null;
  let debounceTimer = null;

  // Tiêm stylesheet CSS trực tiếp cho phần highlight trên website
  function injectHighlightStyles() {
    if (document.getElementById("emd-highlight-styles")) return;
    const style = document.createElement("style");
    style.id = "emd-highlight-styles";
    style.textContent = `
      .emd-word-encounter {
        background-color: rgba(59, 130, 246, 0.12) !important;
        border-bottom: 1.5px dashed #2563eb !important;
        border-radius: 3px !important;
        padding: 0 2px !important;
        cursor: pointer !important;
        transition: background-color 0.15s ease, border-color 0.15s ease !important;
        color: inherit !important;
        text-decoration: none !important;
        display: inline !important;
        box-decoration-break: clone !important;
        -webkit-box-decoration-break: clone !important;
      }
      .emd-word-encounter:hover {
        background-color: rgba(59, 130, 246, 0.26) !important;
        border-bottom-color: #1d4ed8 !important;
      }
      .emd-word-encounter.emd-style-highlight {
        background-color: rgba(254, 240, 138, 0.45) !important;
        border-bottom: 1.5px solid #eab308 !important;
      }
      .emd-word-encounter.emd-style-highlight:hover {
        background-color: rgba(254, 240, 138, 0.75) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function compileRegex() {
    if (!savedWordsMap.size) {
      compiledRegex = null;
      return;
    }
    // Sắp xếp từ dài trước từ ngắn để ưu tiên khớp cụm từ (ví dụ "look after" trước "look")
    const words = Array.from(savedWordsMap.keys()).sort((a, b) => b.length - a.length);
    const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    // Khớp từ chính xác theo word boundary \b (art không bị khớp thành article hay party)
    compiledRegex = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  }

  function isNodeEligible(node) {
    const parent = node.parentElement;
    if (!parent) return NodeFilter.FILTER_REJECT;
    const tag = parent.tagName;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT|PRE|CODE|KBD|SAMP|SVG|CANVAS|AUDIO|VIDEO|IFRAME|EMBED|OBJECT|BUTTON)$/i.test(tag)) {
      return NodeFilter.FILTER_REJECT;
    }
    if (parent.isContentEditable || parent.closest("[contenteditable='true']")) {
      return NodeFilter.FILTER_REJECT;
    }
    if (parent.closest("[data-emd-encounter], #emd-encounter-root, .monaco-editor, .ace_editor, .CodeMirror")) {
      return NodeFilter.FILTER_REJECT;
    }
    const val = node.nodeValue;
    if (!val || val.length < 2 || !/[A-Za-z]/.test(val)) {
      return NodeFilter.FILTER_REJECT;
    }
    return NodeFilter.FILTER_ACCEPT;
  }

  function highlightTextNode(textNode) {
    if (!compiledRegex || isHighlighting) return;
    if (encounterSettings.mode === "focus" && highlightedCount >= encounterSettings.maxPerPage) {
      return;
    }

    const text = textNode.nodeValue;
    compiledRegex.lastIndex = 0;
    const match = compiledRegex.exec(text);
    if (!match) return;

    const matchedWord = match[0];
    const key = matchedWord.toLowerCase();
    const wordObj = savedWordsMap.get(key);
    if (!wordObj) return;

    const matchStart = match.index;
    const matchEnd = matchStart + matchedWord.length;

    // Tách text node một cách an toàn mà không làm hỏng event listener của phần tử cha
    const beforeText = text.substring(0, matchStart);
    const afterText = text.substring(matchEnd);

    const mark = document.createElement("mark");
    mark.className = `emd-word-encounter ${encounterSettings.highlightStyle === "highlight" ? "emd-style-highlight" : ""}`;
    mark.setAttribute("data-emd-word", key);
    mark.setAttribute("data-emd-encounter", "true");
    mark.textContent = matchedWord;

    const parent = textNode.parentNode;
    if (!parent) return;

    isHighlighting = true;
    try {
      if (beforeText) {
        parent.insertBefore(document.createTextNode(beforeText), textNode);
      }
      parent.insertBefore(mark, textNode);
      if (afterText) {
        const afterNode = document.createTextNode(afterText);
        parent.insertBefore(afterNode, textNode);
        parent.removeChild(textNode);
        // Quét tiếp phần text còn lại nếu chưa vượt giới hạn
        if (compiledRegex.test(afterText)) {
          highlightTextNode(afterNode);
        }
      } else {
        parent.removeChild(textNode);
      }
      highlightedCount++;

      // Ghi nhận gặp lại từ
      chrome.runtime.sendMessage({ type: "RECORD_ENCOUNTER", word: key });
    } catch (e) {
    } finally {
      isHighlighting = false;
    }
  }

  function scanAndHighlightRoot(root = document.body) {
    if (!encounterSettings.enabled || !compiledRegex || !root) return;
    if (encounterSettings.mode === "focus" && highlightedCount >= encounterSettings.maxPerPage) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: isNodeEligible
    });

    const nodesToProcess = [];
    let current = walker.nextNode();
    while (current) {
      nodesToProcess.push(current);
      current = walker.nextNode();
    }

    for (const node of nodesToProcess) {
      if (encounterSettings.mode === "focus" && highlightedCount >= encounterSettings.maxPerPage) break;
      highlightTextNode(node);
    }
  }

  function setupMutationObserver() {
    if (encounterObserver) encounterObserver.disconnect();
    encounterObserver = new MutationObserver((mutations) => {
      if (isHighlighting || !encounterSettings.enabled || !compiledRegex) return;

      let hasAddedNodes = false;
      for (const m of mutations) {
        if (m.type === "childList" && m.addedNodes.length > 0) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1 && !node.hasAttribute("data-emd-encounter") && node.id !== "emd-encounter-root") {
              hasAddedNodes = true;
              break;
            }
          }
        }
        if (hasAddedNodes) break;
      }

      if (hasAddedNodes) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          scanAndHighlightRoot(document.body);
        }, 350);
      }
    });

    encounterObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // ==========================================
  // PHẦN 4: POPUP SHADOW DOM TỰ NHẬP NGHĨA (RECALL POPUP)
  // ==========================================
  let shadowRoot = null;
  let popupContainer = null;
  let activeMarkElement = null;
  let activeWordData = null;

  function initShadowDOM() {
    if (shadowRoot) return;
    const host = document.createElement("div");
    host.id = "emd-encounter-root";
    host.style.cssText = "all: initial; position: absolute; top: 0; left: 0; z-index: 2147483647;";
    (document.body || document.documentElement).appendChild(host);

    shadowRoot = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Roboto, sans-serif; font-size: 13px; line-height: 1.45; color: #0f172a; }
      .popup-box {
        position: absolute;
        width: 300px;
        background: #ffffff;
        border: 1.5px solid #bfdbfe;
        border-radius: 16px;
        box-shadow: 0 12px 36px rgba(15, 23, 42, 0.16), 0 2px 8px rgba(37, 99, 235, 0.1);
        padding: 14px 16px;
        opacity: 0;
        transform: translateY(6px) scale(0.98);
        transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: none;
        z-index: 2147483647;
      }
      .popup-box.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      /* Header */
      .p-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
      .p-title-wrap { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
      .p-word { font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em; }
      .p-ipa { font-size: 12px; color: #64748b; font-family: Consolas, monospace; }
      .p-actions { display: flex; align-items: center; gap: 4px; }
      .p-btn-icon {
        all: unset; cursor: pointer; width: 26px; height: 26px; border-radius: 50%;
        display: grid; place-items: center; color: #64748b; background: #f8fafc;
        border: 1px solid #e2e8f0; transition: all 0.12s;
      }
      .p-btn-icon:hover { color: #2563eb; background: #eff6ff; border-color: #bfdbfe; }
      .p-btn-close {
        all: unset; cursor: pointer; width: 22px; height: 22px; border-radius: 50%;
        display: grid; place-items: center; color: #94a3b8; font-size: 14px; transition: all 0.12s;
      }
      .p-btn-close:hover { color: #0f172a; background: #f1f5f9; }

      /* Badges */
      .p-badges { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
      .p-tag {
        font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: 9999px;
        background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;
      }
      .p-tag.stat { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }
      .p-tag.mastery-new { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
      .p-tag.mastery-learning { background: #fffbeb; color: #d97706; border-color: #fde68a; }
      .p-tag.mastery-familiar { background: #faf5ff; color: #9333ea; border-color: #e9d5ff; }
      .p-tag.mastery-mastered { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }

      /* State 1: Discovery Prompt */
      .prompt-box {
        background: linear-gradient(135deg, #f8fafc, #eff6ff);
        border: 1px solid #dbeafe; border-radius: 12px; padding: 12px; text-align: center;
      }
      .prompt-desc { font-size: 12px; color: #475569; margin-bottom: 10px; }
      .btn-recall-main {
        all: unset; cursor: pointer; width: 100%; padding: 8px 0; border-radius: 9999px;
        background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff;
        font-size: 12.5px; font-weight: 600; text-align: center;
        box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25); transition: all 0.15s;
        display: flex; align-items: center; justify-content: center; gap: 6px;
      }
      .btn-recall-main:hover { filter: brightness(1.08); transform: translateY(-1px); }
      .btn-peek-link {
        all: unset; cursor: pointer; display: inline-block; margin-top: 8px;
        font-size: 11px; color: #64748b; text-decoration: underline; transition: color 0.12s;
      }
      .btn-peek-link:hover { color: #2563eb; }

      /* State 2: Recall Input */
      .recall-form { display: flex; flex-direction: column; gap: 8px; }
      .recall-label { font-size: 11.5px; font-weight: 600; color: #334155; }
      .recall-input {
        width: 100%; padding: 8px 12px; border-radius: 9999px; border: 1.5px solid #93c5fd;
        background: #ffffff; font-size: 13px; color: #0f172a; outline: none;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
      }
      .recall-input:focus { border-color: #2563eb; }
      .recall-btns { display: flex; gap: 6px; }
      .btn-check {
        all: unset; cursor: pointer; flex: 1; padding: 7px 0; border-radius: 9999px;
        background: #2563eb; color: #fff; font-size: 12px; font-weight: 600; text-align: center;
        box-shadow: 0 1px 4px rgba(37, 99, 235, 0.2); transition: all 0.12s;
      }
      .btn-check:hover { background: #1d4ed8; }
      .btn-skip {
        all: unset; cursor: pointer; padding: 7px 14px; border-radius: 9999px;
        background: #f1f5f9; color: #64748b; font-size: 12px; font-weight: 600; text-align: center;
        border: 1px solid #e2e8f0; transition: all 0.12s;
      }
      .btn-skip:hover { background: #e2e8f0; color: #0f172a; }

      /* State 3 & 4: Results */
      .res-banner {
        padding: 8px 10px; border-radius: 10px; margin-bottom: 8px; font-size: 12px; font-weight: 600;
        display: flex; align-items: center; gap: 6px;
      }
      .res-banner.correct { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
      .res-banner.incorrect { background: #fff1f2; color: #e11d48; border: 1px solid #fecdd3; }
      .res-detail { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; }
      .res-row { display: flex; gap: 4px; }
      .res-lbl { color: #64748b; font-size: 11px; font-weight: 600; flex: none; width: 68px; }
      .res-val { color: #0f172a; font-weight: 500; }
      .res-val.meaning-strong { color: #2563eb; font-weight: 700; font-size: 14px; }
      .res-val.user-wrong { color: #e11d48; text-decoration: line-through; }

      /* Example Box in Popup */
      .p-example {
        margin-top: 8px; padding: 8px 10px; border-radius: 10px;
        background: #f0f7ff; border: 1px solid #bfdbfe; font-size: 12px;
      }
      .p-ex-en { color: #0f172a; font-weight: 500; margin-bottom: 2px; }
      .p-ex-vi { color: #475569; font-style: italic; }

      .btn-done {
        all: unset; cursor: pointer; width: 100%; margin-top: 10px; padding: 6px 0; border-radius: 9999px;
        background: #f8fafc; color: #334155; font-size: 11.5px; font-weight: 600; text-align: center;
        border: 1px solid #e2e8f0; transition: all 0.12s; display: block;
      }
      .btn-done:hover { background: #f1f5f9; color: #0f172a; }
    `;
    shadowRoot.appendChild(style);

    popupContainer = document.createElement("div");
    popupContainer.className = "popup-box";
    shadowRoot.appendChild(popupContainer);

    // Đóng khi click ra ngoài hoặc bấm Escape
    document.addEventListener("mousedown", (e) => {
      if (!popupContainer || !popupContainer.classList.contains("visible")) return;
      const path = e.composedPath();
      if (!path.includes(host) && !path.includes(activeMarkElement)) {
        hidePopup();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && popupContainer?.classList.contains("visible")) {
        hidePopup();
      }
    });
  }

  function getMasteryLabel(mastery) {
    switch (mastery) {
      case "mastered": return { text: "Thành thạo", cls: "mastery-mastered" };
      case "familiar": return { text: "Quen thuộc", cls: "mastery-familiar" };
      case "learning": return { text: "Đang học", cls: "mastery-learning" };
      default: return { text: "Mới lưu", cls: "mastery-new" };
    }
  }

  function playTts(text) {
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function positionPopup(targetEl) {
    if (!popupContainer || !targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    const popupWidth = 300;
    const popupHeight = 240; // ước tính

    let left = rect.left + rect.width / 2 - popupWidth / 2 + window.scrollX;
    let top = rect.bottom + 8 + window.scrollY;

    // Giới hạn trong mép màn hình
    const minLeft = window.scrollX + 10;
    const maxLeft = window.scrollX + window.innerWidth - popupWidth - 14;
    left = Math.max(minLeft, Math.min(maxLeft, left));

    // Nếu gần mép dưới màn hình thì mở lên phía trên từ
    if (rect.bottom + popupHeight > window.innerHeight && rect.top > popupHeight) {
      top = rect.top - popupHeight - 8 + window.scrollY;
    }

    popupContainer.style.left = `${left}px`;
    popupContainer.style.top = `${top}px`;
  }

  function hidePopup() {
    if (popupContainer) {
      popupContainer.classList.remove("visible");
    }
    activeMarkElement = null;
    activeWordData = null;
  }

  // Render trạng thái 1: Nhận diện & Nhắc nhở (Không hiện nghĩa trước!)
  function renderDiscoveryView(wordObj) {
    const masteryInfo = getMasteryLabel(wordObj.mastery);
    popupContainer.innerHTML = `
      <div class="p-head">
        <div class="p-title-wrap">
          <span class="p-word">${wordObj.word}</span>
          ${wordObj.phonetic ? `<span class="p-ipa">${wordObj.phonetic}</span>` : ""}
        </div>
        <div class="p-actions">
          <button class="p-btn-icon" id="btnTts" title="Phát âm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
          </button>
          <button class="p-btn-close" id="btnClose">✕</button>
        </div>
      </div>

      <div class="p-badges">
        <span class="p-tag">Đã lưu trước đó</span>
        <span class="p-tag stat">Gặp: ${wordObj.encounters || 1} lần</span>
        <span class="p-tag ${masteryInfo.cls}">${masteryInfo.text}</span>
      </div>

      <div class="prompt-box">
        <div class="prompt-desc">Bạn có nhớ từ này có nghĩa là gì không?</div>
        <button class="btn-recall-main" id="btnStartRecall">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"></path><line x1="9" y1="21" x2="15" y2="21"></line></svg>
          Thử nhớ nghĩa
        </button>
        <button class="btn-peek-link" id="btnPeek">Xem nghĩa ngay</button>
      </div>
    `;

    shadowRoot.getElementById("btnTts").onclick = () => playTts(wordObj.word);
    shadowRoot.getElementById("btnClose").onclick = hidePopup;
    shadowRoot.getElementById("btnStartRecall").onclick = () => renderRecallInputView(wordObj);
    shadowRoot.getElementById("btnPeek").onclick = () => renderResultView(wordObj, null, "peek");
  }

  // Render trạng thái 2: Người dùng tự nhập nghĩa
  function renderRecallInputView(wordObj) {
    popupContainer.innerHTML = `
      <div class="p-head">
        <div class="p-title-wrap">
          <span class="p-word">${wordObj.word}</span>
          ${wordObj.phonetic ? `<span class="p-ipa">${wordObj.phonetic}</span>` : ""}
        </div>
        <button class="p-btn-close" id="btnClose">✕</button>
      </div>

      <div class="recall-form">
        <label class="recall-label">Nhập nghĩa bạn nhớ (có dấu hoặc không dấu):</label>
        <input type="text" class="recall-input" id="recallAnswerInput" placeholder="Ví dụ: nuoc xot, tuy nhien, gia vi..." autocomplete="off">
        <div class="recall-btns">
          <button class="btn-check" id="btnCheckAnswer">Kiểm tra</button>
          <button class="btn-skip" id="btnSkip">Bỏ qua</button>
        </div>
      </div>
    `;

    shadowRoot.getElementById("btnClose").onclick = hidePopup;
    const input = shadowRoot.getElementById("recallAnswerInput");
    setTimeout(() => input.focus(), 60);

    const onCheck = () => {
      const val = input.value.trim();
      if (!val) {
        input.focus();
        return;
      }
      const isCorrect = checkAnswer(val, wordObj);
      chrome.runtime.sendMessage({
        type: "RECORD_RECALL_RESULT",
        word: wordObj.word,
        isCorrect
      }, (res) => {
        if (res?.ok) {
          Object.assign(wordObj, res);
        }
      });
      renderResultView(wordObj, val, isCorrect ? "correct" : "incorrect");
    };

    shadowRoot.getElementById("btnCheckAnswer").onclick = onCheck;
    input.onkeydown = (e) => {
      if (e.key === "Enter") onCheck();
    };
    shadowRoot.getElementById("btnSkip").onclick = () => {
      renderResultView(wordObj, null, "skipped");
    };
  }

  // Render trạng thái 3, 4, 5: Kết quả kiểm tra
  function renderResultView(wordObj, userAns, state) {
    let bannerHtml = "";
    if (state === "correct") {
      bannerHtml = `
        <div class="res-banner correct">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Chính xác! Bạn nhớ rất tốt.
        </div>
      `;
    } else if (state === "incorrect") {
      bannerHtml = `
        <div class="res-banner incorrect">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
          Chưa chính xác, cùng ghi nhớ lại nhé!
        </div>
      `;
    }

    popupContainer.innerHTML = `
      <div class="p-head">
        <div class="p-title-wrap">
          <span class="p-word">${wordObj.word}</span>
          ${wordObj.phonetic ? `<span class="p-ipa">${wordObj.phonetic}</span>` : ""}
        </div>
        <div class="p-actions">
          <button class="p-btn-icon" id="btnTts" title="Phát âm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
          </button>
          <button class="p-btn-close" id="btnClose">✕</button>
        </div>
      </div>

      ${bannerHtml}

      <div class="res-detail">
        ${userAns && state === "incorrect" ? `
          <div class="res-row">
            <span class="res-lbl">Bạn nhập:</span>
            <span class="res-val user-wrong">${userAns}</span>
          </div>
        ` : ""}

        <div class="res-row">
          <span class="res-lbl">Nghĩa đúng:</span>
          <span class="res-val meaning-strong">${wordObj.meaning || "Chưa có nghĩa"}</span>
        </div>

        ${wordObj.example ? `
          <div class="p-example">
            <div class="p-ex-en">“${wordObj.example}”</div>
            ${wordObj.exampleTrans ? `<div class="p-ex-vi">${wordObj.exampleTrans}</div>` : ""}
          </div>
        ` : ""}
      </div>

      <button class="btn-done" id="btnDone">Đóng</button>
    `;

    shadowRoot.getElementById("btnTts").onclick = () => playTts(wordObj.word);
    shadowRoot.getElementById("btnClose").onclick = hidePopup;
    shadowRoot.getElementById("btnDone").onclick = hidePopup;
  }

  function openEncounterPopup(targetEl, wordObj) {
    initShadowDOM();
    activeMarkElement = targetEl;
    activeWordData = wordObj;
    renderDiscoveryView(wordObj);
    positionPopup(targetEl);
    popupContainer.classList.add("visible");
  }

  // Lắng nghe click vào từ highlight trên trang
  document.addEventListener("click", (e) => {
    const mark = e.target.closest(".emd-word-encounter");
    if (!mark) return;
    const wordKey = mark.getAttribute("data-emd-word");
    if (!wordKey) return;

    const wordObj = savedWordsMap.get(wordKey.toLowerCase());
    if (!wordObj) return;

    e.preventDefault();
    e.stopPropagation();
    openEncounterPopup(mark, wordObj);
  });

  // ==========================================
  // PHẦN 5: KHỞI TẠO & ĐỒNG BỘ VỚI STORAGE
  // ==========================================
  async function loadAndInitialize() {
    try {
      const { words = {}, encounterSettings: st = {} } = await chrome.storage.local.get([
        "words",
        "encounterSettings"
      ]);
      encounterSettings = Object.assign(encounterSettings, st);
      savedWordsMap.clear();

      for (const [k, v] of Object.entries(words)) {
        if (v && v.word && (v.meaning || v.status === "done")) {
          savedWordsMap.set(k.toLowerCase().trim(), v);
        }
      }

      injectHighlightStyles();
      compileRegex();
      highlightedCount = 0;
      scanAndHighlightRoot(document.body);
      setupMutationObserver();
    } catch (e) {}
  }

  // Lắng nghe thay đổi storage từ popup hoặc sổ từ vựng
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.words) {
      const newWords = changes.words.newValue || {};
      savedWordsMap.clear();
      for (const [k, v] of Object.entries(newWords)) {
        if (v && v.word && (v.meaning || v.status === "done")) {
          savedWordsMap.set(k.toLowerCase().trim(), v);
        }
      }
      compileRegex();
      highlightedCount = 0;
      scanAndHighlightRoot(document.body);
    }
    if (changes.encounterSettings) {
      encounterSettings = Object.assign(encounterSettings, changes.encounterSettings.newValue || {});
      if (!encounterSettings.enabled) {
        // Xóa highlight nếu tắt tính năng
        document.querySelectorAll(".emd-word-encounter").forEach((el) => {
          el.replaceWith(document.createTextNode(el.textContent));
        });
      } else {
        highlightedCount = 0;
        scanAndHighlightRoot(document.body);
      }
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAndInitialize);
  } else {
    loadAndInitialize();
  }
})();
