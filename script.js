
console.log("sSTART");

const API_URL = "https://script.google.com/macros/s/AKfycbxWtFRqegZSQi_NyGSFiV6j8VN6SMow33K3pYvilLVa9_R--euNCDcHZmgGIJXYaqna/exec";

const CACHE_KEY = "echoQuestionnaireDraftV2";
const QUESTIONS_KEY = "echoQuestionnaireQuestionsV2";
const QUEUE_KEY = "echoQuestionnaireQueueV2";
const RETRY_BASE_MS = 5000;

const state = {
  questions: [],
  options: [],
  answers: {},
  respondentName: "",
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
  restart: document.getElementById("restart-button"),
  restartDialog: document.getElementById("restart-dialog"),
  cancelRestart: document.getElementById("cancel-restart-button"),
  confirmRestart: document.getElementById("confirm-restart-button"),
  respondentName: document.getElementById("respondent-name"),
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
    respondentName: state.respondentName,
    answers: state.answers,
    currentIndex: state.currentIndex,
    updatedAt: new Date().toISOString()
  });

  el.saveStatus.textContent = "Op dit toestel bewaard";
  el.saveIndicator.classList.add("saved");
}

function loadDraft() {
  const draft = readJson(CACHE_KEY, null);

  if (!draft) {
    return;
  }

  state.respondentName = String(draft.respondentName || "");
  el.respondentName.value = state.respondentName;

  if (draft.answers && typeof draft.answers === "object") {
    state.answers = draft.answers;
  }

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

  if
