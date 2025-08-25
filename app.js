// Trivia Practice V2
(function(){
  const $ = (id)=>document.getElementById(id);
  let aborter = null, questions = [], current = 0, score = 0;
  let high = Number(localStorage.getItem("tp.high") || 0);
  let timer = null, timeLeft = 20, questionActive = false;

  const categorySel = $("category");
  const periodSel = $("period");
  const difficultySel = $("difficulty");
  const numSel = $("numQuestions");
  const onlinePool = $("onlinePool");
  const startBtn = $("startBtn");
  const refreshBtn = $("refreshBtn");
  const nextBtn = $("nextBtn");

  const qEl = $("question");
  const ansEl = $("answers");
  const feedback = $("feedback");
  const progress = $("progress");
  const scoreEl = $("score");
  const timerEl = $("timer");
  const summary = $("summary");

  const CATEGORY_LABELS = [
    "All","Popular Culture","General Knowledge","Entertainment","Animals","Geography","Politics",
    "Science","History","Sport","Music","Literature","Art and Culture","Christmas","Halloween","Movies","TV Shows"
  ];

  const CAT_TO_OTDB = {
    "All": null,
    "General Knowledge": 9,
    "Geography": 22,
    "Science": 17,
    "History": 23,
    "Sport": 21,
    "Animals": 27,
    "Music": 12,
    "Literature": 10,
    "Movies": 11,
    "TV Shows": 14,
    "Politics": 24,
    "Entertainment": [11,12,13,14,15,16,26,32],
    "Popular Culture": [11,12,14,26,32],
    "Art and Culture": [25,26],
    "Christmas": ["keyword"],
    "Halloween": ["keyword"]
  };

  const KEYWORDS = {
    "Christmas": ["christmas","xmas","santa","reindeer","mistletoe","nativity","yuletide","noel","elf","yule"],
    "Halloween": ["halloween","pumpkin","jack-o-lantern","ghost","vampire","werewolf","witch","spooky","trick or treat","candy"]
  };

  window.addEventListener("DOMContentLoaded", () => {
    // Populate categories
    categorySel.innerHTML = CATEGORY_LABELS.map(c => `<option value="${c}">${c}</option>`).join("");
    categorySel.value = "History"; // default to test local JSON quickly
    scoreEl.textContent = `Score: 0 · High: ${high}`;

    startBtn.addEventListener("click", startGame);
    refreshBtn.addEventListener("click", startGame);
    nextBtn.addEventListener("click", () => { current++; showQuestion(); });
  });

  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
  function decodeHTML(s){ const ta=document.createElement("textarea"); ta.innerHTML=s||""; return ta.value; }
  const norm = (s)=> (s||"").toLowerCase();

  function pickCategoryId(label){
    const entry = CAT_TO_OTDB[label];
    if (entry===null || entry===undefined) return null;
    if (Array.isArray(entry)){
      if (entry.length===1 && entry[0]==="keyword") return "keyword";
      return entry[Math.floor(Math.random()*entry.length)];
    }
    return entry;
  }

  function keywordFilterIfNeeded(curated, items){
    const keys = KEYWORDS[curated];
    if(!keys) return items;
    const filtered = items.filter(q=>{
      const hay = norm(q.question + " " + q.correct + " " + q.answers.join(" "));
      return keys.some(k => hay.includes(k));
    });
    return filtered.length >= Math.min(items.length, 3) ? filtered : items;
  }

  async function fetchFromOTDB(params){
    const url = `https://opentdb.com/api.php?${params.toString()}`;
    const res = await fetch(url, { cache: "no-store", signal: aborter?.signal });
    const data = await res.json();
    const raw = Array.isArray(data.results) ? data.results : [];
    return raw.map(q => ({
      question: decodeHTML(q.question),
      correct: decodeHTML(q.correct_answer),
      answers: shuffle([ ...q.incorrect_answers.map(decodeHTML), decodeHTML(q.correct_answer) ]),
      category: q.category || "",
      difficulty: (q.difficulty || "").toLowerCase()
    }));
  }

  async function fetchQuestions(){
    const online = onlinePool.checked;
    const amount = Number(numSel.value || 10);
    const curated = categorySel.value;
    const selectedDifficulty = (difficultySel.value || "").toLowerCase();
    const selectedPeriod = periodSel.value;

    // cancel previous
    if (aborter) aborter.abort();
    aborter = new AbortController();

    // Local JSON (internal DB)
    if (!online){
      try{
        const file = `data/${curated.toLowerCase().replace(/\s+/g,'_')}.json`;
        const res = await fetch(file, { cache: "no-store", signal: aborter.signal });
        const all = await res.json();
        const transformed = all.map(it => ({
          question: it.question,
          answers: it.answers.slice(),
          correct: it.answers[it.correctIndex],
          difficulty: (it.difficulty || "").toLowerCase(),
          era: it.era || "",
          tags: it.tags || []
        }));
        let pool = transformed;
        if (selectedPeriod) pool = pool.filter(q => (q.era||"") === selectedPeriod);
        if (selectedDifficulty) pool = pool.filter(q => q.difficulty === selectedDifficulty);
        pool = shuffle(pool).slice(0, amount);
        if (pool.length === 0){
          // fallback
          pool = Array.from({length: amount}, (_,i)=>({
            question:`Sample Q${i+1} (${curated})`,
            correct:"Correct",
            answers:shuffle(["Correct","Wrong1","Wrong2","Wrong3"])
          }));
        }
        return pool;
      }catch(e){
        console.warn("Local DB load failed:", e);
        return Array.from({length: amount}, (_,i)=>({
          question:`Sample Q${i+1} (${curated})`,
          correct:"Correct",
          answers:shuffle(["Correct","Wrong1","Wrong2","Wrong3"])
        }));
      }
    }

    // Online via OpenTDB
    try{
      const id = pickCategoryId(curated);
      const base = new URLSearchParams();
      const type = "multiple";
      const BASE_PULL = Math.max(amount*3, 30);
      base.set("amount", String(BASE_PULL));
      base.set("type", type);
      if (selectedDifficulty) base.set("difficulty", selectedDifficulty);

      let pool = [];
      if (id && id !== "keyword"){
        base.set("category", String(id));
        pool = await fetchFromOTDB(base);
      } else if (Array.isArray(CAT_TO_OTDB[curated])){
        for (const sub of CAT_TO_OTDB[curated]){
          if (sub === "keyword") continue;
          const p = new URLSearchParams(base);
          p.set("category", String(sub));
          const chunk = await fetchFromOTDB(p);
          pool.push(...chunk);
          if (pool.length >= BASE_PULL) break;
        }
      } else {
        // All / keyword categories → sweep likely IDs
        const likely = [9,10,11,12,14,15,16,17,21,22,23,24,25,26,27,32];
        for (const sub of likely){
          const p = new URLSearchParams(base);
          p.set("category", String(sub));
          const chunk = await fetchFromOTDB(p);
          pool.push(...chunk);
          if (pool.length >= BASE_PULL) break;
        }
      }

      if (id === "keyword") pool = keywordFilterIfNeeded(curated, pool);

      // enforce difficulty if chosen
      if (selectedDifficulty){
        const strict = pool.filter(q => q.difficulty === selectedDifficulty);
        if (strict.length >= amount) pool = strict;
      }

      // dedupe by normalized question
      const seen = new Set(); const deduped = [];
      for (const q of pool){ const key = norm(q.question); if (!seen.has(key)){ seen.add(key); deduped.push(q); } }

      // trim/backfill
      let out = deduped.slice(0, amount);
      while (out.length < amount){
        out.push({question:`Backup Q${out.length+1} (${curated})`, correct:"Correct", answers:shuffle(["Correct","Wrong1","Wrong2","Wrong3"])});
      }
      return out;
    }catch(err){
      console.error("Online fetch failed", err);
      return Array.from({length: amount}, (_,i)=>({
        question:`Offline Q${i+1} (${curated})`,
        correct:"Correct",
        answers:shuffle(["Correct","Wrong1","Wrong2","Wrong3"])
      }));
    }
  }

  function startTimer(){
    clearInterval(timer);
    timeLeft = 20;
    timerEl.textContent = `${timeLeft}s`;
    questionActive = true;
    timer = setInterval(()=>{
      timeLeft--;
      timerEl.textContent = `${timeLeft}s`;
      if (timeLeft <= 0){
        clearInterval(timer);
        if (questionActive){
          feedback.textContent = `⏰ Time's up! Correct answer: ${questions[current].correct}`;
          questionActive = false;
          setTimeout(()=>{ current++; showQuestion(); }, 800);
        }
      }
    }, 1000);
  }

  function showQuestion(){
    if (current >= questions.length){
      qEl.textContent = "Session finished! Tap Refresh for a new set.";
      ansEl.innerHTML = "";
      nextBtn.classList.add("hidden");
      summary.textContent = `Final Score: ${score}/${questions.length}`;
      clearInterval(timer);
      if (score > high){ high = score; localStorage.setItem("tp.high", String(high)); }
      scoreEl.textContent = `Score: ${score} · High: ${high}`;
      return;
    }
    const q = questions[current];
    progress.textContent = `${current+1}/${questions.length}`;
    qEl.textContent = q.question;
    ansEl.innerHTML = "";
    feedback.textContent = "";
    summary.textContent = "";
    nextBtn.classList.add("hidden");

    q.answers.forEach((ans) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = ans;
      b.addEventListener("click", ()=> selectAnswer(b, ans, q.correct));
      ansEl.appendChild(b);
    });
    startTimer();
  }

  function selectAnswer(btn, ans, correct){
    if (!questionActive) return;
    questionActive = false;
    clearInterval(timer);
    Array.from(ansEl.children).forEach((b)=> b.disabled = true);

    if (ans === correct){
      btn.classList.add("correct");
      feedback.textContent = "✔️ Correct!";
      score++;
    } else {
      btn.classList.add("wrong");
      feedback.textContent = `✖️ Incorrect. Correct: ${correct}`;
    }

    if (score > high){ high = score; localStorage.setItem("tp.high", String(high)); }
    scoreEl.textContent = `Score: ${score} · High: ${high}`;
    nextBtn.classList.remove("hidden");
  }

  async function startGame(){
    score = 0; current = 0;
    qEl.textContent = "Loading questions...";
    ansEl.innerHTML = "";
    feedback.textContent = "";
    summary.textContent = "";
    nextBtn.classList.add("hidden");
    questions = await fetchQuestions();
    showQuestion();
  }
})();