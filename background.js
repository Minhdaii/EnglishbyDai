// ===== englishmdai background.js =====
// Quản lý lưu trữ từ vựng, tự dịch nghĩa, tự tạo câu ví dụ và đồng bộ

let queue = Promise.resolve();
function withLock(fn) {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
}

async function getAll() {
  const { words = {} } = await chrome.storage.local.get("words");
  return words;
}

async function patchWord(key, patch) {
  return withLock(async () => {
    const words = await getAll();
    if (!words[key]) return;
    Object.assign(words[key], patch);
    await chrome.storage.local.set({ words });
  });
}

// ===== Danh mục ví dụ thông dụng chuẩn giao tiếp hàng ngày =====
const CURATED_EXAMPLES = {
  name: { en: "What is your name?", vi: "Tên của bạn là gì?" },
  apple: { en: "She eats a fresh red apple every morning.", vi: "Cô ấy ăn một quả táo đỏ tươi mỗi sáng." },
  book: { en: "I am reading a very interesting book.", vi: "Tôi đang đọc một cuốn sách rất thú vị." },
  learn: { en: "I want to learn English to communicate with everyone.", vi: "Tôi muốn học tiếng Anh để giao tiếp với mọi người." },
  study: { en: "He studies English for two hours every day.", vi: "Anh ấy học tiếng Anh hai tiếng mỗi ngày." },
  water: { en: "Could you give me a glass of water, please?", vi: "Làm ơn cho tôi xin một cốc nước được không?" },
  time: { en: "What time is it right now?", vi: "Bây giờ là mấy giờ rồi?" },
  happy: { en: "I am very happy to meet you.", vi: "Tôi rất vui được gặp bạn." },
  beautiful: { en: "She has a beautiful smile.", vi: "Cô ấy có một nụ cười thật đẹp." },
  help: { en: "Can you help me with this problem?", vi: "Bạn có thể giúp tôi giải quyết vấn đề này không?" },
  friend: { en: "A good friend is always there when you need them.", vi: "Một người bạn tốt luôn ở bên khi bạn cần." },
  family: { en: "I always have dinner with my family on weekends.", vi: "Tôi luôn ăn tối cùng gia đình vào cuối tuần." },
  home: { en: "There is no place like home.", vi: "Không có nơi nào ấm áp bằng nhà của mình." },
  house: { en: "They bought a new house near the beach.", vi: "Họ vừa mua một ngôi nhà mới ở gần bãi biển." },
  work: { en: "I work at a software company.", vi: "Tôi làm việc tại một công ty phần mềm." },
  job: { en: "She is looking for a new job in design.", vi: "Cô ấy đang tìm một công việc mới trong ngành thiết kế." },
  money: { en: "Time is more valuable than money.", vi: "Thời gian quý giá hơn tiền bạc." },
  school: { en: "The children walk to school together.", vi: "Bọn trẻ cùng nhau đi bộ đến trường." },
  student: { en: "He is a hard-working student.", vi: "Cậu ấy là một học sinh chăm chỉ." },
  teacher: { en: "Our English teacher is very kind and patient.", vi: "Giáo viên tiếng Anh của chúng tôi rất tốt bụng và kiên nhẫn." },
  doctor: { en: "You should see a doctor if you feel unwell.", vi: "Bạn nên đi khám bác sĩ nếu cảm thấy không khỏe." },
  food: { en: "Vietnamese food is famous all over the world.", vi: "Món ăn Việt Nam nổi tiếng khắp thế giới." },
  car: { en: "He drives his car to work every morning.", vi: "Anh ấy lái xe hơi đi làm mỗi sáng." },
  bus: { en: "Hurry up or we will miss the bus!", vi: "Nhanh lên kẻo chúng ta sẽ lỡ chuyến xe buýt!" },
  music: { en: "Listening to music helps me concentrate.", vi: "Nghe nhạc giúp tôi tập trung hơn." },
  movie: { en: "Have you watched any good movies lately?", vi: "Gần đây bạn có xem bộ phim hay nào không?" },
  coffee: { en: "Would you like a cup of hot coffee?", vi: "Bạn có muốn một tách cà phê nóng không?" },
  tea: { en: "Green tea is very good for your health.", vi: "Trà xanh rất tốt cho sức khỏe của bạn." },
  cat: { en: "The cat is sleeping comfortably on the sofa.", vi: "Con mèo đang ngủ thoải mái trên ghế sofa." },
  dog: { en: "The dog wagged its tail when I came home.", vi: "Chú chó vẫy đuôi mừng khi tôi về nhà." },
  weather: { en: "The weather is sunny and warm today.", vi: "Thời tiết hôm nay nắng ráo và ấm áp." },
  phone: { en: "Please keep your phone on silent mode.", vi: "Vui lòng để điện thoại ở chế độ im lặng." },
  computer: { en: "I use my computer for work and study.", vi: "Tôi dùng máy tính để làm việc và học tập." },
  internet: { en: "The internet makes learning so much easier.", vi: "Internet giúp việc học tập trở nên dễ dàng hơn nhiều." },
  like: { en: "Do you like listening to pop music?", vi: "Bạn có thích nghe nhạc pop không?" },
  love: { en: "I love spending quiet evenings at home.", vi: "Tôi thích trải qua những buổi tối yên tĩnh ở nhà." },
  live: { en: "Where do you live in Vietnam?", vi: "Hiện tại bạn đang sống ở đâu tại Việt Nam?" },
  know: { en: "Do you know where the nearest supermarket is?", vi: "Bạn có biết siêu thị gần nhất ở đâu không?" },
  think: { en: "What do you think about this idea?", vi: "Bạn nghĩ gì về ý tưởng này?" },
  feel: { en: "I feel great after a good night's sleep.", vi: "Tôi cảm thấy tuyệt vời sau một giấc ngủ ngon." },
  see: { en: "I can see the mountains from my window.", vi: "Tôi có thể nhìn thấy những ngọn núi từ cửa sổ của mình." },
  look: { en: "Look at that colorful rainbow in the sky!", vi: "Hãy nhìn chiếc cầu vồng rực rỡ kia trên bầu trời kìa!" },
  speak: { en: "She can speak three languages fluently.", vi: "Cô ấy có thể nói trôi chảy ba thứ tiếng." },
  listen: { en: "Please listen carefully to the instructions.", vi: "Xin vui lòng lắng nghe kỹ các hướng dẫn." },
  read: { en: "I try to read a few pages before bed.", vi: "Tôi cố gắng đọc vài trang sách trước khi đi ngủ." },
  write: { en: "Could you write your email address here?", vi: "Bạn có thể viết địa chỉ email của bạn vào đây không?" },
  play: { en: "The kids love to play football in the yard.", vi: "Bọn trẻ thích chơi bóng đá trong sân." },
  buy: { en: "I need to buy some milk and bread.", vi: "Tôi cần mua một ít sữa và bánh mì." },
  pay: { en: "Can I pay by credit card?", vi: "Tôi có thể thanh toán bằng thẻ tín dụng được không?" },
  cost: { en: "How much does this jacket cost?", vi: "Chiếc áo khoác này có giá bao nhiêu?" },
  eat: { en: "What do you want to eat for dinner?", vi: "Bạn muốn ăn gì cho bữa tối?" },
  drink: { en: "Remember to drink enough water every day.", vi: "Hãy nhớ uống đủ nước mỗi ngày." },
  sleep: { en: "I usually sleep seven hours each night.", vi: "Tôi thường ngủ bảy tiếng mỗi đêm." },
  wake: { en: "I wake up at six o'clock every morning.", vi: "Tôi thức dậy lúc sáu giờ mỗi sáng." },
  start: { en: "The meeting will start in ten minutes.", vi: "Cuộc họp sẽ bắt đầu sau mười phút nữa." },
  finish: { en: "I will finish this report by this afternoon.", vi: "Tôi sẽ hoàn thành bản báo cáo này trước chiều nay." },
  easy: { en: "Don't worry, this exercise is quite easy.", vi: "Đừng lo, bài tập này khá dễ dàng." },
  difficult: { en: "English pronunciation can be difficult at first.", vi: "Phát âm tiếng Anh có thể khó khăn lúc ban đầu." },
  important: { en: "Health is the most important thing in life.", vi: "Sức khỏe là điều quan trọng nhất trong cuộc sống." },
  interesting: { en: "I found this article very interesting.", vi: "Tôi thấy bài viết này rất thú vị." },
  tired: { en: "I am feeling tired after a long working day.", vi: "Tôi cảm thấy mệt mỏi sau một ngày làm việc dài." },
  busy: { en: "Are you busy this Saturday evening?", vi: "Tối thứ Bảy này bạn có bận không?" },
  ready: { en: "Are you ready to order now?", vi: "Bây giờ bạn đã sẵn sàng gọi món chưa?" },
  new: { en: "I bought a new pair of shoes yesterday.", vi: "Hôm qua tôi vừa mua một đôi giày mới." },
  old: { en: "This is an old tradition in my hometown.", vi: "Đây là một truyền thống lâu đời ở quê hương tôi." },
  big: { en: "They moved into a big apartment downtown.", vi: "Họ đã chuyển tới một căn hộ lớn ở trung tâm thành phố." },
  small: { en: "Even small daily habits can make a big difference.", vi: "Ngay cả những thói quen nhỏ hàng ngày cũng tạo ra khác biệt lớn." },
  fast: { en: "He is a fast runner and won the race.", vi: "Anh ấy chạy rất nhanh và đã chiến thắng cuộc đua." },
  slow: { en: "The internet connection is a bit slow today.", vi: "Hôm nay kết nối mạng có hơi chậm một chút." },
  city: { en: "Da Nang is a beautiful coastal city.", vi: "Đà Nẵng là một thành phố ven biển tuyệt đẹp." },
  country: { en: "Vietnam is a peaceful and welcoming country.", vi: "Việt Nam là một đất nước hòa bình và mến khách." },
  today: { en: "Today is going to be a productive day.", vi: "Hôm nay sẽ là một ngày làm việc hiệu quả." },
  tomorrow: { en: "See you at the cafe tomorrow morning!", vi: "Hẹn gặp bạn ở quán cà phê vào sáng mai nhé!" },
  yesterday: { en: "I met an old friend on the street yesterday.", vi: "Hôm qua tôi đã gặp một người bạn cũ trên phố." },
  question: { en: "Do you have any questions for me?", vi: "Bạn có câu hỏi nào cho tôi không?" },
  answer: { en: "I don't know the answer to that question.", vi: "Tôi không biết câu trả lời cho câu hỏi đó." },
  problem: { en: "Don't worry, we can solve this problem together.", vi: "Đừng lo, chúng ta có thể cùng nhau giải quyết vấn đề này." },
  idea: { en: "That is a brilliant idea!", vi: "Đó là một ý tưởng thật tuyệt vời!" },
  spoon: { en: "Could you bring me a soup spoon, please?", vi: "Làm ơn mang cho tôi một chiếc thìa súp được không?" }
};

// ===== Dịch câu đơn =====
async function translateText(text) {
  if (!text) return "";
  try {
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=" +
      encodeURIComponent(text);
    const r = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!r.ok) return "";
    const d = await r.json();
    return (d[0] || []).map((x) => x[0]).join("").trim();
  } catch (e) {
    return "";
  }
}

// ===== Gọi API Google Translate & lấy ví dụ ngữ cảnh =====
async function translateWord(text) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&dt=bd&dt=ex&dt=md&dt=ss&q=" +
    encodeURIComponent(text);
  const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error("translate " + r.status);
  const d = await r.json();
  const meaning = (d[0] || []).map((x) => x[0]).join("").trim();
  const alts = (d[1] || []).map((e) => ({ pos: e[0], terms: (e[1] || []).slice(0, 5) }));

  // Trích xuất các câu ví dụ từ Google Translate (d[13][0])
  const rawExamples = (d[13]?.[0] || [])
    .map((x) => (x[0] || "").replace(/<\/?b>/gi, "").trim())
    .filter((s) => s.length >= 10 && s.length <= 150);

  return { meaning, alts, rawExamples };
}

// ===== Gọi từ điển DictionaryAPI =====
async function dictionary(word) {
  if (/\s/.test(word)) return {};
  try {
    const r = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word), {
      signal: AbortSignal.timeout(3500),
    });
    if (!r.ok) return {};
    const d = await r.json();
    const e = d[0];
    if (!e) return {};
    const phonetic = e.phonetic || (e.phonetics || []).find((p) => p.text)?.text || "";
    let audio = (e.phonetics || []).find((p) => p.audio)?.audio || "";
    if (audio.startsWith("//")) audio = "https:" + audio;
    const m = e.meanings?.[0];

    const dictExamples = [];
    for (const meaning of e.meanings || []) {
      for (const def of meaning.definitions || []) {
        if (def.example && def.example.trim()) {
          dictExamples.push(def.example.trim());
        }
      }
    }

    return {
      phonetic,
      audio,
      pos: m?.partOfSpeech || "",
      definition: m?.definitions?.[0]?.definition || "",
      dictExamples,
    };
  } catch (err) {
    return {};
  }
}

// ===== Tìm câu ví dụ từ Tatoeba (EN -> VI song ngữ) =====
async function fetchTatoebaExample(word) {
  try {
    const url =
      "https://tatoeba.org/en/api_v0/search?from=eng&to=vie&query=" +
      encodeURIComponent(word) +
      "&trans_filter=limit&trans_link=direct&sort=relevance";
    const r = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!r.ok) return null;
    const d = await r.json();
    const hits = (d.results || []).filter(
      (x) => x.text && x.translations?.[0]?.[0]?.text && x.text.length >= 12 && x.text.length <= 130
    );
    if (hits.length > 0) {
      // Ưu tiên câu có chứa từ cần tìm
      const regex = new RegExp("\\b" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
      const matched = hits.find((h) => regex.test(h.text)) || hits[0];
      return {
        en: matched.text,
        vi: matched.translations[0][0].text,
        source: "tatoeba",
      };
    }
  } catch (e) {}
  return null;
}

// ===== Sinh ví dụ qua Gemini AI nếu người dùng cấu hình API Key =====
async function fetchGeminiExample(word, apiKey) {
  if (!apiKey) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const prompt = `Give one simple, natural, conversational English example sentence for the word "${word}" suitable for English learners (like "What is your name?" for "name"), and its Vietnamese translation. Return JSON only with format: {"en": "...", "vi": "..."}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const res = await r.json();
    const txt = res.candidates?.[0]?.content?.parts?.[0]?.text;
    if (txt) {
      const parsed = JSON.parse(txt);
      if (parsed.en && parsed.vi) {
        return { en: parsed.en.trim(), vi: parsed.vi.trim(), source: "gemini" };
      }
    }
  } catch (e) {}
  return null;
}

// ===== Pipeline chọn câu ví dụ tối ưu nhất cho từ vựng =====
async function findBestExample(word, options = {}) {
  const key = word.trim().toLowerCase();
  const alts = [];

  // 1. Kiểm tra từ điển ví dụ chuẩn (Curated)
  if (CURATED_EXAMPLES[key]) {
    return {
      example: CURATED_EXAMPLES[key].en,
      exampleTrans: CURATED_EXAMPLES[key].vi,
      exampleAlts: [CURATED_EXAMPLES[key].en],
    };
  }

  // 2. Kiểm tra Gemini AI nếu có key
  const { geminiApiKey } = await chrome.storage.local.get("geminiApiKey");
  if (geminiApiKey) {
    const geminiRes = await fetchGeminiExample(key, geminiApiKey);
    if (geminiRes) {
      return {
        example: geminiRes.en,
        exampleTrans: geminiRes.vi,
        exampleAlts: [geminiRes.en],
      };
    }
  }

  // 3. Kiểm tra Tatoeba (song ngữ người dịch EN-VI chất lượng cao)
  const tatoebaRes = await fetchTatoebaExample(key);
  if (tatoebaRes) {
    alts.push(tatoebaRes.en);
    return {
      example: tatoebaRes.en,
      exampleTrans: tatoebaRes.vi,
      exampleAlts: alts,
    };
  }

  // 4. Kiểm tra ví dụ từ Google Translate hoặc DictionaryAPI
  const candidates = [
    ...(options.rawExamples || []),
    ...(options.dictExamples || []),
  ].filter(Boolean);

  if (candidates.length > 0) {
    // Chọn câu tự nhiên, độ dài vừa phải
    const regex = new RegExp("\\b" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
    const matched = candidates.filter((c) => regex.test(c));
    const pool = matched.length > 0 ? matched : candidates;
    const chosen = pool.find((s) => s.length >= 15 && s.length <= 90) || pool[0];

    const trans = await translateText(chosen);
    return {
      example: chosen,
      exampleTrans: trans || "Ví dụ minh họa cho từ này.",
      exampleAlts: pool.slice(0, 4),
    };
  }

  // 5. Nếu từ có context từ trang web người dùng vừa bôi đen
  if (options.context && options.context.length >= 15 && options.context.length <= 150) {
    const trans = await translateText(options.context);
    return {
      example: options.context,
      exampleTrans: trans || "Ví dụ từ trang web đã lưu.",
      exampleAlts: [options.context],
    };
  }

  // 6. Mẫu câu giao tiếp tự nhiên dự phòng (Fallback)
  let enFallback = `Can you explain the meaning of "${word}"?`;
  let viFallback = `Bạn có thể giải thích ý nghĩa của từ "${word}" không?`;

  if (options.pos === "noun") {
    enFallback = `Do you have the ${word}?`;
    viFallback = `Bạn có ${options.meaning || word} không?`;
  } else if (options.pos === "verb") {
    enFallback = `I want to ${word} every day.`;
    viFallback = `Tôi muốn ${options.meaning || word} mỗi ngày.`;
  } else if (options.pos === "adjective") {
    enFallback = `It looks very ${word}.`;
    viFallback = `Nó trông rất ${options.meaning || word}.`;
  }

  return {
    example: enFallback,
    exampleTrans: viFallback,
    exampleAlts: [enFallback],
  };
}

// ===== Bổ sung dữ liệu đầy đủ cho từ (Nghĩa, IPA, POS, Ví dụ, Dịch ví dụ) =====
async function enrich(key, existingContext = "") {
  try {
    const [t, d] = await Promise.allSettled([translateWord(key), dictionary(key)]);
    const patch = {};

    let rawExamples = [];
    let dictExamples = [];
    let meaning = "";
    let pos = "";

    if (t.status === "fulfilled" && t.value.meaning) {
      meaning = t.value.meaning;
      rawExamples = t.value.rawExamples || [];
      Object.assign(patch, { meaning: t.value.meaning, alts: t.value.alts, status: "done" });
    } else {
      patch.status = "error";
    }

    if (d.status === "fulfilled") {
      pos = d.value.pos || "";
      dictExamples = d.value.dictExamples || [];
      Object.assign(patch, d.value);
    }

    // Tìm câu ví dụ và bản dịch câu ví dụ
    const exResult = await findBestExample(key, {
      meaning,
      pos,
      rawExamples,
      dictExamples,
      context: existingContext,
    });

    patch.example = exResult.example;
    patch.exampleTrans = exResult.exampleTrans;
    patch.exampleAlts = exResult.exampleAlts;

    await patchWord(key, patch);
  } catch (e) {
    await patchWord(key, { status: "error" });
  }
}

// ===== Lưu từ vựng =====
async function saveWord({ text, context, url, title }) {
  const key = (text || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return { ok: false };

  const result = await withLock(async () => {
    const words = await getAll();
    const now = Date.now();
    if (words[key]) {
      words[key].count = (words[key].count || 1) + 1;
      words[key].updatedAt = now;
      if (context) Object.assign(words[key], { context, url, title });
      await chrome.storage.local.set({ words });
      return { ok: true, isNew: false, retry: words[key].status !== "done" || !words[key].example, context: words[key].context };
    }
    words[key] = {
      word: key,
      context: context || "",
      url: url || "",
      title: title || "",
      count: 1,
      encounters: 0,
      correctCount: 0,
      incorrectCount: 0,
      lastEncountered: null,
      nextReview: now + 86400000,
      mastery: "new",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    await chrome.storage.local.set({ words });
    return { ok: true, isNew: true, retry: true, context: context || "" };
  });

  if (result.retry) {
    enrich(key, result.context); // chạy nền không chặn
  }
  return { ok: true, isNew: result.isNew, key };
}

// ===== Lắng nghe tin nhắn từ Popup, Sổ từ vựng, Content Script =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SAVE_WORD") {
    saveWord({ ...msg, url: msg.url || sender.tab?.url, title: msg.title || sender.tab?.title }).then(sendResponse);
    return true;
  }
  if (msg.type === "RETRY") {
    patchWord(msg.word, { status: "pending" })
      .then(() => enrich(msg.word))
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "CYCLE_EXAMPLE") {
    // Đổi câu ví dụ khác cho từ
    (async () => {
      const words = await getAll();
      const w = words[msg.word];
      if (!w) return sendResponse({ ok: false });
      const alts = w.exampleAlts || [];
      if (alts.length > 1) {
        const curIdx = alts.indexOf(w.example);
        const nextIdx = (curIdx + 1) % alts.length;
        const nextEx = alts[nextIdx];
        const nextTrans = await translateText(nextEx);
        await patchWord(msg.word, { example: nextEx, exampleTrans: nextTrans });
        return sendResponse({ ok: true, example: nextEx, exampleTrans: nextTrans });
      }
      // Thử tìm ví dụ mới từ Tatoeba
      const tatoebaRes = await fetchTatoebaExample(msg.word);
      if (tatoebaRes && tatoebaRes.en !== w.example) {
        await patchWord(msg.word, { example: tatoebaRes.en, exampleTrans: tatoebaRes.vi });
        return sendResponse({ ok: true, example: tatoebaRes.en, exampleTrans: tatoebaRes.vi });
      }
      sendResponse({ ok: false, msg: "Không có thêm ví dụ khác" });
    })();
    return true;
  }
  if (msg.type === "UPDATE_EXAMPLE") {
    // Cho phép người dùng chỉnh sửa câu ví dụ theo ý thích
    (async () => {
      let trans = msg.exampleTrans;
      if (!trans && msg.example) {
        trans = await translateText(msg.example);
      }
      await patchWord(msg.word, { example: msg.example, exampleTrans: trans });
      sendResponse({ ok: true, example: msg.example, exampleTrans: trans });
    })();
    return true;
  }
  if (msg.type === "RECORD_ENCOUNTER") {
    // Ghi nhận gặp lại từ trên web
    (async () => {
      const words = await getAll();
      const key = (msg.word || "").toLowerCase().trim();
      const w = words[key];
      if (w) {
        w.encounters = (w.encounters || 0) + 1;
        w.lastEncountered = Date.now();
        w.mastery = computeMastery(w);
        await chrome.storage.local.set({ words });
        sendResponse({ ok: true, encounters: w.encounters, mastery: w.mastery });
      } else {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }
  if (msg.type === "RECORD_RECALL_RESULT") {
    // Ghi nhận kết quả tự nhớ nghĩa từ vựng
    (async () => {
      const words = await getAll();
      const key = (msg.word || "").toLowerCase().trim();
      const w = words[key];
      if (w) {
        const isCorrect = !!msg.isCorrect;
        if (isCorrect) {
          w.correctCount = (w.correctCount || 0) + 1;
          const streak = Math.min(14, Math.pow(2, w.correctCount || 1));
          w.nextReview = Date.now() + 86400000 * streak;
        } else {
          w.incorrectCount = (w.incorrectCount || 0) + 1;
          w.nextReview = Date.now() + 86400000;
        }
        w.lastEncountered = Date.now();
        w.mastery = computeMastery(w);
        await chrome.storage.local.set({ words });
        sendResponse({
          ok: true,
          word: w.word,
          encounters: w.encounters || 0,
          correctCount: w.correctCount,
          incorrectCount: w.incorrectCount,
          mastery: w.mastery,
          nextReview: w.nextReview
        });
      } else {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }
  if (msg.type === "FETCH_TTS") {
    (async () => {
      try {
        const text = (msg.text || "").trim().slice(0, 195);
        const lang = msg.lang || "en-US";
        if (!text) return sendResponse({ ok: false });
        const cacheKey = `${lang}|${text.toLowerCase()}`;
        if (ttsCache.has(cacheKey)) {
          return sendResponse({ ok: true, dataUrl: ttsCache.get(cacheKey) });
        }
        const url =
          "https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=" +
          encodeURIComponent(lang) +
          "&q=" +
          encodeURIComponent(text);
        const r = await fetch(url, { signal: AbortSignal.timeout(4500) });
        if (!r.ok) return sendResponse({ ok: false });
        const buf = await r.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const dataUrl = "data:audio/mpeg;base64," + btoa(bin);
        if (ttsCache.size >= 80) {
          const firstKey = ttsCache.keys().next().value;
          ttsCache.delete(firstKey);
        }
        ttsCache.set(cacheKey, dataUrl);
        sendResponse({ ok: true, dataUrl });
      } catch (e) {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }
});

const ttsCache = new Map();

function computeMastery(w) {
  const correct = w.correctCount || 0;
  const incorrect = w.incorrectCount || 0;
  const encounters = w.encounters || 0;
  if (correct >= 3 && correct >= incorrect * 2) return "mastered";
  if (correct >= 1) return "familiar";
  if (encounters > 0 || incorrect > 0) return "learning";
  return "new";
}

// ===== Menu chuột phải, phím tắt, bấm icon =====
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "save-word",
      title: 'Lưu "%s" vào englishmdai',
      contexts: ["selection"],
    });
  });

  // Khởi tạo cài đặt Gặp lại từ (Word Encounter) nếu chưa có
  chrome.storage.local.get("encounterSettings").then(({ encounterSettings }) => {
    if (!encounterSettings) {
      chrome.storage.local.set({
        encounterSettings: {
          enabled: true,
          mode: "normal", // "normal" | "challenge" | "focus"
          maxPerPage: 15,
          highlightStyle: "subtle" // "subtle" | "highlight"
        }
      });
    }
  });
});

function flashBadge() {
  chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
  chrome.action.setBadgeText({ text: "✓" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
}

async function saveAndShow(tab, fallbackText) {
  let sel = null;
  if (tab?.id) {
    try {
      sel = await chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION" });
    } catch (e) {}
  }
  const text = sel?.text || fallbackText;
  if (!text) return;
  const res = await saveWord({
    text,
    context: sel?.context,
    url: sel?.url || tab?.url,
    title: sel?.title || tab?.title,
  });
  if (!res?.ok) return;
  await chrome.storage.local.set({ lastSaved: { key: res.key, at: Date.now() } });
  try {
    await chrome.action.openPopup(); // mở popup nhỏ ngay dưới icon
  } catch (e) {
    flashBadge();
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-word") saveAndShow(tab, info.selectionText);
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "save-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  saveAndShow(tab);
});
