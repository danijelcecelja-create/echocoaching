

console.log("START");

const API_URL = "https://script.google.com/macros/s/AKfycbyXJnhoHYru7JJqlBGefo6kmxMVK87S36BupxbZ4kPCEFmN7A6gVd7tbWrcqZQmOaZP/exec";

const CACHE_KEY = "echoQuestionnaireDraftV2";
const QUESTIONS_KEY = "echoQuestionnaireQuestionsV2";
const QUEUE_KEY = "echoQuestionnaireQueueV2";
const RETRY_BASE_MS = 5000;

const state = {
  questions: [],
  options: [],
  answers: {},
  currentIndex: 0,
  submittedId: null,
  sending: false,
  retryTimer: null,
  loading: true
};

const el = {
  intro: document.getElementById("intro"),
  questionnaire: document.getElementById("questionnaire"),
  completion: document.getElementById("completion"),
  start: document.getElementById("start-button"),
  count: document.getElementById("question-count"),
  progressLabel: document.getElementById("progress-label"),
  progressPercent: document.getElementById("progress-percent"),
  progressFill: document.getElementById("progress-fill"),
  questionText: document.getElementById("question-text"),
  answerList: document.getElementById("answer-list"),
  validation: document.getElementById("validation-message"),
  previous: document.getElementById("previous-button"),
  next: document.getElementById("next-button"),
  saveIndicator: document.getElementById("save-indicator"),
  saveStatus: document.getElementById("save-status"),
  deliveryStatus: document.getElementById("delivery-status"),
  deliveryText: document.getElementById("delivery-text"),
  edit: document.getElementById("edit-button"),
  introCopy: document.querySelector(".intro-copy")
};

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(character) {
    const random = Math.random() * 16 | 0;
    return (character === "x" ? random : (random & 3 | 8)).toString(16);
  });
}

function saveDraft() {
  writeJson(CACHE_KEY, {
    answers: state.answers,
    currentIndex: state.currentIndex,
    updatedAt: new Date().toISOString()
  });

  el.saveStatus.textContent = "Op dit toestel bewaard";
  el.saveIndicator.classList.add("saved");
}

function loadDraft() {
  const draft = readJson(CACHE_KEY, null);

  if (!draft || !draft.answers) {
    return;
  }

  state.answers = draft.answers;
  state.currentIndex = Math.max(0, Number(draft.currentIndex) || 0);
}

function saveCachedQuestions() {
  writeJson(QUESTIONS_KEY, {
    questions: state.questions,
    options: state.options,
    updatedAt: new Date().toISOString()
  });
}

function validateQuestionData(data) {
  if (!data || data.success !== true || !Array.isArray(data.questions)) {
    throw new Error("Ongeldige vragenlijst ontvangen.");
  }

  const ids = new Set();

  data.questions.forEach(function(question) {
    if (!Number.isSafeInteger(Number(question.id)) || Number(question.id) < 1 || !String(question.text || "").trim()) {
      throw new Error("Een vraag bevat ongeldige gegevens.");
    }

    if (ids.has(Number(question.id))) {
      throw new Error("De vragenlijst bevat dubbele vraagnummers.");
    }

    ids.add(Number(question.id));
  });

  if (data.questions.length === 0) {
    throw new Error("Er zijn momenteel geen vragen beschikbaar.");
  }

  if (!Array.isArray(data.options) || data.options.length === 0) {
    throw new Error("Geen antwoordmogelijkheden ontvangen.");
  }

  data.options.forEach(function(option) {
    if (!option || !String(option.value || "").trim()) {
      throw new Error("Ongeldige antwoordmogelijkheid.");
    }
  });

  return {
    questions: data.questions.map(function(question) {
      return {
        id: Number(question.id),
        text: String(question.text)
      };
    }),
    options: data.options.map(function(option) {
      return {
        value: String(option.value),
        label: String(option.label || option.value)
      };
    })
  };
}



function jsonpRequest(params) {
  return new Promise(function(resolve, reject) {
    const callbackName = "echoJsonp_" + createId().replace(/-/g, "");
    const script = document.createElement("script");
    const url = new URL(API_URL);

    Object.keys(params).forEach(function(key) {
      url.searchParams.set(key, params[key]);
    });

    url.searchParams.set("callback", callbackName);
    url.searchParams.set("_", String(Date.now()));

    let finished = false;

    function cleanup() {
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = function(data) {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(data);
    };

    script.onerror = function() {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error("JSONP_REQUEST_FAILED"));
    };

    script.src = url.toString();
    document.head.appendChild(script);
  });
}



async function fetchQuestions() {
  if (!API_URL || API_URL.includes("PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE")) {
    throw new Error("API_URL_NOT_CONFIGURED");
  }

  const data = validateQuestionData(
    await jsonpRequest({ action: "questions" })
  );

  state.questions = data.questions;
  state.options = data.options;

  saveCachedQuestions();
}


function loadCachedQuestions() {
  const cached = readJson(QUESTIONS_KEY, null);

  if (!cached || !Array.isArray(cached.questions) || !Array.isArray(cached.options)) {
    return false;
  }

  try {
    const data = validateQuestionData({
      success: true,
      questions: cached.questions,
      options: cached.options
    });

    state.questions = data.questions;
    state.options = data.options;

    return true;
  } catch (error) {
    return false;
  }
}

function updateQuestionCount() {
  el.count.textContent = state.questions.length + " vragen";
}

function renderQuestion() {
  if (!state.questions.length) {
    return;
  }

  state.currentIndex = Math.min(state.currentIndex, state.questions.length - 1);

  const question = state.questions[state.currentIndex];
  const number = state.currentIndex + 1;
  const percent = Math.round(number / state.questions.length * 100);

  el.progressLabel.textContent = "VRAAG " + number + " VAN " + state.questions.length;
  el.progressPercent.textContent = percent + "%";
  el.progressFill.style.width = percent + "%";
  el.questionText.textContent = question.text;

  el.answerList.querySelectorAll(".answer-option").forEach(function(node) {
    node.remove();
  });

  state.options.forEach(function(option) {
    const label = document.createElement("label");
    label.className = "answer-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "answer-" + question.id;
    input.value = option.value;
    input.checked = state.answers[String(question.id)] === option.value;

    input.addEventListener("change", function() {
      state.answers[String(question.id)] = option.value;
      el.validation.textContent = "";
      saveDraft();
    });

    const text = document.createElement("span");
    text.className = "answer-code";
    text.textContent = option.label;

    label.append(input, text);
    el.answerList.appendChild(label);
  });

  el.previous.disabled = state.currentIndex === 0;
  el.previous.style.opacity = state.currentIndex === 0 ? ".45" : "1";

  el.next.innerHTML = state.currentIndex === state.questions.length - 1
    ? 'Afronden <span aria-hidden="true">✓</span>'
    : 'Volgende <span aria-hidden="true">→</span>';

  el.validation.textContent = "";
  saveDraft();
}

function showQuestionnaire() {
  if (!state.questions.length) {
    el.introCopy.textContent = "De vragenlijst is momenteel niet beschikbaar. Controleer je verbinding en probeer opnieuw.";
    return;
  }

  el.intro.classList.add("hidden");
  el.completion.classList.add("hidden");
  el.questionnaire.classList.remove("hidden");

  renderQuestion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getQueue() {
  const queue = readJson(QUEUE_KEY, []);
  return Array.isArray(queue) ? queue : [];
}

function saveQueue(queue) {
  writeJson(QUEUE_KEY, queue);
}

function createSubmission() {
  const answers = {};

  state.questions.forEach(function(question) {
    answers[String(question.id)] = state.answers[String(question.id)];
  });

  return {
    action: "submit",
    submissionId: createId(),
    submittedAt: new Date().toISOString(),
    questions: state.questions.map(function(question) {
      return {
        id: question.id,
        text: question.text
      };
    }),
    answers: answers
  };
}

function finishQuestionnaire() {
  const unansweredIndex = state.questions.findIndex(function(question) {
    return !state.options.some(function(option) {
      return option.value === state.answers[String(question.id)];
    });
  });

  if (unansweredIndex >= 0) {
    state.currentIndex = unansweredIndex;
    renderQuestion();
    el.validation.textContent = "Beantwoord eerst deze vraag om verder te gaan.";
    return;
  }

  const submission = createSubmission();
  const queue = getQueue();

  queue.push({
    payload: submission,
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now()
  });

  saveQueue(queue);
  state.submittedId = submission.submissionId;

  el.questionnaire.classList.add("hidden");
  el.completion.classList.remove("hidden");
  el.completion.querySelector("#completion-copy").textContent =
    "Je antwoorden zijn op dit toestel bewaard en worden doorgestuurd zodra de verbinding met de spreadsheet lukt.";

  setDeliveryState("queued", "Inzending lokaal bewaard. Verbinding wordt geprobeerd…");

  window.scrollTo({ top: 0, behavior: "smooth" });
  processQueue();
}


async function sendSubmission(item) {
  if (!API_URL || API_URL.includes("PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE")) {
    throw new Error("API_URL_NOT_CONFIGURED");
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(item.payload),
      redirect: "follow"
    });

    const result = await response.json();

    if (result && result.success === true) {
      return result;
    }

    throw new Error(result && result.error ? result.error : "SERVER_REJECTED");
  } catch (error) {
    const status = await jsonpRequest({
      action: "status",
      submissionId: item.payload.submissionId
    });

    if (status && status.success === true && status.received === true) {
      return {
        success: true,
        duplicate: true,
        submissionId: item.payload.submissionId
      };
    }

    throw error;
  }
}


function retryDelay(attempts) {
  return RETRY_BASE_MS;
}

async function processQueue() {
  if (state.sending || !navigator.onLine) {
    return;
  }

  const queue = getQueue();

  if (!queue.length) {
    if (state.submittedId) {
      setDeliveryState("sent", "Inzending ontvangen door de spreadsheet.");
    }
    return;
  }

  const item = queue[0];
  const delay = Math.max(0, Number(item.nextAttemptAt || 0) - Date.now());

  if (delay > 0) {
    clearTimeout(state.retryTimer);
    state.retryTimer = setTimeout(processQueue, delay);
    return;
  }

  state.sending = true;

  if (state.submittedId === item.payload.submissionId) {
    setDeliveryState("sending", "Bezig met verzenden…");
  }

  try {
    const result = await sendSubmission(item);
    const currentQueue = getQueue().filter(function(entry) {
      return entry.payload.submissionId !== item.payload.submissionId;
    });

    saveQueue(currentQueue);
    state.sending = false;

    if (state.submittedId === item.payload.submissionId) {
      setDeliveryState(
        "sent",
        result.duplicate
          ? "Deze inzending was al ontvangen. Alles is in orde."
          : "Inzending ontvangen door de spreadsheet."
      );
    }

    if (currentQueue.length) {
      processQueue();
    }
  } catch (error) {
    const currentQueue = getQueue();
    const index = currentQueue.findIndex(function(entry) {
      return entry.payload.submissionId === item.payload.submissionId;
    });

    let delayMs = RETRY_BASE_MS;

    if (index >= 0) {
      currentQueue[index].attempts = (currentQueue[index].attempts || 0) + 1;
      delayMs = retryDelay(currentQueue[index].attempts);
      currentQueue[index].nextAttemptAt = Date.now() + delayMs;
      saveQueue(currentQueue);
    }

    state.sending = false;

    const message = error.message === "API_URL_NOT_CONFIGURED"
      ? "De API-URL moet nog worden ingevuld. Je inzending blijft lokaal bewaard."
      : "Nog niet bevestigd. Je inzending blijft bewaard en wordt opnieuw geprobeerd.";

    if (state.submittedId === item.payload.submissionId) {
      setDeliveryState("error", message);
    }

    clearTimeout(state.retryTimer);
    state.retryTimer = setTimeout(processQueue, delayMs);
  }
}

function setDeliveryState(status, message) {
  el.deliveryStatus.dataset.state = status;
  el.deliveryText.textContent = message;
}

async function initialize() {
  loadDraft();

  const hasCachedQuestions = loadCachedQuestions();

  if (hasCachedQuestions) {
    updateQuestionCount();

    if (Object.keys(state.answers).length) {
      el.start.textContent = "Verdergaan met de vragenlijst ↗";
    }
  }

  try {
    await fetchQuestions();
    updateQuestionCount();

    if (Object.keys(state.answers).length) {
      el.start.textContent = "Verdergaan met de vragenlijst ↗";
    }
  } catch (error) {
    if (!hasCachedQuestions) {
      el.start.disabled = true;
      el.introCopy.textContent =
        "De vragenlijst kon niet worden geladen. Controleer de API-URL en je internetverbinding.";
    } else {
      el.introCopy.textContent =
        "De verbinding met de spreadsheet is niet beschikbaar. De laatst geladen vragenlijst wordt gebruikt.";
    }
  }

  state.loading = false;
  processQueue();
}

el.start.addEventListener("click", showQuestionnaire);

el.previous.addEventListener("click", function() {
  if (state.currentIndex > 0) {
    state.currentIndex--;
    saveDraft();
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

el.next.addEventListener("click", function() {
  const question = state.questions[state.currentIndex];

  if (!question || !state.options.some(function(option) {
    return option.value === state.answers[String(question.id)];
  })) {
    el.validation.textContent = "Kies een antwoord om verder te gaan.";
    return;
  }

  if (state.currentIndex === state.questions.length - 1) {
    finishQuestionnaire();
    return;
  }

  state.currentIndex++;
  saveDraft();
  renderQuestion();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

el.edit.addEventListener("click", function() {
  state.currentIndex = 0;
  showQuestionnaire();
});

window.addEventListener("online", processQueue);

document.addEventListener("visibilitychange", function() {
  if (!document.hidden) {
    processQueue();
  }
});

initialize();
